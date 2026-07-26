import * as api from '@/api/api';

const syncQueues = new Map<string, Promise<void>>();
const recentStatusSyncs = new Map<string, { completed: boolean; expiresAt: number; promise: Promise<void> }>();
const STATUS_SYNC_DEDUPE_TTL_MS = 2_000;
const MAX_SYNC_ATTEMPTS = 3;

function clearExpiredStatusSyncs(now = Date.now()): void {
    for (const [scheduleBlockId, sync] of recentStatusSyncs) {
        if (sync.expiresAt <= now) {
            recentStatusSyncs.delete(scheduleBlockId);
        }
    }
}

export function isTaskCompletedStatus(status: string | undefined | null): boolean {
    return status === '完成' || status === '归档';
}

/**
 * Synchronizes every task item in a schedule's bound blockquote to its AV status.
 * SiYuan renders task state in `data-task`: a space is incomplete, any other marker is complete.
 */
export function syncBoundScheduleTaskItems(scheduleBlockId: string, status: string | undefined | null): Promise<void> {
    const completed = isTaskCompletedStatus(status);
    const now = Date.now();
    clearExpiredStatusSyncs(now);
    const recent = recentStatusSyncs.get(scheduleBlockId);
    if (recent && recent.completed === completed && recent.expiresAt > now) {
        return recent.promise;
    }

    const previous = syncQueues.get(scheduleBlockId) ?? Promise.resolve();
    const next = previous
        .catch(() => undefined)
        .then(() => syncTaskItems(scheduleBlockId, completed));
    syncQueues.set(scheduleBlockId, next);
    recentStatusSyncs.set(scheduleBlockId, {
        completed,
        expiresAt: now + STATUS_SYNC_DEDUPE_TTL_MS,
        promise: next,
    });
    const currentSync = recentStatusSyncs.get(scheduleBlockId)!;
    window.setTimeout(() => {
        if (recentStatusSyncs.get(scheduleBlockId) === currentSync
            && currentSync.expiresAt <= Date.now()) {
            recentStatusSyncs.delete(scheduleBlockId);
        }
    }, STATUS_SYNC_DEDUPE_TTL_MS);
    void next.then(() => {
        if (syncQueues.get(scheduleBlockId) === next) {
            syncQueues.delete(scheduleBlockId);
        }
        const latest = recentStatusSyncs.get(scheduleBlockId);
        if (latest?.promise === next) {
            // 保留短暂结果用于合并同一次 AV 写入的 fetch/WS 双重回声。
            latest.promise = Promise.resolve();
        }
    }, error => {
        if (syncQueues.get(scheduleBlockId) === next) {
            syncQueues.delete(scheduleBlockId);
        }
        if (recentStatusSyncs.get(scheduleBlockId)?.promise === next) {
            recentStatusSyncs.delete(scheduleBlockId);
        }
        console.warn('同步引述块内任务块状态失败:', scheduleBlockId, error);
    });
    return next;
}

async function syncTaskItems(scheduleBlockId: string, shouldBeCompleted: boolean): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_SYNC_ATTEMPTS; attempt += 1) {
        try {
            const doms = await api.getBlockDOMs([scheduleBlockId]);
            const dom = doms?.[scheduleBlockId];
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

            await api.batchUpdateTaskListItemMarker(taskIdsToUpdate.map(id => ({
                id,
                marker: shouldBeCompleted ? 'X' : ' ',
            })));
            return;
        } catch (error) {
            lastError = error;
            if (attempt < MAX_SYNC_ATTEMPTS) {
                await new Promise(resolve => window.setTimeout(resolve, attempt * 500));
            }
        }
    }
    throw lastError;
}
