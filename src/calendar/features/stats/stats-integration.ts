/**
 * 日历统计功能集成示例
 * 展示如何在日历模块中使用统计功能
 */

import { calendarStatsManager } from './index';

/**
 * 为日历添加统计按钮
 * @param calendar FullCalendar实例
 * @param calendarEl 日历容器元素
 */
export function addStatsButtonToCalendar(calendar: any, calendarEl: HTMLElement): void {
    // 查找工具栏
    const toolbar = calendarEl.querySelector('.fc-header-toolbar');
    if (!toolbar) {
        console.warn('找不到日历工具栏，无法添加统计按钮');
        return;
    }
    
    // 查找右侧按钮组
    const rightButtons = toolbar.querySelector('.fc-toolbar-chunk:last-child');
    if (!rightButtons) {
        console.warn('找不到工具栏右侧按钮组');
        return;
    }
    
    // 创建统计按钮组
    const statsButtonGroup = document.createElement('div');
    statsButtonGroup.className = 'fc-button-group';
    statsButtonGroup.style.marginLeft = '10px';
    
    // 创建统计按钮
    const statsButton = document.createElement('button');
    statsButton.className = 'fc-button fc-button-primary';
    statsButton.textContent = '统计';
    statsButton.title = '查看日历数据统计';
    
    // 添加点击事件
    statsButton.addEventListener('click', async () => {
        try {
            // 获取当前日历的所有事件
            const events = calendar.getEvents();
            
            if (!calendarStatsManager.hasStatsData(events)) {
                const toast = document.createElement('div');
                toast.textContent = '当前没有可统计的事件数据';
                toast.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: #f39c12;
                    color: white;
                    padding: 10px 15px;
                    border-radius: 6px;
                    z-index: 10000;
                `;
                document.body.appendChild(toast);
                setTimeout(() => document.body.removeChild(toast), 3000);
                return;
            }
            
            // 显示统计对话框
            await calendarStatsManager.showStatsDialog(events);
        } catch (error) {
            console.error('显示统计失败:', error);
        }
    });
    
    statsButtonGroup.appendChild(statsButton);
    rightButtons.appendChild(statsButtonGroup);
}

/**
 * 为日历添加统计快捷菜单
 * @param calendar FullCalendar实例
 * @param calendarEl 日历容器元素
 */
export function addStatsQuickMenuToCalendar(calendar: any, calendarEl: HTMLElement): void {
    // 查找工具栏
    const toolbar = calendarEl.querySelector('.fc-header-toolbar');
    if (!toolbar) {
        console.warn('找不到日历工具栏，无法添加统计菜单');
        return;
    }
    
    // 查找右侧按钮组
    const rightButtons = toolbar.querySelector('.fc-toolbar-chunk:last-child');
    if (!rightButtons) {
        console.warn('找不到工具栏右侧按钮组');
        return;
    }
    
    // 获取当前日历的所有事件
    const events = calendar.getEvents();
    
    // 创建快捷菜单
    calendarStatsManager.createStatsQuickMenu(events, rightButtons as HTMLElement);
}

/**
 * 在日历视图变化时显示统计预览
 * @param calendar FullCalendar实例
 * @param calendarEl 日历容器元素
 */
export function addStatsPreviewToCalendar(calendar: any, calendarEl: HTMLElement): void {
    // 创建统计预览容器
    const previewContainer = document.createElement('div');
    previewContainer.id = 'calendar-stats-preview';
    previewContainer.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: var(--b3-theme-surface);
        border: 1px solid var(--b3-theme-outline);
        border-radius: 6px;
        padding: 8px 12px;
        font-size: 12px;
        color: var(--b3-theme-on-surface);
        z-index: 100;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        min-width: 120px;
        pointer-events: none;
    `;
    
    // 确保日历容器有相对定位
    const calendarWrapper = calendarEl.querySelector('.fc');
    if (calendarWrapper) {
        (calendarWrapper as HTMLElement).style.position = 'relative';
        calendarWrapper.appendChild(previewContainer);
    }
    
    // 更新统计预览
    const updatePreview = () => {
        const events = calendar.getEvents();
        const preview = calendarStatsManager.getStatsPreview(events);
        
        previewContainer.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px;">统计概览</div>
            <div>总计: ${preview.total}</div>
            <div>完成: ${preview.completed}</div>
            <div>待办: ${preview.pending}</div>
            <div>完成率: ${preview.completionRate}%</div>
        `;
        
        // 根据完成率设置颜色
        const color = preview.completionRate >= 80 ? '#27ae60' : 
                     preview.completionRate >= 60 ? '#f39c12' : '#e74c3c';
        previewContainer.style.borderLeftColor = color;
        previewContainer.style.borderLeftWidth = '3px';
    };
    
    // 初始更新
    updatePreview();
    
    // 监听事件变化
    calendar.on('eventsSet', updatePreview);
    calendar.on('eventAdd', updatePreview);
    calendar.on('eventChange', updatePreview);
    calendar.on('eventRemove', updatePreview);
}

/**
 * 添加统计功能到现有日历
 * @param calendar FullCalendar实例
 * @param calendarEl 日历容器元素
 * @param options 选项
 */
export function addStatsToCalendar(
    calendar: any, 
    calendarEl: HTMLElement, 
    options: {
        showButton?: boolean;
        showQuickMenu?: boolean;
        showPreview?: boolean;
    } = {}
): void {
    const {
        showButton = true,
        showQuickMenu = false,
        showPreview = true
    } = options;
    
    try {
        if (showButton) {
            addStatsButtonToCalendar(calendar, calendarEl);
        }
        
        if (showQuickMenu) {
            addStatsQuickMenuToCalendar(calendar, calendarEl);
        }
        
        if (showPreview) {
            addStatsPreviewToCalendar(calendar, calendarEl);
        }
        
        console.debug('✅ 日历统计功能已成功集成');
    } catch (error) {
        console.error('❌ 集成日历统计功能失败:', error);
    }
}

/**
 * 手动触发统计分析
 * @param calendar FullCalendar实例
 * @param type 统计类型
 */
export function triggerStatsAnalysis(
    calendar: any, 
    type: 'current-month' | 'current-year' | 'recent-week' | 'recent-month' | 'all' = 'all'
): void {
    const events = calendar.getEvents();
    
    if (!calendarStatsManager.hasStatsData(events)) {
        console.warn('没有可统计的事件数据');
        return;
    }
    
    switch (type) {
        case 'current-month':
            calendarStatsManager.getCurrentMonthStats(events);
            break;
        case 'current-year':
            calendarStatsManager.getCurrentYearStats(events);
            break;
        case 'recent-week':
            calendarStatsManager.getRecentWeekStats(events);
            break;
        case 'recent-month':
            calendarStatsManager.getRecentMonthStats(events);
            break;
        default:
            calendarStatsManager.quickStats(events);
            break;
    }
}

/**
 * 导出日历统计数据
 * @param calendar FullCalendar实例
 * @param format 导出格式
 */
export function exportCalendarStats(
    calendar: any,
    format: 'json' | 'csv' | 'summary' = 'json'
): void {
    const events = calendar.getEvents();
    
    if (!calendarStatsManager.hasStatsData(events)) {
        console.warn('没有可导出的事件数据');
        return;
    }
    
    calendarStatsManager.exportStats(events, format);
}

// 暴露到全局 window 对象，方便在控制台中使用
declare global {
    interface Window {
        calendarStats: {
            addStatsToCalendar: typeof addStatsToCalendar;
            triggerStatsAnalysis: typeof triggerStatsAnalysis;
            exportCalendarStats: typeof exportCalendarStats;
            manager: typeof calendarStatsManager;
        };
    }
}

if (typeof window !== 'undefined') {
    window.calendarStats = {
        addStatsToCalendar,
        triggerStatsAnalysis,
        exportCalendarStats,
        manager: calendarStatsManager
    };
}
