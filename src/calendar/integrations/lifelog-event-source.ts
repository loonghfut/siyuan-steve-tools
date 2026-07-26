import { EventInput } from '@fullcalendar/core';
import { getBlockAttrs, sql } from '@/api/api';
import { ATTRS } from '@/lifelog/contracts';
import { calendarSettings as settingdata } from '@/calendar/core/calendar-context';

// 把 "HH:mm" 或 "HH:mm:ss" 拆为 [h, m, s?]；非法值兜底为 0
function parseTimeParts(time: string): [number, number, number] {
    const parts = String(time || '').split(':').map(p => parseInt(p, 10));
    const h = Number.isFinite(parts[0]) ? parts[0] : 0;
    const m = Number.isFinite(parts[1]) ? parts[1] : 0;
    const s = Number.isFinite(parts[2]) ? parts[2] : 0;
    return [h, m, s];
}

const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (d: Date) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;

/**
 * 单条 lifelog 缓存项：key 为 blockId，value 为渲染该事件所需的最小属性集合。
 *
 * 为什么需要缓存：getLifelogEvents 原实现每次都跑一次全视图范围 SQL + 对范围内
 * 所有块并行 getBlockAttrs。用户编辑一条日记，会引发整月 N 条属性的重取。
 * 缓存让"局部变动"只需更新对应的一两条，避免触发 N 次 getBlockAttrs 往返。
 */
interface LifelogCacheEntry {
    date: string;       // 'YYYY/MM/DD'
    time: string;       // 'HH:mm' 或 'HH:mm:ss'
    type: string;
    content: string;
}

/**
 * 每个视图范围（FullCalendar 一次 fetch 的 start/end）对应的缓存快照。
 *
 * 为什么按"视图范围"分组：FullCalendar 在切换视图/翻页时 start/end 会变，
 * 旧范围的缓存对当前视图无意义。我们以 `${start.getTime()}-${end.getTime()}`
 * 为 key 隔离，仅缓存当前视图范围的块。视图一变（翻页/切月），自动重建。
 */
interface ViewCache {
    /** blockId → 缓存项 */
    entries: Map<string, LifelogCacheEntry>;
}

export class LifelogView {
    /** 当前视图范围的缓存（按 range key 索引），只保留最近一个，避免内存膨胀。 */
    private static viewCache: { rangeKey: string; cache: ViewCache } | null = null;

    /**
     * 失效（删除）指定 blockId 的缓存项。
     * 在 lifelog 模块写入属性后调用，避免下一次 getLifelogEvents 用到旧值。
     */
    static invalidate(blockIds: string | string[]): void {
        if (!this.viewCache) return;
        const ids = Array.isArray(blockIds) ? blockIds : [blockIds];
        for (const id of ids) {
            this.viewCache.cache.entries.delete(id);
        }
    }

    /** 视图已切换（翻页/切月）时清空全部缓存。 */
    static invalidateAll(): void {
        this.viewCache = null;
    }

    static async getLifelogEvents(start?: Date, end?: Date): Promise<EventInput[]> {
        try {
            if (!start || !end) {
                return [];
            }

            const events: EventInput[] = [];

            // 构造范围内的日期边界（value 以 'YYYY/MM/DD' 存储，定宽，字典序与时间序一致，
            // 可直接用字符串范围比较）。
            const startDateStr = fmtDate(start);
            // end 由 FullCalendar 给出为下一段的起点（半开），范围上界直接用 end（<=）。
            const endDateStr = fmtDate(end);

            // 复用缓存 / 建立缓存：仅当当前视图范围命中时复用，否则重建
            const rangeKey = `${start.getTime()}-${end.getTime()}`;
            let cache: ViewCache;
            if (this.viewCache && this.viewCache.rangeKey === rangeKey) {
                cache = this.viewCache.cache;
            } else {
                cache = { entries: new Map() };
                this.viewCache = { rangeKey, cache };
            }

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

            // 找出"缓存缺失 / 缓存需要刷新"的块：即当前视图范围内、但缓存里没有的 id。
            // 这些才需要去 getBlockAttrs —— 这是性能优化的关键：编辑 1 条时，
            // invalidate 已把那条从缓存里移除，这里就只补 1 条，而不是全月 N 条。
            const missingIds: string[] = [];
            for (const ids of blockIdsByDate.values()) {
                for (const id of ids) {
                    if (!cache.entries.has(id)) {
                        missingIds.push(id);
                    }
                }
            }
            const targetAttrs = [ATTRS.date, ATTRS.time, ATTRS.type, ATTRS.content];
            if (missingIds.length > 0) {
                const attrsResults = await Promise.all(
                    missingIds.map(async (blockId) => {
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
                // 写回缓存：只有同时具备 date+time 才是有效 lifelog 条目，写入缓存；
                // 无效的也记一个"空标记"避免下次重复拉取（用 has 判定），但 entries 里
                // 用 date='' 表示无效，渲染阶段会过滤。
                for (const [blockId, relevantAttrs] of attrsResults) {
                    if (relevantAttrs[ATTRS.date] && relevantAttrs[ATTRS.time]) {
                        cache.entries.set(blockId, {
                            date: relevantAttrs[ATTRS.date],
                            time: relevantAttrs[ATTRS.time],
                            type: relevantAttrs[ATTRS.type] || '',
                            content: relevantAttrs[ATTRS.content] || '',
                        });
                    } else {
                        // 空标记：date 为空字符串表示无效，避免重复请求
                        cache.entries.set(blockId, {
                            date: '',
                            time: '',
                            type: '',
                            content: '',
                        });
                    }
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

                // 从缓存构造当日条目（缓存里 date='' 的无效项会被过滤）
                const items = blockIds
                    .map(id => [id, cache.entries.get(id)] as const)
                    .filter(([, data]) => data && data.time && data.date)
                    .sort((a, b) => a[1]!.time.localeCompare(b[1]!.time)) as Array<[string, LifelogCacheEntry]>;

                for (let i = 0; i < items.length; i++) {
                    const [blockId, data] = items[i];
                    const endTime = data.time;
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
                        eventStartTime = items[i - 1][1].time;
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
                        title: `${data.type}: ${data.content}`,
                        start: new Date(startYear, startMonth - 1, startDay, startHour, startMinute, startSecond),
                        end: new Date(endYear, endMonth - 1, endDay, endHour, endMinute, endSecond),
                        allDay: false,
                        extendedProps: {
                            type: 'lifelog',
                            logType: data.type,
                            content: data.content,
                            blockId: blockId,
                        }
                    };

                    events.push(eventData);
                }

                // 更新lastDayLastEventEndTime为当天最后一个事件的结束时间
                // 如果当天没有事件，保持上一次的lastDayLastEventEndTime不变
                if (items.length > 0) {
                    lastDayLastEventEndTime = items[items.length - 1][1].time;
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
