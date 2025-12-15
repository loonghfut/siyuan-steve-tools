/**
 * 空闲调度器
 * 使用 requestIdleCallback 在浏览器空闲时执行低优先级任务
 * 避免在拖动画布等交互时阻塞主线程
 */

interface IdleTask {
	id: string
	priority: number  // 数字越小优先级越高
	task: () => Promise<void> | void
	resolve: () => void
	reject: (err: unknown) => void
}

// 判断是否支持 requestIdleCallback
const hasIdleCallback = typeof requestIdleCallback !== 'undefined'

class IdleScheduler {
	private queue: IdleTask[] = []
	private isProcessing = false
	// 当前的 idle callback ID，用于取消
	private _currentIdleId: number | null = null
	
	// 是否正在进行交互（拖动、缩放等）
	private _isInteracting = false
	
	// 交互结束后的延迟时间（毫秒）
	private readonly INTERACTION_DELAY_MS = 150
	
	// 每个空闲周期处理的最大任务数
	private readonly MAX_TASKS_PER_IDLE = 3
	
	// 单个任务的最大执行时间（毫秒）
	private readonly MAX_TASK_TIME_MS = 10
	
	private interactionEndTimer: ReturnType<typeof setTimeout> | null = null

	/**
	 * 标记交互开始（拖动、缩放等）
	 */
	setInteracting(value: boolean) {
		if (value) {
			this._isInteracting = true
			if (this.interactionEndTimer) {
				clearTimeout(this.interactionEndTimer)
				this.interactionEndTimer = null
			}
		} else {
			// 交互结束后延迟恢复处理
			if (this.interactionEndTimer) {
				clearTimeout(this.interactionEndTimer)
			}
			this.interactionEndTimer = setTimeout(() => {
				this._isInteracting = false
				this.interactionEndTimer = null
				this.scheduleProcessing()
			}, this.INTERACTION_DELAY_MS)
		}
	}

	get isInteracting() {
		return this._isInteracting
	}

	/**
	 * 调度一个任务在空闲时执行
	 * @param id 任务ID（用于去重）
	 * @param task 任务函数
	 * @param priority 优先级（数字越小优先级越高，默认为 10）
	 * @returns Promise，任务完成时 resolve
	 */
	schedule(id: string, task: () => Promise<void> | void, priority = 10): Promise<void> {
		// 检查是否已有相同 ID 的任务
		const existingIndex = this.queue.findIndex(t => t.id === id)
		if (existingIndex !== -1) {
			// 返回已有任务的 Promise
			return new Promise((resolve, reject) => {
				const existing = this.queue[existingIndex]
				const originalResolve = existing.resolve
				const originalReject = existing.reject
				existing.resolve = () => { originalResolve(); resolve() }
				existing.reject = (err) => { originalReject(err); reject(err) }
			})
		}

		return new Promise((resolve, reject) => {
			this.queue.push({
				id,
				priority,
				task,
				resolve,
				reject,
			})
			// 按优先级排序
			this.queue.sort((a, b) => a.priority - b.priority)
			this.scheduleProcessing()
		})
	}

	/**
	 * 取消指定 ID 的任务
	 */
	cancel(id: string) {
		const index = this.queue.findIndex(t => t.id === id)
		if (index !== -1) {
			const task = this.queue[index]
			this.queue.splice(index, 1)
			task.resolve() // 静默完成，不报错
		}
	}

	/**
	 * 清空所有待处理任务
	 */
	clear() {
		// 取消当前的 idle callback
		if (this._currentIdleId !== null && hasIdleCallback) {
			cancelIdleCallback(this._currentIdleId)
			this._currentIdleId = null
		}
		
		const tasks = this.queue
		this.queue = []
		for (const task of tasks) {
			task.resolve()
		}
		this.isProcessing = false
	}

	private scheduleProcessing() {
		if (this.isProcessing || this.queue.length === 0) return
		if (this._isInteracting) return // 交互时不处理

		this.isProcessing = true

		if (hasIdleCallback) {
			this._currentIdleId = requestIdleCallback(
				(deadline) => this.processQueue(deadline),
				{ timeout: 1000 } // 最长等待 1 秒
			)
		} else {
			// 降级使用 setTimeout
			setTimeout(() => this.processQueue(null), 0)
		}
	}

	private async processQueue(deadline: IdleDeadline | null) {
		let tasksProcessed = 0

		while (
			this.queue.length > 0 &&
			tasksProcessed < this.MAX_TASKS_PER_IDLE &&
			!this._isInteracting
		) {
			// 检查是否有剩余空闲时间
			if (deadline && deadline.timeRemaining() < this.MAX_TASK_TIME_MS) {
				break
			}

			const task = this.queue.shift()
			if (!task) break

			try {
				await task.task()
				task.resolve()
			} catch (err) {
				task.reject(err)
			}

			tasksProcessed++
		}

		this.isProcessing = false
		this._currentIdleId = null

		// 如果还有任务，继续调度
		if (this.queue.length > 0 && !this._isInteracting) {
			this.scheduleProcessing()
		}
	}
}

// 全局单例
export const idleScheduler = new IdleScheduler()

/**
 * 在空闲时执行渲染任务
 * @param id 任务ID
 * @param task 渲染任务
 * @param priority 优先级
 */
export function scheduleIdleRender(id: string, task: () => Promise<void> | void, priority = 10): Promise<void> {
	return idleScheduler.schedule(id, task, priority)
}

/**
 * 取消渲染任务
 */
export function cancelIdleRender(id: string) {
	idleScheduler.cancel(id)
}

/**
 * 标记交互状态
 */
export function setInteracting(value: boolean) {
	idleScheduler.setInteracting(value)
}

/**
 * 检查是否正在交互
 */
export function isInteracting(): boolean {
	return idleScheduler.isInteracting
}
