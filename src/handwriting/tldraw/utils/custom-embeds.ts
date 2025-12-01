/**
 * 自定义嵌入定义
 * 用于在 tldraw 中支持额外的嵌入内容类型
 */
import {
    CustomEmbedDefinition,
    DEFAULT_EMBED_DEFINITIONS,
} from '@tldraw/tldraw';

/**
 * B站视频嵌入定义
 * 支持以下URL格式：
 * - https://www.bilibili.com/video/BVxxxxxxxxx
 * - https://www.bilibili.com/video/avxxxxxxx
 * - https://player.bilibili.com/player.html?bvid=xxx (已是嵌入格式)
 * 
 * 注意：b23.tv 短链接无法直接转换，需要用户使用完整链接
 */
export const bilibiliEmbed: CustomEmbedDefinition = {
    type: 'bilibili',
    title: 'Bilibili',
    hostnames: ['bilibili.com', 'www.bilibili.com', 'b23.tv'],
    minWidth: 300,
    minHeight: 200,
    width: 720,
    height: 480,
    doesResize: true,
    toEmbedUrl: (url: string) => {
        try {
            const urlObj = new URL(url);
            // 处理短链接 b23.tv（需要用户手动展开或在这里返回原始URL让tldraw处理）
            if (urlObj.hostname === 'b23.tv') {
                // 短链接无法直接转换，返回undefined让用户使用完整链接
                return undefined;
            }
            // 匹配 BV 号: /video/BVxxxxxxxxxx
            const bvMatch = urlObj.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/);
            if (bvMatch) {
                const bvid = bvMatch[1];
                // 检查是否有分P参数
                const page = urlObj.searchParams.get('p') || '1';
                return `https://player.bilibili.com/player.html?bvid=${bvid}&page=${page}&high_quality=1&danmaku=0`;
            }
            // 匹配 AV 号: /video/avxxxxxxx
            const avMatch = urlObj.pathname.match(/\/video\/av(\d+)/);
            if (avMatch) {
                const aid = avMatch[1];
                const page = urlObj.searchParams.get('p') || '1';
                return `https://player.bilibili.com/player.html?aid=${aid}&page=${page}&high_quality=1&danmaku=0`;
            }
            // 匹配嵌入播放器URL（已经是嵌入格式）
            if (urlObj.hostname === 'player.bilibili.com') {
                return url;
            }
            return undefined;
        } catch {
            return undefined;
        }
    },
    fromEmbedUrl: (url: string) => {
        try {
            const urlObj = new URL(url);
            if (urlObj.hostname !== 'player.bilibili.com') {
                return undefined;
            }
            const bvid = urlObj.searchParams.get('bvid');
            const aid = urlObj.searchParams.get('aid');
            const page = urlObj.searchParams.get('page') || '1';
            if (bvid) {
                return page !== '1' 
                    ? `https://www.bilibili.com/video/${bvid}?p=${page}`
                    : `https://www.bilibili.com/video/${bvid}`;
            }
            if (aid) {
                return page !== '1'
                    ? `https://www.bilibili.com/video/av${aid}?p=${page}`
                    : `https://www.bilibili.com/video/av${aid}`;
            }
            return undefined;
        } catch {
            return undefined;
        }
    },
    // B站官方图标
    icon: 'https://www.bilibili.com/favicon.ico',
};

/**
 * 所有自定义嵌入定义列表
 * 如需添加更多嵌入类型，在此数组中添加
 */
export const customEmbedDefinitions: CustomEmbedDefinition[] = [
    bilibiliEmbed,
    // 在这里添加更多自定义嵌入...
];

/**
 * 合并默认嵌入定义和自定义嵌入定义
 * 导出供 Tldraw 组件使用
 */
export const allEmbeds = [...DEFAULT_EMBED_DEFINITIONS, ...customEmbedDefinitions];
