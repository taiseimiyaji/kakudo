import "dotenv/config";
import { closeDatabase } from "../db/client";
import { documentService } from "../modules/document/service";
import { resourceService } from "../modules/resource/service";
import { reviewService } from "../modules/review/service";
async function main() {
  const docs = documentService(); const content = "OAuthは認証プロトコルである。";
  const doc = await docs.create("default", { title: "[verification] Review pipeline", content, nodeIds: [] });
  try {
    await resourceService().create("default", { url: "https://www.rfc-editor.org/rfc/rfc6749", title: "RFC 6749", type: "RFC" }, { kind: "document", id: doc.id });
    const service = reviewService(); const job = await service.start(doc.id, "default", { revisionId: doc.currentRevisionId!, type: "FACT_CHECK" }, false); await service.execute(job.id);
    const result = await service.get(job.id, "default");
    console.log(JSON.stringify({ provider: result.run.provider, status: result.run.status, verdicts: result.findings.map((f) => f.verdict), sources: result.findings.flatMap((f) => f.evidence.map((e) => e.url)), unchanged: (await docs.get(doc.id, "default")).content === content }));
    if (result.run.status !== "COMPLETED" || !result.findings.some((f) => f.verdict === "CONTRADICTED" && f.evidence.length)) throw new Error("Pipeline smoke did not return the expected finding");
  } finally { await docs.remove(doc.id, "default"); await closeDatabase(); }
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
