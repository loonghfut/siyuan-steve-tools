<script lang="ts">
    import { M_calendar } from "./calendar/module-calendar";
    import { showMessage } from "siyuan";
    import { onMount } from "svelte";
    import SettingPanel from "@/libs/components/setting-panel.svelte";
    import * as myapi from "@/api";
    export let plugin;
    export let myfile;
    export let setdialog;
    const defaultSettings = new Map([//TODO: 设置逻辑有问题，之后重构代码，分文件存储
        ["cal-enable", { value: false }],
        ["cal-url", { value: "calendar.ics" }],
        ["cal-get-url", { value: "Click Button" }],
        ["cal-reset", { value: "Click Button" }],
        ["cal-auto-update", { value: true }],
        ["cal-hand-update", { value: true }],
    ]);
    let settings = new Map([
        ["cal-enable", { value: false }],
        ["cal-url", { value: "calendar.ics" }],
        ["cal-get-url", { value: "Click Button" }],
        ["cal-reset", { value: "Click Button" }],
        ["cal-auto-update", { value: true }],
        ["cal-hand-update", { value: true }],
    ]);
    function resetToDefault() {
        settings = new Map(defaultSettings);
        console.log("resetToDefault", settings);
        saveSettings();
        setdialog.destroy();
    }
    let groups: string[] = ["日程分享", "✨开发中。。"];
    let focusGroup = groups[0];

    let group1Items: ISettingItem[] = [
        {
            type: "checkbox",
            title: "启用日程分享",
            description: "启用日程分享(刷新后生效)",
            key: "cal-enable",
            value: false,
        },
        {
            type: "textinput",
            title: "日程文件名",
            description: "建议越复杂越好，记得加上.ics后缀",
            key: "cal-url",
            value: "calendar.ics",
        },
        {
            type: "button",
            title: "获取订阅连接",
            description: "更改日程文件名后请重新获取日程订阅连接",
            key: "cal-get-url",
            value: "error",
            button: {
                label: "获取",
                callback: () => {
                    M_calendar.prototype.getCalUrl();
                },
            },
        },
        {
            type: "checkbox",
            title: "自动更新日程",
            description: "启用后每10分钟更新一次（需保证前端运行），且每次编辑日程数据后自动更新",
            key: "cal-auto-update",
            value: true,
        },
        {
            type: "checkbox",
            title: "手动更新",
            description: "启用后在topbar右侧会出现更新按钮",
            key: "cal-hand-update",
            value: true,
        },
        {
            type: "button",
            title: "恢复默认配置",
            description: "遇到问题先恢复默认配置",
            key: "cal-reset",
            value: "error",
            button: {
                label: "恢复",
                callback: () => {
                    resetToDefault();
                },
            },
        },
        {
            type: "button",
            title: "刷新",
            description: "若部分设置未生效请刷新思源笔记",
            key: "reset",
            value: "error",
            button: {
                label: "刷新",
                callback: () => {
                    myapi.refresh();
                },
            },
        },
        {
            type: "hint",
            title: "使用方法",
            description: `            
            <div class="fn__flex b3-label">
                <ol>
                    <li>添加一个数据库（前三列格式如图）</li>
                    <img
                        src="plugins/siyuan-steve-tools/asset/1734265371736.png"
                        alt="数据库格式示例"
                        style="max-height: 200px;"
                    />
                    <li>再给此数据库添加命名属性，内容为“日程” （如图）</li>
                    <img
                        src="plugins/siyuan-steve-tools/asset/1734265426843.png"
                        alt="命名属性示例"
                        style="max-height: 200px;"
                    />
                    <li>最后点击右上角的日历图标</li>
                    <li>即可生成日历文件，订阅链接在设置里获取</li>
                    <li>打开可以订阅ics文件的日历软件（如小米日历），输入订阅链接即可（要保证手机能网络连接到思源）</li>
                </ol>
            </div>`,
            key: "hint",
            value: "error",
        },
    ];

    let group2Items: ISettingItem[] = [
        {
            type: "button",
            title: "button",
            description: "This is a button",
            key: "e",
            value: "Click Button",
            button: {
                label: "Click Me",
                callback: () => {
                    showMessage("Hello, world!");
                },
            },
        },
    ];

    /********** Events **********/
    interface ChangeEvent {
        group: string;
        key: string;
        value: any;
    }

    const onChanged = ({ detail }: CustomEvent<ChangeEvent>) => {
        console.log(detail.key, detail.value);
        const setting = settings.get(detail.key);
        if (setting) {
            setting.value = detail.value;
            saveSettings();
        }
        console.log(detail.key, detail.value);
    };

    async function saveSettings() {
        let data = {};
        for (let [key, item] of settings) {
            data[key] = item.value;
        }
        await plugin.saveData(myfile, data);
        console.debug("Settings saved:", data);
    }

    onMount(async () => {
        console.log("plugin-load");
        await runload();
    });

    async function runload() {
        let data = await plugin.loadData(myfile);
        console.debug("Load config:", data);
        if (data) {
            for (let [key, item] of settings) {
                item.value = data?.[key] ?? item.value;
            }
            group1Items = group1Items.map((item) => ({
                ...item,
                value: settings.get(item.key)?.value || item.value,
            }));
            group2Items = group2Items.map((item) => ({
                ...item,
                value: settings.get(item.key)?.value || item.value,
            }));
        } else {
            saveSettings();
            console.debug("初始化配置文件");
        }
        return data;
    }
</script>

<div class="fn__flex-1 fn__flex config__panel">
    <ul class="b3-tab-bar b3-list b3-list--background">
        {#each groups as group}
            <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
            <li
                data-name="editor"
                class:b3-list-item--focus={group === focusGroup}
                class="b3-list-item"
                on:click={() => {
                    focusGroup = group;
                }}
                on:keydown={() => {}}
            >
                <span class="b3-list-item__text">{group}</span>
            </li>
        {/each}
    </ul>
    <div class="config__tab-wrap">
        <SettingPanel
            group={groups[0]}
            settingItems={group1Items}
            display={focusGroup === groups[0]}
            on:changed={onChanged}
            on:click={({ detail }) => {
                console.debug("Click:", detail.key);
            }}
        >
            <!-- <div class="fn__flex b3-label">

            </div> -->
        </SettingPanel>
        <SettingPanel
            group={groups[1]}
            settingItems={group2Items}
            display={focusGroup === groups[1]}
            on:changed={onChanged}
            on:click={({ detail }) => {
                console.debug("Click:", detail.key);
            }}
        ></SettingPanel>
    </div>
</div>

<style lang="scss">
    .config__panel {
        height: 100%;
    }
    .config__panel > ul > li {
        padding-left: 1rem;
    }

    .config__panel {
        // width: 600px; /* 固定宽度 */
        height: 70vh; /* 固定高度 */
        overflow: auto; /* 如果内容超出，显示滚动条 */
    }
</style>
