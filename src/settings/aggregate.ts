import type { SettingGroupDefinition, BuildContext } from "./types";

// Aggregate 设置默认值
export const aggregateDefaults: Record<string, any> = {
    "aggregate-enable": false,
};

export const aggregateGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "🚧聚合🚧",
    items: [
        { type: "checkbox", title: "启用聚合", description: "启用后再进行下面的设置", key: "aggregate-enable", value: ctx.settings["aggregate-enable"] },
    ]
});
