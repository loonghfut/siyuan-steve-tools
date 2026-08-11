/**
 * 低优先级渲染调度器。
 *
 * 只负责决定何时启动任务；任务本身（尤其是 Protyle / AV 渲染）可能远超
 * 一个 idle slice，因此每个 idle callback 最多启动一个任务。
 */

export class IdleRenderCancelledError extends Error {
	constructor(message = 'Idle render was cancelled') {
		super(message)
		this.name = 'IdleRenderCancelledError'
	}
}

export function isIdleRenderCancelledError(error: unknown): error is IdleRenderCancelledError {
	return error instanceof IdleRenderCancelledError
}

interface IdleTask {
	id: string
	priority: number
	task: (signal: AbortSignal) => Promise<void> | void
	resolvers: Array<{ resolve: () => void; reject: (error: unknown) => void }>
	controller: AbortController
}

const hasIdleCallback = typeof requestIdleCallback !== 'undefined'

class IdleScheduler {
	private queue: IdleTask[] = []
	private runningTasks = new Map<string, AbortController>()
	private isProcessing = false
	private currentIdleId: number | null = null
	private isInteracting = false
	private interactionEndTimer: ReturnType<typeof setTimeout> | null = null

	private readonly INTERACTION_DELAY_MS = 150
	private readonly MIN_IDLE_TIME_MS = 10
	// Static Card preview tasks are queued behind this scheduler. A shorter
	// timeout keeps visible previews responsive when requestIdleCallback has no
	// generous idle slice, while still starting only one expensive task at once.
	private readonly IDLE_TASK_TIMEOUT_MS = 300

	setInteracting(value: boolean) {
		if (value) {
			this.isInteracting = true
			if (this.interactionEndTimer) {
				clearTimeout(this.interactionEndTimer)
				this.interactionEndTimer = null
			}
			return
		}

		if (this.interactionEndTimer) clearTimeout(this.interactionEndTimer)
		this.interactionEndTimer = setTimeout(() => {
			this.isInteracting = false
			this.interactionEndTimer = null
			this.scheduleProcessing()
		}, this.INTERACTION_DELAY_MS)
	}

	get interacting() {
		return this.isInteracting
	}

	/**
	 * 同 ID 的待执行任务采用 latest-wins：新的 closure / container 会替换旧的，
	 * 但所有等待该 ID 的调用方都会在最新任务结束后收到结果。
	 */
	schedule(id: string, task: (signal: AbortSignal) => Promise<void> | void, priority = 10): Promise<void> {
		return new Promise((resolve, reject) => {
			const existing = this.queue.find((queuedTask) => queuedTask.id === id)
			if (existing) {
				existing.task = task
				existing.priority = priority
				existing.controller.abort()
				existing.controller = new AbortController()
				existing.resolvers.push({ resolve, reject })
				this.queue.sort((a, b) => a.priority - b.priority)
				this.scheduleProcessing()
				return
			}

			// 如果同 ID 的旧任务已经开始，无法可靠中止其底层网络请求；通知它失效，
			// 并让新的任务排队使用最新 DOM。
			this.runningTasks.get(id)?.abort()
			this.queue.push({
				id,
				priority,
				task,
				resolvers: [{ resolve, reject }],
				controller: new AbortController(),
			})
			this.queue.sort((a, b) => a.priority - b.priority)
			this.scheduleProcessing()
		})
	}

	cancel(id: string) {
		const index = this.queue.findIndex((task) => task.id === id)
		if (index !== -1) {
			const [task] = this.queue.splice(index, 1)
			task.controller.abort()
			this.rejectTask(task, new IdleRenderCancelledError())
		}
		this.runningTasks.get(id)?.abort()
	}

	clear() {
		if (this.currentIdleId !== null && hasIdleCallback) {
			cancelIdleCallback(this.currentIdleId)
			this.currentIdleId = null
		}

		const cancellation = new IdleRenderCancelledError('Idle render queue was cleared')
		for (const task of this.queue) {
			task.controller.abort()
			this.rejectTask(task, cancellation)
		}
		this.queue = []
		for (const controller of this.runningTasks.values()) controller.abort()
		// 正在执行的异步任务仍会在 finally 中收尾；此处若提前置 false，
		// 后续新任务可能与它并发执行。
		if (this.runningTasks.size === 0) this.isProcessing = false
	}

	private scheduleProcessing() {
		if (this.isProcessing || this.queue.length === 0 || this.isInteracting) return
		this.isProcessing = true
		if (hasIdleCallback) {
			this.currentIdleId = requestIdleCallback(
				(deadline) => this.processQueue(deadline),
				{ timeout: this.IDLE_TASK_TIMEOUT_MS }
			)
		} else {
			setTimeout(() => this.processQueue(null), 0)
		}
	}

	private async processQueue(deadline: IdleDeadline | null) {
		this.currentIdleId = null
		try {
			if (this.isInteracting || this.queue.length === 0) return

			// timeout 是推进队列的兜底；此时 timeRemaining() 往往为 0，不能再 break。
			if (deadline && !deadline.didTimeout && deadline.timeRemaining() < this.MIN_IDLE_TIME_MS) return

			const task = this.queue.shift()
			if (!task) return
			this.runningTasks.set(task.id, task.controller)
			try {
				await task.task(task.controller.signal)
				if (task.controller.signal.aborted) {
					this.rejectTask(task, new IdleRenderCancelledError())
				} else {
					this.resolveTask(task)
				}
			} catch (error) {
				this.rejectTask(task, error)
			} finally {
				if (this.runningTasks.get(task.id) === task.controller) {
					this.runningTasks.delete(task.id)
				}
			}
		} finally {
			this.isProcessing = false
			if (this.queue.length > 0 && !this.isInteracting) this.scheduleProcessing()
		}
	}

	private resolveTask(task: IdleTask) {
		for (const { resolve } of task.resolvers) resolve()
	}

	private rejectTask(task: IdleTask, error: unknown) {
		for (const { reject } of task.resolvers) reject(error)
	}
}

export const idleScheduler = new IdleScheduler()

export function scheduleIdleRender(
	id: string,
	task: (signal: AbortSignal) => Promise<void> | void,
	priority = 10
): Promise<void> {
	return idleScheduler.schedule(id, task, priority)
}

export function cancelIdleRender(id: string) {
	idleScheduler.cancel(id)
}

export function setInteracting(value: boolean) {
	idleScheduler.setInteracting(value)
}

export function isInteracting(): boolean {
	return idleScheduler.interacting
}
