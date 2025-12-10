import { atom, Atom, Editor, TLShapeId } from '@tldraw/tldraw'
import { PortIdentifier, PortTerminal } from './bezier-connector-types'

/**
 * 端口 UI 状态
 */
export interface PortState {
	/** 当前正在指向的端口（鼠标悬停或拖拽到达） */
	hintingPort: PortIdentifier | null
	/** 可连接的端口条件 */
	eligiblePorts:
		| {
			  // 现在 terminal 可选；为 undefined 则表示允许任意端口类型
			    terminal?: PortTerminal
			  excludeShapeIds: Set<TLShapeId> | null
		  }
		| null
			/** 最近成功连接的端口，用于展示一次性的视觉反馈 */
			flashPort: PortIdentifier | null
			/** 用于高亮某个 connector（拖拽时 match 到端口时设置） */
			highlightConnectorId: TLShapeId | null
			/** 用于短暂高亮整条 connector（绑定创建/更新时设置） */
			flashConnectorId: TLShapeId | null
}

/**
 * 使用 WeakMap 存储每个 Editor 实例的状态
 */
const portStateAtoms = new WeakMap<Editor, Atom<PortState>>()

/**
 * 获取端口状态 Atom
 */
export function getPortStateAtom(editor: Editor): Atom<PortState> {
	let stateAtom = portStateAtoms.get(editor)
	if (!stateAtom) {
		stateAtom = atom<PortState>('port state', {
			hintingPort: null,
			eligiblePorts: null,
			flashPort: null,
			highlightConnectorId: null,
			flashConnectorId: null,
		})
		portStateAtoms.set(editor, stateAtom)
	}
	return stateAtom
}

/**
 * 获取当前端口状态
 */
export function getPortState(editor: Editor): PortState {
	return getPortStateAtom(editor).get()
}

/**
 * 更新端口状态
 */
export function updatePortState(editor: Editor, update: Partial<PortState>) {
	const stateAtom = getPortStateAtom(editor)
	stateAtom.set({
		...stateAtom.get(),
		...update,
	})
}

/**
 * 设置 eligiblePorts（仅在发生变化时）以避免不必要的原子更新
 */
export function setEligiblePortsIfChanged(editor: Editor, value: PortState['eligiblePorts']) {
	const stateAtom = getPortStateAtom(editor)
	const prev = stateAtom.get().eligiblePorts
	if (prev === value) return
	// 对 Set 内容做浅相等比较
	if (prev && value) {
		if (prev.terminal === value.terminal) {
			const prevShapes = prev.excludeShapeIds
			const valueShapes = value.excludeShapeIds
			if (prevShapes === valueShapes) return
			if (prevShapes && valueShapes && prevShapes.size === valueShapes.size) {
				let same = true
				valueShapes.forEach((id) => {
					if (!prevShapes.has(id)) same = false
				})
				if (same) return
			}
		}
	}

	stateAtom.set({
		...stateAtom.get(),
		eligiblePorts: value,
	})
}

/**
 * 设置 hintingPort（仅在发生变化时）
 */
export function setHintingPortIfChanged(editor: Editor, hint: PortState['hintingPort']) {
	const stateAtom = getPortStateAtom(editor)
	const prev = stateAtom.get().hintingPort
	const same = (!prev && !hint) || (prev && hint && prev.portId === hint.portId && prev.shapeId === hint.shapeId)
	if (same) return
	stateAtom.set({
		...stateAtom.get(),
		hintingPort: hint,
	})
}

export function setHighlightConnectorIfChanged(editor: Editor, connectorId: TLShapeId | null) {
	const stateAtom = getPortStateAtom(editor)
	const prev = stateAtom.get().highlightConnectorId
	if (prev === connectorId) return
	stateAtom.set({
		...stateAtom.get(),
		highlightConnectorId: connectorId,
	})
}

/**
 * 设置 flashPort 与 flashConnectorId（仅在变化时），并可指定自动清除时间
 */
export function setFlashWithConnectorIfChanged(
	editor: Editor,
	flashPort: PortState['flashPort'],
	flashConnectorId: TLShapeId | null,
	durationMs: number | null = 350
) {
	const stateAtom = getPortStateAtom(editor)
	const prev = stateAtom.get()
	const samePort = (!prev.flashPort && !flashPort) || (prev.flashPort && flashPort && prev.flashPort.portId === flashPort.portId && prev.flashPort.shapeId === flashPort.shapeId)
	const sameConn = prev.flashConnectorId === flashConnectorId
	if (samePort && sameConn) return
	stateAtom.set({
		...prev,
		flashPort,
		flashConnectorId,
	})
	if (durationMs && (flashPort || flashConnectorId)) {
		setTimeout(() => {
			const s = getPortStateAtom(editor)
			s.set({
				...s.get(),
				flashPort: null,
				flashConnectorId: null,
			})
		}, durationMs)
	}
}

export function clearFlashIfChanged(editor: Editor) {
	const stateAtom = getPortStateAtom(editor)
	const prev = stateAtom.get()
	if (!prev.flashPort && !prev.flashConnectorId) return
	stateAtom.set({
		...prev,
		flashPort: null,
		flashConnectorId: null,
	})
}

/**
 * 重置端口状态
 */
export function resetPortState(editor: Editor) {
	const stateAtom = getPortStateAtom(editor)
	stateAtom.set({
		hintingPort: null,
		eligiblePorts: null,
		flashPort: null,
		highlightConnectorId: null,
		flashConnectorId: null,
	})
}
