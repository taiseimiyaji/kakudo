import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import postgres from "postgres";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test as base } from "./manual-note-fixture";
import { requireE2eRunner } from "../../lib/e2e-env";

const test = base.extend<{ workspace: string }>({ workspace: async ({ request }, use) => {
  requireE2eRunner(); const db = postgres(process.env.KAKUDO_E2E_DATABASE_URL!, { max: 1, onnotice: () => {} }); const id = randomUUID();
  try { await db`insert into workspaces (id, name) values (${id}, '引用表示の隔離検証')`; expect((await request.get(`/api/workspaces/${id}`)).ok()).toBe(true); await use(id); }
  finally { await db`delete from workspaces where id=${id}`; await db.end(); }
} });
test.use({ locale: "ja-JP", timezoneId: "Asia/Tokyo" });
const sourceUrl = "https://www.rfc-editor.org/rfc/rfc6749";
const sourceTitle = "RFC 6749（Mock資料）";
const matching = "The OAuth 2.0 authorization framework enables a third-party application to obtain limited access to an HTTP service.";
const missing = "OAuth 2.0 automatically proves the real-world identity of every user.";

async function setup(request: APIRequestContext, workspace: string, texts: string[], title: string) {
  const suffix = `?workspaceId=${workspace}`;
  const created = await request.post(`/api/documents${suffix}`, { data: { title, content: "# 引用を比べて自分で考える\n\n同じ資料名でも、引用ごとに内容を確認したい。\n\n" } });
  expect(created.status()).toBe(201); const { document } = await created.json(); const api = `/api/documents/${document.id}`;
  const stored = async () => (await (await request.get(api + suffix)).json());
  for (const text of texts) {
    const current = await stored();
    const response = await request.post(`${api}/quotes${suffix}`, { data: { text, sourceUrl, sourceTitle, content: current.content, title, baseHash: current.contentHash, baseWriteId: current.document.lastWriteId, from: current.content.length, to: current.content.length } });
    expect(response.status()).toBe(201);
  }
  return { document, api, suffix, stored, baseline: await stored() };
}
async function start(page: Page, request: APIRequestContext, api: string, suffix: string) {
  const panel = page.getByRole("region", { name: "レビュー", exact: true });
  const accepted = page.waitForResponse(response => new URL(response.url()).pathname === `${api}/reviews` && response.request().method() === "POST");
  const button = panel.getByRole("button", { name: "出典を確認", exact: true }); await button.focus(); await button.press("Enter");
  const response = await accepted; expect(response.status()).toBe(202); const { run } = await response.json();
  await expect(panel.getByLabel("レビュー履歴")).toHaveValue(run.id);
  await expect(panel.getByLabel("レビューの状態")).toContainText("完了", { timeout: 15000 });
  return (await (await request.get(`/api/reviews/${run.id}${suffix}`)).json());
}
async function openReview(page: Page) {
  const summary = page.locator("details[data-note-panel=review] > summary"); await summary.focus(); await summary.press("Enter");
  await expect(page.getByRole("region", { name: "レビュー", exact: true })).toBeVisible();
}

for (const kind of ["distinct", "duplicate"] as const) for (const width of [1440, 390]) test(`${kind} source findings show pinned original quotes without movement ${width}`, async ({ page, request, workspace }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  const texts = kind === "distinct" ? [matching, missing] : [missing, missing];
  const { document, api, suffix, baseline, stored } = await setup(request, workspace, texts, kind === "distinct" ? "同じ資料から異なる2つの引用" : "同じ引用を2か所に置いたノート");
  let puts = 0; page.on("request", req => { if (new URL(req.url()).pathname === api && req.method() === "PUT") puts++; });
  await page.goto(`/workspaces/${workspace}/documents/${document.id}`); await openReview(page);
  const detail = await start(page, request, api, suffix); expect(detail.run.provider).toBe("mock");
  const panel = page.getByRole("region", { name: "レビュー", exact: true }); const quotes = panel.locator(".review-source-quote blockquote");
  await expect(quotes).toHaveCount(kind === "distinct" ? 1 : 2); expect(await quotes.allTextContents()).toEqual(kind === "distinct" ? [missing] : [missing, missing]);
  expect(detail.run.sourceChecks.filter((c: { status: string }) => c.status === "VERIFIED")).toHaveLength(kind === "distinct" ? 1 : 0);
  for (const check of detail.run.sourceChecks.filter((c: { status: string }) => c.status !== "VERIFIED")) {
    const original = detail.run.quoteSnapshot.find((q: { id: string }) => q.id === check.quoteId);
    expect(detail.findings.find((f: { id: string }) => f.id === check.findingId).sourceQuoteText).toBe(original.text);
  }
  await expect(panel.getByRole("button", { name: "本文で確認", exact: true })).toHaveCount(0);
  const resolve = panel.getByRole("button", { name: "解決済みにする", exact: true }).first(); await resolve.focus(); await page.keyboard.press("Tab");
  await expect(panel.getByRole("button", { name: "見送る", exact: true }).first()).toBeFocused();
  expect(await stored()).toEqual(baseline); expect(puts).toBe(0); expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: info.outputPath(`after-${kind}-${width}-body-and-review.png`), fullPage: true });
  await panel.getByRole("heading", { name: "理解を確かめる", exact: true }).evaluate(e => { e.scrollIntoView({ block: "start" }); window.scrollBy(0, -140); });
  await page.screenshot({ path: info.outputPath(`after-${kind}-${width}-review.png`) });
  await writeFile(info.outputPath(`${kind}-${width}.json`), JSON.stringify({ width, kind, checks: detail.run.sourceChecks, quotes: detail.run.quoteSnapshot, displayed: await quotes.allTextContents(), documentPUTs: puts, documentDetailUnchanged: true, noJumpControls: true, noNewTabStops: true, scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth) }, null, 2));
});

test("stale and past reviews keep their own quotes, while legacy rows remain without invented text", async ({ page, request, workspace }, info) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const { document, api, suffix, baseline, stored } = await setup(request, workspace, [missing, "人間が登録した別の引用。"], "過去の引用を現在の本文と区別する");
  let puts = 0; page.on("request", req => { if (new URL(req.url()).pathname === api && req.method() === "PUT") puts++; });
  await page.goto(`/workspaces/${workspace}/documents/${document.id}`); await openReview(page);
  const old = await start(page, request, api, suffix); const panel = page.getByRole("region", { name: "レビュー", exact: true });
  await page.getByRole("button", { name: "編集", exact: true }).click(); const editor = page.getByRole("textbox", { name: "Markdown本文" }); const identity = await editor.elementHandle();
  await editor.press("ControlOrMeta+End"); await editor.pressSequentially(" 未保存の人間の補足。");
  await expect(panel.getByText(/更新前のレビュー/)).toBeVisible(); expect(await panel.locator(".review-source-quote blockquote").allTextContents()).toEqual(old.findings.map((f: { sourceQuoteText: string }) => f.sourceQuoteText));
  await expect(panel.getByRole("button", { name: "本文で確認", exact: true })).toHaveCount(0); await expect(page.locator(".review-highlight")).toHaveCount(0);
  await editor.press("ControlOrMeta+z"); await expect(panel.getByText(/更新前のレビュー/)).toHaveCount(0);
  expect(await editor.evaluate((e, original) => e === original, identity)).toBe(true); expect(await stored()).toEqual(baseline); expect(puts).toBe(0);
  const currentContent = baseline.content.replace(missing, "現在の本文で人間が書き直した引用。");
  expect((await request.put(api + suffix, { data: { title: document.title, content: currentContent, baseHash: baseline.contentHash, baseWriteId: baseline.document.lastWriteId } })).status()).toBe(200);
  const saved = await stored();
  await page.goto(`/workspaces/${workspace}/documents/${document.id}?reviewId=${old.run.id}`);
  await expect(panel.getByText(/更新前のレビュー/)).toBeVisible(); await expect(panel.locator(".review-source-quote blockquote").filter({ hasText: missing })).toHaveText(missing);
  await expect(page.locator(".markdown-preview")).toContainText("現在の本文で人間が書き直した引用。");
  const next = await start(page, request, api, suffix); expect(next.run.id).not.toBe(old.run.id); expect(next.findings).toHaveLength(1);
  const history = panel.getByLabel("レビュー履歴"); await history.focus(); await history.selectOption(old.run.id); await expect(history).toHaveValue(old.run.id); await expect(history).toBeFocused();
  await expect(panel.locator(".review-source-quote blockquote").filter({ hasText: missing })).toHaveText(missing);
  await expect(panel.getByText(/更新前のレビュー/)).toBeVisible(); await panel.locator(".review-source-quote").first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("after-past-snapshot-390.png") });
  requireE2eRunner(); const db = postgres(process.env.KAKUDO_E2E_DATABASE_URL!, { max: 1, onnotice: () => {} });
  try {
    const legacyChecks = old.run.sourceChecks.map((c: { quoteId: string; status: string; url: string; title: string; accessedAt: string }) => ({ quoteId: c.quoteId, status: c.status, url: c.url, title: c.title, accessedAt: c.accessedAt }));
    await db`update review_runs set source_checks=${db.json(legacyChecks)} where id=${old.run.id} and document_id=${document.id}`;
    const before = await db`select * from review_runs where id=${old.run.id}`;
    await page.reload(); await expect(panel.getByLabel("レビューの状態")).toContainText("完了");
    await expect(panel.locator(".review-source-quote")).toHaveCount(0); await expect(panel.getByRole("article", { name: "出典の指摘", exact: true })).toHaveCount(2);
    expect(await db`select * from review_runs where id=${old.run.id}`).toEqual(before);
  } finally { await db.end(); }
  expect(await stored()).toEqual(saved); expect(puts).toBe(0);
  await writeFile(info.outputPath("history-controls.json"), JSON.stringify({ localDraftStale: true, undoRestoresSnapshotAndEditorIdentity: true, documentPUTsByUI: puts, pastQuoteDifferentFromCurrentBody: true, historySelectOptionAndFocusPreserved: true, legacyNoInventedText: true, legacyRowUnchangedByReads: true, currentDocumentUnchangedByReviewReads: true }, null, 2));
});

test("long source quote remains exact plain text and wraps at 390 without creating focus or jump controls", async ({ page, request, workspace }, info) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const text = "長い引用の原文。\n" + "UnbrokenSourceQuote".repeat(600) + '\n<img src="https://example.com/quote-image" onerror="alert(1)">\n終わりの行。';
  const { document, api, suffix, baseline, stored } = await setup(request, workspace, [text], "長い引用も原文を保つ");
  let imagesFetched = 0; page.on("request", req => { if (req.url() === "https://example.com/quote-image") imagesFetched++; });
  await page.goto(`/workspaces/${workspace}/documents/${document.id}`); await openReview(page); await start(page, request, api, suffix);
  const panel = page.getByRole("region", { name: "レビュー", exact: true }); const quote = panel.locator(".review-source-quote blockquote");
  await expect(quote).toHaveCount(1); expect(await quote.textContent()).toBe(text); expect(text.length).toBeGreaterThan(8000);
  expect(await quote.evaluate(e => ({ width: e.clientWidth, scroll: e.scrollWidth }))).toEqual(expect.objectContaining({ scroll: await quote.evaluate(e => e.clientWidth) }));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await expect(quote.locator("img,script,a,button,input")).toHaveCount(0); expect(imagesFetched).toBe(0);
  await expect(panel.getByRole("button", { name: "本文で確認", exact: true })).toHaveCount(0); expect(await stored()).toEqual(baseline);
  await panel.locator(".review-source-quote").evaluate(e => { e.scrollIntoView({ block: "start" }); window.scrollBy(0, -140); }); await page.screenshot({ path: info.outputPath("after-long-quote-390.png") });
  await writeFile(info.outputPath("long-quote.json"), JSON.stringify({ width: 390, characters: text.length, exactPlainText: true, whitespacePreserved: await quote.evaluate(e => getComputedStyle(e).whiteSpace), noHorizontalOverflow: true, noImagesOrGeneratedLinks: true, noJumpControls: true, documentDetailUnchanged: true }, null, 2));
});
