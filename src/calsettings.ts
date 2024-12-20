export const defaultSettings = {
    // 日历模块
    "cal-enable": false,
    "cal-url": "calendar.ics",
    "cal-get-url": "Click Button",
    "cal-reset": "Click Button",
    "cal-auto-update": true,
    "cal-hand-update": true,
    "cal-hand": "ces",
    "cal-ur": "calendar2.ics",
    // 同步模块
    "sync-enable": false,
    "sync-url": "http://localhost:8080",
    "sync-token": "token",
};

export function getSettings() {
    return { ...defaultSettings };
}

export function resetSettings() {
    return { ...defaultSettings };
}