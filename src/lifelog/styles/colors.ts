import { settingdata } from "@/index";

// 基础颜色配置
const baseColors = {
    '高': {
        base: 'rgb(232, 138, 135)',  // 柔和的红色
        // 降低透明度以增加与边框的区分度
        background: 'rgba(232, 138, 135, 0.9)'
    },
    '中': {
        // 保持原有的注释
        base: 'rgb(242, 201, 76)',  // 温暖的黄色
        background: 'rgba(242, 201, 76, 0.9)'
    },
    '低': {
        base: 'rgb(79, 147, 209)',  // 沉稳的蓝色
        background: 'rgba(79, 147, 209, 0.9)'
    },
    '无': {
        base: 'rgb(160, 174, 192)',  // 优雅的灰色
        background: 'rgba(160, 174, 192, 0.9)'
    }
};

// 导出颜色生成函数
export function getCategoryColor(priority: string = '无') {
    const colorBase = baseColors[priority] || baseColors['无'];
    if (settingdata["cal-event-color"]) {
        const hash = Array.from(priority).reduce((acc, char) => {
            return char.charCodeAt(0) + ((acc << 5) - acc);
        }, 0);
        const [backgroundColor, textColor] = getColors(Math.abs(hash));
        return {
            // border: colorBase.base,
            background: backgroundColor,
            text: textColor
        };
    }
    return {
        // border: colorBase.base,
        background: colorBase.background,
        text: 'var(--b3-theme-on-background)'
    };
}

// 保留原有的 lifelogColors 配置（作为默认 fallback）
export const lifelogColors = {
    '固定': {
        border: 'rgb(211, 211, 211)',
        background: 'rgba(211, 211, 211, 0.15)',
        text: 'var(--b3-theme-on-background)'
    },
    '学习': {
        border: 'rgb(144, 238, 144)',
        background: 'rgba(144, 238, 144, 0.15)',
        text: 'var(--b3-theme-on-background)'
    },
    '阅读': {
        border: 'rgb(144, 238, 144)',
        background: 'rgba(144, 238, 144, 0.15)',
        text: 'var(--b3-theme-on-background)'
    },
    '事业': {
        border: 'rgb(144, 238, 144)',
        background: 'rgba(144, 238, 144, 0.15)',
        text: 'var(--b3-theme-on-background)'
    },
    '增': {
        border: 'rgb(144, 238, 144)',
        background: 'rgba(144, 238, 144, 0.15)',
        text: 'var(--b3-theme-on-background)'
    },
    '工作': {
        border: 'rgb(255, 215, 0)',
        background: 'rgba(255, 215, 0, 0.15)',
        text: 'var(--b3-theme-on-background)'
    },
    '娱乐': {
        border: 'rgb(255, 0, 0)',
        background: 'rgba(255, 0, 0, 0.15)',
        text: 'var(--b3-theme-on-background)'
    },
    '荒废': {
        border: 'rgb(255, 0, 0)',
        background: 'rgba(255, 0, 0, 0.15)',
        text: 'var(--b3-theme-on-background)'
    },
    '废': {
        border: 'rgb(255, 0, 0)',
        background: 'rgba(255, 0, 0, 0.15)',
        text: 'var(--b3-theme-on-background)'
    },
    '玩': {
        border: 'rgb(255, 0, 0)',
        background: 'rgba(255, 0, 0, 0.15)',
        text: 'var(--b3-theme-on-background)'
    },
    '家庭': {
        border: 'rgb(71, 255, 248)',
        background: 'rgba(71, 255, 248, 0.15)',
        text: 'var(--b3-theme-on-background)'
    },
    '家': {
        border: 'rgb(71, 255, 248)',
        background: 'rgba(71, 255, 248, 0.15)',
        text: 'var(--b3-theme-on-background)'
    },
    '朋友': {
        border: 'rgb(156, 123, 85)',
        background: 'rgba(156, 123, 85, 0.15)',
        text: 'var(--b3-theme-on-background)'
    },
    '友': {
        border: 'rgb(156, 123, 85)',
        background: 'rgba(156, 123, 85, 0.15)',
        text: 'var(--b3-theme-on-background)'
    }
};

/**
 * 解析 lifelog-type-colors 设置（"类型=颜色\n..." 格式）为 Map。
 */
function parseLifelogTypeColors(raw: string): Map<string, string> {
    const map = new Map<string, string>();
    if (!raw) return map;
    const lines = String(raw).split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        // 支持 = 或 : 分隔
        const match = trimmed.split(/[:=]/);
        if (match.length >= 2) {
            const type = match[0].trim();
            const color = match.slice(1).join('=').trim();
            if (type && color) {
                map.set(type, color);
            }
        }
    }
    return map;
}

/**
 * 根据 lifelog 类型获取日历事件颜色。
 * 优先级：
 *   1. 用户配置的 lifelog-type-colors
 *   2. 内置 lifelogColors 默认表
 *   3. 按类型名哈希自动生成（复用 getColors）
 *
 * @param type lifelog 类型（如 工作/学习/运动）
 * @param settings 全局 settingdata
 */
export function getLifelogColor(type: string, settings: any): { background: string; text: string } {
    const safeType = type || '固定';

    // 1. 用户自定义映射优先
    const userMap = parseLifelogTypeColors(settings?.['lifelog-type-colors'] || '');
    if (userMap.has(safeType)) {
        const bg = userMap.get(safeType)!;
        const text = guessTextColorFromHex(bg);
        return { background: bg, text };
    }

    // 2. 内置默认表
    const builtin = lifelogColors[safeType] || lifelogColors['固定'];
    // 3. 若用户提供了自定义映射但当前类型不在其中，走哈希配色（比内置默认更丰富）
    if (userMap.size > 0 && !lifelogColors[safeType]) {
        const hash = Array.from(safeType).reduce((acc, char) => {
            return char.charCodeAt(0) + ((acc << 5) - acc);
        }, 0);
        const [bg, text] = getColors(Math.abs(hash));
        return { background: bg, text };
    }

    return { background: builtin.background, text: builtin.text };
}

function getColors(index: number): string[] {
    const hue = index * 137.508; // use golden angle approximation // Copied from https://stackoverflow.com/a/20129594/13231742
    const rgb = hsl2rgb(hue, 0.75, 0.75);

    let textColor: string;

    if (colourIsLight(rgb[0], rgb[1], rgb[2])) {
        textColor = "black";
    } else {
        textColor = "white";
    }

    return [`hsl(${hue},75%,75%)`, textColor];
}

function hsl2rgb(h: number, s: number, l: number): number[] { // Copied from https://stackoverflow.com/a/54014428/13231742
    let a = s * Math.min(l, 1 - l);
    let f = (n: number, k = (n + h / 30) % 12) => l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return [f(0) * 255, f(8) * 255, f(4) * 255];
}

var colourIsLight = function (r: number, g: number, b: number) { // Copied from https://codepen.io/WebSeed/full/pvgqEq/

    // Counting the perceptive luminance
    // human eye favors green color...
    var a = 1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return (a < 0.5);
}

// 根据 HEX 颜色猜测前景色（深色背景白字，浅色背景黑字）
function guessTextColorFromHex(bgColor: string): string {
    if (!bgColor) return 'black';
    if (bgColor.startsWith('#')) {
        const hex = bgColor.length === 4
            ? `#${bgColor[1]}${bgColor[1]}${bgColor[2]}${bgColor[2]}${bgColor[3]}${bgColor[3]}`
            : bgColor;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        if ([r, g, b].some(isNaN)) return 'black';
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? 'black' : 'white';
    }
    return 'black';
}
