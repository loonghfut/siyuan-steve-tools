import * as api from "@/api";
import { BLOCK_LAYOUT, cn_type } from "../parameter";
import { moduleInstances } from "@/index";
import { showMessage } from "siyuan";

//添加进入画板按钮
export async function addWhiteboardButton(e) {
    const breadcrumb = e.detail.protyle.element.querySelector('.protyle-breadcrumb');
    if (breadcrumb) {
        // Check if the button already exists
        const existingButton = breadcrumb.querySelector('.whiteboard-button');
        if (!existingButton) {
            // Create the button
            const button = document.createElement('button');
            button.className = 'b3-button b3-button--outline whiteboard-button';
            button.innerHTML = '画板';
            button.title = '在画板中打开';
            button.style.marginLeft = '8px';

            // Add click event
            button.addEventListener('click', async () => {
                let ChildBlocks = await api.getChildBlocks(e.detail.protyle.block.rootID);
                // 过滤和提取块ID
                const blockIds = ChildBlocks
                    .filter(block =>
                        block?.type === cn_type &&
                        block?.content?.trim())
                    .map(block => block.id);

                console.log("Extracted block IDs:", blockIds);
                moduleInstances['M_handwriting'].openWhiteBoard_in(e, blockIds);
            });

            // Add the button to breadcrumb
            breadcrumb.appendChild(button);
        }
    }
}

// 控制元素显示状态的函数
export const toggleElementsVisibility = (show: boolean, protyle) => {

    const protyleContent = protyle.element.querySelector(`.protyle-content.protyle-content--transition`);
    if (!protyleContent) {
        showMessage("无法找到当前页面内容区域");
        return;
    }
    const button = protyle.element.querySelector('.whiteboard-button');
    // 控制原始内容显示/隐藏
    const originalContent = protyleContent.querySelectorAll(':scope > :not(.whiteboard-container)');
    originalContent.forEach(el => (el as HTMLElement).style.display = show ? '' : 'none');

    // 控制面包屑导航栏
    const breadcrumbBar = protyle.element.querySelector('.protyle-breadcrumb__bar');
    if (breadcrumbBar) (breadcrumbBar as HTMLElement).style.display = show ? '' : 'none';

    // 更新按钮文本
    if (button) button.innerHTML = show ? '画板' : '关闭画板';
};

