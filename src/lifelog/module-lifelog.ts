import { Plugin } from "siyuan";
import { getBlockAttrs, setBlockAttrs, getBlockByID } from "../api/api";
import { applyLifelogTypeStyles } from "./styles/colors";
import {
    ATTRS,
    LIFELOG_CHANGED_EVENT,
    clearLifelogSelfWrite,
    markLifelogSelfWrite,
} from './contracts';

const DAILY_NOTE_ATTR_PREFIX = 'custom-dailynote-';  // 思源 daily note 文档块属性前缀，完整格式: custom-dailynote-YYYYMMDD

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

/**
 * 根据分隔符配置拆分类型与内容。
 * @param text 不含时间的正文（已去掉开头的 HH:mm）
 * @param separatorSetting 'full' | 'half' | 'any'（auto 视同 any）
 * @returns { type, content }
 *
 * 规则：
 * - full: 仅认全角 ：
 * - half: 仅认半角 :
 * - any/auto/其它: 二者皆可，优先全角
 * - 无冒号：type='未分类'，content=完整文本（不丢弃）
 */
function splitTypeContent(text: string, separatorSetting: string): { type: string; content: string } {
    const trimmed = text.trim();
    let idx = -1;
    if (separatorSetting === 'full') {
        idx = trimmed.indexOf('：');
    } else if (separatorSetting === 'half') {
        idx = trimmed.indexOf(':');
    } else {
        // any / auto / 默认：优先全角，再退回半角
        idx = trimmed.indexOf('：');
        if (idx === -1) idx = trimmed.indexOf(':');
    }
    if (idx === -1) {
        return { type: '未分类', content: trimmed };
    }
    return {
        type: trimmed.substring(0, idx),
        content: trimmed.substring(idx + 1).trim(),
    };
}

export class M_lifelog {
    private plugin: Plugin;
    private settings: any;
    public enabled: boolean = false;  // 添加启用状态属性
    // 段落块ID → 所属文档块ID(rootID) 缓存；段落不会跨文档移动，无需 TTL
    private rootIdCache: Map<string, string> = new Map();

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
        // 注入用户自定义类型颜色样式（日记段落着色）
        applyLifelogTypeStyles(this.settings['lifelog-type-colors'] || '', this.enabled);
        this.plugin.eventBus.on("ws-main", this.wsMainHandler);
        this.debug('LifeLog module loaded and watching');
    }

    onunload() {
        console.debug('LifeLog module unloading...');
        // 移除属性标记
        document.body.removeAttribute('data-lifelog-enabled');
        // 移除注入的自定义类型样式
        applyLifelogTypeStyles('', false);
        this.plugin.eventBus.off("ws-main", this.wsMainHandler);
        this.rootIdCache.clear();
        console.debug('LifeLog module unloaded');
    }

    // 添加设置更新处理方法
    updateSettings(settings: any) {
        this.settings = settings;
        if (this.settings['lifelog-enable']) {
            document.body.setAttribute('data-lifelog-enabled', 'true');
        } else {
            document.body.removeAttribute('data-lifelog-enabled');
        }
        // 用户可能改了类型颜色配置或开关，重新应用样式
        applyLifelogTypeStyles(this.settings['lifelog-type-colors'] || '', this.settings['lifelog-enable'] === true);
    }

    private debug(message: string, ...args: any[]) {
        if (this.settings['lifelog-debug']) {
            console.debug(message, ...args);
        }
    }

    private warn(message: string, ...args: any[]) {
        // warn 始终输出（便于排查），debug 才走开关
        if (this.settings['lifelog-debug']) {
            console.warn(message, ...args);
        }
    }

    /**
     * 通过段落块ID 拿到所属文档块ID（rootID）。带缓存（段落不跨文档移动，无需 TTL）。
     */
    private async getRootId(paragraphId: string): Promise<string | null> {
        const cached = this.rootIdCache.get(paragraphId);
        if (cached) return cached;
        try {
            const block = await getBlockByID(paragraphId);
            const rootId = block?.root_id;
            if (rootId) {
                this.rootIdCache.set(paragraphId, rootId);
                return rootId;
            }
            return null;
        } catch (err) {
            this.warn('获取 rootID 出错:', err);
            return null;
        }
    }

    /**
     * 核心：判断段落所属文档是否为 daily note，并提取日期。
     *
     * 通过读文档块(rootID)的属性，找以 custom-dailynote- 开头的属性，
     * 完整格式 custom-dailynote-YYYYMMDD。命中即判定为日记，日期直接从属性名提取
     * （YYYYMMDD → YYYY/MM/DD）。这是思源官方 daily note 的标识方式，不依赖文件路径或文件名。
     *
     * @returns { docDate: 'YYYY/MM/DD' } 命中；null 非日记或无法确定日期
     */
    private async resolveDailyNoteDate(paragraphId: string): Promise<{ docDate: string } | null> {
        const rootId = await this.getRootId(paragraphId);
        if (!rootId) return null;
        try {
            const docAttrs = await getBlockAttrs(rootId);
            if (!docAttrs) return null;
            // 遍历属性名，找 custom-dailynote-YYYYMMDD
            for (const name of Object.keys(docAttrs)) {
                if (name.startsWith(DAILY_NOTE_ATTR_PREFIX)) {
                    const yyyymmdd = name.substring(DAILY_NOTE_ATTR_PREFIX.length);
                    // 严格校验 8 位数字
                    if (/^\d{8}$/.test(yyyymmdd)) {
                        const docDate = `${yyyymmdd.substring(0, 4)}/${yyyymmdd.substring(4, 6)}/${yyyymmdd.substring(6, 8)}`;
                        this.debug('LifeLog daily note (attr):', rootId, '→', docDate);
                        return { docDate };
                    }
                }
            }
        } catch (err) {
            this.warn('读取文档块属性出错:', err);
        }
        return null;
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

                // 核心：判断段落所属文档是否为 daily note，并提取日期
                const daily = await this.resolveDailyNoteDate(change.id);
                if (daily) {
                    dailyChanges.push({
                        ...change,
                        docDate: daily.docDate
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

        const separatorSetting = this.settings['lifelog-time-separator'] || 'any';

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

            // 使用完整文本进行精确匹配（受 lifelog-allow-seconds 控制）
            const allowSeconds = this.settings['lifelog-allow-seconds'] !== false;
            const timeRegex = allowSeconds
                ? /^(\d{2}:\d{2}(:\d{2})?)\s+(\S[^\n\r]*)?$/
                : /^(\d{2}:\d{2})\s+(\S[^\n\r]*)?$/;
            const timeMatch = text.match(timeRegex);
            if (!timeMatch) {
                this.warn('LifeLog invalid time format:', text);
                return;
            }
            const time = timeMatch[1];
            const rest = timeMatch[3];

            if (!rest) {
                this.warn('LifeLog only has time');
                return;
            }

            // 用可配置分隔符拆分类型与内容（无冒号时 type='未分类'，content=完整文本，不再丢弃）
            const { type, content } = splitTypeContent(rest, separatorSetting);

            validParagraphs.push({
                ...p,
                content: text,
                time,
                contentWithoutTime: rest,
                type,
                contentText: content,
            });
        });

        if (validParagraphs.length === 0) {
            this.warn('LifeLog: no valid paragraph after parsing');
            return;
        }

        // 更新属性
        const ids = validParagraphs.map(p => p.id);
        // 并行 getBlockAttrs（参考 lifelog-view 的容错写法）
        const attrs: { [key: string]: any } = {};
        const attrsResults = await Promise.all(
            ids.map(async (id) => {
                try {
                    return [id, await getBlockAttrs(id)] as const;
                } catch (e) {
                    this.warn('LifeLog getBlockAttrs failed for', id, e);
                    return [id, {}] as const;
                }
            })
        );
        for (const [id, val] of attrsResults) {
            attrs[id] = val;
        }

        const updates = [];
        for(const p of validParagraphs) {
            const now = formatDateTime(new Date());

            updates.push({
                id: p.id,
                attrs: {
                    [ATTRS.time]: p.time,
                    [ATTRS.date]: p.docDate,  // 使用文档的日期
                    [ATTRS.type]: p.type,
                    [ATTRS.content]: p.contentText,
                    [ATTRS.created]: attrs[p.id]?.[ATTRS.created] || now,
                    [ATTRS.updated]: now
                }
            });
        }

        await this.updateBlockAttrs(updates);
    }, 1000);

    private async updateBlockAttrs(updates: any[]) {
        // 并行 setBlockAttrs，单条失败不影响其他
        const writtenIds: string[] = [];
        // 提前登记到 pendingWrittenIds，避免下面 setBlockAttrs 广播的 updateAttrs
        // 被 transactionListener 当成"用户编辑"再次触发全量日历刷新。
        for (const u of updates) {
            if (u?.id) {
                markLifelogSelfWrite(u.id);
                writtenIds.push(u.id);
            }
        }
        await Promise.all(
            updates.map(async (update) => {
                try {
                    await setBlockAttrs(update.id, update.attrs);
                } catch (e) {
                    this.warn('LifeLog setBlockAttrs failed for', update.id, e);
                }
            })
        );

        // 写完后广播一个自定义事件，让日历侧只对受影响的 block 做增量更新，
        // 而不是触发全量 refetchEvents（原链路会重取整月 N 条 lifelog 属性）。
        if (writtenIds.length > 0) {
            try {
                // eventBus.on/off 的签名限定为 keyof IEventBusMap（思源内置事件），
                // 自定义事件名需断言。这是思源插件常见做法，eventBus 内部按字符串匹配。
                const bus = this.plugin.eventBus as any;
                bus.emit(LIFELOG_CHANGED_EVENT, { ids: writtenIds });
            } catch (e) {
                this.warn('LifeLog emit changed event failed:', e);
            }
            // 给一个宽松窗口后清理标记：updateAttrs 广播通常会在此期间到达。
            // 用 setTimeout 而非立即清除，确保 transactionListener 能看到标记。
            const idsToClean = writtenIds.slice();
            setTimeout(() => {
                idsToClean.forEach(clearLifelogSelfWrite);
            }, 3000);
        }
    }
}

/**
 * 判断某个 blockId 是否是 lifelog 模块自己刚写入的（用于 transactionListener
 * 过滤掉自反射的 updateAttrs，避免触发全量日历刷新）。
 */
