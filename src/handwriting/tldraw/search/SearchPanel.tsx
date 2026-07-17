/**
 * 画布文本搜索面板组件
 * 搜索当前页面形状的文本内容，点击结果跳转并聚焦对应形状
 * 面板结构、拖拽与事件处理逻辑与素材库面板保持一致
 */
import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
    track,
    useEditor,
    TldrawUiButton,
    TldrawUiIcon,
} from '@tldraw/tldraw'
import { focusAgentShapesById } from '../agent/tools/internal/core/camera'
import { searchShapes, loadBlockContents, type SearchResultItem } from './search-text'
import {
    getSearchPanelDefaultPos,
    loadSearchPanelPosition,
    saveSearchPanelPosition,
} from './search-panel-manager'

interface SearchPanelProps {
    isOpen: boolean
    onClose: () => void
}

const SearchLogo = () => (
    <svg className="search-panel__logo" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M8.8 3.2a5.6 5.6 0 1 0 3.48 9.99l3.01 3.01 1.06-1.06-3.01-3.01A5.6 5.6 0 0 0 8.8 3.2Zm0 1.5a4.1 4.1 0 1 1 0 8.2 4.1 4.1 0 0 1 0-8.2Z" />
    </svg>
)

/**
 * 搜索面板组件
 */
export const SearchPanel = track(({ isOpen, onClose }: SearchPanelProps) => {
    const editor = useEditor()
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<SearchResultItem[]>([])
    const [activeIndex, setActiveIndex] = useState(0)
    const [deepLoading, setDeepLoading] = useState(false)
    const [deepLoaded, setDeepLoaded] = useState(false)
    const blockCacheRef = useRef<Map<string, string> | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const panelRef = useRef<HTMLDivElement | null>(null)
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
    const draggingRef = useRef(false)
    const dragStartRef = useRef({ startX: 0, startY: 0, origLeft: 0, origTop: 0 })

    // 打开时初始化位置（如果尚未设置），使用插件存储的文件
    useEffect(() => {
        if (isOpen) {
            (async () => {
                try {
                    if (!pos) {
                        const saved = await loadSearchPanelPosition()
                        setPos(saved || getSearchPanelDefaultPos())
                    }
                } catch (err) {
                    setPos({ left: 40, top: 60 })
                }
            })()
        }
    }, [isOpen])

    // 监听位置重置事件，重置面板位置
    useEffect(() => {
        const handler = (e: Event | any) => {
            const detail = e?.detail as { left?: number; top?: number } | undefined
            if (detail && typeof detail.left === 'number' && typeof detail.top === 'number') {
                setPos({ left: detail.left, top: detail.top })
            } else {
                setPos(getSearchPanelDefaultPos())
            }
        }
        window.addEventListener('searchPanel:posReset', handler as EventListener)
        return () => window.removeEventListener('searchPanel:posReset', handler as EventListener)
    }, [])

    // 防抖搜索
    useEffect(() => {
        if (!isOpen) return
        const timer = setTimeout(() => {
            const q = query.trim()
            if (!q) {
                setResults([])
                setActiveIndex(0)
                return
            }
            setResults(searchShapes(editor, editor.getCurrentPageShapes(), q, blockCacheRef.current ?? undefined))
            setActiveIndex(0)
        }, 200)
        return () => clearTimeout(timer)
    }, [query, isOpen, editor, deepLoaded])

    // 打开时聚焦输入框
    useEffect(() => {
        if (isOpen) {
            inputRef.current?.focus()
            inputRef.current?.select()
        }
    }, [isOpen])

    // 关闭时清理深度搜索缓存
    useEffect(() => {
        if (!isOpen) {
            blockCacheRef.current = null
            setDeepLoaded(false)
        }
    }, [isOpen])

    // 拖拽相关处理
    const stopDragging = useCallback(() => {
        draggingRef.current = false
        // 保存位置到插件存储（异步）
        if (pos) {
            void saveSearchPanelPosition(pos)
        }
        window.removeEventListener('mousemove', onMouseMove as any, true)
        window.removeEventListener('mouseup', onMouseUp as any, true)
        window.removeEventListener('touchmove', onTouchMove as any, true)
        window.removeEventListener('touchend', onTouchEnd as any, true)
    }, [pos])

    // 阻止面板滚动冒泡到画布（防止画布随面板滚动）
    const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        e.stopPropagation()
    }, [])
    const handleWheelCapture = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        // 在捕获阶段停止传播，防止 canvas 在捕获阶段接收到事件
        e.stopPropagation()
    }, [])

    const handleContentTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        // 仅阻止冒泡，允许默认滚动行为在当前容器内执行
        e.stopPropagation()
    }, [])
    const handleTouchStartCapture = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        e.stopPropagation()
    }, [])
    const handleTouchMoveCapture = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        e.stopPropagation()
    }, [])

    const onMouseMove = useCallback((ev: MouseEvent) => {
        if (!draggingRef.current) return
        const dx = ev.clientX - dragStartRef.current.startX
        const dy = ev.clientY - dragStartRef.current.startY
        setPos({ left: Math.max(8, dragStartRef.current.origLeft + dx), top: Math.max(8, dragStartRef.current.origTop + dy) })
    }, [])

    const onMouseUp = useCallback(() => {
        stopDragging()
    }, [stopDragging])

    const onTouchMove = useCallback((ev: TouchEvent) => {
        if (!draggingRef.current) return
        const t = ev.touches[0]
        const dx = t.clientX - dragStartRef.current.startX
        const dy = t.clientY - dragStartRef.current.startY
        setPos({ left: Math.max(8, dragStartRef.current.origLeft + dx), top: Math.max(8, dragStartRef.current.origTop + dy) })
    }, [])

    const onTouchEnd = useCallback(() => {
        stopDragging()
    }, [stopDragging])

    const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
        e.stopPropagation()
        e.preventDefault()
        draggingRef.current = true
        dragStartRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origLeft: pos?.left ?? 40,
            origTop: pos?.top ?? 60,
        }
        window.addEventListener('mousemove', onMouseMove as any, true)
        window.addEventListener('mouseup', onMouseUp as any, true)
    }, [pos, onMouseMove, onMouseUp])

    const handleHeaderTouchStart = useCallback((e: React.TouchEvent) => {
        e.stopPropagation()
        e.preventDefault()
        draggingRef.current = true
        const t = e.touches[0]
        dragStartRef.current = {
            startX: t.clientX,
            startY: t.clientY,
            origLeft: pos?.left ?? 40,
            origTop: pos?.top ?? 60,
        }
        window.addEventListener('touchmove', onTouchMove as any, true)
        window.addEventListener('touchend', onTouchEnd as any, true)
    }, [pos, onTouchMove, onTouchEnd])

    const jumpTo = useCallback((item: SearchResultItem) => {
        if (!editor.getShape(item.shapeId)) return
        editor.select(item.shapeId)
        focusAgentShapesById(editor, [item.shapeId], { force: true })
    }, [editor])

    const goNext = useCallback(() => {
        if (!results.length) return
        setActiveIndex((prev) => {
            const next = (prev + 1) % results.length
            jumpTo(results[next])
            return next
        })
    }, [results, jumpTo])

    const goPrev = useCallback(() => {
        if (!results.length) return
        setActiveIndex((prev) => {
            const next = (prev - 1 + results.length) % results.length
            jumpTo(results[next])
            return next
        })
    }, [results, jumpTo])

    // 深度搜索：加载卡片/单块关联的思源块内容后重新搜索
    const handleDeepSearch = useCallback(async () => {
        if (deepLoading) return
        setDeepLoading(true)
        try {
            blockCacheRef.current = await loadBlockContents(editor.getCurrentPageShapes())
            setDeepLoaded(true)
        } finally {
            setDeepLoading(false)
        }
    }, [editor, deepLoading])

    const handleInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        // 防止按键泄漏到画布触发工具快捷键
        e.stopPropagation()
        if (e.key === 'Enter') {
            e.preventDefault()
            if (e.shiftKey) {
                goPrev()
            } else {
                goNext()
            }
        } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
        }
    }, [goNext, goPrev, onClose])

    if (!isOpen) return null

    const renderSnippet = (item: SearchResultItem) => {
        const before = item.snippet.slice(0, item.matchStart)
        const match = item.snippet.slice(item.matchStart, item.matchStart + item.matchLength)
        const after = item.snippet.slice(item.matchStart + item.matchLength)
        return (
            <span className="search-panel__item-snippet" title={item.snippet}>
                {before}
                <mark>{match}</mark>
                {after}
            </span>
        )
    }

    return (
        <div
            ref={panelRef}
            className="search-panel"
            style={{
                position: 'fixed',
                top: pos ? `${pos.top}px` : '60px',
                left: pos ? `${pos.left}px` : undefined,
                maxHeight: 'calc(100vh - 120px)',
                zIndex: 99999,
                pointerEvents: 'auto',
                // 阻止滚动链到父容器
                overscrollBehavior: 'contain',
            }}
            onWheelCapture={handleWheelCapture}
            onTouchStartCapture={handleTouchStartCapture}
            onTouchMoveCapture={handleTouchMoveCapture}
        >
            {/* 头部 */}
            <div
                className="search-panel__header"
                onMouseDown={handleHeaderMouseDown}
                onTouchStart={handleHeaderTouchStart}
            >
                <div className="search-panel__title-row">
                    <span className="search-panel__mark">
                        <SearchLogo />
                    </span>
                    <div className="search-panel__heading">
                        <span className="search-panel__count">
                            {query.trim() ? (results.length ? `${activeIndex + 1}/${results.length}` : '0 项') : ' '}
                        </span>
                    </div>
                    {/* 搜索框（放在标题后面） */}
                    <label
                        className="search-panel__search"
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                    >
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            onKeyDown={handleInputKeyDown}
                            onMouseDown={(e) => { e.stopPropagation() }}
                            onTouchStart={(e) => { e.stopPropagation() }}
                            placeholder="搜索画布文本"
                            title="搜索画布文本"
                        />
                        {query && (
                            <button
                                className="shape-library-icon-button shape-library-icon-button--ghost search-panel__search-clear"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    e.preventDefault()
                                    setQuery('')
                                    inputRef.current?.focus()
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                                title="清除搜索"
                                aria-label="清除搜索"
                            >
                                <TldrawUiIcon label="" icon="cross-2" small />
                            </button>
                        )}
                    </label>
                </div>
                <div
                    className="search-panel__actions"
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                >
                    <TldrawUiButton
                        type="icon"
                        className="shape-library-icon-button"
                        title="上一个 (Shift+Enter)"
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); goPrev() }}
                    >
                        <TldrawUiIcon label="" icon="chevron-up" small />
                    </TldrawUiButton>
                    <TldrawUiButton
                        type="icon"
                        className="shape-library-icon-button"
                        title="下一个 (Enter)"
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); goNext() }}
                    >
                        <TldrawUiIcon label="" icon="chevron-down" small />
                    </TldrawUiButton>
                    <TldrawUiButton
                        type="icon"
                        className="shape-library-icon-button"
                        title="关闭 (Esc)"
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); onClose() }}
                    >
                        <TldrawUiIcon label="" icon="cross-2" small />
                    </TldrawUiButton>
                </div>
            </div>

            {/* 内容区 */}
            {query.trim() && (
                <div
                    className="search-panel__content"
                    onWheel={handleWheel}
                    onTouchMove={handleContentTouchMove}
                    onTouchStart={(e) => { e.stopPropagation() }}
                    style={{
                        // 阻止滚动链（现代浏览器）
                        overscrollBehavior: 'contain',
                    }}
                >
                    {results.length === 0 ? (
                        <div className="search-panel__empty">
                            <SearchLogo />
                            <strong>未找到匹配内容</strong>
                            <span>{deepLoaded ? '尝试更改搜索关键词' : '卡片正文需点击下方深度搜索'}</span>
                        </div>
                    ) : (
                        results.map((item, i) => (
                            <button
                                key={item.shapeId}
                                className={`search-panel__item${i === activeIndex ? ' search-panel__item--active' : ''}`}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setActiveIndex(i)
                                    jumpTo(item)
                                }}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                <span className="search-panel__item-type">{item.typeLabel}</span>
                                {renderSnippet(item)}
                            </button>
                        ))
                    )}
                </div>
            )}

            {/* 底部：深度搜索卡片内容 */}
            <div className="search-panel__footer">
                {deepLoaded ? (
                    <span className="search-panel__footer-hint">
                        <TldrawUiIcon label="" icon="check" small />
                        已加载卡片正文
                    </span>
                ) : (
                    <button
                        className="search-panel__deep-button"
                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDeepSearch() }}
                        onMouseDown={(e) => e.stopPropagation()}
                        disabled={deepLoading}
                        title="加载卡片/单块关联的笔记内容后一并搜索"
                    >
                        {deepLoading ? '加载中...' : '深度搜索卡片内容'}
                    </button>
                )}
            </div>
        </div>
    )
})
