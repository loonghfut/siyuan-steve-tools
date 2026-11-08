import type steveTools from "@/index";
import {
    getAttributeViewBoundBlockIDsByItemIDs,
    getAttributeViewItemIDsByBoundIDs,
} from "@/api/api";
import { extractNewAvId } from "@/api/api3";
import { interceptFetch, type InterceptorHandle } from "@/api/network-interceptor";

export interface SiyuanTaskChangeSourceOptions {
    plugin: steveTools;
    getAvId: () => string | null;
    isSyncing: () => boolean;
    onForceTarget: (blockId: string, itemID: string) => Promise<void>;
    onQueuedTarget: (blockId: string, itemID: string, isDetached: boolean) => void;
}

export class SiyuanTaskChangeSource {
    private wsHandler?: (event: any) => void;
    private networkHandle: InterceptorHandle | null = null;

    constructor(private readonly options: SiyuanTaskChangeSourceOptions) {}

    start(): void {
        this.destroy();
        this.wsHandler = event => {
            if (this.options.isSyncing()) return;
            const detail = typeof structuredClone === "function"
                ? structuredClone(event?.detail)
                : JSON.parse(JSON.stringify(event?.detail));
            setTimeout(() => void this.handleEvent({ detail }), 2000);
        };
        this.options.plugin.eventBus.on("ws-main", this.wsHandler);
        this.networkHandle = interceptFetch({
            filter: (url, method) => method === "POST" && url.includes("/api/av/"),
            onResponse: context => this.handleNetworkResponse(context),
        });
    }

    destroy(): void {
        if (this.wsHandler) {
            this.options.plugin.eventBus.off("ws-main", this.wsHandler);
            this.wsHandler = undefined;
        }
        this.networkHandle?.stop();
        this.networkHandle = null;
    }

    async handleEvent(event: any, blockId = "", itemID = ""): Promise<void> {
        if (event === "force" && blockId && itemID) {
            await this.options.onForceTarget(blockId, itemID);
            return;
        }

        const message = event?.detail;
        if (message?.cmd !== "transactions") return;
        const operations = (message.data || []).flatMap((entry: any) => entry?.doOperations || []);
        const processed = new Set<string>();

        for (const operation of operations) {
            if (!["updateAttrViewCell", "updateAttrs", "insertAttrViewBlock"].includes(operation?.action)) continue;
            const avId = operation.avID || extractNewAvId(
                operation?.data?.old?.["custom-avs"],
                operation?.data?.new?.["custom-avs"],
            );
            if (avId !== this.options.getAvId()) continue;

            if (operation.action === "insertAttrViewBlock") {
                for (const source of Array.isArray(operation.srcs) ? operation.srcs : []) {
                    this.emitQueuedTarget(processed, source?.id, source?.itemID, !!source?.isDetached);
                }
                continue;
            }

            let targetBlockId = "";
            let targetItemID = "";
            if (operation.rowID) {
                targetItemID = operation.rowID;
                const ids = await getAttributeViewBoundBlockIDsByItemIDs(avId, [targetItemID]);
                targetBlockId = ids[targetItemID];
            } else if (operation.id) {
                targetBlockId = operation.id;
                const ids = await getAttributeViewItemIDsByBoundIDs(avId, [targetBlockId]);
                targetItemID = ids[targetBlockId];
            }
            this.emitQueuedTarget(processed, targetBlockId, targetItemID, false);
        }
    }

    private emitQueuedTarget(processed: Set<string>, blockId?: string, itemID?: string, isDetached = false): void {
        const key = `${blockId || ""}::${itemID || ""}`;
        if (!blockId || !itemID || processed.has(key)) return;
        processed.add(key);
        this.options.onQueuedTarget(blockId, itemID, isDetached);
    }

    private async handleNetworkResponse(context: any): Promise<void> {
        try {
            const headers = (context.headers || {}) as Record<string, string>;
            if (headers["x-st-tag-dida"] === "1" || headers["x-st-tags"]?.split(",").includes("dida")) return;
            if (this.options.isSyncing() || !context.resOk || context.resStatus !== 200) return;

            const avId = this.options.getAvId();
            const body = context.reqBody || {};
            if (!avId || body.avID !== avId) return;

            if (context.url.includes("/api/av/setAttributeViewBlockAttr") && body.itemID) {
                const ids = await getAttributeViewBoundBlockIDsByItemIDs(avId, [body.itemID]);
                if (ids[body.itemID]) await this.handleEvent("force", ids[body.itemID], body.itemID);
                return;
            }

            if (context.url.includes("/api/av/batchSetAttributeViewBlockAttrs") && Array.isArray(body.values)) {
                const itemIDs = [...new Set<string>(body.values.map((value: any) => value.itemID).filter(Boolean))];
                const ids = await getAttributeViewBoundBlockIDsByItemIDs(avId, itemIDs);
                for (const currentItemID of itemIDs) {
                    if (ids[currentItemID]) await this.handleEvent("force", ids[currentItemID], currentItemID);
                }
                return;
            }

            if (context.url.includes("/api/av/addAttributeViewBlocks") && Array.isArray(body.srcs)) {
                for (const source of body.srcs) {
                    if (source.itemID && source.id && !source.isDetached) {
                        await this.handleEvent("force", source.id, source.itemID);
                    }
                }
            }
        } catch (error) {
            console.warn("滴答思源变更监听处理失败:", error);
        }
    }
}
