/**
 * 全局面板状态管理
 * 管理素材库、文档大纲、子文档、搜索面板的开关状态
 */
import React from 'react'

// ============ 素材库面板状态 ============
let shapeLibraryOpenState = false
const shapeLibraryListeners: Set<(isOpen: boolean) => void> = new Set()

export function toggleShapeLibrary() {
    shapeLibraryOpenState = !shapeLibraryOpenState
    shapeLibraryListeners.forEach(listener => listener(shapeLibraryOpenState))
}

export function useShapeLibraryOpen() {
    const [isOpen, setIsOpen] = React.useState(shapeLibraryOpenState)

    React.useEffect(() => {
        shapeLibraryListeners.add(setIsOpen)
        return () => {
            shapeLibraryListeners.delete(setIsOpen)
        }
    }, [])

    return isOpen
}

// ============ 文档大纲面板状态 ============
let docOutlineOpenState = false
const docOutlineListeners: Set<(isOpen: boolean) => void> = new Set()
let currentDocId: string | null = null
const docIdListeners: Set<(docId: string | null) => void> = new Set()

export function toggleDocOutline() {
    docOutlineOpenState = !docOutlineOpenState
    docOutlineListeners.forEach(listener => listener(docOutlineOpenState))
}

export function setDocOutlineDocId(docId: string | null) {
    currentDocId = docId
    docIdListeners.forEach(listener => listener(currentDocId))
}

export function useDocOutlineOpen() {
    const [isOpen, setIsOpen] = React.useState(docOutlineOpenState)

    React.useEffect(() => {
        docOutlineListeners.add(setIsOpen)
        return () => {
            docOutlineListeners.delete(setIsOpen)
        }
    }, [])

    return isOpen
}

export function useDocOutlineDocId() {
    const [docId, setDocId] = React.useState<string | null>(currentDocId)

    React.useEffect(() => {
        docIdListeners.add(setDocId)
        return () => {
            docIdListeners.delete(setDocId)
        }
    }, [])

    return docId
}

// ============ 子文档面板状态 ============
let childDocsOpenState = false
const childDocsListeners: Set<(isOpen: boolean) => void> = new Set()

export function toggleChildDocs() {
    childDocsOpenState = !childDocsOpenState
    childDocsListeners.forEach(listener => listener(childDocsOpenState))
}

export function useChildDocsOpen() {
    const [isOpen, setIsOpen] = React.useState(childDocsOpenState)

    React.useEffect(() => {
        childDocsListeners.add(setIsOpen)
        return () => {
            childDocsListeners.delete(setIsOpen)
        }
    }, [])

    return isOpen
}

// ============ 搜索面板状态 ============
let searchPanelOpenState = false
const searchPanelListeners: Set<(isOpen: boolean) => void> = new Set()

export function toggleSearchPanel() {
    searchPanelOpenState = !searchPanelOpenState
    searchPanelListeners.forEach(listener => listener(searchPanelOpenState))
}

export function useSearchPanelOpen() {
    const [isOpen, setIsOpen] = React.useState(searchPanelOpenState)

    React.useEffect(() => {
        searchPanelListeners.add(setIsOpen)
        return () => {
            searchPanelListeners.delete(setIsOpen)
        }
    }, [])

    return isOpen
}
