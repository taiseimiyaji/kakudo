import { afterEach, expect, it, vi } from 'vitest';
import { requestGraphSave, readGraphSave, type GraphSaveTarget } from '../../client/graph-save';
import { UnknownMutationOutcome } from '../../client/api';

const map = { id: 'map', workspaceId: 'work space', title: 'new title', description: 'human description', createdAt: '2026-10-04T00:00:00Z' };
const node = { id: 'node', roadmapId: 'map', title: 'node title', description: '', positionX: 0, positionY: 0, status: 'NOT_STARTED', learningObjectives: ['human goal'], guidingQuestions: [] };
const mapTarget: GraphSaveTarget = { kind: 'map', mapId: 'map', workspaceId: 'work space', name: 'old title', input: { title: ' new title ', description: 'human description' } };
const nodeTarget: GraphSaveTarget = { kind: 'node', mapId: 'map', workspaceId: 'work space', nodeId: 'node', name: 'node title', input: { learningObjectives: [' human goal '] } };
const detail = { roadmap: map, nodes: [{ ...node, stats: { documents: 0, sources: 0, openFindings: 0, outdatedReviews: 0 } }], edges: [] };
afterEach(() => vi.unstubAllGlobals());

it.each([mapTarget, nodeTarget])('accepts only a matching %s save and normalizes only the transmitted copy', async (target) => {
  const before = structuredClone(target.input); const fetch = vi.fn().mockResolvedValue(Response.json(target.kind === 'map' ? { roadmap: map } : { node })); vi.stubGlobal('fetch', fetch);
  expect(await requestGraphSave(target)).toEqual({ kind: target.kind, saved: target.kind === 'map' ? map : node });
  expect(fetch).toHaveBeenCalledWith(target.kind === 'map' ? '/api/roadmaps/map?workspaceId=work%20space' : '/api/nodes/node?workspaceId=work%20space', expect.objectContaining({ method: 'PATCH', body: JSON.stringify(target.kind === 'map' ? { title: 'new title', description: 'human description' } : { learningObjectives: ['human goal'] }) }));
  expect(target.input).toEqual(before);
});
it.each([
  { ...map, id: 'other' }, { ...map, workspaceId: 'other' }, { ...map, title: 'other' }, { ...map, description: 'other' }, {},
])('keeps a mismatched map success uncertain: %j', async (payload) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ roadmap: payload }))); await expect(requestGraphSave(mapTarget)).rejects.toBeInstanceOf(UnknownMutationOutcome);
});
it.each([{ ...node, id: 'other' }, { ...node, roadmapId: 'other' }, { ...node, learningObjectives: ['other'] }, {}])('keeps a mismatched node success uncertain: %j', async (payload) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ node: payload }))); await expect(requestGraphSave(nodeTarget)).rejects.toBeInstanceOf(UnknownMutationOutcome);
});
it.each(['transport','json','server'])('keeps %s failure uncertain for both save forms', async (kind) => {
  vi.stubGlobal('fetch', kind === 'transport' ? vi.fn().mockRejectedValue(new TypeError('private')) : vi.fn().mockResolvedValue(kind === 'json' ? new Response('private') : Response.json({ private: 'diagnostic' }, { status: 503 })));
  for (const target of [mapTarget,nodeTarget]) await expect(requestGraphSave(target)).rejects.toBeInstanceOf(UnknownMutationOutcome);
});
it('retains safe known rejection messages without result uncertainty', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ private: 'diagnostic' }, { status: 409 })));
  for (const target of [mapTarget,nodeTarget]) { await expect(requestGraphSave(target)).rejects.toThrow('別の変更と競合'); await expect(requestGraphSave(target)).rejects.not.toBeInstanceOf(UnknownMutationOutcome); }
});
it('rejects invalid client input before any PATCH', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch); await expect(requestGraphSave({ ...mapTarget, input: { title: '' } })).rejects.toThrow('入力内容を確認'); expect(fetch).not.toHaveBeenCalled();
});
it('reads exact scope and permits a different current state without replaying a PATCH', async () => {
  const changed = { ...detail, roadmap: { ...map, title: 'other actor title' }, nodes: [{ ...detail.nodes[0], learningObjectives: ['other actor goal'] }] }; const fetch = vi.fn(async () => Response.json(changed)); vi.stubGlobal('fetch', fetch);
  expect((await readGraphSave(mapTarget)).saved.title).toBe('other actor title'); expect(await readGraphSave(nodeTarget)).toEqual({ kind: 'node', saved: changed.nodes[0] }); expect(fetch).toHaveBeenCalledTimes(2); expect(fetch).toHaveBeenCalledWith('/api/roadmaps/map?workspaceId=work%20space', expect.objectContaining({ method: 'GET', body: undefined }));
});
it.each([
  { ...detail, roadmap: { ...map, id: 'other' } }, { ...detail, roadmap: { ...map, workspaceId: 'other' } }, { ...detail, nodes: [] },
  { ...detail, nodes: [{ ...detail.nodes[0], roadmapId: 'other' }] }, { ...detail, nodes: [detail.nodes[0], detail.nodes[0]] },
])('rejects missing, foreign or ambiguous save-target reads: %j', async (payload) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload))); await expect(readGraphSave(nodeTarget)).rejects.toThrow();
});
