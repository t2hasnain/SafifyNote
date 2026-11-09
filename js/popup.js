(async function () {
  const notesList = document.getElementById('notesList');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const newNoteBtn = document.getElementById('newNoteBtn');
  const themeToggle = document.getElementById('themeToggle');
  const importBtn = document.getElementById('importBtn');
  const importInput = document.getElementById('importInput');
  const privateVaultBtn = document.getElementById('privateVaultBtn');
  const cardMenu = document.getElementById('cardMenu');

  let allNotes = [];
  let activeMenuNoteId = null;

  const settings = await SafifyStore.getSettings();
  applyTheme(settings.theme);

  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
  }

  async function loadNotes() {
    const notesObj = await SafifyStore.getAllNotes();
    allNotes = Object.values(notesObj).sort((a, b) => b.updatedAt - a.updatedAt);
    render(allNotes);
  }

  function cellCounts(note) {
    const counts = { visual: 0, code: 0, diagram: 0 };
    (note.cells || []).forEach(c => { if (counts[c.type] !== undefined) counts[c.type]++; });
    return counts;
  }

  function render(notes) {
    notesList.innerHTML = '';
    emptyState.hidden = notes.length !== 0;
    notes.forEach(note => {
      const card = document.createElement('div');
      card.className = 'note-card';
      card.dataset.id = note.id;

      const counts = cellCounts(note);
      const chips = Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([type, n]) => `<span class="cell-chip ${type}">${type} ${n}</span>`).join('');

      card.innerHTML = `
        <div class="note-card-top">
          <div class="note-title">${escapeHtml(note.title || 'Untitled note')}</div>
          <button class="note-more" title="More options">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
          </button>
        </div>
        <div class="note-preview">${escapeHtml(safifyPlainPreview(note))}</div>
        <div class="note-meta">
          <span class="note-date">${safifyFormatDate(note.updatedAt)}</span>
          ${chips}
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.note-more')) return;
        openEditor(note.id);
      });

      card.querySelector('.note-more').addEventListener('click', (e) => {
        e.stopPropagation();
        activeMenuNoteId = note.id;
        const rect = e.currentTarget.getBoundingClientRect();
        cardMenu.style.left = Math.min(rect.left, 380 - 170) + 'px';
        cardMenu.style.top = (rect.bottom + 4) + 'px';
        cardMenu.hidden = false;
      });

      notesList.appendChild(card);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function openEditor(noteId, exportKind) {
    let url = chrome.runtime.getURL(`editor.html?id=${encodeURIComponent(noteId)}`);
    if (exportKind) url += `&export=${exportKind}`;
    chrome.tabs.create({ url });
  }

  newNoteBtn.addEventListener('click', async () => {
    const note = SafifyStore.newNote();
    await SafifyStore.saveNote(note);
    openEditor(note.id);
  });

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) return render(allNotes);
    render(allNotes.filter(n =>
      (n.title || '').toLowerCase().includes(q) || safifyPlainPreview(n).toLowerCase().includes(q)
    ));
  });

  themeToggle.addEventListener('click', async () => {
    const s = await SafifyStore.getSettings();
    s.theme = s.theme === 'dark' ? 'light' : 'dark';
    await SafifyStore.saveSettings(s);
    applyTheme(s.theme);
  });

  if (privateVaultBtn) {
    privateVaultBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('editor.html?openPrivate=1') });
    });
  }

  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const note = SafifyFormat.parseSff(text);
      note.id = SafifyStore.newId(); // avoid collisions
      note.updatedAt = Date.now();
      await SafifyStore.saveNote(note);
      await loadNotes();
    } catch (err) {
      alert(err.message || 'Could not import this file.');
    }
    importInput.value = '';
  });

  document.addEventListener('click', (e) => {
    if (!cardMenu.hidden && !cardMenu.contains(e.target)) cardMenu.hidden = true;
  });

  cardMenu.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (!action || !activeMenuNoteId) return;
    cardMenu.hidden = true;
    const note = await SafifyStore.getNote(activeMenuNoteId);
    if (!note) return;

    if (action === 'open') openEditor(note.id);
    // PDF / PNG / JPG need a full-size page to render correctly, so they run in the editor tab
    else if (action === 'pdf' || action === 'png' || action === 'jpg') openEditor(note.id, action);
    else if (action === 'sff') SafifyExport.toSFF(note);
    else if (action === 'delete') {
      if (confirm(`Delete "${note.title}"? It will be moved to Delete History.`)) {
        await SafifyStore.moveToTrash(note.id);
        await loadNotes();
      }
    }
  });

  await loadNotes();
})();
