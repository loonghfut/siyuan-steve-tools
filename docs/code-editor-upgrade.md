# JS Shape 代码编辑器升级

## 改进内容

将原有的简单 `<textarea>` 升级为功能完善的 **CodeMirror 6** 编辑器。

## 新功能

### ✨ 代码编辑功能
- **语法高亮**：自动识别 JavaScript 语法并高亮显示
- **代码补全**：智能代码补全提示
- **括号匹配**：自动补全配对括号、引号等
- **行号显示**：清晰的行号提示
- **代码折叠**：支持代码块折叠
- **多光标编辑**：支持多光标同时编辑（Alt+点击）

### ⌨️ 快捷键
- `Ctrl+S` / `Cmd+S`：保存并运行脚本
- `Tab`：缩进（支持选中多行缩进）
- `Shift+Tab`：取消缩进
- `Ctrl+/` / `Cmd+/`：注释/取消注释
- `Ctrl+D` / `Cmd+D`：选择下一个匹配项
- `Ctrl+F` / `Cmd+F`：查找
- `Ctrl+Z` / `Cmd+Z`：撤销
- `Ctrl+Shift+Z` / `Cmd+Shift+Z`：重做

### 🎨 主题支持
- 自动适配思源笔记的明暗主题
- 明亮模式：清爽的浅色主题
- 暗黑模式：护眼的深色主题（OneDark）
- 高对比度模式：新增“高对比度”主题，采用黑色背景和高对比配色，便于弱视或视觉敏感用户阅读

### 🔁 主题切换
- 编辑器工具栏新增主题切换按钮：浅色 / 深色 / 高对比度，选择会保存在本地（localStorage），并在后续打开时恢复。

### 🔧 其他改进
- 更好的滚动性能
- 优化的字体渲染（等宽字体）
- 实时保存编辑内容
- 响应式布局，编辑器自适应高度

## 技术栈

- **CodeMirror 6**：现代化的代码编辑器框架
- **React 19**：使用 React 组件封装
- **@codemirror/lang-javascript**：JavaScript 语言支持
- **@codemirror/theme-one-dark**：暗黑主题

## 使用方法

使用方式与之前完全相同：
1. 点击 JS 形状的"编辑脚本"按钮
2. 在新的 CodeMirror 编辑器中编写代码
3. 按 `Ctrl+S` 或点击"保存并运行"按钮

## 文件变更

- **新增**：`src/handwriting/tldraw/JsShape/CodeEditor.tsx` - CodeMirror 编辑器组件
- **修改**：`src/handwriting/tldraw/JsShape/JsShapeUtil.tsx` - 集成 CodeMirror 编辑器
