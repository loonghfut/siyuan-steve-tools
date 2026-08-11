import { ContentLoadQueue, type ContentLoadHandle, type ContentLoadRunner } from './protyle-load-queue'

// DOMParser / innerHTML for a full SiYuan document can be expensive. Keep this
// separate from interactive Protyle creation. Two previews can fetch and build
// concurrently for responsive entry, while expensive follow-up rendering stays
// serialized by the idle scheduler.
const staticPreviewLoadQueue = new ContentLoadQueue(6)

export function enqueueStaticPreviewLoad(
	key: string,
	priority: number,
	runner: ContentLoadRunner,
): ContentLoadHandle {
	return staticPreviewLoadQueue.enqueue(key, priority, runner)
}
