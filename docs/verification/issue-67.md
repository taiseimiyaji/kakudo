# Issue #67 — approved note autosave integration

The approved local note modes/autosave changes were adapted to main d0c72b4. The original working tree and user database were not modified.

## Behavior and concurrency

- A module-level NoteSession serializes body/title saves, quote insertion, node-link updates and deletion. Every body/quote request includes the latest content hash and write ID; link updates advance the same write ID.
- Only changed drafts save on the one-second interval. IME composition, pending paste dialogs, invalid titles and queued writes pause the timer. Newer typing survives a delayed response.
- Failures stop automatic retries and preserve the learner draft. GET confirmation updates the baseline without authorizing another automatic overwrite; an explicit retry remains required. A subsequently stale baseline still receives 409.
- Explicit Save always calls the server, including an unchanged loaded external Markdown file, so its Revision can be recorded before review. Timer ticks with no edits remain silent.
- Read/edit and preview toggles keep the CodeMirror instance mounted. Quote insertion remains one CodeMirror transaction; prior typing and CRLF Undo/Redo survive later autosaves.
- Nonempty notes initially open in read mode. Preview visibility is a local display preference. Human authorship, Revision-pinned reviews and immutable objective snapshots are preserved.

## Verification

On 2026-10-04, `npm run check` passed: lint, typecheck, **128 unit**, **44 dedicated PostgreSQL integration**, build and **60 Chromium browser cases**. Mock review/search providers and owned transient databases on port 55450 were used.

Nine browser cases use the real autosave interval with controlled browser time and delayed/dropped HTTP responses. They cover consecutive saves, no-change ticks, modes and preview persistence, slow writes with newer typing, IME pauses, quote queues and Undo/Redo, node-link token handoff, lost committed responses and title/body conflicts. Existing external-Markdown review admission and all prior safety regressions also passed.

Existing manual-save regression specs use `manual-note-fixture.ts`, which stretches only the new 1000ms interval to preserve their intentional unsaved-draft scenarios. Review polling continues normally. The nine autosave cases use the unmodified Playwright fixture. Composition tests dispatch browser composition events; native macOS IME keystrokes were not exercised. Visual checks cover 390/640/1280 CSS-pixel viewports, with the same native-zoom/accessibility limits described in issue-39.md.

Implementation testing caught and corrected an unchanged explicit-save regression for externally edited Markdown. Two other initial failures were test adaptation issues (default read mode after reload and controlled-clock timing). The final full run has no failures.
