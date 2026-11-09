(async function () {
  const params = new URLSearchParams(location.search);
  let noteId = params.get('id');
  const pendingExport = params.get('export');
  const openPrivateOnLoad = params.get('openPrivate') === '1';

  const $ = (id) => document.getElementById(id);
  const notebookEl = $('notebook');
  const titleInput = $('titleInput');
  const saveStatus = $('saveStatus');
  const formatBar = $('formatBar');
  const fmtBlock = $('fmtBlock');
  const sbList = $('sbList');
  const sbSearch = $('sbSearch');
  const cellTypeMenuTpl = $('cellTypeMenuTpl');
  const cellSearch = $('cellSearch');
  const searchCount = $('searchCount');
  const searchFirst = $('searchFirstLine');
  const noResults = $('noResults');

  // Private Vault DOM Elements
  const notePrivacyBtn = $('notePrivacyBtn');
  const privateNoteBadge = $('privateNoteBadge');
  const sbPrivateFolder = $('sbPrivateFolder');
  const sbPrivateFolderBtn = $('sbPrivateFolderBtn');
  const sbPrivateBadge = $('sbPrivateBadge');
  const sbPrivateLockIcon = $('sbPrivateLockIcon');
  const sbPrivateHeader = $('sbPrivateHeader');
  const sbLockVaultBtn = $('sbLockVaultBtn');
  const sbExitPrivateBtn = $('sbExitPrivateBtn');
  const settingShowPrivateFolder = $('settingShowPrivateFolder');
  const currentShortcutDisplay = $('currentShortcutDisplay');
  const changeShortcutBtn = $('changeShortcutBtn');
  const settingsLockVaultBtn = $('settingsLockVaultBtn');
  const settingsResetVaultBtn = $('settingsResetVaultBtn');
  const privateCodeModal = $('privateCodeModal');
  const forgotCodeModal = $('forgotCodeModal');
  const shortcutRecordModal = $('shortcutRecordModal');

  let note = null;
  let settings = await SafifyStore.getSettings();
  let saveTimer = null;
  let dirty = false;
  let openTypeMenuEl = null;
  let savedEditor = null;   // last visual editor that held the caret
  let savedRange = null;    // ...and its selection (survives focus loss)

  // Private Vault State
  let isPrivateMode = false;
  let vaultKey = null;        // Active AES-GCM CryptoKey when unlocked
  let privateNotes = {};      // In-memory decrypted notes map { [id]: note }

  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* ignore */ }
  applyTheme(settings.theme);

  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
  }
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showToast(msg, duration = 3000) {
    const toast = $('safifyToast');
    if (!toast) return;
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.hidden = true;
    }, duration);
  }

  /* ---------------- Note & Cell Structure Helpers ---------------- */
  function ensureNoteStructures(n) {
    if (!n) return;
    if (!Array.isArray(n.cells) || !n.cells.length) n.cells = [SafifyStore.newCell('visual')];
    n.cells.forEach(c => {
      const fresh = SafifyStore.newCell(c.type);
      if (c.type === 'visual' && !c.visual) c.visual = fresh.visual;
      if (c.type === 'code' && !c.code) c.code = fresh.code;
      if (c.type === 'diagram' && !c.diagram) c.diagram = fresh.diagram;
    });
  }

  function loadNoteIntoEditor(targetNote) {
    ensureNoteStructures(targetNote);
    note = targetNote;
    noteId = note.id;
    titleInput.value = note.title || 'Untitled note';
    history.replaceState(null, '', `editor.html?id=${encodeURIComponent(note.id)}`);
    updatePrivacyUI();
    renderNotebook();
    renderSidebar(sbSearch.value);
  }

  function updatePrivacyUI() {
    const isNotePrivate = !!(note && note.isPrivate);
    if (privateNoteBadge) privateNoteBadge.hidden = !isNotePrivate;
    if (notePrivacyBtn) {
      notePrivacyBtn.classList.toggle('is-private', isNotePrivate);
      if (isNotePrivate) {
        notePrivacyBtn.title = 'Private Note (Encrypted) — Click to move to Public';
        notePrivacyBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
      } else {
        notePrivacyBtn.title = 'Public Note — Click to encrypt & move to Private Vault';
        notePrivacyBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>`;
      }
    }
    if (sbPrivateLockIcon) {
      sbPrivateLockIcon.textContent = vaultKey ? '🔓' : '🔒';
    }
    if (sbPrivateBadge) {
      if (vaultKey) {
        const count = Object.keys(privateNotes).length;
        sbPrivateBadge.textContent = String(count);
        sbPrivateBadge.hidden = count === 0;
      } else {
        sbPrivateBadge.hidden = true;
      }
    }
    if (settingsLockVaultBtn) {
      settingsLockVaultBtn.hidden = !vaultKey;
    }
  }

  /* ---------------- Load / bootstrap note ---------------- */
  if (!noteId) {
    note = SafifyStore.newNote();
    await SafifyStore.saveNote(note);
    history.replaceState(null, '', `editor.html?id=${note.id}`);
    noteId = note.id;
  } else {
    note = await SafifyStore.getNote(noteId);
    if (!note) {
      note = SafifyStore.newNote();
      note.id = noteId;
      await SafifyStore.saveNote(note);
    }
  }
  ensureNoteStructures(note);
  titleInput.value = note.title || 'Untitled note';

  /* ---------------- Saving ---------------- */
  function scheduleSave() {
    dirty = true;
    saveStatus.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 400);
  }
  async function flushSave() {
    clearTimeout(saveTimer);
    if (!dirty) return;
    dirty = false;
    try {
      if (note && note.isPrivate && vaultKey) {
        await SafifyStore.savePrivateNote(note, vaultKey);
        privateNotes[note.id] = note;
        saveStatus.textContent = 'Saved (Encrypted)';
      } else {
        await SafifyStore.saveNote(note);
        saveStatus.textContent = 'Saved';
      }
    } catch (err) {
      dirty = true;
      saveStatus.textContent = 'Save failed';
      console.error('SafifyNote save failed', err);
    }
    renderSidebar(sbSearch.value);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });
  window.addEventListener('pagehide', flushSave);

  /* ---------------- Confirmation Dialog Helper ---------------- */
  function askConfirm(title, message) {
    return new Promise((resolve) => {
      const modal = $('confirmModal');
      const titleEl = $('confirmTitle');
      const msgEl = $('confirmMessage');
      const delBtn = $('confirmDeleteBtn');
      const cancelBtn = $('confirmCancelBtn');
      const closeBtn = $('confirmClose');

      if (titleEl) titleEl.textContent = title || 'Delete note?';
      if (msgEl) msgEl.textContent = message || 'Are you sure you want to delete this note? It will be moved to Delete History.';
      modal.hidden = false;

      function cleanup() {
        modal.hidden = true;
        delBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        closeBtn.removeEventListener('click', onCancel);
        modal.removeEventListener('click', onBackdrop);
      }
      function onConfirm() { cleanup(); resolve(true); }
      function onCancel() { cleanup(); resolve(false); }
      function onBackdrop(e) { if (e.target === modal) { cleanup(); resolve(false); } }

      delBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      closeBtn.addEventListener('click', onCancel);
      modal.addEventListener('click', onBackdrop);
    });
  }

  async function deleteAndNavigate(idToDelete, noteTitle) {
    if (isPrivateMode || (note && note.id === idToDelete && note.isPrivate)) {
      const ok = await askConfirm('Delete private note?', `Permanently delete "${noteTitle || 'Untitled note'}" from your Private Vault? This cannot be undone.`);
      if (!ok) return;
      await SafifyStore.deletePrivateNote(idToDelete);
      delete privateNotes[idToDelete];
      if (idToDelete === noteId) {
        const remaining = Object.values(privateNotes);
        if (remaining.length > 0) {
          loadNoteIntoEditor(remaining[0]);
        } else {
          const freshP = SafifyStore.newNote('Untitled private note', true);
          if (vaultKey) await SafifyStore.savePrivateNote(freshP, vaultKey);
          privateNotes[freshP.id] = freshP;
          loadNoteIntoEditor(freshP);
        }
      } else {
        renderSidebar(sbSearch.value);
      }
      return;
    }

    const ok = await askConfirm('Delete note?', `Are you sure you want to delete "${noteTitle || 'Untitled note'}"? It will be moved to Delete History.`);
    if (!ok) return;

    await SafifyStore.moveToTrash(idToDelete);
    updateTrashBadge();

    if (idToDelete === noteId) {
      const remainingObj = await SafifyStore.getAllNotes();
      const remaining = Object.values(remainingObj).sort((a, b) => b.updatedAt - a.updatedAt);
      if (remaining.length > 0) {
        location.href = `editor.html?id=${encodeURIComponent(remaining[0].id)}`;
      } else {
        const fresh = SafifyStore.newNote();
        await SafifyStore.saveNote(fresh);
        location.href = `editor.html?id=${encodeURIComponent(fresh.id)}`;
      }
    } else {
      renderSidebar(sbSearch.value);
    }
  }

  /* ---------------- Topbar Delete Note button ---------------- */
  const deleteNoteBtn = $('deleteNoteBtn');
  if (deleteNoteBtn) {
    deleteNoteBtn.addEventListener('click', () => {
      deleteAndNavigate(noteId, note.title);
    });
  }

  /* ---------------- Sidebar (search matches title + first line, with hover delete) ---------------- */
  async function renderSidebar(filter = '') {
    const q = filter.trim().toLowerCase();
    sbList.innerHTML = '';

    if (isPrivateMode) {
      if (sbPrivateHeader) sbPrivateHeader.hidden = false;
      if (sbPrivateFolder) sbPrivateFolder.hidden = true;

      let pNotes = Object.values(privateNotes);
      if (note && note.isPrivate) {
        privateNotes[note.id] = note;
        pNotes = Object.values(privateNotes);
      }

      if (q) {
        pNotes = pNotes.filter(n => {
          const first = safifyNoteFirstLine(n);
          return ((n.title || '') + ' ' + first).toLowerCase().includes(q);
        }).sort((a, b) => {
          const aTitle = (a.title || '').toLowerCase().includes(q);
          const bTitle = (b.title || '').toLowerCase().includes(q);
          if (aTitle && !bTitle) return -1;
          if (!aTitle && bTitle) return 1;
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
      } else {
        pNotes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      }

      pNotes.forEach(n => {
        const first = safifyNoteFirstLine(n);
        const item = document.createElement('div');
        item.className = 'sb-item' + (n.id === noteId ? ' active' : '');
        item.innerHTML = `<div class="sb-item-row">` +
          `<span class="sb-item-title">🔒 ${escapeHtml(n.title || 'Untitled note')}</span>` +
          `<button class="sb-item-del-btn" title="Delete note" data-del="${n.id}">` +
            `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>` +
          `</button>` +
        `</div>` +
        (first ? `<div class="sb-item-line">${escapeHtml(first)}</div>` : '') +
        `<div class="sb-item-date">${safifyFormatDate(n.updatedAt || Date.now())}</div>`;

        item.addEventListener('click', async (e) => {
          if (e.target.closest('.sb-item-del-btn')) return;
          if (n.id === noteId) return;
          await flushSave();
          loadNoteIntoEditor(n);
        });

        const delBtn = item.querySelector('.sb-item-del-btn');
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteAndNavigate(n.id, n.title);
        });

        sbList.appendChild(item);
      });

    } else {
      if (sbPrivateHeader) sbPrivateHeader.hidden = true;
      if (sbPrivateFolder) {
        sbPrivateFolder.hidden = settings.showPrivateFolder === false;
      }

      const notesObj = await SafifyStore.getAllNotes();
      if (note && !note.isPrivate) notesObj[noteId] = note;
      let notes = Object.values(notesObj);

      if (q) {
        notes = notes.filter(n => {
          const first = safifyNoteFirstLine(n);
          return ((n.title || '') + ' ' + first).toLowerCase().includes(q);
        }).sort((a, b) => {
          const aTitleMatch = (a.title || '').toLowerCase().includes(q);
          const bTitleMatch = (b.title || '').toLowerCase().includes(q);
          if (aTitleMatch && !bTitleMatch) return -1;
          if (!aTitleMatch && bTitleMatch) return 1;
          return b.updatedAt - a.updatedAt;
        });
      } else {
        notes.sort((a, b) => b.updatedAt - a.updatedAt);
      }

      notes.forEach(n => {
        const first = safifyNoteFirstLine(n);
        const item = document.createElement('div');
        item.className = 'sb-item' + (n.id === noteId ? ' active' : '');
        item.innerHTML = `<div class="sb-item-row">` +
          `<span class="sb-item-title">${escapeHtml(n.title || 'Untitled note')}</span>` +
          `<button class="sb-item-del-btn" title="Delete note" data-del="${n.id}">` +
            `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>` +
          `</button>` +
        `</div>` +
        (first ? `<div class="sb-item-line">${escapeHtml(first)}</div>` : '') +
        `<div class="sb-item-date">${safifyFormatDate(n.updatedAt)}</div>`;

        item.addEventListener('click', async (e) => {
          if (e.target.closest('.sb-item-del-btn')) return;
          if (n.id === noteId) return;
          await flushSave();
          loadNoteIntoEditor(n);
        });

        const delBtn = item.querySelector('.sb-item-del-btn');
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          deleteAndNavigate(n.id, n.title);
        });

        sbList.appendChild(item);
      });
    }

    updatePrivacyUI();
  }

  $('sbNewNote').addEventListener('click', async () => {
    await flushSave();
    if (isPrivateMode) {
      if (!vaultKey) {
        const key = await askPinCode({ reason: 'Enter your 6-digit code to create a private note' });
        if (!key) return;
      }
      const p = SafifyStore.newNote('Untitled private note', true);
      await SafifyStore.savePrivateNote(p, vaultKey);
      privateNotes[p.id] = p;
      loadNoteIntoEditor(p);
    } else {
      const n = SafifyStore.newNote();
      await SafifyStore.saveNote(n);
      loadNoteIntoEditor(n);
    }
  });
  sbSearch.addEventListener('input', () => renderSidebar(sbSearch.value));

  /* ---------------- Title ---------------- */
  titleInput.addEventListener('input', () => {
    note.title = titleInput.value || 'Untitled note';
    scheduleSave();
  });

  /* ---------------- Cell rendering ---------------- */
  function iconForType(type) {
    return { visual: '✎', code: '</>', diagram: '✏' }[type] || '•';
  }
  const TYPE_LABEL = { visual: 'Text', code: 'Code', diagram: 'Diagram' };

  function renderNotebook() {
    notebookEl.innerHTML = '';
    note.cells.forEach(cell => notebookEl.appendChild(buildCellEl(cell)));
    applySearch();
  }

  function buildCellEl(cell) {
    const wrap = document.createElement('div');
    wrap.className = `cell type-${cell.type}` + (cell.collapsed ? ' is-collapsed' : '');
    wrap.dataset.id = cell.id;

    const spine = document.createElement('div');
    spine.className = 'cell-spine';
    spine.innerHTML = `
      <div class="cell-index" title="Change cell type">${iconForType(cell.type)}</div>
      <button class="cell-ctrl fold" data-act="fold" title="${cell.collapsed ? 'Show more' : 'Show less'}">${cell.collapsed ? '▸' : '▾'}</button>
      <button class="cell-ctrl" data-act="up" title="Move up">↑</button>
      <button class="cell-ctrl" data-act="down" title="Move down">↓</button>
      <button class="cell-ctrl" data-act="dup" title="Duplicate">⧉</button>
      <button class="cell-ctrl danger" data-act="del" title="Delete">✕</button>
    `;

    const body = document.createElement('div');
    body.className = 'cell-body';

    wrap.appendChild(spine);
    wrap.appendChild(body);

    spine.querySelector('.cell-index').addEventListener('click', (e) => openCellTypeMenu(e.currentTarget, cell));
    spine.querySelector('[data-act="fold"]').addEventListener('click', () => toggleCollapse(cell.id));
    spine.querySelector('[data-act="up"]').addEventListener('click', () => moveCell(cell.id, -1));
    spine.querySelector('[data-act="down"]').addEventListener('click', () => moveCell(cell.id, 1));
    spine.querySelector('[data-act="dup"]').addEventListener('click', () => duplicateCell(cell.id));
    spine.querySelector('[data-act="del"]').addEventListener('click', () => deleteCell(cell.id));

    if (cell.collapsed) {
      body.classList.add('collapsed');
      const line = document.createElement('button');
      line.type = 'button';
      line.className = 'collapsed-line';
      line.title = 'Click to show the whole cell';
      line.innerHTML = `<span class="cl-type">${TYPE_LABEL[cell.type] || cell.type}</span>` +
        `<span class="cl-text">${escapeHtml(safifyFirstLine(cell))}</span><span class="cl-more">Show more</span>`;
      line.addEventListener('click', () => toggleCollapse(cell.id));
      body.appendChild(line);
    } else {
      mountCellBody(body, cell);
    }
    return wrap;
  }

  function mountCellBody(body, cell) {
    if (cell.type === 'visual') mountVisualCell(body, cell);
    else if (cell.type === 'code') SafifyCode.mount(body, cell, { onChange: scheduleSave });
    else if (cell.type === 'diagram') SafifyDiagram.mount(body, cell, {
      onChange: scheduleSave,
      getSmoothing: () => settings.diagramSmoothing
    });
  }

  function toggleCollapse(id) {
    const cell = note.cells.find(c => c.id === id);
    if (!cell) return;
    cell.collapsed = !cell.collapsed;
    const old = notebookEl.querySelector(`.cell[data-id="${id}"]`);
    const fresh = buildCellEl(cell);
    if (old) old.replaceWith(fresh); else renderNotebook();
    scheduleSave();
    applySearch();
  }

  $('collapseAllBtn').addEventListener('click', () => {
    note.cells.forEach(c => { c.collapsed = true; });
    renderNotebook();
    scheduleSave();
  });
  $('expandAllBtn').addEventListener('click', () => {
    note.cells.forEach(c => { c.collapsed = false; });
    renderNotebook();
    scheduleSave();
  });

  /* ---------------- Search (prioritise title 1st, then inside content 1st line) ---------------- */
  function getCellTitle(cell) {
    if (!cell) return '';
    if (cell.type === 'visual') {
      const html = (cell.visual && cell.visual.html) || '';
      const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
      const h = doc.body.querySelector('h1, h2, h3, h4, h5, h6');
      if (h && h.textContent.trim()) return h.textContent.trim();
      const lines = safifyCellLines(cell);
      if (lines.length > 0) {
        const m = lines[0].match(/^#{1,6}\s*(.+)/);
        if (m) return m[1].trim();
        return lines[0];
      }
      return '';
    }
    if (cell.type === 'code') {
      const src = (cell.code && cell.code.source) || '';
      const lines = src.split('\n').filter(Boolean);
      if (lines.length > 0) {
        const m = lines[0].match(/^(\/\/|#|\/\*)\s*(.+?)(\*\/)?$/);
        if (m && m[2]) return m[2].trim();
      }
      return (cell.code && cell.code.language) ? (cell.code.language.toUpperCase() + ' Code') : 'Code';
    }
    if (cell.type === 'diagram') {
      const lines = safifyCellLines(cell);
      return lines[0] || 'Diagram';
    }
    return '';
  }

  function getCellContentFirstLine(cell) {
    if (!cell) return '';
    const lines = safifyCellLines(cell);
    if (cell.type === 'visual') {
      const html = (cell.visual && cell.visual.html) || '';
      const doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html');
      const h = doc.body.querySelector('h1, h2, h3, h4, h5, h6');
      if (h) {
        h.remove();
        const rest = safifyHtmlToLines(doc.body.innerHTML);
        return rest[0] || '';
      }
      return lines.length > 1 ? lines[1] : (lines[0] || '');
    }
    if (cell.type === 'code') {
      const src = (cell.code && cell.code.source) || '';
      const codeLines = src.split('\n').filter(Boolean);
      return codeLines.length > 1 ? codeLines[1] : (codeLines[0] || '');
    }
    return lines.length > 1 ? lines[1] : (lines[0] || '');
  }

  function evaluateCellSearch(cell, q) {
    if (!q) return { match: true, priority: 0 };
    const title = getCellTitle(cell).toLowerCase();
    if (title.includes(q)) {
      return { match: true, priority: 2, isTitle: true }; // Priority 1: Title match
    }
    const firstLine = getCellContentFirstLine(cell).toLowerCase();
    if (firstLine.includes(q)) {
      return { match: true, priority: 1, isTitle: false }; // Priority 2: 1st line inside content
    }
    if (!searchFirst.checked) {
      const allText = safifyCellLines(cell).join(' ').toLowerCase();
      if (allText.includes(q)) {
        return { match: true, priority: 1, isTitle: false };
      }
    }
    return { match: false, priority: 0 };
  }

  function applySearch() {
    const q = cellSearch.value.trim().toLowerCase();
    notebookEl.querySelectorAll('.search-match-pill').forEach(p => p.remove());

    if (!q) {
      // Re-order cells back to original sequence
      note.cells.forEach(c => {
        const el = notebookEl.querySelector(`.cell[data-id="${c.id}"]`);
        if (el) {
          el.hidden = false;
          notebookEl.appendChild(el);
        }
      });
      searchCount.textContent = '';
      noResults.hidden = true;
      return;
    }

    let titleMatches = 0;
    let contentMatches = 0;
    const ranked = [];

    note.cells.forEach(c => {
      const el = notebookEl.querySelector(`.cell[data-id="${c.id}"]`);
      if (!el) return;
      const res = evaluateCellSearch(c, q);
      if (res.match) {
        if (res.priority === 2) titleMatches++;
        else contentMatches++;
        ranked.push({ cell: c, el, priority: res.priority });
      } else {
        el.hidden = true;
      }
    });

    // Sort cells: Priority 2 (Title match) FIRST, then Priority 1 (Content 1st line)
    ranked.sort((a, b) => b.priority - a.priority);

    ranked.forEach(item => {
      item.el.hidden = false;
      notebookEl.appendChild(item.el); // re-orders in the notebook view
      const pill = document.createElement('span');
      pill.className = 'search-match-pill ' + (item.priority === 2 ? 'title-match' : 'content-match');
      pill.textContent = item.priority === 2 ? 'Title match' : 'Content match';
      const body = item.el.querySelector('.cell-body');
      if (body) body.prepend(pill);
    });

    const total = titleMatches + contentMatches;
    if (total > 0) {
      searchCount.textContent = `${total} of ${note.cells.length} (${titleMatches} title, ${contentMatches} content)`;
    } else {
      searchCount.textContent = `0 of ${note.cells.length}`;
    }
    noResults.hidden = total !== 0;
  }
  cellSearch.addEventListener('input', applySearch);
  searchFirst.addEventListener('change', applySearch);
  cellSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { cellSearch.value = ''; applySearch(); }
    else if (e.key === 'Enter') {
      const first = [...notebookEl.querySelectorAll('.cell')].find(el => !el.hidden);
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  /* ---------------- Visual (rich text) cell ---------------- */
  function updateEmpty(ed) {
    const empty = !(ed.textContent || '').trim() && !ed.querySelector('img,hr,table,ul,ol');
    ed.classList.toggle('is-empty', empty);
  }

  function commit(ed) {
    const wrap = ed.closest('.cell');
    const cell = wrap && note.cells.find(c => c.id === wrap.dataset.id);
    if (!cell) return;
    cell.visual.html = ed.innerHTML;
    updateEmpty(ed);
    scheduleSave();
  }

  function placeCaret(node, offset) {
    const r = document.createRange();
    r.setStart(node, offset);
    r.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function preserveSelection(fn) {
    const sel = window.getSelection();
    let s = null;
    if (sel.rangeCount) {
      const r = sel.getRangeAt(0);
      s = { sc: r.startContainer, so: r.startOffset, ec: r.endContainer, eo: r.endOffset };
    }
    fn();
    try {
      if (s && s.sc.isConnected && s.ec.isConnected) {
        const nr = document.createRange();
        nr.setStart(s.sc, s.so);
        nr.setEnd(s.ec, s.eo);
        sel.removeAllRanges();
        sel.addRange(nr);
      }
    } catch (e) { /* ignore */ }
  }

  function mountVisualCell(body, cell) {
    const div = document.createElement('div');
    div.className = 'visual-editor';
    div.contentEditable = 'true';
    div.spellcheck = true;
    div.setAttribute('data-placeholder', 'Start writing…');
    div.innerHTML = safifySanitizeHtml(cell.visual.html || '');
    safifyNormalizeBlocks(div);
    updateEmpty(div);
    body.appendChild(div);

    div.addEventListener('focus', () => {
      formatBar.hidden = false;
      body.closest('.cell').classList.add('focused');
    });
    div.addEventListener('blur', () => {
      const cellEl = body.closest('.cell');
      if (cellEl) cellEl.classList.remove('focused');
      setTimeout(() => {
        if (!document.hasFocus()) return;                          // file dialog / prompt is open
        if (formatBar.contains(document.activeElement)) return;
        const a = document.activeElement;
        if (a && a.classList && a.classList.contains('visual-editor')) return;
        formatBar.hidden = true;
      }, 150);
    });

    // keep top-level content in <p> blocks so headings always have a block to convert
    div.addEventListener('beforeinput', () => {
      if (safifyEditorNeedsNormalize(div)) {
        preserveSelection(() => safifyNormalizeBlocks(div));
        const sel = window.getSelection();
        if (!sel.rangeCount || !div.contains(sel.anchorNode)) placeCaret(div.firstChild, 0);
      }
    });
    div.addEventListener('input', () => commit(div));

    div.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        addCell(settings.defaultCellType, cell.id);
        return;
      }
      // Ctrl+Alt+0..4 → paragraph / headings
      if (e.ctrlKey && e.altKey && /^Digit[0-4]$/.test(e.code)) {
        e.preventDefault();
        const n = Number(e.code.slice(5));
        applyBlock(n === 0 ? 'p' : 'h' + n, true);
      }
    });

    div.addEventListener('click', (e) => {
      if (e.target.tagName === 'IMG') {
        const r = document.createRange();
        r.selectNode(e.target);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }
    });
    div.addEventListener('dblclick', (e) => {
      if (e.target.tagName !== 'IMG') return;
      const cur = e.target.style.width || '';
      const v = prompt('Image width as % of the cell (10–100):', cur.replace('%', '') || '100');
      const n = Number(v);
      if (v !== null && n >= 10 && n <= 100) { e.target.style.width = n + '%'; commit(div); }
    });

    div.addEventListener('dragover', (e) => {
      if (e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files')) e.preventDefault();
    });
    div.addEventListener('drop', async (e) => {
      const file = SafifyImage.extractImageFile(e);
      if (!file) return;
      e.preventDefault();
      div.focus();
      const range = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
      if (range && div.contains(range.startContainer)) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
      insertImage(div, await SafifyImage.compress(file));
    });

    div.addEventListener('paste', async (e) => {
      const cd = e.clipboardData;
      if (!cd) return;
      const html = cd.getData('text/html');
      const text = cd.getData('text/plain');
      const file = SafifyImage.extractImageFile(e);
      e.preventDefault();
      if (file && !text) {
        insertImage(div, await SafifyImage.compress(file));
        return;
      }

      // Check if text is markdown from ChatGPT or Gemini (contains fenced code or markdown formatting)
      const isMarkdown = text && (/```[a-zA-Z0-9_#-]*\s*\n[\s\S]*?```/.test(text) || /^#{1,6}\s+/m.test(text) || /^\|[\s\S]+\|\s*$/m.test(text));

      let contentToInsert = '';
      if (html && !isMarkdown) {
        contentToInsert = sanitizePasted(html);
      } else if (text && isMarkdown) {
        contentToInsert = safifyMarkdownToHtml(text);
      } else if (html) {
        contentToInsert = sanitizePasted(html);
      }

      if (contentToInsert && contentToInsert.trim()) {
        document.execCommand('insertHTML', false, contentToInsert);
      } else if (text) {
        document.execCommand('insertText', false, text);
      }
      commit(div);
    });
  }

  /* Pasted HTML (web pages, Word, Google Docs, ChatGPT, Gemini…) is reduced to clean formatting. */
  const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD', 'TITLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED']);
  const BLOCKISH = new Set(['DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'FIGURE', 'MAIN', 'ASIDE', 'NAV']);
  function sanitizePasted(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const normalWeight = (el) => /font-weight:\s*(normal|400)/i.test(el.getAttribute('style') || '');

    function walk(node) {
      let out = '';
      node.childNodes.forEach(ch => {
        if (ch.nodeType === 3) { out += escapeHtml(ch.nodeValue); return; }
        if (ch.nodeType !== 1) return;
        const t = ch.tagName;
        if (SKIP_TAGS.has(t)) return;

        // ChatGPT & Gemini code blocks (<pre>, <code-block>, or .ai-code-block)
        if (t === 'PRE' || t === 'CODE-BLOCK' || ch.classList.contains('ai-code-block')) {
          let lang = '';
          const codeEl = ch.querySelector('code') || ch;
          const classStr = (codeEl.className || '') + ' ' + (ch.className || '');
          const langMatch = classStr.match(/(?:language-|lang-)([a-zA-Z0-9_#-]+)/i);
          if (langMatch) lang = langMatch[1];
          else if (ch.dataset && ch.dataset.lang) lang = ch.dataset.lang;
          else {
            // Check for lang header text in ChatGPT / Gemini
            const headerEl = ch.querySelector('.ai-code-lang, span, div');
            if (headerEl && /^[a-zA-Z0-9_#-]{1,20}$/.test(headerEl.textContent.trim())) {
              lang = headerEl.textContent.trim();
            }
          }
          // Clone and remove copy button or decorative headers from code text
          const clone = ch.cloneNode(true);
          clone.querySelectorAll('button, .ai-code-header, .code-block-decoration').forEach(b => b.remove());
          const codeText = (clone.querySelector('code') || clone).textContent || '';
          out += safifyBuildAiCodeBlock(codeText, lang);
          return;
        }

        // Inline code <code>
        if (t === 'CODE') {
          out += `<code class="ai-inline-code">${escapeHtml(ch.textContent || '')}</code>`;
          return;
        }

        // Tables (from ChatGPT / Gemini / markdown tables)
        if (t === 'TABLE') {
          let rowsHtml = '';
          ch.querySelectorAll('tr').forEach(tr => {
            let cellsHtml = '';
            tr.querySelectorAll('th, td').forEach(cell => {
              const tag = cell.tagName.toLowerCase();
              cellsHtml += `<${tag}>${walk(cell)}</${tag}>`;
            });
            rowsHtml += `<tr>${cellsHtml}</tr>`;
          });
          out += `<table>${rowsHtml}</table>`;
          return;
        }

        const inner = walk(ch);
        if (/^H[1-4]$/.test(t)) out += `<${t.toLowerCase()}>${inner}</${t.toLowerCase()}>`;
        else if (t === 'H5' || t === 'H6') out += `<h4>${inner}</h4>`;
        else if (t === 'P') out += `<p>${inner}</p>`;
        else if (t === 'BLOCKQUOTE') out += `<blockquote>${inner}</blockquote>`;
        else if (t === 'UL' || t === 'OL') out += `<${t.toLowerCase()}>${inner}</${t.toLowerCase()}>`;
        else if (t === 'LI') out += `<li>${inner}</li>`;
        else if (t === 'B' || t === 'STRONG') out += normalWeight(ch) ? inner : `<b>${inner}</b>`;
        else if (t === 'I' || t === 'EM') out += `<i>${inner}</i>`;
        else if (t === 'U') out += `<u>${inner}</u>`;
        else if (t === 'S' || t === 'STRIKE' || t === 'DEL') out += `<s>${inner}</s>`;
        else if (t === 'BR') out += '<br>';
        else if (t === 'A') {
          const href = ch.getAttribute('href') || '';
          out += /^(https?:|mailto:)/i.test(href) ? `<a href="${escapeHtml(href)}">${inner}</a>` : inner;
        } else if (t === 'IMG') {
          const src = ch.getAttribute('src') || '';
          if (/^(data:image\/|https?:)/i.test(src)) out += `<img src="${escapeHtml(src)}" alt="">`;
        } else if (BLOCKISH.has(t)) {
          out += inner.trim() ? `<p>${inner}</p>` : '';
        } else if (t === 'SPAN') {
          const st = ch.getAttribute('style') || '';
          let r = inner;
          if (/font-weight:\s*(bold|[6-9]00)/i.test(st)) r = `<b>${r}</b>`;
          if (/font-style:\s*italic/i.test(st)) r = `<i>${r}</i>`;
          if (/text-decoration[^;]*underline/i.test(st)) r = `<u>${r}</u>`;
          out += r;
        } else {
          out += inner;
        }
      });
      return out;
    }
    return walk(doc.body);
  }

  /* ---------------- Selection tracking (so the toolbar works after focus moves) ---------------- */
  function editorFromNode(n) {
    const el = n && (n.nodeType === 1 ? n : n.parentElement);
    return el && el.closest ? el.closest('.visual-editor') : null;
  }
  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    const ed = editorFromNode(r.commonAncestorContainer);
    if (ed) {
      savedEditor = ed;
      savedRange = r.cloneRange();
      syncToolbar();
    }
  });

  function restoreSelection() {
    if (!savedEditor || !savedEditor.isConnected) return false;
    savedEditor.focus({ preventScroll: true });
    if (savedRange) {
      try {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
      } catch (e) { /* ignore */ }
    }
    return true;
  }
  function ensureEditorFocus() {
    const a = document.activeElement;
    if (a && a.classList && a.classList.contains('visual-editor')) { savedEditor = a; return true; }
    return restoreSelection();
  }

  function syncToolbar() {
    if (!savedEditor || !savedRange || !savedEditor.isConnected) return;
    fmtBlock.value = safifyBlockTagAt(savedEditor, savedRange.startContainer, savedRange.startOffset);
    formatBar.querySelectorAll('[data-cmd]').forEach(btn => {
      let on = false;
      try { on = document.queryCommandState(btn.dataset.cmd); } catch (e) { /* ignore */ }
      if (['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList',
        'justifyLeft', 'justifyCenter', 'justifyRight'].includes(btn.dataset.cmd)) btn.classList.toggle('active', on);
    });
  }

  /* ---------------- Format bar ---------------- */
  // keep the editor focused when a toolbar BUTTON is pressed (but let the <select> open!)
  formatBar.addEventListener('mousedown', (e) => {
    if (e.target.closest('select')) return;
    e.preventDefault();
  });

  function exec(cmd, val = null) {
    if (!ensureEditorFocus()) return;
    document.execCommand(cmd, false, val);
    commit(savedEditor);
    syncToolbar();
  }
  formatBar.querySelectorAll('[data-cmd]').forEach(btn => {
    btn.addEventListener('click', () => exec(btn.dataset.cmd));
  });

  // Headings / paragraph / quote — works with a selection AND with just the caret in a line
  function applyBlock(tag, toggle) {
    if (!ensureEditorFocus()) return;
    safifySetBlock(savedEditor, tag, toggle);
    commit(savedEditor);
    const sel = window.getSelection();
    if (sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
    syncToolbar();
  }
  fmtBlock.addEventListener('change', (e) => {
    applyBlock(e.target.value, false);
  });

  formatBar.querySelector('[data-action="link"]').addEventListener('click', () => {
    if (!savedEditor) return;
    const collapsed = !savedRange || savedRange.collapsed;
    const url = prompt('Link URL:', 'https://');
    if (!url || url === 'https://') return;
    if (!restoreSelection()) return;
    if (collapsed) document.execCommand('insertHTML', false, `<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
    else document.execCommand('createLink', false, url);
    commit(savedEditor);
  });

  /* ----- images ----- */
  function getTargetEditor() {
    if (savedEditor && savedEditor.isConnected) return savedEditor;
    return notebookEl.querySelector('.visual-editor');
  }

  function insertImage(ed, src) {
    if (!ed || !ed.isConnected) { alert('Click inside a text cell first, then add the image.'); return; }
    const sel = window.getSelection();
    const inside = sel.rangeCount && ed.contains(sel.anchorNode);
    if (!inside) {
      ed.focus({ preventScroll: true });
      if (savedRange && savedEditor === ed) {
        try { sel.removeAllRanges(); sel.addRange(savedRange); } catch (e) { /* ignore */ }
      } else {
        const last = ed.lastElementChild || ed;
        const r = document.createRange();
        r.selectNodeContents(last);
        r.collapse(false);
        sel.removeAllRanges();
        sel.addRange(r);
      }
    }
    if (safifyEditorNeedsNormalize(ed)) preserveSelection(() => safifyNormalizeBlocks(ed));
    document.execCommand('insertHTML', false, `<img src="${src}" alt="">`);

    // make sure there is always a line after an image to keep typing in
    const last = ed.lastElementChild;
    if (last && last.lastChild && last.lastChild.nodeName === 'IMG') {
      const p = document.createElement('p');
      p.appendChild(document.createElement('br'));
      ed.appendChild(p);
      placeCaret(p, 0);
    }
    commit(ed);
  }

  formatBar.querySelector('[data-action="image"]').addEventListener('click', () => {
    const ed = getTargetEditor();
    const url = prompt('Image URL:', 'https://');
    if (url && /^(https?:|data:image\/)/i.test(url.trim())) insertImage(ed, escapeHtml(url.trim()));
  });

  const uploadBtn = formatBar.querySelector('[data-action="upload-image"]');
  const uploadInput = $('visualImageUpload');
  let uploadTarget = null;
  uploadBtn.addEventListener('click', () => {
    uploadTarget = getTargetEditor();      // remember where the caret was BEFORE the file dialog opens
    uploadInput.click();
  });
  uploadInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      insertImage(uploadTarget || getTargetEditor(), await SafifyImage.compress(file));
    } catch (err) {
      alert('Could not add this image.');
      console.error(err);
    }
  });

  /* ----- Table and Code Block tools in format bar ----- */
  function detectCodeLanguage(code) {
    const s = String(code || '').trim();
    if (/^\s*(<(!DOCTYPE|html|div|span|p|head|body|svg|form|table)[\s>])/i.test(s)) return 'html';
    if (/^\s*(import\s+.+from|export\s+|const\s+|let\s+|var\s+|function\s+|console\.log\()/m.test(s)) return 'javascript';
    if (/^\s*(def\s+[a-zA-Z0-9_]+\s*\(|import\s+[a-zA-Z0-9_]+|from\s+[a-zA-Z0-9_]+\s+import|print\(|elif\s+)/m.test(s)) return 'python';
    if (/^\s*([a-zA-Z0-9_.\-#\s]+)\s*\{\s*[a-zA-Z\-]+\s*:\s*[^;]+;/m.test(s)) return 'css';
    if (/^\s*(\{[\s\S]*"[a-zA-Z0-9_]+"|\{[\s\S]*\})/m.test(s)) return 'json';
    if (/^\s*(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE)\b/i.test(s)) return 'sql';
    if (/^\s*(#!\/bin\/(bash|sh)|echo\s+|sudo\s+|npm\s+|git\s+)/m.test(s)) return 'bash';
    return 'javascript';
  }

  function convertTextOrFragmentToTable(sel, ed) {
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const fragment = range.cloneContents();

    const rawLines = [];
    const blockNodes = fragment.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, tr, blockquote');
    if (blockNodes.length > 0) {
      blockNodes.forEach(node => {
        if (node.querySelector('p, div, li, tr')) return;
        const text = node.textContent.trim();
        if (!text) return;
        const align = (node.style && node.style.textAlign) || node.getAttribute('align') || '';
        rawLines.push({ text, align: align.toLowerCase() });
      });
    }

    if (rawLines.length === 0) {
      const textStr = sel.toString();
      const splitLines = textStr.split('\n').map(s => s.trim()).filter(Boolean);
      splitLines.forEach(l => {
        rawLines.push({ text: l, align: '' });
      });
    }

    if (rawLines.length === 0) return null;

    let colAlignments = [];
    const filteredLines = [];
    rawLines.forEach(l => {
      // Check if line is markdown separator: e.g. |:---|:---:|---:|
      if (/^\|?[\s\-:]+(\|[\s\-:]+)+\|?$/.test(l.text)) {
        const parts = l.text.split('|').map(s => s.trim()).filter(Boolean);
        colAlignments = parts.map(p => {
          if (p.startsWith(':') && p.endsWith(':')) return 'center';
          if (p.endsWith(':')) return 'right';
          if (p.startsWith(':')) return 'left';
          return '';
        });
      } else {
        filteredLines.push(l);
      }
    });

    const sample = filteredLines.map(l => l.text).join('\n');
    const countTab = (sample.match(/\t/g) || []).length;
    const countPipe = (sample.match(/\|/g) || []).length;
    const countComma = (sample.match(/,/g) || []).length;
    const countSemicolon = (sample.match(/;/g) || []).length;

    let delimiter = null;
    if (countTab >= filteredLines.length - 1 && countTab > 0) delimiter = '\t';
    else if (countPipe >= filteredLines.length - 1 && countPipe > 0) delimiter = '|';
    else if (countComma >= filteredLines.length - 1 && countComma > 0) delimiter = ',';
    else if (countSemicolon >= filteredLines.length - 1 && countSemicolon > 0) delimiter = ';';
    else if (/\s{2,}/.test(sample)) delimiter = /\s{2,}/;

    const matrix = filteredLines.map(l => {
      let cells;
      if (delimiter === '|') {
        let trimmed = l.text;
        if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
        if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
        cells = trimmed.split('|').map(c => c.trim());
      } else if (delimiter) {
        cells = l.text.split(delimiter).map(c => c.trim());
      } else {
        cells = [l.text];
      }
      return { cells, align: l.align };
    });

    const maxCols = Math.max(...matrix.map(r => r.cells.length), 1);

    let tableHtml = '<div class="ai-table-wrap"><table class="ai-table"><thead><tr>';
    const headerRow = matrix[0];
    for (let c = 0; c < maxCols; c++) {
      const val = (headerRow && headerRow.cells[c]) || `Header ${c + 1}`;
      const align = (colAlignments[c]) || (headerRow && headerRow.align) || '';
      const styleAttr = align ? ` style="text-align: ${align};"` : '';
      tableHtml += `<th${styleAttr}>${escapeHtml(val)}</th>`;
    }
    tableHtml += '</tr></thead><tbody>';

    const bodyRows = matrix.slice(1);
    if (bodyRows.length === 0) {
      tableHtml += '<tr>';
      for (let c = 0; c < maxCols; c++) {
        const align = (colAlignments[c]) || '';
        const styleAttr = align ? ` style="text-align: ${align};"` : '';
        tableHtml += `<td${styleAttr}><br></td>`;
      }
      tableHtml += '</tr>';
    } else {
      bodyRows.forEach(row => {
        tableHtml += '<tr>';
        for (let c = 0; c < maxCols; c++) {
          const val = row.cells[c] !== undefined ? row.cells[c] : '';
          const align = (colAlignments[c]) || row.align || '';
          const styleAttr = align ? ` style="text-align: ${align};"` : '';
          tableHtml += `<td${styleAttr}>${val ? escapeHtml(val) : '<br>'}</td>`;
        }
        tableHtml += '</tr>';
      });
    }
    tableHtml += '</tbody></table></div><p><br></p>';
    return tableHtml;
  }

  // Click on Table button
  const tableBtn = formatBar.querySelector('[data-action="table"]');
  if (tableBtn) {
    tableBtn.addEventListener('click', () => {
      if (!ensureEditorFocus()) return;
      const ed = savedEditor || getTargetEditor();
      if (!ed) return;

      const sel = window.getSelection();
      const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().trim().length > 0;

      if (hasSelection) {
        // Convert selected text into table
        const tableHtml = convertTextOrFragmentToTable(sel, ed);
        if (tableHtml) {
          document.execCommand('insertHTML', false, tableHtml);
          commit(ed);
        }
      } else {
        // No text selected: ask for dimensions (Rows x Columns)
        const input = prompt("Enter table dimensions as Rows x Columns (e.g. 3x3, 2x4, 4x3) [Default: 3x3]:", "3x3");
        if (input === null) return;

        let rows = 3, cols = 3;
        const m = input.trim().match(/^(\d+)\s*[*xX,\s]\s*(\d+)$/);
        if (m) {
          rows = Math.max(1, Math.min(50, parseInt(m[1], 10)));
          cols = Math.max(1, Math.min(20, parseInt(m[2], 10)));
        } else {
          const single = parseInt(input.trim(), 10);
          if (!isNaN(single) && single > 0) {
            rows = Math.min(50, single);
            cols = Math.min(20, single);
          }
        }

        let tableHtml = '<div class="ai-table-wrap"><table class="ai-table"><thead><tr>';
        for (let c = 1; c <= cols; c++) {
          tableHtml += `<th>Header ${c}</th>`;
        }
        tableHtml += '</tr></thead><tbody>';
        const dataRows = Math.max(1, rows - 1);
        for (let r = 1; r <= dataRows; r++) {
          tableHtml += '<tr>';
          for (let c = 1; c <= cols; c++) {
            tableHtml += `<td>Cell ${r}.${c}</td>`;
          }
          tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table></div><p><br></p>';

        if (!restoreSelection()) {
          ed.focus({ preventScroll: true });
        }
        document.execCommand('insertHTML', false, tableHtml);
        commit(ed);
      }
    });
  }

  // Click on Code Block button
  const codeBlockBtn = formatBar.querySelector('[data-action="code-block"]');
  if (codeBlockBtn) {
    codeBlockBtn.addEventListener('click', () => {
      if (!ensureEditorFocus()) return;
      const ed = savedEditor || getTargetEditor();
      if (!ed) return;

      const sel = window.getSelection();
      const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().trim().length > 0;

      let codeText = '';
      let defaultLang = 'javascript';

      if (hasSelection) {
        codeText = sel.toString();
        defaultLang = detectCodeLanguage(codeText);
      }

      const lang = prompt("Code language (e.g. javascript, python, html, css, json, bash):", defaultLang);
      if (lang === null) return;

      if (!codeText) {
        codeText = "// Write or paste code here...";
      }

      const blockHtml = safifyBuildAiCodeBlock(codeText, lang || 'code') + '<p><br></p>';

      if (!restoreSelection()) {
        ed.focus({ preventScroll: true });
      }
      document.execCommand('insertHTML', false, blockHtml);
      commit(ed);
    });
  }

  /* ---------------- Local Typo & Spell Fixer ---------------- */
  const fixTyposBtn = formatBar.querySelector('[data-action="fix-typos"]');
  if (fixTyposBtn) {
    fixTyposBtn.addEventListener('click', () => {
      if (!ensureEditorFocus()) return;
      const ed = savedEditor || getTargetEditor();
      if (!ed) return;

      const sel = window.getSelection();
      const hasSelection = sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().trim().length > 0;

      if (hasSelection) {
        const text = sel.toString();
        const res = SafifySpell.fixString(text);
        if (res.count > 0) {
          document.execCommand('insertText', false, res.fixed);
          commit(ed);
          const sample = res.changes.slice(0, 3).map(c => `"${c.from}" → "${c.to}"`).join(', ');
          showToast(`✓ Fixed ${res.count} typo${res.count > 1 ? 's' : ''}: ${sample}`);
        } else {
          showToast('✓ No typos found in selected text!');
        }
      } else {
        const res = SafifySpell.fixHtmlNode(ed);
        if (res.count > 0) {
          commit(ed);
          const sample = res.changes.slice(0, 3).map(c => `"${c.from}" → "${c.to}"`).join(', ');
          showToast(`✓ Fixed ${res.count} typo${res.count > 1 ? 's' : ''}: ${sample}`);
        } else {
          showToast('✓ No typos found! Text looks good.');
        }
      }
    });
  }

  /* ---------------- AI Rephrase (Groq AI) ---------------- */
  const aiRephraseBtn = formatBar.querySelector('[data-action="ai-rephrase"]');
  const rephraseModal = $('rephraseModal');
  const closeRephraseModal = $('closeRephraseModal');
  const rephraseOriginalPreview = $('rephraseOriginalPreview');
  const rephraseResultWrap = $('rephraseResultWrap');
  const rephraseResultPreview = $('rephraseResultPreview');
  const rephraseLoadingMsg = $('rephraseLoadingMsg');
  const rephraseErrorMsg = $('rephraseErrorMsg');
  const executeRephraseBtn = $('executeRephraseBtn');
  const applyRephraseBtn = $('applyRephraseBtn');
  const rephraseCancelBtn = $('rephraseCancelBtn');

  let activeRephraseRange = null;
  let activeRephraseEditor = null;
  let selectedRephraseStyle = 'Standard';
  let lastRephraseMarkdown = '';

  if (aiRephraseBtn) {
    aiRephraseBtn.addEventListener('click', async () => {
      const groqKey = await SafifyStore.getGroqKey();
      if (!groqKey) {
        showToast('Please add your Groq API key in Settings (⚙️) first.');
        openSettingsTab('ai');
        syncSettingsUI();
        loadGroqSettingsUI();
        settingsModal.hidden = false;
        return;
      }

      if (!ensureEditorFocus()) return;
      const ed = savedEditor || getTargetEditor();
      if (!ed) return;

      const sel = window.getSelection();
      let text = '';
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed && sel.toString().trim().length > 0) {
        const range = sel.getRangeAt(0);
        activeRephraseRange = range.cloneRange();
        const frag = range.cloneContents();
        text = safifyHtmlToMarkdown(frag);
        if (!text) text = sel.toString().trim();
      } else {
        const block = sel && sel.anchorNode ? sel.anchorNode.parentElement.closest('p, h1, h2, h3, h4, blockquote, li, .ai-table-wrap, table, .ai-code-block, pre, div') : ed;
        const targetNode = block || ed;
        text = safifyHtmlToMarkdown(targetNode);
        if (!text) text = targetNode.textContent.trim();
        const r = document.createRange();
        r.selectNodeContents(targetNode);
        activeRephraseRange = r;
      }

      if (!text) {
        showToast('Please select or write some text to rephrase.');
        return;
      }

      activeRephraseEditor = ed;
      lastRephraseMarkdown = '';
      rephraseOriginalPreview.textContent = text;
      rephraseResultWrap.hidden = true;
      rephraseResultPreview.innerHTML = '';
      rephraseErrorMsg.hidden = true;
      rephraseLoadingMsg.hidden = true;
      applyRephraseBtn.hidden = true;
      executeRephraseBtn.hidden = false;
      executeRephraseBtn.disabled = false;
      executeRephraseBtn.textContent = 'Generate Rephrase';
      rephraseModal.hidden = false;
    });
  }

  document.querySelectorAll('.rephrase-style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rephrase-style-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRephraseStyle = btn.dataset.style || 'Standard';
    });
  });

  if (executeRephraseBtn) {
    executeRephraseBtn.addEventListener('click', async () => {
      const text = rephraseOriginalPreview.textContent.trim();
      if (!text) return;

      rephraseLoadingMsg.hidden = false;
      rephraseErrorMsg.hidden = true;
      executeRephraseBtn.disabled = true;

      try {
        const groqKey = await SafifyStore.getGroqKey();
        let model = settings.groqModel || 'openai/gpt-oss-20b';
        if (model === 'llama-3.1-8b-instant') model = 'openai/gpt-oss-20b';
        const rephrased = await SafifyStore.rephraseWithGroq(text, selectedRephraseStyle, groqKey, model);
        lastRephraseMarkdown = rephrased;
        rephraseResultPreview.innerHTML = safifyMarkdownToHtml(rephrased);
        rephraseResultWrap.hidden = false;
        applyRephraseBtn.hidden = false;
        executeRephraseBtn.textContent = 'Regenerate';
      } catch (err) {
        rephraseErrorMsg.textContent = err.message || 'Failed to rephrase with Groq.';
        rephraseErrorMsg.hidden = false;
      } finally {
        rephraseLoadingMsg.hidden = true;
        executeRephraseBtn.disabled = false;
      }
    });
  }

  if (applyRephraseBtn) {
    applyRephraseBtn.addEventListener('click', () => {
      if (!lastRephraseMarkdown && !rephraseResultPreview.innerHTML) return;
      const htmlToInsert = safifyMarkdownToHtml(lastRephraseMarkdown || rephraseResultPreview.innerText);

      if (activeRephraseEditor && activeRephraseEditor.isConnected) {
        activeRephraseEditor.focus();
        if (activeRephraseRange) {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(activeRephraseRange);
        }
        document.execCommand('insertHTML', false, htmlToInsert);
        commit(activeRephraseEditor);
      }
      rephraseModal.hidden = true;
      showToast('✨ Rephrased output applied with styles!');
    });
  }

  if (closeRephraseModal) {
    closeRephraseModal.addEventListener('click', () => { rephraseModal.hidden = true; });
  }
  if (rephraseCancelBtn) {
    rephraseCancelBtn.addEventListener('click', () => { rephraseModal.hidden = true; });
  }
  if (rephraseModal) {
    rephraseModal.addEventListener('click', (e) => {
      if (e.target === rephraseModal) rephraseModal.hidden = true;
    });
  }

  /* ---------------- Cell type menu / cell operations ---------------- */
  function openCellTypeMenu(anchor, cell) {
    closeCellTypeMenu();
    const menu = cellTypeMenuTpl.content.firstElementChild.cloneNode(true);
    document.body.appendChild(menu);
    const rect = anchor.getBoundingClientRect();
    menu.style.left = rect.right + 6 + 'px';
    menu.style.top = rect.top + 'px';
    menu.querySelectorAll('button').forEach(btn => {
      if (btn.dataset.type === cell.type) btn.style.fontWeight = '700';
      btn.addEventListener('click', () => {
        if (btn.dataset.type !== cell.type) {
          if (cellHasContent(cell) && !confirm('Switching cell type will keep this cell but start its content fresh in the new type. Continue?')) {
            closeCellTypeMenu();
            return;
          }
          const fresh = SafifyStore.newCell(btn.dataset.type);
          cell.type = fresh.type;
          cell.visual = fresh.visual;
          cell.code = fresh.code;
          cell.diagram = fresh.diagram;
          cell.collapsed = false;
          renderNotebook();
          scheduleSave();
        }
        closeCellTypeMenu();
      });
    });
    openTypeMenuEl = menu;
    setTimeout(() => document.addEventListener('click', outsideMenuClick), 0);
  }
  function outsideMenuClick(e) {
    if (openTypeMenuEl && !openTypeMenuEl.contains(e.target)) closeCellTypeMenu();
  }
  function closeCellTypeMenu() {
    if (openTypeMenuEl) { openTypeMenuEl.remove(); openTypeMenuEl = null; }
    document.removeEventListener('click', outsideMenuClick);
  }

  function cellHasContent(cell) {
    if (cell.type === 'visual') return !!(cell.visual && cell.visual.html && (cell.visual.html.replace(/<[^>]+>/g, '').trim() || /<img/i.test(cell.visual.html)));
    if (cell.type === 'code') return !!(cell.code && cell.code.source && cell.code.source.trim());
    if (cell.type === 'diagram') return !!(cell.diagram && cell.diagram.strokes && cell.diagram.strokes.length);
    return false;
  }

  function moveCell(id, dir) {
    const i = note.cells.findIndex(c => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= note.cells.length) return;
    [note.cells[i], note.cells[j]] = [note.cells[j], note.cells[i]];
    renderNotebook();
    scheduleSave();
  }

  function duplicateCell(id) {
    const i = note.cells.findIndex(c => c.id === id);
    if (i < 0) return;
    const copy = JSON.parse(JSON.stringify(note.cells[i]));
    copy.id = 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    note.cells.splice(i + 1, 0, copy);
    renderNotebook();
    scheduleSave();
  }

  function deleteCell(id) {
    if (note.cells.length === 1) {
      alert("A note needs at least one cell — add another before deleting this one.");
      return;
    }
    note.cells = note.cells.filter(c => c.id !== id);
    renderNotebook();
    scheduleSave();
  }

  function addCell(type, afterId) {
    type = type || settings.defaultCellType;
    cellSearch.value = '';                       // a brand-new (empty) cell must not be filtered out
    const cell = SafifyStore.newCell(type);
    if (afterId) {
      const i = note.cells.findIndex(c => c.id === afterId);
      note.cells.splice(i + 1, 0, cell);
    } else {
      note.cells.push(cell);
    }
    renderNotebook();
    scheduleSave();
    requestAnimationFrame(() => {
      const el = notebookEl.querySelector(`.cell[data-id="${cell.id}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (type === 'visual') {
        const ed = el && el.querySelector('.visual-editor');
        if (ed) { ed.focus(); placeCaret(ed.firstChild || ed, 0); }
      }
    });
  }

  document.querySelectorAll('.add-cell-btn').forEach(btn => {
    btn.addEventListener('click', () => addCell(btn.dataset.add));
  });
  $('newCellQuickBtn').addEventListener('click', () => addCell(settings.defaultCellType));

  /* ---------------- Export / Import ---------------- */
  const exportBtn = $('exportBtn');
  const exportMenu = $('exportMenu');
  exportBtn.addEventListener('click', () => { exportMenu.hidden = !exportMenu.hidden; });
  document.addEventListener('click', (e) => {
    if (!exportMenu.hidden && !exportMenu.contains(e.target) && !exportBtn.contains(e.target)) exportMenu.hidden = true;
  });

  async function runExport(kind) {
    try {
      if (kind === 'pdf') await SafifyExport.toPDF(note);
      else if (kind === 'png') await SafifyExport.toPNG(note);
      else if (kind === 'jpg') await SafifyExport.toJPG(note);
      else if (kind === 'sff') SafifyExport.toSFF(note);
    } catch (err) {
      console.error(err);
      alert('Export failed: ' + (err && err.message ? err.message : err));
    }
  }
  exportMenu.addEventListener('click', (e) => {
    const kind = e.target.dataset.export;
    if (!kind) return;
    exportMenu.hidden = true;
    runExport(kind);
  });

  $('importSffBtn').addEventListener('click', () => $('importSffInput').click());
  $('importSffInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = SafifyFormat.parseSff(text);
      imported.id = SafifyStore.newId();
      imported.updatedAt = Date.now();
      await SafifyStore.saveNote(imported);
      location.href = `editor.html?id=${encodeURIComponent(imported.id)}`;
    } catch (err) {
      alert(err.message || 'Could not import this file.');
    }
    e.target.value = '';
  });

  /* ---------------- Theme toggle ---------------- */
  $('themeToggleBtn').addEventListener('click', async () => {
    settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
    await SafifyStore.saveSettings(settings);
    applyTheme(settings.theme);
    syncSettingsUI();
  });

  /* ---------------- Settings & Delete History modal ---------------- */
  const settingsModal = $('settingsModal');
  const trashModal = $('trashModal');
  const trashList = $('trashList');
  const trashEmptyState = $('trashEmptyState');
  const trashSearch = $('trashSearch');
  const trashCountBadge = $('trashCountBadge');

  async function updateTrashBadge() {
    const trash = await SafifyStore.getTrash();
    const count = Object.keys(trash).length;
    if (trashCountBadge) trashCountBadge.textContent = String(count);
  }

  $('settingsBtn').addEventListener('click', () => {
    syncSettingsUI();
    loadGroqSettingsUI();
    updateTrashBadge();
    settingsModal.hidden = false;
  });
  $('closeSettings').addEventListener('click', () => { settingsModal.hidden = true; });
  settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.hidden = true; });

  async function renderTrashList(filter = '') {
    const trash = await SafifyStore.getTrash();
    let items = Object.values(trash).sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
    const q = filter.trim().toLowerCase();

    if (q) {
      items = items.filter(n => {
        const first = safifyNoteFirstLine(n);
        return ((n.title || '') + ' ' + first).toLowerCase().includes(q);
      });
    }

    trashList.innerHTML = '';
    const isEmpty = items.length === 0;
    trashEmptyState.hidden = !isEmpty;
    $('recoverAllBtn').disabled = isEmpty;
    $('emptyTrashBtn').disabled = isEmpty;

    items.forEach(n => {
      const first = safifyNoteFirstLine(n);
      const row = document.createElement('div');
      row.className = 'trash-item';
      row.innerHTML = `
        <div class="trash-item-info">
          <div class="trash-item-title">${escapeHtml(n.title || 'Untitled note')}</div>
          ${first ? `<div class="trash-item-line">${escapeHtml(first)}</div>` : ''}
          <div class="trash-item-meta">
            <span>Deleted ${safifyFormatDate(n.deletedAt || n.updatedAt)}</span>
            <span>·</span>
            <span>${n.cells ? n.cells.length : 1} cell(s)</span>
          </div>
        </div>
        <div class="trash-item-actions">
          <button class="btn-recover" data-recover="${n.id}" title="Recover note">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            Recover
          </button>
          <button class="btn-del-perm" data-perm="${n.id}" title="Permanently delete">✕</button>
        </div>
      `;

      row.querySelector('[data-recover]').addEventListener('click', async () => {
        await SafifyStore.restoreFromTrash(n.id);
        await updateTrashBadge();
        await renderTrashList(trashSearch.value);
        await renderSidebar(sbSearch.value);
      });

      row.querySelector('[data-perm]').addEventListener('click', async () => {
        const ok = await askConfirm('Permanently delete?', `Permanently delete "${n.title || 'Untitled note'}"? This cannot be undone.`);
        if (!ok) return;
        await SafifyStore.permanentlyDeleteFromTrash(n.id);
        await updateTrashBadge();
        await renderTrashList(trashSearch.value);
      });

      trashList.appendChild(row);
    });
  }

  $('openTrashBtn').addEventListener('click', () => {
    settingsModal.hidden = true;
    trashSearch.value = '';
    renderTrashList();
    trashModal.hidden = false;
  });
  $('closeTrash').addEventListener('click', () => { trashModal.hidden = true; });
  trashModal.addEventListener('click', (e) => { if (e.target === trashModal) trashModal.hidden = true; });
  trashSearch.addEventListener('input', () => renderTrashList(trashSearch.value));

  $('recoverAllBtn').addEventListener('click', async () => {
    const trash = await SafifyStore.getTrash();
    const count = Object.keys(trash).length;
    if (!count) return;
    await SafifyStore.restoreAllTrash();
    await updateTrashBadge();
    await renderTrashList();
    await renderSidebar(sbSearch.value);
  });

  $('emptyTrashBtn').addEventListener('click', async () => {
    const trash = await SafifyStore.getTrash();
    const count = Object.keys(trash).length;
    if (!count) return;
    const ok = await askConfirm('Empty trash?', `Permanently delete all ${count} notes in history? This cannot be undone.`);
    if (!ok) return;
    await SafifyStore.emptyTrash();
    await updateTrashBadge();
    await renderTrashList();
  });

  /* ---------------- ChatGPT & Gemini AI Code Block Copy Delegation ---------------- */
  notebookEl.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.ai-code-copy');
    if (!copyBtn) return;
    e.preventDefault();
    e.stopPropagation();
    const block = copyBtn.closest('.ai-code-block');
    if (!block) return;
    const codeEl = block.querySelector('.ai-code-content') || block.querySelector('code');
    const text = codeEl ? codeEl.innerText : '';
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.classList.add('copied');
      const textSpan = copyBtn.querySelector('.ai-copy-text');
      if (textSpan) textSpan.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.classList.remove('copied');
        if (textSpan) textSpan.textContent = 'Copy code';
      }, 2000);
    }).catch(err => {
      console.warn('Clipboard copy failed:', err);
    });
  });

  /* ---------------- Private Vault: Unlock / Lock / Setup / Forgot ---------------- */
  let pinResolve = null;
  let isPinSetupMode = false;

  function askPinCode(options = {}) {
    return new Promise(async (resolve) => {
      pinResolve = resolve;
      const isConfigured = await SafifyStore.isPrivateVaultConfigured();
      isPinSetupMode = options.forceSetup || !isConfigured;

      const titleEl = $('pinModalTitle');
      const descEl = $('pinModalDesc');
      const confirmSection = $('pinConfirmSection');
      const forgotBtn = $('pinForgotBtn');
      const submitBtn = $('pinSubmitBtn');
      const errorMsg = $('pinErrorMsg');
      const toggleVis = $('pinToggleVis');

      errorMsg.hidden = true;
      errorMsg.textContent = '';
      toggleVis.checked = false;

      const boxes = Array.from(document.querySelectorAll('.pin-box'));
      boxes.forEach(b => {
        b.value = '';
        b.type = 'password';
        b.classList.remove('error');
      });

      if (isPinSetupMode) {
        titleEl.textContent = 'Set Up 6-Digit Private Code';
        descEl.textContent = options.reason || 'Create your 6-digit code. All private notes are strongly encrypted with this code using AES-256.';
        confirmSection.hidden = false;
        forgotBtn.hidden = true;
        submitBtn.textContent = 'Save Code & Open Vault';
      } else {
        titleEl.textContent = 'Enter 6-Digit Private Code';
        descEl.textContent = options.reason || 'Enter your 6-digit code to access your end-to-end encrypted Private Vault.';
        confirmSection.hidden = true;
        forgotBtn.hidden = false;
        submitBtn.textContent = 'Unlock Vault';
      }

      privateCodeModal.hidden = false;
      const firstBox = document.querySelector('.pin-box[data-idx="0"]');
      if (firstBox) setTimeout(() => firstBox.focus(), 80);
    });
  }

  function closePinModal(result = null) {
    privateCodeModal.hidden = true;
    if (pinResolve) {
      pinResolve(result);
      pinResolve = null;
    }
  }

  // Setup PIN boxes listeners
  (function initPinInputListeners() {
    const primaryBoxes = Array.from(document.querySelectorAll('.pin-box[data-idx]'));
    const confirmBoxes = Array.from(document.querySelectorAll('.pin-box[data-cidx]'));
    const allBoxes = primaryBoxes.concat(confirmBoxes);

    allBoxes.forEach(box => {
      box.addEventListener('input', function () {
        const val = this.value.replace(/\D/g, '');
        this.value = val ? val.slice(-1) : '';
        this.classList.remove('error');

        if (this.value) {
          const isPrimary = this.hasAttribute('data-idx');
          const idx = Number(isPrimary ? this.getAttribute('data-idx') : this.getAttribute('data-cidx'));
          if (isPrimary) {
            if (idx < 5) {
              primaryBoxes[idx + 1].focus();
            } else if (isPinSetupMode) {
              confirmBoxes[0].focus();
            }
          } else {
            if (idx < 5) {
              confirmBoxes[idx + 1].focus();
            }
          }
        }
      });

      box.addEventListener('keydown', function (e) {
        const isPrimary = this.hasAttribute('data-idx');
        const idx = Number(isPrimary ? this.getAttribute('data-idx') : this.getAttribute('data-cidx'));

        if (e.key === 'Backspace' && !this.value) {
          if (isPrimary && idx > 0) {
            primaryBoxes[idx - 1].focus();
          } else if (!isPrimary) {
            if (idx > 0) confirmBoxes[idx - 1].focus();
            else primaryBoxes[5].focus();
          }
        } else if (e.key === 'ArrowLeft') {
          if (isPrimary && idx > 0) primaryBoxes[idx - 1].focus();
          else if (!isPrimary) {
            if (idx > 0) confirmBoxes[idx - 1].focus();
            else primaryBoxes[5].focus();
          }
        } else if (e.key === 'ArrowRight') {
          if (isPrimary && idx < 5) primaryBoxes[idx + 1].focus();
          else if (isPrimary && idx === 5 && isPinSetupMode) confirmBoxes[0].focus();
          else if (!isPrimary && idx < 5) confirmBoxes[idx + 1].focus();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          $('pinSubmitBtn').click();
        } else if (e.key === 'Escape') {
          closePinModal(null);
        }
      });

      box.addEventListener('paste', function (e) {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
        if (!text) return;
        const isPrimary = this.hasAttribute('data-idx');
        const targetList = isPrimary ? primaryBoxes : confirmBoxes;
        const startIdx = Number(isPrimary ? this.getAttribute('data-idx') : this.getAttribute('data-cidx'));
        for (let i = 0; i < 6 - startIdx && i < text.length; i++) {
          targetList[startIdx + i].value = text[i];
          targetList[startIdx + i].classList.remove('error');
        }
        const lastPos = Math.min(5, startIdx + text.length - 1);
        targetList[lastPos].focus();
      });
    });

    $('pinToggleVis').addEventListener('change', function () {
      allBoxes.forEach(b => { b.type = this.checked ? 'text' : 'password'; });
    });

    $('closePinModal').addEventListener('click', () => closePinModal(null));
    $('pinCancelBtn').addEventListener('click', () => closePinModal(null));
    privateCodeModal.addEventListener('click', (e) => {
      if (e.target === privateCodeModal) closePinModal(null);
    });

    $('pinSubmitBtn').addEventListener('click', async () => {
      const errorMsg = $('pinErrorMsg');
      errorMsg.hidden = true;
      const primaryPin = primaryBoxes.map(b => b.value).join('');

      if (primaryPin.length < 6) {
        errorMsg.textContent = 'Please enter all 6 digits.';
        errorMsg.hidden = false;
        primaryBoxes.forEach(b => { if (!b.value) b.classList.add('error'); });
        return;
      }

      if (isPinSetupMode) {
        const confirmPin = confirmBoxes.map(b => b.value).join('');
        if (confirmPin.length < 6) {
          errorMsg.textContent = 'Please enter all 6 confirmation digits.';
          errorMsg.hidden = false;
          confirmBoxes.forEach(b => { if (!b.value) b.classList.add('error'); });
          return;
        }
        if (primaryPin !== confirmPin) {
          errorMsg.textContent = 'Codes do not match. Please re-enter.';
          errorMsg.hidden = false;
          confirmBoxes.forEach(b => {
            b.value = '';
            b.classList.add('error');
          });
          confirmBoxes[0].focus();
          return;
        }

        $('pinSubmitBtn').disabled = true;
        try {
          const key = await SafifyStore.initPrivateVault(primaryPin);
          vaultKey = key;
          $('pinSubmitBtn').disabled = false;
          closePinModal(vaultKey);
        } catch (err) {
          $('pinSubmitBtn').disabled = false;
          errorMsg.textContent = 'Setup failed: ' + (err.message || err);
          errorMsg.hidden = false;
        }
      } else {
        $('pinSubmitBtn').disabled = true;
        try {
          const key = await SafifyStore.verifyAndUnlockPrivateVault(primaryPin);
          $('pinSubmitBtn').disabled = false;
          if (!key) {
            errorMsg.textContent = 'Incorrect 6-digit code. Please try again.';
            errorMsg.hidden = false;
            primaryBoxes.forEach(b => {
              b.classList.add('error');
              b.value = '';
            });
            primaryBoxes[0].focus();
            return;
          }
          vaultKey = key;
          closePinModal(vaultKey);
        } catch (err) {
          $('pinSubmitBtn').disabled = false;
          errorMsg.textContent = 'Verification error: ' + (err.message || err);
          errorMsg.hidden = false;
        }
      }
    });

    $('pinForgotBtn').addEventListener('click', () => {
      privateCodeModal.hidden = true;
      forgotCodeModal.hidden = false;
    });

    $('closeForgotModal').addEventListener('click', () => {
      forgotCodeModal.hidden = true;
      closePinModal(null);
    });
    $('forgotCancelBtn').addEventListener('click', () => {
      forgotCodeModal.hidden = true;
      closePinModal(null);
    });
    forgotCodeModal.addEventListener('click', (e) => {
      if (e.target === forgotCodeModal) {
        forgotCodeModal.hidden = true;
        closePinModal(null);
      }
    });

    $('forgotResetBtn').addEventListener('click', async () => {
      forgotCodeModal.hidden = true;
      await SafifyStore.resetPrivateVault();
      vaultKey = null;
      privateNotes = {};
      if (note && note.isPrivate) {
        const publicNotes = await SafifyStore.getAllNotes();
        const pList = Object.values(publicNotes).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        if (pList.length > 0) {
          loadNoteIntoEditor(pList[0]);
        } else {
          const fresh = SafifyStore.newNote();
          await SafifyStore.saveNote(fresh);
          loadNoteIntoEditor(fresh);
        }
      }
      isPrivateMode = false;
      renderSidebar(sbSearch.value);
      updatePrivacyUI();
      setTimeout(() => {
        askPinCode({ reason: 'Vault was reset. Create a new 6-digit code to start fresh.', forceSetup: true });
      }, 100);
    });
  })();

  /* ---------------- Private Vault Actions ---------------- */
  async function openPrivateVault() {
    if (!vaultKey) {
      const key = await askPinCode();
      if (!key) return false;
    }
    isPrivateMode = true;
    privateNotes = await SafifyStore.getPrivateDecryptedNotes(vaultKey);

    if (!note || !note.isPrivate) {
      const pList = Object.values(privateNotes).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      if (pList.length > 0) {
        loadNoteIntoEditor(pList[0]);
      } else {
        const freshP = SafifyStore.newNote('Untitled private note', true);
        await SafifyStore.savePrivateNote(freshP, vaultKey);
        privateNotes[freshP.id] = freshP;
        loadNoteIntoEditor(freshP);
      }
    } else {
      renderSidebar(sbSearch.value);
      updatePrivacyUI();
    }
    return true;
  }

  async function lockVault() {
    if (dirty) await flushSave();
    vaultKey = null;
    privateNotes = {};
    isPrivateMode = false;

    if (note && note.isPrivate) {
      const publicNotes = await SafifyStore.getAllNotes();
      const pList = Object.values(publicNotes).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      if (pList.length > 0) {
        loadNoteIntoEditor(pList[0]);
      } else {
        const fresh = SafifyStore.newNote();
        await SafifyStore.saveNote(fresh);
        loadNoteIntoEditor(fresh);
      }
    } else {
      renderSidebar(sbSearch.value);
      updatePrivacyUI();
    }
    saveStatus.textContent = 'Vault locked 🔒';
  }

  async function exitPrivateMode() {
    if (dirty) await flushSave();
    isPrivateMode = false;
    if (note && note.isPrivate) {
      const publicNotes = await SafifyStore.getAllNotes();
      const pList = Object.values(publicNotes).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      if (pList.length > 0) {
        loadNoteIntoEditor(pList[0]);
      } else {
        const fresh = SafifyStore.newNote();
        await SafifyStore.saveNote(fresh);
        loadNoteIntoEditor(fresh);
      }
    } else {
      renderSidebar(sbSearch.value);
      updatePrivacyUI();
    }
  }

  async function toggleNotePrivacy() {
    if (note.isPrivate) {
      const ok = await askConfirm('Make note public?', `Move "${note.title || 'Untitled note'}" to Public Notes? It will no longer be end-to-end encrypted.`);
      if (!ok) return;
      if (dirty) await flushSave();
      note.isPrivate = false;
      await SafifyStore.saveNote(note);
      if (vaultKey) {
        await SafifyStore.deletePrivateNote(note.id);
        delete privateNotes[note.id];
      }
      isPrivateMode = false;
      loadNoteIntoEditor(note);
      saveStatus.textContent = 'Moved to Public Notes 🔓';
      showToast('Moved to Public Notes 🔓');
    } else {
      if (!vaultKey) {
        const key = await askPinCode({ reason: 'Enter your 6-digit code to encrypt this note into your Private Vault' });
        if (!key) return;
      }
      if (dirty) await flushSave();
      note.isPrivate = true;
      await SafifyStore.savePrivateNote(note, vaultKey);
      await SafifyStore.deleteNote(note.id);
      privateNotes[note.id] = note;
      isPrivateMode = true;
      loadNoteIntoEditor(note);
      saveStatus.textContent = 'Encrypted in Private Vault 🔒';
      showToast('Encrypted in Private Vault 🔒');
    }
  }

  if (notePrivacyBtn) {
    notePrivacyBtn.addEventListener('click', toggleNotePrivacy);
  }
  if (sbPrivateFolderBtn) {
    sbPrivateFolderBtn.addEventListener('click', () => {
      if (isPrivateMode) exitPrivateMode();
      else openPrivateVault();
    });
  }
  if (sbLockVaultBtn) {
    sbLockVaultBtn.addEventListener('click', lockVault);
  }
  if (sbExitPrivateBtn) {
    sbExitPrivateBtn.addEventListener('click', exitPrivateMode);
  }

  /* ---------------- Shortcut Matching & Recording ---------------- */
  function matchesShortcut(e, shortcutStr) {
    if (!shortcutStr) return false;
    const parts = shortcutStr.split('+').map(s => s.trim().toLowerCase());
    const key = parts[parts.length - 1];
    const wantCtrl = parts.includes('ctrl') || parts.includes('control');
    const wantAlt = parts.includes('alt');
    const wantShift = parts.includes('shift');
    const wantMeta = parts.includes('meta') || parts.includes('cmd') || parts.includes('command');

    if (e.ctrlKey !== wantCtrl) return false;
    if (e.altKey !== wantAlt) return false;
    if (e.shiftKey !== wantShift) return false;
    if (e.metaKey !== wantMeta) return false;

    return e.key.toLowerCase() === key || e.code.toLowerCase() === ('key' + key) || e.code.toLowerCase() === key;
  }

  let recordedShortcut = settings.privateShortcut || 'Alt+P';
  function openShortcutRecorder() {
    recordedShortcut = settings.privateShortcut || 'Alt+P';
    $('shortcutRecordedText').textContent = recordedShortcut;
    shortcutRecordModal.hidden = false;
    const box = $('shortcutRecorderBox');
    setTimeout(() => box.focus(), 80);
  }

  $('shortcutRecorderBox').addEventListener('keydown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;

    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Cmd');

    if (parts.length === 0) {
      return;
    }

    const keyName = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    parts.push(keyName);
    recordedShortcut = parts.join('+');
    $('shortcutRecordedText').textContent = recordedShortcut;
  });

  $('closeShortcutModal').addEventListener('click', () => { shortcutRecordModal.hidden = true; });
  $('shortcutCancelBtn').addEventListener('click', () => { shortcutRecordModal.hidden = true; });
  shortcutRecordModal.addEventListener('click', (e) => {
    if (e.target === shortcutRecordModal) shortcutRecordModal.hidden = true;
  });
  $('shortcutSaveBtn').addEventListener('click', async () => {
    settings.privateShortcut = recordedShortcut;
    await SafifyStore.saveSettings(settings);
    if (currentShortcutDisplay) currentShortcutDisplay.textContent = recordedShortcut;
    shortcutRecordModal.hidden = true;
  });

  /* ---------------- Settings Tabs & Groq UI ---------------- */
  function openSettingsTab(tabName) {
    const tabs = settingsModal.querySelectorAll('.settings-tab-btn');
    const panels = settingsModal.querySelectorAll('.settings-panel');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    panels.forEach(p => p.classList.toggle('active', p.dataset.panel === tabName));
  }

  settingsModal.querySelectorAll('.settings-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => openSettingsTab(btn.dataset.tab));
  });

  const groqApiKeyInput = $('groqApiKeyInput');
  const toggleGroqKeyVisBtn = $('toggleGroqKeyVisBtn');
  const saveGroqKeyBtn = $('saveGroqKeyBtn');
  const testGroqKeyBtn = $('testGroqKeyBtn');
  const clearGroqKeyBtn = $('clearGroqKeyBtn');
  const groqStatusMsg = $('groqStatusMsg');
  const groqModelSelect = $('groqModelSelect');

  function updateModelSelectOptions(availableModels) {
    if (!groqModelSelect || !Array.isArray(availableModels) || availableModels.length === 0) return;
    const current = groqModelSelect.value || settings.groqModel;
    groqModelSelect.innerHTML = '';
    availableModels.forEach(mId => {
      const opt = document.createElement('option');
      opt.value = mId;
      if (mId === 'openai/gpt-oss-20b') opt.textContent = 'OpenAI GPT-OSS 20B (Cheapest & Ultra-fast 1,000 tps)';
      else if (mId === 'llama-3.3-70b-versatile') opt.textContent = 'LLaMA 3.3 70B (Versatile & High Quality)';
      else if (mId === 'openai/gpt-oss-120b') opt.textContent = 'OpenAI GPT-OSS 120B (High Reasoning)';
      else opt.textContent = mId;
      groqModelSelect.appendChild(opt);
    });
    if (availableModels.includes(current)) {
      groqModelSelect.value = current;
    } else if (availableModels.includes('openai/gpt-oss-20b')) {
      groqModelSelect.value = 'openai/gpt-oss-20b';
    } else if (availableModels.includes('llama-3.3-70b-versatile')) {
      groqModelSelect.value = 'llama-3.3-70b-versatile';
    } else {
      groqModelSelect.value = availableModels[0];
    }
    settings.groqModel = groqModelSelect.value;
    SafifyStore.saveSettings(settings);
  }

  async function loadGroqSettingsUI() {
    if (groqApiKeyInput) {
      const key = await SafifyStore.getGroqKey();
      groqApiKeyInput.value = key || '';
    }
    if (settings.groqModel === 'llama-3.1-8b-instant' || !settings.groqModel) {
      settings.groqModel = 'openai/gpt-oss-20b';
      await SafifyStore.saveSettings(settings);
    }
    if (groqModelSelect) {
      groqModelSelect.value = settings.groqModel;
    }
    if (groqStatusMsg) groqStatusMsg.hidden = true;
  }

  if (toggleGroqKeyVisBtn) {
    toggleGroqKeyVisBtn.addEventListener('click', () => {
      if (groqApiKeyInput.type === 'password') {
        groqApiKeyInput.type = 'text';
        toggleGroqKeyVisBtn.textContent = '🔒';
      } else {
        groqApiKeyInput.type = 'password';
        toggleGroqKeyVisBtn.textContent = '👁';
      }
    });
  }

  if (saveGroqKeyBtn) {
    saveGroqKeyBtn.addEventListener('click', async () => {
      const val = groqApiKeyInput.value.trim();
      await SafifyStore.saveGroqKey(val);
      if (groqStatusMsg) {
        groqStatusMsg.className = 'groq-status-msg success';
        groqStatusMsg.textContent = val ? '✓ Groq API Key encrypted with AES-256 and saved!' : 'Groq API Key removed.';
        groqStatusMsg.hidden = false;
      }
      showToast(val ? '✓ Groq API Key saved!' : 'Groq API Key removed');
    });
  }

  if (testGroqKeyBtn) {
    testGroqKeyBtn.addEventListener('click', async () => {
      const val = groqApiKeyInput.value.trim();
      if (!val) {
        if (groqStatusMsg) {
          groqStatusMsg.className = 'groq-status-msg error';
          groqStatusMsg.textContent = 'Please enter an API key to test.';
          groqStatusMsg.hidden = false;
        }
        return;
      }
      testGroqKeyBtn.textContent = 'Testing...';
      testGroqKeyBtn.disabled = true;
      const res = await SafifyStore.testGroqKey(val);
      testGroqKeyBtn.textContent = 'Test Connection';
      testGroqKeyBtn.disabled = false;
      if (res.ok) {
        if (Array.isArray(res.models) && res.models.length > 0) {
          updateModelSelectOptions(res.models);
        }
        if (groqStatusMsg) {
          groqStatusMsg.className = 'groq-status-msg success';
          groqStatusMsg.textContent = '✓ Successfully connected to Groq API! Active models synced.';
          groqStatusMsg.hidden = false;
        }
        showToast('✓ Groq connection successful!');
      } else {
        if (groqStatusMsg) {
          groqStatusMsg.className = 'groq-status-msg error';
          groqStatusMsg.textContent = 'Connection failed: ' + res.error;
          groqStatusMsg.hidden = false;
        }
      }
    });
  }

  if (clearGroqKeyBtn) {
    clearGroqKeyBtn.addEventListener('click', async () => {
      groqApiKeyInput.value = '';
      await SafifyStore.saveGroqKey('');
      if (groqStatusMsg) {
        groqStatusMsg.className = 'groq-status-msg';
        groqStatusMsg.textContent = 'API Key removed.';
        groqStatusMsg.hidden = false;
      }
      showToast('Groq API Key removed');
    });
  }

  if (groqModelSelect) {
    groqModelSelect.addEventListener('change', async () => {
      settings.groqModel = groqModelSelect.value;
      await SafifyStore.saveSettings(settings);
      showToast('Groq model preference saved');
    });
  }

  function syncSettingsUI() {
    settingsModal.querySelectorAll('[data-theme-choice]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.themeChoice === settings.theme);
    });
    $('defaultCellType').value = settings.defaultCellType;
    $('smoothingRange').value = Math.round(settings.diagramSmoothing * 100);
    $('smoothVal').textContent = Math.round(settings.diagramSmoothing * 100) + '%';

    if (settingShowPrivateFolder) {
      settingShowPrivateFolder.checked = settings.showPrivateFolder !== false;
    }
    if (currentShortcutDisplay) {
      currentShortcutDisplay.textContent = settings.privateShortcut || 'Alt+P';
    }
    if (settingsLockVaultBtn) {
      settingsLockVaultBtn.hidden = !vaultKey;
    }
  }

  if (settingShowPrivateFolder) {
    settingShowPrivateFolder.addEventListener('click', async (e) => {
      if (!vaultKey) {
        e.preventDefault();
        const targetState = !settingShowPrivateFolder.checked;
        const key = await askPinCode({ reason: 'Enter your 6-digit code to change Private Vault folder visibility' });
        if (!key) {
          settingShowPrivateFolder.checked = settings.showPrivateFolder !== false;
          return;
        }
        settingShowPrivateFolder.checked = targetState;
      }
      settings.showPrivateFolder = settingShowPrivateFolder.checked;
      await SafifyStore.saveSettings(settings);
      renderSidebar(sbSearch.value);
    });
  }

  if (changeShortcutBtn) {
    changeShortcutBtn.addEventListener('click', async () => {
      if (!vaultKey) {
        const key = await askPinCode({ reason: 'Enter your 6-digit code to configure Private shortcut' });
        if (!key) return;
      }
      openShortcutRecorder();
    });
  }

  if (settingsLockVaultBtn) {
    settingsLockVaultBtn.addEventListener('click', () => {
      lockVault();
      syncSettingsUI();
    });
  }

  if (settingsResetVaultBtn) {
    settingsResetVaultBtn.addEventListener('click', async () => {
      if (!vaultKey) {
        const key = await askPinCode({ reason: 'Enter your 6-digit code to reset your Private Vault' });
        if (!key) return;
      }
      settingsModal.hidden = true;
      forgotCodeModal.hidden = false;
    });
  }

  settingsModal.querySelectorAll('[data-theme-choice]').forEach(btn => {
    btn.addEventListener('click', async () => {
      settings.theme = btn.dataset.themeChoice;
      await SafifyStore.saveSettings(settings);
      applyTheme(settings.theme);
      syncSettingsUI();
    });
  });
  $('defaultCellType').addEventListener('change', async (e) => {
    settings.defaultCellType = e.target.value;
    await SafifyStore.saveSettings(settings);
  });
  $('smoothingRange').addEventListener('input', async (e) => {
    settings.diagramSmoothing = Number(e.target.value) / 100;
    $('smoothVal').textContent = e.target.value + '%';
    await SafifyStore.saveSettings(settings);
  });
  // re-draw diagrams with the new smoothing once the slider is released
  $('smoothingRange').addEventListener('change', () => renderNotebook());

  /* ---------------- Keyboard shortcuts ---------------- */
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      dirty = true;
      flushSave();
      return;
    }

    // Private Vault Shortcut (Default Alt+P or user-configured)
    if (matchesShortcut(e, settings.privateShortcut || 'Alt+P')) {
      e.preventDefault();
      if (isPrivateMode && vaultKey) {
        exitPrivateMode();
      } else {
        openPrivateVault();
      }
    }
  });

  renderNotebook();
  renderSidebar();
  updateTrashBadge();

  // Export requested from the toolbar popup (PDF/PNG/JPG run here, in a full-size page)
  if (pendingExport) {
    history.replaceState(null, '', `editor.html?id=${encodeURIComponent(noteId)}`);
    setTimeout(() => runExport(pendingExport), 400);
  }

  // Open private vault automatically if requested via URL param (e.g. from popup)
  if (openPrivateOnLoad) {
    setTimeout(openPrivateVault, 250);
  }
})();
