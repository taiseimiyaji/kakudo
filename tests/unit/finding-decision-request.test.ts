import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestFindingDecision, readFindingDecision } from '../../client/finding-decision';
import { UnknownMutationOutcome } from '../../client/api';

const target = { documentId: 'note', workspaceId: 'work space', runId: 'run', revisionId: 'revision', findingId: 'finding', status: 'RESOLVED' as const };
const finding = { id: 'finding', reviewRunId: 'run', status: 'RESOLVED' };
const detail = { run: { id: 'run', documentId: 'note', revisionId: 'revision' }, findings: [{ id: 'finding', status: 'DISMISSED' }] };
afterEach(() => vi.unstubAllGlobals());
describe('finding decision request boundary', () => {
  it('accepts a response matching the finding, run and intended status', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ finding })); vi.stubGlobal('fetch', fetch);
    expect(await requestFindingDecision(target)).toBe('RESOLVED');
    expect(fetch).toHaveBeenCalledWith('/api/findings/finding?workspaceId=work%20space', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ status: 'RESOLVED' }) }));
  });
  it.each([{ ...finding, id: 'other' }, { ...finding, reviewRunId: 'other' }, { ...finding, status: 'OPEN' }, {}])('keeps mismatched or incomplete success uncertain: %j', async (payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ finding: payload })));
    await expect(requestFindingDecision(target)).rejects.toBeInstanceOf(UnknownMutationOutcome);
  });
  it.each(['transport', 'json', 'server'])('keeps %s failure uncertain', async (kind) => {
    vi.stubGlobal('fetch', kind === 'transport' ? vi.fn().mockRejectedValue(new TypeError('secret')) : vi.fn().mockResolvedValue(kind === 'json' ? new Response('secret') : Response.json({ secret: 'secret' }, { status: 503 })));
    await expect(requestFindingDecision(target)).rejects.toBeInstanceOf(UnknownMutationOutcome);
  });
  it('keeps a known rejection retryable with its safe client message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ secret: 'secret' }, { status: 403 })));
    await expect(requestFindingDecision(target)).rejects.toThrow('この操作は許可されていません');
    await expect(requestFindingDecision(target)).rejects.not.toBeInstanceOf(UnknownMutationOutcome);
  });
  it('reads the exact target and accepts a different current status without a write', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json(detail)); vi.stubGlobal('fetch', fetch);
    expect(await readFindingDecision(target)).toBe('DISMISSED');
    expect(fetch).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledWith('/api/reviews/run?workspaceId=work%20space', expect.objectContaining({ method: 'GET', body: undefined }));
  });
  it.each([
    { ...detail, run: { ...detail.run, id: 'other' } }, { ...detail, run: { ...detail.run, documentId: 'other' } }, { ...detail, run: { ...detail.run, revisionId: 'other' } },
    { ...detail, findings: [] }, { ...detail, findings: [{ id: 'finding', status: 'unknown' }] }, { ...detail, findings: [...detail.findings, ...detail.findings] },
  ])('rejects a nonmatching or unavailable current-state read: %j', async (payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload))); await expect(readFindingDecision(target)).rejects.toThrow();
  });
});
