import type { SettingGroupDefinition, BuildContext } from "./types";

// Wucai 设置默认值
export const wucaiDefaults: Record<string, any> = {
    "wucai-enable": false,
};

export const wucaiGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "Wucai",
    items: [
        { type: "checkbox", title: "启用Wucai", description: "启用后再进行下面的设置", key: "wucai-enable", value: ctx.settings["wucai-enable"] },
    ]
});
