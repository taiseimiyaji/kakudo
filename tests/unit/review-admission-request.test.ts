import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestReviewAdmission } from '../../client/review-admission';
import { UnknownMutationOutcome } from '../../client/api';

const target = { documentId: 'note', workspaceId: 'workspace', revisionId: 'revision', type: 'LOGIC' as const };
const run = { id: 'run', documentId: 'note', revisionId: 'revision', type: 'LOGIC', status: 'QUEUED' };
afterEach(() => vi.unstubAllGlobals());
describe('review acceptance boundary', () => {
  it('returns only an acceptance matching document, saved version and review type', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ run }, { status: 202 })); vi.stubGlobal('fetch', fetch);
    expect(await requestReviewAdmission(target)).toEqual(run);
    expect(fetch).toHaveBeenCalledWith('/api/documents/note/reviews?workspaceId=workspace', expect.objectContaining({ method: 'POST', body: JSON.stringify({ revisionId: 'revision', type: 'LOGIC' }) }));
  });
  it.each([
    ['wrong document', { ...run, documentId: 'other' }], ['wrong saved version', { ...run, revisionId: 'other' }], ['wrong type', { ...run, type: 'FULL' }], ['missing id', { ...run, id: undefined }], ['invalid status', { ...run, status: 'UNKNOWN' }],
  ])('keeps %s acceptance uncertain', async (_name, payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ run: payload }, { status: 202 })));
    await expect(requestReviewAdmission(target)).rejects.toBeInstanceOf(UnknownMutationOutcome);
  });
  it.each(['transport', 'json', 'server'])('keeps %s failure uncertain', async (failure) => {
    const fetch = failure === 'transport' ? vi.fn().mockRejectedValue(new TypeError('secret')) : vi.fn().mockResolvedValue(failure === 'json' ? new Response('secret', { status: 202 }) : Response.json({ secret: 'secret' }, { status: 503 })); vi.stubGlobal('fetch', fetch);
    await expect(requestReviewAdmission(target)).rejects.toBeInstanceOf(UnknownMutationOutcome);
  });
  it('retains the existing known admission rejection message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ code: 'REVIEW_ALREADY_RUNNING' }, { status: 409 })));
    await expect(requestReviewAdmission(target)).rejects.toThrow('同じRevision・種類');
    await expect(requestReviewAdmission(target)).rejects.not.toBeInstanceOf(UnknownMutationOutcome);
  });
});
