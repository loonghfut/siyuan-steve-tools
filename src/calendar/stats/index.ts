/**
 * 日历统计模块索引
 * 统一导出所有统计相关的类和功能
 */

// 核心统计功能
export { 
    CalendarDataStats, 
    calendarStats,
    type CalendarStatsData,
    type CalendarStatsConfig 
} from './calendar-stats';

// 可视化功能
export { 
    CalendarStatsVisualization, 
    calendarStatsVisualization,
    type ChartOptions 
} from './stats-visualization';

// 统计管理器
export { 
    CalendarStatsManager, 
    calendarStatsManager 
} from './stats-manager';
