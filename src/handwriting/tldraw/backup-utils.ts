import { api } from '@frostime/siyuan-plugin-kits';

/**
 * 白板数据存储路径常量
 */
export const WHITEBOARD_STORAGE_DIR = '/data/storage/petal/sttools';
export const WHITEBOARD_TRASH_DIR = '/data/storage/petal/sttools/trash';

/**
 * 备份选项
 */
export interface BackupOptions {
    /** 备份原因/说明 */
    reason?: string;
    /** 是否在文件名中包含时间戳 */
    includeTimestamp?: boolean;
    /** 自定义备份文件名（不包含扩展名） */
    customFileName?: string;
}

/**
 * 备份结果
 */
export interface BackupResult {
    /** 是否成功 */
    success: boolean;
    /** 备份文件名 */
    fileName?: string;
    /** 备份文件完整路径 */
    filePath?: string;
    /** 错误信息 */
    error?: string;
}

/**
 * 确保回收站目录存在
 */
async function ensureTrashDirExists(): Promise<void> {
    try {
        await api.putFile(`${WHITEBOARD_TRASH_DIR}/.gitkeep`, false, new Blob([''], { type: 'text/plain' }));
    } catch (err) {
        // 目录可能已存在，忽略错误
    }
}

/**
 * 生成备份文件名
 * @param originalFileName 原始文件名
 * @param options 备份选项
 * @returns 备份文件名
 */
function generateBackupFileName(originalFileName: string, options: BackupOptions = {}): string {
    const { reason = '备份', includeTimestamp = true, customFileName } = options;
    
    if (customFileName) {
        return `${customFileName}.json`;
    }
    
    // 移除原文件的扩展名
    const baseName = originalFileName.replace(/\.json$/, '');
    
    const parts = [baseName];
    
    if (reason) {
        parts.push(reason);
    }
    
    if (includeTimestamp) {
        parts.push(Date.now().toString());
    }
    
    return `${parts.join('-')}.json`;
}

/**
 * 备份单个白板数据文件
 * @param sourcePath 源文件路径
 * @param options 备份选项
 * @returns 备份结果
 */
export async function backupWhiteboardFile(
    sourcePath: string,
    options: BackupOptions = {}
): Promise<BackupResult> {
    try {
        // 确保回收站目录存在
        await ensureTrashDirExists();
        
        // 读取源文件
        const content = await api.getFile(sourcePath);
        
        // 提取文件名
        const fileName = sourcePath.split('/').pop() || 'unknown.json';
        
        // 生成备份文件名
        const backupFileName = generateBackupFileName(fileName, options);
        const backupPath = `${WHITEBOARD_TRASH_DIR}/${backupFileName}`;
        
        // 转换为 Blob
        let fileBlob: Blob;
        if (typeof content === 'string') {
            fileBlob = new Blob([content], { type: 'application/json' });
        } else if (content instanceof ArrayBuffer) {
            fileBlob = new Blob([new Uint8Array(content)], { type: 'application/json' });
        } else if (ArrayBuffer.isView(content)) {
            // Ensure the view is copied into a new ArrayBuffer (avoids SharedArrayBuffer backing causing Blob type errors)
            const view = content as ArrayBufferView & { byteOffset?: number; byteLength?: number };
            const byteOffset = (view as any).byteOffset ?? 0;
            const byteLength = (view as any).byteLength ?? 0;
            const copy = new Uint8Array(view.buffer, byteOffset, byteLength).slice();
            fileBlob = new Blob([copy], { type: 'application/json' });
        } else if (content instanceof Blob) {
            fileBlob = content;
        } else {
            // 降级处理：尝试 JSON 序列化
            fileBlob = new Blob([JSON.stringify(content)], { type: 'application/json' });
        }
        
        // 写入备份文件
        await api.putFile(backupPath, false, fileBlob);
        
        return {
            success: true,
            fileName: backupFileName,
            filePath: backupPath,
        };
    } catch (err) {
        console.error('备份白板文件失败:', sourcePath, err);
        return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

/**
 * 备份多个白板数据文件
 * @param sourcePaths 源文件路径数组
 * @param options 备份选项
 * @returns 备份结果数组
 */
export async function backupWhiteboardFiles(
    sourcePaths: string[],
    options: BackupOptions = {}
): Promise<BackupResult[]> {
    const results: BackupResult[] = [];
    
    for (const path of sourcePaths) {
        const result = await backupWhiteboardFile(path, options);
        results.push(result);
    }
    
    return results;
}

/**
 * 从内存数据备份白板（用于 TldrawManager）
 * @param storageKey 存储键值（如 tldraw-data-xxx）
 * @param jsonData 要备份的 JSON 数据
 * @param options 备份选项
 * @returns 备份结果
 */
export async function backupWhiteboardData(
    storageKey: string,
    jsonData: string,
    options: BackupOptions = {}
): Promise<BackupResult> {
    try {
        // 确保回收站目录存在
        await ensureTrashDirExists();
        
        // 生成备份文件名
        const fileName = `${storageKey}.json`;
        const backupFileName = generateBackupFileName(fileName, options);
        const backupPath = `${WHITEBOARD_TRASH_DIR}/${backupFileName}`;
        
        // 创建 Blob
        const blob = new Blob([jsonData], { type: 'application/json' });
        
        // 写入备份文件
        await api.putFile(backupPath, false, blob);
        
        return {
            success: true,
            fileName: backupFileName,
            filePath: backupPath,
        };
    } catch (err) {
        console.error('备份白板数据失败:', storageKey, err);
        return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

/**
 * 获取统计信息
 * @param results 备份结果数组
 * @returns 成功和失败的数量
 */
export function getBackupStats(results: BackupResult[]): { success: number; failed: number } {
    return {
        success: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
    };
}
