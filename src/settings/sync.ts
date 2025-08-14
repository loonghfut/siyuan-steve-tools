import type { SettingGroupDefinition, BuildContext } from "./types";

export const syncGroup = (ctx: BuildContext): SettingGroupDefinition => ({
    name: "docker同步感知",
    items: [
        { type: "checkbox", title: "启用docker同步感知", description: "启用后再进行下面的设置", key: "sync-enable", value: ctx.settings["sync-enable"] },
        { type: "textinput", title: "docker思源服务地址", description: "如 http://localhost:6806 (末尾不加 /)", key: "sync-url", value: ctx.settings["sync-url"] },
        { type: "textinput", title: "docker思源服务token", description: "服务 token", key: "sync-token", value: ctx.settings["sync-token"] },
        { type: "button", title: "测试连接", description: "测试 docker 思源服务", key: "sync-test", value: "", button: { label: "测试", callback: () => { ctx.moduleInstances["M_sync"]?.testSync?.(); } } },
    ]
});
