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

    // 同步模块
    "sync-enable": false,
    "sync-url": "http://localhost:8080",
    "sync-token": "token",
    // ai模块
    "ai-enable": false,
    "ai-url": "https://www.doubao.com/chat/",
};

export function getSettings() {
    return { ...defaultSettings };
}

export function resetSettings() {
    return { ...defaultSettings };
}