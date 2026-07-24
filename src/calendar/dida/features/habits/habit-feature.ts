import type { DidaHabitApi } from "../../api/habit-api";
import type { DidaSyncFeature } from "../../sync/sync-feature";

export class DidaHabitFeature implements DidaSyncFeature {
    readonly id = "habits";

    constructor(readonly api: DidaHabitApi) {}

    start(): void {
        // Habit synchronization is opt-in and will be attached here when settings are added.
    }

    destroy(): void {}
}
