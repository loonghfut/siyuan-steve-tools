import { EventInput } from '@fullcalendar/core';
import { getBlockAttrs, sql } from '../api';
import { ATTRS } from '../lifelog/module-lifelog';

export class LifelogView {
    static async getLifelogEvents(start?: Date, end?: Date): Promise<EventInput[]> {
        try {
            if (!start || !end) {
                return [];
            }

            const events: EventInput[] = [];
            const currentDate = new Date(start);

            // 循环遍历从开始日期到结束日期的每一天
            while (currentDate <= end) {
                const dateStr = currentDate.toISOString().split('T')[0].replace(/-/g, '/');

                // 构建当天的 SQL 查询语句
                const blockIdsQuery = `
                    SELECT DISTINCT block_id
                    FROM attributes
                    WHERE name = '${ATTRS.date}' AND value = '${dateStr}'
                `;

                const blockIdsResult = await sql(blockIdsQuery);
                const blockIds = blockIdsResult.map((item: any) => item.block_id);

                if (blockIds.length === 0) {
                    // 推进到下一天
                    currentDate.setDate(currentDate.getDate() + 1);
                    continue;
                }

                const groupedData = new Map<string, any>();
                for (const blockId of blockIds) {
                    const attrs = await getBlockAttrs(blockId);
                    const relevantAttrs: Record<string, string> = {};
                    const targetAttrs = [ATTRS.date, ATTRS.time, ATTRS.type, ATTRS.content];
                    targetAttrs.forEach((attr) => {
                        if (attrs[attr]) {
                            relevantAttrs[attr] = attrs[attr];
                        }
                    });
                    groupedData.set(blockId, relevantAttrs);
                }

                const items = Array.from(groupedData.entries())
                   .filter(([_, data]) => data[ATTRS.time] && data[ATTRS.date])
                   .sort((a, b) => a[1][ATTRS.time].localeCompare(b[1][ATTRS.time]));

                let lastEndTime = '23:59:59';
                if (events.length > 0) {
                    lastEndTime = events[events.length - 1].end?.toLocaleTimeString('zh-CN', { hour12: false }) || '23:59:59';
                }

                for (let i = 0; i < items.length; i++) {
                    const [blockId, data] = items[i];
                    const endTime = data[ATTRS.time];
                    let startTime;

                    if (i === 0) {
                        if (lastEndTime === '23:59:59') {
                            startTime = '00:00:00';
                        } else {
                            startTime = lastEndTime;
                        }
                    } else {
                        startTime = items[i - 1][1][ATTRS.time];
                    }

                    const formattedDate = dateStr.replace(/\//g, '-');
                    const [year, month, day] = formattedDate.split('-').map(Number);
                    const [startHour, startMinute] = startTime.split(':').map(Number);
                    const [endHour, endMinute] = endTime.split(':').map(Number);

                    const eventData = {
                        id: blockId,
                        title: `${data[ATTRS.type]}: ${data[ATTRS.content]}`,
                        start: new Date(year, month - 1, day, startHour, startMinute),
                        end: new Date(year, month - 1, day, endHour, endMinute),
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

                // 推进到下一天
                currentDate.setDate(currentDate.getDate() + 1);
            }

            return events;
        } catch (error) {
            console.error('获取 Lifelog 事件失败:', error);
            return [];
        }
    }
}