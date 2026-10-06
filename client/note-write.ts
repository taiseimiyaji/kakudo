import { z } from "zod";
import { request, UnknownMutationOutcome } from "./api";
import { documentSave, documentSchema, DOCUMENT_WRITE_OUTCOME_UNKNOWN } from "../shared/document";
import { quoteInput, quoteMarkdown } from "../shared/quote";
import { UnknownNoteWriteOutcome } from "../modules/editor/note-session";

export const NOTE_WRITE_TIMEOUT_MS = 20_000;
/** Owned by one mounted document; effect replay starts a fresh cancellation scope. */
export class NoteWriter {
  private controller = new AbortController();
  constructor(private workspaceId: string, private id: string) {}
  activate() { if (this.controller.signal.aborted) this.controller = new AbortController(); }
  close() { this.controller.abort(); }
  save(draft: unknown) { return saveNote(this.workspaceId, this.id, draft, this.controller.signal); }
  quote(draft: unknown) { return quoteNote(this.workspaceId, this.id, draft, this.controller.signal); }
}
const resultSchema = z.object({ document: documentSchema, contentHash: z.string().regex(/^[a-f0-9]{64}$/) });
const uncertainWriteErrors = [{ status: 409, code: DOCUMENT_WRITE_OUTCOME_UNKNOWN }];
async function hashText(content: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function write<T>(load: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) throw new UnknownNoteWriteOutcome();
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel!: () => void;
  const canceled = new Promise<never>((_, reject) => { cancel = () => { reject(new UnknownNoteWriteOutcome()); controller.abort(); }; });
  signal?.addEventListener("abort", cancel, { once: true });
  try {
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new UnknownNoteWriteOutcome()); controller.abort(); }, NOTE_WRITE_TIMEOUT_MS); });
    return await Promise.race([load(controller.signal), deadline, canceled]);
  } catch (error) {
    if (error instanceof UnknownMutationOutcome) throw new UnknownNoteWriteOutcome();
    throw error;
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", cancel); }
}
function matches(document: z.infer<typeof documentSchema>, workspaceId: string, id: string, title: string, baseWriteId: string | null) {
  return document.id === id && document.workspaceId === workspaceId && document.title === title && !!document.currentRevisionId && !!document.lastWriteId && document.lastWriteId !== baseWriteId;
}
export async function saveNote(workspaceId: string, id: string, draft: unknown, signal?: AbortSignal) {
  const input = documentSave.safeParse(draft);
  if (!input.success) throw new Error("入力内容を確認して再試行してください。");
  return write(async (signal) => {
    const payload = await request(`/documents/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(workspaceId)}`, "PUT", input.data, { uncertainMutation: true, uncertainServerError: true, uncertainErrors: uncertainWriteErrors, signal });
    const result = resultSchema.safeParse(payload);
    if (!result.success || !matches(result.data.document, workspaceId, id, input.data.title, input.data.baseWriteId) || result.data.contentHash !== await hashText(input.data.content)) throw new UnknownNoteWriteOutcome();
    return result.data;
  }, signal);
}
export async function quoteNote(workspaceId: string, id: string, draft: unknown, signal?: AbortSignal) {
  const input = quoteInput.safeParse(draft);
  if (!input.success) throw new Error("入力内容を確認して再試行してください。");
  return write(async (signal) => {
    const payload = await request(`/documents/${encodeURIComponent(id)}/quotes?workspaceId=${encodeURIComponent(workspaceId)}`, "POST", input.data, { uncertainMutation: true, uncertainServerError: true, uncertainErrors: uncertainWriteErrors, signal });
    const result = resultSchema.extend({ quoteId: z.string().min(1), content: z.string() }).safeParse(payload);
    const { content, text, sourceUrl, sourceTitle, from, to } = input.data;
    const expected = content.slice(0, from) + quoteMarkdown(text, sourceUrl, sourceTitle, content.includes("\r\n") ? "\r\n" : "\n") + content.slice(to);
    if (!result.success || !matches(result.data.document, workspaceId, id, input.data.title, input.data.baseWriteId) || result.data.content !== expected || result.data.contentHash !== await hashText(expected)) throw new UnknownNoteWriteOutcome();
    return result.data;
  }, signal);
}
