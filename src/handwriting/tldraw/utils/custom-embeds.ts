/**
 * 自定义嵌入定义
 * 用于在 tldraw 中支持额外的嵌入内容类型
 */
import {
	CustomEmbedDefinition,
	DEFAULT_EMBED_DEFINITIONS,
	EmbedShapeUtil,
} from '@tldraw/tldraw'

export const bilibiliEmbed: CustomEmbedDefinition = {
	type: 'bilibili',
	title: 'Bilibili',
	hostnames: ['bilibili.com', 'www.bilibili.com', 'b23.tv'],
	minWidth: 300,
	minHeight: 200,
	width: 720,
	height: 480,
	doesResize: true,
	toEmbedUrl: (url: string) => {
		try {
			const urlObj = new URL(url)
			if (urlObj.hostname === 'b23.tv') {
				return undefined
			}
			const bvMatch = urlObj.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/)
			if (bvMatch) {
				const bvid = bvMatch[1]
				const page = urlObj.searchParams.get('p') || '1'
				return `https://player.bilibili.com/player.html?bvid=${bvid}&page=${page}&high_quality=1&danmaku=0`
			}
			const avMatch = urlObj.pathname.match(/\/video\/av(\d+)/)
			if (avMatch) {
				const aid = avMatch[1]
				const page = urlObj.searchParams.get('p') || '1'
				return `https://player.bilibili.com/player.html?aid=${aid}&page=${page}&high_quality=1&danmaku=0`
			}
			if (urlObj.hostname === 'player.bilibili.com') {
				return url
			}
			return undefined
		} catch {
			return undefined
		}
	},
	fromEmbedUrl: (url: string) => {
		try {
			const urlObj = new URL(url)
			if (urlObj.hostname !== 'player.bilibili.com') {
				return undefined
			}
			const bvid = urlObj.searchParams.get('bvid')
			const aid = urlObj.searchParams.get('aid')
			const page = urlObj.searchParams.get('page') || '1'
			if (bvid) {
				return page !== '1'
					? `https://www.bilibili.com/video/${bvid}?p=${page}`
					: `https://www.bilibili.com/video/${bvid}`
			}
			if (aid) {
				return page !== '1'
					? `https://www.bilibili.com/video/av${aid}?p=${page}`
					: `https://www.bilibili.com/video/av${aid}`
			}
			return undefined
		} catch {
			return undefined
		}
	},
	icon: 'https://www.bilibili.com/favicon.ico',
}

/**
 * 普通网页也允许作为 iframe 嵌入。
 *
 * 站点是否允许被 iframe 加载仍由目标站点的 CSP/X-Frame-Options 决定；
 * 对不允许嵌入的站点，用户仍可通过右键菜单切回书签。
 */
export const webpageEmbed: CustomEmbedDefinition = {
	type: 'webpage',
	title: '网页',
	hostnames: ['*'],
	minWidth: 300,
	minHeight: 200,
	width: 720,
	height: 500,
	doesResize: true,
	embedOnPaste: true,
	icon: '',
	toEmbedUrl: (url: string) => url,
	fromEmbedUrl: (url: string) => url,
}

export const customEmbedDefinitions: CustomEmbedDefinition[] = [
	bilibiliEmbed,
	webpageEmbed,
]

// 保留 tldraw 内置嵌入，同时支持哔哩哔哩和普通网页。
// DEFAULT_EMBED_DEFINITIONS 的内置定义不要求 icon，而 CustomEmbedDefinition 要求
// icon，因此在合并时使用 tldraw 的嵌入定义联合类型。
export const allEmbeds = [
	...DEFAULT_EMBED_DEFINITIONS,
	...customEmbedDefinitions,
]

export const ConfiguredEmbedShapeUtil = EmbedShapeUtil.configure({
	embedDefinitions: allEmbeds,
})
