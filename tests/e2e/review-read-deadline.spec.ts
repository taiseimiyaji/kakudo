import { test as base, expect, type Page, type APIRequestContext } from '@playwright/test';

const content = 'Cookieを使うのでSession認証は安全である。認証と認可について人間が自分の言葉で書く。';
type Fixture = { id: string; revisionId: string; title: string };
const test = base.extend<{ note: Fixture }>({ note: async ({ request }, use) => {
  const { document } = await (await request.post('/api/documents', { data: { title: '読取期限の人間のノート', content } })).json();
  try { await use({ id: document.id, revisionId: document.currentRevisionId, title: document.title }); } finally { await request.delete(`/api/documents/${document.id}`); }
} });
async function completed(request: APIRequestContext, note: Fixture, type = 'FULL') {
  const { run } = await (await request.post(`/api/documents/${note.id}/reviews`, { data: { revisionId: note.revisionId, type } })).json(); await expect.poll(async () => (await (await request.get(`/api/reviews/${run.id}`)).json()).run.status).toBe('COMPLETED'); return run.id as string;
}
async function frozen(page: Page) { await page.clock.install(); await page.clock.pauseAt(new Date()); }
async function edit(page: Page) { await page.getByRole('button', { name: '編集', exact: true }).click(); }
async function laterDraft(page: Page) { const editor = page.getByRole('textbox', { name: 'Markdown本文' }); await editor.click(); await editor.press('ControlOrMeta+End'); await editor.pressSequentially(' 後で人間が書いた未保存の考察。'); await page.getByLabel('ノート名（必須）').fill('後で人間が考えた名前'); await page.getByLabel('資料URL（必須）').fill('https://example.com/retained-review-read-draft'); return editor; }

for (const kind of ['history', 'detail'] as const) for (const recovery of ['automatic', 'manual'] as const) test(`${kind} stalled read recovers by ${recovery} GET without recreating a review or changing drafts`, async ({ page, request, note }) => {
  await frozen(page); const runId = await completed(request, note); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let reads = 0; let held = false; let posts = 0; page.on('request', req => { if (req.method() === 'POST' && req.url().includes(`/documents/${note.id}/reviews`)) posts++; });
  const path = kind === 'history' ? `**/api/documents/${note.id}/reviews?*` : `**/api/reviews/${runId}?*`;
  await page.route(path, async route => { if (route.request().method() !== 'GET') return route.continue(); reads++; const response = await route.fetch(); expect(response.status()).toBe(200); if (reads !== 1) return route.fulfill({ response }); held = true; await gate; await route.fulfill({ response }).catch(() => {}); });
  try {
    await page.goto(`/workspaces/default/documents/${note.id}`); await edit(page); await expect.poll(() => held).toBe(true); const review = page.getByRole('region', { name: 'レビュー', exact: true }); await page.clock.runFor(19999); expect(reads).toBe(1); await expect(review.getByRole('alert')).toHaveCount(0);
    await page.clock.runFor(2); await expect(review.getByRole('alert')).toContainText('応答が時間内に届きませんでした'); expect(reads).toBe(1); const retry = review.getByRole('button', { name: kind === 'history' ? '履歴を再取得' : '状態を再取得', exact: true }); await expect(retry).toBeEnabled();
    if (recovery === 'automatic') { await page.clock.runFor(1000); await expect.poll(() => reads).toBe(2); await expect(page.getByLabel('レビューの状態')).toContainText('完了'); await page.clock.runFor(60000); expect(reads).toBe(2); }
    const editor = await laterDraft(page);
    if (recovery === 'manual') await retry.click();
    await expect(page.getByLabel('レビューの状態')).toContainText('完了'); await expect(review.getByRole('alert')).toHaveCount(0); expect(reads).toBe(2); release(); await page.unrouteAll({ behavior: 'wait' });
    await expect(editor).toContainText('後で人間が書いた未保存の考察。'); await expect(page.getByLabel('ノート名（必須）')).toHaveValue('後で人間が考えた名前'); await expect(page.getByLabel('資料URL（必須）')).toHaveValue('https://example.com/retained-review-read-draft'); await expect(page.getByText('未保存の変更', { exact: true })).toBeVisible(); const saved = await (await request.get(`/api/documents/${note.id}`)).json(); expect(saved.content).toBe(content); expect(saved.document.title).toBe(note.title); expect(posts).toBe(0);
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
});

test('manual GET cancels the old automatic backoff request', async ({ page, request, note }) => {
  await frozen(page); await completed(request, note); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let reads = 0;
  await page.route(`**/api/documents/${note.id}/reviews?*`, async route => { reads++; const response = await route.fetch(); if (reads !== 1) return route.fulfill({ response }); await gate; await route.fulfill({ response }).catch(() => {}); });
  try { await page.goto(`/workspaces/default/documents/${note.id}`); await expect.poll(() => reads).toBe(1); await page.clock.runFor(20001); await page.getByRole('button', { name: '履歴を再取得', exact: true }).click(); await expect(page.getByLabel('レビューの状態')).toContainText('完了'); await page.clock.runFor(1001); expect(reads).toBe(2); await page.clock.runFor(60000); expect(reads).toBe(2); release(); await page.unrouteAll({ behavior: 'wait' }); expect(reads).toBe(2); } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
});

test('late old history snapshot cannot remove a newer run or change its current selection', async ({ page, request, note }) => {
  await frozen(page); const old = await completed(request, note, 'LOGIC'); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let reads = 0; let held = false;
  await page.route(`**/api/documents/${note.id}/reviews?*`, async route => { reads++; const response = await route.fetch(); if (reads !== 1) return route.fulfill({ response }); held = true; await gate; await route.fulfill({ response }).catch(() => {}); });
  try { await page.goto(`/workspaces/default/documents/${note.id}`); await edit(page); await expect.poll(() => held).toBe(true); const current = await completed(request, note, 'FULL'); await page.clock.runFor(20001); await page.getByRole('button', { name: '履歴を再取得', exact: true }).click(); const selection = page.getByLabel('レビュー履歴'); await expect(selection.locator('option')).toHaveCount(2); await selection.selectOption(old); await expect(page.getByLabel('レビューの状態')).toContainText('完了'); await selection.selectOption(current); await expect(page.getByLabel('レビューの状態')).toContainText('完了'); const editor = await laterDraft(page); release(); await page.unrouteAll({ behavior: 'wait' }); await expect(selection).toHaveValue(current); await expect(selection.locator('option')).toHaveCount(2); await expect(editor).toContainText('後で人間が書いた未保存の考察。'); expect(reads).toBe(2); } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
});

test('switching selected run cancels its deadline and ignores its late detail', async ({ page, request, note }) => {
  await frozen(page); const old = await completed(request, note, 'LOGIC'); const current = await completed(request, note, 'SOURCE'); const currentDetail = await (await request.get(`/api/reviews/${current}`)).json(); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let held = false; let oldReads = 0; let currentReads = 0;
  page.on('request', req => { if (req.method() === 'GET' && req.url().includes(`/reviews/${current}?`)) currentReads++; }); await page.route(`**/api/reviews/${old}?*`, async route => { oldReads++; const response = await route.fetch(); held = true; await gate; await route.fulfill({ response }).catch(() => {}); });
  try { await page.goto(`/workspaces/default/documents/${note.id}`); await edit(page); await expect(page.getByLabel('レビューの状態')).toContainText('完了'); const selection = page.getByLabel('レビュー履歴'); await selection.selectOption(old); await expect.poll(() => held).toBe(true); await selection.selectOption(current); await expect(page.getByLabel('レビューの状態')).toContainText('完了'); await page.clock.runFor(45000); await expect(page.locator('.review-panel').getByRole('alert')).toHaveCount(0); expect(oldReads).toBe(1); expect(currentReads).toBe(2); const editor = await laterDraft(page); release(); await page.unrouteAll({ behavior: 'wait' }); await expect(selection).toHaveValue(current); await expect(page.locator('.review-panel').getByRole('article')).toHaveCount(currentDetail.findings.length); await expect(editor).toContainText('後で人間が書いた未保存の考察。'); } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
});

test('late prior document history cannot change the next documents review selection or human draft', async ({ page, request, note }) => {
  await frozen(page); await completed(request, note); const { document } = await (await request.post('/api/documents', { data: { title: '移動先の人間のノート', content } })).json(); const next = { id: document.id, revisionId: document.currentRevisionId, title: document.title }; const current = await completed(request, next); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let held = false; let reads = 0;
  await page.route(`**/api/documents/${note.id}/reviews?*`, async route => { reads++; const response = await route.fetch(); held = true; await gate; await route.fulfill({ response }).catch(() => {}); });
  try { await page.goto(`/workspaces/default/documents/${note.id}`); await expect.poll(() => held).toBe(true); await page.goto(`/workspaces/default/documents/${next.id}`); await edit(page); await expect(page.getByLabel('レビューの状態')).toContainText('完了'); await page.clock.runFor(45000); await expect(page.locator('.review-panel').getByRole('alert')).toHaveCount(0); const editor = await laterDraft(page); release(); await page.unrouteAll({ behavior: 'wait' }); await expect(page.getByLabel('レビュー履歴')).toHaveValue(current); await expect(editor).toContainText('後で人間が書いた未保存の考察。'); await expect(page.getByLabel('ノート名（必須）')).toHaveValue('後で人間が考えた名前'); expect(reads).toBe(1); } finally { release(); await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/documents/${next.id}`); }
});

test('cached pending status survives a stalled poll then resumes its existing completed run', async ({ page, request, note }) => {
  await frozen(page); const runId = await completed(request, note); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let reads = 0;
  await page.route(`**/api/reviews/${runId}?*`, async route => { reads++; const response = await route.fetch(); if (reads === 1) { const detail = await response.json(); detail.run.status = 'RUNNING'; detail.run.stage = 'LOGIC'; return route.fulfill({ response, json: detail }); } if (reads !== 2) return route.fulfill({ response }); await gate; await route.fulfill({ response }).catch(() => {}); });
  try { await page.goto(`/workspaces/default/documents/${note.id}`); await edit(page); await expect(page.getByLabel('レビューの状態')).toContainText('確認中'); await page.clock.runFor(1000); await expect.poll(() => reads).toBe(2); await page.clock.runFor(20001); await expect(page.locator('.review-panel').getByRole('alert')).toContainText('応答が時間内に届きませんでした'); await expect(page.getByLabel('レビューの状態')).toContainText('確認中'); const editor = await laterDraft(page); await page.getByRole('button', { name: '状態を再取得', exact: true }).click(); await expect(page.getByLabel('レビューの状態')).toContainText('完了'); expect(reads).toBe(3); release(); await page.unrouteAll({ behavior: 'wait' }); await expect(editor).toContainText('後で人間が書いた未保存の考察。'); expect((await (await request.get(`/api/reviews/${runId}`)).json()).run.status).toBe('COMPLETED'); } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
});
