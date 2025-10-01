# ECharts SQL 可视化模式

## 功能概览

ECharts 可视化面板的 **SQL 模式** 允许通过编写 SQL 查询来获取数据,并自动生成图表代码。

## 核心特性

### 1. SQL 查询 + 字段映射
- 编写任意 SQL 查询语句
- 点击 "加载字段" 自动提取字段名
- 可视化方式配置 X 轴和系列(或手动编写表达式)

### 2. SQL 预设集成 ✨
- 从 **SQL 可视化面板** 的预设中快速加载查询
- 预设保存在 `PluginConfig` 中,跨会话持久化
- 下拉选择即可填充 SQL 语句

### 3. 数据预处理
支持自动转换常见字段类型:

| 字段类型 | 转换说明 | 文档 |
|---------|---------|------|
| Box ID | `20250926163616-fh6v321` → `测试笔记本` | [PREPROCESS.md](./PREPROCESS.md) |
| 时间戳 | `20250930230210` → `2025-09-30 23:02:10` | [PREPROCESS.md](./PREPROCESS.md) |
| IAL 属性 | `{: custom-tag="work"}` → `ial_custom-tag` 字段 | [IAL.md](./IAL.md) |

**IAL 字段亮点**:
- 自动收集所有行的 IAL 子字段
- 缺失数据填充默认值 `"无"`
- 所有 IAL 属性都显示在字段下拉框中

### 4. 调试支持
- 配置层日志: SQL 表达式和映射规则
- 数据层日志: 前 N 行原始/处理后数据对比
- 详见 [DEBUG.md](./DEBUG.md)

## 快速开始

### 1. 基础用法

```typescript
// 1. 打开 ECharts 面板
// 2. 切换数据源为 "SQL"
// 3. 输入 SQL 查询
SELECT created, type, hpath FROM blocks WHERE type='d' LIMIT 100

// 4. 点击 "加载字段" - 自动提取: created, type, hpath, box, ial, ial_*
// 5. 配置映射
//    - X 轴字段: created
//    - 系列1: type (聚合: 计数)
// 6. 点击 "复制图表块" 或 "复制 JS(IIFE)"
```

### 2. 使用预设

```typescript
// 场景: 你已在 SQL 可视化面板中保存了 "日记统计" 预设

// 1. 打开 ECharts 面板 (SQL 模式)
// 2. 在 "预设模板" 下拉框中选择 "日记统计"
// 3. SQL 自动填充到文本框
// 4. 点击 "加载字段"
// 5. 配置 X 轴和系列
```

## 文档索引

| 文档 | 用途 |
|------|------|
| [SQL_PRESET.md](./SQL_PRESET.md) | **SQL 预设集成** - 如何从 SQL 面板加载预设 |
| [PREPROCESS.md](./PREPROCESS.md) | **数据预处理** - Box/时间戳/IAL 自动转换 |
| [IAL.md](./IAL.md) | **IAL 字段解析** - 详细的 IAL 提取和填充规则 |
| [DEBUG.md](./DEBUG.md) | **调试指南** - 控制台日志输出说明 |

## 架构图

```
┌────────────────────────────────────────────────────┐
│              VisualEchartsUI                       │
│  (数据源切换: database / sql)                       │
└────────────────┬───────────────────────────────────┘
                 │
                 ├─► VisualEchartsQueryUI (数据库模式)
                 │
                 └─► VisualEchartsSqlUI (SQL 模式) ◄─ 本模块
                        │
                        ├─► loadSqlPresets() ──► PluginConfig
                        │
                        ├─► preprocessSqlData() ──► SqlDataPreprocessor
                        │      ├─ convertBoxField()
                        │      ├─ convertTimestamp()
                        │      └─ parseIAL()
                        │
                        └─► buildSqlMappingExpressions() ──► sql-data-mapping.ts
```

## 代码文件

```
src/aggregate/echarts/sql/
├── visual-echarts-sql-ui.ts      # SQL 模式 UI (主文件)
├── sql-data-mapping.ts           # 字段映射表达式生成
├── sql-data-preprocessor.ts      # 数据预处理器
├── README.md                     # 本文档
├── SQL_PRESET.md                 # SQL 预设功能详解
├── PREPROCESS.md                 # 预处理功能说明
├── IAL.md                        # IAL 字段解析详解
└── DEBUG.md                      # 调试指南
```

## 使用场景

### 场景 1: 日记统计
```sql
SELECT 
  created,
  LENGTH(content) as word_count,
  type
FROM blocks 
WHERE hpath LIKE '%daily note%'
  AND type = 'p'
```

**配置**:
- X 轴: `created` (时间分桶: 日)
- 系列1: `word_count` (聚合: 求和)

### 场景 2: 标签分布
```sql
SELECT 
  ial,
  type,
  created
FROM blocks 
WHERE ial LIKE '%custom-tag%'
  AND type = 'd'
```

**预处理后字段**:
- `ial_custom-tag` (自动提取)
- `created` (转为可读格式)
- `box` (笔记本名称)

**配置**:
- X 轴: `ial_custom-tag`
- 系列1: `type` (聚合: 计数)

### 场景 3: 笔记本统计
```sql
SELECT 
  box,
  type,
  created
FROM blocks
WHERE type IN ('d', 'p')
```

**预处理后字段**:
- `box` → 转为笔记本名称(如 "工作笔记")
- `created` → 转为 `2025-10-01 19:41:17`

**配置**:
- X 轴: `box` (笔记本名称)
- 系列1: `type` (聚合: 计数)

## 技术栈

- **TypeScript** - 类型安全
- **Siyuan API** - `/api/query/sql` SQL 查询
- **Global State** - `window.siyuan.notebooks` 笔记本映射
- **PluginConfig** - 预设持久化存储
- **Regex** - IAL 属性解析 `/(\w[\w-]*)\s*=\s*"([^"]*)"/g`

## 常见问题

### Q: 为什么有些字段没出现在下拉框?
A: 点击 "加载字段" 后,会执行 SQL 查询并从 **所有行** 提取字段名。如果某个 IAL 子字段只在部分行中存在,系统会自动收集并为缺失行填充 `"无"` 值。

### Q: 预设下拉框为空?
A: 需要先在 **SQL 可视化面板** 中保存预设。预设保存在 `PluginConfig('aggregate-sql')` 中。

### Q: 如何调试数据处理?
A: 在配置区域勾选 "调试模式",控制台会输出:
- SQL 表达式和映射配置
- 前 N 行原始数据 vs 处理后数据

详见 [DEBUG.md](./DEBUG.md)

### Q: IAL 字段显示 "无" 是什么意思?
A: 表示该行数据中缺少对应的 IAL 子字段。例如:
- 行1: `{: custom-tag="work" priority="high"}`
- 行2: `{: custom-tag="personal"}` ← 缺少 `priority`
- 处理后行2: `ial_priority = "无"`

详见 [IAL.md](./IAL.md) 的 Q2。

## 最佳实践

1. **优先使用预设** - 复杂查询保存为预设,快速复用
2. **启用调试** - 开发时开启调试模式,查看数据转换过程
3. **合理分桶** - 时间数据使用分桶功能(年/月/日/时)
4. **利用 IAL** - 自定义属性通过 IAL 字段直接提取
5. **性能优化** - 大数据量时添加 `LIMIT` 或筛选条件

## 更新日志

### 2025-10-01
- ✨ 新增 SQL 预设集成功能
- ✨ IAL 字段自动收集 + 默认值填充
- 📝 完善文档体系(4 个专项文档)

### 2025-09-30
- 🎉 SQL 可视化模式正式发布
- ✅ Box ID → 笔记本名称转换
- ✅ 时间戳 → 可读格式转换
- ✅ IAL 属性解析

---

**维护团队**: Aggregate 模块组  
**相关模块**: `module-aggregate.ts`, `visual-echarts-ui.ts`
