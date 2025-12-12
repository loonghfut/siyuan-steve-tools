import * as api from '@/api/api'

export type DatabaseDateFormat = 'YYYY-MM-DD' | 'YYYY/MM/DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'full' | 'relative'

export type CheckboxStyle = 'emoji' | 'symbol' | 'text'

export interface DatabaseAttributeEntry {
	avID: string
	keyID: string
	keyName: string
	keyType: string
	text: string
	rawValue: any
}

export interface DatabaseAttributeOptions {
	allowedTypes?: string[] | string
	hiddenFieldNames?: string[] | string
	maxEntries?: number
	dateFormat?: DatabaseDateFormat
	includeTime?: boolean
	checkboxStyle?: CheckboxStyle
	locale?: string
	forceRefresh?: boolean
}

interface AttributeCacheEntry {
	timestamp: number
	viewKeys: any[]
}

// const DEFAULT_ALLOWED_ATTRIBUTE_TYPES = [
// 	'text',
// 	'number',
// 	'date',
// 	'mSelect',
// 	'select',
// 	'checkbox',
// 	'url',
// 	'email',
// 	'phone',
// 	'mAsset',
// 	'created',
// 	'updated',
// 	'relation',
// 	'template',
// 	'block',
// ]

const ATTRIBUTE_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

const attributeCache = new Map<string, AttributeCacheEntry>()
const pendingRequests = new Map<string, Promise<any[]>>()

export function containsDatabaseAttributeMarker(html: string | null | undefined): boolean {
	if (!html) return false
	return html.includes('protyle-attr--av') || html.includes('#iconDatabase')
}

export function invalidateDatabaseAttributeCache(blockId: string): void {
	attributeCache.delete(blockId)
	pendingRequests.delete(blockId)
}

export function clearAllDatabaseAttributeCache(): void {
	attributeCache.clear()
	pendingRequests.clear()
}

export async function getDatabaseAttributesForBlock(
	blockId: string,
	options: DatabaseAttributeOptions = {}
): Promise<DatabaseAttributeEntry[]> {
	if (!blockId) return []

	const now = Date.now()
	const forceRefresh = options.forceRefresh === true

	const cached = !forceRefresh ? attributeCache.get(blockId) : undefined
	let viewKeys: any[] | null = null
	if (cached && now - cached.timestamp < ATTRIBUTE_CACHE_TTL) {
		viewKeys = cached.viewKeys
	}

	if (!viewKeys) {
		if (pendingRequests.has(blockId)) {
			viewKeys = await pendingRequests.get(blockId)!.catch(() => [])
		} else {
			const promise = fetchAttributeViewKeys(blockId)
			pendingRequests.set(blockId, promise)
			try {
				viewKeys = await promise
			} finally {
				pendingRequests.delete(blockId)
			}
		}
		attributeCache.set(blockId, { timestamp: Date.now(), viewKeys: viewKeys || [] })
	}

	return formatViewKeys(viewKeys || [], options)
}

async function fetchAttributeViewKeys(blockId: string): Promise<any[]> {
	try {
		const viewKeys = await api.getAttributeViewKeys(blockId)
		if (Array.isArray(viewKeys)) {
			return viewKeys
		}
	} catch (error) {
		console.warn('getAttributeViewKeys failed', error)
	}
	return []
}

function formatViewKeys(data: any[], options: DatabaseAttributeOptions): DatabaseAttributeEntry[] {
	if (!Array.isArray(data) || data.length === 0) return []

	// const allowedTypes = buildStringSet(options.allowedTypes ?? DEFAULT_ALLOWED_ATTRIBUTE_TYPES)
	const hiddenFields = buildStringSet(options.hiddenFieldNames)
	const result: DatabaseAttributeEntry[] = []

	for (const view of data) {
		const avID = typeof view?.avID === 'string' ? view.avID : view?.id ?? ''
		const keyValues: any[] = Array.isArray(view?.keyValues) ? view.keyValues : []

		for (const kv of keyValues) {
			const key = kv?.key
			if (!key) continue
			const keyType = typeof key.type === 'string' ? key.type : ''
			// if (allowedTypes.size > 0 && !allowedTypes.has(keyType)) continue
			const keyName = typeof key.name === 'string' ? key.name : ''
			if (keyName && hiddenFields.has(keyName.trim().toLowerCase())) continue

			// 只显示desc中包含'tldraw'的字段
			const keyDesc = typeof key.desc === 'string' ? key.desc : ''
			if (!keyDesc.includes('tldraw')) continue

			const formatted = formatAttributeValue(kv?.values, keyType, options)
			// 允许空字符串，但不允许null（保留没有值的属性）
			if (formatted === null) continue

			result.push({
				avID,
				keyID: typeof key.id === 'string' ? key.id : '',
				keyName,
				keyType,
				text: formatted,
				rawValue: kv?.values ?? null,
			})
		}
	}

	if (typeof options.maxEntries === 'number' && options.maxEntries > 0) {
		return result.slice(0, options.maxEntries)
	}

	return result
}

function formatAttributeValue(values: any, keyType: string, options: DatabaseAttributeOptions): string | null {
	if (!Array.isArray(values) || values.length === 0) return ''

	switch (keyType) {
		case 'checkbox': {
			return formatCheckbox(values[0]?.checkbox, options.checkboxStyle) || ''
		}
		case 'date': {
			return formatDateValue(values[0]?.date, options) || ''
		}
		case 'created': {
			return formatDateValue(values[0]?.created, options) || ''
		}
		case 'updated': {
			return formatDateValue(values[0]?.updated, options) || ''
		}
		case 'mSelect': {
			// select类型也返回mSelect格式的数据
			const selectValue = values[0]?.mSelect || values[0]?.select
			return selectValue ? formatSelect(selectValue) : ''
		}
		case 'select': {
			// select类型也返回mSelect格式的数据
			const selectValue = values[0]?.mSelect || values[0]?.select
			return selectValue ? formatSelect(selectValue) : ''
		}
		case 'relation': {
			return formatRelation(values[0]?.relation) || ''
		}
		case 'mAsset': {
			return formatAssets(values[0]?.mAsset) || ''
		}
		case 'number': {
			const num = values[0]?.number?.content
			if (num === undefined || num === null) return ''
			return `${num}`
		}
		case 'url': {
			return sanitizeString(values[0]?.url?.content) || ''
		}
		case 'email': {
			return sanitizeString(values[0]?.email?.content) || ''
		}
		case 'phone': {
			return sanitizeString(values[0]?.phone?.content) || ''
		}
		case 'template': {
			return sanitizeString(values[0]?.template?.content) || ''
		}
		case 'block': {
			const blockContent = values[0]?.block?.content || values[0]?.block?.id
			return sanitizeString(blockContent) || ''
		}
		default: {
			const texts: string[] = []
			for (const item of values) {
				if (item?.text?.content) {
					texts.push(item.text.content)
				}
			}
			if (texts.length > 0) {
				return texts.join(' | ')
			}
			const fallback = sanitizeString(values[0]?.text?.content)
			return fallback || ''
		}
	}
}

function formatCheckbox(checkbox: any, style: CheckboxStyle = 'symbol'): string | null {
	if (typeof checkbox?.checked !== 'boolean') return null
	const checked = checkbox.checked
	switch (style) {
		case 'symbol':
			return checked ? '☑' : '☐'
		case 'text':
			return checked ? 'Checked' : 'Unchecked'
		case 'emoji':
		default:
			return checked ? '✅' : '❌'
	}
}

function formatDateValue(dateValue: any, options: DatabaseAttributeOptions): string | null {
	if (!dateValue || typeof dateValue.content !== 'number') return null
	const includeTime = options.includeTime === true && dateValue.isNotTime !== true
	const dateFormat: DatabaseDateFormat = options.dateFormat ?? 'YYYY-MM-DD'
	const start = normalizeTimestamp(dateValue.content)
	const end = typeof dateValue.content2 === 'number' ? normalizeTimestamp(dateValue.content2) : null

	const startText = formatDate(start, dateFormat, includeTime, options.locale)
	if (!startText) return null
	if (dateValue.hasEndDate && end && end !== start) {
		const endText = formatDate(end, dateFormat, includeTime, options.locale)
		return endText ? `${startText} ~ ${endText}` : startText
	}
	return startText
}

function formatSelect(values: any): string | null {
	if (!Array.isArray(values) || values.length === 0) return null
	const labels = values
		.map((item) => sanitizeString(item?.content))
		.filter(Boolean)
	if (labels.length === 0) return null
	return labels.join(' | ')
}

function formatRelation(value: any): string | null {
	if (!value) return null
	let entries: any[] = []
	if (Array.isArray(value)) {
		entries = value
	} else if (Array.isArray(value.contents)) {
		entries = value.contents
	}
	if (entries.length === 0) return null
	const labels = entries
		.map((item) => {
			if (typeof item?.content === 'string') return item.content
			if (item?.block?.content) return item.block.content
			if (item?.block?.id) return item.block.id
			if (typeof item === 'string') return item
			return ''
		})
		.filter(Boolean)
	if (labels.length === 0) return null
	return labels.join(' | ')
}

function formatAssets(value: any): string | null {
	if (!Array.isArray(value) || value.length === 0) return null
	const names = value
		.map((item) => sanitizeString(item?.name))
		.filter(Boolean)
	return names.length ? names.join(', ') : null
}

function sanitizeString(input: any): string | null {
	if (typeof input === 'string') {
		const trimmed = input.trim()
		return trimmed.length > 0 ? trimmed : null
	}
	return null
}

function normalizeTimestamp(input: number): number {
	return input > 10000000000 ? input : input * 1000
}

function pad(num: number): string {
	return num < 10 ? `0${num}` : `${num}`
}

function formatDate(dateMs: number, format: DatabaseDateFormat, includeTime: boolean, locale?: string): string | null {
	if (!Number.isFinite(dateMs)) return null
	const date = new Date(dateMs)
	if (Number.isNaN(date.getTime())) return null

	if (format === 'full') {
		return date.toLocaleString(locale, {
			dateStyle: 'full',
			timeStyle: includeTime ? 'short' : undefined,
		})
	}

	if (format === 'relative' && typeof Intl !== 'undefined' && (Intl as any).RelativeTimeFormat) {
		const diff = date.getTime() - Date.now()
		const days = Math.round(diff / (1000 * 60 * 60 * 24))
		const rtf = new Intl.RelativeTimeFormat(locale ?? undefined, { numeric: 'auto' })
		return rtf.format(days, 'day')
	}

	const y = date.getFullYear()
	const m = pad(date.getMonth() + 1)
	const d = pad(date.getDate())
	const hh = pad(date.getHours())
	const mm = pad(date.getMinutes())

	let base: string
	switch (format) {
		case 'YYYY/MM/DD':
			base = `${y}/${m}/${d}`
			break
		case 'MM/DD/YYYY':
			base = `${m}/${d}/${y}`
			break
		case 'DD/MM/YYYY':
			base = `${d}/${m}/${y}`
			break
		case 'YYYY-MM-DD':
		default:
			base = `${y}-${m}-${d}`
	}

	return includeTime ? `${base} ${hh}:${mm}` : base
}

function buildStringSet(source?: string[] | string): Set<string> {
	if (!source) return new Set<string>()
	const list = Array.isArray(source) ? source : String(source).split(',')
	return new Set(list.map((item) => item.trim().toLowerCase()).filter(Boolean))
}
