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
export async function editNote(page: Page) {
  await page.getByRole("button", { name: "編集", exact: true }).click();
}
