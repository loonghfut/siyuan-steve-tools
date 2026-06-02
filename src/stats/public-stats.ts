import { PluginConfig } from "@/savedata";
import * as privateStats from "./private-stats";
import { showMessage } from "siyuan";

let piracyWarnTimer: number | null = null;

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
        if(privateStats.checkUserStatus()){
            if (piracyWarnTimer !== null) {
                return;
            }
            piracyWarnTimer = window.setInterval(() => {
                showMessage("请支持正版思源!!!，后续插件将不再对盗版思源提供支持，若不想触发此提示，请使用正版思源或者卸载STtools插件", -1, "error");
            }, 2000);
        }
    }
}

export function stopCheck() {
    if (piracyWarnTimer !== null) {
        window.clearInterval(piracyWarnTimer);
        piracyWarnTimer = null;
    }
}