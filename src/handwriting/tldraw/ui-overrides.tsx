/**
 * UI Overrides - 兼容入口
 *
 * 此文件已重构，代码已拆分到 ui-overrides/ 目录下的多个模块中：
 * - ui-overrides/types.ts - 类型定义和 TLEventMap 扩展
 * - ui-overrides/overrides.ts - uiOverrides 对象（tools, actions）
 * - ui-overrides/panel-state.ts - 全局面板状态管理
 * - ui-overrides/components.ts - TLComponents 配置
 * - ui-overrides/components/ - 各个 UI 组件
 *
 * 各形状相关的样式面板逻辑已移至对应形状文件夹：
 * - CardShape/CardStyleSection.tsx
 * - SingleBlockShape/SingleBlockStyleSection.tsx
 * - SlideShape/SlideStyleSection.tsx
 * - JsShape/JsShapeStyleSection.tsx
 * - MindMapShape/MindMapStyleSection.tsx
 * - MindMapShape/MindMapBindingUI.tsx
 * - BezierConnectorShape/BezierConnectorStyleSection.tsx
 */

// 重新导出所有内容以保持向后兼容
export * from './ui-overrides/index'
