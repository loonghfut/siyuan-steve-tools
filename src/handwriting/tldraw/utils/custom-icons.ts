/**
 * 自定义图标注册
 * 集中管理所有自定义 SVG 图标到 tldraw assetUrls 的映射
 */
import { getAssetUrls } from '@tldraw/assets/selfHosted';

const BASE_URL = 'plugins/siyuan-steve-tools/asset/icons/custom';

/** 自定义图标名称 → SVG 文件名的映射表 */
const CUSTOM_ICONS: Record<string, string> = {
    'mindmap': 'mindmap.svg',
    'iconParagraph': 'iconParagraph.svg',
    'branch': 'branch.svg',
    'branch-curve-solid': 'branch-curve-solid.svg',
    'branch-elbow-solid': 'branch-elbow-solid.svg',
    'branch-straight-solid': 'branch-straight-solid.svg',
    'branch-curve-dashed': 'branch-curve-dashed.svg',
    'branch-frame-floating': 'branch-frame-floating.svg',
    'branch-background': 'branch-background.svg',
    'branch-detach': 'branch-detach.svg',
    'branch-add-left': 'branch-add-left.svg',
    'branch-add-right': 'branch-add-right.svg',
    'connector-arrow': 'connector-arrow.svg',
    'connector-curve': 'connector-curve.svg',
    'connector-solid': 'connector-solid.svg',
    'connector-dashed': 'connector-dashed.svg',
    'connector-flow': 'connector-flow.svg',
    'quick-card': 'quick-card.svg',
    'quick-single-block': 'quick-single-block.svg',
    'jump-start': 'jump-start.svg',
    'jump-end': 'jump-end.svg',
    'card-collapse': 'card-collapse.svg',
    'card-expand': 'card-expand.svg',
    'text-align-left-custom': 'text-align-left-custom.svg',
    'text-align-center-custom': 'text-align-center-custom.svg',
    'text-align-right-custom': 'text-align-right-custom.svg',
    'child-docs': 'child-docs.svg',
    'outline-blocks': 'outline-blocks.svg',
    'loading-spinner': 'loading-spinner.svg',
    'enter-connect': 'enter-connect.svg',
    'transparent-background': 'transparent-background.svg',
    'binding-link': 'binding-link.svg',
    'arrange-up': 'arrange-up.svg',
    'arrange-down': 'arrange-down.svg',
    'arrange-left': 'arrange-left.svg',
    'arrange-right': 'arrange-right.svg',
    'fit-width': 'fit-width.svg',
    'slide-focus': 'slide-focus.svg',
    'slide-exit-focus': 'slide-exit-focus.svg',
    'copy-link-custom': 'copy-link.svg',
    'open-block': 'open-block.svg',
    'update-screenshot': 'update-screenshot.svg',
    'js-interactive': 'js-interactive.svg',
};

/**
 * 创建并配置包含自定义图标的 assetUrls
 * @returns 配置好的 assetUrls 对象
 */
export function createAssetUrlsWithCustomIcons() {
    const assetUrls = getAssetUrls({
        baseUrl: 'plugins/siyuan-steve-tools/asset/',
    });

    try {
        for (const [name, filename] of Object.entries(CUSTOM_ICONS)) {
            assetUrls.icons[name] = `${BASE_URL}/${filename}`;
        }
    } catch (err) {
        console.warn('无法在 assetUrls 上添加 custom-icon 映射', err);
    }

    return assetUrls;
}

/** 所有自定义图标的名称列表（可用于类型提示、遍历等） */
export const CUSTOM_ICON_NAMES = Object.keys(CUSTOM_ICONS) as (keyof typeof CUSTOM_ICONS)[];

/** 图标映射表（只读） */
export const customIconMap = Object.freeze({ ...CUSTOM_ICONS });
