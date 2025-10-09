import { setBlockAttrs } from "@/api/api";
import { NetworkClient } from "@/api/network";
import steveTools from "@/index";
import { IProtyle, showMessage } from "siyuan";



export class headImg {
    private settingdata: any;
    private plugin: steveTools;
    private protyle: IProtyle;
    private net: NetworkClient;

    constructor(plugin: steveTools, settingdata: any) {
        this.plugin = plugin;
        this.settingdata = settingdata;
        this.net = new NetworkClient({
            serverUrl: "",
            useProxy: true,
        });
    }

    async init() {

        this.plugin.eventBus.on("switch-protyle", async (e: any) => {
            const docID = e.detail.protyle.background.ial.id;
            // console.log("DDDDD", docID);
            this.insertProtyleIcon(
                e.detail.protyle.contentElement,
                "刷新题头图",
                async (ev: Event) => {
                    ev.stopPropagation();
                    // 点击时重新设置当前文档的题头图（复用上面获取到的 docID 和 picUrl）
                    try {
                        const newurl = await this.get_pic_url();
                        setBlockAttrs(docID, {
                            'title-img': `background-image:url("${newurl}");`,
                            'custom-st-head-img': 'true'
                        }).then(() => {
                            showMessage('已重新设置题头图');
                        }).catch((err) => {
                            console.warn('重设题头图失败', err);
                            showMessage('重设题头图失败');
                        });
                    } catch (err) {
                        console.warn('重设题头图异常', err);
                        showMessage('重设题头图异常');
                    }
                }
            );
            // console.log("Minutiae 模块检测到切换编辑器", e.detail);
            if (e.detail.protyle.background.ial?.['title-img'] || e.detail.protyle.contentElement.innerHTML.includes('custom-st-head-img')) {
                // console.log("Minutiae 模块检测到标题图或已经自动添加过");
                return;
            }
            const picUrl = await this.get_pic_url();
            if (!picUrl) {
                console.warn("Minutiae 模块没有设置图片地址");
                return;
            }
            await setBlockAttrs(docID, {
                'title-img': `background-image:url(\"${picUrl}\");`,
                'custom-st-head-img': 'true'
            })


        });

    }

    async get_pic_url(): Promise<string | null> {
        const raw = this.settingdata["minutiae-headimg-url"];
        if (!raw) return null;
        let url = String(raw).trim();

        // helper: image extension test (handles query/hash)
        const isImageUrl = (s: string) => /\.(png|jpe?g|gif|webp)(?:[?#].*)?$/i.test(s);

        // 如果直接是图片链接，直接返回
        if (isImageUrl(url)) {
            console.log("Minutiae 模块获取到图片地址(直接链接)", url);
            return url;
        }

        try {
            const response = await this.net.request({ method: "GET", path: url });
            if (!response) {
                console.warn("Minutiae get_pic_url: 无响应，返回原始 URL", url);
                return url;
            }

            const contentType = (response.headers.get("content-type") || "").toLowerCase();

            // 如果响应本身是 image/*，我们无法从二进制生成一个外部 URL，优先返回 response.headers.location 或原始 URL
            if (contentType.startsWith("image/")) {
                const location = response.headers.get("location") || response.headers.get("Location");
                if (location && isImageUrl(location)) {
                    console.log("Minutiae 模块获取到图片地址(响应 location)", location);
                    return location;
                }
                console.log("Minutiae 模块响应为图片，返回原始链接", url);
                return url;
            }

            const text = await response.text();
            const body = String(text).trim();

            // body 本身就是一个图片链接
            if (isImageUrl(body) && /^(https?:)?\/\//i.test(body)) {
                console.log("Minutiae 模块获取到图片地址(响应文本为链接)", body);
                return body;
            }

            // 试着解析 JSON，从常见字段中寻找图片链接
            try {
                const obj = JSON.parse(body);
                const found = this.findImageUrlInObject(obj, isImageUrl);
                if (found) {
                    console.log("Minutiae 模块从 JSON 中找到图片链接", found);
                    return found;
                }
            } catch (e) {
                // 不是 JSON，继续文本搜索
            }

            // 从文本中提取第一个符合图片扩展名的 URL
            const urlRegex = /(https?:\/\/[^\s'"<>]+)/gi;
            let match: RegExpExecArray | null;
            while ((match = urlRegex.exec(body)) !== null) {
                const candidate = match[1].replace(/[)\]"',>]+$/g, "");
                if (isImageUrl(candidate)) {
                    console.log("Minutiae 模块从响应文本中提取到图片链接", candidate);
                    return candidate;
                }
            }

            // 未找到可用图片链接，退回到原始 URL
            console.warn("Minutiae get_pic_url: 未能从响应中解析出图片链接，返回原始 URL", url);
            return url;
        } catch (err) {
            console.warn("Minutiae get_pic_url 请求失败，返回原始 URL", err);
            return url;
        }
    }

    // 递归在对象中查找符合 isImageUrl 的字符串属性
    private findImageUrlInObject(obj: any, isImageUrl: (s: string) => boolean): string | null {
        if (!obj) return null;
        if (typeof obj === "string") {
            const s = obj.trim();
            if (isImageUrl(s) && /^(https?:)?\/\//i.test(s)) return s;
            return null;
        }
        if (Array.isArray(obj)) {
            for (const item of obj) {
                const r = this.findImageUrlInObject(item, isImageUrl);
                if (r) return r;
            }
            return null;
        }
        if (typeof obj === "object") {
            for (const key of Object.keys(obj)) {
                const val = obj[key];
                if (typeof val === "string") {
                    const s = val.trim();
                    if (isImageUrl(s) && /^(https?:)?\/\//i.test(s)) return s;
                } else {
                    const r = this.findImageUrlInObject(val, isImageUrl);
                    if (r) return r;
                }
            }
        }
        return null;
    }

    /**
     * 在 protyle 的图标栏中插入一个样式一致的图标按钮，防止重复添加。
     * @param contentElement protyle 的 contentElement 或父元素，用于查找 .protyle-icons
     * @param label 
     */
    private insertProtyleIcon(contentElement: HTMLElement | null, label: string, onClick?: (ev: Event, el: HTMLElement) => void) {
        try {
            if (!contentElement) return;

            // 优先在传入的 contentElement 内查找 .protyle-icons
            let iconsEl: HTMLElement | null = contentElement.querySelector?.('.protyle-icons') || null;
            // 回退到全局查找（某些 context 可能只在 document 中）
            if (!iconsEl) iconsEl = document.querySelector('.protyle-icons');
            if (!iconsEl) return;

            // 防止重复添加：查找 data-type="st-headimg-" 或特定类
            if (iconsEl.querySelector(`[data-type="st-headimg-${label}"]`)) {
                // 已经存在，不重复插入
                return;
            }

            // 创建新的图标 span，保持与现有图标一致的类名
            const span = document.createElement('span');
            span.className = 'protyle-icon ariaLabel';
            span.setAttribute('data-type', `st-headimg-${label}`);
            span.setAttribute('aria-label', label);
            // 内嵌 SVG（复用现有 image 图标）
            span.innerHTML = '<svg><use xlink:href="#iconST"></use></svg>';

            // 在插入位置上，优先放到倒数第二位（即在有 --last 的元素之前）
            const last = iconsEl.querySelector('.protyle-icon--last');
            if (last && last.parentElement === iconsEl) {
                iconsEl.insertBefore(span, last);
            } else {
                iconsEl.appendChild(span);
            }

            // 添加点击事件：如果提供 onClick 回调则调用它，否则使用默认行为
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
