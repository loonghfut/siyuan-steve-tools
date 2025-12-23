import { api } from "@frostime/siyuan-plugin-kits";
import { showMessage } from "siyuan";

/**
 * 获取所有备份文件列表
 * @returns 备份文件列表
 */
export interface BackupPreview {
    shapeCount: number;
    pageCount: number;
    pageNames: string[];
    shapeSamples: string[];
    // page previews: each page contains small array of simplified shape bounding boxes
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
        }>
    }>;
}

export async function getBackupList(): Promise<{ name: string, date: Date, path: string }[]> {
    try {
        // 获取回收站目录中的所有文件
        const fileList = await api.readDir('/data/storage/petal/sttools/trash/');

        // 只保留json文件
        const jsonFiles = fileList.filter(file =>
            file.isDir === false &&
            file.name.endsWith('.json') &&
            file.name.startsWith('tldraw-data-')
        );

        // 提取信息并排序
        const backupFiles = jsonFiles.map(file => {
            // 从文件名中提取时间戳
            const timestamp = file.name.match(/(\d+)\.json$/)?.[1];
            let date = new Date();

            if (timestamp) {
                date = new Date(parseInt(timestamp));
            }

            return {
                name: file.name,
                date: date,
                path: `/data/storage/petal/sttools/trash/${file.name}`
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
 * @param path 文件路径
 */
export async function deleteBackup(path: string): Promise<boolean> {
    try {
        await api.removeFile(path);
        return true;
    } catch (err) {
        console.error('删除备份文件失败:', err);
        return false;
    }
}

/**
 * 恢复备份文件到指定的TldrawManager实例
 * @param path 备份文件路径
 * @param manager 目标TldrawManager实例
 */
export async function restoreBackup(path: string, id: string): Promise<boolean> {
    try {
        // 获取备份文件内容
        let data = await api.getFile(path);
        console.debug('备份文件内容:', data);
        // 转化JSON对象为字符串
        if (typeof data === 'object') {
            data = JSON.stringify(data);
        }
        if (!data) {
            throw new Error('备份文件内容为空');
        }

        // 保存备份文件内容到目标位置
        await api.putFile(`/data/storage/petal/sttools/tldraw-data-${id}.json`, false, new Blob([data], { type: 'application/json' }));

        showMessage(`备份已恢复，请重新打开画板查看`);
        return true;
    } catch (err) {
        console.error('恢复备份失败:', err);
        showMessage('恢复备份失败: ' + err.message);
        return false;
    }
}

export async function getBackupPreview(path: string): Promise<BackupPreview> {
    try {
        let data = await api.getFile(path);
        if (!data) {
            throw new Error('备份文件为空');
        }

        if (typeof data === 'string') {
            data = JSON.parse(data);
        }

        // Normalize candidate document object
        const doc = data?.document ?? data;

        // TLDraw snapshots may use different layouts.
        // 1) Newer snapshots often put shapes/pages under `doc.store` as keys like 'shape:ID' / 'page:ID'.
        // 2) Other snapshots may use doc.pages / doc.pageStates or doc.shapes

        // Extract page entries
        let pageEntries: any[] = [];
        if (doc?.pages && typeof doc.pages === 'object') {
            pageEntries = Object.values(doc.pages);
        } else if (Array.isArray(doc?.pageStates)) {
            pageEntries = doc.pageStates;
        } else if (doc?.store && typeof doc.store === 'object') {
            // collect entries whose key starts with 'page:'
            pageEntries = Object.entries(doc.store)
                .filter(([k]) => typeof k === 'string' && k.startsWith('page:'))
                .map(([, v]) => v);
        } else if (doc?.session && Array.isArray(doc.session.pageStates)) {
            pageEntries = doc.session.pageStates;
        }

        // Extract shapes from common places
        let shapeEntries: Array<[string, any]> = [];
        if (doc?.shapes && typeof doc.shapes === 'object') {
            shapeEntries = Object.entries(doc.shapes);
        } else if (doc?.store && typeof doc.store === 'object') {
            // In snapshots stored under `store`, various record types are keyed. We only want shape records
            shapeEntries = Object.entries(doc.store).filter(([k, v]) => {
                if (typeof k === 'string' && k.startsWith('shape:')) return true;
                // fallback: if record looks like a shape
                try {
                    const vv: any = v;
                    return !!(vv && (vv.type === 'shape' || vv.typeName === 'shape' || typeof vv.type === 'string'));
                } catch (e) {
                    return false;
                }
            });
        }

        // Build preview values
        const pageNames = pageEntries.slice(0, 3).map((page: any) => page?.name || page?.title || page?.id || 'Page');
        const shapeSamples = shapeEntries.slice(0, 3).map(([id, shape]) => {
            const type = (shape && (shape.type || shape.typeName)) || (typeof id === 'string' ? id.split(':')[0] : 'shape');
            const label = shape?.props?.name || shape?.props?.text || shape?.props?.label || shape?.name || '';
            return `${type}${label ? ` (${label})` : ''}`;
        });

        // Convert shapes to a map keyed by id for easier page grouping
        const shapeMap = new Map<string, any>();
        shapeEntries.forEach(([id, shape]) => {
            shapeMap.set(typeof id === 'string' ? id : (shape?.id ?? Math.random().toString()), shape);
        });

        // Build simple per-page previews
        const pagePreviews: BackupPreview['pagePreviews'] = (pageEntries.length ? pageEntries : [{ id: 'page:page', name: 'Page 1' }]).map((page: any) => {
            const pid = page?.id ?? page?.pageId ?? 'page:page';

            // Collect shapes that belong to this page (parentId === pid) or fallback to shapes without parent
            const shapesForPage: any[] = [];
            for (const [sid, s] of shapeMap.entries()) {
                try {
                    const parent = s?.parentId ?? s?.parent ?? null;
                    if (!parent || parent === pid || parent === 'page:page') {
                        shapesForPage.push({ id: sid, data: s });
                    }
                } catch (e) {
                    // ignore
                }
            }

            // For each shape, derive a bounding box
            const simplified = shapesForPage.map(({ id: sid, data: s }) => {
                const px = typeof s?.x === 'number' ? s.x : (s?.props?.x ?? 0);
                const py = typeof s?.y === 'number' ? s.y : (s?.props?.y ?? 0);
                // try common size props
                const w = Number(s?.props?.w ?? s?.props?.width ?? s?.props?.w_px ?? s?.width ?? 0) || 0;
                const h = Number(s?.props?.h ?? s?.props?.height ?? s?.props?.h_px ?? s?.height ?? 0) || 0;

                // fallback to small shape box for connectors/inline shapes
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
        console.error('获取备份预览失败:', err);
        throw err;
    }
}

