/**
 * 自定义嵌入定义
 * 用于在 tldraw 中支持额外的嵌入内容类型
 */
import {
	CustomEmbedDefinition,
	DEFAULT_EMBED_DEFINITIONS,
	EmbedShapeUtil,
} from '@tldraw/tldraw'

function normalizeSiyuanPluginUrl(url: string) {
	if (url.startsWith('siyuan://plugins/siyuan-steve-tools/')) {
		return `https://plugins/siyuan-steve-tools/${url.slice('siyuan://plugins/siyuan-steve-tools/'.length)}`
	}
	return url
}

function createPassthroughEmbedDefinition(
	type: string,
	title: string,
	hostnames: string[],
	icon: string,
	options?: Partial<CustomEmbedDefinition>
): CustomEmbedDefinition {
	return {
		type,
		title,
		hostnames,
		minWidth: 320,
		minHeight: 220,
		width: 960,
		height: 640,
		doesResize: true,
		toEmbedUrl: (url: string) => {
			try {
				const normalized = normalizeSiyuanPluginUrl(url)
				const parsed = new URL(normalized)
				if (!hostnames.includes(parsed.hostname)) return undefined
				return parsed.toString()
			} catch {
				return undefined
			}
		},
		fromEmbedUrl: (url: string) => {
			try {
				return new URL(url).toString()
			} catch {
				return undefined
			}
		},
		icon,
		...options,
	}
}

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

export const siyuanWhiteboardEmbed = createPassthroughEmbedDefinition(
	'siyuan-whiteboard',
	'思源白板',
	['plugins'],
	'https://assets.b3logfile.com/siyuan/favicon.png',
	{
		width: 1100,
		height: 720,
		toEmbedUrl: (url: string) => {
			try {
				const normalized = normalizeSiyuanPluginUrl(url)
				const parsed = new URL(normalized)
				if (parsed.hostname !== 'plugins') return undefined
				if (!parsed.pathname.startsWith('/siyuan-steve-tools/')) return undefined
				return parsed.toString()
			} catch {
				return undefined
			}
		},
	}
)

export const wpsEmbed = createPassthroughEmbedDefinition(
	'wps-document',
	'WPS',
	['kdocs.cn', 'www.kdocs.cn'],
	'https://www.kdocs.cn/favicon.ico',
	{
		width: 1080,
		height: 720,
	}
)

export const webPageEmbed = createPassthroughEmbedDefinition(
	'web-page',
	'网页',
	[
		'docs.qq.com',
		'doc.weixin.qq.com',
		'mp.weixin.qq.com',
		'yuque.com',
		'www.yuque.com',
		'notion.so',
		'www.notion.so',
		'notion.site',
		'www.notion.site',
	],
	'https://www.google.com/s2/favicons?domain=www.example.com&sz=64'
)

export const customEmbedDefinitions: CustomEmbedDefinition[] = [
	siyuanWhiteboardEmbed,
	wpsEmbed,
	webPageEmbed,
	bilibiliEmbed,
]

export const allEmbeds = [...DEFAULT_EMBED_DEFINITIONS, ...customEmbedDefinitions]

export const ConfiguredEmbedShapeUtil = EmbedShapeUtil.configure({
	embedDefinitions: allEmbeds,
})
