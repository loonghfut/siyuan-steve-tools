<script lang="ts">
  import { frontEnd, moduleInstances } from "./index";
  import { onMount } from "svelte";
  import SettingPanel from "@/libs/components/setting-panel.svelte";
  import { FormInput } from "@/libs/components/Form";
  import * as myapi from "@/api/api";
  import { getSettings } from "./setting_data";
  import { buildSettingGroups } from "./settings";
  import type { BuildContext } from "./settings";

  export let plugin;
  export let myfile;

  // Add subGroups and activeSubGroup properties to the module's entry in the groups array.
  // Add an entry to the subGroupItemCounts object for the module, specifying the item counts for each of its sub-groups.

  let settings = getSettings();

  interface ISettingGroup {
    name: string;
    items?: ISettingItem[];
    subGroups?: { name: string; items: ISettingItem[] }[];
    activeSubGroup?: string;
    skipGating?: boolean;
    enableGateItem?: ISettingItem;
  }
  let groups: ISettingGroup[] = [];
  let focusGroup: string = "";

  /** Extract the first item from a group as the sidebar "enable gate" checkbox */
  function extractGateFromGroup(g: import("./settings/types").SettingGroupDefinition): {
    enableGateItem?: ISettingItem;
    extractedItems?: ISettingItem[];
    extractedSubGroups?: { name: string; items: ISettingItem[] }[];
  } {
    const copyItem = (i: any) => ({ ...i });
    if (g.skipGating) {
      return {
        extractedItems: g.items?.map(copyItem),
        extractedSubGroups: g.subGroups?.map((sg) => ({
          name: sg.name,
          items: sg.items.map(copyItem),
        })),
      };
    }
    if (g.subGroups && g.subGroups.length > 0) {
      const firstSG = g.subGroups[0];
      if (firstSG.items.length > 0) {
        const [gateItem, ...restItems] = firstSG.items;
        let modifiedSGs = [
          { name: firstSG.name, items: restItems.map(copyItem) },
          ...g.subGroups.slice(1).map((sg) => ({
            name: sg.name,
            items: sg.items.map(copyItem),
          })),
        ];
        modifiedSGs = modifiedSGs.filter((sg) => sg.items.length > 0);
        return {
          enableGateItem: { ...copyItem(gateItem) },
          extractedSubGroups: modifiedSGs,
        };
      }
    }
    if (g.items && g.items.length > 0) {
      const [gateItem, ...restItems] = g.items;
      return {
        enableGateItem: { ...copyItem(gateItem) },
        extractedItems: restItems.map(copyItem),
      };
    }
    return {};
  }

  /********** Events **********/
  interface ChangeEvent {
    group: string;
    key: string;
    value: any;
  }

  const onChanged = ({ detail }: { detail: ChangeEvent }) => {
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
  function isrefresh(setting) {
    if (needsRefresh(setting)) myapi.refresh();
  }

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
    groups = built.map((g) => {
      const { enableGateItem, extractedItems, extractedSubGroups } =
        extractGateFromGroup(g);
      return {
        name: g.name,
        skipGating: (g as any).skipGating === true,
        enableGateItem,
        items: extractedItems,
        subGroups: extractedSubGroups,
        activeSubGroup: extractedSubGroups?.[0]?.name,
      };
    });
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
    const apply = (item: any) => {
      if (item.dynamicOptions)
        tasks.push(
          Promise.resolve(item.dynamicOptions(ctx))
            .then((opts: any) => {
              if (opts) item.options = opts;
            })
            .catch((e) => console.error("动态选项加载失败", item.key, e)),
        );
    };
    groups.forEach((g) => {
      g.items?.forEach(apply);
      g.subGroups?.forEach((sg) => sg.items.forEach(apply));
    });
    await Promise.all(tasks);
    groups = groups.map((g) => ({ ...g }));
  }

  function updateGroupItems() {
    groups = groups.map((g) => ({
      ...g,
      enableGateItem: g.enableGateItem
        ? {
            ...g.enableGateItem,
            value: settings[g.enableGateItem.key] ?? g.enableGateItem.value,
          }
        : undefined,
      items: g.items?.map((i) => ({ ...i, value: settings[i.key] ?? i.value })),
      subGroups: g.subGroups?.map((sg) => ({
        ...sg,
        items: sg.items.map((i) => ({
          ...i,
          value: settings[i.key] ?? i.value,
        })),
      })),
    }));
  }

  $: currentGroup = groups.find((g) => g.name === focusGroup);
  $: gateEnabled = currentGroup?.enableGateItem
    ? currentGroup.enableGateItem.value === true
    : true;
  $: activeSubGroupItems = currentGroup?.subGroups
    ? currentGroup.subGroups.find(
        (sg) => sg.name === currentGroup.activeSubGroup,
      )?.items || []
    : currentGroup?.items || [];
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
        {#if group.enableGateItem}
          <span class="sidebar-gate-checkbox">
            <FormInput
              type="checkbox"
              key={group.enableGateItem.key}
              bind:value={group.enableGateItem.value}
              fnSize={false}
              on:changed={(e) => {
                onChanged({
                  detail: {
                    group: group.name,
                    key: e.detail.key,
                    value: e.detail.value,
                  },
                });
              }}
            />
          </span>
        {/if}
      </li>
    {/each}
  </ul>
  <div class="config__tab-wrap">
    {#if currentGroup?.enableGateItem && !gateEnabled}
      <div class="gate-placeholder">
        <div class="gate-placeholder__icon">⚙️</div>
        <div class="gate-placeholder__title">
          {currentGroup.name} 模块未启用
        </div>
        <div class="gate-placeholder__desc">
          请在左侧边栏中开启「{currentGroup.enableGateItem.title}」开关
        </div>
      </div>
    {:else if currentGroup?.subGroups}
      <div class="config__tab-wrap">
        <div class="subgroup-buttons">
          {#each currentGroup.subGroups as subGroup (subGroup.name)}
            <button
              class="b3-button"
              class:b3-button--text={currentGroup.activeSubGroup !==
                subGroup.name}
              on:click={() => {
                currentGroup.activeSubGroup = subGroup.name;
                groups = groups.map((g) => g); // trigger update
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
    border-radius: 8px;
  }

  .config__panel > .b3-tab-bar {
    width: 180px;
    background: var(--b3-theme-surface);
    border-right: 1px solid var(--b3-border-color);
    padding: 2px 1px;
  }

  .config__tab-wrap {
    flex: 1;
    height: 100%;
    overflow: auto;
    padding: 0;
    background: var(--b3-theme-background);
  }

  .config__tab-container {
    flex: 1;
    height: calc(100% - 36px);
    overflow-y: auto;
    padding: 8px 12px;
  }

  .subgroup-buttons {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    padding: 6px 12px;
    border-bottom: 1px solid var(--b3-border-color);
    background: var(--b3-theme-surface);
  }

  .subgroup-buttons .b3-button {
    border-radius: 12px;
    padding: 4px 12px;
    font-size: 0.85em;
    font-weight: 500;
    transition: all 0.15s ease;
    border: 1px solid var(--b3-border-color);
  }

  .subgroup-buttons .b3-button:hover {
    background: var(--b3-list-hover);
  }

  .subgroup-buttons .b3-button--text {
    background: transparent;
    color: var(--b3-theme-primary);
    border-color: transparent;
  }

  .subgroup-buttons .b3-button--text:hover {
    background: var(--b3-list-hover);
    border-color: var(--b3-border-color);
  }

  .config__panel .b3-list-item {
    border-radius: 6px;
    margin: 1px 3px;
    padding: 6px 8px;
    transition: all 0.15s ease;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .config__panel .b3-list-item:hover {
    background: var(--b3-list-hover);
  }

  .config__panel .b3-list-item--focus {
    background: var(--b3-theme-primary);
    color: var(--b3-theme-on-primary);
    font-weight: 500;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  }

  .sidebar-gate-checkbox {
    margin-left: 6px;
    flex-shrink: 0;
    transform: scale(0.66);
    transform-origin: center right;
  }

  .gate-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 40px 20px;
    text-align: center;
    color: var(--b3-theme-on-surface-light);
    user-select: none;
  }

  .gate-placeholder__icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.4;
  }

  .gate-placeholder__title {
    font-size: 1.1em;
    font-weight: 600;
    margin-bottom: 8px;
    color: var(--b3-theme-on-surface);
  }

  .gate-placeholder__desc {
    font-size: 0.85em;
    opacity: 0.6;
    max-width: 280px;
    line-height: 1.5;
  }
</style>
