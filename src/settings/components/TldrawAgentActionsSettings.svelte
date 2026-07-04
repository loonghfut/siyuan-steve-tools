<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import {
    DEFAULT_TLDRAW_AGENT_ACTION_NAMES,
    TLDRAW_AGENT_ACTIONS_META,
    type TldrawAgentActionCategory,
    type TldrawAgentActionMeta,
  } from '@/handwriting/tldraw/agent/actions/metadata';
  import { normalizeTldrawAgentActionNames } from '@/handwriting/tldraw/agent/actions/settings';

  export let group: string;
  export let key: string;
  export let value: unknown;

  const dispatch = createEventDispatcher();

  const categoryLabels: Record<TldrawAgentActionCategory, string> = {
    system: '系统',
    whiteboard: '白板',
    shape: '形状',
    document: '文档',
  };

  const riskLabels: Record<TldrawAgentActionMeta['risk'], string> = {
    read: '读取',
    write: '修改',
    danger: '高风险',
  };

  const categories: TldrawAgentActionCategory[] = ['system', 'whiteboard', 'shape', 'document'];

  $: selectedNames = normalizeTldrawAgentActionNames(value);
  $: selectedSet = new Set(selectedNames);
  $: selectedCount = selectedSet.size;

  function emit(nextNames: string[]) {
    const ordered = DEFAULT_TLDRAW_AGENT_ACTION_NAMES.filter((name) => nextNames.includes(name));
    value = ordered;
    dispatch('changed', { group, key, value: ordered });
  }

  function toggleAction(name: string, enabled: boolean) {
    const next = new Set(selectedNames);
    if (enabled) {
      next.add(name);
    } else {
      next.delete(name);
    }
    emit(Array.from(next));
  }

  function setAll(enabled: boolean) {
    emit(enabled ? [...DEFAULT_TLDRAW_AGENT_ACTION_NAMES] : []);
  }

  function setCategory(category: TldrawAgentActionCategory, enabled: boolean) {
    const next = new Set(selectedNames);
    TLDRAW_AGENT_ACTIONS_META
      .filter((action) => action.category === category)
      .forEach((action) => {
        if (enabled) {
          next.add(action.name);
        } else {
          next.delete(action.name);
        }
      });
    emit(Array.from(next));
  }

  function actionsByCategory(category: TldrawAgentActionCategory) {
    return TLDRAW_AGENT_ACTIONS_META.filter((action) => action.category === category);
  }
</script>

<div class="agent-actions-settings">
  <div class="agent-actions-toolbar">
    <span class="agent-actions-count">{selectedCount} / {DEFAULT_TLDRAW_AGENT_ACTION_NAMES.length} 已启用</span>
    <span class="fn__space"></span>
    <button class="b3-button b3-button--outline b3-button--small" type="button" on:click={() => setAll(true)}>
      全选
    </button>
    <button class="b3-button b3-button--outline b3-button--small" type="button" on:click={() => setAll(false)}>
      全不选
    </button>
  </div>

  {#each categories as category}
    <section class="agent-action-category">
      <div class="agent-action-category__header">
        <span>{categoryLabels[category]}</span>
        <span class="fn__space"></span>
        <button class="b3-button b3-button--text b3-button--small" type="button" on:click={() => setCategory(category, true)}>
          全开
        </button>
        <button class="b3-button b3-button--text b3-button--small" type="button" on:click={() => setCategory(category, false)}>
          全关
        </button>
      </div>
      <div class="agent-action-list">
        {#each actionsByCategory(category) as action (action.name)}
          <label class="agent-action-row">
            <input
              class="b3-switch"
              type="checkbox"
              checked={selectedSet.has(action.name)}
              on:change={(event) => toggleAction(action.name, event.currentTarget.checked)}
            />
            <span class="agent-action-main">
              <span class="agent-action-title">
                {action.title}
                <span class={`agent-action-risk agent-action-risk--${action.risk}`}>{riskLabels[action.risk]}</span>
              </span>
              <code>{action.name}</code>
              <span class="agent-action-description">{action.description}</span>
            </span>
          </label>
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .agent-actions-settings {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
  }

  .agent-actions-toolbar,
  .agent-action-category__header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .agent-actions-toolbar {
    padding: 8px 0;
  }

  .agent-actions-count {
    color: var(--b3-theme-on-surface);
    font-weight: 600;
  }

  .agent-action-category {
    border: 1px solid var(--b3-border-color);
    border-radius: 6px;
    overflow: hidden;
    background: var(--b3-theme-surface);
  }

  .agent-action-category__header {
    padding: 8px 10px;
    border-bottom: 1px solid var(--b3-border-color);
    color: var(--b3-theme-primary);
    font-weight: 600;
    background: var(--b3-theme-background);
  }

  .agent-action-list {
    display: flex;
    flex-direction: column;
  }

  .agent-action-row {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px;
    border-bottom: 1px solid var(--b3-border-color);
  }

  .agent-action-row:last-child {
    border-bottom: 0;
  }

  .agent-action-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .agent-action-title {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    color: var(--b3-theme-on-surface);
    font-weight: 600;
  }

  .agent-action-risk {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 6px;
    border-radius: 4px;
    font-size: 11px;
    line-height: 18px;
    color: var(--b3-theme-on-background);
    background: var(--b3-list-hover);
  }

  .agent-action-risk--write {
    color: var(--b3-theme-primary);
  }

  .agent-action-risk--danger {
    color: var(--b3-theme-error);
  }

  .agent-action-main code {
    width: fit-content;
    max-width: 100%;
    overflow-wrap: anywhere;
    color: var(--b3-theme-on-surface-light);
  }

  .agent-action-description {
    color: var(--b3-theme-on-surface-light);
    font-size: 12px;
    line-height: 1.45;
  }

  .b3-button--small {
    padding: 2px 8px;
    min-height: 24px;
  }
</style>

