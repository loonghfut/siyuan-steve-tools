/**
 * Vite 插件：私有统计模块条件编译
 * 在构建开始前自动处理 private-stats.ts 文件
 */

import { promises as fs } from 'fs';
import { resolve } from 'path';

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
async function handlePrivateStats(rootDir) {
    const STATS_DIR = resolve(rootDir, 'src/stats');
    const PRIVATE_STATS_FILE = resolve(STATS_DIR, 'private-stats.ts');
    const STUB_FILE = resolve(STATS_DIR, 'private-stats.stub.ts');

    // console.log('🔍 检查私有统计模块...');

    const privateStatsExists = await fileExists(PRIVATE_STATS_FILE);
    const stubExists = await fileExists(STUB_FILE);

    if (!privateStatsExists && !stubExists) {
        throw new Error('既找不到 private-stats.ts 也找不到 private-stats.stub.ts');
    }

    if (!privateStatsExists) {
        // console.log('📝 private-stats.ts 不存在，从 stub 文件创建...');
        
        await fs.copyFile(STUB_FILE, PRIVATE_STATS_FILE);
        // console.log('✅ 已从 private-stats.stub.ts 创建 private-stats.ts');
        // console.log('📢 统计功能将被禁用（使用存根实现）');
        
        return { created: true, isStub: true };
    } else {
        // 检查是否是真实的私有模块还是存根
        try {
            const content = await fs.readFile(PRIVATE_STATS_FILE, 'utf-8');
            const isStub = content.includes('存根实现') || content.includes('stub');
            
            if (isStub) {
                // console.log('📢 使用存根实现，统计功能已禁用');
            } else {
                // console.log('📊 使用真实的私有统计模块');
            }
            
            return { created: false, isStub };
        } catch (error) {
            console.warn('⚠️  无法读取 private-stats.ts 文件内容');
            return { created: false, isStub: false };
        }
    }
}

/**
 * 创建 Vite 插件
 */
export default function vitePrivateStatsPlugin(options = {}) {
    let rootDir;
    let statsInfo = null;

    return {
        name: 'vite-private-stats',
        
        configResolved(config) {
            rootDir = config.root;
        },

        async buildStart() {
            try {
                statsInfo = await handlePrivateStats(rootDir);
            } catch (error) {
                this.error(`私有统计模块处理失败: ${error.message}`);
            }
        },

        // 在开发模式下，监听文件变化
        configureServer(server) {
            const STATS_DIR = resolve(rootDir, 'src/stats');
            const PRIVATE_STATS_FILE = resolve(STATS_DIR, 'private-stats.ts');
            const STUB_FILE = resolve(STATS_DIR, 'private-stats.stub.ts');

            // 监听 stub 文件变化
            server.watcher.add(STUB_FILE);
            
            server.watcher.on('change', async (file) => {
                if (file === STUB_FILE) {
                    console.log('📝 检测到 private-stats.stub.ts 变化，检查是否需要更新...');
                    
                    const privateStatsExists = await fileExists(PRIVATE_STATS_FILE);
                    if (!privateStatsExists) {
                        await handlePrivateStats(rootDir);
                        server.ws.send({
                            type: 'full-reload'
                        });
                    }
                }
            });
        }
    };
}
