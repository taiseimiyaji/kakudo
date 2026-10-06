import { expect, test } from './manual-note-fixture';

test('finding navigation moves the caret once and preserves Undo-restored input position', async ({ page, request }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const paragraph = '自分が分かったことと、まだ分からないことを分けて書き留める。資料と具体例を行き来しながら、人間が自分の言葉で説明を整理していく。';
  const target = 'Cookieを使うのでSession認証は安全である。';
  const content = '# 人間の長い考察\n\n' + Array(12).fill(paragraph).join('\n\n') + '\n\n' + target + '\n\n' + Array(12).fill(paragraph).join('\n\n');
  const { document } = await (await request.post('/api/documents', { data: { title: '指摘を読んで自分で続きを書く', content } })).json();
  let writes = 0;
  page.on('request', req => { if (req.method() === 'PUT' && new URL(req.url()).pathname === `/api/documents/${document.id}`) writes++; });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    await page.locator('[data-note-panel=review] > summary').click();
    const panel = page.getByRole('region', { name: 'レビュー', exact: true });
    await panel.getByRole('button', { name: '論理を確認', exact: true }).click();
    await expect(panel.getByLabel('レビューの状態')).toContainText('完了', { timeout: 15000 });
    await page.getByRole('button', { name: '編集', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Markdown本文' });
    const identity = await editor.elementHandle();
    for (const oldPosition of ['Home', 'End']) {
      await page.getByRole('button', { name: '編集', exact: true }).click();
      await editor.press(`ControlOrMeta+${oldPosition}`);
      await page.getByRole('button', { name: '閲覧', exact: true }).click();
      await panel.getByRole('button', { name: '本文で確認', exact: true }).click();
      await expect(editor).toBeFocused(); await expect(page.locator('.review-highlight')).toHaveText(target);
      expect(await editor.evaluate((element, before) => element === before, identity)).toBe(true);
      expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe(content); expect(writes).toBe(0);
      await editor.press('ArrowRight'); await page.keyboard.type('【人間の追記】');
      const stored = await (await request.get(`/api/documents/${document.id}`)).json();
      await info.attach(`input-from-${oldPosition}`, { body: JSON.stringify({ oldPosition, inputPreview: (await editor.innerText()).slice(0, 100), storedContentUnchanged: stored.content === content, writes }), contentType: 'application/json' });
      await page.screenshot({ path: info.outputPath(`finding-caret-${oldPosition}.png`) });
      await expect(editor).toContainText('C【人間の追記】ookieを使うのでSession認証は安全である。');
      await expect(panel.getByText(/更新前のレビュー/)).toBeVisible();
      await editor.press('ControlOrMeta+z'); await expect(page.locator('.review-highlight')).toHaveText(target);
      await page.keyboard.type('【自分で続けた】');
      await expect(editor).toContainText('C【自分で続けた】ookieを使うのでSession認証は安全である。');
      await editor.press('ControlOrMeta+z'); await expect(page.locator('.review-highlight')).toHaveText(target);
      const rect = await page.locator('.review-highlight').boundingBox();
      const header = await page.locator('.note-header').boundingBox();
      expect(rect!.y).toBeGreaterThan(header!.y + header!.height); expect(rect!.y).toBeLessThan(844);
    }
    expect(writes).toBe(0);
    const saved = await (await request.get(`/api/documents/${document.id}`)).json();
    expect(saved.content).toBe(content); expect(saved.document.title).toBe(document.title); expect(saved.document.currentRevisionId).toBe(document.currentRevisionId);
  } finally { await request.delete(`/api/documents/${document.id}`); }
});
