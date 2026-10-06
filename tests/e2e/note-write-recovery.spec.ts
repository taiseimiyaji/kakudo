import { expect, test } from '@playwright/test';
import { DOCUMENT_WRITE_OUTCOME_UNKNOWN } from '../../shared/document';
import { openNotePanels } from './manual-note-fixture';

for (const operation of ['save', 'quote'] as const)
  test(`${operation} tagged recovery409 preserves human input and holds replay until deliberate recovery`, async ({ page, context, request }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.install(); await page.clock.pauseAt(new Date());
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const body = '人間が自分の言葉で書いた認証と認可の理解。';
    const beforeQuote = ' 人間の引用前の考察。'; const citation = '人間が選んだ引用。';
    const { document } = await (await request.post('/api/documents', { data: { title: '人間の元の名前', content: body } })).json();
    const before = await (await request.get(`/api/documents/${document.id}`)).json();
    let puts = 0; let posts = 0; let fault = false;
    await page.route(/\/api\/documents(?:\/|\?)/, async route => {
      const url = new URL(route.request().url());
      const save = url.pathname === `/api/documents/${document.id}` && route.request().method() === 'PUT';
      const quote = url.pathname === `/api/documents/${document.id}/quotes` && route.request().method() === 'POST';
      if (!save && !quote) return route.continue();
      if (save) puts++; else posts++;
      const response = await route.fetch(); expect(response.status()).toBe(save ? 200 : 201);
      // Commit on the owned server first. Integration independently induces this
      // exact response through the actual storage adapter before/after DB commit.
      if (!fault && (operation === 'save' ? save : quote)) {
        fault = true; return route.fulfill({ status: 409, json: { code: DOCUMENT_WRITE_OUTCOME_UNKNOWN, error: 'private recovery diagnostics' } });
      }
      return route.fulfill({ response });
    });
    try {
      await page.goto(`/workspaces/default/documents/${document.id}`); await openNotePanels(page);
      await page.getByRole('button', { name: '編集', exact: true }).click();
      const editor = page.getByRole('textbox', { name: 'Markdown本文' }); const identity = await editor.elementHandle();
      await page.getByLabel('ノート名（必須）').fill('人間が変えた名前');
      if (operation === 'save') await page.getByRole('button', { name: '保存', exact: true }).click();
      else {
        await editor.press('ControlOrMeta+End'); await editor.pressSequentially(beforeQuote);
        await page.evaluate(text => navigator.clipboard.writeText(text), citation); await editor.press('ControlOrMeta+V');
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('出典URL（必須）').fill('https://example.com/owned-reference');
        await dialog.getByLabel('出典名（任意）').fill('人間の出典');
        await dialog.getByRole('button', { name: '引用を追加', exact: true }).click();
      }
      await expect(page.locator('.save-state')).toHaveText('保存結果は不明です');
      await expect(page.getByRole('alert').first()).not.toContainText('private');
      const committed = await (await request.get(`/api/documents/${document.id}`)).json();
      expect(committed.document.lastWriteId).not.toBe(before.document.lastWriteId);
      if (operation === 'save') expect(committed.contentHash).toBe(before.contentHash);
      else {
        expect(committed.content.split(citation)).toHaveLength(2);
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByRole('button', { name: '引用を追加', exact: true })).toBeDisabled();
        await expect(dialog.getByLabel('出典名（任意）')).toHaveValue('人間の出典');
        await dialog.locator('form').evaluate((form: HTMLFormElement) => form.requestSubmit());
        await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
        await expect(editor).not.toContainText(citation);
        await editor.press('ControlOrMeta+z'); await expect.poll(() => editor.innerText()).toBe(body);
        await editor.press('ControlOrMeta+Shift+z'); await expect.poll(() => editor.innerText()).toBe(body + beforeQuote);
      }
      await editor.press('ControlOrMeta+End'); await editor.pressSequentially(' 後から人間が書いた未保存の考察。');
      await page.getByLabel('ノート名（必須）').fill('人間の後の名前');
      const retry = page.getByRole('button', { name: '保存を再試行', exact: true });
      await expect(retry).toBeDisabled(); await expect(page.getByRole('button', { name: 'ノートを削除', exact: true })).toBeDisabled();
      await editor.press('ControlOrMeta+s'); await page.clock.runFor(45000);
      expect(puts + posts).toBe(1);
      await page.getByRole('button', { name: '最新の保存内容を確認', exact: true }).click();
      const latest = page.getByRole('region', { name: '最新の保存内容', exact: true });
      await expect(latest).toContainText(committed.content); await expect(latest).toContainText('成功・失敗は確定しません');
      await expect(editor).toContainText('後から人間が書いた未保存の考察。'); await expect(retry).toBeDisabled();
      const acknowledge = latest.getByRole('button', { name: '確認した内容を基準に再試行', exact: true });
      page.once('dialog', dialog => dialog.dismiss()); await acknowledge.click(); await expect(retry).toBeDisabled();
      page.once('dialog', dialog => dialog.accept()); await acknowledge.click();
      await expect(page.locator('.save-state')).toHaveText('保存の再開待ち');
      await expect(page.locator('[data-save-detail]')).not.toContainText('1秒');
      await page.clock.runFor(10000); expect(puts + posts).toBe(1);
      await retry.click(); await expect(page.locator('.save-state')).toHaveText('保存済み');
      expect(puts).toBe(operation === 'save' ? 2 : 1); expect(posts).toBe(operation === 'quote' ? 1 : 0);
      const saved = await (await request.get(`/api/documents/${document.id}`)).json();
      expect(saved.content).toBe(body + (operation === 'quote' ? beforeQuote : '') + ' 後から人間が書いた未保存の考察。');
      expect(saved.document.title).toBe('人間の後の名前');
      expect(await editor.evaluate((element, old) => element === old, identity)).toBe(true);
      await page.screenshot({ path: info.outputPath('recovered-human-draft.png'), fullPage: true });
    } finally { await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/documents/${document.id}`); }
  });
