import { showMessage } from "siyuan";
import { PresetItem } from "../echarts/types/types";
import type { aggregatorBlock } from "./index";

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

            // 检查目标文档
            if (!preset.targetDocId) {
                console.warn(`[TimerManager] 预设 "${presetName}" 没有设置目标文档ID`);
                return;
            }

            // 执行 SQL 查询
            const lastInsertTime = preset.lastInsertTime || '';
            const sqlResult = await this.aggregatorBlock.executeSql(
                preset.sql, 
                preset.targetDocId, 
                lastInsertTime
            );

            // 如果没有新数据，跳过
            if (!sqlResult || sqlResult.length === 0) {
                console.log(`[TimerManager] 预设 "${presetName}" 没有新数据`);
                
                // 更新执行时间
                await this.updateExecutionTime(presetName, preset);
                return;
            }

            // 渲染模板
            const renderedMd = this.aggregatorBlock.renderTemplate(preset, sqlResult);

            // 插入到文档
            await this.aggregatorBlock.insertMarkdownToDoc(
                preset.targetDocId, 
                renderedMd, 
                presetName
            );

            console.log(`[TimerManager] 成功执行定时任务: ${presetName}, 插入 ${sqlResult.length} 条数据`);

            // 重新获取预设配置（因为 insertMarkdownToDoc 已经更新了 lastInsertTime）
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
            showMessage(`定时任务 "${presetName}" 已执行，插入 ${sqlResult.length} 条数据`, 3000, 'info');

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
