<script lang="ts">
    import { moduleInstances } from "./index";
    import { showMessage } from "siyuan";
    import { onMount } from "svelte";
    import SettingPanel from "@/libs/components/setting-panel.svelte";
    import * as myapi from "@/api";
    import { getSettings } from "./calsettings";

    export let plugin;
    export let myfile;
    export let setdialog;

    let settings = getSettings();
    // function resetToDefault() {
    //     settings = resetSettings();
    //     console.log("resetToDefault", settings);
    //     saveSettings();
    //     setdialog.destroy();
    // }

    let groups: string[] = [
        "日程管理 2.1",
        "docker同步感知",
        "ai侧边栏",
        "图片压缩 beta",
        "🛠️画板（未完成）",
        "✨开发中。。",
    ];
    let focusGroup = groups[0];

    let group1Items: ISettingItem[] = [
        {
            type: "checkbox",
            title: "启用日程管理",
            description: "启用日程管理功能后再进行下面的设置",
            key: "cal-enable",
            value: settings["cal-enable"],
        },
        {
            type: "textinput",
            title: "日程文件名",
            description: "建议越复杂越好，记得加上.ics后缀",
            key: "cal-url",
            value: settings["cal-url"],
        },
        {
            type: "button",
            title: "获取订阅链接",
            description: "更改日程文件名后请重新获取日程订阅链接",
            key: "cal-get-url",
            value: settings["cal-get-url"],
            button: {
                label: "获取",
                callback: () => {
                    try {
                        moduleInstances["M_calendar"].getCalUrl();
                    } catch (error) {
                        showMessage(
                            `获取失败: ${error.message}，请先启用日程管理功能`,
                        );
                    }
                },
            },
        },
        {
            type: "checkbox",
            title: "自动更新ics文件",
            description:
                "启用后每10分钟更新一次(需保证前端运行)，且每次编辑日程数据后自动更新(插件出问题首先关闭此选项）",
            key: "cal-auto-update",
            value: settings["cal-auto-update"],
        },
        {
            type: "checkbox",
            title: "手动更新ics文件",
            description: "启用后在topbar右侧会出现更新ics文件的按钮",
            key: "cal-hand-update",
            value: settings["cal-hand-update"],
        },
        {
            type: "checkbox",
            title: "全局日程视图",
            description: "启用后再左上角加一个日历视图的入口",
            key: "cal-show-view",
            value: settings["cal-show-view"],
        },
        {
            type: "select",
            title: "基本交互方式",
            description: "在日历视图中的基本交互方式",
            key: "cal-create-way",
            value: settings["cal-create-way"],
            options: {
                "0": "双击交互",
                "1": "单击交互",
            },
        },
        {
            type: "select",
            title: "日程创建位置",
            description: "选择日记本",
            key: "cal-create-pos",
            value: settings["cal-create-pos"],
            options: Object.fromEntries(
                window.siyuan.notebooks.map((notebook) => [
                    notebook.id,
                    notebook.name,
                ]),
            ),
        },
        {
            type: "select",
            title: "日程数据库选择",
            description: "选择默认添加事件的数据库",
            key: "cal-db-id",
            value: settings["cal-db-id"],
            options: (() => {
                try {
                    if (
                        !moduleInstances["M_calendar"] ||
                        !moduleInstances["M_calendar"].av_ids
                    ) {
                        console.warn(
                            "Calendar module or av_ids not initialized",
                        );
                        return { "": "无可用数据库" };
                    }
                    const ids = moduleInstances["M_calendar"].av_ids;
                    if (!Array.isArray(ids) || ids.length === 0) {
                        return { "": "无可用数据库请先导入日程周期模板" };
                    }
                    return Object.fromEntries(
                        ids
                            .map((database) => {
                                if (!database?.id || !database?.name) {
                                    console.warn(
                                        "Invalid database entry:",
                                        database,
                                    );
                                    return ["", "无效数据库"];
                                }
                                return [database.id, database.name];
                            })
                            .filter((entry) => entry[0] !== ""),
                    );
                } catch (error) {
                    console.error("Error processing database options:", error);
                    return { "": "加载数据库出错" };
                }
            })(),
        },
        {
            type: "checkbox",
            title: "事件交互方式",
            description:
                "启用后和事件交互会自动跳转到块属性页面，启用前则跳转到目标块",
            key: "cal-seemore",
            value: settings["cal-seemore"],
        },
        {
            type: "checkbox",
            title: "是否展示被关联子的事件",
            description:
                "启用后看板会展示被关联子的事件（建议开启）（若关闭，请不要手动操作关联列）",
            key: "cal-show-ref-event",
            value: settings["cal-show-ref-event"],
        },
        {
            type: "button",
            title: "日程周期模板",
            description: "生成日程周期模板（注意：会创建一个笔记本）",
            key: "cal-rule",
            value: settings["cal-rule"],
            button: {
                label: "生成",
                callback: () => {
                    try {
                        moduleInstances["M_calendar"].importMoBan();
                    } catch (error) {
                        showMessage(
                            `导入模板失败: ${error.message}，请先启用日程管理功能`,
                        );
                    }
                },
            },
        },
        {
            type: "select",
            title: "ics分享平台",
            description: "选择ics文件分享平台",
            key: "cal-share",
            value: settings["ai-url-type"],
            options: {
                "": "无",
                "alist": "alist(需安装alist附件管理插件)",
                "s3": "s3(同步桶)",
                "s3-diy": "s3-diy(自定义桶)",
            },
        },
        {
            type: "textinput",
            title: "S3_Bucket",
            description: "选择s3-diy(自定义桶)时填写",
            key: "cal-s3-bucket",
            value: settings["cal-s3-bucket"],
        },
        {
            type: "textinput",
            title: "S3_AccessKeyId",
            description: "选择s3-diy(自定义桶)时填写",
            key: "cal-s3-accessKeyId",
            value: settings["cal-s3-accessKeyId"],
        },
        {
            type: "textinput",
            title: "S3_SecretAccessKey",
            description: "选择s3-diy(自定义桶)时填写",
            key: "cal-s3-secretAccessKey",
            value: settings["cal-s3-secretAccessKey"],
        },
    ];

    let group2Items: ISettingItem[] = [
        {
            type: "checkbox",
            title: "启用docker同步感知",
            description: "启用docker同步感知后再进行下面的设置",
            key: "sync-enable",
            value: settings["sync-enable"],
        },
        {
            type: "textinput",
            title: "docker思源服务地址",
            description:
                "docker思源服务地址，如http://localhost:6806（后面不要加/）",
            key: "sync-url",
            value: settings["sync-url"],
        },
        {
            type: "textinput",
            title: "docker思源服务token",
            description: "docker思源服务token",
            key: "sync-token",
            value: settings["sync-token"],
        },
        {
            type: "button",
            title: "测试连接",
            description: "测试docker思源服务连接",
            key: "sync-test",
            value: settings["sync-test"],
            button: {
                label: "测试",
                callback: () => {
                    moduleInstances["M_sync"].testSync();
                },
            },
        },
        // {
        //     type: "button",
        //     title: "刷新",
        //     description: "若部分设置未生效请刷新思源笔记",
        //     key: "reset",
        //     value: "error",
        //     button: {
        //         label: "刷新",
        //         callback: () => {
        //             myapi.refresh();
        //         },
        //     },
        // },
    ];

    let group3Items: ISettingItem[] = [
        {
            type: "checkbox",
            title: "启用ai网页侧边栏",
            description: "启用ai网页侧边栏后再进行下面的设置",
            key: "ai-enable",
            value: settings["ai-enable"],
        },
        {
            type: "select",
            title: "ai网页地址",
            description: "选择ai网页地址",
            key: "ai-url",
            value: settings["ai-url-type"],
            options: {
                "https://www.doubao.com/chat/": "豆包AI",
                "https://kimi.moonshot.cn/": "kimi",
                "https://metaso.cn/": "密塔",
                "https://chat.deepseek.com/": "deepseek",
                "https://chatgpt.com/": "chatgpt",
            },
        },
        // {
        //     type: "button",
        //     title: "刷新",
        //     description: "若部分设置未生效请刷新思源笔记",
        //     key: "reset",
        //     value: "error",
        //     button: {
        //         label: "刷新",
        //         callback: () => {
        //             myapi.refresh();
        //         },
        //     },
        // },
    ];

    let group4Items: ISettingItem[] = [
        {
            type: "checkbox",
            title: "启用图片压缩功能",
            description: "启用图片压缩功能后再进行下面的设置",
            key: "img-compress-enable",
            value: settings["img-compress-enable"],
        },
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

    let group5Items: ISettingItem[] = [
        {
            type: "checkbox",
            title: "启用手写功能",
            description: "启用后可以在编辑器中使用手写功能",
            key: "handwriting-enable",
            value: settings["handwriting-enable"],
        },
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

    let group6Items: ISettingItem[] = [
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
        const setting = settings[detail.key];
        if (setting !== undefined) {
            settings[detail.key] = detail.value;
            saveSettings();
        }
        // console.log(detail.key, detail.value);
        //在启用功能时，增加自动刷新思源功能
        isrefresh(detail.key);
    };

    function isrefresh(setting) {
        // console.log("isrefresh", setting);
        if (
            setting === "cal-enable" ||
            setting === "sync-enable" ||
            setting === "ai-enable" ||
            setting === "handwriting-enable" ||
            setting === "img-compress-enable"
        ) {
            myapi.refresh();
        }
    }

    async function saveSettings() {
        await plugin.saveData(myfile, settings);
        console.debug("Settings saved:", settings);
    }
    onMount(async () => {
        const headerEl = document.querySelector(".b3-dialog__header");
        if (headerEl) {
            // 创建刷新按钮
            const refreshBtn = document.createElement("button");
            refreshBtn.className = "b3-button b3-button--outline";
            refreshBtn.style.cssText = "float: right; margin-right: 8px;";
            refreshBtn.textContent = "保存";
            refreshBtn.onclick = () => myapi.refresh();

            // 添加按钮到header
            headerEl.appendChild(refreshBtn);
        }
        console.log("plugin-load");
        await runload();
        // console.log("MMMMMMMMMMMM",moduleInstances['M_calendar'].av_ids);
    });

    async function runload() {
        let data = await plugin.loadData(myfile);
        console.debug("Load config:", data);
        if (data) {
            settings = { ...settings, ...data };
            updateGroupItems();
            await saveSettings();
        } else {
            await saveSettings();
            console.debug("初始化配置文件");
        }
    }

    function updateGroupItems() {
        //更新配置文件
        group1Items = group1Items.map((item) => ({
            ...item,
            value: settings[item.key] ?? item.value,
        }));
        group2Items = group2Items.map((item) => ({
            ...item,
            value: settings[item.key] ?? item.value,
        }));
        group3Items = group3Items.map((item) => ({
            ...item,
            value: settings[item.key] ?? item.value,
        }));
        group4Items = group4Items.map((item) => ({
            ...item,
            value: settings[item.key] ?? item.value,
        }));
        group5Items = group5Items.map((item) => ({
            ...item,
            value: settings[item.key] ?? item.value,
        }));
        group6Items = group6Items.map((item) => ({
            ...item,
            value: settings[item.key] ?? item.value,
        }));
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
        <SettingPanel
            group={groups[2]}
            settingItems={group3Items}
            display={focusGroup === groups[2]}
            on:changed={onChanged}
            on:click={({ detail }) => {
                console.debug("Click:", detail.key);
            }}
        ></SettingPanel>
        <SettingPanel
            group={groups[3]}
            settingItems={group4Items}
            display={focusGroup === groups[3]}
            on:changed={onChanged}
            on:click={({ detail }) => {
                console.debug("Click:", detail.key);
            }}
        ></SettingPanel>
        <SettingPanel
            group={groups[4]}
            settingItems={group5Items}
            display={focusGroup === groups[4]}
            on:changed={onChanged}
            on:click={({ detail }) => {
                console.debug("Click:", detail.key);
            }}
        ></SettingPanel>
        <SettingPanel
            group={groups[5]}
            settingItems={group6Items}
            display={focusGroup === groups[5]}
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
