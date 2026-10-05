import { openNotePanels } from "./manual-note-fixture";
import { expect, test as base } from '@playwright/test';
type Note = {
    id: string;
    title: string;
    body: string;
};
const test = base.extend<{
    note: Note;
}>({ note: async ({ request }, use) => {
        const title = `人間の本文保存-${crypto.randomUUID()}`;
        const body = '人間が自分で書いた認証と認可の理解。';
        const { document } = await (await request.post('/api/documents', { data: { title, content: body } })).json();
        try {
            await use({ id: document.id, title, body });
        }
        finally {
            await request.delete(`/api/documents/${document.id}`);
        }
    } });
const quoteText = '人間が選んだ引用の文章。';

test('known input rejection retains direct explicit retry without uncertain-outcome confirmation', async ({ page, request, note }) => {
    await page.clock.install(); await page.clock.pauseAt(new Date());
    let puts = 0;
    await page.route(`**/api/documents/${note.id}?*`, route => {
        if (route.request().method() !== 'PUT') return route.continue();
        puts++;
        if (puts === 1) return route.fulfill({ status: 400, json: { error: 'private validation detail' } });
        return route.continue();
    });
    await page.goto(`/workspaces/default/documents/${note.id}`); await openNotePanels(page);
    await page.getByRole('button', { name: '編集', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Markdown本文' });
    await editor.click(); await editor.press('ControlOrMeta+End'); await editor.pressSequentially(' 人間の保存待ちの考察。');
    await page.clock.runFor(1000);
    await expect(page.getByRole('alert')).toContainText('入力内容を確認');
    await expect(page.getByRole('alert')).not.toContainText('private');
    await expect(page.getByText('保存結果は不明です', { exact: true })).toHaveCount(0);
    await page.clock.runFor(45000); expect(puts).toBe(1);
    await page.getByRole('button', { name: '保存を再試行', exact: true }).click();
    await expect(page.getByText('保存済み', { exact: true })).toBeVisible();
    expect(puts).toBe(2);
    expect((await (await request.get(`/api/documents/${note.id}`)).json()).content).toContain('人間の保存待ちの考察。');
});
for (const operation of ['save', 'quote'] as const)
    test(`${operation} deadline releases busy but holds replay until GET and deliberate baseline confirmation`, async ({ page, context, request, note }) => {
        await page.clock.install();
        await page.clock.pauseAt(new Date());
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        let puts = 0;
        let quotePosts = 0;
        let held = false;
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        await page.route(/\/api\/documents(?:\/|\?)/, async (route) => { const url = new URL(route.request().url()); const save = url.pathname === `/api/documents/${note.id}` && route.request().method() === 'PUT'; const quote = url.pathname === `/api/documents/${note.id}/quotes` && route.request().method() === 'POST'; if (!save && !quote)
            return route.continue(); if (save)
            puts++;
        else
            quotePosts++; const response = await route.fetch(); expect(response.status()).toBe(save ? 200 : 201); if (operation === 'save' && puts > 1 || operation === 'quote' && save)
            return route.fulfill({ response }); held = true; await gate; await route.fulfill({ response }).catch(() => { }); });
        try {
            await page.goto(`/workspaces/default/documents/${note.id}`); await openNotePanels(page);
            await page.getByRole('button', { name: '編集', exact: true }).click();
            const editor = page.getByRole('textbox', { name: 'Markdown本文' });
            await editor.click();
            await editor.press('ControlOrMeta+End');
            if (operation === 'save') {
                await editor.pressSequentially(' 最初の送信内容。');
                await page.clock.runFor(1000);
            }
            else {
                await page.evaluate(text => navigator.clipboard.writeText(text), quoteText);
                await editor.press('ControlOrMeta+V');
                const dialog = page.getByRole('dialog');
                await dialog.getByLabel('出典URL（必須）').fill('https://example.com/quote-deadline');
                await dialog.getByLabel('出典名（任意）').fill('人間の出典');
                await dialog.getByRole('button', { name: '引用を追加', exact: true }).click();
            }
            await expect.poll(() => held).toBe(true);
            const committed = await (await request.get(`/api/documents/${note.id}`)).json();
            expect(committed.content).toContain(operation === 'save' ? '最初の送信内容。' : quoteText);
            await page.clock.runFor(19999);
            await expect(page.getByText('保存中…', { exact: true })).toBeVisible();
            await page.clock.runFor(1);
            await expect(page.getByText('保存結果は不明です', { exact: true })).toBeVisible();
            if (operation === 'quote') {
                const dialog = page.getByRole('dialog');
                await expect(dialog.getByRole('button', { name: '引用を追加', exact: true })).toBeDisabled();
                await expect(dialog.getByLabel('出典名（任意）')).toHaveValue('人間の出典');
                await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
                await expect(editor).not.toContainText(quoteText);
            }
            await editor.click();
            await editor.press('ControlOrMeta+End');
            await editor.pressSequentially(' 後で人間が書いた未保存の考察。');
            await page.getByLabel('ノート名（必須）').fill('人間の後の名前');
            const retry = page.getByRole('button', { name: '保存を再試行', exact: true });
            await expect(retry).toBeDisabled();
            await expect(page.getByRole('button', { name: 'ノートを削除', exact: true })).toBeDisabled();
            await page.getByText('学習項目の関連を変更', { exact: true }).click();
            await expect(page.getByRole('button', { name: '関連を保存', exact: true })).toBeDisabled();
            const optionsRead = page.getByRole('button', { name: '学習項目と目標を再取得', exact: true });
            await expect(optionsRead).toBeEnabled();
            await optionsRead.click();
            await expect(page.getByRole('button', { name: '関連を保存', exact: true })).toBeDisabled();
            await page.clock.runFor(45000);
            expect(puts).toBe(operation === 'save' ? 1 : 0);
            expect(quotePosts).toBe(operation === 'quote' ? 1 : 0);
            await page.getByRole('button', { name: '最新の保存内容を確認', exact: true }).click();
            const latest = page.getByRole('region', { name: '最新の保存内容', exact: true });
            await expect(latest).toContainText(committed.content);
            await expect(latest).toContainText('成功・失敗は確定しません');
            await expect(editor).toContainText('後で人間が書いた未保存の考察。');
            await expect(retry).toBeDisabled();
            const acknowledge = latest.getByRole('button', { name: '確認した内容を基準に再試行', exact: true });
            page.once('dialog', dialog => dialog.dismiss());
            await acknowledge.click();
            await expect(retry).toBeDisabled();
            page.once('dialog', dialog => dialog.accept());
            await acknowledge.click();
            await expect(retry).toBeEnabled();
            await page.clock.runFor(10000);
            expect(puts).toBe(operation === 'save' ? 1 : 0);
            expect(quotePosts).toBe(operation === 'quote' ? 1 : 0);
            await retry.click();
            await expect(page.getByText('保存済み', { exact: true })).toBeVisible();
            release();
            await page.unrouteAll({ behavior: 'wait' });
            await expect(editor).toContainText('後で人間が書いた未保存の考察。');
            await expect(page.getByLabel('ノート名（必須）')).toHaveValue('人間の後の名前');
            expect(puts).toBe(operation === 'save' ? 2 : 1);
            expect(quotePosts).toBe(operation === 'quote' ? 1 : 0);
            const saved = await (await request.get(`/api/documents/${note.id}`)).json();
            expect(saved.content).toContain('後で人間が書いた未保存の考察。');
            expect(saved.document.title).toBe('人間の後の名前');
            await page.clock.runFor(10000);
            expect(puts).toBe(operation === 'save' ? 2 : 1);
        }
        finally {
            release();
            await page.unrouteAll({ behavior: 'wait' });
        }
    });
test('a lost forced save stays protected even when the human draft is clean and GET matches it', async ({ page, request, note }) => {
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    let puts = 0;
    await page.route(`**/api/documents/${note.id}?*`, async (route) => { if (route.request().method() !== 'PUT')
        return route.continue(); puts++; const response = await route.fetch(); expect(response.status()).toBe(200); return route.abort(); });
    await page.goto(`/workspaces/default/documents/${note.id}`); await openNotePanels(page);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('保存結果は不明です', { exact: true })).toBeVisible();
    let warned = false;
    page.once('dialog', async (dialog) => { warned = true; await dialog.dismiss(); });
    await page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('link', { name: 'ノート', exact: true }).click();
    expect(warned).toBe(true);
    await expect(page).toHaveURL(new RegExp(`/documents/${note.id}$`));
    await page.getByRole('button', { name: '最新の保存内容を確認', exact: true }).click();
    await expect(page.getByRole('region', { name: '最新の保存内容' })).toContainText(note.body);
    await expect(page.getByRole('button', { name: '保存を再試行', exact: true })).toBeDisabled();
    await page.clock.runFor(45000);
    expect(puts).toBe(1);
    expect((await (await request.get(`/api/documents/${note.id}`)).json()).content).toBe(note.body);
});
test('malformed quote success never applies replacement prose, retains source inputs and native Undo', async ({ page, context, request, note }) => {
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    let posts = 0;
    await page.route(`**/api/documents/${note.id}/quotes?*`, async (route) => { posts++; const response = await route.fetch(); expect(response.status()).toBe(201); const payload = await response.json(); payload.content = 'private wrong replacement'; return route.fulfill({ response, json: payload }); });
    await page.goto(`/workspaces/default/documents/${note.id}`); await openNotePanels(page);
    await page.getByRole('button', { name: '編集', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Markdown本文' });
    await editor.click();
    await editor.press('ControlOrMeta+End');
    await editor.pressSequentially(' 人間の引用前の追記。');
    await page.evaluate(text => navigator.clipboard.writeText(text), quoteText);
    await editor.press('ControlOrMeta+V');
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('出典URL（必須）').fill('https://example.com/uncertain-quote');
    await dialog.getByLabel('出典名（任意）').fill('人間が指定した出典');
    await dialog.getByRole('button', { name: '引用を追加', exact: true }).click();
    await expect(page.getByText('保存結果は不明です', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('alert')).not.toContainText('private');
    await expect(dialog.getByRole('button', { name: '引用を追加', exact: true })).toBeDisabled();
    await expect(dialog.getByLabel('出典名（任意）')).toHaveValue('人間が指定した出典');
    await dialog.locator('form').evaluate((form: HTMLFormElement) => form.requestSubmit());
    expect(posts).toBe(1);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(editor).toContainText('人間の引用前の追記。');
    await expect(editor).not.toContainText(quoteText);
    await expect(editor).not.toContainText('private wrong replacement');
    await editor.press('ControlOrMeta+Z');
    await expect(editor).toHaveText(note.body);
    await editor.press('ControlOrMeta+Shift+Z');
    await expect(editor).toContainText('人間の引用前の追記。');
    await page.clock.runFor(45000);
    expect(posts).toBe(1);
    const saved = await (await request.get(`/api/documents/${note.id}`)).json();
    expect(saved.content).toContain(quoteText);
    expect(saved.content).toContain('人間の引用前の追記。');
});
test('latest GET timeout and late snapshot cannot unlock or replace newer baseline and human drafts', async ({ page, request, note }) => {
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    let lost = false;
    let puts = 0;
    let reads = 0;
    let held = false;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**/api/documents/${note.id}?*`, async (route) => { if (route.request().method() === 'PUT') {
        puts++;
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        lost = true;
        return route.abort();
    } if (!lost)
        return route.continue(); reads++; const response = await route.fetch(); if (reads !== 1)
        return route.fulfill({ response }); held = true; await gate; await route.fulfill({ response }).catch(() => { }); });
    try {
        await page.goto(`/workspaces/default/documents/${note.id}`); await openNotePanels(page);
        await page.getByRole('button', { name: '編集', exact: true }).click();
        const editor = page.getByRole('textbox', { name: 'Markdown本文' });
        await editor.click();
        await editor.press('ControlOrMeta+End');
        await editor.pressSequentially(' 最初の送信。');
        await page.getByRole('button', { name: '保存', exact: true }).click();
        await expect(page.getByText('保存結果は不明です', { exact: true })).toBeVisible();
        await editor.click();
        await editor.pressSequentially(' 人間の後のdraft。');
        await page.getByLabel('ノート名（必須）').fill('人間の後の名前');
        await page.getByRole('button', { name: '最新の保存内容を確認', exact: true }).click();
        await expect.poll(() => held).toBe(true);
        const base = await (await request.get(`/api/documents/${note.id}`)).json();
        expect((await request.put(`/api/documents/${note.id}`, { data: { content: '外部の人間の保存本文', title: note.title, baseHash: base.contentHash, baseWriteId: base.document.lastWriteId } })).status()).toBe(200);
        await page.clock.runFor(20000);
        await expect(page.getByRole('alert').filter({ hasText: 'ノートの応答が時間内' })).toBeVisible();
        await expect(page.getByRole('button', { name: '保存を再試行', exact: true })).toBeDisabled();
        await page.getByRole('button', { name: '最新の保存内容を確認', exact: true }).click();
        const latest = page.getByRole('region', { name: '最新の保存内容' });
        await expect(latest).toContainText('外部の人間の保存本文');
        release();
        await page.unrouteAll({ behavior: 'wait' });
        await expect(latest).toContainText('外部の人間の保存本文');
        await expect(editor).toContainText('人間の後のdraft。');
        await expect(page.getByLabel('ノート名（必須）')).toHaveValue('人間の後の名前');
        expect(puts).toBe(1);
        expect(reads).toBe(2);
        await expect(page.getByRole('button', { name: '保存を再試行', exact: true })).toBeDisabled();
    }
    finally {
        release();
        await page.unrouteAll({ behavior: 'wait' });
    }
});
test('a newer external write after comparison is not overwritten by the explicitly resumed stale-base save', async ({ page, request, note }) => {
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    let puts = 0;
    await page.route(`**/api/documents/${note.id}?*`, async (route) => { if (route.request().method() !== 'PUT')
        return route.continue(); puts++; if (puts > 1)
        return route.continue(); await route.fetch(); return route.abort(); });
    await page.goto(`/workspaces/default/documents/${note.id}`); await openNotePanels(page);
    await page.getByRole('button', { name: '編集', exact: true }).click();
    const editor = page.getByRole('textbox', { name: 'Markdown本文' });
    await editor.click();
    await editor.press('ControlOrMeta+End');
    await editor.pressSequentially(' 人間の送信内容。');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByText('保存結果は不明です', { exact: true })).toBeVisible();
    await editor.click();
    await editor.pressSequentially(' 人間の後の内容。');
    await page.getByRole('button', { name: '最新の保存内容を確認', exact: true }).click();
    await expect(page.getByRole('region', { name: '最新の保存内容' })).toBeVisible();
    const compared = await (await request.get(`/api/documents/${note.id}`)).json();
    expect((await request.put(`/api/documents/${note.id}`, { data: { title: note.title, content: '後で外部の人間が保存', baseHash: compared.contentHash, baseWriteId: compared.document.lastWriteId } })).status()).toBe(200);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '確認した内容を基準に再試行', exact: true }).click();
    expect(puts).toBe(1);
    await page.getByRole('button', { name: '保存を再試行', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('別の変更と競合');
    await expect(editor).toContainText('人間の後の内容。');
    expect((await (await request.get(`/api/documents/${note.id}`)).json()).content).toBe('後で外部の人間が保存');
    await page.clock.runFor(10000);
    expect(puts).toBe(2);
});
test('leaving a held write cancels its response work and cannot mutate a later document draft', async ({ page, request, note }) => {
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    const { document } = await (await request.post('/api/documents', { data: { title: `次の人間のノート-${note.id}`, content: '次の人間の保存済み本文' } })).json();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let held = false;
    let puts = 0;
    await page.route(`**/api/documents/${note.id}?*`, async (route) => { if (route.request().method() !== 'PUT')
        return route.continue(); puts++; const response = await route.fetch(); held = true; await gate; await route.fulfill({ response }).catch(() => { }); });
    try {
        await page.goto(`/workspaces/default/documents/${note.id}`); await openNotePanels(page);
        await page.getByRole('button', { name: '編集', exact: true }).click();
        const editor = page.getByRole('textbox', { name: 'Markdown本文' });
        await editor.click();
        await editor.press('ControlOrMeta+End');
        await editor.pressSequentially(' 最初のノートの保存。');
        await page.getByRole('button', { name: '保存', exact: true }).click();
        await expect.poll(() => held).toBe(true);
        const canceled = page.waitForEvent('requestfailed', { predicate: req => req.method() === 'PUT' && new URL(req.url()).pathname === `/api/documents/${note.id}` });
        page.once('dialog', dialog => dialog.accept());
        await page.getByRole('navigation', { name: 'メインメニュー' }).getByRole('link', { name: 'ノート', exact: true }).click();
        expect((await canceled).failure()?.errorText).toMatch(/abort|cancel/i);
        await page.getByRole('link', { name: document.title, exact: true }).click();
        await expect(page.getByRole('button', { name: '編集', exact: true })).toBeVisible();
        await page.clock.runFor(45000);
        await page.getByRole('button', { name: '編集', exact: true }).click();
        await editor.click();
        await editor.press('ControlOrMeta+End');
        await editor.pressSequentially(' 後の人間の未保存本文。');
        await page.getByLabel('ノート名（必須）').fill('後のノート名');
        release();
        await page.unrouteAll({ behavior: 'wait' });
        await expect(editor).toContainText('後の人間の未保存本文。');
        await expect(editor).not.toContainText('最初のノートの保存。');
        await expect(page.getByLabel('ノート名（必須）')).toHaveValue('後のノート名');
        await expect(page.getByRole('alert')).toHaveCount(0);
        expect(puts).toBe(1);
        expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe('次の人間の保存済み本文');
    }
    finally {
        release();
        await page.unrouteAll({ behavior: 'wait' });
        await request.delete(`/api/documents/${document.id}`);
    }
});
