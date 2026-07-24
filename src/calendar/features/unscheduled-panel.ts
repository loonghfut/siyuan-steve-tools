// Helper utilities for the "待安排事件" panel — extracted from calendar.ts
// Exports DOM-focused helpers so the calendar core stays lean.

import { Draggable } from '@fullcalendar/interaction';

// 计数徽标：获取或创建
export function createOrGetPlanButtonBadge(button: HTMLButtonElement): HTMLElement {
    const next = button.nextElementSibling as HTMLElement | null;
    if (next && next.classList && next.classList.contains('st-plan-button-count')) {
        return next;
    }
    const badge = document.createElement('span');
    badge.className = 'st-plan-button-count';
    badge.textContent = '0';
    button.insertAdjacentElement('afterend', badge);
    return badge;
}

// 移除所有已存在但失联的徽标（例如工具栏重绘后）
export function cleanupPlanButtonBadges(root: ParentNode | Document = document) {
    const badges = root.querySelectorAll('.st-plan-button-count');
    badges.forEach(b => {
        const prev = (b as HTMLElement).previousElementSibling as HTMLElement | null;
        if (!prev || !prev.classList.contains('fc-planButton-button')) {
            (b as HTMLElement).remove();
        }
    });
}

export function initializePanelPosition(panel: HTMLElement) {
    // Position the panel where it was inserted but switch to fixed so it can be moved freely
    const rect = panel.getBoundingClientRect();
    panel.style.position = 'fixed';
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = 'auto';
}

export function makeUnscheduledPanelDraggable(panel: HTMLElement): (() => void) | null {
    const header = panel.querySelector('.st-unscheduled-header') as HTMLElement | null;
    if (!header) {
        return null;
    }
    const state: {
        active: boolean;
        pointerId: number;
        startX: number;
        startY: number;
        initialLeft: number;
        initialTop: number;
    } = {
        active: false,
        pointerId: -1,
        startX: 0,
        startY: 0,
        initialLeft: 0,
        initialTop: 0,
    };

    const onPointerDown = (event: PointerEvent) => {
        if (state.active || (event.pointerType === 'mouse' && event.button !== 0)) {
            return;
        }
        if ((event.target as HTMLElement | null)?.closest('.st-unscheduled-close')) {
            return;
        }
        const rect = panel.getBoundingClientRect();
        panel.style.position = 'fixed';
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        panel.style.right = 'auto';

        state.active = true;
        state.pointerId = event.pointerId;
        state.startX = event.clientX;
        state.startY = event.clientY;
        state.initialLeft = rect.left;
        state.initialTop = rect.top;
        header.setPointerCapture(event.pointerId);
        panel.classList.add('st-unscheduled-panel--dragging');
        panel.style.zIndex = '2147483647';
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerUp);
        event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent) => {
        if (!state.active || event.pointerId !== state.pointerId) {
            return;
        }
        const deltaX = event.clientX - state.startX;
        const deltaY = event.clientY - state.startY;
        const panelRect = panel.getBoundingClientRect();
        const width = panelRect.width;
        const height = panelRect.height;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let nextLeft = state.initialLeft + deltaX;
        let nextTop = state.initialTop + deltaY;

        nextLeft = Math.min(Math.max(0, nextLeft), viewportWidth - width);
        nextTop = Math.min(Math.max(0, nextTop), viewportHeight - height);

        panel.style.left = `${nextLeft}px`;
        panel.style.top = `${nextTop}px`;
    };

    const onPointerUp = (event: PointerEvent) => {
        if (!state.active || event.pointerId !== state.pointerId) {
            return;
        }
        state.active = false;
        try {
            header.releasePointerCapture(event.pointerId);
        } catch (e) {
            // ignore
        }
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
        panel.classList.remove('st-unscheduled-panel--dragging');
        panel.style.zIndex = '';
    };

    header.addEventListener('pointerdown', onPointerDown);

    return () => {
        header.removeEventListener('pointerdown', onPointerDown);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        document.removeEventListener('pointercancel', onPointerUp);
        panel.classList.remove('st-unscheduled-panel--dragging');
        panel.style.zIndex = '';
    };
}

export default {
    createOrGetPlanButtonBadge,
    cleanupPlanButtonBadges,
    initializePanelPosition,
    makeUnscheduledPanelDraggable,
};

// =============== 高层封装：待安排面板控制器 ==================

export type UnscheduledEventLite = {
    blockId: string;
    itemID?: string;
    rootid: string;
    title?: string;
    status?: string;
    priority?: string;
    category?: string;
    viewName?: string;
    tags?: string[];
    timeKeyID?: string;
    allDayKeyID?: string;
    overdue?: boolean; // 新增：是否为“过期未完成”
};

type GetPending = () => UnscheduledEventLite[];

export function createUnscheduledPanelController(
    calendarEl: HTMLElement,
    getPendingEvents: GetPending,
) {
    let panel: HTMLElement | null = null;
    let listDraggable: Draggable | null = null;
    let dragCleanup: (() => void) | null = null;

    const appendCard = (container: HTMLElement, ev: UnscheduledEventLite) => {
        const card = document.createElement('div');
        card.className = 'st-unscheduled-item';
        (card as any).dataset.blockId = ev.blockId;
        (card as any).dataset.itemId = ev.itemID || '';
        (card as any).dataset.rootId = ev.rootid;
        (card as any).dataset.timeKey = ev.timeKeyID || '';
        (card as any).dataset.allDayKey = ev.allDayKeyID || '';
        (card as any).dataset.title = ev.title || '';
        if (ev.overdue) {
            (card as any).dataset.overdue = '1';
            card.classList.add('st-unscheduled-item--overdue');
        }

        const titleEl = document.createElement('div');
        titleEl.className = 'st-unscheduled-item__title';
        titleEl.textContent = ev.title || '未命名事件';
        if (ev.overdue) {
            const badge = document.createElement('span');
            badge.className = 'st-unscheduled-item__badge st-unscheduled-item__badge--overdue';
            badge.textContent = '过期';
            titleEl.appendChild(badge);
        }
        card.appendChild(titleEl);

    const metaParts: string[] = [];
        if (ev.status) metaParts.push(ev.status);
        if (ev.priority) metaParts.push(`优先级:${ev.priority}`);
        if (ev.category) metaParts.push(ev.category);
        if (ev.viewName) metaParts.push(ev.viewName);
        if (metaParts.length) {
            const metaEl = document.createElement('div');
            metaEl.className = 'st-unscheduled-item__meta';
            metaEl.textContent = metaParts.join(' · ');
            card.appendChild(metaEl);
        }
        if (ev.tags && ev.tags.length) {
            const tagsEl = document.createElement('div');
            tagsEl.className = 'st-unscheduled-item__tags';
            ev.tags.forEach(tag => {
                const tagEl = document.createElement('span');
                tagEl.textContent = tag;
                tagsEl.appendChild(tagEl);
            });
            card.appendChild(tagsEl);
        }
        container.appendChild(card);
    };

    const setupListDraggable = (listEl: HTMLElement) => {
        listDraggable?.destroy();
        listDraggable = new Draggable(listEl, {
            itemSelector: '.st-unscheduled-item',
            eventData: (eventEl) => {
                const element = eventEl as HTMLElement;
                const { blockId, itemId, rootId, title } = (element as any).dataset;
                const displayTitle = title || element.querySelector('.st-unscheduled-item__title')?.textContent?.trim() || '未命名事件';
                return {
                    title: displayTitle,
                    duration: { hours: 1 },
                    extendedProps: {
                        blockId,
                        itemID: itemId,
                        rootid: rootId,
                        isUnscheduled: true
                    }
                } as any;
            }
        });
    };

    const render = () => {
        if (!panel) return;
        const listEl = panel.querySelector('.st-unscheduled-list') as HTMLElement | null;
        if (!listEl) return;
        const pending = getPendingEvents();
        if (!pending || pending.length === 0) {
            destroy();
            return;
        }
        listEl.innerHTML = '';
        pending.forEach(ev => appendCard(listEl, ev));
        setupListDraggable(listEl);
    };

    const ensure = () => {
        if (panel) {
            render();
            return;
        }
        const p = document.createElement('div');
        p.className = 'st-unscheduled-panel';
        p.innerHTML = `
            <div class="st-unscheduled-header">
                <span>待安排事件</span>
                <button class="st-unscheduled-close" aria-label="关闭">×</button>
            </div>
            <div class="st-unscheduled-wrapper">
                <div class="st-unscheduled-tip">拖拽事件到日历以安排时间</div>
                <div class="st-unscheduled-list"></div>
            </div>
        `;
        calendarEl.classList.add('st-calendar-with-panel', 'st-unscheduled-open');
        calendarEl.appendChild(p);
        initializePanelPosition(p);

        const closeBtn = p.querySelector('.st-unscheduled-close');
        closeBtn?.addEventListener('click', () => destroy());

        panel = p;
        dragCleanup = makeUnscheduledPanelDraggable(p);
        render();
    };

    const destroy = () => {
        listDraggable?.destroy();
        listDraggable = null;
        dragCleanup?.();
        dragCleanup = null;
        if (panel) {
            panel.remove();
            panel = null;
        }
        calendarEl.classList.remove('st-calendar-with-panel', 'st-unscheduled-open');
    };

    const toggle = () => {
        const pending = getPendingEvents();
        if (!pending || pending.length === 0) {
            // 延迟清理，保持 UI 一致性
            destroy();
            return;
        }
        if (panel) destroy(); else ensure();
    };

    const updatePlanButtonLabel = (count: number) => {
        // 如果工具栏重绘，先清理失联徽标
        cleanupPlanButtonBadges(calendarEl);
        const button = calendarEl.querySelector<HTMLButtonElement>('.fc-planButton-button');
        if (!button) return;
        button.classList.toggle('st-plan-button--has-items', count > 0);
        const badge = createOrGetPlanButtonBadge(button);
        if (badge) {
            badge.textContent = String(count);
            (badge as HTMLElement).hidden = count === 0;
        }
        if (panel) {
            if (count === 0) destroy(); else render();
        }
    };

    return {
        ensure,
        toggle,
        destroy,
        render,
        updatePlanButtonLabel,
    };
}
