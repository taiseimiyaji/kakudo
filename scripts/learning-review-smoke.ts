import "dotenv/config";
import { createReviewProvider } from "../modules/review/provider";
import { learningReview } from "../modules/review/learning-review";
async function main() {
  const provider = createReviewProvider();
  const objectives = ["OAuthとAuthenticationの違いを説明できる", "Authorization Code Flowを説明できる", "Access Tokenの役割を説明できる", "PKCEの目的を説明できる"].map((text, i) => ({ id: `oauth:${i}`, text }));
  const result = await learningReview("Cookieを使うのでSession認証は安全である。", objectives, "FULL", provider, async () => {});
  if (!result.findings.some((f) => f.category === "LOGIC") || result.coverage.length !== 4 || result.coverage.some((c) => c.status !== "NOT_COVERED")) throw new Error("Learning review smoke did not detect missing reasoning/objectives");
  console.log(JSON.stringify({ provider: provider.name, logicFindings: result.findings.filter((f) => f.category === "LOGIC").length, coverage: result.coverage.map((c) => c.status) }));
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
