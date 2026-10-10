import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

for (const kind of ['quote', 'resource'] as const) test(`unsent ${kind} protects saved-body departure until explicit discard or cancellation`, async ({ page, context, request }, info) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const title = `送信前の${kind}入力-${crypto.randomUUID()}`;
  const content = '# 自分の考察\n\n' + ('認証は誰かを確かめ、認可は許可する操作を決める。人間が具体例を考えて書き留める。\n\n').repeat(70);
  const created = await request.post('/api/documents', { data: { title, content } });
  expect(created.status()).toBe(201); const { document } = await created.json();
  const api = `/api/documents/${document.id}`;
  const sourceUrl = 'https://www.rfc-editor.org/rfc/rfc6749';
  const sourceTitle = '人間が読み、引用のために入力した資料名';
  const quote = 'The OAuth 2.0 authorization framework enables a third-party application to obtain limited access to an HTTP service.';
  const mutations: string[] = []; const warnings: Array<{ type: string; message: string }> = [];
  let discard = false;
  page.on('request', r => { if (r.method() !== 'GET' && new URL(r.url()).pathname.startsWith(api)) mutations.push(r.method()); });
  page.on('dialog', async d => { warnings.push({ type: d.type(), message: d.message() }); if (discard) await d.accept(); else await d.dismiss(); });
  const editor = page.getByRole('textbox', { name: 'Markdown本文' });
  const dialog = page.getByRole('dialog');
  const urlField = dialog.getByLabel(kind === 'quote' ? '出典URL（必須）' : '資料URL（必須）');
  const titleField = dialog.getByLabel(kind === 'quote' ? '出典名（任意）' : '資料名（任意）');
  async function openQuoteOrResource() {
    await editor.press('ControlOrMeta+End');
    await page.evaluate(text => navigator.clipboard.writeText(text), kind === 'quote' ? quote : sourceUrl);
    await editor.press('ControlOrMeta+V');
    await expect(dialog).toBeVisible();
    await urlField.fill(sourceUrl); await titleField.fill(sourceTitle);
  }
  async function assertInputs() {
    await expect(dialog).toBeVisible(); await expect(urlField).toHaveValue(sourceUrl); await expect(titleField).toHaveValue(sourceTitle);
    if (kind === 'quote') await expect(dialog.getByLabel('引用する文章')).toHaveValue(quote);
  }
  try {
    await page.goto('/workspaces/default/documents');
    await page.getByRole('link', { name: title, exact: true }).click();
    await page.getByRole('button', { name: '編集', exact: true }).click();
    await expect(page.locator('.save-state')).toHaveText('保存済み');
    const baseline = await (await request.get(api)).json();
    const identity = await editor.elementHandle();
    await openQuoteOrResource();
    await page.goBack({ timeout: 1000 }).catch(() => {});
    expect(warnings.map(w => w.type)).toEqual(['confirm']);
    expect(warnings[0].message).toContain('未追加の引用');
    await expect(page).toHaveURL(new RegExp(`/documents/${document.id}$`));
    await assertInputs(); expect(await editor.evaluate((element, old) => element === old, identity)).toBe(true);
    expect((await (await request.get(api)).json())).toEqual(baseline); expect(mutations).toHaveLength(0);
    await page.screenshot({ path: info.outputPath(`${kind}-departure-dismissed-input-retained.png`) });
    if (kind === 'quote') {
      await page.reload({ timeout: 1000 }).catch(() => {});
      expect(warnings.at(-1)?.type).toBe('beforeunload');
      await assertInputs(); expect(await editor.evaluate((element, old) => element === old, identity)).toBe(true);
      expect(mutations).toHaveLength(0);
    }
    discard = true;
    await page.goBack(); await expect(page).toHaveURL(/\/workspaces\/default\/documents$/);
    expect(warnings.at(-1)?.type).toBe('confirm'); expect(mutations).toHaveLength(0);
    expect((await (await request.get(api)).json())).toEqual(baseline);
    discard = false;
    await page.getByRole('link', { name: title, exact: true }).click();
    await page.getByRole('button', { name: '編集', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const reopenedIdentity = await editor.elementHandle();
    await openQuoteOrResource();
    await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
    await expect(dialog).toHaveCount(0); await expect(editor).toBeFocused();
    expect(await editor.evaluate((element, old) => element === old, reopenedIdentity)).toBe(true);
    const beforeCleanBack = warnings.length;
    await page.goBack(); await expect(page).toHaveURL(/\/workspaces\/default\/documents$/);
    expect(warnings).toHaveLength(beforeCleanBack); expect(mutations).toHaveLength(0);
    expect((await (await request.get(api)).json())).toEqual(baseline);
    await writeFile(info.outputPath('audit.json'), JSON.stringify({ kind, head: process.env.KAKUDO_QA_HEAD, width: 390, normalBrowserClock: true, nativeClipboardAndBrowserBack: true, cleanSavedBody: true, dismissedDepartureRetainsFormAndEditor: true, nativeReloadBeforeUnloadDismissed: kind === 'quote', explicitDiscardDoesNotWrite: true, cancellationRemovesGuardAndReturnsEditorFocus: true, cleanDepartureDoesNotWarn: true, entireSavedDocumentUnchanged: true, documentMutations: mutations, warningTypes: warnings.map(w => w.type), limits: ['Chromium only; native OS tab-close and Safari not verified', 'Mock and dedicated DB/temp Markdown, no real source fetch', 'No permanent local draft or crash recovery guarantee'] }, null, 2));
  } finally { await request.delete(api); }
});
