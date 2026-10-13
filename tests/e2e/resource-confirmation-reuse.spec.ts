import { expect, test, openNotePanels } from './manual-note-fixture';

test('a lost committed document registration confirms its scoped link and keeps human prose plus a lasting metadata explanation', async ({ page, context, request }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const url = `https://example.com/reused-document-${crypto.randomUUID()}`;
  const { resource } = await (await request.post('/api/resources', { data: { url, title: '保存済みの人間の資料名', type: 'RFC' } })).json();
  const { document } = await (await request.post('/api/documents', { data: { title: '保存済みのノート名', content: '保存済みの人間の本文。' } })).json();
  const path = `/api/documents/${document.id}`;
  let posts = 0;
  await page.route(`**${path}/resources?*`, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    posts++; expect((await route.fetch()).status()).toBe(201); await route.abort();
  });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`); await openNotePanels(page);
    await page.getByRole('button', { name: '編集', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Markdown本文' });
    await editor.press('ControlOrMeta+End'); await editor.pressSequentially(' まだ保存していない考察。');
    await page.getByLabel('ノート名（必須）').fill('まだ保存していないノート名');
    await page.evaluate(text => navigator.clipboard.writeText(text), url);
    await editor.press('ControlOrMeta+v');
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('資料名（任意）').fill('入力した別の資料名');
    await dialog.getByRole('button', { name: '資料を登録', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('結果は不明'); expect(posts).toBe(1);
    await dialog.getByRole('button', { name: '登録結果を確認', exact: true }).click();
    await expect(dialog).toHaveCount(0); await expect(editor).toBeFocused();
    const explanation = page.getByRole('status').filter({ hasText: 'このノートに関連付いている資料を確認しました' });
    await expect(explanation).toBeVisible();
    await expect(explanation).toContainText('直前の登録要求が成功したかは、この確認だけでは確定できません');
    await expect(explanation).toContainText('保存済みの人間の資料名');
    await expect(explanation).toContainText('入力した別の資料名');
    await expect(explanation).toContainText('RFC（技術仕様）');
    await expect(explanation).toContainText('Webページ');
    await expect(explanation).toContainText('反映されていません');
    await expect(page.getByRole('region', { name: '参考資料', exact: true }).getByRole('link', { name: '保存済みの人間の資料名' })).toBeVisible();
    await expect(editor).toContainText('まだ保存していない考察');
    await expect(page.getByLabel('ノート名（必須）')).toHaveValue('まだ保存していないノート名');
    const saved = await (await request.get(path)).json();
    expect(saved.content).toBe('保存済みの人間の本文。'); expect(saved.document.title).toBe('保存済みのノート名');
    const linked = (await (await request.get(`${path}/resources`)).json()).resources;
    expect(linked).toHaveLength(1); expect(linked[0]).toMatchObject({ id: resource.id, title: resource.title, type: resource.type });
    expect(posts).toBe(1);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await request.delete(path); await request.delete(`/api/resources/${resource.id}`); }
});

test('a different node link is not evidence for the attempted node, while its own later GET can confirm current state', async ({ page, request }) => {
  const url = `https://example.com/reused-node-${crypto.randomUUID()}`;
  const { roadmap } = await (await request.post('/api/roadmaps', { data: { title: '対象を分けるマップ' } })).json();
  const nodes = [];
  for (const [index, title] of ['確認対象', '別の項目'].entries()) nodes.push((await (await request.post('/api/nodes', { data: { roadmapId: roadmap.id, title, positionX: index * 320 } })).json()).node);
  const { resource } = await (await request.post('/api/resources', { data: { url, title: '既存の資料名', type: 'RFC' } })).json();
  expect((await request.post(`/api/nodes/${nodes[1].id}/resources`, { data: { resourceId: resource.id } })).status()).toBe(201);
  let posts = 0;
  await page.route(`**/api/nodes/${nodes[0].id}/resources?*`, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    posts++; await route.abort();
  });
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    await page.locator(`.react-flow__node[data-id="${nodes[0].id}"]`).click();
    const panel = page.getByRole('region', { name: '参考資料', exact: true });
    await panel.getByLabel('資料URL（必須）').fill(url);
    await panel.getByLabel('資料名（任意）').fill('人間が入力した別名');
    await panel.getByRole('button', { name: '資料を登録', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('結果は不明');
    await panel.getByRole('button', { name: '登録結果を確認', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('結果はまだ不明');
    await expect(panel.getByLabel('資料名（任意）')).toHaveValue('人間が入力した別名');
    await expect(panel.getByRole('button', { name: '資料を登録', exact: true })).toBeDisabled();
    expect((await (await request.get(`/api/nodes/${nodes[0].id}/resources`)).json()).resources).toHaveLength(0);
    expect((await (await request.get(`/api/nodes/${nodes[1].id}/resources`)).json()).resources).toHaveLength(1);
    // A separate actor establishes the target state. Its GET confirms state, not the aborted POST.
    expect((await request.post(`/api/nodes/${nodes[0].id}/resources`, { data: { resourceId: resource.id } })).status()).toBe(201);
    await panel.getByRole('button', { name: '登録結果を確認', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('この学習項目に関連付いている資料を確認しました');
    await expect(panel.getByRole('status')).toContainText('人間が入力した別名');
    await expect(panel.getByRole('status')).toContainText('既存の資料名');
    expect(posts).toBe(1);
    const linked = (await (await request.get(`/api/nodes/${nodes[0].id}/resources`)).json()).resources;
    expect(linked).toHaveLength(1); expect(linked[0]).toMatchObject({ id: resource.id, title: '既存の資料名', type: 'RFC' });
  } finally { await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/roadmaps/${roadmap.id}`); await request.delete(`/api/resources/${resource.id}`); }
});
