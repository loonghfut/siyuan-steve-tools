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

    // Add subGroups and activeSubGroup properties to the module's entry in the groups array.
    // Add an entry to the subGroupItemCounts object for the module, specifying the item counts for each of its sub-groups.

    let settings = getSettings();

    interface ISettingGroup {
        name: string;
        items: ISettingItem[];
        subGroups?: string[];
        activeSubGroup?: string;
    }

    // Define setting groups with their items
    let groups: ISettingGroup[] = [
        {
            name: "日程管理",
            subGroups: [
                "基础设置",
                "高级设置",
                "ics设置",
                "ics分享",
                "邮箱日历",
                "视图设置",
            ],
            activeSubGroup: "基础设置",
            items: [
                // 基础设置
                {
                    //1
                    type: "checkbox",
                    title: "启用日程管理",
                    description: "启用日程管理功能后再进行下面的设置",
                    key: "cal-enable",
                    value: settings["cal-enable"],
                },
                {
                    //2
                    type: "checkbox",
                    title: "全局日程视图",
                    description: "启用后再左上角加一个日历视图的入口",
                    key: "cal-show-view",
                    value: settings["cal-show-view"],
                },
                {
                    //3
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
                    //4
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
                                return {
                                    "": "无可用数据库请先导入日程周期模板",
                                };
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
                            console.error(
                                "Error processing database options:",
                                error,
                            );
                            return { "": "加载数据库出错" };
                        }
                    })(),
                },
                {
                    //12
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
                //高级设置
                {
                    //9
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
                    //10
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
                    type: "checkbox",
                    title: "完成项是否显示周期事件",
                    description: "启用后看板完成项会展示周期事件",
                    key: "cal-show-zq-done",
                    value: settings["cal-show-zq-done"],
                },
                {
                    type: "checkbox",
                    title: "是否悬浮显示视图",
                    description: "启用后会在页面上方显示悬浮视图",
                    key: "cal-show-float-view",
                    value: settings["cal-show-float-view"],
                },
                //同步设置
                {
                    //5
                    type: "textinput",
                    title: "日程文件名",
                    description: "建议越复杂越好，记得加上.ics后缀",
                    key: "cal-url",
                    value: settings["cal-url"],
                },
                {
                    //5
                    type: "number",
                    title: "(ics)事件范围前(单位：月)",
                    description: "以当前时间为基准，向前多少个月的事件",
                    key: "cal-ics-filter-old",
                    value: settings["cal-ics-filter-old"],
                },
                {
                    //5
                    type: "number",
                    title: "(ics)事件范围后(单位：月)",
                    description: "以当前时间为基准，向后多少个月的事件",
                    key: "cal-ics-filter-new",
                    value: settings["cal-ics-filter-new"],
                },
                {
                    //6
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
                    //7
                    type: "checkbox",
                    title: "自动更新ics文件",
                    description:
                        "启用后每10分钟更新一次(需保证前端运行)，且每次编辑日程数据后自动更新(插件出问题首先关闭此选项）",
                    key: "cal-auto-update",
                    value: settings["cal-auto-update"],
                },
                {
                    //8
                    type: "checkbox",
                    title: "手动更新ics文件",
                    description: "启用后在topbar右侧会出现更新ics文件的按钮",
                    key: "cal-hand-update",
                    value: settings["cal-hand-update"],
                },

                {
                    //13
                    type: "select",
                    title: "ics分享平台(docker端无需使用)(请悉知再使用)(beta)",
                    description:
                        "选择ics文件分享平台(重要！ics文件会被分享到其他平台上，可能会有隐私泄漏的风险，建议将S3的桶名称和ics文件名称复杂化，防止被他人猜到）",
                    key: "cal-share",
                    value: settings["ai-url-type"],
                    options: {
                        "": "无",
                        alist: "alist(需安装alist附件管理插件)",
                        s3: "s3(和思源s3同步用同一个桶,使用前请自行测试会不会影响到思源的s3同步)",
                        "s3-diy": "s3-diy(自定义桶)(推荐)",
                    },
                },
                {
                    //14
                    type: "textinput",
                    title: "S3_Bucket",
                    description: "选择s3-diy(自定义桶)时填写",
                    key: "cal-s3-bucket",
                    value: settings["cal-s3-bucket"],
                },
                {
                    //15
                    type: "textinput",
                    title: "S3_AccessKeyId",
                    description: "选择s3-diy(自定义桶)时填写",
                    key: "cal-s3-accessKeyId",
                    value: settings["cal-s3-accessKeyId"],
                },
                {
                    //16
                    type: "textinput",
                    title: "S3_SecretAccessKey",
                    description: "选择s3-diy(自定义桶)时填写",
                    key: "cal-s3-secretAccessKey",
                    value: settings["cal-s3-secretAccessKey"],
                },
                {
                    //8
                    type: "checkbox",
                    title: "启用QQ邮箱日历(beta)",
                    description: "启用后在日历中会出现QQ邮箱日历事件",
                    key: "cal-qq-enable",
                    value: settings["cal-qq-enable"],
                },
                {
                    //17
                    type: "textinput",
                    title: "QQ邮箱地址-beta",
                    description: "对接QQ邮箱时填写",
                    key: "cal-qq-email",
                    value: settings["cal-qq-email"],
                },
                {
                    //18
                    type: "textinput",
                    title: "QQ邮箱授权码-beta",
                    description: "对接QQ邮箱时填写",
                    key: "cal-qq-code",
                    value: settings["cal-qq-code"],
                },
                //选择QQ邮箱的日历id
                {
                    //19
                    type: "select",
                    title: "QQ日历选择-beta",
                    description: "选择要同步的QQ日历",
                    key: "cal-qq-calendar-url",
                    value: settings["cal-qq-calendar-url"],
                    options: { "": "请先配置QQ邮箱信息" }, // 设置初始静态值
                },
                {
                    type: "textinput",
                    title: "时间槽间隔",
                    description:
                        "时间网格视图中每个槽的持续时间，格式如: 00:30:00（30分钟）, 01:00:00（1小时）",
                    key: "cal-slot-duration",
                    value: settings["cal-slot-duration"],
                },
                {
                    type: "textinput",
                    title: "最早显示时间",
                    description:
                        "时间网格视图的开始时间，格式如: 06:00:00（早上6点）, 07:00:00（早上7点）",
                    key: "cal-slot-min-time",
                    value: settings["cal-slot-min-time"],
                },
                {
                    type: "textinput",
                    title: "最晚显示时间",
                    description:
                        "时间网格视图的结束时间，格式如: 21:00:00（晚上9点）, 22:00:00（晚上10点）",
                    key: "cal-slot-max-time",
                    value: settings["cal-slot-max-time"],
                },
                {
                    type: "textinput",
                    title: "拖拽时间间隔",
                    description:
                        "控制拖拽事件时的最小时间单位，较小的值可实现更精确的调整，格式如: 00:15:00（15分钟）, 00:30:00（30分钟）",
                    key: "cal-snap-duration",
                    value: settings["cal-snap-duration"],
                },
            ],
        },
        {
            name: "docker同步感知",
            items: [
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
            ],
        },
        {
            name: "ai侧边栏",
            items: [
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
                        custom: "自定义地址",
                    },
                },
                {
                    type: "textinput",
                    title: "自定义AI网页地址",
                    description: `当选择"自定义地址"时生效，请输入完整URL（以http(s)://开头）`,
                    key: "ai-url-custom",
                    value: settings["ai-url-custom"],
                    placeholder: "http(s)://",
                },
            ],
        },
        {
            name: "资源压缩 beta",
            items: [
                {
                    type: "checkbox",
                    title: "启用资源压缩功能",
                    description: "启用资源压缩功能后再进行下面的设置",
                    key: "img-compress-enable",
                    value: settings["img-compress-enable"],
                },
            ],
        },
        {
            name: "🛠️画板（未完成）",
            items: [
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
            ],
        },
        {
            name: "✨开发中。。",
            items: [
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
            ],
        },
    ];

    let focusGroup = groups[0].name;

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
        isrefresh(detail.key);
    };

    function isrefresh(setting) {
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
    }

    onMount(async () => {
        const headerEl = document.querySelector(".b3-dialog__header");
        if (headerEl) {
            const refreshBtn = document.createElement("button");
            refreshBtn.className = "b3-button b3-button--outline";
            refreshBtn.style.cssText = "float: right; margin-right: 8px;";
            refreshBtn.textContent = "保存";
            refreshBtn.onclick = () => myapi.refresh();
            headerEl.appendChild(refreshBtn);
        }
        console.log("plugin-load");
        await runload();
    });

    async function runload() {
        let data = await plugin.loadData(myfile);
        if (data) {
            settings = { ...settings, ...data };

            // Load QQ calendars asynchronously
            Promise.resolve().then(async () => {
                try {
                    if (moduleInstances["M_calendar"]?.QQCalDAVClient) {
                        const calendars =
                            await moduleInstances[
                                "M_calendar"
                            ].QQCalDAVClient.getCalendars();
                        if (Array.isArray(calendars) && calendars.length > 0) {
                            // 更新日历选项
                            const calendarItem = groups[0].items.find(
                                (item) => item.key === "cal-qq-calendar-url",
                            );
                            if (calendarItem) {
                                let calendarOptions = { "": "无" };
                                calendars.forEach((cal) => {
                                    calendarOptions[cal.url] =
                                        `${cal.displayName}${cal.description ? ` (${cal.description})` : ""}`;
                                });
                                calendarItem.options = calendarOptions;
                                updateGroupItems();
                            }
                        }
                    }
                } catch (error) {
                    console.error("Error loading QQ calendars:", error);
                }
            });
            updateGroupItems();
            await saveSettings();
        } else {
            await saveSettings();
            console.debug("初始化配置文件");
        }
    }

    function updateGroupItems() {
        groups = groups.map((group) => ({
            ...group,
            items: group.items.map((item) => ({
                ...item,
                value: settings[item.key] ?? item.value,
                options: item.options, // 确保 options 也被更新
            })),
        }));
    }

    $: currentGroup = groups.find((group) => group.name === focusGroup);

    const subGroupItemCounts = {
        日程管理: {
            基础设置: 5,
            高级设置: 5,
            ics设置: 6,
            ics分享: 4,
            邮箱日历: 4,
            视图设置: 4,
            // 不限制
        },
        // "docker同步感知": {
        //     "连接设置": 4,
        //     "高级设置": undefined,
        // },
        // Add other modules here as needed
    };
    $: activeSubGroupItems = currentGroup?.items.filter((_, index) => {
        if (!currentGroup?.subGroups) return true;

        const moduleName = currentGroup.name;
        const subGroupName = currentGroup.activeSubGroup;
        const subGroupIndex = currentGroup.subGroups.indexOf(
            currentGroup.activeSubGroup,
        );

        const itemCount = subGroupItemCounts[moduleName]?.[subGroupName];

        if (itemCount === undefined) {
            return true; // 不限制数量
        }

        let startIndex = 0;
        for (let i = 0; i < subGroupIndex; i++) {
            const prevSubGroupName = currentGroup.subGroups[i];
            startIndex +=
                subGroupItemCounts[moduleName]?.[prevSubGroupName] || 0;
        }

        const endIndex = startIndex + itemCount;
        return index >= startIndex && index < endIndex;
    });
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
                    {#each currentGroup.subGroups as subGroup}
                        <button
                            class="b3-button"
                            class:b3-button--text={currentGroup.activeSubGroup !==
                                subGroup}
                            on:click={() => {
                                currentGroup.activeSubGroup = subGroup;
                                groups = groups; // trigger update
                            }}
                        >
                            {subGroup}
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
