import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { expect, test as base } from '@playwright/test';
import { requireE2eRunner } from '../../lib/e2e-env';

const test = base.extend<{ workspace: string }>({ workspace: async ({ request }, use) => {
  requireE2eRunner();
  const db = postgres(process.env.KAKUDO_E2E_DATABASE_URL!, { max: 1, onnotice: () => {} });
  const workspace = randomUUID();
  try {
    await db`insert into workspaces (id, name) values (${workspace}, '一覧読込中のフォーカス検証')`;
    expect((await request.get(`/api/workspaces/${workspace}`)).ok()).toBe(true);
    await use(workspace);
  } finally { await db`delete from workspaces where id=${workspace}`; await db.end(); }
} });

for (const width of [390, 1440]) test(`a delayed list restores reading position without moving a focused menu away at ${width}px`, async ({ page, request, workspace }) => {
  const ids: string[] = [];
  let release = () => {};
  try {
    for (let index = 0; index < 45; index++) {
      const { document } = await (await request.post(`/api/documents?workspaceId=${workspace}`, { data: { title: `遅延一覧 ${String(index + 1).padStart(2, '0')}`, content: `自分の本文 ${index + 1}` } })).json();
      ids.push(document.id);
    }
    const list = `/workspaces/${workspace}/documents`;
    await page.setViewportSize({ width, height: 844 });
    await page.goto(list);
    const rows = page.locator('main ul > li');
    await expect(rows).toHaveCount(45);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
    const saved = await page.evaluate(() => scrollY);
    const last = rows.last().getByRole('link');
    await last.click();
    await expect(page.getByRole('region', { name: '閲覧モード' })).toBeVisible();
    let gate: Promise<void> | null = null;
    let delayedReads = 0;
    await page.route('**/api/documents?*', async route => {
      if (route.request().method() === 'GET' && gate) { delayedReads++; await gate; }
      await route.continue();
    });

    gate = new Promise(resolve => { release = resolve; });
    await page.goBack();
    await expect(page.getByRole('status').filter({ hasText: 'ノートを読み込んでいます…' })).toBeVisible();
    release(); release = () => {}; gate = null;
    await expect(rows).toHaveCount(45);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThanOrEqual(saved - 150);
    await expect(last).toBeInViewport();

    await last.click();
    await expect(page.getByRole('region', { name: '閲覧モード' })).toBeVisible();
    gate = new Promise(resolve => { release = resolve; });
    await page.goBack();
    await expect(page.getByRole('status').filter({ hasText: 'ノートを読み込んでいます…' })).toBeVisible();
    const home = page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('link', { name: 'ホーム', exact: true });
    for (let i = 0; i < 8 && !await home.evaluate(element => element === document.activeElement); i++) await page.keyboard.press('Tab');
    await expect(home).toBeFocused();
    await expect(home).toBeInViewport();
    release(); release = () => {}; gate = null;
    await expect(rows).toHaveCount(45);
    await expect(home).toBeFocused();
    await expect(home).toBeInViewport();
    expect(await page.evaluate(() => scrollY)).toBeLessThan(150);
    expect(delayedReads).toBe(2);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await Promise.all(ids.map(id => request.delete(`/api/documents/${id}?workspaceId=${workspace}`)));
  }
});
