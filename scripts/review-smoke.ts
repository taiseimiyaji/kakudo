import "dotenv/config";
import { createReviewProvider } from "../modules/review/provider";
async function main() {
  const provider = createReviewProvider();
  const claims = await provider.extractClaims("OAuthは認証プロトコルである。");
  if (!claims.length) throw new Error("Smoke claim was not extracted");
  const result = await provider.verifyClaim(claims[0], [{ id: "rfc6749", url: "https://www.rfc-editor.org/rfc/rfc6749", title: "RFC 6749", text: "The OAuth 2.0 authorization framework enables a third-party application to obtain limited access to an HTTP service.", sourceType: "PRIMARY", accessedAt: new Date().toISOString() }]);
  console.log(JSON.stringify({ provider: provider.name, claims: claims.length, verdict: result.verdict, evidenceIds: result.evidenceIds }));
  if (result.verdict !== "CONTRADICTED" || !result.evidenceIds.includes("rfc6749")) throw new Error("Smoke verification did not identify the contradiction");
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
