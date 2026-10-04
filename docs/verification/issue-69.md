# Issue #69 — approved four-side connection integration

The original local four-side handles/connection editor and migration 0007 are integrated while retaining current main's map/node form drafts and React Flow node/edge reconciliation. Endpoint form drafts survive refresh and failed saves; closing, switching edges/nodes or leaving with changed endpoints requires explicit discard. Busy edits are disabled. Successful position-only PATCH keeps endpoint identities and relation types unchanged.

## Verification

On 2026-10-04, full `npm run check` passed: lint, typecheck, **129 unit**, **44 dedicated PostgreSQL integration**, build and **63 Chromium browser cases** with Mock providers and owned transient databases. Two focused new browser cases cover actual right→left pointer dragging, form creation, changing to top→bottom and left→right, reload persistence, failed PATCH retry, cancelled close/navigation, explicit discard, and simultaneous node/map draft and viewport preservation. The endpoint editor also stayed inside 390/640/1280 CSS-pixel viewports. Existing 24-node selection/zoom/pan/scroll and draft regressions passed. The original implementation was adapted rather than replacing current safe map code. A TypeScript inference issue around optional React Flow edge selection was corrected before the final full run.

The REST tests cover missing/cross-workspace connections, strict position-only validation, invalid sides at API and DB levels, duplicate/self-links and legacy/default seed directions. `npm run db:generate` reports no schema changes: the preserved snapshot matches the current schema.

## Migration compatibility

The exact original `0007_eminent_fantastic_four.sql`, journal entry (timestamp 1789970492035) and snapshot are preserved. SQL SHA-256: `894d76d68aa984c39bd2668676bf414d6cc1bca03da04f2da882b5c859f5a5f9`.

A representative 0000–0006 backup was restored into two new isolated PostgreSQL 17 databases. It contains 16 tables, six edges, four notes, seven revisions, two quotes, four completed Mock reviews and 12 findings. Upgrade to 0007 retained all prior rows byte-for-byte at the serialized field level, adding only bottom/top defaults to the existing edges and the eighth migration record. A second database was first migrated using the original local 0007 identity, then migrated with the integrated files: all rows and migration records were unchanged. Repeated migration was unchanged in both databases.

The actual user database was neither inspected nor modified. These fixtures represent correctly journaled unapplied/applied states; manually altered schemas or missing/corrupt migration journals were not tested. This is not a PostgreSQL major-version upgrade or a production deployment. Preserve a paired offline database/Markdown backup and use a separate clean checkout when applying the update. Original 45 uncommitted files remain unchanged.
