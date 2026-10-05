import { openNotePanels } from "./manual-note-fixture";
import { test, expect } from './manual-note-fixture';

for (const external of ['add', 'delete'] as const) for (const edit of ['add', 'remove'] as const) test(`confirmed ${external} retains pending association ${edit}`, async ({ page, context, request }) => {
  await page.setViewportSize({ width: 390, height: 844 }); let mapId = ''; let documentId = ''; let other;
  const title = '保持する人間の未保存名'; const content = '保存済み本文。人間が自分で追記する。';
  try {
    const { roadmap } = await (await request.post('/api/roadmaps', { data: { title: `保存基準変更 ${external} ${edit}` } })).json(); mapId = roadmap.id;
    const nodes: { id: string; title: string }[] = [];
    for (const [i, name] of ['保存済みA', '別画面で変更するB', '人間が未保存で選ぶC'].entries()) nodes.push((await (await request.post('/api/nodes', { data: { roadmapId: mapId, title: name, positionX: i * 320 } })).json()).node);
    const originalIds = external === 'add' ? [nodes[0].id] : [nodes[0].id, nodes[1].id];
    const { document } = await (await request.post('/api/documents', { data: { title: '元の保存名', content: '保存済み本文。', nodeIds: originalIds } })).json(); documentId = document.id;
    await page.goto(`/workspaces/default/documents/${documentId}`); await openNotePanels(page); await page.getByRole('button', { name: '編集', exact: true }).click();
    const region = page.getByRole('region', { name: '関連する学習項目と目標', exact: true }); await region.getByText('学習項目の関連を変更', { exact: true }).click();
    const checkbox = (i: number) => region.getByRole('checkbox', { name: `${roadmap.title} / ${nodes[i].title}`, exact: true });
    if (edit === 'add') await checkbox(2).check(); else await checkbox(0).uncheck();
    const pending = region.getByText('関連の変更は未保存です。「関連を保存」で確定してください。', { exact: true }); await expect(pending).toBeVisible();
    await page.getByLabel('ノート名（必須）').fill(title); const editor = page.getByRole('textbox', { name: 'Markdown本文' }); await editor.click(); await editor.press('ControlOrMeta+End'); await editor.pressSequentially('人間が自分で追記する。');
    await page.getByLabel('資料URL（必須）').fill('https://example.com/rebase-unregistered');
    other = await context.newPage();
    if (external === 'add') {
      await other.goto(`/workspaces/default/documents/${documentId}`); await openNotePanels(other); const links = other.getByRole('region', { name: '関連する学習項目と目標', exact: true }); await links.getByText('学習項目の関連を変更', { exact: true }).click();
      await links.getByRole('checkbox', { name: `${roadmap.title} / ${nodes[1].title}`, exact: true }).check(); await links.getByRole('button', { name: '関連を保存', exact: true }).click(); await expect(links.getByRole('status')).toContainText('関連を更新しました。');
    } else {
      await other.goto(`/workspaces/default/roadmaps/${mapId}?nodeId=${nodes[1].id}`); await expect(other.getByLabel('学習項目名（必須）', { exact: true })).toHaveValue(nodes[1].title);
      other.once('dialog', (dialog) => dialog.accept()); await other.getByRole('button', { name: '学習項目を削除', exact: true }).click(); await expect(other.locator('.learning-card')).toHaveCount(2);
      await page.route(`**/api/documents/${documentId}?*`, (route) => route.request().method() === 'PUT' ? route.fulfill({ status: 500, json: {} }) : route.continue());
    }
    await page.getByRole('button', { name: '保存', exact: true }).click(); await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: '最新の保存内容を確認', exact: true }).click(); await expect(page.getByRole('region', { name: '最新の保存内容', exact: true })).toBeVisible();
    if (external === 'delete') page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '確認した内容を基準に再試行', exact: true }).click();
    await expect(region.getByRole('article')).toHaveCount(external === 'add' ? 2 : 1);
    await expect(checkbox(edit === 'add' ? 2 : 0)).toBeChecked({ checked: edit === 'add' }); await expect(pending).toBeVisible();
    await expect(editor).toContainText(content); await expect(page.getByLabel('ノート名（必須）')).toHaveValue(title); await expect(page.getByLabel('資料URL（必須）')).toHaveValue('https://example.com/rebase-unregistered');
    const confirmedIds = external === 'add' ? [nodes[0].id, nodes[1].id] : [nodes[0].id];
    let saved = await (await request.get(`/api/documents/${documentId}`)).json(); expect(saved.nodeIds.sort()).toEqual(confirmedIds.sort()); expect(saved.content).toBe('保存済み本文。');
    await page.unroute(`**/api/documents/${documentId}?*`); await page.getByRole('button', { name: '保存を再試行', exact: true }).click(); await expect(page.getByText('保存済み', { exact: true })).toBeVisible();
    saved = await (await request.get(`/api/documents/${documentId}`)).json(); expect(saved.nodeIds.sort()).toEqual(confirmedIds.sort()); expect(saved.content).toBe(content); await expect(pending).toBeVisible();
    let warnings = 0; page.on('dialog', async (dialog) => { warnings++; await dialog.dismiss(); }); await page.getByRole('link', { name: 'ホーム', exact: true }).click(); expect(warnings).toBe(1); await expect(page).toHaveURL(new RegExp(`/documents/${documentId}$`));
    await region.getByRole('button', { name: '関連を保存', exact: true }).click(); await expect(pending).toHaveCount(0);
    const expected = edit === 'add' ? [...confirmedIds, nodes[2].id] : confirmedIds.filter((id) => id !== nodes[0].id);
    saved = await (await request.get(`/api/documents/${documentId}`)).json(); expect(saved.nodeIds.sort()).toEqual(expected.sort()); expect(saved.content).toBe(content); expect(saved.document.title).toBe(title);
    await page.getByLabel('資料URL（必須）').fill(''); await page.getByRole('link', { name: 'ホーム', exact: true }).click(); await expect(page).toHaveURL(/\/workspaces\/default$/); expect(warnings).toBe(1);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await other?.close(); if (documentId) await request.delete(`/api/documents/${documentId}`); if (mapId) await request.delete(`/api/roadmaps/${mapId}`); }
});

for (const submission of ['add', 'remove'] as const) test(`confirmed lost ${submission} response retains a later inverse choice`, async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 }); let mapId = ''; let documentId = ''; let writes = 0;
  try {
    const { roadmap } = await (await request.post('/api/roadmaps', { data: { title: `送信後の選択 ${submission}` } })).json(); mapId = roadmap.id;
    const nodes: { id: string; title: string }[] = [];
    for (const name of ['A', 'B', 'C']) nodes.push((await (await request.post('/api/nodes', { data: { roadmapId: mapId, title: name } })).json()).node);
    const initialIds = submission === 'add' ? [nodes[0].id] : [nodes[0].id, nodes[1].id];
    const { document } = await (await request.post('/api/documents', { data: { title: '送信後の選択を保持', content: '人間の本文。', nodeIds: initialIds } })).json(); documentId = document.id;
    await page.route(`**/api/documents/${documentId}/nodes?*`, async (route) => { if (route.request().method() !== 'PATCH') return route.continue(); writes++; await route.fetch(); await route.abort(); });
    await page.goto(`/workspaces/default/documents/${documentId}`); await openNotePanels(page); const region = page.getByRole('region', { name: '関連する学習項目と目標', exact: true }); await region.getByText('学習項目の関連を変更', { exact: true }).click();
    const b = region.getByRole('checkbox', { name: `${roadmap.title} / B`, exact: true }); const c = region.getByRole('checkbox', { name: `${roadmap.title} / C`, exact: true });
    await b.setChecked(submission === 'add'); await region.getByRole('button', { name: '関連を保存', exact: true }).click(); await expect(region.getByRole('alert')).toContainText('通信できませんでした');
    await b.setChecked(submission !== 'add'); await c.check();
    await page.getByRole('button', { name: '最新の保存内容を確認', exact: true }).click(); await expect(page.getByRole('region', { name: '最新の保存内容', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '確認した内容を基準に再試行', exact: true }).click();
    await expect(region.getByText('関連の保存結果を確認しました。', { exact: true })).toBeVisible(); await expect(region.getByRole('alert')).toHaveCount(0); await expect(b).toBeChecked({ checked: submission !== 'add' }); await expect(c).toBeChecked();
    await expect(region.getByText('関連の変更は未保存です。「関連を保存」で確定してください。', { exact: true })).toBeVisible(); expect(writes).toBe(1);
    const committedIds = submission === 'add' ? [nodes[0].id, nodes[1].id] : [nodes[0].id];
    let saved = await (await request.get(`/api/documents/${documentId}`)).json(); expect(saved.nodeIds.sort()).toEqual(committedIds.sort()); expect(saved.content).toBe('人間の本文。');
    await page.unroute(`**/api/documents/${documentId}/nodes?*`); await region.getByRole('button', { name: '関連を保存', exact: true }).click(); await expect(region.getByText('関連の変更は未保存です。「関連を保存」で確定してください。', { exact: true })).toHaveCount(0);
    saved = await (await request.get(`/api/documents/${documentId}`)).json(); expect(saved.nodeIds.sort()).toEqual([...initialIds, nodes[2].id].sort()); expect(saved.content).toBe('人間の本文。'); expect(writes).toBe(1);
  } finally { await page.unrouteAll({ behavior: 'wait' }); if (documentId) await request.delete(`/api/documents/${documentId}`); if (mapId) await request.delete(`/api/roadmaps/${mapId}`); }
});
