// Rebase only the human's additions/removals; the new saved set supplies the
// rest. After a confirmed own write, use its submitted set as previousIds so
// choices made after the submission remain pending.
export function rebaseAssociationDraft(previousIds: readonly string[], selectedIds: readonly string[], savedIds: readonly string[]): string[] {
  const previous = new Set(previousIds); const selected = new Set(selectedIds);
  const removed = new Set(previousIds.filter((id) => !selected.has(id)));
  const added = selectedIds.filter((id) => !previous.has(id));
  return [...new Set([...savedIds.filter((id) => !removed.has(id)), ...added])];
}
