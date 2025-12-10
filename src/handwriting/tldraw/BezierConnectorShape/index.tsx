// 类型导出
export * from './bezier-connector-types'

// 形状工具类
export { BezierConnectorShapeUtil, getConnectorTerminals } from './BezierConnectorShapeUtil'

// 绑定工具类
export {
	BezierConnectorBindingUtil,
	getConnectorBindings,
	getConnectorBindingPositionInPageSpace,
	createOrUpdateConnectorBinding,
	removeConnectorBinding,
	getShapeConnections,
} from './bezier-connector-binding'
export type { ConnectorBinding, ConnectorBindings } from './bezier-connector-binding'

// 端口工具 - 形状端口 (无循环依赖)
export {
	getShapePorts,
	getPortPagePosition,
	isConnectableShape,
	CONNECTABLE_SHAPE_TYPES,
} from './shape-ports'

// 端口工具 - 位置查找
export {
	getPortAtPoint,
} from './port-utils'

// 端口状态
export {
	getPortState,
	updatePortState,
	resetPortState,
} from './port-state'
export type { PortState } from './port-state'

// 端口组件
export { Port, PortsOverlay } from './Port'

// 交互状态机
export { PointingPort } from './PointingPort'

// 工具函数
export { keepConnectorsAtBottom } from './keep-connectors-at-bottom'
// Create and bind helper
export { createAndBindShape } from './createAndBindShape'
