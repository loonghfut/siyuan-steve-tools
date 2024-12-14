
export function addSettings(settingUtils) {

    settingUtils.addItem({
        key: "calendar-setting",
        value: "",
        type: "select",
        title: "日程订阅",
        description: "选择要设置的日程订阅",
        options: {
            "M_calendar": "日程订阅",
        },
        action: {
            // Called when focus is lost and content changes
            callback: () => {
                settingUtils.take("calendar-setting");
            }
        }
    });

}