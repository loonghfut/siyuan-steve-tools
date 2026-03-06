import { appendBlock, deleteBlock, getBlockAttrs, getChildBlocks, setBlockAttrs, sql, updateBlock, upload } from "@/api/api";
import { createDailynote } from "@frostime/siyuan-plugin-kits";

export type SyncState = 'idle' | 'syncing' | 'success' | 'error';

export interface MemosPluginSettings {
    baseUrl: string;
    token: string;
    notebookId: string;
    includeArchived?: boolean;
    syncAttachments?: boolean;
    assetsDir?: string;
    pageSize?: number;
    customTemplate?: string;
    anchorTemplate?: string;
    incrementalSync?: boolean;
    lastSyncCursor?: string;
}

export interface MemosSyncResult {
    success: boolean;
    message: string;
    syncedCount: number;
    skippedCount: number;
    syncStartedAt?: string;
    syncFinishedAt?: string;
    nextSyncCursor?: string;
    totalFetchedCount?: number;
    processedCount?: number;
    incremental?: boolean;
}

export interface MemosListResponse {
    memos: MemosMemo[];
    nextPageToken?: string;
}

export interface MemosAttachmentListResponse {
    attachments: MemosAttachment[];
    nextPageToken?: string;
    totalSize?: number;
}

export interface MemosMemo {
    name: string;
    state?: 'STATE_UNSPECIFIED' | 'NORMAL' | 'ARCHIVED';
    creator?: string;
    createTime?: string;
    updateTime?: string;
    displayTime?: string;
    content?: string;
    visibility?: string;
    tags?: string[];
    pinned?: boolean;
    attachments?: MemosAttachment[];
    snippet?: string;
}

export interface MemosAttachment {
    name: string;
    createTime?: string;
    filename?: string;
    content?: string;
    externalLink?: string;
    type?: string;
    size?: string;
    memo?: string;
}

interface MemosResolvedAttachment {
    key: string;
    filename: string;
    markdown: string;
    hash: string;
    assetPath?: string;
}

export class MemosClient {
    private readonly baseUrl: string;
    private readonly token: string;

    constructor(baseUrl: string, token: string) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.token = token.trim();
    }

    async listAllMemos(options?: {
        pageSize?: number;
        includeArchived?: boolean;
        orderBy?: string;
        filter?: string;
        showDeleted?: boolean;
    }): Promise<MemosMemo[]> {
        const pageSize = this.normalizePageSize(options?.pageSize);
        const normalMemos = await this.listPagedMemos({
            pageSize,
            state: 'NORMAL',
            orderBy: options?.orderBy,
            filter: options?.filter,
            showDeleted: options?.showDeleted,
        });

        if (!options?.includeArchived) {
            return normalMemos;
        }

        const archivedMemos = await this.listPagedMemos({
            pageSize,
            state: 'ARCHIVED',
            orderBy: options?.orderBy,
            filter: options?.filter,
            showDeleted: options?.showDeleted,
        });

        return [...normalMemos, ...archivedMemos].sort((left, right) => {
            const leftTime = this.pickMemoTime(left);
            const rightTime = this.pickMemoTime(right);
            return rightTime.localeCompare(leftTime);
        });
    }

    async listAllAttachments(options?: {
        pageSize?: number;
        orderBy?: string;
        filter?: string;
    }): Promise<MemosAttachment[]> {
        const pageSize = this.normalizePageSize(options?.pageSize);
        let pageToken = '';
        const attachments: MemosAttachment[] = [];

        do {
            const response = await this.requestJson<MemosAttachmentListResponse>('/api/v1/attachments', {
                query: {
                    pageSize: String(pageSize),
                    pageToken,
                    orderBy: options?.orderBy || 'create_time desc',
                    filter: options?.filter || '',
                },
            });

            attachments.push(...(response.attachments || []));
            pageToken = response.nextPageToken || '';
        } while (pageToken);

        return attachments;
    }

    async getAttachment(attachment: string): Promise<MemosAttachment> {
        const normalized = encodeURIComponent(this.normalizeAttachmentId(attachment));
        return this.requestJson<MemosAttachment>(`/api/v1/attachments/${normalized}`);
    }

    async resolveAttachmentBlob(attachment: MemosAttachment): Promise<Blob | null> {
        const filename = attachment.filename || this.normalizeAttachmentId(attachment.name) || 'attachment';
        const mimeType = attachment.type || this.inferMimeType(filename);

        if (attachment.content && attachment.content.trim()) {
            return this.contentToBlob(attachment.content, mimeType);
        }

        if (attachment.externalLink && attachment.externalLink.trim()) {
            const url = this.resolveUrl(attachment.externalLink);
            return this.fetchBlob(url);
        }

        const detail = await this.getAttachment(attachment.name);
        if (detail.content && detail.content.trim()) {
            return this.contentToBlob(detail.content, detail.type || mimeType);
        }

        if (detail.externalLink && detail.externalLink.trim()) {
            return this.fetchBlob(this.resolveUrl(detail.externalLink));
        }

        return null;
    }

    private async listPagedMemos(options: {
        pageSize: number;
        state: 'NORMAL' | 'ARCHIVED';
        orderBy?: string;
        filter?: string;
        showDeleted?: boolean;
    }): Promise<MemosMemo[]> {
        let pageToken = '';
        const memos: MemosMemo[] = [];

        do {
            const response = await this.requestJson<MemosListResponse>('/api/v1/memos', {
                query: {
                    pageSize: String(options.pageSize),
                    pageToken,
                    state: options.state,
                    orderBy: options.orderBy || 'display_time desc',
                    filter: options.filter || '',
                    showDeleted: options.showDeleted ? 'true' : '',
                },
            });

            memos.push(...(response.memos || []));
            pageToken = response.nextPageToken || '';
        } while (pageToken);

        return memos;
    }

    private async requestJson<T>(path: string, options?: { query?: Record<string, string> }): Promise<T> {
        const url = new URL(`${this.baseUrl}${path}`);
        Object.entries(options?.query || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                url.searchParams.set(key, value);
            }
        });

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${this.token}`,
            },
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`Memos API 请求失败 (${response.status}): ${text || url.pathname}`);
        }

        return response.json() as Promise<T>;
    }

    private async fetchBlob(url: string): Promise<Blob> {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.token}`,
            },
        });

        if (!response.ok) {
            throw new Error(`附件下载失败 (${response.status}): ${url}`);
        }

        return response.blob();
    }

    private contentToBlob(content: string, mimeType: string): Blob {
        const normalized = content.trim();
        if (normalized.startsWith('data:')) {
            const commaIndex = normalized.indexOf(',');
            const meta = normalized.slice(5, commaIndex);
            const data = normalized.slice(commaIndex + 1);
            const extractedMime = meta.split(';')[0] || mimeType;
            const isBase64 = meta.includes(';base64');
            if (isBase64) {
                return this.decodeBase64ToBlob(data, extractedMime);
            }
            return new Blob([decodeURIComponent(data)], { type: extractedMime });
        }

        if (this.looksLikeBase64(normalized)) {
            return this.decodeBase64ToBlob(normalized, mimeType);
        }

        return new Blob([normalized], { type: mimeType || 'text/plain;charset=utf-8' });
    }

    private decodeBase64ToBlob(base64: string, mimeType: string): Blob {
        const binary = atob(base64.replace(/\s+/g, ''));
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) {
            bytes[index] = binary.charCodeAt(index);
        }
        return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
    }

    private looksLikeBase64(value: string): boolean {
        return value.length > 16 && /^[A-Za-z0-9+/=\r\n]+$/.test(value) && value.length % 4 === 0;
    }

    private resolveUrl(url: string): string {
        return new URL(url, `${this.baseUrl}/`).toString();
    }

    private normalizeAttachmentId(value: string): string {
        const trimmed = String(value || '').trim();
        return trimmed.includes('/') ? trimmed.split('/').pop() || trimmed : trimmed;
    }

    private normalizePageSize(pageSize?: number): number {
        const normalized = Number(pageSize || 200);
        if (!Number.isFinite(normalized) || normalized <= 0) return 200;
        return Math.min(1000, Math.max(1, Math.floor(normalized)));
    }

    private pickMemoTime(memo: MemosMemo): string {
        return memo.displayTime || memo.updateTime || memo.createTime || '';
    }

    private inferMimeType(filename: string): string {
        const ext = filename.split('.').pop()?.toLowerCase() || '';
        const mimeMap: Record<string, string> = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
            svg: 'image/svg+xml',
            pdf: 'application/pdf',
            txt: 'text/plain;charset=utf-8',
            md: 'text/markdown;charset=utf-8',
            mp4: 'video/mp4',
            mp3: 'audio/mpeg',
        };
        return mimeMap[ext] || 'application/octet-stream';
    }
}

export class MemosSyncService {
    private readonly settings: MemosPluginSettings;
    private readonly client: MemosClient;
    private syncState: SyncState = 'idle';
    private syncedCount = 0;
    private skippedCount = 0;
    private onStateChange?: (state: SyncState, message: string) => void;

    private static readonly ATTR_MEMOS = 'custom-memos';
    private static readonly ATTR_REMOTE_ID = 'custom-memos-id';
    private static readonly ATTR_REMOTE_UPDATE_AT = 'custom-memos-update-at';
    private static readonly ATTR_REMOTE_CREATE_AT = 'custom-memos-create-at';
    private static readonly ATTR_REMOTE_STATE = 'custom-memos-state';
    private static readonly ATTR_REMOTE_HASH = 'custom-memos-hash';
    private static readonly ATTR_META = 'custom-memos-meta';
    private static readonly ATTR_CONTENT = 'custom-memos-content';
    private static readonly ATTR_ATTACHMENT = 'custom-memos-attachment';
    private static readonly ATTR_ATTACHMENT_HASH = 'custom-memos-attachment-hash';
    private static readonly ATTR_ATTACHMENT_PATH = 'custom-memos-attachment-path';

    constructor(settings: MemosPluginSettings) {
        this.settings = {
            includeArchived: false,
            syncAttachments: true,
            assetsDir: '/assets/',
            pageSize: 200,
            customTemplate: '',
            anchorTemplate: '- {{title}}',
            incrementalSync: true,
            lastSyncCursor: '',
            ...settings,
        };
        this.client = new MemosClient(this.settings.baseUrl, this.settings.token);
    }

    setStateChangeCallback(callback: (state: SyncState, message: string) => void) {
        this.onStateChange = callback;
    }

    getState(): SyncState {
        return this.syncState;
    }

    async startSync(): Promise<MemosSyncResult> {
        const syncStartedAt = new Date().toISOString();
        if (!this.settings.baseUrl.trim()) {
            return { success: false, message: '请先配置 Memos 地址', syncedCount: 0, skippedCount: 0, syncStartedAt };
        }
        if (!this.settings.token.trim()) {
            return { success: false, message: '请先配置 Memos Token', syncedCount: 0, skippedCount: 0, syncStartedAt };
        }
        if (!this.settings.notebookId.trim()) {
            return { success: false, message: '请先选择同步目标笔记本', syncedCount: 0, skippedCount: 0, syncStartedAt };
        }

        this.syncedCount = 0;
        this.skippedCount = 0;
        this.updateState('syncing', '正在从 Memos 拉取数据...');

        try {
            const allMemos = await this.client.listAllMemos({
                pageSize: this.settings.pageSize,
                includeArchived: this.settings.includeArchived,
            });
            const memos = this.filterMemosForSync(allMemos);
            const incremental = this.isIncrementalActive();

            if (memos.length === 0) {
                const message = incremental
                    ? `增量同步完成：自 ${this.formatCursorText(this.settings.lastSyncCursor)} 以来没有新的 Memo 变更`
                    : '未获取到任何 Memos 数据';
                const syncFinishedAt = new Date().toISOString();
                this.updateState('success', message);
                return {
                    success: true,
                    message,
                    syncedCount: 0,
                    skippedCount: 0,
                    syncStartedAt,
                    syncFinishedAt,
                    nextSyncCursor: syncStartedAt,
                    totalFetchedCount: allMemos.length,
                    processedCount: 0,
                    incremental,
                };
            }

            const groups = this.groupMemosByDate(memos);
            const dates = Object.keys(groups).sort();

            for (const dateStr of dates) {
                this.updateState('syncing', `正在同步 ${dateStr} 的 ${groups[dateStr].length} 条 Memo...`);
                const dailyNoteId = await createDailynote(this.settings.notebookId, new Date(`${dateStr}T00:00:00`));
                if (!dailyNoteId) {
                    throw new Error(`无法为 ${dateStr} 创建/获取日记`);
                }

                for (const memo of groups[dateStr]) {
                    await this.upsertMemo(dailyNoteId, memo);
                }
            }

            const syncFinishedAt = new Date().toISOString();
            const modeLabel = incremental ? '增量' : '全量';
            const message = `Memos ${modeLabel}同步完成：扫描 ${allMemos.length} 条，处理 ${memos.length} 条，更新 ${this.syncedCount} 条，跳过 ${this.skippedCount} 条`;
            this.updateState('success', message);
            return {
                success: true,
                message,
                syncedCount: this.syncedCount,
                skippedCount: this.skippedCount,
                syncStartedAt,
                syncFinishedAt,
                nextSyncCursor: syncStartedAt,
                totalFetchedCount: allMemos.length,
                processedCount: memos.length,
                incremental,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Memos 同步失败';
            const syncFinishedAt = new Date().toISOString();
            this.updateState('error', message);
            return {
                success: false,
                message,
                syncedCount: this.syncedCount,
                skippedCount: this.skippedCount,
                syncStartedAt,
                syncFinishedAt,
                processedCount: this.syncedCount + this.skippedCount,
                incremental: this.isIncrementalActive(),
            };
        }
    }

    private updateState(state: SyncState, message: string) {
        this.syncState = state;
        this.onStateChange?.(state, message);
    }

    private hasCustomTemplate(): boolean {
        return !!String(this.settings.customTemplate || '').trim();
    }

    private hasAnchorTemplate(): boolean {
        return !!String(this.settings.anchorTemplate || '').trim();
    }

    private isIncrementalActive(): boolean {
        return !!this.settings.incrementalSync && !!this.parseCursorTime(this.settings.lastSyncCursor);
    }

    private filterMemosForSync(memos: MemosMemo[]): MemosMemo[] {
        const cursorTime = this.parseCursorTime(this.settings.lastSyncCursor);
        if (!this.settings.incrementalSync || !cursorTime) {
            return memos;
        }

        return memos.filter((memo) => this.getMemoComparableTime(memo) >= cursorTime);
    }

    private groupMemosByDate(memos: MemosMemo[]): Record<string, MemosMemo[]> {
        const groups: Record<string, MemosMemo[]> = {};
        for (const memo of memos) {
            const dateStr = this.formatDateKey(this.getMemoDate(memo));
            if (!groups[dateStr]) {
                groups[dateStr] = [];
            }
            groups[dateStr].push(memo);
        }
        return groups;
    }

    private async upsertMemo(dailyNoteId: string, memo: MemosMemo): Promise<void> {
        const remoteId = memo.name.trim();
        const memoHash = this.hashString(JSON.stringify({
            name: memo.name,
            content: memo.content || '',
            updateTime: memo.updateTime || '',
            createTime: memo.createTime || '',
            displayTime: memo.displayTime || '',
            tags: memo.tags || [],
            pinned: !!memo.pinned,
            visibility: memo.visibility || '',
            state: memo.state || '',
            attachments: (memo.attachments || []).map(item => ({
                name: item.name,
                filename: item.filename,
                size: item.size,
                type: item.type,
                externalLink: item.externalLink,
                createTime: item.createTime,
            })),
        }));

        const existingHeadingId = await this.findBlockIdByAttr(MemosSyncService.ATTR_REMOTE_ID, remoteId);
        if (existingHeadingId) {
            const attrs = await getBlockAttrs(existingHeadingId).catch(() => ({} as Record<string, string>));
            if ((attrs[MemosSyncService.ATTR_REMOTE_HASH] || '') === memoHash) {
                this.skippedCount += 1;
                return;
            }

            await updateBlock('markdown', this.renderMemoAnchorMarkdown(memo), existingHeadingId);
            if (this.hasCustomTemplate()) {
                await this.removeBlockByAttr(MemosSyncService.ATTR_META, remoteId);
            } else {
                await this.upsertMetaBlock(existingHeadingId, memo, remoteId);
            }
            await this.upsertContentBlock(existingHeadingId, memo, remoteId);
            await this.syncAttachmentBlocks(existingHeadingId, memo, remoteId);
            await setBlockAttrs(existingHeadingId, this.buildMemoAttrs(memo, remoteId, memoHash));
            this.syncedCount += 1;
            return;
        }

        const headingId = await this.appendMemoAnchorBlock(dailyNoteId, memo);
        if (!headingId) {
            throw new Error(`无法定位新建 Memo 标题块: ${remoteId}`);
        }

        await setBlockAttrs(headingId, this.buildMemoAttrs(memo, remoteId, memoHash));
        if (!this.hasCustomTemplate()) {
            await this.upsertMetaBlock(headingId, memo, remoteId);
        }
        await this.upsertContentBlock(headingId, memo, remoteId);
        await this.syncAttachmentBlocks(headingId, memo, remoteId);
        this.syncedCount += 1;
    }

    private buildMemoAttrs(memo: MemosMemo, remoteId: string, memoHash: string): Record<string, string> {
        return {
            [MemosSyncService.ATTR_MEMOS]: '1',
            [MemosSyncService.ATTR_REMOTE_ID]: remoteId,
            [MemosSyncService.ATTR_REMOTE_UPDATE_AT]: memo.updateTime || memo.displayTime || memo.createTime || '',
            [MemosSyncService.ATTR_REMOTE_CREATE_AT]: memo.createTime || '',
            [MemosSyncService.ATTR_REMOTE_STATE]: memo.state || 'NORMAL',
            [MemosSyncService.ATTR_REMOTE_HASH]: memoHash,
        };
    }

    private async upsertMetaBlock(headingId: string, memo: MemosMemo, remoteId: string): Promise<void> {
        const blockId = await this.findBlockIdByAttr(MemosSyncService.ATTR_META, remoteId);
        const markdown = this.renderMetaMarkdown(memo);
        if (blockId) {
            await updateBlock('markdown', markdown, blockId);
            await setBlockAttrs(blockId, {
                [MemosSyncService.ATTR_MEMOS]: '1',
                [MemosSyncService.ATTR_META]: remoteId,
                [MemosSyncService.ATTR_REMOTE_ID]: remoteId,
            });
            return;
        }

        const newId = await this.appendMarkdownBlock(headingId, markdown);
        if (!newId) return;
        await setBlockAttrs(newId, {
            [MemosSyncService.ATTR_MEMOS]: '1',
            [MemosSyncService.ATTR_META]: remoteId,
            [MemosSyncService.ATTR_REMOTE_ID]: remoteId,
        });
    }

    private async upsertContentBlock(headingId: string, memo: MemosMemo, remoteId: string): Promise<void> {
        const blockId = await this.findBlockIdByAttr(MemosSyncService.ATTR_CONTENT, remoteId);
        const markdown = this.renderContentMarkdown(memo);

        if (!markdown.trim()) {
            if (blockId) {
                await deleteBlock(blockId).catch(() => null);
            }
            return;
        }

        if (blockId) {
            await updateBlock('markdown', markdown, blockId);
            await setBlockAttrs(blockId, {
                [MemosSyncService.ATTR_MEMOS]: '1',
                [MemosSyncService.ATTR_CONTENT]: remoteId,
                [MemosSyncService.ATTR_REMOTE_ID]: remoteId,
            });
            return;
        }

        const newId = await this.appendMarkdownBlock(headingId, markdown);
        if (!newId) return;
        await setBlockAttrs(newId, {
            [MemosSyncService.ATTR_MEMOS]: '1',
            [MemosSyncService.ATTR_CONTENT]: remoteId,
            [MemosSyncService.ATTR_REMOTE_ID]: remoteId,
        });
    }

    private async syncAttachmentBlocks(headingId: string, memo: MemosMemo, remoteId: string): Promise<void> {
        const attachments = memo.attachments || [];
        const expectedKeys = new Set<string>();

        if (!this.settings.syncAttachments) {
            await this.cleanupRemovedAttachmentBlocks(remoteId, expectedKeys);
            return;
        }

        for (const attachment of attachments) {
            const resolved = await this.resolveAttachmentMarkdown(remoteId, attachment);
            if (!resolved) continue;

            expectedKeys.add(resolved.key);
            const blockId = await this.findBlockIdByAttr(MemosSyncService.ATTR_ATTACHMENT, resolved.key);
            if (blockId) {
                const attrs = await getBlockAttrs(blockId).catch(() => ({} as Record<string, string>));
                if ((attrs[MemosSyncService.ATTR_ATTACHMENT_HASH] || '') !== resolved.hash) {
                    await updateBlock('markdown', resolved.markdown, blockId);
                }
                await setBlockAttrs(blockId, {
                    [MemosSyncService.ATTR_MEMOS]: '1',
                    [MemosSyncService.ATTR_REMOTE_ID]: remoteId,
                    [MemosSyncService.ATTR_ATTACHMENT]: resolved.key,
                    [MemosSyncService.ATTR_ATTACHMENT_HASH]: resolved.hash,
                    [MemosSyncService.ATTR_ATTACHMENT_PATH]: resolved.assetPath || '',
                });
                continue;
            }

            const newId = await this.appendMarkdownBlock(headingId, resolved.markdown);
            if (!newId) continue;
            await setBlockAttrs(newId, {
                [MemosSyncService.ATTR_MEMOS]: '1',
                [MemosSyncService.ATTR_REMOTE_ID]: remoteId,
                [MemosSyncService.ATTR_ATTACHMENT]: resolved.key,
                [MemosSyncService.ATTR_ATTACHMENT_HASH]: resolved.hash,
                [MemosSyncService.ATTR_ATTACHMENT_PATH]: resolved.assetPath || '',
            });
        }

        await this.cleanupRemovedAttachmentBlocks(remoteId, expectedKeys);
    }

    private async cleanupRemovedAttachmentBlocks(remoteId: string, expectedKeys: Set<string>): Promise<void> {
        const likeValue = `${this.escapeSqlString(remoteId)}:%`;
        const rows = await sql(
            `SELECT block_id, value FROM attributes WHERE name = '${MemosSyncService.ATTR_ATTACHMENT}' AND value LIKE '${likeValue}'`
        ).catch(() => []);

        if (!Array.isArray(rows)) return;

        for (const row of rows) {
            const blockId = String(row?.block_id || '');
            const key = String(row?.value || '');
            if (!blockId || expectedKeys.has(key)) continue;
            await deleteBlock(blockId).catch(() => null);
        }
    }

    private async resolveAttachmentMarkdown(remoteId: string, attachment: MemosAttachment): Promise<MemosResolvedAttachment | null> {
        const filename = attachment.filename || this.normalizeName(attachment.name, 'attachment');
        const rawKey = `${remoteId}:${attachment.name}`;
        const contentHash = this.hashString(JSON.stringify({
            name: attachment.name,
            filename,
            size: attachment.size || '',
            type: attachment.type || '',
            externalLink: attachment.externalLink || '',
            content: attachment.content ? String(attachment.content).slice(0, 128) : '',
            createTime: attachment.createTime || '',
        }));

        let linkTarget = attachment.externalLink?.trim() || '';
        let assetPath = '';

        if (this.settings.syncAttachments) {
            const blob = await this.client.resolveAttachmentBlob(attachment).catch(() => null);
            if (blob) {
                const file = new File([blob], filename, { type: blob.type || attachment.type || 'application/octet-stream' });
                const uploadResult = await upload(this.normalizeAssetsDir(this.settings.assetsDir || '/assets/'), [file]);
                assetPath = uploadResult?.succMap?.[filename] || '';
                if (assetPath) {
                    linkTarget = assetPath;
                }
            }
        }

        if (!linkTarget) {
            return null;
        }

        const isImage = (attachment.type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(filename);
        const markdown = isImage
            ? `![${filename}](${linkTarget})`
            : `- [${filename}](${linkTarget})`;

        return {
            key: rawKey,
            filename,
            markdown,
            hash: this.hashString(`${contentHash}|${linkTarget}`),
            assetPath,
        };
    }

    private async appendMemoAnchorBlock(parentId: string, memo: MemosMemo): Promise<string | null> {
        const response = await appendBlock('markdown', this.renderMemoAnchorMarkdown(memo), parentId);
        const listBlockId = this.getOperationBlockId(response);
        if (!listBlockId) {
            return null;
        }

        const childBlocks = await getChildBlocks(listBlockId).catch(() => []);
        if (Array.isArray(childBlocks) && childBlocks[0]?.id) {
            return String(childBlocks[0].id);
        }

        return listBlockId;
    }

    private async appendMarkdownBlock(parentId: string, markdown: string): Promise<string | null> {
        const response = await appendBlock('markdown', markdown, parentId);
        return this.getOperationBlockId(response);
    }

    private getOperationBlockId(response: any): string | null {
        const blockId = response?.[0]?.doOperations?.[0]?.id;
        return blockId ? String(blockId) : null;
    }

    private renderMemoAnchorMarkdown(memo: MemosMemo): string {
        const template = String(this.settings.anchorTemplate || '').trim();
        if (template) {
            const rendered = this.renderTemplate(template, memo).trim();
            if (rendered) {
                return rendered;
            }
        }
        return `- ${this.extractMemoTitle(memo)}`;
    }

    private renderMetaMarkdown(memo: MemosMemo): string {
        const items: string[] = [];
        if (memo.createTime) items.push(`创建：${this.formatDateTime(memo.createTime)}`);
        if (memo.updateTime) items.push(`更新：${this.formatDateTime(memo.updateTime)}`);
        if (memo.state) items.push(`状态：${memo.state}`);
        if (memo.visibility) items.push(`可见性：${memo.visibility}`);
        if (memo.pinned) items.push('已置顶');
        if (memo.tags?.length) items.push(`标签：${memo.tags.join(' ')}`);
        if (memo.attachments?.length) items.push(`附件：${memo.attachments.length}`);
        items.push(`远端ID：${memo.name}`);

        return `> ${items.join(' | ')}`;
    }

    private renderContentMarkdown(memo: MemosMemo): string {
        if (this.hasCustomTemplate()) {
            return this.renderCustomTemplate(memo);
        }
        return '';
    }

    private renderCustomTemplate(memo: MemosMemo): string {
        const template = String(this.settings.customTemplate || '').trim();
        if (!template) {
            return '';
        }

        return this.renderTemplate(template, memo).trim();
    }

    private renderTemplate(template: string, memo: MemosMemo): string {
        const values = this.buildTemplateValues(memo);
        return template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key: string) => this.resolveTemplateToken(String(key || '').trim(), memo, values));
    }

    private buildTemplateValues(memo: MemosMemo): Record<string, string> {
        const createTime = memo.createTime || '';
        const updateTime = memo.updateTime || '';
        const displayTime = memo.displayTime || '';
        const memoDate = this.getMemoDate(memo);
        const attachments = memo.attachments || [];
        const attachmentNames = attachments
            .map((item) => item.filename || this.normalizeName(item.name, 'attachment'))
            .filter(Boolean);
        const tags = memo.tags || [];
        const values: Record<string, string> = {
            title: this.extractMemoTitle(memo),
            content: (memo.content || '').trim(),
            memoId: memo.name || '',
            snippet: memo.snippet || '',
            visibility: memo.visibility || '',
            state: memo.state || 'NORMAL',
            pinned: memo.pinned ? 'true' : 'false',
            pinnedText: memo.pinned ? '已置顶' : '未置顶',
            tags: tags.join(' '),
            tagList: tags.map((tag) => `#${tag}`).join(' '),
            attachmentCount: String(attachments.length),
            attachments: attachmentNames.map((name) => `- ${name}`).join('\n'),
            attachmentNames: attachmentNames.join(', '),
            createTime,
            updateTime,
            displayTime,
            dateYYYYMM: this.formatDateByPattern(memoDate, 'YYYYMM'),
            dateYYYYMMDD: this.formatDateByPattern(memoDate, 'YYYYMMDD'),
            dateYYYYMMDDHHmmss: this.formatDateByPattern(memoDate, 'YYYYMMDDHHmmss'),
        };

        this.fillTimeValues(values, 'create', createTime);
        this.fillTimeValues(values, 'update', updateTime);
        this.fillTimeValues(values, 'display', displayTime);

        return values;
    }

    private resolveTemplateToken(token: string, memo: MemosMemo, values: Record<string, string>): string {
        if (!token) return '';

        if (token in values) {
            return values[token] ?? '';
        }

        const normalized = token.replace(/\s+/g, '');
        if (normalized in values) {
            return values[normalized] ?? '';
        }

        return this.resolveDynamicTimeToken(token, memo) ?? '';
    }

    private resolveDynamicTimeToken(token: string, memo: MemosMemo): string | null {
        const trimmed = token.trim();
        const dynamic = this.parseDynamicTimeToken(trimmed);
        if (!dynamic) {
            return null;
        }

        if (dynamic.prefix === 'date') {
            return this.formatDateByPattern(this.getMemoDate(memo), dynamic.pattern);
        }

        const rawValue = this.getRawTimeValue(memo, dynamic.prefix);
        if (!rawValue) {
            return '';
        }

        return this.formatTimeByPattern(rawValue, dynamic.pattern);
    }

    private parseDynamicTimeToken(token: string): { prefix: 'create' | 'update' | 'display' | 'date'; pattern: string } | null {
        const prefixes = ['create', 'update', 'display', 'date'] as const;
        for (const prefix of prefixes) {
            if (token.startsWith(`${prefix}Time:`)) {
                const pattern = token.slice(`${prefix}Time:`.length).trim();
                return this.isSupportedDatePattern(pattern) ? { prefix, pattern } : null;
            }

            if (token.startsWith(`${prefix}:`)) {
                const pattern = token.slice(prefix.length + 1).trim();
                return this.isSupportedDatePattern(pattern) ? { prefix, pattern } : null;
            }

            if (token.startsWith(prefix)) {
                const pattern = token.slice(prefix.length).trim();
                if (this.isSupportedDatePattern(pattern)) {
                    return { prefix, pattern };
                }
            }
        }

        return null;
    }

    private isSupportedDatePattern(pattern: string): boolean {
        return !!pattern && /(YYYY|YY|MM|DD|HH|mm|ss)/.test(pattern);
    }

    private getRawTimeValue(memo: MemosMemo, prefix: 'create' | 'update' | 'display'): string {
        switch (prefix) {
            case 'create':
                return memo.createTime || '';
            case 'update':
                return memo.updateTime || '';
            case 'display':
                return memo.displayTime || '';
            default:
                return '';
        }
    }

    private fillTimeValues(values: Record<string, string>, prefix: 'create' | 'update' | 'display', rawValue: string) {
        values[`${prefix}Time`] = rawValue;
        values[`${prefix}TimeLocal`] = rawValue ? this.formatDateTime(rawValue) : '';
        values[`${prefix}TimeCompact`] = rawValue ? this.formatTimeCompact(rawValue) : '';
        values[`${prefix}HHmm`] = rawValue ? this.formatTimeByPattern(rawValue, 'HHmm') : '';
        values[`${prefix}YYYYMM`] = rawValue ? this.formatTimeByPattern(rawValue, 'YYYYMM') : '';
        values[`${prefix}YYYYMMDD`] = rawValue ? this.formatTimeByPattern(rawValue, 'YYYYMMDD') : '';
        values[`${prefix}YYYYMMDDHHmmss`] = rawValue ? this.formatTimeByPattern(rawValue, 'YYYYMMDDHHmmss') : '';
    }

    private extractMemoTitle(memo: MemosMemo): string {
        const firstLine = (memo.content || '')
            .split(/\r?\n/)
            .map(line => line.trim())
            .find(Boolean);
        const title = (firstLine || memo.snippet || this.normalizeName(memo.name, 'Memo'))
            .replace(/^#+\s*/, '')
            .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
            .replace(/[\*`>~]/g, '')
            .trim();
        return title.slice(0, 80) || 'Memo';
    }

    private getMemoDate(memo: MemosMemo): Date {
        const raw = memo.displayTime || memo.updateTime || memo.createTime || new Date().toISOString();
        const date = new Date(raw);
        if (Number.isNaN(date.getTime())) {
            return new Date();
        }
        return date;
    }

    private formatDateKey(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private formatDateTime(value: string): string {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleString();
    }

    private formatTimeCompact(value: string): string {
        return this.formatTimeByPattern(value, 'YYYYMMDDHHmmss');
    }

    private formatTimeByPattern(value: string, pattern: string): string {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        return this.formatDateByPattern(date, pattern);
    }

    private formatDateByPattern(date: Date, pattern: string): string {
        const year = String(date.getFullYear());
        const shortYear = year.slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        const second = String(date.getSeconds()).padStart(2, '0');

        return pattern.replace(/YYYY|YY|MM|DD|HH|mm|ss/g, (token) => {
            switch (token) {
                case 'YYYY':
                    return year;
                case 'YY':
                    return shortYear;
                case 'MM':
                    return month;
                case 'DD':
                    return day;
                case 'HH':
                    return hour;
                case 'mm':
                    return minute;
                case 'ss':
                    return second;
                default:
                    return token;
            }
        });
    }

    private parseCursorTime(value?: string): number | null {
        if (!value) return null;
        const time = new Date(value).getTime();
        return Number.isNaN(time) ? null : time;
    }

    private getMemoComparableTime(memo: MemosMemo): number {
        const raw = memo.updateTime || memo.displayTime || memo.createTime || new Date().toISOString();
        const time = new Date(raw).getTime();
        return Number.isNaN(time) ? 0 : time;
    }

    private formatCursorText(value?: string): string {
        if (!value) return '初次同步';
        return this.formatDateTime(value);
    }

    private async removeBlockByAttr(name: string, value: string): Promise<void> {
        const blockId = await this.findBlockIdByAttr(name, value);
        if (!blockId) return;
        await deleteBlock(blockId).catch(() => null);
    }

    private async findBlockIdByAttr(name: string, value: string): Promise<string | null> {
        const safeName = this.escapeSqlString(name);
        const safeValue = this.escapeSqlString(value);
        const rows = await sql(
            `SELECT block_id FROM attributes WHERE name = '${safeName}' AND value = '${safeValue}' LIMIT 1`
        ).catch(() => []);
        if (Array.isArray(rows) && rows[0]?.block_id) return String(rows[0].block_id);
        return null;
    }

    private normalizeAssetsDir(path: string): string {
        const normalized = `/${String(path || '/assets/').replace(/^\/+/, '').replace(/\/+/g, '/').replace(/\/$/, '')}/`;
        return normalized === '//' ? '/assets/' : normalized;
    }

    private normalizeName(value: string, fallback: string): string {
        const last = String(value || '').split('/').pop() || fallback;
        return last.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-').trim() || fallback;
    }

    private escapeSqlString(value: string): string {
        return String(value || '').replace(/'/g, "''");
    }

    private hashString(input: string): string {
        let hash = 5381;
        for (let index = 0; index < input.length; index++) {
            hash = ((hash << 5) + hash) + input.charCodeAt(index);
            hash |= 0;
        }
        return (hash >>> 0).toString(36);
    }
}