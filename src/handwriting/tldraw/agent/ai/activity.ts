import { getFocusedInstanceId, getInstance } from '../../tldraw-instance-manager';

/**
 * Turns on the visible tldraw agent activity indicator for the target board.
 * The returned cleanup function must always be called after the tool finishes.
 */
export function beginAgentActivityForArgs(args: Record<string, unknown>): () => void {
    const whiteboardId = stringValue(args.whiteboardId || args.id || args.rootId) || getFocusedInstanceId();
    if (!whiteboardId) return noop;

    const instance = getInstance(whiteboardId) as unknown as {
        beginAgentActivity?: () => () => void;
    } | undefined;
    if (!instance || typeof instance.beginAgentActivity !== 'function') return noop;

    try {
        return instance.beginAgentActivity();
    } catch (error) {
        console.warn('Failed to show tldraw agent activity indicator', error);
        return noop;
    }
}

/** Reads a string argument while treating empty/whitespace strings as absent. */
function stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/** Cleanup placeholder used when no board activity indicator can be started. */
function noop() {}
