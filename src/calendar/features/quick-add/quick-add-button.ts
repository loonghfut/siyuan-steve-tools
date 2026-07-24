import { showMessage } from 'siyuan';
import { api } from '@frostime/siyuan-plugin-kits';
import { createSchedule } from '../schedule-creation';

const wait = (duration: number) => new Promise(resolve => setTimeout(resolve, duration));

export async function addQuickAddButton(event: any) {
    const protyle = event.detail.protyle;
    const breadcrumb = protyle.element.querySelector('.protyle-breadcrumb');
    if (!breadcrumb || breadcrumb.querySelector('.quikadd-button')) return;

    const button = document.createElement('button');
    button.className = 'block__icon fn__flex-center ariaLabel quikadd-button';
    button.setAttribute('aria-label', '一键识别日程');
    button.innerHTML = '<svg class="item__graphic"><use xlink:href="#iconCalendar"></use></svg>';
    button.addEventListener('click', async () => {
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
    });

    const moreButton = breadcrumb.querySelector('button[data-type="more"]');
    moreButton ? breadcrumb.insertBefore(button, moreButton) : breadcrumb.appendChild(button);
}
