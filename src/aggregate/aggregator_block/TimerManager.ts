import { showMessage } from "siyuan";
import { PresetItem } from "../echarts/types/types";
import type { aggregatorBlock } from "./index";
import { showStatusMessage } from "@/api/api";

/**
 * 定时任务管理器
 * 管理所有预设的定时执行任务
 */
export class TimerManager {
    private timers: Map<string, NodeJS.Timeout> = new Map();
    private aggregatorBlock: aggregatorBlock;

    constructor(aggregatorBlock: aggregatorBlock) {
        this.aggregatorBlock = aggregatorBlock;
    }

    /**
     * 启动定时器
     */
    async startTimer(presetName: string, preset: PresetItem): Promise<void> {
        // 先停止已有的定时器
        this.stopTimer(presetName);

        if (!preset.timerEnabled || !preset.timerInterval) {
            console.log(`[TimerManager] 预设 "${presetName}" 定时未启用或间隔无效`);
            return;
        }

        console.log(`[TimerManager] 启动定时器: ${presetName}, 间隔: ${preset.timerInterval}ms`);

        // 创建定时器
        // 注意：不要直接捕获 preset 对象，每次执行时从配置中重新读取最新的预设
        const timer = setInterval(async () => {
            // 每次执行时重新获取最新的预设配置
            const allPresets = await this.aggregatorBlock.getSqlPresets();
            const currentPreset = allPresets[presetName];
            
            if (!currentPreset) {
                console.warn(`[TimerManager] 预设 "${presetName}" 不存在，停止定时器`);
                this.stopTimer(presetName);
                return;
            }

            // 检查定时器是否仍然启用
            if (!currentPreset.timerEnabled) {
                console.log(`[TimerManager] 预设 "${presetName}" 定时已禁用，停止定时器`);
                this.stopTimer(presetName);
                return;
            }

            await this.executePreset(presetName, currentPreset);
        }, preset.timerInterval);

        this.timers.set(presetName, timer);
    }

    /**
     * 停止定时器
     */
    stopTimer(presetName: string): void {
        const timer = this.timers.get(presetName);
        if (timer) {
            clearInterval(timer);
            this.timers.delete(presetName);
            console.log(`[TimerManager] 停止定时器: ${presetName}`);
        }
    }

    /**
     * 执行预设的聚合任务
     */
    private async executePreset(presetName: string, preset: PresetItem): Promise<void> {
        try {
            console.log(`[TimerManager] 执行定时任务: ${presetName}`);

            const targetDocId = preset.targetDocId;
            const targetDatabaseId = preset.targetDatabaseId;

            // 至少需要一个目标
            if (!targetDocId && !targetDatabaseId) {
                console.warn(`[TimerManager] 预设 "${presetName}" 未设置目标文档或数据库 ID`);
                return;
            }

            // 执行 SQL 查询
            const lastInsertTime = preset.lastInsertTime || '';
            const sqlResult = await this.aggregatorBlock.executeSql(
                preset.sql, 
                targetDocId, 
                lastInsertTime
            );

            // ----- 新增：检查返回结果中是否有在最近 5 分钟内更新的块 -----
            if (Array.isArray(sqlResult) && sqlResult.length > 0) {
                const minutes = Math.max(1, this.aggregatorBlock.getRecentUpdateThresholdMinutes() || 5);
                const FIVE_MIN_MS = minutes * 60 * 1000;
                const now = Date.now();

                const parseToMs = (val: any): number | null => {
                    if (val === null || val === undefined) return null;
                    // 数字类型
                    if (typeof val === 'number') {
                        // 13 位视为毫秒，10 位视为秒
                        if (val > 1e12) return val; // 已经是 ms
                        if (val > 1e9) return val * 1000; // 秒 -> ms
                        return null;
                    }
                    // 字符串类型
                    if (typeof val === 'string') {
                        const s = val.trim();
                        // 思源格式 YYYYMMDDHHmmss (14 位)
                        if (/^\d{14}$/.test(s)) {
                            // 转换为 yyyy-MM-ddTHH:mm:ssZ 形式解析为本地时间
                            const year = parseInt(s.slice(0, 4), 10);
                            const month = parseInt(s.slice(4, 6), 10) - 1;
                            const day = parseInt(s.slice(6, 8), 10);
                            const hour = parseInt(s.slice(8, 10), 10);
                            const minute = parseInt(s.slice(10, 12), 10);
                            const second = parseInt(s.slice(12, 14), 10);
                            return new Date(year, month, day, hour, minute, second).getTime();
                        }
                        // 13 位数字字符串 -> ms
                        if (/^\d{13}$/.test(s)) return parseInt(s, 10);
                        // 10 位数字字符串 -> 秒
                        if (/^\d{10}$/.test(s)) return parseInt(s, 10) * 1000;
                        // 尝试 ISO/可解析日期字符串
                        const parsed = Date.parse(s);
                        if (!isNaN(parsed)) return parsed;
                        return null;
                    }
                    return null;
                };

                // 检查每一行的 updated 字段（若存在）
                const hasRecentUpdate = sqlResult.some((row: any) => {
                    if (!row || typeof row !== 'object') return false;
                    const updatedVal = row['updated'];
                    const ts = parseToMs(updatedVal);
                    if (!ts) return false;
                    return (now - ts) <= FIVE_MIN_MS;
                });

                if (hasRecentUpdate) {
                    console.log(`[TimerManager] 预设 "${presetName}" 检测到存在 5 分钟内更新的块，跳过本次定时触发`);
                    // 更新执行时间信息并跳过本次执行
                    await this.updateExecutionTime(presetName, preset);
                    showStatusMessage(`定时任务 "${presetName}" 因存在最近更新的块而被跳过`, 5000, 'info');
                    return;
                }
            }
            // ----- 新增检查结束 -----

            // 如果没有新数据，跳过
            if (!sqlResult || sqlResult.length === 0) {
                console.log(`[TimerManager] 预设 "${presetName}" 没有新数据`);
                
                // 更新执行时间
                await this.updateExecutionTime(presetName, preset);
                return;
            }

            let docInserted = false;
            let databaseInsertedCount = 0;
            const errors: string[] = [];

            if (targetDocId) {
                try {
                    const renderedMd = this.aggregatorBlock.renderTemplate(preset, sqlResult);
                    await this.aggregatorBlock.insertMarkdownToDoc(
                        targetDocId,
                        renderedMd,
                        presetName
                    );
                    docInserted = true;
                } catch (error: any) {
                    const msg = error?.message || String(error);
                    errors.push(`文档: ${msg}`);
                }
            }

            if (targetDatabaseId) {
                try {
                    databaseInsertedCount = await this.aggregatorBlock.insertBlocksToDatabase(
                        targetDatabaseId,
                        sqlResult,
                        presetName
                    );
                } catch (error: any) {
                    const msg = error?.message || String(error);
                    errors.push(`数据库: ${msg}`);
                }
            }

            const operations: string[] = [];
            if (docInserted) {
                operations.push(`文档 ${sqlResult.length} 条`);
            }
            if (databaseInsertedCount > 0) {
                operations.push(`数据库 ${databaseInsertedCount} 块`);
            }

            if (operations.length) {
                console.log(`[TimerManager] 成功执行定时任务: ${presetName}, 插入 ${operations.join('，')}`);
            } else {
                console.log(`[TimerManager] 预设 "${presetName}" 没有可执行的插入操作`);
            }

            if (errors.length) {
                showMessage(`定时任务 "${presetName}" 部分失败: ${errors.join('；')}`, 5000, 'error');
            }

            // 重新获取预设配置（插入操作可能更新了 lastInsertTime）
            const allPresets = await this.aggregatorBlock.getSqlPresets();
            const updatedPreset = allPresets[presetName];
            if (updatedPreset) {
                // 使用更新后的预设来更新执行时间
                await this.updateExecutionTime(presetName, updatedPreset);
            } else {
                // 如果找不到预设，使用原来的预设
                await this.updateExecutionTime(presetName, preset);
            }

            // 可选：显示通知
            if (operations.length) {
                showStatusMessage(`定时任务 "${presetName}" 已执行，${operations.join('，')}`, 3000, 'info');
            }

        } catch (error) {
            console.error(`[TimerManager] 执行定时任务失败: ${presetName}`, error);
            showMessage(`定时任务 "${presetName}" 执行失败: ${error.message}`, 5000, 'error');
        }
    }

    /**
     * 更新执行时间信息
     */
    private async updateExecutionTime(presetName: string, preset: PresetItem): Promise<void> {
        const now = Date.now();
        preset.lastExecuteTime = now;
        
        if (preset.timerInterval) {
            preset.nextExecuteTime = now + preset.timerInterval;
        }

        // 保存到配置
        await this.aggregatorBlock.updatePresetTimerSettings(presetName, preset);
    }

    /**
     * 停止所有定时器
     */
    stopAll(): void {
        this.timers.forEach((timer, name) => {
            clearInterval(timer);
            console.log(`[TimerManager] 停止定时器: ${name}`);
        });
        this.timers.clear();
    }

    /**
     * 获取所有活动的定时器名称
     */
    getActiveTimers(): string[] {
        return Array.from(this.timers.keys());
    }

    /**
     * 获取指定定时器的状态信息
     */
    getTimerStatus(presetName: string): { active: boolean; nextExecuteTime?: number } {
        const active = this.timers.has(presetName);
        return { active };
    }

    /**
     * 重新加载定时器（当预设配置更新时调用）
     */
    async reloadTimer(presetName: string, preset: PresetItem): Promise<void> {
        console.log(`[TimerManager] 重新加载定时器: ${presetName}`);
        
        // 停止旧的定时器
        this.stopTimer(presetName);
        
        // 如果启用了定时，启动新的定时器
        if (preset.timerEnabled && preset.timerInterval) {
            await this.startTimer(presetName, preset);
        }
    }
}
