import * as api from '@/api/api';

const pendingUserTaskToggles = new Map<string, { completed: boolean; expiresAt: number }>();
const USER_TOGGLE_TTL_MS = 10_000;

interface TaskBlockStatusBinding {
    avId: string;
    itemId: string;
    statusKeyId: string;
    superBlockId: string;
}

export function recordUserTaskToggle(taskBlockId: string | undefined, isCompleted: boolean): void {
    if (!taskBlockId) {
        return;
    }
    pendingUserTaskToggles.set(taskBlockId, {
        completed: isCompleted,
        expiresAt: Date.now() + USER_TOGGLE_TTL_MS,
    });
}

export function consumeUserTaskToggle(taskBlockId: string | undefined, isCompleted: boolean): boolean {
    if (!taskBlockId) {
        return false;
    }
    const pending = pendingUserTaskToggles.get(taskBlockId);
    if (!pending || pending.expiresAt <= Date.now()) {
        pendingUserTaskToggles.delete(taskBlockId);
        return false;
    }
    pendingUserTaskToggles.delete(taskBlockId);
    return pending.completed === isCompleted;
}

/** Writes the status of the schedule(s) bound to a manually toggled task item. */
export async function syncTaskBlockStatusToCalendar(
    taskBlockId: string,
    isCompleted: boolean,
    managedAvIds: Iterable<string>,
): Promise<void> {
    const superBlockId = await findContainingSuperBlock(taskBlockId);
    if (!superBlockId) {
        return;
    }

    const bindings = await findTaskBlockStatusBindings(superBlockId, managedAvIds);
    if (bindings.length === 0) {
        return;
    }

    const status = isCompleted ? '完成' : '未完成';
    await Promise.all(bindings.map(binding => api.updateAttrViewCell_pro(
        binding.superBlockId,
        binding.avId,
        binding.statusKeyId,
        binding.itemId,
        [{ content: status }],
        'select',
        undefined,
        { source: 'calendar', reason: 'status' },
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
    superBlockId: string,
    managedAvIds: Iterable<string>,
): Promise<TaskBlockStatusBinding[]> {
    const bindings: TaskBlockStatusBinding[] = [];
    for (const avId of managedAvIds) {
        const itemId = (await api.getAttributeViewItemIDsByBoundIDs(avId, [superBlockId]))?.[superBlockId];
        if (!itemId) {
            continue;
        }

        const keys = await api.getAttributeViewKeysByAvID(avId);
        const statusKeyId = Array.isArray(keys)
            ? keys.find((key: any) => key?.name === '状态')?.id
            : undefined;
        if (statusKeyId) {
            bindings.push({ avId, itemId, statusKeyId, superBlockId });
        }
    }
    return bindings;
}
