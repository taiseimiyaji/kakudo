import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDatabase } from "../../db/client";
import { reviewRuns } from "../../db/schema";

for (const reason of ["content", "objectives"] as const) {
  test(`rejected Review explains the ${reason} limit and the learner can recover`, async ({ page, request }, testInfo) => {
    const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: `Admission ${reason}` } })).json();
    const nodes: { id: string; title: string }[] = [];
    if (reason === "objectives") {
      for (const count of [100, 1]) nodes.push((await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: `Goals ${count}`, learningObjectives: Array.from({ length: count }, (_, i) => `自分で定義した目標 ${i}`) } })).json()).node);
    }
    const content = reason === "content" ? "あ".repeat(60001) : "My understanding.";
    const { document } = await (await request.post("/api/documents", { data: { title: `Limit ${reason}`, content, nodeIds: nodes.map((node) => node.id) } })).json();
    try {
      await page.goto(`/workspaces/default/documents/${document.id}`);
      const response = page.waitForResponse((res) => res.url().includes(`/documents/${document.id}/reviews`) && res.request().method() === "POST");
      await page.getByRole("button", { name: "Check Logic", exact: true }).click();
      expect((await response).status()).toBe(400);
      const panel = page.getByRole("region", { name: "Reviews", exact: true });
      await expect(panel.getByRole("alert")).toContainText(reason === "content" ? "60,000文字以内" : "合計100件以内");
      const saved = await (await request.get(`/api/documents/${document.id}`)).json(); expect(saved.content).toBe(content);
      expect((await (await request.get(`/api/documents/${document.id}/reviews`)).json()).reviews).toEqual([]);
      await panel.screenshot({ path: testInfo.outputPath(`review-${reason}-limit.png`) });
      if (reason === "content") {
        const editor = page.getByRole("textbox", { name: "Markdown本文" });
        await editor.click(); await editor.press("ControlOrMeta+A"); await editor.pressSequentially("Short human note.");
        await page.getByRole("button", { name: "保存", exact: true }).click();
        await expect(page.getByText("保存しました", { exact: true })).toBeVisible();
      } else {
        const related = page.getByRole("region", { name: "関連する学習項目と目標" });
        await related.getByText("学習項目の関連を変更", { exact: true }).click();
        await related.getByRole("checkbox", { name: `${roadmap.title} / Goals 100`, exact: true }).uncheck();
        await related.getByRole("button", { name: "関連を保存", exact: true }).click();
        await expect(related.getByRole("status")).toContainText("関連を更新しました");
      }
      await panel.getByRole("button", { name: "Check Logic", exact: true }).click();
      await expect(panel.getByLabel("Review Status")).toContainText("COMPLETED");
      await expect(panel.getByRole("alert")).toHaveCount(0);
    } finally { await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/roadmaps/${roadmap.id}`); }
  });
}

test("external Markdown change explains safe reload and save before Review", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "External change", content: "Original human note." } })).json();
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    await expect(page.getByRole("button", { name: "Check Logic", exact: true })).toBeEnabled();
    // This is the E2E runner's temporary storage, never a user's Markdown directory.
    await writeFile(join(process.env.CONTENT_STORAGE_ROOT!, document.path), "External human edit.");
    await page.getByRole("button", { name: "Check Logic", exact: true }).click();
    await expect(page.locator(".review-panel").getByRole("alert")).toContainText("外部で変更");
    await expect(page.locator(".review-panel").getByRole("alert")).toContainText("退避");
    expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe("External human edit.");
    await page.reload(); await expect(page.getByRole("textbox", { name: "Markdown本文" })).toContainText("External human edit.");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByText("保存しました", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Check Logic", exact: true }).click();
    await expect(page.getByLabel("Review Status")).toContainText("COMPLETED");
  } finally { await request.delete(`/api/documents/${document.id}`); }
});

test("duplicate admission directs the learner to the existing run without creating another", async ({ page, request }) => {
  const { db, client } = createDatabase(process.env.KAKUDO_E2E_DATABASE_URL!);
  const { document } = await (await request.post("/api/documents", { data: { title: "Duplicate", content: "Human note." } })).json();
  const id = randomUUID();
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    await expect(page.getByRole("button", { name: "Check Logic", exact: true })).toBeEnabled();
    // A different tab/process admits a run after this tab loaded its empty history.
    await db.insert(reviewRuns).values({ id, documentId: document.id, revisionId: document.currentRevisionId, type: "LOGIC", provider: "mock" });
    await page.getByRole("button", { name: "Check Logic", exact: true }).click();
    await expect(page.locator(".review-panel").getByRole("alert")).toContainText("同じRevision・種類");
    await expect(page.locator(".review-panel").getByRole("alert")).toContainText("履歴");
    expect((await (await request.get(`/api/documents/${document.id}/reviews`)).json()).reviews).toHaveLength(1);
    await page.reload(); await expect(page.getByLabel("Review Status")).toContainText("QUEUED");
    await expect(page.getByRole("button", { name: "Check Logic", exact: true })).toBeDisabled();
    await db.update(reviewRuns).set({ status: "COMPLETED", stage: "COMPLETED" }).where(eq(reviewRuns.id, id));
    await expect(page.getByLabel("Review Status")).toContainText("COMPLETED");
    expect((await (await request.get(`/api/documents/${document.id}/reviews`)).json()).reviews).toHaveLength(1);
  } finally { await request.delete(`/api/documents/${document.id}`); await client.end(); }
});
