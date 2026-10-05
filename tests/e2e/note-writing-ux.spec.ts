import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

const paragraph = '認証は「誰が利用しているか」を確かめる手続きで、認可は「どの操作を許可するか」を決める手続きだと理解した。ログインできることと、他の人の記録を編集できることは別の判断になる。身近な場面を思い浮かべ、どこで本人を確認し、どこで権限を確かめるかを自分の言葉で整理していきたい。';
const ownWords = `# 認証と認可を、自分の言葉で考える\n\n${paragraph}\n\n## 具体例から理解する\n\n${paragraph}\n\n${paragraph}\n\n## まだ確かめたいこと\n\n${paragraph}\n\n${paragraph}\n\n${Array.from({ length: 10 }, () => paragraph).join("\n\n")}`;

async function capture(page: Page, info: TestInfo, name: string, top = true) {
  if (top) { await page.locator(".save-state").click(); await page.mouse.move(0, 0); await page.evaluate(() => scrollTo(0, 0)); }
  const measurements = await page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector); if (!element) return null;
      const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
      return { x: rect.x, y: rect.y, documentTop: rect.y + scrollY, width: rect.width, height: rect.height, visibleInViewport: rect.bottom > 0 && rect.top < innerHeight && !!element.getClientRects().length, font: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight, padding: style.padding, position: style.position, outline: style.outline };
    };
    const visibleControls = [...document.querySelectorAll('main button, main a, main input, main select, main summary')].filter(element => !!element.getClientRects().length);
    const aboveFold = visibleControls.filter(element => { const rect = element.getBoundingClientRect(); return rect.top >= 0 && rect.top < innerHeight; });
    return { viewport: { width: innerWidth, height: innerHeight }, scrollY, scrollWidth: document.documentElement.scrollWidth, pageHeight: document.documentElement.scrollHeight, header: box('.app-header'), saveState: document.querySelector('.save-state')?.textContent, saveStateGeometry: box('.save-state'), saveMessage: document.querySelector('.save-message')?.textContent, alerts: [...document.querySelectorAll('[role=alert]')].map(e => e.textContent), toolbarCaption: document.querySelector('.document-toolbar p')?.textContent, editor: box('.cm-content'), editorFrame: box('.markdown-editor'), editorScroller: box('.cm-scroller'), editorFirstLine: box('.cm-line'), preview: box('.editor-split .markdown-preview'), title: box('.document-title'), relatedGoals: box('.document-node-context'), review: box('.review-panel'), resources: box('.resource-panel'), totalVisibleControls: visibleControls.length, aboveFoldControls: aboveFold.map(e => (e.getAttribute('aria-label') || e.textContent || e.getAttribute('name') || e.tagName).trim().slice(0, 80)), focus: { tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.slice(0, 100), role: document.activeElement?.getAttribute('role'), label: document.activeElement?.getAttribute('aria-label') }, localStorageKeys: Object.keys(localStorage) };
  });
  await page.screenshot({ path: info.outputPath(`${name}-viewport.png`) });
  await page.screenshot({ path: info.outputPath(`${name}-full.png`), fullPage: true });
  await writeFile(info.outputPath(`${name}.json`), JSON.stringify(measurements, null, 2));
  return measurements;
}

for (const width of [1440, 768, 390]) test(`quiet article writing and truthful save states ${width}`, async ({ page, context, request }, info) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.clock.install(); await page.clock.pauseAt(new Date());
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  let mapId = ''; let documentId = ''; let release!: () => void; let held = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const snapshots: Record<string, unknown> = {}; let phase: 'normal' | 'reject' | 'hold' = 'normal'; let puts = 0;
  try {
    await page.goto('/workspaces/default/roadmaps');
    await page.getByLabel('新しいマップ（必須）').fill(`静かに学びを書き留める-${width}`);
    await page.getByRole('button', { name: 'マップを作成', exact: true }).click();
    await page.waitForURL(/\/roadmaps\/[^/]+$/); mapId = new URL(page.url()).pathname.split('/').at(-1)!;
    await page.getByLabel('新しい学習項目（必須）').fill('認証と認可の違いを説明する');
    await page.getByRole('button', { name: '学習項目を追加', exact: true }).click();
    await expect(page.getByLabel('学習項目名（必須）', { exact: true })).toHaveValue('認証と認可の違いを説明する');
    await page.getByLabel('学習目標（任意・1行1項目）').fill('認証と認可の違いを自分の言葉で説明できる\n具体例で権限の判断箇所を示せる');
    await page.getByRole('button', { name: '学習項目を保存', exact: true }).click();
    await expect(page.locator('.node-details > form [role=status]')).toHaveText('保存しました');
    await page.getByLabel('新しいノート（必須）').fill(`認証と認可を、自分の言葉で考える-${width}`);
    await page.getByRole('button', { name: 'ノートを作成', exact: true }).click();
    await page.waitForURL(/\/documents\/[^/]+$/); documentId = new URL(page.url()).pathname.split('/').at(-1)!;
    const editor = page.getByRole('textbox', { name: 'Markdown本文' }); await expect(editor).toBeVisible();
    snapshots.blank = await capture(page, info, '01-blank-writing');
    const firstLineTop = await page.locator('.cm-line').first().evaluate(e => e.getBoundingClientRect().top); expect(firstLineTop).toBeLessThan(360);
    for (const panel of await page.locator('details[data-note-panel]').all()) await expect(panel).not.toHaveAttribute('open', '');
    const identity = await editor.elementHandle();
    await page.getByLabel('ノート名（必須）').press('Enter'); await expect(editor).toBeFocused();
    for (const [index, line] of ownWords.split('\n').entries()) { if (index) await editor.press('Enter'); if (line) await editor.pressSequentially(line); }
    await editor.press('ControlOrMeta+s');
    await expect(page.getByText('保存済み', { exact: true })).toBeVisible();
    snapshots.cleanEdit = await capture(page, info, '02-confirmed-writing-default');
    await expect(page.locator('.editor-split .markdown-preview')).toHaveCount(0);
    const column = await page.locator('.editor-split').boundingBox(); expect(column!.width).toBeLessThanOrEqual(720);
    if (width === 1440) {
      await page.getByRole('button', { name: 'プレビューを表示', exact: true }).click();
      snapshots.optionalPreview = await capture(page, info, '03-optional-preview');
      await page.getByRole('button', { name: 'プレビューを非表示', exact: true }).click();
    }
    await editor.click(); await editor.press('ControlOrMeta+End');
    snapshots.longWriting = await capture(page, info, '04-long-writing-save-indicator-position', false);
    const badge = await page.locator('.save-state').boundingBox(); expect(badge!.y).toBeGreaterThanOrEqual(0); expect(badge!.y).toBeLessThan(100);
    await page.keyboard.press('Tab');
    const tabFocus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent, name: document.activeElement?.getAttribute('aria-label') }));
    const beforeModeScroll = await page.evaluate(() => scrollY);
    await page.getByRole('button', { name: '閲覧', exact: true }).click();
    snapshots.reading = await capture(page, info, '05-current-reading');
    await page.getByRole('button', { name: '編集', exact: true }).click();
    await expect(editor).toBeFocused();
    expect(await editor.evaluate((element, previous) => element === previous, identity)).toBe(true);
    // Reading screenshot captures at the top; return uses the remembered writing scroll.
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(beforeModeScroll);
    const editSwitchReturnsFocus = true;
    await editor.click(); await editor.press('ControlOrMeta+End');
    await page.evaluate(() => navigator.clipboard.writeText('認証と認可は異なる問いに答えるための手続きである。'));
    await editor.press('ControlOrMeta+V');
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('出典URL（必須）').fill('https://example.com/isolated-writing-reference');
    await dialog.getByLabel('出典名（任意）').fill('人間が選んだ引用の出典');
    snapshots.quoteDialog = await capture(page, info, '06-current-quote-dialog', false);
    await dialog.getByRole('button', { name: '引用を追加', exact: true }).click();
    await expect(dialog).toHaveCount(0); await expect(editor).toBeFocused();
    await editor.press('ControlOrMeta+Z'); await expect(editor).not.toContainText('異なる問いに答える');
    await editor.press('ControlOrMeta+Shift+Z'); await expect(editor).toContainText('異なる問いに答える');
    await page.locator('[data-note-panel=review] > summary').click();
    const review = page.getByRole('region', { name: 'レビュー', exact: true });
    await expect(review.getByRole('button', { name: '論理を確認', exact: true })).toBeEnabled();
    await review.getByRole('button', { name: '論理を確認', exact: true }).click();
    await expect.poll(async () => { await page.clock.runFor(1000); return review.getByLabel('レビューの状態').innerText().catch(() => ''); }).toContain('完了');
    await expect(review.getByText(/Mock：実AI/)).toBeVisible();
    snapshots.reviewPlacement = await capture(page, info, '07-current-goals-review-resources-placement');
    await page.route(`**/api/documents/${documentId}?*`, async route => {
      if (route.request().method() !== 'PUT') return route.continue();
      puts++;
      if (phase === 'reject') return route.fulfill({ status: 400, json: { error: 'isolated input rejection' } });
      if (phase !== 'hold') return route.continue();
      const response = await route.fetch(); expect(response.status()).toBe(200); held = true; await gate; await route.fulfill({ response }).catch(() => {});
    });
    phase = 'reject'; await editor.click(); await editor.press('ControlOrMeta+End'); await editor.pressSequentially(' 人間が考え直した追記。');
    snapshots.dirty = await capture(page, info, '08-current-dirty');
    await page.getByRole('button', { name: '保存', exact: true }).click(); await expect(page.getByText('保存できませんでした', { exact: true })).toBeVisible();
    snapshots.knownError = await capture(page, info, '09-current-known-error');
    await expect(page.locator('[data-save-detail]')).toContainText('自動保存を停止');
    const errorsPuts = puts; await page.clock.runFor(3000); expect(puts).toBe(errorsPuts);
    phase = 'normal'; await page.getByRole('button', { name: '保存を再試行', exact: true }).click(); await expect(page.getByText('保存済み', { exact: true })).toBeVisible();
    phase = 'hold'; await editor.click(); await editor.press('ControlOrMeta+End'); await editor.pressSequentially(' 今回の保存対象。'); await page.clock.runFor(1000);
    await expect.poll(() => held).toBe(true); snapshots.pending = await capture(page, info, '10-current-pending');
    await editor.click(); await editor.press('ControlOrMeta+End'); await editor.pressSequentially(' 応答待ちにさらに人間が書いた考察。');
    snapshots.pendingWithNewerDraft = await capture(page, info, '11-pending-with-newer-human-draft');
    await page.clock.runFor(20000); await expect(page.getByText('保存結果は不明です', { exact: true })).toBeVisible();
    const stoppedPuts = puts; await editor.press('ControlOrMeta+s'); await page.clock.runFor(1000); expect(puts).toBe(stoppedPuts);
    snapshots.unknown = await capture(page, info, '12-current-unknown-outcome');
    await page.getByRole('button', { name: '最新の保存内容を確認', exact: true }).click();
    const latest = page.getByRole('region', { name: '最新の保存内容', exact: true }); await expect(latest).toContainText('今回の保存対象。');
    await expect(latest).toContainText('成功・失敗は確定しません'); await expect(editor).toContainText('さらに人間が書いた考察。');
    snapshots.comparison = await capture(page, info, '13-current-recovery-comparison');
    let confirmText = ''; page.once('dialog', async d => { confirmText = d.message(); await d.accept(); });
    await latest.getByRole('button', { name: '確認した内容を基準に再試行', exact: true }).click();
    const beforeExplicit = puts; await page.clock.runFor(3000); expect(puts).toBe(beforeExplicit);
    await expect(page.locator('.save-state')).toHaveText('保存の再開待ち');
    await expect(page.locator('[data-save-detail]')).not.toContainText('1秒');
    snapshots.confirmedBaselinePaused = await capture(page, info, '14-confirmed-baseline-auto-save-still-paused');
    phase = 'normal'; await page.getByRole('button', { name: '保存を再試行', exact: true }).click(); await expect(page.getByText('保存済み', { exact: true })).toBeVisible();
    release(); await page.unrouteAll({ behavior: 'wait' });
    snapshots.recovered = await capture(page, info, '15-recovered-confirmed-save');
    const savedBeforeIME = await (await request.get(`/api/documents/${documentId}`)).json();
    let imePuts = 0; page.on('request', req => { if (req.method() === 'PUT' && new URL(req.url()).pathname === `/api/documents/${documentId}`) imePuts++; });
    await editor.click(); await editor.press('ControlOrMeta+End'); await editor.dispatchEvent('compositionstart'); await editor.pressSequentially(' 日本語の確定前。');
    await page.clock.runFor(3000); expect(imePuts).toBe(0);
    snapshots.composition = await capture(page, info, '16-composition-contract-pending');
    await editor.dispatchEvent('compositionend'); await page.clock.runFor(1000); await expect(page.getByText('保存済み', { exact: true })).toBeVisible(); expect(imePuts).toBe(1);
    await page.getByLabel('ノート名（必須）').fill(''); await page.clock.runFor(3000); expect(imePuts).toBe(1);
    snapshots.missingTitle = await capture(page, info, '17-required-title-pauses-save');
    await page.locator('.note-navigation > summary').click();
    let departureText = ''; page.once('dialog', async d => { departureText = d.message(); await d.dismiss(); });
    await page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('link', { name: 'ノート', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/documents/${documentId}$`));
    await writeFile(info.outputPath('audit.json'), JSON.stringify({ head: process.env.KAKUDO_QA_HEAD, width, allSetupAndBodyFromUI: true, paragraphCharacters: ownWords.length, snapshots, tabFocus, editSwitchReturnsFocus, quoteNativeUndoRedoAndFocusReturn: true, provider: 'mock', knownErrorAutoReplay: false, unknownGETNotProof: true, baselineAcknowledgmentWriteZeroAndTimerStillPaused: true, explicitWriteRecoveryOnly: true, nativeConfirmText: confirmText, departureText, imeContractEventsOnly: { noSaveBeforeCompositionEnd: true, savedAfterEnd: true }, requiredTitlePausesSave: true, savedHumanContentAfterRecoveryIncludesLaterDraft: savedBeforeIME.content.includes('さらに人間が書いた考察。'), localPersistentDraftGuarantee: false, limits: ['Controlled browser clock and injected known400/held realPUT200', 'Native keyboard/clipboard, but composition uses synthetic events; native Mac IME/OSzoom not verified', 'Mock/ownedDB/tempMarkdown only; no realAI/livefetch', 'Implementation comparison on isolated branch; no merge or durable local draft feature'] }, null, 2));
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); if (documentId) await request.delete(`/api/documents/${documentId}`); if (mapId) await request.delete(`/api/roadmaps/${mapId}`); }
});

test('closed context panels retain independent drafts and departure protection', async ({ page, request }) => {
  const { roadmap } = await (await request.post('/api/roadmaps', { data: { title: '閉じた補助情報' } })).json();
  const nodes = [];
  for (const title of ['認証', '認可']) nodes.push((await (await request.post('/api/nodes', { data: { roadmapId: roadmap.id, title, learningObjectives: ['人間が説明する目標'] } })).json()).node);
  const { document } = await (await request.post('/api/documents', { data: { title: '人間の名前', content: '人間が書いた本文。', nodeIds: [nodes[0].id] } })).json();
  let mutations = 0;
  page.on('request', r => { if (r.method() !== 'GET' && new URL(r.url()).pathname.startsWith(`/api/documents/${document.id}`)) mutations++; });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    await page.getByRole('button', { name: '編集', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Markdown本文' }); const identity = await editor.elementHandle();
    const goals = page.locator('[data-note-panel=goals]'); await goals.locator(':scope > summary').click();
    await goals.getByText('学習項目の関連を変更', { exact: true }).click();
    const selected = goals.getByRole('checkbox', { name: `${roadmap.title} / 認可`, exact: true }); await selected.check();
    await goals.locator(':scope > summary').click(); await expect(goals.locator(':scope > summary')).toContainText('未確定の変更');
    const resources = page.locator('[data-note-panel=resources]'); await resources.locator(':scope > summary').click();
    await resources.getByLabel('資料URL（必須）').fill('https://example.com/human-draft');
    await resources.getByLabel('資料名（任意）').fill('人間が選んだ資料名');
    await resources.locator(':scope > summary').click(); await expect(resources.locator(':scope > summary')).toContainText('未確定の変更');
    let warning = ''; page.once('dialog', async d => { warning = d.message(); await d.dismiss(); });
    await page.getByRole('link', { name: '← 学習マップ', exact: true }).click();
    expect(warning).toContain('未登録'); await expect(page).toHaveURL(new RegExp(`/documents/${document.id}$`));
    await page.getByRole('button', { name: '閲覧', exact: true }).click();
    await page.getByRole('button', { name: '編集', exact: true }).click(); await expect(editor).toBeFocused();
    expect(await editor.evaluate((element, old) => element === old, identity)).toBe(true);
    await resources.locator(':scope > summary').click(); await expect(resources.getByLabel('資料名（任意）')).toHaveValue('人間が選んだ資料名');
    await goals.locator(':scope > summary').click(); await expect(selected).toBeChecked();
    await expect(editor).toContainText('人間が書いた本文。'); await expect(page.getByLabel('ノート名（必須）')).toHaveValue('人間の名前');
    expect(mutations).toBe(0);
    const stored = await (await request.get(`/api/documents/${document.id}`)).json(); expect(stored.nodeIds).toEqual([nodes[0].id]); expect(stored.content).toBe('人間が書いた本文。');
  } finally { await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/roadmaps/${roadmap.id}`); }
});

test('200% note text scaling keeps writing and save controls within the viewport', async ({ page, request }, info) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const { document } = await (await request.post('/api/documents', { data: { title: '自分の言葉で考える長い日本語のノート名', content: ownWords } })).json();
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    await page.getByRole('button', { name: '編集', exact: true }).click();
    // Rendered text scaling plus the 640px common-UI reflow check approximates
    // zoom accessibility; this does not claim native OS/browser zoom or IME.
    await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const editor = page.getByRole('textbox', { name: 'Markdown本文' });
    await editor.press('ControlOrMeta+End'); await editor.pressSequentially(' 人間が最後に書いた考察。'); await editor.press('ControlOrMeta+s');
    await expect(page.locator('.save-state')).toHaveText('保存済み');
    for (const element of await page.locator('.note-header button, .note-header summary, .document-title textarea').all()) {
      const rect = await element.boundingBox(); expect(rect!.x).toBeGreaterThanOrEqual(0); expect(rect!.x + rect!.width).toBeLessThanOrEqual(1281);
    }
    const rect = await page.locator('.save-state').boundingBox(); expect(rect!.y).toBeGreaterThanOrEqual(0); expect(rect!.y).toBeLessThan(180);
    await page.screenshot({ path: info.outputPath('note-text-200-percent.png') });
    const stored = await (await request.get(`/api/documents/${document.id}`)).json(); expect(stored.content).toBe(ownWords + ' 人間が最後に書いた考察。');
  } finally { await request.delete(`/api/documents/${document.id}`); }
});
