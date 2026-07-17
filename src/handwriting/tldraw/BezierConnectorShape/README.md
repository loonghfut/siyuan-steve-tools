# 贝塞尔连接器 (Bezier Connector) 使用文档

本模块实现了 Card 和 SingleBlock 形状之间的贝塞尔曲线连接系统。

## 功能概述

- ✅ 在形状左右两侧显示连接端口
- ✅ 通过拖拽端口创建贝塞尔曲线连接
- ✅ 支持连接绑定，自动跟随形状移动
- ✅ 平滑的三次贝塞尔曲线绘制
- ✅ 连接线保持在形状底层

## 使用方式

### 创建连接

1. 将鼠标移动到任意 Card 或 SingleBlock 形状上
2. 形状的左右两侧会显示小圆点（端口）
   - 左侧端口：输入端口（用作连接的终点）
   - 右侧端口：输出端口（用作连接的起点）
3. 点击并拖拽一个端口
4. 将线拖到目标形状上：
   - **拖到形状任意位置**即可连接（自动选择最合适的一侧，之后随形状相对位置自动换边）
   - **精确拖到某个端口**则锁定该端口
5. 松开鼠标完成连接

> 端口在形状上出现前的悬停延时可在画板设置中调整，默认值为 300ms。
> 同一对形状之间已有连接时，再次拖拽连接会被跳过并提示。

### 自动端口（auto）

绑定的 `portId` 可以为 `'auto'`：渲染时按两个形状的相对位置动态解析为
`input / output / top / bottom`，移动形状时连线自动从合理的一侧进出。
拖到形状本体（非精确端口）产生的绑定、以及"连接模式"批量连线默认使用 auto。

### 编辑连接

- **移动连接端点**：选中连接线，拖拽端点手柄到新位置
- **重新绑定**：将端点拖拽到另一个形状的端口上
- **删除连接**：选中连接线后按 Delete 键

## 文件结构

```
BezierConnectorShape/
├── index.tsx                     # 导出索引
├── bezier-connector-types.tsx    # 类型定义
├── bezier-connector-props.tsx    # 属性验证器
├── bezier-connector-migrations.tsx # 数据迁移
├── BezierConnectorShapeUtil.tsx  # 形状工具类
├── bezier-connector-binding.tsx  # 绑定系统
├── port-utils.tsx                # 端口工具函数
├── port-state.tsx                # 端口状态管理
├── Port.tsx                      # 端口组件
├── PointingPort.tsx              # 交互状态机
└── keep-connectors-at-bottom.tsx # 层级管理
```

## API 参考

### 类型

```typescript
// 贝塞尔连接器形状
type IBezierConnectorShape = TLBaseShape<'bezier-connector', {
  start: VecModel    // 起点坐标
  end: VecModel      // 终点坐标
  color: string      // 线条颜色
  strokeWidth: number // 线条宽度
}>

// 端口定义
interface ShapePort extends VecModel {
  id: string
  terminal: 'start' | 'end'  // start=输出, end=输入
}
```

### 导出函数

```typescript
// 获取形状的端口
getShapePorts(editor, shape) => Record<string, ShapePort> | null

// 获取连接的绑定
getConnectorBindings(editor, connector) => ConnectorBindings

// 创建或更新绑定
createOrUpdateConnectorBinding(editor, connector, targetId, props)

// 移除绑定
removeConnectorBinding(editor, connector, terminal)

// 获取形状关联的连接
getShapeConnections(editor, shapeId) => Array<{connectionId, ownPortId, terminal}>
```

## 自定义样式

端口样式可在 `custom-tldraw.css` 中修改：

```css
.bezier-connector-port { ... }          /* 基础端口样式 */
.bezier-connector-port--input { ... }   /* 输入端口 */
.bezier-connector-port--output { ... }  /* 输出端口 */
.bezier-connector-port--hinting { ... } /* 悬停高亮 */
.bezier-connector-port--eligible { ... } /* 可连接状态 */
.BezierConnectorShape path { ... }       /* 连接线样式 */
```

## 扩展支持

端口相关的形状类型控制集中在 `shape-ports.tsx`：

- `PORT_SNAP_SHAPE_TYPES`：会渲染端口 overlay、参与"远距端口吸附"的形状
- `SHAPE_HIT_EXCLUDED_TYPES`：不作为形状级命中目标的类型（连接线、frame 等）
- `CONNECTOR_SHAPE_TYPES`：连接线类形状，自身不提供端口（防递归）

如需为其他形状添加端口支持，将其加入 `PORT_SNAP_SHAPE_TYPES`，
并确保该形状的 `ShapeUtil` 返回包含 `bounds` 的几何形状。
