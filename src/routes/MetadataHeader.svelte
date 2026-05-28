<script lang="ts">
  import type { Tab } from "./types";

  interface Props {
    activeTab: Tab;
    onInput: () => void;
  }

  let { activeTab, onInput }: Props = $props();
</script>

<div class="note-meta-header">
  <div class="site-path-header">
    ~ / inbox / {activeTab.title.toLowerCase().replace(/\.md$/, "")}
  </div>

  <div class="title-container-row">
    <input
      type="text"
      class="note-title-input"
      bind:value={activeTab.title}
      oninput={onInput}
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
      oninput={onInput}
      placeholder="dev, ideas"
    />
    <span class="meta-bracket">]</span>
    <span class="meta-divider">•</span>
    <span class="meta-label">created: </span>
    <input
      type="date"
      class="note-date-input"
      bind:value={activeTab.created}
      oninput={onInput}
    />
  </div>
</div>
