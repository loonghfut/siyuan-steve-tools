import type { SettingGroupDefinition, BuildContext } from "./types";

export const wpsDefaults: Record<string, any> = {
    "wps-enable": false,
};

export const wpsGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "🛠️Wps开发中",
    items: [
        { type: "checkbox", title: "启用 Wps集成", description: "启用后可使用 Wps 功能", key: "wps-enable", value: ctx.settings["wps-enable"] },
    ]
});
