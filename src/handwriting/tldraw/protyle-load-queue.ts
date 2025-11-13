type Runner = (signal: AbortSignal) => Promise<void>

interface Task {
	key: string
	priority: number
	runner: Runner
	controller: AbortController
	status: 'queued' | 'running' | 'done'
	order: number
	finished: Promise<void>
	resolve: () => void
	reject: (err: unknown) => void
}

export interface ProtyleLoadHandle {
	cancel(): void
	readonly finished: Promise<void>
	readonly signal: AbortSignal
}

class ProtyleLoadQueue {
	private tasks: Task[] = []
	private running = new Set<Task>()
	private orderSeed = 0

	constructor(private readonly concurrency: number) {}

	enqueue(key: string, priority: number, runner: Runner): ProtyleLoadHandle {
		const controller = new AbortController()
		let resolveFinished: () => void = () => {}
		let rejectFinished: (err: unknown) => void = () => {}
		const finished = new Promise<void>((resolve, reject) => {
			resolveFinished = resolve
			rejectFinished = reject
		})
		const task: Task = {
			key,
			priority,
			runner,
			controller,
			status: 'queued',
			order: this.orderSeed++,
			finished,
			resolve: () => {
				if (task.status !== 'done') {
					task.status = 'done'
					resolveFinished()
				}
			},
			reject: (err) => {
				if (task.status !== 'done') {
					task.status = 'done'
					rejectFinished(err)
				}
			},
		}

		this.tasks.push(task)
		this.sortQueue()
		this.process()

		const handle: ProtyleLoadHandle = {
			cancel: () => {
				if (task.status === 'done') return
				controller.abort()
				if (task.status === 'queued') {
					this.tasks = this.tasks.filter((item) => item !== task)
					task.resolve()
					this.process()
				}
			},
			finished,
			signal: controller.signal,
		}

		return handle
	}

	private sortQueue() {
		this.tasks.sort((a, b) => {
			if (a.priority !== b.priority) return a.priority - b.priority
			return a.order - b.order
		})
	}

	private process() {
		while (this.running.size < this.concurrency && this.tasks.length > 0) {
			const next = this.tasks.shift()!
			if (next.controller.signal.aborted) {
				next.resolve()
				continue
			}
			next.status = 'running'
			this.running.add(next)
			void this.runTask(next)
		}
	}

	private async runTask(task: Task) {
		try {
			await task.runner(task.controller.signal)
			if (task.controller.signal.aborted) {
				task.resolve()
			} else {
				task.resolve()
			}
		} catch (err) {
			if (task.controller.signal.aborted) {
				task.resolve()
			} else {
				task.reject(err)
			}
		} finally {
			this.running.delete(task)
			this.process()
		}
	}
}

const DEFAULT_CONCURRENCY = 2
const queue = new ProtyleLoadQueue(DEFAULT_CONCURRENCY)

export function enqueueProtyleLoad(key: string, priority: number, runner: Runner): ProtyleLoadHandle {
	return queue.enqueue(key, priority, runner)
}
