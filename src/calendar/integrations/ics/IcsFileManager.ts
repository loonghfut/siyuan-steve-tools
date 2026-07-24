// 统一管理 ICS 文件生成逻辑（由 module-calendar.ts 抽离）
import { createEvents, EventAttributes } from 'ics';
import * as api from '@/api/api';
import { settingdata } from '@/index';
import { RRule } from 'rrule';
import { showMessage } from 'siyuan';

export interface GenerateOptions {
  calName?: string;
  method?: 'PUBLISH' | 'REQUEST' | 'CANCEL';
  defaultAlarmMinutes?: number; // 若为 -1 则不添加默认提醒
}

const DEFAULT_OPTIONS: GenerateOptions = {
  calName: 'ST思源日程',
  method: 'PUBLISH',
  defaultAlarmMinutes: 15,
};

export class IcsFileManager {
  constructor(private options: GenerateOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async generateFromEventsJson(jsonFilePath: string, icsFilePath: string) {
    try {
      const eventsBlob = await api.getFileBlob(jsonFilePath);
      if (!eventsBlob) {
        console.error('[IcsFileManager] 读取事件数据失败');
        return false;
      }
      const eventsJson = await eventsBlob.text();
      const rawEvents = JSON.parse(eventsJson);
      const convertedEvents = this.convertEventFormat(rawEvents);
      const { error, value } = createEvents(convertedEvents, {
        method: this.options.method,
        calName: this.options.calName,
      });
      if (error) {
        console.error('[IcsFileManager] 生成ICS内容失败:', error);
        return false;
      }
      const fileBlob = new Blob([value], { type: 'text/calendar' });
      await api.putFile(icsFilePath, false, fileBlob);
      return true;
    } catch (err) {
      console.error('[IcsFileManager] generateFromEventsJson error', err);
      return false;
    }
  }

  private convertEventFormat(eventData: any[]): EventAttributes[] {
    const events: EventAttributes[] = [];
    if (!Array.isArray(eventData)) return events;
    const alarmMinutes = this.options.defaultAlarmMinutes ?? 15;
    eventData.forEach((event: any) => {
      if (event?.recurrenceRule) {
        events.push({
          start: event.start,
          title: event.title,
            description: event.description,
          recurrenceRule: event.recurrenceRule,
          duration: event.duration,
          alarms: alarmMinutes >= 0 ? [{
            action: 'display',
            summary: event.title,
            description: event.description,
            trigger: { before: true, minutes: alarmMinutes }
          }] : undefined,
        });
      } else {
        const confirmed = event.status === 'CONFIRMED';
        events.push({
          start: event.start,
          end: event.end,
          title: event.title,
          description: event.description,
          status: event.status,
          alarms: (!confirmed && alarmMinutes >= 0) ? [{
            action: 'display',
            summary: event.title,
            description: event.description,
            trigger: { before: true, minutes: alarmMinutes }
          }] : undefined,
        });
      }
    });
    return events;
  }
}

// 默认单例（可按需直接使用）
export const icsFileManager = new IcsFileManager();// function convertTimestampToArray(timestamp: number): [number, number, number, number, number] {
//     const date = new Date(timestamp);
//     const offset = 8 * 60; // 东八区的偏移量，单位为分钟
//     const localDate = new Date(date.getTime() + offset * 60 * 1000);
//     return [
//         localDate.getUTCFullYear(),
//         localDate.getUTCMonth() + 1, // 月份从0开始，所以需要加1
//         localDate.getUTCDate(),
//         localDate.getUTCHours(),
//         localDate.getUTCMinutes()
//     ];
// }
// 转换思源数据库中的事件数据为 ICS 格式


export function transformEvents(inputEvents: any[], isZQ: boolean = false) {
    // console.debug("inputEvents", inputEvents);
    function timestampToArray(timestamp: number): [number, number, number, number, number] {
        const date = new Date(timestamp);
        return [
            date.getFullYear(),
            date.getMonth() + 1,
            date.getDate(),
            date.getHours(),
            date.getMinutes()
        ];
    }

    const oldM = settingdata["cal-ics-filter-old"] || 1;
    const newM = settingdata["cal-ics-filter-new"] || 1;
    // 获取当前时间前后6个月的时间范围
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - oldM, now.getDate());
    const sixMonthsLater = new Date(now.getFullYear(), now.getMonth() + newM, now.getDate());

    // 用于检查事件是否在时间范围内
    function isEventInTimeRange(eventTime: string | number | Date) {
        const eventDate = new Date(eventTime);
        return eventDate >= sixMonthsAgo && eventDate <= sixMonthsLater;
    }

    // 用于存储已处理过的事件的唯一标识
    const processedEvents = new Set();
    const transformedEvents = [];

    // 遍历所有输入的事件数组
    inputEvents.forEach(eventGroup => {
        if (!eventGroup.data) return;

        eventGroup.data.forEach((event: { 事件: { id: any; content: any; }; 开始时间: { start: number; end: number; }; 描述: { content: any; }; 重复规则: { content: string; }; 持续时间: { content: any; }; 状态: { content: string; }; }) => {
            // 创建事件的唯一标识
            const eventKey = `${event?.事件?.id}`;

            // 检查事件是否已经处理过
            if (processedEvents.has(eventKey)) {
                return; // 跳过重复的事件
            }

            // 对于非周期性事件，检查时间范围
            if (!isZQ && !isEventInTimeRange(event?.开始时间?.start)) {
                return; // 跳过不在时间范围内的事件
            }

            // 记录已处理的事件
            processedEvents.add(eventKey);

            // Base event object with common properties
            const baseEvent = {
                start: timestampToArray(event?.开始时间?.start),
                title: event?.事件?.content,
                description: event?.描述?.content,
            };

            // Add properties based on event type
            if (isZQ) {
                try {
                    // 尝试解析重复规则
                    const rruleString = event.重复规则.content;

                    // 如果不是以"RRULE:"开头，添加前缀
                    const formattedRrule = rruleString.startsWith("RRULE:") ?
                        rruleString : `RRULE:${rruleString}`;

                    // 尝试用 rrule.js 解析，验证格式是否正确
                    RRule.fromString(formattedRrule);

                    // 如果解析成功，将正确格式的规则添加到事件中
                    transformedEvents.push({
                        ...baseEvent,
                        recurrenceRule: formattedRrule.replace("RRULE:", ""), // 去掉前缀
                        duration: { hours: event.持续时间.content || 1 }
                    });
                } catch (error) {
                    console.error('解析重复规则出错:', event.重复规则.content, error);
                    showMessage('周期事件-解析重复规则出错,请重试' + event.重复规则.content, -1, 'error');
                }
            } else {
                transformedEvents.push({
                    ...baseEvent,
                    end: timestampToArray(event.开始时间.end),
                    status: event.状态?.content === "完成" ? "CONFIRMED" : "TENTATIVE"
                });
            }
        });
    });

    return transformedEvents;
}

