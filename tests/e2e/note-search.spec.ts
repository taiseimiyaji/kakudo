import { expect, test, type Locator, type Page } from '@playwright/test';
import type { EditorView } from '@codemirror/view';
import { writeFile } from 'node:fs/promises';
import { quoteMarkdown } from '../../shared/quote';

type EditorDOM = HTMLElement & { cmTile: { root: { view: EditorView } } };
async function position(editor: Locator) {
  return editor.evaluate(e => {
    const view = (e as EditorDOM).cmTile.root.view, range = view.state.selection.main;
    return { from: range.from, to: range.to, text: view.state.sliceDoc(range.from, range.to), content: view.state.sliceDoc() };
  });
}
async function expectSelection(editor: Locator, from: number, text: string) {
  await expect.poll(() => position(editor)).toMatchObject({ from, to: from + text.length, text });
}
async function scaleWritingText(page: Page, enlarged: boolean) {
  await page.evaluate(large => {
    document.documentElement.style.setProperty('--text-base', large ? '28px' : '');
    document.documentElement.style.setProperty('--text-sm', large ? '26px' : '');
    document.querySelector<HTMLElement>('.cm-scroller')!.style.fontSize = large ? '34px' : '';
  }, enlarged);
  if (enlarged) await expect.poll(() => page.evaluate(() => ({
    body: getComputedStyle(document.querySelector('.cm-scroller')!).fontSize,
    control: getComputedStyle(document.querySelector('.note-search button')!).fontSize,
  }))).toEqual({ body: '34px', control: '26px' });
}
async function visibleMatchAndControls(page: Page, editor: Locator) {
  await expect.poll(() => editor.evaluate(e => {
    const view = (e as EditorDOM).cmTile.root.view;
    const rect = view.coordsAtPos(view.state.selection.main.head);
    const panel = document.querySelector('.note-search')!.getBoundingClientRect();
    const header = document.querySelector('.note-header')!.getBoundingClientRect();
    return !!rect && rect.top >= panel.bottom && rect.bottom <= innerHeight && panel.top >= header.bottom && panel.bottom < innerHeight && document.documentElement.scrollWidth <= innerWidth;
  })).toBe(true);
  await expect(page.getByLabel('本文の検索語')).toBeFocused();
}

for (const width of [390, 1440]) test(`long full-source search selects hidden matches and retains quote Undo at ${width}`, async ({ page, context, request }, info) => {
  await page.setViewportSize({ width, height: 1000 }); await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const query = 'find.[human]', firstToken = query.toUpperCase(); const objective = '自分の言葉で根拠と考察を区別する';
  const { roadmap } = await (await request.post('/api/roadmaps', { data: { title: `Search context ${width}` } })).json();
  const { node } = await (await request.post('/api/nodes', { data: { roadmapId: roadmap.id, title: '人間の学習項目', learningObjectives: [objective] } })).json();
  const body = '# 人間の長いノート\r\n\r\n' + Array.from({ length: 220 }, (_, i) => `段落${i}: 🧑‍💻${'自分の理解を言葉にし、資料と考察を区別する。'.repeat(5)}${i === 50 ? firstToken : i === 190 ? query : ''}\r\n\r\n`).join('');
  const { document } = await (await request.post('/api/documents', { data: { title: `Human search note ${width}`, content: body, nodeIds: [node.id] } })).json(); const path = `/api/documents/${document.id}`;
  const before = await (await request.get(path)).json(); let puts = 0; const quotePosts: Array<{ from: number; to: number }> = []; const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { const p = new URL(r.url()).pathname; if (p === path && r.method() === 'PUT') puts++; if (p === `${path}/quotes` && r.method() === 'POST') quotePosts.push(r.postDataJSON()); });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`); await page.getByRole('button', { name: '編集', exact: true }).click(); const editor = page.getByRole('textbox', { name: 'Markdown本文' });
    await editor.press('ControlOrMeta+Home'); expect((await editor.textContent())!.includes(query)).toBe(false); const initial = await position(editor); const identity = await editor.elementHandle();
    await expect(page.getByRole('button', { name: '本文を検索', exact: true })).toBeVisible({ timeout: 1500 }); await page.getByRole('button', { name: '本文を検索', exact: true }).click();
    const panel = page.getByRole('search', { name: '本文内検索', exact: true }); const input = panel.getByLabel('本文の検索語'); await expect(input).toBeFocused(); await input.fill(query); await expect(panel.getByLabel('本文の検索結果')).toContainText('一致あり'); expect(await position(editor)).toEqual(initial);
    const normalized = body.replaceAll('\r\n', '\n'), first = normalized.indexOf(firstToken), last = normalized.lastIndexOf(query);
    await input.press('Enter'); await expectSelection(editor, first, firstToken); await visibleMatchAndControls(page, editor);
    await input.press('Enter'); await expectSelection(editor, last, query); await visibleMatchAndControls(page, editor); await page.screenshot({ path: info.outputPath('long-search-match.png') });
    if (width === 390) {
      await scaleWritingText(page, true); await input.press('Shift+Enter'); await expectSelection(editor, first, firstToken); await visibleMatchAndControls(page, editor); await page.screenshot({ path: info.outputPath('long-search-enlarged.png') });
      await scaleWritingText(page, false); await input.press('Enter'); await expectSelection(editor, last, query); await visibleMatchAndControls(page, editor);
    }
    await input.press('Shift+Enter'); await expectSelection(editor, first, firstToken);
    await input.press('ControlOrMeta+g'); await expectSelection(editor, last, query); await input.press('ControlOrMeta+Shift+g'); await expectSelection(editor, first, firstToken);
    await input.press('Shift+Enter'); await expectSelection(editor, last, query); // Wrap before the first match.
    await panel.getByRole('button', { name: '次の一致', exact: true }).click(); await expectSelection(editor, first, firstToken);
    await panel.getByRole('button', { name: '前の一致', exact: true }).click(); await expectSelection(editor, last, query);
    const selected = await position(editor); await input.fill('missing-only-in-query'); await expect(panel.getByLabel('本文の検索結果')).toHaveText('一致なし'); await expect(panel.getByRole('button', { name: '次の一致', exact: true })).toBeDisabled(); expect(await position(editor)).toEqual(selected);
    await input.fill(''); await expect(panel.getByLabel('本文の検索結果')).toHaveText('検索語を入力'); await input.fill(query); await input.press('Escape'); await expect(panel).toHaveCount(0); await expect(editor).toBeFocused(); expect(await position(editor)).toEqual(selected);
    await page.waitForTimeout(1500); expect(puts).toBe(0); expect((await (await request.get(path)).json())).toEqual(before); expect(await editor.evaluate((e, old) => e === old, identity)).toBe(true);
    const reference = '人間が選んだ参考文。\n引用と自分の考察を分ける。', source = 'https://example.com/owned-search-reference';
    await page.evaluate(text => navigator.clipboard.writeText(text), reference); await editor.press('ControlOrMeta+v'); const dialog = page.getByRole('dialog'); await dialog.getByLabel('出典URL（必須）').fill(source); await dialog.getByRole('button', { name: '引用を追加', exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(editor).toBeFocused(); await expect(page.locator('.save-state')).toHaveText('保存済み');
    const rawFrom = body.lastIndexOf(query), after = body.slice(0, rawFrom) + quoteMarkdown(reference, source, undefined, '\r\n') + body.slice(rawFrom + query.length); expect((await (await request.get(path)).json()).content).toBe(after); expect(quotePosts).toHaveLength(1); expect(quotePosts[0]).toMatchObject({ from: rawFrom, to: rawFrom + query.length });
    await editor.press('ControlOrMeta+z'); await expect.poll(async () => (await (await request.get(path)).json()).content).toBe(body); await expect(page.locator('.save-state')).toHaveText('保存済み'); expect(await position(editor)).toEqual(selected);
    await editor.press('ControlOrMeta+Shift+z'); await expect.poll(async () => (await (await request.get(path)).json()).content).toBe(after); await expect(page.locator('.save-state')).toHaveText('保存済み');
    await page.locator('[data-note-panel=review] > summary').click(); const review = page.getByRole('region', { name: 'レビュー', exact: true }); await review.getByRole('button', { name: '出典を確認', exact: true }).click(); await expect(review.getByLabel('レビューの状態')).toContainText('完了'); const history = await (await request.get(`${path}/reviews`)).json(); const detail = await (await request.get(`/api/reviews/${history.reviews[0].id}`)).json(); expect(detail.run.provider).toBe('mock'); expect(detail.run.type).toBe('SOURCE'); expect(detail.revision.contentSnapshot).toBe(after); expect(detail.run.quoteSnapshot.map((q: { text: string }) => q.text)).toContain(reference); expect(detail.run.objectives.map((o: { text: string }) => o.text)).toContain(objective);
    const final = await (await request.get(path)).json(); expect(final.nodeIds).toEqual(before.nodeIds); expect(final.document.title).toBe(before.document.title); await page.reload(); expect((await (await request.get(path)).json())).toEqual(final); expect(errors).toEqual([]);
    await writeFile(info.outputPath('audit.json'), JSON.stringify({ width, sourceLength: body.length, normalClock: true, initiallyUnrenderedMatchesFound: true, literalQuery: query, keyboardAndButtonsNavigateAndWrap: true, searchControlsAndMatchVisible: true, queryOnlyKeepsSelection: true, closeKeepsSelectedRangeAndBodyFocus: true, searchWritesZero: true, sameEditorDOM: true, exactCRLFQuoteOffsets: true, fullMarkdownUndoRedoAndSelectionRetained: true, mockQuoteHumanGoalAndRevisionRetained: true, reloadFullGETMatches: true, errors }, null, 2));
  } finally { await request.delete(path); await request.delete(`/api/roadmaps/${roadmap.id}`); }
});

test('search open and close keep a human selection and typing history, including enlarged text', async ({ page, request }, info) => {
  await page.setViewportSize({ width: 390, height: 1000 }); const body = '人間の本文。'; const { document } = await (await request.post('/api/documents', { data: { title: 'Human typing history', content: body } })).json(); const path = `/api/documents/${document.id}`; const writes: Array<{ content: string }> = [];
  page.on('request', r => { if (new URL(r.url()).pathname === path && r.method() === 'PUT') writes.push(r.postDataJSON()); });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`); await page.getByRole('button', { name: '編集', exact: true }).click(); const editor = page.getByRole('textbox', { name: 'Markdown本文' }); await editor.press('ControlOrMeta+End'); await editor.pressSequentially(' human words'); await expect.poll(async () => (await (await request.get(path)).json()).content).toBe(body + ' human words'); await expect(page.locator('.save-state')).toHaveText('保存済み');
    for (let i = 0; i < 5; i++) await editor.press('Shift+ArrowLeft'); const selected = await position(editor); const saved = await (await request.get(path)).json(); const count = writes.length;
    await editor.press('ControlOrMeta+f'); const panel = page.getByRole('search', { name: '本文内検索', exact: true }); await expect(panel.getByLabel('本文の検索語')).toBeFocused(); await expect(panel.getByLabel('本文の検索語')).toHaveValue('words'); expect(await position(editor)).toEqual(selected);
    await scaleWritingText(page, true); await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath('search-enlarged-text.png') });
    await panel.getByRole('button', { name: '検索を閉じる', exact: true }).click(); await expect(panel).toHaveCount(0); await expect(editor).toBeFocused(); expect(await position(editor)).toEqual(selected); await page.waitForTimeout(1500); expect(writes).toHaveLength(count); expect((await (await request.get(path)).json())).toEqual(saved);
    await editor.press('ControlOrMeta+z'); await expect.poll(async () => (await (await request.get(path)).json()).content).toBe(body); await editor.press('ControlOrMeta+Shift+z'); await expect.poll(async () => (await (await request.get(path)).json()).content).toBe(body + ' human words');
    await writeFile(info.outputPath('audit.json'), JSON.stringify({ normalClock: true, nativeShortcutOpensAndPrefillsSelection: true, noNavigationKeepsSelectionAndWritesZero: true, closeButtonReturnsBodyFocus: true, nativeTypingUndoRedoRetained: true, enlargedTextNoHorizontalOverflow: true }, null, 2));
  } finally { await request.delete(path); }
});

test('search includes an unsaved human draft and never writes the search query into the note', async ({ page, request }, info) => {
  await page.clock.install(); await page.clock.pauseAt(new Date()); const body = 'Human original body.';
  const { document } = await (await request.post('/api/documents', { data: { title: 'Unsaved search', content: body } })).json(); const path = `/api/documents/${document.id}`; const writes: Array<{ content: string }> = [];
  page.on('request', r => { if (new URL(r.url()).pathname === path && r.method() === 'PUT') writes.push(r.postDataJSON()); });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`); await page.getByRole('button', { name: '編集', exact: true }).click(); const editor = page.getByRole('textbox', { name: 'Markdown本文' });
    const suffix = ' pending-unique-human'; await editor.press('ControlOrMeta+End'); await editor.pressSequentially(suffix); await editor.press('ControlOrMeta+f');
    const panel = page.getByRole('search', { name: '本文内検索', exact: true }); await panel.getByLabel('本文の検索語').fill('pending-unique-human'); await panel.getByLabel('本文の検索語').press('Enter'); await expectSelection(editor, body.length + 1, suffix.trim());
    expect(writes).toHaveLength(0); expect((await (await request.get(path)).json()).content).toBe(body); await panel.getByLabel('本文の検索語').fill('query-not-in-body'); await expect(panel.getByLabel('本文の検索結果')).toHaveText('一致なし'); await panel.getByLabel('本文の検索語').press('Escape');
    await expect(editor).toBeFocused(); expect((await position(editor)).content).toBe(body + suffix); await page.clock.runFor(1000); await expect(page.locator('.save-state')).toHaveText('保存済み'); expect(writes).toHaveLength(1); expect(writes[0].content).toBe(body + suffix); expect((await (await request.get(path)).json()).content).toBe(body + suffix);
    await writeFile(info.outputPath('audit.json'), JSON.stringify({ controlledClock: true, unsavedHumanDraftSearchable: true, searchQueryNotWrittenIntoBody: true, searchMovesDoNotWrite: true, existingAutosaveWritesHumanDraftOnly: true }, null, 2));
  } finally { await request.delete(path); }
});

test('a multi-line selection does not create an invisible newline query in the one-line search field', async ({ page, request }, info) => {
  const body = 'Human first line.\nHuman second line.'; const { document } = await (await request.post('/api/documents', { data: { title: 'Multi-line selection search', content: body } })).json(); const path = `/api/documents/${document.id}`; let writes = 0;
  page.on('request', r => { if (new URL(r.url()).pathname === path && r.method() === 'PUT') writes++; });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`); await page.getByRole('button', { name: '編集', exact: true }).click(); const editor = page.getByRole('textbox', { name: 'Markdown本文' }); await editor.press('ControlOrMeta+a'); const selected = await position(editor); const before = await (await request.get(path)).json();
    await editor.press('ControlOrMeta+f'); const panel = page.getByRole('search', { name: '本文内検索', exact: true }); const input = panel.getByLabel('本文の検索語');
    const visibleQuery = await input.inputValue(); await writeFile(info.outputPath('initial-query.json'), JSON.stringify({ visibleQuery, visibleQueryAppearsInBody: body.includes(visibleQuery), selection: selected, status: await panel.getByLabel('本文の検索結果').innerText() }, null, 2));
    await expect(input).toHaveValue(''); expect(await position(editor)).toEqual(selected); await input.fill('Human second line.'); await input.press('Enter'); await expectSelection(editor, body.indexOf('Human second line.'), 'Human second line.'); await input.press('Escape'); await expect(editor).toBeFocused();
    await page.waitForTimeout(1200); expect(writes).toBe(0); expect((await (await request.get(path)).json())).toEqual(before);
    await writeFile(info.outputPath('audit.json'), JSON.stringify({ normalClock: true, multilineSelectionKeepsItsFullRangeOnOpen: true, oneLineQueryOpensEmptyForMultilineSelection: true, typedQuerySelectsVisibleLiteralText: true, searchWritesZero: true, fullSavedDetailUnchanged: true }, null, 2));
  } finally { await request.delete(path); }
});
