/**
 * 形状素材库面板组件
 * 显示素材列表，支持拖拽添加到画布
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    track,
    useEditor,
    TldrawUiButton,
    TldrawUiIcon,
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

const ShapeLibraryLogo = ({ small = false }: { small?: boolean }) => (
    <svg
        className={small ? 'shape-library-logo shape-library-logo--small' : 'shape-library-logo'}
        viewBox="0 0 24 24"
        aria-hidden="true"
    >
        <path d="M12 3 3.8 7.4 12 11.8l8.2-4.4L12 3Z" />
        <path d="M4 9.7v6.9L12 21v-6.9L4 9.7Z" />
        <path d="m20 9.7-8 4.4V21l8-4.4V9.7Z" />
    </svg>
);

const SearchIcon = () => (
    <svg className="shape-library-search-icon" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M8.8 3.2a5.6 5.6 0 1 0 3.48 9.99l3.01 3.01 1.06-1.06-3.01-3.01A5.6 5.6 0 0 0 8.8 3.2Zm0 1.5a4.1 4.1 0 1 1 0 8.2 4.1 4.1 0 0 1 0-8.2Z" />
    </svg>
);

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
                className="shape-library-panel__header"
                onMouseDown={handleHeaderMouseDown}
                onTouchStart={handleHeaderTouchStart}
            >
                <div className="shape-library-panel__title-row">
                    <span className="shape-library-panel__mark">
                        <ShapeLibraryLogo />
                    </span>
                    <div className="shape-library-panel__heading">
                        <span className="shape-library-panel__title">素材库</span>
                        <span className="shape-library-panel__count">{filteredItems.length} 项</span>
                    </div>
                    {/* 搜索框（放在标题后面） */}
                    <label
                        className="shape-library-panel__search"
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                    >
                        <SearchIcon />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onMouseDown={(e) => { e.stopPropagation(); }}
                            onTouchStart={(e) => { e.stopPropagation(); }}
                            placeholder="搜索素材"
                            title="搜索素材"
                        />
                        {searchQuery && (
                            <button
                                className="shape-library-icon-button shape-library-icon-button--ghost shape-library-panel__search-clear"
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSearchQuery(''); }}
                                title="清除搜索"
                                aria-label="清除搜索"
                            >
                                <TldrawUiIcon icon="cross-2" small />
                            </button>
                        )}
                    </label>
                </div>
                <div
                    className="shape-library-panel__actions"
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                >
                    <TldrawUiButton
                        type="icon"
                        className="shape-library-icon-button"
                        title="更多"
                        onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setShowMore(v => !v);
                        }}
                    >
                        <TldrawUiIcon icon="dots-horizontal" small />
                    </TldrawUiButton>
                    <TldrawUiButton
                        type="icon"
                        className="shape-library-icon-button"
                        title="关闭"
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); onClose(); }}
                    >
                        <TldrawUiIcon icon="cross-2" small />
                    </TldrawUiButton>
                    {showMore && (
                        <div
                            className="shape-library-panel__menu"
                            onClick={(e) => { e.stopPropagation(); }}
                        >
                            <button
                                className="shape-library-menu-item"
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowMore(false); handleImport(); }}
                            >
                                <TldrawUiIcon icon="download" small />
                                <span>导入</span>
                            </button>
                            <button
                                className="shape-library-menu-item"
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowMore(false); handleExport(); }}
                            >
                                <TldrawUiIcon icon="share-1" small />
                                <span>导出</span>
                            </button>
                            <button
                                className="shape-library-menu-item"
                                onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowMore(false); loadItems(); }}
                            >
                                <TldrawUiIcon icon="rotate-cw" small />
                                <span>刷新</span>
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
                className="shape-library-panel__content"
                ref={contentRef}
                onScroll={handleScroll}
                onWheel={handleWheel}
                onTouchMove={handleContentTouchMove}
                onTouchStart={(e) => { e.stopPropagation(); }}
                style={{
                    // 阻止滚动链（现代浏览器）
                    overscrollBehavior: 'contain',
                }}
            >
                {loading ? (
                    <div className="shape-library-empty">
                        <TldrawUiIcon icon="rotate-cw" />
                        <span>加载中...</span>
                    </div>
                ) : (!items || items.length === 0) ? (
                    <div className="shape-library-empty">
                        <ShapeLibraryLogo />
                        <strong>素材库为空</strong>
                        <span>选中形状后右键加入素材库</span>
                    </div>
                ) : (filteredItems.length === 0 ? (
                    <div className="shape-library-empty">
                        <SearchIcon />
                        <strong>未找到匹配的素材</strong>
                        <span>尝试更改搜索关键词</span>
                    </div>
                ) : (
                    <div className="shape-library-list">
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
                        <div className="shape-library-panel__pager">
                            <span>{visibleItems.length} / {(filteredItems ? filteredItems.length : 0)} 条</span>
                            {visibleItems.length < (filteredItems ? filteredItems.length : 0) && (
                                <button
                                    className="shape-library-load-more"
                                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); loadMore(); }}
                                    title="加载更多"
                                >
                                    {isLoadingMore ? '加载中...' : '加载更多'}
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* 底部提示 */}
            <div className="shape-library-panel__footer">
                <TldrawUiIcon icon="drag-handle-dots" small />
                <span>拖拽到画布，或点击插入</span>
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

    return (
        <div
            className="shape-library-card"
            draggable
            onDragStart={(e) => onDragStart(e, item)}
        >
            {/* 缩略图或占位符 */}
            <div className="shape-library-card__thumb">
                {item.thumbnail ? (
                    <img
                        src={item.thumbnail}
                        alt={item.name}
                    />
                ) : (
                    <ShapeLibraryLogo />
                )}
            </div>

            {/* 信息区域 */}
            <div className="shape-library-card__body">
                {/* 名称行 */}
                <div className="shape-library-card__name-row">
                    {isEditing ? (
                        <input
                            className="shape-library-card__rename-input"
                            type="text"
                            value={editingName}
                            onChange={(e) => onEditingNameChange(e.target.value)}
                            onBlur={onSaveRename}
                            onKeyDown={handleKeyDown}
                            autoFocus
                        />
                    ) : (
                        <span
                            className="shape-library-card__name"
                            onDoubleClick={() => onStartRename(item)}
                            title={item.name}
                        >
                            {item.name}
                        </span>
                    )}
                </div>

                {/* 信息行 */}
                <div className="shape-library-card__meta">
                    <span>
                        {item.shapes.length} 个形状
                        {item.assets.length > 0 && ` · ${item.assets.length} 个资源`}
                    </span>
                </div>

                {/* 操作按钮行 */}
                <div className="shape-library-card__actions">
                    <button
                        className="shape-library-icon-button shape-library-icon-button--primary"
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onClickAdd(item);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        title="添加到画布"
                        aria-label="添加到画布"
                    >
                        <TldrawUiIcon icon="plus" small />
                    </button>
                    <button
                        className="shape-library-icon-button"
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onStartRename(item);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        title="重命名"
                        aria-label="重命名"
                    >
                        <TldrawUiIcon icon="edit" small />
                    </button>
                    <button
                        className="shape-library-icon-button shape-library-icon-button--danger"
                        onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            onDelete(item.id, item.name);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        title="删除"
                        aria-label="删除"
                    >
                        <TldrawUiIcon icon="trash" small />
                    </button>
                </div>

                {/* 创建时间 */}
                <div className="shape-library-card__date">
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
            <ShapeLibraryLogo small />
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
