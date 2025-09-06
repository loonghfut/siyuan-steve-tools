import { calendarDefaults } from "./settings/calendar";
import { syncDefaults } from "./settings/sync";
import { aiDefaults } from "./settings/ai";
import { imageCompressionDefaults } from "./settings/imageCompression";
import { handwritingDefaults } from "./settings/handwriting";
import { lifelogDefaults } from "./settings/lifelog";
import { wpsDefaults } from "./settings/wps";
import { commonDefaults } from "./settings/common";

import { aggregateDefaults } from "./settings/aggregate";
// 聚合所有模块默认配置
export const defaultSettings: Record<string, any> = {
    ...calendarDefaults,
    ...syncDefaults,
    ...aiDefaults,
    ...imageCompressionDefaults,
    ...handwritingDefaults,
    ...lifelogDefaults,
    ...wpsDefaults,
    ...commonDefaults,
    ...aggregateDefaults,
};

export function getSettings() { return { ...defaultSettings }; }
export function resetSettings() { return { ...defaultSettings }; }