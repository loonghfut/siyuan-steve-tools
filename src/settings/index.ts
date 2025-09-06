import type { BuildContext, SettingGroupDefinition } from "./types";
import { calendarGroup } from "./calendar";
import { syncGroup } from "./sync";
import { aiGroup } from "./ai";
import { handwritingGroup } from "./handwriting";
import { lifelogGroup } from "./lifelog";
import { wpsGroup } from "./wps";
import { commonGroup } from "./common";
import { imageCompressionGroup } from "./imageCompression";

import { aggregateGroup } from "./aggregate";
export * from "./types";

export function buildSettingGroups(ctx: BuildContext): SettingGroupDefinition[] {
    return [
    calendarGroup(ctx),
    syncGroup(ctx),
    aiGroup(ctx),
    imageCompressionGroup(ctx),
    handwritingGroup(ctx),
    lifelogGroup(ctx),
    wpsGroup(ctx),
    aggregateGroup(ctx),
    commonGroup(ctx),
    ];
}
