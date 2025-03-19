export const cn_type = "p";

export const BLOCK_LOADING = {
    MAX_CONCURRENT_LOADS: 2,      // 同时最多加载的块数量
    MAX_ACTIVE_BLOCKS: 10,        // 已加载块的最大数量（超过此数量需要回收）
    VIEWPORT_CHECK_DEBOUNCE: 300, // 视口检查的防抖时间（毫秒）
    INTERVAL_CHECK_PERIOD: 5000,  // 定期检查间隔时间（毫秒）
    VIEWPORT_PADDING: 200,        // 视口边缘额外检查的像素范围
    DRAG_THROTTLE: 16,            // 拖拽更新节流时间（毫秒）
    INITIAL_PRELOAD_COUNT: 10,    // 初始预加载的块数量
    BATCH_SIZE: 3,                 // 批量加载块的数量
    RECYCLE_COOLDOWN: 5000,       // 块回收后重新加载的最小时间间隔（毫秒）
    OFFSCREEN_TIME_THRESHOLD: 2000 // 块离开视窗多久后才考虑回收（毫秒）
};

// 块布局配置
export const BLOCK_LAYOUT = {
    MARGIN: 20,           // 块之间的间距
    START_X: 50,          // 起始X坐标
    START_Y: 50,          // 起始Y坐标
    WIDTH: 800,           // 默认块宽度
    HEIGHT: 200,          // 默认块高度
    MAX_COLUMNS: 1        // 最大列数
};