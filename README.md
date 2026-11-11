<div align="center">
  <img src="icons/logo.png" alt="SafifyNote Logo" width="128" height="128" />
  <h1>SafifyNote</h1>
  <p><strong>A secure, Jupyter-style modular notebook extension for Chrome with live code execution, fullscreen vector diagrams, zero-knowledge encrypted private vaults, local spell correction, multi-provider AI assistance (Groq, OpenAI, Claude, Gemini, Custom), and an autonomous Copilot Agent with whole-notebook context memory.</strong></p>

  <p>
    <img src="https://img.shields.io/badge/Manifest-V3-blue.svg" alt="Manifest V3" />
    <img src="https://img.shields.io/badge/Encryption-AES--GCM%20256--bit-success.svg" alt="AES-GCM 256-bit" />
    <img src="https://img.shields.io/badge/AI%20Providers-Groq%20%7C%20OpenAI%20%7C%20Claude%20%7C%20Gemini%20%7C%20Custom-orange.svg" alt="Multi-Provider AI" />
    <img src="https://img.shields.io/badge/Copilot-Autonomous%20Agent-purple.svg" alt="Autonomous Copilot" />
    <img src="https://img.shields.io/badge/License-MIT-lightgrey.svg" alt="License" />
  </p>
</div>

---

## 🌟 Overview

**SafifyNote** combines the modular power of Jupyter notebooks with the elegance of modern rich-text documentation, the privacy of a zero-knowledge encrypted vault, and the intelligence of an autonomous in-editor AI Copilot. Whether you are drafting technical documentation, sketching whiteboard architecture diagrams, running live sandboxed code snippets, or keeping strictly confidential research notes, SafifyNote provides a seamless, distraction-free environment inside your browser.

---

## 🚀 Key Features

### 1. 🤖 Safify Copilot (Autonomous In-Editor AI Agent)
Directly embedded inside your notebook is an interactive AI Copilot with whole-notebook awareness:

* **Whole-Notebook Context Memory**:
  * Safify Copilot has full visibility across every cell in your active notebook (titles, rich text, code lines, diagram stroke counts, and text labels).
  * Ask questions about your notes (e.g., *"What is a vector and in which cell was it?"*). Copilot analyzes the entire note, provides an in-depth answer, and generates interactive citation pills: `[📍 Cell 2]`.
  * **Interactive Cell Jump**: Clicking any citation pill smoothly scrolls and highlights that exact cell with a brief animation!
* **Autonomous Cell Creation & Editing**:
  * Copilot can build your notebook with you! Ask it to:
    * *"Add an interactive sine wave visualization"*
    * *"Create a summary table comparing sorting algorithms"*
    * *"Update Cell 2 with a clearer explanation"*
  * Copilot generates your answer and displays **Interactive Action Cards** with preview snippets and a 1-click **"Apply to Note"** button.
* **Advanced Generative UI & Visualizations**:
  * Leverages modern HTML5 Canvas, SVG, and interactive JavaScript to build live, responsive visualizations inside executable code cells with zero external dependencies.
* **Floating Launcher & Custom Shortcut**:
  * Floating action button at the bottom-right of the editor.
  * Can be hidden in **Settings → General** if you prefer a minimal interface.
  * Quick-toggle keyboard shortcut (default: `Alt + A`, fully customizable in Settings).

---

### 2. ⚡ Multi-Provider AI Architecture
Choose whichever state-of-the-art AI provider and model suits your workflow:

| Provider | Supported Models | Highlights |
| :--- | :--- | :--- |
| **Groq Cloud** | `openai/gpt-oss-20b`, `llama-3.3-70b-versatile`, `openai/gpt-oss-120b`, `qwen-2.5-coder-32b`, `deepseek-r1-distill-llama-70b` | Ultra-fast LPU inference (~1,000 tps) at minimal cost |
| **OpenAI** | `gpt-4o`, `gpt-4o-mini`, `o3-mini`, `o1-mini`, `o1` | Flagship multimodal reasoning & coding |
| **Anthropic Claude** | `claude-3-7-sonnet-20250219`, `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022` | Hybrid thinking, extended reasoning, and expert coding |
| **Google Gemini** | `gemini-2.0-flash`, `gemini-2.0-flash-lite`, `gemini-1.5-pro`, `gemini-1.5-flash` | Next-generation multimodal speed and long-context capabilities |
| **Custom / OpenAI-Compatible** | Any custom model (e.g., `deepseek-chat`, `llama3:8b`) | Connect to local **Ollama**, **OpenRouter**, **vLLM**, or **LM Studio** |

* **Client-Side Key Encryption**: All API keys are encrypted at rest using device-derived **AES-256-GCM** before being saved to local extension storage.
* **Built-in Connection Tester**: Test your API key, custom base URL, and model availability with one click from the Settings panel.
* **Structure-Preserving Rephrase**: Preserves tables (`<table class="ai-table">`) and code blocks (`<div class="ai-code-block">`) without flattening markup into unformatted text.
* **"Fully Explain" Style**: Generates detailed conceptual breakdowns complete with structured markdown comparison tables, illustrative code snippets, and bold term highlights.

---

### 3. 🎨 Vector Diagram Cells with Fullscreen Mode `[ ]`
* **Fullscreen Overlay Mode `[ ]`**:
  * Click the `[ ]` button on any diagram cell toolbar (or press `Escape` to exit) to expand the drawing canvas into a full-window workspace for detailed diagrams and sketches.
* **Vector Drawing Tools**: Pencil, Soft Brush, Eraser, Geometric Shapes (Rectangle, Circle, Line, Triangle), Text annotations, and Image pasting.
* **Configurable Stroke Smoothing**: Intelligent Bezier curve smoothing adjustable from Settings.
* **Standalone PNG Export**: Click `⬇ PNG` in the diagram toolbar to instantly download the individual diagram as a high-resolution PNG image.

---

### 4. 🔐 Zero-Knowledge Private Vault
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

### 5. 🔤 Local Offline Spell & Typo Fixer (`SafifySpell`)
* Built-in 100% offline typo and spelling correction engine.
* Runs entirely inside your browser with **zero network latency** and **zero external API calls**.
* Instantly fixes common keyboard slips (e.g., `helo` → `hello`, `teh` → `the`, `becuase` → `because`, `recieve` → `receive`, `seperate` → `separate`).
* Preserves original casing (*UPPERCASE*, *TitleCase*, *lowercase*).

---

### 6. 🔍 Smart Two-Tier Priority Search
Find notes and snippets instantly with an intelligent two-tier matching engine:
1. **Tier 1 (High Priority)**: Direct matches against note titles appear first.
2. **Tier 2 (Content Match)**: Matches inside cell content and first-line summaries appear cleanly below title matches.
* Search across all notes in the sidebar or filter cells within the active notebook.

---

### 7. 🗑️ Delete History & Trash Recovery
* **Accidental Deletion Protection**: Confirmation modal on every note deletion.
* **Soft Delete Vault**: Deleted notes are archived in Delete History rather than permanently lost.
* **Trash Management**: Open Settings → Trash to search deleted notes, preview timestamps, restore individual notes, restore all notes, or permanently purge.

---

### 8. 📤 Universal Multi-Format Export & Import
* **`.sff` (SafifyNote Format)**: Clean, portable JSON format with custom header signature. Perfect for backups and migrating notes across machines.
* **Smart A4 PDF Export**: Intelligent pagination engine that breaks pages between paragraphs, code blocks, and diagrams so content is never sliced in half.
* **High-Res PNG / JPG**: Exports entire notebook canvases. Ultra-long documents are automatically exported in sequential, clean segments.
* **Instant Import**: Load any `.sff` file back into the editor with one click.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Alt + A` *(Configurable)* | Toggle Safify Copilot AI Agent drawer |
| `Alt + P` *(Configurable)* | Unlock / Open Private Vault in stealth mode |
| `Shift + Enter` | Run active Code Cell |
| `Escape` | Exit Diagram Fullscreen mode `[ ]` |
| `Ctrl + Alt + 1` | Format selection as Heading 1 |
| `Ctrl + Alt + 2` | Format selection as Heading 2 |
| `Ctrl + Alt + 3` | Format selection as Heading 3 |
| `Ctrl + Alt + 4` | Format selection as Heading 4 |
| `Ctrl + Alt + 0` | Format selection as regular Paragraph |
| `Ctrl + B` / `Ctrl + I` / `Ctrl + U` | Bold / Italic / Underline |
| `Ctrl + S` | Force instant save |

---

## 🛠️ Installation Guide

1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/your-username/safifynote.git
   ```
2. Open Google Chrome (or any Chromium-based browser like Brave, Edge, or Vivaldi).
3. Navigate to `chrome://extensions/`.
4. Enable **Developer mode** using the toggle switch in the upper-right corner.
5. Click the **Load unpacked** button in the top toolbar.
6. Select the `safifynote` folder containing `manifest.json`.
7. Pin **SafifyNote** to your browser toolbar for instant 1-click access!

---

## 🔑 AI Setup (Quick Start)

To configure your preferred AI provider:
1. Open SafifyNote and click the **Settings** gear icon (⚙️).
2. Select the **AI Assistant** tab.
3. Choose your provider:
   - **Groq Cloud**: Paste `gsk_...` key.
   - **OpenAI**: Paste `sk-...` key.
   - **Anthropic Claude**: Paste `sk-ant-...` key.
   - **Google Gemini**: Paste `AIzaSy...` key.
   - **Custom**: Enter Base URL (e.g. `http://localhost:11434/v1` for Ollama) + model name.
4. Click **Test Connection** to verify and sync available models.
5. Click **Save Key**. Your key is immediately encrypted with AES-256 and ready for use!

---

## 📁 Project Architecture

```
safifynote/
├── manifest.json         # Chrome MV3 manifest, host permissions & CSP configuration
├── popup.html/js/css     # Extension toolbar popup (notes list launcher)
├── editor.html/js/css    # Full-tab Jupyter-style notebook editor & Copilot drawer
├── sandbox.html          # Isolated sandbox page for live code cell preview
├── js/
│   ├── background.js     # MV3 service worker & universal AI fetch proxy
│   ├── common.js         # Web Crypto vault, SafifyAI client, SafifyAgent, SafifySpell, store
│   ├── codecell.js       # Live code runner, syntax highlighting, console bridge
│   ├── diagram.js        # Canvas drawing engine, vector shapes, fullscreen [ ], stroke smoothing
│   └── export.js         # Smart PDF page-break algorithm, PNG/JPG generator
├── icons/                # 3D ribbon logos (16px, 32px, 48px, 128px, 1024px)
├── fonts/                # Bundled offline fonts (Inter, JetBrains Mono)
└── lib/                  # html2canvas, jsPDF, and external vendor utilities
```

---

## 🔒 Security & Privacy Notice

* **No Tracking**: SafifyNote does not collect analytics, telemetry, or user data.
* **Zero-Knowledge Storage**: Private notes are encrypted client-side using AES-GCM 256-bit keys derived from your PIN. Plaintext never touches persistent storage without authentication.
* **Encrypted API Keys**: AI API keys are encrypted at rest on your local device.
* **Direct Connections Only**: Network requests for AI services travel directly to the official provider endpoint (Groq, OpenAI, Anthropic, Gemini, or your custom host). All other operations (drawing, code execution, spell check, export) run 100% locally and offline.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
