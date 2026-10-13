import { closeSearchPanel, findNext, findPrevious, getSearchQuery, openSearchPanel, search, SearchQuery, setSearchQuery } from '@codemirror/search';
import { EditorView, keymap, runScopeHandlers, type Panel, type ViewUpdate } from '@codemirror/view';

function createPanel(view: EditorView): Panel {
  const dom = document.createElement('div');
  dom.className = 'note-search'; dom.setAttribute('role', 'search'); dom.setAttribute('aria-label', '本文内検索');
  const label = document.createElement('label'), caption = document.createElement('span'), input = document.createElement('input');
  caption.className = 'visually-hidden'; caption.textContent = '本文の検索語';
  input.type = 'text'; input.placeholder = '本文内を検索'; input.setAttribute('main-field', 'true'); input.autocomplete = 'off';
  label.append(caption, input); dom.append(label);
  function button(text: string, action: () => void) {
    const control = document.createElement('button'); control.type = 'button'; control.className = 'secondary'; control.textContent = text;
    control.addEventListener('click', action); dom.append(control); return control;
  }
  const previous = button('前の一致', () => { findPrevious(view); });
  const next = button('次の一致', () => { findNext(view); });
  button('検索を閉じる', () => { closeSearchPanel(view); view.focus(); });
  const status = document.createElement('span'); status.className = 'muted'; status.setAttribute('role', 'status'); status.setAttribute('aria-label', '本文の検索結果'); dom.append(status);
  function refresh() {
    const query = getSearchQuery(view.state);
    if (input.value !== query.search) input.value = query.search;
    const matches = query.valid && !query.getCursor(view.state).next().done;
    previous.disabled = next.disabled = !matches;
    status.textContent = !query.search ? '検索語を入力' : matches ? '一致あり（Enterで次へ）' : '一致なし';
  }
  let composing = false;
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; });
  input.addEventListener('blur', () => { composing = false; });
  input.addEventListener('input', () => { view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: input.value, literal: true })) }); });
  dom.addEventListener('keydown', event => {
    if (composing || event.isComposing || event.keyCode === 229) return;
    if (runScopeHandlers(view, event, 'search-panel')) event.preventDefault();
    else if (event.key === 'Enter' && event.target === input) {
      event.preventDefault(); (event.shiftKey ? findPrevious : findNext)(view);
    }
  });
  let headerObserver: ResizeObserver | undefined;
  refresh();
  return {
    dom, top: true,
    mount() {
      const header = view.dom.closest('.document-workspace')?.querySelector('.note-header');
      if (header) {
        const offset = () => { view.dom.style.setProperty('--note-search-offset', `${header.getBoundingClientRect().height + 8}px`); };
        offset(); headerObserver = new ResizeObserver(offset); headerObserver.observe(header);
      }
      input.focus({ preventScroll: true }); input.select();
    },
    update(update: ViewUpdate) {
      if (update.docChanged || update.transactions.some(tr => tr.effects.some(effect => effect.is(setSearchQuery)))) refresh();
    },
    destroy() { headerObserver?.disconnect(); view.dom.style.removeProperty('--note-search-offset'); },
  };
}

export function openNoteSearch(view: EditorView) {
  const opened = openSearchPanel(view);
  // A text input strips line breaks. Do not display a different query than we search.
  if (/[\r\n]/.test(getSearchQuery(view.state).search)) {
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: '', literal: true })) });
  }
  return opened;
}

function moveNoteSearch(view: EditorView, backwards = false) {
  // Upstream opens an invalid query directly, bypassing our single-line normalization.
  if (!getSearchQuery(view.state).valid) return openNoteSearch(view);
  return (backwards ? findPrevious : findNext)(view);
}

export function noteSearch() {
  return [
    search({ literal: true, top: true, createPanel, scrollToMatch: range => EditorView.scrollIntoView(range, { y: 'center' }) }),
    keymap.of([
      { key: 'Mod-f', run: openNoteSearch, scope: 'editor search-panel', preventDefault: true },
      { key: 'Mod-g', run: moveNoteSearch, shift: view => moveNoteSearch(view, true), scope: 'editor search-panel', preventDefault: true },
      { key: 'Escape', run: closeSearchPanel, scope: 'editor search-panel' },
    ]),
  ];
}
