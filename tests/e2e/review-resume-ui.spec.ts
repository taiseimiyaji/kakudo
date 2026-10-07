import { writeFile } from 'node:fs/promises';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, test } from './manual-note-fixture';

const paragraph = '資料に書かれている説明と、自分で考えた説明を分けて記録する。理解できた点を具体例で確かめ、まだ曖昧なところは問いとして残す。';
const content = '# 自分の言葉で長く考える\n\n' + Array(24).fill(paragraph).join('\n\n') + '\n\nCookieを使うのでSession認証は安全である。';
async function note(request: APIRequestContext, title: string) {
  const { document } = await (await request.post('/api/documents', { data: { title, content } })).json();
  return document;
}
async function completed(request: APIRequestContext, document: { id: string; currentRevisionId: string }, type = 'LOGIC') {
  const { run } = await (await request.post(`/api/documents/${document.id}/reviews`, { data: { revisionId: document.currentRevisionId, type } })).json();
  await expect.poll(async () => (await (await request.get(`/api/reviews/${run.id}`)).json()).run.status).toBe('COMPLETED');
  return run.id as string;
}
async function landing(page: Page) {
  return page.locator('.review-panel > h2').evaluate(element => ({ width: innerWidth, scrollY, headingTop: element.getBoundingClientRect().top, headerBottom: document.querySelector('.note-header')!.getBoundingClientRect().bottom, focused: document.activeElement === element, pageHeight: document.documentElement.scrollHeight, scrollWidth: document.documentElement.scrollWidth, guideFont: getComputedStyle(document.querySelector('.review-scope')!).fontSize }));
}

for (const width of [1440, 390]) test(`explicit keyboard history resume once, quiet guidance and human Undo ${width}`, async ({ page, request }, info) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  const document = await note(request, `履歴から選んだ結果を確認する-${width}`);
  let writes = 0;
  page.on('request', req => { if (req.method() === 'PUT' && new URL(req.url()).pathname === `/api/documents/${document.id}`) writes++; });
  try {
    const runId = await completed(request, document); const otherId = await completed(request, document, 'COVERAGE');
    await page.goto(`/workspaces/default/documents/${document.id}`);
    await expect(page.locator('[data-note-panel=review]')).not.toHaveAttribute('open', '');
    await expect(page.locator('.review-scope')).not.toBeVisible(); expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.goto('/workspaces/default/reviews');
    const link = page.locator(`a[href*="reviewId=${runId}"]`); await link.focus(); await link.press('Enter');
    const panel = page.getByRole('region', { name: 'レビュー', exact: true });
    const heading = panel.getByRole('heading', { name: '理解を確かめる', exact: true });
    await expect(panel.getByLabel('レビュー履歴')).toHaveValue(runId);
    await expect(heading).toBeFocused();
    const position = await landing(page);
    expect(position.headingTop).toBeGreaterThan(position.headerBottom); expect(position.headingTop).toBeLessThan(width === 390 ? 844 : 900);
    expect(position.scrollWidth).toBe(width); expect(position.guideFont).toBe('13px');
    await expect(panel.locator('.review-scope')).toContainText('本文は全種類60,000文字まで');
    await expect(panel.locator('.review-scope')).toContainText('事実・全体は抽出主張20件まで');
    await expect(panel.locator('.review-actions button')).toHaveCount(5);
    await page.screenshot({ path: info.outputPath(`after-history-${width}.png`) });
    await page.screenshot({ path: info.outputPath(`after-controls-${width}.png`) });
    await writeFile(info.outputPath(`after-${width}.json`), JSON.stringify({ landing: position, contentCharacters: content.length, selectedRun: runId, explicitKeyboardEnter: true }, null, 2));
    await page.keyboard.press('Tab'); await expect(panel.getByRole('button', { name: '全体を確認', exact: true })).toBeFocused();
    const selection = panel.getByLabel('レビュー履歴'); await selection.focus(); await selection.selectOption(otherId);
    await expect(panel.getByLabel('レビューの状態')).toContainText('完了'); await expect(selection).toBeFocused();
    await selection.selectOption(runId); await expect(panel.getByRole('article', { name: '論理の指摘' })).toBeVisible(); await expect(selection).toBeFocused();
    const edit = page.getByRole('button', { name: '編集', exact: true }); await edit.focus(); await edit.press('Enter');
    const editor = page.getByRole('textbox', { name: 'Markdown本文' }); const identity = await editor.elementHandle();
    await editor.press('ControlOrMeta+End'); await page.keyboard.type(' 人間が自分で考えた追記。');
    await expect(editor).toBeFocused();
    await editor.press('ControlOrMeta+z'); await expect(editor).not.toContainText('人間が自分で考えた追記');
    await editor.press('ControlOrMeta+Shift+z'); await expect(editor).toContainText('人間が自分で考えた追記');
    expect(await editor.evaluate((element, before) => element === before, identity)).toBe(true);
    const stored = await (await request.get(`/api/documents/${document.id}`)).json();
    expect(stored.content).toBe(content); expect(stored.document.title).toBe(document.title); expect(writes).toBe(0);
  } finally { await request.delete(`/api/documents/${document.id}`); }
});

for (const phase of ['pending', 'poll'] as const) test(`late ${phase} detail never takes focus or scroll from a human draft`, async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const document = await note(request, `遅い${phase}結果と人間の入力`); const runId = await completed(request, document);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let reads = 0; let held = false; let writes = 0;
  page.on('request', req => { if (req.method() === 'PUT' && new URL(req.url()).pathname === `/api/documents/${document.id}`) writes++; });
  await page.route(`**/api/reviews/${runId}?*`, async route => {
    reads++; const response = await route.fetch();
    if (phase === 'poll' && reads === 1) {
      const payload = await response.json(); return route.fulfill({ json: { ...payload, run: { ...payload.run, status: 'RUNNING', stage: 'STARTING' } } });
    }
    held = true; await gate; await route.fulfill({ response });
  });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}?reviewId=${runId}`);
    const panel = page.getByRole('region', { name: 'レビュー', exact: true });
    if (phase === 'poll') await expect(panel.getByRole('heading', { name: '理解を確かめる', exact: true })).toBeFocused();
    await expect.poll(() => held).toBe(true);
    await page.getByRole('button', { name: '編集', exact: true }).click();
    await page.getByLabel('ノート名（必須）').fill('人間が後から付けた未保存の名前');
    const editor = page.getByRole('textbox', { name: 'Markdown本文' }); const identity = await editor.elementHandle();
    await editor.press('ControlOrMeta+End'); await page.keyboard.type(' まだ保存していない人間の考察。');
    await page.waitForTimeout(100); const before = await page.evaluate(() => scrollY);
    release(); await expect(panel.getByLabel('レビューの状態')).toContainText('完了');
    await page.waitForTimeout(100); await expect(editor).toBeFocused();
    expect(Math.abs(await page.evaluate(() => scrollY) - before)).toBeLessThanOrEqual(2);
    await expect(editor).toContainText('まだ保存していない人間の考察');
    await expect(page.getByLabel('ノート名（必須）')).toHaveValue('人間が後から付けた未保存の名前');
    await editor.press('ControlOrMeta+z'); await expect(editor).not.toContainText('まだ保存していない人間の考察');
    await editor.press('ControlOrMeta+Shift+z'); await expect(editor).toContainText('まだ保存していない人間の考察');
    expect(await editor.evaluate((element, old) => element === old, identity)).toBe(true);
    expect(writes).toBe(0); const stored = await (await request.get(`/api/documents/${document.id}`)).json();
    expect(stored.content).toBe(content); expect(stored.document.title).toBe(document.title); expect(reads).toBe(phase === 'poll' ? 2 : 1);
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/documents/${document.id}`); }
});
