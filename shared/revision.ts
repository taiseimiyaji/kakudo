export function reviewIsStale(reviewRevisionId: string, currentRevisionId: string | null, reviewedHash: string, currentHash: string): boolean {
  return reviewRevisionId !== currentRevisionId || reviewedHash !== currentHash;
}
export function needsRevision(previousHash: string | undefined, nextHash: string): boolean { return previousHash !== nextHash; }
