import { expect, test as base } from '@playwright/test';

type Fixture = { mapId: string; mapTitle: string; nodeId: string; documentId: string; title: string; prose: string };
const test = base.extend<{ note: Fixture }>({ note: async ({ request }, use) => {
  const mapTitle = `ノート読取の確認-${crypto.randomUUID()}`;
  const { roadmap } = await (await request.post('/api/roadmaps', { data: { title: mapTitle } })).json();
  const { node } = await (await request.post('/api/nodes', { data: { roadmapId: roadmap.id, title: '人間の学習項目' } })).json();
  const title = `人間が書いて保存したノート-${node.id}`; const prose = '認証は誰かを確かめ、認可は許可される操作を決める。人間の理解を自分の言葉で記録する。';
  const { document } = await (await request.post('/api/documents', { data: { title, content: prose, nodeIds: [node.id] } })).json();
  try { await use({ mapId: roadmap.id, mapTitle, nodeId: node.id, documentId: document.id, title, prose }); }
  finally { await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/roadmaps/${roadmap.id}`); }
} });
type Entry = 'note' | 'workspace-list' | 'node-list';
function matches(url: URL, entry: Entry, note: Fixture) { return entry === 'note' ? url.pathname === `/api/documents/${note.documentId}` : url.pathname === '/api/documents' && (entry === 'node-list' ? url.searchParams.get('nodeId') === note.nodeId : !url.searchParams.has('nodeId')); }
function path(entry: Entry, note: Fixture) { return entry === 'note' ? `/workspaces/default/documents/${note.documentId}` : entry === 'workspace-list' ? '/workspaces/default/documents' : `/workspaces/default/roadmaps/${note.mapId}?nodeId=${note.nodeId}`; }
function retryName(entry: Entry) { return entry === 'note' ? 'ノートを再取得' : 'ノート一覧を再読み込み'; }

for (const entry of ['note', 'workspace-list', 'node-list'] as const) test(`${entry} stalled real GET has one deadline and explicit GET-only recovery`, async ({ page, request, note }) => {
  await page.clock.install(); await page.clock.pauseAt(new Date()); let reads = 0; let writes = 0; let held = false; let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  page.on('request', req => { if (['POST','PUT','PATCH','DELETE'].includes(req.method()) && new URL(req.url()).pathname.startsWith('/api/')) writes++; });
  await page.route(/\/api\/documents(?:\/|\?)/, async route => { if (!matches(new URL(route.request().url()), entry, note)) return route.continue(); reads++; const response = await route.fetch(); expect(response.status()).toBe(200); if (reads !== 1) return route.fulfill({ response }); held = true; await gate; await route.fulfill({ response }).catch(() => {}); });
  try {
    await page.goto(path(entry, note)); await expect.poll(() => held).toBe(true); await page.clock.runFor(19999); await expect(page.getByRole('alert')).toHaveCount(0); expect(reads).toBe(1); await page.clock.runFor(1); await expect(page.getByRole('alert')).toContainText('ノートの応答が時間内に届きませんでした'); await expect(page.getByText('最初のノートを作りましょう', { exact: true })).toHaveCount(0); await expect(page.getByText('この学習項目に関連するノートはありません。', { exact: true })).toHaveCount(0);
    if (entry === 'node-list') { await page.getByLabel('新しいノート（必須）').fill('人間の次のノート名'); await page.getByLabel('学習目標（任意・1行1項目）').fill('人間が説明したい目標'); await page.getByLabel('マップ名（必須）').fill('人間が考え直した地図名'); await page.getByLabel('資料URL（必須）').fill('https://example.com/human-draft'); }
    await page.clock.runFor(45000); expect(reads).toBe(1); await page.getByRole('button', { name: retryName(entry), exact: true }).click();
    if (entry === 'note') await expect(page.getByRole('region', { name: '閲覧モード' })).toContainText(note.prose); else await expect(page.getByRole('link', { name: note.title, exact: true })).toBeVisible(); expect(reads).toBe(2); release(); await page.unrouteAll({ behavior: 'wait' }); await page.clock.runFor(45000); expect(reads).toBe(2); expect(writes).toBe(0); await expect(page.getByRole('alert')).toHaveCount(0);
    if (entry === 'node-list') { await expect(page.getByLabel('新しいノート（必須）')).toHaveValue('人間の次のノート名'); await expect(page.getByLabel('学習目標（任意・1行1項目）')).toHaveValue('人間が説明したい目標'); await expect(page.getByLabel('マップ名（必須）')).toHaveValue('人間が考え直した地図名'); await expect(page.getByLabel('資料URL（必須）')).toHaveValue('https://example.com/human-draft'); }
    expect((await (await request.get(`/api/documents/${note.documentId}`)).json()).content).toBe(note.prose);
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
});

for (const entry of ['note', 'workspace-list', 'node-list'] as const) test(`${entry} ordinary HTTP failure has a manual retry without treating the note as empty`, async ({ page, note }) => {
  let reads = 0; await page.route(/\/api\/documents(?:\/|\?)/, route => { if (!matches(new URL(route.request().url()), entry, note)) return route.continue(); reads++; if (reads === 1) return route.fulfill({ status: 500, json: { error: 'private backend diagnostic' } }); return route.continue(); });
  await page.goto(path(entry, note)); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByRole('alert')).not.toContainText('private backend diagnostic'); await expect(page.getByText('最初のノートを作りましょう', { exact: true })).toHaveCount(0); await page.getByRole('button', { name: retryName(entry), exact: true }).click(); if (entry === 'note') await expect(page.getByRole('region', { name: '閲覧モード' })).toContainText(note.prose); else await expect(page.getByRole('link', { name: note.title, exact: true })).toBeVisible(); expect(reads).toBe(2); await expect(page.getByRole('alert')).toHaveCount(0);
});

for (const entry of ['note', 'workspace-list', 'node-list'] as const) test(`${entry} leaving cancels the old read and deadline while current human inputs remain`, async ({ page, request, note }) => {
  await page.clock.install(); await page.clock.pauseAt(new Date()); const { node } = await (await request.post('/api/nodes', { data: { roadmapId: note.mapId, title: '次の学習項目', positionX: 320 } })).json(); const { document } = await (await request.post('/api/documents', { data: { title: '次の人間のノート', content: '次のノートの人間の言葉', nodeIds: [node.id] } })).json(); let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let held = false; let reads = 0;
  await page.route(/\/api\/documents(?:\/|\?)/, async route => { if (!matches(new URL(route.request().url()), entry, note)) return route.continue(); reads++; const response = await route.fetch(); held = true; await gate; await route.fulfill({ response }).catch(() => {}); });
  try {
    await page.goto(path(entry, note)); await expect.poll(() => held).toBe(true); const canceled = page.waitForEvent('requestfailed', { predicate: req => matches(new URL(req.url()), entry, note) });
    if (entry === 'node-list') { await expect(page.locator('.map-layout')).toHaveAttribute('aria-busy', 'false'); await page.getByLabel('新しいノート（必須）').fill('人間の次の入力'); await page.locator(`.react-flow__node[data-id="${node.id}"]`).click(); await expect(page.getByRole('link', { name: document.title, exact: true })).toBeVisible(); }
    else { await page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('link', { name: '学習マップ', exact: true }).click(); await page.getByRole('link', { name: note.mapTitle, exact: true }).click(); await expect(page.locator('.map-layout')).toHaveAttribute('aria-busy', 'false'); await page.locator(`.react-flow__node[data-id="${node.id}"]`).click(); await page.getByRole('link', { name: document.title, exact: true }).click(); await page.getByRole('button', { name: '編集', exact: true }).click(); await page.getByLabel('ノート名（必須）').fill('人間が考え直した次の名前'); }
    expect((await canceled).failure()?.errorText).toMatch(/abort|cancel/i); await page.clock.runFor(45000); expect(reads).toBe(1); await expect(page.getByRole('alert')).toHaveCount(0); release(); await page.unrouteAll({ behavior: 'wait' });
    if (entry === 'node-list') { await expect(page.getByRole('link', { name: note.title, exact: true })).toHaveCount(0); await expect(page.getByLabel('新しいノート（必須）')).toHaveValue('人間の次の入力'); } else await expect(page.getByLabel('ノート名（必須）')).toHaveValue('人間が考え直した次の名前');
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/documents/${document.id}`); }
});

test('a failed old document does not carry its error into a different document', async ({ page, request, note }) => {
  const { document } = await (await request.post('/api/documents', { data: { title: 'エラー後に開く別のノート', content: '別の保存済み本文', nodeIds: [note.nodeId] } })).json();
  try { await page.route(`**/api/documents/${note.documentId}?*`, route => route.fulfill({ status: 500, json: { error: 'private' } })); await page.goto(path('note', note)); await expect(page.getByRole('alert')).toBeVisible(); await page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('link', { name: 'ノート', exact: true }).click(); await page.getByRole('link', { name: document.title, exact: true }).click(); await expect(page.getByRole('region', { name: '閲覧モード' })).toContainText('別の保存済み本文'); await expect(page.getByRole('alert')).toHaveCount(0); }
  finally { await request.delete(`/api/documents/${document.id}`); }
});

for (const entry of ['note', 'workspace-list', 'node-list'] as const) test(`${entry} rejects a valid-looking other-workspace payload and retries the real scope`, async ({ page, note }) => {
  let reads = 0; await page.route(/\/api\/documents(?:\/|\?)/, async route => { if (!matches(new URL(route.request().url()), entry, note)) return route.continue(); reads++; const response = await route.fetch(); if (reads > 1) return route.fulfill({ response }); const payload = await response.json(); if (entry === 'note') payload.document.workspaceId = 'other'; else payload.documents.forEach((doc: { workspaceId: string }) => { doc.workspaceId = 'other'; }); return route.fulfill({ response, json: payload }); }); await page.goto(path(entry, note)); await expect(page.getByRole('alert')).toContainText('ノートを読み取れませんでした'); await expect(page.getByRole('region', { name: '閲覧モード' })).toHaveCount(0); if (entry === 'node-list') await expect(page.locator('.node-documents').getByRole('link')).toHaveCount(0); await page.getByRole('button', { name: retryName(entry), exact: true }).click(); if (entry === 'note') await expect(page.getByRole('region', { name: '閲覧モード' })).toContainText(note.prose); else await expect(page.getByRole('link', { name: note.title, exact: true })).toBeVisible(); expect(reads).toBe(2);
});
