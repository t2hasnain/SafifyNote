/* SafifyNote — shared storage, .sff format, text/HTML helpers, Web Crypto */

/* ------------------------------------------------------------------ */
/*  SafifyCrypto — Strong AES-GCM 256-bit encryption for Private Vault */
/* ------------------------------------------------------------------ */
const SafifyCrypto = {
  bufToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  },

  base64ToBuf(b64) {
    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  },

  generateSalt(len = 16) {
    const salt = new Uint8Array(len);
    crypto.getRandomValues(salt);
    return this.bufToBase64(salt);
  },

  async deriveKey(pin, saltBase64) {
    const enc = new TextEncoder();
    const pinBytes = enc.encode(String(pin));
    const saltBytes = this.base64ToBuf(saltBase64);

    const baseKey = await crypto.subtle.importKey(
      'raw',
      pinBytes,
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: 100000,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  },

  async encrypt(dataObj, cryptoKey) {
    const enc = new TextEncoder();
    const plaintext = enc.encode(JSON.stringify(dataObj));

    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      plaintext
    );

    return {
      iv: this.bufToBase64(iv),
      ciphertext: this.bufToBase64(ciphertext)
    };
  },

  async decrypt(ivBase64, ciphertextBase64, cryptoKey) {
    const iv = this.base64ToBuf(ivBase64);
    const ciphertext = this.base64ToBuf(ciphertextBase64);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      ciphertext
    );

    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decrypted));
  },

  SENTINEL: 'SAFIFY_PRIVATE_VAULT_OK_2026',

  async createVerifier(cryptoKey) {
    return await this.encrypt({ token: this.SENTINEL }, cryptoKey);
  },

  async verifyKey(verifierObj, cryptoKey) {
    try {
      if (!verifierObj || !verifierObj.iv || !verifierObj.ciphertext) return false;
      const data = await this.decrypt(verifierObj.iv, verifierObj.ciphertext, cryptoKey);
      return !!(data && data.token === this.SENTINEL);
    } catch (e) {
      return false;
    }
  },

  DEVICE_SALT_KEY: 'safifynote_device_salt',
  _cachedDevKey: null,

  async getDeviceKey() {
    if (this._cachedDevKey) return this._cachedDevKey;
    const res = await chrome.storage.local.get(this.DEVICE_SALT_KEY);
    let salt = res[this.DEVICE_SALT_KEY];
    if (!salt) {
      salt = this.generateSalt(16);
      await chrome.storage.local.set({ [this.DEVICE_SALT_KEY]: salt });
    }
    this._cachedDevKey = await this.deriveKey('SAFIFY_DEVICE_SEC_2026_GROQ', salt);
    return this._cachedDevKey;
  }
};

/* ------------------------------------------------------------------ */
/*  SafifySpell — Fast, offline, local typo & spell corrector         */
/* ------------------------------------------------------------------ */
const SafifySpell = {
  // Common misspellings and typing errors map
  TYPO_MAP: {
    helo: 'hello',
    helllo: 'hello',
    teh: 'the',
    hte: 'the',
    chnage: 'change',
    chnages: 'changes',
    chnaged: 'changed',
    chaneg: 'change',
    feauture: 'feature',
    feautures: 'features',
    spefic: 'specific',
    speicifc: 'specific',
    speficly: 'specifically',
    repsonsive: 'responsive',
    reponse: 'response',
    thier: 'their',
    ther: 'there',
    recieve: 'receive',
    recieved: 'received',
    recieving: 'receiving',
    seperate: 'separate',
    seperated: 'separated',
    seperation: 'separation',
    untill: 'until',
    definately: 'definitely',
    definatly: 'definitely',
    definitly: 'definitely',
    truely: 'truly',
    wierd: 'weird',
    accomodate: 'accommodate',
    accomodation: 'accommodation',
    tommorrow: 'tomorrow',
    tommorow: 'tomorrow',
    tomorow: 'tomorrow',
    adress: 'address',
    adresses: 'addresses',
    privat: 'private',
    calender: 'calendar',
    goverment: 'government',
    occured: 'occurred',
    occurence: 'occurrence',
    occurrance: 'occurrence',
    succesful: 'successful',
    succesfully: 'successfully',
    wich: 'which',
    whitch: 'which',
    alot: 'a lot',
    noone: 'no one',
    writting: 'writing',
    appartment: 'apartment',
    begining: 'beginning',
    collegue: 'colleague',
    colleages: 'colleagues',
    concious: 'conscious',
    embarass: 'embarrass',
    embarassed: 'embarrassed',
    enviroment: 'environment',
    existance: 'existence',
    foreward: 'forward',
    guarentee: 'guarantee',
    independant: 'independent',
    interupt: 'interrupt',
    knowlege: 'knowledge',
    millenium: 'millennium',
    neccessary: 'necessary',
    necesary: 'necessary',
    noticable: 'noticeable',
    posession: 'possession',
    recommand: 'recommend',
    reccomend: 'recommend',
    recomended: 'recommended',
    refered: 'referred',
    religous: 'religious',
    rememberance: 'remembrance',
    rember: 'remember',
    resistence: 'resistance',
    suprise: 'surprise',
    suprised: 'surprised',
    tendancy: 'tendency',
    unforseen: 'unforeseen',
    wether: 'whether',
    freind: 'friend',
    freinds: 'friends',
    beleive: 'believe',
    beleived: 'believed',
    belive: 'believe',
    peice: 'piece',
    peices: 'pieces',
    shedule: 'schedule',
    schedual: 'schedule',
    libary: 'library',
    basicly: 'basically',
    compleatly: 'completely',
    disapear: 'disappear',
    familar: 'familiar',
    fourty: 'forty',
    grammer: 'grammar',
    happend: 'happened',
    immediatly: 'immediately',
    imediately: 'immediately',
    incidently: 'incidently',
    ocassion: 'occasion',
    occassion: 'occasion',
    persue: 'pursue',
    publically: 'publicly',
    realy: 'really',
    resturant: 'restaurant',
    rythm: 'rhythm',
    tounge: 'tongue',
    vaccuum: 'vacuum',
    vacume: 'vacuum',
    vehical: 'vehicle',
    visious: 'vicious',
    wont: "won't",
    cant: "can't",
    dont: "don't",
    didnt: "didn't",
    isnt: "isn't",
    arent: "aren't",
    wasnt: "wasn't",
    werent: "weren't",
    couldnt: "couldn't",
    shouldnt: "shouldn't",
    wouldnt: "wouldn't",
    youre: "you're",
    theyre: "they're",
    weve: "we've"
  },

  matchCase(orig, repl) {
    if (!orig || !repl) return repl;
    if (orig === orig.toUpperCase()) return repl.toUpperCase();
    if (orig[0] === orig[0].toUpperCase()) {
      return repl.charAt(0).toUpperCase() + repl.slice(1);
    }
    return repl;
  },

  fixString(str) {
    if (!str || typeof str !== 'string') return { fixed: str, count: 0, changes: [] };
    let count = 0;
    const changes = [];

    // First handle phrase typos like "to mush" -> "too much", "so mush" -> "so much"
    let working = str.replace(/\b(to|so)\s+mush\b/gi, (match, prefix) => {
      count++;
      changes.push({ from: match, to: `${prefix} much` });
      return `${prefix} much`;
    });

    // Then word-by-word typos
    working = working.replace(/\b([a-zA-Z']+)\b/g, (match) => {
      const lower = match.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(this.TYPO_MAP, lower)) {
        const target = this.matchCase(match, this.TYPO_MAP[lower]);
        if (target !== match) {
          count++;
          changes.push({ from: match, to: target });
          return target;
        }
      }
      return match;
    });

    return { fixed: working, count, changes };
  },

  fixHtmlNode(node) {
    let totalCount = 0;
    const allChanges = [];

    const walk = (current) => {
      if (current.nodeType === Node.TEXT_NODE) {
        if (!current.nodeValue || !current.nodeValue.trim()) return;
        const res = this.fixString(current.nodeValue);
        if (res.count > 0) {
          current.nodeValue = res.fixed;
          totalCount += res.count;
          allChanges.push(...res.changes);
        }
      } else if (current.nodeType === Node.ELEMENT_NODE) {
        // Skip script, style, code blocks if marked
        const tag = current.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style') return;
        for (let child = current.firstChild; child; child = child.nextSibling) {
          walk(child);
        }
      }
    };

    walk(node);
    return { count: totalCount, changes: allChanges };
  }
};

const SafifyStore = {
  NOTES_KEY: 'safifynote_notes',
  SETTINGS_KEY: 'safifynote_settings',
  _queue: Promise.resolve(),

  async getAllNotes() {
    const data = await chrome.storage.local.get(this.NOTES_KEY);
    return data[this.NOTES_KEY] || {};
  },

  async getNote(id) {
    const notes = await this.getAllNotes();
    return notes[id] || null;
  },

  // Saves are serialised so two quick saves can never overwrite each other
  // (read-modify-write on a single storage key is otherwise racy).
  saveNote(note) {
    const run = async () => {
      const notes = await this.getAllNotes();
      note.updatedAt = Date.now();
      notes[note.id] = note;
      await chrome.storage.local.set({ [this.NOTES_KEY]: notes });
      return note;
    };
    this._queue = this._queue.then(run, run);
    return this._queue;
  },

  deleteNote(id) {
    const run = async () => {
      const notes = await this.getAllNotes();
      delete notes[id];
      await chrome.storage.local.set({ [this.NOTES_KEY]: notes });
    };
    this._queue = this._queue.then(run, run);
    return this._queue;
  },

  TRASH_KEY: 'safifynote_trash',

  async getTrash() {
    const data = await chrome.storage.local.get(this.TRASH_KEY);
    return data[this.TRASH_KEY] || {};
  },

  moveToTrash(id) {
    const run = async () => {
      const notes = await this.getAllNotes();
      const trash = await this.getTrash();
      const note = notes[id];
      if (note) {
        note.deletedAt = Date.now();
        trash[id] = note;
        delete notes[id];
        await chrome.storage.local.set({
          [this.NOTES_KEY]: notes,
          [this.TRASH_KEY]: trash
        });
      }
      return note;
    };
    this._queue = this._queue.then(run, run);
    return this._queue;
  },

  restoreFromTrash(id) {
    const run = async () => {
      const notes = await this.getAllNotes();
      const trash = await this.getTrash();
      const note = trash[id];
      if (note) {
        delete note.deletedAt;
        note.updatedAt = Date.now();
        notes[id] = note;
        delete trash[id];
        await chrome.storage.local.set({
          [this.NOTES_KEY]: notes,
          [this.TRASH_KEY]: trash
        });
        return note;
      }
      return null;
    };
    this._queue = this._queue.then(run, run);
    return this._queue;
  },

  restoreAllTrash() {
    const run = async () => {
      const notes = await this.getAllNotes();
      const trash = await this.getTrash();
      const ids = Object.keys(trash);
      for (const id of ids) {
        const note = trash[id];
        delete note.deletedAt;
        note.updatedAt = Date.now();
        notes[id] = note;
      }
      await chrome.storage.local.set({
        [this.NOTES_KEY]: notes,
        [this.TRASH_KEY]: {}
      });
      return ids.length;
    };
    this._queue = this._queue.then(run, run);
    return this._queue;
  },

  permanentlyDeleteFromTrash(id) {
    const run = async () => {
      const trash = await this.getTrash();
      delete trash[id];
      await chrome.storage.local.set({ [this.TRASH_KEY]: trash });
    };
    this._queue = this._queue.then(run, run);
    return this._queue;
  },

  emptyTrash() {
    const run = async () => {
      await chrome.storage.local.set({ [this.TRASH_KEY]: {} });
    };
    this._queue = this._queue.then(run, run);
    return this._queue;
  },

  /* ---------------- Private Vault (Encrypted Storage) ---------------- */
  PRIVATE_META_KEY: 'safifynote_private_meta',
  PRIVATE_NOTES_KEY: 'safifynote_private_notes',

  async getPrivateMeta() {
    const data = await chrome.storage.local.get(this.PRIVATE_META_KEY);
    return data[this.PRIVATE_META_KEY] || null;
  },

  async isPrivateVaultConfigured() {
    const meta = await this.getPrivateMeta();
    return !!(meta && meta.salt && meta.verifier);
  },

  async initPrivateVault(pin) {
    const salt = SafifyCrypto.generateSalt(16);
    const key = await SafifyCrypto.deriveKey(pin, salt);
    const verifier = await SafifyCrypto.createVerifier(key);
    const meta = { salt, verifier, createdAt: Date.now() };
    await chrome.storage.local.set({ [this.PRIVATE_META_KEY]: meta });
    return key;
  },

  async verifyAndUnlockPrivateVault(pin) {
    const meta = await this.getPrivateMeta();
    if (!meta) return null;
    const key = await SafifyCrypto.deriveKey(pin, meta.salt);
    const isValid = await SafifyCrypto.verifyKey(meta.verifier, key);
    return isValid ? key : null;
  },

  async getPrivateEncryptedNotes() {
    const data = await chrome.storage.local.get(this.PRIVATE_NOTES_KEY);
    return data[this.PRIVATE_NOTES_KEY] || {};
  },

  async getPrivateDecryptedNotes(cryptoKey) {
    const encMap = await this.getPrivateEncryptedNotes();
    const result = {};
    for (const [id, item] of Object.entries(encMap)) {
      try {
        const note = await SafifyCrypto.decrypt(item.iv, item.ciphertext, cryptoKey);
        note.isPrivate = true;
        result[id] = note;
      } catch (err) {
        console.warn('Failed to decrypt private note ' + id, err);
      }
    }
    return result;
  },

  savePrivateNote(note, cryptoKey) {
    const run = async () => {
      const encMap = await this.getPrivateEncryptedNotes();
      note.updatedAt = Date.now();
      note.isPrivate = true;
      const { iv, ciphertext } = await SafifyCrypto.encrypt(note, cryptoKey);
      encMap[note.id] = {
        id: note.id,
        iv,
        ciphertext,
        updatedAt: note.updatedAt,
        isPrivate: true
      };
      await chrome.storage.local.set({ [this.PRIVATE_NOTES_KEY]: encMap });
      return note;
    };
    this._queue = this._queue.then(run, run);
    return this._queue;
  },

  deletePrivateNote(id) {
    const run = async () => {
      const encMap = await this.getPrivateEncryptedNotes();
      delete encMap[id];
      await chrome.storage.local.set({ [this.PRIVATE_NOTES_KEY]: encMap });
    };
    this._queue = this._queue.then(run, run);
    return this._queue;
  },

  resetPrivateVault() {
    const run = async () => {
      await chrome.storage.local.remove([this.PRIVATE_META_KEY, this.PRIVATE_NOTES_KEY]);
    };
    this._queue = this._queue.then(run, run);
    return this._queue;
  },

  /* ---------------- Groq AI (AES-256 Encrypted API Key Storage) ---------------- */
  GROQ_KEY_ENC: 'safifynote_groq_key_enc',

  async getGroqKey() {
    const data = await chrome.storage.local.get(this.GROQ_KEY_ENC);
    const enc = data[this.GROQ_KEY_ENC];
    if (!enc || !enc.iv || !enc.ciphertext) return '';
    try {
      const devKey = await SafifyCrypto.getDeviceKey();
      const dec = await SafifyCrypto.decrypt(enc.iv, enc.ciphertext, devKey);
      return dec.groqKey || '';
    } catch (e) {
      console.error('Failed to decrypt Groq API key', e);
      return '';
    }
  },

  async saveGroqKey(rawKey) {
    if (!rawKey || !rawKey.trim()) {
      await chrome.storage.local.remove(this.GROQ_KEY_ENC);
      return;
    }
    const devKey = await SafifyCrypto.getDeviceKey();
    const enc = await SafifyCrypto.encrypt({ groqKey: rawKey.trim() }, devKey);
    await chrome.storage.local.set({ [this.GROQ_KEY_ENC]: enc });
  },

  async _fetchGroq(url, options) {
    // 1. Try background service worker first (bypasses extension page CSP/CORS)
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        const bgRes = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'GROQ_FETCH', url, options }, (resp) => {
            if (chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(resp);
            }
          });
        });
        if (bgRes) {
          if (!bgRes.ok) {
            const errMsg = (bgRes.data && bgRes.data.error && bgRes.data.error.message)
              ? bgRes.data.error.message
              : (bgRes.error || `HTTP error ${bgRes.status}`);
            return { ok: false, status: bgRes.status, error: errMsg, data: bgRes.data };
          }
          return { ok: true, status: bgRes.status, data: bgRes.data };
        }
      }
    } catch (e) {
      // fallback to direct fetch
    }

    // 2. Direct fetch fallback
    try {
      const res = await fetch(url, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = (data && data.error && data.error.message) ? data.error.message : `HTTP error ${res.status}`;
        return { ok: false, status: res.status, error: errMsg, data };
      }
      return { ok: true, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, error: e.message || 'Failed to fetch', data: null };
    }
  },

  async testGroqKey(apiKey) {
    if (!apiKey || !apiKey.trim()) return { ok: false, error: 'API key is empty' };
    const res = await this._fetchGroq('https://api.groq.com/openai/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`
      }
    });
    if (!res.ok) {
      return { ok: false, error: res.error || 'Failed to connect to Groq' };
    }
    const rawList = (res.data && res.data.data) || [];
    const chatModels = rawList
      .map(m => m.id)
      .filter(id => id && !id.includes('whisper') && !id.includes('guard'));
    return { ok: true, models: chatModels };
  },

  async rephraseWithGroq(text, style = 'Standard', apiKey = '', model = 'openai/gpt-oss-20b') {
    if (!apiKey) {
      apiKey = await this.getGroqKey();
    }
    if (!apiKey) {
      throw new Error('No Groq API key configured. Please add your Groq API key in Settings.');
    }

    // Auto-migrate legacy/deprecated or enterprise-gated models
    if (!model || model === 'llama-3.1-8b-instant') {
      model = 'openai/gpt-oss-20b';
    }

    const styleInstructions = {
      'Standard': 'fluent, natural, clear, and grammatically impeccable English, preserving tables and code blocks accurately',
      'Professional': 'formal, polished, authoritative, and business-ready tone, keeping tables and code blocks cleanly structured',
      'Concise': 'concise, direct, impactful English, eliminating all fluff while preserving tables and code accurately',
      'Fully Explain': 'a comprehensive, in-depth explanation. Fully explain all concepts in detail, create structured breakdown tables (| Concept | Description |) to organize key takeaways for better understanding, include clean code examples if applicable, and highlight important terms in bold (**term**)',
      'Creative': 'expressive, vivid, compelling, and engaging language',
      'Bullet Points': 'a clean, clear list of concise bullet points (- item)'
    };
    const stylePrompt = styleInstructions[style] || styleInstructions['Standard'];

    const callApi = async (mName) => {
      return await this._fetchGroq('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: mName,
          messages: [
            {
              role: 'system',
              content: `You are an expert editor, technical writer, and notebook assistant.
Your task is to rephrase and refine the provided content into: ${stylePrompt}.

CRITICAL FORMATTING & STRUCTURE RULES:
1. PRESERVE CODE STRUCTURE: If the input contains code or code blocks, NEVER break, scramble, or alter valid code syntax. Always maintain code inside standard fenced markdown code blocks with the exact language identifier (\`\`\`language ... \`\`\`).
2. PRESERVE & ENHANCE TABLES: If the input contains a table, DO NOT flatten it into plain text or delete columns. Maintain clean markdown tables (| Col 1 | Col 2 |). Only refine or rephrase the text inside cells.
3. FOR "Fully Explain": Provide an in-depth, well-structured explanation. Use markdown breakdown tables (| Feature/Step | Details |) for clear visual explanation, provide code examples if applicable, and highlight key terms with bold (**term**).
4. Output ONLY the rephrased content in clean GitHub Flavored Markdown (headings ###, bold **text**, tables | ... |, code blocks \`\`\`...\`\`\`, bullet lists - ...). DO NOT include introductory conversational filler like "Here is the rephrased text:" or surrounding quote marks.`
            },
            {
              role: 'user',
              content: text
            }
          ],
          temperature: 0.5,
          max_tokens: 1800
        })
      });
    };

    let res = await callApi(model);

    // If model does not exist or user lacks access, automatically fallback to cheapest available model
    if (!res.ok && res.error && (res.error.includes('does not exist') || res.error.includes('access') || res.status === 404)) {
      const fallbackModel = (model === 'openai/gpt-oss-20b') ? 'llama-3.3-70b-versatile' : 'openai/gpt-oss-20b';
      res = await callApi(fallbackModel);
    }

    if (!res.ok) {
      throw new Error(res.error || 'Groq API request failed');
    }

    const data = res.data;
    const result = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!result) throw new Error('Empty response received from Groq.');
    return result.trim();
  },

  async getSettings() {
    const data = await chrome.storage.local.get(this.SETTINGS_KEY);
    return Object.assign(
      {
        theme: 'light',
        diagramSmoothing: 0.5,
        defaultCellType: 'visual',
        showPrivateFolder: true,
        privateShortcut: 'Alt+P',
        groqModel: 'openai/gpt-oss-20b'
      },
      data[this.SETTINGS_KEY] || {}
    );
  },

  async saveSettings(settings) {
    await chrome.storage.local.set({ [this.SETTINGS_KEY]: settings });
    return settings;
  },

  newId() {
    return 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  },

  newNote(title = 'Untitled note', isPrivate = false) {
    const id = this.newId();
    return {
      id,
      title,
      isPrivate: !!isPrivate,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      cells: [
        { id: id + '_c1', type: 'visual', visual: { html: '<p><br></p>' } }
      ]
    };
  },

  newCell(type) {
    const id = 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const base = { id, type };
    if (type === 'visual') base.visual = { html: '<p><br></p>' };
    if (type === 'code') base.code = { language: 'html', source: '', rendered: false };
    if (type === 'diagram') base.diagram = { strokes: [], width: 900, height: 420, bg: '#ffffff' };
    return base;
  }
};

/* .sff file format = JSON envelope with a signature header, so files are
   recognizable as SafifyNote notes if renamed/inspected. */
const SafifyFormat = {
  MAGIC: 'SAFIFYNOTE_SFF_V1',

  exportNote(note) {
    const payload = { magic: this.MAGIC, exportedAt: Date.now(), note };
    return JSON.stringify(payload, null, 2);
  },

  parseSff(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('This .sff file is not valid — it may be corrupted.');
    }
    if (!data || data.magic !== this.MAGIC || !data.note) {
      throw new Error('This file is not a recognized .sff note.');
    }
    return data.note;
  },

  downloadText(filename, text, mime = 'application/json') {
    const blob = new Blob([text], { type: mime });
    safifyDownloadBlob(blob, filename);
  }
};

function safifyDownloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

function safifySlugify(name) {
  return (name || 'note').trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').slice(0, 60) || 'note';
}

function safifyFormatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function safifySanitizeHtml(html) {
  const doc = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html');
  doc.body.querySelectorAll(
    'script,style,iframe,object,embed,link,meta,base,form,input,textarea,select,math,audio,video,source'
  ).forEach(n => n.remove());
  doc.body.querySelectorAll('button:not(.ai-code-copy)').forEach(n => n.remove());
  doc.body.querySelectorAll('svg:not(.ai-copy-icon)').forEach(n => n.remove());
  doc.body.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(a => {
      const n = a.name.toLowerCase();
      const v = a.value.trim().toLowerCase();
      if (n.startsWith('on')) el.removeAttribute(a.name);
      else if ((n === 'href' || n === 'src') && /^(javascript|vbscript):/.test(v)) el.removeAttribute(a.name);
      else if (n === 'href' && /^data:/.test(v)) el.removeAttribute(a.name);
    });
  });
  return doc.body.innerHTML;
}

/* ------------------------------------------------------------------ */
/*  ChatGPT & Gemini UI code block builder & syntax highlighter       */
/* ------------------------------------------------------------------ */
function safifyEscapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safifyHighlightCode(code, lang = '') {
  const raw = String(code || '');
  const l = (lang || '').toLowerCase().trim();

  let text = safifyEscapeHtml(raw);

  if (l === 'html' || l === 'xml' || l === 'svg') {
    return text.replace(/(&lt;!--[\s\S]*?--&gt;)|(&lt;\/?)([a-zA-Z0-9\-]+)([\s\S]*?)(\/?&gt;)/g, (m, c, open, tag, attrs, close) => {
      if (c) return `<span class="tok-com">${c}</span>`;
      const highlightedAttrs = (attrs || '').replace(/([a-zA-Z0-9\-]+)(=)(&quot;.*?&quot;|&#39;.*?&#39;|".*?"|'.*?'|[^\s&>]+)?/g,
        (am, an, eq, av) => `<span class="tok-attr">${an}</span>${eq}<span class="tok-str">${av || ''}</span>`
      );
      return `${open}<span class="tok-tag">${tag}</span>${highlightedAttrs}${close}`;
    });
  }

  const map = [];
  text = text.replace(/(\/\*[\s\S]*?\*\/|\/\/[^\r\n]*|#[^\r\n]*|--[^\r\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g, (match) => {
    const isComment = match.startsWith('//') || match.startsWith('/*') || match.startsWith('#') || match.startsWith('--');
    const idx = map.length;
    map.push(`<span class="${isComment ? 'tok-com' : 'tok-str'}">${match}</span>`);
    return `___TOK_${idx}___`;
  });

  text = text.replace(/\b(true|false|null|undefined|none|nil|nan)\b/gi, '<span class="tok-bool">$1</span>');
  text = text.replace(/\b(const|let|var|function|return|if|else|elif|for|while|do|switch|case|break|continue|default|class|extends|super|new|this|typeof|instanceof|import|from|export|async|await|try|catch|finally|throw|def|lambda|yield|pass|in|is|not|and|or|self|public|private|protected|static|void|int|float|double|bool|string|interface|type|struct|fn|mut|impl|package|select|echo|print)\b/g, '<span class="tok-kw">$1</span>');
  text = text.replace(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)(?=\s*\()/g, '<span class="tok-fn">$1</span>');
  text = text.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-num">$1</span>');

  text = text.replace(/___TOK_(\d+)___/g, (_, i) => map[Number(i)] || '');
  return text;
}

function safifyBuildAiCodeBlock(codeText, lang = '') {
  const cleanLang = (lang || 'code').trim().toLowerCase().replace(/[^a-z0-9_#-]/g, '') || 'code';
  const cleanSource = String(codeText || '').replace(/^\n+|\n+$/g, '');
  const highlighted = safifyHighlightCode(cleanSource, cleanLang);

  return `<div class="ai-code-block" data-lang="${cleanLang}">` +
    `<div class="ai-code-header" contenteditable="false">` +
      `<span class="ai-code-lang">${cleanLang}</span>` +
      `<button type="button" class="ai-code-copy" title="Copy code">` +
        `<svg class="ai-copy-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
          `<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>` +
          `<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>` +
        `</svg>` +
        `<span class="ai-copy-text">Copy code</span>` +
      `</button>` +
    `</div>` +
    `<pre class="ai-code-pre"><code class="ai-code-content language-${cleanLang}">${highlighted}</code></pre>` +
  `</div>`;
}

function safifyMarkdownToHtml(md) {
  let text = String(md || '');
  // Extract fenced code blocks first
  const codeBlocks = [];
  text = text.replace(/```([a-zA-Z0-9_#-]*)\s*\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(safifyBuildAiCodeBlock(code, lang));
    return `\n___CODE_BLOCK_${idx}___\n`;
  });

  const lines = text.split('\n');
  const out = [];
  let inUl = false, inOl = false, inTable = false, tableHtml = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('___CODE_BLOCK_') && trimmed.endsWith('___')) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (inTable) { out.push(tableHtml + '</table></div>'); inTable = false; tableHtml = ''; }
      const idx = Number(trimmed.replace('___CODE_BLOCK_', '').replace('___', ''));
      out.push(codeBlocks[idx] || '');
      continue;
    }

    // Table check: | a | b |
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (!inTable) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (inOl) { out.push('</ol>'); inOl = false; }
        inTable = true;
        tableHtml = '<div class="ai-table-wrap"><table class="ai-table">';
      }
      // Check if separator line |---|---|
      if (/^\|[\s\-:|]+\|$/.test(trimmed)) {
        continue;
      }
      const cells = trimmed.split('|').slice(1, -1).map(c => c.trim());
      const isHeader = tableHtml === '<div class="ai-table-wrap"><table class="ai-table">';
      const tag = isHeader ? 'th' : 'td';
      tableHtml += '<tr>' + cells.map(c => `<${tag}>${formatInline(c)}</${tag}>`).join('') + '</tr>';
      continue;
    } else if (inTable) {
      out.push(tableHtml + '</table></div>');
      inTable = false;
      tableHtml = '';
    }

    // Headings
    const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
      const lvl = Math.min(4, hMatch[1].length);
      out.push(`<h${lvl}>${formatInline(hMatch[2])}</h${lvl}>`);
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
      out.push(`<blockquote>${formatInline(trimmed.slice(2))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^[-*+]\s+(.+)$/.test(trimmed)) {
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push('<ul>'); inUl = true; }
      const item = trimmed.replace(/^[-*+]\s+/, '');
      out.push(`<li>${formatInline(item)}</li>`);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+(.+)$/.test(trimmed)) {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol>'); inOl = true; }
      const item = trimmed.replace(/^\d+\.\s+/, '');
      out.push(`<li>${formatInline(item)}</li>`);
      continue;
    }

    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }

    if (!trimmed) {
      continue;
    }

    out.push(`<p>${formatInline(trimmed)}</p>`);
  }

  if (inUl) out.push('</ul>');
  if (inOl) out.push('</ol>');
  if (inTable) out.push(tableHtml + '</table></div>');

  function formatInline(str) {
    let s = safifyEscapeHtml(str);
    // Inline code `code`
    s = s.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');
    // Bold **text**
    s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    // Highlights ==text==
    s = s.replace(/==([^=]+)==/g, '<mark class="ai-highlight">$1</mark>');
    // Italic *text* or _text_
    s = s.replace(/\*([^*]+)\*/g, '<i>$1</i>');
    s = s.replace(/_([^_]+)_/g, '<i>$1</i>');
    // Links [text](url)
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }

  return out.join('');
}

function safifyHtmlToMarkdown(htmlOrNode) {
  let doc;
  if (typeof htmlOrNode === 'string') {
    doc = new DOMParser().parseFromString('<body>' + htmlOrNode + '</body>', 'text/html');
  } else if (htmlOrNode && htmlOrNode.nodeType) {
    doc = document.implementation.createHTMLDocument();
    doc.body.appendChild(htmlOrNode.cloneNode(true));
  } else {
    return '';
  }

  function serializeNode(node) {
    if (node.nodeType === 3) {
      return node.nodeValue;
    }
    if (node.nodeType !== 1) return '';

    const tag = node.tagName.toLowerCase();

    // Code blocks: .ai-code-block or pre
    if (node.classList && (node.classList.contains('ai-code-block') || tag === 'pre')) {
      let lang = node.dataset && node.dataset.lang ? node.dataset.lang : '';
      const codeEl = node.querySelector('code') || node;
      if (!lang) {
        const m = (codeEl.className || '').match(/language-([a-zA-Z0-9_#-]+)/);
        if (m) lang = m[1];
      }
      const clone = node.cloneNode(true);
      clone.querySelectorAll('.ai-code-header, button').forEach(b => b.remove());
      const codeText = (clone.querySelector('code') || clone).textContent || '';
      return `\n\`\`\`${lang || 'code'}\n${codeText.trim()}\n\`\`\`\n`;
    }

    // Tables: .ai-table-wrap or table
    if (node.classList && (node.classList.contains('ai-table-wrap') || tag === 'table')) {
      const table = tag === 'table' ? node : node.querySelector('table');
      if (!table) return '';
      const rows = [];
      table.querySelectorAll('tr').forEach(tr => {
        const cells = [];
        tr.querySelectorAll('th, td').forEach(c => {
          cells.push(c.textContent.trim().replace(/\|/g, '\\|'));
        });
        if (cells.length) rows.push(cells);
      });
      if (!rows.length) return '';
      const colCount = Math.max(...rows.map(r => r.length));
      let md = '\n| ' + rows[0].map(c => c || ' ').join(' | ') + ' |\n';
      md += '| ' + Array(colCount).fill('---').join(' | ') + ' |\n';
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        while (r.length < colCount) r.push('');
        md += '| ' + r.map(c => c || ' ').join(' | ') + ' |\n';
      }
      return md + '\n';
    }

    let inner = '';
    node.childNodes.forEach(ch => { inner += serializeNode(ch); });

    if (tag === 'b' || tag === 'strong') return `**${inner}**`;
    if (tag === 'i' || tag === 'em') return `*${inner}*`;
    if (tag === 'code') return `\`${inner}\``;
    if (tag === 'mark') return `==${inner}==`;
    if (tag === 'a') return `[${inner}](${node.getAttribute('href') || ''})`;
    if (/^h[1-4]$/.test(tag)) return `\n### ${inner}\n`;
    if (tag === 'p') return `\n${inner}\n`;
    if (tag === 'blockquote') return `\n> ${inner}\n`;
    if (tag === 'li') return `\n- ${inner}`;
    if (tag === 'ul' || tag === 'ol') return `\n${inner}\n`;
    if (tag === 'br') return '\n';

    return inner;
  }

  const res = serializeNode(doc.body);
  return res.replace(/\n{3,}/g, '\n\n').trim();
}

/* ------------------------------------------------------------------ */
/*  Text helpers: first line / plain lines of a cell                  */
/* ------------------------------------------------------------------ */
function safifyHtmlToLines(html) {
  let cleaned = String(html || '');
  const doc = new DOMParser().parseFromString('<body>' + cleaned + '</body>', 'text/html');
  // Strip code block headers so "python Copy code" is not counted as cell content
  doc.body.querySelectorAll('.ai-code-header').forEach(n => n.remove());

  const marked = (doc.body.innerHTML || '')
    .replace(/<img[^>]*>/gi, '\n[Image]\n')
    .replace(/<\/?(p|div|h[1-6]|li|ul|ol|blockquote|pre|tr)\b[^>]*>|<br\s*\/?>/gi, '\n');
  const doc2 = new DOMParser().parseFromString('<body>' + marked + '</body>', 'text/html');
  return (doc2.body.textContent || '')
    .split('\n')
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Real text lines of a cell (empty array if the cell has no text). */
function safifyCellLines(cell) {
  if (!cell) return [];
  if (cell.type === 'visual') return safifyHtmlToLines(cell.visual && cell.visual.html);
  if (cell.type === 'code') {
    return String((cell.code && cell.code.source) || '').split('\n').map(s => s.trim()).filter(Boolean);
  }
  if (cell.type === 'diagram') {
    const out = [];
    ((cell.diagram && cell.diagram.strokes) || []).forEach(s => {
      if (s && s.tool === 'text' && s.text) s.text.split('\n').forEach(t => { if (t.trim()) out.push(t.trim()); });
    });
    return out;
  }
  return [];
}

/** First line shown when a cell is collapsed ("show less"). */
function safifyFirstLine(cell) {
  const lines = safifyCellLines(cell);
  if (lines.length) return lines[0];
  if (cell.type === 'diagram') {
    const n = (cell.diagram && cell.diagram.strokes && cell.diagram.strokes.length) || 0;
    return n ? `Diagram · ${n} item${n === 1 ? '' : 's'}` : 'Empty diagram';
  }
  return cell.type === 'code' ? 'Empty code cell' : 'Empty text cell';
}

function safifyNoteFirstLine(note) {
  for (const c of (note.cells || [])) {
    const lines = safifyCellLines(c);
    if (lines.length) return lines[0];
  }
  return '';
}

function safifyPlainPreview(note) {
  const first = safifyNoteFirstLine(note);
  if (first) return first.slice(0, 140);
  return note.cells && note.cells.length ? `${note.cells.length} cell(s)` : 'Empty note';
}

/* ------------------------------------------------------------------ */
/*  Block helpers for the rich-text (visual) editor                   */
/* ------------------------------------------------------------------ */
const SAFIFY_BLOCKS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'DIV', 'PRE', 'TABLE', 'HR']);

function safifyIsBlock(n) {
  return !!n && n.nodeType === 1 && SAFIFY_BLOCKS.has(n.tagName);
}

/** Wrap loose inline nodes / bare text at the top level of `root` into <p>. */
function safifyNormalizeBlocks(root) {
  const doc = root.ownerDocument;
  let child = root.firstChild;
  while (child) {
    if (safifyIsBlock(child) || (child.nodeType === 3 && !child.nodeValue.trim())) {
      child = child.nextSibling;
      continue;
    }
    const p = doc.createElement('p');
    root.insertBefore(p, child);
    while (child && !safifyIsBlock(child)) {
      const nx = child.nextSibling;
      p.appendChild(child);
      child = nx;
    }
  }
  if (!Array.from(root.childNodes).some(safifyIsBlock)) {
    while (root.firstChild) root.removeChild(root.firstChild);
    const p = doc.createElement('p');
    p.appendChild(doc.createElement('br'));
    root.appendChild(p);
  }
}

function safifyEditorNeedsNormalize(ed) {
  if (!ed.firstChild) return true;
  return Array.from(ed.childNodes).some(n => !safifyIsBlock(n) && !(n.nodeType === 3 && !n.nodeValue.trim()));
}

function safifyTopBlock(ed, node, offset, isEnd) {
  if (node === ed) {
    const kids = ed.childNodes;
    if (!kids.length) return null;
    const i = isEnd ? Math.max(0, offset - 1) : Math.min(offset, kids.length - 1);
    return kids[i] || null;
  }
  let n = node;
  while (n && n.parentNode !== ed) n = n.parentNode;
  return n;
}

/** Tag ('p','h1'..'h4','blockquote') of the block that holds the given position. */
function safifyBlockTagAt(ed, node, offset) {
  const b = safifyTopBlock(ed, node, offset, false);
  if (!b || b.nodeType !== 1) return 'p';
  const t = b.tagName.toLowerCase();
  return ['h1', 'h2', 'h3', 'h4', 'blockquote'].includes(t) ? t : 'p';
}

/**
 * Turn every block touched by the current selection (or just the block that
 * holds the caret) into <tag>. Works with a collapsed caret AND a selection.
 * If `toggle` is true and all blocks already have that tag they go back to <p>.
 */
function safifySetBlock(ed, tag, toggle) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return false;
  const r0 = sel.getRangeAt(0);
  if (!ed.contains(r0.startContainer) || !ed.contains(r0.endContainer)) return false;
  const doc = ed.ownerDocument;
  const sm = { sc: r0.startContainer, so: r0.startOffset, ec: r0.endContainer, eo: r0.endOffset };

  if (safifyEditorNeedsNormalize(ed)) {
    safifyNormalizeBlocks(ed);
    if (!ed.contains(sm.sc) || !ed.contains(sm.ec)) {
      sm.sc = sm.ec = ed.firstChild; sm.so = sm.eo = 0;
    }
  }

  let a = safifyTopBlock(ed, sm.sc, sm.so, false);
  let b = safifyTopBlock(ed, sm.ec, sm.eo, true);
  if (!a) a = ed.firstChild;
  if (!b) b = ed.lastChild;

  // Triple-click style selections end at offset 0 of the NEXT block: don't include it.
  if (a !== b) {
    try {
      const t = doc.createRange();
      t.setStart(b, 0);
      t.setEnd(sm.ec, sm.eo);
      if (t.toString() === '' && !t.cloneContents().querySelector('img')) b = b.previousSibling || a;
    } catch (e) { /* ignore */ }
  }

  let list = [];
  for (let n = a; n; n = n.nextSibling) {
    if (n.nodeType === 1) list.push(n);
    if (n === b) break;
  }

  const remap = (oldN, newN, endOffset) => {
    if (sm.sc === oldN) { sm.sc = newN; }
    if (sm.ec === oldN) { sm.ec = newN; if (endOffset !== undefined) sm.eo = endOffset; }
  };

  // Un-nest blockquote/div blocks that contain several inner blocks.
  const units = [];
  list.forEach(blk => {
    const t = blk.tagName;
    if ((t === 'BLOCKQUOTE' || t === 'DIV') && Array.from(blk.childNodes).some(safifyIsBlock)) {
      safifyNormalizeBlocks(blk);
      const kids = Array.from(blk.childNodes).filter(n => n.nodeType === 1);
      const parent = blk.parentNode;
      while (blk.firstChild) parent.insertBefore(blk.firstChild, blk);
      parent.removeChild(blk);
      if (kids.length) {
        remap(blk, kids[0]);
        if (sm.ec === kids[0]) sm.eo = Math.min(sm.eo, kids[0].childNodes.length);
      }
      kids.forEach(k => units.push(k));
    } else {
      units.push(blk);
    }
  });

  const want = String(tag).toLowerCase();
  const convertible = units.filter(u => !/^(UL|OL|TABLE|HR|PRE)$/.test(u.tagName));
  const allSame = convertible.length > 0 && convertible.every(u => u.tagName.toLowerCase() === want);
  const target = toggle && allSame && want !== 'p' ? 'p' : want;

  convertible.forEach(blk => {
    if (blk.tagName.toLowerCase() === target) return;
    const el = doc.createElement(target);
    if (blk.style && blk.style.textAlign) el.style.textAlign = blk.style.textAlign;
    while (blk.firstChild) el.appendChild(blk.firstChild);
    if (!el.firstChild) el.appendChild(doc.createElement('br'));
    blk.parentNode.replaceChild(el, blk);
    remap(blk, el, blk.childNodes.length);
  });

  try {
    const nr = doc.createRange();
    nr.setStart(sm.sc, sm.so);
    nr.setEnd(sm.ec, sm.eo);
    sel.removeAllRanges();
    sel.addRange(nr);
  } catch (e) { /* selection could not be restored */ }
  return true;
}

/* ------------------------------------------------------------------ */
/*  Images                                                            */
/* ------------------------------------------------------------------ */
const SafifyImage = {
  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  /** Shrinks big photos/screenshots so notes stay fast and storage never fills up. */
  async compress(file, maxDim = 1600, quality = 0.86) {
    try {
      if (!file.type.startsWith('image/') || /svg|gif/.test(file.type)) return await this.fileToBase64(file);
      const url = URL.createObjectURL(file);
      let img;
      try {
        img = await new Promise((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = rej;
          i.src = url;
        });
      } finally {
        URL.revokeObjectURL(url);
      }
      const ratio = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
      if (ratio === 1 && file.size < 350 * 1024) return await this.fileToBase64(file);
      const w = Math.max(1, Math.round(img.naturalWidth * ratio));
      const h = Math.max(1, Math.round(img.naturalHeight * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      const keepPng = file.type === 'image/png' && file.size < 1.5 * 1024 * 1024;
      if (!keepPng) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); }
      ctx.drawImage(img, 0, 0, w, h);
      return canvas.toDataURL(keepPng ? 'image/png' : 'image/jpeg', quality);
    } catch (e) {
      return this.fileToBase64(file);
    }
  },

  extractImageFile(e) {
    if (e.dataTransfer && e.dataTransfer.files) {
      for (const file of e.dataTransfer.files) {
        if (file.type.startsWith('image/')) return file;
      }
    }
    if (e.clipboardData && e.clipboardData.items) {
      for (const item of e.clipboardData.items) {
        if (item.type.startsWith('image/')) return item.getAsFile();
      }
    }
    if (e.clipboardData && e.clipboardData.files) {
      for (const file of e.clipboardData.files) {
        if (file.type.startsWith('image/')) return file;
      }
    }
    return null;
  }
};
