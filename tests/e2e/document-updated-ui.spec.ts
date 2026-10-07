import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import postgres from 'postgres';
import type { APIRequestContext } from '@playwright/test';
import { expect, test as base } from './manual-note-fixture';
import { requireE2eRunner } from '../../lib/e2e-env';

const test = base.extend<{ workspace: string }>({ workspace: async ({ request }, use) => {
  requireE2eRunner(); const db = postgres(process.env.KAKUDO_E2E_DATABASE_URL!, { max: 1, onnotice: () => {} }); const id = randomUUID();
  try { await db`insert into workspaces (id, name) values (${id}, '日時表示の隔離検証')`; expect((await request.get(`/api/workspaces/${id}`)).ok()).toBe(true); await use(id); }
  finally { await db`delete from workspaces where id=${id}`; await db.end(); }
} });
test.use({ locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
const titles = ['HTTPを復習する', 'DB接続の考察', 'まだ途中のキャッシュ', 'OAuthメモ', 'ログの読み方', 'OAuthメモ', '別の日のAPIノート'];
async function note(request: APIRequestContext, workspace: string, title: string, index: number, content = '# 自分の言葉') {
  const { document } = await (await request.post(`/api/documents?workspaceId=${workspace}`, { data: { title, content } })).json();
  requireE2eRunner(); const db = postgres(process.env.KAKUDO_E2E_DATABASE_URL!, { max: 1, onnotice: () => {} });
  const stamp = new Date(Date.UTC(2026, 9, index + 1, 1, 2, 3)).toISOString();
  try { await db`update documents set created_at=${stamp}, updated_at=${stamp} where id=${document.id} and workspace_id=${workspace}`; } finally { await db.end(); }
  return document;
}

for (const width of [1440, 390]) test(`same titles have quiet accessible update dates without new tab stops ${width}`, async ({ page, request, workspace }, info) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  for (const [index, title] of titles.entries()) await note(request, workspace, title, index);
  await page.goto(`/workspaces/${workspace}/documents`);
  const links = page.locator('main > ul > li > a'); await expect(links).toHaveCount(7); expect(await links.allTextContents()).toEqual(titles);
  const rows = page.locator('main > ul > li');
  const data = (await (await request.get(`/api/documents?workspaceId=${workspace}`)).json()).documents;
  for (const [index, document] of data.entries()) {
    const row = rows.nth(index); await expect(row.locator('time')).toHaveAttribute('datetime', document.updatedAt);
    await expect(row.locator('small')).toContainText('最終更新'); await expect(row.locator('small')).toContainText('JST');
    await expect(row.locator('a')).toHaveAccessibleDescription(await row.locator('small').innerText());
    const geometry = await row.evaluate(e => ({ linkBottom: e.querySelector('a')!.getBoundingClientRect().bottom, dateTop: e.querySelector('small')!.getBoundingClientRect().top, fontSize: getComputedStyle(e.querySelector('small')!).fontSize }));
    expect(geometry.dateTop).toBeGreaterThanOrEqual(geometry.linkBottom); expect(geometry.fontSize).toBe('13px');
  }
  const duplicateLinks = page.getByRole('link', { name: 'OAuthメモ', exact: true }); await expect(duplicateLinks).toHaveCount(2);
  await expect(duplicateLinks.nth(0)).toHaveAccessibleDescription('最終更新 2026/10/04 10:02:03 JST');
  await expect(duplicateLinks.nth(1)).toHaveAccessibleDescription('最終更新 2026/10/06 10:02:03 JST');
  await links.first().focus(); await page.keyboard.press('Tab'); await expect(links.nth(1)).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  await page.locator('h1').click(); await page.screenshot({ path: info.outputPath(`after-list-${width}.png`), fullPage: true });
  await writeFile(info.outputPath(`dates-${width}.json`), JSON.stringify({ width, locale: 'ja-JP', timezone: 'Asia/Tokyo', preservedOrder: await links.allTextContents(), sourceDates: data.map((d: { title: string; updatedAt: string }) => ({ title: d.title, updatedAt: d.updatedAt })), descriptions: await duplicateLinks.evaluateAll(elements => elements.map(e => document.getElementById(e.getAttribute('aria-describedby')!)!.textContent)), noNewTabStops: true, scrollWidth: await page.evaluate(() => document.documentElement.scrollWidth) }, null, 2));
  const long = await note(request, workspace, '数日後に続きを考えるための長いノート名'.repeat(8), 6); await page.reload();
  const longRow = page.locator('main > ul > li').filter({ has: page.locator(`a[href$="/documents/${long.id}"]`) }); await expect(longRow.locator('time')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  if (width === 390) {
    await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
    await expect.poll(() => longRow.locator('small').evaluate(e => getComputedStyle(e).fontSize)).toBe('26px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await longRow.scrollIntoViewIfNeeded(); await page.screenshot({ path: info.outputPath('long-title-larger-date-390.png') });
  }
});

test('list dates reflect committed API metadata, never reading or an unsaved draft; save and Undo stay intact', async ({ page, context, request, workspace }) => {
  const document = await note(request, workspace, '保存済みの名前', 0); const api = `/api/documents/${document.id}?workspaceId=${workspace}`;
  const stored = async () => (await (await request.get(api)).json()); const initial = await stored(); let puts = 0;
  page.on('request', req => { if (req.method() === 'PUT' && new URL(req.url()).pathname === `/api/documents/${document.id}`) puts++; });
  await page.goto(`/workspaces/${workspace}/documents`); const date = page.locator('main > ul time'); await expect(date).toHaveAttribute('datetime', initial.document.updatedAt);
  await page.getByRole('link', { name: '保存済みの名前', exact: true }).click(); await page.getByRole('button', { name: '編集', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Markdown本文' }); const identity = await editor.elementHandle();
  expect((await stored()).document.updatedAt).toBe(initial.document.updatedAt);
  await editor.press('ControlOrMeta+End'); await editor.pressSequentially(' 人間の追記。'); await page.getByLabel('ノート名（必須）').fill('未保存の新しい名前');
  await expect(page.locator('.save-state')).toHaveText('未保存の変更'); const unchanged = await stored(); expect(unchanged.document.updatedAt).toBe(initial.document.updatedAt); expect(unchanged.document.title).toBe('保存済みの名前'); expect(unchanged.content).toBe(initial.content); expect(puts).toBe(0);
  const list = await context.newPage();
  try {
    await list.goto(`/workspaces/${workspace}/documents`); await expect(list.getByRole('link', { name: '保存済みの名前', exact: true })).toBeVisible(); await expect(list.locator('main > ul time')).toHaveAttribute('datetime', initial.document.updatedAt);
    await editor.press('ControlOrMeta+z'); await expect(editor).not.toContainText('人間の追記'); await editor.press('ControlOrMeta+Shift+z'); await expect(editor).toContainText('人間の追記');
    expect(await editor.evaluate((e, old) => e === old, identity)).toBe(true); expect((await stored()).document.updatedAt).toBe(initial.document.updatedAt);
    await page.getByRole('button', { name: '保存', exact: true }).click(); await expect(page.locator('.save-state')).toHaveText('保存済み'); const saved = await stored();
    expect(saved.content).toBe(initial.content + ' 人間の追記。'); expect(saved.document.title).toBe('未保存の新しい名前'); expect(new Date(saved.document.updatedAt).getTime()).toBeGreaterThan(new Date(initial.document.updatedAt).getTime());
    await list.reload(); await expect(list.locator('main > ul time')).toHaveAttribute('datetime', saved.document.updatedAt); await expect(list.getByRole('link', { name: '未保存の新しい名前', exact: true })).toBeVisible();
    await page.getByLabel('ノート名（必須）').fill('名前だけ保存したノート'); await page.getByRole('button', { name: '保存', exact: true }).click(); await expect(page.locator('.save-state')).toHaveText('保存済み'); const renamed = await stored();
    expect(renamed.document.currentRevisionId).toBe(saved.document.currentRevisionId); expect(renamed.content).toBe(saved.content); expect(new Date(renamed.document.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(saved.document.updatedAt).getTime());
    expect((await request.put(api, { data: { title: '拒否される名前', content: '拒否される本文', baseHash: renamed.contentHash, baseWriteId: initial.document.lastWriteId } })).status()).toBe(409);
    const rejected = await stored(); expect(rejected.document.updatedAt).toBe(renamed.document.updatedAt); expect(rejected.document.title).toBe(renamed.document.title); expect(rejected.content).toBe(renamed.content);
    await list.reload(); await expect(list.locator('main > ul time')).toHaveAttribute('datetime', renamed.document.updatedAt);
    expect(await editor.evaluate((e, old) => e === old, identity)).toBe(true); expect(puts).toBe(2);
  } finally { await list.close(); }
});
