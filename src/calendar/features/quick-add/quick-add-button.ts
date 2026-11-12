import { showMessage } from 'siyuan';
import * as api from '@/api/api';
import { createSchedule } from '../schedule-creation';

const wait = (duration: number) => new Promise(resolve => setTimeout(resolve, duration));

/** Runs schedule recognition for all `@日程` child blocks in the given Protyle document. */
export async function runQuickAddFromProtyle(protyle: any): Promise<void> {
    const blocks = await api.getChildBlocks(protyle.block.rootID);
    const scheduleBlockIds = blocks
        .filter(block => block.content?.includes('@日程'))
        .map(block => block.id);
    if (scheduleBlockIds.length === 0) {
        showMessage('未找到包含"@日程"的块。');
        return;
    }

    for (const blockId of scheduleBlockIds) {
        showMessage(`正在处理块 ${blockId}...`, 3000, 'info');
        try {
            await createSchedule('', { isdirect: true, directid: blockId });
            showMessage(`块 ${blockId} 处理成功`, 3000, 'info');
            await wait(1000);
        } catch (error: any) {
            console.error(`处理块 ${blockId} 时出错:`, error);
            showMessage(`处理块 ${blockId} 时出错: ${error.message || error}`, 5000, 'error');
            await wait(500);
        }
    }
    showMessage('所有包含"@日程"的块处理完毕。', 3000, 'info', '@日程');
}

export async function addQuickAddButton(event: any) {
    const protyle = event.detail.protyle;
    const breadcrumb = protyle.element.querySelector('.protyle-breadcrumb');
    if (!breadcrumb || breadcrumb.querySelector('.quikadd-button')) return;

    const button = document.createElement('button');
    button.className = 'block__icon fn__flex-center ariaLabel quikadd-button';
    button.setAttribute('aria-label', '一键识别日程');
    button.innerHTML = '<svg class="item__graphic"><use xlink:href="#iconCalendar"></use></svg>';
    button.addEventListener('click', () => {
        void runQuickAddFromProtyle(protyle);
    });

    // 思源 3.8.10+ 将 more 等操作按钮包裹进 .protyle-breadcrumb__plugin，需以其真实父节点执行 insertBefore
    const moreButton = breadcrumb.querySelector('button[data-type="more"]');
    const actionsContainer = moreButton?.parentElement || breadcrumb.querySelector('.protyle-breadcrumb__plugin') || breadcrumb;
    if (moreButton && moreButton.parentElement === actionsContainer) {
        actionsContainer.insertBefore(button, moreButton);
    } else {
        actionsContainer.appendChild(button);
    }
}
