import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { expect, test as base } from '@playwright/test';
import { requireE2eRunner } from '../../lib/e2e-env';

const test = base.extend<{ workspace: string }>({ workspace: async ({ request }, use) => {
  requireE2eRunner();
  const db = postgres(process.env.KAKUDO_E2E_DATABASE_URL!, { max: 1, onnotice: () => {} });
  const workspace = randomUUID();
  try { await db`insert into workspaces (id, name) values (${workspace}, '長文再訪位置の隔離検証')`; expect((await request.get(`/api/workspaces/${workspace}`)).ok()).toBe(true); await use(workspace); }
  finally { await db`delete from workspaces where id=${workspace}`; await db.end(); }
} });

const content = ['# 長いノート', ...Array.from({ length: 100 }, (_, index) => `## 見出し ${index + 1}\n\n自分の言葉で考えたこと ${index + 1}。`)].join('\n\n');

for (const width of [390, 1440]) test(`Back and Forward return to the long note's reading point at ${width}px`, async ({ page, request, workspace }) => {
  const title = `履歴から続きを読む ${width}`;
  const { document } = await (await request.post(`/api/documents?workspaceId=${workspace}`, { data: { title, content } })).json();
  const notePath = `/workspaces/${workspace}/documents/${document.id}`;
  let reads = 0;
  let writes = 0;
  await page.route(`**/api/documents/${document.id}?*`, async route => {
    if (route.request().method() === 'PUT') writes++;
    if (route.request().method() === 'GET' && ++reads > 1) await new Promise(resolve => setTimeout(resolve, 350));
    await route.continue();
  });
  try {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/workspaces/${workspace}/documents`);
    await page.getByRole('link', { name: title, exact: true }).click();
    await expect(page).toHaveURL(notePath);
    await expect(page.getByRole('region', { name: '閲覧モード' })).toBeVisible();
    expect(await page.evaluate(() => scrollY)).toBe(0);
    const heading = page.locator('.note-reading h2').filter({ hasText: '見出し 70' });
    await heading.evaluate(element => element.scrollIntoView({ block: 'center' }));
    const before = await page.evaluate(() => scrollY);
    expect(before).toBeGreaterThan(2000);
    await page.waitForTimeout(100);
    await page.goBack();
    await expect(page).toHaveURL(`/workspaces/${workspace}/documents`);
    await page.goForward();
    await expect(page).toHaveURL(notePath);
    await expect(page.getByRole('region', { name: '閲覧モード' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThanOrEqual(before - 200);
    await expect(heading).toBeInViewport();
    expect(reads).toBeGreaterThanOrEqual(2);
    expect(writes).toBe(0);
    expect((await (await request.get(`/api/documents/${document.id}?workspaceId=${workspace}`)).json()).content).toBe(content);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/documents/${document.id}?workspaceId=${workspace}`); }
});

test('a navigation choice during a slow history read is not scrolled away', async ({ page, request, workspace }) => {
  const { document } = await (await request.post(`/api/documents?workspaceId=${workspace}`, { data: { title: '読込中のメニュー操作', content } })).json();
  const path = `/api/documents/${document.id}`;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/workspaces/${workspace}/documents`);
    await page.getByRole('link', { name: '読込中のメニュー操作', exact: true }).click();
    await page.locator('.note-reading h2').filter({ hasText: '見出し 70' }).evaluate(element => element.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(100);
    await page.goBack();
    await page.route(`**${path}?*`, async route => { if (route.request().method() === 'GET') await gate; await route.continue(); });
    await page.goForward();
    await expect(page.getByRole('status').filter({ hasText: '読み込み中…' })).toBeVisible();
    const menu = page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('link', { name: 'ホーム', exact: true });
    await menu.focus();
    await expect(menu).toBeFocused();
    release();
    await expect(page.getByRole('region', { name: '閲覧モード' })).toBeVisible();
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); await request.delete(`${path}?workspaceId=${workspace}`); }
});
