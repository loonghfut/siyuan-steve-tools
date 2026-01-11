/**
 * 五彩同步服务
 * 
 * 实现将五彩数据同步到思源日记的功能
 */

import { appendBlock, getBlockAttrs, setBlockAttrs, sql, updateBlock } from "@/api/api";
import { createDailynote } from "@frostime/siyuan-plugin-kits";
import {
    WuCaiClient,
    WuCaiPluginSettings,
    NoteEntry,
    WuCaiPageContext,
    HighlightInfo,
    genClientID,
    getDomainByUrl,
    getDomain2ByDomain,
    formatTime,
    formatHighlights,
    formatTags,
    mergeTagsAndTrim,
    normalTitle,
    WUCAI_BASE_URL,
    WUCAI_SERVICE_ID,
} from "@/api/wucai-api";

// ============================================================================
// 同步状态类型
// ============================================================================

export type SyncState = 'idle' | 'syncing' | 'success' | 'error';

export interface WucaiSyncResult {
    success: boolean;
    message: string;
    syncedCount: number;
    lastCursor?: string;
}

// ============================================================================
// 五彩同步服务类
// ============================================================================

/**
 * 五彩同步服务
 * 负责将五彩数据同步到思源笔记日记中
 */
export class WucaiSyncService {
    private settings: WuCaiPluginSettings;
    private notebookId: string;
    private syncState: SyncState = 'idle';
    private syncedCount: number = 0;
    private onStateChange?: (state: SyncState, message: string) => void;

    // 思源属性名（用于增量同步幂等）
    private static readonly ATTR_REMOTE_ID = 'custom-wucai-noteid';
    private static readonly ATTR_REMOTE_UPDATE_AT = 'custom-wucai-updateat';
    private static readonly ATTR_REMOTE_CREATE_AT = 'custom-wucai-createat';
    private static readonly ATTR_WUCAI = 'custom-wucai';

    // 子块：meta 与 highlight 的增量标记
    private static readonly ATTR_META = 'custom-wucai-meta';
    private static readonly ATTR_HL_KEY = 'custom-wucai-hlkey';
    private static readonly ATTR_HL_HASH = 'custom-wucai-hlhash';

    constructor(settings: WuCaiPluginSettings, notebookId: string) {
        this.settings = settings;
        this.notebookId = notebookId;
    }

    /**
     * 设置状态变更回调
     */
    setStateChangeCallback(callback: (state: SyncState, message: string) => void) {
        this.onStateChange = callback;
    }

    /**
     * 获取当前同步状态
     */
    getState(): SyncState {
        return this.syncState;
    }

    /**
     * 更新状态
     */
    private updateState(state: SyncState, message: string = '') {
        this.syncState = state;
        this.onStateChange?.(state, message);
    }

    /**
     * 开始同步流程
     */
    async startSync(): Promise<WucaiSyncResult> {
        if (this.syncState === 'syncing') {
            return { success: false, message: '同步正在进行中', syncedCount: 0 };
        }

        // 验证配置
        if (!this.settings.token) {
            return { success: false, message: '请先配置五彩Token', syncedCount: 0 };
        }

        if (!this.notebookId) {
            return { success: false, message: '请先选择目标日记本', syncedCount: 0 };
        }

        this.syncedCount = 0;
        this.updateState('syncing', '正在初始化同步...');

        try {
            const client = new WuCaiClient(this.settings.token, this.settings.clientId);

            // 1. 初始化同步
            this.updateState('syncing', '正在连接五彩服务...');
            const initResponse = await client.initSync(this.settings.lastCursor2);

            // 检查响应
            if (initResponse.code === 10000) {
                // Token 无效
                this.settings.token = '';
                throw new Error('Token无效，请重新配置');
            }

            if (initResponse.code === 10100 || initResponse.code === 10101) {
                // 服务到期
                this.settings.token = '';
                throw new Error('五彩同步服务已到期');
            }

            if (initResponse.code !== 1) {
                throw new Error(initResponse.message || '初始化同步失败');
            }

            const { taskStatus, lastCursor2, exportConfig } = initResponse.data;

            // 更新游标
            if (lastCursor2) {
                this.settings.lastCursor2 = lastCursor2;
            }

            // 检查任务状态
            if (taskStatus === 'SYNCED') {
                this.updateState('success', '已是最新，无需同步');
                return { 
                    success: true, 
                    message: '已是最新，无需同步', 
                    syncedCount: 0,
                    lastCursor: lastCursor2 
                };
            }

            if (taskStatus === 'EXPIRED') {
                throw new Error('五彩同步服务已过期');
            }

            // 保存导出配置
            if (exportConfig) {
                this.settings.exportConfig = exportConfig;
            }

            // 2. 分页下载数据
            this.updateState('syncing', '正在下载数据...');
            const finalCursor = await this.downloadAndProcessNotes(
                client, 
                lastCursor2, 
                exportConfig?.syquery || ''
            );

            // 3. 确认同步完成
            this.updateState('syncing', '正在确认同步...');
            await client.acknowledgeSync(finalCursor);

            // 更新最终游标
            this.settings.lastCursor2 = finalCursor;
            this.settings.lastSyncFailed = false;

            this.updateState('success', `同步完成，共同步 ${this.syncedCount} 条数据`);
            return {
                success: true,
                message: `同步完成，共同步 ${this.syncedCount} 条数据`,
                syncedCount: this.syncedCount,
                lastCursor: finalCursor
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '同步失败';
            this.settings.lastSyncFailed = true;
            this.updateState('error', errorMessage);
            return { success: false, message: errorMessage, syncedCount: this.syncedCount };
        }
    }

    /**
     * 分页下载并处理笔记
     */
    private async downloadAndProcessNotes(
        client: WuCaiClient, 
        startCursor: string, 
        query: string
    ): Promise<string> {
        let currentCursor = startCursor;
        let pageIndex = 0;

        while (true) {
            pageIndex++;
            this.updateState('syncing', `正在下载第 ${pageIndex} 页数据...`);

            const response = await client.downloadNotes(currentCursor, '', query);

            // 检查错误
            if (response.code === 10000) {
                this.settings.token = '';
                throw new Error('Token无效，请重新配置');
            }

            if (response.code !== 1) {
                throw new Error(response.message || '下载数据失败');
            }

            const { notes, lastCursor2 } = response.data;

            // 更新游标：服务端可能不返回，则保留旧值
            if (lastCursor2 && lastCursor2.trim().length > 0) {
                currentCursor = lastCursor2;
            }

            // 没有更多数据，完成同步
            if (!notes || notes.length === 0) {
                return currentCursor;
            }

            // 处理每个笔记
            this.updateState('syncing', `正在处理第 ${pageIndex} 页数据 (${notes.length} 条)...`);
            await this.processNotes(notes);

            // 避免请求过快（5秒间隔）
            await this.sleep(5000);
        }
    }

    /**
     * 处理笔记列表，按日期分组追加到日记
     */
    private async processNotes(notes: NoteEntry[]): Promise<void> {
        // 按日期分组
        const notesByDate = this.groupNotesByDate(notes);

        for (const [dateStr, dayNotes] of Object.entries(notesByDate)) {
            await this.appendNotesToDailyNote(dateStr, dayNotes);
        }
    }

    /**
     * 按日期分组笔记
     */
    private groupNotesByDate(notes: NoteEntry[]): Record<string, NoteEntry[]> {
        const groups: Record<string, NoteEntry[]> = {};

        for (const note of notes) {
            // 使用笔记的创建时间或更新时间来确定日期
            const timestamp = note.updateAt || note.createAt;
            const date = new Date(timestamp * 1000);
            const dateStr = this.formatDateStr(date);

            if (!groups[dateStr]) {
                groups[dateStr] = [];
            }
            groups[dateStr].push(note);
        }

        return groups;
    }

    /**
     * 将笔记追加到指定日期的日记中
     */
    private async appendNotesToDailyNote(dateStr: string, notes: NoteEntry[]): Promise<void> {
        // 创建/获取该日期日记（按天落地）
        const date = new Date(dateStr);
        const dailyNoteId = await createDailynote(this.notebookId, date);
        if (!dailyNoteId) {
            console.error(`无法创建日记: ${dateStr}`);
            return;
        }

        // 逐条做幂等 upsert（remoteId 主键）
        for (const note of notes) {
            await this.upsertNoteIntoDailyNote(dailyNoteId, note);
        }
    }

    /**
     * 增量同步：将单条 NoteEntry 幂等 upsert 到指定日记
     * - 用 noteIdX 作为全局唯一主键写入块属性
     * - 用 updateAt 做变更检测：未变更则跳过
     * - 变更则清空子块并重建内容
     */
    private async upsertNoteIntoDailyNote(dailyNoteId: string, note: NoteEntry): Promise<void> {
        const remoteId = (note.noteIdX || '').trim();
        if (!remoteId) return;

        const remoteUpdateAt = String(note.updateAt || note.createAt || 0);
        const remoteCreateAt = String(note.createAt || 0);

        // 查找是否已同步
        const existingHeadingId = await this.findHeadingBlockIdByRemoteId(remoteId);
        if (existingHeadingId) {
            // 变更检测：updateAt 一致则跳过
            const attrs = await getBlockAttrs(existingHeadingId).catch(() => ({} as Record<string, string>));
            const savedUpdateAt = attrs[WucaiSyncService.ATTR_REMOTE_UPDATE_AT] || '';
            if (savedUpdateAt === remoteUpdateAt) {
                return;
            }

            // 更新标题块（确保标题/元信息更新）
            const headingMd = this.renderHeadingMarkdown(note);
            await updateBlock('markdown', headingMd, existingHeadingId);

            // ✅ 真正的 diff：不删子块，只更新 meta + 追加/更新 highlight 子块
            await this.upsertMetaBlock(existingHeadingId, note);
            await this.diffUpsertHighlights(existingHeadingId, note);

            await setBlockAttrs(existingHeadingId, {
                [WucaiSyncService.ATTR_WUCAI]: '1',
                [WucaiSyncService.ATTR_REMOTE_ID]: remoteId,
                [WucaiSyncService.ATTR_REMOTE_UPDATE_AT]: remoteUpdateAt,
                [WucaiSyncService.ATTR_REMOTE_CREATE_AT]: remoteCreateAt,
            });

            this.syncedCount += 1;
            return;
        }

        // 不存在：创建一个“标题块”作为容器，然后在其下追加内容
        await appendBlock('markdown', this.renderHeadingMarkdown(note), dailyNoteId);
        const headingId = await this.findLatestHeadingIdInDoc(dailyNoteId);
        if (!headingId) return;

        await setBlockAttrs(headingId, {
            [WucaiSyncService.ATTR_WUCAI]: '1',
            [WucaiSyncService.ATTR_REMOTE_ID]: remoteId,
            [WucaiSyncService.ATTR_REMOTE_UPDATE_AT]: remoteUpdateAt,
            [WucaiSyncService.ATTR_REMOTE_CREATE_AT]: remoteCreateAt,
        });

        // 初始化 meta + highlight 子块
        await this.upsertMetaBlock(headingId, note);
        await this.diffUpsertHighlights(headingId, note);

        this.syncedCount += 1;
    }

    private escapeSqlString(s: string): string {
        return (s || '').replace(/'/g, "''");
    }

    private async findHeadingBlockIdByRemoteId(remoteId: string): Promise<string | null> {
        const rid = this.escapeSqlString(remoteId);
        const rows = await sql(
            `SELECT block_id FROM attributes WHERE name = '${WucaiSyncService.ATTR_REMOTE_ID}' AND value = '${rid}' LIMIT 1`
        ).catch(() => []);
        if (Array.isArray(rows) && rows.length > 0 && rows[0]?.block_id) return String(rows[0].block_id);
        return null;
    }

    private async findLatestHeadingIdInDoc(rootId: string): Promise<string | null> {
        const rid = this.escapeSqlString(rootId);
        const rows = await sql(
            `SELECT id FROM blocks WHERE root_id = '${rid}' AND type = 'h' ORDER BY created DESC LIMIT 1`
        ).catch(() => []);
        if (Array.isArray(rows) && rows.length > 0 && rows[0]?.id) return String(rows[0].id);
        return null;
    }

    private async findLatestChildId(parentId: string): Promise<string | null> {
        const pid = this.escapeSqlString(parentId);
        const rows = await sql(
            `SELECT id FROM blocks WHERE parent_id = '${pid}' ORDER BY created DESC LIMIT 1`
        ).catch(() => []);
        if (Array.isArray(rows) && rows.length > 0 && rows[0]?.id) return String(rows[0].id);
        return null;
    }

    private async findMetaBlockIdByRemoteId(remoteId: string): Promise<string | null> {
        const rid = this.escapeSqlString(remoteId);
        const rows = await sql(
            `SELECT block_id FROM attributes WHERE name = '${WucaiSyncService.ATTR_META}' AND value = '${rid}' LIMIT 1`
        ).catch(() => []);
        if (Array.isArray(rows) && rows.length > 0 && rows[0]?.block_id) return String(rows[0].block_id);
        return null;
    }

    private async findHighlightBlockIdByKey(hlKey: string): Promise<string | null> {
        const key = this.escapeSqlString(hlKey);
        const rows = await sql(
            `SELECT block_id FROM attributes WHERE name = '${WucaiSyncService.ATTR_HL_KEY}' AND value = '${key}' LIMIT 1`
        ).catch(() => []);
        if (Array.isArray(rows) && rows.length > 0 && rows[0]?.block_id) return String(rows[0].block_id);
        return null;
    }

    private hashString(input: string): string {
        // 简单稳定 hash（djb2），用于检测 highlight 内容变化
        let hash = 5381;
        for (let i = 0; i < input.length; i++) {
            hash = ((hash << 5) + hash) + input.charCodeAt(i);
            hash |= 0;
        }
        return (hash >>> 0).toString(36);
    }

    private buildHighlightKey(remoteId: string, hl: HighlightInfo): string {
        // 优先 refid，其次 refurl / imageurl / note 的 hash，确保“同一 note 内唯一且稳定”
        const raw = (hl.refid || hl.refurl || hl.imageurl || hl.note || '').trim();
        const keyPart = raw.length > 0 ? raw : this.hashString(`${hl.type}|${hl.slotid}|${hl.createat_ts}|${hl.note}|${hl.imageurl}`);
        return `${remoteId}:${keyPart}`;
    }

    private buildHighlightHash(hl: HighlightInfo): string {
        return this.hashString([
            hl.type,
            hl.note,
            hl.imageurl,
            hl.annotation,
            hl.color,
            String(hl.slotid ?? ''),
            hl.refid,
            hl.refurl,
        ].join('|'));
    }

    /**
     * meta 子块：用于承载元信息 + “高亮”分隔标题
     * - 不删除，只原地 update
     */
    private async upsertMetaBlock(headingId: string, note: NoteEntry): Promise<void> {
        const remoteId = (note.noteIdX || '').trim();
        if (!remoteId) return;

        const metaMd = this.renderMetaMarkdown(note);

        let metaId = await this.findMetaBlockIdByRemoteId(remoteId);
        if (!metaId) {
            await appendBlock('markdown', metaMd, headingId);
            metaId = await this.findLatestChildId(headingId);
            if (!metaId) return;
            await setBlockAttrs(metaId, {
                [WucaiSyncService.ATTR_WUCAI]: '1',
                [WucaiSyncService.ATTR_META]: remoteId,
                [WucaiSyncService.ATTR_REMOTE_ID]: remoteId,
            });
            return;
        }

        await updateBlock('markdown', metaMd, metaId);
        // 防御性：确保属性存在
        await setBlockAttrs(metaId, {
            [WucaiSyncService.ATTR_WUCAI]: '1',
            [WucaiSyncService.ATTR_META]: remoteId,
            [WucaiSyncService.ATTR_REMOTE_ID]: remoteId,
        });
    }

    /**
     * 高亮 diff：
     * - 已存在（hlKey 命中）则跳过；若内容 hash 变化则 updateBlock（不删除）
     * - 不存在则追加一个新的 highlight 子块
     */
    private async diffUpsertHighlights(headingId: string, note: NoteEntry): Promise<void> {
        const ctx = this.buildPageContext(note);
        const remoteId = (note.noteIdX || '').trim();
        if (!remoteId) return;

        const highlights = ctx.highlights || [];
        if (highlights.length === 0) return;

        for (const hl of highlights) {
            const hlKey = this.buildHighlightKey(remoteId, hl);
            const hlHash = this.buildHighlightHash(hl);
            const md = this.renderHighlightMarkdown(hl);

            const existingId = await this.findHighlightBlockIdByKey(hlKey);
            if (existingId) {
                // 内容变化则原地更新（不删除）
                const attrs = await getBlockAttrs(existingId).catch(() => ({} as Record<string, string>));
                const savedHash = attrs[WucaiSyncService.ATTR_HL_HASH] || '';
                if (savedHash !== hlHash) {
                    await updateBlock('markdown', md, existingId);
                    await setBlockAttrs(existingId, {
                        [WucaiSyncService.ATTR_WUCAI]: '1',
                        [WucaiSyncService.ATTR_REMOTE_ID]: remoteId,
                        [WucaiSyncService.ATTR_HL_KEY]: hlKey,
                        [WucaiSyncService.ATTR_HL_HASH]: hlHash,
                    });
                }
                continue;
            }

            // 追加新 highlight
            await appendBlock('markdown', md, headingId);
            const newId = await this.findLatestChildId(headingId);
            if (!newId) continue;
            await setBlockAttrs(newId, {
                [WucaiSyncService.ATTR_WUCAI]: '1',
                [WucaiSyncService.ATTR_REMOTE_ID]: remoteId,
                [WucaiSyncService.ATTR_HL_KEY]: hlKey,
                [WucaiSyncService.ATTR_HL_HASH]: hlHash,
            });
        }
    }

    private renderHeadingMarkdown(note: NoteEntry): string {
        const ctx = this.buildPageContext(note);
        const title = ctx.title || '无标题';
        const linkPart = ctx.url ? ` [↗](${ctx.url})` : '';
        return `## ${title}${linkPart}`;
    }

    private renderMetaMarkdown(note: NoteEntry): string {
        const context = this.buildPageContext(note);
        const lines: string[] = [];

        // 元信息
        const metaItems: string[] = [];
        if (context.domain) metaItems.push(`📍 ${context.domain}`);
        if (context.createat) metaItems.push(`📅 ${context.createat}`);
        if (context.isstar) metaItems.push('⭐ 星标');
        if (context.tags) metaItems.push(context.tags);
        if (metaItems.length > 0) lines.push(`> ${metaItems.join(' | ')}`);

        // 页面笔记
        if (context.pagenote) {
            lines.push('');
            lines.push(`📝 **笔记**: ${context.pagenote}`);
        }

        if (context.wucaiurl) {
            lines.push('');
            lines.push(`[🔗 在五彩中查看](${context.wucaiurl})`);
        }

        // 分隔：高亮列表从此处开始（真正的 diff 追加会把单条 highlight block 挂在 heading 下）
        lines.push('');
        lines.push('### 高亮');

        return lines.join('\n');
    }

    private renderHighlightMarkdown(hl: HighlightInfo): string {
        const lines: string[] = [];

        if (hl.type === 'image' && hl.imageurl) {
            lines.push(`![划线图片](${hl.imageurl})`);
        } else if (hl.note) {
            lines.push(`> ${hl.note}`);
        }

        if (hl.annotation) lines.push(`> 💭 ${hl.annotation}`);
        if (hl.color) lines.push(`> 🎨 ${hl.color}`);
        if (hl.refurl) {
            lines.push('');
            lines.push(`[🔗 定位到原文高亮](${hl.refurl})`);
        }
        return lines.join('\n');
    }

    /**
     * 构建页面上下文
     */
    private buildPageContext(note: NoteEntry): WuCaiPageContext {
        const domain = getDomainByUrl(note.url);
        const domain2 = getDomain2ByDomain(domain);
        const tags = formatTags(note.tags || [], true);
        const alltags = mergeTagsAndTrim(note.tags || [], note.notetags || '');
        const highlights = formatHighlights(note.url, note.highlights || []);
        const isDailyNote = note.noteType === 3;

        return {
            title: normalTitle(note.title),
            url: note.url,
            wucaiurl: note.wucaiurl,
            readurl: note.readurl,
            tags,
            alltags,
            pagenote: note.pageNote || '',
            notetype: isDailyNote ? 'dailynote' : 'page',
            isstar: (note.pageScore || 0) > 0,
            ispagemirror: false,
            isdailynote: isDailyNote,
            createat: formatTime(note.createAt),
            updateat: formatTime(note.updateAt),
            noteid: note.noteIdX,
            createat_ts: note.createAt,
            updateat_ts: note.updateAt,
            citekey: note.citekey || '',
            author: note.author || '',
            publishat: formatTime(note.publishat || 0),
            publishat_ts: note.publishat || 0,
            domain,
            domain2,
            highlightcount: highlights.length,
            mdcontent: '',
            highlights,
        };
    }

    // 旧的“整段正文渲染”已被拆分为 meta + highlight 独立块（支持 diff），不再需要。

    /**
     * 格式化日期字符串 YYYY-MM-DD
     */
    private formatDateStr(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * 延迟函数
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 获取Token生成链接
     */
    static getTokenLink(clientId: string): string {
        return `${WUCAI_BASE_URL}/page/gentoken/${WUCAI_SERVICE_ID}/${clientId}`;
    }

    /**
     * 生成新的客户端ID
     */
    static generateClientId(): string {
        return genClientID();
    }
}

// ============================================================================
// 导出便捷函数
// ============================================================================

/**
 * 创建五彩同步服务实例
 */
export function createWucaiSyncService(
    token: string,
    clientId: string,
    notebookId: string,
    lastCursor2: string = ''
): WucaiSyncService {
    const settings: WuCaiPluginSettings = {
        token,
        clientId: clientId || genClientID(),
        notename: '',
        notebook: notebookId,
        lastCursor2,
        exportConfig: {
            sytitlet: '',
            sytpl: '',
            sywrites: 0,
            syquery: '',
        },
        lastSyncFailed: false,
    };

    return new WucaiSyncService(settings, notebookId);
}
