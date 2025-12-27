/**
 * 白板文件管理器
 * 统一管理白板文件的创建、读取、保存、备份、恢复、删除等操作
 */

import { api } from '@frostime/siyuan-plugin-kits';
import { showMessage } from 'siyuan';

/**
 * 白板数据存储路径常量
 */
export const WHITEBOARD_STORAGE_DIR = '/data/storage/petal/sttools';
export const WHITEBOARD_TRASH_DIR = '/data/storage/petal/sttools/trash';

/**
 * 文件操作选项
 */
export interface FileOperationOptions {
    /** 操作原因/说明 */
    reason?: string;
    /** 是否在文件名中包含时间戳 */
    includeTimestamp?: boolean;
    /** 自定义文件名（不包含扩展名） */
    customFileName?: string;
}

/**
 * 文件操作结果
 */
export interface FileOperationResult {
    /** 是否成功 */
    success: boolean;
    /** 文件名 */
    fileName?: string;
    /** 文件完整路径 */
    filePath?: string;
    /** 错误信息 */
    error?: string;
    /** 额外数据 */
    data?: any;
}

/**
 * 备份文件信息
 */
export interface BackupFileInfo {
    /** 文件名 */
    name: string;
    /** 创建日期 */
    date: Date;
    /** 文件路径 */
    path: string;
    /** 白板ID */
    drawingId: string;
    /** 白板标题 */
    title?: string;
}

/**
 * 备份预览信息
 */
export interface BackupPreview {
    /** 形状数量 */
    shapeCount: number;
    /** 页面数量 */
    pageCount: number;
    /** 页面名称列表 */
    pageNames: string[];
    /** 形状示例 */
    shapeSamples: string[];
    /** 页面预览 */
    pagePreviews?: Array<{
        id?: string;
        name?: string;
        shapes: Array<{
            id?: string;
            type?: string;
            x: number;
            y: number;
            w: number;
            h: number;
        }>;
    }>;
}

/**
 * 白板文件管理器类
 */
export class WhiteboardFileManager {
    /**
     * 确保回收站目录存在
     */
    private static async ensureTrashDirExists(): Promise<void> {
        try {
            await api.putFile(`${WHITEBOARD_TRASH_DIR}/.gitkeep`, false, new Blob([''], { type: 'text/plain' }));
        } catch (err) {
            // 目录可能已存在，忽略错误
        }
    }

    /**
     * 生成存储键值（白板数据文件名前缀）
     * @param whiteboardId 白板ID
     * @returns 存储键值
     */
    private static getStorageKey(whiteboardId: string): string {
        return `tldraw-data-${whiteboardId}`;
    }

    /**
     * 获取白板文件路径
     * @param whiteboardId 白板ID
     * @returns 文件路径
     */
    private static getWhiteboardFilePath(whiteboardId: string): string {
        const storageKey = this.getStorageKey(whiteboardId);
        return `${WHITEBOARD_STORAGE_DIR}/${storageKey}.json`;
    }

    /**
     * 生成备份文件名
     * @param whiteboardId 白板ID
     * @param options 文件操作选项
     * @returns 备份文件名
     */
    private static generateBackupFileName(whiteboardId: string, options: FileOperationOptions = {}): string {
        const { reason = '备份', includeTimestamp = true, customFileName } = options;
        
        if (customFileName) {
            return `${customFileName}.json`;
        }
        
        const storageKey = this.getStorageKey(whiteboardId);
        const parts = [storageKey];
        
        if (reason) {
            parts.push(reason);
        }
        
        if (includeTimestamp) {
            parts.push(Date.now().toString());
        }
        
        return `${parts.join('-')}.json`;
    }

    /**
     * 转换数据为 Blob
     * @param content 要转换的内容
     * @returns Blob 对象
     */
    private static contentToBlob(content: any): Blob {
        // 如果是字符串，直接创建 Blob
        if (typeof content === 'string') {
            return new Blob([content], { type: 'application/json' });
        }
        
        // 如果是 ArrayBuffer
        if (content instanceof ArrayBuffer) {
            return new Blob([new Uint8Array(content)], { type: 'application/json' });
        }
        
        // 如果是 ArrayBufferView
        if (ArrayBuffer.isView(content)) {
            const view = content as ArrayBufferView & { byteOffset?: number; byteLength?: number };
            const byteOffset = (view as any).byteOffset ?? 0;
            const byteLength = (view as any).byteLength ?? 0;
            const copy = new Uint8Array(view.buffer, byteOffset, byteLength).slice();
            return new Blob([copy], { type: 'application/json' });
        }
        
        // 如果已经是 Blob
        if (content instanceof Blob) {
            return content;
        }
        
        // 其他类型，尝试 JSON 序列化
        return new Blob([JSON.stringify(content)], { type: 'application/json' });
    }

    /**
     * 从白板ID中提取（通常白板ID就是块ID）
     * @param whiteboardId 白板ID
     * @returns 提取的ID
     */
    private static extractDrawingId(fileName: string): string {
        // 从文件名提取白板ID: tldraw-data-{id}-备份-timestamp.json -> {id}
        const match = fileName.match(/^tldraw-data-([^-]+)/);
        return match ? match[1] : '';
    }

    // ==================== 基础文件操作 ====================

    /**
     * 读取白板文件
     * @param whiteboardId 白板ID
     * @returns 文件内容（JSON字符串）
     */
    static async readWhiteboardFile(whiteboardId: string): Promise<string | null> {
        try {
            const filePath = this.getWhiteboardFilePath(whiteboardId);
            const content = await api.getFile(filePath);
            
            if (!content) {
                return null;
            }
            
            // 确保返回字符串
            if (typeof content === 'string') {
                return content;
            }
            
            if (typeof content === 'object') {
                return JSON.stringify(content);
            }
            
            return null;
        } catch (err) {
            console.error('读取白板文件失败:', whiteboardId, err);
            return null;
        }
    }

    /**
     * 保存白板文件
     * @param whiteboardId 白板ID
     * @param jsonData JSON数据（字符串或对象）
     * @returns 操作结果
     */
    static async saveWhiteboardFile(whiteboardId: string, jsonData: string | object): Promise<FileOperationResult> {
        try {
            const filePath = this.getWhiteboardFilePath(whiteboardId);
            const dataStr = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData);
            const blob = new Blob([dataStr], { type: 'application/json' });
            
            await api.putFile(filePath, false, blob);
            
            return {
                success: true,
                fileName: `${this.getStorageKey(whiteboardId)}.json`,
                filePath,
            };
        } catch (err) {
            console.error('保存白板文件失败:', whiteboardId, err);
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    /**
     * 删除白板文件（移动到回收站）
     * @param whiteboardId 白板ID
     * @param options 文件操作选项
     * @returns 操作结果
     */
    static async deleteWhiteboardFile(whiteboardId: string, options: FileOperationOptions = {}): Promise<FileOperationResult> {
        try {
            const filePath = this.getWhiteboardFilePath(whiteboardId);
            
            // 确保回收站目录存在
            await this.ensureTrashDirExists();
            
            // 读取文件内容
            const content = await api.getFile(filePath);
            if (!content) {
                return {
                    success: false,
                    error: '文件不存在',
                };
            }
            
            // 生成回收站文件名
            const trashFileName = this.generateBackupFileName(whiteboardId, {
                reason: options.reason || '删除',
                includeTimestamp: true,
            });
            const trashPath = `${WHITEBOARD_TRASH_DIR}/${trashFileName}`;
            
            // 转换为 Blob 并保存到回收站
            const blob = this.contentToBlob(content);
            await api.putFile(trashPath, false, blob);
            
            // 删除原文件
            await api.removeFile(filePath);
            
            return {
                success: true,
                fileName: trashFileName,
                filePath: trashPath,
            };
        } catch (err) {
            console.error('删除白板文件失败:', whiteboardId, err);
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    // ==================== 备份相关操作 ====================

    /**
     * 备份白板文件
     * @param whiteboardId 白板ID
     * @param options 文件操作选项
     * @returns 操作结果
     */
    static async backupWhiteboardFile(whiteboardId: string, options: FileOperationOptions = {}): Promise<FileOperationResult> {
        try {
            // 确保回收站目录存在
            await this.ensureTrashDirExists();
            
            // 读取源文件
            const filePath = this.getWhiteboardFilePath(whiteboardId);
            const content = await api.getFile(filePath);
            
            if (!content) {
                return {
                    success: false,
                    error: '源文件不存在',
                };
            }
            
            // 生成备份文件名
            const backupFileName = this.generateBackupFileName(whiteboardId, options);
            const backupPath = `${WHITEBOARD_TRASH_DIR}/${backupFileName}`;
            
            // 转换为 Blob 并写入备份文件
            const blob = this.contentToBlob(content);
            await api.putFile(backupPath, false, blob);
            
            return {
                success: true,
                fileName: backupFileName,
                filePath: backupPath,
            };
        } catch (err) {
            console.error('备份白板文件失败:', whiteboardId, err);
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    /**
     * 从内存数据备份白板
     * @param whiteboardId 白板ID
     * @param jsonData JSON数据（字符串或对象）
     * @param options 文件操作选项
     * @returns 操作结果
     */
    static async backupWhiteboardData(whiteboardId: string, jsonData: string | object, options: FileOperationOptions = {}): Promise<FileOperationResult> {
        try {
            // 确保回收站目录存在
            await this.ensureTrashDirExists();
            
            // 生成备份文件名
            const backupFileName = this.generateBackupFileName(whiteboardId, options);
            const backupPath = `${WHITEBOARD_TRASH_DIR}/${backupFileName}`;
            
            // 转换为字符串
            const dataStr = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData);
            
            // 创建 Blob 并写入备份文件
            const blob = new Blob([dataStr], { type: 'application/json' });
            await api.putFile(backupPath, false, blob);
            
            return {
                success: true,
                fileName: backupFileName,
                filePath: backupPath,
            };
        } catch (err) {
            console.error('备份白板数据失败:', whiteboardId, err);
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    /**
     * 获取所有备份文件列表
     * @returns 备份文件列表
     */
    static async getBackupList(): Promise<BackupFileInfo[]> {
        try {
            // 获取回收站目录中的所有文件
            const fileList = await api.readDir(WHITEBOARD_TRASH_DIR);
            
            // 只保留json文件
            const jsonFiles = fileList.filter(file =>
                file.isDir === false &&
                file.name.endsWith('.json') &&
                file.name.startsWith('tldraw-data-')
            );
            
            // 提取信息并排序
            const backupFiles: BackupFileInfo[] = jsonFiles.map(file => {
                // 从文件名中提取时间戳
                const timestamp = file.name.match(/(\d+)\.json$/)?.[1];
                let date = new Date();
                
                if (timestamp) {
                    date = new Date(parseInt(timestamp));
                }
                
                return {
                    name: file.name,
                    date: date,
                    path: `${WHITEBOARD_TRASH_DIR}/${file.name}`,
                    drawingId: this.extractDrawingId(file.name),
                };
            });
            
            // 按时间降序排列
            return backupFiles.sort((a, b) => b.date.getTime() - a.date.getTime());
        } catch (err) {
            console.error('获取备份列表失败:', err);
            return [];
        }
    }

    /**
     * 删除备份文件
     * @param backupPath 备份文件路径
     * @returns 操作结果
     */
    static async deleteBackupFile(backupPath: string): Promise<FileOperationResult> {
        try {
            await api.removeFile(backupPath);
            return {
                success: true,
            };
        } catch (err) {
            console.error('删除备份文件失败:', backupPath, err);
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }

    /**
     * 恢复备份文件
     * @param backupPath 备份文件路径
     * @param whiteboardId 目标白板ID
     * @returns 操作结果
     */
    static async restoreBackupFile(backupPath: string, whiteboardId: string): Promise<FileOperationResult> {
        try {
            // 读取备份文件内容
            let data = await api.getFile(backupPath);
            
            if (!data) {
                return {
                    success: false,
                    error: '备份文件内容为空',
                };
            }
            
            // 转换为字符串
            const dataStr = typeof data === 'object' ? JSON.stringify(data) : String(data);
            
            // 保存到目标位置
            const result = await this.saveWhiteboardFile(whiteboardId, dataStr);
            
            if (result.success) {
                showMessage('备份已恢复，请重新打开画板查看');
            }
            
            return result;
        } catch (err) {
            console.error('恢复备份失败:', backupPath, err);
            const errorMsg = err instanceof Error ? err.message : String(err);
            showMessage('恢复备份失败: ' + errorMsg);
            return {
                success: false,
                error: errorMsg,
            };
        }
    }

    /**
     * 获取备份文件预览信息
     * @param backupPath 备份文件路径
     * @returns 备份预览信息
     */
    static async getBackupPreview(backupPath: string): Promise<BackupPreview> {
        try {
            let data = await api.getFile(backupPath);
            
            if (!data) {
                throw new Error('备份文件为空');
            }
            
            if (typeof data === 'string') {
                data = JSON.parse(data);
            }
            
            // 规范化文档对象
            const doc = data?.document ?? data;
            
            // 提取页面条目
            let pageEntries: any[] = [];
            if (doc?.pages && typeof doc.pages === 'object') {
                pageEntries = Object.values(doc.pages);
            } else if (Array.isArray(doc?.pageStates)) {
                pageEntries = doc.pageStates;
            } else if (doc?.store && typeof doc.store === 'object') {
                pageEntries = Object.entries(doc.store)
                    .filter(([k]) => typeof k === 'string' && k.startsWith('page:'))
                    .map(([, v]) => v);
            } else if (doc?.session && Array.isArray(doc.session.pageStates)) {
                pageEntries = doc.session.pageStates;
            }
            
            // 提取形状条目
            let shapeEntries: Array<[string, any]> = [];
            if (doc?.shapes && typeof doc.shapes === 'object') {
                shapeEntries = Object.entries(doc.shapes);
            } else if (doc?.store && typeof doc.store === 'object') {
                shapeEntries = Object.entries(doc.store).filter(([k, v]) => {
                    if (typeof k === 'string' && k.startsWith('shape:')) return true;
                    try {
                        const vv: any = v;
                        return !!(vv && (vv.type === 'shape' || vv.typeName === 'shape' || typeof vv.type === 'string'));
                    } catch (e) {
                        return false;
                    }
                });
            }
            
            // 构建预览值
            const pageNames = pageEntries.slice(0, 3).map((page: any) => 
                page?.name || page?.title || page?.id || 'Page'
            );
            
            const shapeSamples = shapeEntries.slice(0, 3).map(([id, shape]) => {
                const type = (shape && (shape.type || shape.typeName)) || 
                    (typeof id === 'string' ? id.split(':')[0] : 'shape');
                const label = shape?.props?.name || shape?.props?.text || 
                    shape?.props?.label || shape?.name || '';
                return `${type}${label ? ` (${label})` : ''}`;
            });
            
            // 将形状转换为以 id 为键的 Map
            const shapeMap = new Map<string, any>();
            shapeEntries.forEach(([id, shape]) => {
                shapeMap.set(typeof id === 'string' ? id : (shape?.id ?? Math.random().toString()), shape);
            });
            
            // 构建每个页面的简单预览
            const pagePreviews: BackupPreview['pagePreviews'] = (
                pageEntries.length ? pageEntries : [{ id: 'page:page', name: 'Page 1' }]
            ).map((page: any) => {
                const pid = page?.id ?? page?.pageId ?? 'page:page';
                
                // 收集属于此页面的形状
                const shapesForPage: any[] = [];
                for (const [sid, s] of shapeMap.entries()) {
                    try {
                        const parent = s?.parentId ?? s?.parent ?? null;
                        if (!parent || parent === pid || parent === 'page:page') {
                            shapesForPage.push({ id: sid, data: s });
                        }
                    } catch (e) {
                        // 忽略错误
                    }
                }
                
                // 为每个形状派生边界框
                const simplified = shapesForPage.map(({ id: sid, data: s }) => {
                    const px = typeof s?.x === 'number' ? s.x : (s?.props?.x ?? 0);
                    const py = typeof s?.y === 'number' ? s.y : (s?.props?.y ?? 0);
                    const w = Number(s?.props?.w ?? s?.props?.width ?? s?.props?.w_px ?? s?.width ?? 0) || 0;
                    const h = Number(s?.props?.h ?? s?.props?.height ?? s?.props?.h_px ?? s?.height ?? 0) || 0;
                    
                    const finalW = w > 0 ? w : 100;
                    const finalH = h > 0 ? h : 60;
                    
                    return {
                        id: sid,
                        type: s?.type || s?.typeName || sid?.split(':')?.[0] || 'shape',
                        x: px,
                        y: py,
                        w: finalW,
                        h: finalH
                    };
                });
                
                return {
                    id: pid,
                    name: page?.name || page?.title || pid,
                    shapes: simplified
                };
            });
            
            return {
                shapeCount: shapeEntries.length,
                pageCount: pageEntries.length,
                pageNames,
                shapeSamples,
                pagePreviews
            };
        } catch (err) {
            console.error('获取备份预览失败:', backupPath, err);
            throw err;
        }
    }

    // ==================== 批量操作 ====================

    /**
     * 批量备份白板文件
     * @param whiteboardIds 白板ID数组
     * @param options 文件操作选项
     * @returns 操作结果数组
     */
    static async batchBackupWhiteboards(whiteboardIds: string[], options: FileOperationOptions = {}): Promise<FileOperationResult[]> {
        const results: FileOperationResult[] = [];
        
        for (const id of whiteboardIds) {
            const result = await this.backupWhiteboardFile(id, options);
            results.push(result);
        }
        
        return results;
    }

    /**
     * 批量删除白板文件
     * @param whiteboardIds 白板ID数组
     * @param options 文件操作选项
     * @returns 操作结果数组
     */
    static async batchDeleteWhiteboards(whiteboardIds: string[], options: FileOperationOptions = {}): Promise<FileOperationResult[]> {
        const results: FileOperationResult[] = [];
        
        for (const id of whiteboardIds) {
            const result = await this.deleteWhiteboardFile(id, options);
            results.push(result);
        }
        
        return results;
    }

    /**
     * 清理过期备份文件
     * @param daysToKeep 保留天数（超过此天数的备份将被删除）
     * @returns 删除的文件数量
     */
    static async cleanupOldBackups(daysToKeep: number = 30): Promise<number> {
        try {
            const backups = await this.getBackupList();
            const now = Date.now();
            const cutoffTime = now - (daysToKeep * 24 * 60 * 60 * 1000);
            
            let deletedCount = 0;
            
            for (const backup of backups) {
                if (backup.date.getTime() < cutoffTime) {
                    const result = await this.deleteBackupFile(backup.path);
                    if (result.success) {
                        deletedCount++;
                    }
                }
            }
            
            return deletedCount;
        } catch (err) {
            console.error('清理过期备份失败:', err);
            return 0;
        }
    }

    // ==================== 工具方法 ====================

    /**
     * 检查白板文件是否存在
     * @param whiteboardId 白板ID
     * @returns 是否存在
     */
    static async whiteboardFileExists(whiteboardId: string): Promise<boolean> {
        try {
            const content = await this.readWhiteboardFile(whiteboardId);
            return content !== null;
        } catch (err) {
            return false;
        }
    }

    /**
     * 获取白板文件大小
     * @param whiteboardId 白板ID
     * @returns 文件大小（字节）
     */
    static async getWhiteboardFileSize(whiteboardId: string): Promise<number> {
        try {
            const content = await this.readWhiteboardFile(whiteboardId);
            if (content === null) {
                return 0;
            }
            return new Blob([content]).size;
        } catch (err) {
            console.error('获取文件大小失败:', whiteboardId, err);
            return 0;
        }
    }

    /**
     * 获取操作统计信息
     * @param results 操作结果数组
     * @returns 成功和失败的数量
     */
    static getOperationStats(results: FileOperationResult[]): { success: number; failed: number } {
        return results.reduce(
            (stats, result) => {
                if (result.success) {
                    stats.success++;
                } else {
                    stats.failed++;
                }
                return stats;
            },
            { success: 0, failed: 0 }
        );
    }
}

// 导出便捷别名
export const fileManager = WhiteboardFileManager;
