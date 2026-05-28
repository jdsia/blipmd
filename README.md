# blipmd

A minimalist, high-density desktop companion for Obsidian. I personally built it for myself as I wanted a lightweight markdown editor that fit the aesthetic I wanted. Running Obsidian was way too heavy for my laptop, especially when running it alongside like 3 other Electron-based apps.

---

## The Philosophy: Bypassing the Electron Tax

Obsidian is an incredible tool for managing a second brain, but under the hood it is powered by Electron.

If you already keep a browser, an IDE, a chat client, and other tools open, running multiple Electron-based apps can quickly degrade system performance and consume gigabytes of RAM. Launching a heavy Electron window just to jot down a quick 2-line thought or append a daily journal entry is slow and resource-heavy.

Pumice operates on the Unix philosophy: do one thing well.

* Instant launch: starts in milliseconds
* Zero Electron overhead: powered by Tauri v2 and the system's native webview
* Pure Markdown: interacts directly with your existing Obsidian vault directory using standard file I/O—no intermediate databases or proprietary formats
* Monochromatic monospace: designed as a distraction-free ting

---

## Tech Stack & Design Architecture

Pumice leverages a modern, ultra-lightweight stack to maximize efficiency:

* Tauri v2 (Rust): high-performance, secure backend handling native file I/O and system tray management
* Svelte 5 + TypeScript: fast, reactive frontend rendering for smooth UI performance
* Plain CSS: minimalist monochrome design language inspired by iA Writer and terminal aesthetics
* gray-matter: full compatibility with Obsidian frontmatter structure (custom properties, lists, dates)
* markdown-it: fast, lightweight Markdown parser

---

## Key Features

* Seamless vault integration: direct one-time vault path configuration stored locally
* Tab-based navigation: quick pills for open documents, folder shortcuts, and new entries
* Smart search: search-based navigation instead of heavy file trees
* Debounced auto-save: writes edits directly to local .md files as you type
* Monospace aesthetic: muted flat tones, compact high-density layout
* Global hotkey and system tray: instantly open or dismiss the editor; runs quietly in the background when closed

---

## Getting Started

### Prerequisites

You need Node.js and Rust installed on your machine to build and run Pumice.

### Run in Development Mode

```bash
# Clone the repository
git clone https://github.com/jdsia/blipmd.git
cd blipmd

# Install dependencies
npm install

# Run the Tauri development server
npm run tauri dev
```

### Build Production Bundle

```bash
npm run tauri build
```

---

## License

MIT License. Free and open-source.
