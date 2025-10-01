# SQL模式调试功能说明

## 调试输出位置

SQL可视化模式包含两层调试输出,帮助开发者追踪数据处理流程:

### 1️⃣ 配置层调试 (autoBuildExpr)

**触发时机**: 当用户修改X轴字段、系列配置、分组规则等可视化选项时

**输出内容**:
```
🔍 SQL数据映射调试
├─ 📊 X轴配置
│  ├─ xKey: 字段名
│  ├─ sort: 排序方式 (none/asc/desc)
│  ├─ bucket: 分组方式 (none/year/month/day/hour/regex)
│  └─ mergeMode: 是否合并模式
├─ 📈 系列配置
│  └─ [数组] 每个系列的配置
│     ├─ name: 系列名称
│     ├─ valueKey: 值字段
│     ├─ agg: 聚合函数 (count/sum/avg/min/max/raw)
│     ├─ type: 图表类型 (line/bar/pie)
│     └─ axisIndex: Y轴索引 (0=左轴, 1=右轴)
├─ ✅ 生成的X轴表达式
└─ ✅ 生成的系列表达式
```

**查看方式**: 打开浏览器控制台,每次修改配置后会自动输出

---

### 2️⃣ 数据层调试 (ECharts渲染时)

**触发时机**: 当图表实际渲染时(执行生成的IIFE代码)

**输出内容**:
```
🔍 ECharts SQL数据调试
├─ 📦 SQL查询结果 rows
│  ├─ 完整的SQL查询返回数据
│  └─ 第一条数据示例
├─ 📊 rows 数量
├─ 🔑 可用字段列表
├─ 📐 X轴数据
│  ├─ 表达式: 实际执行的JavaScript表达式
│  ├─ 结果: 计算后的X轴数据数组
│  ├─ 数据类型和长度
│  └─ 前5项预览
└─ 📈 系列数据
   └─ [每个系列] 详细信息
      ├─ type: 图表类型
      ├─ data: 完整数据数组
      ├─ dataLength: 数据长度
      └─ firstItems: 前5项预览
```

**查看方式**: 
1. 打开浏览器控制台
2. 点击"复制图表块"或在预览面板查看图表
3. 图表渲染时会自动输出调试信息

---

## 使用场景

### 场景1: 检查字段映射是否正确
1. 选择X轴字段
2. 查看控制台 "📊 X轴配置" 确认 xKey 是否正确
3. 查看 "✅ 生成的X轴表达式" 确认表达式逻辑

### 场景2: 验证数据处理逻辑
1. 设置分组规则(如按月分组)
2. 查看 "📐 X轴数据结果" 确认分组效果
3. 对比原始数据和处理后数据

### 场景3: 排查系列数据问题
1. 配置系列的聚合函数(如 sum)
2. 查看 "📈 系列数据" 中的 data 数组
3. 确认聚合计算是否正确

### 场景4: 调试空数据或异常
1. 如果图表无数据,先查看 "📦 SQL查询结果 rows"
2. 确认SQL是否返回数据
3. 检查字段名是否匹配 "🔑 可用字段列表"

---

## 调试信息解读

### X轴表达式示例
```javascript
// 示例1: 简单字段映射
rows.map(r => r.created)

// 示例2: 按月分组
(function() {
  var groups = {};
  rows.forEach(r => {
    var key = r.created.substring(0, 7); // YYYY-MM
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });
  return Object.keys(groups).sort();
})()

// 示例3: 正则分组
(function() {
  var pattern = /pattern/;
  var groups = {};
  rows.forEach(r => {
    var match = String(r.field).match(pattern);
    var key = match ? match[0] : '其他';
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  });
  return Object.keys(groups);
})()
```

### 系列表达式示例
```javascript
// 示例1: 原始值(非合并模式)
rows.map(r => r.value)

// 示例2: 求和(合并模式)
(function() {
  var groups = {}; // 按X轴分组的数据
  // ... 分组逻辑 ...
  return Object.keys(groups).map(key => 
    groups[key].reduce((sum, r) => sum + (parseFloat(r.value) || 0), 0)
  );
})()

// 示例3: 计数(合并模式)
(function() {
  var groups = {}; // 按X轴分组的数据
  // ... 分组逻辑 ...
  return Object.keys(groups).map(key => groups[key].length);
})()
```

---

## 注意事项

1. **性能影响**: 调试输出会在每次配置变更和图表渲染时触发,大数据量可能影响性能,建议生产环境移除
2. **控制台过滤**: 使用 🔍 emoji 图标可以快速过滤调试信息
3. **数据隐私**: 调试信息会完整打印数据内容,注意不要在生产环境暴露敏感信息
4. **浏览器兼容**: console.group 在旧版浏览器可能不支持,但不影响功能

---

## 移除调试输出

如需移除调试功能,删除以下两处代码:

1. `visual-echarts-sql-ui.ts` 的 `autoBuildExpr` 方法中的 console.group 块
2. `buildSimpleIIFE` 方法返回的IIFE代码中的 console.group 块
