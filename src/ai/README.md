# AI 侧边栏模块

## 概述

AI 侧边栏功能允许用户在思源笔记中集成多个 AI 助手网站，并通过下拉菜单快速切换。

## 架构设计

### 核心文件

- **ai-utils.ts** - 工具函数库
  - `parseAiUrlList()` - 解析 AI 地址列表
  - `getAiUrlOptionsMap()` - 生成下拉选项对象
  - `generateSelectOptionsHtml()` - 生成 HTML 选项
  - `getActualUrl()` - 获取实际 URL（处理 custom 情况）
  - `updateWebviewUrl()` - 更新 webview/iframe URL

- **ai.ts** - 核心模块
  - `M_ai` 类 - AI 侧边栏主逻辑
  - `init()` - 初始化 dock 和下拉菜单
  - `updateSettings()` - 响应设置变化
  - `bindSelectChangeEvent()` - 绑定切换事件
  - `updateSelectOptions()` - 更新下拉选项

- **settings/ai.ts** - 设置面板配置
  - `aiDefaults` - 默认设置值
  - `aiGroup()` - 生成设置界面

## 数据流

### 设置字段

```typescript
{
  "ai-enable": boolean,           // 是否启用 AI 侧边栏
  "ai-url-type": string,          // 当前选中的 URL 类型（URL 或 'custom'）
  "ai-url-custom": string,        // 自定义 URL（当 ai-url-type = 'custom' 时使用）
  "ai-url-list": string           // AI 地址列表（每行：名称|URL）
}
```

### AI 地址列表格式

```
豆包AI|https://www.doubao.com/chat/
Kimi|https://kimi.moonshot.cn/
密塔搜索|https://metaso.cn/
DeepSeek|https://chat.deepseek.com/
ChatGPT|https://chatgpt.com/
Claude|https://claude.ai/
文心一言|https://yiyan.baidu.com/
通义千问|https://tongyi.aliyun.com/qianwen/
智谱清言|https://chatglm.cn/
Copilot|https://copilot.microsoft.com/
自定义|custom
```

## 设置体验优化

### 动态表单

- **条件显示**：只有选择「自定义」时才显示自定义地址输入框
- **友好提示**：添加 Emoji 图标和详细的使用说明
- **即时反馈**：输入框带有 placeholder 提示

### 默认 AI 服务列表

内置 10+ 主流 AI 服务：
- 🇨🇳 国内：豆包AI、Kimi、密塔搜索、DeepSeek、文心一言、通义千问、智谱清言
- 🌍 国际：ChatGPT、Claude、Copilot
- ⚙️ 自定义：支持添加任何 AI 网站

## 使用场景

### 1. 初始化

```typescript
const m_ai = new M_ai(plugin);
await m_ai.init(settingdata);
```

- 创建 webview dock
- 生成下拉菜单（基于 `ai-url-list`）
- 加载默认 URL（基于 `ai-url-type`）
- 绑定切换事件

### 2. 切换 AI 网站

用户在下拉菜单中选择不同的 AI 网站：
1. 触发 `change` 事件
2. 获取新的 URL
3. 更新 webview/iframe
4. 保存设置到 `steveTools.json`

### 3. 更新设置

用户在设置面板修改配置后：
1. 调用 `updateSettings(settingdata)`
2. 重新生成下拉选项（如果列表变化）
3. 更新选中值
4. 如果 URL 变化，更新 webview

## 重构改进

### 之前的问题

1. **字段不统一**：设置面板用 `ai-url-type`，模块内用 `ai-url`
2. **重复代码**：解析逻辑在多处重复
3. **可维护性差**：长函数、内联逻辑、缺少抽象
4. **命名混乱**：注释和实际行为不一致

### 重构优化

1. **统一字段命名**
   - 移除 `ai-url`，统一使用 `ai-url-type`
   - 保留 `ai-url-custom` 用于存储自定义地址

2. **提取工具函数**
   - 创建 `ai-utils.ts` 封装通用逻辑
   - 函数职责单一，易于测试

3. **简化代码结构**
   - 拆分私有方法：`getDockContainer()`、`updateSelectOptions()`、`bindSelectChangeEvent()`
   - 移除内联函数，提高可读性

4. **改进错误处理**
   - 统一的 try-catch 结构
   - 有意义的错误日志

## 扩展指南

### 添加新的 AI 网站

在设置面板的"AI 地址列表"中添加新行：

```
新AI名称|https://new-ai-site.com/
```

保存后，下拉菜单会自动更新。

### 自定义样式

修改 `injectCSS` 参数：

```typescript
injectCSS: `
  #${this.dockContainerId}-btns { 
    /* 自定义按钮容器样式 */ 
  }
  #${this.dockContainerId}-btns select { 
    /* 自定义下拉样式 */ 
  }
`
```

### 添加额外功能

在 `buttons` 数组中添加新按钮：

```typescript
buttons: [
  { /* AI 切换下拉 */ },
  {
    id: 'newButton',
    text: '新功能',
    title: '描述',
    style: 'padding: 4px;'
  }
]
```

## 注意事项

1. **异步初始化**：dock 创建是异步的，使用 300ms 延时绑定事件
2. **数据持久化**：所有设置变更都需调用 `plugin.saveData('steveTools.json', settingdata)`
3. **兼容性**：同时支持 webview 和 iframe，优先使用 webview
4. **默认值**：确保 `aiDefaults` 与实际字段保持一致
