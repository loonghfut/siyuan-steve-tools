import type steveTools from "@/index";

export interface TopBarButtonOptions {
    icon: string;
    title: string;
    position?: "right" | "left";
    callback?: (event: MouseEvent) => void;
}

/**
 * 顶栏条目的幂等显隐。
 *
 * 思源 3.8 起 addTopBar 支持 id（同一 id 重复调用是更新条目而不是新增），
 * 并提供 removeTopBar(id) 移除条目；旧版本（3.7）没有 removeTopBar，
 * 此时退化为隐藏元素并保留引用，下次显示时复用同一个元素（不新增）。
 *
 * @param plugin 插件实例
 * @param current 当前已创建的顶栏元素（尚未创建时传 undefined）
 * @param id 条目 id（插件内唯一）
 * @param options 顶栏条目定义
 * @param visible 是否显示
 * @returns 元素仍留在 DOM 中时返回该元素；已被移除时返回 undefined
 */
export function applyTopBarButton(
    plugin: steveTools,
    current: HTMLElement | undefined,
    id: string,
    options: TopBarButtonOptions,
    visible: boolean,
): HTMLElement | undefined {
    if (visible) {
        if (!current) {
            return plugin.addTopBar({ id, ...options });
        }
        // 已存在：清掉此前隐藏时留下的样式。
        // 3.8 同 id 重复注册会复用元素并覆盖 onclick，不会叠加监听器。
        current.style.removeProperty("display");
        return current;
    }
    if (current) {
        const removeTopBar = (plugin as any).removeTopBar;
        if (typeof removeTopBar === "function") {
            removeTopBar.call(plugin, id);
            // 元素已从 DOM 移除，下次显示时重新创建。
            return undefined;
        }
        // 3.7 降级：元素仍在 DOM 里，隐藏它并保留引用，
        // 否则每次开关都会新增一个元素、旧元素残留在 DOM 中。
        current.style.display = "none";
        return current;
    }
    return undefined;
}
