import type { DidaFocusApi } from "../../api/focus-api";
import type { DidaSyncFeature } from "../../sync/sync-feature";

export class DidaFocusFeature implements DidaSyncFeature {
    readonly id = "focus";

    constructor(readonly api: DidaFocusApi) {}

    start(): void {
        // Focus synchronization is opt-in and will be attached here when settings are added.
    }

    destroy(): void {}
}
