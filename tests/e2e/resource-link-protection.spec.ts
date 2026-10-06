import { expect, test, type Page, type APIRequestContext, type Locator } from '@playwright/test';

async function setup(page: Page, request: APIRequestContext) {
  const { document } = await (await request.post('/api/documents', { data: { title: '人間の執筆ノート', content: '人間が自分で書いた保存済みの本文。' } })).json();
  const { resource } = await (await request.post('/api/resources', { data: { url: `https://example.com/owned-selection-${crypto.randomUUID()}`, title: '人間が選ぶ資料', type: 'WEB' } })).json();
  await page.goto(`/workspaces/default/documents/${document.id}`);
  const disclosure = page.locator('[data-note-panel=resources]'); await disclosure.locator(':scope > summary').click();
  const panel = disclosure.getByRole('region', { name: '参考資料', exact: true });
  await expect(panel.getByLabel('登録済み資料')).toBeEnabled();
  await panel.getByLabel('登録済み資料').selectOption(resource.id);
  return { document, resource, panel, disclosure };
}

async function registerOther(panel: Locator, request: APIRequestContext, documentId: string, owned: string[]) {
  const url = `https://example.com/owned-other-${crypto.randomUUID()}`;
  await panel.getByLabel('資料URL').fill(url); await panel.getByLabel('資料名（任意）').fill('人間が登録する別の資料');
  await panel.getByRole('button', { name: '資料を登録', exact: true }).click();
  await expect(panel.getByRole('listitem').filter({ hasText: '人間が登録する別の資料' })).toBeVisible();
  await expect(panel.getByRole('button', { name: '資料を登録', exact: true })).toBeEnabled();
  const stored = await (await request.get(`/api/documents/${documentId}/resources`)).json();
  const resource = stored.resources.find((item: { url: string }) => item.url === url);
  expect(resource).toBeDefined(); owned.push(resource.id);
}

test('a selected existing resource stays protected when its note panel is closed', async ({ page, request }) => {
  await page.clock.install(); await page.clock.pauseAt(new Date());
  const { document, resource, panel, disclosure } = await setup(page, request);
  try {
    await page.getByRole('button', { name: '編集', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Markdown本文' }); const identity = await editor.elementHandle();
    const body = '人間が自分で書いた保存済みの本文。'; const draft = ' 人間が書いた次の考察。';
    await editor.press('ControlOrMeta+End'); await editor.pressSequentially(draft);
    await page.getByLabel('ノート名（必須）').fill('人間が保存した次の名前');
    await page.getByRole('button', { name: '保存', exact: true }).click(); await expect(page.locator('.save-state')).toHaveText('保存済み');
    await disclosure.locator(':scope > summary').click();
    let warned = false; page.once('dialog', async dialog => { warned = true; await dialog.dismiss(); });
    await page.getByRole('link', { name: '← 学習マップ', exact: true }).click();
    expect(warned).toBe(true); await expect(page).toHaveURL(new RegExp(`/documents/${document.id}$`));
    await expect(disclosure.locator(':scope > summary')).toContainText('未確定の変更');
    let reloadWarned = false; page.once('dialog', async dialog => { reloadWarned = true; await dialog.dismiss(); });
    await page.reload({ timeout: 2000 }).catch(() => {}); expect(reloadWarned).toBe(true);
    expect(await editor.evaluate((element, old) => element === old, identity)).toBe(true);
    await expect(editor).toContainText(body + draft); await expect(page.getByLabel('ノート名（必須）')).toHaveValue('人間が保存した次の名前');
    await editor.press('ControlOrMeta+z'); await expect.poll(() => editor.innerText()).toBe(body);
    await editor.press('ControlOrMeta+Shift+z'); await expect.poll(() => editor.innerText()).toBe(body + draft);
    await page.getByRole('button', { name: '保存', exact: true }).click(); await expect(page.locator('.save-state')).toHaveText('保存済み');
    await disclosure.locator(':scope > summary').click(); await expect(panel.getByLabel('登録済み資料')).toHaveValue(resource.id);
    await panel.getByLabel('登録済み資料').selectOption('');
    await expect(disclosure.locator(':scope > summary')).not.toContainText('未確定の変更');
    await page.getByRole('link', { name: '← 学習マップ', exact: true }).click(); await expect(page).toHaveURL(/\/roadmaps$/);
  } finally { await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/resources/${resource.id}`); }
});

for (const committed of [false, true]) test(`an existing resource link remains protected ${committed ? 'after' : 'before'} commit while the response waits`, async ({ page, request }) => {
  await page.clock.install(); await page.clock.pauseAt(new Date());
  const { document, resource, panel, disclosure } = await setup(page, request);
  const owned: string[] = [];
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let held = false; let posts = 0;
  await page.route(`**/api/documents/${document.id}/resources?*`, async route => {
    if (route.request().method() !== 'POST' || route.request().postDataJSON()?.resourceId !== resource.id) return route.continue();
    posts++; const response = committed ? await route.fetch() : undefined; held = true;
    await gate; const final = response ?? await route.fetch(); await route.fulfill({ response: final }).catch(() => {});
  });
  try {
    await panel.getByRole('button', { name: '資料を関連付け', exact: true }).click(); await expect.poll(() => held).toBe(true);
    await page.clock.runFor(45000); expect(posts).toBe(1);
    const stored = await (await request.get(`/api/documents/${document.id}`)).json(); expect(stored.content).toBe('人間が自分で書いた保存済みの本文。');
    const linked = await (await request.get(`/api/documents/${document.id}/resources`)).json(); expect(linked.resources.some((r: { id: string }) => r.id === resource.id)).toBe(committed);
    await panel.locator('form').last().evaluate((form: HTMLFormElement) => form.requestSubmit()); expect(posts).toBe(1);
    if (committed) {
      await registerOther(panel, request, document.id, owned);
      await expect(panel.getByLabel('登録済み資料')).toHaveValue('');
      await expect(panel.getByRole('button', { name: '関連付け中…', exact: true })).toBeDisabled();
    }
    await disclosure.locator(':scope > summary').click();
    let warned = false; page.once('dialog', async dialog => { warned = true; await dialog.dismiss(); });
    await page.getByRole('link', { name: '← 学習マップ', exact: true }).click();
    expect(warned).toBe(true); await expect(page).toHaveURL(new RegExp(`/documents/${document.id}$`));
    await disclosure.locator(':scope > summary').click(); await expect(panel.getByLabel('登録済み資料')).toHaveValue(committed ? '' : resource.id);
    release(); await page.unrouteAll({ behavior: 'wait' });
    await expect(panel.getByRole('listitem').filter({ hasText: resource.title })).toBeVisible();
    await expect(panel.getByLabel('登録済み資料')).toHaveValue('');
    await expect(disclosure.locator(':scope > summary')).not.toContainText('未確定の変更');
    expect(posts).toBe(1);
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/resources/${resource.id}`); for (const id of owned) await request.delete(`/api/resources/${id}`); }
});

test('finishing an existing resource link cannot clear another resource form draft protection', async ({ page, request }) => {
  const { document, resource, panel, disclosure } = await setup(page, request);
  try {
    await panel.getByLabel('資料名（任意）').fill('人間がまだ登録していない資料名');
    await panel.getByRole('button', { name: '資料を関連付け', exact: true }).click();
    await expect(panel.getByLabel('登録済み資料')).toHaveValue('');
    await expect(panel.getByRole('listitem').filter({ hasText: resource.title })).toBeVisible();
    await disclosure.locator(':scope > summary').click();
    let warned = false; page.once('dialog', async dialog => { warned = true; await dialog.dismiss(); });
    await page.getByRole('link', { name: '← 学習マップ', exact: true }).click(); expect(warned).toBe(true);
    await disclosure.locator(':scope > summary').click(); await expect(panel.getByLabel('資料名（任意）')).toHaveValue('人間がまだ登録していない資料名');
    await panel.getByLabel('資料名（任意）').fill('');
    await expect(disclosure.locator(':scope > summary')).not.toContainText('未確定の変更');
    await page.getByRole('link', { name: '← 学習マップ', exact: true }).click(); await expect(page).toHaveURL(/\/roadmaps$/);
  } finally { await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/resources/${resource.id}`); }
});

test('finishing a different resource form preserves the existing selection guard', async ({ page, request }) => {
  const { document, resource, panel, disclosure } = await setup(page, request); const owned: string[] = [];
  try {
    await registerOther(panel, request, document.id, owned);
    await expect(panel.getByLabel('資料名（任意）')).toHaveValue('');
    await expect(panel.getByLabel('登録済み資料')).toHaveValue(resource.id);
    await disclosure.locator(':scope > summary').click();
    let warned = false; page.once('dialog', async dialog => { warned = true; await dialog.dismiss(); });
    await page.getByRole('link', { name: '← 学習マップ', exact: true }).click(); expect(warned).toBe(true);
    await disclosure.locator(':scope > summary').click(); await panel.getByLabel('登録済み資料').selectOption('');
    await expect(disclosure.locator(':scope > summary')).not.toContainText('未確定の変更');
    await page.getByRole('link', { name: '← 学習マップ', exact: true }).click(); await expect(page).toHaveURL(/\/roadmaps$/);
  } finally { await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/resources/${resource.id}`); for (const id of owned) await request.delete(`/api/resources/${id}`); }
});

test('a resource form fulfilling the selected resource clears the resolved choice guard', async ({ page, request }) => {
  const { document, resource, panel, disclosure } = await setup(page, request);
  try {
    await panel.getByLabel('資料URL').fill(resource.url); await panel.getByLabel('資料名（任意）').fill(resource.title);
    await panel.getByRole('button', { name: '資料を登録', exact: true }).click();
    await expect(panel.getByRole('listitem').filter({ hasText: resource.title })).toBeVisible();
    await expect(panel.getByLabel('資料名（任意）')).toHaveValue(''); await expect(panel.getByLabel('登録済み資料')).toHaveValue('');
    await expect(disclosure.locator(':scope > summary')).not.toContainText('未確定の変更');
    const linked = await (await request.get(`/api/documents/${document.id}/resources`)).json(); expect(linked.resources.map((item: { id: string }) => item.id)).toEqual([resource.id]);
    await page.getByRole('link', { name: '← 学習マップ', exact: true }).click(); await expect(page).toHaveURL(/\/roadmaps$/);
  } finally { await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/resources/${resource.id}`); }
});

test('failed refresh retains a selection until validated GET confirms the same relation', async ({ page, request }) => {
  const { document, resource, panel, disclosure } = await setup(page, request); const owned: string[] = [];
  await request.post(`/api/documents/${document.id}/resources`, { data: { resourceId: resource.id } });
  await page.route(`**/api/documents/${document.id}/resources?*`, route => route.request().method() === 'GET' ? route.fulfill({ status: 500, json: { error: 'controlled refresh failure' } }) : route.continue());
  try {
    await registerOther(panel, request, document.id, owned);
    await expect(panel.getByRole('button', { name: '資料を再読み込み', exact: true })).toBeVisible();
    await expect(panel.getByLabel('登録済み資料')).toHaveValue(resource.id); await expect(panel.getByLabel('資料名（任意）')).toHaveValue('');
    await disclosure.locator(':scope > summary').click();
    let warned = false; page.once('dialog', async dialog => { warned = true; await dialog.dismiss(); });
    await page.getByRole('link', { name: '← 学習マップ', exact: true }).click(); expect(warned).toBe(true);
    await disclosure.locator(':scope > summary').click(); await page.unrouteAll({ behavior: 'wait' });
    await panel.getByRole('button', { name: '資料を再読み込み', exact: true }).click();
    await expect(panel.getByRole('listitem').filter({ hasText: resource.title })).toBeVisible(); await expect(panel.getByLabel('登録済み資料')).toHaveValue('');
    await expect(disclosure.locator(':scope > summary')).not.toContainText('未確定の変更');
    await page.getByRole('link', { name: '← 学習マップ', exact: true }).click(); await expect(page).toHaveURL(/\/roadmaps$/);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/resources/${resource.id}`); for (const id of owned) await request.delete(`/api/resources/${id}`); }
});

test('a known failed existing link retains the selected choice until explicit retry', async ({ page, request }) => {
  const { document, resource, panel, disclosure } = await setup(page, request); let posts = 0;
  await page.route(`**/api/documents/${document.id}/resources?*`, route => {
    if (route.request().method() !== 'POST') return route.continue();
    posts++; return posts === 1 ? route.fulfill({ status: 500, json: { error: 'controlled link failure' } }) : route.continue();
  });
  try {
    await panel.getByRole('button', { name: '資料を関連付け', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('関連付けられませんでした');
    await expect(panel.getByLabel('登録済み資料')).toHaveValue(resource.id); expect(posts).toBe(1);
    await disclosure.locator(':scope > summary').click();
    let warned = false; page.once('dialog', async dialog => { warned = true; await dialog.dismiss(); });
    await page.getByRole('link', { name: '← 学習マップ', exact: true }).click(); expect(warned).toBe(true);
    await disclosure.locator(':scope > summary').click(); await panel.getByRole('button', { name: '資料を関連付け', exact: true }).click();
    await expect(panel.getByRole('listitem').filter({ hasText: resource.title })).toBeVisible(); await expect(panel.getByLabel('登録済み資料')).toHaveValue(''); expect(posts).toBe(2);
    await expect(disclosure.locator(':scope > summary')).not.toContainText('未確定の変更');
    await page.getByRole('link', { name: '← 学習マップ', exact: true }).click(); await expect(page).toHaveURL(/\/roadmaps$/);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/resources/${resource.id}`); }
});

test('accepted node departure cannot let a late old link clear the new node choice and form guard', async ({ page, request }) => {
  const { roadmap } = await (await request.post('/api/roadmaps', { data: { title: '人間が選ぶ資料と学習項目' } })).json();
  const nodes = [];
  for (const [index, title] of ['元の項目', '次の項目'].entries()) nodes.push((await (await request.post('/api/nodes', { data: { roadmapId: roadmap.id, title, positionX: index * 320 } })).json()).node);
  const resources = [];
  for (const title of ['元の資料', '次の資料']) resources.push((await (await request.post('/api/resources', { data: { url: `https://example.com/owned-node-${crypto.randomUUID()}`, title, type: 'WEB' } })).json()).resource);
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let held = false; let delivered = false; let posts = 0;
  await page.route(`**/api/nodes/${nodes[0].id}/resources?*`, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    posts++; const response = await route.fetch(); held = true; await gate; await route.fulfill({ response }); delivered = true;
  });
  const card = (id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`); await card(nodes[0].id).click();
    const panel = page.getByRole('region', { name: '参考資料', exact: true });
    await expect(panel.getByLabel('登録済み資料')).toBeEnabled(); await panel.getByLabel('登録済み資料').selectOption(resources[0].id);
    await panel.getByRole('button', { name: '資料を関連付け', exact: true }).click(); await expect.poll(() => held).toBe(true);
    let warned = false; page.once('dialog', async dialog => { warned = true; await dialog.dismiss(); });
    await card(nodes[1].id).click(); expect(warned).toBe(true); await expect(page.getByLabel('学習項目名（必須）', { exact: true })).toHaveValue(nodes[0].title);
    page.once('dialog', dialog => dialog.accept()); await card(nodes[1].id).click();
    await expect(page.getByLabel('学習項目名（必須）', { exact: true })).toHaveValue(nodes[1].title);
    await expect(panel.getByLabel('登録済み資料')).toBeEnabled(); await panel.getByLabel('登録済み資料').selectOption(resources[1].id);
    await panel.getByLabel('資料名（任意）').fill('人間の新しい項目の入力');
    const refreshed = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === `/api/roadmaps/${roadmap.id}`);
    release(); await refreshed; await expect.poll(() => delivered).toBe(true);
    await expect(panel.getByLabel('登録済み資料')).toHaveValue(resources[1].id); await expect(panel.getByLabel('資料名（任意）')).toHaveValue('人間の新しい項目の入力'); expect(posts).toBe(1);
    await panel.getByLabel('資料名（任意）').fill('');
    warned = false; page.once('dialog', async dialog => { warned = true; await dialog.dismiss(); }); await card(nodes[0].id).click(); expect(warned).toBe(true);
    await expect(page.getByLabel('学習項目名（必須）', { exact: true })).toHaveValue(nodes[1].title);
    await panel.getByLabel('登録済み資料').selectOption(''); await card(nodes[0].id).click(); await expect(page.getByLabel('学習項目名（必須）', { exact: true })).toHaveValue(nodes[0].title);
    expect((await (await request.get(`/api/nodes/${nodes[0].id}/resources`)).json()).resources.map((item: { id: string }) => item.id)).toEqual([resources[0].id]);
    expect((await (await request.get(`/api/nodes/${nodes[1].id}/resources`)).json()).resources).toEqual([]);
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); await request.delete(`/api/roadmaps/${roadmap.id}`); for (const resource of resources) await request.delete(`/api/resources/${resource.id}`); }
});
