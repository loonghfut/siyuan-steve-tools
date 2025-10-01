# SQL数据预处理器说明

## 概述

`sql-data-preprocessor.ts` 提供了SQL查询结果的数据预处理功能,主要用于字段转换和数据清洗,确保数据以用户友好的方式展示在图表中。

---

## 核心功能

### 1. 📚 Box字段转换 (ID → Name)

**问题**: SQL查询返回的 `box` 字段是笔记本ID(如 `20250926163616-fh6v321`),对用户不友好

**解决**: 自动将ID转换为笔记本名称(如 `测试笔记本`)

**数据源**: 
- 优先使用构造函数传入的 `customNotebooks`
- 否则使用全局变量 `window.siyuan.notebooks`

**示例**:
```javascript
// 原始数据
{ id: "xxx", box: "20250926163616-fh6v321", content: "..." }

// 预处理后
{ id: "xxx", box: "1", content: "..." }
```

### 2. 🕐 时间戳转换 (Timestamp → Human Readable)

**问题**: `created` 和 `updated` 字段是思源笔记时间戳格式(如 `20250930230210`),不直观

## 总结

SQL数据预处理器提供了灵活、高效的数据转换能力,确保:
- ✅ **用户友好**: 将技术ID转换为可读名称
- ✅ **时间可读**: 将时间戳转换为标准日期时间格式
- ✅ **多种格式**: 支持 datetime/date/time/full 四种时间格式
- ✅ **IAL解析**: 自动提取IAL属性为独立字段
- ✅ **字段安全**: IAL字段使用 `ial_` 前缀避免冲突
- ✅ **可扩展**: 易于添加新的字段转换逻辑
- ✅ **高性能**: 使用Map数据结构,O(1)查找时间,正则优化
- ✅ **可调试**: 提供详细的调试信息输出
- ✅ **类型安全**: 完整的TypeScript类型定义
- ✅ **容错性**: 无效格式自动保持原值,不会抛出错误
- ✅ **工具方法**: 提供 `getIALKeys()` 和 `getIALValue()` 等实用方法换为人类可读的时间格式

**支持的格式**:
- `datetime` (默认): `2025-09-30 23:02:10`
- `date`: `2025-09-30`
- `time`: `23:02:10`
- `full`: `2025年09月30日 23:02:10`

**示例**:
```javascript
// 原始数据
{ 
  id: "xxx",
  created: "20250930230210",
  updated: "20251001120000"
}

// 预处理后 (datetime格式)
{
  id: "xxx", 
  created: "2025-09-30 23:02:10",
  updated: "2025-10-01 12:00:00"
}
```

### 3. 📋 IAL字段解析 (IAL → Structured Fields)

**问题**: `ial` 字段是字符串格式(如 `{: id="xxx" updated="yyy" custom-attr="zzz"}`),无法直接使用

**解决**: 自动解析IAL字符串,提取为独立字段

**字段命名**: 使用 `ial_` 前缀避免冲突

**示例**:
```javascript
// 原始数据
{
  id: "xxx",
  ial: '{: id="20250928201839-ogi60jt" updated="20251001194117" custom-sttools="app"}'
}

// 预处理后
{
  id: "xxx",
  ial: '{: id="20250928201839-ogi60jt" updated="20251001194117" custom-sttools="app"}',
  ial_id: "20250928201839-ogi60jt",
  ial_updated: "2025-10-01 19:41:17",  // 时间戳自动转换
  ial_custom-sttools: "app",
  ial_parsed: '{"id":"20250928201839-ogi60jt","updated":"20251001194117","custom-sttools":"app"}',  // JSON字符串
  ial_keys: "id, updated, custom-sttools"  // 属性列表
}
```

**详细文档**: 参见 [IAL.md](./IAL.md)

---

## 使用方式

### 方式1: 快捷函数(推荐)

```typescript
import { preprocessSqlData } from './sql-data-preprocessor';

const rawRows = [
  { id: "1", box: "20250926163616-fh6v321", content: "测试" }
];

// 使用默认配置 (转换box和时间戳)
const processedRows = preprocessSqlData(rawRows);

// 使用自定义配置
const processedRows = preprocessSqlData(rawRows, {
  convertBoxIdToName: true,      // 是否转换box字段
  convertTimestamps: true,       // 是否转换时间戳
  timestampFormat: 'datetime',   // 时间格式: datetime|date|time|full
  parseIAL: true,                // 是否解析IAL字段
  debug: true                    // 是否输出调试信息
});
```

### 方式2: 类实例化

```typescript
import { SqlDataPreprocessor } from './sql-data-preprocessor';

// 创建预处理器实例
const preprocessor = new SqlDataPreprocessor({
  convertBoxIdToName: true,
  debug: false
});

// 预处理数据
const processedRows = preprocessor.preprocess(rawRows);

// 获取映射表信息(调试用)
const mapInfo = preprocessor.getMapInfo();
console.log('笔记本映射表:', mapInfo);

// 重新加载笔记本列表
preprocessor.reloadNotebooks();
```

### 方式3: 静态方法(单个转换)

```typescript
import { SqlDataPreprocessor } from './sql-data-preprocessor';

const boxId = "20250926163616-fh6v321";
const boxName = SqlDataPreprocessor.getNotebookName(boxId);
console.log(boxName); // "1"
```

---

## 配置选项

### PreprocessOptions 接口

```typescript
interface PreprocessOptions {
  /** 是否转换box字段(ID -> name) 默认: true */
  convertBoxIdToName?: boolean;
  
  /** 是否转换时间戳字段为可读格式 默认: true */
  convertTimestamps?: boolean;
  
  /** 时间戳格式化选项 默认: 'datetime' */
  timestampFormat?: 'datetime' | 'date' | 'time' | 'full';
  
  /** 是否解析IAL字段 默认: true */
  parseIAL?: boolean;
  
  /** 是否输出调试信息 默认: false */
  debug?: boolean;
  
  /** 自定义笔记本列表(不使用全局变量时) */
  customNotebooks?: NotebookInfo[];
}
```

#### 时间戳格式说明

| 格式 | 输出示例 | 说明 |
|------|---------|------|
| `datetime` | `2025-09-30 23:02:10` | ISO标准格式(默认) |
| `date` | `2025-09-30` | 仅日期部分 |
| `time` | `23:02:10` | 仅时间部分 |
| `full` | `2025年09月30日 23:02:10` | 中文完整格式 |

### NotebookInfo 接口

```typescript
interface NotebookInfo {
  id: string;              // 笔记本ID
  name: string;            // 笔记本名称
  icon: string;            // 图标
  sort: number;            // 排序
  sortMode: number;        // 排序模式
  closed: boolean;         // 是否关闭
  newFlashcardCount: number;
  dueFlashcardCount: number;
  flashcardCount: number;
}
```

---

## 集成到ECharts流程

### 在 visual-echarts-sql-ui.ts 中的集成

#### 1. 字段加载时预处理

```typescript
// loadKeys() 方法中
const rawRows = fetchSqlSync(sql);
const rows = preprocessSqlData(rawRows, { debug: true });

// 使用预处理后的数据提取字段
this.keys = Object.keys(rows[0]);
```

#### 2. 图表渲染时预处理

```typescript
// buildSimpleIIFE() 生成的IIFE代码中
var rawRows = fetchSqlSync(sql);
const rows = preprocessData(rawRows);  // 内嵌预处理函数

// 使用预处理后的数据计算X轴和系列
const xAxisData = rows.map(r => r.created);
const seriesData = rows.map(r => r.value);
```

---

## 调试信息

### 启用调试模式

```typescript
const rows = preprocessSqlData(rawRows, { debug: true });
```

### 调试输出示例

```
🔧 SQL数据预处理
├─ 📊 原始数据行数: 150
├─ 📄 第一行数据(处理前): { id: "xxx", box: "20250926163616-fh6v321", created: "20250930230210", ial: "{: ...}", ... }
├─ 📄 第一行数据(处理后): { id: "xxx", box: "1", created: "2025-09-30 23:02:10", ial: "{: ...}", ial_id: "...", ... }
├─ 🔄 box字段转换: 20250926163616-fh6v321 -> 1
├─ 🕐 created字段转换: 20250930230210 -> 2025-09-30 23:02:10
├─ 🕐 updated字段转换: 20251001120000 -> 2025-10-01 12:00:00
├─ 📋 IAL字段解析: 提取了 3 个属性
├─ 📚 涉及的笔记本: ["1", "test", "日程管理笔记本"]
└─ 📚 笔记本映射表大小: 6
```

### 字段加载调试

```
🔍 字段加载调试:
├─ 原始字段: ["id", "box", "content", "created", ...]
├─ 预处理后字段: ["id", "box", "content", "created", ...]
└─ box字段转换: 20250926163616-fh6v321 -> 1
```

---

## 扩展功能

### 不同时间格式示例

```typescript
// datetime格式 (默认)
preprocessSqlData(rows, { timestampFormat: 'datetime' });
// created: "2025-09-30 23:02:10"

// date格式 (仅日期)
preprocessSqlData(rows, { timestampFormat: 'date' });
// created: "2025-09-30"

// time格式 (仅时间)
preprocessSqlData(rows, { timestampFormat: 'time' });
// created: "23:02:10"

// full格式 (中文完整)
preprocessSqlData(rows, { timestampFormat: 'full' });
// created: "2025年09月30日 23:02:10"
```

### 添加新的字段转换

可以在 `preprocessRow` 方法中添加更多字段转换逻辑:

```typescript
private preprocessRow(row: SqlRow): SqlRow {
  if (!row) return row;
  const processedRow = { ...row };

  // 转换box字段
  if (this.options.convertBoxIdToName && processedRow.box) {
    processedRow.box = this.convertBoxField(processedRow.box);
  }

  // 🆕 添加更多转换
  // 示例: 转换时间戳为可读格式
  if (processedRow.created && typeof processedRow.created === 'number') {
    processedRow.created = new Date(processedRow.created).toISOString();
  }

  // 示例: 转换状态码为文本
  if (processedRow.status === 1) {
    processedRow.statusText = '已完成';
  }

  return processedRow;
}
```

### 添加数据验证

```typescript
public preprocess(rows: SqlRow[]): SqlRow[] {
  if (!Array.isArray(rows) || rows.length === 0) {
    return rows;
  }

  // 🆕 数据验证
  const validRows = rows.filter(row => {
    // 过滤无效数据
    if (!row || typeof row !== 'object') return false;
    if (!row.id) return false; // 必须有ID
    return true;
  });

  return validRows.map(row => this.preprocessRow(row));
}
```

---

## 性能考虑

### 性能影响

- **时间复杂度**: O(n), n为数据行数
- **空间复杂度**: O(n + m), m为笔记本数量
- **映射表**: 使用 `Map` 数据结构,查找时间 O(1)

### 优化建议

1. **缓存映射表**: 映射表在构造时创建一次,后续查找无需重建
2. **按需转换**: 只有启用 `convertBoxIdToName` 时才执行转换
3. **调试模式**: 生产环境关闭 `debug` 减少console输出开销

### 大数据量处理

```typescript
// 对于超大数据集,可以分批处理
function preprocessInBatches(rows: SqlRow[], batchSize = 1000): SqlRow[] {
  const preprocessor = new SqlDataPreprocessor({ debug: false });
  const result: SqlRow[] = [];
  
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    result.push(...preprocessor.preprocess(batch));
  }
  
  return result;
}
```

---

## 常见问题

### Q1: box字段没有转换?

**可能原因**:
1. `window.siyuan.notebooks` 未定义
2. 笔记本列表中没有对应的ID
3. `convertBoxIdToName` 设置为 false

**解决方案**:
```typescript
// 检查全局变量
console.log(window.siyuan?.notebooks);

// 使用自定义笔记本列表
const customNotebooks = [
  { id: "20250926163616-fh6v321", name: "测试", ... }
];
preprocessSqlData(rows, { customNotebooks });

// 启用调试查看详情
preprocessSqlData(rows, { debug: true });
```

### Q2: 时间戳没有转换?

**可能原因**:
1. 时间戳格式不是14位数字
2. `convertTimestamps` 设置为 false
3. 字段名不是 `created` 或 `updated`

**解决方案**:
```typescript
// 检查时间戳格式
console.log(/^\d{14}$/.test("20250930230210")); // 应为 true

// 确保启用时间戳转换
preprocessSqlData(rows, { convertTimestamps: true });

// 如果是其他字段名,需要扩展preprocessRow方法
```

### Q4: 如何跳过某些字段的转换?

```typescript
// 关闭box转换但保留时间戳转换
preprocessSqlData(rows, { 
  convertBoxIdToName: false,
  convertTimestamps: true 
});

// 关闭时间戳转换但保留box转换
preprocessSqlData(rows, { 
  convertBoxIdToName: true,
  convertTimestamps: false 
});

// 关闭所有转换
preprocessSqlData(rows, { 
  convertBoxIdToName: false,
  convertTimestamps: false 
});
```

### Q5: 如何处理其他时间戳字段(如自定义字段)?

```typescript
// 需要扩展 preprocessRow 方法
private preprocessRow(row: SqlRow): SqlRow {
  // ... 现有代码 ...
  
  // 添加自定义时间戳字段转换
  if (this.options.convertTimestamps) {
    ['created', 'updated', 'customTime1', 'customTime2'].forEach(field => {
      if (processedRow[field]) {
        processedRow[field] = this.convertTimestamp(processedRow[field]);
      }
    });
  }
  
  return processedRow;
}
```

### Q6: 时间戳格式验证失败?

```typescript
// 使用 date 格式
preprocessSqlData(rows, { 
  timestampFormat: 'date' 
});
// 结果: created: "2025-09-30"
```

### Q4: 如何跳过某些字段的转换?

```typescript
// 修改 preprocessRow 方法
private preprocessRow(row: SqlRow): SqlRow {
  if (!row) return row;
  const processedRow = { ...row };

  // 只对特定box值转换
  if (this.options.convertBoxIdToName && 
      processedRow.box && 
      processedRow.box.startsWith('202')) {  // 只转换ID格式的
    processedRow.box = this.convertBoxField(processedRow.box);
  }

  return processedRow;
}
```

### Q3: 如何处理找不到映射的情况?

```typescript
// 当前默认行为: 返回原ID
const name = this.notebooksMap.get(boxId) || boxId;

// 可以自定义:
const name = this.notebooksMap.get(boxId) || '未知笔记本';
const name = this.notebooksMap.get(boxId) || `[${boxId}]`;
```

---

## 测试用例

### Q6: 时间戳格式验证失败?

```typescript
// 思源笔记时间戳必须是14位数字
const validFormat = /^\d{14}$/;

// 有效格式
"20250930230210"  // ✅ 有效

// 无效格式(不会被转换)
"2025-09-30"      // ❌ 包含横杠
"1696089730"      // ❌ Unix时间戳(10位)
"20250930"        // ❌ 只有8位

// 如需处理其他格式,修改convertTimestamp方法中的正则
```

### Q7: 如何在X轴使用转换后的时间?

```typescript
// 1. 确保预处理已启用
const rows = preprocessSqlData(rawRows, { convertTimestamps: true });

// 2. 在可视化配置中选择 created 或 updated 作为X轴
// 转换后的格式 "2025-09-30 23:02:10" 可以直接用于时间轴

// 3. 如果需要按天分组,使用 bucket: 'day'
// 这会自动提取 "2025-09-30" 部分
```

---

## 测试用例

```typescript
// 测试box字段转换 + 时间戳转换
const testRows = [
  { 
    id: "1", 
    box: "20250926163616-fh6v321", 
    created: "20250930230210",
    updated: "20251001120000",
    content: "测试1" 
  },
  { 
    id: "2", 
    box: "20240923142133-d5mf9bf",
    created: "20250930153045",
    updated: "20250930153045", 
    content: "测试2" 
  }
];

const processed = preprocessSqlData(testRows, { 
  convertTimestamps: true,
  timestampFormat: 'datetime',
  debug: true 
});

// 验证box转换
console.assert(processed[0].box === "1", "第一条box应转换为'1'");
console.assert(processed[1].box === "test", "第二条box应转换为'test'");

// 验证时间戳转换
console.assert(
  processed[0].created === "2025-09-30 23:02:10",
  "created应转换为datetime格式"
);
console.assert(
  processed[0].updated === "2025-10-01 12:00:00",
  "updated应转换为datetime格式"
);

// 测试不同格式
const dateFormat = preprocessSqlData(testRows, { timestampFormat: 'date' });
console.assert(
  dateFormat[0].created === "2025-09-30",
  "date格式应只包含日期"
);

const timeFormat = preprocessSqlData(testRows, { timestampFormat: 'time' });
console.assert(
  timeFormat[0].created === "23:02:10",
  "time格式应只包含时间"
);

const fullFormat = preprocessSqlData(testRows, { timestampFormat: 'full' });
console.assert(
  fullFormat[0].created === "2025年09月30日 23:02:10",
  "full格式应为中文完整格式"
);
```

---

## 性能对比

```typescript
// 时间戳转换性能测试
const rows = generateTestData(10000); // 10000条数据

console.time('预处理耗时');
const processed = preprocessSqlData(rows, {
  convertBoxIdToName: true,
  convertTimestamps: true
});
console.timeEnd('预处理耗时');
// 典型结果: ~50ms (10000条)

// 禁用时间戳转换
console.time('仅box转换');
const processed2 = preprocessSqlData(rows, {
  convertBoxIdToName: true,
  convertTimestamps: false
});
console.timeEnd('仅box转换');
// 典型结果: ~30ms (10000条)
```

---

## 总结

SQL数据预处理器提供了灵活、高效的数据转换能力,确保:
- ✅ **用户友好**: 将技术ID转换为可读名称
- ✅ **时间可读**: 将时间戳转换为标准日期时间格式
- ✅ **多种格式**: 支持 datetime/date/time/full 四种格式
- ✅ **可扩展**: 易于添加新的字段转换逻辑
- ✅ **高性能**: 使用Map数据结构,O(1)查找时间,正则优化
- ✅ **可调试**: 提供详细的调试信息输出
- ✅ **类型安全**: 完整的TypeScript类型定义
- ✅ **容错性**: 无效格式自动保持原值,不会抛出错误
