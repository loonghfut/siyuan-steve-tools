/**
 * 五彩服务 API 客户端库
 * 
 * 用于与五彩服务进行交互，支持思源笔记数据的同步
 * 
 * @packageDocumentation
 */

// ============================================================================
// 常量定义
// ============================================================================

export const WUCAI_VERSION = '24.1.14';
export const WUCAI_VERSION_NUM = 240114;
export const WUCAI_APPID = '20';
export const WUCAI_SERVICE_ID = 34;
export const WUCAI_ENDPOINT = 'siyuanwucaiplugin';
export const WUCAI_BASE_URL = 'https://marker.dotalk.cn';

// API 路径
export const API_URL_INIT = '/apix/openapi/wucai/sync/init';
export const API_URL_DOWNLOAD = '/apix/openapi/wucai/sync/download';
export const API_URL_ACK = '/apix/openapi/wucai/sync/ack';
export const API_URL_DELETE_SERVER_NOTE = '/apix/openapi/wucai/sync/delete';
export const API_URL_ARCHIVE_NOTE = '/apix/openapi/wucai/sync/archive';

// ============================================================================
// 接口定义
// ============================================================================

/**
 * 同步初始化响应
 */
export interface ExportInitResponse {
    /** 下次同步的光标位置 */
    lastCursor2: string;
    /** 任务状态: SYNCED | SYNCING | EXPIRED | 其他 */
    taskStatus: string;
    /** 导出配置 */
    exportConfig: WuCaiExportConfig;
}

/**
 * 下载响应
 */
export interface ExportDownloadResponse {
    /** 笔记列表 */
    notes: Array<NoteEntry>;
    /** 下次同步的光标位置 */
    lastCursor2: string;
}

/**
 * 导出配置
 */
export interface WuCaiExportConfig {
    /** 思源笔记标题模板 */
    sytitlet: string;
    /** 思源笔记内容模板 */
    sytpl: string;
    /** 写入模式 */
    sywrites: number;
    /** 查询条件 */
    syquery: string;
}

/**
 * 笔记条目（API返回格式）
 */
export interface NoteEntry {
    /** 笔记标题 */
    title: string;
    /** 原文链接 */
    url: string;
    /** 五彩后台链接 */
    wucaiurl: string;
    /** 全文剪藏链接 */
    readurl: string;
    /** 来源 */
    sou: string;
    /** 笔记唯一ID */
    noteIdX: string;
    /** 笔记类型: 1=普通页面, 3=日记 */
    noteType: number;
    /** 创建时间戳（秒） */
    createAt: number;
    /** 更新时间戳（秒） */
    updateAt: number;
    /** 页面笔记 */
    pageNote: string;
    /** 页面评分（星标>0） */
    pageScore: number;
    /** 引用键 */
    citekey: string;
    /** 作者 */
    author: string;
    /** 发布时间戳 */
    publishat: number;
    /** 标签列表 */
    tags: Array<string>;
    /** 笔记标签（逗号分隔） */
    notetags: string;
    /** 划线列表 */
    highlights: Array<HighlightInfoAPI>;
}

/**
 * 划线信息（API返回格式）
 */
export interface HighlightInfoAPI {
    /** 文字划线内容 */
    note: string;
    /** 图片划线URL */
    imageUrl: string;
    /** 更新时间戳 */
    updateat: number;
    /** 创建时间戳 */
    createat: number;
    /** 划线类型: 1=文字, 2=图片, 3=数学, 4=引用 */
    highlighttype: number;
    /** 划线想法/批注 */
    annotation: string;
    /** 颜色标识 */
    color: string;
    /** 颜色槽ID */
    slotid: number;
    /** 划线ID */
    refid: string;
    /** 划线跳转链接 */
    refurl: string;
    /** 原文跳转链接 */
    url: string;
}

/**
 * 划线类型映射
 */
export const HIGHLIGHT_TYPE_MAP: { [key: number]: string } = {
    1: 'highlight',
    2: 'image',
    3: 'math',
    4: 'quote',
};

/**
 * 划线信息（格式化后）
 */
export interface HighlightInfo {
    /** 划线文字 */
    note: string;
    /** 图片划线URL */
    imageurl: string;
    /** 更新时间戳 */
    updateat_ts: number;
    /** 创建时间戳 */
    createat_ts: number;
    /** 划线类型 */
    type: string;
    /** 划线想法 */
    annotation: string;
    /** 颜色 */
    color: string;
    /** 颜色槽ID */
    slotid: number;
    /** 划线ID */
    refid: string;
    /** 划线跳转链接 */
    refurl: string;
}

/**
 * 页面上下文（用于模板渲染）
 */
export interface WuCaiPageContext {
    /** 页面标题 */
    title: string;
    /** 原链接 */
    url: string;
    /** 五彩后台链接 */
    wucaiurl: string;
    /** 全文剪藏链接 */
    readurl: string;
    /** 格式化的标签（带 # 前缀） */
    tags: string;
    /** 合并后的标签列表 */
    alltags: string;
    /** 页面笔记 */
    pagenote: string;
    /** 笔记类型: 'page' | 'dailynote' */
    notetype: string;
    /** 是否星标 */
    isstar: boolean;
    /** 是否剪藏 */
    ispagemirror: boolean;
    /** 是否日记 */
    isdailynote: boolean;
    /** 创建时间（格式化） */
    createat: string;
    /** 更新时间（格式化） */
    updateat: string;
    /** 笔记ID */
    noteid: string;
    /** 创建时间戳 */
    createat_ts: number;
    /** 更新时间戳 */
    updateat_ts: number;
    /** 引用键 */
    citekey: string;
    /** 作者 */
    author: string;
    /** 发布时间（格式化） */
    publishat: string;
    /** 发布时间戳 */
    publishat_ts: number;
    /** 域名 */
    domain: string;
    /** 二级域名 */
    domain2: string;
    /** 划线数量 */
    highlightcount: number;
    /** 剪藏的Markdown内容 */
    mdcontent: string;
    /** 格式化后的划线列表 */
    highlights: Array<HighlightInfo>;
}

/**
 * 插件设置
 */
export interface WuCaiPluginSettings {
    /** 客户端ID */
    clientId: string;
    /** 用户认证Token */
    token: string;
    /** 思源笔记本名称 */
    notename: string;
    /** 思源笔记本ID */
    notebook: string;
    /** 上次同步光标 */
    lastCursor2: string;
    /** 导出配置 */
    exportConfig: WuCaiExportConfig;
    /** 上次同步是否失败 */
    lastSyncFailed: boolean;
}

/**
 * 同步响应基类
 */
export interface WuCaiResponse<T = any> {
    /** 响应码: 0=成功 */
    code: number;
    /** 响应数据 */
    data: T;
    /** 响应消息 */
    message: string;
}

/**
 * 任务状态类型
 */
export type TaskStatus = 'SYNCED' | 'SYNCING' | 'EXPIRED' | string;

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 生成客户端ID
 */
export function genClientID(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

/**
 * 从URL获取域名
 * @param url 原始URL
 * @returns 域名（小写）
 */
export function getDomainByUrl(url: string): string {
    if (!url) return '';
    if (/^www\./.test(url)) {
        url = 'https://' + url;
    }
    try {
        const u = new URL(url);
        return u.hostname.toLowerCase();
    } catch {
        return '';
    }
}

/**
 * 从域名获取二级域名
 * @param domain 完整域名
 * @returns 二级域名
 */
export function getDomain2ByDomain(domain: string): string {
    if (!domain || domain.length <= 0) return '';
    const parts = domain.split('.');
    if (parts.length <= 2) return domain;
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
}

/**
 * 格式化时间戳
 * @param ts 时间戳（秒）
 * @param format 格式模板
 * @returns 格式化的时间字符串
 */
export function formatTime(ts: number, format: string = 'YYYY-MM-DD HH:mm'): string {
    if (ts <= 0) return '';
    const date = new Date(ts * 1000);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return format
        .replace('YYYY', date.getFullYear().toString())
        .replace('MM', pad(date.getMonth() + 1))
        .replace('DD', pad(date.getDate()))
        .replace('HH', pad(date.getHours()))
        .replace('mm', pad(date.getMinutes()));
}

/**
 * 格式化划线信息
 * @param entryUrl 原文URL
 * @param highlights 原始划线列表
 * @returns 格式化后的划线列表
 */
export function formatHighlights(
    entryUrl: string, 
    highlights: Array<HighlightInfoAPI>
): Array<HighlightInfo> {
    if (!highlights) return [];
    
    return highlights.map(old => {
        const type = old.highlighttype || 1;
        const highlight: HighlightInfo = {
            note: (old.note || old.imageUrl || '').trim(),
            imageurl: old.imageUrl,
            updateat_ts: old.updateat,
            createat_ts: old.createat,
            type: HIGHLIGHT_TYPE_MAP[type] || 'highlight',
            annotation: old.annotation || '',
            color: old.color,
            slotid: old.slotid,
            refid: old.refid,
            refurl: old.refurl ? (entryUrl ? entryUrl + old.refurl : '') : '',
        };
        return highlight;
    });
}

/**
 * 格式化标签
 * @param tags 标签数组
 * @param isHashTag 是否使用 # 标签格式
 * @returns 格式化后的标签字符串
 */
export function formatTags(tags: Array<string>, isHashTag: boolean = true): string {
    if (!tags || tags.length === 0) return '';
    
    const ret: Array<string> = [];
    tags.forEach(tag => {
        tag = tag.trim();
        if (!tag || tag.length <= 0) return;
        tag = tag.replace(/\s+/g, '-');
        const isHash = tag[0] === '#';
        const isInner = tag[0] === '[';
        
        if (isHash && isHashTag) {
            ret.push(tag);
        } else if (isInner && !isHashTag) {
            ret.push(tag);
        } else {
            let coreTag = '';
            if (isHash) {
                coreTag = tag.substring(1);
            } else if (isInner) {
                coreTag = tag.substring(2, tag.length - 2).trim();
            }
            if (coreTag.length > 0) {
                ret.push(isHashTag ? `#${coreTag}#` : `[[${coreTag}]]`);
            }
        }
    });
    return ret.join(' ');
}

/**
 * 合并并去重标签
 * @param t1 标签数组
 * @param t2 标签字符串（逗号分隔）
 * @returns 合并后的标签字符串
 */
export function mergeTagsAndTrim(t1: Array<string>, t2: string): string {
    t1 = t1 || [];
    t2 = t2 || '';
    const t2tag = t1
        .concat(t2.split(','))
        .filter(x => x)
        .map(x => x.replace(/[#\[\]]/g, '').replace(/\s+/g, '-'));
    
    const ret: { [key: string]: number } = {};
    for (const tg of t2tag) {
        if (!tg) continue;
        if (ret[tg] === undefined) {
            ret[tg] = 1;
        }
    }
    return Object.keys(ret).sort().join(' ');
}

/**
 * 标准化标题
 * @param title 原始标题
 * @returns 标准化后的标题
 */
export function normalTitle(title: string): string {
    title = title || '';
    title = title.replace(/[\s\t\n]+/g, ' ');
    title = title.replace(/[\~\\、\/\*"'<>%\$#&;；:?？。，！!\|]/g, '');
    if (title.length <= 0) return 'No title';
    return title;
}

/**
 * 标准化页面标题
 * @param title 原始标题
 * @returns 标准化后的标题
 */
export function formatPageTitle(title: string): string {
    if (!title || title.length <= 0) return title;
    return title.replace(/(:\s+)/g, ':');
}

/**
 * 获取高亮URL
 * @param entryUrl 原文URL
 * @param refurl 划线URL片段
 * @returns 完整的划线URL
 */
export function getHighlightUrl(entryUrl: string, refurl: string): string {
    if (!entryUrl || !refurl) return '';
    entryUrl = entryUrl.replace(/#+$/, '');
    const idx = entryUrl.indexOf('#');
    if (idx >= 0) return entryUrl;
    return entryUrl + refurl;
}

// ============================================================================
// API 客户端类
// ============================================================================

/**
 * 五彩服务 API 客户端
 */
export class WuCaiClient {
    private token: string;
    private clientId: string;
    private baseUrl: string = WUCAI_BASE_URL;

    /**
     * 创建五彩API客户端
     * @param token 用户认证Token
     * @param clientId 客户端唯一标识
     */
    constructor(token: string, clientId: string) {
        this.token = token;
        this.clientId = clientId;
    }

    /**
     * 获取认证头
     */
    private getHeaders(): HeadersInit {
        return {
            'Authorization': `Token ${this.token}`,
            'Siyuan-Client': this.clientId,
            'Content-Type': 'application/json',
        };
    }

    /**
     * 构建带认证参数的URL
     * @param path API路径
     * @returns 完整的请求URL
     */
    private buildUrl(path: string): string {
        const reqtime = Math.floor(Date.now() / 1000);
        return `${this.baseUrl}${path}?appid=${WUCAI_APPID}&ep=${WUCAI_ENDPOINT}&version=${WUCAI_VERSION}&reqtime=${reqtime}`;
    }

    /**
     * 发起POST请求
     * @param path API路径
     * @param data 请求数据
     * @returns 响应对象
     */
    private async post<T>(path: string, data: any): Promise<T> {
        const url = this.buildUrl(path);
        const response = await fetch(url, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(data),
        });
        return response.json();
    }

    /**
     * 初始化同步
     * @param lastCursor2 上次同步的光标位置
     * @returns 同步初始化响应
     */
    async initSync(lastCursor2: string = ''): Promise<WuCaiResponse<ExportInitResponse>> {
        return this.post(API_URL_INIT, { lastCursor2 });
    }

    /**
     * 下载笔记数据
     * @param lastCursor2 当前同步光标位置
     * @param flagx 调试标志
     * @param query 查询条件
     * @returns 下载响应
     */
    async downloadNotes(
        lastCursor2: string, 
        flagx: string = '', 
        query: string = ''
    ): Promise<WuCaiResponse<ExportDownloadResponse>> {
        return this.post(API_URL_DOWNLOAD, {
            lastCursor2,
            flagx,
            q: query,
        });
    }

    /**
     * 确认同步完成
     * @param lastCursor2 同步光标位置
     * @returns 确认响应
     */
    async acknowledgeSync(lastCursor2: string): Promise<WuCaiResponse> {
        return this.post(API_URL_ACK, { lastCursor2 });
    }

    /**
     * 删除服务器笔记
     * @param noteIdX 笔记唯一ID
     * @returns 删除响应
     */
    async deleteNote(noteIdX: string): Promise<WuCaiResponse> {
        return this.post(API_URL_DELETE_SERVER_NOTE, { noteIdX });
    }

    /**
     * 归档笔记
     * @param noteIdX 笔记唯一ID
     * @returns 归档响应
     */
    async archiveNote(noteIdX: string): Promise<WuCaiResponse> {
        return this.post(API_URL_ARCHIVE_NOTE, { noteIdX });
    }
}

// ============================================================================
// 同步管理器类
// ============================================================================

/**
 * 同步回调接口
 */
export interface SyncCallbacks {
    /** 同步开始 */
    onSyncStart?: () => void;
    /** 同步完成 */
    onSyncComplete?: (lastCursor: string) => void;
    /** 同步错误 */
    onSyncError?: (error: string) => void;
    /** 收到笔记 */
    onNoteReceived?: (note: NoteEntry) => Promise<void>;
    /** 同步进度 */
    onProgress?: (current: number, total: number, lastCursor: string) => void;
}

/**
 * 五彩同步管理器
 * 封装完整的同步流程
 */
export class WuCaiSyncManager {
    private client: WuCaiClient;
    private settings: WuCaiPluginSettings;
    private callbacks: SyncCallbacks;

    /**
     * 创建同步管理器
     * @param settings 插件设置
     * @param callbacks 回调函数
     */
    constructor(settings: WuCaiPluginSettings, callbacks: SyncCallbacks = {}) {
        this.client = new WuCaiClient(settings.token, settings.clientId);
        this.settings = settings;
        this.callbacks = callbacks;
    }

    /**
     * 开始同步流程
     */
    async startSync(): Promise<string> {
        try {
            this.callbacks.onSyncStart?.();

            // 1. 初始化同步
            const initResponse = await this.client.initSync(this.settings.lastCursor2);
            
            if (initResponse.code !== 0) {
                throw new Error(initResponse.message || '初始化同步失败');
            }

            const { taskStatus, lastCursor2, exportConfig } = initResponse.data;

            // 检查任务状态
            if (taskStatus === 'SYNCED') {
                // 已同步完成
                await this.handleSyncComplete(lastCursor2);
                return lastCursor2;
            }

            if (taskStatus === 'EXPIRED') {
                throw new Error('同步服务已过期');
            }

            // 2. 下载数据
            const finalCursor = await this.downloadAllNotes(lastCursor2, exportConfig.syquery);

            // 3. 确认同步完成
            await this.client.acknowledgeSync(finalCursor);

            await this.handleSyncComplete(finalCursor);
            return finalCursor;

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '同步失败';
            this.callbacks.onSyncError?.(errorMessage);
            throw error;
        }
    }

    /**
     * 下载所有笔记
     * @param startCursor 起始光标
     * @param query 查询条件
     * @returns 最终光标
     */
    private async downloadAllNotes(startCursor: string, query: string = ''): Promise<string> {
        let currentCursor = startCursor;
        let totalNotes = 0;

        while (true) {
            const response = await this.client.downloadNotes(currentCursor, '', query);
            
            if (response.code !== 0) {
                throw new Error(response.message || '下载笔记失败');
            }

            const { notes, lastCursor2 } = response.data;
            const notesCount = notes.length;

            // 处理每个笔记
            for (const note of notes) {
                await this.callbacks.onNoteReceived?.(note);
            }

            totalNotes += notesCount;
            this.callbacks.onProgress?.(totalNotes, -1, lastCursor2);

            // 没有更多数据，完成同步
            if (notesCount <= 0) {
                return lastCursor2;
            }

            // 继续下载
            currentCursor = lastCursor2;
            
            // 避免请求过快
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }

    /**
     * 处理同步完成
     * @param lastCursor 最终光标
     */
    private async handleSyncComplete(lastCursor: string): Promise<void> {
        // 更新设置中的光标
        this.settings.lastCursor2 = lastCursor;
        this.callbacks.onSyncComplete?.(lastCursor);
    }

    /**
     * 获取Token生成链接
     * @returns Token生成链接
     */
    static getTokenLink(): string {
        const clientId = genClientID();
        return `${WUCAI_BASE_URL}/page/gentoken/${WUCAI_SERVICE_ID}/${clientId}`;
    }
}

// ============================================================================
// 默认导出（用于 CommonJS 兼容）
// ============================================================================

export default {
    // 常量
    WUCAI_VERSION,
    WUCAI_VERSION_NUM,
    WUCAI_APPID,
    WUCAI_BASE_URL,

    // API路径
    API_URL_INIT,
    API_URL_DOWNLOAD,
    API_URL_ACK,
    API_URL_DELETE_SERVER_NOTE,
    API_URL_ARCHIVE_NOTE,

    // 工具函数
    genClientID,
    getDomainByUrl,
    getDomain2ByDomain,
    formatTime,
    formatHighlights,
    formatTags,
    mergeTagsAndTrim,
    normalTitle,
    formatPageTitle,
    getHighlightUrl,
    HIGHLIGHT_TYPE_MAP,

    // 类
    WuCaiClient,
    WuCaiSyncManager,
};
