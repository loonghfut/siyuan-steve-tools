# 多SQL预设对比功能

## 功能说明

在EChart可视化面板的SQL模式中，新增了**多SQL预设对比**功能，允许用户添加多个SQL预设查询，然后生成一个柱状图：
- **X轴**: SQL预设的名称
- **Y轴**: 对应SQL查询到的数据数目（行数）

## 使用方法

### 1. 切换到SQL模式
在可视化面板中，确保数据源选择为 **SQL**

### 2. 选择多SQL预设对比模式
在SQL查询语句区域，点击 **SQL模式** 下拉框，选择 **多SQL预设对比**

### 3. 添加SQL预设
1. 点击 **添加SQL预设** 按钮
2. 为每个预设输入：
   - **预设名称**: 显示在图表X轴的名称（例如："日记文档数"、"待办文档数"等）
   - **SQL查询**: 对应的SQL查询语句（例如：`SELECT * FROM blocks WHERE type='d'`）
3. 可以添加任意多个SQL预设

### 4. 预览和使用
- 点击 **刷新** 按钮查看生成的图表
- 图表会自动执行所有SQL查询，统计每个查询的结果数量
- 点击 **复制图表块** 可以将生成的ECharts代码复制到剪贴板

## 示例场景

### 场景1: 对比不同类型文档数量
```
预设1:
  名称: 日记文档
  SQL: SELECT * FROM blocks WHERE type='d'

预设2:
  名称: 待办文档
  SQL: SELECT * FROM blocks WHERE type='d' AND content LIKE '%TODO%'

预设3:
  名称: 已完成
  SQL: SELECT * FROM blocks WHERE type='d' AND content LIKE '%DONE%'
```

### 场景2: 对比不同笔记本内容
```
预设1:
  名称: 工作笔记
  SQL: SELECT * FROM blocks WHERE box='20210808180117-czj9bvb'

预设2:
  名称: 学习笔记
  SQL: SELECT * FROM blocks WHERE box='20210808180117-6v0mkxr'
```

### 场景3: 时间段对比
```
预设1:
  名称: 本周创建
  SQL: SELECT * FROM blocks WHERE created >= '20250926000000'

预设2:
  名称: 上周创建
  SQL: SELECT * FROM blocks WHERE created >= '20250919000000' AND created < '20250926000000'
```

## 技术实现

### 新增类型定义
```typescript
// types.ts
export interface MultiSqlPresetItem {
  name: string;  // 预设名称
  sql: string;   // SQL查询语句
}

export type SqlMode = 'single' | 'multi-preset';
```

### 核心方法
- `renderMultiSqlPresetsList()`: 渲染多SQL预设列表UI
- `buildMultiSqlPresetIIFE()`: 生成多SQL预设对比的ECharts配置代码
- SQL模式切换逻辑
- 数据持久化支持（localStorage）

### 生成的图表特点
- 柱状图展示
- Y轴显示查询结果数量
- X轴显示预设名称
- 支持自定义颜色
- 显示数值标签
- 包含调试日志输出

## 注意事项

1. **性能**: 每个SQL查询都会同步执行，如果查询较慢或预设较多，可能需要一些时间
2. **权限**: 确保SQL查询有适当的权限和访问范围
3. **数据量**: 统计的是查询结果的**行数**，而非其他聚合指标
4. **持久化**: 所有配置会自动保存到localStorage，刷新页面后会恢复

## 扩展可能

未来可以考虑扩展以下功能：
- 支持自定义聚合函数（不仅是COUNT）
- 支持多系列对比（每个SQL预设可以有多个指标）
- 支持异步执行SQL查询
- 添加查询缓存机制
- 支持导出数据到CSV/Excel
