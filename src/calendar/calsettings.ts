


export function addSettings(settingUtils) {
    settingUtils.addItem({
        key: "calendar-setting-enable",
        value: false,
        type: "checkbox",
        title: "是否启用日程订阅",
        description: "是否启用日程订阅功能",
        action: {
            callback: () => {
                settingUtils.take("calendar-setting-enable");
            }
        }
    });
    settingUtils.addItem({
        key: "calendar-setting-url",
        value: "",
        type: "select",
        title: "日程订阅",
        description: "选择要设置的日程订阅",
        options: {
            "M_calendar": "日程订阅",
        },
        action: {
            callback: () => {
                settingUtils.take("calendar-setting");
            }
        }
    });

    settingUtils.load();
}