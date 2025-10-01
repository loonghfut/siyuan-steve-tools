# SQL 预设集成功能

## 概述

ECharts SQL 可视化模式现已支持从 **SQL 可视化面板** 的预设中快速加载 SQL 查询语句。预设数据保存在 `PluginConfig` 中,而非 localStorage。

## 功能特性

### 1. 预设加载
- 在 SQL 查询区域顶部添加 **"预设模板"** 下拉框
- 自动加载 SQL 可视化面板中保存的所有预设
- 选择预设后自动填充 SQL 查询语句

### 2. 数据来源
```typescript
// 预设数据从 PluginConfig 加载
const conf = new PluginConfig(plugin.name, 'aggregate-sql');
await conf.load();
const presets = conf.get('presets') || {};

// 传递给 ECharts UI
new VisualEchartsUI(container, {
  loadSqlPresets: () => (conf.get('presets') || {}),
  // ...
});
```

### 3. 预设格式
```json
{
  "preset-key-1": {
    "name": "我的查询",
    "sql": "SELECT * FROM blocks WHERE type='d'",
    "_compiledAt": "2025-10-01T12:00:00.000Z",
    "types": ["d"],
    "boxes": [],
    "path": "",
    "content": ""
  }
}
```

**字段说明**:
- `name`: 预设名称
- `sql`: **编译后的 SQL 语句** (ECharts 使用此字段)
- `_compiledAt`: SQL 编译时间戳
- `types`, `boxes`, `path` 等: 原始筛选条件(供 SQL 面板恢复状态)

**版本兼容**:
- **新版预设** (推荐): 包含 `sql` 字段,可直接在 ECharts 中使用
- **旧版预设**: 只有筛选条件,需要在 SQL 面板中重新保存以添加 `sql` 字段

## 使用流程

### 用户视角

1. **创建预设** (在 SQL 可视化面板)
   ```
   打开 SQL 可视化面板 → 编写查询 → 保存为预设
   ```

2. **使用预设** (在 ECharts 面板)
   ```
   打开 ECharts 面板 → 切换到 SQL 模式 → 选择预设模板 → 自动填充 SQL
   ```

3. **字段映射**
   ```
   填充 SQL 后 → 点击"加载字段" → 自动提取字段名 → 配置 X 轴和系列
   ```

### 技术流程

```
用户操作                  前端交互                后端逻辑
   │                        │                       │
   ▼                        ▼                       ▼
选择预设  ────────►  触发 change 事件 ─────►  读取 this.presets[key]
   │                        │                       │
   ▼                        ▼                       ▼
获取 SQL ────────►  填充到 textarea ────►  触发 onChanged()
   │                        │                       │
   ▼                        ▼                       ▼
加载字段 ────────►  执行 SQL 查询  ─────►  解析字段名
   │                        │                       │
   ▼                        ▼                       ▼
配置图表 ────────►  映射字段表达式 ─────►  生成 IIFE 代码
```

## 代码架构

### 接口定义
```typescript
// src/aggregate/echarts/sql/visual-echarts-sql-ui.ts
export interface VisualEchartsSqlOptions {
  persistKey?: string;
  onChange?: () => void;
  loadSqlPresets?: () => Promise<Record<string, any>> | Record<string, any>;
}
```

### UI 组件
```typescript
export class VisualEchartsSqlUI {
  private presets: Record<string, any> = {};
  private presetSelectEl?: HTMLSelectElement;
  
  constructor(container: HTMLElement, options?: VisualEchartsSqlOptions) {
    // 初始化 UI
    this.render();
    // 异步加载预设
    this.loadPresetsToUI().catch(err => console.error('加载失败:', err));
  }
  
  private async loadPresetsToUI() {
    if (!this.opts?.loadSqlPresets || !this.presetSelectEl) return;
    const result = this.opts.loadSqlPresets();
    const presetsData = (result instanceof Promise) ? await result : result;
    this.presets = presetsData || {};
    
    // 填充下拉框
    for (const key of Object.keys(this.presets)) {
      const preset = this.presets[key];
      const name = preset.name || key;
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = name;
      this.presetSelectEl.appendChild(opt);
    }
  }
}
```

### 预设选择处理
```typescript
this.presetSelectEl?.addEventListener('change', () => {
  const key = this.presetSelectEl?.value || '';
  if (key && this.presets[key]) {
    const preset = this.presets[key];
    const sql = preset.sql || preset.source?.sql || '';
    if (sql) {
      this.sql = sql;
      this.sqlTextarea.value = sql;
      this.onChanged(); // 触发代码重新生成
    }
  }
});
```

## 配置传递链路

```
module-aggregate.ts
  ├─ PluginConfig('aggregate-sql')
  │   └─ loadPresets: () => conf.get('presets')
  │
  ├─ VisualEchartsUI(container, opts)
  │   └─ loadSqlPresets: () => conf.get('presets')
  │
  └─ VisualEchartsSqlUI(sqlContainer, opts)
      └─ loadSqlPresets: opts.loadSqlPresets
```

### 关键文件

1. **module-aggregate.ts** - 所有入口的配置传递
   ```typescript
   const conf = new PluginConfig(this.plugin.name, 'aggregate-sql');
   await conf.load();
   
   new VisualEchartsUI(container, {
     loadSqlPresets: () => (conf.get('presets') || {})
   });
   ```

2. **visual-echarts-ui.ts** - 父容器传递
   ```typescript
   this.sqlUI = new VisualEchartsSqlUI(sqlContainer, {
     loadSqlPresets: this.loadSqlPresetsProvider
   });
   ```

3. **visual-echarts-sql-ui.ts** - 实际使用
   ```typescript
   this.loadPresetsToUI(); // 加载预设到下拉框
   ```

## UI 布局

```
┌─ ECharts 可视化生成器 ──────────────────────┐
│                                              │
│ [数据源: SQL ▼]  [转到 SQL ➜]               │
│                                              │
├─ SQL 查询模式 ──────────────────────────────┤
│                                              │
│ 标题: [________________]  颜色: [调色板...]  │
│                                              │
│ ┌─ SQL 查询语句 ─────────────────────────┐  │
│ │ 预设模板: [-- 选择预设 -- ▼]           │  │
│ │                                         │  │
│ │ [SQL 查询文本框]                        │  │
│ │ SELECT * FROM blocks                    │  │
│ │ WHERE type='d'                          │  │
│ │                                         │  │
│ │ [加载字段]                              │  │
│ └─────────────────────────────────────────┘  │
│                                              │
│ ┌─ 数据映射 ─────────────────────────────┐  │
│ │ X 轴字段: [created ▼]                   │  │
│ │ 排序: [升序 ▼]  时间分桶: [无 ▼]        │  │
│ │ 合并相同X: [✓]                          │  │
│ └─────────────────────────────────────────┘  │
│                                              │
│ ┌─ 系列(Series) ─────────────────────────┐  │
│ │ [添加系列]                              │  │
│ │                                         │  │
│ │ 系列1: [hpath] 聚合: [计数 ▼]           │  │
│ └─────────────────────────────────────────┘  │
│                                              │
└──────────────────────────────────────────────┘
```

## 常见问题

### Q1: 预设下拉框为空?
**原因**: 
- SQL 可视化面板中没有保存任何预设
- `loadSqlPresets` 未正确传递

**解决**:
1. 打开 SQL 可视化面板
2. 编写查询并保存为预设
3. 刷新 ECharts 面板

### Q2: 选择预设后 SQL 没有填充?

**原因 1**: 旧版预设不包含 `sql` 字段

**解决方法**:
1. 打开 SQL 可视化面板
2. 加载该预设
3. 重新保存一次(系统会自动添加 `sql` 字段)
4. 返回 ECharts 面板重试

**原因 2**: 预设数据损坏

**调试方法**:
```javascript
// 在浏览器控制台检查预设
const conf = new PluginConfig('siyuan-steve-tools', 'aggregate-sql');
await conf.load();
const presets = conf.get('presets');

// 检查每个预设是否有 sql 字段
Object.keys(presets).forEach(key => {
  const preset = presets[key];
  console.log(`预设 "${key}":`, {
    hasSql: !!preset.sql,
    sql: preset.sql?.substring(0, 50) + '...'
  });
});
```

**预设格式说明**:
```javascript
// ✓ 新版预设(包含 sql 字段)
{
  "我的查询": {
    "name": "我的查询",
    "sql": "SELECT * FROM blocks WHERE type='d'",
    "types": ["d"],
    "_compiledAt": "2025-10-01T12:00:00Z"
  }
}

// ✗ 旧版预设(缺少 sql 字段) - 需要重新保存
{
  "旧查询": {
    "types": ["d"],
    "boxes": [],
    "path": ""
    // 缺少 sql 字段!
  }
}
```

### Q3: 如何调试预设加载?
```javascript
// 在浏览器控制台
const conf = new PluginConfig('siyuan-steve-tools', 'aggregate-sql');
await conf.load();
console.log(conf.get('presets'));
```

### Q4: 支持同步/异步加载吗?
**支持**:
```typescript
// 同步
loadSqlPresets: () => ({ preset1: {...} })

// 异步
loadSqlPresets: async () => {
  const data = await fetchPresets();
  return data;
}
```

## 测试场景

### 场景 1: Tab 模式
```typescript
// module-aggregate.ts: Tab 初始化
this.plugin.addTab({
  type: "visual-echarts",
  async init() {
    const conf = new PluginConfig(aggregate.plugin.name, 'aggregate-sql');
    await conf.load();
    const ui = new VisualEchartsUI(container, {
      loadSqlPresets: () => (conf.get('presets') || {})
    });
  }
});
```

### 场景 2: Slash 命令
```typescript
// module-aggregate.ts: Slash 回调
{
  filter: ["ECharts", "echarts"],
  callback: async (_protyle, nodeElement) => {
    const conf = new PluginConfig(this.plugin.name, 'aggregate-sql');
    await conf.load();
    const ui = new VisualEchartsUI(container, {
      loadSqlPresets: () => (conf.get('presets') || {})
    });
  }
}
```

### 场景 3: 弹窗模式
```typescript
// module-aggregate.ts: 顶部栏菜单
menu.addItem({
  click: async () => {
    const conf = new PluginConfig(this.plugin.name, 'aggregate-sql');
    await conf.load();
    new VisualEchartsUI(container, {
      loadSqlPresets: () => (conf.get('presets') || {})
    });
  }
});
```

## 兼容性

### 向后兼容
- 如果 `loadSqlPresets` 未提供,预设功能静默禁用
- 下拉框仍显示,但只有默认选项 "-- 选择预设 --"

### 数据格式兼容
```typescript
// 兼容多种格式
const sql = preset.sql           // 优先级 1
         || preset.source?.sql   // 优先级 2
         || '';                  // 默认值
```

## 后续优化

### 可选功能
1. **预设搜索**: 大量预设时支持搜索过滤
2. **预设分组**: 按标签/类别分组显示
3. **快捷操作**: 右键编辑/删除预设
4. **预设同步**: 双向同步(ECharts → SQL 面板)

### 性能优化
- 懒加载: 仅在切换到 SQL 模式时加载预设
- 缓存: 避免重复调用 `loadSqlPresets()`
- 防抖: 选择预设后延迟执行查询

## 相关文档

- [SQL数据预处理](./PREPROCESS.md) - Box/时间戳/IAL 字段转换
- [IAL字段解析](./IAL.md) - IAL 属性提取与默认值填充
- [调试指南](./DEBUG.md) - 控制台日志输出

---

**最后更新**: 2025-10-01  
**负责人**: SQL 可视化团队
