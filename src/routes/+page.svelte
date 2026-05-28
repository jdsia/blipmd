<script lang="ts">
  import { onMount } from "svelte";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import {
    writeTextFile,
    readTextFile,
    readDir,
    remove,
    mkdir,
    exists,
    rename,
    stat as getFileStat,
  } from "@tauri-apps/plugin-fs";
  import { join, dirname, basename } from "@tauri-apps/api/path";
  import MarkdownIt from "markdown-it";
  import "./app.css";
  import { parseNote, stringifyNote, type NoteMetadata } from "./noteUtils";
  import type { Tab, SearchResult } from "./types";
  import TabBar from "./TabBar.svelte";
  import MetadataHeader from "./MetadataHeader.svelte";
  import BottomBar from "./BottomBar.svelte";
  import SearchModal from "./SearchModal.svelte";

  // Initialize Markdown parser
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  });


  // --- Svelte 5 Runes ---
  let vaultPath = $state("");
  let tabs = $state<Tab[]>([]);
  let activeTabId = $state("");
  let showPreview = $state(false);
  let showSearchModal = $state(false);
  let searchQuery = $state("");
  let searchResults = $state<SearchResult[]>([]);
  let selectedSearchIndex = $state(0);
  let searchInputEl = $state<HTMLInputElement | null>(null);
  let allVaultNotes = $state<SearchResult[]>([]);
  let autoSaveTimeout: any;
  let historyTimeout: any;
  let zoomLevel = $state(13); // Default font size in px

  // Lifecycle & Storage
  onMount(async () => {
    const savedZoom = localStorage.getItem("pumice_zoom_level");
    if (savedZoom) {
      zoomLevel = parseInt(savedZoom, 10);
    }

    const savedPath = localStorage.getItem("pumice_vault_path");
    if (savedPath) {
      vaultPath = savedPath;
      await scanVault();
      await openScratchpad(true);
    } else {
      // Initialize first tab
      createNewTab();
    }

    // Register a global shortcut to hide/show the window instantly via Alt+P
    try {
      const { register } = await import("@tauri-apps/plugin-global-shortcut");
      const { getCurrentWindow } = await import("@tauri-apps/api/window");

      await register("Alt+P", async (event) => {
        if (event.state === "Pressed") {
          const appWindow = getCurrentWindow();
          const isVisible = await appWindow.isVisible();
          if (isVisible) {
            await appWindow.hide();
          } else {
            await appWindow.show();
            await appWindow.setFocus();
          }
        }
      });
      console.log("Global hotkey [Alt+P] registered.");
    } catch (err) {
      console.warn("Global hotkey registration skipped:", err);
    }
  });

  $effect(() => {
    document.documentElement.style.setProperty("--zoom-font-size", `${zoomLevel}px`);
    localStorage.setItem("pumice_zoom_level", String(zoomLevel));
  });

  // Get active tab object
  const activeTab = $derived(tabs.find((t) => t.id === activeTabId));
  const renderedMarkdown = $derived(
    activeTab ? md.render(activeTab.content) : "",
  );

  // Vault Management
  async function selectVault() {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Select Obsidian Vault Folder",
      });
      if (selected && typeof selected === "string") {
        vaultPath = selected;
        localStorage.setItem("pumice_vault_path", selected);
        await scanVault();
        await openScratchpad(true);
      }
    } catch (err) {
      console.error("Error choosing directory:", err);
    }
  }

  async function scanVault() {
    if (!vaultPath) return;
    try {
      const entries = await readDir(vaultPath);
      const notes: SearchResult[] = [];

      async function processEntries(
        dirEntries: typeof entries,
        currentPath: string,
      ) {
        for (const entry of dirEntries) {
          const fullPath = await join(currentPath, entry.name);
          if (entry.isDirectory) {
            try {
              const subEntries = await readDir(fullPath);
              await processEntries(subEntries, fullPath);
            } catch (e) {
              // Ignore folders we can't read
            }
          } else if (entry.name.endsWith(".md")) {
            try {
              const fileContent = await readTextFile(fullPath);
              const { metadata } = parseNote(fileContent, entry.name.replace(/\.md$/, ""));
              notes.push({
                name: entry.name.replace(/\.md$/, ""),
                path: fullPath,
                tags: metadata.tags || [],
              });
            } catch (err) {
              notes.push({
                name: entry.name.replace(/\.md$/, ""),
                path: fullPath,
                tags: [],
              });
            }
          }
        }
      }

      await processEntries(entries, vaultPath);
      allVaultNotes = notes;
    } catch (err) {
      console.error("Error scanning vault:", err);
    }
  }

  // Search autocomplete
  $effect(() => {
    if (searchQuery.trim() === "") {
      searchResults = allVaultNotes.slice(0, 10);
    } else {
      const query = searchQuery.toLowerCase();
      searchResults = allVaultNotes.filter(
        (n) =>
          n.name.toLowerCase().includes(query) ||
          n.path.toLowerCase().includes(query) ||
          (n.tags && n.tags.some((t) => t.toLowerCase().includes(query))),
      );
    }
    selectedSearchIndex = 0;
  });

  // Focus search input when modal opens
  $effect(() => {
    if (showSearchModal && searchInputEl) {
      setTimeout(() => {
        searchInputEl?.focus();
        searchInputEl?.select();
      }, 30);
    }
  });

  // Focus editor when modal closes
  $effect(() => {
    if (!showSearchModal) {
      setTimeout(() => {
        const textarea = document.getElementById(
          "editor-textarea",
        ) as HTMLTextAreaElement;
        textarea?.focus();
      }, 30);
    }
  });

  async function loadNoteWithMetadata(filePath: string, fallbackTitle: string) {
    const fileContent = await readTextFile(filePath);
    const parsed = parseNote(fileContent, fallbackTitle);

    const hasExplicitDate = /^(created|date|created_at|date_created):/im.test(fileContent);
    if (!hasExplicitDate) {
      try {
        const fsMeta = await getFileStat(filePath);
        const mtimeVal = fsMeta.mtime;
        if (mtimeVal) {
          parsed.metadata.created = new Date(mtimeVal).toISOString().split("T")[0];
        }
      } catch (_) {}
    }

    return parsed;
  }

  async function openScratchpad(shouldAppend = false) {
    if (!vaultPath) {
      alert("Please select your Obsidian Vault first!");
      return;
    }

    try {
      const scratchpadPath = await join(vaultPath, "scratchpad.md");
      const hasScratchpad = await exists(scratchpadPath);

      let parsed: { metadata: NoteMetadata; content: string };

      if (!hasScratchpad) {
        const initialMetadata: NoteMetadata = {
          title: "scratchpad",
          tags: ["scratchpad"],
          created: new Date().toISOString().split("T")[0],
        };
        const initialContent = `# scratchpad\n\nWelcome to your scratchpad.`;
        const fileString = stringifyNote(initialContent, initialMetadata);
        await writeTextFile(scratchpadPath, fileString);
        parsed = { metadata: initialMetadata, content: initialContent };
      } else {
        parsed = await loadNoteWithMetadata(scratchpadPath, "scratchpad");
      }

      if (shouldAppend) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const formattedTime = `${year}-${month}-${day} ${hours}:${minutes}`;

        parsed.content = parsed.content.trimEnd() + `\n\n## ${formattedTime}\n\n`;

        const fileString = stringifyNote(parsed.content, parsed.metadata);
        await writeTextFile(scratchpadPath, fileString);
      }

      // Check if already open
      const existingTab = tabs.find((t) => t.filePath === scratchpadPath);
      if (existingTab) {
        existingTab.content = parsed.content;
        existingTab.isSaved = true;
        activeTabId = existingTab.id;
        if (!existingTab.history) {
          existingTab.history = [parsed.content];
          existingTab.historyIndex = 0;
        } else {
          pushHistory(existingTab, parsed.content);
        }
      } else {
        const newId = Math.random().toString(36).substring(7);
        const scratchpadTab: Tab = {
          id: newId,
          title: parsed.metadata.title,
          content: parsed.content,
          tags: parsed.metadata.tags.join(", "),
          created: parsed.metadata.created,
          isNew: false,
          filePath: scratchpadPath,
          isSaved: true,
          history: [parsed.content],
          historyIndex: 0,
        };
        tabs = [...tabs, scratchpadTab];
        activeTabId = newId;
      }

      showPreview = false;
      await scanVault();

      // Auto scroll to bottom
      setTimeout(() => {
        const textarea = document.getElementById("editor-textarea") as HTMLTextAreaElement;
        if (textarea) {
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
          textarea.scrollTop = textarea.scrollHeight;
        }
      }, 80);

    } catch (err) {
      console.error("Scratchpad error:", err);
      alert("Failed to load/create scratchpad: " + err);
    }
  }

  // Tab Management
  function createNewTab() {
    const newId = Math.random().toString(36).substring(7);
    const newTab: Tab = {
      id: newId,
      title: "Untitled Note",
      content: "",
      tags: "inbox, pumice",
      created: new Date().toISOString().split("T")[0],
      isNew: true,
      filePath: "",
      isSaved: false,
      history: [""],
      historyIndex: 0,
    };
    tabs = [...tabs, newTab];
    activeTabId = newId;
  }

  async function openExistingNote(note: SearchResult) {
    // Check if note already open in a tab
    const existing = tabs.find((t) => t.filePath === note.path);
    if (existing) {
      activeTabId = existing.id;
      showSearchModal = false;
      searchQuery = "";
      return;
    }

    try {
      const parsed = await loadNoteWithMetadata(note.path, note.name);

      const newId = Math.random().toString(36).substring(7);
      const openedTab: Tab = {
        id: newId,
        title: parsed.metadata.title,
        content: parsed.content,
        tags: parsed.metadata.tags.join(", "),
        created: parsed.metadata.created,
        isNew: false,
        filePath: note.path,
        isSaved: true,
        history: [parsed.content],
        historyIndex: 0,
      };

      tabs = [...tabs, openedTab];
      activeTabId = newId;
      showSearchModal = false;
      searchQuery = "";
    } catch (err) {
      console.error("Failed to read note file:", err);
      alert("Failed to load note.");
    }
  }

  function closeTab(tabId: string, event: Event) {
    event.stopPropagation();
    const index = tabs.findIndex((t) => t.id === tabId);
    if (index === -1) return;

    const closedTab = tabs[index];
    if (!closedTab.isSaved && closedTab.content.trim() !== "") {
      const confirmClose = confirm(
        `Note "${closedTab.title}" is unsaved. Close anyway?`,
      );
      if (!confirmClose) return;
    }

    tabs = tabs.filter((t) => t.id !== tabId);

    if (tabs.length === 0) {
      createNewTab();
    } else if (activeTabId === tabId) {
      // Focus neighboring tab
      const nextIndex = Math.min(index, tabs.length - 1);
      activeTabId = tabs[nextIndex].id;
    }
  }

  // File I/O (Note Saving)
  async function saveActiveNote() {
    if (!activeTab) return;
    if (!vaultPath) {
      alert("Please select your Obsidian Vault first!");
      return;
    }

    try {
      const tagsArray = activeTab.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const yamlMetadata: NoteMetadata = {
        title: activeTab.title,
        tags: tagsArray,
        created: activeTab.created,
      };

      const fullFileString = stringifyNote(activeTab.content, yamlMetadata);

      // Determine file path
      let targetPath = activeTab.filePath;
      if (!targetPath) {
        // Check if selected vaultPath itself is or ends with "inbox"
        const isAlreadyInbox =
          vaultPath.toLowerCase().endsWith("inbox") ||
          vaultPath.toLowerCase().endsWith("inbox/") ||
          vaultPath.toLowerCase().endsWith("inbox\\");

        let dirToUse = vaultPath;
        if (!isAlreadyInbox) {
          const inboxDir = await join(vaultPath, "Inbox");
          const inboxLowerDir = await join(vaultPath, "inbox");

          let inboxExists = false;
          let existingInboxPath = inboxDir;

          try {
            if (await exists(inboxDir)) {
              inboxExists = true;
              existingInboxPath = inboxDir;
            } else if (await exists(inboxLowerDir)) {
              inboxExists = true;
              existingInboxPath = inboxLowerDir;
            }
          } catch (_) {}

          if (inboxExists) {
            dirToUse = existingInboxPath;
          } else {
            // Attempt to create "Inbox" (Obsidian convention) at the root
            try {
              await mkdir(inboxDir, { recursive: true });
              dirToUse = inboxDir;
            } catch (_) {
              dirToUse = vaultPath;
            }
          }
        }

        targetPath = await join(dirToUse, `${activeTab.title}.md`);
      } else {
        // Existing note: check if the user modified the note's title.
        // If they did, rename the physical file to match the new title.
        const currentDir = await dirname(activeTab.filePath);
        const expectedFilename = `${activeTab.title}.md`;
        const currentFilename = await basename(activeTab.filePath);

        if (currentFilename !== expectedFilename) {
          const newPath = await join(currentDir, expectedFilename);
          try {
            // Check if a file with the new name already exists to avoid silently overwriting another note
            if (await exists(newPath)) {
              alert(
                `A note named "${activeTab.title}" already exists! Please choose a different title.`,
              );
              return;
            }
            await rename(activeTab.filePath, newPath);
            targetPath = newPath;
          } catch (renameErr) {
            console.error("Rename file error:", renameErr);
            alert("Could not rename file on disk: " + renameErr);
            return;
          }
        }
      }

      await writeTextFile(targetPath, fullFileString);

      // Update tab state
      activeTab.filePath = targetPath;
      activeTab.isNew = false;
      activeTab.isSaved = true;

      // Rescan vault to update search list
      await scanVault();
    } catch (err) {
      console.error("Save note error:", err);
      alert("Error saving note: " + err);
    }
  }

  // Debounced auto save & history recording
  function pushHistory(tab: Tab, content: string) {
    if (!tab.history) {
      tab.history = [content];
      tab.historyIndex = 0;
      return;
    }

    const currentIndex = tab.historyIndex ?? 0;
    if (tab.history[currentIndex] === content) {
      return;
    }

    // Slice off any redo history
    tab.history = tab.history.slice(0, currentIndex + 1);
    tab.history.push(content);
    tab.historyIndex = tab.history.length - 1;

    // Cap history size to 200 states
    if (tab.history.length > 200) {
      tab.history.shift();
      if (tab.historyIndex !== undefined) {
        tab.historyIndex--;
      }
    }
  }

  function undo() {
    if (!activeTab || !activeTab.history || activeTab.historyIndex === undefined || activeTab.historyIndex <= 0) {
      return;
    }

    activeTab.historyIndex--;
    activeTab.content = activeTab.history[activeTab.historyIndex];
    activeTab.isSaved = false;
  }

  function redo() {
    if (!activeTab || !activeTab.history || activeTab.historyIndex === undefined || activeTab.historyIndex >= activeTab.history.length - 1) {
      return;
    }

    activeTab.historyIndex++;
    activeTab.content = activeTab.history[activeTab.historyIndex];
    activeTab.isSaved = false;
  }

  // Debounced auto save
  function handleInput() {
    if (activeTab) {
      activeTab.isSaved = false;

      // Debounce history recording
      clearTimeout(historyTimeout);
      historyTimeout = setTimeout(() => {
        if (activeTab) {
          pushHistory(activeTab, activeTab.content);
        }
      }, 800); // 800ms debounce
    }
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
      saveActiveNote();
    }, 1500); // 1.5 seconds debounce
  }

  async function pasteClipboard() {
    if (!activeTab) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        activeTab.content = text;
        activeTab.isSaved = false;
        handleInput();
        pushHistory(activeTab, activeTab.content);
      }
    } catch (err) {
      console.error("Failed to read clipboard:", err);
    }
  }

  // Editor formatting Helpers
  function insertFormat(prefix: string, suffix: string = "") {
    const textarea = document.getElementById(
      "editor-textarea",
    ) as HTMLTextAreaElement;
    if (!textarea || !activeTab) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);
    const replacement = prefix + selectedText + suffix;

    activeTab.content =
      text.substring(0, start) + replacement + text.substring(end);
    handleInput();
    pushHistory(activeTab, activeTab.content);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selectedText.length,
      );
    }, 0);
  }

  // Global Keys (Hiding search modal etc.)
  function handleGlobalKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      showSearchModal = false;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "f") {
      event.preventDefault();
      showSearchModal = !showSearchModal;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "s") {
      event.preventDefault();
      saveActiveNote();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "n") {
      event.preventDefault();
      createNewTab();
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === "=" || event.key === "+")) {
      event.preventDefault();
      zoomLevel = Math.min(zoomLevel + 1, 24); // Cap max zoom
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "-") {
      event.preventDefault();
      zoomLevel = Math.max(zoomLevel - 1, 9); // Cap min zoom
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "0") {
      event.preventDefault();
      zoomLevel = 13; // Reset to default
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "z") {
      event.preventDefault();
      undo();
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === "y" || (event.shiftKey && event.key === "Z"))) {
      event.preventDefault();
      redo();
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeyDown} />

<main class="app-layout">
  <!-- Check if Vault path is configured -->
  {#if !vaultPath}
    <div class="setup-container">
      <div class="setup-card">
        <h1 class="logo-title">PUMICE</h1>
        <p class="subtitle">a fast, lightweight Obsidian companion tool</p>
        <button class="btn-primary" onclick={selectVault}>
          Select Obsidian Vault Folder
        </button>
        <p class="help-text">
          Select your vault root folder. Your notes will land in the vault
          automatically.
        </p>
      </div>
    </div>
  {:else}
    <!-- 1. TAB PILLS HEADER -->
    <TabBar
      {tabs}
      {activeTabId}
      {vaultPath}
      onSelectTab={(id) => (activeTabId = id)}
      onOpenScratchpad={openScratchpad}
      onCreateNewTab={createNewTab}
      onSelectDirectory={selectVault}
    />

    <!-- 3. MAIN EDITOR OR PREVIEW AREA -->
    <section class="editor-area">
      {#if activeTab}
        {#if showPreview}
          <div class="markdown-preview markdown-body">
            {#if activeTab.content.trim() === ""}
              <p class="preview-placeholder">Nothing to render yet...</p>
            {:else}
              {@html renderedMarkdown}
            {/if}
          </div>
        {:else}
          <!-- Embedded Inline Metadata (Obsidian Style) -->
          <MetadataHeader
            {activeTab}
            onInput={handleInput}
          />

          <textarea
            id="editor-textarea"
            class="editor-textarea"
            placeholder="Write anything..."
            bind:value={activeTab.content}
            oninput={handleInput}
          ></textarea>

          {#if activeTab.content.trim() === ""}
            <div class="editor-suggestion-row">
              <button
                class="tab-pill action suggestion-btn"
                onclick={pasteClipboard}
                title="Import text from clipboard"
              >
                <span class="bracket">[</span>paste clipboard<span
                  class="bracket">]</span
                >
              </button>
            </div>
          {/if}
        {/if}
      {/if}
    </section>

    <!-- 4. BOTTOM ACTION TOOLBAR -->
    {#if activeTab}
      <BottomBar
        {activeTab}
        {showPreview}
        onCloseTab={closeTab}
        onTogglePreview={() => (showPreview = !showPreview)}
        onSaveActiveNote={saveActiveNote}
        onUndo={undo}
        onRedo={redo}
        onInsertFormat={insertFormat}
      />
    {/if}
  {/if}

  <!-- SEARCH OVERLAY MODAL -->
  <SearchModal
    bind:showSearchModal
    bind:searchQuery
    {searchResults}
    bind:selectedSearchIndex
    {vaultPath}
    bind:searchInputEl
    onClose={() => (showSearchModal = false)}
    onSelectNote={openExistingNote}
  />
</main>


