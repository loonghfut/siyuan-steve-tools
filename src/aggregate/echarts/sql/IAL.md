# IAL字段解析功能说明

## 概述

IAL (Inline Attribute List) 是思源笔记中块的属性列表,包含块的各种元数据。预处理器提供了自动解析IAL字符串的功能,将其转换为可直接使用的字段。

---

## 核心特性

### 1. 自动字段收集

预处理器会扫描所有数据行,收集所有出现过的IAL子字段:

```javascript
// 数据集中有3条记录
[
  { ial: '{: custom-tag="work" custom-priority="high"}' },
  { ial: '{: custom-tag="personal"}' },                    // 缺少 custom-priority
  { ial: '{: custom-priority="low" custom-status="done"}' } // 缺少 custom-tag,新增 custom-status
]

// 预处理后,所有记录都有完整的IAL字段
[
  { 
    ial_custom-tag: "work",
    ial_custom-priority: "high",
    ial_custom-status: "无"  // 自动填充默认值
  },
  { 
    ial_custom-tag: "personal",
    ial_custom-priority: "无",  // 自动填充默认值
    ial_custom-status: "无"
  },
  { 
    ial_custom-tag: "无",  // 自动填充默认值
    ial_custom-priority: "low",
    ial_custom-status: "done"
  }
]
```

**优势**:
- ✅ 所有IAL子字段都会出现在字段选择器中
- ✅ 没有某个字段的数据会自动填充 "无",避免空值
- ✅ 图表统计时,"无" 会作为一个独立的分类显示

### 2. IAL格式解析

### 原始格式
```
{: id="20250928201839-ogi60jt" updated="20251001194117" custom-sttools="app"}
```

### 解析后结构
```javascript
{
  id: "20250928201839-ogi60jt",
  updated: "20251001194117",
  "custom-sttools": "app"
}
```

---

## 使用方式

### 1. 自动解析 (推荐)

预处理器会自动将IAL属性提取为新字段,使用 `ial_` 前缀:

```javascript
// 原始SQL查询结果
const rawRows = [
  {
    id: "xxx",
    content: "测试内容",
    ial: '{: id="20250928201839-ogi60jt" updated="20251001194117" custom-sttools="app"}'
  }
];

// 使用预处理器
const rows = preprocessSqlData(rawRows, { parseIAL: true });

// 预处理后的数据
console.log(rows[0]);
/*
{
  id: "xxx",
  content: "测试内容",
  ial: '{: id="20250928201839-ogi60jt" updated="20251001194117" custom-sttools="app"}',
  ial_id: "20250928201839-ogi60jt",
  ial_updated: "2025-10-01 19:41:17",  // 时间戳自动转换
  ial_custom-sttools: "app",
  ial_parsed: '{"id":"20250928201839-ogi60jt","updated":"20251001194117","custom-sttools":"app"}',  // JSON字符串
  ial_keys: "id, updated, custom-sttools"  // 所有key的列表
}
*/
```

### 2. 手动提取字段名称

```javascript
import { SqlDataPreprocessor } from './sql-data-preprocessor';

const preprocessor = new SqlDataPreprocessor();
const ial = '{: id="20250928201839-ogi60jt" updated="20251001194117" custom-sttools="app"}';

// 获取所有字段名
const keys = preprocessor.getIALKeys(ial);
console.log(keys);
// ["id", "updated", "custom-sttools"]
```

### 3. 手动提取字段值

```javascript
import { SqlDataPreprocessor } from './sql-data-preprocessor';

const preprocessor = new SqlDataPreprocessor();
const ial = '{: id="20250928201839-ogi60jt" updated="20251001194117" custom-sttools="app"}';

// 获取特定字段的值
const id = preprocessor.getIALValue(ial, 'id');
console.log(id); // "20250928201839-ogi60jt"

const updated = preprocessor.getIALValue(ial, 'updated');
console.log(updated); // "20251001194117"

const customAttr = preprocessor.getIALValue(ial, 'custom-sttools');
console.log(customAttr); // "app"

// 不存在的字段返回 undefined
const notExist = preprocessor.getIALValue(ial, 'not-exist');
console.log(notExist); // undefined
```

---

## 在ECharts中使用

### 场景1: 使用IAL中的自定义属性作为分类

```sql
SELECT * FROM blocks WHERE type = 'd' AND ial LIKE '%custom-sttools%'
```

**预处理后**:
- 新增字段: `ial_custom-sttools`
- 可直接在可视化配置中选择此字段作为X轴或系列

### 场景2: 使用IAL中的时间戳

```sql
SELECT * FROM blocks WHERE type = 'd'
```

**预处理后**:
- 新增字段: `ial_updated` (自动转换为 `2025-10-01 19:41:17`)
- 可用于时间序列分析

### 场景3: 统计不同类型的块

```sql
SELECT * FROM blocks WHERE ial LIKE '%custom-type%'
```

**X轴配置**: 选择 `ial_custom-type`  
**系列配置**: 使用 `count` 聚合

---

## 配置选项

### 启用/禁用IAL解析

```typescript
// 启用 (默认)
preprocessSqlData(rows, { parseIAL: true });

// 禁用
preprocessSqlData(rows, { parseIAL: false });
```

### 与时间戳转换配合

IAL中的时间戳字段会自动被识别并转换:

```typescript
preprocessSqlData(rows, {
  parseIAL: true,
  convertTimestamps: true,
  timestampFormat: 'datetime'
});

// IAL中的 updated="20251001194117" 
// 会被转换为 ial_updated="2025-10-01 19:41:17"
```

---

## 字段命名规则

### 自动添加的字段

| 原始IAL属性 | 新字段名 | 说明 |
|------------|---------|------|
| `id` | `ial_id` | 块ID |
| `updated` | `ial_updated` | 更新时间(自动转换) |
| `custom-sttools` | `ial_custom-sttools` | 自定义属性 |
| `custom-type` | `ial_custom-type` | 自定义类型 |
| `任意属性` | `ial_任意属性` | 使用 `ial_` 前缀 |

### 特殊字段

- `ial_parsed`: 包含完整的IAL解析结果的JSON字符串 (避免显示 `[object Object]`)
- `ial_keys`: 所有IAL属性名的逗号分隔列表 (便于快速查看)
- `ial`: 保留原始IAL字符串

---

## 支持的IAL格式

### ✅ 标准格式

```
{: id="xxx" updated="yyy"}
{: id="xxx" updated="yyy" custom-attr="zzz"}
{: custom-key1="value1" custom-key2="value2"}
```

### ✅ 属性名格式

支持的字符:
- 字母: `a-z`, `A-Z`
- 数字: `0-9`
- 连字符: `-`
- 下划线: `_`

```
{: custom-attr="value"}     ✅
{: custom_attr="value"}     ✅
{: customAttr123="value"}   ✅
{: 123custom="value"}       ❌ 不能以数字开头
```

### ✅ 属性值格式

- 必须使用双引号包裹
- 支持空值
- 不支持转义字符(目前)

```
{: attr="value"}            ✅
{: attr=""}                 ✅ 空值
{: attr='value'}            ❌ 不支持单引号
{: attr=value}              ❌ 必须有引号
```

### ⚠️ 特殊情况

```
{: attr="value with spaces"}  ✅ 支持空格
{: attr="value\"quoted"}      ❌ 不支持内部引号(当前版本)
{: attr="value\nnewline"}     ❌ 不支持转义字符(当前版本)
```

---

## 调试信息

### 启用调试模式

```typescript
preprocessSqlData(rows, { 
  parseIAL: true, 
  debug: true 
});
```

### 输出示例

```
🔧 SQL数据预处理
  📄 第一行数据(处理前): { ial: "{: id=\"xxx\" ...}" }
  📋 解析IAL属性: id = "20250928201839-ogi60jt"
  📋 解析IAL属性: updated = "20251001194117"
  📋 解析IAL属性: custom-sttools = "app"
  📋 IAL字段解析: 提取了 3 个属性
  📄 第一行数据(处理后): { 
    ial: "...",
    ial_id: "20250928201839-ogi60jt",
    ial_updated: "2025-10-01 19:41:17",
    ial_custom-sttools: "app",
    ial_parsed: {...}
  }
```

---

## 实战示例

### 示例1: 统计自定义标签的使用情况

**SQL查询**:
```sql
SELECT * FROM blocks 
WHERE type = 'd' 
AND ial LIKE '%custom-tag%'
```

**可视化配置**:
- X轴: `ial_custom-tag`
- 系列: count 聚合
- 图表类型: 柱状图

**结果**: 显示不同标签的文档数量分布

### 示例2: 分析块的更新时间分布

**SQL查询**:
```sql
SELECT * FROM blocks 
WHERE type = 'd'
AND updated > '20250901000000'
```

**可视化配置**:
- X轴: `ial_updated` (已自动转换为可读时间)
- 分组: 按天
- 系列: count 聚合
- 图表类型: 折线图

**结果**: 显示每天更新的文档数量趋势

### 示例3: 多维度统计

**SQL查询**:
```sql
SELECT * FROM blocks 
WHERE type = 'd'
AND ial LIKE '%custom-status%'
```

**可视化配置**:
- X轴: `created` (按月分组)
- 系列1: `ial_custom-status` = "完成" 的计数
- 系列2: `ial_custom-status` = "进行中" 的计数
- 系列3: `ial_custom-status` = "待办" 的计数
- 图表类型: 堆叠柱状图

**结果**: 显示不同状态的文档在各月份的分布

---

## 常见问题

### Q1: IAL字段没有被解析?

**检查清单**:
1. 确认 `parseIAL: true` (默认启用)
2. 确认IAL字段存在且格式正确
3. 启用调试模式查看详情

```typescript
preprocessSqlData(rows, { parseIAL: true, debug: true });
```

### Q2: 为什么有些字段的值是 "无"?

**原因**: 不是所有数据行都包含相同的IAL属性

**示例**:
```sql
-- 查询结果中
-- 行1: {: custom-tag="work" custom-status="done"}
-- 行2: {: custom-tag="personal"}  -- 没有 custom-status
-- 行3: {: custom-status="pending"} -- 没有 custom-tag
```

**预处理结果**:
- 行1: `ial_custom-tag="work"`, `ial_custom-status="done"`
- 行2: `ial_custom-tag="personal"`, `ial_custom-status="无"` ← 自动填充
- 行3: `ial_custom-tag="无"`, `ial_custom-status="pending"` ← 自动填充

**优势**:
- 统计时 "无" 会作为独立分类
- 避免空值导致的统计错误
- 字段选择器中总是显示所有IAL字段

### Q3: 如何自定义默认值?

目前默认值固定为 "无",如需修改可以编辑预处理器:

```typescript
// 在 preprocess 方法中
allIALKeys.forEach(key => {
  if (!(key in row)) {
    row[key] = '未设置';  // 改为其他默认值
    // 或
    row[key] = '';       // 空字符串
    // 或
    row[key] = null;     // null值
  }
});
```

### Q4: 为什么新增的字段有 `ial_` 前缀?

**原因**: 避免与原有字段冲突

**示例**:
- 如果没有前缀,IAL中的 `id` 会覆盖原有的 `id` 字段
- 使用 `ial_id` 可以同时保留两个字段

### Q4: 为什么新增的字段有 `ial_` 前缀?

**原因**: 避免与原有字段冲突

**示例**:
- 如果没有前缀,IAL中的 `id` 会覆盖原有的 `id` 字段
- 使用 `ial_id` 可以同时保留两个字段

### Q5: 如何在X轴使用IAL中的属性?

**步骤**:
1. 点击"加载字段"按钮
2. 在X轴下拉框中找到 `ial_xxx` 字段
3. 选择该字段
4. 预览图表

### Q5: 如何在X轴使用IAL中的属性?

**步骤**:
1. 点击"加载字段"按钮
2. 在X轴下拉框中找到 `ial_xxx` 字段 (所有IAL字段都会显示)
3. 选择该字段
4. 预览图表

**提示**: 即使只有部分数据有这个IAL属性,字段也会显示,缺失的数据会显示为 "无"

### Q6: IAL中的自定义属性名包含特殊字符?

**支持的字符**: `a-z`, `A-Z`, `0-9`, `-`, `_`

**不支持**: 空格、中文、其他符号

```
custom-tag    ✅
custom_tag    ✅
自定义标签     ❌
custom tag    ❌
custom@tag    ❌
```

### Q6: IAL中的自定义属性名包含特殊字符?

**支持的字符**: `a-z`, `A-Z`, `0-9`, `-`, `_`

**不支持**: 空格、中文、其他符号

```
custom-tag    ✅
custom_tag    ✅
自定义标签     ❌
custom tag    ❌
custom@tag    ❌
```

### Q7: 如何获取IAL中的所有属性名?

```typescript
// 方式1: 使用 ial_keys 字段 (最简单)
console.log(row.ial_keys);  // "id, updated, custom-sttools"

// 方式2: 解析 ial_parsed JSON字符串
const parsed = JSON.parse(row.ial_parsed);
const keys = Object.keys(parsed);

// 方式3: 使用工具方法
const keys = preprocessor.getIALKeys(row.ial);

// 方式4: 查看预处理后的字段
const ialFields = Object.keys(row).filter(k => k.startsWith('ial_') && k !== 'ial_parsed' && k !== 'ial_keys');
```

### Q7: 如何获取IAL中的所有属性名?

```typescript
// 方式1: 使用 ial_keys 字段 (最简单)
console.log(row.ial_keys);  // "id, updated, custom-sttools"

// 方式2: 解析 ial_parsed JSON字符串
const parsed = JSON.parse(row.ial_parsed);
const keys = Object.keys(parsed);

// 方式3: 使用工具方法
const keys = preprocessor.getIALKeys(row.ial);

// 方式4: 查看预处理后的字段
const ialFields = Object.keys(row).filter(k => k.startsWith('ial_') && k !== 'ial_parsed' && k !== 'ial_keys');
```

### Q8: IAL中的时间戳没有被转换?

**检查**:
1. 确认时间戳格式为14位: `20251001194117`
2. 确认 `convertTimestamps: true`

```typescript
preprocessSqlData(rows, {
  parseIAL: true,
  convertTimestamps: true  // 必须启用
});
```

### Q8: IAL中的时间戳没有被转换?

**检查**:
1. 确认时间戳格式为14位: `20251001194117`
2. 确认 `convertTimestamps: true`

```typescript
preprocessSqlData(rows, {
  parseIAL: true,
  convertTimestamps: true  // 必须启用
});
```

### Q9: 统计图表中如何处理 "无" 值?

**默认行为**: "无" 作为独立分类统计

**示例**:
```javascript
// 数据
[
  { ial_custom-tag: "work" },
  { ial_custom-tag: "personal" },
  { ial_custom-tag: "无" },
  { ial_custom-tag: "无" }
]

// 统计结果
work: 1
personal: 1
无: 2  ← 作为独立分类
```

**如果要过滤掉 "无"**:
在SQL查询中添加过滤条件:
```sql
SELECT * FROM blocks 
WHERE ial LIKE '%custom-tag%'  -- 只查询包含此属性的数据
```

---

## 性能考虑

### 解析性能

- **时间复杂度**: O(n × m), n=行数, m=每行IAL属性数
- **正则性能**: 对于典型IAL(3-5个属性),解析时间 < 1ms

### 优化建议

1. **按需解析**: 如果不需要IAL,可以禁用
```typescript
preprocessSqlData(rows, { parseIAL: false });
```

2. **SQL过滤**: 在SQL层面过滤不需要的数据
```sql
SELECT id, content, ial FROM blocks 
WHERE ial LIKE '%custom-tag%'  -- 只查询有特定属性的块
```

3. **字段选择**: 只查询需要的字段
```sql
SELECT id, ial FROM blocks  -- 不查询大字段如 markdown, content
```

---

## 扩展功能

### 自定义字段前缀

如果需要修改 `ial_` 前缀,可以修改预处理器:

```typescript
// 在 preprocessRow 方法中
const fieldName = `attr_${key}`;  // 改为 attr_ 前缀
// 或
const fieldName = key;  // 不使用前缀(可能冲突)
```

### 支持更多IAL格式

如果需要支持特殊格式(如转义字符),可以增强正则表达式:

```typescript
// 当前正则
const regex = /(\w[\w-]*)\s*=\s*"([^"]*)"/g;

// 支持转义引号
const regex = /(\w[\w-]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g;
```

---

## 总结

IAL解析功能提供:
- ✅ **自动提取**: IAL属性自动转为独立字段
- ✅ **字段命名**: 使用 `ial_` 前缀避免冲突
- ✅ **时间转换**: IAL中的时间戳自动转换
- ✅ **JSON字符串**: `ial_parsed` 转为JSON字符串,避免显示 `[object Object]`
- ✅ **快速查看**: `ial_keys` 提供逗号分隔的属性列表
- ✅ **工具方法**: `getIALKeys()` 和 `getIALValue()`
- ✅ **调试友好**: 详细的解析日志
- ✅ **高性能**: 正则解析,< 1ms/行
- ✅ **容错性强**: 格式错误不影响其他字段
- ✅ **可视化集成**: 解析后的字段可直接用于图表配置
- ✅ **三层访问**: 独立字段(`ial_id`) / JSON字符串(`ial_parsed`) / 属性列表(`ial_keys`)
