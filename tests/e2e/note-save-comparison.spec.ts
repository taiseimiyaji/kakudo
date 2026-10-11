import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { openNotePanels } from './manual-note-fixture';

for (const width of [390, 1440]) test(`read-only comparison preserves long human input, selection and save boundaries at ${width}`, async ({ page, request }, info) => {
  await page.setViewportSize({ width, height: 1000 });
  await page.clock.install(); await page.clock.pauseAt(new Date());
  const { roadmap } = await (await request.post('/api/roadmaps', { data: { title: `比較-${crypto.randomUUID()}` } })).json();
  const nodes: Array<{ id: string; title: string }> = [];
  for (const title of ['画面で確定していたA', '人間が未保存で選ぶB', '最新保存で確定したC']) nodes.push((await (await request.post('/api/nodes', { data: { roadmapId: roadmap.id, title } })).json()).node);
  const body = 'alpha\n' + ('人間の理解を長いノートに記す。認証と認可を区別し、資料と自分の考察を見比べる。\n').repeat(110);
  const { document } = await (await request.post('/api/documents', { data: { title: '画面の元の名前', content: body, nodeIds: [nodes[0].id] } })).json();
  const path = `/api/documents/${document.id}`;
  const initial = await (await request.get(path)).json();
  const quote = await request.post(`${path}/quotes`, { data: { text: '人間が選んだ引用の原文', sourceUrl: 'https://example.com/owned-reference', sourceTitle: '人間の出典', content: body, title: initial.document.title, from: body.length, to: body.length, baseHash: initial.contentHash, baseWriteId: initial.document.lastWriteId } }); expect(quote.status()).toBe(201);
  const before = await (await request.get(path)).json();
  const puts: Array<{ baseHash: string; baseWriteId: string; status: number }> = [];
  let reads = 0; let otherWrites = 0;
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith(path) && ['POST', 'PATCH'].includes(r.method())) otherWrites++; });
  await page.route(`**${path}?*`, async route => {
    if (route.request().method() === 'GET') { reads++; return route.continue(); }
    if (route.request().method() !== 'PUT') return route.continue();
    const payload = route.request().postDataJSON(); const response = await route.fetch(); puts.push({ ...payload, status: response.status() }); await route.fulfill({ response });
  });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`); await openNotePanels(page); await page.getByRole('button', { name: '編集', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Markdown本文' }); const identity = await editor.elementHandle();
    await page.getByLabel('ノート名（必須）').fill('人間が入力中の名前');
    const suffix = ' 人間が続けて書いた未保存の考察。'; await editor.press('ControlOrMeta+End'); await editor.pressSequentially(suffix);
    const humanContent = before.content + suffix;
    const associations = page.getByRole('region', { name: '関連する学習項目と目標', exact: true }); await associations.getByText('学習項目の関連を変更', { exact: true }).click();
    await associations.getByRole('checkbox', { name: `${roadmap.title} / ${nodes[1].title}`, exact: true }).check();
    const external = await request.put(path, { data: { title: '外部で保存した名前', content: before.content + '\n外部で保存した考察。', baseHash: before.contentHash, baseWriteId: before.document.lastWriteId } }); expect(external.status()).toBe(200);
    const externalSaved = await external.json(); expect((await request.patch(`${path}/nodes`, { data: { nodeIds: [nodes[2].id], baseWriteId: externalSaved.document.lastWriteId } })).status()).toBe(200);
    const latest = await (await request.get(path)).json();
    await page.clock.runFor(1000); await expect(page.locator('.save-state')).toHaveText('保存できませんでした'); expect(puts.map(p => p.status)).toEqual([409]);
    await editor.press('ControlOrMeta+Home'); for (let i = 0; i < 3; i++) await editor.press('Shift+ArrowRight'); expect(await page.evaluate(() => getSelection()?.toString())).toBe('alp');
    await page.getByRole('button', { name: '最新の保存内容を確認', exact: true }).click();
    const recovery = page.getByRole('region', { name: '最新の保存内容', exact: true }); const compare = recovery.getByRole('button', { name: '現在の入力と比べる', exact: true });
    await expect(compare).toHaveAttribute('aria-expanded', 'false'); await compare.focus(); await page.keyboard.press('Enter'); await expect(compare).toHaveAttribute('aria-expanded', 'true');
    const current = recovery.getByRole('region', { name: '現在の入力', exact: true }); const fetched = recovery.getByRole('region', { name: '取得した最新保存', exact: true });
    await expect(current).toContainText('人間が入力中の名前'); expect(await current.locator('pre').textContent()).toBe(humanContent); expect(await fetched.locator('pre').textContent()).toBe(latest.content);
    await expect(current).toContainText(nodes[0].title); await expect(current).not.toContainText(nodes[1].title); await expect(current).not.toContainText(nodes[2].title); await expect(fetched).toContainText(nodes[2].title); await expect(fetched).not.toContainText(nodes[0].title);
    await expect(recovery).toContainText('未保存の関連選択は「関連を保存」で別に確定');
    const currentBox = (await current.boundingBox())!; const fetchedBox = (await fetched.boundingBox())!;
    if (width === 390) expect(fetchedBox.y).toBeGreaterThan(currentBox.y + currentBox.height - 1); else expect(fetchedBox.x).toBeGreaterThan(currentBox.x + currentBox.width - 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    // Both bounded long-text regions are keyboard reachable and scroll independently.
    await compare.focus(); await page.keyboard.press('Tab'); await expect(current.locator('pre')).toBeFocused(); expect(await current.locator('pre').evaluate(e => e.scrollHeight > e.clientHeight)).toBe(true); await page.keyboard.press('PageDown'); await expect.poll(() => current.locator('pre').evaluate(e => e.scrollTop)).toBeGreaterThan(0);
    await page.keyboard.press('Tab'); await expect(fetched.locator('pre')).toBeFocused();
    const readCount = reads; await compare.focus(); await page.keyboard.press('Space'); await expect(compare).toHaveAttribute('aria-expanded', 'false'); await page.keyboard.press('Enter'); await expect(compare).toHaveAttribute('aria-expanded', 'true');
    await page.clock.runFor(10000); expect(reads).toBe(readCount); expect(puts).toHaveLength(1); expect(otherWrites).toBe(0);
    await page.getByRole('button', { name: '編集', exact: true }).click(); await expect(editor).toBeFocused(); expect(await page.evaluate(() => getSelection()?.toString())).toBe('alp'); expect(await editor.evaluate((e, old) => e === old, identity)).toBe(true);
    await editor.pressSequentially('自分'); expect(await current.locator('pre').textContent()).toBe('自分' + humanContent.slice(3)); await editor.press('ControlOrMeta+z'); await expect.poll(() => current.locator('pre').textContent()).toBe(humanContent);
    await recovery.screenshot({ path: info.outputPath('read-only-comparison.png') });
    // Comparison did not accept a new base: retry still uses the original token and conflicts.
    await page.getByRole('button', { name: '保存を再試行', exact: true }).click(); await expect.poll(() => puts.length).toBe(2); expect(puts[1].status).toBe(409); expect(puts[1].baseHash).toBe(before.contentHash); expect(puts[1].baseWriteId).toBe(before.document.lastWriteId);
    await recovery.getByRole('button', { name: '確認した内容を基準に再試行', exact: true }).click(); await expect(page.locator('.save-state')).toHaveText('保存の再開待ち'); await page.clock.runFor(10000); expect(puts).toHaveLength(2); expect(otherWrites).toBe(0);
    await expect(associations.getByRole('checkbox', { name: `${roadmap.title} / ${nodes[1].title}`, exact: true })).toBeChecked();
    await page.getByRole('button', { name: '保存を再試行', exact: true }).click(); await expect(page.locator('.save-state')).toHaveText('保存済み'); expect(puts[2].baseHash).toBe(latest.contentHash); expect(puts[2].baseWriteId).toBe(latest.document.lastWriteId);
    const saved = await (await request.get(path)).json(); expect(saved.content).toBe(humanContent); expect(saved.document.title).toBe('人間が入力中の名前'); expect(saved.nodeIds).toEqual([nodes[2].id]); expect(otherWrites).toBe(0);
    await writeFile(info.outputPath('audit.json'), JSON.stringify({ width, realConflicts: true, fullMarkdownAndQuoteUnchanged: true, keyboardComparisonAndTextScrolling: true, editorIdentitySelectionAndNativeUndoRetained: true, comparisonReadsAndWritesZero: true, originalBaseRetainedUntilAcknowledgment: true, acknowledgmentWriteZero: true, explicitRetryUsesConfirmedBase: true, pendingNodeChoiceNotSent: true, statuses: puts.map(p => p.status) }, null, 2));
  } finally { await page.unrouteAll({ behavior: 'wait' }); await request.delete(path); await request.delete(`/api/roadmaps/${roadmap.id}`); }
});

test('unknown recovery GET failure and delayed snapshot do not overwrite input or bypass later conflicts', async ({ page, request }, info) => {
  await page.setViewportSize({ width: 390, height: 1000 }); await page.clock.install(); await page.clock.pauseAt(new Date());
  const { document } = await (await request.post('/api/documents', { data: { title: '最初の保存名', content: '人間が最初に保存した本文。' } })).json(); const path = `/api/documents/${document.id}`;
  const before = await (await request.get(path)).json(); let failPut = true; let recoveryReads = 0; let recovering = false; let held = false; let release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; });
  const puts: Array<{ baseHash: string; baseWriteId: string; status: number }> = [];
  await page.route(`**${path}?*`, async route => {
    if (route.request().method() === 'PUT') {
      const payload = route.request().postDataJSON(); if (failPut) { failPut = false; puts.push({ ...payload, status: 503 }); return route.fulfill({ status: 503, json: { error: 'Controlled unknown response' } }); }
      const response = await route.fetch(); puts.push({ ...payload, status: response.status() }); return route.fulfill({ response });
    }
    if (route.request().method() === 'GET' && recovering) {
      recoveryReads++; if (recoveryReads === 1) return route.fulfill({ status: 500, json: { error: '取得できませんでした' } });
      if (recoveryReads === 2) { const response = await route.fetch(); held = true; await hold; return route.fulfill({ response }); }
    }
    return route.continue();
  });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`); await openNotePanels(page); await page.getByRole('button', { name: '編集', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Markdown本文' }); await editor.press('ControlOrMeta+End'); await editor.pressSequentially(' 未保存の考察。');
    await page.clock.runFor(1000); await expect(page.locator('.save-state')).toHaveText('保存結果は不明です'); recovering = true;
    const check = page.getByRole('button', { name: '最新の保存内容を確認', exact: true }); await check.click(); await expect(page.getByRole('alert').last()).toContainText('ノートを読み取れませんでした'); await expect(page.getByRole('button', { name: '現在の入力と比べる', exact: true })).toHaveCount(0);
    await check.click(); await expect.poll(() => held).toBe(true); await expect(page.getByRole('button', { name: '現在の入力と比べる', exact: true })).toHaveCount(0);
    await editor.press('ControlOrMeta+End'); await editor.pressSequentially(' 取得を待つ間にも人間が書く。'); await page.getByLabel('ノート名（必須）').fill('現在の人間の名前');
    const external = await request.put(path, { data: { title: '取得後に別の保存で変更', content: '取得後の別の保存本文。', baseHash: before.contentHash, baseWriteId: before.document.lastWriteId } }); expect(external.status()).toBe(200); const later = await (await request.get(path)).json(); release();
    const recovery = page.getByRole('region', { name: '最新の保存内容', exact: true }); await recovery.getByRole('button', { name: '現在の入力と比べる', exact: true }).click();
    const current = recovery.getByRole('region', { name: '現在の入力', exact: true }); const fetched = recovery.getByRole('region', { name: '取得した最新保存', exact: true });
    const humanContent = before.content + ' 未保存の考察。 取得を待つ間にも人間が書く。'; expect(await current.locator('pre').textContent()).toBe(humanContent); await expect(current).toContainText('現在の人間の名前'); expect(await fetched.locator('pre').textContent()).toBe(before.content); await expect(fetched).toContainText('最初の保存名'); await expect(recovery).toContainText('確認時点のもの'); await expect(recovery).toContainText('成功・失敗は確定しません');
    const retry = page.getByRole('button', { name: '保存を再試行', exact: true }); await expect(retry).toBeDisabled(); const acknowledge = recovery.getByRole('button', { name: '確認した内容を基準に再試行', exact: true });
    page.once('dialog', d => d.dismiss()); await acknowledge.click(); await expect(retry).toBeDisabled(); expect(puts).toHaveLength(1);
    page.once('dialog', d => d.accept()); await acknowledge.click(); await page.clock.runFor(10000); expect(puts).toHaveLength(1); await retry.click(); await expect(page.locator('.save-state')).toHaveText('保存できませんでした'); expect(puts[1].status).toBe(409); expect((await (await request.get(path)).json())).toEqual(later);
    await check.click(); await recovery.getByRole('button', { name: '現在の入力と比べる', exact: true }).click(); expect(await fetched.locator('pre').textContent()).toBe(later.content); expect(await current.locator('pre').textContent()).toBe(humanContent);
    await recovery.screenshot({ path: info.outputPath('refreshed-comparison.png') }); await acknowledge.click(); expect(puts).toHaveLength(2); await retry.click(); await expect(page.locator('.save-state')).toHaveText('保存済み'); expect(puts[2].baseHash).toBe(later.contentHash); expect(puts[2].baseWriteId).toBe(later.document.lastWriteId); const saved = await (await request.get(path)).json(); expect(saved.content).toBe(humanContent); expect(saved.document.title).toBe('現在の人間の名前');
    await writeFile(info.outputPath('audit.json'), JSON.stringify({ getFailureNoComparison: true, delayedGETRetainsLaterInput: true, fetchedSnapshotNotClaimedLive: true, unknownResultConfirmationDismissAndAccept: true, staleSnapshotRetryActuallyConflicts: true, fullInputSavedOnlyWithFreshConfirmedBase: true, statuses: puts.map(p => p.status) }, null, 2));
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); await request.delete(path); }
});
