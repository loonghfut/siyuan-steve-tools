import { readDir, setBlockAttrs, putFile } from "@/api/api";
import { NetworkClient } from "@/api/network";
import steveTools from "@/index";
import { showMessage } from "siyuan";



export class headImg {
    private settingdata: any;
    private plugin: steveTools;
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
            // 清理：移除或隐藏不需要的默认图标（例如 data-type="show-random" 和 上传 input）
            try {
                const iconsContainer: HTMLElement | null = e.detail.protyle.contentElement.querySelector?.('.protyle-icons') || document.querySelector('.protyle-icons');
                if (iconsContainer) {
                    // 移除 data-type="show-random" 的图标
                    const showRandomEls = Array.from(iconsContainer.querySelectorAll('.protyle-icon[data-type="show-random"]'));
                    showRandomEls.forEach(el => el.remove());
                    // 移除包含上传 input 的图标（class b3-form__upload）
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
            // console.log("DDDDD", docID);
            this.insertProtyleIcon(
                e.detail.protyle.contentElement,
                "ST刷新题头图",
                "iconRefresh",
                async (ev: Event) => {
                    ev.stopPropagation();
                    // 点击时重新设置当前文档的题头图（复用上面获取到的 docID 和 picUrl）
                    try {
                        const newurl = await this.get_pic_url(docPath);
                        setBlockAttrs(docID, {
                            'title-img': `background-image:url(\"${newurl}\");`,
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
            // 下载按钮：把当前题头图（若为外链）下载到本地目录并替换为 /assets 链接
            this.insertProtyleIcon(
                e.detail.protyle.contentElement,
                "ST下载题头图",
                "iconDownload",
                async (ev: Event) => {
                    ev.stopPropagation();
                    try {
                        // 优先从当前文档属性读取 title-img
                        const attrStr: string | undefined = e.detail?.protyle?.background?.ial?.['title-img'];
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
                            'title-img': `background-image:url(\"${localUrl}\");`,
                            'custom-st-head-img': 'true'
                        });
                        showMessage('已下载并替换为本地题头图');
                    } catch (err) {
                        console.warn('下载并替换题头图失败', err);
                        showMessage('下载并替换题头图失败');
                    }
                }
            );
            // 上传按钮：快速把图片加入到推导目录并刷新
            this.insertProtyleIcon(
                e.detail.protyle.contentElement,
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

    // 旧版 parseIdMapping 已移除，统一用 parseIdMappingRich

    // 宽松解析（直接解析原始输入），支持：
    // id -> string | string[] | { urls?: string[]|string; dir?: string|array; file?: string|array }
    private parseIdMappingRich(input: any): Record<string, { urls: string[]; dirs: string[]; files: string[] }> | null {
        const rich: Record<string, { urls: string[]; dirs: string[]; files: string[] }> = {};
        const ensureBucket = (id: string) => (rich[id] ||= { urls: [], dirs: [], files: [] });
        const pushOne = (id: string, val: string) => {
            const bucket = ensureBucket(id);
            const info = this.toAssetsLocalInfo(val);
            if (info) {
                if (info.isDir) bucket.dirs.push(`assets/${info.subdir}`);
                else bucket.files.push(`assets/${info.subdir}${info.filename ? '/' + info.filename : ''}`);
            } else {
                bucket.urls.push(val);
            }
        };
        const pushMany = (id: string, vals: any) => {
            if (Array.isArray(vals)) vals.map(String).forEach(v => pushOne(id, v));
            else if (vals != null) pushOne(id, String(vals));
        };

        try {
            if (input && typeof input === 'object') {
                for (const [idRaw, v] of Object.entries(input)) {
                    const id = String(idRaw).trim();
                    if (!id) continue;
                    if (Array.isArray(v)) {
                        pushMany(id, v);
                    } else if (v && typeof v === 'object') {
                        const obj: any = v;
                        if (obj.urls) pushMany(id, obj.urls);
                        if (obj.url) pushMany(id, obj.url);
                        if (obj.dir) pushMany(id, obj.dir);
                        if (obj.dirs) pushMany(id, obj.dirs);
                        if (obj.file) pushMany(id, obj.file);
                        if (obj.files) pushMany(id, obj.files);
                    } else {
                        pushOne(id, String(v ?? ''));
                    }
                }
                return Object.keys(rich).length ? rich : null;
            }

            if (typeof input === 'string') {
                let s = input.trim();
                if (!s) return null;
                s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, '"');
                s = s.replace(/^\s*\/\/.*$/gm, '').replace(/^\s*#.*$/gm, '');
                s = s.replace(/,(\s*[}\]])/g, '$1');
                try {
                    const obj = JSON.parse(s);
                    if (obj && typeof obj === 'object') {
                        return this.parseIdMappingRich(obj);
                    }
                } catch {
                    // 宽松逐行 + 允许重复键：id : value1,value2
                    const lines = s.split(/\r?\n/);
                    for (const rawLine of lines) {
                        const line = rawLine.trim();
                        if (!line) continue;
                        const cleaned = line.replace(/[;,]+\s*$/, '');
                        const m = cleaned.match(/^(.*?)\s*[:=]\s*(.*)$/);
                        if (m) {
                            const id = m[1].trim().replace(/^"|"$/g, '').replace(/[“”]/g, '');
                            const list = m[2].split(',').map(x => x.trim()).filter(Boolean);
                            list.forEach(v => pushOne(id, v));
                        }
                    }
                    return Object.keys(rich).length ? rich : null;
                }
            }
        } catch (e) {
            console.warn('parseIdMappingRich 解析失败', e);
        }
        return null;
    }

    /**
     * 根据文档路径查找配置的映射链接
     * @param path 文档路径
     * @returns 如果找到映射则返回对应的图片链接，否则返回null
     */
    // 已弃用：保留注释说明（统一改用 getIdCandidatesFromPath）

    // 返回匹配文档ID的候选集合：{ remotes, files, dirs }
    private getIdCandidatesFromPath(path: string): { remotes: string[]; files: string[]; dirs: string[] } | null {
        try {
            const mapping = this.parseIdMappingRich(this.settingdata["minutiae-headimg-id-mapping"]);
            if (!mapping) return null;
            const ids = this.extractIdsFromPath(path);
            for (const id of ids) {
                const bucket = mapping[id];
                if (bucket) return { remotes: bucket.urls, files: bucket.files, dirs: bucket.dirs };
            }
            return null;
        } catch (e) {
            console.warn('getIdCandidatesFromPath 失败', e);
            return null;
        }
    }

    async get_pic_url(path?: string): Promise<string | null> {
        // 1) 文档ID候选（优先使用远程；其次本地文件；最后目录随机）
        if (path) {
            const cand = this.getIdCandidatesFromPath(path);
            if (cand) {
                // 远程优先
                for (const u of cand.remotes) {
                    const r = await this.resolveUrlCandidate(u);
                    if (r) return r;
                }
                // 本地文件
                for (const f of cand.files) {
                    const r = await this.resolveUrlCandidate(f);
                    if (r) return r;
                }
                // 目录随机
                for (const d of cand.dirs) {
                    const r = await this.resolveUrlCandidate(d.endsWith('/') ? d : (d + '/'));
                    if (r) return r;
                }
            }
        }

        // 2) 全局题头图地址（同样支持三种形态）
        const raw = this.settingdata["minutiae-headimg-url"];
        if (!raw) return null;
        return this.resolveUrlCandidate(String(raw).trim());
    }

    // 解析候选：assets 目录 => 随机；assets 文件 => 标准化；其他 => 远程解析
    private async resolveUrlCandidate(candidate: string): Promise<string | null> {
        if (!candidate) return null;
        const c = candidate.trim();
        const info = this.toAssetsLocalInfo(c);
        if (info) {
            if (info.isDir) return this.pickRandomLocalAsset(info.subdir);
            const prefix = info.subdir ? info.subdir + '/' : '';
            return `assets/${prefix}${info.filename ? encodeURIComponent(info.filename) : ''}`;
        }
        return this.validateAndResolveImageUrl(c);
    }

    // 识别 assets 路径：assets/... 或 /assets/... 或 /data/assets/...
    private toAssetsLocalInfo(input: string): { subdir: string, isDir: boolean, filename?: string } | null {
        try {
            let s = input.trim();
            if (!s) return null;
            // 统一到 assets/ 前缀
            if (/^\/data\/assets\//i.test(s)) s = s.replace(/^\/data\//i, ''); // /data/assets => assets
            if (/^\/assets\//i.test(s)) s = s.replace(/^\//, ''); // /assets => assets
            if (!/^assets\//i.test(s)) return null;
            s = s.replace(/^assets\//i, '');
            // 目录（以 / 结尾）
            if (/\/$/.test(s)) return { subdir: s.replace(/\/$/, ''), isDir: true };
            // 是否看起来像文件（包含图片扩展名）
            const hasExt = /\.(png|jpe?g|gif|webp|bmp|svg|avif|apng|ico)(?:$|[?#])/i.test(s);
            if (hasExt) {
                const idx = s.lastIndexOf('/');
                if (idx === -1) return { subdir: '', isDir: false, filename: s };
                return { subdir: s.slice(0, idx), isDir: false, filename: s.slice(idx + 1) };
            }
            // 否则按目录处理
            return { subdir: s, isDir: true };
        } catch {
            return null;
        }
    }

    // 从 /data/assets/{dir} 下随机选取一张图片，返回可在 CSS 中使用的绝对或相对 URL（使用 /assets/ 前缀）
    private async pickRandomLocalAsset(dir: string): Promise<string | null> {
        try {
            // 规范化：移除开头/结尾斜杠
            const sub = dir.replace(/^\/+|\/+$/g, '');
            if (!sub) return null;
            const basePath = `/data/assets/${sub}/`;
            const list = await readDir(basePath).catch(e => { console.warn('readDir 失败', basePath, e); return null; });
            if (!Array.isArray(list)) {
                // 兼容 API 返回非数组（某些封装可能返回单个对象），放弃
                console.warn('本地目录不是数组或不可读', basePath, list);
                return null;
            }
            const exts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'apng', 'ico'];
            const imgFiles = list
                .filter((it: any) => it && it.isDir === false)
                .map((it: any) => it.name)
                .filter((name: string) => new RegExp(`\\.(${exts.join('|')})(?:$|[?#])`, 'i').test(name));

            if (!imgFiles.length) {
                console.warn('本地目录下没有图片文件', basePath);
                return null;
            }
            // 随机
            const pick = imgFiles[Math.floor(Math.random() * imgFiles.length)];
            // 思源静态资源访问路径：/assets/ 相对 data/assets
            const url = `assets/${sub}/${encodeURIComponent(pick)}`;
            console.log('Minutiae 本地随机选取图片', url);
            return url;
        } catch (e) {
            console.warn('pickRandomLocalAsset 异常', e);
            return null;
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
     * 验证并解析图片URL，确保返回的是有效的图片链接
     * 对于随机图片API等情况，会尝试获取重定向后的真实图片链接
     * @param url 要验证的URL
     * @returns 验证后的图片URL，如果无法验证则返回原始URL
     */
    private async validateAndResolveImageUrl(url: string, depth = 0): Promise<string> {
        if (!url || typeof url !== 'string') return url;

        // 限制最大递归层级，避免循环重定向
        const MAX_REDIRECTS = 5;
        if (depth > MAX_REDIRECTS) {
            console.warn("Minutiae 模块重定向层级过深，返回当前URL", url);
            return url;
        }

        // helper: image extension test (handles query/hash)
        const isImageUrl = (s: string) => /\.(png|jpe?g|gif|webp)(?:[?#].*)?$/i.test(s);

        // 如果已经是图片链接，直接返回
        if (isImageUrl(url)) {
            console.log("Minutiae 模块验证图片链接通过", url);
            return url;
        }

        // 统一使用 GET 进行验证与解析（不再使用 HEAD）
        try {
            console.log("Minutiae 模块验证图片链接，发起GET请求", url);
            const getResponse = await this.net.request({ method: "GET", path: url });
            if (getResponse) {
                // 如果浏览器已自动跟随重定向，记录最终URL，但仍需继续校验
                const effectiveUrl = ((getResponse as any).redirected && getResponse.url && getResponse.url !== url)
                    ? (console.log("Minutiae 模块GET已跟随重定向，最终URL:", getResponse.url), getResponse.url)
                    : url;
                // 优先检查重定向，无论Content-Type是什么
                const location = getResponse.headers.get("location") || getResponse.headers.get("Location") || getResponse.headers.get("content-location") || getResponse.headers.get("Content-Location");
                if (location) {
                    const abs = this.resolveAbsoluteRedirectUrl(effectiveUrl, getResponse.headers, location);
                    if (abs) {
                        console.log("Minutiae 模块GET请求发现重定向", abs);
                        return this.validateAndResolveImageUrl(abs, depth + 1);
                    }
                }
                // 某些环境下可从伪头中拼出URL（如 :authority 和 :path）
                const pseudoAbs = this.resolveAbsoluteRedirectUrl(effectiveUrl, getResponse.headers);
                if (pseudoAbs) {
                    console.log("Minutiae 模块GET根据伪头推断重定向URL", pseudoAbs);
                    return this.validateAndResolveImageUrl(pseudoAbs, depth + 1);
                }

                // 没有重定向，检查Content-Type是否为图片
                const contentType = (getResponse.headers.get("content-type") || "").toLowerCase();
                if (contentType.startsWith("image/")) {
                    console.log("Minutiae 模块GET请求确认是图片类型", contentType, effectiveUrl);
                    return effectiveUrl;
                }

                // 如果响应是文本，尝试解析内容
                try {
                    const text = await getResponse.text();
                    let body = String(text).trim();

                    // 检查响应文本是否是图片URL（直接返回图片链接的情况）
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

                    // 处理 HTML/警告场景：去除标签并实体解码
                    const stripped = this.stripHtmlTags(body);
                    const normalized = this.normalizeWhitespace(this.decodeHtmlEntities(stripped));

                    // 从文本中提取图片URL
                    const urlRegex = /(https?:\/\/[^\s'"<>]+)/gi;
                    let match: RegExpExecArray | null;
                    while ((match = urlRegex.exec(normalized)) !== null) {
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
            if (path) {
                // 如果有 authority，用其构造；否则回退到 base 的 origin
                const parsed = new URL(base);
                const proto = parsed.protocol || "https:";
                const host = authority || parsed.host;
                const normalizedPath = path.startsWith('/') ? path : '/' + path;
                const abs = `${proto}//${host}${normalizedPath}`;
                return abs;
            }
        } catch (e) {
            console.warn('resolveAbsoluteRedirectUrl 失败', e);
        }
        return null;
    }

    // 选择图片并上传到推导目录（由映射或全局地址推导），返回 /assets/... 访问路径
    private async quickUploadToTargetDir(docPath?: string): Promise<string | null> {
        const subdir = this.deriveTargetAssetsSubdir(docPath);
        if (!subdir) {
            showMessage('请将“题头图地址”或文档映射设置为 assets/<目录>（或 /data/assets/<目录>）');
            return null;
        }
        // 构造隐藏的文件选择器
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        return new Promise((resolve) => {
            input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return resolve(null);
                try {
                    // 保存到 /data/assets/{subdir}/{filename}
                    const sub = subdir.replace(/^\/+|\/+$/g, '');
                    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                    const assetPath = `/data/assets/${sub}/${safeName}`;
                    await putFile(assetPath, false, file);
                    const url = `assets/${sub}/${encodeURIComponent(safeName)}`;
                    resolve(url);
                } catch (err) {
                    console.warn('上传图片到本地目录失败', err);
                    showMessage('上传图片失败');
                    resolve(null);
                }
            };
            // 触发选择
            input.click();
        });
    }

    // 基础工具：去除 HTML 标签
    private stripHtmlTags(input: string): string {
        if (!input) return input;
        return input.replace(/<[^>]*>/g, ' ');
    }

    // 基础工具：压缩空白字符
    private normalizeWhitespace(input: string): string {
        if (!input) return input;
        return input.replace(/\s+/g, ' ').trim();
    }

    // 基础工具：解码常见 HTML 实体
    private decodeHtmlEntities(input: string): string {
        if (!input) return input;
        const map: Record<string, string> = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': "'",
        };
        return input.replace(/&(amp|lt|gt|quot|#39);/g, (m) => map[m] || m);
    }

    // 从 title-img 属性值（background-image:url("...");）中提取 URL
    private extractUrlFromTitleImgAttr(attr: string): string | null {
        if (!attr) return null;
        const m = attr.match(/url\(("|')?(.*?)(\1)?\)/i);
        if (m && m[2]) return m[2];
        return null;
    }

    // 如果 URL 已经是本地资源（/assets 或 data/assets），直接返回标准化的 /assets/... 形式
    private normalizeLocalAssetUrl(url: string): string | null {
        try {
            const u = url.trim();
            if (!u) return null;
            if (/^assets\//i.test(u) || /^\/assets\//i.test(u)) {
                return u.replace(/^\/+/, '');
            }
            if (/^\/data\/assets\//i.test(u)) {
                return u.replace(/^\/data\//i, ''); // data/assets/... -> assets/...
            }
            return null;
        } catch { return null; }
    }

    // 尝试将远程图片下载保存到推导目录并返回本地 /assets/... 路径；若不需要或失败则返回 null
    private async maybeDownloadToLocal(url: string, docPath?: string): Promise<string | null> {
        try {
            if (!url) return null;
            // 已是本地资源
            const localAlready = this.normalizeLocalAssetUrl(url);
            if (localAlready) return localAlready;

            // 推导保存目录（文档映射优先，其次全局地址）
            const subdir = this.deriveTargetAssetsSubdir(docPath);
            if (!subdir) return null;

            // 仅处理 http/https
            if (!/^https?:\/\//i.test(url)) return null;

            // 发起请求下载
            const resp = await fetch(url);
            if (!resp.ok) return null;
            const contentType = (resp.headers.get('content-type') || '').toLowerCase();
            if (!contentType.startsWith('image/')) return null;
            const blob = await resp.blob();
            if (!blob || (blob as any).size === 0) return null;

            // 生成文件名
            const extFromCT = (() => {
                if (contentType.includes('image/jpeg')) return 'jpg';
                if (contentType.includes('image/png')) return 'png';
                if (contentType.includes('image/gif')) return 'gif';
                if (contentType.includes('image/webp')) return 'webp';
                if (contentType.includes('image/svg')) return 'svg';
                if (contentType.includes('image/bmp')) return 'bmp';
                if (contentType.includes('image/avif')) return 'avif';
                if (contentType.includes('image/apng')) return 'apng';
                return '';
            })();
            let name = 'image';
            try {
                const u = new URL(url);
                const last = decodeURIComponent(u.pathname.split('/').pop() || '');
                if (last) name = last.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120) || 'image';
            } catch { /* ignore */ }
            const hasExt = /\.[a-z0-9]{2,5}$/i.test(name);
            const ext = hasExt ? (name.split('.').pop() || '').toLowerCase() : extFromCT || 'png';
            if (!hasExt) name = `${name}.${ext}`;
            const ts = new Date();
            const suffix = `${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}${String(ts.getSeconds()).padStart(2, '0')}`;
            const base = name.replace(/\.[^.]+$/, '');
            const finalName = `${base}-${suffix}.${ext}`;

            const sub = subdir.replace(/^\/+|\/+$/g, '');
            const assetPath = `/data/assets/${sub}/${finalName}`;
            await putFile(assetPath, false, blob);
            const assetUrl = `assets/${sub}/${encodeURIComponent(finalName)}`;
            console.log('Minutiae 下载远程题头图到本地', assetUrl);
            return assetUrl;
        } catch (e) {
            console.warn('maybeDownloadToLocal 失败', e);
            return null;
        }
    }

    // 根据文档ID映射或全局地址推导目标 assets 子目录（支持目录或文件形式）
    private deriveTargetAssetsSubdir(docPath?: string): string | null {
        // 1) 文档映射优先：先目录，其次文件的目录
        if (docPath) {
            const cand = this.getIdCandidatesFromPath(docPath);
            if (cand) {
                if (cand.dirs.length) {
                    const info = this.toAssetsLocalInfo(cand.dirs[0]);
                    if (info) return info.subdir;
                }
                if (cand.files.length) {
                    const info = this.toAssetsLocalInfo(cand.files[0]);
                    if (info) return info.subdir || null;
                }
            }
        }
        // 2) 全局地址
        const raw = String(this.settingdata["minutiae-headimg-url"] || '').trim();
        if (raw) {
            const info = this.toAssetsLocalInfo(raw);
            if (info) return info.isDir ? info.subdir : (info.subdir || null);
        }
        // 3) 默认保存目录设置
        const def = String(this.settingdata["minutiae-headimg-default-save-dir"] || '').trim();
        if (def) return def.replace(/^\/+|\/+$/g, '');
        return null;
    }

    /**
     * 在 protyle 的图标栏中插入一个样式一致的图标按钮，防止重复添加。
     * @param contentElement protyle 的 contentElement 或父元素，用于查找 .protyle-icons
     * @param label 
     */
    private insertProtyleIcon(contentElement: HTMLElement | null, label: string, icon: string, onClick?: (ev: Event, el: HTMLElement) => void) {
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
            span.innerHTML = `<svg><use xlink:href="#${icon}"></use></svg>`;

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
