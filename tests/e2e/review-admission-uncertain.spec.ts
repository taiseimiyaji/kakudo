import { test, expect } from './manual-note-fixture';

const cases = [
  ['LOGIC', '論理を確認', 'abort'], ['COVERAGE', '学習目標を確認', 'invalid-json'], ['FULL', '全体を確認', 'wrong-document'], ['FACT_CHECK', '事実を確認', 'wrong-revision'], ['SOURCE', '出典を確認', 'invalid-schema'],
] as const;
for (const [type, button, loss] of cases) test(`uncertain ${type} admission opens the existing run after ${loss} without another POST`, async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 }); let documentId = ''; let posts = 0; let admittedId = '';
  const original = '人間が書いた理解。Cookieを使うのでSession認証は安全である。';
  try {
    const { document } = await (await request.post('/api/documents', { data: { title: `受付回復 ${type}`, content: original } })).json(); documentId = document.id;
    await page.route(`**/api/documents/${documentId}/reviews?*`, async (route) => {
      if (route.request().method() !== 'POST') return route.continue(); posts++;
      const response = await route.fetch(); expect(response.status()).toBe(202); const payload = await response.json(); admittedId = payload.run.id;
      await expect.poll(async () => (await (await request.get(`/api/reviews/${admittedId}`)).json()).run.status).toBe('COMPLETED');
      if (loss === 'abort') return route.abort();
      if (loss === 'invalid-json') return route.fulfill({ status: 202, contentType: 'application/json', body: 'secret-invalid-json' });
      if (loss === 'wrong-document') payload.run.documentId = 'other-document';
      if (loss === 'wrong-revision') payload.run.revisionId = 'other-revision';
      if (loss === 'invalid-schema') delete payload.run.id;
      return route.fulfill({ response, json: payload });
    });
    await page.goto(`/workspaces/default/documents/${documentId}`); const panel = page.getByRole('region', { name: 'レビュー', exact: true }); await panel.getByRole('button', { name: button, exact: true }).click();
    const recovery = panel.getByRole('region', { name: 'レビューの受付結果の確認', exact: true }); await expect(recovery.getByRole('alert')).toContainText('受付結果は不明');
    for (const name of cases.map((entry) => entry[1])) await expect(panel.getByRole('button', { name, exact: true })).toBeDisabled(); expect(posts).toBe(1);
    await page.getByRole('button', { name: '編集', exact: true }).click(); await page.getByLabel('ノート名（必須）').fill('保持する人間の名前');
    const editor = page.getByRole('textbox', { name: 'Markdown本文' }); await editor.click(); await editor.press('ControlOrMeta+End'); await editor.pressSequentially('人間が追記する。'); await page.getByLabel('資料URL（必須）').fill('https://example.com/admission-draft');
    await recovery.getByRole('button', { name: '受付済みのレビューを確認', exact: true }).click(); await expect(recovery.getByRole('button', { name: 'このレビューを確認', exact: true })).toHaveCount(1);
    await expect(recovery).toContainText('同じ受付要求の結果とは限りません'); await recovery.getByRole('button', { name: 'このレビューを確認', exact: true }).click();
    await expect(recovery).toHaveCount(0); await expect(panel.getByLabel('レビューの状態')).toContainText('完了'); await expect(panel.getByLabel('レビュー履歴')).toHaveValue(admittedId);
    await expect(editor).toContainText(original + '人間が追記する。'); await expect(page.getByLabel('ノート名（必須）')).toHaveValue('保持する人間の名前'); await expect(page.getByLabel('資料URL（必須）')).toHaveValue('https://example.com/admission-draft');
    const saved = await (await request.get(`/api/documents/${documentId}`)).json(); expect(saved.content).toBe(original); expect(saved.document.title).toBe(`受付回復 ${type}`); expect(posts).toBe(1);
    expect((await (await request.get(`/api/documents/${documentId}/reviews`)).json()).reviews).toHaveLength(1); await expect(panel).not.toContainText('secret');
  } finally { await page.unrouteAll({ behavior: 'wait' }); if (documentId) await request.delete(`/api/documents/${documentId}`); }
});

test('failed or absent recovery history keeps admission blocked until explicit risk acknowledgment', async ({ page, request }) => {
  const { document } = await (await request.post('/api/documents', { data: { title: '受付候補なし', content: '人間の本文。' } })).json(); let posts = 0; let reads = 0; let checking = false; let rejectRead = true;
  await page.route(`**/api/documents/${document.id}/reviews?*`, (route) => {
    if (route.request().method() === 'POST') { posts++; return route.abort(); }
    if (checking) { reads++; if (rejectRead) return route.fulfill({ status: 503, json: { secret: 'internal' } }); }
    return route.continue();
  });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`); const panel = page.getByRole('region', { name: 'レビュー', exact: true }); const start = panel.getByRole('button', { name: '論理を確認', exact: true }); await start.click();
    const recovery = panel.getByRole('region', { name: 'レビューの受付結果の確認', exact: true }); await expect(recovery).toBeVisible(); checking = true;
    await recovery.getByRole('button', { name: '受付済みのレビューを確認', exact: true }).click(); await expect(recovery.getByRole('alert').filter({ hasText: '履歴を取得できませんでした' })).toBeVisible();
    await expect(start).toBeDisabled(); await expect(recovery.getByRole('button', { name: '履歴を確認しました。新しく開始', exact: true })).toHaveCount(0); expect(posts).toBe(1);
    rejectRead = false; await recovery.getByRole('button', { name: '受付済みのレビューを確認', exact: true }).click(); await expect(recovery).toContainText('該当する候補は見つかりませんでした');
    page.once('dialog', (dialog) => dialog.dismiss()); await recovery.getByRole('button', { name: '履歴を確認しました。新しく開始', exact: true }).click(); await expect(start).toBeDisabled(); expect(posts).toBe(1);
    page.once('dialog', (dialog) => dialog.accept()); await recovery.getByRole('button', { name: '履歴を確認しました。新しく開始', exact: true }).click(); await expect(start).toBeEnabled(); expect(posts).toBe(1); expect(reads).toBe(2);
    await page.unroute(`**/api/documents/${document.id}/reviews?*`); await start.click(); await expect(panel.getByLabel('レビューの状態')).toContainText('完了');
    expect((await (await request.get(`/api/documents/${document.id}/reviews`)).json()).reviews).toHaveLength(1);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/documents/${document.id}`); }
});

test('recovery candidates exclude known history and other saved versions or types', async ({ page, request }) => {
  const { document } = await (await request.post('/api/documents', { data: { title: '受付候補の範囲', content: '人間の保存版。' } })).json(); const run = async (type: string, revisionId = document.currentRevisionId) => {
    const { run } = await (await request.post(`/api/documents/${document.id}/reviews`, { data: { revisionId, type } })).json(); await expect.poll(async () => (await (await request.get(`/api/reviews/${run.id}`)).json()).run.status).toBe('COMPLETED'); return run.id as string;
  };
  try {
    const known = await run('LOGIC'); await page.goto(`/workspaces/default/documents/${document.id}`); const panel = page.getByRole('region', { name: 'レビュー', exact: true }); await expect(panel.getByLabel('レビューの状態')).toContainText('完了');
    await page.route(`**/api/documents/${document.id}/reviews?*`, (route) => route.request().method() === 'POST' ? route.abort() : route.continue()); await panel.getByRole('button', { name: '論理を確認', exact: true }).click();
    const recovery = panel.getByRole('region', { name: 'レビューの受付結果の確認', exact: true }); await expect(recovery).toBeVisible();
    const first = await run('LOGIC'); const second = await run('LOGIC'); await run('COVERAGE');
    const latest = await (await request.get(`/api/documents/${document.id}`)).json(); const saved = await (await request.put(`/api/documents/${document.id}`, { data: { title: document.title, content: '別の保存版の本文。', baseHash: latest.contentHash, baseWriteId: latest.document.lastWriteId } })).json(); await run('LOGIC', saved.document.currentRevisionId);
    await recovery.getByRole('button', { name: '受付済みのレビューを確認', exact: true }).click(); await expect(recovery.getByRole('button', { name: 'このレビューを確認', exact: true })).toHaveCount(2);
    await expect(recovery).not.toContainText(known.slice(0, 8)); await expect(recovery).toContainText(first.slice(0, 8)); await expect(recovery).toContainText(second.slice(0, 8));
    await expect(panel.getByRole('button', { name: '論理を確認', exact: true })).toBeDisabled();
  } finally { await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/documents/${document.id}`); }
});

test('a late recovery read from an earlier visit cannot change a new uncertain admission', async ({ page, request }) => {
  const { document } = await (await request.post('/api/documents', { data: { title: '受付の古い応答', content: '人間の本文。' } })).json(); let posts = 0; let holdRead = false; let held = false; let delivered = false; let latestId = '';
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/documents/${document.id}/reviews?*`, async (route) => {
    if (route.request().method() === 'POST') {
      posts++; const response = await route.fetch(); const data = await response.json(); latestId = data.run.id; await expect.poll(async () => (await (await request.get(`/api/reviews/${latestId}`)).json()).run.status).toBe('COMPLETED'); return route.abort();
    }
    if (holdRead) { holdRead = false; const response = await route.fetch(); held = true; await gate; await route.fulfill({ response }); delivered = true; return; }
    await route.continue();
  });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`); const panel = page.getByRole('region', { name: 'レビュー', exact: true }); const start = panel.getByRole('button', { name: '論理を確認', exact: true }); const recovery = panel.getByRole('region', { name: 'レビューの受付結果の確認', exact: true });
    await start.click(); await expect(recovery).toBeVisible(); holdRead = true; await recovery.getByRole('button', { name: '受付済みのレビューを確認', exact: true }).click(); await expect.poll(() => held).toBe(true);
    page.once('dialog', (dialog) => dialog.accept()); await page.getByRole('link', { name: 'ホーム', exact: true }).click(); await expect(page).toHaveURL(/\/workspaces\/default$/);
    await page.goBack(); await expect(page).toHaveURL(new RegExp(`/documents/${document.id}$`)); await expect(panel.getByLabel('レビューの状態')).toContainText('完了'); await start.click(); await expect(recovery).toBeVisible(); expect(posts).toBe(2);
    release(); await expect.poll(() => delivered).toBe(true); await page.waitForTimeout(150); await expect(recovery).toBeVisible(); await expect(recovery.getByRole('button', { name: 'このレビューを確認', exact: true })).toHaveCount(0);
    await recovery.getByRole('button', { name: '受付済みのレビューを確認', exact: true }).click(); await expect(recovery.getByRole('button', { name: 'このレビューを確認', exact: true })).toHaveCount(1); await expect(recovery).toContainText(latestId.slice(0, 8));
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/documents/${document.id}`); }
});
