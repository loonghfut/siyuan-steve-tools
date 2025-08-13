# 日历数据统计功能说明

## 概述

本模块为日历系统提供了完整的数据统计功能，包括事件统计、时间分析、分类汇总、可视化图表等。所有功能都封装在独立的模块中，不会影响现有的日历代码。

## 功能特性

### 📊 核心统计功能
- **事件统计**: 总数、完成数、待处理数、归档数、周期事件数
- **时间统计**: 总时长、平均时长、时间分布分析
- **分类统计**: 按优先级、状态、来源、分类、标签统计（标签为多选聚合）
- **完成率分析**: 计算任务完成率和效率指标
- **时间分布**: 24小时、星期、月份的事件分布

### 📈 可视化图表
- **饼图**: 状态分布、优先级分布
- **饼图**: 分类分布
- **柱状图**: 时间分布、周/月趋势分析
- **柱状图**: 标签 TopN（默认Top12）
- **热力图**: 事件活跃度分析
- **卡片式展示**: 关键指标概览

### 💾 数据导出
- **JSON格式**: 完整的统计数据
- **CSV格式**: 适合Excel分析
- **文本摘要**: 便于阅读的统计报告

## 使用方法

### 基础使用

```typescript
import { calendarStatsManager } from '@/calendar/stats';

// 获取日历事件
const events = calendar.getEvents();

// 显示详细统计对话框
await calendarStatsManager.showStatsDialog(events);

// 快速统计（仅显示消息）
const stats = calendarStatsManager.quickStats(events);

// 获取统计预览
const preview = calendarStatsManager.getStatsPreview(events);
```

### 集成到日历

```typescript
import { addStatsToCalendar } from '@/calendar/stats-integration';

// 为现有日历添加统计功能
addStatsToCalendar(calendar, calendarEl, {
    showButton: true,     // 显示统计按钮
    showQuickMenu: false, // 显示快捷菜单
    showPreview: true     // 显示统计预览
});
```

### 时间范围统计

```typescript
// 当前月份统计
const monthStats = calendarStatsManager.getCurrentMonthStats(events);

// 当前年份统计
const yearStats = calendarStatsManager.getCurrentYearStats(events);

// 最近7天统计
const weekStats = calendarStatsManager.getRecentWeekStats(events);

// 自定义时间范围
const customStats = calendarStatsManager.getCustomRangeStats(
    events,
    new Date('2024-01-01'),
    new Date('2024-12-31'),
    ['siyuan', 'qqcalendar'] // 可选：指定数据源
);
```

### 数据导出

```typescript
// 导出JSON格式
calendarStatsManager.exportStats(events, 'json');

// 导出CSV格式
calendarStatsManager.exportStats(events, 'csv');

// 导出文本摘要
calendarStatsManager.exportStats(events, 'summary');
```

## 在日历模块中集成

### 方式1: 添加统计按钮

在 `calendar.ts` 的 `run` 函数最后添加：

```typescript
import { addStatsToCalendar } from './stats-integration';

// 在 calendar.render() 之后添加
addStatsToCalendar(calendar, calendarEl, {
    showButton: true,
    showPreview: true
});
```

### 方式2: 添加到自定义按钮

在日历配置的 `customButtons` 中添加：

```typescript
customButtons: {
    // 现有按钮...
    statsButton: {
        text: '📊 统计',
        click: async function() {
            const events = calendar.getEvents();
            await calendarStatsManager.showStatsDialog(events);
        }
    }
},
headerToolbar: {
    left: 'prev,next today viewFilter',
    center: 'title',
    right: 'multiMonthYear,dayGridMonth,timeGridWeek,statsButton' // 添加统计按钮
}
```

### 方式3: 手动调用

在控制台或代码中直接使用：

```typescript
// 快速分析当月数据
window.calendarStats.triggerStatsAnalysis(calendar, 'current-month');

// 导出统计数据
window.calendarStats.exportCalendarStats(calendar, 'csv');
```

## 统计数据结构

```typescript
interface CalendarStatsData {
    // 基础统计
    totalEvents: number;
    completedEvents: number;
    pendingEvents: number;
    archivedEvents: number;
    recurringEvents: number;
    
    // 时间统计
    totalEventDuration: number;      // 总时长（分钟）
    averageEventDuration: number;    // 平均时长（分钟）
    
    // 分类统计
    eventsByPriority: { [key: string]: number };
    eventsByStatus: { [key: string]: number };
    eventsBySource: { [key: string]: number };
    eventsByCategory: { [key: string]: number };
    eventsByTag: { [key: string]: number };
    
    // 时间分布
    eventsByHour: number[];    // 24小时分布
    eventsByWeekday: number[]; // 星期分布
    eventsByMonth: number[];   // 月份分布
    
    // 完成率
    completionRate: number;    // 完成率百分比
    
    // 元数据
    dateRange: { start: string; end: string };
    generatedAt: string;
}
```

## 配置选项

```typescript
interface CalendarStatsConfig {
    dateRange: {
        start: Date;
        end: Date;
    };
    includeSources: string[];      // 包含的数据源
    includeRecurring: boolean;     // 是否包含周期事件
    includeArchived: boolean;      // 是否包含已归档事件
}
```

## 文件结构

```
src/calendar/stats/
├── calendar-stats.ts       # 核心统计逻辑
├── stats-visualization.ts  # 可视化组件
├── stats-manager.ts        # 统计管理器
└── index.ts               # 模块导出

src/calendar/
└── stats-integration.ts   # 集成示例和工具函数
```

## 注意事项

1. **性能考虑**: 大量事件时，统计计算可能需要一些时间
2. **数据源**: 支持思源数据库、QQ日历、ICS订阅、Lifelog等多种数据源
3. **时区处理**: 所有时间统计都基于本地时区
4. **内存使用**: 统计数据会临时存储在内存中，刷新页面后清除

## 扩展开发

如需添加新的统计指标或图表类型，可以：

1. 在 `CalendarStatsData` 接口中添加新字段
2. 在 `CalendarDataStats` 类中添加计算逻辑
3. 在 `CalendarStatsVisualization` 类中添加可视化代码
4. 通过 `CalendarStatsManager` 暴露新功能

## 故障排除

### 常见问题

1. **统计按钮不显示**: 检查工具栏是否正确加载
2. **数据不准确**: 确认事件的 `extendedProps` 字段完整性
3. **导出失败**: 检查浏览器是否支持文件下载API
4. **图表不显示**: 检查CSS样式是否冲突

### 调试工具

```typescript
// 检查事件数据结构
console.log(calendar.getEvents());

// 检查统计数据
console.log(calendarStatsManager.getLastStatsData());

// 测试统计功能
window.calendarStats.manager.quickStats(calendar.getEvents());
```
