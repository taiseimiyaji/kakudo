import { reviewSpans } from "./claims";
import { coverageSchema, findingInput, verificationSchema, type Claim, type ReviewProvider } from "./contracts";
export function mockProvider(): ReviewProvider {
  return {
    name: "mock",
    async extractClaims(markdown) {
      const claims: Claim[] = [];
      for (const span of reviewSpans(markdown)) for (const match of span.text.matchAll(/[^。！？.!?\n]+[。！？.!?]?/g)) {
        const text = match[0].trim(); if (!text || text.startsWith("#")) continue;
        const startOffset = span.startOffset + match.index! + match[0].indexOf(text);
        claims.push({ id: `claim-${claims.length}`, text, startOffset, endOffset: startOffset + text.length, type: /最新|現在|today|latest/i.test(text) ? "TIME_SENSITIVE" : /と思う|好き|I think|prefer/i.test(text) ? "OPINION" : /かもしれない|perhaps/i.test(text) ? "UNVERIFIABLE" : "FACTUAL" });
      }
      return claims;
    },
    async verifyClaim(claim, evidence) {
      const relevant = evidence.filter((e) => /OAuth/i.test(e.text) && /authorization framework/i.test(e.text));
      const contradicted = /OAuth.*(?:認証プロトコル|authentication protocol)/i.test(claim.text) && relevant.length > 0;
      return verificationSchema.parse({ verdict: contradicted ? "CONTRADICTED" : claim.type === "TIME_SENSITIVE" ? "TIME_SENSITIVE" : "INSUFFICIENT_EVIDENCE", explanation: contradicted ? "[Mock] 登録された資料の定義と、この記述の用語が一致しない可能性があります。" : "[Mock] この主張を支持する十分な根拠を確認できません。", guidingQuestion: "この主張を支える資料の箇所を示せますか？", evidenceIds: contradicted ? [relevant[0].id] : [] });
    },
    async reviewLogic(markdown) {
      const span = reviewSpans(markdown).find((s) => /Cookie.*(?:ので|だから|therefore).*安全/i.test(s.text));
      return span ? [findingInput.parse({ category: "LOGIC", severity: "WARNING", targetText: span.text, startOffset: span.startOffset, endOffset: span.endOffset, explanation: "[Mock] Cookieの利用と安全性を結ぶ根拠が、この説明では確認できません。", guidingQuestion: "安全性が成り立つ条件と、その根拠を説明できますか？" })] : [];
    },
    async reviewCoverage(markdown, objectives) {
      const text = reviewSpans(markdown).map((s) => s.text).join("\n").toLowerCase();
      return objectives.map((objective) => {
        const terms = objective.text.match(/[a-zA-Z][a-zA-Z0-9-]+/g) ?? [];
        const mentioned = terms.length > 0 && terms.every((term) => text.includes(term.toLowerCase()));
        return coverageSchema.parse({ objectiveId: objective.id, status: mentioned ? "PARTIALLY_COVERED" : "NOT_COVERED", explanation: mentioned ? "[Mock] 関連語はありますが、説明の充足は未検証です。" : "[Mock] この目標に対応する記述を確認できません。", guidingQuestion: "この目標を、自分の言葉と根拠で説明できますか？" });
      });
    },
  };
}
