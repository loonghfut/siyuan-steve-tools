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
    "cal-seemore":false,
    "cal-show-ref-event":true,//是否展示被引用的事件
    //// qq邮箱子模块
    "cal-qq-code": "",
    "cal-qq-email": "",
    "cal-share": "",
    "cal-qq-calendar-url": "",
    "cal-qq-enable": false,
    //// s3子模块
    "cal-s3-bucket": "",
    "cal-s3-accessKeyId":"",
    "cal-s3-secretAccessKey":"",
    //// 周期显示设置
    "cal-show-zq-done": false,
    //// ics文件事件筛选
    "cal-ics-filter-old": 1,
    "cal-ics-filter-new": 1,
    // "cal-show-zq-todo": '',
    // 同步模块
    "sync-enable": false,
    "sync-url": "http://localhost:8080",
    "sync-token": "token",
    // ai模块
    "ai-enable": false,
    "ai-url": "https://www.doubao.com/chat/",
    "ai-url-custom":'',
    // 图片压缩模块
    "img-compress-enable": false,
    // 画板模块
    "handwriting-enable": false,
};

export function getSettings() {
    return { ...defaultSettings };
}

export function resetSettings() {
    return { ...defaultSettings };
}