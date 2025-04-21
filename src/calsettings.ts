export const defaultSettings = {
    // 日历模块
    "cal-enable": false,
    "cal-url": "calendar.ics",
    "cal-get-url": "Click Button",
    "cal-reset": "Click Button",
    "cal-auto-update": true,
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
    "cal-week-start": "monday",
    "cal-show-right-click": false,
    "cal-drag-change": false,//是否允许拖拽改变事件时间
    "cal-time": 1,
    "cal-create-for-date": true,
    //// ics订阅子模块
    "cal-ics-enable-subscribe": false,
    "cal-ics-subscribe-url": "",
    //// qq邮箱子模块
    "cal-qq-code": "",
    "cal-qq-email": "",
    "cal-share": "",
    "cal-qq-calendar-url": "",
    "cal-qq-enable": false,
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
    "lifelog-enable": true,
    "lifelog-debug": false,  // 是否启用调试日志
    "lifelog-paths": ["/daily", "/journals/"],  // 监听的文档路径
    "lifelog-time-format": "HH:mm",  // 时间格式
};

export function getSettings() {
    return { ...defaultSettings };
}

export function resetSettings() {
    return { ...defaultSettings };
}