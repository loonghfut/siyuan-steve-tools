<script lang="ts">
    import { frontEnd, moduleInstances } from "./index";
    import { showMessage } from "siyuan";
    import { onMount } from "svelte";
    import SettingPanel from "@/libs/components/setting-panel.svelte";
    import * as myapi from "@/api/api";
    import { getSettings } from "./setting_data";
    import { DidaService } from "./calendar/module-calendar";
    import { convertProjectsToRecord } from "./calendar/dida/dida_interface";

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
                "qq邮箱日历",
                "订阅日历",
                "视图设置",
                "滴答清单",
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
                                    moduleInstances["M_calendar"],
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
                {
                    //5
                    type: "number",
                    title: "默认持续时间(单位：小时)",
                    description: "默认事件持续时间",
                    key: "cal-time",
                    value: settings["cal-time"],
                },
                {
                    //2
                    type: "checkbox",
                    title: "是否按事件时间创建日记",
                    description:
                        "启用后会按事件时间的日记创建日程，而不在当天的日记中创建",
                    key: "cal-create-for-date",
                    value: settings["cal-create-for-date"],
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
                    //10
                    type: "checkbox",
                    title: "启用右键事件交互方式",
                    description: "启用后会互补左键交互方式",
                    key: "cal-show-right-click",
                    value: settings["cal-show-right-click"],
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
                {
                    type: "checkbox",
                    title: "是否自动更新状态(打开视图时生效）",
                    description:
                        "启用后会根据块内子事件完成情况自动更新事件状态",
                    key: "cal-auto-update-status",
                    value: settings["cal-auto-update-status"],
                },
                {
                    type: "checkbox",
                    title: "日历视图拖拽归档",
                    description: "启用后在日历视图中拖拽事件到视图上方即可归档",
                    key: "cal-drag-change",
                    value: settings["cal-drag-change"],
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
                    description: "启用后每次修改日程触发自动更新ics文件",
                    key: "cal-auto-update",
                    value: settings["cal-auto-update"],
                },
                {
                    //7
                    type: "checkbox",
                    title: "同步更新ics文件",
                    description: "启用后每次同步完后触发自动更新ics文件",
                    key: "cal-auto-syncing-update",
                    value: settings["cal-auto-syncing-update"],
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
                        webdav: "WebDAV(通用协议)",
                    },
                },
                {
                    //14
                    type: "textinput",
                    title: "触发上传ics文件的思源平台",
                    description: `当前平台：${frontEnd} （不填则全平台触发）`,
                    key: "SelectTOPics",
                    value: settings["SelectTOPics"],
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
                    type: "textinput",
                    title: "WebDAV服务器地址",
                    description:
                        "选择WebDAV时填写，如 https://example.com/dav/",
                    key: "cal-webdav-url",
                    value: settings["cal-webdav-url"],
                },
                {
                    type: "textinput",
                    title: "WebDAV用户名",
                    description: "WebDAV服务的用户名",
                    key: "cal-webdav-username",
                    value: settings["cal-webdav-username"],
                },
                {
                    type: "textinput",
                    title: "WebDAV密码",
                    description: "WebDAV服务的密码",
                    key: "cal-webdav-password",
                    value: settings["cal-webdav-password"],
                },
                {
                    type: "textinput",
                    title: "WebDAV远程路径",
                    description:
                        "ICS文件在WebDAV服务器上的保存路径，如 /calendars/",
                    key: "cal-webdav-path",
                    value: settings["cal-webdav-path"],
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
                    type: "checkbox",
                    title: "启用ics订阅",
                    description: "启用后可以订阅其他软件的ics文件",
                    key: "cal-ics-enable-subscribe",
                    value: settings["cal-ics-enable-subscribe"],
                },
                {
                    type: "textinput",
                    title: "ics订阅地址",
                    description: "填写ics订阅地址(请以http(s)://开头)",
                    key: "cal-ics-subscribe-url",
                    value: settings["cal-ics-subscribe-url"],
                },
                {
                    type: "checkbox",
                    title: "启用ics订阅导入",
                    description: "启用后可以将ics订阅的日程导入到思源笔记中",
                    key: "cal-ics-subscribe-import",
                    value: settings["cal-ics-subscribe-import"],
                },
                {
                    type: "select",
                    title: "ics订阅导入的日记本",
                    description: "选择ics订阅导入的日记本",
                    key: "cal-ics-subscribe-import-note-id",
                    value: settings["cal-ics-subscribe-import-note-id"],
                    options: Object.fromEntries(
                        window.siyuan.notebooks.map((notebook) => [
                            notebook.id,
                            notebook.name,
                        ]),
                    ),
                },
                {
                    type: "select",
                    title: "ics订阅导入模式",
                    description: "选择ics订阅导入模式",
                    key: "cal-ics-import-mode",
                    value: settings["cal-ics-import-mode"],
                    options: {
                        "single-document": "导入到当日日记本",
                        "daily-notes": "根据事件日期导入",
                    },
                },
                {
                    type: "checkbox",
                    title: "添加到数据库",
                    description:
                        "启用后，ICS导入的日程块会自动添加到指定的数据库中",
                    key: "cal-ics-add-to-database",
                    value: settings["cal-ics-add-to-database"],
                },
                {
                    type: "select",
                    title: "ICS导入数据库",
                    description: "选择ICS导入时要添加到的数据库",
                    key: "cal-ics-database-id",
                    value: settings["cal-ics-database-id"],
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
                                "Error processing ICS database options:",
                                error,
                            );
                            return { "": "加载数据库出错" };
                        }
                    })(),
                },
                {
                    type: "textarea",
                    title: "ICS导入模板",
                    description: `自定义ICS导入块的内容格式。支持的占位符：
{{title}} - 事件标题
{{startTime}} - 开始时间  
{{endTime}} - 结束时间
{{location}} - 地点
{{description}} - 描述
{{status}} - 状态
{{recurrence}} - 重复规则
{{tags}} - 标签
`,
                    key: "cal-ics-custom-template",
                    direction: "row",
                    value: settings["cal-ics-custom-template"],
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
                {
                    title: "日历周起始日",
                    description: "选择日历显示时以周几作为一周的第一天",
                    type: "select",
                    key: "cal-week-start",
                    value: settings["cal-week-start"],
                    options: {
                        monday: "周一",
                        sunday: "周日",
                    },
                },
                {
                    type: "checkbox",
                    title: "事件颜色样式切换",
                    description: "启用后事件颜色样式切换",
                    key: "cal-event-color",
                    value: settings["cal-event-color"],
                },
                {
                    type: "select",
                    title: "默认日历视图模式",
                    description: "选择日历默认打开的视图模式",
                    key: "cal-default-view",
                    value: settings["cal-default-view"],
                    options: {
                        multiMonthYear: "MultiMonthYear",
                        dayGridMonth: "DayGridMonth",
                        timeGridWeek: "TimeGridWeek",
                        timeGridThreeDays: "TimeGridThreeDays",
                        timeGridDay: "TimeGridDay",
                    },
                },
                {
                    type: "select",
                    title: "默认看板视图模式",
                    description: "选择看板默认打开的视图模式",
                    key: "kanban-default-view",
                    value: settings["kanban-default-view"],
                    options: {
                        weekkanban: "WeekKanban",
                        kanban: "Kanban",
                        yearkanban: "YearKanban",
                    },
                },
                {
                    type: "checkbox",
                    title: "启用滴答清单同步",
                    description: "启用后可以同步滴答清单的任务",
                    key: "cal-dida-enable",
                    value: settings["cal-dida-enable"],
                },
                {
                    type: "textinput",
                    title: "滴答清单token",
                    description: `滴答清单的API token。<a href="https://dida365.com/webapp/#q/all/tasks?modalType=settings" target="_blank">获取</a>API口令 `,
                    key: "cal-dida-token",
                    value: settings["cal-dida-token"],
                },
                {
                    type: "select",
                    title: "设置要同步的清单",
                    description: "选择滴答清单的清单",
                    key: "cal-dida-unfinished-list",
                    value: { "": "加载中" },
                },
                // {
                //     type: "select",
                //     title: "设置已完成清单",
                //     description: "选择滴答清单的已完成清单id",
                //     key: "cal-dida-finished-list",
                //     value: { "": "加载中" },
                // },
                {
                    type: "textinput",
                    title: "滴答清单同步数据库id",
                    description: "滴答清单同步的数据库id",
                    key: "cal-dida-db-id",
                    value: settings["cal-dida-db-id"],
                },
                {
                    type: "select",
                    title: "滴答清单同步模式",
                    description: "选择滴答清单同步的模式",
                    key: "cal-dida-sync-mode",
                    value: settings["cal-dida-sync-mode"],
                    options: {
                        auto: "自动同步",
                        manual: "手动同步",
                        all: "自动+手动同步",
                    },
                },
                {
                    type: "number",
                    title: "自动同步间隔",
                    description: "滴答清单自动同步的时间间隔(单位：分钟)",
                    key: "cal-dida-sync-interval",
                    value: settings["cal-dida-sync-interval"],
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
            name: "资源压缩",
            items: [
                {
                    type: "checkbox",
                    title: "启用资源压缩功能",
                    description: "启用资源压缩功能后再进行下面的设置",
                    key: "img-compress-enable",
                    value: settings["img-compress-enable"],
                },
                {
                    type: "hint",
                    title: "提示",
                    description:
                        "图片压缩效果还行，视频压缩效果较差（浏览器环境限制较大，经常压缩视频建议用专业软件）",
                    key: "img-compress-hint",
                    value: "",
                },
            ],
        },
        {
            name: "画板",
            subGroups: ["基本设置", "备份管理", "引用管理"], // 添加子组
            activeSubGroup: "基本设置",
            items: [
                {
                    type: "checkbox",
                    title: "启用画板功能",
                    description: "启用后可以在编辑器中使用画板功能",
                    key: "handwriting-enable",
                    value: settings["handwriting-enable"],
                },
                {
                    //3
                    type: "select",
                    title: "画板数据块备用创建位置",
                    description: "选择日记本，备用创建位置",
                    key: "tl-draw-create-note-id",
                    value: settings["tl-draw-create-note-id"],
                    options: Object.fromEntries(
                        window.siyuan.notebooks.map((notebook) => [
                            notebook.id,
                            notebook.name,
                        ]),
                    ),
                },
                {
                    type: "checkbox",
                    title: "启用画板网格背景",
                    description: "启用后画板默认会有网格背景",
                    key: "isGridMode",
                    value: settings["isGridMode"],
                },
                {
                    type: "checkbox",
                    title: "复制链接标题",
                    description: "启用后复制链接时会包含标题",
                    key: "copyLinkTitle",
                    value: settings["copyLinkTitle"],
                },
                {
                    type: "checkbox",
                    title: "同步删除(不建议启用)",
                    description:
                        "启用后在画板删除块时会同步删除笔记中的块（无法撤回）",
                    key: "SyncDelete",
                    value: settings["SyncDelete"],
                },
                {
                    type: "custom", // 自定义组件类型
                    title: "画板备份管理",
                    description: "管理所有画板的备份文件",
                    key: "tldraw-backup-manager",
                    component: "TldrawBackupManager", // 指定组件名称
                    value: "", // 不需要值
                },
                {
                    type: "custom", // 自定义组件类型
                    title: "画板引用管理",
                    description: "管理未引用的画板,点击标题切换模式",
                    key: "tldraw-reference-manager",
                    component: "TldrawReferenceManager", // 指定组件名称
                    value: "", // 不需要值
                },
            ],
        },
        {
            name: "LifeLog",
            items: [
                {
                    type: "checkbox",
                    title: "启用 LifeLog",
                    description: "启用后可以记录日记中的时间记录",
                    key: "lifelog-enable",
                    value: settings["lifelog-enable"],
                },
                {
                    type: "checkbox",
                    title: "启用调试日志",
                    description: "启用后会在控制台输出详细的调试信息",
                    key: "lifelog-debug",
                    value: settings["lifelog-debug"],
                },
                {
                    type: "hint",
                    title: "感谢",
                    description: "此功能由 BoysFight PR贡献",
                    key: "lifelog-hint",
                    value: "",
                },
            ],
        },
        {
            name: "通用设置",
            items: [
                {
                    type: "checkbox",
                    title: "允许匿名统计",
                    description:
                        "是否允许插件匿名统计使用情况，仅仅为了统计插件的使用人数，以决策之后的开发方向（只发起了一个get请求[细节见插件源码]，不会发送任何隐私数据）",
                    key: "PluginUsageStatistics",
                    value: settings["PluginUsageStatistics"], // 默认为true
                },
                {
                    type: "slider",
                    title: "数据库操作延迟时间(建议调为500)",
                    description:
                        "数据库批量处理的延迟时间，单位：毫秒。较小的值会处理得更快速但更容易出错",
                    key: "transaction-delay",
                    value: settings["transaction-delay"],
                    slider: {
                        min: 200,
                        max: 5000,
                        step: 100,
                    },
                },
                {
                    type: "button",
                    title: "今日本插件使用情况",
                    description: "查看本插件的使用情况",
                    key: "e",
                    value: "查看",
                    button: {
                        label: "查看",
                        callback: async () => {
                            if (!settings["PluginUsageStatistics"]) {
                                showMessage(
                                    "请先允许匿名统计才能查看此插件的使用情况",
                                );
                                return;
                            }
                            const data = await myapi.getFromApi2("/admin");
                            // console.log(data);
                            showMessage(`人数：${data.data}`);
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
        // 更新 LifeLog 模块的设置
        if (moduleInstances["M_lifelog"]) {
            moduleInstances["M_lifelog"].updateSettings(settings);
        }
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
            // Load Dida lists asynchronously
            Promise.resolve().then(async () => {
                try {
                    const projects = await DidaService.getAllProjects();
                    const projectRecords = convertProjectsToRecord(projects);

                    if (projectRecords) {
                        // Update unfinished list options
                        const unfinishedListItem = groups[0].items.find(
                            (item) => item.key === "cal-dida-unfinished-list",
                        );
                        if (unfinishedListItem) {
                            unfinishedListItem.options = projectRecords;
                        }

                        // Update finished list options
                        const finishedListItem = groups[0].items.find(
                            (item) => item.key === "cal-dida-finished-list",
                        );
                        if (finishedListItem) {
                            finishedListItem.options = projectRecords;
                        }

                        updateGroupItems();
                    } else {
                        console.warn("No Dida projects found.");
                    }
                } catch (error) {
                    console.error("Error loading Dida lists:", error);
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
            基础设置: 7,
            高级设置: 8,
            ics设置: 7,
            ics分享: 9,
            qq邮箱日历: 4,
            订阅日历: 8,
            视图设置: 8,
            滴答清单: 6,
            // 不限制
        },
        画板: {
            基本设置: 5, // 复选框和选择框
            备份管理: 1, // 备份管理组件
            引用管理: 1, // 引用管理组件
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
