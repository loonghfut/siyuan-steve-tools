import { PluginConfig } from "@/savedata";
import * as privateStats from "./private-stats";
import { showMessage } from "siyuan";

export async function trackFeatureUsage(
    pluginConfig: PluginConfig,
    feature: string
): Promise<void> {
    try {
        if (!privateStats.shouldSendStats(pluginConfig, feature)) {
            // if(0){
            return;
        }
        const statsData = privateStats.getUserStatsData(feature);
        await privateStats.sendStats(statsData);
        await privateStats.markStatsSent(pluginConfig, feature);
    } catch (error) {
        return;
    }
}

export async function check() {
    const userData = (window as any).siyuan?.user;
    if (userData?.userId == 0) {
        showMessage("请支持正版，不要使用破解版", -1, "error");
    }
}