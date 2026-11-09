/* SafifyNote — export engine (PDF / PNG / JPG / .sff)

   How it works (this is what fixes the "half downloaded / cut in half" PDFs):
   1. The note is turned into a list of small "blocks" (title, one paragraph / heading /
      image / list, a chunk of code, a diagram …) laid out in an off-screen sheet.
   2. Every block is rasterised on its own with html2canvas, so no giant canvas is ever
      created (browsers silently truncate canvases above ~16k px — that was the cut-off).
   3. Blocks are placed on A4 pages (PDF) or stitched into tall images (PNG/JPG) without
      ever slicing through a block; headings are kept together with the block after them. */

const SafifyExport = {
  CONTENT_W: 732,      // css px — width of a block inside the 820px sheet
  SCALE: 2,

  PAGE_CSS: `
    .sfx-sheet, .sfx-sheet * { box-sizing: border-box; }
    .sfx-block { display: flow-root; width: 732px; background: #fff; color: #14171F; }
    .sfx-title { font-size: 26px; font-weight: 700; letter-spacing: -0.4px; line-height: 1.25; padding-bottom: 2px; word-break: break-word; }
    .sfx-meta { font-size: 12px; color: #8A8F9C; padding-bottom: 14px; }
    .sfx-vis { font-size: 14px; line-height: 1.6; word-break: break-word; }
    .sfx-vis h1 { font-size: 24px; font-weight: 700; margin: 0.3em 0; letter-spacing: -0.3px; line-height: 1.25; }
    .sfx-vis h2 { font-size: 19px; font-weight: 700; margin: 0.3em 0; letter-spacing: -0.2px; line-height: 1.3; }
    .sfx-vis h3 { font-size: 16px; font-weight: 600; margin: 0.3em 0; line-height: 1.35; }
    .sfx-vis h4 { font-size: 14.5px; font-weight: 600; margin: 0.3em 0; line-height: 1.4; }
    .sfx-vis p { margin: 0.4em 0; min-height: 1.6em; }
    .sfx-vis blockquote { margin: 0.5em 0; padding: 4px 14px; border-left: 3px solid #5B5FEF; color: #565A66; font-style: italic; }
    .sfx-vis ul, .sfx-vis ol { margin: 0.4em 0; padding-left: 1.4em; }
    .sfx-vis a { color: #4245C4; }
    .sfx-vis img { max-width: 100%; height: auto; border-radius: 8px; }
    .sfx-code { border: 1px solid #E5E7EB; border-radius: 10px; overflow: hidden; }
    .sfx-code-label { font-size: 11px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; color: #0EA5A0; background: #E4F8F6; padding: 6px 14px; }
    .sfx-code pre { margin: 0; padding: 12px 16px; font-family: 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.55; white-space: pre-wrap; word-break: break-word; background: #F7F8FA; color: #14171F; }
    .sfx-diagram { border: 1px solid #E5E7EB; border-radius: 10px; overflow: hidden; background: #fff; }
    .sfx-diagram canvas { width: 100%; display: block; }
  `,

  languageLabel(lang) {
    return { html: 'HTML', css: 'CSS', javascript: 'JavaScript', multi: 'HTML+CSS+JS' }[lang] || lang;
  },

  showBusy(msg) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(255,255,255,.94);display:flex;align-items:center;justify-content:center;font:600 14px Inter,-apple-system,sans-serif;color:#14171F;';
    el.textContent = msg;
    document.body.appendChild(el);
    return { set(t) { el.textContent = t; }, close() { el.remove(); } };
  },

  /** Builds the off-screen sheet and returns the blocks to rasterise. */
  async buildSheet(note) {
    const settings = await SafifyStore.getSettings();
    const wrap = document.createElement('div');
    wrap.className = 'sfx-sheet';
    wrap.style.cssText = `position:absolute; left:0; top:0; width:820px; padding:40px 44px; background:#fff;
      color:#14171F; font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; z-index:0;`;
    const style = document.createElement('style');
    style.textContent = this.PAGE_CSS;
    wrap.appendChild(style);

    const items = [];
    const add = (el, opts = {}) => {
      el.classList.add('sfx-block');
      wrap.appendChild(el);
      items.push(Object.assign({ el, gapPx: 0, keepNext: false, fit: false }, opts));
    };

    // header
    const head = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'sfx-title';
    title.textContent = note.title || 'Untitled note';
    const meta = document.createElement('div');
    meta.className = 'sfx-meta';
    meta.textContent = `SafifyNote · ${new Date(note.updatedAt || Date.now()).toLocaleString()}`;
    head.appendChild(title);
    head.appendChild(meta);
    add(head, { keepNext: true });

    for (const cell of (note.cells || [])) {
      if (cell.type === 'visual') {
        const parsed = new DOMParser().parseFromString(
          '<body>' + safifySanitizeHtml(cell.visual && cell.visual.html) + '</body>', 'text/html');
        const root = parsed.body;
        const hasContent = (root.textContent || '').trim() || root.querySelector('img');
        if (!hasContent) continue;
        safifyNormalizeBlocks(root);
        const kids = Array.from(root.childNodes).filter(n => n.nodeType === 1);
        kids.forEach((k, i) => {
          const holder = document.createElement('div');
          holder.className = 'sfx-vis';
          holder.appendChild(document.importNode(k, true));
          add(holder, { gapPx: i === kids.length - 1 ? 12 : 0, keepNext: /^H[1-6]$/.test(k.tagName) });
        });
      } else if (cell.type === 'code') {
        const src = String((cell.code && cell.code.source) || '').replace(/\s+$/, '');
        if (!src.trim()) continue;
        const lines = src.split('\n');
        const CHUNK = 38;
        for (let i = 0; i < lines.length; i += CHUNK) {
          const box = document.createElement('div');
          box.className = 'sfx-code';
          if (i === 0) {
            const label = document.createElement('div');
            label.className = 'sfx-code-label';
            label.textContent = this.languageLabel((cell.code && cell.code.language) || 'html');
            box.appendChild(label);
          }
          const pre = document.createElement('pre');
          pre.textContent = lines.slice(i, i + CHUNK).join('\n');
          box.appendChild(pre);
          add(box, { gapPx: i + CHUNK >= lines.length ? 14 : 4 });
        }
      } else if (cell.type === 'diagram') {
        const d = cell.diagram;
        if (!d || !d.strokes || !d.strokes.length) continue;
        const box = document.createElement('div');
        box.className = 'sfx-diagram';
        const canvas = document.createElement('canvas');
        await SafifyDiagram.renderToCanvas(canvas, d, settings.diagramSmoothing);
        box.appendChild(canvas);
        add(box, { gapPx: 14, fit: true });
      }
    }
    document.body.appendChild(wrap);
    return { wrap, items };
  },

  async rasterItems(items, busy) {
    const out = [];
    for (let i = 0; i < items.length; i++) {
      if (busy) busy.set(`Rendering ${i + 1} / ${items.length}…`);
      const canvas = await html2canvas(items[i].el, {
        scale: this.SCALE, backgroundColor: '#ffffff', useCORS: true, logging: false
      });
      out.push(Object.assign({}, items[i], { canvas }));
      await new Promise(r => setTimeout(r, 0)); // let the UI breathe
    }
    return out;
  },

  async prepare(note, label) {
    if (typeof html2canvas !== 'function') throw new Error('html2canvas library is missing (lib/html2canvas.min.js).');
    const busy = this.showBusy(label);
    let sheet = null;
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      sheet = await this.buildSheet(note);
      await new Promise(r => setTimeout(r, 80)); // let layout / images settle
      const rendered = await this.rasterItems(sheet.items, busy);
      return { rendered, cleanup: () => { sheet.wrap.remove(); busy.close(); } };
    } catch (err) {
      if (sheet) sheet.wrap.remove();
      busy.close();
      throw err;
    }
  },

  /* ----------------------------- PDF ----------------------------- */
  async toPDF(note) {
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF library is missing (lib/jspdf.umd.min.js).');
    const { rendered, cleanup } = await this.prepare(note, 'Preparing PDF…');
    try {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
      pdf.setProperties({ title: note.title || 'SafifyNote', creator: 'SafifyNote' });
      const PW = 210, PH = 297, M = 12, FOOT = 8;
      const cw = PW - 2 * M;
      const usable = PH - 2 * M - FOOT;
      const bottom = M + usable;
      const mmPerCssPx = cw / this.CONTENT_W;
      const hOf = it => it.canvas.height * cw / it.canvas.width;

      let y = M;
      for (let i = 0; i < rendered.length; i++) {
        const it = rendered[i];
        let w = cw, x = M, h = hOf(it);
        const gap = it.gapPx * mmPerCssPx;

        if (h > usable && it.fit) {              // diagrams: scale down to fit one page
          const f = usable / h;
          w = cw * f; h = usable; x = M + (cw - w) / 2;
        }

        let need = h;
        if (it.keepNext && rendered[i + 1]) need += Math.min(hOf(rendered[i + 1]), 28);

        if (h <= usable) {
          if (y > M && y + need > bottom) { pdf.addPage(); y = M; }
          pdf.addImage(it.canvas.toDataURL('image/png'), 'PNG', x, y, w, h, undefined, 'FAST');
          y += h + gap;
        } else {
          // a single block taller than a page (e.g. a huge list): the only case we slice
          if (y > M) { pdf.addPage(); y = M; }
          const slicePx = Math.floor(usable * it.canvas.width / cw);
          for (let off = 0; off < it.canvas.height; off += slicePx) {
            const sh = Math.min(slicePx, it.canvas.height - off);
            const part = document.createElement('canvas');
            part.width = it.canvas.width; part.height = sh;
            const pctx = part.getContext('2d');
            pctx.fillStyle = '#fff'; pctx.fillRect(0, 0, part.width, part.height);
            pctx.drawImage(it.canvas, 0, off, it.canvas.width, sh, 0, 0, it.canvas.width, sh);
            const shMm = sh * cw / it.canvas.width;
            if (off > 0) { pdf.addPage(); y = M; }
            pdf.addImage(part.toDataURL('image/png'), 'PNG', M, y, cw, shMm, undefined, 'FAST');
            y += shMm;
          }
          y += gap;
        }
      }

      const total = pdf.getNumberOfPages();
      for (let p = 1; p <= total; p++) {
        pdf.setPage(p);
        pdf.setFontSize(8);
        pdf.setTextColor(150, 154, 166);
        pdf.text(`SafifyNote  ·  ${p} / ${total}`, PW / 2, PH - 6, { align: 'center' });
      }
      pdf.save(`${safifySlugify(note.title)}.pdf`);
    } finally {
      cleanup();
    }
  },

  /* ------------------------- PNG / JPG --------------------------- */
  async toImage(note, mime) {
    const { rendered, cleanup } = await this.prepare(note, mime === 'image/png' ? 'Preparing PNG…' : 'Preparing JPG…');
    try {
      const S = this.SCALE;
      const padX = 44 * S, padY = 40 * S;
      const sheetW = 820 * S;
      const MAX_H = 14000;                       // safe canvas height for every browser
      const ext = mime === 'image/png' ? 'png' : 'jpg';

      // split blocks into parts that each fit one image (never cutting a block)
      const parts = [];
      let cur = { items: [], h: padY };
      rendered.forEach(it => {
        const h = it.canvas.height, gap = it.gapPx * S;
        if (cur.items.length && cur.h + h > MAX_H - padY) { parts.push(cur); cur = { items: [], h: padY }; }
        cur.items.push({ it, y: cur.h });
        cur.h += h + gap;
      });
      parts.push(cur);

      for (let p = 0; p < parts.length; p++) {
        const part = parts[p];
        const canvas = document.createElement('canvas');
        canvas.width = sheetW;
        canvas.height = Math.ceil(part.h + padY);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        part.items.forEach(({ it, y }) => ctx.drawImage(it.canvas, padX, y));
        const name = `${safifySlugify(note.title)}${parts.length > 1 ? '-part' + (p + 1) : ''}.${ext}`;
        await new Promise(resolve => canvas.toBlob(blob => {
          if (blob) safifyDownloadBlob(blob, name);
          resolve();
        }, mime, 0.92));
        if (parts.length > 1) await new Promise(r => setTimeout(r, 350));
      }
    } finally {
      cleanup();
    }
  },

  toPNG(note) { return this.toImage(note, 'image/png'); },
  toJPG(note) { return this.toImage(note, 'image/jpeg'); },

  toSFF(note) {
    const text = SafifyFormat.exportNote(note);
    SafifyFormat.downloadText(`${safifySlugify(note.title)}.sff`, text);
  }
};
