/* SafifyNote — diagram cell: freehand pencil/brush/eraser canvas with
   adjustable smoothing (controlled from global Settings) and shapes/text/image tools.
   The same renderer (drawStroke / renderAll) is used for the editor AND for exports,
   so PDF / PNG / JPG always match what you see on screen. */

const SafifyDiagram = {
  imageCache: {},
  _smoothCache: new WeakMap(),

  loadImage(src) {
    return new Promise(resolve => {
      if (this.imageCache[src]) return resolve(this.imageCache[src]);
      const img = new Image();
      img.onload = () => { this.imageCache[src] = img; resolve(img); };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  },

  async ensureImages(strokes) {
    await Promise.all((strokes || [])
      .filter(s => s && s.tool === 'image' && s.imgData)
      .map(s => this.loadImage(s.imgData)));
  },

  // Chaikin corner-cutting smoothing
  chaikin(points, iterations) {
    if (points.length < 3 || iterations < 1) return points;
    let smoothed = points;
    for (let iter = 0; iter < iterations; iter++) {
      const next = [smoothed[0]];
      for (let i = 0; i < smoothed.length - 1; i++) {
        const p0 = smoothed[i], p1 = smoothed[i + 1];
        next.push({ x: 0.75 * p0.x + 0.25 * p1.x, y: 0.75 * p0.y + 0.25 * p1.y });
        next.push({ x: 0.25 * p0.x + 0.75 * p1.x, y: 0.25 * p0.y + 0.75 * p1.y });
      }
      next.push(smoothed[smoothed.length - 1]);
      smoothed = next;
    }
    return smoothed;
  },

  smoothedPoints(stroke, iterations) {
    const c = this._smoothCache.get(stroke);
    if (c && c.it === iterations && c.n === stroke.points.length) return c.pts;
    const pts = this.chaikin(stroke.points, iterations);
    this._smoothCache.set(stroke, { it: iterations, n: stroke.points.length, pts });
    return pts;
  },

  drawStroke(ctx, rawStroke, opts = {}) {
    const bg = opts.bg || '#ffffff';
    const smoothing = typeof opts.smoothing === 'number' ? opts.smoothing : 0.5;
    // Backwards compatibility: old notes stored strokes as plain point arrays
    const stroke = Array.isArray(rawStroke)
      ? { tool: 'pencil', color: '#14171F', size: 3, points: rawStroke }
      : rawStroke;
    if (!stroke) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const color = stroke.tool === 'eraser' ? bg : (stroke.color || '#14171F');
    ctx.strokeStyle = color;
    ctx.fillStyle = color;

    if (stroke.tool === 'pencil' || stroke.tool === 'brush' || stroke.tool === 'eraser') {
      if (!stroke.points || !stroke.points.length) { ctx.restore(); return; }
      const size = stroke.size || 3;
      ctx.globalAlpha = stroke.tool === 'brush' ? 0.55 : 1;
      ctx.lineWidth = stroke.tool === 'brush' ? size * 2 : stroke.tool === 'eraser' ? size * 5 : size;
      let pts = stroke.points;
      const iterations = Math.round(smoothing * 3);
      if (iterations > 0 && stroke.tool !== 'eraser') pts = this.smoothedPoints(stroke, iterations);
      ctx.beginPath();
      if (pts.length === 1) {
        ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    } else if (['rect', 'circle', 'line', 'triangle'].includes(stroke.tool)) {
      if (!stroke.start || !stroke.end) { ctx.restore(); return; }
      ctx.lineWidth = stroke.size || 3;
      const { start, end } = stroke;
      const w = end.x - start.x, h = end.y - start.y;
      ctx.beginPath();
      if (stroke.tool === 'rect') {
        ctx.strokeRect(start.x, start.y, w, h);
      } else if (stroke.tool === 'circle') {
        ctx.arc(start.x, start.y, Math.hypot(w, h), 0, Math.PI * 2);
        ctx.stroke();
      } else if (stroke.tool === 'line') {
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      } else {
        ctx.moveTo(start.x + w / 2, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.lineTo(start.x, end.y);
        ctx.closePath();
        ctx.stroke();
      }
    } else if (stroke.tool === 'text') {
      const fs = (stroke.size || 3) * 4 + 10;
      ctx.font = `${fs}px sans-serif`;
      ctx.textBaseline = 'top';
      String(stroke.text || '').split('\n').forEach((line, i) => {
        ctx.fillText(line, stroke.pos.x, stroke.pos.y + i * (fs * 1.25));
      });
    } else if (stroke.tool === 'image') {
      const img = this.imageCache[stroke.imgData];
      if (img) ctx.drawImage(img, stroke.pos.x, stroke.pos.y, stroke.width, stroke.height);
    }
    ctx.restore();
  },

  renderAll(ctx, width, height, diagram, smoothing) {
    const bg = diagram.bg || '#ffffff';
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
    (diagram.strokes || []).forEach(s => this.drawStroke(ctx, s, { smoothing, bg }));
  },

  /** Used by export.js — paints the full diagram (every tool) onto a canvas. */
  async renderToCanvas(canvas, diagram, smoothing = 0.5) {
    canvas.width = diagram.width || 900;
    canvas.height = diagram.height || 420;
    await this.ensureImages(diagram.strokes);
    this.renderAll(canvas.getContext('2d'), canvas.width, canvas.height, diagram, smoothing);
  },

  mount(host, cell, { onChange, getSmoothing }) {
    const diagram = cell.diagram || (cell.diagram = { strokes: [], width: 900, height: 420, bg: '#ffffff' });
    if (!diagram.strokes) diagram.strokes = [];
    const changed = () => onChange && onChange();

    host.innerHTML = `
      <div class="diagram-head">
        <button class="diagram-tool-btn active" data-tool="pencil" title="Pencil">✎</button>
        <button class="diagram-tool-btn" data-tool="brush" title="Brush">🖌</button>
        <button class="diagram-tool-btn" data-tool="eraser" title="Eraser">▭</button>
        <div class="sep"></div>
        <button class="diagram-tool-btn" data-tool="line" title="Line (hold Shift to snap)">╱</button>
        <button class="diagram-tool-btn" data-tool="rect" title="Rectangle (hold Shift for square)">□</button>
        <button class="diagram-tool-btn" data-tool="circle" title="Circle">○</button>
        <button class="diagram-tool-btn" data-tool="triangle" title="Triangle">△</button>
        <div class="sep"></div>
        <button class="diagram-tool-btn" data-tool="text" title="Text (Enter to place)">T</button>
        <button class="diagram-tool-btn" data-tool="image" title="Image">🖼</button>
        <input type="file" class="diagram-image-input" accept="image/*" hidden />
        <div class="sep"></div>
        <input type="color" class="diagram-color" value="#14171F" title="Colour" />
        <input type="range" class="diagram-size" min="1" max="40" value="3" title="Tool size" />
        <div class="sep"></div>
        <button class="diagram-tool-btn" data-action="undo" title="Undo last stroke">↶</button>
        <button class="diagram-clear" data-action="clear">Clear</button>
      </div>
      <div class="diagram-canvas-wrap" style="position:relative;">
        <canvas></canvas>
        <textarea class="diagram-text-input" style="position:absolute; display:none; background:transparent; border:1px dashed #0EA5A0; padding:2px; margin:0; outline:none; font-family:sans-serif; resize:none; overflow:hidden; line-height:1.25; white-space:pre;"></textarea>
      </div>
      <div class="diagram-resize" title="Drag to change the canvas height"></div>
    `;

    const canvas = host.querySelector('canvas');
    const wrap = host.querySelector('.diagram-canvas-wrap');
    const colorInput = host.querySelector('.diagram-color');
    const sizeInput = host.querySelector('.diagram-size');
    const toolBtns = [...host.querySelectorAll('[data-tool]')];
    const imageInput = host.querySelector('.diagram-image-input');
    const textInput = host.querySelector('.diagram-text-input');
    const resizer = host.querySelector('.diagram-resize');

    canvas.width = diagram.width || 900;
    canvas.height = diagram.height || 420;
    const ctx = canvas.getContext('2d');

    // Off-screen layer holding every committed stroke → fast redraw while drawing
    const base = document.createElement('canvas');
    base.width = canvas.width; base.height = canvas.height;
    const bctx = base.getContext('2d');
    let baseValid = false, baseSmooth = null;

    const state = { tool: 'pencil', color: '#14171F', size: 3 };
    let drawing = false, currentStroke = null;
    let textPos = null, textStyle = null, pendingImagePos = null;

    const smooth = () => (typeof getSmoothing === 'function' ? getSmoothing() : 0.5);
    const bg = () => diagram.bg || '#ffffff';

    function rebuildBase() {
      SafifyDiagram.renderAll(bctx, base.width, base.height, diagram, smooth());
      baseValid = true;
      baseSmooth = smooth();
    }
    function redraw() {
      if (!baseValid || baseSmooth !== smooth()) rebuildBase();
      ctx.drawImage(base, 0, 0);
      if (currentStroke) SafifyDiagram.drawStroke(ctx, currentStroke, { smoothing: smooth(), bg: bg() });
    }
    function invalidate() { baseValid = false; redraw(); }
    function commit(stroke) {
      diagram.strokes.push(stroke);
      if (baseValid) SafifyDiagram.drawStroke(bctx, stroke, { smoothing: smooth(), bg: bg() });
      redraw();
      changed();
    }

    SafifyDiagram.ensureImages(diagram.strokes).then(invalidate);

    function scaleOf() {
      const rect = canvas.getBoundingClientRect();
      return { rect, sx: canvas.width / (rect.width || 1), sy: canvas.height / (rect.height || 1) };
    }
    function getPos(e) {
      const { rect, sx, sy } = scaleOf();
      return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
    }

    /* ---------- text tool ---------- */
    function openText(pos) {
      closeTextInput();
      const { sx } = scaleOf();
      textPos = pos;
      textStyle = { color: state.color, size: state.size };
      const fontCanvasPx = state.size * 4 + 10;
      textInput.style.display = 'block';
      textInput.style.left = (pos.x / sx) + 'px';
      textInput.style.top = (pos.y / sx) + 'px';
      textInput.style.color = state.color;
      textInput.style.fontSize = (fontCanvasPx / sx) + 'px';
      textInput.style.minWidth = '100px';
      textInput.value = '';
      sizeText();
      setTimeout(() => textInput.focus(), 30);
    }
    function sizeText() {
      textInput.style.height = 'auto';
      textInput.style.height = textInput.scrollHeight + 'px';
      textInput.style.width = Math.max(100, textInput.scrollWidth + 6) + 'px';
    }
    let closing = false;
    function closeTextInput(cancel) {
      if (closing || textInput.style.display === 'none') return;
      closing = true;
      const val = textInput.value.replace(/\s+$/, '');
      textInput.style.display = 'none';
      textInput.value = '';
      if (!cancel && val.trim() && textPos) {
        commit({ tool: 'text', color: textStyle.color, size: textStyle.size, text: val, pos: textPos });
      }
      textPos = null;
      closing = false;
    }
    textInput.addEventListener('input', sizeText);
    textInput.addEventListener('blur', () => closeTextInput());
    textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); closeTextInput(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeTextInput(true); }
      e.stopPropagation();
    });

    /* ---------- images ---------- */
    async function placeImage(file, pos) {
      if (!file) return;
      const b64 = await SafifyImage.compress(file, 1400);
      const img = await SafifyDiagram.loadImage(b64);
      if (!img) return;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > canvas.width * 0.8) { h = h * (canvas.width * 0.8 / w); w = canvas.width * 0.8; }
      if (h > canvas.height * 0.8) { w = w * (canvas.height * 0.8 / h); h = canvas.height * 0.8; }
      commit({ tool: 'image', imgData: b64, pos, width: w, height: h });
    }
    imageInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      await placeImage(file, pendingImagePos || { x: 10, y: 10 });
      pendingImagePos = null;
      e.target.value = '';
    });
    wrap.addEventListener('dragover', e => e.preventDefault());
    wrap.addEventListener('drop', async (e) => {
      const file = SafifyImage.extractImageFile(e);
      if (!file) return;
      e.preventDefault();
      await placeImage(file, getPos(e));
    });
    canvas.addEventListener('paste', () => {});

    /* ---------- pointer drawing (mouse + touch + pen, no duplicate events) ---------- */
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const pos = getPos(e);
      if (state.tool === 'text') { e.preventDefault(); openText(pos); return; }
      closeTextInput();
      if (state.tool === 'image') { e.preventDefault(); pendingImagePos = pos; imageInput.click(); return; }
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      drawing = true;
      if (['pencil', 'brush', 'eraser'].includes(state.tool)) {
        currentStroke = { tool: state.tool, color: state.color, size: state.size, points: [pos] };
      } else {
        currentStroke = { tool: state.tool, color: state.color, size: state.size, start: pos, end: pos };
      }
      redraw();
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!drawing || !currentStroke) return;
      const pos = getPos(e);
      if (currentStroke.points) {
        const last = currentStroke.points[currentStroke.points.length - 1];
        if (Math.hypot(pos.x - last.x, pos.y - last.y) > 1.5) {
          currentStroke.points.push(pos);
          redraw();
        }
      } else {
        let { x, y } = pos;
        const s = currentStroke.start;
        if (e.shiftKey) {
          const w = x - s.x, h = y - s.y;
          if (state.tool === 'line') {
            const ang = Math.round(Math.atan2(h, w) / (Math.PI / 4)) * (Math.PI / 4);
            const len = Math.hypot(w, h);
            x = s.x + Math.cos(ang) * len;
            y = s.y + Math.sin(ang) * len;
          } else if (state.tool === 'rect' || state.tool === 'triangle') {
            const side = Math.max(Math.abs(w), Math.abs(h));
            x = s.x + Math.sign(w || 1) * side;
            y = s.y + Math.sign(h || 1) * side;
          }
        }
        currentStroke.end = { x, y };
        redraw();
      }
    });

    function finish(e) {
      if (!drawing) return;
      drawing = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const stroke = currentStroke;
      currentStroke = null;
      if (stroke) {
        const isShape = !stroke.points;
        const empty = isShape && stroke.start.x === stroke.end.x && stroke.start.y === stroke.end.y;
        if (!empty) commit(stroke); else redraw();
      }
    }
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);

    /* ---------- toolbar ---------- */
    function setCursor() {
      canvas.style.cursor = state.tool === 'text' ? 'text' : state.tool === 'image' ? 'copy' : 'crosshair';
    }
    toolBtns.forEach(btn => btn.addEventListener('click', () => {
      closeTextInput();
      toolBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.tool = btn.dataset.tool;
      setCursor();
    }));
    colorInput.addEventListener('input', () => { state.color = colorInput.value; });
    sizeInput.addEventListener('input', () => { state.size = Number(sizeInput.value); });

    host.querySelector('[data-action="undo"]').addEventListener('click', () => {
      closeTextInput(true);
      if (!diagram.strokes.length) return;
      diagram.strokes.pop();
      invalidate();
      changed();
    });
    host.querySelector('[data-action="clear"]').addEventListener('click', () => {
      closeTextInput(true);
      if (diagram.strokes.length && !confirm('Clear the whole diagram?')) return;
      diagram.strokes = [];
      invalidate();
      changed();
    });

    /* ---------- resize handle (change canvas height) ---------- */
    let resizing = null;
    resizer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      resizer.setPointerCapture(e.pointerId);
      resizing = { y: e.clientY, h: canvas.height, sy: scaleOf().sy };
    });
    resizer.addEventListener('pointermove', (e) => {
      if (!resizing) return;
      const nh = Math.round(Math.min(2000, Math.max(200, resizing.h + (e.clientY - resizing.y) * resizing.sy)));
      if (nh === canvas.height) return;
      canvas.height = nh; base.height = nh; diagram.height = nh;
      invalidate();
    });
    const endResize = (e) => {
      if (!resizing) return;
      resizing = null;
      try { resizer.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      changed();
    };
    resizer.addEventListener('pointerup', endResize);
    resizer.addEventListener('pointercancel', endResize);

    setCursor();
    redraw();
    return { redraw: invalidate };
  }
};
