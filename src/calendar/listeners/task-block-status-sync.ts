import * as api from '@/api/api';
import { calendarCellWriteOptions } from '@/calendar/core/calendar-cell-writes';
import { markCalendarBlockWrite } from '@/calendar/core/calendar-self-write';
import { getTaskItemsFromBlockDOM } from '@/calendar/listeners/task-item-dom';

interface TaskBlockStatusBinding {
    avId: string;
    itemId: string;
    statusKeyId: string;
    boundBlockId: string;
}

const STATUS_ATTRIBUTE_BY_VALUE: Record<string, string> = {
    '未完成': 'todo',
    '完成': 'done',
};

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

    const completionByBoundBlockId = new Map<string, Promise<boolean>>();
    const statusAttributeByBoundBlockId = new Map<string, Promise<string | undefined>>();
    const statusAttributeUpdatesByBoundBlockId = new Map<string, Promise<void>>();
    await Promise.all(bindings.map(async binding => {
        // 直接绑定的任务项仍按自身状态同步。绑定在引用块等外层容器时，
        // 日程状态代表该容器中的全部任务，不能由单个子任务决定。
        const completed = binding.boundBlockId === taskBlockId
            ? isCompleted
            : getBoundTaskContainerCompletion(
                binding.boundBlockId,
                isCompleted,
                completionByBoundBlockId,
            );
        const status = (await completed) ? '完成' : '未完成';
        const currentStatusAttribute = await getBoundBlockStatusAttribute(
            binding.boundBlockId,
            statusAttributeByBoundBlockId,
        );
        // 状态未变时不能重复写 AV，否则会触发“数据库 -> 任务块”的回声，
        // 将刚完成的单个任务重新批量标记为未完成。
        if (currentStatusAttribute === STATUS_ATTRIBUTE_BY_VALUE[status]) {
            return;
        }
        await api.updateAttrViewCell_pro(
            binding.boundBlockId,
            binding.avId,
            binding.statusKeyId,
            binding.itemId,
            [{ content: status }],
            'select',
            undefined,
            calendarCellWriteOptions('task'),
        );
        await syncBoundBlockStatusAttribute(
            binding.boundBlockId,
            STATUS_ATTRIBUTE_BY_VALUE[status],
            statusAttributeUpdatesByBoundBlockId,
        );
    }));
}

function getBoundBlockStatusAttribute(
    boundBlockId: string,
    statusAttributeByBoundBlockId: Map<string, Promise<string | undefined>>,
): Promise<string | undefined> {
    let statusAttribute = statusAttributeByBoundBlockId.get(boundBlockId);
    if (!statusAttribute) {
        statusAttribute = api.getBlockAttrs(boundBlockId)
            .then(attributes => attributes['custom-st-event'])
            .catch(error => {
                // Unknown state must not suppress a required synchronization.
                console.warn('读取日程块状态属性失败，将继续同步数据库状态:', boundBlockId, error);
                return undefined;
            });
        statusAttributeByBoundBlockId.set(boundBlockId, statusAttribute);
    }
    return statusAttribute;
}

function syncBoundBlockStatusAttribute(
    boundBlockId: string,
    statusAttribute: string,
    statusAttributeUpdatesByBoundBlockId: Map<string, Promise<void>>,
): Promise<void> {
    let update = statusAttributeUpdatesByBoundBlockId.get(boundBlockId);
    if (!update) {
        update = (async () => {
            markCalendarBlockWrite(boundBlockId, 'task');
            await api.setBlockAttrs(boundBlockId, {
                'custom-st-event': statusAttribute,
            });
        })();
        statusAttributeUpdatesByBoundBlockId.set(boundBlockId, update);
    }
    return update;
}

function getBoundTaskContainerCompletion(
    boundBlockId: string,
    fallbackCompletion: boolean,
    completionByBoundBlockId: Map<string, Promise<boolean>>,
): Promise<boolean> {
    let completion = completionByBoundBlockId.get(boundBlockId);
    if (!completion) {
        completion = getTaskContainerCompletion(boundBlockId, fallbackCompletion);
        completionByBoundBlockId.set(boundBlockId, completion);
    }
    return completion;
}

async function getTaskContainerCompletion(
    boundBlockId: string,
    fallbackCompletion: boolean,
): Promise<boolean> {
    const doms = await api.getBlockDOMs([boundBlockId]);
    const dom = doms?.[boundBlockId];
    if (!dom) {
        return fallbackCompletion;
    }

    const taskItems = getTaskItemsFromBlockDOM(dom);
    // 非任务容器保留原有按当前任务同步的语义，避免查询异常时阻塞同步。
    return taskItems.length === 0
        ? fallbackCompletion
        : taskItems.every(item => item.completed);
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
