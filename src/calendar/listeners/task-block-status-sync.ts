import * as api from '@/api/api';
import { calendarCellWriteOptions } from '@/calendar/core/calendar-cell-writes';

interface TaskBlockStatusBinding {
    avId: string;
    itemId: string;
    statusKeyId: string;
    boundBlockId: string;
}

/** Writes the status of the schedule(s) bound to a manually toggled task item. */
export async function syncTaskBlockStatusToCalendar(
    taskBlockId: string,
    isCompleted: boolean,
    managedAvIds: Iterable<string>,
): Promise<void> {
    const superBlockId = await findContainingSuperBlock(taskBlockId);
    const bindings = await findTaskBlockStatusBindings(taskBlockId, superBlockId, managedAvIds);
    if (bindings.length === 0) {
        return;
    }

    const status = isCompleted ? '完成' : '未完成';
    await Promise.all(bindings.map(binding => api.updateAttrViewCell_pro(
        binding.boundBlockId,
        binding.avId,
        binding.statusKeyId,
        binding.itemId,
        [{ content: status }],
        'select',
        undefined,
        calendarCellWriteOptions('status'),
    )));
}

async function findContainingSuperBlock(taskBlockId: string): Promise<string | null> {
    let currentId: string | undefined = taskBlockId;
    for (let depth = 0; currentId && depth < 32; depth += 1) {
        const block = await api.getBlockByID(currentId);
        if (!block) {
            return null;
        }
        if (block.type === 's') {
            return block.id;
        }
        currentId = block.parent_id;
    }
    return null;
}

async function findTaskBlockStatusBindings(
    taskBlockId: string,
    superBlockId: string | null,
    managedAvIds: Iterable<string>,
): Promise<TaskBlockStatusBinding[]> {
    const bindings: TaskBlockStatusBinding[] = [];
    for (const avId of managedAvIds) {
        // 同一任务块本身可能已直接绑定到 AV；这种情况下它的状态应优先于
        // 外层超级块的绑定状态。只有任务块未绑定时才回退至超级块。
        let boundBlockId = taskBlockId;
        let itemId = (await api.getAttributeViewItemIDsByBoundIDs(avId, [taskBlockId]))?.[taskBlockId];
        if (!itemId && superBlockId && superBlockId !== taskBlockId) {
            boundBlockId = superBlockId;
            itemId = (await api.getAttributeViewItemIDsByBoundIDs(avId, [superBlockId]))?.[superBlockId];
        }
        if (!itemId) {
            continue;
        }

        const keys = await api.getAttributeViewKeysByAvID(avId);
        const statusKeyId = Array.isArray(keys)
            ? keys.find((key: any) => key?.name === '状态')?.id
            : undefined;
        if (statusKeyId) {
            bindings.push({ avId, itemId, statusKeyId, boundBlockId });
        }
    }
    return bindings;
}
