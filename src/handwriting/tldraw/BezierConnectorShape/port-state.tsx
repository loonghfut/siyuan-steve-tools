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
