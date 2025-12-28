/**
 * CardShape 导出逻辑
 * 直接复制 DOM 结构，确保导出样式与实际渲染一致
 */
import React, { ReactElement } from 'react';
import {
	SvgExportContext,
	getDefaultColorTheme,
} from '@tldraw/tldraw';
import { ICardShape } from './card-shape-types';
import { settingdata } from '@/index';

// 扩展的关键样式属性列表
const EXTENDED_STYLE_PROPS = [
	'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
	'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-decoration',
	'text-transform', 'text-indent', 'vertical-align',
	'background', 'background-color', 'background-image', 'background-repeat',
	'background-position', 'background-size', 'background-attachment',
	'border', 'border-color', 'border-width', 'border-style', 'border-radius',
	'border-top', 'border-top-color', 'border-top-width', 'border-top-style',
	'border-bottom', 'border-bottom-color', 'border-bottom-width', 'border-bottom-style',
	'border-left', 'border-left-color', 'border-left-width', 'border-left-style',
	'border-right', 'border-right-color', 'border-right-width', 'border-right-style',
	'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
	'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
	'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
	'box-sizing',
	'display', 'flex', 'flex-direction', 'flex-wrap', 'flex-flow',
	'justify-content', 'align-items', 'align-content', 'gap', 'row-gap', 'column-gap',
	'grid', 'grid-template-columns', 'grid-template-rows', 'grid-template-areas',
	'grid-column', 'grid-row', 'grid-area',
	'position', 'top', 'bottom', 'left', 'right', 'z-index',
	'overflow', 'overflow-x', 'overflow-y', 'visibility', 'opacity',
	'box-shadow', 'text-shadow', 'outline', 'outline-color', 'outline-width', 'outline-style',
	'filter', 'backdrop-filter',
	'white-space', 'word-break', 'overflow-wrap', 'cursor', 'user-select', 'pointer-events',
];

// 需要移除的属性
const ATTRS_TO_REMOVE = [
	'contenteditable', 'data-node-id', 'data-node-index', 'updated',
	'data-realwidth', 'data-readonly', 'spellcheck', 'draggable', 'data-render',
	'srcset', 'loading', 'crossorigin',
];

/**
 * 二进制转 Base64
 */
function binaryToBase64(binary: string): string {
	let base64 = '';
	const chunkSize = 0x6000;
	for (let i = 0; i < binary.length; i += chunkSize) {
		const slice = binary.slice(i, i + chunkSize);
		let normalized = '';
		for (let j = 0; j < slice.length; j++) {
			normalized += String.fromCharCode(slice.charCodeAt(j) & 0xff);
		}
		base64 += btoa(normalized);
	}
	return base64;
}

/**
 * MIME 类型映射
 */
const MIME_MAP: Record<string, string> = {
	png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
	gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
	bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
	mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg',
};

/**
 * 将资源路径转换为 data URL
 */
function assetToDataUrl(rawSrc: string | null): string {
	if (!rawSrc) return '';
	const trimmed = rawSrc.trim();
	if (!trimmed || /^data:/i.test(trimmed) || /^https?:/i.test(trimmed) || trimmed.startsWith('//')) {
		return trimmed;
	}

	let logicalPath = trimmed.replace(/^\.\//, '');
	if (logicalPath.startsWith('/')) logicalPath = logicalPath.slice(1);

	let kernelPath = '';
	if (logicalPath.startsWith('assets/')) kernelPath = `/data/${logicalPath}`;
	else if (logicalPath.startsWith('data/')) kernelPath = `/${logicalPath}`;
	else if (logicalPath.startsWith('/data/')) kernelPath = logicalPath;
	else return trimmed;

	try {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', '/api/file/getFile', false);
		xhr.overrideMimeType('text/plain; charset=x-user-defined');
		xhr.setRequestHeader('Content-Type', 'application/json');
		xhr.send(JSON.stringify({ path: kernelPath }));
		if (xhr.status >= 200 && xhr.status < 300 && typeof xhr.responseText === 'string') {
			const base64 = binaryToBase64(xhr.responseText);
			const ext = (logicalPath.split('.').pop() || 'png').toLowerCase();
			const mime = MIME_MAP[ext] || 'application/octet-stream';
			return `data:${mime};base64,${base64}`;
		}
	} catch (err) {
		console.warn('Embedding asset failed', err);
	}
	return trimmed;
}

/**
 * 内联计算样式到元素
 */
function inlineComputedStyles(source: Element, target: Element, depth = 0): void {
	if (depth > 20) return;
	try {
		const computed = window.getComputedStyle(source);
		const styleText = EXTENDED_STYLE_PROPS
			.map((prop) => {
				const value = computed.getPropertyValue(prop);
				if (!value || value === 'none' || value === 'normal' || value === 'auto' || value === '0px') return '';
				return `${prop}:${value};`;
			})
			.filter(Boolean)
			.join('');

		const existing = target.getAttribute('style') || '';
		target.setAttribute('style', styleText + existing);
	} catch { }

	const sourceChildren = Array.from(source.children);
	const targetChildren = Array.from(target.children);
	const maxChildren = Math.min(sourceChildren.length, targetChildren.length, 200);
	for (let i = 0; i < maxChildren; i++) {
		const srcChild = sourceChildren[i];
		const tgtChild = targetChildren[i];
		if (srcChild && tgtChild) {
			inlineComputedStyles(srcChild, tgtChild, depth + 1);
		}
	}
}

/**
 * 处理图片元素
 */
function processImages(container: Element): void {
	container.querySelectorAll('img').forEach((img) => {
		const embedded = assetToDataUrl(img.getAttribute('src'));
		if (embedded) {
			img.setAttribute('src', embedded);
		}
		img.removeAttribute('crossorigin');
		img.removeAttribute('loading');
		img.removeAttribute('srcset');
		img.style.maxWidth = '100%';
		img.style.height = 'auto';
	});
}

/**
 * 处理视频元素
 */
function processVideos(container: Element): void {
	container.querySelectorAll('video').forEach((video) => {
		const poster = video.getAttribute('poster');
		if (poster) {
			const img = document.createElement('img');
			const embeddedPoster = assetToDataUrl(poster);
			img.setAttribute('src', embeddedPoster || poster);
			img.style.width = video.style.width || '100%';
			img.style.height = video.style.height || 'auto';
			img.style.objectFit = 'cover';
			video.replaceWith(img);
		} else {
			const placeholder = document.createElement('div');
			placeholder.style.cssText = `
				width: ${video.style.width || '100%'};
				height: ${video.style.height || '150px'};
				background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
				display: flex; align-items: center; justify-content: center;
				color: white; font-size: 14px; border-radius: 4px;
			`;
			placeholder.textContent = '🎬 Video';
			video.replaceWith(placeholder);
		}
	});
}

/**
 * 处理 Canvas 元素
 */
function processCanvases(container: Element): void {
	const originals = container.querySelectorAll('canvas');
	const clones = container.querySelectorAll('canvas');
	originals.forEach((canvas, index) => {
		const clonedCanvas = clones[index];
		if (clonedCanvas && canvas instanceof HTMLCanvasElement) {
			try {
				const dataUrl = canvas.toDataURL('image/png');
				const img = document.createElement('img');
				img.src = dataUrl;
				img.style.width = canvas.style.width || `${canvas.width}px`;
				img.style.height = canvas.style.height || `${canvas.height}px`;
				clonedCanvas.replaceWith(img);
			} catch {
				const placeholder = document.createElement('div');
				placeholder.style.cssText = `
					width: ${canvas.style.width || canvas.width + 'px'};
					height: ${canvas.style.height || canvas.height + 'px'};
					background: #f0f0f0; display: flex; align-items: center;
					justify-content: center; color: #666; font-size: 12px;
				`;
				placeholder.textContent = 'Canvas';
				clonedCanvas.replaceWith(placeholder);
			}
		}
	});
}

/**
 * 处理 Iframe 元素
 */
function processIframes(container: Element): void {
	container.querySelectorAll('iframe').forEach((iframe) => {
		const placeholder = document.createElement('div');
		placeholder.style.cssText = `
			width: ${iframe.style.width || '100%'};
			height: ${iframe.style.height || '150px'};
			background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
			display: flex; align-items: center; justify-content: center;
			color: white; font-size: 14px; border-radius: 4px;
		`;
		placeholder.textContent = '🌐 Embedded Content';
		iframe.replaceWith(placeholder);
	});
}

/**
 * 处理 SVG use 元素
 */
function processSvgUse(container: Element): void {
	container.querySelectorAll('svg use').forEach((use) => {
		const href = use.getAttribute('href') || use.getAttribute('xlink:href');
		if (href && href.startsWith('#')) {
			const targetId = href.slice(1);
			const target = document.getElementById(targetId);
			if (target) {
				const clonedTarget = target.cloneNode(true) as Element;
				clonedTarget.removeAttribute('id');
				use.replaceWith(clonedTarget);
			}
		}
	});
}

/**
 * 隐藏滚动条
 */
function hideScrollbars(container: Element): void {
	container.querySelectorAll('*').forEach((node) => {
		if (node instanceof HTMLElement) {
			node.style.setProperty('scrollbar-width', 'none', 'important');
			node.style.setProperty('-ms-overflow-style', 'none', 'important');
			node.style.setProperty('overflow', 'hidden', 'important');
		}
	});
}

/**
 * 从 DOM 复制卡片内容
 */
function copyCardContentFromDom(shape: ICardShape, isCollapsed: boolean): string {
	if (typeof document === 'undefined') return '';

	const host = document.getElementById(shape.id);
	if (!host) return '';

	const content = host.querySelector('[blockid]') as HTMLElement | null;
	if (!content) return '';

	const { w, h } = shape.props;
	const borderWidth = 3;
	const contentWidth = Math.max(w - borderWidth * 2, 1);
	const contentHeight = Math.max(h - borderWidth * 2, 1);

	// 查找折叠内容（第一个直接子元素div）
	let sourceElement: Element | null = null;
	if (isCollapsed) {
		// 折叠状态下，查找直接渲染的折叠内容元素
		const directDivs = Array.from(content.children).filter(
			child => child instanceof HTMLElement && child.tagName === 'DIV'
		);
		if (directDivs.length > 0) {
			sourceElement = directDivs[0];
		}
	}

	// 如果没有找到折叠内容，使用原来的 content
	if (!sourceElement) {
		sourceElement = content;
	}

	// 克隆内容
	const clone = sourceElement.cloneNode(true) as HTMLElement;

	// 内联计算样式
	inlineComputedStyles(sourceElement as Element, clone);

	// 清理不需要的属性
	ATTRS_TO_REMOVE.forEach((attr) => {
		clone.querySelectorAll(`[${attr}]`).forEach((el) => el.removeAttribute(attr));
	});

	// 处理各种媒体元素
	hideScrollbars(clone);
	processImages(clone);
	processVideos(clone);
	processCanvases(clone);
	processIframes(clone);
	processSvgUse(clone);

	// 设置容器样式
	clone.style.width = `${contentWidth}px`;
	clone.style.height = `${contentHeight}px`;
	clone.style.pointerEvents = 'none';
	clone.style.overflow = 'hidden';
	clone.style.boxSizing = 'border-box';

	return clone.outerHTML;
}

/**
 * 生成全局样式
 */
function generateGlobalStyles(): string {
	return `
		<style xmlns="http://www.w3.org/1999/xhtml">
			* { scrollbar-width: none !important; -ms-overflow-style: none !important; overflow: hidden !important; }
			a { color: inherit; text-decoration: none; }
			img { max-width: 100%; height: auto; }
		</style>
	`;
}

/**
 * 导出 CardShape 为 SVG 元素（直接复制 DOM）
 */
export function exportCardShapeToSvg(shape: ICardShape, ctx: SvgExportContext): ReactElement | null {
	const theme = getDefaultColorTheme({ isDarkMode: ctx.isDarkMode });
	const { w, h, color, fontSize = 16, blockId, isCollapsed } = shape.props;

	// 基础样式常量（与 component 保持一致）
	const borderWidth = 3;
	const radius = 10;
	const strokeColor = theme[color].solid;
	const fillColor = theme[color].semi;
	const showBorder = settingdata["showCardBorder"] !== false;

	// 内容区域尺寸
	const contentWidth = Math.max(w - borderWidth * 2, 1);
	const contentHeight = Math.max(h - borderWidth * 2, 1);

	// 裁剪路径 ID
	const clipId = `clip-${shape.id}`;

	// 空内容时的占位符
	const placeholder = (
		<text
			x={w / 2}
			y={h / 2}
			fill={strokeColor}
			fontSize={Math.min(fontSize * 0.9, 16)}
			dominantBaseline="middle"
			textAnchor="middle"
		>
			{blockId ? `Block ${blockId.slice(-6)}` : 'Card'}
		</text>
	);

	// 直接从 DOM 复制内容（支持折叠和非折叠状态）
	const serialized = copyCardContentFromDom(shape, isCollapsed);
	const globalStyles = serialized ? generateGlobalStyles() : '';

	return (
		<g>
			{/* 背景矩形：带边框和圆角 */}
			<rect
				width={w}
				height={h}
				fill={fillColor}
				stroke={strokeColor}
				strokeWidth={showBorder ? borderWidth : 0}
				rx={radius}
				ry={radius}
			/>
			{/* 内容区域：使用 clipPath 裁剪圆角 */}
			<defs>
				<clipPath id={clipId}>
					<rect
						x={borderWidth}
						y={borderWidth}
						width={contentWidth}
						height={contentHeight}
						rx={Math.max(radius - borderWidth, 0)}
						ry={Math.max(radius - borderWidth, 0)}
					/>
				</clipPath>
			</defs>
			{serialized ? (
				<foreignObject
					x={borderWidth}
					y={borderWidth}
					width={contentWidth}
					height={contentHeight}
					clipPath={`url(#${clipId})`}
				>
					<div
						xmlns="http://www.w3.org/1999/xhtml"
						style={{
							width: '100%',
							height: '100%',
							overflow: 'hidden',
							fontSize: isCollapsed ? undefined : `${fontSize}px`,
							backgroundColor: 'transparent',
							color: strokeColor,
						}}
						dangerouslySetInnerHTML={{ __html: `${globalStyles}${serialized}` }}
					/>
				</foreignObject>
			) : (
				placeholder
			)}
		</g>
	);
}
