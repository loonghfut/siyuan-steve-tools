import { writable } from 'svelte/store';

export type WhiteboardFilesUpdateEvent = {
    timestamp: number;
    action: 'delete' | 'refresh';
    fileName?: string;
    drawingId?: string;
};

// 用于跨组件同步白板文件列表更新
export const whiteboardFilesUpdated = writable<WhiteboardFilesUpdateEvent>({
    timestamp: 0,
    action: 'refresh',
});

// 触发白板卡片栏刷新的函数
export function triggerWhiteboardsRefresh(
    action: 'delete' | 'refresh' = 'refresh',
    fileName?: string,
    drawingId?: string
) {
    whiteboardFilesUpdated.set({
        timestamp: Date.now(),
        action,
        fileName,
        drawingId,
    });
}
