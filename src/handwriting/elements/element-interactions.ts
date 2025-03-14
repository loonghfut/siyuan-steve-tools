import { Canvas } from 'fabric/fabric-impl';

export class ElementInteractions {
    /**
     * 为元素添加拖拽功能
     * @param element 要添加拖拽功能的元素
     * @param handle 拖动手柄元素
     * @param canvas 相关的Fabric画布
     * @param id? 画布ID
     */
    static addDraggableToElement(element: HTMLElement, handle: HTMLElement, canvas: Canvas, id?: string): void {
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let initialLeft = 0;
        let initialTop = 0;

        const startDrag = (e: MouseEvent | TouchEvent) => {
            isDragging = true;

            // 获取元素的初始位置
            const computedStyle = window.getComputedStyle(element);
            initialLeft = parseFloat(computedStyle.left);
            initialTop = parseFloat(computedStyle.top);

            // 获取鼠标/触摸的初始位置
            if (e instanceof MouseEvent) {
                startX = e.clientX;
                startY = e.clientY;
            } else if (e instanceof TouchEvent && e.touches && e.touches[0]) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }

            // 阻止事件默认行为和冒泡
            e.preventDefault();
            e.stopPropagation();

            // 添加临时事件监听器
            document.addEventListener('mousemove', moveDrag);
            document.addEventListener('touchmove', moveDrag, { passive: false });
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchend', stopDrag);

            // 添加活动样式
            element.style.opacity = '0.8';
        };

        const moveDrag = (e: MouseEvent | TouchEvent) => {
            if (!isDragging) return;

            // 获取当前鼠标/触摸位置
            let clientX, clientY;
            if (e instanceof MouseEvent) {
                clientX = e.clientX;
                clientY = e.clientY;
            } else if (e instanceof TouchEvent && e.touches && e.touches[0]) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                return;
            }

            // 考虑画布缩放比例
            const vpt = canvas.viewportTransform;
            if (!vpt) return;

            const scale = vpt[0]; // 假设x和y的缩放比例相同

            // 计算移动距离（考虑缩放）
            const deltaX = (clientX - startX) / scale;
            const deltaY = (clientY - startY) / scale;

            // 更新元素位置
            element.style.left = `${initialLeft + deltaX}px`;
            element.style.top = `${initialTop + deltaY}px`;

            // 阻止事件默认行为和冒泡
            e.preventDefault();
            e.stopPropagation();
        };

        const stopDrag = (e: MouseEvent | TouchEvent) => {
            if (!isDragging) return;
            isDragging = false;

            // 移除临时事件监听器
            document.removeEventListener('mousemove', moveDrag);
            document.removeEventListener('touchmove', moveDrag);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchend', stopDrag);

            // 恢复正常样式
            element.style.opacity = '1';

            // 阻止事件默认行为和冒泡
            e.preventDefault();
            e.stopPropagation();
        };

        // 添加拖拽事件监听器
        handle.addEventListener('mousedown', startDrag);
        handle.addEventListener('touchstart', startDrag, { passive: false });
    }

    /**
     * 为元素添加缩放功能
     * @param element 要添加缩放功能的元素
     * @param handle 缩放手柄元素
     * @param canvas 相关的Fabric画布
     */
    static addResizableToElement(element: HTMLElement, handle: HTMLElement, canvas: Canvas): void {
        let isResizing = false;
        let startX = 0;
        let startY = 0;
        let startWidth = 0;
        let startHeight = 0;

        const startResize = (e: MouseEvent | TouchEvent) => {
            isResizing = true;

            // 获取触摸/鼠标的初始位置
            if (e instanceof MouseEvent) {
                startX = e.clientX;
                startY = e.clientY;
            } else if (e instanceof TouchEvent && e.touches && e.touches[0]) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }

            // 获取元素的当前样式
            const computedStyle = window.getComputedStyle(element);
            startWidth = parseFloat(computedStyle.width);
            startHeight = parseFloat(computedStyle.height);

            // 阻止事件默认行为和冒泡
            e.preventDefault();
            e.stopPropagation();

            // 添加临时事件监听器
            document.addEventListener('mousemove', moveResize);
            document.addEventListener('touchmove', moveResize, { passive: false });
            document.addEventListener('mouseup', stopResize);
            document.addEventListener('touchend', stopResize);

            // 添加活动样式
            element.style.opacity = '0.8';
        };

        const moveResize = (e: MouseEvent | TouchEvent) => {
            if (!isResizing) return;

            // 获取当前鼠标/触摸位置
            let clientX, clientY;
            if (e instanceof MouseEvent) {
                clientX = e.clientX;
                clientY = e.clientY;
            } else if (e instanceof TouchEvent && e.touches && e.touches[0]) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                return;
            }

            // 考虑画布缩放比例
            const vpt = canvas.viewportTransform;
            if (!vpt) return;

            const scale = vpt[0]; // 假设x和y的缩放比例相同
            const deltaX = (clientX - startX) / scale;
            const deltaY = (clientY - startY) / scale;

            // 计算新尺寸（确保最小尺寸）
            const newWidth = Math.max(50, startWidth + deltaX);
            const newHeight = Math.max(50, startHeight + deltaY);

            // 更新元素尺寸
            element.style.width = `${newWidth}px`;
            element.style.height = `${newHeight}px`;

            // 阻止事件默认行为和冒泡
            e.preventDefault();
            e.stopPropagation();
        };

        const stopResize = (e: MouseEvent | TouchEvent) => {
            if (!isResizing) return;
            isResizing = false;

            // 移除临时事件监听器
            document.removeEventListener('mousemove', moveResize);
            document.removeEventListener('touchmove', moveResize);
            document.removeEventListener('mouseup', stopResize);
            document.removeEventListener('touchend', stopResize);

            // 恢复正常样式
            element.style.opacity = '1';

            // 阻止事件默认行为和冒泡
            e.preventDefault();
            e.stopPropagation();
        };

        // 添加缩放事件监听器
        handle.addEventListener('mousedown', startResize);
        handle.addEventListener('touchstart', startResize, { passive: false });
    }
}