import { randomUUID } from "node:crypto";
import { IncomingMessage } from "node:http";
import { Socket } from "node:net";
import { writeFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { expect, test as base, type APIRequestContext } from "@playwright/test";
import { createDatabase } from "../../db/client";
import { workspaces, quotes, reviewRuns } from "../../db/schema";
import { requireE2eRunner } from "../../lib/e2e-env";
import { LocalFileSystemStorage } from "../../modules/storage/local";
import { reviewService } from "../../modules/review/service";
import { mockProvider } from "../../modules/review/mock-provider";
import { createResourceFetcher } from "../../modules/resource/fetcher";

const test = base.extend<{ workspace: string }>({ workspace: async ({ request }, use) => {
  requireE2eRunner(); const { db, client } = createDatabase(process.env.KAKUDO_E2E_DATABASE_URL!); const id = randomUUID();
  try { await db.insert(workspaces).values({ id, name: "引用抜粋の隔離検証" }); expect((await request.get(`/api/workspaces/${id}`)).ok()).toBe(true); await use(id); }
  finally { await db.delete(workspaces).where(eq(workspaces.id, id)); await client.end(); }
} });
const matching = "The source keeps original human writing as the basis of review.";
const quoted = matching + " This additional sentence is absent from the source.";
const sourceUrl = "https://example.com/owned-literal-evidence";
async function setup(request: APIRequestContext, workspace: string, count = 2) {
  const suffix = `?workspaceId=${workspace}`;
  const response = await request.post(`/api/documents${suffix}`, { data: { title: "資料と引用を自分で比べる", content: "# 人間が書いたノート\n\n資料の該当箇所を読んで、自分の理解を確かめる。\n\n" } });
  expect(response.status()).toBe(201); const { document } = await response.json(); const api = `/api/documents/${document.id}`;
  const stored = async () => (await (await request.get(api + suffix)).json());
  for (let i = 0; i < count; i++) {
    const current = await stored(); const quote = await request.post(`${api}/quotes${suffix}`, { data: { text: quoted, sourceUrl, sourceTitle: "人間が登録した資料名", title: document.title, content: current.content, baseHash: current.contentHash, baseWriteId: current.document.lastWriteId, from: current.content.length, to: current.content.length } });
    expect(quote.status()).toBe(201);
  }
  return { document, api, suffix, stored, baseline: await stored() };
}
async function review(request: APIRequestContext, workspace: string, documentId: string, revisionId: string, text: string) {
  requireE2eRunner(); const { db, client } = createDatabase(process.env.KAKUDO_E2E_DATABASE_URL!); let fetches = 0;
  const fetcher = createResourceFetcher({ resolve: async () => [{ address: "93.184.216.34", family: 4 }], transport: async () => {
    fetches++; const response = new IncomingMessage(new Socket()); response.statusCode = 200; response.headers = { "content-type": "text/plain; charset=utf-8" }; response.push(text); response.push(null); return response;
  } });
  try {
    const service = reviewService({ db, storage: new LocalFileSystemStorage(process.env.CONTENT_STORAGE_ROOT!), provider: mockProvider(), fetcher });
    // Seed only the queued review fixture. Calling start() in this second process
    // would run global write-intent recovery against the API server's live writer.
    // Admission is covered by integration/API tests; execution, persistence and UI
    // here use the real pipeline with controlled retrieval and pinned registrations.
    const quoteSnapshot = await db.select({ id: quotes.id, text: quotes.text, sourceUrl: quotes.sourceUrl, sourceTitle: quotes.sourceTitle }).from(quotes).where(eq(quotes.documentId, documentId));
    const id = randomUUID(); await db.insert(reviewRuns).values({ id, documentId, revisionId, type: "SOURCE", provider: "mock", quoteSnapshot });
    await service.execute(id);
    const response = await request.get(`/api/reviews/${id}?workspaceId=${workspace}`); expect(response.status()).toBe(200);
    const detail = await response.json(); expect(detail.run.status).toBe("COMPLETED"); expect(detail.run.provider).toBe("mock"); expect(fetches).toBe(1);
    return detail;
  } finally { await client.end(); }
}
for (const width of [1440, 390]) for (const kind of ["literal", "normalized-only"]) test(`${kind} long source evidence remains readable and pinned ${width}`, async ({ page, request, workspace }, info) => {
  await page.setViewportSize({ width, height: 1000 }); const { document, api, suffix, stored, baseline } = await setup(request, workspace);
  const raw = kind === "literal" ? matching : matching.replaceAll(" ", "\n  ");
  const source = "Unrelated background. ".repeat(1000) + raw;
  const detail = await review(request, workspace, document.id, baseline.document.currentRevisionId, source);
  expect(detail.run.sourceChecks.map((c: { status: string }) => c.status)).toEqual(["PARTIAL_MATCH", "PARTIAL_MATCH"]);
  for (const finding of detail.findings) {
    expect(finding.evidence[0].excerpt.length).toBeLessThanOrEqual(1000); expect(source).toContain(finding.evidence[0].excerpt);
    expect(finding.sourceQuoteText).toBe(quoted); expect(finding.targetText).toBeNull(); expect(finding.startOffset).toBeNull(); expect(finding.endOffset).toBeNull();
    if (kind === "literal") expect(finding.evidence[0].excerpt).toContain(matching);
    else expect(finding.explanation).toContain("原文の同じ表記は見つかりませんでした");
  }
  let puts = 0; page.on("request", req => { if (new URL(req.url()).pathname === api && req.method() === "PUT") puts++; });
  await page.goto(`/workspaces/${workspace}/documents/${document.id}?reviewId=${detail.run.id}`);
  const panel = page.getByRole("region", { name: "レビュー", exact: true }); await expect(panel.getByLabel("レビューの状態")).toContainText("完了");
  await expect(panel.locator(".review-source-quote blockquote")).toHaveCount(2); expect(await panel.locator(".review-source-quote blockquote").allTextContents()).toEqual([quoted, quoted]);
  await expect(panel.getByRole("button", { name: "本文で確認", exact: true })).toHaveCount(0);
  if (kind === "normalized-only") {
    await panel.getByRole("article", { name: "出典の指摘", exact: true }).first().evaluate(e => { e.scrollIntoView({ block: "start" }); window.scrollBy(0, -120); });
    await page.screenshot({ path: info.outputPath(`fallback-reason-${width}.png`) });
  }
  const disclosure = panel.getByText("取得資料の抜粋", { exact: true }).first(); await disclosure.focus(); await disclosure.press("Enter");
  const evidence = panel.getByRole("blockquote").filter({ hasText: "Unrelated background." }).first();
  await expect(evidence).toBeVisible(); if (kind === "literal") await expect(evidence).toContainText(matching);
  else await expect(panel.getByText(/原文の同じ表記は見つかりませんでした/).first()).toBeVisible();
  await evidence.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath(`${kind}-${width}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width); expect(puts).toBe(0); expect(await stored()).toEqual(baseline);
  // A changed retrieval creates a new run; reads of the original retain its evidence.
  const next = await review(request, workspace, document.id, baseline.document.currentRevisionId, "Different retrieved source.");
  expect(next.run.sourceChecks.every((c: { status: string }) => c.status === "NOT_FOUND")).toBe(true);
  const old = await (await request.get(`/api/reviews/${detail.run.id}${suffix}`)).json(); expect(old).toEqual(detail);
  await page.reload(); await expect(panel.getByLabel("レビュー履歴")).toHaveValue(detail.run.id);
  await writeFile(info.outputPath(`${kind}-${width}.json`), JSON.stringify({ width, kind, sourceLength: source.length, checks: detail.run.sourceChecks, findings: detail.findings, documentUnchanged: true, documentPUTs: puts, oldRunUnchangedAfterSourceChange: true, noJump: true }, null, 2));
});
test("48 real registrations of one long source keep distinct findings without changing the note", async ({ page, request, workspace }, info) => {
  const { document, stored, baseline } = await setup(request, workspace, 48);
  const source = "Ａ" + "Unrelated context. ".repeat(100000) + matching;
  expect(Buffer.byteLength(source)).toBeLessThan(2000000);
  const detail = await review(request, workspace, document.id, baseline.document.currentRevisionId, source);
  expect(detail.findings).toHaveLength(48); expect(new Set(detail.run.sourceChecks.map((c: { quoteId: string }) => c.quoteId)).size).toBe(48);
  expect(detail.findings.every((f: { evidence: { excerpt: string }[] }) => f.evidence[0].excerpt.includes(matching))).toBe(true);
  await page.goto(`/workspaces/${workspace}/documents/${document.id}?reviewId=${detail.run.id}`);
  const panel = page.getByRole("region", { name: "レビュー", exact: true }); await expect(panel.getByLabel("レビューの状態")).toContainText("完了");
  await expect(panel.getByRole("article", { name: "出典の指摘", exact: true })).toHaveCount(48); expect(await stored()).toEqual(baseline);
  await panel.locator(".review-source-quote").first().scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath("many-48.png") });
  await writeFile(info.outputPath("many-48.json"), JSON.stringify({ registrations: 48, sourceBytes: Buffer.byteLength(source), oneFetch: true, distinctFindings: true, unchangedBody: true }, null, 2));
});
