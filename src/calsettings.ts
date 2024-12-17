export const defaultSettings = {
    "cal-enable": false,
    "cal-url": "calendar.ics",
    "cal-get-url": "Click Button",
    "cal-reset": "Click Button",
    "cal-auto-update": true,
    "cal-hand-update": true,
    "cal-hand": "ces",
    "cal-ur": "calendar2.ics",
};

export function getSettings() {
    return { ...defaultSettings };
}

export function resetSettings() {
    return { ...defaultSettings };
}