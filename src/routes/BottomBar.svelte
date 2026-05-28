<script lang="ts">
  import type { Tab } from "./types";

  interface Props {
    activeTab: Tab;
    showPreview: boolean;
    onCloseTab: (id: string, e: Event) => void;
    onTogglePreview: () => void;
    onSaveActiveNote: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onInsertFormat: (prefix: string, suffix?: string) => void;
  }

  let {
    activeTab,
    showPreview,
    onCloseTab,
    onTogglePreview,
    onSaveActiveNote,
    onUndo,
    onRedo,
    onInsertFormat
  }: Props = $props();
</script>

<footer class="bottom-bar">
  <button
    class="tab-pill action"
    onclick={(e) => onCloseTab(activeTab.id, e)}
  >
    <span class="bracket">[</span>close<span class="bracket">]</span>
  </button>

  <div class="formatting-helpers">
    <button
      class="btn-icon"
      onclick={onUndo}
      disabled={!activeTab.history || activeTab.historyIndex === undefined || activeTab.historyIndex <= 0}
      title="Undo (Ctrl+Z)"
      style="opacity: {!activeTab.history || activeTab.historyIndex === undefined || activeTab.historyIndex <= 0 ? 0.35 : 1};"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;">
        <path d="M3 7v6h6"></path>
        <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
      </svg>
    </button>
    <button
      class="btn-icon"
      onclick={onRedo}
      disabled={!activeTab.history || activeTab.historyIndex === undefined || activeTab.historyIndex >= activeTab.history.length - 1}
      title="Redo (Ctrl+Y)"
      style="opacity: {!activeTab.history || activeTab.historyIndex === undefined || activeTab.historyIndex >= activeTab.history.length - 1 ? 0.35 : 1};"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle;">
        <path d="M21 7v6h-6"></path>
        <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"></path>
      </svg>
    </button>
    <span style="width: 1px; height: 16px; background-color: var(--color-mist); margin: 0 4px; align-self: center;"></span>
    <button
      class="btn-icon"
      onclick={() => onInsertFormat("**", "**")}
      title="Bold">B</button
    >
    <button
      class="btn-icon"
      onclick={() => onInsertFormat("*", "*")}
      title="Italic">I</button
    >
    <button
      class="btn-icon"
      onclick={() => onInsertFormat("# ")}
      title="Heading">H</button
    >
    <button
      class="btn-icon"
      onclick={() => onInsertFormat("- ")}
      title="Bullet List">•</button
    >
    <button
      class="btn-icon"
      onclick={() => onInsertFormat("[", "](url)")}
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
      onclick={() => onInsertFormat("`", "`")}
      title="Inline Code">`</button
    >
  </div>

  <div class="bottom-actions">
    <button
      class="tab-pill action"
      onclick={onTogglePreview}
    >
      <span class="bracket">[</span>{showPreview
        ? "editor"
        : "preview"}<span class="bracket">]</span>
    </button>
    <button
      class="tab-pill action"
      class:active={!activeTab.isSaved}
      onclick={onSaveActiveNote}
    >
      <span class="bracket">[</span>{activeTab.isSaved
        ? "saved"
        : "save"}<span class="bracket">]</span>
    </button>
  </div>
</footer>
