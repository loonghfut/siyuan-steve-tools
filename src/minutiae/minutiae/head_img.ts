import { setBlockAttrs } from "@/api/api";
import steveTools from "@/index";
import { showMessage } from "siyuan";
import { MinutiaeImageBase } from "./image_base";

export class headImg extends MinutiaeImageBase {
    private initialized = false;
    private switchHandler = (e: any) => { void this.handleSwitchProtyle(e); };

    constructor(plugin: steveTools, settingdata: any) {
        super(plugin, settingdata);
    }

    async init() {
        if (this.initialized) return;
        this.plugin.eventBus.on("switch-protyle", this.switchHandler);
        this.initialized = true;
    }

    destroy() {
        if (!this.initialized) return;
        this.plugin.eventBus.off("switch-protyle", this.switchHandler);
        this.initialized = false;
    }

    override updateSettingData(settingdata: any) {
        super.updateSettingData(settingdata);
    }

    private async handleSwitchProtyle(e: any) {
        const docID = e?.detail?.protyle?.background?.ial?.id;
        const docPath = e?.detail?.protyle?.path;
        if (!docID) return;

        try {
            const iconsContainer: HTMLElement | null = e?.detail?.protyle?.contentElement?.querySelector?.('.protyle-icons') || document.querySelector('.protyle-icons');
            if (iconsContainer) {
                const showRandomEls = Array.from(iconsContainer.querySelectorAll('.protyle-icon[data-type="show-random"]'));
                showRandomEls.forEach(el => el.remove());
                const uploadInputs = Array.from(iconsContainer.querySelectorAll('input.b3-form__upload'));
                uploadInputs.forEach((inp) => {
                    const parent = inp.closest('.protyle-icon');
                    if (parent) parent.remove();
                    else inp.remove();
                });
            }
        } catch (err) {
            console.warn('清理不需要的 protyle 图标失败', err);
        }

        const contentElement = e?.detail?.protyle?.contentElement ?? null;

        this.insertProtyleIcon(
            contentElement,
            "ST刷新题头图",
            "iconRefresh",
            async (ev: Event) => {
                ev.stopPropagation();
                try {
                    const newurl = await this.get_pic_url(docPath);
                    if (!newurl) {
                        showMessage('未找到题头图链接');
                        return;
                    }
                    await setBlockAttrs(docID, {
                        'title-img': `background-image:url("${newurl}");`,
                        'custom-st-head-img': 'true'
                    });
                    showMessage('已重新设置题头图');
                } catch (err) {
                    console.warn('重设题头图异常', err);
                    showMessage('重设题头图异常');
                }
            }
        );

        this.insertProtyleIcon(
            contentElement,
            "ST下载题头图",
            "iconDownload",
            async (ev: Event) => {
                ev.stopPropagation();
                try {
                    const attrStr: string | undefined = e?.detail?.protyle?.background?.ial?.['title-img'];
                    const curUrl = this.extractUrlFromTitleImgAttr(attrStr || '');
                    const url = curUrl || (await this.get_pic_url(docPath));
                    if (!url) {
                        showMessage('未找到题头图链接');
                        return;
                    }
                    const localUrl = await this.maybeDownloadToLocal(url, docPath);
                    if (!localUrl) {
                        showMessage('未能下载到本地（未识别到保存目录或链接非图片）');
                        return;
                    }
                    await setBlockAttrs(docID, {
                        'title-img': `background-image:url("${localUrl}");`,
                        'custom-st-head-img': 'true'
                    });
                    showMessage('已下载并替换为本地题头图');
                } catch (err) {
                    console.warn('下载并替换题头图失败', err);
                    showMessage('下载并替换题头图失败');
                }
            }
        );

        this.insertProtyleIcon(
            contentElement,
            "ST上传题头图",
            "iconUpload",
            async (ev: Event) => {
                ev.stopPropagation();
                try {
                    const url = await this.quickUploadToTargetDir(docPath);
                    if (url) {
                        await setBlockAttrs(docID, {
                            'title-img': `background-image:url("${url}");`,
                            'custom-st-head-img': 'true'
                        });
                        showMessage('图片已上传并设置为题头图');
                    }
                } catch (err) {
                    console.warn('上传题头图失败', err);
                    showMessage('上传题头图失败');
                }
            }
        );

        if (e?.detail?.protyle?.background?.ial?.['title-img'] || e?.detail?.protyle?.contentElement?.innerHTML.includes('custom-st-head-img')) {
            return;
        }

        const picUrl = await this.get_pic_url(docPath);
        if (!picUrl) {
            console.warn("Minutiae 模块没有设置图片地址");
            return;
        }
        await setBlockAttrs(docID, {
            'title-img': `background-image:url("${picUrl}");`,
            'custom-st-head-img': 'true'
        });
    }

    protected override getUrlSettingKey(): string {
        return "minutiae-headimg-url";
    }

    protected override getMappingSettingKey(): string {
        return "minutiae-headimg-id-mapping";
    }

    protected override getDefaultSaveDirKey(): string {
        return "minutiae-headimg-default-save-dir";
    }

    private insertProtyleIcon(contentElement: HTMLElement | null, label: string, icon: string, onClick?: (ev: Event, el: HTMLElement) => void) {
        try {
            if (!contentElement) return;
            let iconsEl: HTMLElement | null = contentElement.querySelector?.('.protyle-icons') || null;
            if (!iconsEl) iconsEl = document.querySelector('.protyle-icons');
            if (!iconsEl) return;
            if (iconsEl.querySelector(`[data-type="st-headimg-${label}"]`)) {
                return;
            }
            const span = document.createElement('span');
            span.className = 'protyle-icon ariaLabel';
            span.setAttribute('data-type', `st-headimg-${label}`);
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
                    try {
                        onClick(ev, span);
                        return;
                    } catch (err) {
                        console.warn('protyle icon onClick error', err);
                    }
                }
                showMessage(`默认回调`);
            });
        } catch (err) {
            console.warn('insertProtyleIcon error', err);
        }
    }
}
