import { convertProjectsToRecord } from "@/calendar/dida/dida_interface";
import { DidaService } from "@/calendar/module-calendar";
import type { SettingGroupDefinition, BuildContext } from "./types";

// 日程管理模块默认配置
export const calendarDefaults: Record<string, any> = {
    "cal-enable": false,
    "cal-url": "calendar.ics",
    "cal-get-url": "Click Button",
    "cal-auto-update": true,
    "cal-auto-syncing-update": false,
    "cal-hand-update": true,
    "cal-show-view": true,
    "cal-create-pos": null,
    "cal-db-id": null,
    "cal-create-way": "0",
    "cal-seemore": false,
    "cal-show-ref-event": true,
    "cal-show-float-view": false,
    "cal-auto-update-status": false,
    "cal-auto-create-fields": true,
    "cal-week-start": "monday",
    "cal-show-right-click": false,
    "cal-drag-change": false,
    "cal-time": 1,
    "cal-create-for-date": true,
    // ics 订阅
    "cal-ics-enable-subscribe": false,
    "cal-ics-subscribe-url": "",
    "cal-ics-subscribe-import": false,
    "cal-ics-subscribe-import-path": "",
    "cal-ics-subscribe-import-note-id": null,
    "cal-ics-import-mode": "single-document",
    "cal-ics-add-to-database": false,
    "cal-ics-database-id": null,
    "cal-ics-custom-template": `### {{title}}

开始时间： {{startTime}}
结束时间： {{endTime}}
地点： {{location}}
状态： {{status}}
标签： {{tags}}
描述：{{description}}
重复规则： {{recurrence}}`,
    // qq 邮箱
    "cal-qq-code": "",
    "cal-qq-email": "",
    "cal-share": "",
    "cal-qq-calendar-url": "",
    "cal-qq-enable": false,
    // 滴答清单
    "cal-dida-enable": false,
    "cal-dida-token": "",
    "cal-dida-unfinished-list": "",
    "cal-dida-finished-list": "",
    "cal-dida-db-id": "",
    "cal-dida-sync-mode": "auto",
    "cal-dida-sync-interval": 5,
    // 分享 / 云
    "cal-s3-bucket": "",
    "cal-s3-accessKeyId": "",
    "cal-s3-secretAccessKey": "",
    "cal-webdav-url": "",
    "cal-webdav-username": "",
    "cal-webdav-password": "",
    "cal-webdav-path": "",
    // 其它
    "cal-show-zq-done": false,
    "cal-ics-filter-old": 1,
    "cal-ics-filter-new": 1,
    // 视图
    "cal-slot-duration": "01:00:00",
    "cal-slot-min-time": "00:00:00",
    "cal-slot-max-time": "24:00:00",
    "cal-snap-duration": "00:30:00",
    "cal-event-color": true,
    "kanban-default-view": "kanban",
    "cal-default-view": "dayGridMonth",
    // 四象限
    "cal-quadrant-urgent-days": 2,
    // 触发平台
    "SelectTOPics": "",
};

function notebookOptions() {
    const nb = (window as any).siyuan?.notebooks;
    if (!Array.isArray(nb) || nb.length === 0) return { "": "无可用日记本" };
    return Object.fromEntries(nb.map((n: any) => [n.id, n.name]));
}

function calendarDbOptions(ctx: BuildContext) {
    try {
        const ids = ctx.moduleInstances["M_calendar"]?.av_ids;
        if (!Array.isArray(ids) || ids.length === 0) {
            return { "": "无可用数据库请先导入日程周期模板" };
        }
        return Object.fromEntries(ids.filter((d: any) => d?.id && d?.name).map((d: any) => [d.id, d.name]));
    } catch {
        return { "": "加载数据库出错" };
    }
}

export const calendarGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "日程管理",
    subGroups: [
        {
            name: "基础设置",
            items: [
                { type: "checkbox", title: "启用日程管理", description: "启用日程管理功能后再进行下面的设置", key: "cal-enable", value: ctx.settings["cal-enable"] },
                { type: "checkbox", title: "全局日程视图", description: "启用后再左上角加一个日历视图的入口", key: "cal-show-view", value: ctx.settings["cal-show-view"] },
                { type: "select", title: "日程创建位置", description: "选择日记本", key: "cal-create-pos", value: ctx.settings["cal-create-pos"], options: notebookOptions() },
                { type: "select", title: "日程数据库选择", description: "选择默认添加事件的数据库", key: "cal-db-id", value: ctx.settings["cal-db-id"], dynamicOptions: calendarDbOptions },
                { type: "number", title: "默认持续时间(单位：小时)", description: "默认事件持续时间", key: "cal-time", value: ctx.settings["cal-time"] },
                { type: "checkbox", title: "是否按事件时间创建日记", description: "启用后会按事件时间的日记创建日程", key: "cal-create-for-date", value: ctx.settings["cal-create-for-date"] },
            ]
        },
        {
            name: "高级设置",
            items: [
                { type: "select", title: "基本交互方式", description: "在日历视图中的基本交互方式", key: "cal-create-way", value: ctx.settings["cal-create-way"], options: { "0": "双击交互", "1": "单击交互" } },
                { type: "checkbox", title: "事件交互方式", description: "启用后和事件交互会自动跳转到块属性页面，启用前则跳转到目标块", key: "cal-seemore", value: ctx.settings["cal-seemore"] },
                { type: "checkbox", title: "启用右键事件交互方式", description: "启用后会互补左键交互方式", key: "cal-show-right-click", value: ctx.settings["cal-show-right-click"] },
                { type: "checkbox", title: "是否展示被关联子的事件", description: "启用后看板会展示被关联子的事件（建议开启）", key: "cal-show-ref-event", value: ctx.settings["cal-show-ref-event"] },
                { type: "checkbox", title: "完成项是否显示周期事件", description: "启用后看板完成项会展示周期事件", key: "cal-show-zq-done", value: ctx.settings["cal-show-zq-done"] },
                { type: "checkbox", title: "是否悬浮显示视图", description: "启用后会在页面上方显示悬浮视图", key: "cal-show-float-view", value: ctx.settings["cal-show-float-view"] },
                { type: "checkbox", title: "是否自动更新状态(打开视图时生效）", description: "根据块内子事件完成情况自动更新事件状态", key: "cal-auto-update-status", value: ctx.settings["cal-auto-update-status"] },
                { type: "checkbox", title: "自动创建缺失的数据库字段", description: "自动创建日程管理所需的数据库字段", key: "cal-auto-create-fields", value: ctx.settings["cal-auto-create-fields"] },
                { type: "checkbox", title: "日历视图拖拽归档", description: "拖拽事件到视图上方即可归档", key: "cal-drag-change", value: ctx.settings["cal-drag-change"] },
            ]
        },
        {
            name: "ics设置",
            items: [
                { type: "textinput", title: "日程文件名", description: "建议复杂且包含.ics后缀", key: "cal-url", value: ctx.settings["cal-url"] },
                { type: "number", title: "(ics)事件范围前(月)", description: "向前多少个月的事件", key: "cal-ics-filter-old", value: ctx.settings["cal-ics-filter-old"] },
                { type: "number", title: "(ics)事件范围后(月)", description: "向后多少个月的事件", key: "cal-ics-filter-new", value: ctx.settings["cal-ics-filter-new"] },
                { type: "button", title: "获取订阅链接", description: "更改文件名后请重新获取", key: "cal-get-url", value: ctx.settings["cal-get-url"], button: { label: "获取", callback: () => { try { ctx.moduleInstances["M_calendar"].getCalUrl(); } catch (e:any) { console.error(e); } } } },
                { type: "checkbox", title: "自动更新ics文件", description: "修改日程后自动更新", key: "cal-auto-update", value: ctx.settings["cal-auto-update"] },
                { type: "checkbox", title: "同步更新ics文件", description: "同步完成后自动更新", key: "cal-auto-syncing-update", value: ctx.settings["cal-auto-syncing-update"] },
                { type: "checkbox", title: "手动更新ics文件", description: "Topbar按钮手动更新", key: "cal-hand-update", value: ctx.settings["cal-hand-update"] },
            ]
        },
        {
            name: "ics分享",
            items: [
                { type: "select", title: "ics分享平台", description: "可能存在隐私风险，请谨慎", key: "cal-share", value: ctx.settings["ai-url-type"], options: { "": "无", alist: "alist", s3: "s3", "s3-diy": "s3-diy", webdav: "WebDAV" } },
                { type: "textinput", title: "触发平台", description: `当前平台：${ctx.frontEnd} （空=全部）`, key: "SelectTOPics", value: ctx.settings["SelectTOPics"] },
                { type: "textinput", title: "S3_Bucket", description: "s3-diy 填写", key: "cal-s3-bucket", value: ctx.settings["cal-s3-bucket"] },
                { type: "textinput", title: "S3_AccessKeyId", description: "s3-diy 填写", key: "cal-s3-accessKeyId", value: ctx.settings["cal-s3-accessKeyId"] },
                { type: "textinput", title: "S3_SecretAccessKey", description: "s3-diy 填写", key: "cal-s3-secretAccessKey", value: ctx.settings["cal-s3-secretAccessKey"] },
                { type: "textinput", title: "WebDAV服务器地址", description: "WebDAV 服务器地址", key: "cal-webdav-url", value: ctx.settings["cal-webdav-url"] },
                { type: "textinput", title: "WebDAV用户名", description: "WebDAV 用户名", key: "cal-webdav-username", value: ctx.settings["cal-webdav-username"] },
                { type: "textinput", title: "WebDAV密码", description: "WebDAV 密码", key: "cal-webdav-password", value: ctx.settings["cal-webdav-password"] },
                { type: "textinput", title: "WebDAV远程路径", description: "远程保存路径", key: "cal-webdav-path", value: ctx.settings["cal-webdav-path"] },
            ]
        },
        {
            name: "qq邮箱日历",
            items: [
                { type: "checkbox", title: "启用QQ邮箱日历(beta)", description: "展示QQ邮箱日历事件", key: "cal-qq-enable", value: ctx.settings["cal-qq-enable"] },
                { type: "textinput", title: "QQ邮箱地址", description: "对接QQ邮箱填写", key: "cal-qq-email", value: ctx.settings["cal-qq-email"] },
                { type: "textinput", title: "QQ邮箱授权码", description: "对接QQ邮箱填写", key: "cal-qq-code", value: ctx.settings["cal-qq-code"] },
                { type: "select", title: "QQ日历选择", description: "选择需要同步的QQ日历", key: "cal-qq-calendar-url", value: ctx.settings["cal-qq-calendar-url"], dynamicOptions: async (c) => { try { const list = await c.moduleInstances?.M_calendar?.QQCalDAVClient?.getCalendars(); if (Array.isArray(list) && list.length) { const m:Record<string,string> = {"":"无"}; list.forEach((cal:any)=>{ m[cal.url] = `${cal.displayName}${cal.description?` (${cal.description})`:""}`; }); return m; } } catch(e){ console.error(e);} return {"":"请先配置QQ邮箱信息"}; } },
            ]
        },
        {
            name: "订阅日历",
            items: [
                { type: "checkbox", title: "启用ics订阅", description: "可订阅其他软件的ics文件", key: "cal-ics-enable-subscribe", value: ctx.settings["cal-ics-enable-subscribe"] },
                { type: "textinput", title: "ics订阅地址", description: "以 http(s):// 开头", key: "cal-ics-subscribe-url", value: ctx.settings["cal-ics-subscribe-url"] },
                { type: "checkbox", title: "启用ics订阅导入", description: "将订阅事件导入到思源", key: "cal-ics-subscribe-import", value: ctx.settings["cal-ics-subscribe-import"] },
                { type: "select", title: "导入日记本", description: "订阅导入的日记本", key: "cal-ics-subscribe-import-note-id", value: ctx.settings["cal-ics-subscribe-import-note-id"], options: notebookOptions() },
                { type: "select", title: "导入模式", description: "如何放置导入事件", key: "cal-ics-import-mode", value: ctx.settings["cal-ics-import-mode"], options: { "single-document": "导入到当日日记本", "daily-notes": "按事件日期" } },
                { type: "checkbox", title: "添加到数据库", description: "导入块添加到指定数据库", key: "cal-ics-add-to-database", value: ctx.settings["cal-ics-add-to-database"] },
                { type: "select", title: "ICS导入数据库", description: "选择要添加的数据库", key: "cal-ics-database-id", value: ctx.settings["cal-ics-database-id"], dynamicOptions: calendarDbOptions },
                { type: "textarea", title: "ICS导入模板", description: "自定义导入块模板(支持占位符){{title}} - 事件标题 {{startTime}} - 开始时间 {{endTime}} - 结束时间 {{location}} - 地点 {{description}} - 描述 {{status}} - 状态 {{recurrence}} - 重复规则 {{tags}} - 标签", key: "cal-ics-custom-template", value: ctx.settings["cal-ics-custom-template"], direction: "row" },
            ]
        },
        {
            name: "视图设置",
            items: [
                { type: "textinput", title: "时间槽间隔", description: "如 00:30:00", key: "cal-slot-duration", value: ctx.settings["cal-slot-duration"] },
                { type: "textinput", title: "最早显示时间", description: "如 06:00:00", key: "cal-slot-min-time", value: ctx.settings["cal-slot-min-time"] },
                { type: "textinput", title: "最晚显示时间", description: "如 22:00:00", key: "cal-slot-max-time", value: ctx.settings["cal-slot-max-time"] },
                { type: "textinput", title: "拖拽时间间隔", description: "拖拽调整最小单位", key: "cal-snap-duration", value: ctx.settings["cal-snap-duration"] },
                { type: "select", title: "日历周起始日", description: "周首日", key: "cal-week-start", value: ctx.settings["cal-week-start"], options: { monday: "周一", sunday: "周日" } },
                { type: "checkbox", title: "事件颜色样式切换", description: "启用后使用另一套事件颜色", key: "cal-event-color", value: ctx.settings["cal-event-color"] },
                { type: "select", title: "默认日历视图模式", description: "首次打开默认模式", key: "cal-default-view", value: ctx.settings["cal-default-view"], options: { multiMonthYear: "MultiMonthYear", dayGridMonth: "DayGridMonth", timeGridWeek: "TimeGridWeek", timeGridThreeDays: "TimeGridThreeDays", timeGridDay: "TimeGridDay" } },
                { type: "select", title: "默认看板视图模式", description: "看板默认模式", key: "kanban-default-view", value: ctx.settings["kanban-default-view"], options: { weekkanban: "WeekKanban", kanban: "Kanban", yearkanban: "YearKanban" } },
                { type: "number", title: "四象限紧急阈值（天）", description: "<=阈值视为紧急", key: "cal-quadrant-urgent-days", value: ctx.settings["cal-quadrant-urgent-days"] },
            ]
        },
        {
            name: "滴答清单",
            items: [
                { type: "checkbox", title: "启用滴答清单同步", description: "同步滴答清单任务", key: "cal-dida-enable", value: ctx.settings["cal-dida-enable"] },
                { type: "textinput", title: "滴答清单token", description: "<a href=\"https://dida365.com/webapp/#q/all/tasks?modalType=settings\" target=\"_blank\">获取</a>API口令", key: "cal-dida-token", value: ctx.settings["cal-dida-token"] },
                { type: "select", title: "设置要同步的清单", description: "选择清单", key: "cal-dida-unfinished-list", value: ctx.settings["cal-dida-unfinished-list"], dynamicOptions: async () => { try { const ps = await DidaService.getAllProjects(); return convertProjectsToRecord(ps) || {"":"无"}; } catch { return {"":"加载失败"}; } } },
                { type: "textinput", title: "滴答清单同步数据库id", description: "对应数据库 id", key: "cal-dida-db-id", value: ctx.settings["cal-dida-db-id"] },
                { type: "select", title: "滴答清单同步模式", description: "同步触发模式", key: "cal-dida-sync-mode", value: ctx.settings["cal-dida-sync-mode"], options: { auto: "自动同步", manual: "手动同步", all: "自动+手动" } },
                { type: "number", title: "自动同步间隔", description: "分钟", key: "cal-dida-sync-interval", value: ctx.settings["cal-dida-sync-interval"] },
            ]
        },
    ]
});
