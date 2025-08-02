/**
 * 私有统计模块条件编译处理脚本
 * 检查 private-stats.ts 是否存在，如果不存在则自动从 stub 文件复制
 */

import { promises as fs } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const STATS_DIR = resolve(__dirname, '../src/stats');
const PRIVATE_STATS_FILE = resolve(STATS_DIR, 'private-stats.ts');
const STUB_FILE = resolve(STATS_DIR, 'private-stats.stub.ts');

/**
 * 检查文件是否存在
 */
async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * 处理私有统计模块
 */
async function handlePrivateStats() {
    const privateStatsExists = await fileExists(PRIVATE_STATS_FILE);
    const stubExists = await fileExists(STUB_FILE);

    if (!privateStatsExists && !stubExists) {
        console.error('❌ 错误：既找不到 private-stats.ts 也找不到 private-stats.stub.ts');
        process.exit(1);
    }

    if (!privateStatsExists) {
        console.log('📝 private-stats.ts 不存在，从 stub 文件创建...');
        
        try {
            await fs.copyFile(STUB_FILE, PRIVATE_STATS_FILE);
        } catch (error) {
            console.error('❌ 复制文件失败:', error);
            process.exit(1);
        }
    } else {
        console.log('✅ private-stats.ts 已存在');
        
        // 检查是否是真实的私有模块还是存根
        try {
            const content = await fs.readFile(PRIVATE_STATS_FILE, 'utf-8');
            if (content.includes('存根实现') || content.includes('stub')) {
            } else {
            }
        } catch (error) {
            console.warn('⚠️  无法读取 private-stats.ts 文件内容');
        }
    }
}

/**
 * 清理临时创建的文件（可选）
 */
async function cleanup() {
    const shouldCleanup = process.argv.includes('--cleanup');
    if (!shouldCleanup) return;

    console.log('🧹 清理模式：检查是否需要删除临时创建的 private-stats.ts...');
    
    try {
        const content = await fs.readFile(PRIVATE_STATS_FILE, 'utf-8');
        if (content.includes('存根实现') || content.includes('stub')) {
            await fs.unlink(PRIVATE_STATS_FILE);
            console.log('✅ 已删除临时创建的 private-stats.ts');
        }
    } catch (error) {
        // 文件可能不存在或无法读取，忽略错误
    }
}

// 主执行逻辑
async function main() {
    try {
        await handlePrivateStats();
        
        // 如果是清理模式，则清理文件
        if (process.argv.includes('--cleanup')) {
            await cleanup();
        }
    } catch (error) {
        console.error('❌ 处理私有统计模块时发生错误:', error);
        process.exit(1);
    }
}

// 导出函数以便在其他脚本中使用
export { handlePrivateStats, cleanup };

// 如果直接运行此脚本
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
