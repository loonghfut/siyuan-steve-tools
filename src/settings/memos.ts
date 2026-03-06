import type { SettingGroupDefinition, BuildContext } from "./types";

// Memos 设置默认值
export const memosDefaults: Record<string, any> = {
    "memos-enable": false,
};

export const memosGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "Memos",
    items: [
        { type: "checkbox", title: "启用Memos", description: "启用后再进行下面的设置", key: "memos-enable", value: ctx.settings["memos-enable"] },
    ]
});
