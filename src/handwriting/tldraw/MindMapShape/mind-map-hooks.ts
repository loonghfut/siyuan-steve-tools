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
import { parseMarkdownToMindMap, exportMindMapToMarkdown } from './mind-map-markdown'

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

    // 当编辑文本发生变化时，实时更新 shape 的文本以触发布局变化
    const handleEditTextChange = useCallback((text: string) => {
        setEditText(text)
        if (editingNodeId) {
            const newRoot = deepCloneRootNode(rootNode)
            updateNodeText(newRoot, editingNodeId, text)
            updateShape(newRoot, editingNodeId)
        }
    }, [editingNodeId, rootNode, updateShape])

    return {
        editingNodeId,
        editText,
        setEditText,
        handleEditTextChange,
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
    const [colorPickerPos, setColorPickerPos] = useState<{ x: number; y: number; alignRight?: boolean } | null>(null)

    const handleContextMenu = useCallback((
        nodeId: string, 
        nodeX: number, 
        nodeY: number, 
        _nodeWidth: number, 
        nodeHeight: number, 
        e: React.MouseEvent
    ) => {
        e.stopPropagation()
        e.preventDefault()
        
        // 先选中节点
        const newRoot = deepCloneRootNode(rootNode)
        updateShape(newRoot, nodeId)
        
        // 设置颜色选择器位置，传入节点右边缘位置用于判断是否需要左对齐
        setColorPickerNodeId(nodeId)
        setColorPickerPos({ 
            x: nodeX, 
            y: nodeY - nodeHeight / 2,
            alignRight: false // 默认右侧显示，会在渲染时根据边界调整
        })
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

// ===== 上下文菜单 Hook =====

export interface ContextMenuState {
    nodeId: string | null
    position: { x: number; y: number } | null
    isRootNode: boolean
}

export const useContextMenu = (
    rootNode: MindMapNode,
    updateShape: (newRootNode: MindMapNode, newSelectedId?: string) => void,
    replaceRootNode?: (newRootNode: MindMapNode) => void,
    // startEdit: optional callback to set editing state for a newly created node
    startEdit?: (nodeId: string, text?: string) => void,
    // confirm dialog callback: showConfirm(message, onConfirm)
    confirm?: (message: string, onConfirm: () => void) => void,
) => {
    const [menuState, setMenuState] = useState<ContextMenuState>({
        nodeId: null,
        position: null,
        isRootNode: false,
    })
    const [showColorPicker, setShowColorPicker] = useState(false)

    const openContextMenu = useCallback((
        nodeId: string, 
        nodeX: number, 
        nodeY: number, 
        _nodeWidth: number, 
        nodeHeight: number, 
        e: React.MouseEvent
    ) => {
        e.stopPropagation()
        e.preventDefault()
        
        // 先选中节点
        const newRoot = deepCloneRootNode(rootNode)
        updateShape(newRoot, nodeId)
        
        setMenuState({
            nodeId,
            position: { x: nodeX, y: nodeY - nodeHeight / 2 },
            isRootNode: nodeId === rootNode.id,
        })
        setShowColorPicker(false)
    }, [rootNode, updateShape])

    const closeContextMenu = useCallback(() => {
        setMenuState({ nodeId: null, position: null, isRootNode: false })
        setShowColorPicker(false)
    }, [])

    const handleAddChild = useCallback(() => {
        if (menuState.nodeId) {
            const newRoot = deepCloneRootNode(rootNode)
            const newNode = createMindMapNode('新节点')
            addChildNode(newRoot, menuState.nodeId, newNode)
            const parentNode = findNodeById(newRoot, menuState.nodeId)
            if (parentNode) parentNode.collapsed = false
            updateShape(newRoot, newNode.id)
            // 如果提供了 startEdit 回调，则进入编辑状态
            if (startEdit) {
                startEdit(newNode.id, newNode.text)
            }
        }
    }, [menuState.nodeId, rootNode, updateShape, startEdit])

    const handleAddSibling = useCallback(() => {
        if (menuState.nodeId && !menuState.isRootNode) {
            const newRoot = deepCloneRootNode(rootNode)
            const newNode = createMindMapNode('新节点')
            addSiblingNode(newRoot, menuState.nodeId, newNode)
            updateShape(newRoot, newNode.id)
        }
    }, [menuState.nodeId, menuState.isRootNode, rootNode, updateShape])

    const handleDelete = useCallback(() => {
        if (menuState.nodeId && !menuState.isRootNode) {
            const doDelete = () => {
                const newRoot = deepCloneRootNode(rootNode)
                const parent = findParentNode(newRoot, menuState.nodeId)
                deleteNodeById(newRoot, menuState.nodeId)
                updateShape(newRoot, parent?.id)
            }
            if (confirm) {
                confirm('确认删除此节点？', doDelete)
            } else {
                doDelete()
            }
        }
    }, [menuState.nodeId, menuState.isRootNode, rootNode, updateShape, confirm])

    const handlePasteMarkdown = useCallback(async () => {
        try {
            const text = await navigator.clipboard.readText()
            if (text && text.trim()) {
                const parsedNode = parseMarkdownToMindMap(text)
                const newRoot = deepCloneRootNode(rootNode)
                const targetId = menuState.nodeId || rootNode.id
                
                if (parsedNode.children.length === 0) {
                    const newNode = createMindMapNode(parsedNode.text)
                    addChildNode(newRoot, targetId, newNode)
                    updateShape(newRoot, newNode.id)
                } else {
                    for (const child of parsedNode.children) {
                        addChildNode(newRoot, targetId, child)
                    }
                    const targetNode = findNodeById(newRoot, targetId)
                    if (targetNode) targetNode.collapsed = false
                    updateShape(newRoot, targetId)
                }
            }
        } catch (err) {
            console.error('读取剪贴板失败:', err)
        }
    }, [menuState.nodeId, rootNode, updateShape])

    const handlePasteMarkdownReplace = useCallback(async () => {
        try {
            const text = await navigator.clipboard.readText()
            if (text && text.trim()) {
                const newRoot = parseMarkdownToMindMap(text)
                if (replaceRootNode) {
                    replaceRootNode(newRoot)
                } else {
                    updateShape(newRoot, newRoot.id)
                }
            }
        } catch (err) {
            console.error('读取剪贴板失败:', err)
        }
    }, [replaceRootNode, updateShape])

    const handleExportMarkdown = useCallback(async () => {
        const targetNode = menuState.nodeId 
            ? findNodeById(rootNode, menuState.nodeId) 
            : rootNode
        if (targetNode) {
            const markdown = exportMindMapToMarkdown(targetNode)
            try {
                await navigator.clipboard.writeText(markdown)
                // 可以添加提示
                console.log('已复制 Markdown 到剪贴板(标题格式)')
            } catch (err) {
                console.error('复制到剪贴板失败:', err)
            }
        }
    }, [menuState.nodeId, rootNode])

    const handleExportMarkdownList = useCallback(async () => {
        const targetNode = menuState.nodeId 
            ? findNodeById(rootNode, menuState.nodeId) 
            : rootNode
        if (targetNode) {
            const markdown = exportMindMapToMarkdown(targetNode, false) // 使用列表格式
            try {
                await navigator.clipboard.writeText(markdown)
                console.log('已复制 Markdown 到剪贴板(列表格式)')
            } catch (err) {
                console.error('复制到剪贴板失败:', err)
            }
        }
    }, [menuState.nodeId, rootNode])

    const handleOpenColorPicker = useCallback(() => {
        setShowColorPicker(true)
    }, [])

    const handleColorChange = useCallback((color: string | undefined) => {
        if (menuState.nodeId) {
            const newRoot = deepCloneRootNode(rootNode)
            updateNodeColor(newRoot, menuState.nodeId, color)
            updateShape(newRoot, menuState.nodeId)
        }
        closeContextMenu()
    }, [menuState.nodeId, rootNode, updateShape, closeContextMenu])

    return {
        menuState,
        showColorPicker,
        openContextMenu,
        closeContextMenu,
        handleAddChild,
        handleAddSibling,
        handleDelete,
        handlePasteMarkdown,
        handlePasteMarkdownReplace,
        handleExportMarkdown,
        handleExportMarkdownList,
        handleOpenColorPicker,
        handleColorChange,
    }
}

// ===== 键盘事件 Hook =====

export const useKeyboardHandlers = (
    rootNode: MindMapNode,
    selectedNodeId: string | undefined,
    updateShape: (newRootNode: MindMapNode, newSelectedId?: string) => void,
    setEditingNodeId: (id: string | null) => void,
    setEditText: (text: string) => void,
    replaceRootNode?: (newRootNode: MindMapNode) => void,
    confirm?: (message: string, onConfirm: () => void) => void
) => {
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        // Ctrl+Shift+V: 从 Markdown 粘贴并替换整个思维导图
        if (e.ctrlKey && e.shiftKey && e.key === 'V') {
            e.preventDefault()
            e.stopPropagation()
            
            navigator.clipboard.readText().then(text => {
                if (text && text.trim()) {
                    try {
                        const newRoot = parseMarkdownToMindMap(text)
                        if (replaceRootNode) {
                            replaceRootNode(newRoot)
                        } else {
                            updateShape(newRoot, newRoot.id)
                        }
                    } catch (error) {
                        console.error('解析 Markdown 失败:', error)
                    }
                }
            }).catch(err => {
                console.error('读取剪贴板失败:', err)
            })
            return
        }

        // Ctrl+V: 粘贴 Markdown 作为选中节点的子节点
        if (e.ctrlKey && !e.shiftKey && e.key === 'v') {
            e.preventDefault()
            e.stopPropagation()
            
            navigator.clipboard.readText().then(text => {
                if (text && text.trim()) {
                    try {
                        const parsedNode = parseMarkdownToMindMap(text)
                        const newRoot = deepCloneRootNode(rootNode)
                        const targetId = selectedNodeId || rootNode.id
                        
                        // 将解析出的节点添加到选中节点（或根节点）下
                        // 如果解析结果只有根节点文本没有子节点，则直接添加一个节点
                        if (parsedNode.children.length === 0) {
                            const newNode = createMindMapNode(parsedNode.text)
                            addChildNode(newRoot, targetId, newNode)
                            updateShape(newRoot, newNode.id)
                        } else {
                            // 将解析结果的所有子节点添加到目标节点下
                            for (const child of parsedNode.children) {
                                addChildNode(newRoot, targetId, child)
                            }
                            // 确保父节点展开
                            const targetNode = findNodeById(newRoot, targetId)
                            if (targetNode) targetNode.collapsed = false
                            updateShape(newRoot, targetId)
                        }
                    } catch (error) {
                        console.error('解析 Markdown 失败:', error)
                    }
                }
            }).catch(err => {
                console.error('读取剪贴板失败:', err)
            })
            return
        }

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
                // 进入编辑状态
                setEditingNodeId(newNode.id)
                setEditText(newNode.text)
                break
            }
            case 'Enter': {
                e.preventDefault()
                if (selectedNodeId === rootNode.id) {
                    const newNode = createMindMapNode('新节点')
                    addChildNode(newRoot, selectedNodeId, newNode)
                    updateShape(newRoot, newNode.id)
                    // 进入编辑状态（为根节点添加子节点）
                    setEditingNodeId(newNode.id)
                    setEditText(newNode.text)
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
                        const doDelete = () => {
                            const parent = findParentNode(newRoot, selectedNodeId)
                            deleteNodeById(newRoot, selectedNodeId)
                            updateShape(newRoot, parent?.id)
                        }
                        if (confirm) {
                            confirm('确认删除此节点？', doDelete)
                        } else {
                            doDelete()
                        }
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
    }, [selectedNodeId, rootNode, updateShape, setEditingNodeId, setEditText, replaceRootNode])

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
