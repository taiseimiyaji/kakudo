import { expect, test } from "@playwright/test";

for (const placement of ["dialog", "inline"] as const) {
  for (const lostResponse of ["abort", "invalid JSON"] as const) {
    test(`${placement} confirms a committed resource after ${lostResponse} without another POST`, async ({ page, context, request }, testInfo) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      const { document } = await (await request.post("/api/documents", { data: { title: "Resource confirmation", content: "Human saved prose." } })).json();
      const url = `https://example.com/confirm-${placement}-${lostResponse.replaceAll(" ", "-")}`; let posts = 0;
      await page.route(`**/api/documents/${document.id}/resources?*`, async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        posts++; expect((await route.fetch()).status()).toBe(201);
        if (lostResponse === "abort") await route.abort(); else await route.fulfill({ status: 201, contentType: "application/json", body: "secret-invalid-json" });
      });
      try {
        await page.goto(`/workspaces/default/documents/${document.id}`);
        const editor = page.getByRole("textbox", { name: "Markdown本文" }); await editor.click(); await editor.press("ControlOrMeta+End"); await editor.pressSequentially(" Keep my draft.");
        const panel = page.getByRole("region", { name: "Sources", exact: true });
        if (placement === "dialog") { await page.evaluate((text) => navigator.clipboard.writeText(text), url); await editor.press("ControlOrMeta+V"); }
        const form = placement === "dialog" ? page.getByRole("dialog") : panel;
        if (placement === "inline") await form.getByLabel("Resource URL（必須）").fill(url);
        await form.getByLabel("Resource Title（任意）").fill("Confirmed human title"); await form.getByRole("combobox", { name: "Resource Type", exact: true }).selectOption("RFC");
        await form.getByRole("button", { name: "資料を登録", exact: true }).click();
        await expect(form.getByRole("alert")).toContainText("結果は不明"); await expect(form.getByRole("alert")).not.toContainText("secret");
        await expect(form.getByLabel("Resource URL（必須）")).toHaveValue(url); await expect(form.getByLabel("Resource Title（任意）")).toHaveValue("Confirmed human title"); await expect(form.getByRole("combobox", { name: "Resource Type", exact: true })).toHaveValue("RFC");
        await expect(form.getByRole("button", { name: "資料を登録", exact: true })).toBeDisabled(); expect(posts).toBe(1);
        await form.getByRole("button", { name: "登録結果を確認", exact: true }).click();
        await expect(panel.getByRole("link", { name: "Confirmed human title", exact: true })).toBeVisible();
        if (placement === "dialog") { await expect(page.getByRole("dialog")).toHaveCount(0); await expect(editor).toBeFocused(); }
        else await expect(form.getByRole("status")).toContainText("登録済みの資料を確認しました");
        await expect(editor).toContainText("Keep my draft."); expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe("Human saved prose.");
        const linked = (await (await request.get(`/api/documents/${document.id}/resources`)).json()).resources.filter((item: { url: string }) => item.url === url); expect(linked).toHaveLength(1); expect(posts).toBe(1);
        if (placement === "dialog" && lostResponse === "abort") await page.screenshot({ path: testInfo.outputPath("confirmed-resource.png"), fullPage: true });
      } finally { await page.unrouteAll({ behavior: "wait" }); await request.delete(`/api/documents/${document.id}`); }
    });
  }
}

test("failed GET and absent match keep the result uncertain and inputs intact without a retry POST", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { document } = await (await request.post("/api/documents", { data: { title: "Unconfirmed result", content: "Human prose." } })).json();
  let posts = 0; let checking = false; let checks = 0;
  await page.route(`**/api/documents/${document.id}/resources?*`, async (route) => {
    if (route.request().method() === "POST") { posts++; return route.abort(); }
    if (!checking) return route.continue();
    checks++; if (checks === 1) return route.fulfill({ status: 503, json: { error: "secret-stack" } });
    return route.continue();
  });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const editor = page.getByRole("textbox", { name: "Markdown本文" }); await editor.click();
    await page.evaluate(() => navigator.clipboard.writeText("https://example.com/absent-result")); await editor.press("ControlOrMeta+V");
    const modal = page.getByRole("dialog"); await modal.getByLabel("Resource Title（任意）").fill("Retained title"); await modal.getByRole("button", { name: "資料を登録", exact: true }).click();
    await expect(modal.getByRole("alert")).toContainText("結果は不明"); checking = true;
    await modal.getByRole("button", { name: "登録結果を確認", exact: true }).click(); await expect(modal.getByRole("alert")).toContainText("登録結果を確認できませんでした"); await expect(modal.getByRole("alert")).not.toContainText("secret");
    await modal.getByRole("button", { name: "登録結果を確認", exact: true }).click(); await expect(modal.getByRole("alert")).toContainText("結果はまだ不明");
    await expect(modal.getByLabel("Resource URL（必須）")).toHaveValue("https://example.com/absent-result"); await expect(modal.getByLabel("Resource Title（任意）")).toHaveValue("Retained title");
    await expect(modal.getByRole("button", { name: "資料を登録", exact: true })).toBeDisabled(); expect(posts).toBe(1); expect(checks).toBe(2);
    await page.keyboard.press("Enter"); expect(posts).toBe(1);
    await page.keyboard.press("Escape"); await expect(modal).toHaveCount(0); await expect(editor).toBeFocused();
  } finally { await page.unrouteAll({ behavior: "wait" }); await request.delete(`/api/documents/${document.id}`); }
});

test("a late GET after cancellation cannot close the next quote or clear its attribution", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { document } = await (await request.post("/api/documents", { data: { title: "Late confirmation", content: "Human prose." } })).json();
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); let checking = false; let held = false; let delivered = false; let posts = 0;
  await page.route(`**/api/documents/${document.id}/resources?*`, async (route) => {
    if (route.request().method() === "POST") { posts++; await route.fetch(); return route.abort(); }
    if (!checking) return route.continue();
    const response = await route.fetch(); held = true; await gate; await route.fulfill({ response }); delivered = true;
  });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const editor = page.getByRole("textbox", { name: "Markdown本文" }); await editor.click();
    await page.evaluate(() => navigator.clipboard.writeText("https://example.com/late-confirmation")); await editor.press("ControlOrMeta+V");
    const modal = page.getByRole("dialog"); await modal.getByRole("button", { name: "資料を登録", exact: true }).click(); await expect(modal.getByRole("alert")).toContainText("結果は不明");
    checking = true; await modal.getByRole("button", { name: "登録結果を確認", exact: true }).click(); await expect.poll(() => held).toBe(true);
    await expect(modal.getByRole("button", { name: "確認中…", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape"); await expect(modal).toHaveCount(0); await expect(editor).toBeFocused();
    await page.evaluate(() => navigator.clipboard.writeText("Next human quote.")); await editor.press("ControlOrMeta+V");
    await modal.getByLabel("Source URL *", { exact: true }).fill("https://example.com/next-quote"); await modal.getByLabel("Source Title", { exact: true }).fill("Next attribution");
    release(); await expect.poll(() => delivered).toBe(true); await page.waitForTimeout(200);
    await expect(modal).toBeVisible(); await expect(modal.getByLabel("Source URL *", { exact: true })).toHaveValue("https://example.com/next-quote"); await expect(modal.getByLabel("Source Title", { exact: true })).toHaveValue("Next attribution"); expect(posts).toBe(1);
    await page.keyboard.press("Escape"); await expect(editor).toBeFocused();
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); await request.delete(`/api/documents/${document.id}`); }
});

test("workspace resource registration confirms a unique stored match using GET", async ({ page, request }) => {
  const url = "https://example.com/workspace-confirmation"; let resourceId = ""; let posts = 0;
  await page.route("**/api/resources?*", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++; const response = await route.fetch(); resourceId = (await response.json()).resource.id; await route.abort();
  });
  try {
    await page.goto("/workspaces/default/resources"); const panel = page.getByRole("region", { name: "Sources", exact: true });
    await panel.getByLabel("Resource URL（必須）").fill(url); await panel.getByLabel("Resource Title（任意）").fill("Workspace confirmation"); await panel.getByRole("button", { name: "資料を登録", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("結果は不明"); await panel.getByRole("button", { name: "登録結果を確認", exact: true }).click();
    await expect(panel.getByRole("link", { name: "Workspace confirmation", exact: true })).toBeVisible(); await expect(panel.getByLabel("Resource URL（必須）")).toHaveValue(""); expect(posts).toBe(1);
  } finally { await page.unrouteAll({ behavior: "wait" }); if (resourceId) await request.delete(`/api/resources/${resourceId}`); }
});
