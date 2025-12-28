import { moduleInstances } from "@/index";
import { showMessage, openTab } from "siyuan";

//添加进入画板按钮
export async function addWhiteboardButton(e) {
    const breadcrumb = e.detail.protyle.element.querySelector('.protyle-breadcrumb');
    if (breadcrumb) {
        // Check if the button already exists
        const existingButton = breadcrumb.querySelector('.whiteboard-button');
        if (!existingButton) {
            // Create the button
            const button = document.createElement('button');
            button.className = 'block__icon fn__flex-center ariaLabel whiteboard-button';
            button.innerHTML = '<svg class="item__graphic"><use xlink:href="#iconSTWhiteboard"></use></svg>';
            button.setAttribute('aria-label', '在画板中打开');

            // Add click event
            button.addEventListener('click', async () => {
                moduleInstances['M_handwriting'].openWhiteBoard_in(e);
            });

            // Add the button to breadcrumb
            breadcrumb.appendChild(button);
        }
    }
}

// 添加白板按钮到文档树条目
export function addWhiteboardButtonToFileTreeItem(item: Element) {
    // 检查是否已经是白板条目或者已经存在按钮
    if (item.getAttribute('data-type') === 'navigation-whiteboard' || item.querySelector('.st-whiteboard-tree-icon')) {
        return;
    }

    // 获取文档的 rootid，通常在 data-id 或 data-node-id 属性中
    const rootid = item.getAttribute('data-id') || item.getAttribute('data-node-id') || '';
    if (!rootid) return;

    // 获取标题文本
    const textEl = item.querySelector('.b3-list-item__text');
    const titleText = textEl?.textContent || '白板';

    // 创建白板图标按钮
    const iconBtn = document.createElement('span');
    iconBtn.className = 'b3-list-item__action st-whiteboard-tree-icon b3-tooltips b3-tooltips__nw';
    iconBtn.setAttribute('aria-label', '打开白板');
    iconBtn.innerHTML = '<svg><use xlink:href="#iconSTWhiteboard"></use></svg>';

    // 点击事件：打开白板
    iconBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const plugin = moduleInstances['M_handwriting'].pluginInstance;
        const tabId = plugin.name + "steveTool-whiteboard";
        await openTab({
            app: (window as any).siyuan.ws.app,
            custom: {
                id: tabId,
                title: titleText,
                icon: "iconSTWhiteboard",
                data: {
                    text: "steveTool-whiteboard" + rootid,
                    rootid: rootid,
                },
            },
        });
    });

    // 插入到 "更多" 按钮之前
    const moreBtn = item.querySelector('span[data-type="more-root"]');
    if (moreBtn) {
        item.insertBefore(iconBtn, moreBtn);
    } else {
        // 如果没有更多按钮，插入到文本后面
        const textSpan = item.querySelector('.b3-list-item__text');
        if (textSpan && textSpan.nextSibling) {
            item.insertBefore(iconBtn, textSpan.nextSibling);
        } else {
            item.appendChild(iconBtn);
        }
    }
}

// 监听文档树变化并注入白板按钮
export function setupFileTreeObserver() {
    // 查找文档树容器
    const findFileTreeContainer = (): HTMLElement | null => {
        // 尝试多个可能的选择器
        return document.querySelector('.file-tree') ||
            document.querySelector('.sy__file') ||
            document.querySelector('#fileTree') ||
            document.querySelector('[data-type="file-tree"]') ||
            document.querySelector('.b3-list--file');
    };

    const container = findFileTreeContainer();
    if (!container) return null;

    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            // 处理新增的节点
            mutation.addedNodes.forEach((node) => {
                if (node instanceof HTMLElement) {
                    // 如果是列表项，直接处理
                    if (node.classList?.contains('b3-list-item')) {
                        addWhiteboardButtonToFileTreeItem(node);
                    }
                    // 查找子节点中的列表项
                    node.querySelectorAll?.('.b3-list-item').forEach((item: Element) => {
                        addWhiteboardButtonToFileTreeItem(item);
                    });
                }
            });

            // 处理属性变化（如 data-id 更新）
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-id') {
                const target = mutation.target as Element;
                if (target.classList?.contains('b3-list-item')) {
                    addWhiteboardButtonToFileTreeItem(target);
                }
            }
        });
    });

    observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-id', 'data-node-id']
    });

    // 对现有项目注入按钮
    container.querySelectorAll('.b3-list-item').forEach((item: Element) => {
        addWhiteboardButtonToFileTreeItem(item);
    });

    return observer;
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

