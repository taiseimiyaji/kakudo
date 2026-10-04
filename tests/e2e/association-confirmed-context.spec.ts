import { test, expect } from './manual-note-fixture';
import type { Page } from '@playwright/test';

for (const lateOldRead of [false, true]) test(`fresh confirmed links survive cached or late older options ${lateOldRead}`, async ({ page, context, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let mapId = ''; let documentId = ''; let secondary: Page | undefined;
  let releaseOld!: () => void; const oldGate = new Promise<void>((resolve) => { releaseOld = resolve; });
  let releaseNew!: () => void; const newGate = new Promise<void>((resolve) => { releaseNew = resolve; });
  let oldHeld = false; let oldDelivered = false; let newHeld = false; let holdNew = false;
  const draftTitle = '人間が後で書いた名前'; const original = '最初に保存した人間の本文。'; const draft = '人間が後で自分で追記した本文。'; let optionReads = 0;
  try {
    const { roadmap } = await (await request.post('/api/roadmaps', { data: { title: `別画面で関連を増やす地図 ${lateOldRead}` } })).json(); mapId = roadmap.id;
    const { node: first } = await (await request.post('/api/nodes', { data: { roadmapId: mapId, title: '先に存在する項目A' } })).json();
    const { document } = await (await request.post('/api/documents', { data: { title: 'もとの名前', content: original, nodeIds: [first.id] } })).json(); documentId = document.id;
    page.on('request', (req) => { if (req.method() === 'GET' && req.url().includes(`/documents/${documentId}/node-options?`)) optionReads++; });
    await page.route(`**/api/documents/${documentId}/node-options?*`, async (route) => {
      const response = await route.fetch();
      if (lateOldRead && !oldHeld) { oldHeld = true; await oldGate; await route.fulfill({ response }); oldDelivered = true; return; }
      if (holdNew) { newHeld = true; await newGate; }
      await route.fulfill({ response });
    });
    await page.goto(`/workspaces/default/documents/${documentId}`); const region = page.getByRole('region', { name: '関連する学習項目と目標', exact: true });
    await region.getByText('学習項目の関連を変更', { exact: true }).click(); if (lateOldRead) await expect.poll(() => oldHeld).toBe(true); else await expect(region.getByRole('checkbox', { name: `${roadmap.title} / ${first.title}`, exact: true })).toBeChecked();
    await page.getByRole('button', { name: '編集', exact: true }).click(); await page.getByLabel('ノート名（必須）').fill(draftTitle);
    const editor = page.getByRole('textbox', { name: 'Markdown本文' }); await editor.click(); await editor.press('ControlOrMeta+End'); await editor.pressSequentially(draft);
    secondary = await context.newPage(); await secondary.goto(`/workspaces/default/roadmaps/${mapId}`); await secondary.getByLabel('新しい学習項目（必須）').fill('後で作る項目B'); await secondary.getByRole('button', { name: '学習項目を追加', exact: true }).click();
    await expect(secondary.getByLabel('学習項目名（必須）', { exact: true })).toHaveValue('後で作る項目B');
    const detail = await (await request.get(`/api/roadmaps/${mapId}`)).json(); const second = detail.nodes.find((node: { title: string }) => node.title === '後で作る項目B'); expect(second).toBeTruthy();
    await secondary.goto(`/workspaces/default/documents/${documentId}`); const otherRegion = secondary.getByRole('region', { name: '関連する学習項目と目標', exact: true }); await otherRegion.getByText('学習項目の関連を変更', { exact: true }).click();
    await otherRegion.getByRole('checkbox', { name: `${roadmap.title} / ${second.title}`, exact: true }).check(); await otherRegion.getByRole('button', { name: '関連を保存', exact: true }).click(); await expect(otherRegion.getByText('関連を更新しました。本文は保持されています。', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '保存', exact: true }).click(); await expect(page.getByRole('alert').filter({ hasText: '別の変更と競合しました' })).toBeVisible();
    await page.getByRole('button', { name: '最新の保存内容を確認', exact: true }).click(); await expect(page.getByRole('region', { name: '最新の保存内容', exact: true })).toBeVisible();
    holdNew = true; await page.getByRole('button', { name: '確認した内容を基準に再試行', exact: true }).click();
    await expect(page.getByLabel('ノート名（必須）')).toHaveValue(draftTitle); await expect(editor).toContainText(original + draft);
    await page.getByRole('button', { name: '保存を再試行', exact: true }).click(); await expect(page.getByText('保存済み', { exact: true })).toBeVisible();
    const saved = await (await request.get(`/api/documents/${documentId}`)).json(); expect(saved.nodeIds.sort()).toEqual([first.id, second.id].sort()); expect(saved.document.title).toBe(draftTitle); expect(saved.content).toBe(original + draft);
    if (lateOldRead) { releaseOld(); await expect.poll(() => oldDelivered).toBe(true); }
    await expect(region.getByRole('article')).toHaveCount(2);
    await expect(region.getByText('関連の変更は未保存です。「関連を保存」で確定してください。', { exact: true })).toHaveCount(0);
    await expect.poll(() => newHeld).toBe(true);
    releaseNew(); await expect(region.getByRole('checkbox', { name: `${roadmap.title} / ${second.title}`, exact: true })).toBeChecked();
    const pending = await region.getByText('関連の変更は未保存です。「関連を保存」で確定してください。', { exact: true }).count() > 0;
    const renderedArticles = await region.getByRole('article').count(); const secondCandidateCount = await region.getByRole('checkbox', { name: `${roadmap.title} / ${second.title}`, exact: true }).count();
    expect(pending).toBe(false); expect(renderedArticles).toBe(2); expect(secondCandidateCount).toBe(1); expect(optionReads).toBe(2);
    let warnings = 0; page.on('dialog', async (dialog) => { warnings++; await dialog.dismiss(); }); await page.getByRole('link', { name: 'ホーム', exact: true }).click();
    await expect(page).toHaveURL(/\/workspaces\/default$/); expect(warnings).toBe(0);
  } finally { releaseOld(); releaseNew(); await page.unrouteAll({ behavior: 'wait' }); await secondary?.close(); if (documentId) await request.delete(`/api/documents/${documentId}`); if (mapId) await request.delete(`/api/roadmaps/${mapId}`); }
});
