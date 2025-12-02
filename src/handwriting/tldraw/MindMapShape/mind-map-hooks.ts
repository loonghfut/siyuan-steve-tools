// ===== 思维导图 React Hooks =====

import React, { useCallback, useRef, useState } from 'react'
import {
    MindMapNode,
    createMindMapNode,
    findNodeById,
    findParentNode,
    deleteNodeById,
    addChildNode,
    addSiblingNode,
    updateNodeText,
    updateNodeColor,
    toggleNodeCollapse,
    moveNodeToParent,
    reorderNode,
} from './mind-map-shape-types'

// ===== 类型定义 =====

export interface DragState {
    draggingNodeId: string | null
    dropTargetId: string | null
    dropPosition: 'before' | 'after' | 'child' | null
}

export interface EditState {
    editingNodeId: string | null
    editText: string
}

export interface ColorPickerState {
    colorPickerNodeId: string | null
    colorPickerPos: { x: number; y: number } | null
}

// ===== 辅助函数 =====

/**
 * 深拷贝根节点
 */
export const deepCloneRootNode = (node: MindMapNode): MindMapNode => {
    return {
        ...node,
        children: node.children.map(deepCloneRootNode),
    }
}

// ===== 拖拽 Hook =====

export const useDragHandlers = (
    rootNode: MindMapNode,
    updateShape: (newRootNode: MindMapNode, newSelectedId?: string) => void
) => {
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
    const [dropTargetId, setDropTargetId] = useState<string | null>(null)
    const [dropPosition, setDropPosition] = useState<'before' | 'after' | 'child' | null>(null)
    const dragStartPos = useRef<{ x: number; y: number } | null>(null)

    const handleDragStart = useCallback((nodeId: string, e: React.PointerEvent) => {
        // 根节点不可拖拽
        if (nodeId === rootNode.id) return
        
        e.stopPropagation()
        dragStartPos.current = { x: e.clientX, y: e.clientY }
        setDraggingNodeId(nodeId)
    }, [rootNode.id])

    const handleDragMove = useCallback((targetNodeId: string, e: React.PointerEvent) => {
        if (!draggingNodeId || draggingNodeId === targetNodeId) return
        
        // 不能拖到自己的子节点上
        const draggingNode = findNodeById(rootNode, draggingNodeId)
        if (draggingNode) {
            const checkIsChild = (node: MindMapNode, targetId: string): boolean => {
                if (node.id === targetId) return true
                for (const child of node.children) {
                    if (checkIsChild(child, targetId)) return true
                }
                return false
            }
            if (checkIsChild(draggingNode, targetNodeId)) return
        }
        
        e.stopPropagation()
        setDropTargetId(targetNodeId)
        
        // 计算放置位置：上1/3为before，中1/3为child，下1/3为after
        const rect = (e.target as Element).getBoundingClientRect()
        const relativeY = e.clientY - rect.top
        const third = rect.height / 3
        
        if (relativeY < third) {
            setDropPosition('before')
        } else if (relativeY > third * 2) {
            setDropPosition('after')
        } else {
            setDropPosition('child')
        }
    }, [draggingNodeId, rootNode])

    const handleDragEnd = useCallback(() => {
        if (draggingNodeId && dropTargetId && dropPosition) {
            const newRoot = deepCloneRootNode(rootNode)
            
            if (dropPosition === 'child') {
                moveNodeToParent(newRoot, draggingNodeId, dropTargetId)
            } else {
                const targetParent = findParentNode(newRoot, dropTargetId)
                if (targetParent) {
                    const targetIndex = targetParent.children.findIndex(c => c.id === dropTargetId)
                    if (targetIndex !== -1) {
                        const insertIndex = dropPosition === 'before' ? targetIndex : targetIndex + 1
                        moveNodeToParent(newRoot, draggingNodeId, targetParent.id)
                        reorderNode(newRoot, draggingNodeId, insertIndex)
                    }
                } else if (dropTargetId === rootNode.id) {
                    moveNodeToParent(newRoot, draggingNodeId, rootNode.id)
                }
            }
            
            updateShape(newRoot, draggingNodeId)
        }
        
        setDraggingNodeId(null)
        setDropTargetId(null)
        setDropPosition(null)
        dragStartPos.current = null
    }, [draggingNodeId, dropTargetId, dropPosition, rootNode, updateShape])

    const handleDragCancel = useCallback(() => {
        setDraggingNodeId(null)
        setDropTargetId(null)
        setDropPosition(null)
        dragStartPos.current = null
    }, [])

    const clearDropTarget = useCallback(() => {
        setDropTargetId(null)
        setDropPosition(null)
    }, [])

    return {
        draggingNodeId,
        dropTargetId,
        dropPosition,
        handleDragStart,
        handleDragMove,
        handleDragEnd,
        handleDragCancel,
        clearDropTarget,
    }
}

// ===== 编辑 Hook =====

export const useEditHandlers = (
    rootNode: MindMapNode,
    updateShape: (newRootNode: MindMapNode, newSelectedId?: string) => void
) => {
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null)
    const [editText, setEditText] = useState('')

    const handleDoubleClick = useCallback((nodeId: string, text: string, e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        
        setEditingNodeId(nodeId)
        setEditText(text)
    }, [])

    const handleFinishEdit = useCallback(() => {
        if (editingNodeId && editText.trim()) {
            const newRoot = deepCloneRootNode(rootNode)
            updateNodeText(newRoot, editingNodeId, editText.trim())
            updateShape(newRoot, editingNodeId)
        }
        setEditingNodeId(null)
        setEditText('')
    }, [editingNodeId, editText, rootNode, updateShape])

    const handleCancelEdit = useCallback(() => {
        setEditingNodeId(null)
        setEditText('')
    }, [])

    return {
        editingNodeId,
        editText,
        setEditText,
        setEditingNodeId,
        handleDoubleClick,
        handleFinishEdit,
        handleCancelEdit,
    }
}

// ===== 颜色选择器 Hook =====

export const useColorPicker = (
    rootNode: MindMapNode,
    updateShape: (newRootNode: MindMapNode, newSelectedId?: string) => void
) => {
    const [colorPickerNodeId, setColorPickerNodeId] = useState<string | null>(null)
    const [colorPickerPos, setColorPickerPos] = useState<{ x: number; y: number } | null>(null)

    const handleContextMenu = useCallback((
        nodeId: string, 
        nodeX: number, 
        nodeY: number, 
        nodeWidth: number, 
        nodeHeight: number, 
        e: React.MouseEvent
    ) => {
        e.stopPropagation()
        e.preventDefault()
        
        // 先选中节点
        const newRoot = deepCloneRootNode(rootNode)
        updateShape(newRoot, nodeId)
        
        // 设置颜色选择器位置
        setColorPickerNodeId(nodeId)
        setColorPickerPos({ x: nodeX + nodeWidth / 2 + 8, y: nodeY - nodeHeight / 2 })
    }, [rootNode, updateShape])

    const handleColorChange = useCallback((color: string | undefined) => {
        if (colorPickerNodeId) {
            const newRoot = deepCloneRootNode(rootNode)
            updateNodeColor(newRoot, colorPickerNodeId, color)
            updateShape(newRoot, colorPickerNodeId)
        }
        setColorPickerNodeId(null)
        setColorPickerPos(null)
    }, [colorPickerNodeId, rootNode, updateShape])

    const closeColorPicker = useCallback(() => {
        setColorPickerNodeId(null)
        setColorPickerPos(null)
    }, [])

    return {
        colorPickerNodeId,
        colorPickerPos,
        handleContextMenu,
        handleColorChange,
        closeColorPicker,
    }
}

// ===== 键盘事件 Hook =====

export const useKeyboardHandlers = (
    rootNode: MindMapNode,
    selectedNodeId: string | undefined,
    updateShape: (newRootNode: MindMapNode, newSelectedId?: string) => void,
    setEditingNodeId: (id: string | null) => void,
    setEditText: (text: string) => void
) => {
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (!selectedNodeId) return
        
        e.stopPropagation()
        
        const newRoot = deepCloneRootNode(rootNode)
        
        switch (e.key) {
            case 'Tab': {
                e.preventDefault()
                const newNode = createMindMapNode('新节点')
                addChildNode(newRoot, selectedNodeId, newNode)
                const parentNode = findNodeById(newRoot, selectedNodeId)
                if (parentNode) parentNode.collapsed = false
                updateShape(newRoot, newNode.id)
                break
            }
            case 'Enter': {
                e.preventDefault()
                if (selectedNodeId === rootNode.id) {
                    const newNode = createMindMapNode('新节点')
                    addChildNode(newRoot, selectedNodeId, newNode)
                    updateShape(newRoot, newNode.id)
                } else {
                    const newNode = createMindMapNode('新节点')
                    addSiblingNode(newRoot, selectedNodeId, newNode)
                    updateShape(newRoot, newNode.id)
                }
                break
            }
            case 'Delete':
            case 'Backspace': {
                if (selectedNodeId !== rootNode.id) {
                    e.preventDefault()
                    const parent = findParentNode(newRoot, selectedNodeId)
                    deleteNodeById(newRoot, selectedNodeId)
                    updateShape(newRoot, parent?.id)
                }
                break
            }
            case ' ': {
                e.preventDefault()
                toggleNodeCollapse(newRoot, selectedNodeId)
                updateShape(newRoot, selectedNodeId)
                break
            }
            case 'F2': {
                e.preventDefault()
                const node = findNodeById(rootNode, selectedNodeId)
                if (node) {
                    setEditingNodeId(selectedNodeId)
                    setEditText(node.text)
                }
                break
            }
        }
    }, [selectedNodeId, rootNode, updateShape, setEditingNodeId, setEditText])

    return { handleKeyDown }
}

// ===== 节点选择 Hook =====

export const useNodeSelection = (
    rootNode: MindMapNode,
    updateShape: (newRootNode: MindMapNode, newSelectedId?: string) => void
) => {
    const handleSelectNode = useCallback((nodeId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        
        const newRoot = deepCloneRootNode(rootNode)
        updateShape(newRoot, nodeId)
    }, [rootNode, updateShape])

    const handleToggleCollapse = useCallback((nodeId: string, selectedNodeId?: string) => {
        const newRoot = deepCloneRootNode(rootNode)
        toggleNodeCollapse(newRoot, nodeId)
        updateShape(newRoot, selectedNodeId)
    }, [rootNode, updateShape])

    return { handleSelectNode, handleToggleCollapse }
}
