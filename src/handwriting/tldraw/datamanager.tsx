import { api } from "@frostime/siyuan-plugin-kits";
import { showMessage } from "siyuan";

/**
 * 获取所有备份文件列表
 * @returns 备份文件列表
 */
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
        const data = await api.getFile(path);
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

