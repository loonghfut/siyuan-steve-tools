/**
 * 日历数据统计模块
 * 独立管理日历相关的所有统计功能
 */

import { showMessage } from 'siyuan';

export interface CalendarStatsData {
    // 事件统计
    totalEvents: number;
    completedEvents: number;
    pendingEvents: number;
    archivedEvents: number;
    recurringEvents: number;
    
    // 时间统计
    totalEventDuration: number; // 总时长（分钟）
    averageEventDuration: number; // 平均时长（分钟）
    
    // 分类统计
    eventsByPriority: { [key: string]: number };
    eventsByStatus: { [key: string]: number };
    eventsBySource: { [key: string]: number };
    eventsByCategory: { [key: string]: number };
    eventsByTag: { [key: string]: number };

    // Lifelog 类型（logType）维度
    eventsByLogType: { [key: string]: number };
    durationByLogType: { [key: string]: number }; // 分钟

    // 分类/标签-时长与完成率
    durationByCategory: { [key: string]: number }; // 分钟
    durationByTag: { [key: string]: number }; // 分钟
    completedByCategory: { [key: string]: number };
    archivedByCategory: { [key: string]: number };
    completedByTag: { [key: string]: number };
    archivedByTag: { [key: string]: number };
    completionRateByCategory: { [key: string]: number }; // 百分比
    completionRateByTag: { [key: string]: number }; // 百分比
    
    // 时间分布统计
    eventsByHour: number[]; // 24小时分布
    eventsByWeekday: number[]; // 星期分布
    eventsByMonth: number[]; // 月份分布
    
    // 完成率统计
    completionRate: number; // 完成率百分比
    
    // 时间范围
    dateRange: {
        start: string;
        end: string;
    };
    
    // 生成时间
    generatedAt: string;
}

export interface CalendarStatsConfig {
    // 统计时间范围
    dateRange: {
        start: Date;
        end: Date;
    };
    
    // 包含的事件源
    includeSources: string[];
    
    // 是否包含周期事件
    includeRecurring: boolean;
    
    // 是否包含已归档事件
    includeArchived: boolean;
}

export class CalendarDataStats {
    private static instance: CalendarDataStats;
    
    private constructor() {}
    
    public static getInstance(): CalendarDataStats {
        if (!CalendarDataStats.instance) {
            CalendarDataStats.instance = new CalendarDataStats();
        }
        return CalendarDataStats.instance;
    }
    
    /**
     * 生成日历统计数据
     * @param events 事件数组
     * @param config 统计配置
     * @returns 统计数据
     */
    public generateStats(events: any[], config?: Partial<CalendarStatsConfig>): CalendarStatsData {
        const defaultConfig: CalendarStatsConfig = {
            dateRange: {
                start: new Date(new Date().getFullYear(), 0, 1), // 今年1月1日
                end: new Date(new Date().getFullYear(), 11, 31), // 今年12月31日
            },
            includeSources: ['siyuan', 'qqcalendar', 'icsSubscription', 'lifelog'],
            includeRecurring: true,
            // 默认包含归档事件以便统计中能识别归档计数
            includeArchived: true,
        };
        
        const finalConfig = { ...defaultConfig, ...config };
        
        // 过滤事件
        const filteredEvents = this.filterEvents(events, finalConfig);
        
        // 生成统计数据
        const stats: CalendarStatsData = {
            totalEvents: filteredEvents.length,
            completedEvents: 0,
            pendingEvents: 0,
            archivedEvents: 0,
            recurringEvents: 0,
            totalEventDuration: 0,
            averageEventDuration: 0,
            eventsByPriority: {},
            eventsByStatus: {},
            eventsBySource: {},
            eventsByCategory: {},
            eventsByTag: {},
            eventsByLogType: {},
            durationByLogType: {},
            durationByCategory: {},
            durationByTag: {},
            completedByCategory: {},
            archivedByCategory: {},
            completedByTag: {},
            archivedByTag: {},
            completionRateByCategory: {},
            completionRateByTag: {},
            eventsByHour: new Array(24).fill(0),
            eventsByWeekday: new Array(7).fill(0),
            eventsByMonth: new Array(12).fill(0),
            completionRate: 0,
            dateRange: {
                start: finalConfig.dateRange.start.toISOString(),
                end: finalConfig.dateRange.end.toISOString(),
            },
            generatedAt: new Date().toISOString(),
        };
        
        // 统计各项数据
        this.calculateEventStats(filteredEvents, stats);
    this.calculateTimeStats(filteredEvents, stats);
    this.calculateCategoryStats(filteredEvents, stats);
        this.calculateTimeDistribution(filteredEvents, stats);
        this.calculateCompletionRate(stats);
    this.calculateCategoryTagCompletionRates(stats);
        
        return stats;
    }
    
    /**
     * 过滤事件
     */
    private filterEvents(events: any[], config: CalendarStatsConfig): any[] {
        return events.filter(event => {
            // 时间范围过滤
            const eventDate = new Date(event.start);
            if (eventDate < config.dateRange.start || eventDate > config.dateRange.end) {
                return false;
            }
            
            // 事件源过滤
            const source = event.extendedProps?.source || 'siyuan';
            if (!config.includeSources.includes(source)) {
                return false;
            }
            
            // 周期事件过滤
            if (!config.includeRecurring && event.extendedProps?.isRecurring) {
                return false;
            }
            
            // 归档事件过滤（支持中文/英文变体）
            const statusVal = event.extendedProps?.status;
            if (!config.includeArchived && statusVal && this.isArchivedStatus(statusVal)) {
                return false;
            }
            
            return true;
        });
    }
    
    /**
     * 计算事件基础统计
     */
    private calculateEventStats(events: any[], stats: CalendarStatsData): void {
        for (const event of events) {
            const status = event.extendedProps?.status || '';
            if (this.isCompletedStatus(status)) {
                stats.completedEvents++;
            } else if (this.isArchivedStatus(status)) {
                stats.archivedEvents++;
            } else {
                stats.pendingEvents++;
            }
            
            if (event.extendedProps?.isRecurring) {
                stats.recurringEvents++;
            }
        }
    }
    
    /**
     * 计算时间相关统计
     */
    private calculateTimeStats(events: any[], stats: CalendarStatsData): void {
        let totalDuration = 0;
        let eventCount = 0;
        
        for (const event of events) {
            if (event.start && event.end) {
                const duration = (new Date(event.end).getTime() - new Date(event.start).getTime()) / (1000 * 60);
                totalDuration += duration;
                eventCount++;

                // 分类/标签时长累计
                const category = event.extendedProps?.category || '无';
                stats.durationByCategory[category] = (stats.durationByCategory[category] || 0) + duration;

                const tags: string[] = Array.isArray(event.extendedProps?.tags) ? event.extendedProps.tags : ['无标签'];
                if (tags.length === 0) tags.push('无标签');
                for (const tag of tags) {
                    const name = tag || '无标签';
                    stats.durationByTag[name] = (stats.durationByTag[name] || 0) + duration;
                }

                // Lifelog 类型时长累计
                const logType = event.extendedProps?.logType;
                if (logType) {
                    stats.durationByLogType[logType] = (stats.durationByLogType[logType] || 0) + duration;
                }
            }
        }
        
        stats.totalEventDuration = totalDuration;
        stats.averageEventDuration = eventCount > 0 ? totalDuration / eventCount : 0;
    }
    
    /**
     * 计算分类统计
     */
    private calculateCategoryStats(events: any[], stats: CalendarStatsData): void {
        for (const event of events) {
            // 优先级统计
            const priority = event.extendedProps?.priority || '无';
            stats.eventsByPriority[priority] = (stats.eventsByPriority[priority] || 0) + 1;
            
            // 状态统计
            const status = event.extendedProps?.status || '';
            stats.eventsByStatus[status] = (stats.eventsByStatus[status] || 0) + 1;
            
            // 来源统计
            const source = event.extendedProps?.source || 'siyuan';
            stats.eventsBySource[source] = (stats.eventsBySource[source] || 0) + 1;

            // 分类统计
            const category = event.extendedProps?.category || '无';
            stats.eventsByCategory[category] = (stats.eventsByCategory[category] || 0) + 1;

            // Lifelog 类型计数
            const logType = event.extendedProps?.logType;
            if (logType) {
                stats.eventsByLogType[logType] = (stats.eventsByLogType[logType] || 0) + 1;
            }

            // 分类完成/归档计数
            if (this.isCompletedStatus(status)) {
                stats.completedByCategory[category] = (stats.completedByCategory[category] || 0) + 1;
            } else if (this.isArchivedStatus(status)) {
                stats.archivedByCategory[category] = (stats.archivedByCategory[category] || 0) + 1;
            }

            // 标签统计（多选）
            const tags: string[] = Array.isArray(event.extendedProps?.tags)
                ? event.extendedProps.tags
                : [];
            if (tags.length === 0) {
                // 没有标签的事件归到“无标签”
                stats.eventsByTag['无标签'] = (stats.eventsByTag['无标签'] || 0) + 1;
                if (this.isCompletedStatus(status)) {
                    stats.completedByTag['无标签'] = (stats.completedByTag['无标签'] || 0) + 1;
                } else if (this.isArchivedStatus(status)) {
                    stats.archivedByTag['无标签'] = (stats.archivedByTag['无标签'] || 0) + 1;
                }
            } else {
                for (const tag of tags) {
                    const name = tag || '无标签';
                    stats.eventsByTag[name] = (stats.eventsByTag[name] || 0) + 1;
                    if (this.isCompletedStatus(status)) {
                        stats.completedByTag[name] = (stats.completedByTag[name] || 0) + 1;
                    } else if (this.isArchivedStatus(status)) {
                        stats.archivedByTag[name] = (stats.archivedByTag[name] || 0) + 1;
                    }
                }
            }
        }
    }

    /**
     * 计算分类/标签完成率
     */
    private calculateCategoryTagCompletionRates(stats: CalendarStatsData): void {
        // 分类
        for (const [category, total] of Object.entries(stats.eventsByCategory)) {
            const archived = stats.archivedByCategory[category] || 0;
            const actionable = Math.max(0, total - archived);
            const completed = stats.completedByCategory[category] || 0;
            stats.completionRateByCategory[category] = actionable > 0 ? (completed / actionable) * 100 : 0;
        }

        // 标签
        for (const [tag, total] of Object.entries(stats.eventsByTag)) {
            const archived = stats.archivedByTag[tag] || 0;
            const actionable = Math.max(0, total - archived);
            const completed = stats.completedByTag[tag] || 0;
            stats.completionRateByTag[tag] = actionable > 0 ? (completed / actionable) * 100 : 0;
        }
    }
    
    /**
     * 计算时间分布统计
     */
    private calculateTimeDistribution(events: any[], stats: CalendarStatsData): void {
        for (const event of events) {
            const startDate = new Date(event.start);
            
            // 小时分布
            const hour = startDate.getHours();
            stats.eventsByHour[hour]++;
            
            // 星期分布
            const weekday = startDate.getDay();
            stats.eventsByWeekday[weekday]++;
            
            // 月份分布
            const month = startDate.getMonth();
            stats.eventsByMonth[month]++;
        }
    }
    
    /**
     * 计算完成率
     */
    private calculateCompletionRate(stats: CalendarStatsData): void {
        const totalActionableEvents = stats.completedEvents + stats.pendingEvents;
        stats.completionRate = totalActionableEvents > 0 
            ? (stats.completedEvents / totalActionableEvents) * 100 
            : 0;
    }

    /**
     * 规范化状态文本并判断是否为“归档”状态
     */
    public isArchivedStatus(status: string | undefined | null): boolean {
        if (!status) return false;
        const s = String(status).trim().toLowerCase();
        return s.includes('归档') || s.includes('已归档') || s.includes('archive') || s.includes('archiv') || s.includes('archived');
    }

    /**
     * 规范化状态文本并判断是否为“完成”状态
     */
    public isCompletedStatus(status: string | undefined | null): boolean {
        if (!status) return false;
        const s = String(status).trim().toLowerCase();
        return s.includes('完成') || s.includes('已完成') || s === 'done' || s === 'completed' || s.includes('完成中');
    }
    
    /**
     * 获取统计摘要
     */
    public getStatsSummary(stats: CalendarStatsData): string {
        const summary = [
            `📊 日历数据统计报告`,
            ``,
            `📅 统计时间范围：${new Date(stats.dateRange.start).toLocaleDateString()} - ${new Date(stats.dateRange.end).toLocaleDateString()}`,
            `⏰ 生成时间：${new Date(stats.generatedAt).toLocaleString()}`,
            ``,
            `📈 基础统计：`,
            `  • 总事件数：${stats.totalEvents}`,
            `  • 已完成：${stats.completedEvents}`,
            `  • 待处理：${stats.pendingEvents}`,
            `  • 已归档：${stats.archivedEvents}`,
            `  • 周期事件：${stats.recurringEvents}`,
            `  • 完成率：${stats.completionRate.toFixed(1)}%`,
            ``,
            `⏱️ 时间统计：`,
            `  • 总时长：${this.formatDuration(stats.totalEventDuration)}`,
            `  • 平均时长：${this.formatDuration(stats.averageEventDuration)}`,
            ``,
            `🏷️ 优先级分布：`,
            ...Object.entries(stats.eventsByPriority).map(([priority, count]) => `  • ${priority}：${count}`),
            ``,
            `📊 状态分布：`,
            ...Object.entries(stats.eventsByStatus).map(([status, count]) => `  • ${status}：${count}`),
            ``,
            `🔄 来源分布：`,
            ...Object.entries(stats.eventsBySource).map(([source, count]) => `  • ${this.getSourceDisplayName(source)}：${count}`),
            ``,
            `📦 分类分布：`,
            ...Object.entries(stats.eventsByCategory).map(([category, count]) => `  • ${category}：${count}`),
            ``,
            `🏷️ 标签（Top 15）：`,
            ...Object.entries(stats.eventsByTag)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 15)
                .map(([tag, count]) => `  • ${tag}：${count}`),
            ``,
            `⏱️ 分类总时长 Top 10：`,
            ...Object.entries(stats.durationByCategory)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([category, minutes]) => `  • ${category}：${this.formatDuration(minutes)}`),
            ``,
            `⏱️ 标签总时长 Top 10：`,
            ...Object.entries(stats.durationByTag)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([tag, minutes]) => `  • ${tag}：${this.formatDuration(minutes)}`),
            ``,
            `✅ 分类完成率（Top 10 按任务量）：`,
            ...Object.entries(stats.eventsByCategory)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([category]) => `  • ${category}：${(stats.completionRateByCategory[category] || 0).toFixed(1)}%`),
        ];
        
        return summary.join('\n');
    }
    
    /**
     * 格式化时长
     */
    private formatDuration(minutes: number): string {
        if (minutes < 60) {
            return `${Math.round(minutes)}分钟`;
        } else if (minutes < 1440) {
            const hours = Math.floor(minutes / 60);
            const mins = Math.round(minutes % 60);
            return `${hours}小时${mins}分钟`;
        } else {
            const days = Math.floor(minutes / 1440);
            const hours = Math.floor((minutes % 1440) / 60);
            return `${days}天${hours}小时`;
        }
    }
    
    /**
     * 获取来源显示名称
     */
    private getSourceDisplayName(source: string): string {
        const sourceNames = {
            'siyuan': '思源数据库',
            'qqcalendar': 'QQ邮箱日历',
            'icsSubscription': 'ICS订阅',
            'lifelog': '生活记录',
        };
        return sourceNames[source] || source;
    }
    
    /**
     * 导出统计数据为JSON
     */
    public exportStatsAsJSON(stats: CalendarStatsData): string {
        return JSON.stringify(stats, null, 2);
    }
    
    /**
     * 导出统计数据为CSV
     */
    public exportStatsAsCSV(stats: CalendarStatsData): string {
        const csvLines = [
            '指标,数值',
            `总事件数,${stats.totalEvents}`,
            `已完成事件,${stats.completedEvents}`,
            `待处理事件,${stats.pendingEvents}`,
            `已归档事件,${stats.archivedEvents}`,
            `周期事件,${stats.recurringEvents}`,
            `完成率（%）,${stats.completionRate.toFixed(1)}`,
            `总时长（分钟）,${stats.totalEventDuration}`,
            `平均时长（分钟）,${stats.averageEventDuration.toFixed(1)}`,
            '',
            '优先级分布',
            ...Object.entries(stats.eventsByPriority).map(([priority, count]) => `${priority},${count}`),
            '',
            '状态分布',
            ...Object.entries(stats.eventsByStatus).map(([status, count]) => `${status},${count}`),
            '',
            '来源分布',
            ...Object.entries(stats.eventsBySource).map(([source, count]) => `${this.getSourceDisplayName(source)},${count}`),
            '',
            '分类分布',
            ...Object.entries(stats.eventsByCategory).map(([category, count]) => `${category},${count}`),
            '',
            '标签分布',
            ...Object.entries(stats.eventsByTag).map(([tag, count]) => `${tag},${count}`),
            '',
            '分类总时长（分钟）',
            ...Object.entries(stats.durationByCategory).map(([category, minutes]) => `${category},${Math.round(minutes)}`),
            '',
            '标签总时长（分钟）',
            ...Object.entries(stats.durationByTag).map(([tag, minutes]) => `${tag},${Math.round(minutes)}`),
            '',
            '分类完成率（%）',
            ...Object.entries(stats.completionRateByCategory).map(([category, rate]) => `${category},${rate.toFixed(1)}`),
            '',
            '标签完成率（%）',
            ...Object.entries(stats.completionRateByTag).map(([tag, rate]) => `${tag},${rate.toFixed(1)}`),
        ];
        
        return csvLines.join('\n');
    }
    
    /**
     * 获取热力图数据（按小时）
     */
    public getHourlyHeatmapData(stats: CalendarStatsData): Array<{hour: number, count: number, percentage: number}> {
        const maxCount = Math.max(...stats.eventsByHour);
        return stats.eventsByHour.map((count, hour) => ({
            hour,
            count,
            percentage: maxCount > 0 ? (count / maxCount) * 100 : 0
        }));
    }
    
    /**
     * 获取周统计数据
     */
    public getWeeklyStatsData(stats: CalendarStatsData): Array<{weekday: string, count: number}> {
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        return stats.eventsByWeekday.map((count, index) => ({
            weekday: weekdays[index],
            count
        }));
    }
    
    /**
     * 获取月度趋势数据
     */
    public getMonthlyTrendData(stats: CalendarStatsData): Array<{month: string, count: number}> {
        const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
        return stats.eventsByMonth.map((count, index) => ({
            month: months[index],
            count
        }));
    }
    
    /**
     * 显示统计结果消息
     */
    public showStatsMessage(stats: CalendarStatsData): void {
        const summary = this.getStatsSummary(stats);
        showMessage(`统计完成！总事件数：${stats.totalEvents}，完成率：${stats.completionRate.toFixed(1)}%`, 3000);
        console.debug(summary);
    }
}

// 导出单例实例
export const calendarStats = CalendarDataStats.getInstance();
