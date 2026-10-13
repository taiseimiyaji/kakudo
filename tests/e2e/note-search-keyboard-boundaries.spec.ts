import { expect, test, type Locator } from '@playwright/test';
import type { EditorView } from '@codemirror/view';
import { writeFile } from 'node:fs/promises';

type EditorDOM = HTMLElement & { cmTile: { root: { view: EditorView } } };
async function bodyState(editor: Locator) {
  return editor.evaluate(e => {
    const view = (e as EditorDOM).cmTile.root.view, r = view.state.selection.main;
    return { from: r.from, to: r.to, content: view.state.sliceDoc() };
  });
}
const cases = [
  { name: 'composition lifecycle and event flag', start: true, end: false, flag: true, legacy: false },
  { name: 'composition lifecycle with missing event flag', start: true, end: false, flag: false, legacy: false },
  { name: 'event flag without lifecycle', start: false, end: false, flag: true, legacy: false },
  { name: 'legacy229 after compositionend', start: true, end: true, flag: false, legacy: true },
];

for (const boundary of cases) for (const key of ['Enter', 'Escape']) test(`search IME ${boundary.name} ${key} retains query focus and human selection`, async ({ page, request }, info) => {
  const body = '人間の元の本文。\n日本語の検索語。\n別の日本語の検索語。'; const query = '日本語';
  const { document } = await (await request.post('/api/documents', { data: { title: 'IME search boundary', content: body } })).json(); const path = `/api/documents/${document.id}`; let writes = 0;
  page.on('request', r => { if (new URL(r.url()).pathname === path && ['PUT', 'POST', 'PATCH'].includes(r.method())) writes++; });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`); await page.getByRole('button', { name: '編集', exact: true }).click(); const editor = page.getByRole('textbox', { name: 'Markdown本文' }); await editor.press('ControlOrMeta+Home'); const before = await bodyState(editor); const saved = await (await request.get(path)).json();
    await editor.press('ControlOrMeta+f'); const panel = page.getByRole('search', { name: '本文内検索', exact: true }); const input = panel.getByLabel('本文の検索語');
    if (boundary.start) await input.dispatchEvent('compositionstart', { data: '' });
    await input.fill(query);
    if (boundary.end) await input.dispatchEvent('compositionend', { data: query });
    await input.evaluate(e => { const field = e as HTMLInputElement; field.setSelectionRange(field.value.length, field.value.length); });
    const event = await input.evaluate((e, spec) => {
      const event = new KeyboardEvent('keydown', { key: spec.key, code: spec.key, keyCode: spec.legacy ? 229 : spec.key === 'Enter' ? 13 : 27, isComposing: spec.flag, bubbles: true, cancelable: true });
      e.dispatchEvent(event); return { key: event.key, keyCode: event.keyCode, isComposing: event.isComposing, isTrusted: event.isTrusted, defaultPrevented: event.defaultPrevented };
    }, { key, legacy: boundary.legacy, flag: boundary.flag });
    expect(event.isComposing).toBe(boundary.flag); expect(event.keyCode).toBe(boundary.legacy ? 229 : key === 'Enter' ? 13 : 27); expect(event.isTrusted).toBe(false);
    await writeFile(info.outputPath('delivered-event.json'), JSON.stringify({ boundary: boundary.name, event, before, after: await bodyState(editor), panelCount: await panel.count() }, null, 2));
    await expect(panel).toHaveCount(1); await expect(input).toBeFocused(); await expect(input).toHaveValue(query); expect(await bodyState(editor)).toEqual(before);
    expect(await input.evaluate(e => [(e as HTMLInputElement).selectionStart, (e as HTMLInputElement).selectionEnd])).toEqual([query.length, query.length]);
    await page.waitForTimeout(1200); expect(writes).toBe(0); expect((await (await request.get(path)).json())).toEqual(saved);
    if (boundary.start && !boundary.end) await input.dispatchEvent('compositionend', { data: query });
    await input.press('Enter'); await expect.poll(() => bodyState(editor)).toEqual({ from: body.indexOf(query), to: body.indexOf(query) + query.length, content: body });
    await input.press('Escape'); await expect(panel).toHaveCount(0); await expect(editor).toBeFocused(); expect(writes).toBe(0); expect((await (await request.get(path)).json())).toEqual(saved);
    await writeFile(info.outputPath('audit.json'), JSON.stringify({ boundary: boundary.name, key, deliveredEvent: event, syntheticEventsOnly: true, panelQueryFocusAndInputCaretRetained: true, bodySelectionAndFullContentUnchanged: true, noSaveWrites: true, ordinaryEnterAndEscapeStillWork: true }, null, 2));
  } finally { await request.delete(path); }
});

for (const key of ['ControlOrMeta+g', 'ControlOrMeta+Shift+g']) test(`fresh multiline selection ${key} cannot bypass single-line query normalization`, async ({ page, request }, info) => {
  const body = 'Human first line.\nHuman second line.'; const { document } = await (await request.post('/api/documents', { data: { title: 'Fresh direct search', content: body } })).json(); const path = `/api/documents/${document.id}`; let writes = 0;
  page.on('request', r => { if (new URL(r.url()).pathname === path && r.method() === 'PUT') writes++; });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`); await page.getByRole('button', { name: '編集', exact: true }).click(); const editor = page.getByRole('textbox', { name: 'Markdown本文' }); await editor.press('ControlOrMeta+a'); const before = await bodyState(editor); const saved = await (await request.get(path)).json(); await editor.press(key);
    const panel = page.getByRole('search', { name: '本文内検索', exact: true }); const input = panel.getByLabel('本文の検索語'); await writeFile(info.outputPath('initial-query.json'), JSON.stringify({ key, visibleQuery: await input.inputValue(), status: await panel.getByLabel('本文の検索結果').innerText(), before, after: await bodyState(editor) }, null, 2));
    await expect(input).toBeFocused(); await expect(input).toHaveValue(''); await expect(panel.getByLabel('本文の検索結果')).toHaveText('検索語を入力'); expect(await bodyState(editor)).toEqual(before);
    await input.fill('Human second line.'); await input.press('Enter'); await expect.poll(() => bodyState(editor)).toEqual({ from: body.indexOf('Human second line.'), to: body.length, content: body }); await input.press('Escape'); await expect(editor).toBeFocused(); await page.waitForTimeout(1200); expect(writes).toBe(0); expect((await (await request.get(path)).json())).toEqual(saved);
    await writeFile(info.outputPath('audit.json'), JSON.stringify({ key, freshMultilineShortcutOpensEmptyQuery: true, wholeHumanSelectionPreserved: true, typedLiteralNavigationWorks: true, searchWritesZero: true, fullSavedDetailUnchanged: true }, null, 2));
  } finally { await request.delete(path); }
});
