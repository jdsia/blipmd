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

  // Initialize Markdown parser
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
  });

  interface Tab {
    id: string; // Unique ID or filePath
    title: string;
    content: string;
    tags: string; // Comma separated for easy editing in input
    created: string;
    isNew: boolean;
    filePath: string;
    isSaved: boolean;
  }

  interface SearchResult {
    name: string;
    path: string;
    tags?: string[];
  }

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

  // Debounced auto save
  function handleInput() {
    if (activeTab) {
      activeTab.isSaved = false;
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
    <header class="tab-header">
      <div class="tabs-list">
        <!-- Vault/Folder Pill (📁 personal) -->
        <button
          class="tab-pill folder"
          onclick={selectVault}
          title="Click to change vault folder"
        >
          <span class="bracket">[</span><svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            style="margin-right: 4px; vertical-align: middle;"
            ><path
              d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
            ></path></svg
          >{vaultPath.split(/[/\\]/).filter(Boolean).pop()?.toLowerCase() ||
            "vault"}<span class="bracket">]</span>
        </button>
        <!-- Category Pill (/inbox) with Search Icon! -->
        <button
          class="tab-pill inbox-indicator"
          onclick={() => {
            showSearchModal = true;
            scanVault();
          }}
          title="Search notes"
        >
          <span class="bracket">[</span><svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            style="margin-right: 4px; vertical-align: middle;"
            ><circle cx="11" cy="11" r="8"></circle><line
              x1="21"
              y1="21"
              x2="16.65"
              y2="16.65"
            ></line></svg
          >/search<span class="bracket">]</span>
        </button>

        <!-- Scratchpad Pill with Writing Icon! -->
        <button
          class="tab-pill scratchpad-indicator"
          onclick={() => openScratchpad(true)}
          title="Open Scratchpad"
        >
          <span class="bracket">[</span><svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            style="margin-right: 4px; vertical-align: middle;"
            ><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path></svg
          >/scratchpad<span class="bracket">]</span>
        </button>

        <!-- Divider for layout spacing -->
        <div style="width: 8px;"></div>

        {#each tabs as tab (tab.id)}
          <button
            class="tab-pill note-tab"
            class:active={activeTabId === tab.id}
            onclick={() => (activeTabId = tab.id)}
          >
            {#if activeTabId === tab.id}
              <span class="bracket">[</span>
            {/if}
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              style="margin-right: 4px; vertical-align: middle;"
              ><path
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              ></path><polyline points="14 2 14 8 20 8"></polyline></svg
            >
            <span class="tab-indicator">{tab.isSaved ? "" : "*"}</span>
            {tab.title.toLowerCase().replace(/\.md$/, "")}.md
            <span
              class="tab-close"
              role="button"
              tabindex="0"
              onclick={(e) => {
                e.stopPropagation();
                closeTab(tab.id, e);
              }}
              onkeydown={(e) => {
                e.stopPropagation();
                e.key === "Enter" && closeTab(tab.id, e);
              }}
            >
              <svg
                width="8"
                height="8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><line x1="18" y1="6" x2="6" y2="18"></line><line
                  x1="6"
                  y1="6"
                  x2="18"
                  y2="18"
                ></line></svg
              >
            </span>
            {#if activeTabId === tab.id}
              <span class="bracket">]</span>
            {/if}
          </button>
        {/each}

        <button
          class="tab-pill new-entry"
          onclick={createNewTab}
          title="New Note"
        >
          <span class="bracket">[</span><svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            style="margin-right: 4px; vertical-align: middle;"
            ><line x1="12" y1="5" x2="12" y2="19"></line><line
              x1="5"
              y1="12"
              x2="19"
              y2="12"
            ></line></svg
          >
          new.md<span class="bracket">]</span>
        </button>
      </div>
    </header>

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
          <div class="note-meta-header">
            <!-- Path representation styled like your site ~ / inbox / note-title -->
            <div class="site-path-header">
              ~ / inbox / {activeTab.title.toLowerCase().replace(/\.md$/, "")}
            </div>

            <div class="title-container-row">
              <input
                type="text"
                class="note-title-input"
                bind:value={activeTab.title}
                oninput={handleInput}
                placeholder="untitled"
              />
            </div>

            <div class="note-meta-row">
              <span class="meta-label">tags: </span>
              <span class="meta-bracket">[</span>
              <input
                type="text"
                class="note-tags-input"
                bind:value={activeTab.tags}
                oninput={handleInput}
                placeholder="dev, ideas"
              />
              <span class="meta-bracket">]</span>
              <span class="meta-divider">•</span>
              <span class="meta-label">created: </span>
              <input
                type="date"
                class="note-date-input"
                bind:value={activeTab.created}
                oninput={handleInput}
              />
            </div>
          </div>

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
      <footer class="bottom-bar">
        <button
          class="tab-pill action"
          onclick={(e) => closeTab(activeTab.id, e)}
        >
          <span class="bracket">[</span>close<span class="bracket">]</span>
        </button>

        <div class="formatting-helpers">
          <button
            class="btn-icon"
            onclick={() => insertFormat("**", "**")}
            title="Bold">B</button
          >
          <button
            class="btn-icon"
            onclick={() => insertFormat("*", "*")}
            title="Italic">I</button
          >
          <button
            class="btn-icon"
            onclick={() => insertFormat("# ")}
            title="Heading">H</button
          >
          <button
            class="btn-icon"
            onclick={() => insertFormat("- ")}
            title="Bullet List">•</button
          >
          <button
            class="btn-icon"
            onclick={() => insertFormat("[", "](url)")}
            title="Link"
            ><svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              style="vertical-align: middle;"
              ><path
                d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
              ></path><path
                d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
              ></path></svg
            ></button
          >
          <button
            class="btn-icon"
            onclick={() => insertFormat("`", "`")}
            title="Inline Code">`</button
          >
        </div>

        <div class="bottom-actions">
          <button
            class="tab-pill action"
            onclick={() => (showPreview = !showPreview)}
          >
            <span class="bracket">[</span>{showPreview
              ? "editor"
              : "preview"}<span class="bracket">]</span>
          </button>
          <button
            class="tab-pill action"
            class:active={!activeTab.isSaved}
            onclick={saveActiveNote}
          >
            <span class="bracket">[</span>{activeTab.isSaved
              ? "saved"
              : "save"}<span class="bracket">]</span>
          </button>
        </div>
      </footer>
    {/if}
  {/if}

  <!-- SEARCH OVERLAY MODAL -->
  {#if showSearchModal}
    <div
      class="modal-backdrop"
      role="button"
      tabindex="0"
      onclick={() => (showSearchModal = false)}
      onkeydown={(e) => e.key === "Escape" && (showSearchModal = false)}
    >
      <div
        class="modal-content"
        role="dialog"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
      >
        <div class="search-header">
          <input
            bind:this={searchInputEl}
            type="text"
            class="search-input"
            placeholder="Type to search note title..."
            bind:value={searchQuery}
            onkeydown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                showSearchModal = false;
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (
                  searchResults.length > 0 &&
                  searchResults[selectedSearchIndex]
                ) {
                  openExistingNote(searchResults[selectedSearchIndex]);
                }
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                selectedSearchIndex =
                  (selectedSearchIndex + 1) % searchResults.length;
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                selectedSearchIndex =
                  (selectedSearchIndex - 1 + searchResults.length) %
                  searchResults.length;
              }
            }}
          />
        </div>
        <div class="search-results-list">
          {#each searchResults as result, idx}
            <button
              class="search-item"
              class:selected={idx === selectedSearchIndex}
              onclick={() => openExistingNote(result)}
            >
              <div style="display: flex; justify-content: space-between; align-items: baseline; width: 100%;">
                <span class="search-item-name">{result.name}</span>
                {#if result.tags && result.tags.length > 0}
                  <span style="font-size: 0.85rem; font-style: italic; color: var(--color-slate);">
                    [{result.tags.join(", ")}]
                  </span>
                {/if}
              </div>
              <span class="search-item-path"
                >{result.path.replace(vaultPath, "")}</span
              >
            </button>
          {:else}
            <p class="no-results">No matching notes found</p>
          {/each}
        </div>
        <div class="modal-footer">
          <span>ctrl-f to open | </span>
          <span>Esc to Close</span>
        </div>
      </div>
    </div>
  {/if}
</main>


