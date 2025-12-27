/**
 * TldrawManager实例注册表管理器
 * 提供集中式的白板实例管理，避免事件驱动带来的时序问题
 */

import type { TldrawManager } from './tldraw-manager';

/**
 * 全局TldrawManager实例注册表
 */
const instanceRegistry = new Map<string, TldrawManager>();

/**
 * 注册一个TldrawManager实例
 * @param id 白板ID
 * @param instance TldrawManager实例
 */
export function registerInstance(id: string, instance: TldrawManager): void {
    console.debug(`注册白板实例: ${id}`);
    instanceRegistry.set(id, instance);
}

/**
 * 注销一个TldrawManager实例
 * @param id 白板ID
 */
export function unregisterInstance(id: string): void {
    console.debug(`注销白板实例: ${id}`);
    instanceRegistry.delete(id);
}

/**
 * 获取指定ID的TldrawManager实例
 * @param id 白板ID
 * @returns TldrawManager实例，如果不存在则返回undefined
 */
export function getInstance(id: string): TldrawManager | undefined {
    return instanceRegistry.get(id);
}

/**
 * 检查指定ID的实例是否存在
 * @param id 白板ID
 * @returns 实例是否存在
 */
export function hasInstance(id: string): boolean {
    return instanceRegistry.has(id);
}

/**
 * 获取所有已注册的实例ID
 * @returns 实例ID列表
 */
export function getAllInstanceIds(): string[] {
    return Array.from(instanceRegistry.keys());
}

/**
 * 销毁指定ID的白板实例（如果存在）
 * @param id 白板ID
 * @param reason 销毁原因
 * @returns 是否成功销毁了实例
 */
export async function destroyInstance(id: string, reason: string = 'manual'): Promise<boolean> {
    const instance = instanceRegistry.get(id);
    if (!instance) {
        console.debug(`白板实例不存在，无需销毁: ${id}`);
        return false;
    }

    console.debug(`销毁白板实例: ${id}, 原因: ${reason}`);
    try {
        await instance.destroy({ 
            skipSave: true, 
            reason: reason === 'data-deleted' ? 'data-deleted' : 'user-delete' 
        });
        return true;
    } catch (error) {
        console.error(`销毁白板实例失败: ${id}`, error);
        return false;
    }
}

/**
 * 销毁所有已注册的实例
 * @param reason 销毁原因
 */
export async function destroyAllInstances(reason: string = 'cleanup'): Promise<void> {
    console.debug(`销毁所有白板实例, 原因: ${reason}`);
    const ids = Array.from(instanceRegistry.keys());
    await Promise.all(ids.map(id => destroyInstance(id, reason)));
}

/**
 * 获取当前注册的实例数量
 * @returns 实例数量
 */
export function getInstanceCount(): number {
    return instanceRegistry.size;
}
