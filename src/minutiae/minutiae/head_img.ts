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
            useProxy: false,
        });
    }

    async init() {

        this.plugin.eventBus.on("switch-protyle", async (e: any) => {
            const docID = e.detail.protyle.background.ial.id;
            const docPath = e.detail.protyle.path;
            // console.log("DDDDD", docID);
            this.insertProtyleIcon(
                e.detail.protyle.contentElement,
                "刷新题头图",
                async (ev: Event) => {
                    ev.stopPropagation();
                    // 点击时重新设置当前文档的题头图（复用上面获取到的 docID 和 picUrl）
                    try {
                        const newurl = await this.get_pic_url(docPath);
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
            const picUrl = await this.get_pic_url(docPath);
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

    /**
     * 从文档路径中提取ID列表
     * 从 .sy 开始往左识别，提取所有符合格式的ID（格式：yyyyMMddHHmmss-xxxxxxx）
     * @param path 文档路径，如 "/20251005215652-b9l5167/20251009185242-fse4qx0.sy"
     * @returns ID数组，从右到左排序，如 ["20251009185242-fse4qx0", "20251005215652-b9l5167"]
     */
    private extractIdsFromPath(path: string): string[] {
        if (!path) return [];
        
        // 移除 .sy 扩展名
        const pathWithoutExt = path.replace(/\.sy$/, '');
        
        // 分割路径并反转（从右往左）
        const segments = pathWithoutExt.split('/').filter(s => s.trim());
        
        // 提取符合ID格式的部分：yyyyMMddHHmmss-xxxxxxx（14位数字-7位字符）
        const idPattern = /(\d{14}-[a-z0-9]{7})/i;
        const ids: string[] = [];
        
        // 从右往左遍历
        for (let i = segments.length - 1; i >= 0; i--) {
            const match = segments[i].match(idPattern);
            if (match) {
                ids.push(match[1]);
            }
        }
        
        return ids;
    }

    /**
     * 根据文档路径查找配置的映射链接
     * @param path 文档路径
     * @returns 如果找到映射则返回对应的图片链接，否则返回null
     */
    private getMappedUrlFromPath(path: string): string | null {
        try {
            const mappingJson = this.settingdata["minutiae-headimg-id-mapping"];
            if (!mappingJson || typeof mappingJson !== 'string') return null;
            
            const mapping = JSON.parse(mappingJson.trim() || '{}');
            if (typeof mapping !== 'object' || !mapping) return null;
            
            // 从路径中提取ID列表（从右往左）
            const ids = this.extractIdsFromPath(path);
            
            // 按顺序检查每个ID，找到第一个匹配的就返回
            for (const id of ids) {
                if (mapping[id]) {
                    console.log(`Minutiae 模块找到ID映射: ${id} -> ${mapping[id]}`);
                    return String(mapping[id]);
                }
            }
            
            return null;
        } catch (err) {
            console.warn('Minutiae getMappedUrlFromPath 解析失败', err);
            return null;
        }
    }

    async get_pic_url(path?: string): Promise<string | null> {
        // 优先检查路径映射
        if (path) {
            const mappedUrl = this.getMappedUrlFromPath(path);
            if (mappedUrl) {
                console.log("Minutiae 模块使用路径ID映射的图片地址", mappedUrl);
                return this.validateAndResolveImageUrl(mappedUrl);
            }
        }
        
        const raw = this.settingdata["minutiae-headimg-url"];
        if (!raw) return null;
        let url = String(raw).trim();

        // 直接验证并解析URL
        return this.validateAndResolveImageUrl(url);
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
     * 验证并解析图片URL，确保返回的是有效的图片链接
     * 对于随机图片API等情况，会尝试获取重定向后的真实图片链接
     * @param url 要验证的URL
     * @returns 验证后的图片URL，如果无法验证则返回原始URL
     */
    private async validateAndResolveImageUrl(url: string): Promise<string> {
        if (!url || typeof url !== 'string') return url;

        // helper: image extension test (handles query/hash)
        const isImageUrl = (s: string) => /\.(png|jpe?g|gif|webp)(?:[?#].*)?$/i.test(s);

        // 如果已经是图片链接，直接返回
        if (isImageUrl(url)) {
            console.log("Minutiae 模块验证图片链接通过", url);
            return url;
        }

        // 尝试HEAD请求验证URL是否指向图片或重定向
        try {
            console.log("Minutiae 模块验证图片链接，发起HEAD请求", url);
            const headResponse = await this.net.request({ method: "HEAD", path: url });
            if (headResponse) {
                // 如果浏览器已自动跟随重定向，可直接使用最终URL
                if ((headResponse as any).redirected && headResponse.url && headResponse.url !== url) {
                    console.log("Minutiae 模块HEAD已跟随重定向，最终URL:", headResponse.url);
                    return headResponse.url;
                }
                // 优先检查重定向，无论Content-Type是什么
                const location = headResponse.headers.get("location") || headResponse.headers.get("Location");
                if (location) {
                    const abs = this.resolveAbsoluteRedirectUrl(url, headResponse.headers, location);
                    if (abs) {
                        console.log("Minutiae 模块HEAD请求发现重定向", abs);
                        return this.validateAndResolveImageUrl(abs);
                    }
                }
                // 某些环境下可从伪头中拼出URL（如 :authority 和 :path）
                const pseudoAbs = this.resolveAbsoluteRedirectUrl(url, headResponse.headers);
                if (pseudoAbs) {
                    console.log("Minutiae 模块HEAD根据伪头推断重定向URL", pseudoAbs);
                    return this.validateAndResolveImageUrl(pseudoAbs);
                }

                // 没有重定向，检查Content-Type是否为图片
                const contentType = (headResponse.headers.get("content-type") || "").toLowerCase();
                if (contentType.startsWith("image/")) {
                    console.log("Minutiae 模块HEAD请求确认是图片类型", contentType, url);
                    return url;
                }
            }
        } catch (headErr) {
            console.warn("Minutiae 模块HEAD请求失败，尝试GET请求", headErr);
        }

        // HEAD请求失败或不是图片，尝试GET请求
        try {
            console.log("Minutiae 模块验证图片链接，发起GET请求", url);
            const getResponse = await this.net.request({ method: "GET", path: url });
            if (getResponse) {
                // 如果浏览器已自动跟随重定向，可直接使用最终URL
                if ((getResponse as any).redirected && getResponse.url && getResponse.url !== url) {
                    console.log("Minutiae 模块GET已跟随重定向，最终URL:", getResponse.url);
                    return getResponse.url;
                }
                // 优先检查重定向，无论Content-Type是什么
                const location = getResponse.headers.get("location") || getResponse.headers.get("Location");
                if (location) {
                    const abs = this.resolveAbsoluteRedirectUrl(url, getResponse.headers, location);
                    if (abs) {
                        console.log("Minutiae 模块GET请求发现重定向", abs);
                        return this.validateAndResolveImageUrl(abs);
                    }
                }
                // 某些环境下可从伪头中拼出URL（如 :authority 和 :path）
                const pseudoAbs = this.resolveAbsoluteRedirectUrl(url, getResponse.headers);
                if (pseudoAbs) {
                    console.log("Minutiae 模块GET根据伪头推断重定向URL", pseudoAbs);
                    return this.validateAndResolveImageUrl(pseudoAbs);
                }

                // 没有重定向，检查Content-Type是否为图片
                const contentType = (getResponse.headers.get("content-type") || "").toLowerCase();
                if (contentType.startsWith("image/")) {
                    console.log("Minutiae 模块GET请求确认是图片类型", contentType, url);
                    return url;
                }

                // 如果响应是文本，尝试解析内容
                try {
                    const text = await getResponse.text();
                    const body = String(text).trim();

                    // 检查响应文本是否是图片URL
                    if (isImageUrl(body) && /^(https?:)?\/\//i.test(body)) {
                        console.log("Minutiae 模块GET响应文本是图片链接", body);
                        return body;
                    }

                    // 尝试解析JSON
                    try {
                        const obj = JSON.parse(body);
                        const found = this.findImageUrlInObject(obj, isImageUrl);
                        if (found) {
                            console.log("Minutiae 模块从GET响应JSON中找到图片链接", found);
                            return found;
                        }
                    } catch (jsonErr) {
                        // 不是JSON，继续
                    }

                    // 从文本中提取图片URL
                    const urlRegex = /(https?:\/\/[^\s'"<>]+)/gi;
                    let match: RegExpExecArray | null;
                    while ((match = urlRegex.exec(body)) !== null) {
                        const candidate = match[1].replace(/[)\]"',>]+$/g, "");
                        if (isImageUrl(candidate)) {
                            console.log("Minutiae 模块从GET响应文本中提取到图片链接", candidate);
                            return candidate;
                        }
                    }
                } catch (textErr) {
                    console.warn("Minutiae 模块解析GET响应文本失败", textErr);
                }
            }
        } catch (getErr) {
            console.warn("Minutiae 模块GET请求失败", getErr);
        }

        // 所有验证都失败，返回原始URL
        console.warn("Minutiae 模块无法验证图片链接，返回原始URL", url);
        return url;
    }

    /**
     * 将重定向的相对Location或HTTP/2伪头组合成绝对URL
     * @param base 原始请求URL
     * @param headers 响应头（可能包含 Location 或 :authority/:path）
     * @param location 可选的Location头值
     */
    private resolveAbsoluteRedirectUrl(base: string, headers: Headers, location?: string): string | null {
        try {
            // 1) 有显式Location优先
            if (location) {
                // 绝对URL
                if (/^https?:\/\//i.test(location)) return location;
                // 相对URL
                return new URL(location, base).toString();
            }

            // 2) 一些代理/环境会把重定向目标反映在伪头里
            const authority = headers.get(":authority") || headers.get("authority") || headers.get("host") || headers.get("Host");
            const path = headers.get(":path") || headers.get("path");
            if (authority && path) {
                const parsed = new URL(base);
                const proto = parsed.protocol || "https:";
                const abs = `${proto}//${authority}${path.startsWith('/') ? path : '/' + path}`;
                return abs;
            }
        } catch (e) {
            console.warn('resolveAbsoluteRedirectUrl 失败', e);
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
