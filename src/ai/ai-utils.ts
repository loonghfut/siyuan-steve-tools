/**
 * AI 侧边栏工具函数
 * 提供 AI 地址列表解析、选项生成等公共功能
 */

export interface AiUrlOption {
    url: string;
    name: string;
}

/**
 * 解析 AI 地址列表字符串
 * @param listStr 格式：每行 "名称|URL"
 * @returns AI 地址选项数组
 */
export function parseAiUrlList(listStr: string): AiUrlOption[] {
    const options: AiUrlOption[] = [];
    if (!listStr || typeof listStr !== 'string') return options;

    const lines = listStr.split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);

    for (const line of lines) {
        const idx = line.indexOf('|');
        if (idx > -1) {
            const name = line.slice(0, idx).trim();
            const url = line.slice(idx + 1).trim();
            if (url && name) {
                options.push({ url, name });
            }
        }
    }

    return options;
}

/**
 * 将 AI 地址列表转换为下拉选项对象
 * @param listStr AI 地址列表字符串
 * @param includeCustom 是否包含自定义选项
 * @returns { url: name } 格式的选项对象
 */
export function getAiUrlOptionsMap(listStr: string, includeCustom = true): Record<string, string> {
    const options: Record<string, string> = {};
    const parsed = parseAiUrlList(listStr);
    
    for (const item of parsed) {
        // 跳过已存在的 custom 项（除非它有真实的 URL）
        if (item.url === 'custom' && !includeCustom) continue;
        options[item.url] = item.name;
    }

    // 确保 custom 选项存在
    if (includeCustom && !options['custom']) {
        options['custom'] = '自定义地址';
    }

    return options;
}

/**
 * 生成下拉选项的 HTML
 * @param options 选项对象 { url: name }
 * @param selectedValue 当前选中的值
 * @returns HTML 字符串
 */
export function generateSelectOptionsHtml(options: Record<string, string>, selectedValue: string): string {
    return Object.entries(options).map(([url, name]) => {
        const selected = url === selectedValue ? ' selected' : '';
        return `<option value="${url}"${selected}>${name}</option>`;
    }).join('\n');
}

/**
 * 获取实际使用的 URL（处理 custom 情况）
 * @param urlType 选择的 URL 类型（可能是具体 URL 或 'custom'）
 * @param customUrl 自定义 URL
 * @returns 实际使用的 URL
 */
export function getActualUrl(urlType: string, customUrl: string): string {
    return urlType === 'custom' ? (customUrl || '') : urlType;
}

/**
 * 更新 webview 或 iframe 的 URL
 * @param container 容器元素
 * @param newUrl 新的 URL
 */
export function updateWebviewUrl(container: HTMLElement | null, newUrl: string): boolean {
    if (!container || !newUrl) return false;

    try {
        // 优先尝试 webview
        const webview = container.querySelector('webview') as any;
        if (webview) {
            if (typeof webview.loadURL === 'function') {
                webview.loadURL(newUrl);
                return true;
            } else if (webview.setAttribute) {
                webview.setAttribute('src', newUrl);
                return true;
            }
        }

        // 回退到 iframe
        const iframe = container.querySelector('iframe') as HTMLIFrameElement | null;
        if (iframe && iframe.setAttribute) {
            iframe.setAttribute('src', newUrl);
            return true;
        }
    } catch (e) {
        console.warn('更新 webview/iframe URL 失败', e);
    }

    return false;
}
