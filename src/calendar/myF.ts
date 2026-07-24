import * as api from '@/api/api';
import { ViewItem } from '@/calendar/interface';
import * as sy from 'siyuan'
import { settingdata } from '@/index';
import { Calendar, DurationInput } from '@fullcalendar/core';
import { moduleInstances } from '@/index';
// Define interfaces for better type safety
import { ISelectOption } from "@/calendar/interface";
import { refetchPeerCalendars } from './calendar-runtime';
import {
    parseCategory,
    parseDescription,
    parseScheduleTime,
    parseTags,
    parseTaskList,
    parseTitle,
} from './quickadd';
// import { isEventCompleted } from './calendar';
import { createDailynote } from '@frostime/siyuan-plugin-kits';
import { getRequiredFields } from './fieldConfig';
import type { CalendarWriteReason } from './calendar-self-write';
import { markCalendarBlockWrite } from './calendar-self-write';
import { isSpecialCalendarSource } from './calendar-sources';

// ================== 自定义类型补充（轻量，不破坏现有引用） ==================
// 事件字段解析结果（行中的“事件”列）

// FullCalendar extendedProps 结构
export interface CalendarEventExtendedProps {
    blockId?: string;      // 块 id（界面 / 跳转）
    itemID?: string;      // AV 行 id（写入）
    kramdown?: string;
    iskramdown?: boolean;
    rootid?: string;
    status?: string;
    description?: string;
    isRecurring?: boolean;
    recurringPattern?: string;
    priority?: string;
    category?: string;
    tags?: string[];
    sub?: any;
    hasCircularRef?: boolean;
    statusid?: string;
    priorityid?: string;
    categoryid?: string;
    subid?: string;
    descriptionid?: string;
    allDayId?: string;
    okday?: string;
    okdayid?: string;
    Kstart?: Date;
    Kend?: Date | null;
    [k: string]: any; // 兼容其它动态字段
}

// FullCalendar 事件（我们只声明我们关心字段）
interface CalendarEventItem {
    id: string; // FullCalendar event id（保持块 id 便于定位）
    title: string;
    start: Date;
    end?: Date | null;
    allDay: boolean;
    rrule?: string;
    duration?: DurationInput;
    timeZone?: string;
    extendedProps: CalendarEventExtendedProps;
}
export interface UnscheduledEvent {
    blockId: string;
    itemID: string;
    rootid: string;
    title: string;
    status?: string;
    priority?: string;
    category?: string;
    tags?: string[];
    description?: string;
    timeKeyID?: string;
    allDayKeyID?: string;
    statusKeyID?: string;
    viewId?: string;
    viewName?: string;
    overdue?: boolean; // 新增：是否为“过期未完成”
}

let currentUnscheduledEvents: UnscheduledEvent[] = [];

export function setUnscheduledEvents(events: UnscheduledEvent[]): void {
    currentUnscheduledEvents = events;
}

export function getUnscheduledEvents(): UnscheduledEvent[] {
    return currentUnscheduledEvents;
}

export function findUnscheduledEvent(blockId: string, itemID?: string): UnscheduledEvent | undefined {
    return currentUnscheduledEvents.find(event => {
        const matchesBlock = event.blockId === blockId;
        if (itemID) {
            return matchesBlock && event.itemID === itemID;
        }
        return matchesBlock;
    });
}

export function removeUnscheduledEvent(target: UnscheduledEvent | { blockId?: string; itemID?: string }): void {
    if (!target) {
        return;
    }
    const blockId = (target as any)?.blockId as string | undefined;
    const itemID = (target as any)?.itemID as string | undefined;
    currentUnscheduledEvents = currentUnscheduledEvents.filter(event => {
        const blockMatch = blockId ? event.blockId === blockId : false;
        const itemMatch = itemID ? event.itemID === itemID : false;
        if (blockId && itemID) {
            return !(blockMatch && itemMatch);
        }
        if (blockId) {
            return !blockMatch;
        }
        if (itemID) {
            return !itemMatch;
        }
        return true;
    });
}

export async function scheduleUnscheduledEvent(event: UnscheduledEvent, dateStr: string, allDay: boolean): Promise<boolean> {
    if (!event) {
        sy.showMessage('未找到目标事件，无法安排', 3000, 'error');
        return false;
    }
    if (!event.timeKeyID) {
        sy.showMessage('未找到开始时间字段，无法安排事件', 3000, 'error');
        return false;
    }
    if (!dateStr) {
        sy.showMessage('未获取到有效的日期，无法安排事件', 3000, 'error');
        return false;
    }
    const formattedDate = allDay && dateStr && !dateStr.includes('T')
        ? `${dateStr}T00:00`
        : dateStr;
    try {
        const updateTasks: Promise<any>[] = [];
        const writeOpts = { source: 'calendar' as const, reason: 'unscheduled' as const };
        updateTasks.push(api.updateAttrViewCell_pro(
            event.blockId,
            event.rootid,
            event.timeKeyID,
            event.itemID,
            formattedDate,
            'date',
            undefined,
            writeOpts,
        ));
        if (event.allDayKeyID) {
            updateTasks.push(api.updateAttrViewCell_pro(
                event.blockId,
                event.rootid,
                event.allDayKeyID,
                event.itemID,
                allDay,
                'checkbox',
                undefined,
                writeOpts,
            ));
        }
        await Promise.all(updateTasks);
        // patch viewValueCache 让缓存与 UI 一致：start 字段必须是毫秒数，与 extractDataFromTable
        // 存储的 dateValue.content 一致；FullCalendar 那边的 ISO 字符串需要先转成 millis
        try {
            const startMs = formattedDate ? new Date(formattedDate).getTime() : null;
            patchViewValueRow(event.rootid, event.itemID, {
                '开始时间': {
                    start: Number.isFinite(startMs) ? startMs : null,
                    end: null,
                    hasEndDate: false,
                },
                '全天': { content: !!allDay },
            });
        } catch (e) { /* ignore cache patch failure */ }
        removeUnscheduledEvent(event);
        api.handleDidaListEvent(event.rootid, event.blockId, event.itemID);
        // 同步其他可见日历（drop 回调里已对发起 calendar 自身做了 refetch）
        refetchPeerCalendars(null);
        return true;
    } catch (error) {
        console.error('安排事件时出错:', error);
        sy.showMessage('安排事件失败，请稍后再试', 4000, 'error');
        return false;
    }
}
// ======================================================================

// 统一：获取用于写入属性的目标 ID（优先 itemID，其次 blockId）
export function resolveAttrTargetId(props: { itemID?: string; blockId: string }): string {
    return props.itemID || props.blockId;
}

export const statusMap = new Proxy({
    // 保留原有的映射关系作为已知状态
    "未完成": "todo",
    "完成": "done",
    "进行中": "inprogress",
    "归档": "archive",
}, {
    get: (target, prop) => {
        // 如果是已知状态，返回预设映射
        if (typeof prop === 'string' && prop in target) {
            return target[prop];
        }

        // 对于未知状态，生成一个规范化的代码
        if (typeof prop === 'string') {
            // 将中文或其他语言的状态名转换为英文标识符:
            // 1. 转换为小写
            // 2. 移除空格和特殊字符
            // 3. 如果是纯中文或其他非拉丁字符，使用拼音首字母或生成唯一标识
            const code = prop
                .toLowerCase()
                .replace(/\s+/g, '')
                .replace(/[^\w\u4e00-\u9fa5]/gi, '');

            // 如果处理后为空字符串，返回默认状态
            return code || 'todo';
        }

        // 任何异常情况返回默认状态
        return 'todo';
    }
});
// Return type using interface
type ViewData = Promise<ViewItem[]>;
// viewIdCache 缓存的是「AV 的视图清单（viewId/rootid/name）」——这本质是配置数据，
// 只有用户新建/删除/重命名视图时才变，变化频率极低。5 秒 TTL 会让每次 refetch（切月、
// 滚动、拖拽）都对所有 av_id 重新枚举一遍 renderAttributeView，是"只选 1 个视图也触发
// 多次 renderAttributeView"的主因。延长到 30 秒，视为准静态；需要刷新时走 invalidateViewIdCache。
const VIEW_ID_CACHE_TTL = 30 * 1000;
// viewValueCache 缓存的是行数据（事件/时间/状态），变化频繁，保持短 TTL；
// 自写已通过 patchViewValueRow 行级 patch 维持一致性，外部编辑走 invalidateViewValueCache。
const VIEW_VALUE_CACHE_TTL = 5000;
const viewIdCache = new Map<string, { ts: number; data: ViewItem[] }>();
const viewValueCache = new Map<string, { ts: number; data: any[] }>();
// "在途请求"映射：当多个日历实例同时刷新时，第一个调用方触发真实网络请求，
// 后来者直接 await 同一个 Promise，避免 N 个实例 = N 次 /api/av/renderAttributeView。
// 经典 single-flight / request coalescing 模式。
const viewIdInFlight = new Map<string, Promise<ViewItem[]>>();
const viewValueInFlight = new Map<string, Promise<any[]>>();

/**
 * 行级 patch：自写 AV 单元格成功后，把同一 row 在 viewValueCache 里的对应字段
 * 直接更新，避免下次 refetch 因为 5 秒 TTL 重发整张 view 拉数据。
 *
 * cacheKey 是 `${rootid}::${viewId}::${isZQ ? 1 : 0}::${type}`，所以同一 avID 下可能
 * 有多个 cache entry（不同 view / zq 周期表）。row 的 itemID 存在 row['事件'].itemID
 * （见 extractDataFromTable）。fieldPatch 的 key 必须与 row 字段名一致，例如
 * '开始时间'、'全天'、'状态'。值会与原对象浅合并。
 *
 * scope:
 *   'normal'（默认）只 patch 普通视图缓存；
 *   'zq' 只 patch 周期视图缓存；
 *   'both' 两者都 patch（仅当确实需要时使用）。
 * 周期事件的 '完成日期' 字段不存在于普通视图行，若不分隔会向普通缓存注入孤立字段。
 */
export function patchViewValueRow(
    avID: string,
    itemID: string,
    fieldPatch: Record<string, any>,
    scope: 'normal' | 'zq' | 'both' = 'normal',
): void {
    if (!avID || !itemID || !fieldPatch) return;
    let touched = 0;
    for (const [key, entry] of viewValueCache) {
        // cacheKey 形如 `${rootid}::${viewId}::${isZQ ? 1 : 0}::${type}`
        if (!key.startsWith(`${avID}::`)) continue;
        // 用 cacheKey 第三段判断 isZQ
        const segs = key.split('::');
        const isZQ = segs[2] === '1';
        if (scope === 'normal' && isZQ) continue;
        if (scope === 'zq' && !isZQ) continue;
        for (const row of entry.data) {
            if (row?.['事件']?.itemID !== itemID) continue;
            for (const [fieldName, patch] of Object.entries(fieldPatch)) {
                const orig = row[fieldName];
                if (orig && typeof orig === 'object' && typeof patch === 'object' && patch !== null) {
                    row[fieldName] = { ...orig, ...patch };
                } else {
                    row[fieldName] = patch;
                }
            }
            touched++;
        }
    }
    if (touched > 0) {
        console.debug(`[CalendarAVCache] patch row av=${avID} item=${itemID} scope=${scope} touchedRows=${touched}`, fieldPatch);
    }
}

/**
 * 失效 viewValueCache。不传参 → 全部清空；传 avID → 仅清该 av 下所有 view；
 * 同时传 viewId → 精确清除单个 cacheKey。用于无法做行级 patch 的字段写入或外部
 * SiYuan 编辑感知后的兜底。
 */
export function invalidateViewValueCache(avID?: string, viewId?: string): void {
    if (!avID) {
        viewValueCache.clear();
        return;
    }
    const prefix = viewId ? `${avID}::${viewId}::` : `${avID}::`;
    for (const key of Array.from(viewValueCache.keys())) {
        if (key.startsWith(prefix)) {
            viewValueCache.delete(key);
        }
    }
}

/**
 * 失效 viewIdCache。不传参 → 全部清空；传 avID → 仅清该 av 的视图清单。
 * AV 的视图清单变化频率极低（新建/删除/重命名视图），默认 30 秒 TTL 已覆盖绝大多数场景，
 * 仅在确认 AV 结构发生变更（例如外部新增了视图）时才需要手动调用。
 */
export function invalidateViewIdCache(avID?: string): void {
    if (!avID) {
        viewIdCache.clear();
        return;
    }
    viewIdCache.delete(avID);
}

// Get view IDs and names
export async function getViewId(va_ids: string[]): ViewData {
    const now = Date.now();
    const tasks = va_ids.map(async (va_id) => {
        const cached = viewIdCache.get(va_id);
        if (cached && (now - cached.ts) < VIEW_ID_CACHE_TTL) {
            return cached.data;
        }
        // 复用在途请求：避免多实例并发同时打 /api/av/renderAttributeView
        const inFlight = viewIdInFlight.get(va_id);
        if (inFlight) return inFlight;

        const promise = (async () => {
            try {
                const view = await api.renderAttributeView(va_id);
                // # https://github.com/loonghfut/siyuan-steve-tools/issues/6
                const rootname = view.name ? `${view.name}-` : "";
                const rootid = view.id;
                const data: ViewItem[] = view.views.map((viewItem) => ({
                    rootid: rootid,
                    viewId: viewItem.id,
                    name: rootname + viewItem.name
                }));
                viewIdCache.set(va_id, { ts: Date.now(), data });
                return data;
            } catch (error) {
                console.error(`Error processing view ${va_id}:`, error);
                return [] as ViewItem[];
            } finally {
                viewIdInFlight.delete(va_id);
            }
        })();
        viewIdInFlight.set(va_id, promise);
        return promise;
    });

    const results = await Promise.all(tasks);
    return results.flat();
}

//获取视图值
export async function getViewValue(viewIds_Data: ViewItem[], isZQ = false, type = "normal") {
    const now = Date.now();
    const tasks = viewIds_Data.map(async (viewId_Data) => {
        const cacheKey = `${viewId_Data.rootid}::${viewId_Data.viewId}::${isZQ ? 1 : 0}::${type}`;
        const cached = viewValueCache.get(cacheKey);
        if (cached && (now - cached.ts) < VIEW_VALUE_CACHE_TTL) {
            return { from: viewId_Data, data: cached.data };
        }
        // 复用在途请求：多实例同时 refetch 时只发一次网络请求，后来者复用同一个 Promise
        const inFlight = viewValueInFlight.get(cacheKey);
        if (inFlight) {
            const data = await inFlight;
            return { from: viewId_Data, data };
        }

        const promise = (async () => {
            try {
                const viewValue = await api.renderAttributeView(viewId_Data.rootid, viewId_Data.viewId);
                const data = await extractDataFromTable(viewValue.view, viewId_Data.rootid, isZQ, type);
                viewValueCache.set(cacheKey, { ts: Date.now(), data });
                return data;
            } catch (error) {
                console.error(`Error processing view ${viewId_Data.viewId}:`, error);
                return [] as any[];
            } finally {
                viewValueInFlight.delete(cacheKey);
            }
        })();
        viewValueInFlight.set(cacheKey, promise);
        const data = await promise;
        return { from: viewId_Data, data };
    });

    const viewValue_Data = await Promise.all(tasks);
    return viewValue_Data;
}



async function extractDataFromTable(data: any, avID: string, isZQ = false, type = "normal") {
    // console.debug("🚧🚧🚧🚧🚧🚧", data);
    const isGalleryView = data && data.hasOwnProperty('fields') && data.hasOwnProperty('cards');
    const isTableView = data && data.hasOwnProperty('columns') && data.hasOwnProperty('rows');
    // 兼容：含有 groups 的分组看板（看板分组后顶层 cards 为空，真实数据在 groups[i].cards 内）
    const hasGroups = Array.isArray(data?.groups) && data.groups.length > 0;
    const isGroupedGalleryView = isGalleryView && hasGroups && (!Array.isArray(data.cards) || data.cards.length === 0);
    // 兼容：含有 groups 的分组表格（顶层 rows 为空，真实数据在 groups[i].rows 内）
    const isGroupedTableView = isTableView && hasGroups && (!Array.isArray(data.rows) || data.rows.length === 0);

    if (!isGalleryView && !isTableView) {
        console.warn('Invalid or unrecognized data structure received:', data);
        return [];
    }

    // 定义需要的字段及其类型
    const requiredFields = getRequiredFields(isZQ, type);

    // 1. 创建字段映射
    // console.debug("DATA：", data);
    const fieldMap = new Map();
    // 分组看板优先使用顶层 fields，否则回退到第一个分组的 fields
    let fields = isGalleryView ? data.fields : data.columns;
    if (isGroupedGalleryView) {
        if (!fields || fields.length === 0) {
            fields = data.groups[0]?.fields || [];
        }
    } else if (isGroupedTableView) {
        if (!fields || fields.length === 0) {
            fields = data.groups[0]?.columns || [];
        }
    }
    fields.forEach((field: any, index: number) => {
        if (field && field.name) {
            fieldMap.set(field.name, {
                id: field.id,
                index: index // index is for Table view
            });
        }
    });

    // 2. 检查缺失的字段并创建（仅在启用自动创建功能时）
    if (settingdata["cal-auto-create-fields"]) {
        const missingFields: string[] = [];
        for (const [fieldName, _fieldType] of Object.entries(requiredFields)) {
            if (!fieldMap.has(fieldName)) {
                missingFields.push(fieldName);
            }
        }

        // 如果有缺失的字段，创建它们
        if (missingFields.length > 0) {
            console.debug(`检测到缺失的字段: ${missingFields.join(', ')}，正在自动创建...`);
            sy.showMessage(`检测到缺失的字段: ${missingFields.join(', ')}，正在自动创建...`);
            sy.showMessage(`数据库字段创建后，请不要删除，无用字段请自行隐藏`, -1, "error");
            try {
                for (const fieldName of missingFields) {
                    const fieldType = requiredFields[fieldName];
                    await api.addAttributeViewKey(avID, fieldName, fieldType);
                    console.debug(`成功创建字段: ${fieldName} (类型: ${fieldType})`);
                }

                // 重新获取视图数据以包含新创建的字段
                const updatedViewValue = await api.renderAttributeView(avID);
                const updatedData = updatedViewValue.view;

                // 更新字段映射
                fieldMap.clear();
                const updatedFields = isGalleryView ? updatedData.fields : updatedData.columns;
                updatedFields.forEach((field: any, index: number) => {
                    if (field && field.name) {
                        fieldMap.set(field.name, {
                            id: field.id,
                            index: index
                        });
                    }
                });

                // 使用更新后的数据
                data = updatedData;
            } catch (error) {
                console.error('创建字段时出错:', error);
                // 即使创建字段失败，也继续处理现有数据
            }
        }
    }

    // 3. 提取数据
    // 如果是分组看板，聚合所有分组内的 cards
    let items;
    if (isGalleryView) {
        items = isGroupedGalleryView
            ? data.groups.flatMap((g: any) => (Array.isArray(g.cards) ? g.cards : []))
            : data.cards;
    } else { // table view
        items = isGroupedTableView
            ? data.groups.flatMap((g: any) => (Array.isArray(g.rows) ? g.rows : []))
            : data.rows;
    }
    if (!items || !Array.isArray(items)) {
        return [];
    }

    try {
        const result = items.map((item: any) => {
            const rowData: any = {};
            let getCell;

            if (isGalleryView) {
                // For Gallery view, create a map from keyID to value for quick lookup
                const valueMap = new Map();
                item.values.forEach((v: any) => {
                    if (v.value?.keyID) {
                        valueMap.set(v.value.keyID, v.value);
                    }
                });
                getCell = (fieldName: string) => {
                    const field = fieldMap.get(fieldName);
                    return field ? valueMap.get(field.id) : undefined;
                };
            } else { // isTableView
                // For Table view, get cell by index
                getCell = (fieldName: string) => {
                    const field = fieldMap.get(fieldName);
                    return field && item.cells ? item.cells[field.index]?.value : undefined;
                };
            }

            try {
                // 提取事件
                const eventCell = getCell('事件');
                // console.debug("eventCell:", eventCell);
                if (eventCell) {
                    rowData['事件'] = {
                        content: eventCell.block?.content || '',
                        id: eventCell.block?.id || item.id || '', // Fallback to item.id for gallery
                        keyID: eventCell.keyID || '',
                        itemID: eventCell.blockID || ''
                    };
                }

                // 提取开始时间
                const timeCell = getCell('开始时间');
                if (timeCell) {
                    const dateValue = timeCell.date;
                    rowData['开始时间'] = {
                        start: dateValue?.content || null,
                        end: dateValue?.hasEndDate ? (dateValue?.content2 || null) : null,
                        keyID: timeCell.keyID || '',
                        hasEndDate: dateValue?.hasEndDate || false
                    };
                }

                // 提取优先级
                const priorityCell = getCell('优先级');
                if (priorityCell) {
                    rowData['优先级'] = {
                        content: priorityCell.mSelect?.[0]?.content || '',
                        keyID: priorityCell.keyID || ''
                    };
                }

                // 提取分类
                const categoryCell = getCell('分类');
                if (categoryCell) {
                    rowData['分类'] = {
                        content: categoryCell.mSelect?.[0]?.content || '',
                        keyID: categoryCell.keyID || ''
                    };
                }

                // 提取标签
                const tagCell = getCell('标签');
                if (tagCell) {
                    // console.debug("tagCell:::", tagCell);
                    rowData['标签'] = {
                        content: tagCell.mSelect?.map((item: ISelectOption) => item.content) || [],
                        keyID: tagCell.keyID || ''
                    };
                }

                // 提取子级 (关联)
                const subCell = getCell('关联');
                if (subCell) {
                    rowData['子级'] = {
                        contents: subCell.relation?.contents || '',
                        ids: subCell.relation?.blockIDs || '',
                        keyID: subCell.keyID || '',
                    };
                }

                //提取是否主事件
                const mainCell = getCell('主事件');
                if (mainCell) {
                    rowData['主事件'] = {
                        content: mainCell.checkbox?.checked || false,
                        keyID: mainCell.keyID || ''
                    };
                }

                //提取链接
                const linkCell = getCell('链接');
                if (linkCell) {
                    rowData['链接'] = {
                        content: linkCell.url?.content || '',
                        keyID: linkCell.keyID || ''
                    };
                }

                //提取是否全天事件
                const allDayCell = getCell('全天');
                if (allDayCell) {
                    rowData['全天'] = {
                        content: allDayCell.checkbox?.checked || false,
                        keyID: allDayCell.keyID || ''
                    };
                }

                // 提取状态或周期性事件的字段
                if (isZQ) {
                    const ruleCell = getCell('重复规则');
                    rowData['重复规则'] = {
                        content: ruleCell?.text?.content || '',
                        keyID: ruleCell?.keyID || ''
                    };

                    const numCell = getCell('持续时间');
                    rowData['持续时间'] = {
                        content: numCell?.number?.content || '',
                        keyID: numCell?.keyID || ''
                    };

                    const endCell = getCell('完成日期');
                    rowData['完成日期'] = {
                        content: endCell?.text?.content || '',
                        keyID: endCell?.keyID || ''
                    };
                } else {
                    const statusCell = getCell('状态');
                    if (statusCell) {
                        rowData['状态'] = {
                            content: statusCell.mSelect?.[0]?.content || '',
                            keyID: statusCell.keyID || ''
                        };
                    }
                }

                // 提取描述
                const descCell = getCell('描述');
                if (descCell) {
                    rowData['描述'] = {
                        content: descCell.text?.content || '',
                        keyID: descCell.keyID || ''
                    };
                }

                // 2025/7/5新增：提取 didaID
                const didaIdCell = getCell('didaID');
                if (didaIdCell) {
                    rowData['didaID'] = {
                        content: didaIdCell.text?.content || '',
                        keyID: didaIdCell.keyID || ''
                    };
                }
                // console.debug("rowData:::", rowData);
                return rowData;
            } catch (error) {
                console.error('Error processing row/card:', item, error);
                return {};
            }
        });
        // console.debug("extractDataFromTable🛠️🛠️ result:::", result);
        return result;
    } catch (error) {
        console.error('Error in extractDataFromTable:', error);
        return [];
    }
}

//筛选事件函数
export async function filterViewValue(viewValue, filterKeys: string[] = []) {
    // 如果 filterKeys 为空数组，返回所有数据
    if (!filterKeys || filterKeys.length === 0) {
        return viewValue;
    }
    // console.debug("filterKeys:::", filterKeys);
    // 筛选出匹配任一 ID 的视图
    const filteredViewValue = viewValue.filter(item =>
        filterKeys.includes(item.from.viewId)
    );

    // 只选择特殊来源时，思源视图为空是正常情况。
    const onlySpecialSelected = filterKeys.every(isSpecialCalendarSource);
    if (filteredViewValue.length === 0 && !onlySpecialSelected) {
        sy.showMessage('未找到匹配的视图，请重新选择', -1, "error");
    }

    return filteredViewValue;
}



//OK解决事件重复问题
//转换数据格式
// 预取所有“主事件”块的 kramdown 文本。
// 原实现会在循环内逐个 await api.getBlockKramdown（串行 N+1，事件多时显著拖慢）。
// 这里收集所有需要获取的 blockId，一次性 Promise.all 并行拉取，按 blockId 缓存结果。
// 对空/未传入的 viewData 直接返回空 Map，行为与原循环内跳过逻辑一致。
async function prefetchKramdownForMainEvents(viewData: any[] | null | undefined): Promise<Map<string, string>> {
    const cache = new Map<string, string>();
    if (!viewData || !Array.isArray(viewData)) return cache;

    // 收集所有需要预取的块 id（与原循环内的条件保持一致：块 id 存在且为主事件）
    const blockIds: string[] = [];
    for (const view of viewData) {
        if (!view?.data) continue;
        for (const item of view.data) {
            const eventBlockId = item['事件']?.id || '';
            if (eventBlockId && (item['主事件']?.content || false) && !cache.has(eventBlockId)) {
                cache.set(eventBlockId, ''); // 占位，避免重复收集
                blockIds.push(eventBlockId);
            }
        }
    }
    if (blockIds.length === 0) return cache;

    // 并行获取；单条失败不影响其它条目（与原先 try 包裹的整体语义保持宽松兼容）
    const results = await Promise.all(
        blockIds.map(async (blockId) => {
            try {
                const res = await api.getBlockKramdown(blockId);
                return [blockId, res?.kramdown || ''] as const;
            } catch (e) {
                console.warn('预取 kramdown 失败:', blockId, e);
                return [blockId, ''] as const;
            }
        })
    );
    for (const [blockId, kramdown] of results) {
        cache.set(blockId, kramdown);
    }
    return cache;
}

export async function convertToFullCalendarEvents(viewData: any[], viewData_zq: any[]): Promise<CalendarEventItem[]> {
    const events: CalendarEventItem[] = [];
    const addedEventIds = new Set<string>();
    const unscheduledCollector: UnscheduledEvent[] = [];
    // console.debug("viewData:::", viewData);

    // 预取所有“主事件”块的 kramdown：原先在循环内逐个 await（串行 N+1），
    // 改为一次性 Promise.all 并行获取，按 blockId 缓存结果。行为完全等价，仅提升并发度。
    const kramdownCache = await prefetchKramdownForMainEvents(viewData);
    const kramdownCache_zq = await prefetchKramdownForMainEvents(viewData_zq);

    // 处理普通事件（界面展示与跳转使用块 id，数据库更新使用 itemID）
    for (const view of viewData) {
        for (const item of view.data) {
            const eventBlockId = item['事件']?.id || '';
            const eventItemId = item['事件']?.itemID || '';
            const uniqId = eventItemId || eventBlockId; // 用于去重，优先使用 itemID

            if (uniqId && !addedEventIds.has(uniqId)) {
                addedEventIds.add(uniqId);

                // 检查是否设置了开始时间
                const hasStartTime = item['开始时间']?.start;
                if (!hasStartTime) {
                    if (eventBlockId) {
                        unscheduledCollector.push({
                            blockId: eventBlockId,
                            itemID: eventItemId || eventBlockId,
                            rootid: view.from.rootid,
                            title: item['事件']?.content || '',
                            status: item['状态']?.content || '',
                            priority: item['优先级']?.content || '',
                            category: item['分类']?.content || '',
                            tags: Array.isArray(item['标签']?.content) ? item['标签'].content : [],
                            description: item['描述']?.content || '',
                            timeKeyID: item['开始时间']?.keyID,
                            allDayKeyID: item['全天']?.keyID,
                            statusKeyID: item['状态']?.keyID,
                            viewId: view.from.viewId,
                            viewName: view.from.name,
                            overdue: false,
                        });
                    }
                    continue;
                }
                const startDate = hasStartTime
                    ? new Date(parseInt(item['开始时间'].start))
                    : new Date(new Date().setHours(8, 0, 0, 0));
                const endDate = item['开始时间']?.end ? new Date(parseInt(item['开始时间'].end)) : null;

                // 优先判断逻辑：
                // 1. 首先判断是否有开始时间，没有则直接为全天事件
                // 2. 然后使用数据库中的全天设置
                // 3. 最后按时间判断（0点为全天事件）
                const isAllDay = !hasStartTime
                    ? true
                    : (item['全天']?.content !== undefined
                        ? item['全天'].content
                        : (startDate.getHours() === 0 && startDate.getMinutes() === 0 &&
                            (!endDate || (endDate.getHours() === 0 && endDate.getMinutes() === 0))));

                let kramdown = "";
                if (eventBlockId && (item['主事件']?.content || false)) {
                    kramdown = kramdownCache.get(eventBlockId) || '';
                }
                events.push({
                    id: eventBlockId, // FullCalendar 的事件 id 仍使用块 id 方便定位
                    title: item['事件']?.content || '',
                    start: startDate,
                    end: endDate,
                    allDay: isAllDay,
                    extendedProps: {
                        blockId: eventBlockId, // 原块 id（跳转用）
                        itemID: eventItemId,   // 数据库条目 id（写入/更新用）
                        kramdown: kramdown,
                        iskramdown: item['主事件']?.content || false,
                        rootid: view.from.rootid,
                        status: item['状态']?.content || '',
                        description: item['描述']?.content || '',
                        isRecurring: false,
                        priority: item['优先级']?.content || '无',
                        category: item['分类']?.content || '无',
                        tags: Array.isArray(item['标签']?.content) ? item['标签'].content : [],
                        sub: item['子级'] || '',
                        hasCircularRef: false,
                        statusid: item['状态']?.keyID || '',
                        priorityid: item['优先级']?.keyID || '',
                        categoryid: item['分类']?.keyID || '',
                        subid: item['子级']?.keyID || '',
                        descriptionid: item['描述']?.keyID || '',
                        allDayId: item['全天']?.keyID || '',
                        Kstart: startDate,
                        Kend: endDate,
                    }
                });

                // 新增：将“已过期且未完成”的事件也加入待安排列表
                // 判定逻辑：
                // - 状态不是“完成”
                // - 若有结束时间，则以结束时间判断是否过期；否则以开始时间判断
                try {
                    const statusVal = (item['状态']?.content || '').trim();
                    // 将“完成”与“归档”都视作已完成，避免把归档项计入待安排
                    const isDone = statusVal === '完成' || statusVal === '归档';
                    if (!isDone && hasStartTime) {
                        const now = Date.now();
                        const endOrStart = (endDate ? endDate.getTime() : startDate.getTime());
                        const isOverdue = endOrStart < now;
                        if (isOverdue) {
                            unscheduledCollector.push({
                                blockId: eventBlockId,
                                itemID: eventItemId || eventBlockId,
                                rootid: view.from.rootid,
                                title: item['事件']?.content || '',
                                status: statusVal,
                                priority: item['优先级']?.content || '',
                                category: item['分类']?.content || '',
                                tags: Array.isArray(item['标签']?.content) ? item['标签'].content : [],
                                description: item['描述']?.content || '',
                                timeKeyID: item['开始时间']?.keyID,
                                allDayKeyID: item['全天']?.keyID,
                                statusKeyID: item['状态']?.keyID,
                                viewId: view.from.viewId,
                                viewName: view.from.name,
                                overdue: true,
                            });
                        }
                    }
                } catch (e) {
                    // 安全兜底，不影响主流程
                    console.warn('判定过期未完成事件时出错', e);
                }
            }
        }
    }

    // 处理周期事件
    if (viewData_zq) {
        for (const view of viewData_zq) {
            for (const item of view.data) {
                const eventBlockId = item['事件']?.id || '';
                const eventItemId = item['事件']?.itemID || '';
                const uniqId = eventItemId || eventBlockId;

                if (uniqId && !addedEventIds.has(uniqId)) {
                    addedEventIds.add(uniqId);

                    // 检查是否设置了开始时间
                    const hasStartTime = item['开始时间']?.start;
                    const startDate = hasStartTime
                        ? new Date(parseInt(item['开始时间'].start))
                        : new Date(new Date().setHours(0, 0, 0, 0));
                    const endDate = item['开始时间']?.end ? new Date(parseInt(item['开始时间'].end)) : null;
                    // steveTools.outlog("startDate:::", startDate, "endDate:::", endDate);
                    // 对于周期事件，如果没有设置开始时间，默认为全天事件
                    const isAllDay = !hasStartTime;
                    // (startDate.getHours() === 0 && startDate.getMinutes() === 0 &&
                    //     (!endDate || (endDate.getHours() === 0 && endDate.getMinutes() === 0))) ||
                    // (endDate && startDate.getTime() === endDate.getTime());

                    // 计算 duration：
                    // - 非全天事件用“分钟”
                    // - 全天事件用“天”（FullCalendar 要求）
                    let durationMinutes: number;
                    if (endDate) {
                        // 有结束时间：按开始/结束差值计算分钟数
                        durationMinutes = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60)));
                    } else {
                        // 无结束时间：使用“持续时间”字段（默认按小时）
                        const durationHours = parseFloat(item['持续时间']?.content) || 1;
                        durationMinutes = Math.max(1, Math.round(durationHours * 60));
                    }
                    // FullCalendar 的 rrule 事件 duration 需要传 DurationInput：
                    // - 全天：{ days: n }
                    // - 非全天：{ minutes: n }
                    const durationObj = isAllDay
                        ? { days: Math.max(1, Math.ceil(durationMinutes / (60 * 24))) }
                        : { minutes: durationMinutes };

                    const rruleStr = item['重复规则']?.content
                        ? `DTSTART:${startDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z\n${item['重复规则'].content}`
                        : '';
                    if (!rruleStr) { continue; }

                    // 获取 kramdown 内容
                    let kramdown = "";
                    if (eventBlockId && (item['主事件']?.content || false)) {
                        kramdown = kramdownCache_zq.get(eventBlockId) || '';
                    }

                    events.push({
                        id: eventBlockId,
                        title: item['事件']?.content || '',
                        start: startDate,
                        // end: endDate, // 对于rrule事件，不设置end（那是系列结束时间）
                        timeZone: 'local',
                        allDay: isAllDay,
                        rrule: rruleStr,
                        duration: durationObj,
                        extendedProps: {
                            blockId: eventBlockId,
                            itemID: eventItemId,
                            rootid: view.from.rootid,
                            kramdown: kramdown,
                            status: '未完成',
                            description: item['描述']?.content || '',
                            priority: item['优先级']?.content || '无',
                            category: item['分类']?.content || '无',
                            tags: Array.isArray(item['标签']?.content) ? item['标签'].content : [],
                            isRecurring: true,
                            recurringPattern: item['重复规则']?.content || '',
                            okday: item['完成日期']?.content || '',
                            okdayid: item['完成日期']?.keyID || '',
                            ////////////////////////////////////////
                            // statusid: item['状态']?.keyID || '',
                            priorityid: item['优先级']?.keyID || '',
                            categoryid: item['分类']?.keyID || '',
                            subid: item['子级']?.keyID || '',
                            descriptionid: item['描述']?.keyID || '',
                            Kstart: startDate,
                            Kend: endDate,
                            sub: item['子级'] || '',
                            // hasCircularRef: false
                        }
                    });
                }
            }
        }
    }
    setUnscheduledEvents(unscheduledCollector);
    return events;
}
//查看事件
//@param forceSeeMore 是否强制使isSeeMore生效
export async function showEvent(blockID, _rootId?, isSeeMore = false, forceSeeMore = false, qu_fan = false) {
    //// 判断是否存在此块
    let seemore = false;
    if (!forceSeeMore) {
        seemore = settingdata["cal-seemore"] || isSeeMore;
    } else {
        seemore = isSeeMore;
    }
    if (qu_fan) {
        seemore = !seemore;
    }
    const block = await api.getBlockByID(blockID);
    if (!block) {
        sy.showMessage('未找到此块');
        return;
    }
    if (!seemore) {
        await sy.openTab({
            app: window.siyuan.ws.app,
            doc: {
                id: blockID,
                action: ["cb-get-all", "cb-get-focus"],
                zoomIn: true
            },
            // position: "right",
            // keepCursor: false
        });

    } else {
        // const dialog = new sy.Dialog({
        //     title: `事件详情`,
        //     content: '<div id="eventPanel-show"></div>',
        //     width: '500px',
        //     height: 'auto',
        //     destroyCallback: async (option) => {
        //         // console.debug("ishandle",option?.ishandle)
        //         if (option?.ishandle) {
        //         } else {
        //         }
        //     },
        //     hideCloseIcon: true,
        //     // disableClose: true,
        // });
        // const eventPanel = document.getElementById('eventPanel-show');
        // new sy.Protyle(window.siyuan.ws.app, eventPanel, {
        //     blockId: blockID,
        //     rootId: blockID,
        //     render: {
        //         breadcrumb: false,
        //     },
        //     action: ["cb-get-focus",],
        //     mode: "wysiwyg",
        //     // action: ["cb-get-focus"],
        //     after: () => {
        //         if (seemore) {
        //             // console.debug(panel.protyle);
        //             const parentElement = document.getElementById('eventPanel-show');
        //             // console.debug("parentElement", parentElement);
        //             if (parentElement) {
        //                 const targetElement = parentElement.querySelector('.popover__block') && parentElement.querySelector(`[data-av-id="${rootId}"]`);
        //                 // const targetElement = parentElement.querySelector(`[data-av-id="${rootId}"]`);
        //                 // console.debug("找到目标元素:", targetElement);
        //                 if (targetElement) {
        //                     (targetElement as HTMLElement).click();
        //                     dialog.destroy({ ishandle: "1" });
        //                 }
        //             }
        //         }
        //     }

        // });
        const data = await api.getBlockAttrs(blockID);
        sy.openAttributePanel({
            data: data,
            focusName: "av",
            protyle: new sy.Protyle(window.siyuan.ws.app, document.createElement('div'), {
                blockId: blockID,
                rootId: blockID,
            }).protyle,
        })
    }
}

// 添加数据到思源数据库
//// 调用思源API创建块，块的内容为用户添加事件的面板
//// 将新创建的块添加到数据库中
//// 并设置此块的数据库属性，属性的值来源于用户添加事件的面板
//// 尽量使用思源的api实现
export async function createEventInDatabase(//OK:加一个是否刷新日历的参数
    dateStr: string,
    // databaseId?: string,
    calendar: Calendar,
    viewValue,
    db_id?: string,
    status = "",
    direct = { isdirect: false, directid: "" },
    isrefresh = true
) {


    let isok = false;
    status = status || "未完成";
    const to_db_id = db_id || settingdata["cal-db-id"];

    // steveTools.outlog("viewValue:::createEventInDatabase", viewValue);
    function formatDateWithTime(dateStr: string, hour: number = 8): string {
        // 如果日期字符串已经包含时间部分，直接返回原值
        if (dateStr.includes('T')) {
            return dateStr;
        }
        // 确保日期格式为 YYYY-MM-DD
        const date = dateStr.split('T')[0];
        // 添加8点
        return `${date}T${hour.toString().padStart(2, '0')}:00`;
    }
    // 1. 创建面板HTML
    //// 获取当前日期的日记块ID
    //加一个错误判断
    if (!settingdata["cal-create-pos"] || !settingdata["cal-db-id"]) {
        sy.showMessage('请先设置日程创建位置和日程创建数据库');
        return;
    }
    if (direct.isdirect) {
        // console.debug("createEventInDatabase:::", await checkBlockInEvent(direct.directid, to_db_id));
        const itemID = await api.generateSiyuanID() as string; //直接使用块ID作为itemID
        if (await checkBlockInEvent(direct.directid, to_db_id)) {
            console.debug("目标数据库已存在此事件");
            return;
        }
        //块时间处理
        const blockdata = await api.getBlockKramdown(direct.directid);
        // console.debug("blockdata:::", blockdata.kramdown);
        const ce = parseScheduleTime(blockdata?.kramdown);
        const minsub = parseTaskList(blockdata?.kramdown);
        const categorie = parseCategory(blockdata?.kramdown);
        const tags = parseTags(blockdata?.kramdown);
        const note = parseDescription(blockdata?.kramdown);
        const title = parseTitle(blockdata?.kramdown);
        console.debug("title:::", title);
        let ismain = false;
        if (minsub.length > 0) {
            ismain = true;
        }
        if (ce) {
            dateStr = ce;
            // console.debug("ce:::", ce);
        }
        // console.debug("dateStr:::", dateStr);
        //块时间处理

        await api.addBlockToDatabase_pro(direct.directid, to_db_id, itemID);
        const timeKeyID = await getKeyIDfromViewValue(viewValue, '开始时间', to_db_id);
        const statusKeyID = await getKeyIDfromViewValue(viewValue, '状态', to_db_id);
        const checkboxKeyID = await getKeyIDfromViewValue(viewValue, '主事件', to_db_id);
        const allDayKeyID = await getKeyIDfromViewValue(viewValue, '全天', to_db_id);
        const categoryKeyID = await getKeyIDfromViewValue(viewValue, '分类', to_db_id);
        const tagsKeyID = await getKeyIDfromViewValue(viewValue, '标签', to_db_id);
        const noteKeyID = await getKeyIDfromViewValue(viewValue, '描述', to_db_id);
        const titleKeyID = await getKeyIDfromViewValue(viewValue, '事件', to_db_id);
        const priorityKeyID = await getKeyIDfromViewValue(viewValue, '优先级', to_db_id);
        if (titleKeyID && title) {
            console.debug("titleKeyID:::", titleKeyID);
            await api.updatemainkey({
                avID: to_db_id,
                blockID: direct.directid,
                keyID: titleKeyID,
                itemID: itemID,
                content: title,
            });
        }
        // 批量更新：不使用 await，让请求积累到队列中
        const updatePromises: Promise<any>[] = [];
        // 全部 cell 写入打 self-write 标记，让 transactionListener 与 post-batch refresh 跳过；
        // 创建末尾会用 invalidateViewValueCache + refetchVisibleCalendarsDebounced 主动同步 UI
        const createOpts = { source: 'calendar' as const, reason: 'create' as const };

        if (categoryKeyID && categorie) {
            const categoryData: ISelectOption[] = [{ content: categorie }];
            updatePromises.push(api.updateAttrViewCell_pro(direct.directid, to_db_id, categoryKeyID, itemID, categoryData, "select", undefined, createOpts));
        }
        if (tagsKeyID && tags) {
            const tagsData: ISelectOption[] = tags.map(tag => ({ content: tag }));
            updatePromises.push(api.updateAttrViewCell_pro(direct.directid, to_db_id, tagsKeyID, itemID, tagsData, "mSelect", undefined, createOpts));
        }
        if (noteKeyID && note) {
            updatePromises.push(api.updateAttrViewCell_pro(direct.directid, to_db_id, noteKeyID, itemID, note, "text", undefined, createOpts));
        }
        updatePromises.push(api.updateAttrViewCell_pro(direct.directid, to_db_id, timeKeyID, itemID, dateStr, "date", undefined, createOpts));

        const selectdata: ISelectOption[] = [{ content: status }];
        // console.debug("selectdata", selectdata);
        // 2025/7/5新增默认添加优先级
        updatePromises.push(api.updateAttrViewCell_pro(direct.directid, to_db_id, priorityKeyID, itemID, [{ content: "无" }], "select", undefined, createOpts));
        updatePromises.push(api.updateAttrViewCell_pro(direct.directid, to_db_id, statusKeyID, itemID, selectdata, "select", undefined, createOpts));
        // 设置自定义属性
        markCalendarBlockWrite(direct.directid, 'create');
        api.setBlockAttrs(direct.directid, { 'custom-st-event': statusMap[status] });

        updatePromises.push(api.updateAttrViewCell_pro(direct.directid, to_db_id, checkboxKeyID, itemID, ismain, "checkbox", undefined, createOpts));
        // 默认设置为非全天事件
        if (allDayKeyID) {
            updatePromises.push(api.updateAttrViewCell_pro(direct.directid, to_db_id, allDayKeyID, itemID, false, "checkbox", undefined, createOpts));
        }

        // 等待所有更新完成
        await Promise.all(updatePromises);
        // create 新行：失效缓存让后续 refetch 能看到
        try { invalidateViewValueCache(to_db_id); } catch (e) { /* ignore */ }
        sy.showMessage('已添加事件', 2000, "info", "1");
        // 滴答更新
        api.handleDidaListEvent(to_db_id, direct.directid, itemID);
        return true;
    }

    //// 创建一个新块
    let daynote_id;
    if (settingdata["cal-create-for-date"]) {
        daynote_id = await createDailynote(settingdata["cal-create-pos"], new Date(dateStr));
    } else {
        daynote_id = (await api.createDailyNote(window.siyuan.ws.app.appId, settingdata["cal-create-pos"])).id;
    }
    ////检查是否创建成功
    if (!daynote_id) {
        sy.showMessage('未找到日记块');
        return;
    }
    const idid = await api.generateSiyuanID() as string;

    await api.appendBlock("markdown", `{{{row
#### 
{: id="${await api.generateSiyuanID() as string}"}

{: id="${await api.generateSiyuanID() as string}"}
}}}
{: id="${idid}"  custom-st-event="${statusMap[status] || 'todo'}"}`, daynote_id)
    // const id = iddata[0].doOperations[0].id;
    const id = idid;
    const itemID = await api.generateSiyuanID() as string;
    // // steveTools.outlog("iddata:::", iddata[0].doOperations[0].id);
    // console.debug("dateStr:::", dateStr, "databaseId:::", to_db_id);
    const dialog = new sy.Dialog({
        title: `   <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <span>添加事件</span>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <select id="st-priority" class="b3-text-field" style="padding: 4px; font-size: 12px; width: auto; text-align: center;">
                                    <option value="" selected>加载中...</option>
                                </select>
                                <select id="st-category" class="b3-text-field" style="padding: 4px; font-size: 12px; width: auto; text-align: center;">
                                    <option value="" selected>加载中...</option>
                                </select>
                                <div style="display: flex; align-items: center;">
                                    <input type="datetime-local" 
                                    id="st-start-time"
                                    class="b3-text-field" 
                                    style="padding: 4px; font-size: 12px; width: 130px;"
                                    value="${formatDateWithTime(dateStr)}"/>
                                </div>
                                <label style="display: flex; align-items: center; gap: 2px; font-size: 12px;">
                                    <input type="checkbox" id="st-all-day" style="margin: 0;">
                                    全天
                                </label>
                                <button class="b3-button b3-button--text" style="padding: 4px 8px; font-size: 12px;">提交</button>
                                <button class="b3-button b3-button--cancel" style="padding: 4px 8px; font-size: 12px;">取消</button>
                            </div>
                           </div>`,
        content: '<div id="eventPanel"></div>',
        width: '700px',
        height: 'auto',
        destroyCallback: async () => {
            if (!isok) {
                sy.showMessage('已取消添加事件');
                // await api.deleteBlock(id); //已知缺陷
                setTimeout(async () => await api.deleteBlock(id), 1500);//防崩
            }
            cancelBtn.removeEventListener('click', handleCancel);
            okBtn.removeEventListener('click', handleKeydown);
        },
        hideCloseIcon: true,
        // disableClose: true,
    })
    // 加载分类选项
    const categorySelect = dialog.element.querySelector('#st-category') as HTMLSelectElement;
    await loadCategoryOptions(to_db_id, categorySelect);
    // 加载优先级选项
    const prioritySelect = dialog.element.querySelector('#st-priority') as HTMLSelectElement;
    await loadPriorityOptions(to_db_id, prioritySelect);

    // 添加全天选项的交互逻辑
    const allDayCheckbox = dialog.element.querySelector('#st-all-day') as HTMLInputElement;
    const startTimeInput = dialog.element.querySelector('#st-start-time') as HTMLInputElement;

    allDayCheckbox.addEventListener('change', () => {
        if (allDayCheckbox.checked) {
            // 全天事件：设置为当天00:00
            const currentDate = startTimeInput.value.split('T')[0];
            startTimeInput.value = `${currentDate}T00:00`;
        }
    });
    ///////
    let ok = false;//防崩溃
    const eventPanel = document.getElementById('eventPanel');
    const okBtn = dialog.element.querySelector('.b3-button--text');
    const cancelBtn = dialog.element.querySelector('.b3-button--cancel');
    const handleCancel = () => {
        dialog.destroy();
    };


    const handleKeydown = async (e: KeyboardEvent) => {//添加事件主代码
        // console.debug(e);
        if (e.type === 'click' && !ok) { sy.showMessage('请先输入内容') }
        if ((e.key === 'Enter' && e.ctrlKey && ok) || e.type === 'click' && ok) {
            e.preventDefault();
            window.siyuan.ws.ws.removeEventListener('message', messageHandler);
            // await new Promise(resolve => setTimeout(resolve, 100));
            isok = true;
            panel.protyle.element.removeEventListener('keydown', handleKeydown);
            // 删除空白块
            //// 获取块内容
            const block = await api.getBlockByID(id);
            //// 如果块内容为空，则删除块
            // // steveTools.outlog("block:::", block.markdown);
            const markdownContent = block?.markdown?.trim() || '';
            // console.debug(markdownContent);
            if (/^\{\{\{row\s*\}\}\}$/m.test(markdownContent)) {
                await api.deleteBlock(id);
                // steveTools.outlog('删除空白块');
                dialog.destroy();
                sy.showMessage('已取消添加事件');
                return;
            }
            // 添加到日历
            //2025-02-12 修改：添加到数据库通过{: custom-avs="数据库ID"}属性实现
            //放弃：不稳定
            //// 将块加入到数据库
            await api.addBlockToDatabase_pro(id, to_db_id, itemID);
            // 添加数据库属性
            //// 添加时间和状态属性
            const timeKeyID = await getKeyIDfromViewValue(viewValue, '开始时间', to_db_id);
            const categoryKeyID = await getKeyIDfromViewValue(viewValue, '分类', to_db_id);
            const tagsKeyID = await getKeyIDfromViewValue(viewValue, '标签', to_db_id);
            const priorityKeyID = await getKeyIDfromViewValue(viewValue, '优先级', to_db_id);
            const checkboxKeyID = await getKeyIDfromViewValue(viewValue, '主事件', to_db_id);
            const allDayKeyID = await getKeyIDfromViewValue(viewValue, '全天', to_db_id);
            const statusKeyID = await getKeyIDfromViewValue(viewValue, '状态', to_db_id);
            const noteKeyID = await getKeyIDfromViewValue(viewValue, '描述', to_db_id);
            //// 新：用户自定义改动开始时间,优先级,分类
            const category2 = (document.getElementById('st-category') as HTMLSelectElement).value;
            const newdateStr = (document.getElementById('st-start-time') as HTMLInputElement).value
            const priority = (document.getElementById('st-priority') as HTMLSelectElement).value;
            const isAllDay = (document.getElementById('st-all-day') as HTMLInputElement).checked;
            if (newdateStr) {
                dateStr = newdateStr;
            }
            ////块时间处理
            const blockdata = await api.getBlockKramdown(id);
            const ce = parseScheduleTime(blockdata?.kramdown);
            const minsub = parseTaskList(blockdata?.kramdown);
            const category1 = parseCategory(blockdata?.kramdown);
            const tags = parseTags(blockdata?.kramdown);
            const note = parseDescription(blockdata?.kramdown);
            // 手动输入分类优先
            const category = category1 || category2;
            let ismain = false;
            // console.debug("minsub", minsub);
            if (minsub.length > 0) {
                ismain = true;
            }
            if (ce) {
                dateStr = ce;
            }
            ////块时间处理 - 批量更新优化
            const updatePromises2: Promise<any>[] = [];
            // 全部 cell 写入打 self-write 标记，让 transactionListener 与 post-batch refresh 跳过
            const createOpts2 = { source: 'calendar' as const, reason: 'create' as const };

            updatePromises2.push(api.updateAttrViewCell_pro(id, to_db_id, timeKeyID, itemID, dateStr, "date", undefined, createOpts2));

            const selectdata: ISelectOption[] = [{ content: status }];
            const priorityData: ISelectOption[] = [{ content: priority }];
            const categoryData: ISelectOption[] = [{ content: category }];
            console.debug("selectdata", selectdata);

            ///////////更新属性////////////////////
            if (noteKeyID && note) {
                updatePromises2.push(api.updateAttrViewCell_pro(id, to_db_id, noteKeyID, itemID, note, "text", undefined, createOpts2));
            }
            if (category && categoryKeyID && categoryData && category !== "加载中..." && category !== "无") {
                updatePromises2.push(api.updateAttrViewCell_pro(id, to_db_id, categoryKeyID, itemID, categoryData, "select", undefined, createOpts2));
            }
            if (tags && tags.length > 0) {
                const tagsData: ISelectOption[] = tags.map(tag => ({ content: tag }));
                updatePromises2.push(api.updateAttrViewCell_pro(id, to_db_id, tagsKeyID, itemID, tagsData, "mSelect", undefined, createOpts2));
            }
            if (priority && priorityKeyID && priorityData) {
                updatePromises2.push(api.updateAttrViewCell_pro(id, to_db_id, priorityKeyID, itemID, priorityData, "select", undefined, createOpts2));
            }
            if (status && statusKeyID && selectdata) {
                updatePromises2.push(api.updateAttrViewCell_pro(id, to_db_id, statusKeyID, itemID, selectdata, "select", undefined, createOpts2));
                // 设置自定义属性
                markCalendarBlockWrite(id, 'create');
                api.setBlockAttrs(id, { 'custom-st-event': statusMap[status] });
            }
            if (checkboxKeyID) {
                updatePromises2.push(api.updateAttrViewCell_pro(id, to_db_id, checkboxKeyID, itemID, ismain, "checkbox", undefined, createOpts2));
            }
            if (allDayKeyID) {
                updatePromises2.push(api.updateAttrViewCell_pro(id, to_db_id, allDayKeyID, itemID, isAllDay, "checkbox", undefined, createOpts2));
            }

            // 等待所有更新完成
            await Promise.all(updatePromises2);
            // create 是新增行：缓存没有该行，必须显式失效，否则下面的 refetch 会读到不含新事件的旧 cache
            try { invalidateViewValueCache(to_db_id); } catch (e) { /* ignore */ }
            // 滴答更新
            api.handleDidaListEvent(to_db_id, id, itemID);
            //////////////////
            if (panel.isUploading()) {
                const checkUploading = setInterval(() => {
                    // // steveTools.outlog('destroyCallbackPANEL', panel.isUploading());
                    if (!panel.isUploading()) {
                        clearInterval(checkUploading);
                        if (isrefresh) {
                            setTimeout(() => calendar?.refetchEvents(), 1000);
                        }
                    }
                }, 100);
            } else {
                if (isrefresh) {
                    setTimeout(() => calendar?.refetchEvents(), 1000);//TODO:优化速度
                }
            }
            // 提示用户
            sy.showMessage('正在添加事件', -1, "info", "1");
            setTimeout(() => {
                dialog.destroy();
                sy.showMessage('已添加事件', 2000, "info", "1");
            }, 500);

        }
    };

    cancelBtn.addEventListener('click', handleCancel);
    okBtn.addEventListener('click', handleKeydown);

    const panel = new sy.Protyle(window.siyuan.ws.app, eventPanel, {
        blockId: id,
        rootId: id,
        render: {
            breadcrumb: false,
        },
        click: {
            preventInsetEmptyBlock: true,
        },
        action: ["cb-get-focus"],
        mode: "wysiwyg",
        // action: ["cb-get-focus"],

    });

    const messageHandler = async (e: MessageEvent) => {
        try {
            const msg = JSON.parse(e.data);
            if (msg.cmd === "transactions") {
                ok = true;
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };

    window.siyuan.ws.ws.addEventListener('message', messageHandler);
    // // steveTools.outlog(msg);

    const debouncedHandleKeydown = debounce(handleKeydown, 300);
    panel.protyle.element.addEventListener('keydown', debouncedHandleKeydown);
    // panel.focus();

    // // steveTools.outlog("dasdsssssssssss::::::", panel);
    // 2. 添加到文档并显示

    // 3. 等待用户提交

}

export async function checkBlockInEvent(blockId: string, to_db_id: string) {
    const attrs = await api.getBlockAttrs(blockId);
    // console.debug("attrs", attrs);
    // 判断 "custom-avs" 是否存在
    if ("custom-avs" in attrs) {
        const avsValue = attrs["custom-avs"];
        // 将 "custom-avs" 的值按逗号分割成数组
        const avsList = avsValue.split(',');
        // 判断 to_db_id 是否在数组中
        const isInEvent = avsList.includes(to_db_id);
        // console.debug("Is block in the specified event database?", isInEvent);
        return isInEvent;
    }
    // 如果 "custom-avs" 不存在，则返回 false
    // console.debug("Is block in the specified event database?", false);
    return false;
}

export async function updateEventInDatabase(
    info: any,
    calendar: Calendar,
    viewValue,
    is_more_one_day: boolean = false,
    options?: {
        refetchOnSuccess?: boolean;
        refetchDelayMs?: number;
        reason?: CalendarWriteReason;
    }
) {
    // 更新思源数据库中的时间
    const blockId = info.event._def.extendedProps.blockId; // 块 id（展示 / 跳转）
    const itemID = info.event._def.extendedProps.itemID;
    const newStartDate = info.event.startStr;
    let newEndDate = info.event.endStr;
    if (is_more_one_day && /^\d{4}-\d{2}-\d{2}$/.test(info.event.endStr)) {
        const endDate = new Date(info.event.endStr);
        endDate.setDate(endDate.getDate() - 1);
        newEndDate = endDate.toISOString();
    }
    const rootid = info.event._def.extendedProps.rootid;
    // 检测是否拖拽到全天区域或从全天区域拖拽出来
    const isAllDay = info.event.allDay;
    const wasAllDay = info.oldEvent ? info.oldEvent.allDay : false;

    // 准备批量更新的promise数组
    const updatePromises: Promise<any>[] = [];

    // 自写选项：默认按 reason 标记并抑制 post-batch refresh，让 FullCalendar 本地状态自然生效。
    const reason: CalendarWriteReason = options?.reason ?? 'drag';
    const writeOpts = { source: 'calendar' as const, reason };

    // 更新时间
    const timeKeyID = await getKeyIDfromViewValue(viewValue, '开始时间', rootid);
    updatePromises.push(api.updateAttrViewCell_pro(blockId, rootid, timeKeyID, itemID, newStartDate, "date", newEndDate, writeOpts));

    // 如果全天状态发生变化，更新全天属性。allDayWritten 用于精确控制 cache patch：
    // 只有真正写入了 DB 的字段才能 patch 缓存，否则缓存会与 DB 不一致。
    let allDayWritten = false;
    if (isAllDay !== wasAllDay) {
        const allDayKeyID = await getKeyIDfromViewValue(viewValue, '全天', rootid);
        if (allDayKeyID) {
            updatePromises.push(api.updateAttrViewCell_pro(blockId, rootid, allDayKeyID, itemID, isAllDay, "checkbox", undefined, writeOpts));
            allDayWritten = true;
        } else {
            sy.showMessage("未找到全天字段，无法更新全天属性", 2000, "error");
        }
    }

    // 等待所有更新完成
    await Promise.all(updatePromises);

    // 行级 patch viewValueCache：让 5 秒 TTL 内的任何 refetch 也能拿到新值，
    // 避免缓存返回旧时间导致 UI 闪回。
    //
    // 注意 cache 字段格式：extractDataFromTable 把 SiYuan 的 dateValue.content/content2
    // 直接存进缓存（数值毫秒），convertToFullCalendarEvents 用 parseInt 解析。
    // 而 FullCalendar 的 startStr/endStr 是 ISO 字符串。直接写 ISO 进去会被 parseInt
    // 截成 4 位年份，导致其他日历实例渲染到 1970-01-01。这里转成毫秒。
    try {
        const startMs = newStartDate ? new Date(newStartDate).getTime() : null;
        const endMs = newEndDate ? new Date(newEndDate).getTime() : null;
        const timePatch: any = {
            start: Number.isFinite(startMs) ? startMs : null,
            end: Number.isFinite(endMs) ? endMs : null,
            hasEndDate: !!endMs,
        };
        const fieldPatch: Record<string, any> = { '开始时间': timePatch };
        // 仅当全天字段确实写入了 DB 才同步 cache，避免 DB 没写但 cache 撒谎
        if (allDayWritten) {
            fieldPatch['全天'] = { content: isAllDay };
        }
        patchViewValueRow(rootid, itemID, fieldPatch);
    } catch (e) {
        console.warn('[CalendarAVCache] patchViewValueRow failed', e);
    }

    api.handleDidaListEvent(rootid, blockId, itemID);

    // 仅在调用方显式开启时才主动 refetch；默认 false——FullCalendar 已在本地把
    // 事件移到位，AV 写入也通过自写标记被下游链路忽略，无需多余刷新。
    if (options?.refetchOnSuccess === true) {
        const delayMs = Math.max(0, Number(options.refetchDelayMs) || 1000);
        setTimeout(() => calendar.refetchEvents(), delayMs);
    }
    sy.showMessage('正在更新事件', -1, "info", "1");
    setTimeout(() => {
        sy.showMessage('已更新事件', 2000, "info", "1");
    }, 1000);
}


// keyID 索引缓存：按 viewValue 数组引用建立 “rootid -> fieldName -> keyID” 索引。
// createEventInDatabase 会对同一 viewValue 连续调用本函数 ~8 次（time/status/.../priority），
// 原实现每次都 O(n) 双层遍历整棵数据；这里在首次调用时构建一次索引，后续 O(1) 查找。
// WeakMap 以引用为键，viewValue 被回收后索引自动释放，不会泄漏。
const keyIdIndexCache = new WeakMap<object, Map<string, Map<string, string>>>();

function buildKeyIdIndex(data: any[]): Map<string, Map<string, string>> {
    // 外层 Map：rootid -> (fieldName -> keyID)
    const index = new Map<string, Map<string, string>>();
    if (!Array.isArray(data)) return index;
    for (const view of data) {
        const rootid = view?.from?.rootid;
        if (!rootid || !view?.data) continue;
        let perRoot = index.get(rootid);
        if (!perRoot) {
            perRoot = new Map();
            index.set(rootid, perRoot);
        }
        for (const item of view.data) {
            if (!item) continue;
            for (const fieldName in item) {
                const keyID = item[fieldName]?.keyID;
                if (keyID && !perRoot.has(fieldName)) {
                    perRoot.set(fieldName, keyID);
                }
            }
        }
    }
    return index;
}

function findKeyIDByIndex(viewValue: any[], key: string, rootid: string): string | undefined {
    let index = keyIdIndexCache.get(viewValue);
    if (!index) {
        index = buildKeyIdIndex(viewValue);
        keyIdIndexCache.set(viewValue, index);
    }
    return index.get(rootid)?.get(key);
}

//TODO：急急优化
async function getKeyIDfromViewValue(viewValue: any, key: string, rootid: string): Promise<string | undefined> {
    // 优先从 viewValue 已构建的索引中 O(1) 查找（同一 viewValue 多次调用时复用索引）
    if (Array.isArray(viewValue)) {
        const existingKeyID = findKeyIDByIndex(viewValue, key, rootid);
        if (existingKeyID) {
            return existingKeyID;
        }
    }

    // 兜底：若 viewValue 不是数组或未命中，仍按原始线性扫描
    const findKeyID = (data: any[]): string | undefined => {
        for (const view of data) {
            for (const item of view.data) {
                if (item?.[key]?.keyID && view?.from?.rootid === rootid) {
                    return item[key].keyID;
                }
            }
        }
        return undefined;
    };

    const existingKeyID = Array.isArray(viewValue) ? findKeyID(viewValue) : undefined;
    if (existingKeyID) {
        return existingKeyID;
    }

    // If not found, fetch fresh data
    try {
        sy.showMessage('添加事件中，请稍等...', -1, "info", "1");
        await new Promise(resolve => setTimeout(resolve, 1000));
        const Mcalendar = moduleInstances['M_calendar'];
        const av_ids = await Mcalendar.getAVreferenceid();

        if (!av_ids?.length) {
            console.warn('No reference IDs found');
            return undefined;
        }

        const viewIDs = await getViewId(av_ids);
        if (!viewIDs?.length) {
            console.warn('No view IDs found');
            return undefined;
        }

        const freshViewValue = await getViewValue(viewIDs);
        sy.showMessage('添加事件中，请稍等...', 1, "info", "1");
        return findKeyIDByIndex(freshViewValue, key, rootid) ?? findKeyID(freshViewValue);
    } catch (error) {
        console.error('Error fetching key ID:', error);
        return undefined;
    }
}

function debounce(func: Function, wait: number) {
    let timeout: NodeJS.Timeout;
    return function executedFunction(...args: any[]) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}


export function changestatus_for_zq(event: CalendarEventExtendedProps, date: string, originator?: Calendar | null) {
    if (!event.okdayid) {
        sy.showMessage('未找到完成日期列', -1, "error");
        return;
    }

    let okdays = event.okday ? event.okday.split(',').map(d => d.trim()) : [];
    let newOkday = '';

    if (okdays.includes(date)) {
        // 如果日期存在，则删除
        okdays = okdays.filter(d => d !== date);
        sy.showMessage('已取消完成此事件', 3000, "info");
    } else {
        // 如果日期不存在，则添加
        okdays.push(date);
        sy.showMessage('已完成此事件', 3000, "info");
    }

    // 将数组转换回字符串
    newOkday = okdays.filter(Boolean).join(','); // filter(Boolean)用于移除空值

    const target = event.blockId; // 优先使用 blockId
    const itemID = event.itemID;
    api.updateAttrViewCell_pro(target, event.rootid, event.okdayid, itemID, newOkday, "text",
        undefined, { source: 'calendar', reason: 'recurring' });
    // 周期事件完成日字段是 text 列，patch 缓存让本地状态一致——只 patch 周期视图缓存，
    // 避免 '完成日期' 这个周期专属字段被注入到普通视图缓存里
    try {
        patchViewValueRow(event.rootid, itemID, { '完成日期': { content: newOkday } }, 'zq');
    } catch (e) { /* ignore */ }
    // 同步可见日历实例。如果调用方提供了 originator，把它从刷新集合排除（它将在
    // FullCalendar 下个微任务里自然重渲染 isEventCompleted 状态）
    refetchPeerCalendars(originator ?? null);
}


// 获取数据库中已有的分类列表
async function getCategories(dbId: string): Promise<string[]> {
    try {
        const view = await api.renderAttributeView(dbId);

        // 兼容表格和画廊视图
        const columnsOrFields = view.view?.columns || view.view?.fields || [];
        // 查找分类列
        const categoryColumn = columnsOrFields.find((col: any) => col.name === '分类');
        if (!categoryColumn) return ['无'];

        // 直接从选项中获取分类名称
        const categories = categoryColumn.options?.map((option: any) => option.name) || [];

        // 如果没有预设选项，返回默认值
        if (!categories.length) {
            return ['无'];
        }

        // 返回排序后的分类列表
        return categories.sort();
    } catch (error) {
        console.error('获取分类列表失败:', error);
        return ['无'];
    }
}

async function loadCategoryOptions(to_db_id: any, categorySelect: HTMLSelectElement) {
    try {
        const categories = await getCategories(to_db_id);
        categorySelect.innerHTML = '';
        // 只在这里添加"无"选项
        categorySelect.appendChild(new Option('无', '无', true));
        // 添加其他分类
        categories.forEach(category => {
            if (category !== '无') { // 避免重复添加"无"选项
                categorySelect.appendChild(new Option(category, category));
            }
        });
    } catch (error) {
        console.error('加载分类失败:', error);
        sy.showMessage('加载分类失败', -1, "error");
    }
}




// 获取数据库中已有的优先级列表
async function getPriorities(dbId: string): Promise<string[]> {
    try {
        // console.debug('获取优先级列表:', dbId);
        const view = await api.renderAttributeView(dbId);
        // console.debug('获取优先级列表:', view);

        // 兼容表格和画廊视图
        const columnsOrFields = view.view?.columns || view.view?.fields || [];
        // 查找优先级列
        const priorityColumn = columnsOrFields.find((col: any) => col.name === '优先级');
        // console.debug('获取优先级列表:', priorityColumn);
        if (!priorityColumn) return ['无'];

        // 直接从选项中获取优先级名称
        const priorities = priorityColumn.options?.map((option: any) => option.name) || [];

        // 如果没有预设选项，返回默认值
        if (!priorities.length) {
            return ['高', '中', '低', '无'];
        }

        // 返回排序后的优先级列表
        // console.debug('获取优先级列表:', priorities);
        return priorities.sort();
    } catch (error) {
        console.error('获取优先级列表失败:', error);
        return ['高', '中', '低', '无'];
    }
}

// 加载优先级选项
async function loadPriorityOptions(to_db_id: any, prioritySelect: HTMLSelectElement) {
    try {
        const priorities = await getPriorities(to_db_id);
        prioritySelect.innerHTML = '';
        // 添加"无"选项
        prioritySelect.appendChild(new Option('无', '无', true));
        // 添加其他优先级
        priorities.forEach(priority => {
            if (priority !== '无') { // 避免重复添加"无"选项
                prioritySelect.appendChild(new Option(priority, priority));
            }
        });
    } catch (error) {
        console.error('加载优先级失败:', error);
        sy.showMessage('加载优先级失败', -1, "error");
    }
}
