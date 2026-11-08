import { showMessage } from 'siyuan';
import { showStatusMessage } from '@/api/api';
import type { PresetItem } from '../echarts/types/types';
import type { aggregatorBlock } from './index';

interface TimerHandle {
    timeout?: ReturnType<typeof setTimeout>;
    nextExecuteTime?: number;
    running: boolean;
}

/**
 * One-shot scheduler. A callback only schedules its successor when its own
 * handle is still active, so deleting/disabling a preset during an async run
 * cannot resurrect an old timer.
 */
export class TimerManager {
    private timers = new Map<string, TimerHandle>();

    constructor(private readonly aggregatorBlock: aggregatorBlock) {}

    async startTimer(presetName: string, preset: PresetItem): Promise<void> {
        this.stopTimer(presetName);
        if (!preset.timerEnabled) return;

        const mode = preset.timerMode || 'interval';
        if (mode === 'interval' && (!Number.isFinite(preset.timerInterval) || (preset.timerInterval || 0) <= 0)) {
            console.warn(`[TimerManager] 预设 "${presetName}" 的执行间隔无效`);
            return;
        }
        if (mode === 'daily' && !this.isValidDailyTime(preset)) {
            console.warn(`[TimerManager] 预设 "${presetName}" 的每日执行时间无效`);
            return;
        }

        const handle: TimerHandle = { running: false };
        this.timers.set(presetName, handle);
        const initialDelay = this.getInitialDelay(preset);
        this.schedule(presetName, handle, Math.max(0, initialDelay));
    }

    private schedule(presetName: string, handle: TimerHandle, delay: number): void {
        if (this.timers.get(presetName) !== handle) return;
        if (handle.timeout) clearTimeout(handle.timeout);
        handle.nextExecuteTime = Date.now() + delay;
        handle.timeout = setTimeout(async () => {
            if (this.timers.get(presetName) !== handle || handle.running) return;
            handle.running = true;
            try {
                const shouldContinue = await this.tickOnce(presetName, handle);
                if (!shouldContinue || this.timers.get(presetName) !== handle) return;
                const latest = (await this.aggregatorBlock.getSqlPresets())[presetName] as PresetItem | undefined;
                if (!latest?.timerEnabled) {
                    this.stopTimer(presetName);
                    return;
                }
                this.schedule(presetName, handle, this.getNextDelay(latest));
            } finally {
                handle.running = false;
            }
        }, delay);
    }

    private async tickOnce(presetName: string, handle: TimerHandle): Promise<boolean> {
        const preset = (await this.aggregatorBlock.getSqlPresets())[presetName] as PresetItem | undefined;
        if (!preset?.timerEnabled || this.timers.get(presetName) !== handle) {
            this.stopTimer(presetName);
            return false;
        }
        await this.executePreset(presetName, preset);
        return this.timers.get(presetName) === handle;
    }

    private async executePreset(presetName: string, preset: PresetItem): Promise<void> {
        try {
            const result = await this.aggregatorBlock.runPreset(presetName);
            const errors = result.targets.filter(target => target.error).map(target =>
                `${target.target === 'document' ? '文档' : '数据库'}: ${target.error}`,
            );
            const operations = result.targets
                .filter(target => target.insertedCount > 0)
                .map(target => target.target === 'document'
                    ? `文档 ${target.insertedCount} 条`
                    : `数据库 ${target.insertedCount} 块${target.skippedCount ? `（跳过 ${target.skippedCount} 条）` : ''}`);

            if (errors.length) {
                const error = errors.join('；');
                await this.aggregatorBlock.updatePreset(presetName, {
                    lastRunError: error,
                    lastRunSummary: '执行失败',
                }, { skipUpdatedAt: true });
                showMessage(`定时任务 "${presetName}" 部分失败: ${error}`, 5000, 'error');
                return;
            }

            await this.updateExecutionTime(presetName, preset, operations.length ? `已插入：${operations.join('，')}` : '查询成功，无新数据');
            if (operations.length) {
                showStatusMessage(`定时任务 "${presetName}" 已执行，${operations.join('，')}`, 3000, 'info');
            }
        } catch (error: any) {
            const message = error?.message || String(error);
            console.error(`[TimerManager] 执行定时任务失败: ${presetName}`, error);
            try {
                await this.aggregatorBlock.updatePreset(presetName, {
                    lastRunError: message,
                    lastRunSummary: '执行失败',
                }, { skipUpdatedAt: true });
            } catch (updateError) {
                console.error('[TimerManager] 记录定时任务错误失败', updateError);
            }
            showMessage(`定时任务 "${presetName}" 执行失败: ${message}`, 5000, 'error');
        }
    }

    private async updateExecutionTime(presetName: string, preset: PresetItem, summary: string): Promise<void> {
        const now = Date.now();
        const nextExecuteTime = now + this.getNextDelay(preset);
        await this.aggregatorBlock.updatePreset(presetName, {
            lastExecuteTime: now,
            nextExecuteTime,
            lastRunError: undefined,
            lastRunSummary: summary,
        }, { skipUpdatedAt: true });
    }

    private isValidDailyTime(preset: PresetItem): boolean {
        return Number.isInteger(preset.dailyHour) && (preset.dailyHour as number) >= 0 && (preset.dailyHour as number) <= 23
            && Number.isInteger(preset.dailyMinute) && (preset.dailyMinute as number) >= 0 && (preset.dailyMinute as number) <= 59;
    }

    private getInitialDelay(preset: PresetItem): number {
        const now = Date.now();
        if (typeof preset.nextExecuteTime === 'number' && Number.isFinite(preset.nextExecuteTime) && preset.nextExecuteTime > now) {
            return preset.nextExecuteTime - now;
        }
        if ((preset.timerMode || 'interval') === 'daily') {
            const today = this.getDailyTimestamp(preset, 0);
            const last = preset.lastExecuteTime || 0;
            if (now >= today && last < today) return 60 * 1000;
            return now < today ? today - now : this.getDailyTimestamp(preset, 1) - now;
        }
        // A missed interval runs shortly after startup rather than waiting a full period.
        return preset.nextExecuteTime && preset.nextExecuteTime <= now ? 60 * 1000 : (preset.timerInterval as number);
    }

    private getNextDelay(preset: PresetItem): number {
        if ((preset.timerMode || 'interval') !== 'daily') return preset.timerInterval as number;
        return Math.max(0, this.getDailyTimestamp(preset, 1) - Date.now());
    }

    private getDailyTimestamp(preset: PresetItem, addDays: number): number {
        const date = new Date();
        date.setDate(date.getDate() + addDays);
        date.setHours(preset.dailyHour as number, preset.dailyMinute as number, 0, 0);
        return date.getTime();
    }

    stopTimer(presetName: string): void {
        const handle = this.timers.get(presetName);
        if (handle?.timeout) clearTimeout(handle.timeout);
        this.timers.delete(presetName);
    }

    stopAll(): void {
        for (const name of this.timers.keys()) this.stopTimer(name);
    }

    getActiveTimers(): string[] {
        return Array.from(this.timers.keys());
    }

    getTimerStatus(presetName: string): { active: boolean; nextExecuteTime?: number } {
        const handle = this.timers.get(presetName);
        return { active: !!handle, nextExecuteTime: handle?.nextExecuteTime };
    }

    async reloadTimer(presetName: string, preset: PresetItem): Promise<void> {
        this.stopTimer(presetName);
        if (preset.timerEnabled) await this.startTimer(presetName, preset);
    }
}
