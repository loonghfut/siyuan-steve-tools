import * as api from '@/api/api';

const pendingCompletions = new Map<string, Promise<void>>();

/** Marks every unfinished task-list item inside a schedule's bound super block as complete. */
export function completeBoundSuperBlockTaskItems(superBlockId: string): Promise<void> {
    const pending = pendingCompletions.get(superBlockId);
    if (pending) {
        return pending;
    }

    const completion = completeTaskItems(superBlockId).finally(() => {
        pendingCompletions.delete(superBlockId);
    });
    pendingCompletions.set(superBlockId, completion);
    return completion;
}

async function completeTaskItems(superBlockId: string): Promise<void> {
    try {
        const doms = await api.getBlockDOMs([superBlockId]);
        const dom = doms?.[superBlockId];
        if (!dom) {
            return;
        }
        const document = new DOMParser().parseFromString(dom, 'text/html');
        const items = Array.from(document.querySelectorAll<HTMLElement>(
            '[data-type="NodeListItem"][data-node-id]',
        )).filter(item => item.dataset.subtype === 't'
            || !!item.closest('[data-type="NodeList"][data-subtype="t"]'));
        const incompleteItems = items
            .filter(item => item.getAttribute('data-task') === ' ')
            .map(item => item.dataset.nodeId)
            .filter((id): id is string => !!id);

        if (incompleteItems.length === 0) {
            return;
        }
        await api.batchUpdateTaskListItemMarker(incompleteItems.map(id => ({ id, marker: 'X' })));
    } catch (error) {
        // The AV status change has already succeeded; task-block synchronization is best-effort.
        console.warn('同步超级块内任务块完成状态失败:', superBlockId, error);
    }
}
