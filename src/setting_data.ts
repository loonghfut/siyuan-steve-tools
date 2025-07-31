export const defaultSettings = {
    // 日历模块
    "cal-enable": false,
    "cal-url": "calendar.ics",
    "cal-get-url": "Click Button",
    "cal-reset": "Click Button",
    "cal-auto-update": true,
    "cal-auto-syncing-update": false,
    "cal-hand-update": true,
    "cal-view-night": false,
    "cal-hand": "ces",
    "cal-ur": "calendar2.ics",
    "cal-show-view": true,
    "cal-create-pos": null,
    "cal-db-id": null,
    "cal-create-way": "0",
    "cal-seemore": false,
    "cal-show-ref-event": true,//是否展示被引用的事件
    "cal-show-float-view": false,//是否展示悬浮窗
    "cal-auto-update-status": false,//根据块内子事件完成情况自动更新事件状态
    "cal-auto-create-fields": true,//是否自动创建缺失的数据库字段
    "cal-week-start": "monday",
    "cal-show-right-click": false,
    "cal-drag-change": false,//是否允许拖拽改变事件时间
    "cal-time": 1,
    "cal-create-for-date": true,
    //// ics订阅子模块
    "cal-ics-enable-subscribe": false,
    "cal-ics-subscribe-url": "",
    ////// ics订阅子模块导入到文档
    "cal-ics-subscribe-import": false,
    "cal-ics-subscribe-import-path": "",//暂时不处理
    "cal-ics-subscribe-import-note-id": null,
    "cal-ics-import-mode": "single-document",
    "cal-ics-add-to-database": false, // 是否将ICS导入的块添加到数据库
    "cal-ics-database-id": null, // ICS导入时使用的数据库ID
    "cal-ics-custom-template": `### {{title}}

开始时间： {{startTime}}
结束时间： {{endTime}}
地点： {{location}}
状态： {{status}}
标签： {{tags}}
描述：{{description}}
重复规则： {{recurrence}}`, // ICS导入块的自定义模板（只包含内容部分） 
    //// qq邮箱子模块
    "cal-qq-code": "",
    "cal-qq-email": "",
    "cal-share": "",
    "cal-qq-calendar-url": "",
    "cal-qq-enable": false,
    //// dida子模块
    "cal-dida-enable": false,
    "cal-dida-token": "",
    "cal-dida-unfinished-list": "",
    "cal-dida-finished-list": "",
    "cal-dida-db-id": "", // 新增滴答清单同步数据库id
    "cal-dida-sync-mode": "auto", 
    "cal-dida-sync-interval": 5, // 同步间隔时间（分钟）
    //// s3子模块
    "cal-s3-bucket": "",
    "cal-s3-accessKeyId": "",
    "cal-s3-secretAccessKey": "",
    //// webdav子模块
    "cal-webdav-url": "",
    "cal-webdav-username": "",
    "cal-webdav-password": "",
    "cal-webdav-path": "",
    //// 周期显示设置
    "cal-show-zq-done": false,
    //// ics文件事件筛选
    "cal-ics-filter-old": 1,
    "cal-ics-filter-new": 1,
    //// 视图设置
    "cal-slot-duration": "01:00:00",
    "cal-slot-min-time": "00:00:00",
    "cal-slot-max-time": "24:00:00",
    "cal-snap-duration": "00:30:00",
    "cal-event-color": true,
    "kanban-default-view": "kanban",
    "cal-default-view": "dayGridMonth",
    // 同步模块
    "sync-enable": false,
    "sync-url": "http://localhost:8080",
    "sync-token": "token",
    // ai模块
    "ai-enable": false,
    "ai-url": "https://www.doubao.com/chat/",
    "ai-url-custom": '',
    // 图片压缩模块
    "img-compress-enable": false,
    // 画板模块
    "handwriting-enable": false,
    "tl-draw-create-note-id": null,
    // LifeLog模块
    "lifelog-enable": false,
    "lifelog-debug": false,  // 是否启用调试日志
    "lifelog-paths": ["/daily", "/journals/"],  // 监听的文档路径
    "lifelog-time-format": "HH:mm",  // 时间格式
    //https://github.com/loonghfut/siyuan-steve-tools/issues/44
    "SelectTOPics": "",  
    //白板配置
    "isGridMode": false, // 是否开启网格模式
    "copyLinkTitle": true, // 是否复制标题
    'SyncDelete': false, // 是否同步删除
    //插件通用配置
    "PluginUsageStatistics": true, // 是否开启插件使用统计
    "transaction-delay": 800, // 事务延迟时间（毫秒）
};

export function getSettings() {
    return { ...defaultSettings };
}

export function resetSettings() {
    return { ...defaultSettings };
}