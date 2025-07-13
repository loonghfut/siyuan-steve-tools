import { EventInput } from '@fullcalendar/core';
import { getBlockAttrs, sql } from '../api/api';
import { ATTRS } from '../lifelog/module-lifelog';

export class LifelogView {
    static async getLifelogEvents(start?: Date, end?: Date): Promise<EventInput[]> {
        try {
            if (!start || !end) {
                return [];
            }

            const events: EventInput[] = [];
            const currentDate = new Date(start);
            let lastDayLastEventEndTime = '23:59:59';  // 默认起始时间

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

                for (let i = 0; i < items.length; i++) {
                    const [blockId, data] = items[i];
                    const endTime = data[ATTRS.time];
                    let eventStartTime, eventStartDate;

                    if (i === 0) {
                        eventStartTime = lastDayLastEventEndTime;
                        // 如果是当天第一个事件且开始时间是前一天的结束时间
                        // 则需要使用前一天的日期
                        const prevDate = new Date(currentDate);
                        prevDate.setDate(prevDate.getDate() - 1);
                        eventStartDate = prevDate.toISOString().split('T')[0].replace(/-/g, '/');
                    } else {
                        eventStartTime = items[i - 1][1][ATTRS.time];
                        eventStartDate = dateStr;
                    }

                    const formattedStartDate = eventStartDate.replace(/\//g, '-');
                    const formattedEndDate = dateStr.replace(/\//g, '-');

                    const [startYear, startMonth, startDay] = formattedStartDate.split('-').map(Number);
                    const [endYear, endMonth, endDay] = formattedEndDate.split('-').map(Number);
                    const [startHour, startMinute] = eventStartTime.split(':').map(Number);
                    const [endHour, endMinute] = endTime.split(':').map(Number);

                    const eventData = {
                        id: blockId,
                        title: `${data[ATTRS.type]}: ${data[ATTRS.content]}`,
                        start: new Date(startYear, startMonth - 1, startDay, startHour, startMinute),
                        end: new Date(endYear, endMonth - 1, endDay, endHour, endMinute),
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