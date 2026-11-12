import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { expect, test as base } from '@playwright/test';
import { requireE2eRunner } from '../../lib/e2e-env';

const test = base.extend<{ workspace: string }>({ workspace: async ({ request }, use) => {
  requireE2eRunner();
  const db = postgres(process.env.KAKUDO_E2E_DATABASE_URL!, { max: 1, onnotice: () => {} });
  const workspace = randomUUID();
  try {
    await db`insert into workspaces (id, name) values (${workspace}, '一覧再試行フォーカス隔離検証')`;
    expect((await request.get(`/api/workspaces/${workspace}`)).ok()).toBe(true);
    await use(workspace);
  } finally { await db`delete from workspaces where id=${workspace}`; await db.end(); }
} });

for (const width of [390, 1440]) test(`keyboard retry keeps the restored list usable at ${width}px`, async ({ page, request, workspace }) => {
  const ids: string[] = [];
  let release = () => {};
  try {
    for (let i = 0; i < 45; i++) {
      const response = await request.post(`/api/documents?workspaceId=${workspace}`, { data: { title: `再試行 QA ${String(i + 1).padStart(2, '0')}`, content: `自分の本文 ${i + 1}` } });
      expect(response.ok()).toBe(true);
      ids.push((await response.json()).document.id);
    }
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/workspaces/${workspace}/documents`);
    const rows = page.locator('main ul > li');
    await expect(rows).toHaveCount(45);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
    const savedY = await page.evaluate(() => scrollY);
    const last = rows.last().getByRole('link');
    await last.click();
    await expect(page.getByRole('region', { name: '閲覧モード' })).toBeVisible();

    let reads = 0;
    let failNext = false;
    let gate: Promise<void> | null = null;
    const failBackAndHoldRetry = () => {
      failNext = true;
      gate = new Promise(resolve => { release = resolve; });
    };
    await page.route('**/api/documents?*', async route => {
      if (route.request().method() !== 'GET') return route.continue();
      reads++;
      if (failNext) { failNext = false; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'QA read failure' }) }); }
      if (gate) await gate;
      await route.continue();
    });
    const retry = page.getByRole('button', { name: 'ノート一覧を再読み込み' });
    const focusRetry = async () => {
      for (let i = 0; i < 16 && !await retry.evaluate(element => element === document.activeElement); i++) await page.keyboard.press('Tab');
      await expect(retry).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('status').filter({ hasText: 'ノートを読み込んでいます…' })).toBeVisible();
      await expect(retry).toHaveCount(0);
    };

    failBackAndHoldRetry();
    await page.goBack();
    await expect(retry).toBeVisible();
    await focusRetry();
    release(); release = () => {}; gate = null;
    await expect(rows).toHaveCount(45);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThanOrEqual(savedY - 150);
    const focusedIndex = await page.evaluate(() => Array.from(document.querySelectorAll('main ul a')).indexOf(document.activeElement as HTMLAnchorElement));
    expect(focusedIndex).toBeGreaterThan(30);
    await expect(rows.nth(focusedIndex).getByRole('link')).toBeInViewport();
    await page.keyboard.press('Tab');
    await expect(rows.nth(focusedIndex + 1).getByRole('link')).toBeFocused();
    expect(await page.evaluate(() => scrollY)).toBeGreaterThanOrEqual(savedY - 150);
    for (let i = focusedIndex + 1; i < 44; i++) await page.keyboard.press('Tab');
    await expect(last).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: '閲覧モード' })).toBeVisible();

    // A newer menu choice during retry must keep its focus and viewport.
    failBackAndHoldRetry();
    await page.goBack();
    await expect(retry).toBeVisible();
    await focusRetry();
    const home = page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('link', { name: 'ホーム', exact: true });
    for (let i = 0; i < 16 && !await home.evaluate(element => element === document.activeElement); i++) await page.keyboard.press('Tab');
    await expect(home).toBeFocused();
    release(); release = () => {}; gate = null;
    await expect(rows).toHaveCount(45);
    await expect(home).toBeFocused();
    await expect(home).toBeInViewport();
    expect(await page.evaluate(() => scrollY)).toBeLessThan(150);
    expect(reads).toBe(4);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await Promise.all(ids.map(id => request.delete(`/api/documents/${id}?workspaceId=${workspace}`)));
  }
});
