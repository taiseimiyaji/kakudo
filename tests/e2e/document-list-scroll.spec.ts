import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { expect, test as base } from '@playwright/test';
import { requireE2eRunner } from '../../lib/e2e-env';

const test = base.extend<{ workspace: string }>({ workspace: async ({ request }, use) => {
  requireE2eRunner();
  const db = postgres(process.env.KAKUDO_E2E_DATABASE_URL!, { max: 1, onnotice: () => {} });
  const workspace = randomUUID();
  try { await db`insert into workspaces (id, name) values (${workspace}, '一覧位置の隔離検証')`; expect((await request.get(`/api/workspaces/${workspace}`)).ok()).toBe(true); await use(workspace); }
  finally { await db`delete from workspaces where id=${workspace}`; await db.end(); }
} });

for (const width of [390, 1440]) test(`returning from a note restores the long list position at ${width}px`, async ({ page, request, workspace }) => {
  const ids: string[] = [];
  try {
    for (let index = 0; index < 45; index++) {
      const { document } = await (await request.post(`/api/documents?workspaceId=${workspace}`, { data: { title: `一覧位置 QA ${String(index + 1).padStart(2, '0')}`, content: `本文 ${index + 1}` } })).json();
      ids.push(document.id);
    }
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/workspaces/${workspace}/documents`);
    const rows = page.locator('main ul > li');
    await expect(rows).toHaveCount(45);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(500);
    const before = await page.evaluate(() => scrollY);
    const last = rows.last().getByRole('link');
    const openedTitle = await last.textContent();
    await last.click();
    await expect(page.getByRole('heading', { name: 'ノート', exact: true })).toBeVisible();
    await page.goBack();
    await expect(rows).toHaveCount(45);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThanOrEqual(before - 150);
    await expect(last).toBeInViewport();
    await last.click();
    await page.goBack();
    await expect(rows).toHaveCount(45);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThanOrEqual(before - 150);
    await expect(last).toBeInViewport();
    await page.goForward();
    await page.getByRole('button', { name: '編集', exact: true }).click();
    await page.getByLabel('ノート名（必須）').fill(`${openedTitle} 追記`);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('保存済み', { exact: true })).toBeVisible();
    await page.goBack();
    await expect(rows).toHaveCount(45);
    await expect(page.getByRole('link', { name: `${openedTitle} 追記`, exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThanOrEqual(before - 150);
    await expect(last).toBeInViewport();
    await page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('link', { name: 'ホーム', exact: true }).click();
    await page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('link', { name: 'ノート', exact: true }).click();
    await expect(rows).toHaveCount(45);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThanOrEqual(150);
  } finally { await Promise.all(ids.map(id => request.delete(`/api/documents/${id}?workspaceId=${workspace}`))); }
});
