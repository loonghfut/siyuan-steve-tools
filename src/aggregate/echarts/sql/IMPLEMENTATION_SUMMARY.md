# 多SQL预设对比功能 - 实现总结

## 实现的功能

✅ **添加了多SQL预设查询对比模式**，可以：
- 添加多个SQL预设（每个包含名称和SQL代码）
- 自动执行所有SQL查询并统计结果数量
- 生成柱状图：X轴为预设名称，Y轴为查询结果数量

## 修改的文件

### 1. `types.ts`
新增类型定义：
- `MultiSqlPresetItem` - 多SQL预设项接口
- `SqlMode` - SQL模式类型（'single' | 'multi-preset'）
- 更新 `VisualEchartsSqlOptions` 接口

### 2. `visual-echarts-sql-ui.ts`
主要修改：

#### 新增属性
```typescript
private sqlMode: 'single' | 'multi-preset' = 'single';
private multiSqlPresets: Array<{ name: string; sql: string }> = [];
private multiSqlPresetsEl?: HTMLElement;
private sqlModeSwitchEl?: HTMLSelectElement;
```

#### 新增/修改方法
1. **render()** - 更新UI布局
   - 添加SQL模式切换下拉框
   - 添加单SQL和多SQL两种模式的UI容器
   - 多SQL模式显示预设列表和添加按钮

2. **renderMultiSqlPresetsList()** - 新增
   - 渲染多SQL预设列表
   - 每个预设包含名称输入框和SQL文本框
   - 支持删除预设

3. **buildIIFE()** - 修改
   - 根据sqlMode判断生成单SQL或多SQL的代码

4. **buildMultiSqlPresetIIFE()** - 新增
   - 生成多SQL预设对比的ECharts IIFE代码
   - 批量执行SQL查询
   - 统计每个查询的结果数量
   - 生成柱状图配置

5. **save() / restore()** - 更新
   - 支持sqlMode和multiSqlPresets的持久化
   - 恢复时自动切换到对应模式

#### 事件处理
- SQL模式切换事件：显示/隐藏对应UI
- 添加SQL预设按钮事件
- 每个预设的名称和SQL输入事件
- 删除预设按钮事件

## 生成的图表代码特点

```javascript
(() => {
  // 1. 定义同步SQL查询函数
  function fetchSqlSync(sql) { ... }
  
  // 2. 定义预设列表
  const presets = [
    { name: "预设1", sql: "SELECT ..." },
    { name: "预设2", sql: "SELECT ..." }
  ];
  
  // 3. 执行所有SQL并收集结果
  const xAxisData = [];  // 预设名称
  const yAxisData = [];  // 结果数量
  presets.forEach(preset => {
    xAxisData.push(preset.name);
    var rows = fetchSqlSync(preset.sql);
    yAxisData.push(rows.length);
  });
  
  // 4. 生成ECharts配置
  return {
    title: { text: "标题", left: 'center' },
    xAxis: { type: 'category', data: xAxisData },
    yAxis: { type: 'value', name: '查询结果数量' },
    series: [{
      name: '查询结果数量',
      type: 'bar',
      data: yAxisData,
      label: { show: true, position: 'top' }
    }]
  };
})()
```

## UI流程

```
┌─────────────────────────────────────┐
│ SQL查询语句                          │
│ ┌─────────────────────────────────┐ │
│ │ SQL模式: [单SQL查询 ▼]          │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [单SQL模式] (默认显示)               │
│ ┌─────────────────────────────────┐ │
│ │ 预设模板: [-- 选择预设 -- ▼]    │ │
│ │ ┌─────────────────────────────┐ │ │
│ │ │ SELECT * FROM ...           │ │ │
│ │ └─────────────────────────────┘ │ │
│ │ [加载字段]                      │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘

切换为"多SQL预设对比"后：

┌─────────────────────────────────────┐
│ SQL查询语句                          │
│ ┌─────────────────────────────────┐ │
│ │ SQL模式: [多SQL预设对比 ▼]      │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [多SQL预设对比模式]                  │
│ ┌─────────────────────────────────┐ │
│ │ SQL预设列表                      │ │
│ │ ┌───────────────────────────────┤ │
│ │ │ 预设名称: [日记文档]  [删除]  │ │
│ │ │ SELECT * FROM blocks ...      │ │
│ │ ├───────────────────────────────┤ │
│ │ │ 预设名称: [待办文档]  [删除]  │ │
│ │ │ SELECT * FROM blocks ...      │ │
│ │ └───────────────────────────────┘ │
│ │ [添加SQL预设]                    │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## 数据流

```
用户输入
  ↓
添加多个SQL预设 (名称 + SQL)
  ↓
点击刷新/复制
  ↓
buildMultiSqlPresetIIFE()
  ↓
生成IIFE代码
  ↓
运行时：
  - 遍历所有预设
  - 同步执行每个SQL
  - 统计结果数量
  - 生成图表数据
  ↓
渲染柱状图
```

## 测试建议

1. **基本功能测试**
   - 切换SQL模式
   - 添加/删除预设
   - 输入名称和SQL
   - 刷新预览

2. **数据测试**
   - 测试不同的SQL查询
   - 验证数量统计准确性
   - 测试空结果场景

3. **持久化测试**
   - 刷新页面后配置是否保留
   - 切换模式后配置是否正确恢复

4. **边界测试**
   - 无预设时的显示
   - SQL查询失败时的处理
   - 大量预设时的性能

## 后续优化建议

1. **性能优化**
   - 考虑异步执行SQL查询
   - 添加加载状态提示
   - 实现查询缓存

2. **功能增强**
   - 支持自定义聚合函数（SUM, AVG等）
   - 支持多系列对比
   - 支持从已有SQL预设快速导入
   - 添加预设排序功能

3. **用户体验**
   - 添加预设模板库
   - 提供SQL查询验证
   - 显示查询执行时间
   - 支持导出/导入配置

4. **可视化增强**
   - 支持更多图表类型（折线图、饼图等）
   - 添加数据标签格式化选项
   - 支持阈值线标记
