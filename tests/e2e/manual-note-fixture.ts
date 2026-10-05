import { test as base, expect, type Page } from "@playwright/test";

// Existing manual-save regressions deliberately keep their unsaved draft until
// an explicit save/quote. Control only the new autosave interval; review polling
// and every other browser timer continue normally. Autosave specs use base test.
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(() => {
      const interval = window.setInterval.bind(window);
      window.setInterval = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => interval(handler, delay === 1000 ? 3_600_000 : delay, ...args)) as typeof window.setInterval;
    });
    await use(context);
  },
});
export { expect };
export async function openNotePanels(page: Page) {
  // Legacy manual-save regressions exercise the complete set of note tools.
  // New writing-layout specs use the base fixture and keep the default closed.
  if (!/\/documents\/[^/]+$/.test(new URL(page.url()).pathname)) return;
  await page.locator("[data-note-panel=goals]").waitFor({ state: "attached" });
  const menu = page.locator(".note-navigation");
  if (await menu.getAttribute("open") === null) await menu.locator(":scope > summary").click();
  for (const name of ["goals", "review", "resources"]) {
    const panel = page.locator(`details[data-note-panel="${name}"]`);
    if (await panel.count() && await panel.getAttribute("open") === null) await panel.locator(":scope > summary").click();
  }
}
export async function editNote(page: Page) {
  await page.getByRole("button", { name: "編集", exact: true }).click();
  await openNotePanels(page);
}
