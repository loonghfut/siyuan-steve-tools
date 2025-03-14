export class DomUtils {
    /**
     * 从数据传输对象中提取思源块ID
     * @param dataTransfer 数据传输对象
     */
    static extractBlockIdFromDataTransfer(dataTransfer: DataTransfer): string | null {
        // 尝试获取思源块ID
        if (dataTransfer.types.includes('text/html')) {
            const html = dataTransfer.getData('text/html');
            // 从HTML中提取数据ID
            const match = html.match(/data-node-id="([^"]+)"/);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        // 尝试从文本中提取ID
        if (dataTransfer.types.includes('text/plain')) {
            const text = dataTransfer.getData('text/plain');
            // 检查是否是思源块引用格式 ((20220427113015-explorer))
            const refMatch = text.match(/\(\(([0-9]{14}-[a-zA-Z0-9]+)\)\)/);
            if (refMatch && refMatch[1]) {
                return refMatch[1];
            }
        }
        
        return null;
    }
    
    /**
     * 创建工具栏按钮
     * @param id 按钮ID
     * @param text 按钮文本
     * @param title 提示文本
     * @param clickHandler 点击处理函数
     */
    static createToolbarButton(id: string, text: string, title: string, clickHandler: (e: MouseEvent) => void): HTMLButtonElement {
        const button = document.createElement('button');
        button.id = id;
        button.textContent = text;
        button.title = title;
        button.style.marginLeft = '10px';
        button.style.background = 'var(--b3-theme-background)';
        button.style.border = '1px solid #ccc';
        button.style.borderRadius = '4px';
        button.style.padding = '2px 8px';
        button.style.cursor = 'pointer';
        button.style.color = 'var(--b3-theme-on-background)';
        button.addEventListener('click', clickHandler);
        return button;
    }
}