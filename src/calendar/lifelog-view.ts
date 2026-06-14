import { EventInput } from '@fullcalendar/core';
import { getBlockAttrs, sql } from '../api/api';
import { ATTRS } from '../lifelog/module-lifelog';
import { settingdata } from '@/index';

// 把 "HH:mm" 或 "HH:mm:ss" 拆为 [h, m, s?]；非法值兜底为 0
function parseTimeParts(time: string): [number, number, number] {
    const parts = String(time || '').split(':').map(p => parseInt(p, 10));
    const h = Number.isFinite(parts[0]) ? parts[0] : 0;
    const m = Number.isFinite(parts[1]) ? parts[1] : 0;
    const s = Number.isFinite(parts[2]) ? parts[2] : 0;
    return [h, m, s];
}

export class LifelogView {
    static async getLifelogEvents(start?: Date, end?: Date): Promise<EventInput[]> {
        try {
            if (!start || !end) {
                return [];
            }

            const events: EventInput[] = [];

            // 构造范围内的日期边界（value 以 'YYYY/MM/DD' 存储，定宽，字典序与时间序一致，
            // 可直接用字符串范围比较）。
            const pad = (n: number) => String(n).padStart(2, '0');
            const fmtDate = (d: Date) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
            const startDateStr = fmtDate(start);
            // end 由 FullCalendar 给出为下一段的起点（半开），范围上界直接用 end（<=）。
            const endDateStr = fmtDate(end);

            // 一次性范围查询：拿到范围内所有 lifelog 日期属性对应的块 id + value
            // （原实现是逐天各发一次 sql，共 N 次往返；这里合并为 1 次）。
            const rangeQuery = `
                SELECT DISTINCT block_id, value
                FROM attributes
                WHERE name = '${ATTRS.date}'
                  AND value >= '${startDateStr}'
                  AND value <= '${endDateStr}'
            `;
            const rangeResult = await sql(rangeQuery);

            // 按 dateStr 分组（value 即为 'YYYY/MM/DD'）
            const blockIdsByDate = new Map<string, string[]>();
            for (const row of rangeResult || []) {
                const dateStr = row.value;
                if (!dateStr) continue;
                let bucket = blockIdsByDate.get(dateStr);
                if (!bucket) {
                    bucket = [];
                    blockIdsByDate.set(dateStr, bucket);
                }
                bucket.push(row.block_id);
            }

            // 汇总所有需要拉取属性的块 id，一次性并行 getBlockAttrs
            // （原实现是逐块串行 await，共 N×M 次往返；这里改为并行）。
            const allBlockIds: string[] = [];
            for (const ids of blockIdsByDate.values()) {
                allBlockIds.push(...ids);
            }
            const targetAttrs = [ATTRS.date, ATTRS.time, ATTRS.type, ATTRS.content];
            const attrsMap = new Map<string, Record<string, string>>();
            if (allBlockIds.length > 0) {
                const attrsResults = await Promise.all(
                    allBlockIds.map(async (blockId) => {
                        try {
                            const attrs = await getBlockAttrs(blockId);
                            const relevantAttrs: Record<string, string> = {};
                            targetAttrs.forEach((attr) => {
                                if (attrs[attr]) {
                                    relevantAttrs[attr] = attrs[attr];
                                }
                            });
                            return [blockId, relevantAttrs] as const;
                        } catch (e) {
                            return [blockId, {} as Record<string, string>] as const;
                        }
                    })
                );
                for (const [blockId, relevantAttrs] of attrsResults) {
                    attrsMap.set(blockId, relevantAttrs);
                }
            }

            // 按天顺序处理，保持与原实现一致的 lastDayLastEventEndTime 链式语义。
            // 受 lifelog-link-across-empty-days 控制：默认 false，跨空天后重置为当天 00:00:00
            const linkAcrossEmpty = settingdata['lifelog-link-across-empty-days'] === true;

            const currentDate = new Date(start);
            // 默认起始时间统一为 23:59:59（与三段解析对齐）
            let lastDayLastEventEndTime = '23:59:59';
            let lastDayHadEvents = false;

            // FullCalendar 的 end 是半开区间，故使用 < end（而非 <=）
            while (currentDate < end) {
                const dateStr = fmtDate(currentDate);
                const blockIds = blockIdsByDate.get(dateStr);

                if (!blockIds || blockIds.length === 0) {
                    // 跨空天：若不延续，把 lastDayLastEventEndTime 重置为当天 00:00:00，
                    // 避免下一天首事件从更早某天的结束时间开始（跨多天错位）
                    if (!linkAcrossEmpty) {
                        lastDayLastEventEndTime = '00:00:00';
                    }
                    lastDayHadEvents = false;
                    // 推进到下一天
                    currentDate.setDate(currentDate.getDate() + 1);
                    continue;
                }

                // 从预取的属性表构造当日条目
                const groupedData = new Map<string, any>();
                for (const blockId of blockIds) {
                    const relevantAttrs = attrsMap.get(blockId);
                    if (relevantAttrs) {
                        groupedData.set(blockId, relevantAttrs);
                    }
                }

                const items = Array.from(groupedData.entries())
                   .filter(([_, data]) => data[ATTRS.time] && data[ATTRS.date])
                   .sort((a, b) => a[1][ATTRS.time].localeCompare(b[1][ATTRS.time]));

                for (let i = 0; i < items.length; i++) {
                    const [blockId, data] = items[i];
                    const endTime = data[ATTRS.time];
                    let eventStartTime, eventStartDate;

                    if (i === 0) {
                        // 当天首事件：若不跨空天延续，且上一天无事件，则从当天 00:00:00 开始
                        eventStartTime = (!linkAcrossEmpty && !lastDayHadEvents) ? '00:00:00' : lastDayLastEventEndTime;
                        // 如果是当天第一个事件且开始时间是前一天的结束时间
                        // 则需要使用前一天的日期
                        const prevDate = new Date(currentDate);
                        prevDate.setDate(prevDate.getDate() - 1);
                        // 但若 start 是当天 00:00:00，则 start 仍在当天
                        if (eventStartTime === '00:00:00') {
                            eventStartDate = dateStr;
                        } else {
                            eventStartDate = fmtDate(prevDate);
                        }
                    } else {
                        eventStartTime = items[i - 1][1][ATTRS.time];
                        eventStartDate = dateStr;
                    }

                    const formattedStartDate = eventStartDate.replace(/\//g, '-');
                    const formattedEndDate = dateStr.replace(/\//g, '-');

                    const [startYear, startMonth, startDay] = formattedStartDate.split('-').map(Number);
                    const [endYear, endMonth, endDay] = formattedEndDate.split('-').map(Number);
                    const [startHour, startMinute, startSecond] = parseTimeParts(eventStartTime);
                    const [endHour, endMinute, endSecond] = parseTimeParts(endTime);

                    const eventData = {
                        id: blockId,
                        title: `${data[ATTRS.type]}: ${data[ATTRS.content]}`,
                        start: new Date(startYear, startMonth - 1, startDay, startHour, startMinute, startSecond),
                        end: new Date(endYear, endMonth - 1, endDay, endHour, endMinute, endSecond),
                        allDay: false,
                        extendedProps: {
                            type: 'lifelog',
                            logType: data[ATTRS.type],
                            content: data[ATTRS.content],
                            blockId: blockId,
                        }
                    };

                    events.push(eventData);
                }

                // 更新lastDayLastEventEndTime为当天最后一个事件的结束时间
                // 如果当天没有事件，保持上一次的lastDayLastEventEndTime不变
                if (items.length > 0) {
                    lastDayLastEventEndTime = items[items.length - 1][1][ATTRS.time];
                    lastDayHadEvents = true;
                }

                currentDate.setDate(currentDate.getDate() + 1);
            }

            return events;
        } catch (error) {
            console.error('获取 Lifelog 事件失败:', error);
            return [];
        }
    }
}
