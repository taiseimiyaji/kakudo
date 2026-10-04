import { describe, expect, it } from 'vitest';
import { rebaseAssociationDraft } from '../../modules/editor/association-draft';

describe('confirmed association baseline changes', () => {
  it.each([
    { name: 'adopts a changed saved set without a draft', previous: ['A'], selected: ['A'], saved: ['A', 'B'], expected: ['A', 'B'] },
    { name: 'retains an independent addition', previous: ['A'], selected: ['A', 'C'], saved: ['A', 'B'], expected: ['A', 'B', 'C'] },
    { name: 'retains an independent removal', previous: ['A'], selected: [], saved: ['A', 'B'], expected: ['B'] },
    { name: 'retains an addition after saved deletion', previous: ['A', 'B'], selected: ['A', 'B', 'C'], saved: ['A'], expected: ['A', 'C'] },
    { name: 'retains a removal after saved deletion', previous: ['A', 'B'], selected: ['B'], saved: ['A'], expected: [] },
    { name: 'does not recreate an externally removed unchanged link', previous: ['A', 'B'], selected: ['A', 'B'], saved: ['A'], expected: ['A'] },
    { name: 'does not duplicate an addition already saved elsewhere', previous: ['A'], selected: ['A', 'B'], saved: ['B', 'A'], expected: ['B', 'A'] },
    { name: 'uses confirmed submission to retain a later inverse removal', previous: ['A', 'B'], selected: ['A', 'C'], saved: ['A', 'B'], expected: ['A', 'C'] },
    { name: 'uses confirmed submission to retain a later inverse addition', previous: ['A'], selected: ['A', 'B', 'C'], saved: ['A'], expected: ['A', 'B', 'C'] },
  ])('$name', ({ previous, selected, saved, expected }) => {
    expect(rebaseAssociationDraft(Object.freeze(previous), Object.freeze(selected), Object.freeze(saved))).toEqual(expected);
  });
});
