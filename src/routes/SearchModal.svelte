<script lang="ts">
  import type { SearchResult } from "./types";

  interface Props {
    showSearchModal: boolean;
    searchQuery: string;
    searchResults: SearchResult[];
    selectedSearchIndex: number;
    vaultPath: string;
    searchInputEl: HTMLInputElement | null;
    onClose: () => void;
    onSelectNote: (note: SearchResult) => void;
  }

  let {
    showSearchModal = $bindable(),
    searchQuery = $bindable(),
    searchResults,
    selectedSearchIndex = $bindable(),
    vaultPath,
    searchInputEl = $bindable(),
    onClose,
    onSelectNote
  }: Props = $props();
</script>

{#if showSearchModal}
  <div
    class="modal-backdrop"
    role="button"
    tabindex="0"
    onclick={onClose}
    onkeydown={(e) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.stopPropagation();
      }
    }}
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
          placeholder="Type to search note title or tag..."
          bind:value={searchQuery}
          onkeydown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (
                searchResults.length > 0 &&
                searchResults[selectedSearchIndex]
              ) {
                onSelectNote(searchResults[selectedSearchIndex]);
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
            onclick={() => onSelectNote(result)}
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
