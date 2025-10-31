// Helper utilities for the "待安排事件" panel — extracted from calendar.ts
// Exports small, DOM-focused helpers so the calendar core stays lean.

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
    initializePanelPosition,
    makeUnscheduledPanelDraggable,
};
