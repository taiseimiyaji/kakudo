import { expect, test } from '@playwright/test';

for (const phase of ['initial', 'refresh'] as const) for (const scope of ['linked', 'available', 'unencodable-id'] as const)
  test(`${phase} malformed ${scope} list preserves drafts and known resources until explicit retry`, async ({ page, request }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.install(); await page.clock.pauseAt(new Date());
    const body = '人間が自分で書いた保存済みの本文。';
    const draft = ' 人間が後から書いた未保存の考察。';
    const { document } = await (await request.post('/api/documents', { data: { title: '人間のノート', content: body } })).json();
    const ownedResources: string[] = [];
    const { resource: known } = await (await request.post(`/api/documents/${document.id}/resources`, { data: { url: `https://example.com/owned-known-${crypto.randomUUID()}`, title: '取得済みの資料', type: 'WEB' } })).json();
    ownedResources.push(known.id);
    const { resource: available } = await (await request.post('/api/resources', { data: { url: `https://example.com/owned-available-${crypto.randomUUID()}`, title: '登録済みの選択候補', type: 'WEB' } })).json();
    ownedResources.push(available.id);
    let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
    let fault = phase === 'initial'; let held = false; let invalidGets = 0; let writes = 0;
    const pageErrors: string[] = []; page.on('pageerror', error => pageErrors.push(error.message));
    const faultPath = scope === 'available' ? '/api/resources' : `/api/documents/${document.id}/resources`;
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url()); const method = route.request().method();
      if (url.pathname === `/api/documents/${document.id}` && method === 'PUT') writes++;
      if (!fault || method !== 'GET' || url.pathname !== faultPath) return route.continue();
      invalidGets++; held = true; await gate;
      const resources = scope === 'linked' ? {} : scope === 'available' ? [{ ...available, workspaceId: 'foreign-workspace' }] : [{ ...known, id: '\uD800' }];
      await route.fulfill({ status: 200, json: { resources, privateDiagnostic: 'must not reach UI' } }).catch(() => {});
    });
    try {
      await page.goto(`/workspaces/default/documents/${document.id}`);
      await page.getByRole('button', { name: '編集', exact: true }).click();
      const editor = page.getByRole('textbox', { name: 'Markdown本文' }); const identity = await editor.elementHandle();
      const disclosure = page.locator('[data-note-panel=resources]');
      const panel = disclosure.getByRole('region', { name: '参考資料', exact: true });
      if (phase === 'refresh') {
        await disclosure.locator(':scope > summary').click();
        await expect(panel.getByRole('listitem').filter({ hasText: known.title })).toBeVisible();
        await expect(panel.getByLabel('登録済み資料')).toBeEnabled();
        fault = true;
        await panel.getByLabel('資料URL').fill(`https://example.com/owned-refresh-${crypto.randomUUID()}`);
        await panel.getByLabel('資料名（任意）').fill('人間が登録した次の資料');
        await panel.getByRole('button', { name: '資料を登録', exact: true }).click();
        await expect(panel.getByRole('listitem').filter({ hasText: '人間が登録した次の資料' })).toBeVisible();
        const stored = await (await request.get(`/api/documents/${document.id}/resources`)).json();
        for (const resource of stored.resources) if (!ownedResources.includes(resource.id)) ownedResources.push(resource.id);
        await panel.getByLabel('資料名（任意）').fill('人間がまだ登録しない資料名');
        await disclosure.locator(':scope > summary').click();
      }
      await editor.press('ControlOrMeta+End'); await editor.pressSequentially(draft);
      await page.getByLabel('ノート名（必須）').fill('人間の未保存の名前');
      if (phase === 'initial') {
        await disclosure.locator(':scope > summary').click();
        await panel.getByLabel('資料名（任意）').fill('人間がまだ登録しない資料名');
        await disclosure.locator(':scope > summary').click();
      }
      await expect.poll(() => held).toBe(true); release();
      await expect(disclosure.getByText('資料を読み込めませんでした。接続を確認して再試行してください。', { exact: true })).toHaveCount(1);
      await disclosure.locator(':scope > summary').click();
      await expect(panel.getByText('資料を読み込めませんでした。接続を確認して再試行してください。', { exact: true })).toBeVisible();
      await expect(panel).not.toContainText('must not reach UI');
      await expect(panel).not.toContainText('登録された資料はありません。');
      await expect(editor).toContainText(body + draft);
      await expect(page.getByLabel('ノート名（必須）')).toHaveValue('人間の未保存の名前');
      expect(await editor.evaluate((element, old) => element === old, identity)).toBe(true);
      await expect(panel.getByLabel('資料名（任意）')).toHaveValue('人間がまだ登録しない資料名');
      if (phase === 'refresh') {
        await expect(panel.getByRole('listitem').filter({ hasText: known.title })).toBeVisible();
        await expect(panel.getByRole('listitem').filter({ hasText: '人間が登録した次の資料' })).toBeVisible();
        await expect(panel.getByLabel('登録済み資料').locator(`option[value="${available.id}"]`)).toHaveCount(1);
      }
      const beforeSave = await (await request.get(`/api/documents/${document.id}`)).json();
      expect(beforeSave.content).toBe(body); expect(beforeSave.document.title).toBe('人間のノート');
      // The canceled StrictMode mount GET may stop before interception.
      if (phase === 'initial' && process.env.E2E_DEV === '1') {
        expect(invalidGets).toBeGreaterThanOrEqual(1); expect(invalidGets).toBeLessThanOrEqual(2);
      } else expect(invalidGets).toBe(1);
      const mountGets = invalidGets; expect(writes).toBe(0);
      await editor.press('ControlOrMeta+z'); await expect.poll(() => editor.innerText()).toBe(body);
      await editor.press('ControlOrMeta+Shift+z'); await expect.poll(() => editor.innerText()).toBe(body + draft);
      fault = false; await panel.getByRole('button', { name: '資料を再読み込み', exact: true }).click();
      await expect(panel.getByRole('listitem').filter({ hasText: known.title })).toBeVisible();
      await expect(panel.getByRole('button', { name: '資料を再読み込み', exact: true })).toHaveCount(0);
      await expect(panel.getByLabel('登録済み資料').locator(`option[value="${available.id}"]`)).toHaveCount(1);
      expect(invalidGets).toBe(mountGets); expect(writes).toBe(0);
      await page.getByRole('button', { name: '保存', exact: true }).click();
      await expect(page.locator('.save-state')).toHaveText('保存済み');
      const saved = await (await request.get(`/api/documents/${document.id}`)).json();
      expect(saved.content).toBe(body + draft); expect(saved.document.title).toBe('人間の未保存の名前');
      expect(writes).toBe(1); expect(pageErrors).toEqual([]);
      expect(await editor.evaluate((element, old) => element === old, identity)).toBe(true);
      await page.screenshot({ path: info.outputPath('preserved-draft.png'), fullPage: true });
    } finally {
      release(); await page.unrouteAll({ behavior: 'wait' });
      await request.delete(`/api/documents/${document.id}`);
      for (const id of ownedResources) await request.delete(`/api/resources/${id}`);
    }
  });
