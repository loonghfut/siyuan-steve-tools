/**
 * 文档大纲面板组件
 * 显示白板绑定文档的大纲，支持将块添加到白板
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    track,
    useEditor,
} from '@tldraw/tldraw';
import { api } from '@frostime/siyuan-plugin-kits';
import { openTab, showMessage } from 'siyuan';
import type { ICardShape } from '../CardShape/card-shape-types';
import { insertDocRelations } from './insert-doc-relations';
import { collectAllOutlineNodeIds, loadOutlineForDoc, type OutlineNode } from './doc-outline-data';

interface DocOutlinePanelProps {
    isOpen: boolean;
    onClose: () => void;
    docId: string | null; // 绑定的文档ID
    selectedMainCard: ICardShape | null;
}

function outlineNodeToRelationItem(node: OutlineNode): { blockId: string; children?: ReturnType<typeof outlineNodeToRelationItem>[] } {
    return {
        blockId: node.id,
        children: node.blocks?.map(outlineNodeToRelationItem),
    };
}

/**
 * 文档大纲面板组件
 */
export const DocOutlinePanel = track(({ isOpen, onClose, docId, selectedMainCard }: DocOutlinePanelProps) => {
    const editor = useEditor();
    const [outline, setOutline] = useState<OutlineNode[]>([]);
    const [loading, setLoading] = useState(false);
    const [insertingAll, setInsertingAll] = useState(false);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
    const draggingRef = useRef(false);
    const dragStartRef = useRef({ startX: 0, startY: 0, origLeft: 0, origTop: 0 });
    const contentRef = useRef<HTMLDivElement | null>(null);

    // 已添加到白板的块ID状态
    const [addedBlockIds, setAddedBlockIds] = useState<Set<string>>(new Set());

    // 查找指定 blockId 对应的 shape
    const findBlockShape = useCallback((blockId: string) => {
        const shapes = editor.getCurrentPageShapes();
        for (const shape of shapes) {
            const shapeAny = shape as any;
            if ((shape.type === 'card' || shape.type === 'single-block') &&
                shapeAny.props?.blockId === blockId) {
                return shape;
            }
        }
        return null;
    }, [editor]);

    // 检测块是否已添加到白板
    const isBlockInBoard = useCallback((blockId: string): boolean => {
        return addedBlockIds.has(blockId);
    }, [addedBlockIds]);

    const canInsertAll = Boolean(
        selectedMainCard &&
        docId &&
        selectedMainCard.props.blockId === docId &&
        outline.length > 0 &&
        !insertingAll
    );

    // 获取白板中指定 blockId 对应的 shape
    const getShapeByBlockId = useCallback((blockId: string) => {
        return findBlockShape(blockId);
    }, [findBlockShape]);

    // 收集所有已添加到白板的块ID
    const collectAddedBlockIds = useCallback(() => {
        const shapes = editor.getCurrentPageShapes();
        const addedIds = new Set<string>();
        for (const shape of shapes) {
            const shapeAny = shape as any;
            if ((shape.type === 'card' || shape.type === 'single-block') &&
                shapeAny.props?.blockId) {
                addedIds.add(shapeAny.props.blockId);
            }
        }
        return addedIds;
    }, [editor]);

    // 监听 shapes 变化，更新已添加块ID状态
    useEffect(() => {
        if (!isOpen) return;

        const updateAddedBlockIds = () => {
            setAddedBlockIds(collectAddedBlockIds());
        };

        updateAddedBlockIds();

        // 监听 shapes 变化
        const cleanup = editor.store.listen(() => {
            updateAddedBlockIds();
        }, { scope: 'document', source: 'user' });

        return () => {
            cleanup();
        };
    }, [isOpen, editor, collectAddedBlockIds]);

    // 加载文档大纲
    const loadOutline = useCallback(async (signal?: AbortSignal) => {
        if (!docId) {
            setOutline([]);
            return;
        }

        setLoading(true);
        try {
            const transformedOutline = await loadOutlineForDoc(docId, signal);
            if (signal?.aborted) return;
            setOutline(transformedOutline);

            const allIds = collectAllOutlineNodeIds(transformedOutline);
            setExpandedNodes(new Set(allIds));
        } catch (err) {
            if (signal?.aborted) return;
            console.error('加载文档大纲失败:', err);
            setOutline([]);
        } finally {
            if (!signal?.aborted) {
                setLoading(false);
            }
        }
    }, [docId]);

    // 初始化和监听更新
    useEffect(() => {
        if (isOpen && docId) {
            const controller = new AbortController();
            loadOutline(controller.signal);
            return () => controller.abort();
        }
    }, [isOpen, docId, loadOutline]);

    // 初始化位置
    useEffect(() => {
        if (isOpen) {
            (async () => {
                try {
                    if (!pos) {
                        const PANEL_POS_PATH = '/data/storage/petal/sttools/doc-outline-panel.json';
                        const data = await api.getFile(PANEL_POS_PATH);
                        if (data) {
                            let parsed: any = data;
                            if (typeof data === 'string') parsed = JSON.parse(data);
                            if (parsed && typeof parsed.left === 'number' && typeof parsed.top === 'number') {
                                setPos({ left: parsed.left, top: parsed.top });
                                return;
                            }
                        }
                        // 默认位置：在素材库面板右侧
                        const width = 260;
                        const left = Math.max(12, window.innerWidth - 320 - width);
                        setPos({ left, top: 60 });
                    }
                } catch (err) {
                    setPos({ left: 340, top: 60 });
                }
            })();
        }
    }, [isOpen, pos]);

    // 监听位置重置事件
    useEffect(() => {
        const handler = (e: Event | any) => {
            const detail = e?.detail as { left?: number; top?: number } | undefined;
            if (detail && typeof detail.left === 'number' && typeof detail.top === 'number') {
                setPos({ left: detail.left, top: detail.top });
            } else {
                const width = 260;
                const left = Math.max(12, window.innerWidth - 320 - width);
                setPos({ left, top: 60 });
            }
        };
        window.addEventListener('docOutline:posReset', handler as EventListener);
        return () => window.removeEventListener('docOutline:posReset', handler as EventListener);
    }, []);

    // 拖拽相关处理
    const stopDragging = useCallback(() => {
        draggingRef.current = false;
        (async () => {
            if (pos) {
                try {
                    const PANEL_POS_PATH = '/data/storage/petal/sttools/doc-outline-panel.json';
                    const jsonData = JSON.stringify(pos, null, 2);
                    const blob = new Blob([jsonData], { type: 'application/json' });
                    await api.putFile(PANEL_POS_PATH, false, blob);
                } catch (e) {
                    console.warn('保存文档大纲面板位置失败:', e);
                }
            }
        })();
        window.removeEventListener('mousemove', onMouseMove as any, true);
        window.removeEventListener('mouseup', onMouseUp as any, true);
    }, [pos]);

    const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        e.stopPropagation();
    }, []);

    const handleWheelCapture = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        e.stopPropagation();
    }, []);

    const handleContentTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        e.stopPropagation();
    }, []);

    const handleTouchStartCapture = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        e.stopPropagation();
    }, []);

    const handleTouchMoveCapture = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        e.stopPropagation();
    }, []);

    const onMouseMove = useCallback((ev: MouseEvent) => {
        if (!draggingRef.current) return;
        const clientX = ev.clientX;
        const clientY = ev.clientY;
        const dx = clientX - dragStartRef.current.startX;
        const dy = clientY - dragStartRef.current.startY;
        setPos({ left: Math.max(8, dragStartRef.current.origLeft + dx), top: Math.max(8, dragStartRef.current.origTop + dy) });
    }, []);

    const onMouseUp = useCallback(() => {
        stopDragging();
    }, [stopDragging]);

    const onTouchMove = useCallback((ev: TouchEvent) => {
        if (!draggingRef.current) return;
        const t = ev.touches[0];
        const clientX = t.clientX;
        const clientY = t.clientY;
        const dx = clientX - dragStartRef.current.startX;
        const dy = clientY - dragStartRef.current.startY;
        setPos({ left: Math.max(8, dragStartRef.current.origLeft + dx), top: Math.max(8, dragStartRef.current.origTop + dy) });
    }, []);

    const onTouchEnd = useCallback(() => {
        stopDragging();
    }, [stopDragging]);

    const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        draggingRef.current = true;
        const startX = e.clientX;
        const startY = e.clientY;
        const origLeft = pos?.left ?? 340;
        const origTop = pos?.top ?? 60;
        dragStartRef.current = { startX, startY, origLeft, origTop };
        window.addEventListener('mousemove', onMouseMove as any, true);
        window.addEventListener('mouseup', onMouseUp as any, true);
    }, [pos, onMouseMove, onMouseUp]);

    const handleHeaderTouchStart = useCallback((e: React.TouchEvent) => {
        e.stopPropagation();
        e.preventDefault();
        draggingRef.current = true;
        const t = e.touches[0];
        const startX = t.clientX;
        const startY = t.clientY;
        const origLeft = pos?.left ?? 340;
        const origTop = pos?.top ?? 60;
        dragStartRef.current = { startX, startY, origLeft, origTop };
        window.addEventListener('touchmove', onTouchMove as any, true);
        window.addEventListener('touchend', onTouchEnd as any, true);
    }, [pos, onTouchMove, onTouchEnd]);

    // 切换节点展开/收起
    const toggleNode = useCallback((nodeId: string) => {
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    }, []);

    // 跳转到白板中的卡片位置
    const jumpToCardInBoard = useCallback((blockId: string) => {
        const shape = getShapeByBlockId(blockId);
        if (shape) {
            const bounds = editor.getShapePageBounds(shape);
            if (bounds) {
                editor.centerOnPoint(bounds.center, { animation: { duration: 300 } });
                editor.select(shape.id);
            }
        } else {
            showMessage('未在白板中找到该卡片', 3000, 'info');
        }
    }, [editor, getShapeByBlockId]);

    // 跳转到文档块
    const jumpToBlockInDoc = useCallback((blockId: string) => {
        openTab({
            app: window.siyuan.ws.app,
            doc: {
                id: blockId,
                action: ['cb-get-hl', 'cb-get-all'],
                zoomIn: false,
            },
            keepCursor: false,
            position: 'right',
        });
    }, []);

    // 点击处理：已添加则跳转到卡片位置，未添加则跳转到文档
    const handleClick = useCallback((node: OutlineNode) => {
        if (!node.id) return;

        if (isBlockInBoard(node.id)) {
            jumpToCardInBoard(node.id);
        } else {
            jumpToBlockInDoc(node.id);
        }
    }, [isBlockInBoard, jumpToCardInBoard, jumpToBlockInDoc]);

    // 处理拖拽开始
    const handleDragStart = useCallback((e: React.DragEvent, node: OutlineNode) => {
        if (!node.id) return;
        e.dataTransfer.setData('application/doc-outline-block', JSON.stringify({
            blockId: node.id,
            blockName: node.name || '未知块',
        }));
        e.dataTransfer.effectAllowed = 'copy';
    }, []);

    const handleInsertAll = useCallback(async () => {
        if (!selectedMainCard || !docId || selectedMainCard.props.blockId !== docId) return;

        setInsertingAll(true);
        try {
            const result = await insertDocRelations({
                editor,
                mainCard: selectedMainCard,
                items: outline.map(outlineNodeToRelationItem),
                kind: 'outline-block',
            });

            if (result.createdShapeIds.length === 0) {
                showMessage('无可插入大纲块', 3000, 'info');
                return;
            }

            showMessage(
                result.skippedCount > 0
                    ? `已插入 ${result.createdShapeIds.length} 个大纲块，跳过 ${result.skippedCount} 个已存在项`
                    : `已插入 ${result.createdShapeIds.length} 个大纲块`,
                3000,
                'info'
            );
        } catch (err) {
            console.error('insert all outline blocks failed', err);
            showMessage('插入大纲块失败', 3000, 'error');
        } finally {
            setInsertingAll(false);
        }
    }, [selectedMainCard, docId, outline, editor]);

    // 获取标题图标
    const getHeadingIcon = (subType?: string): string => {
        switch (subType) {
            case 'h1': return 'H1';
            case 'h2': return 'H2';
            case 'h3': return 'H3';
            case 'h4': return 'H4';
            case 'h5': return 'H5';
            case 'h6': return 'H6';
            default: return '•';
        }
    };

    // 获取展开/收起图标
    const getExpandIcon = (isExpanded: boolean): React.ReactNode => {
        return (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                {isExpanded ? (
                    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
                ) : (
                    <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
                )}
            </svg>
        );
    };

    // 渲染单个节点
    const renderNode = useCallback((node: OutlineNode, depth: number = 0): React.ReactNode => {
        const hasChildren = node.blocks && node.blocks.length > 0;
        const isExpanded = expandedNodes.has(node.id);
        const isAdded = addedBlockIds.has(node.id);

        return (
            <div key={node.id} style={{ marginLeft: depth * 12 }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        backgroundColor: isAdded ? 'var(--b3-accent-background)' : 'transparent',
                        transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = isAdded
                            ? 'var(--b3-theme-surface-hover)'
                            : 'var(--b3-theme-surface-hover)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = isAdded
                            ? 'var(--b3-accent-background)'
                            : 'transparent';
                    }}
                >
                    {/* 展开/收起按钮 */}
                    <span
                        style={{
                            width: '20px',
                            height: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: hasChildren ? 'pointer' : 'default',
                            color: 'var(--b3-theme-on-background)',
                            fontSize: '12px',
                            userSelect: 'none',
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            if (hasChildren) toggleNode(node.id);
                        }}
                    >
                        {hasChildren ? getExpandIcon(isExpanded) : null}
                    </span>

                    {/* 标题图标 */}
                    <span style={{
                        width: '20px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--b3-theme-on-background)',
                        fontSize: '11px',
                        fontWeight: 500,
                    }}>
                        {getHeadingIcon(node.subType)}
                    </span>

                    {/* 标题文本 */}
                    <span
                        style={{
                            flex: 1,
                            fontSize: '13px',
                            color: isAdded ? 'var(--b3-theme-on-background)' : 'var(--b3-theme-on-background)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                        }}
                        onClick={() => handleClick(node)}
                        title={`${node.name || '未知标题'}${isAdded ? '（已添加，点击跳转）' : '（点击跳转到文档）'}`}
                    >
                        {node.name || '未知标题'}
                    </span>

                    {/* 拖拽手柄 */}
                    <span
                        draggable
                        onDragStart={(e) => handleDragStart(e, node)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: '20px',
                            height: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'grab',
                            color: 'var(--b3-theme-on-surface-light)',
                            fontSize: '12px',
                            userSelect: 'none',
                        }}
                        title="拖拽添加到白板"
                    >
                        ⋮⋮
                    </span>

                    {/* 状态指示 */}
                    <span style={{
                        fontSize: '12px',
                        color: isAdded ? 'var(--b3-theme-primary)' : 'var(--b3-theme-on-background)',
                        marginLeft: '4px',
                    }}>
                        {isAdded ? '✓' : ''}
                    </span>
                </div>

                {/* 子节点 - 使用 blocks 而非 children */}
                {hasChildren && isExpanded && (
                    <div>
                        {node.blocks!.map(child => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    }, [addedBlockIds, expandedNodes, toggleNode, handleClick, handleDragStart]);

    if (!isOpen) return null;

    return (
        <div
            ref={panelRef}
            className="doc-outline-panel"
            style={{
                position: 'fixed',
                top: pos ? `${pos.top}px` : '60px',
                left: pos ? `${pos.left}px` : undefined,
                width: '260px',
                maxHeight: 'calc(100vh - 120px)',
                backgroundColor: 'var(--b3-theme-background)',
                border: '1px solid var(--b3-border-color)',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                zIndex: 99999,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                pointerEvents: 'auto',
                overscrollBehavior: 'contain',
            }}
            onWheelCapture={handleWheelCapture}
            onTouchStartCapture={handleTouchStartCapture}
            onTouchMoveCapture={handleTouchMoveCapture}
        >
            {/* 头部 */}
            <div
                onMouseDown={handleHeaderMouseDown}
                onTouchStart={handleHeaderTouchStart}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderBottom: '1px solid var(--b3-border-color)',
                    cursor: 'grab',
                }}>
                <span style={{ fontWeight: 800, fontSize: '14px', color: 'var(--b3-theme-on-background)' }}>
                    文档大纲
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); void handleInsertAll(); }}
                        disabled={!canInsertAll}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: canInsertAll ? 'pointer' : 'not-allowed',
                            color: canInsertAll ? 'var(--b3-theme-on-background)' : 'var(--b3-theme-on-surface-light)',
                            fontSize: '12px',
                            padding: '4px 8px',
                            opacity: canInsertAll ? 1 : 0.6,
                        }}
                        title={
                            !selectedMainCard
                                ? '请先选中主文档卡片'
                                : selectedMainCard.props.blockId !== docId
                                    ? '当前选中主卡片与面板文档不一致'
                                    : outline.length === 0
                                        ? '当前没有可插入的大纲块'
                                        : '插入全部大纲'
                        }
                    >
                        {insertingAll ? '插入中...' : '插入全部'}
                    </button>
                    <button
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); loadOutline(); }}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: 'var(--b3-theme-on-background)',
                            fontSize: '14px',
                            padding: '4px 8px',
                        }}
                        title="刷新"
                    >
                        ↻
                    </button>
                    <button
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); onClose(); }}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            color: 'var(--b3-theme-on-background)',
                            fontSize: '14px',
                            padding: '4px 8px',
                        }}
                        title="关闭"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* 内容区 */}
            <div
                ref={contentRef}
                onWheel={handleWheel}
                onTouchMove={handleContentTouchMove}
                onTouchStart={(e) => { e.stopPropagation(); }}
                style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '8px',
                    overscrollBehavior: 'contain',
                }}>
                {!docId ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '20px',
                        color: 'var(--b3-theme-on-background)',
                        fontSize: '13px',
                    }}>
                        未绑定文档
                        <br />
                        <span style={{ fontSize: '12px', opacity: 0.7 }}>
                            请先在白板属性中绑定文档
                        </span>
                    </div>
                ) : loading ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '20px',
                        color: 'var(--b3-theme-on-background)',
                    }}>
                        加载中...
                    </div>
                ) : outline.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '20px',
                        color: 'var(--b3-theme-on-background)',
                        fontSize: '13px',
                    }}>
                        文档无大纲
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {outline.map(node => renderNode(node))}
                    </div>
                )}
            </div>

            {/* 底部提示 */}
            <div style={{
                padding: '8px 12px',
                borderTop: '1px solid var(--b3-border-color)',
                fontSize: '11px',
                color: 'var(--b3-theme-on-background)',
                textAlign: 'center',
            }}>
                拖拽或点击添加到白板，已添加点击跳转
            </div>
        </div>
    );
});
