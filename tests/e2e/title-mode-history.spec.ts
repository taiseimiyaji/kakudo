import { expect, test, type Locator, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

async function renameWithNativeControl(title: Locator, changed: string) {
  await title.click(); await title.press('ControlOrMeta+a'); await title.pressSequentially(changed);
  await expect(title).toHaveValue(changed); await title.press('ControlOrMeta+z');
  const undone = await title.inputValue(); expect(undone).not.toBe(changed);
  await title.press('ControlOrMeta+Shift+z'); await expect(title).toHaveValue(changed);
  return undone;
}
async function assertReadTitleExcluded(page: Page, title: Locator) {
  await expect(title).toBeHidden(); await expect(page.getByRole('textbox', { name: 'ノート名（必須）', exact: true })).toHaveCount(0);
  const cdp = await page.context().newCDPSession(page);
  try {
    const tree = await cdp.send('Accessibility.getFullAXTree');
    expect(tree.nodes.filter(n => !n.ignored && n.role?.value === 'textbox' && n.name?.value === 'ノート名（必須）')).toEqual([]);
  } finally { await cdp.detach(); }
  await page.getByRole('button', { name: '編集', exact: true }).focus();
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => !!document.activeElement?.closest('.document-title'))).toBe(false); }
}

for (const width of [390, 1440]) test(`title native history and selection survive modes while hidden from keyboard and AX at ${width}`, async ({ page, request }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  const body = '# 人間が理解を書く\n\n' + ('資料と引用を分け、自分の言葉で本文を書く。\n\n').repeat(50);
  const { document } = await (await request.post('/api/documents', { data: { title: `Title before ${width}`, content: body } })).json(); const path = `/api/documents/${document.id}`;
  const before = await (await request.get(path)).json(); const writes: Array<{ title: string; content: string }> = []; let otherWrites = 0; const pageErrors: string[] = [];
  page.on('pageerror', e => pageErrors.push(e.message)); page.on('request', r => { if (new URL(r.url()).pathname === path && r.method() === 'PUT') writes.push(r.postDataJSON()); if (new URL(r.url()).pathname.startsWith(path) && ['POST', 'PATCH'].includes(r.method())) otherWrites++; });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`); await page.getByRole('button', { name: '編集', exact: true }).click();
    const title = page.getByLabel('ノート名（必須）'); const editor = page.getByRole('textbox', { name: 'Markdown本文' }); const titleDOM = await title.elementHandle(); const bodyDOM = await editor.elementHandle(); const changed = `Human renamed ${width}`;
    const control = await renameWithNativeControl(title, changed);
    await expect.poll(async () => (await (await request.get(path)).json()).document.title).toBe(changed); await expect(page.locator('.save-state')).toHaveText('保存済み'); const saved = await (await request.get(path)).json();
    await title.press('ControlOrMeta+a'); const selection = await title.evaluate(e => [(e as HTMLTextAreaElement).selectionStart, (e as HTMLTextAreaElement).selectionEnd]); const count = writes.length;
    await page.getByRole('button', { name: '閲覧', exact: true }).click(); await expect(page.locator('.note-reading-title')).toHaveText(changed); await assertReadTitleExcluded(page, title);
    await page.screenshot({ path: info.outputPath('read-title-hidden.png') });
    await page.getByRole('button', { name: '編集', exact: true }).click(); await expect(editor).toBeFocused();
    const restoredSelection = await title.evaluate(e => [(e as HTMLTextAreaElement).selectionStart, (e as HTMLTextAreaElement).selectionEnd]);
    await page.waitForTimeout(2200); expect(writes).toHaveLength(count); expect((await (await request.get(path)).json())).toEqual(saved);
    await title.click(); await title.press('ControlOrMeta+z'); await expect(title).toHaveValue(control);
    expect(await title.evaluate((e, old) => e === old, titleDOM)).toBe(true); expect(await editor.evaluate((e, old) => e === old, bodyDOM)).toBe(true); expect(restoredSelection).toEqual(selection);
    await expect.poll(async () => (await (await request.get(path)).json()).document.title).toBe(control); await expect(page.locator('.save-state')).toHaveText('保存済み');
    await title.press('ControlOrMeta+Shift+z'); await expect(title).toHaveValue(changed); await expect.poll(async () => (await (await request.get(path)).json()).document.title).toBe(changed); await expect(page.locator('.save-state')).toHaveText('保存済み');
    const final = await (await request.get(path)).json(); expect(final.content).toBe(body); expect(final.contentHash).toBe(before.contentHash); expect(final.document.currentRevisionId).toBe(before.document.currentRevisionId); expect(final.nodeIds).toEqual(before.nodeIds); expect(otherWrites).toBe(0); expect(writes.every(w => w.content === body)).toBe(true); expect(pageErrors).toEqual([]);
    await writeFile(info.outputPath('audit.json'), JSON.stringify({ width, nativeUndoControl: control, sameTitleAndBodyDOM: true, selectionPreserved: true, readTitleHiddenFromRolesAndPublicCDPAX: true, eightNativeTabsExcludeHiddenTitle: true, editReturnsBodyFocus: true, modeSwitchWriteZero: true, undoRedoUseOrdinaryAutosave: true, fullBodyHashRevisionNodesUnchanged: true, otherWrites, pageErrors, normalBrowserClock: true }, null, 2));
  } finally { await request.delete(path); }
});

test('known save rejection retains title history through modes and deliberate retry without changing quote or goal context', async ({ page, request }, info) => {
  await page.setViewportSize({ width: 390, height: 1000 }); await page.clock.install(); await page.clock.pauseAt(new Date());
  const { roadmap } = await (await request.post('/api/roadmaps', { data: { title: 'Human title history context' } })).json();
  const objective = '自分の言葉で認証と認可の違いを説明する'; const { node } = await (await request.post('/api/nodes', { data: { roadmapId: roadmap.id, title: '人間が関連付けた項目', learningObjectives: [objective] } })).json();
  const body = '自分の理解を書く。'; const { document } = await (await request.post('/api/documents', { data: { title: 'Original title', content: body, nodeIds: [node.id] } })).json(); const path = `/api/documents/${document.id}`; const initial = await (await request.get(path)).json();
  const quoteResponse = await request.post(`${path}/quotes`, { data: { text: '人間が選んだ引用', sourceUrl: 'https://example.com/owned-source', content: body, title: initial.document.title, from: body.length, to: body.length, baseHash: initial.contentHash, baseWriteId: initial.document.lastWriteId } }); expect(quoteResponse.status()).toBe(201); const { quoteId } = await quoteResponse.json(); const before = await (await request.get(path)).json();
  const writes: Array<{ status: number; title: string; content: string; baseHash: string; baseWriteId: string }> = []; let fail = true; let otherWrites = 0;
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith(path) && ['POST', 'PATCH'].includes(r.method()) && !r.url().includes('/reviews')) otherWrites++; });
  await page.route(`**${path}?*`, async route => {
    if (route.request().method() !== 'PUT') return route.continue(); const payload = route.request().postDataJSON();
    if (fail) { fail = false; writes.push({ ...payload, status: 400 }); return route.fulfill({ status: 400, json: { error: 'Controlled known rejection before server write' } }); }
    const response = await route.fetch(); writes.push({ ...payload, status: response.status() }); await route.fulfill({ response });
  });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`); await page.getByRole('button', { name: '編集', exact: true }).click(); const title = page.getByLabel('ノート名（必須）'); const editor = page.getByRole('textbox', { name: 'Markdown本文' }); const identity = await title.elementHandle(); const changed = 'Human renamed after rejection'; const control = await renameWithNativeControl(title, changed);
    await title.press('ControlOrMeta+s'); await expect(page.locator('.save-state')).toHaveText('保存できませんでした'); expect((await (await request.get(path)).json())).toEqual(before);
    await title.press('ControlOrMeta+a'); const selection = await title.evaluate(e => [(e as HTMLTextAreaElement).selectionStart, (e as HTMLTextAreaElement).selectionEnd]);
    await page.getByRole('button', { name: '閲覧', exact: true }).click(); await expect(title).toBeHidden(); await page.getByRole('button', { name: '編集', exact: true }).click(); await expect(editor).toBeFocused();
    expect(await title.evaluate((e, old) => e === old, identity)).toBe(true); expect(await title.evaluate(e => [(e as HTMLTextAreaElement).selectionStart, (e as HTMLTextAreaElement).selectionEnd])).toEqual(selection);
    await title.click(); await title.press('ControlOrMeta+z'); await expect(title).toHaveValue(control); await page.clock.runFor(5000); expect(writes).toHaveLength(1); await expect(page.locator('.save-state')).toHaveText('保存できませんでした'); expect((await (await request.get(path)).json())).toEqual(before);
    await page.getByRole('button', { name: '保存を再試行', exact: true }).click(); await expect(page.locator('.save-state')).toHaveText('保存済み'); expect(writes[1].baseHash).toBe(before.contentHash); expect(writes[1].baseWriteId).toBe(before.document.lastWriteId); const retried = await (await request.get(path)).json(); expect(retried.document.title).toBe(control);
    await title.click(); await title.press('ControlOrMeta+Shift+z'); await expect(title).toHaveValue(changed); await page.clock.runFor(1000); await expect(page.locator('.save-state')).toHaveText('保存済み'); expect(writes[2].baseWriteId).toBe(retried.document.lastWriteId);
    const final = await (await request.get(path)).json(); expect(final.content).toBe(before.content); expect(final.contentHash).toBe(before.contentHash); expect(final.document.currentRevisionId).toBe(before.document.currentRevisionId); expect(final.nodes).toEqual(before.nodes); expect(otherWrites).toBe(0); expect(writes.map(w => w.status)).toEqual([400, 200, 200]);
    await page.locator('[data-note-panel=review] > summary').click(); const panel = page.getByRole('region', { name: 'レビュー', exact: true }); await panel.getByRole('button', { name: '全体を確認', exact: true }).click();
    await expect.poll(async () => { const history = await (await request.get(`${path}/reviews`)).json(); return history.reviews[0] ? (await (await request.get(`/api/reviews/${history.reviews[0].id}`)).json()).run.status : 'MISSING'; }).toBe('COMPLETED');
    await page.clock.runFor(1000); await expect(panel.getByLabel('レビューの状態')).toContainText('完了'); const history = await (await request.get(`${path}/reviews`)).json(); const detail = await (await request.get(`/api/reviews/${history.reviews[0].id}`)).json(); expect(detail.run.provider).toBe('mock'); expect(detail.revision.contentSnapshot).toBe(before.content); expect(detail.run.quoteSnapshot.map((q: { id: string }) => q.id)).toContain(quoteId); expect(detail.run.objectives.map((o: { text: string }) => o.text)).toContain(objective);
    await writeFile(info.outputPath('audit.json'), JSON.stringify({ controlledClock: true, known400BeforeWrite: true, titleHistorySelectionSurviveFailureAndModes: true, failedAutosaveStillPaused: true, explicitRetryUsesOriginalBase: true, nativeRedoUsesResumedSaveBase: true, registeredQuoteAndHumanGoalRemainInMockRevision: true, otherWrites, statuses: writes.map(w => w.status) }, null, 2));
  } finally { await page.unrouteAll({ behavior: 'wait' }); await request.delete(path); await request.delete(`/api/roadmaps/${roadmap.id}`); }
});

test('different notes and same-note revisit start a fresh title DOM and never inherit title history', async ({ page, request }, info) => {
  const { document: a } = await (await request.post('/api/documents', { data: { title: 'History note A', content: 'A human body.' } })).json(); const { document: b } = await (await request.post('/api/documents', { data: { title: 'History note B', content: 'B human body.' } })).json(); const aPath = `/api/documents/${a.id}`; const bPath = `/api/documents/${b.id}`;
  const beforeB = await (await request.get(bPath)).json(); let writes = 0; page.on('request', r => { if ([aPath, bPath].includes(new URL(r.url()).pathname) && r.method() === 'PUT') writes++; });
  async function list() { await page.locator('.note-navigation > summary').click(); await page.locator('.note-navigation a[href="/workspaces/default/documents"]').click(); await expect(page).toHaveURL(/\/workspaces\/default\/documents$/); }
  try {
    await page.goto('/workspaces/default/documents'); await page.getByRole('link', { name: 'History note A', exact: true }).click(); await page.getByRole('button', { name: '編集', exact: true }).click(); const title = page.getByLabel('ノート名（必須）'); const old = await title.elementHandle(); const changed = 'Human name persisted on A'; await renameWithNativeControl(title, changed);
    await expect.poll(async () => (await (await request.get(aPath)).json()).document.title).toBe(changed); await expect(page.locator('.save-state')).toHaveText('保存済み'); const savedA = await (await request.get(aPath)).json(); const count = writes;
    await list(); await page.getByRole('link', { name: 'History note B', exact: true }).click(); await page.getByRole('button', { name: '編集', exact: true }).click(); expect(await title.evaluate((e, old) => e === old, old)).toBe(false); const bDOM = await title.elementHandle(); await title.click(); await title.press('ControlOrMeta+z'); await expect(title).toHaveValue('History note B'); await page.waitForTimeout(1200); expect((await (await request.get(bPath)).json())).toEqual(beforeB); expect(writes).toBe(count);
    await list(); await page.getByRole('link', { name: changed, exact: true }).click(); await page.getByRole('button', { name: '編集', exact: true }).click(); expect(await title.evaluate((e, old) => e === old, old)).toBe(false); expect(await title.evaluate((e, old) => e === old, bDOM)).toBe(false); await title.click(); await title.press('ControlOrMeta+z'); await expect(title).toHaveValue(changed); await page.waitForTimeout(1200); expect((await (await request.get(aPath)).json())).toEqual(savedA); expect(writes).toBe(count);
    await writeFile(info.outputPath('audit.json'), JSON.stringify({ normalBrowserClock: true, actualSPANoteListNavigation: true, distinctNoteHasFreshTitleDOMAndNoInheritedUndo: true, revisitedNoteHasFreshTitleDOMAndNoPriorUndo: true, savedBodiesTitlesAndBasesRemainEqual: true, navigationAndFreshUndoWriteZero: true }, null, 2));
  } finally { await request.delete(aPath); await request.delete(bPath); }
});
