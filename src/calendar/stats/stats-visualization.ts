/**
 * 日历统计可视化组件
 * 提供图表和数据展示功能
 */

import { Dialog, showMessage } from 'siyuan';
import { CalendarStatsData, calendarStats } from './calendar-stats';
import './stats-visualization.css';

export interface ChartOptions {
    width?: number;
    height?: number;
    colors?: string[];
    showLabels?: boolean;
    showLegend?: boolean;
}

type StatCardConfig = {
    title: string;
    value: string;
    meta?: string;
    color: string;
};

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
    public createStatsPanel(stats: CalendarStatsData, containerId: string, _dialog: Dialog): HTMLElement {
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container with id "${containerId}" not found`);
        }

        container.innerHTML = '';

        const panel = document.createElement('div');
        panel.className = 'calendar-stats-panel';

        panel.appendChild(this.createHeroSummary(stats));
        panel.appendChild(this.createBasicStatsCards(stats));
        panel.appendChild(this.createChartsSection(stats));
        panel.appendChild(this.createDetailedStatsTable(stats));
        panel.appendChild(this.createExportSection(stats));

        container.appendChild(panel);
        return panel;
    }

    private createTextElement<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
        const element = document.createElement(tag);
        element.className = className;
        if (text !== undefined) {
            element.textContent = text;
        }
        return element;
    }

    /**
     * 创建顶部概览
     */
    private createHeroSummary(stats: CalendarStatsData): HTMLElement {
        const hero = document.createElement('section');
        hero.className = 'calendar-stats__hero';

        const main = document.createElement('div');
        main.className = 'calendar-stats__hero-main';

        const eyebrow = this.createTextElement('div', 'calendar-stats__eyebrow', '统计概览');
        const title = this.createTextElement('h2', 'calendar-stats__title', '日历数据统计');
        const subtitle = this.createTextElement(
            'p',
            'calendar-stats__subtitle',
            `共 ${stats.totalEvents} 个事件，已完成 ${stats.completedEvents} 个，累计 ${this.formatDuration(stats.totalEventDuration)}`
        );

        main.appendChild(eyebrow);
        main.appendChild(title);
        main.appendChild(subtitle);

        const metrics = document.createElement('div');
        metrics.className = 'calendar-stats__hero-metrics';

        metrics.appendChild(this.createHeroMetric('总事件数', stats.totalEvents.toString()));
        metrics.appendChild(this.createHeroMetric('完成率', `${stats.completionRate.toFixed(1)}%`));
        metrics.appendChild(this.createHeroMetric('总时长', this.formatDuration(stats.totalEventDuration)));

        const completion = document.createElement('div');
        completion.className = 'calendar-stats__completion';

        const completionHead = document.createElement('div');
        completionHead.className = 'calendar-stats__completion-head';
        completionHead.appendChild(this.createTextElement('span', 'calendar-stats__completion-label', '完成进度'));
        completionHead.appendChild(this.createTextElement('span', 'calendar-stats__completion-value', `${stats.completionRate.toFixed(1)}%`));

        const progress = document.createElement('div');
        progress.className = 'calendar-stats__completion-bar';
        progress.style.setProperty('--progress', `${this.clamp(stats.completionRate, 0, 100)}%`);

        completion.appendChild(completionHead);
        completion.appendChild(progress);
        metrics.appendChild(completion);

        hero.appendChild(main);
        hero.appendChild(metrics);
        return hero;
    }

    private createHeroMetric(label: string, value: string): HTMLElement {
        const metric = document.createElement('div');
        metric.className = 'calendar-stats__hero-metric';

        metric.appendChild(this.createTextElement('span', 'calendar-stats__hero-label', label));
        metric.appendChild(this.createTextElement('strong', 'calendar-stats__hero-value', value));

        return metric;
    }

    /**
     * 创建基础统计卡片
     */
    private createBasicStatsCards(stats: CalendarStatsData): HTMLElement {
        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'stats-cards';

        const cards: StatCardConfig[] = [
            {
                title: '总事件数',
                value: stats.totalEvents.toString(),
                meta: '当前统计范围内的全部事件',
                color: 'var(--b3-theme-primary)'
            },
            {
                title: '已完成',
                value: stats.completedEvents.toString(),
                meta: this.formatPercent(stats.completedEvents, stats.totalEvents),
                color: 'var(--b3-card-success-color, #2ea043)'
            },
            {
                title: '待处理',
                value: stats.pendingEvents.toString(),
                meta: this.formatPercent(stats.pendingEvents, stats.totalEvents),
                color: 'var(--b3-card-warning-color, #d9822b)'
            },
            {
                title: '完成率',
                value: `${stats.completionRate.toFixed(1)}%`,
                meta: '已完成事件占比',
                color: 'var(--b3-card-info-color, #0969da)'
            },
            {
                title: '周期事件',
                value: stats.recurringEvents.toString(),
                meta: this.formatPercent(stats.recurringEvents, stats.totalEvents),
                color: 'var(--b3-card-error-color, #cf222e)'
            },
            {
                title: '总时长',
                value: this.formatDuration(stats.totalEventDuration),
                meta: `平均 ${this.formatDuration(stats.averageEventDuration)}`,
                color: 'var(--b3-theme-on-surface)'
            }
        ];

        cards.forEach(card => {
            const cardElement = document.createElement('article');
            cardElement.className = 'stats-card';
            cardElement.style.setProperty('--accent-color', card.color);

            cardElement.appendChild(this.createTextElement('div', 'stats-card__label', card.title));
            cardElement.appendChild(this.createTextElement('div', 'stats-card__value', card.value));
            if (card.meta) {
                cardElement.appendChild(this.createTextElement('div', 'stats-card__meta', card.meta));
            }

            cardsContainer.appendChild(cardElement);
        });

        return cardsContainer;
    }

    /**
     * 创建图表区域
     */
    private createChartsSection(stats: CalendarStatsData): HTMLElement {
        const section = document.createElement('section');
        section.className = 'stats-section stats-section--charts';

        section.appendChild(this.createSectionHead('可视化图表', '从状态、优先级、分类、标签和时间分布观察事件结构'));

        const chartsContainer = document.createElement('div');
        chartsContainer.className = 'stats-charts';

        chartsContainer.appendChild(this.createPieChart(
            '状态分布',
            stats.eventsByStatus,
            ['var(--b3-card-success-color, #2ea043)', 'var(--b3-card-warning-color, #d9822b)', 'var(--b3-card-error-color, #cf222e)', '#8c959f']
        ));

        chartsContainer.appendChild(this.createPieChart(
            '优先级分布',
            stats.eventsByPriority,
            ['#cf222e', '#d9822b', '#0969da', '#8c959f']
        ));

        chartsContainer.appendChild(this.createPieChart(
            '分类分布',
            stats.eventsByCategory,
            ['#1abc9c', '#2ecc71', '#9b59b6', '#e67e22', '#e74c3c', '#95a5a6']
        ));

        chartsContainer.appendChild(this.createBarChart(
            '24小时事件分布',
            stats.eventsByHour.map((count, hour) => ({ label: `${hour}:00`, value: count })),
            '#0969da'
        ));

        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        chartsContainer.appendChild(this.createBarChart(
            '星期事件分布',
            stats.eventsByWeekday.map((count, index) => ({ label: weekdays[index], value: count })),
            '#8250df'
        ));

        const topTags = Object.entries(stats.eventsByTag)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12)
            .map(([tag, count]) => ({ label: tag, value: count }));
        if (topTags.length) {
            chartsContainer.appendChild(this.createBarChart('标签 Top12', topTags, '#16a085'));
        }

        const categoryDurTop = Object.entries(stats.durationByCategory)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([label, value]) => ({ label, value }));
        if (categoryDurTop.length) {
            chartsContainer.appendChild(this.createBarChart('分类总时长 Top10（分钟）', categoryDurTop, '#2ecc71'));
        }

        const tagDurTop = Object.entries(stats.durationByTag)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([label, value]) => ({ label, value }));
        if (tagDurTop.length) {
            chartsContainer.appendChild(this.createBarChart('标签总时长 Top10（分钟）', tagDurTop, '#8e44ad'));
        }

        if (stats.eventsByLogType && Object.keys(stats.eventsByLogType).length) {
            chartsContainer.appendChild(this.createPieChart(
                '生活记录类型分布',
                stats.eventsByLogType,
                ['#1abc9c', '#2ecc71', '#9b59b6', '#e67e22', '#e74c3c', '#95a5a6', '#3498db', '#f39c12']
            ));
        }

        if (stats.durationByLogType && Object.keys(stats.durationByLogType).length) {
            const lifelogDurTop = Object.entries(stats.durationByLogType)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 15)
                .map(([label, value]) => ({ label, value }));
            chartsContainer.appendChild(this.createBarChart('生活记录类型总时长（分钟）', lifelogDurTop, '#16a085'));
        }

        const categoryRateTop = Object.entries(stats.eventsByCategory)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([label]) => ({ label, value: Number((stats.completionRateByCategory[label] || 0).toFixed(1)) }));
        if (categoryRateTop.length) {
            chartsContainer.appendChild(this.createBarChart('分类完成率 Top10（%）', categoryRateTop, '#e67e22'));
        }

        const tagRateTop = Object.entries(stats.eventsByTag)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([label]) => ({ label, value: Number((stats.completionRateByTag[label] || 0).toFixed(1)) }));
        if (tagRateTop.length) {
            chartsContainer.appendChild(this.createBarChart('标签完成率 Top10（%）', tagRateTop, '#c0392b'));
        }

        section.appendChild(chartsContainer);
        return section;
    }

    private createSectionHead(title: string, desc?: string): HTMLElement {
        const head = document.createElement('div');
        head.className = 'stats-section__head';
        head.appendChild(this.createTextElement('h3', 'stats-section__title', title));
        if (desc) {
            head.appendChild(this.createTextElement('p', 'stats-section__desc', desc));
        }
        return head;
    }

    /**
     * 创建饼图
     */
    private createPieChart(title: string, data: { [key: string]: number }, colors: string[]): HTMLElement {
        const container = document.createElement('article');
        container.className = 'stats-chart-card stats-chart-card--pie';

        const chartTitle = this.createTextElement('h4', 'stats-chart-card__title', title);
        container.appendChild(chartTitle);

        const chartContainer = document.createElement('div');
        chartContainer.className = 'stats-pie';

        const total = Object.values(data).reduce((sum, val) => sum + val, 0);

        if (total > 0) {
            const pieChart = document.createElement('div');
            pieChart.className = 'stats-pie__chart';
            pieChart.style.background = `conic-gradient(${this.createConicGradient(data, colors, total)})`;
            pieChart.appendChild(this.createTextElement('span', 'stats-pie__total', total.toString()));
            chartContainer.appendChild(pieChart);
        } else {
            chartContainer.appendChild(this.createTextElement('div', 'stats-nodata', '暂无数据'));
        }

        const legend = document.createElement('div');
        legend.className = 'stats-legend';

        Object.entries(data).forEach(([key, value], index) => {
            if (value <= 0) return;

            const legendItem = document.createElement('div');
            legendItem.className = 'stats-legend__item';
            legendItem.title = `${key}: ${value}`;

            const dot = document.createElement('span');
            dot.className = 'stats-legend__dot';
            dot.style.background = colors[index % colors.length];

            const label = this.createTextElement('span', 'stats-legend__label', key);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
            const legendValue = this.createTextElement('span', 'stats-legend__value', `${value} (${percentage}%)`);

            legendItem.appendChild(dot);
            legendItem.appendChild(label);
            legendItem.appendChild(legendValue);
            legend.appendChild(legendItem);
        });

        chartContainer.appendChild(legend);
        container.appendChild(chartContainer);
        return container;
    }

    /**
     * 创建柱状图
     */
    private createBarChart(title: string, data: Array<{ label: string, value: number }>, color: string): HTMLElement {
        const container = document.createElement('article');
        container.className = 'stats-chart-card stats-chart-card--bar';
        container.style.setProperty('--accent-color', color);

        const chartTitle = this.createTextElement('h4', 'stats-chart-card__title', title);
        container.appendChild(chartTitle);

        const maxValue = data.length ? Math.max(...data.map(d => d.value)) : 0;

        if (maxValue > 0) {
            const chartContainer = document.createElement('div');
            chartContainer.className = 'stats-bar';

            data.forEach(item => {
                const barContainer = document.createElement('div');
                barContainer.className = 'stats-bar__item';
                barContainer.title = `${item.label}: ${item.value}`;

                const bar = document.createElement('div');
                const height = maxValue > 0 ? (item.value / maxValue) * 128 : 0;
                bar.className = 'stats-bar__bar';
                bar.style.setProperty('--bar-height', `${height}px`);

                if (item.value > 0) {
                    bar.appendChild(this.createTextElement('div', 'stats-bar__label', item.value.toString()));
                }

                const barLabel = this.createTextElement('div', 'stats-bar__x', item.label.split(':')[0]);

                barContainer.appendChild(bar);
                barContainer.appendChild(barLabel);
                chartContainer.appendChild(barContainer);
            });

            container.appendChild(chartContainer);
        } else {
            container.appendChild(this.createTextElement('div', 'stats-nodata', '暂无数据'));
        }

        return container;
    }

    /**
     * 创建详细统计表格
     */
    private createDetailedStatsTable(stats: CalendarStatsData): HTMLElement {
        const section = document.createElement('section');
        section.className = 'stats-section stats-section--details';
        section.appendChild(this.createSectionHead('详细统计', '核心统计项、数值和占比'));

        const tableWrap = document.createElement('div');
        tableWrap.className = 'stats-table-wrap';

        const table = document.createElement('table');
        table.className = 'stats-table';

        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        ['统计项目', '数值', '占比'].forEach((header, index) => {
            const th = document.createElement('th');
            th.className = `stats-table__cell ${index === 0 ? 'is-left' : 'is-right'}`;
            th.textContent = header;
            headRow.appendChild(th);
        });
        thead.appendChild(headRow);

        const tbody = document.createElement('tbody');
        const tableData = [
            ['总事件数', stats.totalEvents.toString(), this.formatPercent(stats.totalEvents, stats.totalEvents)],
            ['已完成事件', stats.completedEvents.toString(), this.formatPercent(stats.completedEvents, stats.totalEvents)],
            ['待处理事件', stats.pendingEvents.toString(), this.formatPercent(stats.pendingEvents, stats.totalEvents)],
            ['已归档事件', stats.archivedEvents.toString(), this.formatPercent(stats.archivedEvents, stats.totalEvents)],
            ['周期事件', stats.recurringEvents.toString(), this.formatPercent(stats.recurringEvents, stats.totalEvents)],
            ['总时长', this.formatDuration(stats.totalEventDuration), '-'],
            ['平均时长', this.formatDuration(stats.averageEventDuration), '-'],
            ['完成率', `${stats.completionRate.toFixed(1)}%`, '-'],
        ];

        tableData.forEach(row => {
            const tr = document.createElement('tr');
            row.forEach((cell, cellIndex) => {
                const td = document.createElement('td');
                td.className = `stats-table__cell ${cellIndex === 0 ? 'is-left' : 'is-right'}`;
                td.textContent = cell;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });

        table.appendChild(thead);
        table.appendChild(tbody);
        tableWrap.appendChild(table);
        section.appendChild(tableWrap);
        return section;
    }

    /**
     * 创建导出功能区域
     */
    private createExportSection(stats: CalendarStatsData): HTMLElement {
        const section = document.createElement('section');
        section.className = 'stats-actions';

        const buttons = [
            {
                text: '导出 JSON',
                className: 'stats-action stats-action--primary',
                action: () => this.downloadFile(calendarStats.exportStatsAsJSON(stats), 'calendar-stats.json', 'application/json')
            },
            {
                text: '导出 CSV',
                className: 'stats-action stats-action--secondary',
                action: () => this.downloadFile(calendarStats.exportStatsAsCSV(stats), 'calendar-stats.csv', 'text/csv')
            },
            {
                text: '复制摘要',
                className: 'stats-action stats-action--secondary',
                action: () => this.copyToClipboard(calendarStats.getStatsSummary(stats))
            }
        ];

        buttons.forEach(button => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = button.className;
            btn.textContent = button.text;
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
                const endAngle = angle + (percentage * 3.6);

                gradientStops.push(`${colors[index % colors.length]} ${angle}deg ${endAngle}deg`);
                angle = endAngle;
            }
        });

        return gradientStops.join(', ');
    }

    private formatPercent(value: number, total: number): string {
        if (!total) return '0.0%';
        return `${((value / total) * 100).toFixed(1)}%`;
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(Math.max(value, min), max);
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
        showMessage(`已导出: ${filename}`, 3000);
    }

    /**
     * 复制到剪贴板
     */
    private copyToClipboard(text: string): void {
        navigator.clipboard.writeText(text).then(() => {
            showMessage('已复制到剪贴板', 3000);
        }).catch(() => {
            showMessage('复制失败', -1, 'error');
        });
    }
}

// 导出单例实例
export const calendarStatsVisualization = CalendarStatsVisualization.getInstance();
