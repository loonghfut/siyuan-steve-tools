import { showMessage } from "siyuan";
import { Dida365ApiClient } from "@/calendar/integrations/dida/api/dida-api-client";
import { Project, Task, TaskCompletedQuery, TaskFilterQuery, TaskMoveOperation, TaskMoveResult } from "@/calendar/integrations/dida/dida_interface";
import type steveTools from "@/index";
import { calendarSettings as settingdata } from '@/calendar/core/calendar-context';
import { getViewId, getViewValue, invalidateViewValueCache, patchViewValueRow } from "@/calendar/data/calendar-data";
import { addBlockToDatabase_pro, appendBlock, generateSiyuanID, getAttributeViewBoundBlockIDsByItemIDs, getAttributeViewItemIDsByBoundIDs, getAttributeViewKeysByAvID, getBlockAttrs, setBlockAttrs, showStatusMessage, sqlWithMeta, updateAttrViewCell_pro, updatemainkey } from "@/api/api";
import { formatDateForDida, formatDateToISO, formatLocalDate } from "@/calendar/integrations/dida/siyuan_api";
import { createDidaDock, DidaLinkInterceptor } from "@/api/dockdida_pro";
import * as ic from "@/icon"
import { beginTaggedRequests, endTaggedRequests } from "@/api/network-interceptor";
import type { DidaSyncFeature } from "@/calendar/integrations/dida/sync/sync-feature";
import { TaskSyncStore, type PendingDidaIdWrite } from "@/calendar/integrations/dida/storage/task-sync-store";
import {
    buildCreatingIntent,
    buildDidaTaskUpdatePayload,
    extractSiyuanBlockIdFromDidaTitle,
    findTaskBySiyuanBacklink,
    getDidaStatusAttr,
    hasDidaTaskChanged,
    hasSiyuanTaskChanged,
    mapDidaTaskToSiyuan,
    mergePendingDidaIdWrite,
    parseDidaReminders,
    removeDidaLinks,
    resolveDidaBinding,
    resolvePendingDidaIdWriteAction,
    resolvePendingRowAction,
    resolvePendingTargetAction,
    type PendingTargetAction,
} from "@/calendar/integrations/dida/mappers/task-mapper";
import {
    buildDidaImportTemplateData,
    getDefaultDidaImportTemplate,
    renderDidaTemplate,
} from "@/calendar/integrations/dida/mappers/task-template-mapper";
import { SiyuanTaskChangeSource } from "@/calendar/integrations/dida/sync/siyuan-task-change-source";
import { createScheduleBlockquoteMarkdown } from '@/calendar/features/schedule-blockquote';
import { createDailyNoteForDate } from '@/calendar/data/daily-note';
import { applyTopBarButton } from '@/libs/topbar';

/** 旧版本把滴答任务 ID 写在块属性上，仅用于一次性回填到数据库 didaID 列。 */
const LEGACY_DIDA_TASK_ID_ATTR = "custom-dida-id";

/** 待补写去重键的持久化文件名：跨插件重启保留，避免去重键丢失后重复创建。 */
const DIDA_PENDING_WRITES_FILE = "dida-pending-writes.json";

/**
 * 待补写去重键的最大重试次数，超过后停止自动重试并提示用户。
 * 记录本身会保留（它就是去重键），所以停在这里不会造成重复创建，
 * 只是这一行暂时不再自动补写，用户处理完问题后可以重新触发同步。
 */
const MAX_PENDING_DIDA_ID_WRITE_ATTEMPTS = 10;

/** 待补写队列落盘的超时时间：内核异常时不让 Promise 永久挂起、阻塞后续落盘。 */
const PENDING_WRITE_SAVE_TIMEOUT_MS = 10000;

/**
 * 创建前"最后一道核对"用的已完成任务时间窗（天）。
 *
 * 常规探测只看得到保留窗口（cal-dida-completed-days，默认 15 天）内的已完成任务，
 * 窗口外的旧任务会被漏掉，误判成"远端没有同源任务"从而重复建任务。
 * 这里按更宽的窗口补查一次，并按同样的间隔节流，代价可控。
 */
const WIDE_COMPLETED_TASK_RETENTION_DAYS = 730;

/**
 * 宽窗口查询的独立超时（毫秒）：返回量大，比常规请求更慢。
 * 这里失败会被判为"保留窗口外核对不到"，创建流程会一直跳过，所以给足时间。
 * 这是整轮分段查询的总时限，不是单段的时限。
 */
const WIDE_COMPLETED_TASK_QUERY_TIMEOUT_MS = 120000;

/**
 * 宽窗口分段查询的段数：整段 730 天一次性拉取时返回体可能极大，
 * 按段切开逐段查询，单段失败或超时都不会让整轮查询无限期挂着。
 */
const WIDE_COMPLETED_TASK_SEGMENT_COUNT = 4;

/** 远端任务列表刷新的节流间隔：同源任务探测按此节流，避免一轮同步里反复请求远端。 */
const REMOTE_TASK_REFRESH_THROTTLE_MS = 30000;

export class DidaTaskSyncFeature implements DidaSyncFeature {
    readonly id = "tasks";
    private apiClient: Dida365ApiClient;
    private plugin: steveTools;
    private topBarButton?: HTMLElement;
    private avId: string | null = null; // 用于存储滴答清单同步的数据库ID
    private todoListId: string | null = null; // 用于存储未完成任务列表ID
    // private doneListId: string | null = null; // 用于存储已完成任务列表ID cal-dida-finished-list
    private readonly store = new TaskSyncStore();
    private get taskCache() { return this.store.tasks; }
    private get pendingDidaIdWrites() { return this.store.pendingDidaIdWrites; }
    private isSyncing = false; // 新增同步锁
    private syncEchoSuppressUntil = 0; // 全量同步结束后的 WS/AV 回声抑制截止时间
    private readonly siyuanSyncInFlight = new Map<string, Promise<{ ok: boolean; changed: boolean }>>();
    private get creatingDidaIds() { return this.store.creatingDidaIds; }
    private get pendingSiyuanCreates() { return this.store.pendingSiyuanCreates; }
    private syncDebounceTimer: NodeJS.Timeout | null = null; // 防抖计时器
    private readonly changeSource: SiyuanTaskChangeSource;
    private get lastModifiedTime() { return this.store.lastModifiedTime; }
    private get taskSyncLocks() { return this.store.taskSyncLocks; }
    private get lastSyncDirection() { return this.store.lastSyncDirection; }
    private get pendingDidaUpdates() { return this.store.pendingDidaUpdates; }
    private get pendingSiyuanConfirmTargets() { return this.store.pendingSiyuanConfirmTargets; }
    private pendingSiyuanConfirmTimer: NodeJS.Timeout | null = null; // 确认检查定时器
    private get pendingSiyuanTargets() { return this.store.pendingSiyuanTargets; }
    private pendingSiyuanSyncTimer: NodeJS.Timeout | null = null; // 思源待同步队列刷新计时器
    private autoSyncInterval?: number;
    private initialSyncTimer?: number;
    /** 数据库列名 -> keyID 缓存，避免每次回写都请求 AV 键列表。 */
    private avColumnKeyIds: Map<string, string> | null = null;
    /** 已知仍带旧版滴答 ID 块属性的块：只有这些块才需要清理，避免每次写去重键都发一次 setBlockAttrs。 */
    private readonly legacyAttrBlocks = new Set<string>();
    /** 已经提示过"回写失败"的待补写记录，避免每轮同步重复弹提示。 */
    private readonly pendingWriteNotified = new Set<string>();
    /**
     * 远端任务缓存当前是否是"完整快照"：既含未完成任务，也含已完成任务，且最近一次取数没失败。
     *
     * 只有完整快照才能用来判断"远端确实没有同源任务"：
     * - getAllTasks() 只拉未完成任务，清空重填后缓存并不完整；
     * - 取数失败时缓存是空的，"缓存里没有"更不能当成"远端没有"。
     */
    private taskCacheComplete = false;
    /** 最近一次远端任务列表拉取失败的时间：离线时避免每个未绑定行都重试拉取。 */
    private lastRemoteTaskRefreshFailedAt = 0;
    /** 最近一次"宽时间窗查已完成任务"的时间：同一时间窗内只查一次，避免批量创建时反复拉取。 */
    private lastDeepRemoteLookupAt = 0;
    /**
     * 最近一次宽窗口深查是否真的查成了。
     * 失败时"缓存里没有同源任务"推不出"远端没有"，创建路径必须先跳过本轮。
     */
    private lastDeepRemoteLookupVerified = false;
    /**
     * 宽时间窗里带 [S] 回链的已完成任务：按回链块 ID 索引。
     * 单独存放的原因：常规任务列表刷新（getAllTasks）会清空 taskCache，
     * 宽窗口的证据不能跟着丢，否则"刚核对过"的结论会和实际内容脱钩，
     * 把查不到的远端任务误判成不存在。只留带回链的任务，内存占用也最小。
     */
    private readonly deepBacklinkTasks = new Map<string, Task>();
    /** 宽窗口深查失败是否已经提示过：连续失败不重复刷屏，恢复后重置。 */
    private deepLookupFailureNotified = false;
    /** 正在进行的宽窗口深查：并发创建时复用同一个请求，避免请求量成倍放大。 */
    private deepLookupInFlight: Promise<boolean> | null = null;
    /** 正在进行的远端任务列表刷新：并发调用复用同一个请求。 */
    private remoteRefreshInFlight: Promise<boolean> | null = null;
    /** 查询行绑定块连续失败次数：用来判断数据库接口是否整体不可用。 */
    private rowBindingLookupFailedCount = 0;
    /** 绑定块查询失败是否已经提示过：连续失败只提示一次，恢复后重置。 */
    private rowBindingFailureNotified = false;
    /** 最近一次刷新远端任务列表的时间：用于"同源任务探测"的节流。 */
    private lastRemoteTaskRefreshAt = 0;
    /** 待补写去重键的落盘串行链，避免并发写同一文件导致快照乱序。 */
    private pendingPersistChain: Promise<void> = Promise.resolve();
    /** 待补写队列落盘失败是否已经提示过：连续失败不重复刷屏，落盘恢复后重置。 */
    private pendingSaveFailureNotified = false;

    private readonly isSyncOrEchoActive = (): boolean =>
        this.isSyncing || Date.now() < this.syncEchoSuppressUntil;

    /** 按块维度串行化思源 -> 滴答写入，防止同一块并发触发重复 createTask/updateTask。 */
    private withBlockSyncFlight(
        blockId: string,
        fn: () => Promise<{ ok: boolean; changed: boolean }>,
    ): Promise<{ ok: boolean; changed: boolean }> {
        const previous = this.siyuanSyncInFlight.get(blockId) ?? Promise.resolve({ ok: false, changed: false });
        const current = previous.catch(() => ({ ok: false, changed: false })).then(fn);
        const tracked = current.finally(() => {
            if (this.siyuanSyncInFlight.get(blockId) === tracked) {
                this.siyuanSyncInFlight.delete(blockId);
            }
        });
        this.siyuanSyncInFlight.set(blockId, tracked);
        return tracked;
    }

    /**
     * 读取思源行对应的滴答任务 ID。
     * 去重的唯一依据是数据库 didaID 列，不存在任何内存影子数据。
     */
    private readDidaTaskId(task?: any): string {
        return task?.didaID?.content || "";
    }

    /**
     * 重新读取数据库行，确认 didaID 列当前的值。
     * 返回 null 表示该行不存在或读取失败（状态未知），调用方应据此跳过创建，避免重复。
     *
     * 读取前必须失效行缓存：滴答库不在 getManagedCalendarAvIds() 里，外部编辑（用户手动
     * 填写/修改 didaID 列）不会触发缓存失效，5 秒 TTL 内会读到旧值，导致"已有绑定被误判为
     * 未绑定"而重复创建滴答任务。
     */
    private async readLatestDidaIdFromDatabase(itemID: string, blockId: string): Promise<string | null> {
        try {
            invalidateViewValueCache(this.avId ?? undefined);
            const viewData = await this.getAvViewData("复核滴答任务绑定");
            const rows = (viewData || []).flatMap((view: any) => view.data || []);
            // itemID 为空时不能按 itemID 匹配，否则会命中第一条无 itemID 的行
            const row = (itemID ? rows.find((task: any) => task.事件?.itemID === itemID) : undefined)
                || rows.find((task: any) => task.事件?.id === blockId);
            // 找不到行说明该行已被删除或不可见，此时不能判定为"未绑定"而去创建任务
            if (!row) return null;
            return this.readDidaTaskId(row);
        } catch (error) {
            console.warn("[滴答同步] 复核数据库 didaID 列失败", { blockId, itemID }, error);
            return null;
        }
    }

    /**
     * 取得 didaID 列的 keyID：以数据库当前列信息为准，
     * 列信息不可用时回退到行内 keyID 与视图数据。
     */
    private async resolveDidaIdKeyID(task?: any, viewValue?: any): Promise<string | null> {
        let keyIds = await this.getAvColumnKeyIds();
        if (keyIds && !keyIds.has('didaID')) {
            // 列可能是刚添加或改名的，刷新一次缓存再判断
            this.avColumnKeyIds = null;
            keyIds = await this.getAvColumnKeyIds();
        }
        if (keyIds) return keyIds.get('didaID') || null;
        const rowKeyID = task?.didaID?.keyID;
        if (rowKeyID) return rowKeyID;
        return await this.getKeyIDfromViewValue(viewValue, 'didaID');
    }

    /**
     * 读取数据库的列名 -> keyID 映射。
     * 请求失败时返回 null，表示「暂时查不到」，与「确实没有该列」区分开。
     */
    private async getAvColumnKeyIds(): Promise<Map<string, string> | null> {
        if (this.avColumnKeyIds) return this.avColumnKeyIds;
        if (!this.avId) return null;
        try {
            const keys = await getAttributeViewKeysByAvID(this.avId);
            if (!Array.isArray(keys)) {
                // 内核异常返回时不缓存，退回视图数据查找
                console.warn("获取数据库列信息返回异常", keys);
                return null;
            }
            const map = new Map<string, string>();
            for (const key of keys as any[]) {
                if (key?.name && key?.id) map.set(key.name, key.id);
            }
            this.avColumnKeyIds = map;
            return map;
        } catch (error) {
            console.warn("获取数据库列信息失败", error);
            return null;
        }
    }

    /** 按列名解析 keyID：数据库列信息优先，视图数据兜底。 */
    private async resolveColumnKeyID(columnName: string, viewValue?: any): Promise<string | null> {
        let keyIds = await this.getAvColumnKeyIds();
        if (keyIds && !keyIds.has(columnName)) {
            // 列可能是刚添加的，刷新一次缓存再判断
            this.avColumnKeyIds = null;
            keyIds = await this.getAvColumnKeyIds();
        }
        if (keyIds) {
            return keyIds.get(columnName) || null;
        }
        return await this.getKeyIDfromViewValue(viewValue, columnName);
    }

    /**
     * 查找标题里已带本块回链的远端滴答任务。
     *
     * 这类任务是插件自己创建时写下的 [S] 回链，可以证明"这一行曾经绑定过该任务"，
     * 典型用途是去重键写丢后（回写失败、进程崩溃、创建响应丢失）恢复绑定，
     * 而不是新建第二个远端任务。数据库 didaID 列仍是去重的唯一依据，
     * 这里只在列为空时作为"丢失去重键"的修复线索。
     *
     * verified 表示"远端列表是否被真正核对过"：为 false 时"没有匹配"并不代表远端真的没有，
     * 调用方据此决定是继续创建还是先跳过本轮。
     */
    private async findRemoteTaskBySiyuanBlock(
        blockId: string,
        forceRefresh = false,
    ): Promise<{ task?: Task; verified: boolean }> {
        if (!blockId) return { verified: false };
        // 先确保缓存是新鲜快照：命中也可能来自已经在远端被删除的任务，
        // 直接拿旧缓存当"远端确实有这个任务"会把行绑到一个不存在的任务上。
        const fresh = await this.ensureRemoteTaskCacheFresh(forceRefresh);
        if (!fresh) return { verified: false };
        return { task: findTaskBySiyuanBacklink(this.taskCache.values(), blockId), verified: true };
    }

    /**
     * 确保远端任务缓存是新鲜快照（必要时刷新）。
     * 返回 false 表示拿不到完整快照：此时"远端没有同源任务"这个结论不可信。
     */
    private async ensureRemoteTaskCacheFresh(forceRefresh = false): Promise<boolean> {
        const cacheIsFresh = this.taskCacheComplete
            && Date.now() - this.lastRemoteTaskRefreshAt < REMOTE_TASK_REFRESH_THROTTLE_MS;
        if (cacheIsFresh && !forceRefresh) return true;
        // 失败退避对强制刷新同样生效：离线时否则每一行都要等满一次请求超时，
        // 串行队列会把整轮同步堵死（方向仍然安全：核对不到就不创建）。
        if (this.lastRemoteTaskRefreshFailedAt > 0
            && Date.now() - this.lastRemoteTaskRefreshFailedAt < REMOTE_TASK_REFRESH_THROTTLE_MS) {
            return false;
        }
        return await this.refreshRemoteTaskCache();
    }

    /**
     * 刷新远端任务缓存（含已完成任务）。
     * 返回 false 表示刷新失败：此时"远端没有同源任务"这个结论不可信。
     * 并发调用复用同一个进行中的请求，避免请求量成倍放大。
     */    private async refreshRemoteTaskCache(): Promise<boolean> {
        if (!this.remoteRefreshInFlight) {
            this.remoteRefreshInFlight = this.performRemoteTaskCacheRefresh().finally(() => {
                this.remoteRefreshInFlight = null;
            });
        }
        try {
            return await this.remoteRefreshInFlight;
        } catch (error) {
            return false;
        }
    }

    /** 远端任务列表刷新本体。 */
    private async performRemoteTaskCacheRefresh(): Promise<boolean> {
        try {
            await this.getAllTasks();
            const completedTasks = await this.listCompletedTasks(this.getCompletedTaskQuery());
            for (const task of completedTasks) {
                if (task.id) this.taskCache.set(task.id, task);
            }
            this.lastRemoteTaskRefreshAt = Date.now();
            // 未完成 + 已完成都拿到了：这是一次完整快照，可以用来判断"远端确实没有同源任务"
            this.taskCacheComplete = true;
            return true;
        } catch (error) {
            console.warn("[滴答同步] 刷新滴答任务列表失败，无法核对同源任务", error);
            // 已完成任务没拿到，缓存不再完整：不能拿它当"远端确实没有同源任务"的依据
            this.taskCacheComplete = false;
            this.lastRemoteTaskRefreshFailedAt = Date.now();
            return false;
        }
    }

    /**
     * 创建远端任务前的"最后一道核对"：把已完成任务按更宽的时间窗再查一遍。
     *
     * 常规探测只看得到保留窗口（cal-dida-completed-days，默认 15 天）内的已完成任务，
     * 窗口外的旧任务会被漏掉，误判成"远端没有同源任务"从而给同一块重复建任务。
     * 这里按更宽的窗口补查一次，并按同样的间隔节流，避免批量创建时反复拉取。
     *
     * verified 表示"保留窗口外是否真的被核对过"：查询失败时"没找到"并不代表远端真的没有，
     * 调用方必须据此跳过创建，否则宽窗口深查一失败就会给同一块建出第二个远端任务。
     */
    private async findRemoteTaskBySiyuanBlockDeep(blockId: string): Promise<{ task?: Task; verified: boolean }> {
        if (!blockId) return { verified: false };
        // 命中也可能来自远端已删除的任务：先确保缓存是新鲜快照
        const fresh = await this.ensureRemoteTaskCacheFresh();
        if (!fresh) return { verified: false };
        const cached = findTaskBySiyuanBacklink(this.taskCache.values(), blockId);
        if (cached) return { task: cached, verified: true };
        if (Date.now() - this.lastDeepRemoteLookupAt < REMOTE_TASK_REFRESH_THROTTLE_MS) {
            // 刚查过：直接用宽窗口的结果判断（宽窗口查到的任务已并入缓存）
            // 上一次宽查失败过就不能当"远端确实没有"——必须等节流窗口过去重新查。
            if (!this.lastDeepRemoteLookupVerified) return { verified: false };
            // 只在节流窗口内信任宽窗口结果：窗口一过就重新查，
            // 否则远端已被删除的旧任务会一直留在宽窗口结果里，被重新绑定回列。
            return { task: this.deepBacklinkTasks.get(blockId), verified: true };
        }
        const ok = await this.ensureWideCompletedLookup();
        if (!ok) return { verified: false };
        return { task: this.deepBacklinkTasks.get(blockId), verified: true };
    }

    /**
     * 执行一次宽时间窗查询；并发调用复用同一个进行中的请求，避免请求量成倍放大。
     */
    private async ensureWideCompletedLookup(): Promise<boolean> {
        if (!this.deepLookupInFlight) {
            this.deepLookupInFlight = this.performWideCompletedLookup().finally(() => {
                this.deepLookupInFlight = null;
            });
        }
        try {
            // 直接用这次查询自己的结论：读全局标志会被"极窄窗口内另一次查询失败"改写。
            return await this.deepLookupInFlight;
        } catch (error) {
            return false;
        }
    }

    /**
     * 宽窗口查询本体：按时间段逐段拉取，合并到缓存并记录"带 [S] 回链"的任务。
     * 节流时间从查询结束后算：查询本身可能跑满整个时限，
     * 若从查询前算，节流窗口永远已经过期，失败时会变成不停重试。
     */
    private async performWideCompletedLookup(): Promise<boolean> {
        const deadline = Date.now() + WIDE_COMPLETED_TASK_QUERY_TIMEOUT_MS;
        const collected: Task[] = [];
        try {
            for (const query of this.getWideCompletedTaskQueries()) {
                const remaining = deadline - Date.now();
                if (remaining <= 0) {
                    // 时间不够扫完整个窗口：不能断定"远端没有"，按核对不到处理
                    throw new Error("宽时间窗查询超出总时限");
                }
                const completed = await this.apiClient.listCompletedTasks(query, remaining);
                collected.push(...completed);
            }
        } catch (error) {
            console.warn("[滴答同步] 扩大时间窗查询已完成任务失败", error);
            this.lastDeepRemoteLookupVerified = false;
            this.lastDeepRemoteLookupAt = Date.now();
            this.notifyDeepLookupFailed();
            return false;
        }
        // 宽窗口结果并入缓存：常规探测与深查都能命中
        this.deepBacklinkTasks.clear();
        for (const task of collected) {
            if (!task.id) continue;
            this.taskCache.set(task.id, task);
            // 只有带 [S] 回链的任务才可能是同源任务，单独按回链块 ID 索引
            const backlinkBlockId = extractSiyuanBlockIdFromDidaTitle(task.title);
            if (backlinkBlockId) this.deepBacklinkTasks.set(backlinkBlockId, task);
        }
        this.lastDeepRemoteLookupVerified = true;
        this.lastDeepRemoteLookupAt = Date.now();
        this.deepLookupFailureNotified = false;
        return true;
    }

    /**
     * 宽时间窗查询失败时提示一次：否则用户只会看到"同步完成：新建 0 个任务"，
     * 完全不知道任务为什么没建出来。
     * 用独立告警 id：不与其它告警共用，否则会被同 id 的其它提示顶掉且不再重弹。
     */
    private notifyDeepLookupFailed(): void {
        if (this.deepLookupFailureNotified) return;
        this.deepLookupFailureNotified = true;
        showMessage(
            "滴答同步：无法核对远端保留窗口外的历史任务，为避免重复本轮不新建滴答任务，请稍后重试或检查网络",
            10000,
            "error",
            "dida-sync-deep-lookup",
        );
    }

    /**
     * 宽时间窗的已完成任务查询：用于创建前最后一道核对，覆盖常规保留窗口之外的旧任务。
     * 整段窗口一次性拉取时返回体可能极大，这里按固定段数切开，逐段查询。
     */
    private getWideCompletedTaskQueries(): TaskCompletedQuery[] {
        const end = new Date();
        const windowMs = WIDE_COMPLETED_TASK_RETENTION_DAYS * 24 * 60 * 60 * 1000;
        const start = new Date(end.getTime() - windowMs);
        const segmentMs = windowMs / WIDE_COMPLETED_TASK_SEGMENT_COUNT;
        const queries: TaskCompletedQuery[] = [];
        for (let index = 0; index < WIDE_COMPLETED_TASK_SEGMENT_COUNT; index++) {
            const segmentStart = new Date(start.getTime() + index * segmentMs);
            // 相邻两段留 1 秒重叠：接口对起止时间的开闭区间若不一致，
            // 边界上恰好完成的任务也不会被漏掉。
            const segmentEnd = new Date(start.getTime() + (index + 1) * segmentMs + 1000);
            queries.push(this.buildCompletedTaskQuery(segmentStart, segmentEnd));
        }
        return queries;
    }

    /** 按时间区间构造已完成任务查询。 */
    private buildCompletedTaskQuery(start: Date, end: Date): TaskCompletedQuery {
        const query: TaskCompletedQuery = {};
        if (this.todoListId) {
            query.projectIds = [this.todoListId];
        }
        query.startDate = formatDateToISO(start);
        query.endDate = formatDateToISO(end);
        return query;
    }

    /**
     * 兼容旧版按块属性去重：读取块上的旧版滴答 ID 属性。
     * 旧版本把关联写在块属性 custom-dida-id 上而数据库列为空，这里用于恢复绑定。
     */
    private async readLegacyBlockDidaId(blockId: string): Promise<string> {
        if (!blockId) return "";
        try {
            const attrs = await getBlockAttrs(blockId);
            const value = attrs?.[LEGACY_DIDA_TASK_ID_ATTR] || "";
            if (value) this.legacyAttrBlocks.add(blockId);
            return value;
        } catch (error) {
            console.warn("[滴答同步] 读取旧版块滴答 ID 属性失败", blockId, error);
            return "";
        }
    }

    /**
     * 绑定已落到数据库列后清空旧块属性，避免旧关联与用户后续修改冲突。
     * 只清理"确实存在旧属性"的块，避免每次写去重键都多发一次 setBlockAttrs。
     */
    private async clearLegacyBlockDidaId(blockId: string): Promise<void> {
        if (!blockId) return;
        if (!this.legacyAttrBlocks.has(blockId)) return;
        try {
            await setBlockAttrs(blockId, { [LEGACY_DIDA_TASK_ID_ATTR]: "" });
            this.legacyAttrBlocks.delete(blockId);
        } catch (error) {
            console.warn("[滴答同步] 清理旧版块滴答 ID 属性失败", { blockId }, error);
        }
    }

    /**
     * 把滴答任务 ID 写回数据库 didaID 列，这是后续去重所依赖的唯一数据来源。
     *
     * 写入失败（内核报错或列已失效）会先清空列缓存重试一次；仍失败则登记到待补写队列，
     * 由下一轮同步重试落盘，期间用该队列阻止重复创建任务。
     */
    private async writeDidaTaskIdColumn(
        blockId: string,
        itemID: string,
        didaTaskId: string,
        viewValue?: any,
        task?: any,
    ): Promise<boolean> {
        if (!didaTaskId) return false;
        if (!itemID) {
            // 缺少行 ID：单元格无法定位，写入与补偿都不可能成功。
            // 此时登记待补写只会永久占位（补偿同样拿不到行 ID），所以只报错不登记。
            console.error("缺少行 ID（itemID），无法写回 didaID 列。", { blockId, itemID });
            return false;
        }

        for (let attempt = 1; attempt <= 2; attempt++) {
            const keyID = await this.resolveDidaIdKeyID(task, viewValue);
            if (!keyID) {
                console.error("无法找到 'didaID' 字段的 KeyID，无法写回滴答任务ID。", { blockId, itemID });
                break;
            }
            try {
                await this.withDidaTagged(async () => {
                    await updateAttrViewCell_pro(blockId, this.avId, keyID, itemID, didaTaskId, "text");
                });
                // 同步日历的行缓存，避免 5 秒 TTL 内读到未绑定 didaID 的旧行而重复建块
                patchViewValueRow(this.avId, itemID, { didaID: { content: didaTaskId } });
                // 绑定已落到数据库列：旧版块属性必须清空，否则用户手动清空列后，
                // 旧属性会把历史关联重新写回，抵消用户的解绑操作。
                await this.clearLegacyBlockDidaId(blockId);
                // 去重键已落盘：把待补写记录标记为"已落盘"，下一轮据此判断用户是否手动清空过
                this.markPendingDidaIdWriteLanded(itemID, didaTaskId, blockId);
                return true;
            } catch (error) {
                console.warn("[滴答同步] 写回 didaID 列失败", { blockId, itemID, attempt }, error);
                // keyID 可能是失效的（列被改名或删除），清空缓存后重试一次
                this.avColumnKeyIds = null;
            }
        }

        this.rememberPendingDidaIdWrite(blockId, itemID, didaTaskId);
        return false;
    }

    /** 待补写记录的键：去重键是行属性，所以以行 ID 为主，缺失时才退回块 ID。 */
    private pendingDidaIdWriteKey(itemID: string, blockId?: string): string {
        return itemID || blockId || "";
    }

    /** 登记待补写的去重键：期间用它阻止重复创建任务，并由下一轮同步重试落盘。 */
    private rememberPendingDidaIdWrite(blockId: string, itemID: string, didaTaskId: string): void {
        const key = this.pendingDidaIdWriteKey(itemID, blockId);
        if (!key) return;
        const previous = this.pendingDidaIdWrites.get(key);
        this.pendingDidaIdWrites.set(key, mergePendingDidaIdWrite(previous, {
            blockId,
            itemID,
            didaTaskId,
        }));
        this.persistPendingDidaIdWrites();
    }

    /**
     * 预登记一条去重键（还没失败过，重试次数从 0 起算）。
     *
     * 用于"块刚建出来、还没往数据库行里写去重键"这个窗口：先把依据登记下来，
     * 即使后面任何一步失败，下一轮也知道这个块已经有对应的滴答任务，不会再建第二个块。
     * 已有记录时不覆盖，避免把失败重试的次数抹掉。
     *
     * 返回落盘完成的 Promise：调用方应在建块之前 await 它，否则进程恰好在
     * 建块之后崩溃时，这条依据还没写进存储，兜不住重复建块。
     */
    private seedPendingDidaIdWrite(blockId: string, itemID: string, didaTaskId: string): Promise<void> {
        const key = this.pendingDidaIdWriteKey(itemID, blockId);
        if (!key || this.pendingDidaIdWrites.has(key)) return Promise.resolve();
        this.pendingDidaIdWrites.set(key, {
            blockId,
            itemID,
            didaTaskId,
            attempts: 0,
            landed: false,
            creating: false,
            rowUnregistered: false,
        });
        return this.persistPendingDidaIdWrites();
    }

    /**
     * 登记"创建意图"：远端任务创建前落盘，拿到 ID 后补全。
     * 创建响应丢失或进程崩溃时，凭这条记录到远端核对是否已建，避免重复创建远端任务。
     *
     * 返回落盘完成的 Promise：调用方必须在创建远端任务前 await 它，
     * 否则进程在 createTask 之后崩溃时，这条意图可能还没落盘，重复创建就无从判断。
     */
    private rememberCreatingIntent(blockId: string, itemID: string): Promise<void> {
        const key = this.pendingDidaIdWriteKey(itemID, blockId);
        if (!key) return Promise.resolve();
        this.pendingDidaIdWrites.set(key, buildCreatingIntent(blockId, itemID));
        return this.persistPendingDidaIdWrites();
    }

    /** 查找该行是否存在"创建意图"记录（远端可能已建成、只是响应丢失）。 */
    private findCreatingIntent(itemID: string, blockId: string): PendingDidaIdWrite | undefined {
        const record = this.pendingDidaIdWrites.get(itemID) ?? this.pendingDidaIdWrites.get(blockId);
        return record?.creating ? record : undefined;
    }

    /**
     * 标记待补写记录的去重键已成功落盘。
     * 记录本身先保留：下一轮补偿时据此区分"用户手动清空了列"与"尚未落盘"，避免把用户的
     * 解绑操作静默还原。
     */
    private markPendingDidaIdWriteLanded(itemID: string, didaTaskId: string, blockId?: string): void {
        const key = this.pendingDidaIdWriteKey(itemID, blockId);
        if (!key) return;
        const pending = this.pendingDidaIdWrites.get(key);
        if (!pending) return;
        // 去重键已写进数据库行，说明行确实存在，"行未登记"标记可以清掉
        const hadRowUnregistered = pending.rowUnregistered === true;
        pending.rowUnregistered = false;
        if (!pending.didaTaskId) {
            // 之前登记的是"创建意图"：现在拿到真实任务 ID，补全记录并标记已落盘
            pending.didaTaskId = didaTaskId;
            pending.creating = false;
            pending.landed = true;
            this.persistPendingDidaIdWrites();
            return;
        }
        // 只标记同一个去重键：记录指向别的任务时不能借用"已落盘"结论
        if (pending.didaTaskId !== didaTaskId) {
            if (hadRowUnregistered) this.persistPendingDidaIdWrites();
            return;
        }
        if (pending.landed) {
            if (hadRowUnregistered) this.persistPendingDidaIdWrites();
            return;
        }
        pending.landed = true;
        this.persistPendingDidaIdWrites();
    }

    /**
     * 标记"块已建出但未登记进数据库"：补偿流程会先补登记这一行，再写去重键。
     * 该标记只在插件自己登记失败时置位，用户主动删除的行不会被重建。
     */
    private markPendingDidaIdWriteRowUnregistered(blockId: string, itemID: string): void {
        const key = this.pendingDidaIdWriteKey(itemID, blockId);
        if (!key) return;
        const pending = this.pendingDidaIdWrites.get(key);
        if (!pending) return;
        pending.rowUnregistered = true;
        this.persistPendingDidaIdWrites();
    }

    /**
     * 绑定迁移到别的行时，把待补写记录跟着改到那一行。
     *
     * 记录以行 ID 为主键，所以换行要同时换掉队列里的键，否则补偿会一直写回旧行。
     */
    private rekeyPendingDidaIdWrite(pending: PendingDidaIdWrite, newItemID: string): void {
        if (!newItemID) return;
        const oldKey = this.pendingDidaIdWriteKey(pending.itemID, pending.blockId);
        const newKey = this.pendingDidaIdWriteKey(newItemID, pending.blockId);
        if (!newKey || newKey === oldKey) return;
        const existing = this.pendingDidaIdWrites.get(newKey);
        if (existing && existing !== pending) {
            // 目标行已有一条记录：那一行原来的块已经换掉了，它的记录已过期，
            // 清掉它，避免两条记录互相覆盖把去重键弄丢。
            this.forgetPendingDidaIdWrite(existing.itemID, existing.blockId);
        }
        this.pendingDidaIdWrites.delete(oldKey);
        pending.itemID = newItemID;
        this.pendingDidaIdWrites.set(newKey, pending);
        // "已提示过"的标记跟着换键，避免换行之后又弹一次同样的提示
        if (this.pendingWriteNotified.delete(oldKey)) {
            this.pendingWriteNotified.add(newKey);
        }
    }

    /** 移除待补写记录（去重键已落盘或绑定关系失效）。 */
    private forgetPendingDidaIdWrite(itemID: string, blockId?: string): void {
        const key = this.pendingDidaIdWriteKey(itemID, blockId);
        this.pendingWriteNotified.delete(key);
        if (!key || !this.pendingDidaIdWrites.delete(key)) return;
        this.persistPendingDidaIdWrites();
    }

    /**
     * 提示"去重键处理失败"，同一行只提示一次，避免每轮同步刷屏。
     * 用独立的告警 id（dida-sync-critical）：内核按 id 折叠同名提示，
     * 用同步日常提示的 id 会被同一条"同步完成"顶掉，用户根本看不到这条告警。
     */
    private notifyPendingWriteBlocked(pending: PendingDidaIdWrite, message: string): void {
        const key = this.pendingDidaIdWriteKey(pending.itemID, pending.blockId);
        if (!key || this.pendingWriteNotified.has(key)) return;
        this.pendingWriteNotified.add(key);
        console.error("[滴答同步] 待补写去重键处理失败，请检查数据库列与该行", {
            blockId: pending.blockId,
            itemID: pending.itemID,
            didaTaskId: pending.didaTaskId,
            attempts: pending.attempts,
            rowUnregistered: pending.rowUnregistered === true,
        });
        showMessage(`滴答同步：${message}`, 10000, "error", "dida-sync-critical");
    }

    /**
     * 重试次数用尽时的处理：提示一次（不刷屏），并把计数归零。
     *
     * 归零而不是彻底停摆，是为了让用户修好数据库列之后这一行能自动恢复；
     * 记录本身始终保留——它就是去重键，丢了下一轮就会重复建块。
     */
    private armPendingWriteRetry(pending: PendingDidaIdWrite, message: string): void {
        this.notifyPendingWriteBlocked(pending, message);
        pending.attempts = 0;
        this.persistPendingDidaIdWrites();
    }

    /**
     * 持久化待补写的去重键：插件重启/思源重启后仍能知道"这个块已经建过滴答任务"，
     * 避免去重键未落盘时重建重复任务。写入串行化，避免并发写同一文件导致快照乱序。
     * 返回落盘完成的 Promise，便于销毁时等待写完再清内存。
     */
    private persistPendingDidaIdWrites(): Promise<void> {
        const entries = Array.from(this.pendingDidaIdWrites.values());
        this.pendingPersistChain = this.pendingPersistChain
            .then(() => this.savePendingDidaIdWrites(entries))
            .then(() => undefined)
            .catch(error => {
                console.warn("[滴答同步] 持久化待补写去重键失败", error);
            });
        return this.pendingPersistChain;
    }

    /**
     * 把待补写队列写入插件存储。
     *
     * 思源的 `saveData` 不会替调用方检查内核返回码，且网络异常或内核负数错误码可能让
     * Promise 一直挂起——那会永久阻塞后续落盘。这里显式校验 code，并加超时与重试，
     * 保证"待补写状态跨重启保留"不会静默失效。
     */
    private async savePendingDidaIdWrites(entries: PendingDidaIdWrite[]): Promise<void> {
        const MAX_ATTEMPTS = 3;
        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                const response: any = await this.saveDataWithTimeout(DIDA_PENDING_WRITES_FILE, entries);
                const code = response?.code;
                if (typeof code === "number" && code !== 0) {
                    throw new Error(`内核返回 code=${code} msg=${response?.msg || ""}`);
                }
                this.pendingSaveFailureNotified = false;
                return;
            } catch (error) {
                if (attempt >= MAX_ATTEMPTS) {
                    console.error("[滴答同步] 待补写去重键落盘失败，去重键可能无法跨重启保留", error);
                    // 只提示一次：否则每轮同步都会重复弹同一条，用户以为同步一直失败
                    if (!this.pendingSaveFailureNotified) {
                        this.pendingSaveFailureNotified = true;
                        showMessage("滴答同步：待补写去重键保存失败，重启后可能出现重复任务", 10000, "error", "dida-sync-critical");
                    }
                    return;
                }
                console.warn("[滴答同步] 待补写去重键落盘失败，准备重试", { attempt }, error);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }

    /** 带超时的 saveData：避免内核异常导致 Promise 永久挂起。 */
    private async saveDataWithTimeout(fileName: string, data: any): Promise<any> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                this.plugin.saveData(fileName, data),
                new Promise((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`保存 ${fileName} 超时`)), PENDING_WRITE_SAVE_TIMEOUT_MS);
                }),
            ]);
        } finally {
            if (timer) clearTimeout(timer);
        }
    }

    /** 读取上次运行遗留的待补写去重键。 */
    private async restorePendingDidaIdWrites(): Promise<void> {
        try {
            const data = await this.plugin.loadData(DIDA_PENDING_WRITES_FILE);
            if (!Array.isArray(data)) return;
            for (const item of data) {
                // "创建意图"记录没有任务 ID，同样要恢复：它是远端是否已建的唯一线索
                if (!item?.didaTaskId && item?.creating !== true) continue;
                const key = this.pendingDidaIdWriteKey(item.itemID || "", item.blockId);
                if (!key) continue;
                this.pendingDidaIdWrites.set(key, {
                    blockId: item.blockId || "",
                    itemID: item.itemID || "",
                    didaTaskId: item.didaTaskId || "",
                    attempts: Number(item.attempts) || 1,
                    landed: item.landed === true,
                    creating: item.creating === true,
                    rowUnregistered: item.rowUnregistered === true,
                });
            }
            if (this.pendingDidaIdWrites.size > 0) {
                console.info("[滴答同步] 已恢复待补写的 didaID 列记录", { count: this.pendingDidaIdWrites.size });
            }
        } catch (error) {
            console.warn("[滴答同步] 读取待补写去重键失败", error);
        }
    }

    /**
     * 判断绑定块是否还存在：用于区分"行被删除"与"行只是不在当前视图里"。
     *
     * 注意：`getBlockAttrs` 对不存在的块同样返回空对象（内核只查 attributes 表），
     * 无法用来判活，这里改用 blocks 表直查；查询不可用时按"仍在"处理，保留待补写记录。
     */
    private async isBlockAlive(blockId: string): Promise<boolean> {
        if (!blockId) return false;
        try {
            const result = await sqlWithMeta(`SELECT id FROM blocks WHERE id = '${blockId}' LIMIT 1;`);
            if (result.ok === false) {
                console.warn("[滴答同步] 查询绑定块是否存在失败，按仍存在处理", { blockId });
                return true;
            }
            return result.rows.length > 0;
        } catch (error) {
            console.warn("[滴答同步] 检查绑定块是否存在失败", { blockId }, error);
            return true;
        }
    }

    /**
     * 查询块在当前数据库里绑定到哪一行。
     *
     * 返回 "" 表示块没有绑定到本数据库的任何行；返回 null 表示查询失败（状态未知）。
     * 内核按 AV 的块键值表反查，不受视图过滤影响。
     */
    private async resolveBoundItemId(blockId: string): Promise<string | null> {
        if (!this.avId || !blockId) return null;
        try {
            const ids = await getAttributeViewItemIDsByBoundIDs(this.avId, [blockId]);
            // request() 在内核返回非 0 时会返回字符串而不是对象，这里必须先校验
            if (!ids || typeof ids !== "object" || Array.isArray(ids)) return null;
            const itemId = (ids as Record<string, string>)[blockId];
            return typeof itemId === "string" ? itemId : "";
        } catch (error) {
            console.warn("[滴答同步] 查询块的数据库绑定行失败", { blockId }, error);
            return null;
        }
    }

    /**
     * 查询某一行的数据库行当前绑着哪个块。
     * 返回 "" 表示这一行没有绑定块（游离），返回 null 表示查询失败（状态未知）。
     * 内核按行 ID 反查，不受视图过滤与视图布局影响。
     */
    private async resolveRowBlockId(itemID: string): Promise<string | null> {
        if (!this.avId || !itemID) return null;
        try {
            // 必须打 dida 标签：否则变更源会把这个只读请求当成"外部写入数据库"，
            // 每同步一次就把整库的行缓存作废，视图数据退化成每次全量渲染。
            const ids = await this.withDidaTagged(async () =>
                await getAttributeViewBoundBlockIDsByItemIDs(this.avId!, [itemID]));
            // request() 在内核返回非 0 时会返回字符串而不是对象，这里必须先校验
            if (!ids || typeof ids !== "object" || Array.isArray(ids)) {
                console.warn("[滴答同步] 查询行当前绑定的块失败（内核返回异常）", { itemID });
                this.noteRowBindingLookupFailed();
                return null;
            }
            const blockId = (ids as Record<string, string>)[itemID];
            this.rowBindingLookupFailedCount = 0;
            this.rowBindingFailureNotified = false;
            return typeof blockId === "string" ? blockId : "";
        } catch (error) {
            console.warn("[滴答同步] 查询行的绑定块失败", { itemID }, error);
            this.noteRowBindingLookupFailed();
            return null;
        }
    }

    /**
     * 记录"查询行绑定块"连续失败次数：连续失败说明数据库接口整体不可用，
     * 这时所有实时同步都会被守卫跳过，必须让用户看到原因。
     */
    private noteRowBindingLookupFailed(): void {
        this.rowBindingLookupFailedCount += 1;
        if (this.rowBindingLookupFailedCount < 3 || this.rowBindingFailureNotified) return;
        this.rowBindingFailureNotified = true;
        showMessage(
            "滴答同步：无法读取数据库行的绑定状态，本轮已暂缓同步以免写错行，请检查思源数据库是否可用",
            10000,
            "error",
            "dida-sync-critical",
        );
    }

    /**
     * 解析一条待补写记录的去重键应该写到哪一行。
     *
     * 内核按行 ID 定位单元格，所以去重键必须跟着块走：块迁到别的行后，
     * 把键写回旧行会让旧行现在绑着的块莫名多出一个任务绑定。
     * 补偿流程（flushPendingDidaIdWrites）与实时补写路径（syncSingleSiyuanTaskToDida）
     * 必须用同一套判定，否则两条路径会给出相反结论。
     */
    private async inspectPendingTarget(pending: PendingDidaIdWrite): Promise<{
        action: PendingTargetAction;
        boundItemId: string | null;
    }> {
        const boundItemId = pending.blockId ? await this.resolveBoundItemId(pending.blockId) : null;
        return {
            boundItemId,
            action: resolvePendingTargetAction({
                boundItemId,
                itemID: pending.itemID,
                rowUnregistered: pending.rowUnregistered === true,
            }),
        };
    }

    /**
     * 确保块已经在数据库里登记为一行。
     *
     * 建块后"加入数据库"这一步可能失败（内核报错、请求超时），此时块存在但数据库里
     * 没有对应行，去重键无处可写，下一轮同步会为同一个滴答任务再建一个块。
     * 这里按"块绑定到哪一行"判断，避免误建重复行：
     * - 已绑定到同一行：无需处理；
     * - 未绑定：补登记这一行；
     * - 绑定到别的行：块已被改绑到其它行，不重复登记；
     * - 查询失败：按"不动"处理，宁可漏建也不重复建。
     */
    private async ensureRowRegistered(blockId: string, itemID: string): Promise<boolean> {
        if (!this.avId || !blockId || !itemID) return false;
        const boundItemId = await this.resolveBoundItemId(blockId);
        if (boundItemId === null) return false;
        if (boundItemId === itemID) return true;
        if (boundItemId) {
            console.info("[滴答同步] 块已绑定到别的行，不再补登记", { blockId, boundItemId, itemID });
            return false;
        }
        try {
            await this.withDidaTagged(async () => {
                await addBlockToDatabase_pro(blockId, this.avId!, itemID);
            });
            console.info("[滴答同步] 已补登记数据库行", { blockId, itemID });
            return true;
        } catch (error) {
            console.warn("[滴答同步] 补登记数据库行失败", { blockId, itemID }, error);
            return false;
        }
    }

    /**
     * 上一轮未能落盘的 didaID 列写入，在本轮同步时重试。
     *
     * 判定依据（行 ID 为主键，换绑块后仍能定位到同一行）：
     * - 行已不存在且绑定块也已删除：绑定关系失效，丢弃记录；
     * - 列已有同一个去重键：已落盘，丢弃记录；
     * - 列已被改绑到别的滴答任务：丢弃过期记录；
     * - 列已被用户手动清空（landed 标记为已落盘）：尊重用户操作，不还原；
     * - 其余情况：补写落盘。
     */
    private async flushPendingDidaIdWrites(rowsByItemId: Map<string, any>, viewValue?: any): Promise<void> {
        if (this.pendingDidaIdWrites.size === 0) return;
        for (const pending of Array.from(this.pendingDidaIdWrites.values())) {
            if (pending.creating) {
                // "创建意图"不是待补写的去重键：它由创建路径自己核对远端后处理，这里不参与补偿
                continue;
            }
            const row = pending.itemID ? rowsByItemId.get(pending.itemID) : undefined;
            const currentDidaId = row ? this.readDidaTaskId(row) : null;
            let action = resolvePendingDidaIdWriteAction(
                pending,
                currentDidaId,
                MAX_PENDING_DIDA_ID_WRITE_ATTEMPTS,
            );
            if (action === "drop") {
                // 去重键已落盘 / 已改绑 / 用户手动清空：记录不再需要
                this.forgetPendingDidaIdWrite(pending.itemID, pending.blockId);
                continue;
            }
            // 写列之前先核对绑定有没有迁移：内核按行 ID 定位单元格，
            // 块已经迁到别的行时把去重键写到旧行，会让旧行现在绑着的块莫名多出一个任务绑定。
            const target = await this.inspectPendingTarget(pending);
            let boundItemId = target.boundItemId;
            if (target.action === "skip") {
                // 绑定查询失败：状态未知，本轮不动，等下一轮再核对。
                // 记录必须保留——它就是去重键，丢了下一轮就会重复建块。
                pending.attempts = pending.attempts + 1;
                this.persistPendingDidaIdWrites();
                if (pending.attempts >= MAX_PENDING_DIDA_ID_WRITE_ATTEMPTS) {
                    this.armPendingWriteRetry(pending, "数据库绑定行查询失败，请检查数据库是否可用（插件会继续重试）");
                }
                continue;
            }
            if (target.action === "drop") {
                // 块已经不在数据库里（不是插件自己登记失败）：绑定失效，记录可以丢
                console.info("[滴答同步] 绑定块已不在数据库，丢弃待补写记录", {
                    blockId: pending.blockId,
                    itemID: pending.itemID,
                });
                this.forgetPendingDidaIdWrite(pending.itemID, pending.blockId);
                continue;
            }
            if (target.action === "rekey" && boundItemId) {
                // 块迁到别的行了：记录跟着迁过去，去重键要写到新行
                console.info("[滴答同步] 绑定块已迁到别的行，去重键跟着迁移", {
                    blockId: pending.blockId,
                    fromItemID: pending.itemID,
                    toItemID: boundItemId,
                });
                this.rekeyPendingDidaIdWrite(pending, boundItemId);
                pending.rowUnregistered = false;
                this.persistPendingDidaIdWrites();
                boundItemId = pending.itemID;
                // 行 ID 变了，这一行的去重键状态要重新看
                const movedRow = rowsByItemId.get(pending.itemID);
                const movedDidaId = movedRow ? this.readDidaTaskId(movedRow) : null;
                action = resolvePendingDidaIdWriteAction(
                    pending,
                    movedDidaId,
                    MAX_PENDING_DIDA_ID_WRITE_ATTEMPTS,
                );
                if (action === "drop") {
                    this.forgetPendingDidaIdWrite(pending.itemID, pending.blockId);
                    continue;
                }
            }
            if (target.action === "register") {
                // 块已建出、行未登记：先补登记这一行，再写去重键。
                // 必须排在"放弃重试"之前：记录一旦被丢弃，去重键就真的丢了，会重复建块。
                const registered = await this.ensureRowRegistered(pending.blockId, pending.itemID);
                if (!registered) {
                    pending.attempts = pending.attempts + 1;
                    this.persistPendingDidaIdWrites();
                    if (pending.attempts >= MAX_PENDING_DIDA_ID_WRITE_ATTEMPTS) {
                        this.armPendingWriteRetry(pending, "数据库行登记失败，请检查数据库是否可用（插件会继续重试）");
                    }
                    continue;
                }
                // 行已经登记好：清标记，接下来直接把去重键写上去
                pending.rowUnregistered = false;
                this.persistPendingDidaIdWrites();
                boundItemId = pending.itemID;
            } else if (target.action === "write" && pending.rowUnregistered) {
                // 块已经绑在这一行上：说明上一轮的行登记其实成功了，清掉标记
                pending.rowUnregistered = false;
                this.persistPendingDidaIdWrites();
            }
            if (action === "unknown") {
                // 行不可见：可能是行已被删除，也可能是当前视图没覆盖这一行。
                // 先确认块还在不在，再看它实际绑定到哪一行：
                // 只有绑定确实失效时才丢弃记录，记录丢了就等于把去重键丢了。
                const blockAlive = pending.blockId ? await this.isBlockAlive(pending.blockId) : false;
                const rowAction = resolvePendingRowAction({
                    blockAlive,
                    rowUnregistered: pending.rowUnregistered === true,
                    boundItemId,
                });
                if (rowAction === "drop") {
                    console.info("[滴答同步] 待补写去重键的绑定已失效，丢弃记录", {
                        blockId: pending.blockId,
                        itemID: pending.itemID,
                    });
                    this.forgetPendingDidaIdWrite(pending.itemID, pending.blockId);
                    continue;
                }
                if (pending.attempts >= MAX_PENDING_DIDA_ID_WRITE_ATTEMPTS) {
                    // 重试次数用尽：提示一次并把计数归零，让这一行在用户修好数据库后还能自动恢复。
                    // 记录必须保留——它就是去重键，丢了下一轮就会重复建块。
                    this.armPendingWriteRetry(pending, "didaID 列回写多次失败，请检查数据库列与该行（插件会继续重试）");
                }
                // 块还在：行可能只是没被当前视图覆盖。内核按行 ID 定位单元格、不依赖视图，
                // 因此仍尝试落盘；写失败说明行确实已不存在，按补偿失败处理。
                action = "compensate";
            }
            if (action === "block" || pending.attempts >= MAX_PENDING_DIDA_ID_WRITE_ATTEMPTS) {
                // 重试次数用尽：提示一次并把计数归零，仍然继续补写。
                // 不能在这里丢弃记录——记录就是去重键，丢了下一轮就会重复建块。
                this.armPendingWriteRetry(pending, "didaID 列回写多次失败，请检查数据库列与该行（插件会继续重试）");
            }
            const ok = await this.writeDidaTaskIdColumn(
                pending.blockId,
                pending.itemID,
                pending.didaTaskId,
                viewValue,
                row,
            );
            if (ok) {
                console.info("[滴答同步] 已补写 didaID 列", {
                    blockId: pending.blockId,
                    didaTaskId: pending.didaTaskId,
                });
            }
        }
    }

    /** 查找某个滴答任务对应的待补写记录：去重键尚未落盘，不能据此重复建块或重复建任务。 */
    private findPendingDidaIdWritesByTaskId(didaTaskId: string): PendingDidaIdWrite[] {
        if (!didaTaskId) return [];
        const matches: PendingDidaIdWrite[] = [];
        for (const pending of this.pendingDidaIdWrites.values()) {
            if (pending.didaTaskId === didaTaskId) matches.push(pending);
        }
        return matches;
    }

    /**
     * 查询旧版本写在块属性上的滴答 ID，仅用于把历史关联回填到数据库 didaID 列。
     * ok 为 false 表示查询失败（此时 ids 不可信，需要走逐块兜底扫描）。
     */
    private async queryLegacyBlockDidaIds(): Promise<{ ids: Map<string, string>; truncated: boolean; ok: boolean }> {
        const idsByBlock = new Map<string, string>();
        try {
            const result = await sqlWithMeta(
                `SELECT block_id, value FROM attributes WHERE name = '${LEGACY_DIDA_TASK_ID_ATTR}' AND type = 'b' LIMIT 9999999;`,
            );
            if (result.truncated) {
                console.error("旧版块滴答 ID 查询结果被截断，历史关联可能缺失", {
                    limit: result.limit,
                    count: result.rows.length,
                });
                return { ids: idsByBlock, truncated: true, ok: true };
            }
            if (result.ok === false) {
                return { ids: idsByBlock, truncated: false, ok: false };
            }
            for (const row of result.rows) {
                if (typeof row?.block_id === 'string' && typeof row?.value === 'string' && row.value) {
                    idsByBlock.set(row.block_id, row.value);
                }
            }
            return { ids: idsByBlock, truncated: false, ok: true };
        } catch (error) {
            console.warn("查询旧版块滴答 ID 属性失败，跳过历史回填", error);
            return { ids: idsByBlock, truncated: false, ok: false };
        }
    }

    /**
     * 逐块兜底扫描旧版块属性：批量 SQL 不可用时使用。
     * 扫描所有带块的行（不只列为空的行）：列为空的行用于回填关联，
     * 列已填的行用于清掉残留旧属性，避免用户手动清空列后旧关联被写回。
     */
    private async migrateLegacyBlockDidaIdsByScan(
        viewValue: any,
        existingTasks: any[],
        existingTasksMap: Map<string, any>,
    ): Promise<void> {
        const candidates = existingTasks.filter(task => !!task.事件?.id);
        if (candidates.length === 0) return;

        const legacyIds = new Map<string, string>();
        const CONCURRENCY = 8;
        for (let i = 0; i < candidates.length; i += CONCURRENCY) {
            const chunk = candidates.slice(i, i + CONCURRENCY);
            const found = await Promise.all(chunk.map(async task => ({
                blockId: task.事件.id as string,
                legacyId: await this.readLegacyBlockDidaId(task.事件.id as string),
            })));
            for (const item of found) {
                if (item.legacyId) legacyIds.set(item.blockId, item.legacyId);
            }
        }
        if (legacyIds.size === 0) return;

        for (const task of existingTasks) {
            const blockId = task.事件?.id;
            const legacyId = blockId ? legacyIds.get(blockId) : undefined;
            if (!legacyId) continue;
            const itemID = task.事件?.itemID;
            // 列里已有值的行：只需清掉旧属性，不改列
            if (task.didaID?.content) {
                await this.clearLegacyBlockDidaId(blockId);
                continue;
            }
            if (!itemID) continue;
            const ok = await this.writeDidaTaskIdColumn(blockId, itemID, legacyId, viewValue, task);
            if (!ok) {
                console.warn("[滴答同步] 回填数据库 didaID 列失败，本轮不会为该任务重复建块", { blockId, legacyId });
                continue;
            }
            task.didaID = { content: legacyId, keyID: task.didaID?.keyID || "" };
            existingTasksMap.set(legacyId, task);
            console.info("[滴答同步] 已从旧版块属性回填数据库 didaID 列", { blockId, legacyId });
        }
    }

    /**
     * 一次性迁移：旧版本把滴答任务 ID 写在块属性上，数据库 didaID 列为空。
     * 这里把块属性中的关联回填到数据库列，避免回退去重依据后重复建块。
     * 返回 false 表示历史关联不完整，本轮同步应中止以免重复建块。
     */
    private async migrateLegacyBlockDidaIds(
        viewValue: any,
        existingTasks: any[],
        existingTasksMap: Map<string, any>,
    ): Promise<boolean> {
        const legacy = await this.queryLegacyBlockDidaIds();
        if (!legacy.ok) {
            // 批量查询不可用：改用逐块扫描兜底，保证旧版块属性去重的数据不丢关联
            console.warn("[滴答同步] 批量查询旧版块属性不可用，改用逐块扫描兜底");
            await this.migrateLegacyBlockDidaIdsByScan(viewValue, existingTasks, existingTasksMap);
            return true;
        }
        if (legacy.truncated) {
            return false;
        }

        const legacyIds = legacy.ids;
        if (legacyIds.size === 0) return true;
        // 记录哪些块仍带旧版块属性：回填成功后需要清理这些属性
        for (const blockId of legacyIds.keys()) {
            this.legacyAttrBlocks.add(blockId);
        }

        // 列里已有值的行：旧属性同样要清掉，否则用户手动清空列后，
        // 残留的旧属性会把历史关联写回列，抵消用户的解绑操作。
        for (const task of existingTasks) {
            const blockId = task.事件?.id;
            if (!blockId || !task.didaID?.content) continue;
            if (!legacyIds.get(blockId)) continue;
            await this.clearLegacyBlockDidaId(blockId);
        }

        const pending = existingTasks.filter(task => !task.didaID?.content && task.事件?.id && legacyIds.get(task.事件.id));
        if (pending.length === 0) return true;

        for (const task of pending) {
            const blockId = task.事件.id;
            const itemID = task.事件.itemID;
            const legacyId = legacyIds.get(blockId);
            if (!itemID || !legacyId) continue;

            // 回填失败时 writeDidaTaskIdColumn 会登记待补写记录，本轮据此避免重复建块
            const ok = await this.writeDidaTaskIdColumn(blockId, itemID, legacyId, viewValue, task);
            if (!ok) {
                console.warn("[滴答同步] 回填数据库 didaID 列失败，本轮不会为该任务重复建块", { blockId, legacyId });
                continue;
            }
            task.didaID = { content: legacyId, keyID: task.didaID?.keyID || "" };
            existingTasksMap.set(legacyId, task);
            // 回填成功后旧块属性已由 writeDidaTaskIdColumn 清理：否则用户手动清空 didaID 列后，
            // 历史关联会再次被写回
            console.info("[滴答同步] 已把块属性中的滴答 ID 回填到数据库 didaID 列", { blockId, legacyId });
        }
        return true;
    }
    private getCompletedTaskRetentionDays(): number {
        const raw = (settingdata as any)["cal-dida-completed-days"];
        if (raw === null || raw === undefined || raw === "") {
            return 15;
        }
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
            return 15;
        }
        return Math.max(0, Math.floor(parsed));
    }

    private getCompletedTaskQuery(): TaskCompletedQuery {
        const days = this.getCompletedTaskRetentionDays();
        const end = new Date();
        const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
        return this.buildCompletedTaskQuery(start, end);
    }

    private getDidaUpdateCooldownMs(): number {
        const raw = (settingdata as any)["cal-dida-sync-cooldown"];
        const seconds = Number.isFinite(Number(raw)) ? Number(raw) : 30;
        // 最低 5 秒，避免 0 导致无保护
        return Math.max(5, seconds) * 1000;
    }

    constructor(apiClient: Dida365ApiClient, plugin: steveTools) {
        this.plugin = plugin;
        this.apiClient = apiClient;
        this.todoListId = settingdata["cal-dida-unfinished-list"] || null;
        this.changeSource = new SiyuanTaskChangeSource({
            plugin,
            getAvId: () => this.avId,
            isSyncing: this.isSyncOrEchoActive,
            onForceTarget: async (blockId, itemID) => {
                await this.processSiyuanUpdateTarget(blockId, itemID);
            },
            onQueuedTarget: (blockId, itemID, isDetached) => {
                this.enqueueSiyuanSyncTarget(blockId, itemID, isDetached);
            },
            invalidateAvCache: () => {
                invalidateViewValueCache(this.avId ?? undefined);
            },
        });
        console.debug("Dida365Service initialized", this.todoListId);
        this.plugin.addIcons(`
            <symbol id="iconSTdida" viewBox="0 0 48 48">
                ${ic.steveTools_dida}
            </symbol>
            `)
    }

    async start(): Promise<void> {
        await this.init();
    }

    /**
     * 初始化 Dida365Service，进行必要的设置或验证。
     */
    private async init() {
        const showDidaTopBar = settingdata["cal-dida-sync-mode"] === "all" || settingdata["cal-dida-sync-mode"] === "manual";
        this.topBarButton = applyTopBarButton(this.plugin, this.topBarButton, "st-cal-dida-sync", {
            icon: "iconSTdida",
            title: "导入滴答清单数据", // 标题可以考虑根据模式动态变化或在设置中说明
            position: "right",
            callback: async () => {
                // const data = await this.getAllTasks();
                // console.debug("获取到的所有任务数据:", data);
                await this.syncTasksToSiyuan();
            }
        }, showDidaTopBar);
        this.createDock();
        if (settingdata["cal-dida-sync-mode"] === "auto" || settingdata["cal-dida-sync-mode"] === "all") {
            // 自动同步模式，设置定时器
            this.initialSyncTimer = window.setTimeout(async () => {
                if (!this.isSyncing) { // 首次延迟10秒后同步一次
                    await this.syncTasksToSiyuan();
                }
            }, 10000);
            this.autoSyncInterval = window.setInterval(async () => {
                if (!this.isSyncing) { // 仅在未同步时执行
                    await this.syncTasksToSiyuan();
                }
            }, settingdata["cal-dida-sync-interval"] * 60 * 1000); // 转换为毫秒
        };
        await this.init_av();
        await this.restorePendingDidaIdWrites();
        try {
            // 用完整刷新预热缓存：只有"未完成 + 已完成"的完整快照才能用来核对同源任务
            await this.refreshRemoteTaskCache();
        } catch (error) {
            // 离线启动不能拖垮整个插件：缓存拿不到就等下一轮同步补上，
            // 变更监听必须照常启动，否则用户后续的编辑永远同步不过去。
            console.warn("[滴答同步] 初始化时加载滴答任务缓存失败", error);
        }
        this.changeSource.start();
    }
    /**
     * 获取数据库视图数据的封装方法
     * @param logMessage 可选的日志消息前缀
     * @returns Promise<any> 返回视图数据
     */
    private async getAvViewData(logMessage?: string): Promise<any> {
        if (!this.avId || this.avId.trim() === "") {
            throw new Error("avId 未设置或为空");
        }

        const data = await getViewId([this.avId]);
        if (logMessage) {
            console.debug(`${logMessage} - 获取到的 avId 数据:`, data);
        }

        const viewValue = await getViewValue(data, false, "dida");
        if (logMessage) {
            console.debug(`${logMessage} - 获取到的 avId 对应的值:`, viewValue);
        }

        return viewValue;
    }

    private async init_av() {
        this.avId = settingdata["cal-dida-db-id"]
        this.avColumnKeyIds = null;
        if (!this.avId || this.avId.trim() === "") {
            showMessage("Dida365Service: avId is not set or is empty.", 5000, "error", "dida-sync");
            return;
        }

        try {
            await this.getAvViewData("初始化数据库视图");
        } catch (error) {
            console.error("初始化数据库视图失败:", error);
            showMessage("初始化数据库视图失败: " + (error instanceof Error ? error.message : String(error)), 5000, "error", "dida-sync");
        }
    }
    private linkInterceptor: DidaLinkInterceptor;
    private createDock() {
        this.linkInterceptor = new DidaLinkInterceptor(showMessage);
        const dockConfig = createDidaDock({
            title: "滴答清单",
            icon: "iconSTdida",
            type: "dida-dock",
            position: "RightTop",
            size: { width: 350, height: 0 },
            showMessage,
            onDockCreated: (dock) => {
                // 设置链接拦截器
                this.linkInterceptor.setDock(dock);
                console.debug("滴答清单dock创建成功", dock);
            },
            iframeId: "dida-dock",
            containerClass: "dida-dock-container"
        });
        this.linkInterceptor.setDock_more(dockConfig);
        // 添加dock到插件
        this.plugin.addDock(dockConfig as any);
    }

    /**
     * 防抖同步方法：等待指定时间，如果期间有新的调用则重新计时
     * 优化：添加冷却期检查，避免刚修改后立即反向同步覆盖
     */
    private debouncedSyncTasksToSiyuan(delay = 10000, confirmTarget?: { blockId: string; itemID: string }): void {
        if (confirmTarget) {
            this.enqueueSiyuanConfirmTarget(confirmTarget, delay);
            console.debug("已加入思源->滴答确认检查队列", confirmTarget, "delay=", delay);
            return;
        }

        // 清除之前的计时器
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
            console.debug("取消之前的同步计时器，重新开始等待");
        }

        // 设置新的计时器
        this.syncDebounceTimer = setTimeout(async () => {
            try {
                console.debug("防抖等待完成，开始执行同步任务到思源");

                // 若存在本地更新未确认的任务，稍后再同步，避免覆盖
                if (this.hasPendingDidaUpdates()) {
                    console.debug("检测到本地待同步任务，延迟5秒后重试");
                    this.debouncedSyncTasksToSiyuan(5000);
                    return;
                }

                // 检查是否有任务正在被锁定（正在同步中）
                const hasLockedTasks = Array.from(this.taskSyncLocks.values()).some(locked => locked);
                if (hasLockedTasks) {
                    console.debug("检测到有任务正在同步中，延迟5秒后重试");
                    this.debouncedSyncTasksToSiyuan(5000);
                    return;
                }

                const isUpdate = await this.syncTasksToSiyuan();
                this.syncDebounceTimer = null; // 清空计时器引用
                if (isUpdate && delay === 10000) {
                    showMessage("滴答任务同步不一致", 2000, "info", "dida-sync");
                } else if (isUpdate && delay === 3000) {
                    showMessage("滴答同步完成", 2000, "info", "dida-sync");
                }
            } catch (error) {
                console.error("防抖同步执行失败:", error);
                this.syncDebounceTimer = null; // 清空计时器引用
            }
        }, delay);

        console.debug(`设置防抖同步计时器，将在${delay / 1000}秒后执行（如无新的调用）`);
    }

    /**
     * 清理过期的本地待同步标记
     */
    private cleanupPendingDidaUpdates(now = Date.now()): void {
        for (const [id, until] of this.pendingDidaUpdates.entries()) {
            if (until <= now) {
                this.pendingDidaUpdates.delete(id);
            }
        }
    }

    /**
     * 标记某个任务为“本地已更新，等待滴答确认”
     */
    private markPendingDidaUpdate(didaId: string, cooldownMs?: number): void {
        if (!didaId) return;
        const ttl = cooldownMs ?? this.getDidaUpdateCooldownMs();
        this.pendingDidaUpdates.set(didaId, Date.now() + ttl);
    }

    /**
     * 判断任务是否仍处于本地更新冷却期
     */
    private isPendingDidaUpdate(didaId: string): boolean {
        const until = this.pendingDidaUpdates.get(didaId);
        if (!until) return false;
        if (Date.now() > until) {
            this.pendingDidaUpdates.delete(didaId);
            return false;
        }
        return true;
    }

    /**
     * 判断是否仍有本地待同步任务
     */
    private hasPendingDidaUpdates(): boolean {
        this.cleanupPendingDidaUpdates();
        return this.pendingDidaUpdates.size > 0;
    }

    /**
     * 将单条确认检查加入队列，避免连续同步时前一个检查被后一个覆盖。
     */
    private enqueueSiyuanConfirmTarget(confirmTarget: { blockId: string; itemID: string }, delay: number): void {
        const key = `${confirmTarget.blockId}::${confirmTarget.itemID}`;
        const dueAt = Date.now() + delay;
        const previous = this.pendingSiyuanConfirmTargets.get(key);
        this.pendingSiyuanConfirmTargets.set(key, {
            blockId: confirmTarget.blockId,
            itemID: confirmTarget.itemID,
            dueAt: previous ? Math.min(previous.dueAt, dueAt) : dueAt,
            attempts: previous ? previous.attempts : 0,
        });
        this.schedulePendingSiyuanConfirmFlush();
    }

    /**
     * 安排下一次确认检查刷新。
     */
    private schedulePendingSiyuanConfirmFlush(): void {
        if (this.pendingSiyuanConfirmTimer) {
            clearTimeout(this.pendingSiyuanConfirmTimer);
            this.pendingSiyuanConfirmTimer = null;
        }

        if (this.pendingSiyuanConfirmTargets.size === 0) {
            return;
        }

        const nextDueAt = Math.min(...Array.from(this.pendingSiyuanConfirmTargets.values()).map(target => target.dueAt));
        const waitMs = Math.max(0, nextDueAt - Date.now());
        this.pendingSiyuanConfirmTimer = setTimeout(() => {
            void this.flushPendingSiyuanConfirmTargets();
        }, waitMs);
    }

    /**
     * 刷新待执行的确认检查。
     */
    private async flushPendingSiyuanConfirmTargets(): Promise<void> {
        if (this.pendingSiyuanConfirmTimer) {
            clearTimeout(this.pendingSiyuanConfirmTimer);
            this.pendingSiyuanConfirmTimer = null;
        }

        if (this.pendingSiyuanConfirmTargets.size === 0) {
            return;
        }

        const now = Date.now();
        const dueTargets = Array.from(this.pendingSiyuanConfirmTargets.values()).filter(target => target.dueAt <= now);
        if (dueTargets.length === 0) {
            this.schedulePendingSiyuanConfirmFlush();
            return;
        }

        this.cleanupPendingDidaUpdates();
        if (this.pendingDidaUpdates.size > 0 || Array.from(this.taskSyncLocks.values()).some(locked => locked)) {
            const nextUntil = this.pendingDidaUpdates.size > 0
                ? Math.min(...Array.from(this.pendingDidaUpdates.values()))
                : Date.now() + 1500;
            const waitMs = Math.max(500, nextUntil - Date.now() + 100);
            this.pendingSiyuanConfirmTimer = setTimeout(() => {
                void this.flushPendingSiyuanConfirmTargets();
            }, waitMs);
            return;
        }

        for (const target of dueTargets) {
            this.pendingSiyuanConfirmTargets.delete(`${target.blockId}::${target.itemID}`);
            try {
                const confirmed = await this.confirmSiyuanTaskToDida(target.blockId, target.itemID);
                if (!confirmed && target.attempts < 5) {
                    this.pendingSiyuanConfirmTargets.set(`${target.blockId}::${target.itemID}`, {
                        ...target,
                        attempts: target.attempts + 1,
                        dueAt: Date.now() + 2000,
                    });
                }
            } catch (error) {
                console.warn("执行思源->滴答确认检查失败", error);
                if (target.attempts < 5) {
                    this.pendingSiyuanConfirmTargets.set(`${target.blockId}::${target.itemID}`, {
                        ...target,
                        attempts: target.attempts + 1,
                        dueAt: Date.now() + 2000,
                    });
                }
            }
        }

        this.schedulePendingSiyuanConfirmFlush();
    }

    /**
     * 标记某个思源任务正处于“创建滴答任务并等待回写”的窗口期。
     */
    private markPendingSiyuanCreate(blockId: string, cooldownMs = 10000): void {
        if (!blockId) return;
        this.pendingSiyuanCreates.set(blockId, Date.now() + Math.max(1000, cooldownMs));
    }

    /**
     * 判断某个思源任务是否仍处于“创建中”窗口期。
     */
    private isPendingSiyuanCreate(blockId: string): boolean {
        const until = this.pendingSiyuanCreates.get(blockId);
        if (!until) return false;
        if (Date.now() > until) {
            this.pendingSiyuanCreates.delete(blockId);
            return false;
        }
        return true;
    }

    /**
     * 将思源变更目标加入待同步队列，并在短暂静默后统一刷快照。
     */
    private enqueueSiyuanSyncTarget(blockId: string, itemID: string, isDetached = false): void {
        if (!blockId || !itemID || isDetached) return;
        const key = `${blockId}::${itemID}`;
        const previous = this.pendingSiyuanTargets.get(key);
        this.pendingSiyuanTargets.set(key, {
            blockId,
            itemID,
            isDetached,
            attempts: previous ? previous.attempts : 0,
        });

        if (this.pendingSiyuanSyncTimer) {
            clearTimeout(this.pendingSiyuanSyncTimer);
        }
        this.pendingSiyuanSyncTimer = setTimeout(() => {
            void this.flushPendingSiyuanSyncTargets();
        }, 1200);
    }

    /**
     * 刷新待同步队列：统一读取一次思源快照，逐个同步队列中的任务。
     */
    private async flushPendingSiyuanSyncTargets(): Promise<void> {
        if (this.pendingSiyuanSyncTimer) {
            clearTimeout(this.pendingSiyuanSyncTimer);
            this.pendingSiyuanSyncTimer = null;
        }

        if (this.pendingSiyuanTargets.size === 0) {
            return;
        }

        if (this.isSyncing) {
            this.pendingSiyuanSyncTimer = setTimeout(() => {
                void this.flushPendingSiyuanSyncTargets();
            }, 1500);
            return;
        }

        const queue = Array.from(this.pendingSiyuanTargets.values());
        this.pendingSiyuanTargets.clear();

        if (!this.avId) {
            return;
        }

        try {
            // 去重依据是数据库 didaID 列：批次开始前先失效行缓存，确保读到用户最新改动。
            // 整批只失效一次，后续目标复用同一份快照。
            invalidateViewValueCache(this.avId ?? undefined);
            const viewData = await this.getAvViewData("刷新待同步思源队列");
            const allTasks = viewData.flatMap(view => view.data || []);
            const nextRound: typeof queue = [];

            for (const target of queue) {
                if (target.isDetached || !target.blockId || !target.itemID) {
                    continue;
                }

                const siyuanTask = allTasks.find((task: any) => task.事件?.itemID === target.itemID);
                if (!siyuanTask) {
                    if (target.attempts < 5) {
                        nextRound.push({ ...target, attempts: target.attempts + 1 });
                    }
                    continue;
                }

                console.debug("[滴答同步] 刷新待同步队列中的任务", {
                    blockId: target.blockId,
                    itemID: target.itemID,
                    attempts: target.attempts,
                });

                const syncResult = await this.syncSingleSiyuanTaskToDida(siyuanTask, target.blockId, target.itemID, viewData);
                if (syncResult.changed || !syncResult.ok) {
                    this.enqueueSiyuanConfirmTarget({ blockId: target.blockId, itemID: target.itemID }, 8000);
                }
            }

            if (nextRound.length > 0) {
                for (const target of nextRound) {
                    const key = `${target.blockId}::${target.itemID}`;
                    this.pendingSiyuanTargets.set(key, target);
                }
                this.pendingSiyuanSyncTimer = setTimeout(() => {
                    void this.flushPendingSiyuanSyncTargets();
                }, 1500);
            }
        } catch (error) {
            console.warn("刷新待同步思源队列失败，稍后重试", error);
            for (const target of queue) {
                const key = `${target.blockId}::${target.itemID}`;
                this.pendingSiyuanTargets.set(key, { ...target, attempts: target.attempts + 1 });
            }
            this.pendingSiyuanSyncTimer = setTimeout(() => {
                void this.flushPendingSiyuanSyncTargets();
            }, 2000);
        }
    }

    /**
     * 根据当前思源快照，确认并同步单条任务到滴答。
     * 用于延迟确认阶段：以思源为准，避免被滴答侧旧数据反写覆盖。
     */
    private async confirmSiyuanTaskToDida(blockId: string, itemID: string): Promise<boolean> {
        if (!this.avId) {
            showMessage("数据库ID未设置，无法进行确认同步", 5000, "error", "dida-sync");
            return false;
        }

        // 去重依据是数据库 didaID 列：确认前先失效行缓存，避免读到 5 秒内的旧值
        invalidateViewValueCache(this.avId ?? undefined);
        const viewData = await this.getAvViewData("确认思源任务同步到滴答");
        if (!viewData || !Array.isArray(viewData) || viewData.length === 0) {
            showMessage("无法获取数据库视图数据", 5000, "error", "dida-sync");
            return false;
        }
        const allTasks = viewData.flatMap(view => view.data || []);
        const siyuanTask = allTasks.find((task: any) => task.事件?.itemID === itemID);
        if (!siyuanTask) {
            console.debug("[滴答同步] 确认阶段未找到对应的思源任务", { blockId, itemID, totalTasks: allTasks.length });
            return false;
        }

        console.debug("[滴答同步] 进入思源优先的确认同步", {
            blockId,
            itemID,
            hasDidaID: !!this.readDidaTaskId(siyuanTask),
            title: siyuanTask.事件?.content,
            status: siyuanTask.状态?.content,
        });

        const result = await this.syncSingleSiyuanTaskToDida(siyuanTask, blockId, itemID, viewData);
        return result.ok;
    }

    /**
     * 将单条思源任务按当前快照同步到滴答。
     * 该方法是思源->滴答的唯一写入口，普通实时同步和延迟确认同步都走这里。
     */
    private syncSingleSiyuanTaskToDida(
        siyuanTask: any,
        blockId: string,
        itemID: string,
        viewData: any,
    ): Promise<{ ok: boolean; changed: boolean }> {
        return this.withBlockSyncFlight(blockId, async () => {
            try {
                // 队列里的目标可能已经过期：这一行现在绑着别的块（用户换了绑定块），
                // 或者这一行已经被解绑（游离）。拿旧目标继续处理，会把旧任务的去重键
                // 写进现在属于别的块的那一行，让新块白捡一个任务绑定。
                // 这里用内核接口按行反查当前绑定的块，与视图布局无关（视图里的
                // "事件.id" 在画廊/游离布局下会退化成行 ID，不能拿来判断归属）。
                // 查询失败同样按"不一致"处理：宁可这一轮不处理等下次重试，
                // 也不能把旧任务写进现在属于别的块的那一行。
                const rowBlockId = await this.resolveRowBlockId(itemID);
                if (rowBlockId !== blockId) {
                    console.info("[滴答同步] 同步目标与当前绑定不一致，本轮跳过", {
                        blockId,
                        rowBlockId: rowBlockId === null ? "(查询失败)" : (rowBlockId || "(该行未绑定块)"),
                        itemID,
                    });
                    return { ok: false, changed: false };
                }
                // 绑定判定只看数据库 didaID 列；待补写记录仅用于修复上次落盘失败的场景。
                // 记录以行 ID 为主键（换绑块后行 ID 不变），块 ID 只是兼容旧记录的兜底。
                const pendingWrite = this.pendingDidaIdWrites.get(itemID)
                    ?? this.pendingDidaIdWrites.get(blockId);
                // landed 表示去重键此前已成功落盘：此时列被清空是用户主动解绑，不应自动还原
                const pendingDidaId = pendingWrite && !pendingWrite.landed ? pendingWrite.didaTaskId : undefined;
                const binding = resolveDidaBinding(siyuanTask, pendingDidaId);
                let didaTaskId = binding.didaTaskId;
                if (binding.action === "repair" && pendingWrite) {
                    if (pendingWrite.attempts >= MAX_PENDING_DIDA_ID_WRITE_ATTEMPTS) {
                        // 补写已达重试上限：提示一次并把计数归零，这一行仍能自动恢复。
                        // 记录必须保留——它就是去重键，丢了下一轮就会重复创建远端任务。
                        console.warn("[滴答同步] didaID 列补写已达重试上限，本轮跳过处理以免重复创建", {
                            blockId,
                            didaTaskId: pendingWrite.didaTaskId,
                            attempts: pendingWrite.attempts,
                        });
                        this.armPendingWriteRetry(pendingWrite, "didaID 列补写多次失败，请检查数据库列与该行（插件会继续重试）");
                        return { ok: false, changed: false };
                    }
                    // 补写落盘前必须先核对绑定：
                    // 内核按行 ID 定位单元格，而这一行现在绑着的可能已经不是当初那块
                    // （例如用户把行里的绑定块换掉了）。此时把去重键写进来，
                    // 会让别的块白捡一个滴答任务绑定，原块反而丢了去重依据。
                    const target = await this.inspectPendingTarget(pendingWrite);
                    if (target.action === "skip") {
                        // 绑定查询失败：状态未知，本轮不动，等下一轮再核对
                        console.warn("[滴答同步] 无法确认待补写去重键的绑定行，本轮跳过处理以免重复创建", {
                            blockId,
                            itemID,
                        });
                        return { ok: false, changed: false };
                    }
                    let targetItemID = "";
                    if (target.action === "drop") {
                        // 绑定块已经不在数据库里：绑定确实失效，记录可以丢。
                        // 当前行没有去重键，按未绑定继续（走新建/回链核对流程）。
                        console.info("[滴答同步] 待补写去重键的绑定块已不在数据库，丢弃记录", {
                            blockId: pendingWrite.blockId,
                            itemID: pendingWrite.itemID,
                        });
                        this.forgetPendingDidaIdWrite(pendingWrite.itemID, pendingWrite.blockId);
                        didaTaskId = "";
                    } else if (target.action === "rekey" && target.boundItemId) {
                        // 块迁到别的行了：记录跟着迁过去，去重键要写到新行
                        console.info("[滴答同步] 待补写去重键的绑定块已迁到别的行，记录跟着迁移", {
                            blockId: pendingWrite.blockId,
                            fromItemID: pendingWrite.itemID,
                            toItemID: target.boundItemId,
                        });
                        this.rekeyPendingDidaIdWrite(pendingWrite, target.boundItemId);
                        pendingWrite.rowUnregistered = false;
                        this.persistPendingDidaIdWrites();
                        targetItemID = target.boundItemId;
                    } else if (target.action === "register") {
                        // 块已建出、行未登记：先补登记这一行，再写去重键
                        const registered = await this.ensureRowRegistered(pendingWrite.blockId, pendingWrite.itemID);
                        if (!registered) {
                            console.warn("[滴答同步] 待补写去重键的行登记失败，本轮跳过处理以免重复创建", {
                                blockId,
                                itemID,
                            });
                            return { ok: false, changed: false };
                        }
                        pendingWrite.rowUnregistered = false;
                        this.persistPendingDidaIdWrites();
                        targetItemID = pendingWrite.itemID;
                    } else {
                        targetItemID = pendingWrite.itemID;
                    }
                    if (targetItemID && targetItemID !== itemID) {
                        // 去重键属于别的行（块已经迁走）：当前行不是它的行，不能拿这个任务去覆盖当前行
                        didaTaskId = "";
                    } else if (targetItemID) {
                        // 目标行就是当前行：先补写落盘，避免重复创建滴答任务
                        // 补写同样带上视图数据与行对象，AV 键接口抖动时仍能定位 didaID 列
                        const repaired = await this.writeDidaTaskIdColumn(
                            pendingWrite.blockId,
                            targetItemID,
                            pendingWrite.didaTaskId,
                            viewData,
                            siyuanTask,
                        );
                        if (!repaired) {
                            console.warn("[滴答同步] didaID 列补写仍失败，跳过本轮处理以免重复创建", { blockId });
                            return { ok: false, changed: false };
                        }
                        console.info("[滴答同步] didaID 列已补写，跳过重复创建", {
                            blockId,
                            didaTaskId: pendingWrite.didaTaskId,
                        });
                    }
                }
                if (!didaTaskId) {
                    // 兼容旧版按块属性去重：数据库列还没有值时，先看块上是否留有旧版关联，
                    // 有则回填到列后再走更新流程，避免旧数据被当成新任务重复创建。
                    const legacyDidaId = await this.readLegacyBlockDidaId(blockId);
                    if (legacyDidaId) {
                        const bound = await this.writeDidaTaskIdColumn(
                            blockId,
                            itemID,
                            legacyDidaId,
                            viewData,
                            siyuanTask,
                        );
                        if (!bound) {
                            // 回写失败时已登记待补写，本轮不再创建，避免重复滴答任务
                            console.warn("[滴答同步] 旧版块属性关联回写失败，本轮跳过处理以免重复创建", {
                                blockId,
                                legacyDidaId,
                            });
                            return { ok: false, changed: false };
                        }
                        // 旧版块属性由 writeDidaTaskIdColumn 在写入成功后统一清理
                        console.info("[滴答同步] 已从旧版块属性恢复 didaID 关联", { blockId, legacyDidaId });
                        didaTaskId = legacyDidaId;
                    }
                }
                if (!didaTaskId) {
                    // 创建意图核对：上一轮登记过"正在创建"（远端可能已建成、只是响应丢了），
                    // 必须先到远端核对，确认确实没有同源任务才能再建，否则会重复创建远端任务。
                    const intent = this.findCreatingIntent(itemID, blockId);
                    if (intent) {
                        const probe = await this.findRemoteTaskBySiyuanBlock(blockId, true);
                        if (!probe.verified) {
                            // 远端列表核对不了：不能确定上一轮是否已建成，本轮不创建
                            console.warn("[滴答同步] 无法核对远端任务列表，本轮跳过创建以免重复", { blockId });
                            return { ok: false, changed: false };
                        }
                        if (probe.task) {
                            // 远端其实已经建好了：复用它并把去重键补回列
                            const bound = await this.writeDidaTaskIdColumn(
                                blockId,
                                itemID,
                                probe.task.id,
                                viewData,
                                siyuanTask,
                            );
                            if (!bound) {
                                console.warn("[滴答同步] 同源滴答任务的去重键回写失败，本轮跳过处理以免重复创建", {
                                    blockId,
                                    didaTaskId: probe.task.id,
                                });
                                return { ok: false, changed: false };
                            }
                            this.forgetPendingDidaIdWrite(itemID, blockId);
                            console.info("[滴答同步] 远端已存在同源滴答任务，复用它而不是新建", {
                                blockId,
                                didaTaskId: probe.task.id,
                            });
                            didaTaskId = probe.task.id;
                        } else {
                            // 确认远端没有同源任务：上一轮确实没建成，清掉意图，正常创建
                            this.forgetPendingDidaIdWrite(itemID, blockId);
                        }
                    }
                }
                if (!didaTaskId) {
                    // 去重键可能曾经写丢（回写失败、进程崩溃、创建响应丢失）：
                    // 远端任务标题里的 [S] 回链是"这一行曾经绑定过该任务"的证据，
                    // 找到就复用它并把去重键补回列，绝不新建第二个远端任务。
                    const probe = await this.findRemoteTaskBySiyuanBlock(blockId);
                    if (!probe.verified) {
                        // 远端列表核对不到（拉取失败或缓存不可信）："没有匹配"不等于"远端没有"，
                        // 本轮不创建，等下一次能核对上再处理，避免重复滴答任务。
                        console.warn("[滴答同步] 无法核对远端任务列表，本轮跳过创建以免重复", { blockId });
                        return { ok: false, changed: false };
                    }
                    const sameSourceTask = probe.task;
                    if (sameSourceTask) {
                        const bound = await this.writeDidaTaskIdColumn(
                            blockId,
                            itemID,
                            sameSourceTask.id,
                            viewData,
                            siyuanTask,
                        );
                        if (!bound) {
                            console.warn("[滴答同步] 同源滴答任务的去重键回写失败，本轮跳过处理以免重复创建", {
                                blockId,
                                didaTaskId: sameSourceTask.id,
                            });
                            return { ok: false, changed: false };
                        }
                        console.info("[滴答同步] 复用标题中已含本块回链的滴答任务，避免重复创建", {
                            blockId,
                            didaTaskId: sameSourceTask.id,
                        });
                        didaTaskId = sameSourceTask.id;
                    }
                }
                if (didaTaskId) {
                    let cachedTask = this.taskCache.get(didaTaskId);
                    if (!cachedTask) {
                        console.warn(`任务 ${didaTaskId} 不在缓存中，尝试刷新后同步。`);
                        await this.getAllTasks();
                        cachedTask = this.taskCache.get(didaTaskId);

                        // 已完成任务不在未完成项目的 getAllTasks() 结果中；补充查询后再判定
                        if (!cachedTask) {
                            const completedTasks = await this.listCompletedTasks(this.getCompletedTaskQuery());
                            for (const task of completedTasks) {
                                if (task.id) this.taskCache.set(task.id, task);
                            }
                            // 未完成 + 已完成都拿到了：缓存恢复成完整快照
                            this.taskCacheComplete = true;
                            cachedTask = this.taskCache.get(didaTaskId);
                        }

                        if (!cachedTask) {
                            console.info("[滴答同步] 远端任务不存在，跳过反向同步", {
                                didaTaskId,
                                blockId,
                                status: siyuanTask.状态?.content,
                            });
                            return { ok: true, changed: false };
                        }
                    }

                    const currentProjectId = cachedTask.projectId;
                    const updatePayload = buildDidaTaskUpdatePayload(
                        siyuanTask,
                        blockId,
                        cachedTask,
                        (settingdata as any)["cal-dida-default-reminders"],
                    );

                    if (!hasDidaTaskChanged(updatePayload, cachedTask)) {
                        console.debug("[滴答同步] 思源任务与滴答缓存无差异，跳过写回", {
                            blockId,
                            didaTaskId,
                        });
                        return { ok: true, changed: false };
                    }

                    if (this.taskSyncLocks.get(didaTaskId)) {
                        console.debug("[滴答同步] 目标任务正在写入中，跳过本轮写回等待后续确认", {
                            blockId,
                            didaTaskId,
                        });
                        return { ok: false, changed: false };
                    }

                    console.debug("[滴答同步] 即将写回滴答任务", {
                        blockId,
                        didaTaskId,
                        projectId: currentProjectId,
                        payload: updatePayload,
                    });

                    this.taskSyncLocks.set(didaTaskId, true);
                    try {
                        await this.apiClient.updateTask(didaTaskId, {
                            ...updatePayload,
                            id: didaTaskId,
                            projectId: updatePayload.projectId || currentProjectId,
                        });

                        // 仅在远端更新成功后才写入冷却与本地缓存，避免失败请求阻塞后续同步
                        this.markPendingDidaUpdate(didaTaskId);
                        Object.assign(cachedTask, updatePayload);
                        if (updatePayload.projectId) cachedTask.projectId = updatePayload.projectId;

                        this.lastModifiedTime.set(didaTaskId, Date.now());
                        this.lastSyncDirection.set(didaTaskId, 'siyuan-to-dida');

                        console.debug(`思源任务 [${blockId}] 的变更已同步到滴答任务 [${didaTaskId}]`);
                        showStatusMessage("滴答任务已更新", 2000);
                        return { ok: true, changed: true };
                    } finally {
                        this.taskSyncLocks.set(didaTaskId, false);
                    }
                }

                if (this.creatingDidaIds.has(blockId) || this.isPendingSiyuanCreate(blockId)) {
                    console.warn(`任务 [${blockId}] 正在创建中或处于创建冷却期，跳过重复创建。`);
                    return { ok: false, changed: false };
                }

                if (!itemID) {
                    // 没有行 ID 就无法把去重键写回 didaID 列：远端任务一旦创建成功，
                    // 下一轮就找不到去重依据，必然重复创建。这里宁可不同步也不制造重复。
                    console.error("[滴答同步] 数据库行缺少行 ID，无法持久化去重键，跳过创建", { blockId });
                    showMessage("数据库行缺少行 ID，已跳过创建滴答任务以避免重复", 10000, "error", "dida-sync-critical");
                    return { ok: false, changed: false };
                }

                this.creatingDidaIds.add(blockId);
                try {
                    // 创建前重新读一次数据库行，确认 didaID 列确实为空，防止并发写入后重复创建
                    const freshDidaId = await this.readLatestDidaIdFromDatabase(itemID, blockId);
                    if (freshDidaId === null) {
                        console.warn(`任务 [${blockId}] 无法复核数据库 didaID 列，跳过创建以免重复。`);
                        return { ok: false, changed: false };
                    }
                    if (freshDidaId) {
                        console.debug(`任务 [${blockId}] 已有绑定滴答 ID [${freshDidaId}]，跳过创建。`);
                        return { ok: true, changed: false };
                    }

                    const targetProjectId = this.todoListId;
                    if (!targetProjectId) {
                        showMessage("无法创建任务：未设置默认的未完成清单ID。", 5000, "error", "dida-sync");
                        return { ok: false, changed: false };
                    }

                    const taskTitle = siyuanTask.事件?.content || "新建任务";
                    console.debug(`检测到新的思源任务 [${taskTitle}]，正在创建滴答任务...`);

                    const createTaskPayload: Omit<Task, 'id' | 'status' | 'completedTime'> & { projectId: string } = {
                        projectId: targetProjectId,
                        title: `${removeDidaLinks(taskTitle)} [S](siyuan://blocks/${blockId})`,
                        content: siyuanTask.描述?.content || undefined,
                        priority: siyuanTask.优先级?.content ? { "无": 0, "低": 1, "中": 3, "高": 5 }[siyuanTask.优先级.content] : 0,
                        startDate: siyuanTask.开始时间?.start ? formatDateToISO(siyuanTask.开始时间.start) : undefined,
                        dueDate: siyuanTask.开始时间?.end ? formatDateToISO(siyuanTask.开始时间.end) : undefined,
                        reminders: (() => {
                            try {
                                const raw = (settingdata as any)["cal-dida-default-reminders"];
                                const arr = parseDidaReminders(raw);
                                return arr.length ? arr : undefined;
                            } catch {
                                return undefined;
                            }
                        })(),
                        tags: (() => {
                            const normalTags = (siyuanTask.标签?.content || [])
                                .map((item: any) => typeof item === "string" ? item : item?.content)
                                .filter((tag: unknown): tag is string => typeof tag === "string" && tag.length > 0 && !["完成", "进行中", "未完成", "归档"].includes(tag));
                            const status = siyuanTask.状态?.content;
                            const statusTag = status === '进行中' ? '进行中' : status === '归档' ? '归档' : null;
                            return statusTag ? [...normalTags, statusTag] : normalTags;
                        })(),
                    };

                    console.debug("[滴答同步] 即将创建滴答任务", {
                        blockId,
                        itemID,
                        targetProjectId,
                        payload: createTaskPayload,
                    });

                    // 创建前最后一道核对：常规探测只看得到保留窗口内的已完成任务，
                    // 窗口外的旧任务会被漏掉。这里按更宽的时间窗再查一次，
                    // 找到同源任务就复用它，绝不给同一块建第二个滴答任务。
                    const deepProbe = await this.findRemoteTaskBySiyuanBlockDeep(blockId);
                    if (!deepProbe.verified) {
                        // 宽窗口核对不了：不能确定保留窗口之外没有同源任务，本轮不创建。
                        // 否则一次网络抖动就会给同一块建出第二个远端任务。
                        console.warn("[滴答同步] 无法核对保留窗口外的同源任务，本轮跳过创建以免重复", { blockId });
                        return { ok: false, changed: false };
                    }
                    const deepTask = deepProbe.task;
                    if (deepTask) {
                        const bound = await this.writeDidaTaskIdColumn(
                            blockId,
                            itemID,
                            deepTask.id,
                            viewData,
                            siyuanTask,
                        );
                        if (!bound) {
                            console.warn("[滴答同步] 同源滴答任务的去重键回写失败，本轮跳过处理以免重复创建", {
                                blockId,
                                didaTaskId: deepTask.id,
                            });
                            return { ok: false, changed: false };
                        }
                        console.info("[滴答同步] 复用保留窗口外的同源滴答任务，避免重复创建", {
                            blockId,
                            didaTaskId: deepTask.id,
                        });
                        return { ok: true, changed: false };
                    }

                    // 先登记"创建意图"并落盘：远端任务一旦建成，若响应丢失或进程崩溃，
                    // 本地没有任务 ID 可记；凭这条记录下一轮能到远端核对是否已建，避免重复创建。
                    // 这里必须等落盘完成再发起创建：否则进程恰好在 createTask 之后崩溃时，
                    // 意图可能还没写进存储，重复创建就无从判断。
                    await this.rememberCreatingIntent(blockId, itemID);

                    const newDidaTask = await this.apiClient.createTask(createTaskPayload);

                    if (newDidaTask && newDidaTask.id) {
                        // createTask 返回 ID 后立即记录关联与创建冷却，避免后续失败误阻断重试或引发重复创建
                        this.markPendingSiyuanCreate(blockId);
                        // 创建意图已拿到真实任务 ID：补全记录，后续去重键写入失败时按普通待补写处理
                        this.rememberPendingDidaIdWrite(blockId, itemID, newDidaTask.id);
                        this.taskCache.set(newDidaTask.id, newDidaTask);
                        this.lastModifiedTime.set(newDidaTask.id, Date.now());
                        this.lastSyncDirection.set(newDidaTask.id, 'siyuan-to-dida');
                        this.markPendingDidaUpdate(newDidaTask.id);

                        // 去重键必须先于其它可能失败的操作落盘：
                        // 远端任务已创建，一旦后续步骤失败却没有去重键，下一轮会重复创建滴答任务。
                        const didaIdWritten = await this.writeDidaTaskIdColumn(
                            blockId,
                            itemID,
                            newDidaTask.id,
                            viewData,
                            siyuanTask,
                        );
                        if (!didaIdWritten) {
                            showMessage("滴答任务已创建，但 didaID 回写失败，可能产生重复任务，请检查数据库列", 10000, "error", "dida-sync-critical");
                        }

                        if (siyuanTask.状态?.content === '完成') {
                            await this.apiClient.completeTask(newDidaTask.projectId, newDidaTask.id);
                            newDidaTask.status = 2;
                            newDidaTask.completedTime = formatDateForDida(Date.now());
                        }

                        // 链接列单独写，失败不影响去重
                        const linkKeyID = await this.getKeyIDfromViewValue(viewData, '链接');
                        if (linkKeyID) {
                            const didaLink = `https://dida365.com/webapp/#p/${targetProjectId}/tasks/${newDidaTask.id}`;
                            try {
                                await this.withDidaTagged(async () => {
                                    await updateAttrViewCell_pro(blockId, this.avId, linkKeyID, itemID, didaLink, "url");
                                });
                            } catch (error) {
                                console.warn("[滴答同步] 写回滴答任务链接失败", { blockId, didaTaskId: newDidaTask.id }, error);
                            }
                        } else {
                            console.error("无法找到 '链接' 字段的 KeyID，无法写回滴答任务链接。");
                            showMessage("无法写回滴答任务链接，请检查数据库是否有名为 '链接' 的列", 5000, "error", "dida-sync");
                        }

                        console.debug(`新思源任务 [${blockId}] 已同步到滴答，ID为 [${newDidaTask.id}]，ID 与链接已回写`);
                        showStatusMessage("新任务已同步到滴答清单", 2000);
                        return { ok: true, changed: true };
                    }

                    return { ok: false, changed: false };
                } finally {
                    this.creatingDidaIds.delete(blockId);
                }
            } catch (error) {
                console.error("从思源同步到滴答失败:", error);
                return { ok: false, changed: false };
            }
        });
    }

    async syncTasksToSiyuan(): Promise<boolean> {
    this.isSyncing = true; // 开始同步，锁定，WS 监听将跳过
        showStatusMessage("正在同步滴答清单任务，请稍候...", 10000, "dida-sync");
        try {
            // 获取滴答清单的所有任务
            let didaTasks: Task[] = [];
            let isOnline = true;

            try {
                const activeTasks = await this.getAllTasks();
                const completedTasks = await this.listCompletedTasks(this.getCompletedTaskQuery());
                const previousCache = new Map(this.taskCache);
                for (const task of completedTasks) {
                    if (!task.id) continue;
                    if (this.isPendingDidaUpdate(task.id) && previousCache.has(task.id)) {
                        this.taskCache.set(task.id, previousCache.get(task.id)!);
                    } else {
                        this.taskCache.set(task.id, task);
                    }
                }
                const allTasks = [...activeTasks, ...completedTasks];
                const taskMap = new Map<string, Task>();
                for (const task of allTasks) {
                    if (task.id) {
                        taskMap.set(task.id, task);
                    }
                }
                didaTasks = Array.from(taskMap.values());
                // 未完成 + 已完成都拿到了：这是一次完整快照，可以用来判断"远端确实没有同源任务"
                this.taskCacheComplete = true;
                // console.debug("❤️❤️❤️❤️❤️")
            } catch (error) {
                // console.debug("💩💩💩💩💩");
                console.error("获取滴答清单任务失败，可能网络断开:", error);
                isOnline = false;
                // 缓存不完整（已完成任务可能没拿到），不能拿它当"远端确实没有同源任务"的依据
                this.taskCacheComplete = false;
                // 断网时使用缓存数据
                didaTasks = Array.from(this.taskCache.values());
                showMessage("网络连接异常，使用缓存数据进行同步（不会执行归档操作）", 5000, "error", "dida-sync");
            }

            // 获取思源数据库的现有数据
            if (!this.avId) {
                showMessage("数据库ID未设置，无法同步", 5000, "error", "dida-sync");
                return false;
            }

            // 每轮同步刷新数据库列信息
            this.avColumnKeyIds = null;

            // 每轮同步先失效行缓存再读取视图数据：
            // 滴答库不在 getManagedCalendarAvIds() 内，用户在思源里手动改 didaID 列不会触发
            // 缓存失效，5 秒 TTL 内会读到旧值，导致重复建块。
            invalidateViewValueCache(this.avId ?? undefined);

            const viewValue = await this.getAvViewData("同步任务到思源");

            if (!viewValue || !Array.isArray(viewValue) || viewValue.length === 0) {
                showMessage("无法获取数据库视图数据", 5000, "error", "dida-sync");
                return false;
            }

            // 遍历所有 viewValue，合并所有任务数据
            const existingTasks = viewValue.flatMap(view => view.data || []);

            // 按块 ID 索引现有行：回链兜底要用
            const existingTasksByBlockId = new Map<string, any>();
            // 按行 ID 索引现有行：去重键是行属性，换绑块后行 ID 不变，补偿与去重判定都用它
            const existingTasksByItemId = new Map<string, any>();
            for (const task of existingTasks) {
                const blockId = task.事件?.id;
                if (typeof blockId === 'string' && blockId) {
                    existingTasksByBlockId.set(blockId, task);
                }
                const itemID = task.事件?.itemID;
                if (typeof itemID === 'string' && itemID) {
                    existingTasksByItemId.set(itemID, task);
                }
            }

            // 去重依据是数据库 didaID 列，列缺失时无法定位已有任务，直接中止以免重复建块
            const didaIdKeyID = await this.resolveColumnKeyID('didaID', viewValue);
            if (!didaIdKeyID) {
                showMessage("数据库缺少 'didaID' 列，无法去重，已取消本轮同步。请在数据库中添加名为 'didaID' 的文本列", 10000, "error", "dida-sync-critical");
                return false;
            }

            // 补写上一轮未能落盘的 didaID 列
            // 补偿写入会就地更新行对象（patchViewValueRow），所以放在建立映射表之前：
            // 本轮补写成功的绑定也能立即被后面的去重判定看到。
            await this.flushPendingDidaIdWrites(existingTasksByItemId, viewValue);

            // 创建现有任务的映射表：去重依据为数据库 didaID 列
            const existingTasksMap = new Map<string, any>();
            for (const task of existingTasks) {
                const didaTaskId = task.didaID?.content || "";
                if (didaTaskId) {
                    existingTasksMap.set(didaTaskId, task);
                }
            }

            // 迁移：旧版本把关联写在块属性上，这里回填到数据库 didaID 列，避免重复建块
            const migrated = await this.migrateLegacyBlockDidaIds(viewValue, existingTasks, existingTasksMap);
            if (!migrated) {
                showMessage("旧版滴答关联回填不完整，已取消本轮同步以免重复建块", 10000, "error", "dida-sync-critical");
                return false;
            }

            let syncCount = 0;
            let updateCount = 0;
            let archiveCount = 0;

            // 创建滴答清单任务ID的集合，用于后续检查归档
            const didaTaskIds = new Set(didaTasks.map(task => task.id).filter(Boolean));

            // 处理每个滴答清单任务
            for (const didaTask of didaTasks) {
                if (!didaTask.id) continue;

                // 若该任务刚由思源侧更新且尚未在滴答确认，跳过以避免覆盖
                if (this.isPendingDidaUpdate(didaTask.id)) {
                    console.debug(`任务 [${didaTask.id}] 处于本地更新冷却期，跳过本次同步`);
                    continue;
                }

                // 检查任务是否被锁定（正在同步中）
                if (this.taskSyncLocks.get(didaTask.id)) {
                    console.debug(`任务 [${didaTask.id}] 正在同步中，跳过本次更新`);
                    continue;
                }

                let existingTask = existingTasksMap.get(didaTask.id);
                if (!existingTask) {
                    // 去重键尚未落盘时不能建块，否则同一滴答任务会出现重复块。
                    // 记录以行 ID 为主键，这里按行 ID 定位对应行（换绑块后行 ID 不变）。
                    const pendingBinds = this.findPendingDidaIdWritesByTaskId(didaTask.id);
                    if (pendingBinds.length > 0) {
                        let blocked = false;
                        for (const pendingBind of pendingBinds) {
                            const pendingRow = pendingBind.itemID
                                ? existingTasksByItemId.get(pendingBind.itemID)
                                : undefined;
                            const currentDidaId = pendingRow ? this.readDidaTaskId(pendingRow) : null;
                            const action = resolvePendingDidaIdWriteAction(
                                pendingBind,
                                currentDidaId,
                                MAX_PENDING_DIDA_ID_WRITE_ATTEMPTS,
                            );
                            if (action === "drop") {
                                if (currentDidaId === didaTask.id && pendingRow) {
                                    // 行已绑定到该滴答任务：按已存在处理，避免重复建块
                                    existingTask = pendingRow;
                                    existingTasksMap.set(didaTask.id, pendingRow);
                                } else {
                                    // 已改绑 / 已落盘 / 用户手动清空：记录失效，丢弃
                                    this.forgetPendingDidaIdWrite(pendingBind.itemID, pendingBind.blockId);
                                }
                                continue;
                            }
                            // unknown / block / compensate：去重键尚未可靠落盘，本轮不建块
                            blocked = true;
                        }
                        if (blocked) {
                            console.warn("[滴答同步] 该滴答任务的 didaID 尚未落盘，本轮跳过建块以免重复", {
                                didaTaskId: didaTask.id,
                            });
                            continue;
                        }
                    }

                    const backlinkBlockId = extractSiyuanBlockIdFromDidaTitle(didaTask.title);
                    const fallbackTask = backlinkBlockId ? existingTasksByBlockId.get(backlinkBlockId) : undefined;
                    if (fallbackTask && !existingTask) {
                        // 兼容旧版按块属性去重：列里没有值时，看块上是否留有旧版关联
                        const boundDidaId = fallbackTask.didaID?.content
                            || await this.readLegacyBlockDidaId(backlinkBlockId);
                        if (!boundDidaId || boundDidaId === didaTask.id) {
                            existingTask = fallbackTask;
                            existingTasksMap.set(didaTask.id, fallbackTask);
                            await this.writeDidaTaskIdColumn(
                                backlinkBlockId,
                                fallbackTask.事件?.itemID || "",
                                didaTask.id,
                                viewValue,
                                fallbackTask,
                            );
                            console.info("[滴答同步] 通过 [S] 回链补全数据库 didaID 关联，避免重复建块", {
                                blockId: backlinkBlockId,
                                didaTaskId: didaTask.id,
                            });
                        }
                    }
                }

                if (existingTask) {
                    // 更新现有任务 - 添加时间戳检查
                    const lastModified = this.lastModifiedTime.get(didaTask.id);
                    const lastDirection = this.lastSyncDirection.get(didaTask.id);
                    const now = Date.now();
                    const cooldownMs = this.getDidaUpdateCooldownMs();
                    
                    // 如果最近冷却期内刚从思源同步到滴答，跳过反向同步以避免覆盖
                    if (lastModified && lastDirection === 'siyuan-to-dida' && (now - lastModified) < cooldownMs) {
                        console.debug(`任务 [${didaTask.id}] 刚从思源同步到滴答（${now - lastModified}ms前），跳过反向同步`);
                        continue;
                    }
                    
                    const taskData = mapDidaTaskToSiyuan(didaTask, existingTask);

                    // 比较任务数据，仅在有变化时更新
                    if (hasSiyuanTaskChanged(taskData, existingTask)) {
                        await this.updateSiyuanTask(existingTask, taskData);
                        // 更新时间戳和方向
                        this.lastModifiedTime.set(didaTask.id, Date.now());
                        this.lastSyncDirection.set(didaTask.id, 'dida-to-siyuan');
                        updateCount++;
                    }
                } else {
                    // 创建新任务
                    const taskData = mapDidaTaskToSiyuan(didaTask, existingTask);
                    await this.createSiyuanTask(taskData);
                    // 更新时间戳和方向
                    if (didaTask.id) {
                        this.lastModifiedTime.set(didaTask.id, Date.now());
                        this.lastSyncDirection.set(didaTask.id, 'dida-to-siyuan');
                    }
                    syncCount++;
                }
            }

            // 只有在网络正常时才执行归档操作
            if (isOnline) {
                // 检查思源中存在但滴答清单中不存在的任务，将其状态设置为"归档"
                const tasksToArchive = [];
                for (const [didaId, existingTask] of existingTasksMap) {
                    if (!didaTaskIds.has(didaId) && existingTask.状态?.content !== "归档" && existingTask.状态?.content !== "完成") {
                        tasksToArchive.push(existingTask);
                    }
                }

                if (tasksToArchive.length > 0) {
                    archiveCount = await this.archiveSiyuanTasksBatch(tasksToArchive);
                    console.debug(`批量归档了 ${archiveCount} 个任务`);
                }
            } else {
                console.debug("网络异常，跳过归档检查以避免误操作");
            }

            const statusMessage = isOnline
                ? (archiveCount > 0
                    ? `同步完成：新建 ${syncCount} 个任务，更新 ${updateCount} 个任务，归档 ${archiveCount} 个任务`
                    : `同步完成：新建 ${syncCount} 个任务，更新 ${updateCount} 个任务`)
                : `离线同步完成：新建 ${syncCount} 个任务，更新 ${updateCount} 个任务（未执行归档检查）`;

            if (syncCount > 0 || updateCount > 0 || archiveCount > 0) {
                showStatusMessage(statusMessage, 3000, "dida-sync");
                return true;
            } else {
                showStatusMessage(isOnline ? "没有需要同步的任务" : "没有需要同步的任务（离线模式）", -1, "dida-sync");
                return false;
            }
        } catch (error) {
            console.error("同步滴答清单任务失败:", error);
            showMessage("同步失败：" + (error instanceof Error ? error.message : String(error)), 10000, "error", "dida-sync-critical");
        } finally {
            // 同步刚结束时内核 ws-main / 网络回声可能延后几十到数百毫秒到达，留出短暂抑制窗口避免回环
            this.syncEchoSuppressUntil = Date.now() + 2500;
            this.isSyncing = false; // 同步结束，解锁
        }
    }

    /**
     * 比较新旧任务数据是否有变化
     */
    private async createSiyuanTask(taskData: any): Promise<void> {
        try {
            if (!this.avId) {
                console.error("数据库ID未设置");
                return;
            }

            // 创建一个新的块
            const blockId = await generateSiyuanID() as string;
            const itemID = await generateSiyuanID() as string;
            const titleBlockId = await generateSiyuanID() as string;
            const descriptionBlockId = await generateSiyuanID() as string;
            // 根据配置确定创建位置
            let targetId;
            if (settingdata["cal-create-for-date"]) {
                // 创建到日记中
                const today = new Date();
                targetId = await this.createDailynote(settingdata["cal-create-pos"], today);
            } else {
                // 创建到指定位置
                targetId = (await createDailyNoteForDate(settingdata["cal-create-pos"])) || "";
            }

            if (!targetId) {
                console.error("无法确定创建位置");
                return;
            }

            // 创建块内容
            const statusCustomAttr = getDidaStatusAttr(taskData.状态?.content);
            const template = String((settingdata as any)["cal-dida-import-template"] || '').trim() || getDefaultDidaImportTemplate();
            const templateData = buildDidaImportTemplateData(taskData, blockId, itemID, titleBlockId, descriptionBlockId);
            const renderedBody = renderDidaTemplate(template, templateData).trim() || renderDidaTemplate(getDefaultDidaImportTemplate(), templateData).trim();

            // 块还没建出来之前，先把去重依据登记并落盘。
            // 块一旦建出，后续任何一步失败（加入数据库、回写去重键）都能靠它兜住，
            // 下一轮不会为同一个滴答任务再建一个块。
            const newDidaTaskId = taskData.didaID?.content || "";
            if (newDidaTaskId) {
                await this.seedPendingDidaIdWrite(blockId, itemID, newDidaTaskId);
            }

            try {
                await appendBlock(
                    "markdown",
                    createScheduleBlockquoteMarkdown(renderedBody, {
                        id: blockId,
                        'custom-st-event': statusCustomAttr,
                    }),
                    targetId
                );
            } catch (error) {
                // 块可能已在内核建出（响应超时/丢失）：先确认块在不在。
                // 块还在就继续往下走登记与回写，不留孤儿块；块确实没建出来才作废刚登记的依据。
                console.warn("[滴答同步] 新建块失败，检查块是否已建出", { blockId }, error);
                const blockAlive = await this.isBlockAlive(blockId);
                if (!blockAlive) {
                    if (newDidaTaskId) this.forgetPendingDidaIdWrite(itemID, blockId);
                    throw error;
                }
                // 块已在内核建出：标记"行未登记"，若登记也失败则由补偿流程补登记并补写去重键
                this.markPendingDidaIdWriteRowUnregistered(blockId, itemID);
            }

            // 添加到数据库
            try {
                await this.withDidaTagged(async () => {
                    await addBlockToDatabase_pro(blockId, this.avId!, itemID);
                });
            } catch (error) {
                console.warn("[滴答同步] 新建块加入数据库失败，尝试补登记", { blockId, itemID }, error);
                // 请求可能已在内核生效（响应丢失），也可能确实没登记：按绑定行核对后再决定。
                const registered = await this.ensureRowRegistered(blockId, itemID);
                if (!registered) {
                    // 行仍缺失：标记待补写，由补偿流程再补登记一次；
                    // 本轮到此为止——行都没建好，后面的字段写入无处可落。
                    this.markPendingDidaIdWriteRowUnregistered(blockId, itemID);
                    showMessage("滴答任务对应的思源行登记失败，已暂缓本轮同步以免重复建块", 10000, "error", "dida-sync-critical");
                    return;
                }
            }

            // 去重键必须先于其它可能失败的操作落盘：
            // 行已建好，一旦后续步骤失败却没有去重键，下一轮会为同一滴答任务重复建块。
            // 这里不依赖视图数据，列信息本身就足以定位 didaID 列。
            if (newDidaTaskId) {
                const didaIdWritten = await this.writeDidaTaskIdColumn(blockId, itemID, newDidaTaskId);
                if (!didaIdWritten) {
                    console.warn("[滴答同步] 新建思源行的 didaID 回写失败，已登记待补写", { blockId });
                }
            }

            // 获取 viewValue 用于获取 keyID
            const viewValue = await this.getAvViewData("创建思源任务");

            // 更新各个字段
            await this.withDidaTagged(async () => {
                await this.updateTaskFields(blockId, taskData, viewValue, itemID);
            });

            // 同步更新滴答清单任务，为其添加 S 链接
            if (taskData.didaID?.content) {
                try {
                    const didaTaskId = taskData.didaID.content;
                    const cachedTask = this.taskCache.get(didaTaskId);
                    if (cachedTask) {
                        // 获取原始标题（移除可能已存在的链接）
                        const originalTitle = removeDidaLinks(cachedTask.title || "");
                        const titleWithSLink = `${originalTitle} [S](siyuan://blocks/${blockId})`;

                        // 更新滴答清单任务，添加 S 链接
                        this.markPendingDidaUpdate(didaTaskId);
                        await this.apiClient.updateTask(didaTaskId, {
                            id: didaTaskId,
                            projectId: cachedTask.projectId,
                            title: titleWithSLink
                        });

                        // 更新缓存中的任务标题
                        cachedTask.title = titleWithSLink;

                        console.debug(`滴答任务 [${didaTaskId}] 已更新 S 链接`);
                    }
                } catch (error) {
                    console.warn("更新滴答任务 S 链接失败:", error);
                }
            }

            console.debug("成功创建新任务:", taskData.事件?.content);

        } catch (error) {
            console.error("创建思源任务失败:", error);
            throw error;
        }
    }

    /**
     * 更新思源笔记任务
     */
    private async updateSiyuanTask(existingTask: any, newTaskData: any): Promise<void> {
        try {
            if (!this.avId || !existingTask.事件?.id) {
                console.error("缺少必要的ID信息");
                return;
            }

            const blockId = existingTask.事件.id;
            const itemID = existingTask.事件.itemID;
            // 获取 viewValue 用于获取 keyID
            const viewValue = await this.getAvViewData("更新思源任务");

            // 更新各个字段
            await this.withDidaTagged(async () => {
                await this.updateTaskFields(blockId, newTaskData, viewValue, itemID, existingTask);
            });

            // 更新块的自定义属性（状态）
            const statusCustomAttr = getDidaStatusAttr(newTaskData.状态?.content);
            await setBlockAttrs(blockId, {
                "custom-st-event": statusCustomAttr,
            });

            // 同步更新滴答清单任务，确保其有正确的 S 链接
            if (newTaskData.didaID?.content) {
                try {
                    const didaTaskId = newTaskData.didaID.content;
                    const cachedTask = this.taskCache.get(didaTaskId);
                    if (cachedTask) {
                        // 获取原始标题（移除可能已存在的链接）
                        const originalTitle = removeDidaLinks(newTaskData.事件?.content || "");
                        const titleWithSLink = `${originalTitle} [S](siyuan://blocks/${blockId})`;

                        // 检查滴答任务标题是否需要更新
                        if (cachedTask.title !== titleWithSLink) {
                            this.markPendingDidaUpdate(didaTaskId);
                            await this.apiClient.updateTask(didaTaskId, {
                                id: didaTaskId,
                                projectId: cachedTask.projectId,
                                title: titleWithSLink
                            });

                            // 更新缓存中的任务标题
                            cachedTask.title = titleWithSLink;

                            console.debug(`滴答任务 [${didaTaskId}] 已更新 S 链接`);
                        }
                    }
                } catch (error) {
                    console.warn("更新滴答任务 S 链接失败:", error);
                }
            }

            console.debug("成功更新任务:", newTaskData.事件?.content);

        } catch (error) {
            console.error("更新思源任务失败:", error);
            throw error;
        }
    }

    /**
     * 批量将思源任务设置为归档状态
     */
    private async archiveSiyuanTasksBatch(tasksToArchive: any[]): Promise<number> {
        if (tasksToArchive.length === 0) {
            return 0;
        }

        try {
            if (!this.avId) {
                console.error("数据库ID未设置，无法批量归档任务");
                return 0;
            }

            // 获取 viewValue 用于获取 keyID
            const viewValue = await this.getAvViewData("批量归档任务");

            // 获取状态字段的 keyID
            const statusKeyID = await this.getKeyIDfromViewValue(viewValue, '状态');

            if (!statusKeyID) {
                console.error("无法找到状态字段的 keyID，无法批量归档任务");
                return 0;
            }

            // 批量更新：收集所有需要更新的任务
            const updatePromises: Promise<any>[] = [];
            const blockAttrPromises: Promise<any>[] = [];
            let successCount = 0;

            for (const task of tasksToArchive) {
                if (!task.事件?.id) {
                    console.warn(`任务缺少事件ID，跳过归档: ${task.事件?.content}`);
                    continue;
                }

                const blockId = task.事件.id;
                const itemID = task.事件.itemID;
                // 更新状态为"归档"
                const statusData = [{ content: "归档" }];
                updatePromises.push(
                    updateAttrViewCell_pro(
                        blockId,
                        this.avId,
                        statusKeyID,
                        itemID,
                        statusData,
                        "select"
                    ).then(() => {
                        successCount++;
                        console.debug(`任务 [${task.事件?.content}] 已设置为归档状态`);
                    }).catch(error => {
                        console.error(`更新任务 [${task.事件?.content}] 状态失败:`, error);
                    })
                );

                // 更新块的自定义属性（状态）
                blockAttrPromises.push(
                    setBlockAttrs(blockId, {
                        "custom-st-event": "archived"
                    }).catch(error => {
                        console.error(`更新任务 [${task.事件?.content}] 自定义属性失败:`, error);
                    })
                );
            }

            // 等待所有数据库状态更新完成（加 dida 标签，监听可识别并跳过）
            await this.withDidaTagged(async () => {
                await Promise.all(updatePromises);
            });

            // 等待所有块属性更新完成
            await Promise.all(blockAttrPromises);

            console.debug(`批量归档完成：成功归档 ${successCount} 个任务`);
            return successCount;

        } catch (error) {
            console.error("批量归档思源任务失败:", error);
            return 0;
        }
    }

    /**
     * 更新任务字段的通用方法
     */
    private async updateTaskFields(blockId: string, taskData: any, viewValue: any, itemID: string, existingTask?: any): Promise<void> {
        try {
            console.debug("[滴答同步] 开始更新思源字段", {
                blockId,
                itemID,
                avId: this.avId,
                hasExistingTask: !!existingTask,
                title: taskData?.事件?.content,
                status: taskData?.状态?.content,
                priority: taskData?.优先级?.content,
                hasTime: !!taskData?.开始时间,
                start: taskData?.开始时间?.start,
                end: taskData?.开始时间?.end,
                tags: taskData?.标签?.content,
            });
            // 获取各字段的 keyID
            const eventKeyID = await this.getKeyIDfromViewValue(viewValue, '事件');
            const timeKeyID = await this.getKeyIDfromViewValue(viewValue, '开始时间');
            const priorityKeyID = await this.getKeyIDfromViewValue(viewValue, '优先级');
            const urlKeyID = await this.getKeyIDfromViewValue(viewValue, '链接');
            const statusKeyID = await this.getKeyIDfromViewValue(viewValue, '状态');
            const tagKeyID = await this.getKeyIDfromViewValue(viewValue, '标签');
            const descKeyID = await this.getKeyIDfromViewValue(viewValue, '描述');

            // 批量更新：收集所有需要更新的字段
            const updatePromises: Promise<any>[] = [];

            // 更新事件标题（需要单独处理，因为使用不同的API）
            if (eventKeyID && taskData.事件?.content) {
                // 移除事件标题中的D链接，只保留原始标题
                const newEventTitle = removeDidaLinks(taskData.事件.content);
                updatePromises.push(updatemainkey({
                    avID: this.avId,
                    blockID: blockId,
                    itemID: itemID,
                    keyID: eventKeyID,
                    content: newEventTitle, // 存储不含链接的标题
                }));
            }

            // 更新开始时间
            const newTime = taskData.开始时间;
            const oldTime = existingTask?.开始时间;
            const newStart = newTime?.start || null;
            const newEnd = newTime?.end || null;
            const oldStart = oldTime?.start || null;
            const oldEnd = oldTime?.end || null;

            console.debug("[滴答同步] 思源时间字段对比", {
                blockId,
                itemID,
                timeKeyID,
                newTime,
                oldTime,
                newStart,
                newEnd,
                oldStart,
                oldEnd,
            });

            if (timeKeyID && (newStart !== oldStart || newEnd !== oldEnd)) {
                const startTime = newTime?.start ? formatLocalDate(newTime.start) : undefined;
                const endTime = newTime?.end && newTime?.hasEndDate ? formatLocalDate(newTime.end) : undefined;
                console.debug("[滴答同步] 准备更新思源时间字段", {
                    blockId,
                    itemID,
                    startTime,
                    endTime,
                    hasEndDate: newTime?.hasEndDate,
                });
                updatePromises.push(updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    timeKeyID,
                    itemID,
                    startTime,
                    "date",
                    endTime
                ));
            }

            // 更新优先级
            if (priorityKeyID && taskData.优先级?.content && taskData.优先级.content !== existingTask?.优先级?.content) {
                const priorityData = [{ content: taskData.优先级.content }];
                updatePromises.push(updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    priorityKeyID,
                    itemID,
                    priorityData,
                    "select"
                ));
            }

            // 更新状态
            if (statusKeyID && taskData.状态?.content && taskData.状态.content !== existingTask?.状态?.content) {
                const statusData = [{ content: taskData.状态.content }];
                updatePromises.push(updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    statusKeyID,
                    itemID,
                    statusData,
                    "select"
                ));
            }

            // 更新标签
            const newTags = (taskData.标签?.content || []).map((t: any) => t.content).sort().join(',');
            const oldTags = (existingTask?.标签?.content || []).sort().join(',');
            if (tagKeyID && taskData.标签?.content && newTags !== oldTags) {
                console.debug("更新标签：", taskData.标签.content);
                updatePromises.push(updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    tagKeyID,
                    itemID,
                    taskData.标签.content,
                    "mSelect"
                ));
            }

            // 更新描述
            if (descKeyID && taskData.描述?.content && taskData.描述.content !== existingTask?.描述?.content) {
                console.debug("[滴答同步] 准备更新描述字段", {
                    blockId,
                    itemID,
                    descKeyID,
                    oldDesc: existingTask?.描述?.content,
                    newDesc: taskData.描述?.content,
                });
                updatePromises.push(updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    descKeyID,
                    itemID,
                    taskData.描述.content,
                    "text"
                ));
            }
            // console.debug("更新链接BBBBBBBBBBBBB：", taskData.链接.content, urlKeyID);
            if (urlKeyID && taskData.链接?.content) {
                // 更新链接
                // console.debug("更新链接!!!!!!!!!!!!!!!!!!!：", taskData.链接.content);
                console.debug("[滴答同步] 准备更新链接字段", {
                    blockId,
                    itemID,
                    urlKeyID,
                    url: taskData.链接?.content,
                });
                updatePromises.push(updateAttrViewCell_pro(
                    blockId,
                    this.avId,
                    urlKeyID,
                    itemID,
                    taskData.链接.content,
                    "url"
                ));
            }


            // 等待所有更新完成
            await Promise.all(updatePromises);

        } catch (error) {
            console.error("更新任务字段失败:", error);
            throw error;
        }
    }


    /**
     * 获取字段的 keyID（从 viewValue 中）
     */
    private async getKeyIDfromViewValue(viewValue: any, fieldName: string): Promise<string | null> {
        try {
            if (!viewValue || !Array.isArray(viewValue) || viewValue.length === 0) {
                return null;
            }

            const viewData = viewValue[0];
            if (!viewData.data || !Array.isArray(viewData.data) || viewData.data.length === 0) {
                return null;
            }
            // console.debug("获取字段 keyID：", fieldName, viewData.data);
            // 从第一条数据中获取字段的 keyID
            const firstRecord = viewData.data[0];
            if (firstRecord[fieldName] && firstRecord[fieldName].keyID) {
                return firstRecord[fieldName].keyID;
            }

            // 首条记录可能没有该字段（如画廊视图中空单元格不返回），此时扫描全部记录兜底
            for (const record of viewData.data) {
                if (record?.[fieldName]?.keyID) {
                    return record[fieldName].keyID;
                }
            }

            return null;
        } catch (error) {
            console.error(`获取字段 ${fieldName} 的 keyID 失败:`, error);
            return null;
        }
    }

    /**
     * 创建日记（如果需要）
     */
    private async createDailynote(parentId: string, date: Date): Promise<string> {
        return (await createDailyNoteForDate(parentId, date)) || "";
    }
    async destroy(): Promise<void> {
        this.topBarButton = applyTopBarButton(this.plugin, this.topBarButton, "st-cal-dida-sync", {
            icon: "iconSTdida",
            title: "导入滴答清单数据",
            position: "right",
            callback: () => {},
        }, false);
        if (this.initialSyncTimer) {
            window.clearTimeout(this.initialSyncTimer);
            this.initialSyncTimer = undefined;
        }
        if (this.autoSyncInterval) {
            window.clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = undefined;
        }
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
            this.syncDebounceTimer = null;
        }
        if (this.pendingSiyuanConfirmTimer) {
            clearTimeout(this.pendingSiyuanConfirmTimer);
            this.pendingSiyuanConfirmTimer = null;
        }
        if (this.pendingSiyuanSyncTimer) {
            clearTimeout(this.pendingSiyuanSyncTimer);
            this.pendingSiyuanSyncTimer = null;
        }
        this.changeSource.destroy();
        try {
            this.linkInterceptor?.destroy?.();
        } catch (error) {
            console.warn("销毁滴答链接拦截器失败", error);
        }
        this.syncEchoSuppressUntil = 0;
        this.siyuanSyncInFlight.clear();
        this.avColumnKeyIds = null;
        this.legacyAttrBlocks.clear();
        // 待补写的去重键必须跨重启保留：等快照真正落盘后再清内存，
        // 否则新实例恢复时可能读到旧快照，丢掉尚未落盘的去重键。
        await this.persistPendingDidaIdWrites();
        this.store.clear();
    }

    handleSiyuanUpdate = (event: any, blockId = "", itemID = ""): Promise<void> =>
        this.changeSource.handleEvent(event, blockId, itemID);

    /**
     * 处理单个思源任务变更目标，避免事务里多个变更项被覆盖成“只同步首尾”。
     */
    private async processSiyuanUpdateTarget(blockId: string, itemID: string, isDetached = false): Promise<void> {
        if (isDetached) return;//游离块不支持添加到滴答,后续操作需要绑定块ID
        if (!blockId) return;
        try {
            // 1. 获取这一行（块）的完整数据，最重要的是拿到 didaID
            console.debug(`处理思源更新：块ID ${blockId}`);
            // 去重依据是数据库 didaID 列：读取前先失效行缓存。
            // 日历拖拽排程等路径不经过变更源，不会自动失效缓存，这里统一处理。
            invalidateViewValueCache(this.avId ?? undefined);
            const viewData = await this.getAvViewData("处理思源更新");
            const allTasks = viewData.flatMap(view => view.data || []);
            const siyuanTask = allTasks.find((task: any) => task.事件?.itemID === itemID);

            if (!siyuanTask) {
                console.debug("[滴答同步] 未找到对应的思源任务行，加入延迟确认检查", {
                    blockId,
                    itemID,
                    totalTasks: allTasks.length,
                });
                if (itemID) {
                    this.enqueueSiyuanConfirmTarget({ blockId, itemID }, 8000);
                }
                return;
            }

            console.debug("[滴答同步] 读取到思源任务快照", {
                blockId,
                itemID,
                hasDidaID: !!this.readDidaTaskId(siyuanTask),
                title: siyuanTask.事件?.content,
                status: siyuanTask.状态?.content,
                priority: siyuanTask.优先级?.content,
                hasTime: !!siyuanTask.开始时间,
                start: siyuanTask.开始时间?.start,
                end: siyuanTask.开始时间?.end,
                tags: siyuanTask.标签?.content,
            });

            const syncResult = await this.syncSingleSiyuanTaskToDida(siyuanTask, blockId, itemID, viewData);
            if (syncResult.changed || !syncResult.ok) {
                // 仅实际写回过滴答或本次未能完成写入时调度延迟确认，无差异事件不再空转
                this.enqueueSiyuanConfirmTarget({ blockId, itemID }, 8000);
            }
        } catch (error) {
            console.error("从思源同步到滴答失败:", error);
        }
    }

    /**
     * 在作用域内为所有发出的 fetch 请求打上 dida 标签，供本模块的网络监听识别并跳过。
     */
    private async withDidaTagged<T>(fn: () => Promise<T>): Promise<T> {
        beginTaggedRequests('dida');
        try {
            return await fn();
        } finally {
            endTaggedRequests('dida');
        }
    }
    /**
     * 检测 Dida365 API Token 是否有效。
     * @returns Promise<boolean> 如果 Token 有效，返回 true；否则返回 false。
     */
    async isTokenValid(): Promise<boolean> {
        try {
            const projects = await this.apiClient.getUserProjects();
            console.debug("Dida365 API Token 验证成功，获取到的项目数量:", projects ? projects.length : 0);
            return Array.isArray(projects) && projects.length > 0;
        } catch (error) {
            console.error("Dida365 API Token 验证失败:", error instanceof Error ? error.message : String(error));
            return false;
        }
    }
    /**
     * 获取所有项目中的所有未完成任务。
     * 注意：此方法会为每个项目单独调用一次API以获取其任务数据。
     * @returns Promise<Task[]> 一个包含所有未完成任务的数组。
     */
    async getAllTasks(): Promise<Task[]> {
        const allTasks: Task[] = [];
        // 合并两个设置项为一个数组，过滤空值
        // const projectIds = [settingdata["cal-dida-unfinished-list"], settingdata["cal-dida-finished-list"]].filter(Boolean);
        const projectIds = [this.todoListId];
        const previousCache = new Map(this.taskCache);
        this.taskCache.clear(); // 清空旧缓存
        // 清空后缓存不完整：这里只拉未完成任务，取数失败时缓存更是空的，
        // "缓存里没有"都不能当作"远端确实没有"。完整快照由 refreshRemoteTaskCache 负责标记。
        this.taskCacheComplete = false;

        if (projectIds.length === 0) {
            showMessage("未设置需要同步的滴答项目ID", 5000, "error", "dida-sync");
            return [];
        }

        for (const projectId of projectIds) {
            try {
                const projectData = await this.apiClient.getProjectWithData(projectId);
                if (projectData && projectData.tasks && projectData.tasks.length > 0) {
                    allTasks.push(...projectData.tasks);
                    projectData.tasks.forEach(task => {
                        if (task.id) {
                            // 若该任务仍处于本地更新冷却期，优先保留旧缓存，避免被旧数据覆盖
                            if (this.isPendingDidaUpdate(task.id) && previousCache.has(task.id)) {
                                this.taskCache.set(task.id, previousCache.get(task.id)!);
                            } else {
                                this.taskCache.set(task.id, task);
                            }
                        }
                    });
                }
            } catch (error) {
                console.warn(`获取项目 (ID: ${projectId}) 的任务失败:`, error instanceof Error ? error.message : String(error));
                throw new Error(`获取项目 (ID: ${projectId}) 的任务失败: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        // 记录刷新时间："同源任务探测"据此节流，避免一轮同步里反复拉取远端列表
        this.lastRemoteTaskRefreshAt = Date.now();
        return allTasks;
    }
    /**
     * 在所有未完成任务中按标题搜索任务。
     * @param titleQuery 要搜索的标题关键词。
     * @param caseSensitive 是否区分大小写，默认为 false。
     * @returns Promise<Task[]> 匹配的任务数组。
     */
    async findTasksByTitle(titleQuery: string, caseSensitive: boolean = false): Promise<Task[]> {
        const allUndoneTasks = await this.getAllTasks();
        const query = caseSensitive ? titleQuery : titleQuery.toLowerCase();

        return allUndoneTasks.filter(task => {
            if (!task.title) return false;
            const taskTitle = caseSensitive ? task.title : task.title.toLowerCase();
            return taskTitle.includes(query);
        });
    }
    /**
     * 获取指定项目的所有任务。
     * @param projectId 项目ID。
     * @returns Promise<Task[]> 返回该项目下的所有任务。
     */
    async getTasksByProject(projectId: string): Promise<Task[]> {
        try {
            const projectData = await this.apiClient.getProjectWithData(projectId);
            return projectData ? projectData.tasks : [];
        } catch (error) {
            console.error(`获取项目 ${projectId} 的任务失败:`, error instanceof Error ? error.message : String(error));
            return [];
        }
    }
    /**
     * 获取所有项目。
     * @returns Promise<Project[]> 返回所有项目的数组。
     */
    async getAllProjects(): Promise<Project[]> {
        try {
            const projects = await this.apiClient.getUserProjects();
            return projects || [];
        } catch (error) {
            console.error("获取所有项目失败:", error instanceof Error ? error.message : String(error));
            return [];
        }
    }
    /**
     * 获取底层的 Dida365ApiClient 实例，以便直接调用其方法。
     * @returns Dida365ApiClient 实例。
     */
    public getApiClient(): Dida365ApiClient {
        return this.apiClient;
    }

    public async getTask(projectId: string, taskId: string): Promise<Task> {
        return this.apiClient.getTask(projectId, taskId);
    }

    public async completeTask(projectId: string, taskId: string): Promise<void> {
        return this.apiClient.completeTask(projectId, taskId);
    }

    public async moveTasks(operations: TaskMoveOperation[]): Promise<TaskMoveResult[]> {
        return this.apiClient.moveTasks(operations);
    }

    public async moveTask(operation: TaskMoveOperation): Promise<TaskMoveResult[]> {
        return this.apiClient.moveTask(operation);
    }

    public async listCompletedTasks(query: TaskCompletedQuery = {}): Promise<Task[]> {
        const finalQuery = Object.keys(query).length > 0 ? query : this.getCompletedTaskQuery();
        return this.apiClient.listCompletedTasks(finalQuery);
    }

    public async filterTasks(query: TaskFilterQuery = {}): Promise<Task[]> {
        return this.apiClient.filterTasks(query);
    }

}
