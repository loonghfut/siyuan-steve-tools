import { showMessage } from "siyuan";
import { ElementInteractions } from "../elements/element-interactions";
import { moduleInstances } from "@/index";

//初始化画板容器
export async function init_whiteboardContainer(whiteboardContainer, id, protyleContent) {
    // 创建画板容器
    whiteboardContainer = document.createElement('div');
    whiteboardContainer.id = `steveTool-whiteboard-${id}`;
    whiteboardContainer.className = 'whiteboard-container';
    whiteboardContainer.style.cssText = 'width: 100%; height: 100%; position: relative; overflow: hidden; background-color: var(--b3-theme-background);';

    // 添加控制元素和画布
    whiteboardContainer.innerHTML = `
            <div class="whiteboard-controls" style="position: absolute; top: 10px; right: 10px; z-index: ${window.siyuan.zIndex}; 
                 background-color: var(--b3-theme-background); padding: 5px 10px; border-radius: 4px; font-size: 14px; color: var(--b3-theme-on-background);">
                <span id="zoom-display-${id}">缩放: 100%</span>
                <button id="reset-view-${id}" style="margin-left: 10px; background: var(--b3-theme-background); border: 1px solid #ccc; 
                    border-radius: 4px; padding: 2px 8px; cursor: pointer; color: var(--b3-theme-on-background);">重置视图</button>
                <button id="add-block-${id}" style="margin-left: 10px; background: var(--b3-theme-background); border: 1px solid #ccc; 
                    border-radius: 4px; padding: 2px 8px; cursor: pointer; color: var(--b3-theme-on-background);">添加按钮</button>
            </div>
            <canvas id='canvas-${id}'></canvas>
            <div id='grid-${id}' class="whiteboard-grid"></div>
            <div id="dom-elements-container-${id}" style="position: absolute; top: 0; left: 0; pointer-events: none;"></div>
            `;

    // 将画板添加到内容区域
    protyleContent.appendChild(whiteboardContainer);
    return whiteboardContainer
}

//添加拖拽创建dom元素的监听
export async function add_drag_listener(container, canvas, id, domContainer, blockId) {
    // 容器上监听拖放事件
    container.addEventListener('dragover', (e) => {
        // 阻止默认行为以允许放置
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'copy';
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // 检查是否是从添加按钮拖拽过来的
        const dragData = e.dataTransfer!.getData('text/plain');
        if (dragData !== 'create-new-element') return;

        // 获取鼠标在画布上的位置
        const rect = container.getBoundingClientRect();
        const dropX = e.clientX - rect.left;
        const dropY = e.clientY - rect.top;

        // 获取当前画布的变换矩阵
        const vpt = canvas.viewportTransform;
        if (!vpt) return;

        // 转换为画布坐标系中的位置
        const canvasX = (dropX - vpt[4]) / vpt[0];
        const canvasY = (dropY - vpt[5]) / vpt[3];


        // 创建唯一ID
        const domId = `st-${id}-${blockId}`;

        // 使用封装好的方法创建容器
        const { container: protyledom, wrapper: wrapperDiv, dragHandle, resizeHandle } =
            createProtyleContainer(domId, blockId, { x: canvasX, y: canvasY });

        // 添加到DOM容器中
        domContainer.appendChild(protyledom);

        // 重要变更：不立即初始化编辑器，而是先设置为未初始化状态
        protyledom.setAttribute('data-block-id', blockId);
        protyledom.setAttribute('data-initialized', 'false');

        // 添加临时预览内容
        wrapperDiv.innerHTML = `<div class="block-placeholder" style="padding: 10px; display: flex; align-items: center; justify-content: center; height: 100%;">
         <span>正在加载...</span>
     </div>`;

        // 添加缩放功能
        ElementInteractions.addResizableToElement(protyledom, resizeHandle, canvas);

        // 稍后初始化编辑器（异步处理，避免界面卡顿）
        setTimeout(() => {
            // 为新拖放的块也应用延迟加载逻辑
            moduleInstances.M_handwriting.initProtyleEditor(wrapperDiv, blockId, id);
            protyledom.setAttribute('data-initialized', 'true');
            // 确保回收系统知道这个新块
            moduleInstances.M_handwriting.checkAndApplyRecyclingSystem(id, domContainer, canvas);
            // showMessage('已添加新元素，可直接拖拽移动位置或缩放大小');
        }, 100);

        console.log("拖放位置(画布坐标):", { x: canvasX, y: canvasY });
    });
}

/**
 * 创建一个思源笔记块容器
 * @param id 唯一ID
 * @param blockId 思源笔记块ID
 * @param position 初始位置
 * @returns 创建的DOM元素
 */
export function createProtyleContainer(id: string, blockId: string, position: { x: number, y: number }): {
    container: HTMLElement,
    wrapper: HTMLElement,
    dragHandle: HTMLElement,
    resizeHandle: HTMLElement
} {
    // 创建主容器
    const container = document.createElement('div');
    container.id = id; // 使用传入的id而不是blockId，避免ID冲突问题
    container.dataset.blockId = blockId; // 将blockId存储在dataset中
    container.className = 'siyuan-block-container';
    container.style.cssText = `
            position: absolute;
            width: 300px;
            height: 200px;
            background-color: var(--b3-theme-background);
            border-radius: 6px;
            box-shadow: 0 3px 8px rgba(0,0,0,0.15);
            pointer-events: auto; 
            transform-origin: 0 0;
            overflow: hidden;
            border: 1px solid var(--b3-border-color);
            left: ${position.x}px;
            top: ${position.y}px;
            will-change: transform, left, top; /* 提高性能提示 */
        `;

    // 添加拖动手柄，简化样式
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 8px;
            cursor: move;
            background-color: rgba(0,0,0,0.08);
            border-radius: 4px 4px 0 0;
            z-index: 1;
        `;

    // 添加缩放手柄
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    resizeHandle.style.cssText = `
            position: absolute;
            bottom: 0px;
            right: 0px;
            width: 10px;
            height: 10px;
            background-color: #2196F3;
            border-radius: 50%;
            cursor: nwse-resize;
            z-index: 100;
        `;

    // 创建容器包装器
    const wrapper = document.createElement('div');
    wrapper.className = 'protyle-wrapper';
    wrapper.style.cssText = `
            position: absolute;
            top: 8px;
            left: 0;
            right: 0;
            bottom: 0;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;

    // 组装各部分
    container.appendChild(dragHandle);
    container.appendChild(resizeHandle);
    container.appendChild(wrapper);

    return {
        container,
        wrapper,
        dragHandle,
        resizeHandle
    };
}

