import * as api from '@/api/api';

const pendingTaskMarkerWrites = new Map<string, number>();
const syncQueues = new Map<string, Promise<void>>();
const recentStatusSyncs = new Map<string, { completed: boolean; expiresAt: number; promise: Promise<void> }>();
const TASK_MARKER_WRITE_TTL_MS = 10_000;
const STATUS_SYNC_DEDUPE_TTL_MS = 2_000;

function clearExpiredTaskMarkerWrites(now = Date.now()): void {
    for (const [taskBlockId, expiresAt] of pendingTaskMarkerWrites) {
        if (expiresAt <= now) {
            pendingTaskMarkerWrites.delete(taskBlockId);
        }
    }
}

function clearExpiredStatusSyncs(now = Date.now()): void {
    for (const [superBlockId, sync] of recentStatusSyncs) {
        if (sync.expiresAt <= now) {
            recentStatusSyncs.delete(superBlockId);
        }
    }
}

export function isTaskCompletedStatus(status: string | undefined | null): boolean {
    return status === '完成' || status === '归档';
}

/**
 * Synchronizes every task item in a schedule's bound super block to its AV status.
 * SiYuan renders task state in `data-task`: a space is incomplete, any other marker is complete.
 */
export function syncBoundSuperBlockTaskItems(superBlockId: string, status: string | undefined | null): Promise<void> {
    const completed = isTaskCompletedStatus(status);
    const now = Date.now();
    clearExpiredStatusSyncs(now);
    const recent = recentStatusSyncs.get(superBlockId);
    if (recent && recent.completed === completed && recent.expiresAt > now) {
        return recent.promise;
    }

    const previous = syncQueues.get(superBlockId) ?? Promise.resolve();
    const next = previous
        .catch(() => undefined)
        .then(() => syncTaskItems(superBlockId, completed));
    syncQueues.set(superBlockId, next);
    recentStatusSyncs.set(superBlockId, {
        completed,
        expiresAt: now + STATUS_SYNC_DEDUPE_TTL_MS,
        promise: next,
    });
    void next.finally(() => {
        if (syncQueues.get(superBlockId) === next) {
            syncQueues.delete(superBlockId);
        }
        const latest = recentStatusSyncs.get(superBlockId);
        if (latest?.promise === next) {
            // 保留短暂结果用于合并同一次 AV 写入的 fetch/WS 双重回声。
            latest.promise = Promise.resolve();
        }
    });
    return next;
}

/** Returns true once for task-item writes that this module initiated from an AV status change. */
export function consumeTaskMarkerSyncWrite(taskBlockId: string | undefined): boolean {
    if (!taskBlockId) {
        return false;
    }
    const now = Date.now();
    clearExpiredTaskMarkerWrites(now);
    const expiresAt = pendingTaskMarkerWrites.get(taskBlockId);
    if (!expiresAt) {
        return false;
    }
    pendingTaskMarkerWrites.delete(taskBlockId);
    return expiresAt > now;
}

async function syncTaskItems(superBlockId: string, shouldBeCompleted: boolean): Promise<void> {
    try {
        const doms = await api.getBlockDOMs([superBlockId]);
        const dom = doms?.[superBlockId];
        if (!dom) {
            return;
        }

        const parsedDocument = new DOMParser().parseFromString(dom, 'text/html');
        const taskItems = Array.from(parsedDocument.querySelectorAll<HTMLElement>(
            '[data-type="NodeListItem"][data-subtype="t"][data-task][data-node-id]',
        ));
        const taskIdsToUpdate = taskItems
            .filter(item => (item.getAttribute('data-task') !== ' ') !== shouldBeCompleted)
            .map(item => item.dataset.nodeId)
            .filter((id): id is string => !!id);

        if (taskIdsToUpdate.length === 0) {
            return;
        }

        const now = Date.now();
        clearExpiredTaskMarkerWrites(now);
        const expiresAt = now + TASK_MARKER_WRITE_TTL_MS;
        for (const taskId of taskIdsToUpdate) {
            pendingTaskMarkerWrites.set(taskId, expiresAt);
        }
        try {
            await api.batchUpdateTaskListItemMarker(taskIdsToUpdate.map(id => ({
                id,
                marker: shouldBeCompleted ? 'X' : ' ',
            })));
        } catch (error) {
            for (const taskId of taskIdsToUpdate) {
                if (pendingTaskMarkerWrites.get(taskId) === expiresAt) {
                    pendingTaskMarkerWrites.delete(taskId);
                }
            }
            throw error;
        }
    } catch (error) {
        console.warn('同步超级块内任务块状态失败:', superBlockId, error);
    }
}
