import { expect, test } from '@playwright/test';

test('a malformed committed resource-link response preserves the human note draft', async ({ page, request }, info) => {
  await page.clock.install(); await page.clock.pauseAt(new Date());
  const body = '人間が自分で書いた保存済みの本文。'; const draft = ' 人間が後から書いた未保存の考察。';
  const { document } = await (await request.post('/api/documents', { data: { title: '人間のノート', content: body } })).json();
  const { resource } = await (await request.post('/api/resources', { data: { url: `https://example.com/owned-response-${crypto.randomUUID()}`, title: '人間が選んだ資料', type: 'WEB' } })).json();
  let posts = 0;
  await page.route(`**/api/documents/${document.id}/resources?*`, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    posts++; const response = await route.fetch(); expect(response.status()).toBe(201);
    return posts === 1 ? route.fulfill({ status: 201, json: { resource: { ...resource, title: { privateDiagnostic: 'invalid React child' } } } }) : route.fulfill({ response });
  });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    await page.getByRole('button', { name: '編集', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Markdown本文' }); const identity = await editor.elementHandle();
    await editor.press('ControlOrMeta+End'); await editor.pressSequentially(draft);
    await page.getByLabel('ノート名（必須）').fill('人間の未保存の名前');
    const disclosure = page.locator('[data-note-panel=resources]'); await disclosure.locator(':scope > summary').click();
    const panel = disclosure.getByRole('region', { name: '参考資料', exact: true });
    await expect(panel.getByLabel('登録済み資料')).toBeEnabled(); await panel.getByLabel('登録済み資料').selectOption(resource.id);
    await panel.getByLabel('資料名（任意）').fill('人間が別に残した資料入力');
    await panel.getByRole('button', { name: '資料を関連付け', exact: true }).click();
    await expect.poll(async () => await page.getByText('Something went wrong!', { exact: true }).count() || await panel.getByRole('alert').count()).toBeGreaterThan(0);
    const stored = await (await request.get(`/api/documents/${document.id}`)).json();
    const linked = await (await request.get(`/api/documents/${document.id}/resources`)).json();
    expect(stored.content).toBe(body); expect(stored.document.title).toBe('人間のノート');
    expect(linked.resources.map((item: { id: string }) => item.id)).toEqual([resource.id]);
    await info.attach('committed-response-observation', { body: JSON.stringify({ editorCount: await editor.count(), storedContent: stored.content, storedTitle: stored.document.title, linkedIds: linked.resources.map((item: { id: string }) => item.id), posts }), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath('resource-link-response.png'), fullPage: true });
    await expect(editor).toContainText(body + draft);
    await expect(page.getByLabel('ノート名（必須）')).toHaveValue('人間の未保存の名前');
    expect(await editor.evaluate((element, old) => element === old, identity)).toBe(true);
    await expect(panel.getByRole('alert')).toContainText('関連付けられませんでした');
    await expect(panel.getByLabel('登録済み資料')).toHaveValue(resource.id);
    await expect(panel.getByLabel('資料名（任意）')).toHaveValue('人間が別に残した資料入力');
    expect(posts).toBe(1);
    await editor.press('ControlOrMeta+z'); await expect.poll(() => editor.innerText()).toBe(body);
    await editor.press('ControlOrMeta+Shift+z'); await expect.poll(() => editor.innerText()).toBe(body + draft);
    await panel.getByRole('button', { name: '資料を関連付け', exact: true }).click();
    await expect(panel.getByRole('listitem').filter({ hasText: resource.title })).toBeVisible(); expect(posts).toBe(2);
    await expect(panel.getByLabel('資料名（任意）')).toHaveValue('人間が別に残した資料入力');
    await page.getByRole('button', { name: '保存', exact: true }).click(); await expect(page.locator('.save-state')).toHaveText('保存済み');
    const saved = await (await request.get(`/api/documents/${document.id}`)).json();
    expect(saved.content).toBe(body + draft); expect(saved.document.title).toBe('人間の未保存の名前');
    expect((await (await request.get(`/api/documents/${document.id}/resources`)).json()).resources.map((item: { id: string }) => item.id)).toEqual([resource.id]);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/resources/${resource.id}`); }
});
