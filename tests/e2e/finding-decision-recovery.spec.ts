import { openNotePanels } from "./manual-note-fixture";
import { test as base, expect } from './manual-note-fixture';

type Note = { id: string; revisionId: string; runId: string; findingId: string; content: string };
const test = base.extend<{ note: Note }>({ note: async ({ request }, use) => {
  const content = 'Cookieを使うのでSession認証は安全である。';
  const { document } = await (await request.post('/api/documents', { data: { title: '人間の指摘判断', content } })).json();
  try {
    const { run } = await (await request.post(`/api/documents/${document.id}/reviews`, { data: { type: 'LOGIC', revisionId: document.currentRevisionId } })).json();
    await expect.poll(async () => (await (await request.get(`/api/reviews/${run.id}`)).json()).run.status).toBe('COMPLETED');
    const detail = await (await request.get(`/api/reviews/${run.id}`)).json();
    await use({ id: document.id, revisionId: document.currentRevisionId, runId: run.id, findingId: detail.findings[0].id, content });
  } finally { await request.delete(`/api/documents/${document.id}`); }
} });

for (const [previous, desired, button] of [['OPEN', 'RESOLVED', '解決済みにする'], ['OPEN', 'DISMISSED', '見送る'], ['RESOLVED', 'OPEN', '未対応に戻す']] as const) test(`committed ${desired} lost reply requires read and acknowledgment without rewriting human drafts`, async ({ page, request, note }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  if (previous !== 'OPEN') await request.patch(`/api/findings/${note.findingId}`, { data: { status: previous } });
  let patches = 0; let posts = 0; let recoveryReads = 0;
  await page.route(`**/api/findings/${note.findingId}?*`, async (route) => { patches++; const response = await route.fetch(); expect(response.status()).toBe(200); if (patches === 1) { expect((await response.json()).finding.status).toBe(desired); return route.abort(); } return route.fulfill({ response }); });
  page.on('request', (req) => { if (req.method() === 'POST' && req.url().includes('/reviews')) posts++; });
  await page.goto(`/workspaces/default/documents/${note.id}`); await openNotePanels(page);
  const panel = page.getByRole('region', { name: 'レビュー', exact: true }); const row = panel.getByRole('article', { name: '論理の指摘', exact: true }); await expect(row).toHaveAttribute('data-status', previous);
  await row.getByRole('button', { name: button, exact: true }).click(); const recovery = panel.getByRole('region', { name: '指摘の更新結果の確認', exact: true }); await expect(recovery).toBeVisible(); await expect(recovery).toContainText(note.content); await expect(recovery).toContainText(note.revisionId);
  await expect(row.getByRole('button', { name: button, exact: true })).toBeDisabled(); let confirmations = 0;
  page.on('dialog', async (dialog) => { confirmations++; await dialog.dismiss(); }); await page.getByRole('link', { name: 'ホーム', exact: true }).click(); expect(confirmations).toBe(1); await expect(page).toHaveURL(new RegExp(`/documents/${note.id}$`));
  await page.getByRole('button', { name: '編集', exact: true }).click(); const editor = page.getByRole('textbox', { name: 'Markdown本文' }); await editor.click(); await editor.press('ControlOrMeta+End'); await editor.pressSequentially('条件を人間が追記する。');
  await page.getByLabel('ノート名（必須）').fill('人間が未保存の名前'); await page.getByLabel('資料URL（必須）').fill('https://example.com/my-evidence'); await page.getByLabel('資料名（任意）').fill('未登録の資料');
  await page.route(`**/api/reviews/${note.runId}?*`, (route) => { recoveryReads++; return route.continue(); });
  await recovery.getByRole('button', { name: '指摘の現在状態を確認', exact: true }).click(); await expect(recovery.getByText(/確認した現在の状態:/)).toBeVisible(); await expect(row).toHaveAttribute('data-status', desired); await expect(row.getByRole('button', { name: '見送る', exact: true })).toBeDisabled(); expect(patches).toBe(1); expect(posts).toBe(0); expect(recoveryReads).toBeGreaterThanOrEqual(1);
  const allow = recovery.getByRole('button', { name: '現在の状態を確認しました。判断を続ける', exact: true }); await allow.click(); await expect(recovery).toBeVisible(); expect(patches).toBe(1);
  page.removeAllListeners('dialog'); page.once('dialog', (dialog) => dialog.accept()); await allow.click(); await expect(recovery).toHaveCount(0); expect(patches).toBe(1); expect(posts).toBe(0);
  const nextStatus = desired === 'DISMISSED' ? 'RESOLVED' : 'DISMISSED'; await row.getByRole('button', { name: nextStatus === 'RESOLVED' ? '解決済みにする' : '見送る', exact: true }).click(); await expect(row).toHaveAttribute('data-status', nextStatus); expect(patches).toBe(2); expect(posts).toBe(0);
  await expect(editor).toContainText(note.content + '条件を人間が追記する。'); await expect(page.getByLabel('ノート名（必須）')).toHaveValue('人間が未保存の名前'); await expect(page.getByLabel('資料名（任意）')).toHaveValue('未登録の資料'); expect((await (await request.get(`/api/documents/${note.id}`)).json()).content).toBe(note.content);
});

for (const failure of ['server', 'schema'] as const) test(`${failure} reply after commit keeps decision uncertain and never automatically resends`, async ({ page, note }) => {
  let patches = 0;
  await page.route(`**/api/findings/${note.findingId}?*`, async (route) => { patches++; await route.fetch(); return route.fulfill(failure === 'server' ? { status: 503, json: { secret: 'internal' } } : { status: 200, json: { finding: { id: 'wrong', reviewRunId: note.runId, status: 'RESOLVED' } } }); });
  await page.goto(`/workspaces/default/documents/${note.id}`); await openNotePanels(page); const panel = page.getByRole('region', { name: 'レビュー', exact: true }); const resolve = panel.getByRole('button', { name: '解決済みにする', exact: true }); await resolve.click(); await expect(panel.getByRole('region', { name: '指摘の更新結果の確認', exact: true })).toBeVisible(); await expect(resolve).toBeDisabled(); expect(patches).toBe(1); await expect(panel).not.toContainText('internal');
});

test('failed, missing and mismatched recovery reads never allow another decision', async ({ page, note }) => {
  await page.route(`**/api/findings/${note.findingId}?*`, (route) => route.abort()); await page.goto(`/workspaces/default/documents/${note.id}`); await openNotePanels(page);
  const panel = page.getByRole('region', { name: 'レビュー', exact: true }); await panel.getByRole('button', { name: '解決済みにする', exact: true }).click(); const recovery = panel.getByRole('region', { name: '指摘の更新結果の確認', exact: true }); await expect(recovery).toBeVisible();
  for (const kind of ['failed', 'missing', 'mismatch']) {
    await page.route(`**/api/reviews/${note.runId}?*`, async (route) => { if (kind === 'failed') return route.fulfill({ status: 503, json: { secret: 'internal' } }); const response = await route.fetch(); const detail = await response.json(); if (kind === 'missing') detail.findings = []; else detail.run.documentId = 'other'; await route.fulfill({ response, json: detail }); });
    await recovery.getByRole('button', { name: '指摘の現在状態を確認', exact: true }).click(); await expect(recovery).toContainText('現在状態を取得できませんでした'); await expect(recovery.getByRole('button', { name: '現在の状態を確認しました。判断を続ける', exact: true })).toHaveCount(0); await expect(panel.getByRole('button', { name: '見送る', exact: true })).toBeDisabled(); await page.unroute(`**/api/reviews/${note.runId}?*`);
  }
  await recovery.getByRole('button', { name: '指摘の現在状態を確認', exact: true }).click(); await expect(recovery.getByText(/確認した現在の状態:/)).toContainText('未対応'); await expect(recovery).not.toContainText('現在状態を取得できませんでした'); await expect(panel.getByRole('button', { name: '見送る', exact: true })).toBeDisabled();
});

test('known HTTP rejection leaves normal decisions retryable without uncertainty', async ({ page, request, note }) => {
  let patches = 0;
  await page.route(`**/api/findings/${note.findingId}?*`, (route) => { patches++; return route.fulfill({ status: 403, json: { secret: 'internal' } }); });
  await page.goto(`/workspaces/default/documents/${note.id}`); await openNotePanels(page); const panel = page.getByRole('region', { name: 'レビュー', exact: true }); const resolve = panel.getByRole('button', { name: '解決済みにする', exact: true }); await resolve.click(); await expect(panel.getByRole('alert')).toContainText('この操作は許可されていません'); await expect(resolve).toBeEnabled(); await expect(panel.getByRole('region', { name: '指摘の更新結果の確認', exact: true })).toHaveCount(0); expect(patches).toBe(1); expect((await (await request.get(`/api/reviews/${note.runId}`)).json()).findings[0].status).toBe('OPEN');
});

test('reading the original finding after a history switch does not overwrite the selected review', async ({ page, request, note }) => {
  const { run: other } = await (await request.post(`/api/documents/${note.id}/reviews`, { data: { type: 'LOGIC', revisionId: note.revisionId } })).json(); await expect.poll(async () => (await (await request.get(`/api/reviews/${other.id}`)).json()).run.status).toBe('COMPLETED');
  await page.goto(`/workspaces/default/documents/${note.id}`); await openNotePanels(page); const panel = page.getByRole('region', { name: 'レビュー', exact: true }); await expect(panel.getByLabel('レビュー履歴')).toHaveValue(other.id); await panel.getByLabel('レビュー履歴').selectOption(note.runId); await expect(panel.getByRole('article', { name: '論理の指摘', exact: true })).toHaveAttribute('data-status', 'OPEN');
  await page.route(`**/api/findings/${note.findingId}?*`, async (route) => { await route.fetch(); await route.abort(); }); await panel.getByRole('button', { name: '解決済みにする', exact: true }).click(); const recovery = panel.getByRole('region', { name: '指摘の更新結果の確認', exact: true }); await expect(recovery).toBeVisible();
  await panel.getByLabel('レビュー履歴').selectOption(other.id); await expect(panel.getByRole('article', { name: '論理の指摘', exact: true })).toHaveAttribute('data-status', 'OPEN'); await recovery.getByRole('button', { name: '指摘の現在状態を確認', exact: true }).click(); await expect(recovery.getByText(/確認した現在の状態:/)).toContainText('解決済み'); await expect(panel.getByLabel('レビュー履歴')).toHaveValue(other.id); await expect(panel.getByRole('article', { name: '論理の指摘', exact: true })).toHaveAttribute('data-status', 'OPEN'); await expect(panel.getByRole('button', { name: '見送る', exact: true })).toBeDisabled();
});

test('old visit recovery cannot update a new unknown decision on returning to the same note', async ({ page, request, note }) => {
  await page.route(`**/api/findings/${note.findingId}?*`, (route) => route.abort()); await page.goto(`/workspaces/default/documents/${note.id}`); await openNotePanels(page); const panel = page.getByRole('region', { name: 'レビュー', exact: true }); await panel.getByRole('button', { name: '解決済みにする', exact: true }).click(); const recovery = panel.getByRole('region', { name: '指摘の更新結果の確認', exact: true }); await expect(recovery).toBeVisible();
  const old = await (await request.get(`/api/reviews/${note.runId}`)).json(); old.findings[0].status = 'DISMISSED'; let release!: () => void; let reached!: () => void; const held = new Promise<void>((resolve) => { release = resolve; }); const started = new Promise<void>((resolve) => { reached = resolve; }); let first = true;
  await page.route(`**/api/reviews/${note.runId}?*`, async (route) => { if (!first) return route.continue(); first = false; reached(); await held; await route.fulfill({ status: 200, json: old }); });
  await recovery.getByRole('button', { name: '指摘の現在状態を確認', exact: true }).click(); await started; page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('link', { name: 'ホーム', exact: true }).click(); await expect(page).toHaveURL(/\/workspaces\/default$/);
  await page.goto(`/workspaces/default/documents/${note.id}`); await openNotePanels(page); await panel.getByRole('button', { name: '見送る', exact: true }).click(); await expect(recovery).toBeVisible(); await expect(recovery).toContainText('「見送り」への更新結果は不明'); release(); await page.unrouteAll({ behavior: 'wait' }); await expect(recovery.getByText(/確認した現在の状態:/)).toHaveCount(0); await expect(recovery.getByRole('button', { name: '現在の状態を確認しました。判断を続ける', exact: true })).toHaveCount(0); await expect(panel.getByRole('article', { name: '論理の指摘', exact: true })).toHaveAttribute('data-status', 'OPEN');
});

test('late successful PATCH from an old visit cannot release a newer unknown decision', async ({ page, note }) => {
  let release!: () => void; let reached!: () => void; const held = new Promise<void>((resolve) => { release = resolve; }); const started = new Promise<void>((resolve) => { reached = resolve; }); let patches = 0;
  await page.route(`**/api/findings/${note.findingId}?*`, async (route) => { patches++; if (patches > 1) return route.abort(); const response = await route.fetch(); expect(response.status()).toBe(200); reached(); await held; await route.fulfill({ response }); });
  try {
    await page.goto(`/workspaces/default/documents/${note.id}`); await openNotePanels(page); const panel = page.getByRole('region', { name: 'レビュー', exact: true }); await panel.getByRole('button', { name: '解決済みにする', exact: true }).click(); await started; await page.getByRole('link', { name: 'ホーム', exact: true }).click(); await expect(page).toHaveURL(/\/workspaces\/default$/);
    await page.goto(`/workspaces/default/documents/${note.id}`); await openNotePanels(page); await expect(panel.getByRole('article', { name: '論理の指摘', exact: true })).toHaveAttribute('data-status', 'RESOLVED'); await panel.getByRole('button', { name: '未対応に戻す', exact: true }).click(); const recovery = panel.getByRole('region', { name: '指摘の更新結果の確認', exact: true }); await expect(recovery).toContainText('「未対応」への更新結果は不明'); release(); await page.unrouteAll({ behavior: 'wait' }); await expect(recovery).toContainText('「未対応」への更新結果は不明'); await expect(panel.getByRole('button', { name: '見送る', exact: true })).toBeDisabled(); expect(patches).toBe(2);
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
});

test('admission and finding uncertainty retain independent locks and acknowledgments', async ({ page, note }) => {
  let patches = 0; let posts = 0;
  await page.route(`**/api/findings/${note.findingId}?*`, (route) => { patches++; return route.abort(); }); await page.route(`**/api/documents/${note.id}/reviews?*`, (route) => { if (route.request().method() !== 'POST') return route.continue(); posts++; return route.abort(); });
  await page.goto(`/workspaces/default/documents/${note.id}`); await openNotePanels(page); const panel = page.getByRole('region', { name: 'レビュー', exact: true }); const start = panel.getByRole('button', { name: '論理を確認', exact: true }); await expect(start).toBeEnabled(); await start.click(); const admission = panel.getByRole('region', { name: 'レビューの受付結果の確認', exact: true }); await expect(admission).toBeVisible(); await panel.getByRole('button', { name: '解決済みにする', exact: true }).click(); const decision = panel.getByRole('region', { name: '指摘の更新結果の確認', exact: true }); await expect(decision).toBeVisible(); await expect(start).toBeDisabled();
  await decision.getByRole('button', { name: '指摘の現在状態を確認', exact: true }).click(); await expect(decision.getByRole('button', { name: '現在の状態を確認しました。判断を続ける', exact: true })).toBeVisible(); page.once('dialog', (dialog) => dialog.accept()); await decision.getByRole('button', { name: '現在の状態を確認しました。判断を続ける', exact: true }).click(); await expect(decision).toHaveCount(0); await expect(admission).toBeVisible(); await expect(start).toBeDisabled(); await expect(panel.getByRole('button', { name: '見送る', exact: true })).toBeEnabled(); expect(patches).toBe(1); expect(posts).toBe(1);
  await admission.getByRole('button', { name: '受付済みのレビューを確認', exact: true }).click(); await expect(admission.getByText('該当する候補は見つかりませんでした。受付結果はまだ不明です。', { exact: true })).toBeVisible(); page.once('dialog', (dialog) => dialog.accept()); await admission.getByRole('button', { name: '履歴を確認しました。新しく開始', exact: true }).click(); await expect(admission).toHaveCount(0); await expect(start).toBeEnabled(); expect(patches).toBe(1); expect(posts).toBe(1);
});
