/* SafifyNote — code cell: write HTML / CSS / JavaScript / combined,
   press the Run button or Shift+Enter to render it live in a sandboxed iframe.
   console.log / errors from the preview are shown in a console panel under the preview,
   and the preview grows to fit its content. */

const SafifyCode = {
  SAMPLES: {
    html: '<h2>Hello 👋</h2>\n<p>Edit this HTML, then press <b>Shift + Enter</b> to render it.</p>',
    css: 'body {\n  font-family: sans-serif;\n  color: #5B5FEF;\n}\n.box {\n  padding: 16px;\n  border-radius: 12px;\n  background: #EEF0FF;\n}',
    javascript: 'console.log("Hello from SafifyNote!");\nconst sum = 1 + 2 + 3;\nconsole.log("Sum:", sum);',
    multi: '<style>\n  .card { padding: 16px; border-radius: 12px; background: #EEF0FF; font-family: sans-serif; }\n</style>\n<div class="card">Combined HTML + CSS + JS</div>\n<script>\n  console.log("Rendered at", new Date().toLocaleTimeString());\n</script>'
  },

  // Injected at the very top of every preview document: forwards console output,
  // runtime errors and the content height to the editor.
  HOOK: `(function(){
  function fmt(a){try{if(typeof a==='string')return a;if(a instanceof Error)return a.stack||a.message;if(a===undefined)return 'undefined';if(typeof a==='function')return String(a);return JSON.stringify(a,null,2);}catch(e){return String(a);}}
  function send(level,args){try{parent.postMessage({type:'safify-console',level:level,text:Array.prototype.map.call(args,fmt).join(' ')},'*');}catch(e){}}
  ['log','info','debug'].forEach(function(k){var o=console[k];console[k]=function(){send('log',arguments);try{o.apply(console,arguments);}catch(e){}};});
  ['warn'].forEach(function(k){var o=console[k];console[k]=function(){send('warn',arguments);try{o.apply(console,arguments);}catch(e){}};});
  ['error'].forEach(function(k){var o=console[k];console[k]=function(){send('err',arguments);try{o.apply(console,arguments);}catch(e){}};});
  window.addEventListener('error',function(e){send('err',[e.message+(e.lineno?' (line '+e.lineno+')':'')]);});
  window.addEventListener('unhandledrejection',function(e){var r=e.reason;send('err',['Unhandled promise rejection: '+(r&&r.message?r.message:r)]);});
  function height(){var b=document.body;if(!b)return 0;var cs=getComputedStyle(b);return Math.ceil(b.getBoundingClientRect().height+(parseFloat(cs.marginTop)||0)+(parseFloat(cs.marginBottom)||0));}
  function report(){try{parent.postMessage({type:'safify-height',height:height()},'*');}catch(e){}}
  document.addEventListener('DOMContentLoaded',function(){report();if(window.ResizeObserver)new ResizeObserver(report).observe(document.body);});
  window.addEventListener('load',report);
})();`,

  injectHook(html) {
    const tag = '<script>' + this.HOOK + '</scr' + 'ipt>';
    let m = html.match(/<head[^>]*>/i);
    if (m) return html.replace(m[0], m[0] + tag);
    m = html.match(/<html[^>]*>/i);
    if (m) return html.replace(m[0], m[0] + '<head>' + tag + '</head>');
    return tag + html;
  },

  buildDoc(language, source) {
    const hook = '<script>' + this.HOOK + '</scr' + 'ipt>';
    const head = '<meta charset="utf-8">' + hook;

    if (language === 'css') {
      return `<!DOCTYPE html><html><head>${head}<style>body{font-family:sans-serif;margin:12px;color:#14171F}</style><style>${source}</style></head>
<body><div class="box"><h3>Preview</h3><p>This sample text shows your CSS. <a href="#">A link</a></p><button>A button</button><ul><li>List item</li><li>List item</li></ul></div></body></html>`;
    }

    if (language === 'javascript') {
      // The source is passed as an escaped string and run inside an async function:
      // syntax errors are caught and shown, "await" works, </script> inside code is safe.
      const src = JSON.stringify(source)
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
      return `<!DOCTYPE html><html><head>${head}<style>body{margin:0;font-family:sans-serif}</style></head><body><script>
(async function(){
  var AF = Object.getPrototypeOf(async function(){}).constructor;
  try { await (new AF(${src}))(); }
  catch (e) { console.error(e && e.stack ? e.stack : String(e)); }
})();
</scr` + `ipt></body></html>`;
    }

    // html or multi
    if (/<html[\s>]/i.test(source)) return this.injectHook(source);
    return `<!DOCTYPE html><html><head>${head}<style>body{font-family:sans-serif;margin:12px;color:#14171F}</style></head><body>${source}</body></html>`;
  },

  mount(host, cell, { onChange }) {
    const code = cell.code || (cell.code = { language: 'html', source: this.SAMPLES.html, rendered: false });
    if (!code.source) code.source = this.SAMPLES[code.language] || '';

    host.innerHTML = `
      <div class="code-cell-head">
        <select class="code-lang-select">
          <option value="html">HTML</option>
          <option value="css">CSS</option>
          <option value="javascript">JavaScript</option>
          <option value="multi">HTML + CSS + JS</option>
        </select>
        <div class="code-actions">
          <span class="code-hint">Shift + Enter to run</span>
          <button class="code-copy-btn" data-action="copy" title="Copy code" type="button">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span>Copy</span>
          </button>
          <button class="code-run-btn" data-action="run">▶ Run</button>
        </div>
      </div>
      <div class="code-body">
        <textarea class="code-source" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>
        <div class="code-preview-wrap" hidden></div>
        <div class="code-console" hidden></div>
      </div>
    `;

    const langSelect = host.querySelector('.code-lang-select');
    const textarea = host.querySelector('.code-source');
    const previewWrap = host.querySelector('.code-preview-wrap');
    const consoleEl = host.querySelector('.code-console');
    const runBtn = host.querySelector('[data-action="run"]');
    const copyBtn = host.querySelector('[data-action="copy"]');
    const changed = () => onChange && onChange();

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(textarea.value).then(() => {
          const textSpan = copyBtn.querySelector('span');
          if (textSpan) textSpan.textContent = 'Copied!';
          setTimeout(() => { if (textSpan) textSpan.textContent = 'Copy'; }, 2000);
        });
      });
    }

    langSelect.value = code.language;
    textarea.value = code.source;

    function autosize() {
      textarea.style.height = 'auto';
      textarea.style.height = Math.max(120, textarea.scrollHeight + 2) + 'px';
    }
    requestAnimationFrame(autosize);

    let msgHandler = null;
    function stopListening() {
      if (msgHandler) window.removeEventListener('message', msgHandler);
      msgHandler = null;
    }

    function logLine(level, text) {
      consoleEl.hidden = false;
      const line = document.createElement('div');
      if (level === 'err') line.className = 'err';
      else if (level === 'warn') line.className = 'warn';
      line.textContent = text;
      consoleEl.appendChild(line);
    }

    function render() {
      stopListening();
      previewWrap.hidden = false;
      previewWrap.innerHTML = '';
      consoleEl.hidden = true;
      consoleEl.textContent = '';

      const iframe = document.createElement('iframe');
      iframe.src = chrome.runtime.getURL('sandbox.html');
      iframe.style.height = code.language === 'javascript' ? '0px' : '60px';
      iframe.style.display = code.language === 'javascript' ? 'none' : 'block';
      const doc = SafifyCode.buildDoc(code.language, code.source);

      msgHandler = (e) => {
        if (!host.isConnected) { stopListening(); return; }
        if (e.source !== iframe.contentWindow) return;
        const m = e.data;
        if (!m || typeof m !== 'object') return;
        if (m.type === 'safify-console') logLine(m.level, m.text);
        else if (m.type === 'safify-height') {
          const h = Math.max(0, Math.min(Number(m.height) || 0, 800));
          iframe.style.display = h < 4 ? 'none' : 'block';
          iframe.style.height = h + 'px';
        }
      };
      window.addEventListener('message', msgHandler);

      iframe.addEventListener('load', () => {
        iframe.contentWindow.postMessage({ type: 'safify-render', doc }, '*');
      }, { once: true });
      previewWrap.appendChild(iframe);
      code.rendered = true;
      changed();
    }

    langSelect.addEventListener('change', () => {
      code.language = langSelect.value;
      if (!textarea.value.trim()) {
        textarea.value = SafifyCode.SAMPLES[code.language] || '';
        code.source = textarea.value;
        autosize();
      }
      stopListening();
      previewWrap.hidden = true;
      consoleEl.hidden = true;
      code.rendered = false;
      changed();
    });

    textarea.addEventListener('input', () => {
      code.source = textarea.value;
      autosize();
      changed();
    });

    async function insertImageText(file) {
      const b64 = await SafifyImage.compress(file, 1200);
      let imgStr;
      if (code.language === 'css') imgStr = `url("${b64}")`;
      else if (code.language === 'javascript') imgStr = `"${b64}"`;
      else imgStr = `<img src="${b64}" style="max-width: 100%;" />`;
      textarea.focus();
      document.execCommand('insertText', false, imgStr);
      code.source = textarea.value;
      autosize();
      changed();
    }
    textarea.addEventListener('drop', async (e) => {
      const file = SafifyImage.extractImageFile(e);
      if (file) { e.preventDefault(); await insertImageText(file); }
    });
    textarea.addEventListener('paste', async (e) => {
      const file = SafifyImage.extractImageFile(e);
      if (file && !e.clipboardData.getData('text/plain')) { e.preventDefault(); await insertImageText(file); }
    });

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        render();
      } else if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        document.execCommand('insertText', false, '  ');      // keeps native undo working
      } else if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault();
        const v = textarea.value, pos = textarea.selectionStart;
        const ls = v.lastIndexOf('\n', pos - 1) + 1;
        const m = v.slice(ls).match(/^ {1,2}/);
        if (m) {
          textarea.setSelectionRange(ls, ls + m[0].length);
          document.execCommand('delete');
        }
      } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
        // keep indentation of the current line
        const v = textarea.value, pos = textarea.selectionStart;
        const ls = v.lastIndexOf('\n', pos - 1) + 1;
        const indent = (v.slice(ls, pos).match(/^[ \t]*/) || [''])[0];
        if (indent) {
          e.preventDefault();
          document.execCommand('insertText', false, '\n' + indent);
        }
      }
    });

    runBtn.addEventListener('click', render);

    if (code.rendered) render();

    return { render };
  }
};
