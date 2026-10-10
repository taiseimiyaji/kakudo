import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const evidence = process.env.EXPORT_TRIAL_EVIDENCE ?? "test-results/export-trial-evidence";
async function styles(page: Page) {
  return page.evaluate(() => {
    const body = getComputedStyle(document.body), root = getComputedStyle(document.documentElement);
    const heading = getComputedStyle(document.querySelector("h1")!);
    const button = getComputedStyle(document.querySelector(".mode-switch button")!);
    const title = document.querySelector<HTMLTextAreaElement>(".document-title textarea")!;
    const titleStyle = getComputedStyle(title);
    return { bodyFont: body.fontFamily, paper: root.getPropertyValue("--paper").trim(), ink: root.getPropertyValue("--ink").trim(), headingMargin: heading.margin, buttonBorder: button.border, buttonBackground: button.backgroundColor, titleWidth: title.getBoundingClientRect().width, titlePadding: titleStyle.padding, titleFont: titleStyle.font, titleColor: titleStyle.color };
  });
}
async function controls(root: Locator) {
  const count = root.getByRole("status", { name: "Submit count" }).or(root.locator('output[aria-label="Submit count"]'));
  await expect(count).toHaveText("0");
  await root.getByLabel("Name", { exact: true }).fill("Draft must remain");
  const first = root.getByRole("tab", { name: "All projects" });
  await first.focus(); await first.press("ArrowRight");
  const archived = root.getByRole("tab", { name: "Archived" });
  await expect(archived).toBeFocused(); await expect(archived).toHaveAttribute("aria-selected", "true");
  await archived.press("Home"); await expect(first).toBeFocused();
  await root.getByLabel("Disable tabs").check();
  await expect(first).toBeDisabled(); await expect(archived).toBeDisabled();
  await root.getByLabel("Disable tabs").uncheck();
  const opener = root.getByRole("button", { name: "Open confirmation" });
  await opener.click();
  const dialog = root.getByRole("dialog", { name: "Confirm changes" });
  const cancel = dialog.getByRole("button", { name: "Cancel" });
  const confirm = dialog.getByRole("button", { name: "Confirm", exact: true });
  await expect(dialog.getByLabel("Confirmation note")).toBeFocused();
  await dialog.getByLabel("Confirmation note").press("Shift+Tab"); await expect(confirm).toBeFocused();
  await cancel.focus(); await cancel.press("Shift+Tab"); await expect(dialog.getByLabel("Confirmation note")).toBeFocused();
  await confirm.focus(); await confirm.press("Tab"); await expect(dialog.getByLabel("Confirmation note")).toBeFocused();
  await dialog.getByLabel("Confirmation note").press("Escape"); await expect(dialog).toBeHidden(); await expect(opener).toBeFocused();
  await opener.click(); await dialog.getByRole("button", { name: "Cancel" }).press("Enter"); await expect(dialog).toBeHidden();
  await opener.click(); await confirm.press("Space"); await expect(dialog).toBeHidden();
  await expect(root.getByLabel("Name", { exact: true })).toHaveValue("Draft must remain");
  await expect(count).toHaveText("0");
  await root.getByRole("button", { name: "Save comparison" }).click(); await expect(count).toHaveText("1");
}

for (const width of [1440, 390]) {
  test(`isolated full-width ListPage at ${width}`, async ({ page }) => {
    mkdirSync(evidence, { recursive: true });
    await page.setViewportSize({ width, height: 1050 });
    await page.goto("/export-trial-render.html?screen=list");
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("tab", { name: "All projects" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "All projects" }).focus();
    await page.keyboard.press("ArrowRight"); await expect(page.getByRole("tab", { name: "Archived" })).toBeFocused();
    await page.screenshot({ path: join(evidence, `list-isolated-${width}.png`), fullPage: true });
  });

  test(`actual ZIP controls: keyboard, tabs, modal, parent form at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1050 });
    await page.goto("/workspaces/default/export-trial");
    const panel = page.getByRole("complementary", { name: "Export 試用パネル" });
    await panel.getByRole("button", { name: "直接読み込み", exact: true }).click();
    await controls(panel);
    await page.screenshot({ path: join(evidence, `controls-direct-${width}.png`), fullPage: true });
    await page.goto("/workspaces/default/export-trial");
    await panel.getByRole("button", { name: "iframe 比較", exact: true }).click();
    const frame = page.frameLocator('iframe[title="Tasteprint Export"]');
    await controls(frame.locator("body"));
    await panel.getByLabel("比較画面").selectOption("list");
    await expect(frame.locator(".sample-app")).toBeVisible();
    await expect(frame.getByRole("table")).toBeVisible();
    await page.screenshot({ path: join(evidence, `list-iframe-${width}.png`), fullPage: true });
  });

  test(`editor instance, focus, Undo, autosave; iframe and direct CSS at ${width}`, async ({ page, request }) => {
    mkdirSync(evidence, { recursive: true });
    const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
    const created = await request.post("/api/documents", { data: { title: "Export比較用ノート", content: "# Saved" } });
    expect(created.status()).toBe(201);
    const { document } = await created.json(), api = `/api/documents/${document.id}`;
    try {
      await page.setViewportSize({ width, height: 1050 });
      await page.clock.install();
      await page.goto(`/workspaces/default/documents/${document.id}?tasteprintTrial=1`);
      await page.getByRole("button", { name: "編集", exact: true }).click();
      const editor = page.getByRole("textbox", { name: "Markdown本文" });
      await expect(editor).toBeVisible();
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
      await editor.evaluate(element => { element.dataset.trialInstance = "same-editor"; });
      const before = await styles(page);
      await page.screenshot({ path: join(evidence, `editor-before-${width}.png`), fullPage: true });
      await editor.focus(); await editor.press("ControlOrMeta+End"); await editor.pressSequentially(" temporary");
      // Loading siblings must not remount or blur an active writing session.
      await page.getByRole("button", { name: "iframe 比較", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
      await expect(page.frameLocator('iframe[title="Tasteprint Export"]').getByRole("heading", { name: "Export 部品比較" })).toBeVisible();
      await expect(editor).toBeFocused(); await expect(editor).toHaveAttribute("data-trial-instance", "same-editor");
      const isolated = await styles(page); expect(isolated).toEqual(before);
      await editor.press("ControlOrMeta+z"); await expect(editor).toHaveText("# Saved");
      await editor.press("ControlOrMeta+End"); await editor.pressSequentially(" A"); await page.clock.runFor(1000);
      await expect.poll(async () => (await (await request.get(api)).json()).content).toBe("# Saved A");
      await page.screenshot({ path: join(evidence, `editor-iframe-${width}.png`), fullPage: true });
      await page.getByRole("button", { name: "直接読み込み", exact: true }).evaluate(button => (button as HTMLButtonElement).click());
      await page.clock.resume();
      await expect(page.getByRole("heading", { name: "Export 部品比較" })).toBeVisible();
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
      await expect(editor).toBeFocused(); await expect(editor).toHaveAttribute("data-trial-instance", "same-editor");
      const direct = await styles(page); expect(direct).not.toEqual(before); expect(direct.ink).not.toEqual(before.ink);
      await editor.pressSequentially(" B"); await page.clock.runFor(1000);
      await expect.poll(async () => (await (await request.get(api)).json()).content).toBe("# Saved A B");
      await editor.press("ControlOrMeta+z"); await expect(editor).toHaveText("# Saved A"); await page.clock.runFor(1000);
      await expect.poll(async () => (await (await request.get(api)).json()).content).toBe("# Saved A");
      await page.screenshot({ path: join(evidence, `editor-direct-${width}.png`), fullPage: true });
      await page.getByRole("button", { name: "比較前", exact: true }).click();
      const returned = await styles(page); expect(returned).toEqual(direct);
      // SPA navigation also retains imported CSS; a complete reload clears it.
      await page.getByRole("link", { name: "← 学習マップ" }).click();
      await expect(page.getByRole("heading", { name: "学習マップ", exact: true })).toBeVisible();
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ink").trim())).toBe(direct.ink);
      await page.goto(`/workspaces/default/documents/${document.id}`);
      await page.getByRole("button", { name: "編集", exact: true }).click();
      expect(await styles(page)).toEqual(before);
      expect(errors).toEqual([]);
      writeFileSync(join(evidence, `computed-styles-${width}.json`), JSON.stringify({ before, isolated, direct, returned, pageErrors: errors, editorPreserved: true, undo: true, autosave: true }, null, 2));
    } finally { await request.delete(api); }
  });
}
