import { expect, test } from "@playwright/test";

test("node documents hide the previous scope while loading, recover errors and ignore late responses", async ({ page, request }, testInfo) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: `Scoped documents ${Date.now()}` } })).json();
  const node = async (title: string, positionX: number) => (await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title, positionX, positionY: 0 } })).json()).node;
  const a = await node("Node A", 0); const b = await node("Node B", 300); const empty = await node("Empty", 600);
  const note = async (title: string, nodeId: string) => (await (await request.post("/api/documents", { data: { title, nodeIds: [nodeId] } })).json()).document;
  const docA = await note("Only A's note", a.id); const docB = await note("Only B's note", b.id);
  let release: (() => void) | undefined;
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}?nodeId=${a.id}`);
    const panel = page.locator(".node-documents");
    await expect(panel.getByRole("link", { name: docA.title })).toBeVisible();
    await panel.getByLabel("新しいノート（必須）").fill("作成前のタイトル");
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let arrived = false;
    await page.route("**/api/documents?*", async (route) => {
      if (new URL(route.request().url()).searchParams.get("nodeId") !== b.id) return route.continue();
      arrived = true; await gate;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Test failure" }) });
    });
    await page.locator(`.react-flow__node[data-id="${b.id}"]`).click();
    await expect(page.getByLabel("学習項目名（必須）", { exact: true })).toHaveValue(b.title);
    await expect.poll(() => arrived).toBe(true);
    await expect(panel.getByRole("link", { name: docA.title })).toHaveCount(0);
    await expect(panel.getByRole("status")).toContainText("読み込んでいます");
    await expect(panel.getByLabel("新しいノート（必須）")).toHaveValue("作成前のタイトル");
    release!();
    await expect(panel.getByRole("alert")).toBeVisible();
    await expect(panel.getByRole("link")).toHaveCount(0);
    await page.locator(`.react-flow__node[data-id="${a.id}"]`).click();
    await expect(panel.getByRole("link", { name: docA.title })).toBeVisible();
    await expect(panel.getByRole("alert")).toHaveCount(0);
    await page.locator(`.react-flow__node[data-id="${b.id}"]`).click();
    await expect(panel.getByRole("alert")).toBeVisible();
    await page.unroute("**/api/documents?*");
    await panel.getByRole("button", { name: "ノート一覧を再読み込み" }).click();
    await expect(panel.getByRole("link", { name: docB.title })).toBeVisible();
    await expect(panel.getByRole("alert")).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("node-documents-recovered.png"), fullPage: true });

    // A response that finishes after switching back to A must never restore B's list.
    const late = new Promise<void>((resolve) => { release = resolve; });
    let pending = false;
    await page.locator(`.react-flow__node[data-id="${a.id}"]`).click();
    await expect(panel.getByRole("link", { name: docA.title })).toBeVisible();
    await page.locator(`.react-flow__node[data-id="${empty.id}"]`).click();
    await expect(panel).toContainText("この学習項目に関連するノートはありません。");
    await expect(panel.getByRole("link")).toHaveCount(0);
    await expect(panel.getByRole("status")).toHaveCount(0);
    await page.route("**/api/documents?*", async (route) => {
      if (new URL(route.request().url()).searchParams.get("nodeId") !== b.id) return route.continue();
      pending = true; const response = await route.fetch(); await late; await route.fulfill({ response });
    });
    await page.locator(`.react-flow__node[data-id="${b.id}"]`).click();
    await expect.poll(() => pending).toBe(true);
    await page.locator(`.react-flow__node[data-id="${a.id}"]`).click();
    await expect(panel.getByRole("link", { name: docA.title })).toBeVisible();
    const delivered = page.waitForResponse((response) => new URL(response.url()).searchParams.get("nodeId") === b.id);
    release!(); await delivered;
    await expect(panel.getByRole("link", { name: docB.title })).toHaveCount(0);
    await expect(panel.getByRole("link", { name: docA.title })).toBeVisible();
  } finally {
    release?.(); await page.unrouteAll({ behavior: "wait" });
    await request.delete(`/api/documents/${docA.id}`); await request.delete(`/api/documents/${docB.id}`);
    await request.delete(`/api/roadmaps/${roadmap.id}`);
  }
});
