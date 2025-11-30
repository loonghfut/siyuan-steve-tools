import type { BuildContext, SettingGroupDefinition } from "./types";

export const imageCompressionDefaults: Record<string, any> = {
    "img-compress-enable": false,
    // 是否跳过压缩（直接上传原文件）
    "img-compress-skip": false,
    // 图片/视频上传目录（相对 data/ 目录）
    "img-compress-image-dir": "assets/st_image",
    "img-compress-video-dir": "assets/st_video",
    "img-compress-show-paste": true,
    'img-compress-show-topbar': true,
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
                type: "checkbox",
                title: "显示顶栏按钮",
                description: "是否在顶栏显示资源压缩按钮",
                key: "img-compress-show-topbar",
                value: ctx.settings["img-compress-show-topbar"],
            },
            {
                type: "checkbox",
                title: "显示粘贴按钮",
                description: "识别剪切板的图片并插入文档",
                key: "img-compress-show-paste",
                value: ctx.settings["img-compress-show-paste"],
            },
            {
                type: "checkbox",
                title: "跳过压缩（直接上传）",
                description: "勾选后不进行图片/视频压缩，直接上传原文件",
                key: "img-compress-skip",
                value: ctx.settings["img-compress-skip"],
            },
            {
                type: "textinput",
                title: "图片上传目录",
                description: "相对 data 目录的路径，例如 assets/st_image",
                key: "img-compress-image-dir",
                value: ctx.settings["img-compress-image-dir"],
            },
            {
                type: "textinput",
                title: "视频上传目录",
                description: "相对 data 目录的路径，例如 assets/st_video",
                key: "img-compress-video-dir",
                value: ctx.settings["img-compress-video-dir"],
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
