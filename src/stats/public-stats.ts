import { PluginConfig } from "@/savedata";
import * as privateStats from "./private-stats";

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
