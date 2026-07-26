const LIFELOG_PREFIX = 'custom-lifelog-';

/** Public event and data contract consumed by integrations such as Calendar. */
export const LIFELOG_CHANGED_EVENT = 'steve-tools:lifelog-changed';

export const ATTRS = {
    time: `${LIFELOG_PREFIX}time`,
    date: `${LIFELOG_PREFIX}date`,
    type: `${LIFELOG_PREFIX}type`,
    content: `${LIFELOG_PREFIX}content`,
    created: `${LIFELOG_PREFIX}created`,
    updated: `${LIFELOG_PREFIX}updated`,
};

const pendingWrittenIds = new Set<string>();

export function markLifelogSelfWrite(blockId: string): void {
    pendingWrittenIds.add(blockId);
}

export function clearLifelogSelfWrite(blockId: string): void {
    pendingWrittenIds.delete(blockId);
}

export function isLifelogSelfWrite(blockId: string): boolean {
    return pendingWrittenIds.has(blockId);
}
