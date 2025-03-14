import { WhiteboardPosition } from '../types/whiteboard-types';

export class ProtyleContainer {
    /**
     * 创建Protyle容器
     * @param id 元素ID
     * @param blockId 思源块ID
     * @param position 位置信息
     */
    static createProtyleContainer(id: string, blockId: string, position: WhiteboardPosition) {
        // 创建主容器元素
        const container = document.createElement('div');
        container.id = id;
        container.className = 'whiteboard-protyle-container';
        container.style.position = 'absolute';
        container.style.left = `${position.x}px`;
        container.style.top = `${position.y}px`;
        container.style.width = '300px';
        container.style.height = '200px';
        container.style.backgroundColor = 'var(--b3-theme-background)';
        container.style.border = '1px solid var(--b3-border-color)';
        container.style.borderRadius = '4px';
        container.style.overflow = 'hidden';
        container.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
        container.dataset.blockId = blockId; // 存储块ID

        // 创建顶部控制栏
        const controls = document.createElement('div');
        controls.className = 'whiteboard-protyle-controls';
        controls.style.display = 'flex';
        controls.style.justifyContent = 'space-between';
        controls.style.padding = '4px';
        controls.style.borderBottom = '1px solid var(--b3-border-color)';
        controls.style.backgroundColor = 'var(--b3-theme-surface)';

        // 创建拖拽手柄
        const dragHandle = document.createElement('div');
        dragHandle.className = 'whiteboard-protyle-drag-handle';
        dragHandle.style.cursor = 'move';
        dragHandle.style.padding = '0 4px';
        dragHandle.innerHTML = '⋮⋮';
        dragHandle.title = '拖动';

        // 创建功能按钮组
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'whiteboard-protyle-buttons';
        buttonGroup.style.display = 'flex';
        buttonGroup.style.gap = '4px';

        // 创建关闭按钮
        const closeButton = document.createElement('button');
        closeButton.className = 'whiteboard-protyle-close';
        closeButton.innerHTML = '×';
        closeButton.style.cursor = 'pointer';
        closeButton.style.border = 'none';
        closeButton.style.background = 'none';
        closeButton.title = '关闭';
        closeButton.onclick = () => {
            container.remove();
        };

        // 添加按钮到按钮组
        buttonGroup.appendChild(closeButton);

        // 添加拖拽手柄和按钮组到控制栏
        controls.appendChild(dragHandle);
        controls.appendChild(buttonGroup);

        // 创建内容包装器
        const wrapper = document.createElement('div');
        wrapper.className = 'whiteboard-protyle-wrapper';
        wrapper.style.height = 'calc(100% - 30px)';
        wrapper.style.overflow = 'auto';

        // 创建缩放手柄
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'whiteboard-protyle-resize';
        resizeHandle.style.position = 'absolute';
        resizeHandle.style.right = '0';
        resizeHandle.style.bottom = '0';
        resizeHandle.style.width = '10px';
        resizeHandle.style.height = '10px';
        resizeHandle.style.cursor = 'nwse-resize';
        resizeHandle.style.background = 'var(--b3-theme-primary)';
        resizeHandle.style.borderRadius = '0 0 4px 0';

        // 组装容器
        container.appendChild(controls);
        container.appendChild(wrapper);
        container.appendChild(resizeHandle);

        return {
            container,
            wrapper,
            dragHandle,
            resizeHandle
        };
    }
}