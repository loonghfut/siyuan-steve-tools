
import { PluginConfig } from "@/savedata";

export interface StatsData {
    remark: string;
}

export function shouldSendStats(_pluginConfig: PluginConfig, _feature: string): boolean {
    // 存根实现：不发送统计数据
    return false;
}

export function getUserStatsData(feature: string): StatsData {
    return {
        remark: `使用${feature}功能`,
    };
}

export async function checkUserStatus(){

}

export async function sendStats(_data: StatsData): Promise<void> {
}

export async function markStatsSent(_pluginConfig: PluginConfig, _feature: string): Promise<void> {
}

export async function superDoSomething(): Promise<void> {
}

export async function getAnalysisData() {
}