/**
 * 日历统计功能快速入门示例
 * 演示如何快速集成和使用统计功能
 */

// 导入统计模块
import { calendarStatsManager } from './index';

/**
 * 示例1: 为现有日历添加统计按钮
 */
export function example1_AddStatsButton(calendar: any, calendarEl: HTMLElement): void {
    // 查找日历工具栏
    const toolbar = calendarEl.querySelector('.fc-header-toolbar .fc-toolbar-chunk:last-child');
    if (!toolbar) return;

    // 创建统计按钮
    const statsBtn = document.createElement('button');
    statsBtn.className = 'fc-button fc-button-primary';
    statsBtn.textContent = '📊 统计';
    statsBtn.style.marginLeft = '10px';
    
    // 添加点击事件
    statsBtn.onclick = async () => {
        const events = calendar.getEvents();
        await calendarStatsManager.showStatsDialog(events);
    };
    
    toolbar.appendChild(statsBtn);
    console.debug('✅ 统计按钮已添加到日历工具栏');
}

/**
 * 示例2: 显示实时统计预览
 */
export function example2_AddStatsPreview(calendar: any, calendarEl: HTMLElement): void {
    // 创建预览容器
    const preview = document.createElement('div');
    preview.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 12px;
        z-index: 100;
    `;
    
    // 更新预览数据
    const updatePreview = () => {
        const events = calendar.getEvents();
        const stats = calendarStatsManager.getStatsPreview(events);
        preview.innerHTML = `
            📊 总计: ${stats.total} | 
            ✅ 完成: ${stats.completed} | 
            ⏳ 待办: ${stats.pending} | 
            📈 完成率: ${stats.completionRate}%
        `;
    };
    
    // 添加到日历容器
    const calendarBody = calendarEl.querySelector('.fc');
    if (calendarBody) {
        (calendarBody as HTMLElement).style.position = 'relative';
        calendarBody.appendChild(preview);
        
        // 初始更新和监听变化
        updatePreview();
        calendar.on('eventsSet', updatePreview);
    }
    
    console.debug('✅ 统计预览已添加到日历');
}

/**
 * 示例3: 快速生成统计报告
 */
export function example3_QuickStatsReport(calendar: any): void {
    const events = calendar.getEvents();
    
    if (!events || events.length === 0) {
        console.debug('⚠️ 没有事件数据可供统计');
        return;
    }
    
    // 生成快速统计
    const stats = calendarStatsManager.quickStats(events);
    console.debug('📊 快速统计结果:', stats);
    
    // 显示统计摘要
    calendarStatsManager.showStatsSummary(events);
}

/**
 * 示例4: 导出统计数据
 */
export function example4_ExportStats(calendar: any, format: 'json' | 'csv' | 'summary' = 'json'): void {
    const events = calendar.getEvents();
    
    if (!events || events.length === 0) {
        console.debug('⚠️ 没有事件数据可供导出');
        return;
    }
    
    // 导出统计数据
    calendarStatsManager.exportStats(events, format);
    console.debug(`✅ 统计数据已导出为 ${format.toUpperCase()} 格式`);
}

/**
 * 示例5: 分析特定时间范围
 */
export function example5_AnalyzeTimeRange(calendar: any): void {
    const events = calendar.getEvents();
    
    // 分析当前月份
    const monthStats = calendarStatsManager.getCurrentMonthStats(events);
    console.debug('📅 当月统计:', monthStats);
    
    // 分析最近一周
    const weekStats = calendarStatsManager.getRecentWeekStats(events);
    console.debug('📈 最近一周:', weekStats);
    
    // 自定义时间范围（今年）
    const yearStats = calendarStatsManager.getCurrentYearStats(events);
    console.debug('🗓️ 今年统计:', yearStats);
}

/**
 * 一键集成所有功能
 */
export function quickIntegration(calendar: any, calendarEl: HTMLElement): void {
    console.debug('🚀 开始快速集成日历统计功能...');
    
    try {
        // 添加统计按钮
        example1_AddStatsButton(calendar, calendarEl);
        
        // 添加统计预览
        example2_AddStatsPreview(calendar, calendarEl);
        
        console.debug('✨ 日历统计功能集成完成！');
        console.debug('💡 提示: 可以点击右上角的统计按钮查看详细数据');
        
    } catch (error) {
        console.error('❌ 集成失败:', error);
    }
}

/**
 * 在控制台中快速使用
 */
if (typeof window !== 'undefined') {
    (window as any).quickStats = {
        // 快速集成
        integrate: quickIntegration,
        
        // 单独功能
        addButton: example1_AddStatsButton,
        addPreview: example2_AddStatsPreview,
        report: example3_QuickStatsReport,
        export: example4_ExportStats,
        analyze: example5_AnalyzeTimeRange,
        
        // 便捷方法
        show: (calendar: any) => {
            const events = calendar.getEvents();
            calendarStatsManager.showStatsDialog(events);
        },
        
        preview: (calendar: any) => {
            const events = calendar.getEvents();
            return calendarStatsManager.getStatsPreview(events);
        }
    };
    
    console.debug('🎯 快速统计工具已加载！');
    console.debug('使用方法:');
    console.debug('  window.quickStats.integrate(calendar, calendarEl) - 一键集成');
    console.debug('  window.quickStats.show(calendar) - 显示统计对话框');
    console.debug('  window.quickStats.preview(calendar) - 获取统计预览');
    console.debug('  window.quickStats.report(calendar) - 生成快速报告');
}

// 使用说明注释
/*
快速使用指南:

1. 基础集成 (在日历初始化后调用):
   quickIntegration(calendar, calendarEl);

2. 显示统计对话框:
   const events = calendar.getEvents();
   await calendarStatsManager.showStatsDialog(events);

3. 获取统计预览:
   const preview = calendarStatsManager.getStatsPreview(events);
   console.debug(preview);

4. 导出数据:
   calendarStatsManager.exportStats(events, 'csv');

5. 控制台快捷操作:
   window.quickStats.show(calendar);
   window.quickStats.preview(calendar);
*/
