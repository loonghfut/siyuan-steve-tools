import steveTools from "@/index";
import { MinutiaeImageBase } from "./image_base";
import { showMessage } from "siyuan";
import { setBlockAttrs } from "@/api/api";

interface VisualSettings {
    opacity: number;
    blur: number;
    brightness: number;
}

export class backgroundImg extends MinutiaeImageBase {
    private canvas: HTMLCanvasElement | null = null;
    private active = false;
    private bodyOriginalOpacity: string | null = null;
    private bodyOriginalTransition: string | null = null;
    private startupHandler: ((e: any) => void) | null = null;
    private switchHandler = (e: any) => { void this.handleSwitchProtyle(e); };
    private resizeHandler = () => this.syncCanvasSize();
    private lastDocPath?: string;
    private currentMode: string = 'switch';
    private lastSwitchAt: number | null = null; // ms timestamp of last auto refresh in switch mode

    constructor(plugin: steveTools, settingdata: any) {
        super(plugin, settingdata);
    }

    async init() {
        if (this.active) return;
        this.ensureCanvas();
        this.applyVisualSettings();
        // determine mode from settings
        this.currentMode = String(this.settingdata["minutiae-bg-mode"] || 'switch');
        // await this.refreshBackground();
        this.plugin.eventBus.on("switch-protyle", this.switchHandler);
        window.addEventListener("resize", this.resizeHandler, { passive: true });
        this.active = true;
    }

    destroy() {
        if (!this.active) return;
        try { this.plugin.eventBus.off("switch-protyle", this.switchHandler); } catch { }
        if (this.startupHandler) {
            try { this.plugin.eventBus.off("switch-protyle", this.startupHandler); } catch { }
            this.startupHandler = null;
        }
        window.removeEventListener("resize", this.resizeHandler);
        if (this.canvas && this.canvas.parentElement) {
            this.canvas.parentElement.removeChild(this.canvas);
        }
        this.canvas = null;
        this.restoreBodyStyles();
        this.active = false;
    }

    override updateSettingData(settingdata: any, options?: { skipBgRefresh?: boolean }) {
        super.updateSettingData(settingdata);
        if (!this.active) return;
        // If caller requests skipping refresh (e.g. opening settings), only apply visual settings and return
        if (options && options.skipBgRefresh) {
            this.applyVisualSettings();
            return;
        }
        const prevMode = this.currentMode;
        this.currentMode = String(this.settingdata["minutiae-bg-mode"] || 'switch');
        this.applyVisualSettings();
        // adjust event subscription based on mode change
        if (prevMode !== this.currentMode) {
            try {
                if (prevMode === 'switch') {
                    this.plugin.eventBus.off("switch-protyle", this.switchHandler);
                }
                if (prevMode === 'startup' && this.startupHandler) {
                    try { this.plugin.eventBus.off("switch-protyle", this.startupHandler); } catch { }
                    this.startupHandler = null;
                }
            } catch { }
            try {
                if (this.currentMode === 'switch') {
                    this.plugin.eventBus.on("switch-protyle", this.switchHandler);
                }
                if (this.currentMode === 'startup') {
                    // register a one-time startup handler to prefer doc attrs on the next switch-protyle
                    this.startupHandler = async (e: any) => {
                        try { await this.processProtyleSwitch(e, { persist: true }); } finally {
                            if (this.startupHandler) {
                                try { this.plugin.eventBus.off("switch-protyle", this.startupHandler); } catch { }
                                this.startupHandler = null;
                            }
                        }
                    };
                    try { this.plugin.eventBus.on("switch-protyle", this.startupHandler); } catch (err) { console.warn('注册 startupHandler 失败', err); }
                }
            } catch { }
        }
        // refresh according to mode
        if (this.currentMode === 'startup') {
            // startup mode: keep current background unless we explicitly want to re-pick now
            void this.refreshBackground();
        } else {
            // switch mode
            void this.refreshBackground(this.lastDocPath);
        }
    }

    protected override getUrlSettingKey(): string {
        return "minutiae-bg-url";
    }

    protected override getMappingSettingKey(): string {
        return "minutiae-bg-id-mapping";
    }

    protected override getDefaultSaveDirKey(): string {
        return "minutiae-bg-default-save-dir";
    }

    private async handleSwitchProtyle(e: any) {
        // default switch handler should only run in 'switch' mode
        await this.processProtyleSwitch(e, { persist: false });
    }

    /**
     * Core handler for protyle switch/startup events.
     * Options:
     * - persist: when true (startup), if no custom background found in doc attrs, save the chosen background to the doc attrs so it won't change later.
     */
    private async processProtyleSwitch(e: any, options?: { persist?: boolean }) {
    const persist = !!options?.persist;

        const docPath = e?.detail?.protyle?.path;
        if (docPath) {
            this.lastDocPath = docPath;
        }
        // Inject small UI controls into protyle for download/upload convenience
        let appliedFromIal = false;
        try {
            const contentElement = e?.detail?.protyle?.contentElement ?? null;
            // 优先检查文档 block attrs 中的自定义背景（custom-background-img 或 background-img）
            try {
                const ial = e?.detail?.protyle?.background?.ial;
                if (ial) {
                    let custom = ial['custom-background-img'] || null;
                    if (!custom && ial['background-img']) {
                        const extracted = this.extractUrlFromTitleImgAttr(String(ial['background-img'] || ''));
                        custom = extracted || String(ial['background-img'] || '').trim() || null;
                    }
                    if (custom) {
                        this.applyBackgroundUrl(custom);
                        appliedFromIal = true;
                    }
                }
            } catch (e2) {
                console.warn('读取文档自定义背景属性失败', e2);
            }
            // remove any existing bg control icons and separator we inserted previously
            try {
                const iconsContainer: HTMLElement | null = contentElement?.querySelector?.('.protyle-icons') || document.querySelector('.protyle-icons');
                if (iconsContainer) {
                    const prev = Array.from(iconsContainer.querySelectorAll('.protyle-icon[data-type="st-minutiae-bg"]'));
                    prev.forEach(p => p.remove());
                    const prevSep = iconsContainer.querySelector('.protyle-icon[data-type="st-minutiae-sep"]');
                    if (prevSep) prevSep.remove();
                }
            } catch { }

            // insert separator (between headimg icons and bg icons) if head icons exist
            try {
                const iconsContainer: HTMLElement | null = contentElement?.querySelector?.('.protyle-icons') || document.querySelector('.protyle-icons');
                if (iconsContainer) {
                    const hasHead = !!iconsContainer.querySelector('[data-type^="st-headimg-"]');
                    const hasSep = !!iconsContainer.querySelector('[data-type="st-minutiae-sep"]');
                    if (hasHead && !hasSep) {
                        const sep = document.createElement('span');
                        sep.className = 'protyle-icon protyle-icon--sep';
                        sep.setAttribute('data-type', 'st-minutiae-sep');
                        sep.setAttribute('aria-hidden', 'true');
                        sep.style.cssText = 'display:flex;align-items:center;pointer-events:none;padding:0 6px;';
                        sep.innerHTML = '<span style="display:block;width:1px;height:18px;background:rgba(0,0,0,0.12);border-radius:1px;">&nbsp;</span>';
                        const last = iconsContainer.querySelector('.protyle-icon--last');
                        if (last && last.parentElement === iconsContainer) iconsContainer.insertBefore(sep, last);
                        else iconsContainer.appendChild(sep);
                    }
                }
            } catch { }

            const docID = e?.detail?.protyle?.background?.ial?.id;

            // insert download and upload icons
            this.insertProtyleIcon(contentElement, '下载背景图', 'iconDownload', async (ev: Event) => {
                ev.stopPropagation();
                try {
                    const curAttr = this.canvas?.style.backgroundImage || '';
                    const m = curAttr.match(/url\((?:"|')?(.*?)(?:"|')?\)/);
                    const curUrl = m?.[1] || (await this.get_pic_url(docPath));
                    if (!curUrl) {
                        showMessage('未找到背景图链接');
                        return;
                    }
                    const local = await this.maybeDownloadToLocal(curUrl, docPath);
                    if (!local) {
                        showMessage('未能下载到本地（链接非图片或保存目录不可用）');
                        return;
                    }
                    this.applyBackgroundUrl(local);
                    if (docID) {
                        try {
                            await setBlockAttrs(docID, {
                                'custom-background-img': `${local}`,
                                'custom-st-bg-img': 'true'
                            });
                        } catch (err) {
                            console.warn('写入文档属性失败', err);
                        }
                    } else {
                        console.warn('未能获取文档ID，未写入 block attrs');
                    }
                    showMessage('背景图已下载到本地并设置');
                } catch (err) {
                    console.warn('下载背景图失败', err);
                    showMessage('下载背景图失败');
                }
            });

            this.insertProtyleIcon(contentElement, '上传背景图', 'iconUpload', async (ev: Event) => {
                ev.stopPropagation();
                try {
                    const url = await this.quickUploadToTargetDir(docPath);
                    if (url) {
                        this.applyBackgroundUrl(url);
                        if (docID) {
                            try {
                                await setBlockAttrs(docID, {
                                    'custom-background-img': `${url}`,
                                    'custom-st-bg-img': 'true'
                                });
                            } catch (err) {
                                console.warn('写入文档属性失败', err);
                            }
                        } else {
                            console.warn('未能获取文档ID，未写入 block attrs');
                        }
                        showMessage('图片已上传并设置为背景图');
                    }
                } catch (err) {
                    console.warn('上传背景图失败', err);
                    showMessage('上传背景图失败');
                }
            });
        } catch (e) {
            console.warn('插入背景图控件失败', e);
        }

    if (!appliedFromIal && this.currentMode === 'switch') {
            // switch 模式：在刷新前应用“切换防抖阈值”，真正生效
            try {
                const rawThresh = Number(this.settingdata["minutiae-bg-switch-threshold"] ?? 2);
                const thresh = this.clamp(rawThresh, 0, 3600); // seconds
                const now = Date.now();
                if (thresh > 0 && this.lastSwitchAt && (now - this.lastSwitchAt) < thresh * 1000) {
                    // 在阈值时间内，跳过本次刷新
                    return;
                }
            } catch {
                // 解析失败则忽略阈值，继续刷新
            }
            await this.refreshBackground(docPath);
            this.lastSwitchAt = Date.now();

            // switch 模式下不持久化
        }
        // startup 模式：若未从文档属性读取并要求持久化，则现在刷新一次并写入文档属性
        else if (!appliedFromIal && persist) {
            await this.refreshBackground(docPath);
            try {
                const docID = e?.detail?.protyle?.background?.ial?.id;
                if (docID) {
                    const curAttr = this.canvas?.style.backgroundImage || '';
                    const m = curAttr.match(/url\((?:"|')?(.*?)(?:"|')?\)/);
                    const chosen = m?.[1] || null;
                    if (chosen) {
                        try {
                            await setBlockAttrs(docID, {
                                'custom-background-img': `${chosen}`,
                                'custom-st-bg-img': 'true'
                            });
                        } catch (err) {
                            console.warn('写入文档属性失败', err);
                        }
                    }
                } else {
                    console.warn('startup 模式下未能获取文档ID，无法持久化背景');
                }
            } catch (err) {
                console.warn('startup 模式持久化背景失败', err);
            }
        }
    }

    private insertProtyleIcon(contentElement: HTMLElement | null, label: string, icon: string, onClick?: (ev: Event) => void) {
        try {
            let iconsEl: HTMLElement | null = contentElement?.querySelector?.('.protyle-icons') || null;
            if (!iconsEl) iconsEl = document.querySelector('.protyle-icons');
            if (!iconsEl) return;
            const span = document.createElement('span');
            span.className = 'protyle-icon ariaLabel';
            span.setAttribute('data-type', 'st-minutiae-bg');
            span.setAttribute('aria-label', label);
            span.innerHTML = `<svg><use xlink:href="#${icon}"></use></svg>`;
            const last = iconsEl.querySelector('.protyle-icon--last');
            if (last && last.parentElement === iconsEl) {
                iconsEl.insertBefore(span, last);
            } else {
                iconsEl.appendChild(span);
            }
            span.addEventListener('click', (ev) => {
                ev.stopPropagation();
                if (typeof onClick === 'function') {
                    try { onClick(ev); } catch (err) { console.warn('bg icon onClick error', err); }
                }
            });
        } catch (err) {
            console.warn('insertProtyleIcon error', err);
        }
    }

    private async refreshBackground(docPath?: string) {
        try {
            const targetPath = docPath ?? this.lastDocPath;
            const url = await this.get_pic_url(targetPath);
            this.applyBackgroundUrl(url);
        } catch (err) {
            console.warn('Minutiae 背景图刷新失败', err);
        }
    }

    private applyBackgroundUrl(url: string | null) {
        const canvas = this.ensureCanvas();
        if (!canvas) return;
        if (!url) {
            canvas.style.backgroundImage = '';
            return;
        }
        canvas.style.backgroundImage = `url("${url}")`;
    }

    private ensureCanvas(): HTMLCanvasElement | null {
        if (this.canvas && document.body.contains(this.canvas)) {
            return this.canvas;
        }

        const existing = document.getElementById('st-minutiae-bg-canvas');
        if (existing instanceof HTMLCanvasElement) {
            this.canvas = existing;
            this.syncCanvasSize();
            return existing;
        }

        const canvas = document.createElement('canvas');
        canvas.id = 'st-minutiae-bg-canvas';
        canvas.setAttribute('data-st-minutiae', 'background');
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.zIndex = '-1';
        canvas.style.pointerEvents = 'none';
        canvas.style.backgroundSize = 'cover';
        canvas.style.backgroundPosition = 'center';
        canvas.style.backgroundRepeat = 'no-repeat';
        canvas.style.transition = 'opacity 0.3s ease, filter 0.3s ease, background-image 0.3s ease';

        const root = document.documentElement;
        if (root && document.body) {
            root.insertBefore(canvas, document.body);
        } else if (document.body) {
            document.body.prepend(canvas);
        } else {
            return null;
        }

        this.canvas = canvas;
        this.syncCanvasSize();
        return canvas;
    }

    private syncCanvasSize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    private applyVisualSettings() {
        const canvas = this.ensureCanvas();
        if (!canvas) return;

        const settings = this.resolveVisualSettings();
        canvas.style.opacity = settings.opacity.toString();
        canvas.style.filter = `blur(${settings.blur}px) brightness(${settings.brightness})`;
        this.applyBodyOpacity(settings.opacity);
    }

    private resolveVisualSettings(): VisualSettings {
        const rawOpacity = Number(this.settingdata["minutiae-bg-opacity"] ?? 0.6);
        const opacity = this.clamp(rawOpacity, 0.1, 1);
        const rawBlur = Number(this.settingdata["minutiae-bg-blur"] ?? 6);
        const blur = this.clamp(rawBlur, 0, 20);
        const rawBrightness = Number(this.settingdata["minutiae-bg-brightness"] ?? 1);
        const brightness = this.clamp(rawBrightness, 0.5, 1.5);
        return { opacity, blur, brightness };
    }

    private applyBodyOpacity(backgroundOpacity: number) {
        if (!document.body) return;
        if (this.bodyOriginalOpacity === null) {
            this.bodyOriginalOpacity = document.body.style.opacity || '';
        }
        if (this.bodyOriginalTransition === null) {
            this.bodyOriginalTransition = document.body.style.transition || '';
        }
        document.body.style.transition = this.bodyOriginalTransition?.includes('opacity') ? this.bodyOriginalTransition : `${this.bodyOriginalTransition ? this.bodyOriginalTransition + ', ' : ''}opacity 0.3s ease`;
        const weighted = this.computeWeightedOpacity(backgroundOpacity);
        document.body.style.opacity = weighted.toFixed(2);
    }

    private restoreBodyStyles() {
        if (!document.body) return;
        if (this.bodyOriginalOpacity !== null) {
            document.body.style.opacity = this.bodyOriginalOpacity;
        } else {
            document.body.style.removeProperty('opacity');
        }
        if (this.bodyOriginalTransition !== null) {
            document.body.style.transition = this.bodyOriginalTransition;
        } else {
            document.body.style.removeProperty('transition');
        }
        this.bodyOriginalOpacity = null;
        this.bodyOriginalTransition = null;
    }

    private computeWeightedOpacity(input: number): number {
        const clamped = this.clamp(input, 0.1, 1);
        const weighted = 0.99 - 0.25 * clamped;
        return this.clamp(weighted, 0.74, 0.99);
    }

    private clamp(value: number, min: number, max: number): number {
        if (Number.isNaN(value)) return min;
        return Math.min(max, Math.max(min, value));
    }
}