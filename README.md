<div align="center">
  <img src="icons/logo.png" alt="SafifyNote Logo" width="128" height="128" />
  <h1>SafifyNote</h1>
  <p><strong>A secure, Jupyter-style modular notebook extension for Chrome with live code execution, freehand diagrams, zero-knowledge encrypted private vaults, local spell correction, and Groq-powered AI assistance.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Manifest-V3-blue.svg" alt="Manifest V3" />
    <img src="https://img.shields.io/badge/Encryption-AES--GCM%20256--bit-success.svg" alt="AES-GCM 256-bit" />
    <img src="https://img.shields.io/badge/AI%20Engine-Groq%20API%20Only-orange.svg" alt="Groq API Only" />
    <img src="https://img.shields.io/badge/License-MIT-lightgrey.svg" alt="License" />
  </p>
</div>

---

## 🌟 Overview

**SafifyNote** combines the modular power of Jupyter notebooks with the elegance of modern rich-text documentation and the privacy of a zero-knowledge encrypted vault. Whether you are drafting technical documentation, sketching architecture diagrams, running live sandboxed code snippets, or keeping strictly confidential research notes, SafifyNote provides a seamless, distraction-free environment inside your browser.

> [!IMPORTANT]
> **AI Assistant Support**: SafifyNote currently **exclusively supports the Groq Cloud API** for AI rephrasing and explanations. Groq delivers industry-leading inference speeds (~1,000 tokens/second) at minimal cost. Other providers (OpenAI direct, Anthropic, Gemini API) are not supported at this time.

---

## 🚀 Key Features

### 1. 📑 Modular Jupyter-Style Cell Architecture
Notes are composed of an ordered stack of independent cells that can be freely reordered, collapsed, duplicated, or removed.

* **Visual (Rich Text) Cells**:
  * Comprehensive formatting: Bold, Italic, Underline, Strikethrough, Paragraph, Headings (H1–H4), Blockquotes, Unordered/Ordered Lists, Alignments, Links, and Inline Images.
  * **ChatGPT & Gemini-Style Code Blocks**: Beautiful, dark/light syntax-highlighted code cards featuring rounded corners, language tags, and instant one-click copy buttons. Convert selected text into code blocks or insert fresh blocks directly from the toolbar.
  * **Dynamic Interactive Tables**: Create formatted data tables either by selecting structured text (auto-detects tabs/pipes/commas) or via interactive grid dimension prompts (e.g. 1×2, 2×4, 3×3).
  * **Accordion Folding**: Collapse individual cells to a single line preview or toggle "Show less / Show more" across the entire notebook.

* **Code Cells (Live Interactive Sandboxing)**:
  * Full support for HTML, CSS, JavaScript, or combined multi-language stacks.
  * Run code with `Shift + Enter` or the **Run** button.
  * Live sandboxed rendering isolated inside a relaxed-CSP iframe (`sandbox.html`).
  * Built-in dynamic execution console capturing `console.log`, `console.warn`, `console.error`, and syntax error diagnostics.

* **Diagram Cells (Freehand Canvas & Whiteboard)**:
  * Expressive vector drawing tools: Pencil, Soft Brush, Eraser, Geometric Shapes (Rectangle, Circle, Line, Arrow), Text annotations, and Image pasting.
  * Palette controls with custom hex colors and stroke widths.
  * **Configurable Stroke Smoothing**: Intelligent Bezier curve smoothing adjustable in Settings.
  * Full undo/redo history, canvas clearing, and draggable canvas height resizer.

---

### 2. 🔐 Zero-Knowledge Private Vault
SafifyNote includes a military-grade private notebook vault designed so that **no one—not even local scripts, extensions, or AI engines—can read your private notes without your master PIN**.

* **Cryptographic Foundation**:
  * **AES-GCM 256-bit** authenticated encryption.
  * **PBKDF2** key derivation with **100,000 iterations** and a 16-byte cryptographically secure random salt.
* **6-Digit Master PIN**: Private notes are encrypted client-side using Web Crypto before being written to persistent storage.
* **1-Click Lock/Unlock Toggle**: Switch any active note between Public and Private status directly from the top navigation bar.
* **Stealth Sidebar Mode**: Option in Settings to completely hide the "Private Notes" folder from the sidebar. Access the stealth vault using a customizable global hotkey (default: `Alt + P`).
* **Protected Settings**: Changing Private Vault visibility or shortcuts requires entering the master PIN.
* **Fail-Safe PIN Reset**: In accordance with true zero-knowledge architecture, if you forget your PIN, you can reset the vault. Resetting securely purges encrypted data to prevent unauthorized recovery attempts.

---

### 3. ⚡ AI Assistant (Groq Cloud API Exclusively)
SafifyNote features an integrated AI writing assistant built on top of the **Groq LPU™ Inference Engine**, delivering instantaneous responses.

> [!NOTE]
> **Why Groq Only?**
> Groq's specialized hardware enables near-instantaneous (~1,000 tps) text generation at negligible cost ($0.075 / 1M tokens), making inline writing assistance fluid and cost-effective.

* **Supported Groq Models**:
  * `openai/gpt-oss-20b` *(Default & Recommended)*: Groq's fastest, ultra-cheap, highly capable model for rapid rewriting, formatting, and analysis.
  * `llama-3.3-70b-versatile`: Groq's flagship model for deep conceptual breakdown and technical explanations.
  * *Dynamic Model Fetching*: The Settings panel automatically queries `/openai/v1/models` from Groq to verify availability and connection status.
* **Client-Side Encrypted API Key**: Your Groq API key is encrypted client-side with AES-256 before being stored in extension storage. It is never transmitted anywhere except directly to `https://api.groq.com`.
* **Structure-Preserving Rephrasing**: Unlike naive AI formatters that strip markup into plain text, SafifyNote's parser preserves existing `<table class="ai-table">` and `<div class="ai-code-block">` elements intact.
* **Rephrase Styles**:
  * *Professional*: Polished corporate tone.
  * *Casual*: Friendly and conversational.
  * *Concise*: Trims fluff while retaining key facts.
  * *Creative*: Vivid and expressive.
  * **"Fully Explain" Mode**: Produces comprehensive technical deep-dives with structured summary tables, illustrative code blocks, and bold conceptual highlights.
* **Live Diff & Modal Preview**: Inspect AI rephrasing in a side-by-side or preview modal before committing changes to your notebook.

---

### 4. 🔤 Local Offline Spell & Typo Fixer (`SafifySpell`)
* Built-in 100% offline typo and spelling correction engine.
* Runs entirely inside your browser with **zero network latency** and **zero external API calls**.
* Instantly fixes common keyboard slips (e.g., `helo` → `hello`, `teh` → `the`, `becuase` → `because`, `recieve` → `receive`, `seperate` → `separate`).
* Preserves original casing (*UPPERCASE*, *TitleCase*, *lowercase*).

---

### 5. 🔍 Smart Two-Tier Priority Search
Find notes and snippets instantly with an intelligent two-tier matching engine:
1. **Tier 1 (High Priority)**: Direct matches against note titles appear first.
2. **Tier 2 (Content Match)**: Matches inside cell content and first-line summaries appear cleanly below title matches.
* Search across all notes in the sidebar or filter cells within the active notebook.

---

### 6. 🗑️ Delete History & Trash Recovery
* **Accidental Deletion Protection**: Confirmation modal on every note deletion.
* **Soft Delete Vault**: Deleted notes are archived in the Delete History rather than permanently lost.
* **Trash Management**: Open Settings → Trash to search deleted notes, preview timestamps, restore individual notes, restore all notes, or permanently purge.

---

### 7. 📤 Universal Multi-Format Export & Import
* **`.sff` (SafifyNote Format)**: Clean, portable JSON format with custom header signature. Perfect for backups and migrating notes across machines.
* **Smart A4 PDF Export**: Intelligent pagination engine that breaks pages between paragraphs, code blocks, and diagrams so content is never sliced in half.
* **High-Res PNG / JPG**: Exports entire notebook canvases. Ultra-long documents are automatically exported in sequential, clean segments.
* **Instant Import**: Load any `.sff` file back into the editor with one click.

---

### 8. ⚙️ Responsive Tabbed Settings
A unified, clean modal interface partitioned into focused categories:
* **General**: Theme toggles (Dark / Light / Auto System), default cell type, diagram curve smoothing slider.
* **AI Assistant**: Groq API key entry, key validation, dynamic model selector, and connection test utility.
* **Private Vault**: Master PIN configuration, stealth sidebar visibility toggle, and global shortcut settings.
* **Trash / History**: Searchable trash bin with granular or batch recovery.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + Alt + 1` | Format selection as Heading 1 |
| `Ctrl + Alt + 2` | Format selection as Heading 2 |
| `Ctrl + Alt + 3` | Format selection as Heading 3 |
| `Ctrl + Alt + 4` | Format selection as Heading 4 |
| `Ctrl + Alt + 0` | Format selection as regular Paragraph |
| `Ctrl + B` / `Ctrl + I` / `Ctrl + U` | Bold / Italic / Underline |
| `Shift + Enter` | Run active Code Cell |
| `Alt + P` *(Configurable)* | Unlock / Open Private Vault in stealth mode |

---

## 🛠️ Installation Guide

1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/t2hasnain/SafifyNote.git
   ```
2. Open Google Chrome (or any Chromium-based browser like Brave, Edge, or Vivaldi).
3. Navigate to `chrome://extensions/`.
4. Enable **Developer mode** using the toggle switch in the upper-right corner.
5. Click the **Load unpacked** button in the top toolbar.
6. Select the folder containing `manifest.json` (`safifynote`).
7. Pin **SafifyNote** to your browser toolbar for instant 1-click access!

---

## 🔑 Groq API Setup (Quick Start)

To enable the AI Assistant:
1. Visit [Groq Console](https://console.groq.com/keys) and generate a free API key.
2. In SafifyNote, click the **Settings** gear icon.
3. Select the **AI Assistant** tab.
4. Paste your Groq API key into the input field.
5. Choose your preferred model (e.g., `openai/gpt-oss-20b` for maximum speed).
6. Click **Test Connection** to verify.
7. Click **Save Settings**. Your key is immediately encrypted and ready for use!

---

## 📁 Project Architecture

```
safifynote/
├── manifest.json         # Chrome MV3 manifest & permission configuration
├── popup.html/js/css     # Extension toolbar popup (notes list launcher)
├── editor.html/js/css    # Full-tab Jupyter-style notebook editor
├── sandbox.html          # Isolated sandbox page for live code cell preview
├── js/
│   ├── background.js     # MV3 service worker & Groq API fetch proxy
│   ├── common.js         # Web Crypto vault, SafifySpell, Groq client, store
│   ├── codecell.js       # Live code runner, syntax highlighting, console bridge
│   ├── diagram.js        # Canvas drawing engine, vector shapes, stroke smoothing
│   └── export.js         # Smart PDF page-break algorithm, PNG/JPG generator
├── icons/                # 3D ribbon logos (16px, 32px, 48px, 128px, 1024px)
├── fonts/                # Bundled offline fonts (Inter, JetBrains Mono)
└── lib/                  # html2canvas, jsPDF, and external vendor utilities
```

---

## 🔒 Security & Privacy Notice

* **No Tracking**: SafifyNote does not collect analytics, telemetry, or user data.
* **Zero-Knowledge Storage**: Private notes are encrypted client-side using AES-GCM 256-bit keys derived from your PIN. Plaintext never touches persistent storage without authentication.
* **Encrypted API Keys**: Groq API keys are encrypted at rest on your local device.
* **Strict Permissions**: SafifyNote only connects to `https://api.groq.com` when explicitly requested by you for AI features. All other operations (drawing, coding, spell check, export) run 100% locally and offline.

---

