import steveTools from "@/index";
import { showMessage } from "siyuan";
import { MemosSyncService, MemosSyncResult, SyncState } from "./memos-sync-service";

function formatDateTimeLabel(value?: string) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

// Memos 模块
export class M_Memos {
    private plugin: steveTools;
    private settingdata: any;
    private topBarButton: HTMLElement | null = null;
    private syncService: MemosSyncService | null = null;
    private isSyncing = false;

    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    private persistSyncResult(result: MemosSyncResult) {
        const finishedAt = result.syncFinishedAt || new Date().toISOString();
        const startedAt = result.syncStartedAt || finishedAt;

        this.settingdata["memos-last-sync-time"] = formatDateTimeLabel(finishedAt);
        this.settingdata["memos-last-sync-at"] = finishedAt;
        this.settingdata["memos-last-sync-failed"] = !result.success;

        if (result.success) {
            const cursor = result.nextSyncCursor || startedAt;
            this.settingdata["memos-last-sync-cursor"] = cursor;
            this.settingdata["memos-last-success-sync-time"] = formatDateTimeLabel(cursor);
        }

        const history = Array.isArray(this.settingdata["memos-sync-history"]) ? this.settingdata["memos-sync-history"] : [];
        history.unshift({
            startedAt,
            finishedAt,
            success: result.success,
            incremental: !!result.incremental,
            totalFetchedCount: result.totalFetchedCount || 0,
            processedCount: result.processedCount || 0,
            syncedCount: result.syncedCount || 0,
            skippedCount: result.skippedCount || 0,
            message: result.message,
        });
        this.settingdata["memos-sync-history"] = history.slice(0, 20);
    }

    async init(settingdata: any) {
        this.settingdata = settingdata;
        console.log("Memos 模块初始化");

        this.plugin.addIcons(`
            <symbol id="iconSTMemos" viewBox="0 0 1024 1024">
                <path d="M192 128h512c70.7 0 128 57.3 128 128v512c0 70.7-57.3 128-128 128H192c-70.7 0-128-57.3-128-128V256c0-70.7 57.3-128 128-128zm64 192v64h384v-64H256zm0 160v64h384v-64H256zm0 160v64h256v-64H256z" />
            </symbol>
            <symbol id="iconSTMemosSync" viewBox="0 0 1024 1024">
                <path d="M512 128c105.9 0 203 39.1 277.3 103.7l58.7-58.7v213.3H634.7l83.5-83.5C663.6 258.9 591.4 234.7 512 234.7c-138.7 0-255.8 73.8-322.5 184.6H73.7C147.6 247.4 315.2 128 512 128zm438.6 298.7c0 258.8-209.8 468.6-468.6 468.6-105.9 0-203-39.1-277.3-103.7l-58.7 58.7V637h213.3l-83.5 83.5c54.6 43.9 126.8 68.1 206.2 68.1 138.7 0 255.8-73.8 322.5-184.6h115.8z" />
            </symbol>
        `);

        this.topBarButton = this.plugin.addTopBar({
            icon: "iconSTMemos",
            title: "同步 Memos 到思源",
            position: "right",
            callback: async () => {
                await this.handleSync();
            }
        });

        this.updateButtonState('idle');
    }

    private async handleSync() {
        if (this.isSyncing) {
            showMessage("Memos 同步正在进行中，请稍候...", 3000, "info");
            return;
        }

        const baseUrl = String(this.settingdata["memos-base-url"] || '').trim();
        const token = String(this.settingdata["memos-token"] || '').trim();
        const notebookId = String(this.settingdata["memos-notebook"] || '').trim();

        if (!baseUrl) {
            showMessage("请先在设置中填写 Memos 地址", 3000, "error");
            return;
        }
        if (!token) {
            showMessage("请先在设置中填写 Memos Token", 3000, "error");
            return;
        }
        if (!notebookId) {
            showMessage("请先在设置中选择同步目标笔记本", 3000, "error");
            return;
        }

        this.isSyncing = true;
        this.updateButtonState('syncing');

        try {
            this.syncService = new MemosSyncService({
                baseUrl,
                token,
                notebookId,
                includeArchived: !!this.settingdata["memos-include-archived"],
                incrementalSync: this.settingdata["memos-incremental-sync"] !== false,
                lastSyncCursor: String(this.settingdata["memos-last-sync-cursor"] || ''),
                syncAttachments: this.settingdata["memos-sync-attachments"] !== false,
                assetsDir: String(this.settingdata["memos-assets-dir"] || '/assets/'),
                pageSize: Number(this.settingdata["memos-page-size"] || 200),
                anchorTemplate: String(this.settingdata["memos-anchor-template"] || '- {{title}}'),
                customTemplate: String(this.settingdata["memos-custom-template"] || ''),
            });

            this.syncService.setStateChangeCallback((state, message) => {
                this.updateButtonState(state);
                if (message) {
                    console.log(`[Memos] ${message}`);
                }
            });

            showMessage("开始同步 Memos 数据...", 2000, "info");
            const result = await this.syncService.startSync();
            this.persistSyncResult(result);
            await this.plugin.saveData("steveTools.json", this.settingdata);

            if (result.success) {
                showMessage(result.message, 5000, "info");
                this.updateButtonState('success');
            } else {
                showMessage(result.message, 5000, "error");
                this.updateButtonState('error');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Memos 同步失败';
            this.settingdata["memos-last-sync-failed"] = true;
            await this.plugin.saveData("steveTools.json", this.settingdata);
            showMessage(message, 5000, "error");
            this.updateButtonState('error');
        } finally {
            this.isSyncing = false;
            setTimeout(() => this.updateButtonState('idle'), 3000);
        }
    }

    private updateButtonState(state: SyncState) {
        if (!this.topBarButton) return;
        const svgUse = this.topBarButton.querySelector('svg use');
        if (!svgUse) return;

        this.topBarButton.classList.remove('memos-syncing', 'memos-success', 'memos-error');

        switch (state) {
            case 'syncing':
                svgUse.setAttribute('xlink:href', '#iconSTMemosSync');
                this.topBarButton.classList.add('memos-syncing');
                this.topBarButton.setAttribute('title', 'Memos 同步中...');
                break;
            case 'success':
                svgUse.setAttribute('xlink:href', '#iconSTMemos');
                this.topBarButton.classList.add('memos-success');
                this.topBarButton.setAttribute('title', 'Memos 同步成功');
                break;
            case 'error':
                svgUse.setAttribute('xlink:href', '#iconSTMemos');
                this.topBarButton.classList.add('memos-error');
                this.topBarButton.setAttribute('title', 'Memos 同步失败，点击重试');
                break;
            default:
                svgUse.setAttribute('xlink:href', '#iconSTMemos');
                this.topBarButton.setAttribute('title', '同步 Memos 到思源');
                break;
        }
    }

    onunload() {
        console.log("M_Memos unloaded");
        this.syncService = null;
        this.topBarButton = null;
    }
}
