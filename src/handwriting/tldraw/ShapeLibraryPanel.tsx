/**
 * 形状素材库面板组件
 * 显示素材列表，支持拖拽添加到画布
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    track,
    useEditor,
    stopEventPropagation,
    TldrawUiButton,
} from '@tldraw/tldraw';
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
        }
    }, [isOpen, loadItems]);

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

    if (!isOpen) return null;

    return (
        <div
            className="shape-library-panel"
            onPointerDown={stopEventPropagation}
            onPointerUp={stopEventPropagation}
            onClick={stopEventPropagation}
            onMouseDown={stopEventPropagation}
            onMouseUp={stopEventPropagation}
            onWheel={stopEventPropagation}
            style={{
                position: 'fixed',
                top: '60px',
                right: '320px',
                width: '280px',
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
            }}
        >
            {/* 头部 */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid var(--b3-border-color)',
            }}>
                <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--b3-theme-on-background)' }}>素材库</span>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <TldrawUiButton
                        type="icon"
                        title="导入"
                        onClick={handleImport}
                    >
                        📥
                    </TldrawUiButton>
                    <TldrawUiButton
                        type="icon"
                        title="导出"
                        onClick={handleExport}
                    >
                        📤
                    </TldrawUiButton>
                    <TldrawUiButton
                        type="icon"
                        title="刷新"
                        onClick={loadItems}
                    >
                        🔄
                    </TldrawUiButton>
                    <TldrawUiButton
                        type="icon"
                        title="关闭"
                        onClick={onClose}
                    >
                        ✕
                    </TldrawUiButton>
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
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '8px',
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
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {items.map(item => (
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
                    </div>
                )}
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

    return (
        <div
            draggable
            onDragStart={(e) => onDragStart(e, item)}
            style={{
                display: 'flex',
                flexDirection: 'column',
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
            }}>
                <span>
                    {item.shapes.length} 个形状
                    {item.assets.length > 0 && ` · ${item.assets.length} 个资源`}
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
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
