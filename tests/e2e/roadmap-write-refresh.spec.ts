import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('a committed map save stays successful after one failed view refresh', async ({ page, request }, testInfo) => {
  const { roadmap } = await (await request.post('/api/roadmaps', { data: { title: '保存後再取得の初期名' } })).json();
  const newTitle = '保存された新しい地図名';
  let committed = false; let refreshGets = 0;
  await page.route(`**/api/roadmaps/${roadmap.id}?*`, async (route) => {
    if (route.request().method() === 'PATCH') {
      const response = await route.fetch(); committed = response.ok(); return route.fulfill({ response });
    }
    if (route.request().method() === 'GET' && committed) {
      refreshGets++;
      if (refreshGets === 1) return route.abort();
    }
    return route.continue();
  });
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    const title = page.getByLabel('マップ名（必須）'); await expect(title).toHaveValue('保存後再取得の初期名');
    await title.fill(newTitle); await page.getByRole('button', { name: 'マップを保存' }).click();
    await expect.poll(() => refreshGets).toBeGreaterThanOrEqual(2);
    const stored = (await (await request.get(`/api/roadmaps/${roadmap.id}`)).json()).roadmap.title;
    await expect(page.getByRole('status').filter({ hasText: '保存しました' })).toBeVisible();
    const status = await page.getByRole('status').allTextContents();
    await writeFile(testInfo.outputPath('probe.json'), JSON.stringify({ committed, refreshGets, stored, status, expectedSavedTitle: newTitle, mock: true }, null, 2));
    expect(committed).toBe(true); expect(stored).toBe(newTitle);
    await expect(page.getByText('保存に失敗しました。入力を保持しています。再試行してください。')).toHaveCount(0);
    await expect(title).toHaveValue(newTitle);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/roadmaps/${roadmap.id}`); }
});

test('a committed learning-objective save stays successful after one failed view refresh', async ({ page, request }, testInfo) => {
  const { roadmap } = await (await request.post('/api/roadmaps', { data: { title: '目標保存後再取得' } })).json();
  const { node } = await (await request.post('/api/nodes', { data: { roadmapId: roadmap.id, title: '学習項目' } })).json();
  const objective = '人間が決めた学習目標';
  let committed = false; let refreshGets = 0;
  await page.route(`**/api/nodes/${node.id}?*`, async (route) => {
    if (route.request().method() === 'PATCH') { const response = await route.fetch(); committed = response.ok(); return route.fulfill({ response }); }
    return route.continue();
  });
  await page.route(`**/api/roadmaps/${roadmap.id}?*`, async (route) => {
    if (route.request().method() === 'GET' && committed) { refreshGets++; if (refreshGets === 1) return route.abort(); }
    return route.continue();
  });
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    await page.locator('.learning-card').filter({ hasText: '学習項目' }).click();
    const goal = page.getByLabel('学習目標（任意・1行1項目）'); await goal.fill(objective);
    await page.getByRole('button', { name: '学習項目を保存' }).click();
    await expect.poll(() => refreshGets).toBeGreaterThanOrEqual(2);
    const stored = (await (await request.get(`/api/roadmaps/${roadmap.id}`)).json()).nodes.find((entry: { id: string }) => entry.id === node.id).learningObjectives;
    await expect(page.getByText('保存しました', { exact: true })).toBeVisible();
    const falseFailureVisible = await page.getByText('保存に失敗しました。入力を保持しています。再試行してください。').count() > 0;
    await writeFile(testInfo.outputPath('probe.json'), JSON.stringify({ committed, refreshGets, stored, expectedObjective: objective, falseFailureVisible, mock: true }, null, 2));
    expect(committed).toBe(true); expect(stored).toEqual([objective]); expect(falseFailureVisible).toBe(false);
    await expect(goal).toHaveValue(objective);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/roadmaps/${roadmap.id}`); }
});

for (const laterTitle of ['その後に人間が書いた名前', '初期名']) test(`a saved map preserves later human edit ${laterTitle} after failed view refresh`, async ({ page, request }) => {
  const { roadmap } = await (await request.post('/api/roadmaps', { data: { title: '初期名' } })).json();
  let committed = false; let failedReads = 0; let allowRefresh = false;
  await page.route(`**/api/roadmaps/${roadmap.id}?*`, async (route) => {
    if (route.request().method() === 'PATCH') { const response = await route.fetch(); committed = response.ok(); return route.fulfill({ response }); }
    if (route.request().method() === 'GET' && committed && !allowRefresh) { failedReads++; return route.abort(); }
    return route.continue();
  });
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    const title = page.getByLabel('マップ名（必須）'); await title.fill('サーバーに保存済み');
    await page.getByRole('button', { name: 'マップを保存' }).click();
    await expect.poll(() => failedReads).toBeGreaterThanOrEqual(2);
    await expect(page.getByText('変更は保存されましたが、最新の表示を取得できませんでした。再取得してください。')).toBeVisible();
    await expect(page.getByText('保存しました', { exact: true })).toBeVisible();
    expect((await (await request.get(`/api/roadmaps/${roadmap.id}`)).json()).roadmap.title).toBe('サーバーに保存済み');
    await title.fill(laterTitle);
    await expect(page.getByText('未保存の変更', { exact: true })).toBeVisible();
    allowRefresh = true; await page.getByRole('button', { name: '最新の表示を再取得' }).click();
    await expect(page.getByText('変更は保存されましたが、最新の表示を取得できませんでした。再取得してください。')).toHaveCount(0);
    await expect(title).toHaveValue(laterTitle);
    await expect(page.getByText('未保存の変更', { exact: true })).toBeVisible();
    expect((await (await request.get(`/api/roadmaps/${roadmap.id}`)).json()).roadmap.title).toBe('サーバーに保存済み');
  } finally { await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/roadmaps/${roadmap.id}`); }
});

test('a rejected map PATCH is not reported as saved', async ({ page, request }) => {
  const { roadmap } = await (await request.post('/api/roadmaps', { data: { title: '元の名前' } })).json();
  await page.route(`**/api/roadmaps/${roadmap.id}?*`, (route) => route.request().method() === 'PATCH' ? route.fulfill({ status: 500, json: { error: 'private stack' } }) : route.continue());
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    const title = page.getByLabel('マップ名（必須）'); await title.fill('保存されない名前');
    await page.getByRole('button', { name: 'マップを保存' }).click();
    await expect(page.getByText('保存に失敗しました。入力を保持しています。再試行してください。')).toBeVisible();
    await expect(page.getByText('変更は保存されましたが、最新の表示を取得できませんでした。再取得してください。')).toHaveCount(0);
    await expect(title).toHaveValue('保存されない名前');
    expect((await (await request.get(`/api/roadmaps/${roadmap.id}`)).json()).roadmap.title).toBe('元の名前');
  } finally { await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/roadmaps/${roadmap.id}`); }
});

test('a learning objective edited back to its pre-save value stays protected during read recovery', async ({ page, request }) => {
  const { roadmap } = await (await request.post('/api/roadmaps', { data: { title: '目標のABA保持' } })).json();
  const { node } = await (await request.post('/api/nodes', { data: { roadmapId: roadmap.id, title: '項目', learningObjectives: ['初期目標'] } })).json();
  let committed = false; let allowRefresh = false;
  await page.route(`**/api/nodes/${node.id}?*`, async (route) => {
    if (route.request().method() === 'PATCH') { const response = await route.fetch(); committed = response.ok(); return route.fulfill({ response }); }
    return route.continue();
  });
  await page.route(`**/api/roadmaps/${roadmap.id}?*`, (route) => route.request().method() === 'GET' && committed && !allowRefresh ? route.abort() : route.continue());
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    await page.locator('.learning-card').filter({ hasText: '項目' }).click();
    const goal = page.getByLabel('学習目標（任意・1行1項目）'); await goal.fill('保存済み目標');
    await page.getByRole('button', { name: '学習項目を保存' }).click();
    await expect(page.getByRole('button', { name: '最新の表示を再取得' })).toBeEnabled();
    await goal.fill('初期目標'); await expect(page.getByText('未保存の変更', { exact: true })).toBeVisible();
    allowRefresh = true; await page.getByRole('button', { name: '最新の表示を再取得' }).click();
    await expect(page.getByRole('button', { name: '最新の表示を再取得' })).toHaveCount(0);
    await expect(goal).toHaveValue('初期目標'); await expect(page.getByText('未保存の変更', { exact: true })).toBeVisible();
    const stored = (await (await request.get(`/api/roadmaps/${roadmap.id}`)).json()).nodes.find((entry: { id: string }) => entry.id === node.id);
    expect(stored.learningObjectives).toEqual(['保存済み目標']);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/roadmaps/${roadmap.id}`); }
});

test('a confirmed connection POST is not repeated because its first view refresh failed', async ({ page, request }) => {
  const { roadmap } = await (await request.post('/api/roadmaps', { data: { title: '接続の再取得' } })).json();
  await request.post('/api/nodes', { data: { roadmapId: roadmap.id, title: '元' } });
  await request.post('/api/nodes', { data: { roadmapId: roadmap.id, title: '先' } });
  let committed = false; let posts = 0; let refreshGets = 0;
  await page.route('**/api/edges?*', async (route) => {
    if (route.request().method() === 'POST') { posts++; const response = await route.fetch(); committed = response.ok(); return route.fulfill({ response }); }
    return route.continue();
  });
  await page.route(`**/api/roadmaps/${roadmap.id}?*`, async (route) => {
    if (route.request().method() === 'GET' && committed) { refreshGets++; if (refreshGets === 1) return route.abort(); }
    return route.continue();
  });
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    await page.getByRole('combobox', { name: '接続元', exact: true }).selectOption({ label: '元' });
    await page.getByRole('combobox', { name: '接続先', exact: true }).selectOption({ label: '先' });
    await page.getByRole('button', { name: '接続を追加' }).click();
    await expect.poll(() => refreshGets).toBeGreaterThanOrEqual(2);
    await expect(page.locator('summary')).toHaveText('接続一覧 (1)');
    expect(posts).toBe(1);
    expect((await (await request.get(`/api/roadmaps/${roadmap.id}`)).json()).edges).toHaveLength(1);
    await expect(page.getByText('変更は保存されましたが、最新の表示を取得できませんでした。再取得してください。')).toHaveCount(0);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/roadmaps/${roadmap.id}`); }
});
