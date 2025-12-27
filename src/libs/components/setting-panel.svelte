<!--
 Copyright (c) 2023 by frostime All Rights Reserved.
 Author       : frostime
 Date         : 2023-07-01 19:23:50
 FilePath     : /src/libs/components/setting-panel.svelte
 LastEditTime : 2024-08-09 21:41:07
 Description  : 
-->
<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import TldrawBackupManager from '@/handwriting/tldraw/ui/tldraw-backup-manager.svelte';
    import TldrawReferenceManager from '@/handwriting/tldraw/ui/tldraw-reference-manager.svelte';
    import Form from './Form';
    import HeadimgMappingEditor from '@/settings/components/HeadimgMappingEditor.svelte';
    import NotebookBlacklistEditor from '@/settings/components/NotebookBlacklistEditor.svelte';

    export let group: string;
    export let settingItems: ISettingItem[];
    export let display: boolean = true;

    const dispatch = createEventDispatcher();

    function onClick({ detail }) {
        dispatch("click", { key: detail.key });
    }
    function onChanged({ detail }) {
        dispatch("changed", { group: group, ...detail });
    }

    $: fn__none = display ? "" : "fn__none";

</script>

<div class="config__tab-container {fn__none}" data-name={group}>
    <!-- 将插槽内容放在最前面 -->
    <slot />
    {#each settingItems as item (item.key)}
        <Form.Wrap
            title={item.title}
            description={item.description}
            direction={item?.direction}
        > 
            <Form.Input
                type={item.type}
                key={item.key}
                bind:value={item.value}
                placeholder={item?.placeholder}
                options={item?.options}
                slider={item?.slider}
                button={item?.button}
                on:click={onClick}
                on:changed={onChanged}
            />
        </Form.Wrap>
    {#if item.type === "custom" && item.component === "TldrawBackupManager"}
        <div class="b3-label">
            <div class="fn__flex-1 fn__flex-column">
                <TldrawBackupManager />
            </div>
        </div>
        {/if}
        {#if item.type === "custom" && item.component === "TldrawReferenceManager"}
        <div class="b3-label">
            <div class="fn__flex-1 fn__flex-column">
                <TldrawReferenceManager />
            </div>
        </div>
    {/if}
        {#if item.type === "custom" && item.component === "HeadimgMappingEditor"}
        <div class="b3-label">
            <div class="fn__flex-1 fn__flex-column">
                <HeadimgMappingEditor group={group} key={item.key} value={item.value}
                  on:changed={(e)=>dispatch('changed', { group, key: item.key, value: e.detail.value })} />
            </div>
        </div>
        {/if}
        {#if item.type === "custom" && item.component === "NotebookBlacklistEditor"}
        <div class="b3-label">
            <div class="fn__flex-1 fn__flex-column">
                <NotebookBlacklistEditor group={group} key={item.key} value={item.value}
                  on:changed={(e)=>dispatch('changed', { group, key: item.key, value: e.detail.value })} />
            </div>
        </div>
        {/if}
    {/each}
    
</div>