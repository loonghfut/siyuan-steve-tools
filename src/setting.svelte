<script lang="ts">
    import { frontEnd, moduleInstances } from "./index";
    import { onMount } from "svelte";
    import SettingPanel from "@/libs/components/setting-panel.svelte";
    import * as myapi from "@/api/api";
    import { getSettings } from "./setting_data";
    import { buildSettingGroups } from "./settings";
    import type { BuildContext } from "./settings";

    export let plugin;
    export let myfile;

    // Add subGroups and activeSubGroup properties to the module's entry in the groups array.
    // Add an entry to the subGroupItemCounts object for the module, specifying the item counts for each of its sub-groups.

    let settings = getSettings();

    interface ISettingGroup { name: string; items?: ISettingItem[]; subGroups?: { name: string; items: ISettingItem[] }[]; activeSubGroup?: string }
    let groups: ISettingGroup[] = [];
    let focusGroup: string = "";

    /********** Events **********/
    interface ChangeEvent {
        group: string;
        key: string;
        value: any;
    }

    const onChanged = ({ detail }: CustomEvent<ChangeEvent>) => {
        console.debug(detail.key, detail.value);
        const setting = settings[detail.key];
        if (setting !== undefined) {
            settings[detail.key] = detail.value;
            saveSettings();
        }
        isrefresh(detail.key);
        if (detail.key === "invert-page-enable") {
            document.body.classList.toggle("st-invert-mode", detail.value === true);
        }
    };

    import { needsRefresh } from "./settings/refresh";
    function isrefresh(setting) { if (needsRefresh(setting)) myapi.refresh(); }

    async function saveSettings(skipBgRefresh = false) {
        await plugin.saveData(myfile, settings);
        // 更新 LifeLog 模块的设置
        if (moduleInstances["M_lifelog"]) {
            moduleInstances["M_lifelog"].updateSettings(settings);
        }
        if (moduleInstances["M_Minutiae"]) {
            // pass option to avoid switching background when called during initial load
            moduleInstances["M_Minutiae"].updateSettings(settings, { skipBgRefresh });
        }
    }

    onMount(async () => {
        const headerEl = document.querySelector(".b3-dialog__header");
        if (headerEl && !headerEl.querySelector("button[data-st-save]")) {
            const refreshBtn = document.createElement("button");
            refreshBtn.dataset.stSave = "1";
            refreshBtn.className = "b3-button b3-button--outline";
            refreshBtn.style.cssText = "float: right; margin-right: 8px;";
            refreshBtn.textContent = "保存";
            refreshBtn.onclick = () => myapi.refresh();
            headerEl.appendChild(refreshBtn);
        }
        await runload();
    });

    async function runload() {
        const data = await plugin.loadData(myfile);
        if (data) settings = { ...settings, ...data };
        const ctx: BuildContext = { plugin, moduleInstances, frontEnd, settings };
        const built = buildSettingGroups(ctx);
        groups = built.map(g => ({
            name: g.name,
            items: g.items?.map(i => ({ ...i })),
            subGroups: g.subGroups?.map(sg => ({ name: sg.name, items: sg.items.map(i => ({ ...i })) })),
            activeSubGroup: g.subGroups?.[0]?.name
        }));
        await resolveDynamicOptions(ctx);
        updateGroupItems();
    // Persist merged settings but avoid triggering background switch during initial open
    await saveSettings(true);
        focusGroup = groups[0]?.name || "";
        // 初始应用页面反色
        if (settings["invert-page-enable"]) {
            document.body.classList.add("st-invert-mode");
        }
    }

    async function resolveDynamicOptions(ctx: BuildContext) {
        const tasks: Promise<any>[] = [];
        const apply = (item: any) => { if (item.dynamicOptions) tasks.push(Promise.resolve(item.dynamicOptions(ctx)).then((opts:any)=>{ if(opts) item.options = opts; }).catch(e=>console.error("动态选项加载失败", item.key, e))); };
        groups.forEach(g => { g.items?.forEach(apply); g.subGroups?.forEach(sg => sg.items.forEach(apply)); });
        await Promise.all(tasks);
        groups = groups.map(g => ({ ...g }));
    }

    function updateGroupItems() {
        groups = groups.map(g => ({
            ...g,
            items: g.items?.map(i => ({ ...i, value: settings[i.key] ?? i.value })),
            subGroups: g.subGroups?.map(sg => ({ ...sg, items: sg.items.map(i => ({ ...i, value: settings[i.key] ?? i.value })) }))
        }));
    }

    $: currentGroup = groups.find(g => g.name === focusGroup);
    $: activeSubGroupItems = currentGroup?.subGroups ? currentGroup.subGroups.find(sg => sg.name === currentGroup.activeSubGroup)?.items || [] : currentGroup?.items || [];
</script>

<div class="fn__flex-1 fn__flex config__panel">
    <ul class="b3-tab-bar b3-list b3-list--background">
        {#each groups as group}
            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
            <li
                data-name="editor"
                class:b3-list-item--focus={group.name === focusGroup}
                class="b3-list-item"
                on:click={() => {
                    focusGroup = group.name;
                }}
                on:keydown={() => {}}
            >
                <span class="b3-list-item__text">{group.name}</span>
            </li>
        {/each}
    </ul>
    <div class="config__tab-wrap">
        {#if currentGroup?.subGroups}
            <div class="config__tab-wrap">
                <div class="subgroup-buttons">
                    {#each currentGroup.subGroups as subGroup (subGroup.name)}
                        <button
                            class="b3-button"
                            class:b3-button--text={currentGroup.activeSubGroup !== subGroup.name}
                            on:click={() => {
                                currentGroup.activeSubGroup = subGroup.name;
                                groups = groups.map(g=>g); // trigger update
                            }}
                        >
                            {subGroup.name}
                        </button>
                    {/each}
                </div>
                <div class="config__tab-container">
                    <!-- 添加这个容器 -->
                    <SettingPanel
                        group={currentGroup.name}
                        settingItems={activeSubGroupItems}
                        display={true}
                        on:changed={onChanged}
                        on:click={({ detail }) => {
                            console.debug("Click:", detail.key);
                        }}
                    />
                </div>
            </div>
        {:else}
            <SettingPanel
                group={currentGroup?.name || ""}
                settingItems={currentGroup?.items || []}
                display={true}
                on:changed={onChanged}
                on:click={({ detail }) => {
                    console.debug("Click:", detail.key);
                }}
            />
        {/if}
    </div>
</div>

<style lang="scss">
    .config__panel {
        height: 70vh;
        display: flex;
        flex-direction: row;
        overflow: hidden;
    }
    .config__panel > .b3-tab-bar {
        width: 170px;
    }

    .config__tab-wrap {
        flex: 1;
        height: 100%;
        overflow: auto; // 添加滚动条
        padding: 2px; // 添加一些内边距
    }

    .config__tab-container {
        flex: 1;
        height: calc(100% - 48px); // 减去子分组按钮的高度
        overflow-y: auto;
    }

    // 为子分组按钮容器添加样式
    .subgroup-buttons {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }
</style>
