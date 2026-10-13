import type { z } from "zod";
import { resourceInput, resourceSchema, type Resource, type ResourceTarget } from "../../shared/resource";
import { sourceUrlSchema } from "../../shared/quote";

// Presence is evidence of the requested stored state, not proof that an absent
// request failed or that a particular lost POST succeeded. Count URL candidates
// before discarding malformed or foreign rows, so ambiguity stays uncertain.
export function confirmedResource(items: unknown, workspaceId: string, input: z.infer<typeof resourceInput>): Resource | null {
  if (!Array.isArray(items)) return null;
  const matches = items.filter((item) => item && typeof item === "object" && sourceUrlSchema.safeParse((item as { url?: unknown }).url).data === input.url);
  if (matches.length !== 1) return null;
  const result = resourceSchema.safeParse(matches[0]);
  if (!result.success) return null;
  const item = result.data;
  if (item.workspaceId !== workspaceId || item.url !== input.url) return null;
  try { encodeURIComponent(item.id); } catch { return null; }
  return item;
}

const typeNames: Record<Resource["type"], string> = {
  WEB: "Webページ", OFFICIAL_DOC: "公式ドキュメント", RFC: "RFC（技術仕様）", PAPER: "論文", OTHER: "その他",
};

export function resourceConfirmationMessage(resource: Resource, input: z.infer<typeof resourceInput>, scope: ResourceTarget["kind"] | "workspace"): string {
  const place = scope === "document" ? "このノートに関連付いている" : scope === "node" ? "この学習項目に関連付いている" : "このワークスペースに登録されている";
  const confirmed = `${place}資料を確認しました。直前の登録要求が成功したかは、この確認だけでは確定できません。`;
  if (resource.title === input.title && resource.type === input.type) return confirmed;
  const title = (value: string) => value || "（名称なし）";
  return `${confirmed} 保存済みの資料名は「${title(resource.title)}」、種類は「${typeNames[resource.type]}」です。入力した資料名「${title(input.title)}」、種類「${typeNames[input.type]}」は反映されていません。`;
}
