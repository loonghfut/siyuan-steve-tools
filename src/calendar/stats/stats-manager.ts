/**
 * 日历统计管理器
 * 负责集成统计功能到日历模块，提供统计接口
 */

import { CalendarStatsData, CalendarStatsConfig, calendarStats } from './calendar-stats';
import { calendarStatsVisualization } from './stats-visualization';
import { Dialog } from 'siyuan';
import { showMessage } from 'siyuan';

export class CalendarStatsManager {
    private static instance: CalendarStatsManager;
    private statsDialog: Dialog | null = null;
    private lastStatsData: CalendarStatsData | null = null;

    private constructor() { }

    public static getInstance(): CalendarStatsManager {
        if (!CalendarStatsManager.instance) {
            CalendarStatsManager.instance = new CalendarStatsManager();
        }
        return CalendarStatsManager.instance;
    }

    /**
     * 显示统计对话框
     * @param events 日历事件数组
     * @param config 统计配置
     */
    public async showStatsDialog(events: any[], config?: Partial<CalendarStatsConfig>): Promise<void> {
        try {
            // 生成统计数据
            const statsData = calendarStats.generateStats(events, config);
            this.lastStatsData = statsData;

            // 创建对话框
            this.statsDialog = new Dialog({
                title: null,
                content: `<div id="calendar-stats-container" style="width: 900px; max-width: 90vw;"></div>`,
                width: "auto",
                height: "auto",
                disableClose: false,
                disableAnimation: false,
                hideCloseIcon: false,
            });

            try {
                calendarStatsVisualization.createStatsPanel(statsData, 'calendar-stats-container', this.statsDialog);
            } catch (error) {
                console.error('创建统计面板失败:', error);
                showMessage('统计面板创建失败', -1, 'error');
            }


            // 显示成功消息
            calendarStats.showStatsMessage(statsData);

        } catch (error) {
            console.error('显示统计对话框失败:', error);
            showMessage('统计功能出现错误', -1, 'error');
        }
    }

    /**
     * 快速统计（不显示对话框）
     * @param events 日历事件数组
     * @param config 统计配置
     * @returns 统计数据
     */
    public quickStats(events: any[], config?: Partial<CalendarStatsConfig>): CalendarStatsData {
        const statsData = calendarStats.generateStats(events, config);
        this.lastStatsData = statsData;
        calendarStats.showStatsMessage(statsData);
        return statsData;
    }

    /**
     * 获取当前月份统计
     * @param events 日历事件数组
     * @returns 统计数据
     */
    public getCurrentMonthStats(events: any[]): CalendarStatsData {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const config: Partial<CalendarStatsConfig> = {
            dateRange: {
                start: startOfMonth,
                end: endOfMonth
            }
        };

        return this.quickStats(events, config);
    }

    /**
     * 获取当前年份统计
     * @param events 日历事件数组
     * @returns 统计数据
     */
    public getCurrentYearStats(events: any[]): CalendarStatsData {
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const endOfYear = new Date(now.getFullYear(), 11, 31);

        const config: Partial<CalendarStatsConfig> = {
            dateRange: {
                start: startOfYear,
                end: endOfYear
            }
        };

        return this.quickStats(events, config);
    }

    /**
     * 获取最近7天统计
     * @param events 日历事件数组
     * @returns 统计数据
     */
    public getRecentWeekStats(events: any[]): CalendarStatsData {
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const config: Partial<CalendarStatsConfig> = {
            dateRange: {
                start: weekAgo,
                end: now
            }
        };

        return this.quickStats(events, config);
    }

    /**
     * 获取最近30天统计
     * @param events 日历事件数组
     * @returns 统计数据
     */
    public getRecentMonthStats(events: any[]): CalendarStatsData {
        const now = new Date();
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const config: Partial<CalendarStatsConfig> = {
            dateRange: {
                start: monthAgo,
                end: now
            }
        };

        return this.quickStats(events, config);
    }

    /**
     * 获取自定义时间范围统计
     * @param events 日历事件数组
     * @param startDate 开始日期
     * @param endDate 结束日期
     * @param includeSources 包含的数据源
     * @returns 统计数据
     */
    public getCustomRangeStats(
        events: any[],
        startDate: Date,
        endDate: Date,
        includeSources?: string[]
    ): CalendarStatsData {
        const config: Partial<CalendarStatsConfig> = {
            dateRange: {
                start: startDate,
                end: endDate
            }
        };

        if (includeSources) {
            config.includeSources = includeSources;
        }

        return this.quickStats(events, config);
    }

    /**
     * 显示统计摘要消息
     * @param events 日历事件数组
     * @param config 统计配置
     */
    public showStatsSummary(events: any[], config?: Partial<CalendarStatsConfig>): void {
        const statsData = calendarStats.generateStats(events, config);
        const summary = calendarStats.getStatsSummary(statsData);

        // 创建一个简单的摘要对话框
        new Dialog({
            title: "统计摘要",
            content: `<pre style="white-space: pre-wrap; font-family: monospace; padding: 20px; max-height: 400px; overflow-y: auto;">${summary}</pre>`,
            width: "600px",
            disableClose: false,
        });
    }

    /**
     * 导出统计数据
     * @param events 日历事件数组
     * @param format 导出格式 ('json' | 'csv' | 'summary')
     * @param config 统计配置
     */
    public exportStats(
        events: any[],
        format: 'json' | 'csv' | 'summary' = 'json',
        config?: Partial<CalendarStatsConfig>
    ): void {
        const statsData = calendarStats.generateStats(events, config);

        let content: string;
        let filename: string;
        let mimeType: string;

        switch (format) {
            case 'csv':
                content = calendarStats.exportStatsAsCSV(statsData);
                filename = `calendar-stats-${new Date().toISOString().split('T')[0]}.csv`;
                mimeType = 'text/csv';
                break;
            case 'summary':
                content = calendarStats.getStatsSummary(statsData);
                filename = `calendar-stats-summary-${new Date().toISOString().split('T')[0]}.txt`;
                mimeType = 'text/plain';
                break;
            default:
                content = calendarStats.exportStatsAsJSON(statsData);
                filename = `calendar-stats-${new Date().toISOString().split('T')[0]}.json`;
                mimeType = 'application/json';
                break;
        }

        this.downloadFile(content, filename, mimeType);
    }

    /**
     * 获取最后一次统计数据
     */
    public getLastStatsData(): CalendarStatsData | null {
        return this.lastStatsData;
    }

    /**
     * 创建统计快捷菜单
     * @param events 日历事件数组
     * @param container 容器元素
     */
    public createStatsQuickMenu(events: any[], container: HTMLElement): void {
        const menu = document.createElement('div');
        menu.style.cssText = `
            position: relative;
            display: inline-block;
        `;

        const button = document.createElement('button');
        button.textContent = '统计';
        button.style.cssText = `
            padding: 6px 12px;
            background: var(--b3-theme-primary);
            color: var(--b3-theme-on-primary);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        `;

        const dropdown = document.createElement('div');
        dropdown.style.cssText = `
            position: absolute;
            top: 100%;
            left: 0;
            background: var(--b3-theme-surface);
            border: 1px solid var(--b3-theme-outline);
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 1000;
            min-width: 150px;
            display: none;
        `;

        const menuItems = [
            { text: '详细统计', action: () => this.showStatsDialog(events) },
            { text: '统计摘要', action: () => this.showStatsSummary(events) },
            { text: '本月统计', action: () => this.getCurrentMonthStats(events) },
            { text: '本年统计', action: () => this.getCurrentYearStats(events) },
            { text: '最近7天', action: () => this.getRecentWeekStats(events) },
            { text: '最近30天', action: () => this.getRecentMonthStats(events) },
            { text: '导出 JSON', action: () => this.exportStats(events, 'json') },
            { text: '导出 CSV', action: () => this.exportStats(events, 'csv') },
        ];

        menuItems.forEach(item => {
            const menuItem = document.createElement('div');
            menuItem.textContent = item.text;
            menuItem.style.cssText = `
                padding: 8px 12px;
                cursor: pointer;
                border-bottom: 1px solid var(--b3-theme-outline);
                transition: background 0.2s;
                font-size: 12px;
            `;

            menuItem.addEventListener('mouseenter', () => {
                menuItem.style.background = 'var(--b3-theme-surface-variant)';
            });

            menuItem.addEventListener('mouseleave', () => {
                menuItem.style.background = 'transparent';
            });

            menuItem.addEventListener('click', () => {
                item.action();
                dropdown.style.display = 'none';
            });

            dropdown.appendChild(menuItem);
        });

        // 删除最后一个分割线
        const lastChild = dropdown.lastElementChild as HTMLElement;
        if (lastChild) {
            lastChild.style.borderBottom = 'none';
        }

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });

        // 点击其他地方关闭菜单
        document.addEventListener('click', () => {
            dropdown.style.display = 'none';
        });

        menu.appendChild(button);
        menu.appendChild(dropdown);
        container.appendChild(menu);
    }

    /**
     * 下载文件
     */
    private downloadFile(content: string, filename: string, mimeType: string): void {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage(`已导出: ${filename}`, 3000);
    }

    /**
     * 关闭统计对话框
     */
    public closeStatsDialog(): void {
        if (this.statsDialog) {
            this.statsDialog.destroy();
            this.statsDialog = null;
        }
    }

    /**
     * 检查是否有可用的统计数据
     * @param events 事件数组
     * @returns 是否有数据
     */
    public hasStatsData(events: any[]): boolean {
        return events && events.length > 0;
    }

    /**
     * 获取统计数据预览
     * @param events 事件数组
     * @returns 预览信息
     */
    public getStatsPreview(events: any[]): { total: number, completed: number, pending: number, completionRate: number } {
        if (!events || events.length === 0) {
            return { total: 0, completed: 0, pending: 0, completionRate: 0 };
        }

        const completed = events.filter(e => calendarStats.isCompletedStatus(e.extendedProps?.status)).length;
        const pending = events.filter(e => !calendarStats.isCompletedStatus(e.extendedProps?.status) && !calendarStats.isArchivedStatus(e.extendedProps?.status)).length;
        const completionRate = (completed + pending) > 0 ? (completed / (completed + pending)) * 100 : 0;

        return {
            total: events.length,
            completed,
            pending,
            completionRate: Math.round(completionRate * 10) / 10
        };
    }
}

// 导出单例实例
export const calendarStatsManager = CalendarStatsManager.getInstance();
