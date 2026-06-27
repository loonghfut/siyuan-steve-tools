/**
 * 形状素材库管理器
 * 用于保存、加载、删除形状素材
 */
import { api } from "@frostime/siyuan-plugin-kits";
import { Editor, TLShape, TLAsset, TLShapeId, createShapeId, TLAssetId, TLBinding, TLBindingId, createBindingId } from "@tldraw/tldraw";
import { showMessage } from "siyuan";
import type { IBranchShape } from "../BranchShape";
import { layoutBranchChildren, relayoutBranchesContainingShapes } from "../BranchShape";

/** 素材库项目接口 */
export interface ShapeLibraryItem {
    /** 唯一标识符 */
    id: string;
    /** 素材名称 */
    name: string;
    /** 创建时间戳 */
    createdAt: number;
    /** 包含的形状数据（序列化后） */
    shapes: TLShape[];
    /** 相关的资源数据（如图片等） */
    assets: TLAsset[];
    /** 绑定关系数据（连接器与形状的绑定） */
    bindings?: TLBinding[];
    /** 缩略图（可选，base64） */
    thumbnail?: string;
}

/** 素材库存储结构 */
export interface ShapeLibraryData {
    version: number;
    items: ShapeLibraryItem[];
}

const LIBRARY_STORAGE_PATH = '/data/storage/petal/sttools/shape-library.json';

/**
 * 加载素材库数据
 */
export async function loadShapeLibrary(): Promise<ShapeLibraryData> {
    try {
        const data = await api.getFile(LIBRARY_STORAGE_PATH);
        if (data) {
            let parsed: any;
            if (typeof data === 'string') {
                parsed = JSON.parse(data);
            } else {
                parsed = data;
            }
            // 确保返回的数据结构正确
            return {
                version: parsed?.version || 1,
                items: Array.isArray(parsed?.items) ? parsed.items : []
            };
        }
    } catch (err) {
        console.debug('素材库文件不存在或读取失败，将创建新的素材库');
    }
    return { version: 1, items: [] };
}

/**
 * 保存素材库数据
 */
export async function saveShapeLibrary(data: ShapeLibraryData): Promise<void> {
    try {
        const jsonData = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        await api.putFile(LIBRARY_STORAGE_PATH, false, blob);
    } catch (err) {
        console.error('保存素材库失败:', err);
        throw err;
    }
}

/**
 * 生成唯一ID
 */
function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/**
 * 收集形状相关的资源
 */
function collectAssetsForShapes(editor: Editor, shapes: TLShape[]): TLAsset[] {
    const assets: TLAsset[] = [];
    const assetIds = new Set<string>();

    const scanValue = (val: any) => {
        if (val == null) return;
        if (typeof val === 'string') {
            // 检查是否是 asset ID
            if (val.startsWith('asset:')) {
                assetIds.add(val);
            }
            return;
        }
        if (Array.isArray(val)) {
            for (const item of val) scanValue(item);
            return;
        }
        if (typeof val === 'object') {
            for (const k of Object.keys(val)) {
                scanValue(val[k]);
            }
        }
    };

    // 扫描所有形状的属性
    for (const shape of shapes) {
        scanValue((shape as any).props);
    }

    // 获取对应的资源
    for (const assetId of assetIds) {
        const asset = editor.getAsset(assetId as TLAssetId);
        if (asset) {
            assets.push(asset);
        }
    }

    return assets;
}

/**
 * 收集形状相关的绑定关系
 * 包括 bezier-connector 和 arrow 类型的绑定
 */
function collectBindingsForShapes(editor: Editor, shapes: TLShape[]): TLBinding[] {
    const bindings: TLBinding[] = [];
    const shapeIds = new Set(shapes.map(s => s.id));
    const addedBindingIds = new Set<string>();

    for (const shape of shapes) {
        // 获取从该形状发出的绑定（如连接器的绑定）
        const outBindings = editor.getBindingsFromShape(shape.id, 'bezier-connector');
        for (const binding of outBindings) {
            // 只收集两端都在素材中的绑定
            if (shapeIds.has(binding.toId) && !addedBindingIds.has(binding.id)) {
                bindings.push(binding);
                addedBindingIds.add(binding.id);
            }
        }
        
        // 同时处理 arrow 类型的绑定
        const arrowBindings = editor.getBindingsFromShape(shape.id, 'arrow');
        for (const binding of arrowBindings) {
            if (shapeIds.has(binding.toId) && !addedBindingIds.has(binding.id)) {
                bindings.push(binding);
                addedBindingIds.add(binding.id);
            }
        }
    }

    return bindings;
}

/**
 * 生成形状的缩略图
 * @param editor tldraw编辑器实例
 * @param shapeIds 要生成缩略图的形状ID列表
 * @returns 缩略图的base64编码字符串
 */
async function generateThumbnail(editor: Editor, shapeIds: TLShapeId[]): Promise<string | undefined> {
    try {
        console.debug('[素材库] 开始生成缩略图，形状数量:', shapeIds.length);
        
        // 使用tldraw的toImage API生成图片
        const imageResult = await editor.toImage(shapeIds, {
            format: 'png',
            background: true,
            padding: 16,
        });

        if (!imageResult || !imageResult.blob) {
            console.warn('[素材库] 生成缩略图失败：imageResult为空');
            return undefined;
        }
        
        const blob = imageResult.blob;
        console.debug('[素材库] 图片生成成功，大小:', blob.size, '尺寸:', imageResult.width, 'x', imageResult.height);

        // 将blob转换为base64
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result as string;
                console.debug('[素材库] base64转换成功，长度:', base64.length);
                
                // 创建一个临时图片来调整大小
                const img = new Image();
                img.onload = () => {
                    console.debug('[素材库] 图片加载成功，尺寸:', img.width, 'x', img.height);
                    
                    // 创建canvas进行缩放，生成小尺寸缩略图
                    const canvas = document.createElement('canvas');
                    const MAX_SIZE = 200; // 缩略图最大尺寸
                    let width = img.width;
                    let height = img.height;
                    
                    // 保持宽高比，缩放到最大尺寸内
                    if (width > height) {
                        if (width > MAX_SIZE) {
                            height = (height * MAX_SIZE) / width;
                            width = MAX_SIZE;
                        }
                    } else {
                        if (height > MAX_SIZE) {
                            width = (width * MAX_SIZE) / height;
                            height = MAX_SIZE;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(img, 0, 0, width, height);
                        const thumbnail = canvas.toDataURL('image/png');
                        console.debug('[素材库] 缩略图生成成功，最终尺寸:', width, 'x', height, '长度:', thumbnail.length);
                        resolve(thumbnail);
                    } else {
                        console.debug('[素材库] canvas上下文获取失败，返回原始base64');
                        resolve(base64);
                    }
                };
                img.onerror = (err) => {
                    console.error('[素材库] 图片加载失败:', err);
                    resolve(base64); // 如果缩放失败，返回原始base64
                };
                img.src = base64;
            };
            reader.onerror = () => {
                console.error('[素材库] FileReader读取失败');
                reject(new Error('读取blob失败'));
            };
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        console.error('[素材库] 生成缩略图失败:', err);
        return undefined;
    }
}

/**
 * 将选中的形状添加到素材库
 */
export async function addShapesToLibrary(
    editor: Editor,
    name?: string
): Promise<ShapeLibraryItem | null> {
    const selectedShapes = editor.getSelectedShapes();
    if (selectedShapes.length === 0) {
        showMessage('请先选中要添加的形状', 3000, 'error');
        return null;
    }

    try {
        // 克隆形状数据
        const shapes = selectedShapes.map(shape => JSON.parse(JSON.stringify(shape)));
        
        // 收集相关资源
        const assets = collectAssetsForShapes(editor, selectedShapes);
        
        // 收集相关绑定（连接器与形状的绑定关系）
        const bindings = collectBindingsForShapes(editor, selectedShapes);
        
        // 生成缩略图
        const shapeIds = selectedShapes.map(s => s.id);
        console.debug('[素材库] 准备为以下形状生成缩略图:', shapeIds);
        const thumbnail = await generateThumbnail(editor, shapeIds);
        console.debug('[素材库] 缩略图生成完成:', thumbnail ? '成功' : '失败');
        
        // 计算形状的边界框，用于后续居中放置
        const bounds = editor.getSelectionRotatedPageBounds();
        if (bounds) {
            // 将形状位置调整为相对于选区左上角
            for (const shape of shapes) {
                if (shape.x !== undefined) {
                    shape.x -= bounds.x;
                }
                if (shape.y !== undefined) {
                    shape.y -= bounds.y;
                }
            }
        }

        // 创建素材项
        const item: ShapeLibraryItem = {
            id: generateId(),
            name: name || `素材 ${new Date().toLocaleString('zh-CN')}`,
            createdAt: Date.now(),
            shapes,
            assets: assets.map(a => JSON.parse(JSON.stringify(a))),
            bindings: bindings.map(b => JSON.parse(JSON.stringify(b))), // 保存绑定关系
            thumbnail, // 添加缩略图
        };

        // 加载现有素材库并添加新项
        const library = await loadShapeLibrary();
        library.items.unshift(item); // 添加到开头
        await saveShapeLibrary(library);
        showMessage(`已添加 ${selectedShapes.length} 个形状到素材库`);

        // 通知外部（UI）素材库已更新，便于面板刷新
        try {
            window.dispatchEvent(new CustomEvent('shapeLibrary:updated', { detail: { id: item.id } }));
        } catch (e) {
            // ignore if environment doesn't support window events
        }
        return item;
    } catch (err) {
        console.error('添加素材失败:', err);
        showMessage('添加素材失败', 3000, 'error');
        return null;
    }
}

/**
 * 从素材库删除素材
 */
export async function removeFromLibrary(itemId: string): Promise<boolean> {
    try {
        const library = await loadShapeLibrary();
        const index = library.items.findIndex(item => item.id === itemId);
        if (index === -1) {
            showMessage('未找到该素材', 3000, 'error');
            return false;
        }
        
        library.items.splice(index, 1);
        await saveShapeLibrary(library);
        showMessage('素材已删除');
        return true;
    } catch (err) {
        console.error('删除素材失败:', err);
        showMessage('删除素材失败', 3000, 'error');
        return false;
    }
}

/**
 * 重命名素材
 */
export async function renameLibraryItem(itemId: string, newName: string): Promise<boolean> {
    try {
        const library = await loadShapeLibrary();
        const item = library.items.find(item => item.id === itemId);
        if (!item) {
            showMessage('未找到该素材', 3000, 'error');
            return false;
        }
        
        item.name = newName;
        await saveShapeLibrary(library);
        return true;
    } catch (err) {
        console.error('重命名素材失败:', err);
        showMessage('重命名素材失败', 3000, 'error');
        return false;
    }
}

/**
 * 生成新的形状ID映射
 */
function generateNewShapeIds(shapes: TLShape[]): Map<string, TLShapeId> {
    const idMap = new Map<string, TLShapeId>();
    for (const shape of shapes) {
        idMap.set(shape.id, createShapeId());
    }
    return idMap;
}

/**
 * 生成新的资源ID映射
 */
function generateNewAssetIds(assets: TLAsset[]): Map<string, TLAssetId> {
    const idMap = new Map<string, TLAssetId>();
    for (const asset of assets) {
        // 使用更简洁的方式创建资源ID
        const newId = `asset:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}` as TLAssetId;
        idMap.set(asset.id, newId);
    }
    return idMap;
}

/**
 * 生成新的绑定ID映射
 */
function generateNewBindingIds(bindings: TLBinding[]): Map<string, TLBindingId> {
    const idMap = new Map<string, TLBindingId>();
    for (const binding of bindings) {
        idMap.set(binding.id, createBindingId());
    }
    return idMap;
}

/**
 * 替换绑定中的ID引用
 */
function replaceIdsInBinding(
    binding: TLBinding,
    shapeIdMap: Map<string, TLShapeId>,
    bindingIdMap: Map<string, TLBindingId>
): TLBinding | null {
    const newFromId = shapeIdMap.get(binding.fromId as string);
    const newToId = shapeIdMap.get(binding.toId as string);
    
    // 如果两端的形状都不在素材中，则跳过此绑定
    if (!newFromId || !newToId) {
        return null;
    }
    
    const newBinding = JSON.parse(JSON.stringify(binding));
    newBinding.id = bindingIdMap.get(binding.id) || binding.id;
    newBinding.fromId = newFromId;
    newBinding.toId = newToId;
    
    return newBinding;
}

/**
 * 替换形状中的ID引用
 */
function replaceIdsInShape(
    shape: TLShape,
    shapeIdMap: Map<string, TLShapeId>,
    assetIdMap: Map<string, TLAssetId>,
    pageId: string
): TLShape {
    const newShape = JSON.parse(JSON.stringify(shape));
    
    // 替换形状ID
    newShape.id = shapeIdMap.get(shape.id) || shape.id;
    
    // 替换父级ID
    if (newShape.parentId && shapeIdMap.has(newShape.parentId)) {
        newShape.parentId = shapeIdMap.get(newShape.parentId);
    } else {
        // 如果父级不在素材中，设置为当前页面
        newShape.parentId = pageId;
    }

    // 替换资源ID引用
    const replaceAssetIds = (obj: any) => {
        if (obj == null) return;
        if (typeof obj === 'string') return;
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                if (typeof obj[i] === 'string' && assetIdMap.has(obj[i])) {
                    obj[i] = assetIdMap.get(obj[i]);
                } else {
                    replaceAssetIds(obj[i]);
                }
            }
            return;
        }
        if (typeof obj === 'object') {
            for (const key of Object.keys(obj)) {
                if (typeof obj[key] === 'string' && assetIdMap.has(obj[key])) {
                    obj[key] = assetIdMap.get(obj[key]);
                } else {
                    replaceAssetIds(obj[key]);
                }
            }
        }
    };

    replaceAssetIds(newShape.props);

    if (newShape.type === 'branch') {
        const props = (newShape as IBranchShape).props;
        const replaceBranchChildIds = (ids: string[] | undefined) =>
            (ids || [])
                .map(id => shapeIdMap.get(id) as string | undefined)
                .filter((id): id is string => !!id);

        newShape.props = {
            ...props,
            childIds: replaceBranchChildIds(props.childIds),
            leftChildIds: replaceBranchChildIds(props.leftChildIds),
            rightChildIds: replaceBranchChildIds(props.rightChildIds || props.childIds),
        };
    }
    
    return newShape;
}

/**
 * 将素材添加到画布
 */
export function addLibraryItemToCanvas(
    editor: Editor,
    item: ShapeLibraryItem,
    position: { x: number; y: number }
): void {
    try {
        const currentPageId = editor.getCurrentPageId();
        
        // 生成新的ID映射
        const shapeIdMap = generateNewShapeIds(item.shapes);
        const assetIdMap = generateNewAssetIds(item.assets);

        // 先添加资源
        for (const asset of item.assets) {
            const newAssetId = assetIdMap.get(asset.id);
            if (newAssetId) {
                const newAsset = {
                    ...JSON.parse(JSON.stringify(asset)),
                    id: newAssetId,
                };
                editor.createAssets([newAsset]);
            }
        }

        // 准备新形状
        const newShapes = item.shapes.map(shape => {
            const newShape = replaceIdsInShape(shape, shapeIdMap, assetIdMap, currentPageId);
            // 调整位置
            if (newShape.x !== undefined) {
                newShape.x += position.x;
            }
            if (newShape.y !== undefined) {
                newShape.y += position.y;
            }
            return newShape;
        });

        // 按照层级顺序创建形状（先创建父级）
        const sortedShapes = sortShapesByParentage(newShapes, shapeIdMap);
        
        editor.createShapes(sortedShapes);

        // 恢复绑定关系（连接器与形状的绑定）
        if (item.bindings && item.bindings.length > 0) {
            const bindingIdMap = generateNewBindingIds(item.bindings);
            const newBindings: TLBinding[] = [];
            
            for (const binding of item.bindings) {
                const newBinding = replaceIdsInBinding(binding, shapeIdMap, bindingIdMap);
                if (newBinding) {
                    newBindings.push(newBinding);
                }
            }
            
            // 批量创建绑定
            if (newBindings.length > 0) {
                editor.createBindings(newBindings);
                console.debug(`[素材库] 已恢复 ${newBindings.length} 个绑定关系`);
            }
        }

        // 选中新创建的形状
        const createdBranchIds = sortedShapes
            .filter((shape): shape is IBranchShape => shape.type === 'branch')
            .map(shape => shape.id);

        for (const branchId of createdBranchIds) {
            const branch = editor.getShape<IBranchShape>(branchId);
            if (branch?.type === 'branch') layoutBranchChildren(editor, branch);
        }

        if (createdBranchIds.length > 0) {
            relayoutBranchesContainingShapes(editor, createdBranchIds);
        }

        editor.select(...Array.from(shapeIdMap.values()));
        
        showMessage(`已添加 ${item.shapes.length} 个形状到画布`);
    } catch (err) {
        console.error('添加素材到画布失败:', err);
        showMessage('添加素材到画布失败', 3000, 'error');
    }
}

/**
 * 按父子关系排序形状，确保父级先创建
 */
function sortShapesByParentage(
    shapes: TLShape[],
    shapeIdMap: Map<string, TLShapeId>
): TLShape[] {
    const shapeIds = new Set(Array.from(shapeIdMap.values()).map(id => id as string));
    const sorted: TLShape[] = [];
    const remaining = [...shapes];
    const added = new Set<string>();

    // 反复迭代，直到所有形状都被添加
    let maxIterations = shapes.length + 1;
    while (remaining.length > 0 && maxIterations > 0) {
        maxIterations--;
        for (let i = remaining.length - 1; i >= 0; i--) {
            const shape = remaining[i];
            const parentId = shape.parentId as string;
            
            // 如果父级不在素材中，或者父级已经被添加，则可以添加此形状
            if (!shapeIds.has(parentId) || added.has(parentId)) {
                sorted.push(shape);
                added.add(shape.id as string);
                remaining.splice(i, 1);
            }
        }
    }

    // 如果还有剩余（可能是循环引用），直接添加
    sorted.push(...remaining);
    
    return sorted;
}

/**
 * 导出素材库
 */
export async function exportLibrary(): Promise<void> {
    try {
        const library = await loadShapeLibrary();
        const jsonData = JSON.stringify(library, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        
        // 创建下载链接
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shape-library-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showMessage('素材库已导出');
    } catch (err) {
        console.error('导出素材库失败:', err);
        showMessage('导出素材库失败', 3000, 'error');
    }
}

/**
 * 导入素材库
 */
export async function importLibrary(file: File, merge: boolean = true): Promise<void> {
    try {
        const text = await file.text();
        const importedData = JSON.parse(text) as ShapeLibraryData;
        
        if (!importedData.items || !Array.isArray(importedData.items)) {
            throw new Error('无效的素材库文件格式');
        }

        if (merge) {
            // 合并模式：保留现有素材
            const library = await loadShapeLibrary();
            const existingIds = new Set(library.items.map(item => item.id));
            
            for (const item of importedData.items) {
                if (!existingIds.has(item.id)) {
                    library.items.push(item);
                }
            }
            
            await saveShapeLibrary(library);
            showMessage(`已导入 ${importedData.items.length} 个素材（合并模式）`);
        } else {
            // 替换模式
            await saveShapeLibrary(importedData);
            showMessage(`已导入 ${importedData.items.length} 个素材（替换模式）`);
        }
    } catch (err) {
        console.error('导入素材库失败:', err);
        showMessage('导入素材库失败，请检查文件格式', 3000, 'error');
    }
}

/**
 * 重置素材库面板位置到默认值（并保存到插件存储）
 */
export async function resetShapeLibraryPanelPosition(): Promise<void> {
    try {
        const PANEL_POS_PATH = '/data/storage/petal/sttools/shape-library-panel.json';
        const defaultPos = { left: 40, top: 60 };
        const jsonData = JSON.stringify(defaultPos, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        await api.putFile(PANEL_POS_PATH, false, blob);
        try {
            window.dispatchEvent(new CustomEvent('shapeLibrary:posReset', { detail: defaultPos }));
        } catch (e) {
            // ignore
        }
        showMessage('素材库面板位置已重置');
    } catch (err) {
        console.warn('重置素材库面板位置失败', err);
        showMessage('重置面板位置失败', 3000, 'error');
    }
}
