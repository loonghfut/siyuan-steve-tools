/**
 * 形状素材库面板组件
 * 显示素材列表，支持拖拽添加到画布
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    track,
    useEditor,
    TldrawUiButton,
} from '@tldraw/tldraw';
import { api } from '@frostime/siyuan-plugin-kits';
import {
    ShapeLibraryItem,
    loadShapeLibrary,
    removeFromLibrary,
    renameLibraryItem,
    addLibraryItemToCanvas,
    exportLibrary,
    importLibrary,
} from './shape-library-manager';
import { confirm as syConfirm } from 'siyuan';

interface ShapeLibraryPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

/**
 * 素材库面板组件
 */
export const ShapeLibraryPanel = track(({ isOpen, onClose }: ShapeLibraryPanelProps) => {
    const editor = useEditor();
    const [items, setItems] = useState<ShapeLibraryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const [showMore, setShowMore] = useState(false);
    const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    // 分页/懒加载相关
    const PAGE_SIZE = 20;
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const draggingRef = useRef(false);
    const dragStartRef = useRef({ startX: 0, startY: 0, origLeft: 0, origTop: 0 });

    // 加载素材库
    const loadItems = useCallback(async () => {
        setLoading(true);
        try {
            const library = await loadShapeLibrary();
            setItems(library?.items || []);
        } catch (err) {
            console.error('加载素材库失败:', err);
            setItems([]); // 出错时设置为空数组
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            loadItems();
            // 初始化位置（如果尚未设置），使用插件存储的文件
            (async () => {
                try {
                    if (!pos) {
                        const PANEL_POS_PATH = '/data/storage/petal/sttools/shape-library-panel.json';
                        const data = await api.getFile(PANEL_POS_PATH);
                        if (data) {
                            let parsed: any = data;
                            if (typeof data === 'string') parsed = JSON.parse(data);
                            if (parsed && typeof parsed.left === 'number' && typeof parsed.top === 'number') {
                                setPos({ left: parsed.left, top: parsed.top });
                                return;
                            }
                        }

                        // 默认位置：计算左边距使其避开原先的 right 面板
                        const width = 280;
                        const right = 320;
                        const left = Math.max(12, window.innerWidth - right - width);
                        setPos({ left, top: 60 });
                    }
                } catch (err) {
                    setPos({ left: 40, top: 60 });
                }
            })();
        }
    }, [isOpen, loadItems]);

    // 当外部（例如右键“加入素材库”）触发素材库更新事件时刷新列表
    useEffect(() => {
        const handler = () => {
            if (isOpen) loadItems();
        };
        window.addEventListener('shapeLibrary:updated', handler as EventListener);
        return () => window.removeEventListener('shapeLibrary:updated', handler as EventListener);
    }, [isOpen, loadItems]);

    // 监听位置重置事件，重置面板位置
    useEffect(() => {
        const handler = (e: Event | any) => {
            const detail = e?.detail as { left?: number; top?: number } | undefined;
            if (detail && typeof detail.left === 'number' && typeof detail.top === 'number') {
                setPos({ left: detail.left, top: detail.top });
            } else {
                const width = 280;
                const right = 320;
                const left = Math.max(12, window.innerWidth - right - width);
                setPos({ left, top: 60 });
            }
        };
        window.addEventListener('shapeLibrary:posReset', handler as EventListener);
        return () => window.removeEventListener('shapeLibrary:posReset', handler as EventListener);
    }, []);

    // 点击面板外部或按 Esc 隐藏更多菜单
    useEffect(() => {
        const handleDocClick = (e: MouseEvent) => {
            const el = panelRef.current as HTMLElement | null;
            if (!el) return;
            if (showMore && e.target && !el.contains(e.target as Node)) {
                setShowMore(false);
            }
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setShowMore(false);
        };
        document.addEventListener('click', handleDocClick, true);
        document.addEventListener('keydown', handleKey, true);
        return () => {
            document.removeEventListener('click', handleDocClick, true);
            document.removeEventListener('keydown', handleKey, true);
        };
    }, [showMore]);

    // 拖拽相关处理
    const stopDragging = useCallback(() => {
        draggingRef.current = false;
        // 保存位置到插件存储（异步）
        (async () => {
            if (pos) {
                try {
                    const PANEL_POS_PATH = '/data/storage/petal/sttools/shape-library-panel.json';
                    const jsonData = JSON.stringify(pos, null, 2);
                    const blob = new Blob([jsonData], { type: 'application/json' });
                    await api.putFile(PANEL_POS_PATH, false, blob);
                } catch (e) {
                    console.warn('保存素材库面板位置失败:', e);
                }
            }
        })();
        window.removeEventListener('mousemove', onMouseMove as any, true);
        window.removeEventListener('mouseup', onMouseUp as any, true);
        window.removeEventListener('touchmove', onTouchMove as any, true);
        window.removeEventListener('touchend', onTouchEnd as any, true);
    }, [pos]);

    // 阻止面板滚动冒泡到画布（防止画布随面板滚动）
    const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        e.stopPropagation();
    }, []);
    const handleWheelCapture = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
        // 在捕获阶段停止传播，防止 canvas 在捕获阶段接收到事件
        e.stopPropagation();
    }, []);

    const handleContentTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        // 仅阻止冒泡，允许默认滚动行为在当前容器内执行
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
        const origLeft = pos?.left ?? 40;
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
        const origLeft = pos?.left ?? 40;
        const origTop = pos?.top ?? 60;
        dragStartRef.current = { startX, startY, origLeft, origTop };
        window.addEventListener('touchmove', onTouchMove as any, true);
        window.addEventListener('touchend', onTouchEnd as any, true);
    }, [pos, onTouchMove, onTouchEnd]);

    // 删除素材
    const handleDelete = useCallback(async (itemId: string, itemName: string) => {
        const doDelete = async () => {
            const success = await removeFromLibrary(itemId);
            if (success) {
                setItems(prev => prev.filter(item => item.id !== itemId));
            }
        };

        if (typeof syConfirm === 'function') {
            syConfirm('删除素材', `确定要删除素材「${itemName}」吗？`, doDelete, () => { });
        } else {
            if (window.confirm(`确定要删除素材「${itemName}」吗？`)) {
                doDelete();
            }
        }
    }, []);

    // 开始编辑名称
    const handleStartRename = useCallback((item: ShapeLibraryItem) => {
        setEditingId(item.id);
        setEditingName(item.name);
    }, []);

    // 保存名称
    const handleSaveRename = useCallback(async () => {
        if (editingId && editingName.trim()) {
            const success = await renameLibraryItem(editingId, editingName.trim());
            if (success) {
                setItems(prev => prev.map(item =>
                    item.id === editingId ? { ...item, name: editingName.trim() } : item
                ));
            }
        }
        setEditingId(null);
        setEditingName('');
    }, [editingId, editingName]);

    // 处理拖拽开始
    const handleDragStart = useCallback((e: React.DragEvent, item: ShapeLibraryItem) => {
        e.dataTransfer.setData('application/shape-library-item', JSON.stringify(item));
        e.dataTransfer.effectAllowed = 'copy';
    }, []);

    // 处理点击添加
    const handleClickAdd = useCallback((item: ShapeLibraryItem) => {
        // 获取视口中心位置
        const viewportBounds = editor.getViewportPageBounds();
        const centerX = viewportBounds.x + viewportBounds.width / 2;
        const centerY = viewportBounds.y + viewportBounds.height / 2;

        addLibraryItemToCanvas(editor, item, { x: centerX, y: centerY });
    }, [editor]);

    // 导出素材库
    const handleExport = useCallback(async () => {
        await exportLibrary();
    }, []);

    // 导入素材库
    const handleImport = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            await importLibrary(file, true);
            await loadItems();
        }
        // 重置 input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [loadItems]);

    // 当 items 或搜索关键字变更时重置可见项数
    useEffect(() => {
        setVisibleCount(PAGE_SIZE);
    }, [items, searchQuery]);

    // 计算过滤后的列表（根据搜索关键字）
    const q = searchQuery.trim().toLowerCase();
    const filteredItems = q ? (items || []).filter(item => item.name.toLowerCase().includes(q)) : items;
    const visibleItems = (filteredItems || []).slice(0, visibleCount);

    // 懒加载：触发加载更多动作
    const loadMore = useCallback(() => {
        if (isLoadingMore) return;
        if (visibleCount >= (filteredItems ? filteredItems.length : 0)) return;
        setIsLoadingMore(true);
        setTimeout(() => {
            setVisibleCount(prev => Math.min(prev + PAGE_SIZE, (filteredItems ? filteredItems.length : 0)));
            setIsLoadingMore(false);
        }, 150);
    }, [isLoadingMore, visibleCount, filteredItems]);

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        if (!el) return;
        const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (remaining < 120) {
            loadMore();
        }
    }, [loadMore]);

    // （已在上方计算 filteredItems）

    if (!isOpen) return null;

    return (
            <div
                ref={panelRef}
                className="shape-library-panel"
            style={{
                position: 'fixed',
                top: pos ? `${pos.top}px` : '60px',
                left: pos ? `${pos.left}px` : undefined,
                width: '285px',
                maxHeight: 'calc(100vh - 120px)',
                backgroundColor: 'var(--b3-theme-surface)',
                border: '1px solid var(--b3-border-color)',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                zIndex: 99999,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight:800, fontSize: '14px', color: 'var(--b3-theme-on-background)' }}>素材库</span>
                    {/* 搜索框（放在标题后面） */}
                    <div style={{ position: 'relative' }}>
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onMouseDown={(e) => { e.stopPropagation(); }}
                            onTouchStart={(e) => { e.stopPropagation(); }}
                            placeholder="搜索素材"
                            title="搜索素材"
                            style={{
                                height: '28px',
                                width: '120px',
                                padding: '4px 28px 4px 8px',
                                borderRadius: '6px',
                                border: '1px solid var(--b3-border-color)',
                                backgroundColor: 'var(--b3-theme-surface)',
                                color: 'var(--b3-theme-on-background)',
                                fontSize: '12px',
                                outline: 'none',
                            }}
                        />
                        {searchQuery && (
                            <button
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSearchQuery(''); }}
                                title="清除搜索"
                                style={{
                                    position: 'absolute',
                                    right: '6px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    color: 'var(--b3-theme-on-surface-light)',
                                    fontSize: '12px',
                                }}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '4px', position: 'relative' }}>
                    <TldrawUiButton
                        type="icon"
                        title="更多"
                        onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setShowMore(v => !v);
                        }}
                    >
                        ⋯
                    </TldrawUiButton>
                    <TldrawUiButton
                        type="icon"
                        title="关闭"
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); onClose(); }}
                    >
                        ✕
                    </TldrawUiButton>
                    {showMore && (
                        <div
                            style={{
                                position: 'absolute',
                                right: 0,
                                top: '36px',
                                width: '140px',
                                backgroundColor: 'var(--b3-theme-surface)',
                                border: '1px solid var(--b3-border-color)',
                                borderRadius: '6px',
                                boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
                                zIndex: 100000,
                                display: 'flex',
                                flexDirection: 'column',
                                padding: '6px',
                                pointerEvents: 'auto',
                            }}
                            onClick={(e) => { e.stopPropagation(); }}
                        >
                            <button
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowMore(false); handleImport(); }}
                                style={{
                                    padding: '6px 8px',
                                    background: 'transparent',
                                    border: 'none',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                }}
                            >
                                📥 导入
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowMore(false); handleExport(); }}
                                style={{
                                    padding: '6px 8px',
                                    background: 'transparent',
                                    border: 'none',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                }}
                            >
                                📤 导出
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowMore(false); loadItems(); }}
                                style={{
                                    padding: '6px 8px',
                                    background: 'transparent',
                                    border: 'none',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                }}
                            >
                                🔄 刷新
                            </button>
                            {/* 关闭按钮已移到标题栏，保留其余菜单项 */}
                        </div>
                    )}
                </div>
            </div>

            {/* 隐藏的文件输入 */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={handleFileChange}
            />

            {/* 内容区 */}
            <div
                ref={contentRef}
                onScroll={handleScroll}
                onWheel={handleWheel}
                onTouchMove={handleContentTouchMove}
                onTouchStart={(e) => { e.stopPropagation(); }}
                style={{
                flex: 1,
                overflowY: 'auto',
                padding: '8px',
                // 阻止滚动链（现代浏览器）
                overscrollBehavior: 'contain',
            }}>
                {loading ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '20px',
                        color: 'var(--b3-theme-on-surface-light)',
                    }}>
                        加载中...
                    </div>
                ) : (!items || items.length === 0) ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '20px',
                        color: 'var(--b3-theme-on-surface-light)',
                        fontSize: '13px',
                    }}>
                        素材库为空
                        <br />
                        <span style={{ fontSize: '12px', opacity: 0.7 }}>
                            选中形状后右键 → 加入素材库
                        </span>
                    </div>
                ) : (filteredItems.length === 0 ? (
                    <div style={{
                        textAlign: 'center',
                        padding: '20px',
                        color: 'var(--b3-theme-on-surface-light)',
                        fontSize: '13px',
                    }}>
                        未找到匹配的素材
                        <br />
                        <span style={{ fontSize: '12px', opacity: 0.7 }}>
                            尝试更改搜索关键词
                        </span>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {visibleItems.map(item => (
                            <ShapeLibraryItemCard
                                key={item.id}
                                item={item}
                                isEditing={editingId === item.id}
                                editingName={editingName}
                                onEditingNameChange={setEditingName}
                                onStartRename={handleStartRename}
                                onSaveRename={handleSaveRename}
                                onCancelRename={() => setEditingId(null)}
                                onDelete={handleDelete}
                                onDragStart={handleDragStart}
                                onClickAdd={handleClickAdd}
                            />
                        ))}
                        {/* 结果计数与加载更多 */}
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', paddingTop: '6px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--b3-theme-on-surface-light)' }}>{visibleItems.length} / {(filteredItems ? filteredItems.length : 0)} 条</span>
                            {visibleItems.length < (filteredItems ? filteredItems.length : 0) && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); loadMore(); }}
                                    style={{
                                        padding: '4px 8px',
                                        fontSize: '12px',
                                        borderRadius: '4px',
                                        border: '1px solid var(--b3-border-color)',
                                        background: 'var(--b3-theme-surface)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    {isLoadingMore ? '加载中...' : '加载更多'}
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* 底部提示 */}
            <div style={{
                padding: '8px 12px',
                borderTop: '1px solid var(--b3-border-color)',
                fontSize: '11px',
                color: 'var(--b3-theme-on-surface-light)',
                textAlign: 'center',
            }}>
                拖拽素材到画布或点击添加
            </div>
        </div>
    );
});

interface ShapeLibraryItemCardProps {
    item: ShapeLibraryItem;
    isEditing: boolean;
    editingName: string;
    onEditingNameChange: (name: string) => void;
    onStartRename: (item: ShapeLibraryItem) => void;
    onSaveRename: () => void;
    onCancelRename: () => void;
    onDelete: (itemId: string, itemName: string) => void;
    onDragStart: (e: React.DragEvent, item: ShapeLibraryItem) => void;
    onClickAdd: (item: ShapeLibraryItem) => void;
}

/**
 * 素材卡片组件
 */
const ShapeLibraryItemCard: React.FC<ShapeLibraryItemCardProps> = ({
    item,
    isEditing,
    editingName,
    onEditingNameChange,
    onStartRename,
    onSaveRename,
    onCancelRename,
    onDelete,
    onDragStart,
    onClickAdd,
}) => {
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onSaveRename();
        } else if (e.key === 'Escape') {
            onCancelRename();
        }
    };

    // 调试日志
    React.useEffect(() => {
        console.log('[素材卡片] 渲染素材:', item.name, '缩略图:', item.thumbnail ? `存在(${item.thumbnail.substring(0, 50)}...)` : '不存在');
    }, [item.name, item.thumbnail]);

    return (
        <div
            draggable
            onDragStart={(e) => onDragStart(e, item)}
            style={{
                display: 'flex',
                flexDirection: 'row',
                gap: '10px',
                padding: '10px 12px',
                backgroundColor: 'var(--b3-theme-background)',
                borderRadius: '6px',
                cursor: 'grab',
                transition: 'background-color 0.15s',
                border: '1px solid var(--b3-border-color)',
                pointerEvents: 'auto',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--b3-theme-surface-lighter)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--b3-theme-background)';
            }}
        >
            {/* 缩略图或占位符 */}
            <div style={{
                flexShrink: 0,
                width: '80px',
                height: '80px',
                borderRadius: '4px',
                overflow: 'hidden',
                backgroundColor: 'var(--b3-theme-surface)',
                border: '1px solid var(--b3-border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                {item.thumbnail ? (
                    <img
                        src={item.thumbnail}
                        alt={item.name}
                        style={{
                            maxWidth: '100%',
                            maxHeight: '100%',
                            objectFit: 'contain',
                        }}
                    />
                ) : (
                    <div style={{
                        fontSize: '32px',
                        opacity: 0.3,
                    }}>
                        📦
                    </div>
                )}
            </div>
            
            {/* 信息区域 */}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minWidth: 0, // 允许内容收缩
            }}>
                {/* 名称行 */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '6px',
                }}>
                    {isEditing ? (
                        <input
                            type="text"
                            value={editingName}
                            onChange={(e) => onEditingNameChange(e.target.value)}
                            onBlur={onSaveRename}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            style={{
                                flex: 1,
                                padding: '2px 6px',
                                border: '1px solid var(--color-primary)',
                                borderRadius: '4px',
                                fontSize: '13px',
                                backgroundColor: 'var(--color-background)',
                                color: 'var(--color-text)',
                                outline: 'none',
                            }}
                        />
                    ) : (
                        <span
                            style={{
                                flex: 1,
                                fontSize: '13px',
                                fontWeight: 500,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}
                            onDoubleClick={() => onStartRename(item)}
                            title={item.name}
                        >
                            {item.name}
                        </span>
                    )}
                </div>

                {/* 信息行 */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    color: 'var(--b3-theme-on-surface-light)',
                    marginBottom: '4px',
                }}>
                    <span>
                        {item.shapes.length} 个形状
                        {item.assets.length > 0 && ` · ${item.assets.length} 个资源`}
                    </span>
                </div>

                {/* 操作按钮行 */}
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onClickAdd(item);
                        }}
                        style={{
                            padding: '2px 6px',
                            fontSize: '11px',
                            backgroundColor: 'var(--b3-theme-primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            pointerEvents: 'auto',
                        }}
                        title="添加到画布"
                    >
                        添加
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onStartRename(item);
                        }}
                        style={{
                            padding: '2px 6px',
                            fontSize: '11px',
                            backgroundColor: 'transparent',
                            color: 'var(--b3-theme-on-surface-light)',
                            border: '1px solid var(--b3-border-color)',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            pointerEvents: 'auto',
                        }}
                        title="重命名"
                    >
                        ✏️
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onDelete(item.id, item.name);
                        }}
                        style={{
                            padding: '2px 6px',
                            fontSize: '11px',
                            backgroundColor: 'transparent',
                            color: 'var(--b3-theme-on-surface-light)',
                            border: '1px solid var(--b3-border-color)',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            pointerEvents: 'auto',
                        }}
                        title="删除"
                    >
                        🗑️
                    </button>
                </div>

                {/* 创建时间 */}
                <div style={{
                    marginTop: '4px',
                    fontSize: '10px',
                    color: 'var(--b3-theme-on-surface-light)',
                }}>
                    {new Date(item.createdAt).toLocaleString('zh-CN')}
                </div>
            </div>
        </div>
    );
};

/**
 * 素材库按钮组件（用于工具栏）
 */
export const ShapeLibraryButton = track(({ onClick }: { onClick: () => void }) => {
    return (
        <TldrawUiButton
            type="icon"
            title="素材库"
            onClick={onClick}
        >
            📦
        </TldrawUiButton>
    );
});

/**
 * 素材库拖放处理Hook
 * 在 editor mount 时调用，用于处理素材拖放到画布
 */
export function setupShapeLibraryDropHandler(editor: any) {
    const container = editor.getContainer();

    const handleDrop = (e: DragEvent) => {
        const data = e.dataTransfer?.getData('application/shape-library-item');
        if (!data) return;

        e.preventDefault();
        e.stopPropagation();

        try {
            const item = JSON.parse(data) as ShapeLibraryItem;
            const { x, y } = editor.screenToPage({
                x: e.clientX,
                y: e.clientY,
            });

            addLibraryItemToCanvas(editor, item, { x, y });
        } catch (err) {
            console.error('解析素材数据失败:', err);
        }
    };

    const handleDragOver = (e: DragEvent) => {
        if (e.dataTransfer?.types.includes('application/shape-library-item')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        }
    };

    container.addEventListener('drop', handleDrop, true);
    container.addEventListener('dragover', handleDragOver, true);

    // 返回清理函数
    return () => {
        container.removeEventListener('drop', handleDrop, true);
        container.removeEventListener('dragover', handleDragOver, true);
    };
}
