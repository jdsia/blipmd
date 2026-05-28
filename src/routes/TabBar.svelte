<script lang="ts">
  import type { Tab } from "./types"; // We will declare an interface file or use imported types

  interface Props {
    tabs: Tab[];
    activeTabId: string;
    vaultPath: string;
    onSelectTab: (id: string) => void;
    onOpenScratchpad: (shouldAppend?: boolean) => void;
    onCreateNewTab: () => void;
    onSelectDirectory: () => void;
  }

  let {
    tabs,
    activeTabId,
    vaultPath,
    onSelectTab,
    onOpenScratchpad,
    onCreateNewTab,
    onSelectDirectory
  }: Props = $props();
</script>

<header class="app-header">
  <div class="header-left">
    {#if vaultPath}
      <button class="tab-pill action font-mono" onclick={onSelectDirectory}>
        <span class="bracket">[</span>vault: {vaultPath.split("/").pop() || "..."}<span class="bracket">]</span>
      </button>
    {:else}
      <button class="tab-pill action font-mono active" onclick={onSelectDirectory}>
        <span class="bracket">[</span>choose vault<span class="bracket">]</span>
      </button>
    {/if}
  </div>

  <div class="tabs-scroll-area">
    <div class="tabs-list">
      {#each tabs as tab}
        <button
          class="tab-item font-mono"
          class:active={tab.id === activeTabId}
          onclick={() => onSelectTab(tab.id)}
        >
          {tab.title.toLowerCase().replace(/\.md$/, "")}
          {#if !tab.isSaved}
            <span class="unsaved-indicator">•</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <div class="header-right">
    <button
      class="tab-pill action font-mono"
      onclick={() => onOpenScratchpad(true)}
      title="Open scratchpad note"
    >
      <span class="bracket">[</span>scratchpad<span class="bracket">]</span>
    </button>
    <button
      class="tab-pill action font-mono"
      onclick={onCreateNewTab}
      title="Create new note (Ctrl+N)"
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        style="vertical-align: middle; margin-right: 2px;"
      >
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
      new.md<span class="bracket">]</span>
    </button>
  </div>
</header>
