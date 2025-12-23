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
        const notebookInfo = this.resolveNotebookInfo(e);
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

        if (this.isNotebookBlacklisted(notebookInfo, docPath)) {
            console.debug('Minutiae head image auto-set skipped due to notebook blacklist', notebookInfo);
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

    private getNotebookBlacklist(): Set<string> {
        const result = new Set<string>();
        const raw = this.settingdata?.["minutiae-headimg-notebook-blacklist"];
        const push = (value: unknown) => {
            if (typeof value !== 'string') return;
            let entry = value.trim();
            if (!entry) return;
            if (entry.startsWith('#') || entry.startsWith('//')) return;
            entry = entry.replace(/[\r\n]+/g, ' ').trim();
            if (!entry) return;
            const lowered = entry.toLowerCase();
            if (lowered === 'true' || lowered === 'false') return;
            result.add(entry.toLowerCase());
        };

        if (!raw) {
            return result;
        }

        if (Array.isArray(raw)) {
            raw.forEach(item => push(typeof item === 'string' ? item : String(item ?? '')));
            return result;
        }

        if (typeof raw === 'object') {
            for (const [key, val] of Object.entries(raw)) {
                if (val === false || val === null) continue;
                push(key);
                if (typeof val === 'string') push(val);
            }
            return result;
        }

        if (typeof raw === 'string') {
            const text = raw.trim();
            if (!text) return result;
            try {
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed)) {
                    parsed.forEach(item => push(typeof item === 'string' ? item : String(item ?? '')));
                    return result;
                }
            } catch {
                // not JSON, fall through to manual parsing
            }
            text
                .split(/[\n,;]+/)
                .map(segment => segment.trim())
                .forEach(segment => push(segment));
            return result;
        }

        push(String(raw));
        return result;
    }

    private resolveNotebookInfo(event: any): { id?: string; name?: string } {
        try {
            const detail = event?.detail ?? {};
            const protyle = detail?.protyle ?? {};
            const notebook = detail?.notebook ?? protyle?.notebook ?? {};
            const idCandidates: Array<string | null | undefined> = [
                notebook?.id,
                detail?.notebookId,
                protyle?.notebookId,
                protyle?.notebookID,
                protyle?.model?.notebookId,
                protyle?.block?.box,
                protyle?.block?.notebookId,
                detail?.block?.box,
                detail?.doc?.box,
            ];
            const nameCandidates: Array<string | null | undefined> = [
                notebook?.name,
                detail?.notebookName,
                protyle?.notebookName,
                protyle?.model?.notebookName,
            ];
            const id = idCandidates.find(v => typeof v === 'string' && v.trim())?.trim();
            let name = nameCandidates.find(v => typeof v === 'string' && v.trim())?.trim();

            if ((!name || name === id) && id && typeof window !== 'undefined') {
                try {
                    const notebooks = (window as any)?.siyuan?.notebooks;
                    if (Array.isArray(notebooks)) {
                        const matched = notebooks.find((nb: any) => nb && typeof nb.id === 'string' && nb.id === id);
                        if (matched && matched.name) {
                            name = String(matched.name).trim() || name;
                        }
                    }
                } catch {
                    // ignore lookup errors
                }
            }

            return {
                id: id || undefined,
                name: name || undefined,
            };
        } catch {
            return {};
        }
    }

    private isNotebookBlacklisted(info: { id?: string; name?: string }, docPath?: string | null | undefined): boolean {
        const blacklist = this.getNotebookBlacklist();
        if (!blacklist.size) return false;
        const entries = Array.from(blacklist.values());
        const matches = (candidate?: string | null) => {
            const value = candidate?.trim().toLowerCase();
            if (!value) return false;
            return entries.some(entry => entry === value);
        };

        if (matches(info?.id)) return true;
        if (matches(info?.name)) return true;

        if (docPath) {
            const firstSegment = docPath.split('/')[0]?.trim();
            if (matches(firstSegment)) return true;
        }

        return false;
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
