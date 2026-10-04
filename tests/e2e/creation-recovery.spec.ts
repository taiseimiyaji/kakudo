import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

for (const kind of ["map", "note"] as const) {
  for (const responseKind of ["lost", "invalid", "server-error", "server-after-commit"] as const) {
    test(`${kind} creation ${responseKind} is uncertain and requires a read-only check before a new creation`, async ({ page, request }) => {
      const noun = kind === "map" ? "マップ" : "ノート";
      const path = kind === "map" ? "roadmaps" : "documents";
      const title = `確認して再開する${noun} ${responseKind}`;
      const created: string[] = []; let parent = ""; let nodeId = ""; let posts = 0; let readScope = ""; let readFailed = false;
      if (kind === "note") {
        const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: "応答確認の地図" } })).json(); parent = roadmap.id;
        const { node } = await (await request.post("/api/nodes", { data: { roadmapId: parent, title: "応答確認の項目" } })).json(); nodeId = node.id;
      }
      await page.route(`**/api/${path}?*`, async (route) => {
        if (route.request().method() === "GET") {
          readScope = route.request().url();
          if (readFailed) return route.fulfill({ status: 503, json: {} });
          return route.continue();
        }
        if (route.request().method() !== "POST") return route.continue();
        posts++;
        if (posts === 1 && responseKind === "server-error") return route.fulfill({ status: 500, json: { error: "private-stack" } });
        const response = await route.fetch(); const payload = await response.json(); created.push((kind === "map" ? payload.roadmap : payload.document).id);
        if (posts === 1) return responseKind === "lost" ? route.abort() : route.fulfill({ status: responseKind === "server-after-commit" ? 502 : 201, json: { invalid: true } });
        return route.fulfill({ response });
      });
      try {
        await page.goto(parent ? `/workspaces/default/roadmaps/${parent}` : "/workspaces/default/roadmaps");
        if (parent) await page.locator(".learning-card").filter({ hasText: "応答確認の項目" }).click();
        const input = page.getByLabel(`新しい${noun}（必須）`, { exact: true });
        const create = page.getByRole("button", { name: `${noun}を作成`, exact: true });
        await input.fill(title); await create.click();
        const recovery = page.getByRole("region", { name: `${noun}の作成結果の確認`, exact: true });
        await expect(recovery.getByRole("alert").first()).toContainText("作成結果は不明");
        await expect(recovery).not.toContainText("private-stack"); await expect(input).toHaveValue(title); await expect(create).toBeDisabled();
        await input.evaluate((element) => { (element as HTMLInputElement).form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
        expect(posts).toBe(1);
        readFailed = true; await recovery.getByRole("button", { name: `作成済みの${noun}を確認`, exact: true }).click();
        await expect(recovery.getByText(/一覧を取得できませんでした/)).toBeVisible(); await expect(create).toBeDisabled(); expect(posts).toBe(1);
        if (nodeId) expect(new URL(readScope).searchParams.get("nodeId")).toBe(nodeId);
        expect(new URL(readScope).searchParams.get("workspaceId")).toBe("default");
        readFailed = false; await recovery.getByRole("button", { name: `作成済みの${noun}を確認`, exact: true }).click();
        await expect(recovery.getByText(/同じ作成要求の結果とは限りません/)).toBeVisible(); expect(posts).toBe(1);
        const link = recovery.getByRole("link", { name: title, exact: true });
        if (responseKind !== "server-error") {
          await expect(link).toHaveCount(1); page.once("dialog", (dialog) => dialog.accept()); await link.click();
          await expect(page).toHaveURL(new RegExp(`/${path}/${created[0]}$`)); expect(posts).toBe(1);
          const list = await (await request.get(kind === "map" ? "/api/roadmaps" : `/api/documents?nodeId=${nodeId}`)).json();
          expect((kind === "map" ? list.roadmaps : list.documents).filter((item: { title: string }) => item.title === title)).toHaveLength(1);
        } else {
          await expect(link).toHaveCount(0); await expect(recovery.getByText(/先の作成が遅れて完了する可能性/)).toBeVisible();
          const allow = recovery.getByRole("button", { name: "一覧を確認しました。新しく作成", exact: true });
          page.once("dialog", (dialog) => dialog.dismiss()); await allow.click(); await expect(create).toBeDisabled();
          await input.fill("人間が選んだ新しいタイトル"); page.once("dialog", (dialog) => dialog.accept()); await allow.click();
          await expect(create).toBeEnabled(); expect(posts).toBe(1); await create.click();
          await expect.poll(() => created.length).toBe(1); await expect(page).toHaveURL(new RegExp(`/${path}/${created[0]}$`)); expect(posts).toBe(2);
        }
      } finally {
        await page.unrouteAll({ behavior: "wait" });
        for (const id of created) await request.delete(`/api/${path}/${id}`);
        if (parent) await request.delete(`/api/roadmaps/${parent}`);
      }
    });
  }
}

test("late note confirmation GET cannot restore the old recovery after selecting another node and returning", async ({ page, request }) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: "遅い結果確認の地図" } })).json();
  const nodes: { id: string; title: string }[] = [];
  for (const [index, title] of ["元の項目", "次の項目"].entries()) nodes.push((await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title, positionX: index * 320 } })).json()).node);
  let documentId = ""; let posts = 0; let holdRead = false; let held = false; let delivered = false;
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/documents?*", async (route) => {
    if (route.request().method() === "POST") { posts++; const response = await route.fetch(); documentId = (await response.json()).document.id; return route.abort(); }
    if (holdRead && new URL(route.request().url()).searchParams.get("nodeId") === nodes[0].id) { holdRead = false; const response = await route.fetch(); held = true; await gate; await route.fulfill({ response }); delivered = true; return; }
    await route.continue();
  });
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`); await page.locator(".learning-card").filter({ hasText: "元の項目" }).click();
    await page.getByLabel("新しいノート（必須）").fill("先に作成したノート"); await page.getByRole("button", { name: "ノートを作成", exact: true }).click();
    const recovery = page.getByRole("region", { name: "ノートの作成結果の確認" }); await expect(recovery).toBeVisible();
    holdRead = true; await recovery.getByRole("button", { name: "作成済みのノートを確認" }).click(); await expect.poll(() => held).toBe(true);
    page.once("dialog", (dialog) => dialog.dismiss()); await page.locator(".learning-card").filter({ hasText: "次の項目" }).click(); await expect(page.getByLabel("学習項目名（必須）", { exact: true })).toHaveValue("元の項目");
    page.once("dialog", (dialog) => dialog.accept()); await page.locator(".learning-card").filter({ hasText: "次の項目" }).click();
    await page.getByLabel("新しいノート（必須）").fill("後で入力したノート");
    await page.locator(".learning-card").filter({ hasText: "元の項目" }).click(); release(); await expect.poll(() => delivered).toBe(true);
    await expect(page.getByLabel("新しいノート（必須）")).toHaveValue("後で入力したノート"); await expect(recovery).toHaveCount(0); expect(posts).toBe(1);
    await expect(page.locator(".node-documents").getByRole("link", { name: "先に作成したノート" })).toBeVisible();
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); if (documentId) await request.delete(`/api/documents/${documentId}`); await request.delete(`/api/roadmaps/${roadmap.id}`); }
});
