import { moduleInstances } from '..';

// 分组配置接口
export interface ViewGroup {
    id: string;
    name: string;
    icon?: string;
    viewIds: string[];
    isExpanded?: boolean;
    isHidden?: boolean;
}

// 当前用户分组（运行期可变状态）
export let userGroups: ViewGroup[] = [];

// 未分组的隐藏状态
let isUngroupedHidden = false;

const defaultGroups: ViewGroup[] = [
    {
        id: 'external',
        name: '外部日历',
        icon: '外',
        viewIds: ['qqcalendar', 'icsSubscription'],
        isExpanded: true,
        isHidden: false
    },
    {
        id: 'special',
        name: '特殊功能',
        icon: '特',
        viewIds: ['lifelog', 'recurring'],
        isExpanded: true,
        isHidden: false
    }
];

// ============== 持久化 ==============
function loadUserGroups(): ViewGroup[] {
    try {
        const saved = moduleInstances['M_calendar'].calConfig.get("userGroups");
        return saved ? JSON.parse(saved as string) : [];
    } catch (error) {
        console.error('加载用户分组失败:', error);
        return [];
    }
}

export function saveUserGroups(groups: ViewGroup[]) {
    try {
        moduleInstances['M_calendar'].calConfig.set("userGroups", JSON.stringify(groups));
        moduleInstances['M_calendar'].calConfig.save();
        userGroups = [...groups];
    } catch (error) {
        console.error('保存用户分组失败:', error);
    }
}

export function initializeGroups() {
    userGroups = loadUserGroups();
    if (userGroups.length === 0) {
        userGroups = [...defaultGroups];
        saveUserGroups(userGroups);
    }
    isUngroupedHidden = loadUngroupedVisibility();
}

// ============== 分组 CRUD ==============
export function createNewGroup(name: string, icon: string = ''): ViewGroup {
    return {
        id: Date.now().toString(),
        name,
        icon,
        viewIds: [],
        isExpanded: true,
        isHidden: false
    };
}

export function addViewToGroup(groupId: string, viewId: string) {
    const group = userGroups.find(g => g.id === groupId);
    if (group && !group.viewIds.includes(viewId)) {
        group.viewIds.push(viewId);
        saveUserGroups(userGroups);
    }
}

export function removeViewFromGroup(groupId: string, viewId: string) {
    const group = userGroups.find(g => g.id === groupId);
    if (group) {
        group.viewIds = group.viewIds.filter(id => id !== viewId);
        saveUserGroups(userGroups);
    }
}

export function deleteGroup(groupId: string) {
    userGroups = userGroups.filter(g => g.id !== groupId);
    saveUserGroups(userGroups);
}

export function toggleGroupVisibility(groupId: string) {
    const group = userGroups.find(g => g.id === groupId);
    if (group) {
        group.isHidden = !group.isHidden;
        saveUserGroups(userGroups);
    }
}

/** 按 id 列表给 userGroups 重排序，跳过未知 id */
export function reorderGroups(orderedIds: string[]) {
    const map = new Map(userGroups.map(g => [g.id, g]));
    const next: ViewGroup[] = [];
    orderedIds.forEach(id => {
        const g = map.get(id);
        if (g) {
            next.push(g);
            map.delete(id);
        }
    });
    // 兜底：把未在 orderedIds 中的分组追加在末尾，避免数据丢失
    map.forEach(g => next.push(g));
    userGroups = next;
    saveUserGroups(userGroups);
}

// ============== 未分组可见性 ==============
export function toggleUngroupedVisibility() {
    isUngroupedHidden = !isUngroupedHidden;
    saveUngroupedVisibility();
}

export function isUngroupedVisible(): boolean {
    return !isUngroupedHidden;
}

export function isUngroupedHiddenState(): boolean {
    return isUngroupedHidden;
}

function loadUngroupedVisibility(): boolean {
    try {
        const saved = moduleInstances['M_calendar'].calConfig.get("isUngroupedHidden");
        return saved === 'true';
    } catch (error) {
        console.error('加载未分组隐藏状态失败:', error);
        return false;
    }
}

function saveUngroupedVisibility() {
    try {
        moduleInstances['M_calendar'].calConfig.set("isUngroupedHidden", isUngroupedHidden.toString());
        moduleInstances['M_calendar'].calConfig.save();
    } catch (error) {
        console.error('保存未分组隐藏状态失败:', error);
    }
}

// ============== 工具函数 ==============
export function safeGroupIcon(icon?: string): string {
    if (!icon) return '';
    return /\p{Extended_Pictographic}/u.test(icon) ? '' : icon;
}

export function getUngroupedViews(allViewIds: string[]): string[] {
    const groupedViewIds = new Set<string>();
    userGroups.forEach(group => {
        group.viewIds.forEach(id => groupedViewIds.add(id));
    });
    return allViewIds.filter(id => !groupedViewIds.has(id));
}

/** 获取所有视图 ID（含特殊视图），并去重 */
export function getAllViewIds(viewIDs: any[]): string[] {
    const allSpecialViewIds = ['qqcalendar', 'icsSubscription', 'lifelog', 'recurring'];
    const allSiyuanViewIds = viewIDs.map(v => v.viewId);
    return [...new Set([...allSpecialViewIds, ...allSiyuanViewIds])];
}

/** 视图 id → 显示名（特殊视图走预定义表，其余走 viewIDs 查找） */
export function getViewLabel(viewId: string, viewIDs: any[]): string | null {
    switch (viewId) {
        case 'qqcalendar': return 'QQ邮箱日历';
        case 'icsSubscription': return 'ICS订阅日历';
        case 'lifelog': return 'Lifelog 记录';
        case 'recurring': return '周期事件';
        default: {
            const view = viewIDs.find(v => v.viewId === viewId);
            return view ? view.name : null;
        }
    }
}

// 视图筛选 UI 入口在 view-filter-panel.ts 中实现，并由 calendar.ts 直接引用。
export { createViewFilterMenu } from './view-filter-panel';
