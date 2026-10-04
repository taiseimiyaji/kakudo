# Issue #71 — parallel edge label readability

## Measured problem

On main `7e94d62`, A/B nodes at (0,0)/(420,0) with all three relationships in both directions produced six labels at the same center. Browser bounding rectangles intersected for all 15 pairs; `document.elementFromPoint` at every label center returned one edge ID. Reading and selecting a specific relationship through its label was ambiguous. The baseline JSON/image are retained in the task evidence folder.

## Minimal correction

Only multiple edges sharing an unordered node pair receive separate display slots. Slots are deterministic across API row ordering, centered around the pair's measured node midpoint and spaced vertically. Each label displays source→target and relation, exposes its full caption through title/accessible name, and selects its exact edge using the existing guarded callback. Long captions truncate visually while retaining full accessible text and the normal connection editor.

Bezier path strings, handles, arrow/dash semantics and stored node/edge fields are unchanged. Single edges retain the default renderer; deleting companion edges restores it. No automatic layout, schema, API, auth or deployment changes were introduced. Mouse/Enter/Escape selection and endpoint draft guards retain their existing owner in RoadmapPage.

The renderer uses the installed React Flow 12.11.6 public APIs following the [official EdgeLabelRenderer documentation](https://reactflow.dev/api-reference/components/edge-label-renderer). Its labels use `nodrag`/`nopan` and explicit pointer events, without changing the viewport.

## Verification

Three unit cases cover pair isolation, stable reverse-direction/type slots without input mutation, and recentering/single fallback. Four new browser cases cover horizontal, vertical and mixed-side six-edge fixtures at 390/640/1280 CSS-pixel widths, direct pointer hits to all six IDs, label/keyboard selection, dirty Escape and other-label guards, unchanged API payloads, same-direction relations, long captions, exact path preservation, selection, viewport and simultaneous map/node draft retention when returning to one edge.

The focused four browser cases passed. The initial long-title fixture itself had overlapping node cards: moving its target fixture farther away resolved that unrelated occlusion while retaining the long caption check. No product layout change was made for overlapping nodes.

This resolves labels within the same node pair. It does not perform global collision avoidance across different node pairs, rearrange overlapping nodes or guarantee every label remains visible after arbitrary user zoom/pan. Tests use Chromium and CSS-pixel viewport sizes; native browser zoom and comprehensive accessibility testing are not claimed. Mock providers and owned transient PostgreSQL databases were used; the actual user database and original uncommitted work were untouched.

On 2026-10-04, the full `npm run check` passed: lint, typecheck, **132 unit**, **44 dedicated PostgreSQL integration**, build and **67 Chromium browser cases**.
