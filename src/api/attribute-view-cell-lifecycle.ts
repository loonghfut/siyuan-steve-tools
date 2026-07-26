/**
 * Lifecycle events emitted by the shared Attribute View cell-write queue.
 *
 * Feature modules can observe their own writes without making the API layer
 * depend on a concrete feature implementation.
 */
export interface AVCellWriteOptions {
    source?: string;
    reason?: string;
    markSelfWrite?: boolean;
    suppressPostRefresh?: boolean;
}

export interface AttributeViewCellUpdate {
    avID: string;
    itemID: string;
    keyID: string;
    options?: AVCellWriteOptions;
}

export interface AttributeViewCellBatchUpdate {
    avID: string;
    updates: AttributeViewCellUpdate[];
    shouldRefresh: boolean;
}

export interface AttributeViewCellUpdateObserver {
    onQueued?(update: AttributeViewCellUpdate): void;
    onBatchUpdated?(batch: AttributeViewCellBatchUpdate): void | Promise<void>;
}

const observers = new Set<AttributeViewCellUpdateObserver>();

export function registerAttributeViewCellUpdateObserver(
    observer: AttributeViewCellUpdateObserver,
): () => void {
    observers.add(observer);
    return () => observers.delete(observer);
}

export function notifyAttributeViewCellQueued(update: AttributeViewCellUpdate): void {
    for (const observer of observers) {
        try {
            observer.onQueued?.(update);
        } catch (error) {
            console.warn('Attribute View cell-write observer failed while queuing an update', error);
        }
    }
}

export async function notifyAttributeViewCellBatchUpdated(
    batch: AttributeViewCellBatchUpdate,
): Promise<void> {
    await Promise.all(Array.from(observers, async observer => {
        try {
            await observer.onBatchUpdated?.(batch);
        } catch (error) {
            console.warn('Attribute View cell-write observer failed after a batch update', error);
        }
    }));
}
