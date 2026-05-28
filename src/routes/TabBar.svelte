<script lang="ts">
  import type { Tab } from "./types";

  interface Props {
    tabs: Tab[];
    activeTabId: string;
    vaultPath: string;
    onSelectTab: (id: string) => void;
    onCloseTab: (id: string, e: Event) => void;
    onOpenSearchModal: () => void;
    onOpenScratchpad: (shouldAppend?: boolean) => void;
    onCreateNewTab: () => void;
    onSelectDirectory: () => void;
  }

  let {
    tabs,
    activeTabId,
    vaultPath,
    onSelectTab,
    onCloseTab,
    onOpenSearchModal,
    onOpenScratchpad,
    onCreateNewTab,
    onSelectDirectory
  }: Props = $props();
</script>

<header class="tab-header">
  <div class="tabs-list">
    <!-- Vault/Folder Pill (📁 personal) -->
    <button
      class="tab-pill folder"
      onclick={onSelectDirectory}
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

    <!-- Category Pill (/search) with Search Icon! -->
    <button
      class="tab-pill inbox-indicator"
      onclick={onOpenSearchModal}
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
      onclick={() => onOpenScratchpad(true)}
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
        onclick={() => onSelectTab(tab.id)}
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
            onCloseTab(tab.id, e);
          }}
          onkeydown={(e) => {
            e.stopPropagation();
            e.key === "Enter" && onCloseTab(tab.id, e);
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
      onclick={onCreateNewTab}
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
