export function createFloatingCalendar(calendarEl: HTMLElement) {
    let existingContainer = document.getElementById('float-calendar-container');
    if (existingContainer) {
        document.body.removeChild(existingContainer);
    }

    const floatContainer = document.createElement('div');
    floatContainer.id = 'float-calendar-container';
    floatContainer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            transform: translateX(-70%) translateY(-99%); /* 初始位置在左上角外侧 */
            width: 58%;
            max-width: 1400px;
            height: auto;
            max-height: 100%;
            overflow: auto;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); /* 使用更平滑的动画曲线 */
            background: var(--b3-theme-background);
            z-index: ${window.siyuan.zIndex};
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        `;

    // 创建标题元素
    const titleEl = document.createElement('div');
    titleEl.id = 'fcalendar-float-title';
    titleEl.innerText = '日历';
    titleEl.style.cssText = `
        padding: 8px 16px;
        font-size: 16px;
        font-weight: 500;
        color: var(--b3-theme-on-background);
        border-bottom: 1px solid var(--b3-theme-surface-lighter);
        background-color: var(--b3-theme-background);
        border-radius: 8px 8px 0 0;
    `;
    floatContainer.appendChild(titleEl);


    calendarEl = document.createElement('div');
    calendarEl.id = 'fcalendar-float';
    calendarEl.style.height = '100%';
    floatContainer.appendChild(calendarEl);

    document.body.appendChild(floatContainer);

    let enterTimeout: NodeJS.Timeout;
    let leaveTimeout: NodeJS.Timeout;
    let isListenersActive = true;

    // 创建监听器函数
    const enterListener = () => {
        if (!isListenersActive) return;
        clearTimeout(leaveTimeout);
        enterTimeout = setTimeout(() => {
            floatContainer.style.transform = `translateY(0)`; 
            floatContainer.style.opacity = '1';
        }, 100);
    };

    const leaveListener = (e: MouseEvent) => {
        if (!isListenersActive) return;
        clearTimeout(enterTimeout);

        // 检查鼠标是否移动到了其他相关元素上
        const checkForElements = (x: number, y: number) => {
            // 获取鼠标当前位置的元素
            const elementAtPoint = document.elementFromPoint(x, y);

            // 检查该元素是否是日历相关的元素
            if (!elementAtPoint) return false;

            // 检查是否是日历相关元素或其子元素
            const isCalendarElement = elementAtPoint.closest('.fc') ||
                elementAtPoint.closest('.tippy-box') ||
                elementAtPoint.closest('.view-filter-menu');

            return isCalendarElement !== null;
        };

        // 获取鼠标离开事件的坐标
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        // 如果鼠标移动到了日历相关元素上，则不收回
        if (checkForElements(mouseX, mouseY)) {
            return;
        }

        leaveTimeout = setTimeout(() => {
            if (!checkForElements(mouseX, mouseY)) {
                floatContainer.style.transform = 'translateX(-70%) translateY(-99%)';
            }
        }, 300);
    };

    // 添加监听器
    floatContainer.addEventListener('mouseenter', enterListener);
    floatContainer.addEventListener('mouseleave', leaveListener);

    // 清理函数
    const cleanup = () => {
        floatContainer.removeEventListener('mouseenter', enterListener);
        floatContainer.removeEventListener('mouseleave', leaveListener);
    };

    return {
        element: calendarEl,
        cleanup
    };
}
