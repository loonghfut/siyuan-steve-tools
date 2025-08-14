import type { BuildContext, SettingGroupDefinition } from "./types";

export const imageCompressionDefaults: Record<string, any> = {
    "img-compress-enable": false,
};

// 资源压缩（图片/视频压缩）设置分组
// 后续可扩展: 压缩质量、并发、格式白名单等
export function imageCompressionGroup(ctx: BuildContext): SettingGroupDefinition {
    return {
        name: "资源压缩",
        items: [
            {
                type: "checkbox",
                title: "启用资源压缩功能",
                description: "启用资源压缩功能后再进行下面的设置",
                key: "img-compress-enable",
                value: ctx.settings["img-compress-enable"],
            },
            {
                type: "hint",
                title: "提示",
                description: "图片压缩效果还行，视频压缩效果较差（浏览器环境限制较大，经常压缩视频建议用专业软件）",
                key: "img-compress-hint",
                value: "",
            },
        ],
    };
}
