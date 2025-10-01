# SQL 预设功能 - 快速参考

## 🎯 功能说明

在 **ECharts 可视化面板的 SQL 模式** 中,可以从 **SQL 可视化面板** 保存的预设中快速加载 SQL 查询。

## 📋 使用步骤

### 第一步: 创建预设 (在 SQL 可视化面板)

```
1. 打开 SQL 可视化面板
   - 顶部栏图标 → "页签模式" 或 "弹窗模式"
   - 或 Slash 命令: /stsql

2. 编写 SQL 查询
   SELECT * FROM blocks WHERE type='d' LIMIT 100

3. 保存为预设
   - 点击 "管理预设" 按钮
   - 输入预设名称: "文档查询"
   - 保存
```

### 第二步: 使用预设 (在 ECharts 面板)

```
1. 打开 ECharts 面板
   - 顶部栏图标 → "图表页签" 或 "图表弹窗"
   - 或 Slash 命令: /stcharts

2. 切换到 SQL 模式
   - 数据源: [SQL ▼]

3. 选择预设
   - 预设模板: [文档查询 ▼]
   - SQL 自动填充到文本框

4. 加载字段
   - 点击 "加载字段" 按钮
   - 自动提取字段名到下拉框

5. 配置图表
   - X 轴字段: 选择字段
   - 添加系列: 配置数据系列
   - 选择聚合方式: 计数/求和/平均等
```

## 🔧 技术细节

### 预设数据存储

```typescript
// 存储位置: PluginConfig (非 localStorage)
const conf = new PluginConfig('siyuan-steve-tools', 'aggregate-sql');
await conf.load();
const presets = conf.get('presets');

// 新版预设格式 (自动包含编译后的 SQL)
{
  "my-query-1": {
    "name": "文档查询",
    "sql": "SELECT * FROM blocks WHERE type='d'",  // ← ECharts 使用此字段
    "types": ["d"],                                 // ← 原始筛选条件
    "boxes": [],
    "_compiledAt": "2025-10-01T12:00:00.000Z"
  }
}
```

**重要**: 从 2025-10-01 版本开始,保存预设时会自动添加 `sql` 字段。旧版预设需要重新保存才能在 ECharts 中使用。

### 配置传递链

```
module-aggregate.ts
  └─ loadSqlPresets: () => (conf.get('presets') || {})
       │
       ▼
  VisualEchartsUI
  └─ loadSqlPresets: this.loadSqlPresetsProvider
       │
       ▼
  VisualEchartsSqlUI
  └─ loadPresetsToUI() ─► 填充下拉框
```

### SQL 提取逻辑

```typescript
// 从预设中提取 SQL
const preset = this.presets[key];
const sql = preset.sql || '';  // 直接使用 sql 字段

// 旧版预设不包含 sql 字段,需要重新保存
if (!sql) {
  toast('旧版预设不包含 SQL,请重新保存预设');
}
```

## 🐛 故障排查

### 问题 1: 预设下拉框为空

**原因**: SQL 可视化面板中没有保存任何预设

**解决**:
```
1. 打开 SQL 可视化面板
2. 编写查询
3. 点击 "管理预设" → "保存"
4. 返回 ECharts 面板
5. 重新打开或刷新
```

### 问题 2: 选择预设后没反应

**检查 1**: 打开浏览器控制台
```javascript
// 查看预设数据
const conf = new PluginConfig('siyuan-steve-tools', 'aggregate-sql');
await conf.load();
console.log(conf.get('presets'));
```

**检查 2**: 预设格式是否正确
```javascript
// ✓ 正确
{ "key": { "sql": "SELECT ..." } }
{ "key": { "source": { "sql": "SELECT ..." } } }

// ✗ 错误
{ "key": { "query": "SELECT ..." } }  // 字段名错误
{ "key": "SELECT ..." }               // 缺少对象包装
```

### 问题 3: 加载字段失败

**原因**: SQL 查询语法错误或返回空结果

**解决**:
```
1. 检查 SQL 语法
2. 在 SQL 可视化面板中先预览结果
3. 确保查询返回至少 1 行数据
4. 查看控制台错误信息
```

### 问题 4: 控制台显示 "旧版预设不包含 SQL"

**原因**: 预设是在更新前保存的,缺少 `sql` 字段

**解决**:
```
1. 打开 SQL 可视化面板
2. 从预设列表中加载该预设
3. 点击 "保存为预设" 并使用相同名称(覆盖)
4. 系统会自动添加 sql 字段
5. 返回 ECharts 面板,重新选择预设
```

**验证**:
```javascript
// 检查预设是否更新成功
const conf = new PluginConfig('siyuan-steve-tools', 'aggregate-sql');
await conf.load();
const preset = conf.get('presets')['你的预设名'];
console.log('SQL 字段:', preset.sql);  // 应该显示 SQL 语句
```

## 📊 使用示例

### 示例 1: 基础查询

```sql
-- SQL 可视化面板中保存为 "基础文档"
SELECT 
  id,
  content,
  type,
  created,
  updated
FROM blocks 
WHERE type = 'd'
LIMIT 100
```

**ECharts 配置**:
- 预设: `基础文档`
- X 轴: `created`
- 系列1: `type` (聚合: 计数)

### 示例 2: 带 IAL 的查询

```sql
-- SQL 可视化面板中保存为 "标签统计"
SELECT 
  ial,
  type,
  created,
  box
FROM blocks 
WHERE ial LIKE '%custom-tag%'
```

**自动提取的字段**:
- 原始: `id`, `ial`, `type`, `created`, `box`
- 预处理后: 
  - `ial_custom-tag` (IAL 子字段)
  - `ial_custom-priority` (如果存在)
  - `box` (转为笔记本名称)
  - `created` (转为可读格式)

**ECharts 配置**:
- 预设: `标签统计`
- X 轴: `ial_custom-tag`
- 系列1: `type` (聚合: 计数)

### 示例 3: 时间序列

```sql
-- SQL 可视化面板中保存为 "每日创建"
SELECT 
  created,
  type,
  box
FROM blocks 
WHERE type IN ('d', 'p')
ORDER BY created DESC
```

**ECharts 配置**:
- 预设: `每日创建`
- X 轴: `created`
- 时间分桶: `日`
- 合并相同X: `✓`
- 系列1: `type` (聚合: 计数)

## 💡 最佳实践

1. **预设命名规范**
   ```
   ✓ 文档统计
   ✓ 日记-按月
   ✓ 标签-工作类
   
   ✗ query1
   ✗ test
   ✗ 新建查询
   ```

2. **SQL 查询优化**
   ```sql
   -- ✓ 添加 LIMIT
   SELECT * FROM blocks LIMIT 1000
   
   -- ✓ 添加索引字段筛选
   WHERE type = 'd' AND created > '20250101000000'
   
   -- ✗ 避免全表扫描
   SELECT * FROM blocks WHERE content LIKE '%关键词%'
   ```

3. **预设分类管理**
   ```
   预设名称格式: [分类]-[用途]
   
   示例:
   - 文档-按类型
   - 文档-按笔记本
   - 日记-每日字数
   - 日记-按月统计
   - 标签-工作
   - 标签-个人
   ```

## 🔗 相关文档

- [SQL_PRESET.md](./SQL_PRESET.md) - 完整技术文档
- [README.md](./README.md) - SQL 模式总览
- [PREPROCESS.md](./PREPROCESS.md) - 数据预处理
- [IAL.md](./IAL.md) - IAL 字段解析
- [DEBUG.md](./DEBUG.md) - 调试指南

## 🎓 学习路径

```
新手 ──► 基础查询
  │       └─ 选择预设 → 加载字段 → 配置 X 轴/系列
  │
  ▼
进阶 ──► 自定义查询
  │       └─ 编写 SQL → 保存预设 → 复用
  │
  ▼
高级 ──► IAL + 预处理
          └─ 利用 IAL 字段 → 时间分桶 → 复杂聚合
```

---

**版本**: v1.0  
**更新**: 2025-10-01
