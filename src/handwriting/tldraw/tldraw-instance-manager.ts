/**
 * TldrawManager实例注册表管理器
 * 提供集中式的白板实例和页签管理，避免事件驱动带来的时序问题
 */

import type { TldrawManager } from './tldraw-manager';
import type { Tab } from 'siyuan';

/**
 * 全局TldrawManager实例注册表
 */
const instanceRegistry = new Map<string, TldrawManager>();
const instanceFocusTimes = new Map<string, number>();
let focusedInstanceId: string | null = null;

/**
 * 全局Tab实例注册表（白板ID -> Tab）
 */
const tabRegistry = new Map<string, Tab>();

/**
 * 注册一个TldrawManager实例
 * @param id 白板ID
 * @param instance TldrawManager实例
 */
export function registerInstance(id: string, instance: TldrawManager): void {
    console.debug(`注册白板实例: ${id}`);
    instanceRegistry.set(id, instance);
    if (!focusedInstanceId) {
        markFocusedInstance(id);
    }
}

/**
 * 注销一个TldrawManager实例
 * @param id 白板ID
 */
export function unregisterInstance(id: string): void {
    console.debug(`注销白板实例: ${id}`);
    instanceRegistry.delete(id);
    instanceFocusTimes.delete(id);
    if (focusedInstanceId === id) {
        focusedInstanceId = getMostRecentlyFocusedOpenInstanceId();
    }
}

/**
 * 注册一个Tab实例
 * @param id 白板ID
 * @param tab Tab实例
 */
export function registerTab(id: string, tab: Tab): void {
    console.debug(`注册白板页签: ${id}`);
    tabRegistry.set(id, tab);
}

/**
 * 注销一个Tab实例
 * @param id 白板ID
 */
export function unregisterTab(id: string): void {
    console.debug(`注销白板页签: ${id}`);
    tabRegistry.delete(id);
}

/**
 * 获取指定ID的Tab实例
 * @param id 白板ID
 * @returns Tab实例，如果不存在则返回undefined
 */
export function getTab(id: string): Tab | undefined {
    return tabRegistry.get(id);
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

export function markFocusedInstance(id: string): void {
    if (!instanceRegistry.has(id)) return;
    focusedInstanceId = id;
    instanceFocusTimes.set(id, Date.now());
}

export function getFocusedInstanceId(): string | null {
    if (focusedInstanceId && instanceRegistry.has(focusedInstanceId)) {
        return focusedInstanceId;
    }
    focusedInstanceId = getMostRecentlyFocusedOpenInstanceId();
    return focusedInstanceId;
}

export function getInstanceFocusedAt(id: string): number | undefined {
    return instanceFocusTimes.get(id);
}

function getMostRecentlyFocusedOpenInstanceId(): string | null {
    let bestId: string | null = null;
    let bestTime = -1;
    for (const id of instanceRegistry.keys()) {
        const time = instanceFocusTimes.get(id) || 0;
        if (time > bestTime) {
            bestId = id;
            bestTime = time;
        }
    }
    return bestId;
}

/**
 * 关闭指定ID的白板页签（如果存在）
 * 这将自动触发页签的 destroy 回调，进而销毁 TldrawManager 实例
 * @param id 白板ID
 * @param reason 关闭原因
 * @returns 是否成功关闭了页签
 */
export function closeTab(id: string, reason: string = 'manual'): boolean {
    const tab = tabRegistry.get(id);
    if (!tab) {
        console.debug(`白板页签不存在，无需关闭: ${id}`);
        return false;
    }

    console.debug(`关闭白板页签: ${id}, 原因: ${reason}`);
    try {
        // 调用思源的页签关闭方法
        if (tab.close) {
            tab.close();
        } else if (tab.parent?.removeTab) {
            tab.parent.removeTab(tab.id);
        }
        return true;
    } catch (error) {
        console.error(`关闭白板页签失败: ${id}`, error);
        return false;
    }
}

/**
 * 关闭所有已注册的白板页签
 * @param reason 关闭原因
 */
export function closeAllTabs(reason: string = 'cleanup'): void {
    console.debug(`关闭所有白板页签, 原因: ${reason}`);
    const ids = Array.from(tabRegistry.keys());
    ids.forEach(id => closeTab(id, reason));
}

/**
 * 销毁指定ID的白板实例（如果存在）
 * @deprecated 推荐使用 closeTab 方法直接关闭页签
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
 * @deprecated 推荐使用 closeAllTabs 方法直接关闭页签
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

/**
 * 获取当前注册的页签数量
 * @returns 页签数量
 */
export function getTabCount(): number {
    return tabRegistry.size;
}

/**
 * 获取所有已注册的页签ID
 * @returns 页签ID列表
 */
export function getAllTabIds(): string[] {
    return Array.from(tabRegistry.keys());
}
