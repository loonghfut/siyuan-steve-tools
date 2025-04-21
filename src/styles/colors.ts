
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

    return {
        border: colorBase.base,
        background: colorBase.background,
        text: 'var(--b3-theme-on-background)'
    };
}

// 保留原有的 lifelogColors 配置
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