import { moduleInstances } from '..';
import { av_ids } from './calendar';

// 分组配置接口
export interface ViewGroup {
    id: string;
    name: string;
    icon?: string;
    viewIds: string[];
    isExpanded?: boolean;
}
// 默认分组配置
export let userGroups: ViewGroup[] = [];
const defaultGroups: ViewGroup[] = [
    {
        id: 'external',
        name: '外部日历',
        icon: '📅',
        viewIds: ['qqcalendar', 'icsSubscription'],
        isExpanded: true
    },
    {
        id: 'special',
        name: '特殊功能',
        icon: '⚡',
        viewIds: ['lifelog'],
        isExpanded: true
    }
];

// 分组管理函数
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
    // 如果没有用户分组，使用默认分组
    if (userGroups.length === 0) {
        userGroups = [...defaultGroups];
        saveUserGroups(userGroups);
    }
}
export function createNewGroup(name: string, icon: string = '📁'): ViewGroup {
    const newGroup: ViewGroup = {
        id: Date.now().toString(),
        name,
        icon,
        viewIds: [],
        isExpanded: true
    };
    return newGroup;
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
export function getUngroupedViews(allViewIds: string[]): string[] {
    const groupedViewIds = new Set();
    userGroups.forEach(group => {
        group.viewIds.forEach(id => groupedViewIds.add(id));
    });
    return allViewIds.filter(id => !groupedViewIds.has(id));
}
