import { M_calendar } from "./calendar/module-calendar";
import { M_sync } from "./sync/module-sync";
import { M_ai } from "./ai/ai";
import { M_handwriting } from "./handwriting/module-handwriting";
import { M_imageCompression } from "./ImageCompression/module-imageCompression";
import { M_lifelog } from "./lifelog/module-lifelog";

import { M_Wps } from "./wps/module-wps";
// 模块配置接口
export interface ModuleConfig {
    [key: string]: {
        class: any;
        name: string;
        settingKey: string;
        logMessage: string;
    };
}

// 所有可用模块的配置
export const MODULE_CONFIG: ModuleConfig = {
    M_calendar: {
        class: M_calendar,
        name: 'M_calendar',
        settingKey: 'cal-enable',
        logMessage: '日历模块加载'
    },
    M_sync: {
        class: M_sync,
        name: 'M_sync',
        settingKey: 'sync-enable',
        logMessage: '同步模块加载'
    },
    M_ai: {
        class: M_ai,
        name: 'M_ai',
        settingKey: 'ai-enable',
        logMessage: 'ai模块加载'
    },
    M_imageCompression: {
        class: M_imageCompression,
        name: 'M_imageCompression',
        settingKey: 'img-compress-enable',
        logMessage: '图片压缩模块加载'
    },
    M_handwriting: {
        class: M_handwriting,
        name: 'M_handwriting',
        settingKey: 'handwriting-enable',
        logMessage: '画板模块加载'
    },
    M_lifelog: {
        class: M_lifelog,
        name: 'M_lifelog',
        settingKey: 'lifelog-enable',
        logMessage: 'LifeLog模块加载'
    },
    M_Wps: {
        class: M_Wps,
        name: 'M_Wps',
        settingKey: 'wps-enable',
        logMessage: 'Wps模块加载'
    },

};

// 导出所有模块类型
export type ModuleClasses = {
    M_calendar?: M_calendar;
    M_sync?: M_sync;
    M_ai?: M_ai;
    M_handwriting?: M_handwriting;
    M_imageCompression?: M_imageCompression;
    M_lifelog?: M_lifelog;
    M_Wps?: M_Wps;
};
