import React from 'react';
import { createRoot } from 'react-dom/client'; // 添加这个导入
import { CardShapeTool } from './CardShape/CardShapeTool'
import { CardShapeUtil } from './CardShape/CardShapeUtil'
import { SingleBlockShapeTool } from './SingleBlockShape/SingleBlockShapeTool'
import { SingleBlockShapeUtil, SingleBlockBindingUtil } from './SingleBlockShape/SingleBlockShapeUtil'
import { BezierConnectorShapeUtil, BezierConnectorBindingUtil, PointingPort } from './BezierConnectorShape'
import { components, uiOverrides } from './ui-overrides'
import {
    Tldraw,
    TldrawOptions,
    defaultShapeUtils,
    TLStore,
    Editor,
    TLShapeId,
    TLShape,
    defaultBindingUtils,
    ArrowShapeUtil,
    createShapeId,
    getIndices,
    toRichText,
    renderPlaintextFromRichText,
} from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import '../custom-tldraw.css';
import { initCardsWithBlockIds } from './CardShape/card-shape-migrations';
import { createTLStore, getSnapshot, loadSnapshot, throttle } from '@tldraw/tldraw';
import * as api from '@/api/api';
import { SlideShapeUtil } from './SlideShape/SlideShapeUtil';
import { SlideShapeTool } from './SlideShape/SlideShapeTool';
import { captureSlideScreenshot, CaptureSlideScreenshotOptions, CaptureSlideScreenshotResult } from './SlideShape/captureSlideScreenshot';
import { getSlides } from './SlideShape/useSlides';
import { ICardShape } from './CardShape/card-shape-types';
import { showMessage, Dialog } from 'siyuan';
import { WhiteboardFileManager } from './whiteboard-file-manager';
import TldrawBackupManager from './ui/tldraw-backup-manager.svelte';
import { settingdata } from '@/index';
import { JsShapeUtil } from './JsShape/JsShapeUtil';
import { JsShapeTool } from './JsShape/JsShapeTool';
import { MindMapShapeUtil } from './MindMapShape/MindMapShapeUtil';
import { MindMapShapeTool } from './MindMapShape/MindMapShapeTool';
import { BranchShapeUtil } from './BranchShape/BranchShapeUtil';
import { BranchShapeTool } from './BranchShape/BranchShapeTool';
import { keepBranchLayoutsUpdated } from './BranchShape/keep-branch-layouts-updated';
import { setupDoubleClickHandler } from './utils/setupDoubleClickHandler';
import { allEmbeds } from './utils/custom-embeds';
import { tldrawkey } from '@/../my/key';
import { setupShapeLibraryDropHandler } from './shapelibrary/ShapeLibraryPanel';
import { buildTldrawLink } from './utils/link-builder';
import { setInteracting } from './utils/idle-scheduler';
import { registerInstance, unregisterInstance } from './tldraw-instance-manager';
import { createAssetUrlsWithCustomIcons } from './utils/custom-icons';
import { createAgentBusinessShape } from './agent/shape-ops';
import type { AgentAlignOperation, AgentArrangeOperation, AgentBasicShapeCreateArgs, AgentConnectorCreateArgs, AgentCreateShapeArgs, AgentCreateShapeResult, AgentShapeSummary, AgentShapeUpdatePatch } from './agent/types';
import { finiteNumberInRange, normalizeOptionalAgentColor } from './agent/schema';
import { insertDocOutlineMindmapForAgent, type AgentDocOutlineBoardOptions } from './agent/doc-to-board';
import { createOrUpdateConnectorBinding } from './BezierConnectorShape';
import { getBestPortPair, getPortPagePosition } from './BezierConnectorShape/port-utils';
import { convertConnectorsToArrow, convertConnectorsToBezier } from './utils/connector-convert';
import { createMindMapNode } from './MindMapShape/mind-map-shape-types';
import { DEFAULT_SCRIPT } from './JsShape/static';
const assetUrls = createAssetUrlsWithCustomIcons();


// There's a guide at the bottom of this file!

// [1]
// 配置精准箭头功能
const configuredArrowShapeUtil = ArrowShapeUtil.configure({
    shouldBeExact: (editor, isPrecise) => settingdata['tldraw-exact-arrow-mode'] && isPrecise,
})
// 从默认形状工具中过滤掉原始的ArrowShapeUtil，避免重复定义
const filteredDefaultShapeUtils = defaultShapeUtils.filter(util => util.type !== 'arrow')
const customShapeUtils = [...filteredDefaultShapeUtils, configuredArrowShapeUtil, CardShapeUtil, SingleBlockShapeUtil, SlideShapeUtil, JsShapeUtil, MindMapShapeUtil, BranchShapeUtil, BezierConnectorShapeUtil]
const customBindingUtils = [...defaultBindingUtils, SingleBlockBindingUtil, BezierConnectorBindingUtil]
const customTools = [CardShapeTool, SingleBlockShapeTool, SlideShapeTool, JsShapeTool, MindMapShapeTool, BranchShapeTool]

/**
 * TldrawManager类，用于管理tldraw实例和操作
 */
export class TldrawManager {
    private id: string;
    private container: HTMLElement;
    private tldrawComponent
    private root: any; // 添加 root 属性
    private blockIds: string[] = [];
    private store: TLStore; // 存储 TLDraw 的数据
    private editor: Editor; // 引用 TLDraw 编辑器实例
    private storageKey: string; // 存储键值
    // 在 TldrawManager 类中添加一个标志
    private dropHandled;
    // 最小字段：保存 dragstart/dragend 处理函数引用
    private _dragStartHandler: ((e: DragEvent) => void) | null = null;
    private _dragEndHandler: (() => void) | null = null;
    private applyingRemoteChanges = false;
    private title: string;
    private themeObserver: MutationObserver | null = null;
    private _autosaveUnsub: (() => void) | null = null;
    private _realtimeUnsub: (() => void) | null = null;
    private _broadcastChannel: BroadcastChannel | null = null;
    private _destroying = false;
    private _destroyed = false;
    private _mouseDownPos: { x: number; y: number } | null = null;
    private _isDragging = false;

    constructor(id: string, container: HTMLElement, blockIds?: string[], title?: string) {
        this.id = id;
        this.title = title || `画板-${id}`;
        this.container = container;
        this.blockIds = blockIds || [];
        this.storageKey = `tldraw-data-${this.id}`;
        this.store = createTLStore({
            shapeUtils: customShapeUtils,
            bindingUtils: customBindingUtils,
        });

        // 将当前实例注册到实例管理器
        registerInstance(this.id, this);

        // 初始化tldraw
        this.initialize();
    }



    /**
     * 初始化tldraw组件
     */
    private async initialize() {
        if (this._destroyed) return;
        // 清空container中的旧内容（如果有）
        this.container.innerHTML = '';
        const root = document.createElement('div');
        root.style.width = '100%';
        root.style.height = '100%';
        this.container.appendChild(root);
        try {
            // 加载之前保存的数据
            await this.loadData();
            if (this._destroyed) return;
            // 原先每次初始化自动清理未被任何 shape 引用的 asset，改为手动触发以避免在初始化时误删
            // 只有在加载成功后才渲染
            console.debug("加载数据成功，开始渲染Tldraw");
            this.renderTldraw(root);
        } catch (error) {
            // 加载数据失败，停止初始化并显示错误信息
            console.error("初始化 Tldraw 失败，无法加载数据:", error);
            showMessage("加载画板数据失败，请检查数据文件或联系开发者。", 5000, "error");

            // 在 root 中显示错误信息和强制加载按钮
            root.innerHTML = `
                <div style="padding: 20px; color: red; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                    <p>加载画板数据失败，请不要用低版本的插件，打开高版本的tldraw数据，请检查控制台获取更多信息。</p>
                    <p style="color: orange; margin-top: 10px;">您可以强制创建一个新的空白画板，但这将导致无法加载的数据丢失！！！。</p>
                    <button id="force-load-tldraw-${this.id}" style="margin-top: 15px; padding: 8px 15px; cursor: pointer;">强制创建新画板</button>
                </div>
            `;

            // 为按钮添加事件监听器
            const forceLoadButton = root.querySelector(`#force-load-tldraw-${this.id}`);
            if (forceLoadButton) {
                // 点击“强制创建新画板”时，先尝试备份原始数据再创建新画板
                forceLoadButton.addEventListener('click', async () => {
                    // 提示开始备份
                    // showMessage('正在备份原始数据到回收站...', 3000, 'info');

                    // 优先尝试使用当前 store 的快照备份
                    try {
                        const fname = await this.backupToTrash('强制创建前备份');
                        // 向用户显示备份文件名，方便查找与恢复
                        showMessage('备份已保存到回收站: ' + fname, 3000, 'info');
                    } catch (err) {
                        // 如果快照备份失败，回退到读取并备份原始文件内容（如果存在）
                        try {
                            const raw = await api.getFile(`/data/storage/petal/sttools/${this.storageKey}.json`);
                            if (raw) {
                                // api.getFile 可能返回解析后的对象或字符串，确保写入的是字符串
                                const content = typeof raw === 'string' ? raw : JSON.stringify(raw);
                                const trashFileName = `${this.storageKey}-forced-backup-${Date.now()}.json`;
                                await api.putFile(`/data/storage/petal/sttools/trash/${trashFileName}`, false, new Blob([content], { type: 'application/json' }));
                                showMessage('备份已保存到回收站: ' + trashFileName, 3000, 'info');
                            } else {
                                showMessage('未找到原始存储文件，未进行文件级备份', 3000, 'info');
                            }
                        } catch (err2) {
                            console.error('强制创建前备份失败', err2);

                            // 当两次备份方式都失败时，弹出二次确认，交由用户选择继续或取消
                            try {
                                const userConfirmed = window.confirm('尝试自动备份原始数据失败。是否仍旧强制创建新的空白画板？\n\n选择「确定」将强制创建，并可能导致原始数据无法恢复。选择「取消」将保留错误提示，您可以稍后尝试手动备份或联系开发者。');
                                if (!userConfirmed) {
                                    // 用户选择取消：不创建新画板，仅通知
                                    showMessage('已取消强制创建，原始数据未被删除。', 5000, 'info');
                                    return; // 中止后续流程
                                } else {
                                    showMessage('用户确认强制创建：将创建新的空白画板。', 3000, 'info');
                                }
                            } catch (confirmErr) {
                                // 如果在某些环境下 window.confirm 不可用，继续创建并告警
                                console.warn('无法弹出确认框，继续强制创建', confirmErr);
                                return;
                            }
                        }
                    }

                    // 清空错误信息并渲染一个新的 Tldraw 实例
                    root.innerHTML = '';
                    showMessage('正在创建新的空白画板...', 3000, 'info');
                    this.renderTldraw(root);
                });
            }
        }
    }

    /**
     * 在 store 中查找未被任何 shape 引用的 asset 并删除它们。
     * 这是一个防止积累无用资源的简单扫描器，会遍历 shape 的 props 并
     * 将出现的 asset id 标记为被引用。仅删除未被引用的 asset 记录。
     */
    private async pruneUnusedAssets(): Promise<void> {
        if (!this.store) return;

        try {
            const assets = this.store.query.records('asset').get();
            if (!assets || assets.length === 0) return;

            const assetIds = assets.map((a: any) => String(a.id));
            const referenced = new Set<string>();

            const shapes = this.store.query.records('shape').get() || [];

            const scanValue = (val: any) => {
                if (val == null) return;
                if (typeof val === 'string') {
                    // 仅当字符串恰好等于 asset id 时标记（避免误判）
                    const s = val as string;
                    if (assetIds.includes(s)) referenced.add(s);
                    return;
                }
                if (Array.isArray(val)) {
                    for (const item of val) scanValue(item);
                    return;
                }
                if (typeof val === 'object') {
                    for (const k of Object.keys(val)) {
                        scanValue(val[k]);
                    }
                }
            };

            for (const shape of shapes) {
                // 检查常见的 asset 引用字段
                try {
                    // shape.props 里可能嵌套 asset 引用
                    scanValue((shape as any).props);
                    // 有些 shape 可能还在其他位置引用 asset（例如截图等）
                    scanValue((shape as any).screenshot);
                    scanValue((shape as any).src);
                } catch { /* ignore */ }
            }

            const unused = assetIds.filter(id => !referenced.has(id));
            if (unused.length > 0) {
                console.debug(`Pruning ${unused.length} unused asset(s) from TLStore`, unused);
                try {
                    // 类型系统方面，强制转换为 any[] 以便调用 remove
                    this.store.remove(unused as any);
                    // 保存更改
                    try { await this.saveData(); } catch { /* ignore save failure */ }
                } catch (err) {
                    console.error('删除未使用 asset 失败：', err);
                }
            }
        } catch (err) {
            console.warn('pruneUnusedAssets encountered error', err);
        }
    }

    /**
    * 加载保存的数据
    * @returns Promise<boolean> 是否加载成功
    */
    private async loadData(): Promise<boolean> {
        try {
            // 使用统一文件管理器加载数据
            const dataContent = await WhiteboardFileManager.readWhiteboardFile(this.id);

            if (dataContent) {
                // console.debug("加载到数据", dataContent);
                // 尝试解析和加载快照
                try {
                    const data = JSON.parse(dataContent);
                    loadSnapshot(this.store, data);
                    console.debug('已加载保存的画布数据');
                    return true; // 加载成功
                } catch (parseError) {
                    console.error('解析或加载快照失败', parseError);
                    // 如果解析或加载失败，也视为加载失败，抛出错误
                    throw new Error('加载画布数据失败：数据格式错误');
                }
            }
            return true; // 没有数据也算成功（使用空状态）
        } catch (error) {
            console.error('加载画布数据失败', error);
            // 抛出错误，中断后续操作
            throw error;
        }
    }

    private async saveData() {
        try {
            const snapshot = getSnapshot(this.store);
            const jsonData = JSON.stringify(snapshot);

            // 保存到思源笔记的存储中
            const result = await WhiteboardFileManager.saveWhiteboardFile(this.id, jsonData);
            if (result.success) {
                console.debug('画布数据已保存');
            } else {
                console.error('保存画布数据失败:', result.error);
            }
        } catch (error) {
            console.error('保存画布数据失败', error);
        }
    }

    // 性能优化：使用更激进的节流策略
    private _throttledSave: (() => void) | null = null;
    private _pendingSave = false;
    private _saveTimer: ReturnType<typeof setTimeout> | null = null;

    private getThrottledSave() {
        if (!this._throttledSave) {
            // 使用更激进的节流：500ms内最多保存一次
            this._throttledSave = throttle(() => {
                if (this._pendingSave) {
                    this._pendingSave = false;
                    this.saveData();
                }
            }, 500);
        }
        return this._throttledSave;
    }

    private triggerSave() {
        this._pendingSave = true;
        this.getThrottledSave()();
    }


    private options: Partial<TldrawOptions> = {
        createTextOnCanvasDoubleClick: settingdata['enableDoubleClickCreateSingleBlock'] ? false : true,
        maxFontsToLoadBeforeRender: 10,
        cameraSlideFriction: 1,
    }
    /**
     * 渲染tldraw组件
     */
    private renderTldraw(rootElement: HTMLElement) {
        const isGridMode = settingdata['isGridMode'] || false; // 是否网格模式
        // 防止外部字体加载的配置
        const blockIds = this.blockIds;
        const id = this.id;
        const store = this.store;
        api.setBlockAttrs(id, {
            'custom-sttools-tldraw': '1',
            'bookmark': 'st-tldraw'
        })
        // 生成 tldraw 组件
        const tldrawComponent = (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}
                className="tldraw__editor"
                data-tldraw-id={this.id}
                data-tldraw-title={this.title}>
                <Tldraw
                    licenseKey={tldrawkey}
                    store={store}
                    shapeUtils={customShapeUtils}
                    bindingUtils={customBindingUtils}
                    tools={customTools}
                    overrides={uiOverrides}
                    options={this.options}
                    inferDarkMode={isDarkTheme()}
                    components={components}
                    embeds={allEmbeds}
                    onMount={(editor) => {
                        this.editor = editor;
                        editor.user.updateUserPreferences({ isSnapMode:  settingdata['isSnapMode'] || false })
                        this.applyThemeToEditor();
                        this.setupThemeObserver();
                        // 设置自动保存功能
                        this.setupAutosave();
                        this.setupRealtimeSync(editor);
                        editor.on('sttools:importData', () => {
                            this.importData().catch(err => {
                                console.error('导入数据失败:', err);
                                showMessage('导入数据失败');
                            });
                        });
                        editor.on('sttools:exportData', () => {
                            this.backupData().catch(err => {
                                console.error('备份数据失败:', err);
                                showMessage('备份数据失败');
                            });
                        });
                        editor.on('sttools:backupData', () => {
                            this.backupToTrash("手动备份").then((filename) => {
                                showMessage('备份数据成功，文件名: ' + filename);
                            }
                            ).catch(err => {
                                console.error('备份数据失败:', err);
                                showMessage('备份数据失败');
                            }
                            );
                        });
                        editor.on('sttools:pruneAssets', async () => {
                            try {
                                await this.pruneUnusedAssets();
                                showMessage('未使用资源检查并清理完成');
                            } catch (err) {
                                console.error('清理未使用资源失败', err);
                                showMessage('清理未使用资源失败，请查看控制台', 5000, 'error');
                            }
                        });
                        editor.on('sttools:rollbackData', () => {
                            try {
                                const dialog = new Dialog({
                                    title: `画板备份回滚 - ${this.title}`,
                                    content: `<div id="TldrawBackupManager" style="height: 520px"></div>`,
                                    width: '900px',
                                    destroyCallback: () => {
                                        try { panel.$destroy(); } catch (e) { /* ignore */ }
                                    }
                                });

                                // Mount the Svelte backup manager and pass the current drawing id so it auto-filters
                                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                                // @ts-ignore
                                const panel = new TldrawBackupManager({
                                    target: dialog.element.querySelector('#TldrawBackupManager'),
                                    props: {
                                        initialDrawingId: this.id,
                                    }
                                });
                            } catch (err) {
                                console.error('打开备份管理面板失败', err);
                                showMessage('打开备份管理面板失败，请检查控制台', 5000, 'error');
                            }
                        });
                        editor.updateInstanceState({ isGridMode: isGridMode });
                        // editor.user.updateUserPreferences({ animationSpeed: 0 });
                        // this.editor.navigateToDeepLink();
                        // 只有在没有已保存数据的情况下才初始化卡片
                        if (editor.getCurrentPageShapes().length === 0 && blockIds.length > 0) {
                            initCardsWithBlockIds(editor, blockIds, {
                                startX: 50,
                                startY: 50,
                            });
                        }

                        // 设置双击画布创建 single-block 的处理器
                        if (settingdata['enableDoubleClickCreateSingleBlock'] !== false) {
                            setupDoubleClickHandler(editor);
                        }
                        
                        // 设置贝塞尔连接器的交互状态机
                        try {
                            const selectTool = editor.getStateDescendant('select');
                            if (selectTool) {
                                selectTool.addChild(PointingPort);
                            }
                        } catch (err) {
                            console.warn('设置 PointingPort 状态机失败', err);
                        }
                        
                        // 设置素材库拖放处理程序
                        setupShapeLibraryDropHandler(editor);

                        // 保持 Branch 在子形状尺寸变化后同步重排
                        keepBranchLayoutsUpdated(editor);
                        
                        // 设置交互状态监听，用于优化拖动时的性能
                        // 在拖动、缩放画布时暂停内容加载和渲染
                        this.setupInteractionStateListener(editor);

                        // 点击画布背景时清除页面文本选区，避免残留选区影响后续操作
                        try {
                            const editorContainer = editor.getContainer();
                            
                            const mouseDownHandler = (ev: MouseEvent) => {
                                this._mouseDownPos = { x: ev.clientX, y: ev.clientY };
                                this._isDragging = false;
                            };
                            
                            const mouseMoveHandler = (ev: MouseEvent) => {
                                if (this._isDragging || !this._mouseDownPos) return;
                                
                                const dx = ev.clientX - this._mouseDownPos.x;
                                const dy = ev.clientY - this._mouseDownPos.y;
                                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                                    this._isDragging = true;
                                }
                            };
                            
                            const mouseUpHandler = () => {
                                this._mouseDownPos = null;
                                setTimeout(() => {
                                    this._isDragging = false;
                                }, 50);
                            };
                            
                            const canvasClickHandler = (ev: MouseEvent) => {
                                try {
                                    const target = ev.target as HTMLElement | null;
                                    if (!target) return;

                                    if (this._isDragging) return;

                                    // 排除思源编辑器内容
                                    if (target.closest('.protyle-wysiwyg') || target.closest('[contenteditable="true"]')) return;

                                    // 排除 tldraw 自身的形状元素，包括文本框
                                    // tldraw 的形状有 .tl-shape 类，文本编辑时会有 .tl-text 或 .tl-html-container
                                    if (target.closest('.tl-shape') ||
                                        target.closest('.tl-grid') ||
                                        target.closest('.tl-canvas') ||
                                        target.closest('.tl-text') ||
                                        target.closest('.tl-html-container') ||
                                        target.closest('[data-shape-id]') ||
                                        target.closest('.tl-scribble') ||
                                        target.closest('.tl-embed') ||
                                        target.closest('.tl-connector')) {
                                        return;
                                    }

                                    // 排除 tldraw UI 元素
                                    if (target.closest('.tlui') ||
                                        target.closest('[data-testid="canvas"]') ||
                                        target.closest('.tlui-input') ||
                                        target.closest('.tlui-button') ||
                                        target.closest('.tlui-tooltip') ||
                                        target.closest('.slide-shape-name-input')) {
                                        return;
                                    }

                                    // 只有点击画布背景时才清除选区
                                    if (window.getSelection) {
                                        const sel = window.getSelection();
                                        if (sel && !sel.isCollapsed) sel.removeAllRanges();
                                    }
                                    if (document.activeElement instanceof HTMLElement) {
                                        try { (document.activeElement as HTMLElement).blur(); } catch { }
                                    }
                                } catch { }
                            };
                            
                            (this as any)._canvasMouseDownHandler = mouseDownHandler;
                            (this as any)._canvasMouseMoveHandler = mouseMoveHandler;
                            (this as any)._canvasMouseUpHandler = mouseUpHandler;
                            (this as any)._canvasClickHandler = canvasClickHandler;
                            
                            editorContainer.addEventListener('mousedown', mouseDownHandler);
                            editorContainer.addEventListener('mousemove', mouseMoveHandler);
                            editorContainer.addEventListener('mouseup', mouseUpHandler);
                            editorContainer.addEventListener('click', canvasClickHandler);
                        } catch (err) {
                            console.warn('注册画布点击清除选区监听器失败', err);
                        }
                        
                        // 添加全局拖放事件监听
                        const container = editor.getContainer();

                        const handleDrop = async (e: DragEvent) => {
                            e.preventDefault();
                            e.stopPropagation();

                            // 增加防重复处理机制
                            const now = Date.now();
                            if (this.dropHandled && now - this.dropHandled < 300) {
                                return;
                            }
                            this.dropHandled = now;

                            // 解析拖拽数据
                            const blockIdo_rigin = e.dataTransfer!.types[0];
                            console.debug('拖拽的数据类型', e);
                            console.debug('拖拽的数据类型', blockIdo_rigin);
                            // 使用正则表达式提取块ID
                            let blockId = '';
                            let docname = '';
                            // 处理文档大纲条目拖放
                            if (e.dataTransfer!.types.includes('application/doc-outline-block')) {
                                try {
                                    const data = e.dataTransfer!.getData('application/doc-outline-block');
                                    const parsed = JSON.parse(data);
                                    blockId = parsed.blockId;
                                    console.debug('文档大纲拖放的块ID', blockId);
                                } catch (err) {
                                    console.error('解析文档大纲拖放数据失败:', err);
                                    return;
                                }
                            } else if (e.dataTransfer!.types.includes('application/child-doc')) {
                                // 处理子文档拖放
                                try {
                                    const data = e.dataTransfer!.getData('application/child-doc');
                                    const parsed = JSON.parse(data);
                                    blockId = parsed.docId;
                                    console.debug('子文档拖放的文档', parsed);
                                    docname = parsed.docName || '';
                                    console.debug('子文档拖放', blockId);
                                } catch (err) {
                                    console.error('解析子文档拖放数据失败:', err);
                                    return;
                                }
                            } else if (blockIdo_rigin.startsWith('application/siyuan')) {
                                const matches = blockIdo_rigin.match(/(\d{14}-\w{7})/g);
                                if (matches && matches.length > 0) {
                                    blockId = matches[0]; // 获取第一个匹配的块ID
                                    console.debug('从数据类型中提取的块ID', blockId);
                                }
                            }
                            if (blockIdo_rigin.startsWith('application/siyuan-file') && (window as any).__st_dragNodeId) {
                                blockId = (window as any).__st_dragNodeId;
                            }
                            if (!blockId) {
                                console.debug('未能识别拖拽的块ID');
                                return;
                            }
                            console.debug('识别到的块ID', blockId);
                            // 获取鼠标在画布上的位置
                            const { x, y } = editor.screenToPage({
                                x: e.clientX,
                                y: e.clientY,
                            });
                            const idid = await api.generateSiyuanID();
                            const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
                            let aproblock: string;
                            // const content = (await api.getBlockKramdown(blockId)).kramdown;
                            /**
                             * 将 linkMarkdown 插入到 kramdown 内容末尾（但在 IAL/attribute block 之前）
                             * - 如果是 heading 类型（isHeading === true），将 link 插入到最后一行（heading 行）后面： `###### 标题 [🔗](...)`
                             * - 否则，将 link 作为独立的行插入到内容末尾（在 IAL 之前）
                             */
                            // Use class-level helper to create updated content with link to avoid adding link inside IAL/attribute block
                            // const appendLinkToKramdown = this.appendLinkToKramdown.bind(this);
                            // console.debug("拖拽块的内容", content);
                            if (blockIdo_rigin.includes('nodeheading')) {
                                aproblock = blockId;
                                const link = buildTldrawLink(this.id, aproblock, this.title);
                                // 将链接保存到块的自定义属性中
                                await api.setBlockAttrs(aproblock, { 'custom-tldraw-link': link ,'custom-st-tldraw':"1"})
                            } else if (blockIdo_rigin.includes('paragraph')) {
                                aproblock = blockId;
                                // 将链接保存到块的自定义属性中
                                const link = buildTldrawLink(this.id, aproblock, this.title);
                                await api.setBlockAttrs(aproblock, { 'custom-tldraw-link': link ,'custom-st-tldraw-single':"1"})
                            } else if (blockIdo_rigin.startsWith('application/siyuan-file')) {
                                aproblock = blockId;
                                await api.prependBlock("markdown", `((${blockId} '${(window as any).__st_dragName || ''}'))`, this.id)
                            } else if (blockIdo_rigin.startsWith('application/doc-outline-block')) {
                                aproblock = blockId;
                                console.debug("拖拽的是文档大纲块");
                                const link = buildTldrawLink(this.id, aproblock, this.title);
                                await api.setBlockAttrs(aproblock, { 'custom-tldraw-link': link ,'custom-st-tldraw':"1"})
                            } else if(blockIdo_rigin.startsWith('application/child-doc')) {
                                aproblock = blockId;
                                console.debug("拖拽的是子文档块");
                                await api.prependBlock("markdown", `((${blockId} '${docname}'))`, this.id)
                            } else {
                                aproblock = idid as string;
                                const link = buildTldrawLink(this.id, aproblock, this.title);
                                await api.insertBlock("markdown", `###### ${timestamp}
{: id="${idid}" custom-st-tldraw="1" custom-tldraw-link="${link}"}`, blockId)
                            }
                            // 创建新的Card形状
                            // console.debug("创建新的卡片形状",  aproblock[0].doOperations[0].id);
                            if (blockIdo_rigin.startsWith('application/siyuan-file')||blockIdo_rigin.includes('application/child-doc')) {
                                editor.createShape({
                                    type: 'card',
                                    x: x, // 默认宽度的一半，使形状中心在鼠标位置
                                    y: y, // 默认高度的一半
                                    props: {
                                        w: 500,
                                        h: 700,
                                        color: 'black',
                                        showMask: true,
                                        blockId: aproblock,
                                        isMain: true,
                                        isCollapsed: true, // 拖拽进来默认为折叠状态
                                    },
                                });
                            } else if (blockIdo_rigin.includes('paragraph')) {
                                editor.createShape({
                                    type: 'single-block',
                                    x: x, // 默认宽度的一半，使形状中心在鼠标位置
                                    y: y, // 默认高度的一半
                                    props: {
                                        w: 300,
                                        h: 50,
                                        color: 'black',
                                        blockId: aproblock,
                                    },
                                });
                            } else {
                                editor.createShape({
                                    type: 'card',
                                    x: x, // 默认宽度的一半，使形状中心在鼠标位置
                                    y: y, // 默认高度的一半
                                    props: {
                                        w: 300,
                                        h: 300,
                                        color: 'black',
                                        showMask: true,
                                        blockId: aproblock,
                                        isCollapsed: false, // 拖拽进来默认为折叠状态
                                    },
                                });
                            }
                            // api.setBlockAttrs(blockId, {
                            //     'custom-st-tldraw': '1',
                            // });
                            // console.debug(`已在(${x}, ${y})位置创建包含块ID ${blockId} 的卡片`);
                        };

                        // 注册最小 dragstart/dragend，用于捕获同页拖拽元素的 data-node-id
                        this._dragStartHandler = (ev: DragEvent) => {
                            const el = ev.target as HTMLElement | null;
                            try {
                                (window as any).__st_dragNodeId = el ? (el.dataset?.nodeId || el.getAttribute('data-node-id')) : null;
                                (window as any).__st_dragName = el ? (el.dataset?.name || el.getAttribute('data-name')) : null;
                            } catch (err) {
                                (window as any).__st_dragNodeId = null;
                                (window as any).__st_dragName = null;
                            }
                        };
                        this._dragEndHandler = () => {
                            try { (window as any).__st_dragNodeId = null; } catch (e) { }
                            try { (window as any).__st_dragName = null; } catch (e) { }
                        };
                        document.addEventListener('dragstart', this._dragStartHandler, true);
                        document.addEventListener('dragend', this._dragEndHandler, true);

                        // 添加拖放事件监听器
                        container.addEventListener('drop', handleDrop);

                        // 删除组件块逻辑 — 将不同类型的 Shape 分开处理
                        editor.sideEffects.registerAfterDeleteHandler('shape', async (shape) => {
                            // Only handle the shape types we care about
                            if (shape.type === 'card') {
                                await this.handleCardShapeDeletion(editor, shape as ICardShape);
                            } else if (shape.type === 'single-block') {
                                await this.handleSingleBlockDeletion(editor, shape as ICardShape);
                            } else {
                                // Ignore other shape types
                                return;
                            }
                        });

                        // 每次新建的 slide/frame/branch 形状默认在最底层
                        editor.sideEffects.registerAfterCreateHandler('shape', (shape) => {
                            if (shape.type === 'slide' || shape.type === 'frame' || shape.type === 'branch') {
                                editor.sendToBack([shape.id]);
                            }
                        });


                    }}
                    assetUrls={assetUrls}
                />
            </div>
        );

        // 使用新的 createRoot API
        const root = createRoot(rootElement);
        root.render(tldrawComponent);
        this.root = root;
    }
    /**
     * 设置实时同步功能
     */
    private setupRealtimeSync(Meditor: Editor) {
        if (!this.store || !this.editor) return;
        // console.debug("设置实时同步功能");
        // 创建一个专用于此TLDraw实例的广播频道
        const channelName = `tldraw-sync-${this.id}`;
        const broadcastChannel = new BroadcastChannel(channelName);
        this._broadcastChannel = broadcastChannel;

        // 为识别消息源，生成一个唯一的会话ID
        const sessionId = Date.now().toString() + Math.random().toString(36).slice(2);

        // 性能优化：使用节流减少广播频率
        let broadcastPending = false;
        let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
        let pendingChanges: any = null;

        const flushBroadcast = () => {
            if (broadcastTimer) {
                clearTimeout(broadcastTimer);
                broadcastTimer = null;
            }
            if (pendingChanges) {
                broadcastChannel.postMessage({
                    changes: pendingChanges,
                    timestamp: Date.now(),
                    source: sessionId
                });
                pendingChanges = null;
                broadcastPending = false;
            }
        };

        // 监听本地变更并广播
        this._realtimeUnsub = this.store.listen(
            (update) => {
                // 如果当前正在应用远程更改，不广播以避免循环
                if (this.applyingRemoteChanges) return;

                // 性能优化：合并快速连续的操作
                if (!broadcastPending) {
                    broadcastPending = true;
                    pendingChanges = update;
                    // 16ms后发送，合并同一帧内的多次操作
                    broadcastTimer = setTimeout(flushBroadcast, 16);
                } else {
                    // 合并更新：保留最新的changes
                    pendingChanges = update;
                }
            },
            { scope: 'document', source: 'user' } // 只监听用户操作引起的文档变更
        );

        // 监听来自其他页签的更新
        broadcastChannel.onmessage = (event) => {
            // 忽略自己发出的事件
            // console.debug("收到远程TLDraw更改:", event.data);
            if (event.data.source === sessionId) {
                // console.debug("忽略自己发出的事件AAAA:", event.data.source, sessionId);
                return;
            }

            try {
                this.applyingRemoteChanges = true;

                // 应用远程更改到本地存储
                Meditor.store.mergeRemoteChanges(() => {
                    // console.debug("应用远程TLDraw更改:", event.data.changes.changes);
                    // 应用收到的变更
                    Meditor.store.applyDiff(event.data.changes.changes);
                });

            } catch (err) {
                console.error('应用远程TLDraw更改失败:', err);
            } finally {
                this.applyingRemoteChanges = false;
            }
        };
        // console.debug('已设置实时同步功能');
    }
    /**
     * 将 linkMarkdown 插入到 kramdown 内容末尾（但在 IAL/attribute block 之前）
     * - 如果是 heading 类型（isHeading === true），将 link 插入到最后一行（heading 行）后面： `###### 标题 [🔗](...)`
     * - 否则，将 link 作为独立的行插入到内容末尾（在 IAL 之前）
     */
    // private appendLinkToKramdown(origContent: string, linkMarkdown: string, linkUrl: string, isHeading = false) {
    //     if (!origContent) return linkMarkdown;
    //     // 检查是否已有该链接
    //     if (origContent.includes(linkUrl)) return origContent;

    //     // 尝试匹配结尾处的 IAL / attribute block：以换行 + '{:' 开头并以 '}' 结尾
    //     const attrMatch = origContent.match(/(\n\{:\s*[\s\S]*?\}\s*)$/);
    //     if (attrMatch) {
    //         const attrs = attrMatch[1];
    //         const before = origContent.slice(0, origContent.length - attrs.length);
    //         if (isHeading) {
    //             const lines = before.split('\n');
    //             const lastLine = lines.pop() || '';
    //             const newLastLine = `${lastLine}${lastLine.endsWith(' ') ? '' : ' '}${linkMarkdown}`;
    //             lines.push(newLastLine);
    //             return lines.join('\n') + attrs;
    //         } else {
    //             const trimmedBefore = before.replace(/[\s\n]+$/, '');
    //             // 直接在内容后面加链接，不要加换行
    //             const sep = trimmedBefore.endsWith(' ') ? '' : ' ';
    //             return `${trimmedBefore}${sep}${linkMarkdown}${attrs}`;
    //         }
    //     } else {
    //         // 没有 IAL
    //         if (isHeading) {
    //             const lines = origContent.split('\n');
    //             const lastLine = lines.pop() || '';
    //             const newLastLine = `${lastLine}${lastLine.endsWith(' ') ? '' : ' '}${linkMarkdown}`;
    //             lines.push(newLastLine);
    //             return lines.join('\n');
    //         } else {
    //             const trimmed = origContent.replace(/[\s\n]+$/, '');
    //             // 直接在内容后面加链接，不要加换行
    //             const sep = trimmed.endsWith(' ') ? '' : ' ';
    //             return `${trimmed}${sep}${linkMarkdown}`;
    //         }
    //     }
    // }
    
    /**
     * 设置交互状态监听器
     * 在拖动画布、缩放、移动形状等操作时通知空闲调度器暂停后台任务
     * 这样可以避免在交互时加载内容导致卡顿
     */
    private setupInteractionStateListener(editor: Editor) {
        // 跟踪交互状态的变量
        let isCurrentlyInteracting = false;
        let interactionDebounceTimer: ReturnType<typeof setTimeout> | null = null;
        
        const startInteraction = () => {
            if (interactionDebounceTimer) {
                clearTimeout(interactionDebounceTimer);
                interactionDebounceTimer = null;
            }
            if (!isCurrentlyInteracting) {
                isCurrentlyInteracting = true;
                setInteracting(true);
            }
        };
        
        const endInteraction = () => {
            // 使用防抖，避免在快速连续操作时频繁切换状态
            if (interactionDebounceTimer) {
                clearTimeout(interactionDebounceTimer);
            }
            interactionDebounceTimer = setTimeout(() => {
                isCurrentlyInteracting = false;
                setInteracting(false);
                interactionDebounceTimer = null;
            }, 100);
        };
        
        // 监听编辑器事件来检测交互状态
        // tldraw 的 Editor 会在工具状态变化时触发事件
        const checkInteractionState = () => {
            try {
                const currentPath = editor.getPath();
                // 这些状态表示正在进行交互操作
                const interactingStates = [
                    'select.translating',      // 拖动形状
                    'select.resizing',         // 调整大小
                    'select.rotating',         // 旋转
                    'select.brushing',         // 框选
                    'select.scribble_brushing', // 涂鸦选择
                    'hand.dragging',           // 手型工具拖动
                    'zoom.zooming',            // 缩放
                ];
                
                const isInteracting = interactingStates.some(state => currentPath.includes(state));
                
                if (isInteracting) {
                    startInteraction();
                } else {
                    endInteraction();
                }
            } catch {
                // 忽略错误
            }
        };
        
        // 监听指针事件来检测画布拖动
        const container = editor.getContainer();
        let isPointerDown = false;
        
        const handlePointerDown = (e: PointerEvent) => {
            isPointerDown = true;
            // 如果是鼠标中键或按住空格键拖动画布
            if (e.button === 1 || (e.button === 0 && e.target === container.querySelector('.tl-background'))) {
                startInteraction();
            }
        };
        
        const handlePointerMove = () => {
            if (isPointerDown) {
                // 检查当前工具状态
                checkInteractionState();
            }
        };
        
        const handlePointerUp = () => {
            isPointerDown = false;
            endInteraction();
        };
        
        // 监听滚轮事件（缩放）
        const handleWheel = () => {
            startInteraction();
            // 滚轮缩放后短暂延迟结束交互状态
            if (interactionDebounceTimer) {
                clearTimeout(interactionDebounceTimer);
            }
            interactionDebounceTimer = setTimeout(() => {
                isCurrentlyInteracting = false;
                setInteracting(false);
                interactionDebounceTimer = null;
            }, 200);
        };
        
        container.addEventListener('pointerdown', handlePointerDown, { passive: true });
        container.addEventListener('pointermove', handlePointerMove, { passive: true });
        container.addEventListener('pointerup', handlePointerUp, { passive: true });
        container.addEventListener('pointercancel', handlePointerUp, { passive: true });
        container.addEventListener('wheel', handleWheel, { passive: true });
        
        // 使用 store 监听器来检测形状变化（拖动、调整大小等）
        // 性能优化：增加节流间隔，减少CPU占用
        const unsubscribe = editor.store.listen(
            throttle(() => {
                checkInteractionState();
            }, 100), // 从50ms增加到100ms，减少CPU占用
            { source: 'user', scope: 'document' }
        );
        
        // 清理函数（在 destroy 时调用）
        const cleanup = () => {
            if (interactionDebounceTimer) {
                clearTimeout(interactionDebounceTimer);
            }
            container.removeEventListener('pointerdown', handlePointerDown);
            container.removeEventListener('pointermove', handlePointerMove);
            container.removeEventListener('pointerup', handlePointerUp);
            container.removeEventListener('pointercancel', handlePointerUp);
            container.removeEventListener('wheel', handleWheel);
            unsubscribe();
            setInteracting(false);
        };
        
        // 保存清理函数以便后续调用
        (this as any)._interactionCleanup = cleanup;
    }
    
    /**
     * 设置自动保存功能
     */
    private setupAutosave() {
        if (!this.store) return;

        // 使用节流函数确保不会过于频繁地保存
        // 性能优化：使用更激进的节流策略，避免频繁保存
        const throttledSave = throttle(() => {
            this.triggerSave();
        }, 2000); // 2秒节流，减少等待时间

        // 监听存储变化，只监听用户操作
        this._autosaveUnsub = this.store.listen(throttledSave, {
            scope: 'document',
            source: 'user' // 只监听用户操作，减少不必要的保存
        });
    }

    private applyThemeToEditor() {
        if (!this.editor) return;
        const isDark = isDarkTheme();
        try {
            this.editor.user.updateUserPreferences({ colorScheme: isDark ? 'dark' : 'light' });
        } catch (err) {
            console.warn('更新 tldraw 主题偏好失败', err);
        }
    }

    private setupThemeObserver() {
        if (this.themeObserver) return;
        const target = document.documentElement;
        if (!target) return;
        this.themeObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme-mode') {
                    this.applyThemeToEditor();
                    break;
                }
            }
        });
        this.themeObserver.observe(target, { attributes: true, attributeFilter: ['data-theme-mode'] });
    }

    /**
     * 获取tldraw实例
     */
    public getTldraw() {
        return this.tldrawComponent;
    }

    /**
     * 立即保存当前画布状态
     */
    public async saveCurrentState() {
        await this.saveData();
    }

    /**
         * 备份当前画布数据为JSON文件
         */
    public async backupData(): Promise<void> {
        try {
            // 获取当前画布数据快照

            const snapshot = getSnapshot(this.store);
            const jsonData = JSON.stringify(snapshot, null, 2);

            // 创建Blob对象
            const blob = new Blob([jsonData], { type: 'application/json' });

            // 创建下载链接
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const filename = `tldraw-backup-${this.id}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();

            // 清理
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 0);

            return Promise.resolve();
        } catch (error) {
            console.error('备份画布数据失败', error);
            return Promise.reject(error);
        }
    }
    /**
     * 导入画布数据
     * @returns Promise
     */
    public async importData(): Promise<void> {
        try {
            // 创建文件选择器
            return new Promise<void>((resolve, reject) => {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = '.json';
                fileInput.style.display = 'none';
                document.body.appendChild(fileInput);

                // 监听文件选择
                fileInput.onchange = async (event) => {
                    try {
                        const file = (event.target as HTMLInputElement).files?.[0];
                        if (!file) {
                            document.body.removeChild(fileInput);
                            return reject(new Error('未选择文件'));
                        }

                        // 读取文件内容
                        const reader = new FileReader();
                        reader.onload = async (e) => {
                            try {
                                // 解析JSON数据
                                const jsonData = e.target?.result as string;
                                const data = JSON.parse(jsonData);

                                // 首先保存当前状态作为备份
                                await this.backupToTrash('导入前备份');

                                // 重置编辑器状态
                                if (this.editor) {
                                    // 加载导入的数据快照
                                    try {
                                        loadSnapshot(this.store, data);

                                        // 保存导入的数据
                                        await this.saveData();

                                        showMessage('画布数据导入成功');
                                        resolve();
                                    } catch (err) {
                                        console.error('加载导入数据失败:', err);
                                        showMessage('导入数据格式错误，请确保是有效的TLDraw备份文件');
                                        reject(err);
                                    }
                                } else {
                                    reject(new Error('编辑器实例未初始化'));
                                }
                            } catch (err) {
                                console.error('解析导入的JSON数据失败:', err);
                                showMessage('解析导入文件失败，请确保文件格式正确');
                                reject(err);
                            }
                            document.body.removeChild(fileInput);
                        };

                        reader.onerror = () => {
                            console.error('读取文件内容失败');
                            showMessage('读取文件内容失败');
                            document.body.removeChild(fileInput);
                            reject(new Error('读取文件内容失败'));
                        };

                        // 开始读取文件
                        reader.readAsText(file);
                    } catch (err) {
                        document.body.removeChild(fileInput);
                        reject(err);
                    }
                };

                // 用户取消选择
                fileInput.onabort = () => {
                    document.body.removeChild(fileInput);
                    reject(new Error('用户取消选择文件'));
                };

                // 触发文件选择对话框
                fileInput.click();
            });
        } catch (err) {
            console.error('导入画布数据失败:', err);
            return Promise.reject(err);
        }
    }
    private async backupToTrash(reason: string = '自动备份'): Promise<string> {
        try {
            // 获取当前数据
            const snapshot = getSnapshot(this.store);
            const jsonData = JSON.stringify(snapshot);
            console.debug('备份数据:', jsonData);

            // 使用统一文件管理器备份
            const result = await WhiteboardFileManager.backupWhiteboardData(this.id, jsonData, {
                reason,
                includeTimestamp: true,
            });

            if (!result.success) {
                throw new Error(result.error || '备份失败');
            }

            return result.fileName!;
        } catch (err) {
            console.error('备份数据到回收站失败:', err);
            throw err;
        }
    }
    /**
     * 清除当前画布数据
     * @param removeStorage 是否也从持久化存储中删除数据
     */
    public async clearData(removeStorage: boolean = false): Promise<void> {
        try {
            // 先创建备份，以防误操作
            await this.saveCurrentState();

            // 重置编辑器到空状态
            if (this.editor) {
                this.editor.selectAll();
                this.editor.deleteShapes(this.editor.getSelectedShapes());
            }

            // 如果需要，从存储中删除持久化数据
            if (removeStorage) {
                try {
                    const result = await WhiteboardFileManager.deleteWhiteboardFile(this.id, {
                        reason: '清空画板',
                    });
                    
                    if (result.success) {
                        showMessage('已将画布数据移动到回收站: ' + result.fileName);
                    } else {
                        console.warn('删除存储文件失败:', result.error);
                    }
                } catch (err) {
                    // 如果文件不存在，忽略错误
                    console.warn('删除存储文件失败，可能文件不存在', err);
                }
            }

            return Promise.resolve();
        } catch (error) {
            console.error('清除画布数据失败', error);
            return Promise.reject(error);
        }
    }

    /**
     * 销毁tldraw实例和清理资源
     */
    public async destroy(options?: { skipSave?: boolean; reason?: string }) {
        if (this._destroyed || this._destroying) return;
        this._destroying = true;

        // 销毁前保存当前状态（数据文件已被删除时必须跳过，否则会被重新写回）
        if (!options?.skipSave) {
            try {
                await this.saveData();
            } catch (err) {
                console.warn('destroy(): saveData failed', err);
            }
        }

        // 清理交互状态监听器
        try {
            const interactionCleanup = (this as any)._interactionCleanup;
            if (typeof interactionCleanup === 'function') {
                interactionCleanup();
                (this as any)._interactionCleanup = null;
            }
        } catch (err) {
            console.warn('清理交互状态监听器出错', err);
        }

        // 取消订阅 store listeners / 广播频道
        try {
            if (this._autosaveUnsub) {
                this._autosaveUnsub();
                this._autosaveUnsub = null;
            }
        } catch { /* ignore */ }
        try {
            if (this._realtimeUnsub) {
                this._realtimeUnsub();
                this._realtimeUnsub = null;
            }
        } catch { /* ignore */ }
        try {
            if (this._broadcastChannel) {
                this._broadcastChannel.close();
                this._broadcastChannel = null;
            }
        } catch { /* ignore */ }

        // 清空容器
        this.container.innerHTML = '';

        // 移除我们注册的最小 drag 监听器并清理全局临时值
        try {
            if (this._dragStartHandler) {
                document.removeEventListener('dragstart', this._dragStartHandler, true);
                this._dragStartHandler = null;
            }
            if (this._dragEndHandler) {
                document.removeEventListener('dragend', this._dragEndHandler, true);
                this._dragEndHandler = null;
            }
            try { (window as any).__st_dragNodeId = null; } catch (e) { }
        } catch (err) {
            console.warn('移除 drag 监听器出错', err);
        }

        // 移除画布点击清除选区监听器
        try {
            const clickHandler = (this as any)._canvasClickHandler as ((ev: MouseEvent) => void) | undefined;
            const mouseDownHandler = (this as any)._canvasMouseDownHandler as ((ev: MouseEvent) => void) | undefined;
            const mouseMoveHandler = (this as any)._canvasMouseMoveHandler as ((ev: MouseEvent) => void) | undefined;
            const mouseUpHandler = (this as any)._canvasMouseUpHandler as (() => void) | undefined;
            
            if (this.editor) {
                try {
                    const container = this.editor.getContainer();
                    if (clickHandler) {
                        container.removeEventListener('click', clickHandler);
                    }
                    if (mouseDownHandler) {
                        container.removeEventListener('mousedown', mouseDownHandler);
                    }
                    if (mouseMoveHandler) {
                        container.removeEventListener('mousemove', mouseMoveHandler);
                    }
                    if (mouseUpHandler) {
                        container.removeEventListener('mouseup', mouseUpHandler);
                    }
                } catch (e) { /* ignore */ }
            }
            (this as any)._canvasClickHandler = null;
            (this as any)._canvasMouseDownHandler = null;
            (this as any)._canvasMouseMoveHandler = null;
            (this as any)._canvasMouseUpHandler = null;
        } catch (err) {
            console.warn('移除画布点击清除选区监听器失败', err);
        }

        if (this.themeObserver) {
            this.themeObserver.disconnect();
            this.themeObserver = null;
        }

        // 销毁React根节点
        if (this.root) {
            this.root.unmount();
        }

        this.tldrawComponent = null;

        // 如果是因为数据被删除而销毁，向用户展示说明而不是简单清空容器
        if (options?.reason === 'data-deleted') {
            try {
                // 清空并展示说明文字
                this.container.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:center;height:100%;padding:16px;box-sizing:border-box;">
                        <div style="max-width:640px;text-align:center;color:var(--b3-theme-secondary);">
                            <h3 style="margin:0 0 8px 0;color:var(--b3-theme-on-surface);">画板数据已被删除</h3>
                            <div>此画板对应的数据文件已从存储中删除。已为您关闭画板实例以避免出现未定义行为。</div>
                            <div style="margin-top:8px;font-size:0.85em;color:var(--b3-theme-secondary);">如果需要，可重新创建新画板或从回收站恢复备份文件。</div>
                        </div>
                    </div>
                `;
            } catch (err) {
                try { this.container.innerHTML = ''; } catch { /* ignore */ }
            }
        } else {
            try { this.container.innerHTML = ''; } catch { /* ignore */ }
        }

        // 从实例管理器中注销当前实例
        unregisterInstance(this.id);

        this._destroyed = true;
        this._destroying = false;
    }

    /**
     * 根据思源块ID查找对应的形状
     * @param blockId 思源块ID
     * @returns 对应的形状ID，如果未找到则返回null
     */
    public findShapeByBlockId(blockId: string): TLShapeId | null {
        if (!this.editor) return null;

        const shapes = this.editor.getCurrentPageShapes();
        // console.debug("查找形状", blockId, shapes);
        const cardShape = shapes.find(shape =>
            (shape.type === 'card' || shape.type === 'single-block' || shape.type === 'slide') &&
            (shape as ICardShape).props?.blockId === blockId
        );

        return cardShape?.id || null;
    }

    public getAgentSummary() {
        const shapes = this.store.query.records('shape').get() || [];
        const assets = this.store.query.records('asset').get() || [];
        const pages = this.store.query.records('page').get() || [];
        const selectedShapeIds = this.editor ? this.editor.getSelectedShapeIds().map(String) : [];
        const shapeTypeCounts = shapes.reduce<Record<string, number>>((acc, shape: any) => {
            const type = String(shape.type || 'unknown');
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {});

        const sampleShapes = shapes.slice(0, 20).map((shape: any) => ({
            id: String(shape.id),
            type: String(shape.type),
            x: Number(shape.x || 0),
            y: Number(shape.y || 0),
            props: summarizeShapeProps(shape.props),
        }));

        return {
            id: this.id,
            title: this.title,
            isOpen: Boolean(this.editor),
            pageCount: pages.length,
            shapeCount: shapes.length,
            assetCount: assets.length,
            selectedShapeIds,
            shapeTypeCounts,
            sampleShapes,
        };
    }

    public createAgentShape(options: AgentCreateShapeArgs): AgentCreateShapeResult & { summary: ReturnType<TldrawManager['getAgentSummary']> } {
        if (!this.editor) {
            throw new Error('Tldraw editor is not initialized');
        }

        const result = createAgentBusinessShape(this.editor, options);
        this.syncAgentCreatedBlockAttrs(result);
        this.triggerSave();
        return {
            ...result,
            summary: this.getAgentSummary(),
        };
    }

    public async insertDocOutlineMindmapForAgent(options: AgentDocOutlineBoardOptions) {
        if (!this.editor) {
            throw new Error('Tldraw editor is not initialized');
        }

        const result = await insertDocOutlineMindmapForAgent(this.editor, options);
        this.triggerSave();
        return {
            ...result,
            summary: this.getAgentSummary(),
        };
    }

    public selectAgentShape(shapeId: string, zoom = true): { selectedShapeIds: string[] } {
        if (!this.editor) {
            throw new Error('Tldraw editor is not initialized');
        }
        const id = shapeId as TLShapeId;
        const shape = this.editor.getShape(id);
        if (!shape) {
            throw new Error(`Shape not found: ${shapeId}`);
        }
        this.editor.select(id);
        if (zoom) {
            this.editor.zoomToSelection({ animation: { duration: 300 } });
        }
        return {
            selectedShapeIds: this.editor.getSelectedShapeIds().map(String),
        };
    }

    public navigateAgentToBlock(options: {
        blockId: string;
        shapeId?: string;
        zoom?: boolean;
    }): { found: boolean; shapeId: string | null; selectedShapeIds: string[] } {
        if (!this.editor) {
            throw new Error('Tldraw editor is not initialized');
        }
        const shapeId = (options.shapeId as TLShapeId | undefined) || this.findShapeByBlockId(options.blockId);
        if (!shapeId) {
            return { found: false, shapeId: null, selectedShapeIds: this.editor.getSelectedShapeIds().map(String) };
        }
        const shape = this.editor.getShape(shapeId);
        if (!shape) {
            return { found: false, shapeId: String(shapeId), selectedShapeIds: this.editor.getSelectedShapeIds().map(String) };
        }
        this.editor.select(shapeId);
        if (options.zoom !== false) {
            this.editor.zoomToSelection({ animation: { duration: 300 } });
        }
        return {
            found: true,
            shapeId: String(shapeId),
            selectedShapeIds: this.editor.getSelectedShapeIds().map(String),
        };
    }

    public zoomAgentToShapes(options: {
        shapeIds: string[];
    }): { zoomedShapeIds: string[] } {
        if (!this.editor) {
            throw new Error('Tldraw editor is not initialized');
        }
        const ids = Array.from(new Set(options.shapeIds)).slice(0, 50)
            .filter((id) => this.editor.getShape(id as TLShapeId)) as TLShapeId[];
        if (ids.length) {
            this.editor.setSelectedShapes(ids);
            this.editor.zoomToSelection({ animation: { duration: 300 } });
        }
        return { zoomedShapeIds: ids.map(String) };
    }

    public async saveAgentWhiteboard(): Promise<{ success: boolean; summary: ReturnType<TldrawManager['getAgentSummary']> }> {
        if (!this.editor) {
            throw new Error('Tldraw editor is not initialized');
        }
        await this.saveData();
        return {
            success: true,
            summary: this.getAgentSummary(),
        };
    }

    public updateAgentShape(options: {
        shapeId: string;
        x?: number;
        y?: number;
        w?: number;
        h?: number;
        color?: string;
        select?: boolean;
        zoom?: boolean;
    }): { shapeId: string; summary: ReturnType<TldrawManager['getAgentSummary']> } {
        if (!this.editor) {
            throw new Error('Tldraw editor is not initialized');
        }
        const shape = this.editor.getShape(options.shapeId as TLShapeId) as TLShape | undefined;
        if (!shape) {
            throw new Error(`Shape not found: ${options.shapeId}`);
        }

        const patch: any = {
            id: shape.id,
            type: shape.type,
        };
        if (options.x !== undefined) {
            patch.x = finiteNumberInRange(options.x, shape.x, -100000, 100000);
        }
        if (options.y !== undefined) {
            patch.y = finiteNumberInRange(options.y, shape.y, -100000, 100000);
        }

        const props = buildAgentShapePropsPatch(shape, options);
        if (Object.keys(props).length > 0) {
            patch.props = props;
        }

        this.editor.updateShape(patch);
        if (options.select !== false) {
            this.editor.select(shape.id);
        }
        if (options.zoom) {
            this.editor.zoomToSelection({ animation: { duration: 300 } });
        }
        this.triggerSave();

        return {
            shapeId: String(shape.id),
            summary: this.getAgentSummary(),
        };
    }

    public getAgentShapeDetails(options: {
        shapeIds?: string[];
        type?: string;
        limit?: number;
        includeBindings?: boolean;
    }): { shapes: AgentShapeSummary[]; totalMatched: number; truncated: boolean } {
        if (!this.editor) {
            throw new Error('Tldraw editor is not initialized');
        }

        const ids = new Set((options.shapeIds || []).filter(Boolean));
        const limit = finiteNumberInRange(options.limit, 40, 1, 200);
        const shapes = this.editor.getCurrentPageShapes().filter((shape) => {
            if (ids.size && !ids.has(String(shape.id))) return false;
            if (options.type && shape.type !== options.type) return false;
            return true;
        });

        return {
            shapes: shapes.slice(0, limit).map((shape) => summarizeAgentShape(this.editor, shape, options.includeBindings === true)),
            totalMatched: shapes.length,
            truncated: shapes.length > limit,
        };
    }

    public createAgentBasicShape(options: AgentBasicShapeCreateArgs): { createdShapeIds: string[]; selectedShapeIds: string[]; summary: ReturnType<TldrawManager['getAgentSummary']> } {
        if (!this.editor) {
            throw new Error('Tldraw editor is not initialized');
        }
        const id = createShapeId();
        const x = finiteNumberInRange(options.x, 0, -100000, 100000);
        const y = finiteNumberInRange(options.y, 0, -100000, 100000);
        const color = options.color ?? 'black';
        const text = clampAgentText(options.text || defaultAgentText(options.kind), 2000);
        const shape = buildAgentBasicShape(id, options, x, y, color, text);

        this.editor.createShape(shape as any);
        finalizeAgentSelection(this.editor, id, options);
        this.triggerSave();

        return {
            createdShapeIds: [String(id)],
            selectedShapeIds: options.select === false ? [] : [String(id)],
            summary: this.getAgentSummary(),
        };
    }

    public createAgentConnector(options: AgentConnectorCreateArgs): { createdShapeIds: string[]; selectedShapeIds: string[]; summary: ReturnType<TldrawManager['getAgentSummary']> } {
        if (!this.editor) {
            throw new Error('Tldraw editor is not initialized');
        }

        const connectorKind = options.kind || 'bezier-connector';
        const id = createShapeId();
        const endpoints = resolveAgentConnectorEndpoints(this.editor, options);
        const color = options.color ?? 'black';
        const richText = toRichText(clampAgentText(options.text || '', 500));

        if (connectorKind === 'arrow') {
            const origin = {
                x: Math.min(endpoints.start.x, endpoints.end.x),
                y: Math.min(endpoints.start.y, endpoints.end.y),
            };
            this.editor.createShape({
                id,
                type: 'arrow',
                x: origin.x,
                y: origin.y,
                props: {
                    color,
                    start: { x: endpoints.start.x - origin.x, y: endpoints.start.y - origin.y },
                    end: { x: endpoints.end.x - origin.x, y: endpoints.end.y - origin.y },
                    richText,
                    arrowheadStart: 'none',
                    arrowheadEnd: 'arrow',
                },
            } as any);
            const bindings = buildAgentArrowBindings(id, endpoints);
            if (bindings.length) this.editor.createBindings(bindings as any);
        } else {
            this.editor.createShape({
                id,
                type: 'bezier-connector',
                x: 0,
                y: 0,
                props: {
                    start: endpoints.start,
                    end: endpoints.end,
                    color,
                    strokeWidth: finiteNumberInRange(options.strokeWidth, 3, 1, 16),
                    strokeStyle: 'solid',
                    richText,
                    labelPosition: 0.5,
                    font: 'draw',
                    size: 'm',
                    scale: 1,
                },
            } as any);
            if (endpoints.startShapeId && endpoints.startPortId) {
                createOrUpdateConnectorBinding(this.editor, id, endpoints.startShapeId, {
                    portId: endpoints.startPortId,
                    terminal: 'start',
                });
            }
            if (endpoints.endShapeId && endpoints.endPortId) {
                createOrUpdateConnectorBinding(this.editor, id, endpoints.endShapeId, {
                    portId: endpoints.endPortId,
                    terminal: 'end',
                });
            }
        }

        finalizeAgentSelection(this.editor, id, options);
        try { this.editor.sendToBack([id]); } catch {}
        this.triggerSave();

        return {
            createdShapeIds: [String(id)],
            selectedShapeIds: options.select === false ? [] : [String(id)],
            summary: this.getAgentSummary(),
        };
    }

    public updateAgentShapesBatch(options: {
        patches: AgentShapeUpdatePatch[];
        select?: boolean;
        zoom?: boolean;
    }): { updatedShapeIds: string[]; skipped: Array<{ shapeId: string; reason: string }>; summary: ReturnType<TldrawManager['getAgentSummary']> } {
        if (!this.editor) {
            throw new Error('Tldraw editor is not initialized');
        }
        const patches = options.patches.slice(0, 50);
        const updates: any[] = [];
        const updatedShapeIds: string[] = [];
        const skipped: Array<{ shapeId: string; reason: string }> = [];

        for (const item of patches) {
            const shape = this.editor.getShape(item.shapeId as TLShapeId) as TLShape | undefined;
            if (!shape) {
                skipped.push({ shapeId: item.shapeId, reason: 'shape not found' });
                continue;
            }
            const patch: any = { id: shape.id, type: shape.type };
            if (item.x !== undefined) patch.x = finiteNumberInRange(item.x, shape.x, -100000, 100000);
            if (item.y !== undefined) patch.y = finiteNumberInRange(item.y, shape.y, -100000, 100000);
            const props = buildAgentShapePropsPatch(shape, item);
            const extraProps = buildAgentTextPropsPatch(shape, item);
            patch.props = { ...props, ...extraProps };
            if (Object.keys(patch.props).length === 0) delete patch.props;
            updates.push(patch);
            updatedShapeIds.push(String(shape.id));
        }

        if (updates.length) this.editor.updateShapes(updates);
        if (options.select !== false && updatedShapeIds.length) {
            this.editor.setSelectedShapes(updatedShapeIds as TLShapeId[]);
        }
        if (options.zoom && updatedShapeIds.length) {
            this.editor.zoomToSelection({ animation: { duration: 300 } });
        }
        this.triggerSave();
        return { updatedShapeIds, skipped, summary: this.getAgentSummary() };
    }

    public deleteAgentShapes(options: {
        shapeIds: string[];
        confirm?: boolean;
        allowLinkedBlockShapes?: boolean;
    }): { dryRun: boolean; deletedShapeIds: string[]; blocked: Array<{ shapeId: string; reason: string }>; summary: ReturnType<TldrawManager['getAgentSummary']> } {
        if (!this.editor) {
            throw new Error('Tldraw editor is not initialized');
        }
        const requestedIds = Array.from(new Set(options.shapeIds)).slice(0, 50);
        const deletable: TLShapeId[] = [];
        const blocked: Array<{ shapeId: string; reason: string }> = [];

        for (const shapeId of requestedIds) {
            const shape = this.editor.getShape(shapeId as TLShapeId) as TLShape | undefined;
            if (!shape) {
                blocked.push({ shapeId, reason: 'shape not found' });
                continue;
            }
            if (!options.allowLinkedBlockShapes && isLinkedBlockShape(shape)) {
                blocked.push({ shapeId, reason: 'linked SiYuan block shape requires allowLinkedBlockShapes=true' });
                continue;
            }
            deletable.push(shape.id);
        }

        if (options.confirm !== true) {
            return {
                dryRun: true,
                deletedShapeIds: deletable.map(String),
                blocked,
                summary: this.getAgentSummary(),
            };
        }

        if (deletable.length) {
            this.editor.deleteShapes(deletable);
            this.triggerSave();
        }
        return {
            dryRun: false,
            deletedShapeIds: deletable.map(String),
            blocked,
            summary: this.getAgentSummary(),
        };
    }

    public convertAgentConnectors(options: {
        shapeIds: string[];
        to: 'arrow' | 'bezier-connector';
    }): { convertedShapeIds: string[]; summary: ReturnType<TldrawManager['getAgentSummary']> } {
        if (!this.editor) {
            throw new Error('Tldraw editor is not initialized');
        }
        const ids = options.shapeIds.slice(0, 50).map((id) => id as TLShapeId);
        const converted = options.to === 'arrow'
            ? convertConnectorsToArrow(this.editor, ids)
            : convertConnectorsToBezier(this.editor, ids);
        if (converted.length) this.triggerSave();
        return {
            convertedShapeIds: converted.map(String),
            summary: this.getAgentSummary(),
        };
    }

    public getAgentBoardSnapshotSummary(): {
        id: string;
        pageCount: number;
        shapeCount: number;
        assetCount: number;
        storeRecordCount: number;
        approxJsonBytes: number;
        pages: Array<{ id: string; name?: string; index?: string }>;
    } {
        const snapshot = getSnapshot(this.store);
        const records = Object.values((snapshot as any)?.store || {}) as any[];
        const pages = records.filter((record) => record?.typeName === 'page' || String(record?.id || '').startsWith('page:'));
        const shapes = records.filter((record) => record?.typeName === 'shape' || String(record?.id || '').startsWith('shape:'));
        const assets = records.filter((record) => record?.typeName === 'asset' || String(record?.id || '').startsWith('asset:'));
        const json = JSON.stringify(snapshot);
        return {
            id: this.id,
            pageCount: pages.length,
            shapeCount: shapes.length,
            assetCount: assets.length,
            storeRecordCount: records.length,
            approxJsonBytes: json.length,
            pages: pages.slice(0, 50).map((page) => ({
                id: String(page.id || ''),
                name: page.name ? String(page.name) : undefined,
                index: page.index ? String(page.index) : undefined,
            })),
        };
    }

    public async backupAgentWhiteboard(options: { reason?: string } = {}) {
        const snapshot = getSnapshot(this.store);
        const jsonData = JSON.stringify(snapshot);
        const result = await WhiteboardFileManager.backupWhiteboardData(this.id, jsonData, {
            reason: clampAgentText(options.reason || 'agent-backup', 80),
        } as any);
        return {
            ...result,
            snapshot: this.getAgentBoardSnapshotSummary(),
        };
    }

    public duplicateAgentShapes(options: {
        shapeIds: string[];
        offsetX?: number;
        offsetY?: number;
        select?: boolean;
        zoom?: boolean;
    }): { duplicatedShapeIds: string[]; blocked: Array<{ shapeId: string; reason: string }>; summary: ReturnType<TldrawManager['getAgentSummary']> } {
        if (!this.editor) {
            throw new Error('Tldraw editor is not initialized');
        }
        const ids = Array.from(new Set(options.shapeIds)).slice(0, 50);
        const existing = ids.filter((id) => this.editor.getShape(id as TLShapeId)).map((id) => id as TLShapeId);
        const blocked = ids
            .filter((id) => !this.editor.getShape(id as TLShapeId))
            .map((shapeId) => ({ shapeId, reason: 'shape not found' }));
        if (!existing.length) return { duplicatedShapeIds: [], blocked, summary: this.getAgentSummary() };

        const dx = finiteNumberInRange(options.offsetX, 32, -4000, 4000);
        const dy = finiteNumberInRange(options.offsetY, 32, -4000, 4000);
        const beforeIds = new Set(this.editor.getCurrentPageShapes().map((shape) => String(shape.id)));
        const duplicate = (this.editor as any).duplicateShapes;
        let duplicated: TLShape[] = [];
        if (typeof duplicate === 'function') {
            duplicate.call(this.editor, existing);
            duplicated = this.editor
                .getCurrentPageShapes()
                .filter((shape) => !beforeIds.has(String(shape.id))) as TLShape[];
            if ((dx !== 0 || dy !== 0) && duplicated.length) {
                this.editor.updateShapes(duplicated.map((shape) => ({
                    id: shape.id,
                    type: shape.type,
                    x: Number(shape.x || 0) + dx,
                    y: Number(shape.y || 0) + dy,
                })) as any);
            }
        } else {
            const creates = existing
                .map((id) => this.editor.getShape(id))
                .filter(Boolean)
                .map((shape: any) => ({
                    id: createShapeId(),
                    type: shape.type,
                    x: Number(shape.x || 0) + dx,
                    y: Number(shape.y || 0) + dy,
                    props: JSON.parse(JSON.stringify(shape.props || {})),
                }));
            this.editor.createShapes(creates as any);
            duplicated = creates.map((shape) => this.editor.getShape(shape.id)).filter(Boolean) as TLShape[];
        }
        const duplicatedShapeIds = duplicated.map((shape) => String(shape.id));
        if (options.select !== false && duplicatedShapeIds.length) {
            this.editor.setSelectedShapes(duplicatedShapeIds as TLShapeId[]);
        }
        if (options.zoom && duplicatedShapeIds.length) {
            this.editor.zoomToSelection({ animation: { duration: 300 } });
        }
        this.triggerSave();
        return { duplicatedShapeIds, blocked, summary: this.getAgentSummary() };
    }

    public arrangeAgentShapes(options: {
        shapeIds: string[];
        operation: AgentArrangeOperation;
    }): { arrangedShapeIds: string[]; summary: ReturnType<TldrawManager['getAgentSummary']> } {
        if (!this.editor) {
            throw new Error('Tldraw editor is not initialized');
        }
        const ids = Array.from(new Set(options.shapeIds)).slice(0, 50)
            .filter((id) => this.editor.getShape(id as TLShapeId)) as TLShapeId[];
        if (!ids.length) return { arrangedShapeIds: [], summary: this.getAgentSummary() };
        const methodByOperation: Record<AgentArrangeOperation, string> = {
            front: 'bringToFront',
            back: 'sendToBack',
            forward: 'bringForward',
            backward: 'sendBackward',
        };
        const methodName = methodByOperation[options.operation];
        const method = (this.editor as any)[methodName];
        if (typeof method !== 'function') {
            throw new Error(`${methodName} API is unavailable in current tldraw editor`);
        }
        method.call(this.editor, ids);
        this.triggerSave();
        return { arrangedShapeIds: ids.map(String), summary: this.getAgentSummary() };
    }

    public alignAgentShapes(options: {
        shapeIds: string[];
        operation: AgentAlignOperation;
    }): { alignedShapeIds: string[]; summary: ReturnType<TldrawManager['getAgentSummary']> } {
        if (!this.editor) {
            throw new Error('Tldraw editor is not initialized');
        }
        const shapes = Array.from(new Set(options.shapeIds)).slice(0, 50)
            .map((id) => this.editor.getShape(id as TLShapeId))
            .filter(Boolean) as TLShape[];
        if (shapes.length < 2) return { alignedShapeIds: shapes.map((shape) => String(shape.id)), summary: this.getAgentSummary() };

        const boxes = shapes.map((shape) => {
            const bounds = this.editor.getShapePageBounds(shape.id);
            const w = bounds?.width || Number((shape as any).props?.w) || 1;
            const h = bounds?.height || Number((shape as any).props?.h) || 1;
            return {
                shape,
                x: bounds?.x ?? Number(shape.x || 0),
                y: bounds?.y ?? Number(shape.y || 0),
                w,
                h,
            };
        });
        const updates = buildAgentAlignUpdates(boxes, options.operation);
        if (updates.length) {
            this.editor.updateShapes(updates as any);
            this.triggerSave();
        }
        return { alignedShapeIds: shapes.map((shape) => String(shape.id)), summary: this.getAgentSummary() };
    }

    public groupAgentShapes(options: {
        shapeIds: string[];
        ungroup?: boolean;
        select?: boolean;
    }): { shapeIds: string[]; summary: ReturnType<TldrawManager['getAgentSummary']> } {
        if (!this.editor) {
            throw new Error('Tldraw editor is not initialized');
        }
        const ids = Array.from(new Set(options.shapeIds)).slice(0, 50)
            .filter((id) => this.editor.getShape(id as TLShapeId)) as TLShapeId[];
        if (!ids.length) return { shapeIds: [], summary: this.getAgentSummary() };

        const methodName = options.ungroup ? 'ungroupShapes' : 'groupShapes';
        const method = (this.editor as any)[methodName];
        if (typeof method !== 'function') {
            throw new Error(`${methodName} API is unavailable in current tldraw editor`);
        }
        method.call(this.editor, ids);
        if (options.select !== false) {
            this.editor.setSelectedShapes(ids);
        }
        this.triggerSave();
        return { shapeIds: ids.map(String), summary: this.getAgentSummary() };
    }

    public lockAgentShapes(options: {
        shapeIds: string[];
        locked: boolean;
    }): { shapeIds: string[]; locked: boolean; summary: ReturnType<TldrawManager['getAgentSummary']> } {
        if (!this.editor) {
            throw new Error('Tldraw editor is not initialized');
        }
        const ids = Array.from(new Set(options.shapeIds)).slice(0, 50)
            .filter((id) => this.editor.getShape(id as TLShapeId)) as TLShapeId[];
        if (!ids.length) return { shapeIds: [], locked: options.locked, summary: this.getAgentSummary() };

        const methodName = options.locked ? 'lockShapes' : 'unlockShapes';
        const method = (this.editor as any)[methodName];
        if (typeof method === 'function') {
            method.call(this.editor, ids);
        } else {
            this.editor.updateShapes(ids.map((id) => {
                const shape = this.editor.getShape(id) as TLShape;
                return { id, type: shape.type, isLocked: options.locked } as any;
            }));
        }
        this.triggerSave();
        return { shapeIds: ids.map(String), locked: options.locked, summary: this.getAgentSummary() };
    }

    /**
     * Helper: find the number of remaining shapes referencing a blockId for specified types
     */
    private countRemainingShapesReferencingBlock(editor: Editor, blockId: string, types: string[]): number {
        const allShapes = editor.store.query.records('shape').get();
        return allShapes.filter(s => types.includes(s.type) && (s as ICardShape).props?.blockId === blockId).length;
    }

    private syncAgentCreatedBlockAttrs(result: AgentCreateShapeResult) {
        const nodes = result.createdNodes || [];
        const linkedNodes = nodes.filter((node) =>
            node.blockId && (node.kind === 'card' || node.kind === 'single-block')
        );
        if (linkedNodes.length === 0) return;

        void Promise.all(linkedNodes.map(async (node) => {
            const blockId = node.blockId as string;
            const link = buildTldrawLink(this.id, blockId, this.title, node.id);
            const attrs = node.kind === 'single-block'
                ? { 'custom-tldraw-link': link, 'custom-st-tldraw-single': '1' }
                : { 'custom-tldraw-link': link, 'custom-st-tldraw': '1' };
            await api.setBlockAttrs(blockId, attrs);
        })).catch((error) => {
            console.error('sync agent-created tldraw block attrs failed', error);
        });
    }

    /**
     * 当 card 类型形状被删除后，调用该函数处理块的清理逻辑。
     * 扩展点：在这里添加任何 card 相关的自定义逻辑。
     */
    private async handleCardShapeDeletion(editor: Editor, shape: ICardShape) {
        try {
            const blockId = shape.props?.blockId;
            if (!blockId) return;

            // 只检查其他 card 类型是否仍然引用同一 blockId
            const remainingCardsCount = this.countRemainingShapesReferencingBlock(editor, blockId, ['card']);
            if (remainingCardsCount === 0) {
                // 如果没有其他 card 引用，可执行删除或更新属性
                if (await api.getBlockByID(blockId)) {
                    if (settingdata['SyncDelete']) {
                        // SyncDelete=true 的情况：删除块
                        await api.deleteBlock(blockId);
                        console.debug(`Deleted block ${blockId} because no other cards reference it.`);
                    } else {
                        // 否则只重置属性，保留块
                        await api.setBlockAttrs(blockId, { 'custom-st-tldraw': '0' , 'custom-tldraw-link': ''});
                        console.debug(`Block attribute updated for ${blockId} as no other cards reference it.`);
                    }
                }
            } else {
                console.debug(`Card deletion: ${remainingCardsCount} remaining card(s) reference block ${blockId}; skipping block update.`);
            }
        } catch (err) {
            console.error('handleCardShapeDeletion error', err);
        }
    }

    /**
     * 当 single-block 类型形状被删除后，调用该函数处理块的清理逻辑。
     * 扩展点：在这里添加任何 single-block 特有的自定义逻辑（例如不同的属性或行为）。
     */
    private async handleSingleBlockDeletion(editor: Editor, shape: ICardShape) {
        try {
            const blockId = shape.props?.blockId;
            if (!blockId) return;

            // 只检查其他 single-block 是否仍然引用同一 blockId
            const remainingSingleBlockCount = this.countRemainingShapesReferencingBlock(editor, blockId, ['single-block']);
            if (remainingSingleBlockCount === 0) {
                const block = await api.getBlockKramdown(blockId);
                if (block) {
                    // single-block 删除行为：默认与 card 保持一致。
                    if (settingdata['SyncDelete']) {
                        await api.deleteBlock(blockId);
                        console.debug(`Deleted block ${blockId} because no other single-blocks reference it.`);
                    } else {
                        await api.setBlockAttrs(blockId, { 'custom-st-tldraw': '0' , 'custom-tldraw-link': ''});
                        // console.debug("%%%",block.markdown);
                        // 只删除指向当前画板(this.id) 与该块(blockId) 的[*](...)链接
                        // 支持 https:// 和 siyuan:// 两种协议
                        const replacedMarkdown = block.kramdown.replace(/\[\*\]\(((https|siyuan):\/\/plugins\/siyuan-steve-tools\/\?[^)]+)\)/g, (match, url) => {
                            try {
                                // 处理 siyuan:// 协议：转换为 https:// 以便使用 URL API
                                const parseableUrl = url.startsWith('siyuan://') ? url.replace('siyuan://', 'https://') : url;
                                const params = new URL(parseableUrl).searchParams;
                                if (params.get('rootid') === this.id && params.get('blockid') === blockId) {
                                    return ''; // 匹配则删除该链接
                                }
                            } catch (err) {
                                // 若 URL 解析失败则 fallback：仅当包含 rootid 与 blockid 字符串时才删除
                                if (url.includes(`rootid=${this.id}`) && url.includes(`blockid=${blockId}`)) {
                                    return '';
                                }
                            }
                            return match; // 不匹配则保留原链接
                        });
                        if (replacedMarkdown !== block.kramdown) {
                            await api.updateBlock("markdown", replacedMarkdown, blockId);
                        }
                    }
                }
            } else {
                console.debug(`Single-block deletion: ${remainingSingleBlockCount} remaining single-block(s) reference block ${blockId}; skipping block update.`);
            }
        } catch (err) {
            console.error('handleSingleBlockDeletion error', err);
        }
    }

    /**
     * 当任意 shape 删除后，检查它引用的 asset 是否还被其他 shape 引用，若没有则删除 asset
     */
    // private async handleShapeAssetDeletion(shape: any) {
    //     if (!this.store) return;
    //     try {
    //         const assets = this.store.query.records('asset').get() || [];
    //         if (!assets || assets.length === 0) return;
    //         const assetIdSet = new Set<string>(assets.map((a: any) => String(a.id)));

    //         const collected = new Set<string>();
    //         const scan = (val: any) => {
    //             if (val == null) return;
    //             if (typeof val === 'string') {
    //                 const s = val as string;
    //                 if (assetIdSet.has(s)) collected.add(s);
    //                 return;
    //             }
    //             if (Array.isArray(val)) {
    //                 for (const item of val) scan(item);
    //                 return;
    //             }
    //             if (typeof val === 'object') {
    //                 for (const k of Object.keys(val)) scan(val[k]);
    //             }
    //         };

    //         // 扫描被删除的 shape
    //         scan(shape.props);
    //         scan((shape as any).screenshot);
    //         scan((shape as any).src);

    //         if (collected.size === 0) return;

    //         // 查询当前 store 中 shape 的资产引用（排除被删除的这个 shape）
    //         const shapes = this.store.query.records('shape').get() || [];
    //         for (const aid of Array.from(collected)) {
    //             let used = false;
    //             for (const s of shapes) {
    //                 // s.id 是删除后的 shape id 可能已经不存在在记录中，但保守处理：若 s.id === shape.id，则跳过
    //                 if (s.id === shape.id) continue;
    //                 const found = new Set<string>();
    //                 const scan2 = (val: any) => {
    //                     if (val == null) return;
    //                     if (typeof val === 'string') {
    //                         if (String(val) === aid) found.add(aid);
    //                         return;
    //                     }
    //                     if (Array.isArray(val)) {
    //                         for (const item of val) scan2(item);
    //                         return;
    //                     }
    //                     if (typeof val === 'object') {
    //                         for (const k of Object.keys(val)) scan2(val[k]);
    //                     }
    //                 };
    //                 scan2((s as any).props);
    //                 scan2((s as any).screenshot);
    //                 scan2((s as any).src);
    //                 if (found.has(aid)) {
    //                     used = true;
    //                     break;
    //                 }
    //             }
    //             if (!used) {
    //                 try {
    //                     console.debug(`Removing unreferenced asset ${aid} after deleting shape ${shape.id}`);
    //                     this.store.remove([aid] as any);
    //                 } catch (err) {
    //                     console.warn('Failed to remove asset after shape deletion', aid, err);
    //                 }
    //             }
    //         }
    //     } catch (err) {
    //         console.warn('handleShapeAssetDeletion error', err);
    //     }
    // }

    public async captureSlideScreenshot(slideId: TLShapeId, options: CaptureSlideScreenshotOptions = {}): Promise<CaptureSlideScreenshotResult | null> {
        if (!this.editor) {
            throw new Error('Editor instance not initialized');
        }
        const result = await captureSlideScreenshot(this.editor, slideId, options);
        if (options.updateShape && result) {
            await this.saveData();
        }
        return result;
    }

    public async captureAllSlideScreenshots(options: CaptureSlideScreenshotOptions = {}): Promise<Map<TLShapeId, CaptureSlideScreenshotResult | null>> {
        if (!this.editor) {
            throw new Error('Editor instance not initialized');
        }
        const results = new Map<TLShapeId, CaptureSlideScreenshotResult | null>();
        const slides = getSlides(this.editor);
        let hasUpdates = false;
        for (const slide of slides) {
            const result = await captureSlideScreenshot(this.editor, slide.id, options);
            results.set(slide.id, result);
            if (result) {
                hasUpdates = true;
            }
        }
        if (options.updateShape && hasUpdates) {
            await this.saveData();
        }
        return results;
    }

    /**
     * 导航到包含特定思源块的形状(二选一)
     * @param blockId 思源块ID
     * @param shapeId 形状ID（可选）
     * @returns 是否成功导航
     */
    public navigateToBlockShape(blockId: string, shapeId = "" as TLShapeId): boolean {
        if (shapeId === "") {
            shapeId = this.findShapeByBlockId(blockId);
        }
        console.debug("导航到形状", shapeId, blockId);
        if (!shapeId) return false;

        if (this.editor) {
            // 选中并聚焦到该形状
            this.editor.select(shapeId);
            this.editor.zoomToSelection({ animation: { duration: 500 } });
            return true;
        }
        return false;
    }


}

function summarizeShapeProps(props: any, editor?: Editor): Record<string, unknown> {
    if (!props || typeof props !== 'object') return {};
    const out: Record<string, unknown> = {};
    for (const key of ['w', 'h', 'color', 'geo', 'blockId', 'name', 'text']) {
        if (props[key] !== undefined) out[key] = props[key];
    }
    if (props.richText) {
        out.richText = '[richText]';
        if (editor) {
            try {
                out.richTextPlain = clampAgentText(renderPlaintextFromRichText(editor, props.richText), 500);
            } catch {}
        }
    }
    return out;
}

function buildAgentShapePropsPatch(shape: TLShape, options: {
    w?: number;
    h?: number;
    color?: string;
    text?: string;
    name?: string;
}): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    const supportsSize = ['card', 'single-block', 'branch', 'geo', 'note', 'text', 'frame', 'slide', 'mind-map', 'js-shape'].includes(shape.type);
    const supportsColor = ['card', 'single-block', 'branch', 'geo', 'note', 'text', 'frame', 'draw', 'highlight', 'slide', 'mind-map', 'js-shape', 'arrow', 'line', 'bezier-connector'].includes(shape.type);

    if (supportsSize && options.w !== undefined) {
        props.w = finiteNumberInRange(options.w, Number((shape as any).props?.w) || 300, 1, 4000);
    }
    if (supportsSize && options.h !== undefined) {
        props.h = finiteNumberInRange(options.h, Number((shape as any).props?.h) || 300, 1, 4000);
    }
    if (supportsColor && options.color !== undefined) {
        const color = normalizeOptionalAgentColor(options.color);
        if (color) props.color = color;
    }

    return props;
}

function buildAgentTextPropsPatch(shape: TLShape, options: { text?: string; name?: string }): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    if (options.text !== undefined) {
        const text = clampAgentText(options.text, 2000);
        if (shape.type === 'text' || shape.type === 'note' || shape.type === 'arrow' || shape.type === 'bezier-connector') {
            props.richText = toRichText(text);
        } else if (shape.type === 'mind-map') {
            props.rootNode = {
                ...((shape as any).props?.rootNode || createMindMapNode()),
                text,
            };
        }
    }
    if (options.name !== undefined && shape.type === 'slide') {
        props.name = clampAgentText(options.name, 120) || 'New Slide';
    }
    return props;
}

function summarizeAgentShape(editor: Editor, shape: TLShape, includeBindings = false): AgentShapeSummary {
    const summary: AgentShapeSummary = {
        id: String(shape.id),
        type: String(shape.type),
        x: Number(shape.x || 0),
        y: Number(shape.y || 0),
        rotation: Number((shape as any).rotation || 0),
        parentId: String((shape as any).parentId || ''),
        index: String((shape as any).index || ''),
        props: summarizeShapeProps((shape as any).props, editor),
    };
    if (includeBindings) {
        summary.bindings = [
            ...((editor as any).getBindingsFromShape?.(shape.id, 'arrow') || []),
            ...((editor as any).getBindingsFromShape?.(shape.id, 'bezier-connector') || []),
        ].map(summarizeAgentBinding);
    }
    return summary;
}

function summarizeAgentBinding(binding: any) {
    return {
        id: String(binding?.id || ''),
        type: String(binding?.type || ''),
        fromId: String(binding?.fromId || ''),
        toId: String(binding?.toId || ''),
        props: binding?.props || {},
    };
}

function buildAgentBasicShape(id: TLShapeId, options: AgentBasicShapeCreateArgs, x: number, y: number, color: any, text: string) {
    const w = finiteNumberInRange(options.w, defaultAgentWidth(options.kind), 1, 4000);
    const h = finiteNumberInRange(options.h, defaultAgentHeight(options.kind), 1, 4000);
    if (options.kind === 'text') {
        return { id, type: 'text', x, y, props: { richText: toRichText(text), color, w, size: 'm', font: 'draw', scale: 1 } };
    }
    if (options.kind === 'note') {
        return { id, type: 'note', x, y, props: { richText: toRichText(text), color, size: 'm', font: 'draw', align: 'middle', verticalAlign: 'middle', growY: 0 } };
    }
    if (options.kind === 'geo') {
        return { id, type: 'geo', x, y, props: { w, h, geo: normalizeAgentGeo(options.geo), color, fill: 'none', dash: 'draw', size: 'm', font: 'draw', richText: toRichText(text), align: 'middle', verticalAlign: 'middle', growY: 0 } };
    }
    if (options.kind === 'arrow') {
        return { id, type: 'arrow', x, y, props: { color, start: { x: 0, y: 0 }, end: { x: w, y: h }, richText: toRichText(text), arrowheadStart: 'none', arrowheadEnd: 'arrow' } };
    }
    if (options.kind === 'line') {
        const [start, end] = getIndices(2);
        return {
            id,
            type: 'line',
            x,
            y,
            props: {
                color,
                dash: 'draw',
                size: 'm',
                spline: 'line',
                scale: 1,
                points: {
                    [start]: { id: start, index: start, x: 0, y: 0 },
                    [end]: { id: end, index: end, x: w, y: h },
                },
            },
        };
    }
    if (options.kind === 'frame') {
        return { id, type: 'frame', x, y, props: { w, h, name: clampAgentText(options.name || text || 'Frame', 120) } };
    }
    if (options.kind === 'draw') {
        return {
            id,
            type: 'draw',
            x,
            y,
            props: {
                color,
                fill: 'none',
                dash: 'draw',
                size: options.kind === 'highlight' ? 'xl' : 'm',
                isComplete: true,
                isClosed: false,
                isPen: false,
                segments: [
                    {
                        type: 'free',
                        points: [
                            { x: 0, y: 0, z: 0.5 },
                            { x: w * 0.35, y: h * 0.2, z: 0.5 },
                            { x: w * 0.7, y: h * 0.8, z: 0.5 },
                            { x: w, y: h, z: 0.5 },
                        ],
                    },
                ],
            },
        };
    }
    if (options.kind === 'highlight') {
        return {
            id,
            type: 'highlight',
            x,
            y,
            props: {
                color,
                size: 'm',
                isComplete: true,
                isPen: false,
                scale: 1,
                segments: [
                    {
                        type: 'free',
                        points: [
                            { x: 0, y: h * 0.5, z: 0.5 },
                            { x: w * 0.33, y: h * 0.45, z: 0.5 },
                            { x: w * 0.66, y: h * 0.55, z: 0.5 },
                            { x: w, y: h * 0.5, z: 0.5 },
                        ],
                    },
                ],
            },
        };
    }
    if (options.kind === 'bezier-connector') {
        return { id, type: 'bezier-connector', x: 0, y: 0, props: { start: { x, y }, end: { x: x + w, y: y + h }, color, strokeWidth: 3, strokeStyle: 'solid', richText: toRichText(text), labelPosition: 0.5, font: 'draw', size: 'm', scale: 1 } };
    }
    if (options.kind === 'slide') {
        return { id, type: 'slide', x, y, props: { w, h, color, name: clampAgentText(options.name || text || 'New Slide', 120), blockId: options.blockId, borderStyle: 'dashed' } };
    }
    if (options.kind === 'mind-map') {
        return { id, type: 'mind-map', x, y, props: { w, h, color, rootNode: createMindMapNode(text || '中心主题'), horizontalGap: 50, verticalGap: 20, nodeWidth: 120, nodeHeight: 36, fontSize: 14, lineWidth: 2, direction: options.direction || 'right', theme: options.theme || 'default', blockId: options.blockId, version: 1, refreshNonce: Date.now() } };
    }
    return { id, type: 'js-shape', x, y, props: { w, h, color, script: DEFAULT_SCRIPT, autoRun: false, interactive: false, restrictDom: true, data: JSON.stringify({ createdBy: 'siyuan-agent', note: clampAgentText(text, 500) }) } };
}

function resolveAgentConnectorEndpoints(editor: Editor, options: AgentConnectorCreateArgs) {
    let start = options.start;
    let end = options.end;
    let startShapeId = options.startShapeId as TLShapeId | undefined;
    let endShapeId = options.endShapeId as TLShapeId | undefined;
    let startPortId: string | undefined;
    let endPortId: string | undefined;

    if (startShapeId && endShapeId) {
        if (!editor.getShape(startShapeId)) throw new Error(`Start shape not found: ${startShapeId}`);
        if (!editor.getShape(endShapeId)) throw new Error(`End shape not found: ${endShapeId}`);
        const ports = getBestPortPair(editor, startShapeId, endShapeId);
        startPortId = ports.sourcePortId;
        endPortId = ports.targetPortId;
        start = getPortPagePosition(editor, startShapeId, startPortId) || getAgentShapeCenter(editor, startShapeId);
        end = getPortPagePosition(editor, endShapeId, endPortId) || getAgentShapeCenter(editor, endShapeId);
    }

    if (!start && startShapeId) start = getAgentShapeCenter(editor, startShapeId);
    if (!end && endShapeId) end = getAgentShapeCenter(editor, endShapeId);
    if (!start || !end) throw new Error('connector requires start/end points or startShapeId/endShapeId');

    return { start, end, startShapeId, endShapeId, startPortId, endPortId };
}

function buildAgentArrowBindings(arrowId: TLShapeId, endpoints: ReturnType<typeof resolveAgentConnectorEndpoints>) {
    const bindings: any[] = [];
    if (endpoints.startShapeId) {
        bindings.push({
            fromId: arrowId,
            toId: endpoints.startShapeId,
            type: 'arrow',
            props: { terminal: 'start', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false },
        });
    }
    if (endpoints.endShapeId) {
        bindings.push({
            fromId: arrowId,
            toId: endpoints.endShapeId,
            type: 'arrow',
            props: { terminal: 'end', normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false },
        });
    }
    return bindings;
}

function getAgentShapeCenter(editor: Editor, shapeId: TLShapeId) {
    const bounds = editor.getShapePageBounds(shapeId);
    if (bounds) return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const shape = editor.getShape(shapeId) as any;
    if (!shape) throw new Error(`Shape not found: ${shapeId}`);
    const w = Number(shape.props?.w) || 300;
    const h = Number(shape.props?.h) || 120;
    return { x: Number(shape.x || 0) + w / 2, y: Number(shape.y || 0) + h / 2 };
}

function finalizeAgentSelection(editor: Editor, focusedId: TLShapeId, options: { select?: boolean; zoom?: boolean }) {
    if (options.select !== false) editor.setSelectedShapes([focusedId]);
    if (options.zoom) editor.zoomToSelection({ animation: { duration: 300 } });
}

function isLinkedBlockShape(shape: TLShape) {
    return Boolean((shape as any).props?.blockId && ['card', 'single-block', 'slide', 'mind-map'].includes(shape.type));
}

function clampAgentText(value: string, maxLength: number) {
    return String(value || '').slice(0, maxLength);
}

function defaultAgentText(kind: AgentBasicShapeCreateArgs['kind']) {
    if (kind === 'mind-map') return '中心主题';
    if (kind === 'slide') return 'New Slide';
    if (kind === 'js-shape') return 'Agent-created JS placeholder';
    return '';
}

function defaultAgentWidth(kind: AgentBasicShapeCreateArgs['kind']) {
    if (kind === 'slide') return 720;
    if (kind === 'mind-map') return 800;
    if (kind === 'js-shape') return 320;
    if (kind === 'text') return 240;
    if (kind === 'note') return 220;
    if (kind === 'frame') return 640;
    return 300;
}

function defaultAgentHeight(kind: AgentBasicShapeCreateArgs['kind']) {
    if (kind === 'slide') return 480;
    if (kind === 'mind-map') return 500;
    if (kind === 'js-shape') return 220;
    if (kind === 'text') return 80;
    if (kind === 'note') return 220;
    if (kind === 'frame') return 360;
    return 160;
}

function normalizeAgentGeo(value?: string) {
    const allowed = new Set(['rectangle', 'ellipse', 'triangle', 'diamond', 'pentagon', 'hexagon', 'octagon', 'star', 'cloud', 'x-box', 'check-box', 'heart']);
    return value && allowed.has(value) ? value : 'rectangle';
}

function buildAgentAlignUpdates(
    boxes: Array<{ shape: TLShape; x: number; y: number; w: number; h: number }>,
    operation: AgentAlignOperation
) {
    const left = Math.min(...boxes.map((box) => box.x));
    const right = Math.max(...boxes.map((box) => box.x + box.w));
    const top = Math.min(...boxes.map((box) => box.y));
    const bottom = Math.max(...boxes.map((box) => box.y + box.h));
    const centerX = left + (right - left) / 2;
    const centerY = top + (bottom - top) / 2;

    if (operation === 'distribute-x') {
        const sorted = [...boxes].sort((a, b) => a.x - b.x);
        if (sorted.length < 3) return [];
        const totalWidth = sorted.reduce((sum, box) => sum + box.w, 0);
        const gap = (right - left - totalWidth) / (sorted.length - 1);
        let cursor = left;
        return sorted.map((box) => {
            const update = { id: box.shape.id, type: box.shape.type, x: cursor, y: box.shape.y };
            cursor += box.w + gap;
            return update;
        });
    }

    if (operation === 'distribute-y') {
        const sorted = [...boxes].sort((a, b) => a.y - b.y);
        if (sorted.length < 3) return [];
        const totalHeight = sorted.reduce((sum, box) => sum + box.h, 0);
        const gap = (bottom - top - totalHeight) / (sorted.length - 1);
        let cursor = top;
        return sorted.map((box) => {
            const update = { id: box.shape.id, type: box.shape.type, x: box.shape.x, y: cursor };
            cursor += box.h + gap;
            return update;
        });
    }

    return boxes.map((box) => {
        let x = Number(box.shape.x || 0);
        let y = Number(box.shape.y || 0);
        if (operation === 'left') x = left;
        if (operation === 'center-x') x = centerX - box.w / 2;
        if (operation === 'right') x = right - box.w;
        if (operation === 'top') y = top;
        if (operation === 'center-y') y = centerY - box.h / 2;
        if (operation === 'bottom') y = bottom - box.h;
        return { id: box.shape.id, type: box.shape.type, x, y };
    });
}

function isDarkTheme(): boolean {
    // 思源笔记暗色主题通常通过 data-theme 属性判断
    // console.debug("判断思源主题", document.documentElement.getAttribute('data-theme-mode'));
    return document.documentElement.getAttribute('data-theme-mode') === 'dark';
}

//暴露给全局
// const waytotldraw = {
//     TldrawManager
// }
// declare global {
//     interface Window {
//         tldraw: typeof waytotldraw;
//     }
// }
// window.tldraw=waytotldraw;

