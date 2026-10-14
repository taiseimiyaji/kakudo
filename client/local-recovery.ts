/** Browser-only recovery copies. Server writes continue through NoteSession. */
export const LOCAL_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const LOCAL_DRAFT_MAX_BYTES = 2 * 1024 * 1024;
export const LOCAL_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
const DATABASE = "kakudo-local-recovery";
const VERSION = 2;

export type LocalCandidate = {
  version: 1;
  key: string;
  documentKey: string;
  sessionId: string;
  generation: number;
  title: string;
  content: string;
  baseHash: string;
  baseWriteId: string | null;
  outcomeUnknown: boolean;
  updatedAt: number;
};
type Setting = { documentKey: string; enabled: boolean; epoch: number };
type Ack = { key: string; generation: number };
export type LocalLoad = { enabled: boolean; epoch: number; candidates: LocalCandidate[]; warning: boolean };
export class LocalRecoveryError extends Error {
  constructor(public kind: "unavailable" | "limit" | "quota") { super(kind); }
}
export function localDocumentKey(workspaceId: string, documentId: string) { return `${workspaceId}:${documentId}`; }
export function localCandidateKey(documentKey: string, sessionId: string) { return `${documentKey}:${sessionId}`; }
export function localDraftBytes(title: string, content: string) { return new TextEncoder().encode(title).length + new TextEncoder().encode(content).length; }
function validSetting(value: unknown): value is Setting {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.documentKey === "string" && typeof item.enabled === "boolean" && Number.isSafeInteger(item.epoch) && (item.epoch as number) >= 0;
}
export function validCandidate(value: unknown): value is LocalCandidate {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.version === 1 && typeof item.key === "string" && typeof item.documentKey === "string" && typeof item.sessionId === "string" &&
    item.key === localCandidateKey(item.documentKey, item.sessionId) && Number.isSafeInteger(item.generation) && (item.generation as number) > 0 &&
    typeof item.title === "string" && typeof item.content === "string" && typeof item.baseHash === "string" &&
    (typeof item.baseWriteId === "string" || item.baseWriteId === null) && typeof item.outcomeUnknown === "boolean" &&
    Number.isFinite(item.updatedAt) && (item.updatedAt as number) >= 0 && (item.updatedAt as number) <= 8.64e15 &&
    (item.title as string).length <= LOCAL_DRAFT_MAX_BYTES && (item.content as string).length <= LOCAL_DRAFT_MAX_BYTES &&
    localDraftBytes(item.title as string, item.content as string) <= LOCAL_DRAFT_MAX_BYTES;
}
function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new LocalRecoveryError("unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("drafts")) {
        const drafts = db.createObjectStore("drafts", { keyPath: "key" });
        drafts.createIndex("documentKey", "documentKey");
        drafts.createIndex("updatedAt", "updatedAt");
      } else {
        const drafts = request.transaction!.objectStore("drafts");
        if (!drafts.indexNames.contains("updatedAt")) drafts.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "documentKey" });
      if (!db.objectStoreNames.contains("acknowledged")) db.createObjectStore("acknowledged", { keyPath: "key" });
    };
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    request.onerror = () => reject(new LocalRecoveryError("unavailable"));
    request.onblocked = () => { blocked = true; reject(new LocalRecoveryError("unavailable")); };
  });
}
function transaction<T>(db: IDBDatabase, names: string[], mode: IDBTransactionMode, start: (tx: IDBTransaction, set: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let result!: T;
    let thrown: unknown;
    const tx = db.transaction(names, mode);
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = () => { const cause = tx.error ?? thrown; db.close(); reject(cause instanceof DOMException && cause.name === "QuotaExceededError" ? new LocalRecoveryError("quota") : new LocalRecoveryError("unavailable")); };
    tx.onerror = () => { /* onabort supplies the failure */ };
    try { start(tx, (value) => { result = value; }); } catch (error) { thrown = error; tx.abort(); }
  });
}
async function withDatabase<T>(names: string[], mode: IDBTransactionMode, start: (tx: IDBTransaction, set: (value: T) => void) => void) {
  const db = await openDatabase();
  try { return await transaction(db, names, mode, start); } catch (error) { db.close(); throw error; }
}
export async function loadLocalRecovery(documentKey: string, now = Date.now()): Promise<LocalLoad> {
  return withDatabase(["settings", "drafts"], "readwrite", (tx, set) => {
    let setting: unknown;
    let drafts: unknown[] = [];
    const settingsRequest = tx.objectStore("settings").get(documentKey);
    settingsRequest.onsuccess = () => { setting = settingsRequest.result; };
    const draftStore = tx.objectStore("drafts");
    const expired = draftStore.index("updatedAt").openCursor(IDBKeyRange.upperBound(now - LOCAL_DRAFT_TTL_MS));
    expired.onsuccess = () => {
      const cursor = expired.result;
      if (cursor) {
        if (validCandidate(cursor.value) && now - cursor.value.updatedAt >= LOCAL_DRAFT_TTL_MS) cursor.delete();
        cursor.continue();
        return;
      }
      const draftsRequest = draftStore.index("documentKey").getAll(documentKey);
      draftsRequest.onsuccess = () => {
        drafts = draftsRequest.result as unknown[];
        const candidates: LocalCandidate[] = [];
        let warning = setting !== undefined && !validSetting(setting);
        for (const raw of drafts) {
          if (!validCandidate(raw) || raw.documentKey !== documentKey) { warning = true; continue; }
          candidates.push(raw);
        }
        candidates.sort((a, b) => b.updatedAt - a.updatedAt || b.generation - a.generation);
        set({ enabled: validSetting(setting) && setting.enabled, epoch: validSetting(setting) ? setting.epoch : 0, candidates, warning });
      };
    };
  });
}
export async function enableLocalRecovery(documentKey: string): Promise<number> {
  return withDatabase(["settings"], "readwrite", (tx, set) => {
    const store = tx.objectStore("settings");
    const request = store.get(documentKey);
    request.onsuccess = () => {
      const epoch = validSetting(request.result) ? request.result.epoch + 1 : 1;
      store.put({ documentKey, enabled: true, epoch } satisfies Setting);
      set(epoch);
    };
  });
}
export async function disableLocalRecovery(documentKey: string): Promise<void> {
  return withDatabase(["settings", "drafts"], "readwrite", (tx, set) => {
    const settings = tx.objectStore("settings");
    const request = settings.get(documentKey);
    request.onsuccess = () => {
      settings.put({ documentKey, enabled: false, epoch: validSetting(request.result) ? request.result.epoch + 1 : 1 } satisfies Setting);
      const cursor = tx.objectStore("drafts").index("documentKey").openKeyCursor(IDBKeyRange.only(documentKey));
      cursor.onsuccess = () => { if (cursor.result) { tx.objectStore("drafts").delete(cursor.result.primaryKey); cursor.result.continue(); } };
      set(undefined);
    };
  });
}
export async function putLocalCandidate(candidate: LocalCandidate, epoch: number): Promise<"stored" | "stale" | "disabled" | "corrupt"> {
  const bytes = localDraftBytes(candidate.title, candidate.content);
  if (bytes > LOCAL_DRAFT_MAX_BYTES) throw new LocalRecoveryError("limit");
  return withDatabase<"stored" | "stale" | "disabled" | "limit" | "corrupt" | "quota" | "unavailable">(["settings", "drafts", "acknowledged"], "readwrite", (tx, set) => {
    const settingRequest = tx.objectStore("settings").get(candidate.documentKey);
    settingRequest.onsuccess = () => {
      const setting: unknown = settingRequest.result;
      if (setting !== undefined && !validSetting(setting)) { set("corrupt"); return; }
      if (!validSetting(setting) || !setting.enabled || setting.epoch !== epoch) { set("disabled"); return; }
      const ackRequest = tx.objectStore("acknowledged").get(candidate.key);
      ackRequest.onsuccess = () => {
        const ack = ackRequest.result as Ack | undefined;
        if (ack && Number.isSafeInteger(ack.generation) && ack.generation >= candidate.generation) { set("stale"); return; }
        const store = tx.objectStore("drafts");
        const allRequest = store.index("documentKey").getAll(candidate.documentKey);
        allRequest.onsuccess = () => {
          const records = allRequest.result as unknown[];
          const current = records.find((value) => value && typeof value === "object" && (value as Record<string, unknown>).key === candidate.key);
          if (validCandidate(current) && current.generation >= candidate.generation) { set("stale"); return; }
          if (records.some((value) => !validCandidate(value))) { set("corrupt"); return; }
          const total = records.reduce<number>((size, value) => size + (value === current ? 0 : localDraftBytes((value as LocalCandidate).title, (value as LocalCandidate).content)), bytes);
          if (total > LOCAL_DOCUMENT_MAX_BYTES) { set("limit"); return; }
          try { store.put(candidate); }
          catch (error) { set(error instanceof DOMException && error.name === "QuotaExceededError" ? "quota" : "unavailable"); return; }
          set("stored");
        };
      };
    };
  }).then((result) => { if (result === "limit" || result === "quota" || result === "unavailable") throw new LocalRecoveryError(result); return result; });
}
async function acknowledge(documentKey: string, sessionId: string, generation: number) {
  const key = localCandidateKey(documentKey, sessionId);
  return withDatabase(["acknowledged", "drafts"], "readwrite", (tx, set) => {
    const acknowledgments = tx.objectStore("acknowledged");
    const request = acknowledgments.get(key);
    request.onsuccess = () => {
      const old = request.result as Ack | undefined;
      acknowledgments.put({ key, generation: Math.max(generation, Number.isSafeInteger(old?.generation) ? old!.generation : 0) } satisfies Ack);
      const drafts = tx.objectStore("drafts");
      const candidateRequest = drafts.get(key);
      candidateRequest.onsuccess = () => {
        const candidate: unknown = candidateRequest.result;
        if (validCandidate(candidate) && candidate.generation <= generation && candidate.documentKey === documentKey) drafts.delete(key);
        set(undefined);
      };
    };
  });
}
export function acknowledgeLocalSave(documentKey: string, sessionId: string, generation: number) { return acknowledge(documentKey, sessionId, generation); }
export function discardLocalCandidate(candidate: LocalCandidate) { return acknowledge(candidate.documentKey, candidate.sessionId, candidate.generation); }
