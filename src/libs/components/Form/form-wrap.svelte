<!--
 Copyright (c) 2024 by frostime. All Rights Reserved.
 Author       : frostime
 Date         : 2024-06-01 20:03:50
 FilePath     : /src/libs/components/item-wrap.svelte
 LastEditTime : 2024-07-19 15:28:57
 Description  : The setting item container
-->
<script lang="ts">
    export let title: string; // Displayint Setting Title
    export let description: string; // Displaying Setting Text
    export let direction: 'row' | 'column' = 'column';
</script>

{#if direction === "row"}
    <div class="st-item-wrap st-item-wrap--row b3-label" data-key="CustomCSS">
        <div class="fn__block">
            <span class="st-item-title">{title}</span>
            <div class="b3-label__text">{@html description}</div>
            <div class="fn__hr"></div>
            <div style="display: flex; flex-direction: column; gap: 5px; position: relative;">
                <slot />
            </div>
        </div>
    </div>
{:else}
    <div class="st-item-wrap st-item-wrap--column fn__flex b3-label config__item">
        <div class="fn__flex-1">
            <span class="st-item-title">{title}</span>
            <div class="b3-label__text">
                {@html description}
            </div>
        </div>
        <span class="fn__space" />
        <slot />
    </div>
{/if}

<style>
    .st-item-title {
        font-weight: 600;
        color: var(--b3-theme-primary);
        font-size: 0.95em;
    }
    .st-item-wrap.b3-label {
        box-shadow: none !important;
        padding-bottom: 8px;
        margin-bottom: 8px;
        background: transparent;
        border-radius: 6px;
        padding: 10px 12px;
        transition: all 0.15s ease;
        border: none;
    }
    .st-item-wrap.b3-label:hover {
        background: var(--b3-list-hover);
        border-color: var(--b3-border-color);
        box-shadow: none;
    }
    .st-item-wrap.b3-label:not(:last-child) {
        border-bottom: 1px solid var(--b3-border-color);
        margin-bottom: 8px;
    }
    .st-item-wrap.b3-label:hover:not(:last-child) {
        border-bottom-color: var(--b3-border-color);
    }
    .st-item-wrap .b3-label__text {
        font-size: 0.85em;
        line-height: 1.4;
        opacity: 0.8;
    }
</style>
