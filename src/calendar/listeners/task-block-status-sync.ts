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
    const ancestorBlockIds = await getAncestorBlockIds(taskBlockId);
    const bindings = await findTaskBlockStatusBindings(taskBlockId, ancestorBlockIds, managedAvIds);
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

async function getAncestorBlockIds(taskBlockId: string): Promise<string[]> {
    const ancestorBlockIds: string[] = [];
    let currentId: string | undefined = taskBlockId;
    for (let depth = 0; currentId && depth < 32; depth += 1) {
        const block = await api.getBlockByID(currentId);
        if (!block) {
            break;
        }
        currentId = block.parent_id;
        if (currentId) {
            ancestorBlockIds.push(currentId);
        }
    }
    return ancestorBlockIds;
}

async function findTaskBlockStatusBindings(
    taskBlockId: string,
    ancestorBlockIds: string[],
    managedAvIds: Iterable<string>,
): Promise<TaskBlockStatusBinding[]> {
    const bindings: TaskBlockStatusBinding[] = [];
    const candidateBlockIds = [taskBlockId, ...ancestorBlockIds];
    for (const avId of managedAvIds) {
        // 同一任务块本身可能已直接绑定到 AV；这种情况下它的状态应优先于
        // 外层日程容器的绑定状态。否则按距离选择最近的已绑定祖先块。
        const itemIdsByBlock = await api.getAttributeViewItemIDsByBoundIDs(avId, candidateBlockIds);
        const boundBlockId = candidateBlockIds.find(blockId => itemIdsByBlock?.[blockId]);
        if (!boundBlockId) {
            continue;
        }
        const itemId = itemIdsByBlock?.[boundBlockId];
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
