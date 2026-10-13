import { expect, test, type Locator } from '@playwright/test';
import type { EditorView } from '@codemirror/view';
import { writeFile } from 'node:fs/promises';

type EditorDOM = HTMLElement & { cmTile: { root: { view: EditorView } } };

async function writingPosition(editor: Locator) {
  return editor.evaluate(element => {
    const view = (element as EditorDOM).cmTile.root.view;
    const range = view.state.selection.main;
    const rect = view.coordsAtPos(range.head);
    return {
      anchor: range.anchor, head: range.head,
      nativeText: getSelection()?.toString(),
      focused: view.hasFocus && document.activeElement === element,
      scrollY, editorScrollY: view.scrollDOM.scrollTop,
      headTop: rect?.top, headBottom: rect?.bottom,
      headerBottom: document.querySelector('.note-header')!.getBoundingClientRect().bottom,
      viewportHeight: innerHeight,
    };
  });
}

async function editorContent(editor: Locator) {
  return editor.evaluate(element => (element as EditorDOM).cmTile.root.view.state.sliceDoc());
}

for (const width of [390, 1440]) for (const exit of ['Escape', 'button'] as const) {
  test(`cancel quote with ${exit} keeps selected writing context at ${width}px`, async ({ page, context, request }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const marker = 'HUMAN_SELECTED_WORD';
    const original = '# Human understanding\r\n\r\n' + Array.from({ length: 100 }, (_, i) => `Paragraph ${i}: ${'A sentence the learner wrote. '.repeat(5)}\r\n\r\n`).join('') + `Keep prefix ${marker} keep suffix.\r\n\r\nThe end.`;
    const { document } = await (await request.post('/api/documents', { data: { title: `Quote cancel ${width} ${exit}`, content: original } })).json();
    const path = `/api/documents/${document.id}`;
    let puts = 0;
    const quotePosts: string[] = [];
    page.on('request', req => {
      const pathname = new URL(req.url()).pathname;
      if (pathname === path && req.method() === 'PUT') puts++;
      if (pathname === `${path}/quotes` && req.method() === 'POST') quotePosts.push(pathname);
    });
    try {
      await page.goto(`/workspaces/default/documents/${document.id}`);
      await page.getByRole('button', { name: '編集', exact: true }).click();
      const editor = page.getByRole('textbox', { name: 'Markdown本文' });
      await editor.press('ControlOrMeta+End');
      const suffix = ' Human continuation.';
      await editor.pressSequentially(suffix);
      const body = original + suffix;
      await expect.poll(async () => (await (await request.get(path)).json()).content).toBe(body);
      await expect(page.locator('.save-state')).toHaveText('保存済み');

      await editor.press('ControlOrMeta+f');
      const query = page.getByRole('search', { name: '本文内検索', exact: true }).getByLabel('本文の検索語');
      await query.fill(marker);
      await query.press('Enter');
      await query.press('Escape');
      await expect(editor).toBeFocused();
      const before = await writingPosition(editor);
      expect(before.nativeText).toBe(marker);
      expect(before.scrollY).toBeGreaterThan(500);
      const savedBefore = await (await request.get(path)).json();
      const putCount = puts;

      await page.evaluate(() => navigator.clipboard.writeText('Reference words to cancel.'));
      await editor.press('ControlOrMeta+v');
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('heading', { name: '引用として追加', exact: true })).toBeVisible();
      await dialog.getByLabel('出典URL（必須）').fill('https://example.com/cancel-only');
      const whileOpen = await writingPosition(editor);
      expect([whileOpen.anchor, whileOpen.head, whileOpen.editorScrollY]).toEqual([before.anchor, before.head, before.editorScrollY]);
      expect(Math.abs(whileOpen.scrollY - before.scrollY)).toBeLessThanOrEqual(16);

      if (exit === 'Escape') await page.keyboard.press('Escape');
      else {
        const cancel = dialog.getByRole('button', { name: 'キャンセル', exact: true });
        for (let i = 0; i < 8 && !await cancel.evaluate(element => element === document.activeElement); i++) await page.keyboard.press('Tab');
        await expect(cancel).toBeFocused();
        await page.keyboard.press('Enter');
      }
      await expect(dialog).toHaveCount(0);
      await expect(editor).toBeFocused();
      await expect.poll(async () => (await writingPosition(editor)).nativeText).toBe(marker);
      const after = await writingPosition(editor);
      expect([after.anchor, after.head, after.editorScrollY]).toEqual([before.anchor, before.head, before.editorScrollY]);
      expect(after.focused).toBe(true);
      expect(Math.abs(after.scrollY - before.scrollY)).toBeLessThanOrEqual(2);
      expect(after.headTop).toBeGreaterThanOrEqual(after.headerBottom);
      expect(after.headBottom).toBeLessThanOrEqual(after.viewportHeight);
      await page.waitForTimeout(1200);
      expect(puts).toBe(putCount);
      expect(quotePosts).toEqual([]);
      expect(await (await request.get(path)).json()).toEqual(savedBefore);

      const replacement = 'HUMAN_REPLACEMENT';
      await page.keyboard.type(replacement);
      const replaced = body.replace(marker, replacement);
      await expect.poll(() => editorContent(editor)).toBe(replaced);
      await expect.poll(async () => (await (await request.get(path)).json()).content).toBe(replaced);
      await editor.press('ControlOrMeta+z');
      await expect.poll(() => editorContent(editor)).toBe(body);
      await expect.poll(async () => (await (await request.get(path)).json()).content).toBe(body);
      await expect.poll(async () => (await writingPosition(editor)).nativeText).toBe(marker);
      await editor.press('ControlOrMeta+Shift+Z');
      await expect.poll(() => editorContent(editor)).toBe(replaced);
      await expect.poll(async () => (await (await request.get(path)).json()).content).toBe(replaced);
      const final = await (await request.get(path)).json();
      await page.reload();
      expect(await (await request.get(path)).json()).toEqual(final);
      expect(quotePosts).toEqual([]);
      await writeFile(info.outputPath('audit.json'), JSON.stringify({ width, exit, before, whileOpen, after, cancelWrites: 0, quotePosts: 0, humanTypingUndoRedoAndReload: true }, null, 2));
    } finally { await request.delete(path); }
  });
}
