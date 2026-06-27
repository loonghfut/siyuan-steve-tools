/**
 * UI Overrides 类型定义
 * 从 ui-overrides.tsx 提取的公共类型
 */
import type { TLShapeId } from '@tldraw/tldraw'
import type { ICardShape } from '../CardShape/card-shape-types'
import type { ISingleBlockShape } from '../SingleBlockShape/single-block-shape-types'
import type { IJsShape } from '../JsShape/js-shape-types'
import type { IBranchShape } from '../BranchShape/branch-shape-types'

// Extend the TLEventMap interface to include custom events
declare module '@tldraw/tldraw' {
    interface TLEventMap {
        'sttools:importData': () => void
        'sttools:backupData': () => void
        'sttools:exportData': () => void
        'sttools:rollbackData': () => void
        'sttools:pruneAssets': () => void
        'sttools:editJsShape': (shapeId?: TLShapeId) => void
        'sttools:rerunJsShape': (shapeId?: TLShapeId) => void
        'sttools:toggleShapeLibrary': () => void
        'sttools:addToShapeLibrary': () => void
    }
}

/** Card 或 SingleBlock 形状类型 */
export type CardLikeShape = ICardShape | ISingleBlockShape

/** 检查形状是否为 Card 或 SingleBlock */
export const isCardLikeShape = (shape: any): shape is CardLikeShape =>
    shape?.type === 'card' || shape?.type === 'single-block'

/** Card、SingleBlock 或 JsShape 形状类型 */
export type OverlayShape = CardLikeShape | IBranchShape | IJsShape

/** 检查形状是否为 Overlay 形状（Card、SingleBlock 或 JsShape） */
export const isOverlayShape = (shape: any): shape is OverlayShape =>
    isCardLikeShape(shape) || shape?.type === 'branch' || shape?.type === 'js-shape'
