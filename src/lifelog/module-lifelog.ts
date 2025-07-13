import { Plugin } from "siyuan";
import { getBlockAttrs, setBlockAttrs, getHPathByID } from "../api/api";  // 修改导入

// 常量定义
const LIFELOG_PREFIX = 'custom-lifelog-';

// Export the ATTRS constant
export const ATTRS = {
    time: `${LIFELOG_PREFIX}time`,
    date: `${LIFELOG_PREFIX}date`,
    type: `${LIFELOG_PREFIX}type`,
    content: `${LIFELOG_PREFIX}content`,
    created: `${LIFELOG_PREFIX}created`,
    updated: `${LIFELOG_PREFIX}updated`,

    // 时间格式
    YYYY_MM_DD: 'YYYY/MM/DD',
    HH_mm_ss: 'HH:mm:ss',
    YYYY_MM_DD_HH_mm_ss: 'YYYY/MM/DD HH:mm:ss',
    YYYY_MM_DD_23_59_59: 'YYYY/MM/DD 23:59:59',
    YYYY_MM_DD_00_00_00: 'YYYY/MM/DD 00:00:00'
};

// 实现简单的 debounce 函数
function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;
    return function(this: any, ...args: Parameters<T>) {
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => {
            func.apply(this, args);
        }, wait);
    };
}

// 添加格式化时间的辅助函数
function formatDateTime(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

export class M_lifelog {
    private plugin: Plugin;
    private settings: any;
    public enabled: boolean = false;  // 添加启用状态属性

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    async init(settingdata: any) {
        this.settings = settingdata;
        this.debug('LifeLog module loading...');
        // 根据设置添加属性标记并更新启用状态
        this.enabled = this.settings['lifelog-enable'] === true;
        if (this.enabled) {
            document.body.setAttribute('data-lifelog-enabled', 'true');
        }
        this.plugin.eventBus.on("ws-main", this.wsMainHandler);
        this.debug('LifeLog module loaded and watching');
    }

    onunload() {
        console.log('LifeLog module unloading...');
        // 移除属性标记
        document.body.removeAttribute('data-lifelog-enabled');
        this.plugin.eventBus.off("ws-main", this.wsMainHandler);
        console.log('LifeLog module unloaded');
    }

    // 添加设置更新处理方法
    updateSettings(settings: any) {
        this.settings = settings;
        if (this.settings['lifelog-enable']) {
            document.body.setAttribute('data-lifelog-enabled', 'true');
        } else {
            document.body.removeAttribute('data-lifelog-enabled');
        }
    }

    private debug(message: string, ...args: any[]) {
        if (this.settings['lifelog-debug']) {
            console.log(message, ...args);
        }
    }

    private warn(message: string, ...args: any[]) {
        if (this.settings['lifelog-debug']) {
            console.warn(message, ...args);
        }
    }

    // 添加一个辅助方法来处理路径获取
    private async getDocPath(id: string): Promise<string | null> {
        try {
            const hPath = await getHPathByID(id);
            // 检查返回的路径是否有效
            if (!hPath || hPath.includes('error') || hPath === '/api/filetree/getHPathByID') {
                this.warn('获取文档路径失败:', id);
                return null;
            }
            this.debug('LifeLog document path:', hPath);
            return hPath;
        } catch (err) {
            this.warn('获取文档路径出错:', err);
            return null;
        }
    }

    private wsMainHandler = async (data: any) => {
        this.debug('LifeLog received ws-main event raw:', data);

        const detail = data.detail;
        if (!detail) {
            this.warn('LifeLog: No detail in data');
            return;
        }

        // 检查是否是 transactions
        if (detail.cmd === "transactions") {
            const changes = detail.data[0]?.doOperations || [];
            const dailyChanges = [];
            for (const change of changes) {
                // 先检查 action 类型
                if ((change.action !== "update" && change.action !== "insert") || !change.data) {
                    continue;
                }
                if (!change.id) {
                    this.warn('LifeLog: Change missing ID:', change);
                    continue;
                }
                const hPath = await this.getDocPath(change.id);
                if (!hPath) continue;

                const isDaily = hPath.includes('/daily note');
                if (isDaily) {
                    // 从路径中提取日期，匹配 YYYY-MM-DD 格式
                    const dateMatch = hPath.match(/\d{4}-\d{2}-\d{2}/);
                    if (!dateMatch) {
                        this.warn('LifeLog: Cannot extract date from path:', hPath);
                        continue;
                    }
                    // 转换日期格式从 YYYY-MM-DD 到 YYYY/MM/DD
                    const docDate = dateMatch[0].replace(/-/g, '/');
                    dailyChanges.push({
                        ...change,
                        docDate
                    });
                }
            }

            this.debug('LifeLog filtered daily changes:', dailyChanges);

            if (dailyChanges.length === 0) {
                this.warn('LifeLog: No daily note changes detected');
                return;
            }

            this.handleChanges(dailyChanges);
        }
    }

    private handleChanges = debounce(async (changes: any[]) => {
        this.debug('LifeLog changes detail:', JSON.stringify(changes, null, 2));

        // 修改段落过滤逻辑
        let paragraphs = changes.filter(p => {
            if ((p.action !== "update" && p.action !== "insert") || !p.data) return false; // 允许 "insert" 和 "update"
            // 确保 data 是字符串类型
            const data = typeof p.data === 'string' ? p.data : JSON.stringify(p.data);
            // 检查 data 字段是否包含 NodeParagraph
            return data.includes('data-type="NodeParagraph"');
        });
        this.debug('LifeLog filtered paragraphs with text:', paragraphs);

        paragraphs.sort((a, b) => a.timestamp - b.timestamp);

        // 去重
        const uniqueParagraphs: { [key: string]: any } = {};
        paragraphs.forEach(p => uniqueParagraphs[p.id] = p);
        paragraphs = Object.values(uniqueParagraphs);
        this.debug('LifeLog unique paragraphs:', paragraphs);

        if(!paragraphs.length) {
            this.warn('LifeLog watched no paragraph');
            return;
        }

        // 处理符合条件的段落
        const validParagraphs = [];
        paragraphs.forEach(p => {
            // 先尝试快速匹配时间格式
            const quickMatch = p.data.match(/contenteditable="true"[^>]*>(\d{2}:\d{2}(:\d{2})?)\s+/);
            if (!quickMatch) {
                this.warn('LifeLog invalid time format in quick check');
                return;
            }

            // 获取完整文本内容
            const div = document.createElement('div');
            div.innerHTML = p.data;
            const contentDiv = div.querySelector('[contenteditable="true"]');
            const text = contentDiv ? contentDiv.textContent?.trim() : '';

            if (!text) {
                this.warn('LifeLog no text content found');
                return;
            }

            // 使用完整文本进行精确匹配
            const timeMatch = text.match(/^(\d{2}:\d{2}(:\d{2})?)\s+(\S[^\n\r]*)?$/);
            if (!timeMatch) {
                this.warn('LifeLog invalid time format:', text);
                return;
            }
            const time = timeMatch[1];
            const content = timeMatch[3];

            if (!content) {
                this.warn('LifeLog only has time');
                return;
            }

            validParagraphs.push({
                ...p,
                content: text,
                time,
                contentWithoutTime: content
            });
        });

        // 更新属性
        const ids = validParagraphs.map(p => p.id);
        // 修改获取属性的方法，使用 API 中的 getBlockAttrs
        const attrs: { [key: string]: any } = {};
        for (const id of ids) {
            attrs[id] = await getBlockAttrs(id);
        }

        const updates = [];
        for(const p of validParagraphs) {
            const colonIndex = p.contentWithoutTime.indexOf('：');
            const type = p.contentWithoutTime.substring(0, colonIndex);
            const content = p.contentWithoutTime.substring(colonIndex + 1);
            const now = formatDateTime(new Date());

            updates.push({
                id: p.id,
                attrs: {
                    [ATTRS.time]: p.time,
                    [ATTRS.date]: p.docDate,  // 使用文档的日期
                    [ATTRS.type]: type,
                    [ATTRS.content]: content,
                    [ATTRS.created]: attrs[p.id]?.[ATTRS.created] || now,
                    [ATTRS.updated]: now
                }
            });
        }

        await this.updateBlockAttrs(updates);
    }, 1000);

    private async updateBlockAttrs(updates: any[]) {
        for (const update of updates) {
            await setBlockAttrs(update.id, update.attrs);
        }
    }
}