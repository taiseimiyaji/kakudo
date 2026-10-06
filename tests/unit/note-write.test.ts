import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { saveNote, quoteNote, NoteWriter } from '../../client/note-write';
import { UnknownNoteWriteOutcome } from '../../modules/editor/note-session';
import { quoteMarkdown } from '../../shared/quote';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const hash = (content: string) => createHash('sha256').update(content).digest('hex');
const draft = { content: 'human prose', title: 'Human note', baseHash: hash('old'), baseWriteId: 'w0' };
const quoted = { ...draft, text: 'cited words', sourceUrl: 'https://example.com/source', sourceTitle: 'Source', from: 11, to: 11 };
const document = { id: 'note', workspaceId: 'own', title: draft.title, path: 'own/docs/note.md', currentRevisionId: 'r1', lastWriteId: 'w1', createdAt: '2026', updatedAt: '2026' };
const savePayload = { document, contentHash: hash(draft.content) };
const quoteContent = draft.content + quoteMarkdown(quoted.text, quoted.sourceUrl, quoted.sourceTitle);
const quotePayload = { document, content: quoteContent, contentHash: hash(quoteContent), quoteId: 'q1' };
const call = (kind: 'save' | 'quote', signal?: AbortSignal) => kind === 'save' ? saveNote('own', 'note', draft, signal) : quoteNote('own', 'note', quoted, signal);
it.each(['save', 'quote'] as const)('valid %s response acknowledges its target/content once and clears deadline', async (kind) => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(kind === 'save' ? savePayload : quotePayload), { status: kind === 'save' ? 200 : 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const data = await call(kind);
    expect(data.contentHash).toBe(kind === 'save' ? savePayload.contentHash : quotePayload.contentHash);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe(kind === 'save' ? 'PUT' : 'POST');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).baseWriteId).toBe('w0');
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
});
it.each(['save', 'quote'] as const)('%s JSON-body timeout is unknown, aborts once and cannot acknowledge a late success', async (kind) => {
    vi.useFakeTimers();
    let finish!: (data: unknown) => void;
    const body = new Promise(resolve => { finish = resolve; });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: kind === 'save' ? 200 : 201, json: () => body });
    vi.stubGlobal('fetch', fetchMock);
    const acknowledged = vi.fn();
    const failed = vi.fn();
    const pending = call(kind);
    void pending.then(acknowledged, failed);
    const unknown = expect(pending).rejects.toBeInstanceOf(UnknownNoteWriteOutcome);
    await vi.advanceTimersByTimeAsync(19999);
    expect(failed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await unknown;
    expect(failed).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    finish(kind === 'save' ? savePayload : quotePayload);
    await vi.advanceTimersByTimeAsync(60000);
    expect(acknowledged).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('leaving a document cancels pending response work without acknowledgement or another request', async () => {
    vi.useFakeTimers();
    let finish!: (data: unknown) => void;
    const body = new Promise(resolve => { finish = resolve; });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => body });
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const acknowledged = vi.fn();
    const pending = saveNote('own', 'note', draft, controller.signal);
    void pending.then(acknowledged, () => { });
    const unknown = expect(pending).rejects.toBeInstanceOf(UnknownNoteWriteOutcome);
    controller.abort();
    await unknown;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    finish(savePayload);
    await vi.advanceTimersByTimeAsync(60000);
    expect(acknowledged).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('an already closed document cannot initiate another write', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(saveNote('own', 'note', draft, controller.signal)).rejects.toBeInstanceOf(UnknownNoteWriteOutcome);
    expect(fetchMock).not.toHaveBeenCalled();
});
it.each([400, 409, 503])('HTTP%s preserves known4xx versus unknown5xx without leaking server diagnostics', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'private storage diagnostics' }), { status })));
    try {
        await saveNote('own', 'note', draft);
        throw new Error('Expected rejection');
    }
    catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error instanceof UnknownNoteWriteOutcome).toBe(status === 503);
        expect((error as Error).message).not.toContain('private');
    }
});
it.each(['target', 'hash', 'shape', 'quote-content'])('a malformed or mismatched %s success remains unknown', async (kind) => {
    const payload = kind === 'quote-content' ? { ...quotePayload, content: 'other human body', contentHash: hash('other human body') } : kind === 'target' ? { ...savePayload, document: { ...document, id: 'other' } } : kind === 'hash' ? { ...savePayload, contentHash: hash('other body') } : { document: {} };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: kind === 'quote-content' ? 201 : 200 })));
    await expect(call(kind === 'quote-content' ? 'quote' : 'save')).rejects.toBeInstanceOf(UnknownNoteWriteOutcome);
});
it('invalid local input is a known safe validation failure without a network write', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(saveNote('own', 'note', { ...draft, title: '' })).rejects.toThrow('入力内容を確認');
    expect(fetchMock).not.toHaveBeenCalled();
});
it('effect replay can reactivate a closed writer without initiating writes while closed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(savePayload), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const writer = new NoteWriter('own', 'note');
    writer.close();
    await expect(writer.save(draft)).rejects.toBeInstanceOf(UnknownNoteWriteOutcome);
    expect(fetchMock).not.toHaveBeenCalled();
    writer.activate();
    expect((await writer.save(draft)).contentHash).toBe(savePayload.contentHash);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    writer.close();
});
it('a reactivated writer owns a new signal and cannot inherit its canceled response', async () => {
    vi.useFakeTimers();
    let finish!: (data: unknown) => void;
    const body = new Promise(resolve => { finish = resolve; });
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: () => body }).mockResolvedValue(new Response(JSON.stringify(savePayload), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const writer = new NoteWriter('own', 'note');
    const acknowledged = vi.fn();
    const old = writer.save(draft);
    void old.then(acknowledged, () => { });
    const canceled = expect(old).rejects.toBeInstanceOf(UnknownNoteWriteOutcome);
    writer.close();
    await canceled;
    writer.activate();
    expect((await writer.save(draft)).contentHash).toBe(savePayload.contentHash);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(false);
    finish(savePayload);
    await vi.advanceTimersByTimeAsync(60000);
    expect(acknowledged).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    writer.close();
});
for (const kind of ['save', 'quote'] as const) {
    it(`${kind} recovery409 is unknown without displaying server diagnostics`, async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'DOCUMENT_WRITE_OUTCOME_UNKNOWN', error: 'private recovery diagnostics' }), { status: 409 }));
        vi.stubGlobal('fetch', fetchMock);
        const error = await call(kind).catch((error: unknown) => error);
        expect(error).toBeInstanceOf(UnknownNoteWriteOutcome);
        expect((error as Error).message).not.toContain('private'); expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it.each([
        [400, 'DOCUMENT_WRITE_OUTCOME_UNKNOWN'],
        [409, 'DOCUMENT_CREATE_OUTCOME_UNKNOWN'],
        [409, undefined],
    ] as const)(`${kind} HTTP%s with code%s remains a known input/conflict rejection`, async (status, code) => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code, error: 'private diagnostics' }), { status })));
        await expect(call(kind)).rejects.toMatchObject({ name: 'Error', message: status === 400 ? '入力内容を確認して再試行してください。' : '別の変更と競合しました。最新の状態を確認してください。' });
    });
    it(`${kind} cannot establish an outcome from malformed recovery409 JSON`, async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private broken response', { status: 409 })));
        await expect(call(kind)).rejects.toBeInstanceOf(UnknownNoteWriteOutcome);
    });
}
