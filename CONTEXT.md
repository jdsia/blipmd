
I'm building a lightweight desktop app — a fast Obsidian companion tool for quick note creation and reference, without the resource overhead of opening Obsidian itself. (computer runs slow when i have like 4 electron apps running at the same time...)

**Core philosophy:** Unix principle — do one thing well. Open fast, create a note, close. Notes land in your existing Obsidian vault, fully compatible.

**Tech stack:**
- Tauri v2 (Rust backend, native webview — not Electron)
- Svelte + TypeScript (frontend)
- Plain CSS (minimal dev aesthetic)
- `markdown-it` (markdown rendering)
- `gray-matter` (frontmatter parsing/writing)
- Tauri `fs` API (file I/O)

**Vault integration:**
- One-time vault path selection on first launch, stored in Tauri's `app_config_dir`
- New notes drop into a configurable inbox folder (e.g. `/Inbox/`)
- Note filenames follow Obsidian convention: `Note Title.md`
- Frontmatter is written in Obsidian-compatible YAML using `gray-matter`, supporting: `title`, `tags`, `aliases`, `created`, `date`, plus user-defined custom properties with typed fields (text, number, date, list, boolean, link)

**UI layout** — compact floating window (~700×500), remembers last position:
```
┌──────────────────────────────────────────┐
│  [PERSONAL] [/JOURNAL] [NEW ENTRY] [JUNE 27] [NOTEPAD]  │  ← tab pills
├──────────────────────────────────────────┤
│                                          │
│  Write anything...                       │  ← full width editor
│                                          │
├──────────────────────────────────────────┤
│  CLOSE    B I A ≡ ≡ ⌗ 🔗       SAVE    │  ← bottom bar
└──────────────────────────────────────────┘
```

- Note navigation should be mostly search based. so no need to render all notes in a dropdown. just have autocomplete ETC.
- Tabs at the top = open notes + vault folder shortcuts
- Each open note becomes a tab; closing it removes it
- NEW ENTRY tab creates a new note
- Properties panel collapses/expands inline above the editor content (Obsidian-style)
- Bottom toolbar: close note, markdown formatting actions, save
- Auto-save on keypress (debounced)
- Markdown preview toggle

**System behavior:**
- Lives in system tray when closed
- Global hotkey shows/hides the window instantly
- Background process is minimal — no file watching needed

**Aesthetic:** monospace font (IA fonts), muted flat colors, no shadows or gradients, small and dense. Dev/unix feel.

---
