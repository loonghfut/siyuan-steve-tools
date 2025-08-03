/**
 * 日历统计可视化组件
 * 提供图表和数据展示功能
 */

import { Dialog } from 'siyuan';
import { CalendarStatsData, calendarStats } from './calendar-stats';

export interface ChartOptions {
    width?: number;
    height?: number;
    colors?: string[];
    showLabels?: boolean;
    showLegend?: boolean;
}

export class CalendarStatsVisualization {
    private static instance: CalendarStatsVisualization;

    private constructor() { }

    public static getInstance(): CalendarStatsVisualization {
        if (!CalendarStatsVisualization.instance) {
            CalendarStatsVisualization.instance = new CalendarStatsVisualization();
        }
        return CalendarStatsVisualization.instance;
    }

    /**
     * 创建统计数据展示面板
     */
    public createStatsPanel(stats: CalendarStatsData, containerId: string, dialog: Dialog): HTMLElement {
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container with id "${containerId}" not found`);
        }

        // 清空容器
        container.innerHTML = '';

        // 创建主面板
        const panel = document.createElement('div');
        panel.className = 'calendar-stats-panel';
        panel.style.cssText = `
            padding: 20px;
            background: var(--b3-theme-background);
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            overflow-y: auto;
        `;

        // 添加标题
        const title = document.createElement('h2');
        title.textContent = '📊 日历数据统计';
        title.style.cssText = `
            margin: 0 0 20px 0;
            color: var(--b3-theme-on-background);
            border-bottom: 2px solid var(--b3-theme-primary);
            padding-bottom: 10px;
        `;
        panel.appendChild(title);

        // 添加基础统计卡片
        panel.appendChild(this.createBasicStatsCards(stats));

        // 添加图表区域
        panel.appendChild(this.createChartsSection(stats));

        // 添加详细统计表格
        panel.appendChild(this.createDetailedStatsTable(stats));

        // 添加导出功能
        panel.appendChild(this.createExportSection(stats));

        container.appendChild(panel);
        return panel;
    }

    /**
     * 创建基础统计卡片
     */
    private createBasicStatsCards(stats: CalendarStatsData): HTMLElement {
        const cardsContainer = document.createElement('div');
        cardsContainer.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 25px;
        `;

        const cards = [
            {
                title: '总事件数',
                value: stats.totalEvents.toString(),
                icon: '📅',
                color: '#3498db'
            },
            {
                title: '已完成',
                value: stats.completedEvents.toString(),
                icon: '✅',
                color: '#27ae60'
            },
            {
                title: '待处理',
                value: stats.pendingEvents.toString(),
                icon: '⏳',
                color: '#f39c12'
            },
            {
                title: '完成率',
                value: `${stats.completionRate.toFixed(1)}%`,
                icon: '📈',
                color: '#9b59b6'
            },
            {
                title: '周期事件',
                value: stats.recurringEvents.toString(),
                icon: '🔄',
                color: '#e67e22'
            },
            {
                title: '总时长',
                value: this.formatDuration(stats.totalEventDuration),
                icon: '⏱️',
                color: '#34495e'
            }
        ];

        cards.forEach(card => {
            const cardElement = document.createElement('div');
            cardElement.style.cssText = `
                background: var(--b3-theme-surface);
                padding: 15px;
                border-radius: 8px;
                border-left: 4px solid ${card.color};
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                transition: transform 0.2s;
            `;

            cardElement.addEventListener('mouseenter', () => {
                cardElement.style.transform = 'translateY(-2px)';
            });

            cardElement.addEventListener('mouseleave', () => {
                cardElement.style.transform = 'translateY(0)';
            });

            cardElement.innerHTML = `
                <div style="display: flex; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 20px; margin-right: 8px;">${card.icon}</span>
                    <span style="font-size: 14px; color: var(--b3-theme-on-surface-variant);">${card.title}</span>
                </div>
                <div style="font-size: 24px; font-weight: bold; color: ${card.color};">${card.value}</div>
            `;

            cardsContainer.appendChild(cardElement);
        });

        return cardsContainer;
    }

    /**
     * 创建图表区域
     */
    private createChartsSection(stats: CalendarStatsData): HTMLElement {
        const section = document.createElement('div');
        section.style.cssText = `margin-bottom: 25px;`;

        // 添加图表标题
        const title = document.createElement('h3');
        title.textContent = '📊 可视化图表';
        title.style.cssText = `
            margin: 0 0 15px 0;
            color: var(--b3-theme-on-background);
        `;
        section.appendChild(title);

        // 图表容器
        const chartsContainer = document.createElement('div');
        chartsContainer.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
        `;

        // 饼图：状态分布
        chartsContainer.appendChild(this.createPieChart(
            '状态分布',
            stats.eventsByStatus,
            ['#27ae60', '#f39c12', '#e74c3c', '#95a5a6']
        ));

        // 饼图：优先级分布
        chartsContainer.appendChild(this.createPieChart(
            '优先级分布',
            stats.eventsByPriority,
            ['#e74c3c', '#f39c12', '#3498db', '#95a5a6']
        ));

        // 柱状图：小时分布
        chartsContainer.appendChild(this.createBarChart(
            '24小时事件分布',
            stats.eventsByHour.map((count, hour) => ({ label: `${hour}:00`, value: count })),
            '#3498db'
        ));

        // 柱状图：星期分布
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        chartsContainer.appendChild(this.createBarChart(
            '星期事件分布',
            stats.eventsByWeekday.map((count, index) => ({ label: weekdays[index], value: count })),
            '#9b59b6'
        ));

        section.appendChild(chartsContainer);
        return section;
    }

    /**
     * 创建饼图
     */
    private createPieChart(title: string, data: { [key: string]: number }, colors: string[]): HTMLElement {
        const container = document.createElement('div');
        container.style.cssText = `
            background: var(--b3-theme-surface);
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;

        const chartTitle = document.createElement('h4');
        chartTitle.textContent = title;
        chartTitle.style.cssText = `
            margin: 0 0 15px 0;
            text-align: center;
            color: var(--b3-theme-on-surface);
        `;
        container.appendChild(chartTitle);

        // 简单的饼图实现（CSS版本）
        const chartContainer = document.createElement('div');
        chartContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
        `;

        const total = Object.values(data).reduce((sum, val) => sum + val, 0);

        if (total > 0) {
            const pieChart = document.createElement('div');
            pieChart.style.cssText = `
                width: 120px;
                height: 120px;
                border-radius: 50%;
                margin-bottom: 15px;
                position: relative;
                background: conic-gradient(${this.createConicGradient(data, colors, total)});
            `;
            chartContainer.appendChild(pieChart);
        }

        // 图例
        const legend = document.createElement('div');
        legend.style.cssText = `width: 100%;`;

        Object.entries(data).forEach(([key, value], index) => {
            if (value > 0) {
                const legendItem = document.createElement('div');
                legendItem.style.cssText = `
                    display: flex;
                    align-items: center;
                    margin-bottom: 5px;
                    font-size: 12px;
                `;

                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';

                legendItem.innerHTML = `
                    <div style="
                        width: 12px; 
                        height: 12px; 
                        background: ${colors[index % colors.length]}; 
                        margin-right: 8px;
                        border-radius: 2px;
                    "></div>
                    <span>${key}: ${value} (${percentage}%)</span>
                `;
                legend.appendChild(legendItem);
            }
        });

        chartContainer.appendChild(legend);
        container.appendChild(chartContainer);
        return container;
    }

    /**
     * 创建柱状图
     */
    private createBarChart(title: string, data: Array<{ label: string, value: number }>, color: string): HTMLElement {
        const container = document.createElement('div');
        container.style.cssText = `
            background: var(--b3-theme-surface);
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;

        const chartTitle = document.createElement('h4');
        chartTitle.textContent = title;
        chartTitle.style.cssText = `
            margin: 0 0 15px 0;
            text-align: center;
            color: var(--b3-theme-on-surface);
        `;
        container.appendChild(chartTitle);

        const maxValue = Math.max(...data.map(d => d.value));

        if (maxValue > 0) {
            const chartContainer = document.createElement('div');
            chartContainer.style.cssText = `
                display: flex;
                align-items: end;
                height: 150px;
                gap: 4px;
                padding: 10px;
                border-bottom: 1px solid var(--b3-theme-outline);
                margin-bottom: 10px;
            `;

            data.forEach(item => {
                const barContainer = document.createElement('div');
                barContainer.style.cssText = `
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    flex: 1;
                    min-width: 0;
                `;

                const bar = document.createElement('div');
                const height = maxValue > 0 ? (item.value / maxValue) * 120 : 0;
                bar.style.cssText = `
                    width: 100%;
                    height: ${height}px;
                    background: ${color};
                    border-radius: 2px 2px 0 0;
                    margin-bottom: 5px;
                    position: relative;
                    transition: opacity 0.2s;
                `;

                // 添加数值标签
                if (item.value > 0) {
                    const label = document.createElement('div');
                    label.textContent = item.value.toString();
                    label.style.cssText = `
                        position: absolute;
                        top: -20px;
                        left: 50%;
                        transform: translateX(-50%);
                        font-size: 10px;
                        color: var(--b3-theme-on-surface);
                    `;
                    bar.appendChild(label);
                }

                bar.addEventListener('mouseenter', () => {
                    bar.style.opacity = '0.8';
                });

                bar.addEventListener('mouseleave', () => {
                    bar.style.opacity = '1';
                });

                const barLabel = document.createElement('div');
                barLabel.textContent = item.label.split(':')[0];
                barLabel.style.cssText = `
                    font-size: 10px;
                    color: var(--b3-theme-on-surface-variant);
                    text-align: center;
                    transform: rotate(-45deg);
                    white-space: nowrap;
                    max-width: 100%;
                    text-overflow: ellipsis;
                `;

                barContainer.appendChild(bar);
                barContainer.appendChild(barLabel);
                chartContainer.appendChild(barContainer);
            });

            container.appendChild(chartContainer);
        } else {
            const noDataMessage = document.createElement('div');
            noDataMessage.textContent = '暂无数据';
            noDataMessage.style.cssText = `
                text-align: center;
                color: var(--b3-theme-on-surface-variant);
                padding: 40px;
            `;
            container.appendChild(noDataMessage);
        }

        return container;
    }

    /**
     * 创建详细统计表格
     */
    private createDetailedStatsTable(stats: CalendarStatsData): HTMLElement {
        const section = document.createElement('div');
        section.style.cssText = `margin-bottom: 25px;`;

        const title = document.createElement('h3');
        title.textContent = '📋 详细统计';
        title.style.cssText = `
            margin: 0 0 15px 0;
            color: var(--b3-theme-on-background);
        `;
        section.appendChild(title);

        const table = document.createElement('table');
        table.style.cssText = `
            width: 100%;
            border-collapse: collapse;
            background: var(--b3-theme-surface);
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        `;

        const tableData = [
            ['统计项目', '数值', '占比'],
            ['总事件数', stats.totalEvents.toString(), '100%'],
            ['已完成事件', stats.completedEvents.toString(), `${((stats.completedEvents / stats.totalEvents) * 100).toFixed(1)}%`],
            ['待处理事件', stats.pendingEvents.toString(), `${((stats.pendingEvents / stats.totalEvents) * 100).toFixed(1)}%`],
            ['已归档事件', stats.archivedEvents.toString(), `${((stats.archivedEvents / stats.totalEvents) * 100).toFixed(1)}%`],
            ['周期事件', stats.recurringEvents.toString(), `${((stats.recurringEvents / stats.totalEvents) * 100).toFixed(1)}%`],
            ['总时长', this.formatDuration(stats.totalEventDuration), '-'],
            ['平均时长', this.formatDuration(stats.averageEventDuration), '-'],
            ['完成率', `${stats.completionRate.toFixed(1)}%`, '-'],
        ];

        tableData.forEach((row, index) => {
            const tr = document.createElement('tr');
            tr.style.cssText = `
                border-bottom: 1px solid var(--b3-theme-outline);
                ${index === 0 ? 'background: var(--b3-theme-primary-container);' : ''}
                ${index % 2 === 1 && index !== 0 ? 'background: var(--b3-theme-surface-variant);' : ''}
            `;

            row.forEach((cell, cellIndex) => {
                const td = document.createElement(index === 0 ? 'th' : 'td');
                td.textContent = cell;
                td.style.cssText = `
                    padding: 12px;
                    text-align: ${cellIndex === 0 ? 'left' : 'right'};
                    color: var(--b3-theme-on-surface);
                    ${index === 0 ? 'font-weight: bold;' : ''}
                `;
                tr.appendChild(td);
            });

            table.appendChild(tr);
        });

        section.appendChild(table);
        return section;
    }

    /**
     * 创建导出功能区域
     */
    private createExportSection(stats: CalendarStatsData): HTMLElement {
        const section = document.createElement('div');
        section.style.cssText = `
            display: flex;
            gap: 10px;
            justify-content: center;
            flex-wrap: wrap;
        `;

        const buttons = [
            {
                text: '📄 导出JSON',
                action: () => this.downloadFile(calendarStats.exportStatsAsJSON(stats), 'calendar-stats.json', 'application/json')
            },
            {
                text: '📊 导出CSV',
                action: () => this.downloadFile(calendarStats.exportStatsAsCSV(stats), 'calendar-stats.csv', 'text/csv')
            },
            {
                text: '📋 复制摘要',
                action: () => this.copyToClipboard(calendarStats.getStatsSummary(stats))
            }
        ];

        buttons.forEach(button => {
            const btn = document.createElement('button');
            btn.textContent = button.text;
            btn.style.cssText = `
                padding: 10px 20px;
                background: var(--b3-theme-primary);
                color: var(--b3-theme-on-primary);
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                transition: background 0.2s;
            `;

            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'var(--b3-theme-primary-hover)';
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'var(--b3-theme-primary)';
            });

            btn.addEventListener('click', button.action);
            section.appendChild(btn);
        });

        return section;
    }

    /**
     * 创建圆锥渐变字符串
     */
    private createConicGradient(data: { [key: string]: number }, colors: string[], total: number): string {
        let angle = 0;
        const gradientStops: string[] = [];

        Object.entries(data).forEach(([_key, value], index) => {
            if (value > 0) {
                const percentage = (value / total) * 100;
                const endAngle = angle + (percentage * 3.6); // 3.6度 = 1%

                gradientStops.push(`${colors[index % colors.length]} ${angle}deg ${endAngle}deg`);
                angle = endAngle;
            }
        });

        return gradientStops.join(', ');
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
    }

    /**
     * 复制到剪贴板
     */
    private copyToClipboard(text: string): void {
        navigator.clipboard.writeText(text).then(() => {
            // 显示成功消息
            const toast = document.createElement('div');
            toast.textContent = '已复制到剪贴板';
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: var(--b3-theme-primary);
                color: var(--b3-theme-on-primary);
                padding: 10px 15px;
                border-radius: 6px;
                z-index: 10000;
                animation: slideIn 0.3s ease-out;
            `;

            // 添加动画样式
            if (!document.querySelector('#toast-styles')) {
                const style = document.createElement('style');
                style.id = 'toast-styles';
                style.textContent = `
                    @keyframes slideIn {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                `;
                document.head.appendChild(style);
            }

            document.body.appendChild(toast);
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 3000);
        }).catch(() => {
            console.error('复制失败');
        });
    }
}

// 导出单例实例
export const calendarStatsVisualization = CalendarStatsVisualization.getInstance();
