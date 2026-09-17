import type { ResourceFetcher, ResourceDocument } from "../resource/fetcher";
import type { Claim, EvidenceDocument, ClaimVerification, ReviewProvider } from "./contracts";
import type { SourceSnapshot } from "../../shared/review";
export interface SearchProvider { search(query: string): Promise<{ url: string; title: string }[]> }
export function primaryUrl(url: string) { const host = new URL(url).hostname; return ["rfc-editor.org", "ietf.org", "w3.org", "whatwg.org"].some((domain) => host === domain || host.endsWith(`.${domain}`)); }
export function orderedSources(groups: SourceSnapshot[][]): SourceSnapshot[][] {
  const seen = new Set<string>();
  return groups.map((group) => [...group].sort((a, b) => Number(["RFC", "OFFICIAL_DOC", "PAPER"].includes(b.type)) - Number(["RFC", "OFFICIAL_DOC", "PAPER"].includes(a.type))).filter((item) => { if (seen.has(item.url)) return false; seen.add(item.url); return true; }));
}
// Plain lexical window selection; no vector store or generated evidence.
export function evidenceWindow(text: string, claim: string): string {
  if (text.length <= 10000) return text;
  const terms = [...new Set(claim.toLowerCase().match(/[a-z0-9]{3,}|[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{2,8}/gu) ?? [])];
  const windows = Array.from({ length: Math.ceil(text.length / 4000) }, (_, i) => ({ start: i * 4000, text: text.slice(Math.max(0, i * 4000 - 500), i * 4000 + 4500) }));
  const ranked = windows.map((w) => ({ ...w, score: terms.reduce((sum, term) => sum + (w.text.toLowerCase().split(term).length - 1), 0) })).sort((a, b) => b.score - a.score || a.start - b.start);
  return ranked.slice(0, 2).sort((a, b) => a.start - b.start).map((w) => w.text).join("\n[… excerpt gap …]\n");
}
export function evidenceRetriever(fetcher: ResourceFetcher, search: SearchProvider, notices: string[]) {
  const cache = new Map<string, Promise<ResourceDocument | null>>();
  function fetch(url: string) {
    if (!cache.has(url)) cache.set(url, fetcher.fetch(url).catch(() => { notices.push(`UNAVAILABLE: ${url}`); return null; }));
    return cache.get(url)!;
  }
  return { fetch, async verify(claim: Claim, groups: SourceSnapshot[][], provider: ReviewProvider): Promise<{ verification: ClaimVerification; evidence: EvidenceDocument[] }> {
    const evidence: EvidenceDocument[] = []; let verification: ClaimVerification = { verdict: "INSUFFICIENT_EVIDENCE", explanation: "この主張を確認する根拠が不足しています。", guidingQuestion: "どの資料のどの箇所が、この主張を支えていますか？", evidenceIds: [] };
    const visited = new Set<string>();
    const tiers = orderedSources(groups);
    for (let tier = 0; tier < 4; tier++) {
      const previousCount = evidence.length;
      let sources = tiers[tier] ?? [];
      if (tier === 3) { try { sources = (await search.search(claim.text)).slice(0, 3).map((s, i) => ({ ...s, id: `search-${i}`, type: "WEB" })); } catch { notices.push("Web Search: UNAVAILABLE"); } }
      if (sources.length > 12) notices.push("資料探索は各範囲の先頭12件までです。");
      for (const source of sources.slice(0, 12)) {
        if (visited.has(source.url)) continue; visited.add(source.url);
        const doc = await fetch(source.url); if (!doc) continue;
        evidence.push({ id: `evidence-${evidence.length}`, url: doc.url, title: source.title || doc.title || source.url, text: evidenceWindow(doc.text, claim.text), sourceType: tier < 3 ? "USER_RESOURCE" : primaryUrl(doc.url) ? "PRIMARY" : "SECONDARY", accessedAt: doc.accessedAt });
      }
      if (evidence.length > previousCount) {
        // Bound the model input while preserving the traversal order.
        verification = await provider.verifyClaim(claim, evidence.slice(-12));
        if (verification.verdict !== "INSUFFICIENT_EVIDENCE") break;
      }
    }
    return { verification, evidence: evidence.filter((e) => verification.evidenceIds.includes(e.id)) };
  } };
}
