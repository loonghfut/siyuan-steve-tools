import steveTools from "@/index";
import { showMessage } from "siyuan";
import { WucaiSyncService, SyncState } from "./wucai-sync-service";
import { genClientID } from "@/api/wucai-api";

/**
 * 五彩同步模块
 * 
 * 功能：将五彩的高亮、批注数据同步到思源笔记日记中
 */
export class M_Wucai {
    private plugin: steveTools;
    private settingdata: any;
    private topBarButton: HTMLElement | null = null;
    private syncService: WucaiSyncService | null = null;
    private isSyncing: boolean = false;

    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    async init(settingdata: any) {
        this.settingdata = settingdata;
        console.log("五彩同步模块初始化");

        // 确保有客户端ID
        if (!this.settingdata["wucai-client-id"]) {
            this.settingdata["wucai-client-id"] = genClientID();
        }

        // 添加图标
        this.plugin.addIcons(`
            <symbol id="iconSTwucai" viewBox="0 0 1024 1024">
                <path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z"/>
                <path d="M464 336a48 48 0 1 0 96 0 48 48 0 1 0-96 0zm0 352a48 48 0 1 0 96 0 48 48 0 1 0-96 0zm-112-176a48 48 0 1 0 96 0 48 48 0 1 0-96 0zm224 0a48 48 0 1 0 96 0 48 48 0 1 0-96 0z" fill="#ffc107"/>
            </symbol>
            <symbol id="iconSTwucaiSync" viewBox="0 0 1024 1024">
                <path d="M168 504.2c1-43.7 10-86.1 26.9-126 17.3-41 42.1-77.7 73.7-109.4S337 212.3 378 195c42.4-17.9 87.4-27 133.9-27s91.5 9.1 133.8 27c40.9 17.3 77.7 42.1 109.3 73.8 9.9 9.9 19.2 20.4 27.8 31.4l-60.2 47c-5.3 4.1-3.5 12.5 3 14.1l175.7 43c5 1.2 9.9-2.6 9.9-7.7l0.8-180.9c0-6.7-7.7-10.5-12.9-6.3l-56.4 44.1C765.8 155.1 646.2 92 512 92 282.7 92 92.3 282.7 92 512c0 .7.5 1.2 1.2 1.2h73.6c.7 0 1.2-.5 1.2-1z"/>
                <path d="M926.6 508.8h-73.6c-.7 0-1.2.5-1.2 1 0 .3.1.7.1 1-1 43.7-10 86.1-26.9 126-17.3 41-42 77.8-73.7 109.4S683 802.2 642 819.9c-42.4 17.9-87.4 27-133.9 27s-91.5-9.1-133.9-27c-40.9-17.3-77.7-42.1-109.3-73.8-9.9-9.9-19.2-20.4-27.8-31.4l60.2-47c5.3-4.1 3.5-12.5-3-14.1l-175.7-43c-5-1.2-9.9 2.6-9.9 7.7l-.7 181c0 6.7 7.7 10.5 12.9 6.3l56.4-44.1C258.2 868.9 377.8 932 512 932c229.3 0 419.7-190.7 420-420 0-.7-.5-1.2-1.2-1.2-.2 0-.2-2-.2-2z"/>
            </symbol>
        `);

        // 添加顶栏按钮
        this.topBarButton = this.plugin.addTopBar({
            icon: "iconSTwucai",
            title: "五彩同步",
            position: "right",
            callback: async () => {
                await this.handleSync();
            }
        });

        // 更新按钮状态
        this.updateButtonState();
    }

    /**
     * 处理同步请求
     */
    private async handleSync() {
        if (this.isSyncing) {
            showMessage("同步正在进行中，请稍候...", 3000);
            return;
        }

        const token = this.settingdata["wucai-token"];
        const notebookId = this.settingdata["wucai-notebook"];
        const clientId = this.settingdata["wucai-client-id"];
        const lastCursor = this.settingdata["wucai-last-cursor"] || "";

        if (!token) {
            showMessage("请先在设置中配置五彩Token", 3000, "error");
            return;
        }

        if (!notebookId) {
            showMessage("请先在设置中选择同步目标日记本", 3000, "error");
            return;
        }

        this.isSyncing = true;
        this.updateButtonState('syncing');
        showMessage("正在同步五彩数据...", 2000);

        try {
            // 创建同步服务
            this.syncService = new WucaiSyncService(
                {
                    token,
                    clientId,
                    notename: '',
                    notebook: notebookId,
                    lastCursor2: lastCursor,
                    exportConfig: {
                        sytitlet: '',
                        sytpl: '',
                        sywrites: 0,
                        syquery: '',
                    },
                    lastSyncFailed: false,
                },
                notebookId
            );

            // 设置状态变更回调
            this.syncService.setStateChangeCallback((state, message) => {
                this.updateButtonState(state);
                if (message) {
                    console.log(`[五彩同步] ${message}`);
                }
            });

            // 执行同步
            const result = await this.syncService.startSync();

            if (result.success) {
                // 更新设置
                this.settingdata["wucai-last-cursor"] = result.lastCursor || lastCursor;
                this.settingdata["wucai-last-sync-time"] = new Date().toLocaleString();
                this.settingdata["wucai-last-sync-failed"] = false;

                // 保存设置
                await this.saveSettings();

                showMessage(result.message, 5000, "info");
                this.updateButtonState('success');
            } else {
                this.settingdata["wucai-last-sync-failed"] = true;
                await this.saveSettings();

                showMessage(result.message, 5000, "error");
                this.updateButtonState('error');
            }
        } catch (error) {
            this.settingdata["wucai-last-sync-failed"] = true;
            await this.saveSettings();

            const errorMsg = error instanceof Error ? error.message : "同步失败";
            showMessage(errorMsg, 5000, "error");
            this.updateButtonState('error');
        } finally {
            this.isSyncing = false;
            // 3秒后恢复默认状态
            setTimeout(() => {
                this.updateButtonState('idle');
            }, 3000);
        }
    }

    /**
     * 保存设置
     */
    private async saveSettings() {
        try {
            await this.plugin.saveData("steveTools.json", this.settingdata);
        } catch (error) {
            console.error("保存设置失败:", error);
        }
    }

    /**
     * 更新按钮状态
     */
    private updateButtonState(state: SyncState | 'syncing' = 'idle') {
        if (!this.topBarButton) return;

        const svgUse = this.topBarButton.querySelector('svg use');
        if (!svgUse) return;

        // 移除所有状态类
        this.topBarButton.classList.remove('wucai-syncing', 'wucai-success', 'wucai-error');

        switch (state) {
            case 'syncing':
                svgUse.setAttribute('xlink:href', '#iconSTwucaiSync');
                this.topBarButton.classList.add('wucai-syncing');
                this.topBarButton.setAttribute('title', '五彩同步中...');
                break;
            case 'success':
                svgUse.setAttribute('xlink:href', '#iconSTwucai');
                this.topBarButton.classList.add('wucai-success');
                this.topBarButton.setAttribute('title', '五彩同步成功');
                break;
            case 'error':
                svgUse.setAttribute('xlink:href', '#iconSTwucai');
                this.topBarButton.classList.add('wucai-error');
                this.topBarButton.setAttribute('title', '五彩同步失败，点击重试');
                break;
            default:
                svgUse.setAttribute('xlink:href', '#iconSTwucai');
                this.topBarButton.setAttribute('title', '五彩同步');
        }
    }

    onunload() {
        console.log("五彩同步模块卸载");
        this.syncService = null;
        this.topBarButton = null;
    }
}
