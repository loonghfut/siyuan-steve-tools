import { readDir, putFile } from "@/api/api";
import { NetworkClient } from "@/api/network";
import steveTools from "@/index";
import { showMessage } from "siyuan";

/**
 * Shared helper for Minutiae image features (head images, backgrounds, etc.).
 * Encapsulates mapping resolution, local asset helpers and remote validation.
 */
export class MinutiaeImageBase {
    protected plugin: steveTools;
    protected settingdata: any;
    protected net: NetworkClient;

    constructor(plugin: steveTools, settingdata: any) {
        this.plugin = plugin;
        this.settingdata = settingdata;
        this.net = new NetworkClient({
            serverUrl: "",
            useProxy: false,
        });
    }

    updateSettingData(settingdata: any) {
        this.settingdata = settingdata;
    }

    protected getUrlSettingKey(): string {
        return "";
    }

    protected getMappingSettingKey(): string {
        return "";
    }

    protected getDefaultSaveDirKey(): string {
        return "";
    }

    protected extractIdsFromPath(path: string): string[] {
        if (!path) return [];
        const pathWithoutExt = path.replace(/\.sy$/, "");
        const segments = pathWithoutExt.split("/").filter(s => s.trim());
        const idPattern = /(\d{14}-[a-z0-9]{7})/i;
        const ids: string[] = [];
        for (let i = segments.length - 1; i >= 0; i--) {
            const match = segments[i].match(idPattern);
            if (match) {
                ids.push(match[1]);
            }
        }
        return ids;
    }

    protected parseIdMappingRich(input: any): Record<string, { urls: string[]; dirs: string[]; files: string[] }> | null {
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
            if (input && typeof input === "object") {
                for (const [idRaw, v] of Object.entries(input)) {
                    const id = String(idRaw).trim();
                    if (!id) continue;
                    if (Array.isArray(v)) {
                        pushMany(id, v);
                    } else if (v && typeof v === "object") {
                        const obj: any = v;
                        if (obj.urls) pushMany(id, obj.urls);
                        if (obj.url) pushMany(id, obj.url);
                        if (obj.dir) pushMany(id, obj.dir);
                        if (obj.dirs) pushMany(id, obj.dirs);
                        if (obj.file) pushMany(id, obj.file);
                        if (obj.files) pushMany(id, obj.files);
                    } else {
                        pushOne(id, String(v ?? ""));
                    }
                }
                return Object.keys(rich).length ? rich : null;
            }

            if (typeof input === "string") {
                let s = input.trim();
                if (!s) return null;
                s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, '"');
                s = s.replace(/^\s*\/\/.*$/gm, '').replace(/^\s*#.*$/gm, '');
                s = s.replace(/,(\s*[}\]])/g, '$1');
                try {
                    const obj = JSON.parse(s);
                    if (obj && typeof obj === "object") {
                        return this.parseIdMappingRich(obj);
                    }
                } catch {
                    const lines = s.split(/\r?\n/);
                    for (const rawLine of lines) {
                        const line = rawLine.trim();
                        if (!line) continue;
                        const cleaned = line.replace(/[;,]+\s*$/, '');
                        const m = cleaned.match(/^(.*?)\s*[:=]\s*(.*)$/);
                        if (m) {
                            const id = m[1].trim();
                            if (!id) continue;
                            const rest = m[2].trim();
                            if (!rest) continue;
                            const parts = rest.split(/\s*,\s*/);
                            parts.filter(Boolean).forEach(p => pushOne(id, p));
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

    protected getIdCandidatesFromPath(path: string): { remotes: string[]; files: string[]; dirs: string[] } | null {
        try {
            const mapping = this.parseIdMappingRich(this.settingdata[this.getMappingSettingKey()]);
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
        if (path) {
            const cand = this.getIdCandidatesFromPath(path);
            if (cand) {
                for (const u of cand.remotes) {
                    const r = await this.resolveUrlCandidate(u);
                    if (r) return r;
                }
                for (const f of cand.files) {
                    const r = await this.resolveUrlCandidate(f);
                    if (r) return r;
                }
                for (const d of cand.dirs) {
                    const r = await this.resolveUrlCandidate(d.endsWith('/') ? d : (d + '/'));
                    if (r) return r;
                }
            }
        }

        const urlKey = this.getUrlSettingKey();
        if (!urlKey) return null;
        const raw = this.settingdata[urlKey];
        if (!raw) return null;
        return this.resolveUrlCandidate(String(raw).trim());
    }

    protected async resolveUrlCandidate(candidate: string): Promise<string | null> {
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

    protected toAssetsLocalInfo(input: string): { subdir: string, isDir: boolean, filename?: string } | null {
        try {
            let s = input.trim();
            if (!s) return null;
            if (/^\/data\/assets\//i.test(s)) s = s.replace(/^\/data\//i, '');
            if (/^\/assets\//i.test(s)) s = s.replace(/^\//, '');
            if (!/^assets\//i.test(s)) return null;
            s = s.replace(/^assets\//i, '');
            if (/\/$/.test(s)) return { subdir: s.replace(/\/$/, ''), isDir: true };
            const hasExt = /\.(png|jpe?g|gif|webp|bmp|svg|avif|apng|ico)(?:$|[?#])/i.test(s);
            if (hasExt) {
                const idx = s.lastIndexOf('/');
                if (idx === -1) return { subdir: '', isDir: false, filename: s };
                return { subdir: s.slice(0, idx), isDir: false, filename: s.slice(idx + 1) };
            }
            return { subdir: s, isDir: true };
        } catch {
            return null;
        }
    }

    protected async pickRandomLocalAsset(dir: string): Promise<string | null> {
        try {
            const sub = dir.replace(/^\/+|\/+$/g, '');
            if (!sub) return null;
            const basePath = `/data/assets/${sub}/`;
            const list = await readDir(basePath).catch(e => { console.warn('readDir 失败', basePath, e); return null; });
            if (!Array.isArray(list)) {
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
            const pick = imgFiles[Math.floor(Math.random() * imgFiles.length)];
            const url = `assets/${sub}/${encodeURIComponent(pick)}`;
            console.debug('Minutiae 本地随机选取图片', url);
            return url;
        } catch (e) {
            console.warn('pickRandomLocalAsset 异常', e);
            return null;
        }
    }

    protected findImageUrlInObject(obj: any, isImageUrl: (s: string) => boolean): string | null {
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

    protected stripHtmlTags(input: string): string {
        if (!input) return input;
        return input.replace(/<[^>]*>/g, ' ');
    }

    protected normalizeWhitespace(input: string): string {
        if (!input) return input;
        return input.replace(/\s+/g, ' ').trim();
    }

    protected decodeHtmlEntities(input: string): string {
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

    protected resolveAbsoluteRedirectUrl(base: string, headers: Headers, location?: string): string | null {
        try {
            if (location) {
                if (/^https?:\/\//i.test(location)) return location;
                return new URL(location, base).toString();
            }

            const authority = headers.get(":authority") || headers.get("authority") || headers.get("host") || headers.get("Host");
            const path = headers.get(":path") || headers.get("path");
            if (path) {
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

    protected async validateAndResolveImageUrl(url: string, depth = 0): Promise<string> {
        if (!url || typeof url !== 'string') return url;
        const MAX_REDIRECTS = 5;
        if (depth > MAX_REDIRECTS) {
            console.warn("Minutiae 模块重定向层级过深，返回当前URL", url);
            return url;
        }
        const isImageUrl = (s: string) => /\.(png|jpe?g|gif|webp)(?:[?#].*)?$/i.test(s);
        if (isImageUrl(url)) {
            console.debug("Minutiae 模块验证图片链接通过", url);
            return url;
        }
        try {
            console.debug("Minutiae 模块验证图片链接，发起GET请求", url);
            const getResponse = await this.net.request({ method: "GET", path: url });
            if (getResponse) {
                const effectiveUrl = ((getResponse as any).redirected && getResponse.url && getResponse.url !== url)
                    ? (console.debug("Minutiae 模块GET已跟随重定向，最终URL:", getResponse.url), getResponse.url)
                    : url;
                const location = getResponse.headers.get("location") || getResponse.headers.get("Location") || getResponse.headers.get("content-location") || getResponse.headers.get("Content-Location");
                if (location) {
                    const abs = this.resolveAbsoluteRedirectUrl(effectiveUrl, getResponse.headers, location);
                    if (abs) {
                        console.debug("Minutiae 模块GET请求发现重定向", abs);
                        return this.validateAndResolveImageUrl(abs, depth + 1);
                    }
                }
                const pseudoAbs = this.resolveAbsoluteRedirectUrl(effectiveUrl, getResponse.headers);
                if (pseudoAbs) {
                    console.debug("Minutiae 模块GET根据伪头推断重定向URL", pseudoAbs);
                    return this.validateAndResolveImageUrl(pseudoAbs, depth + 1);
                }

                const contentType = (getResponse.headers.get("content-type") || "").toLowerCase();
                if (contentType.startsWith("image/")) {
                    console.debug("Minutiae 模块GET请求确认是图片类型", contentType, effectiveUrl);
                    return effectiveUrl;
                }

                try {
                    const text = await getResponse.text();
                    let body = String(text).trim();
                    if (isImageUrl(body) && /^(https?:)?\/\//i.test(body)) {
                        console.debug("Minutiae 模块GET响应文本是图片链接", body);
                        return body;
                    }
                    try {
                        const obj = JSON.parse(body);
                        const found = this.findImageUrlInObject(obj, isImageUrl);
                        if (found) {
                            console.debug("Minutiae 模块GET响应JSON中找到图片链接", found);
                            return found;
                        }
                    } catch {
                        // not json
                    }
                    const stripped = this.stripHtmlTags(body);
                    const normalized = this.normalizeWhitespace(this.decodeHtmlEntities(stripped));
                    const urlRegex = /(https?:\/\/[^\s'"<>]+)/gi;
                    let match: RegExpExecArray | null;
                    while ((match = urlRegex.exec(normalized)) !== null) {
                        const candidate = match[1].replace(/[)\]"',>]+$/g, "");
                        if (isImageUrl(candidate)) {
                            console.debug("Minutiae 模块从GET响应文本中提取到图片链接", candidate);
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
        console.warn("Minutiae 模块无法验证图片链接，返回原始URL", url);
        return url;
    }

    protected normalizeLocalAssetUrl(url: string): string | null {
        try {
            const u = url.trim();
            if (!u) return null;
            if (/^assets\//i.test(u) || /^\/assets\//i.test(u)) {
                return u.replace(/^\/+/, '');
            }
            if (/^\/data\/assets\//i.test(u)) {
                return u.replace(/^\/data\//i, '');
            }
            return null;
        } catch { return null; }
    }

    protected async maybeDownloadToLocal(url: string, docPath?: string): Promise<string | null> {
        try {
            if (!url) return null;
            const localAlready = this.normalizeLocalAssetUrl(url);
            if (localAlready) return localAlready;
            const subdir = this.deriveTargetAssetsSubdir(docPath);
            if (!subdir) return null;
            if (!/^https?:\/\//i.test(url)) return null;
            const resp = await fetch(url);
            if (!resp.ok) return null;
            const contentType = (resp.headers.get('content-type') || '').toLowerCase();
            if (!contentType.startsWith('image/')) return null;
            const blob = await resp.blob();
            if (!blob || (blob as any).size === 0) return null;

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
            console.debug('Minutiae 下载远程题头图到本地', assetUrl);
            return assetUrl;
        } catch (e) {
            console.warn('maybeDownloadToLocal 失败', e);
            return null;
        }
    }

    protected deriveTargetAssetsSubdir(docPath?: string): string | null {
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
        const raw = String(this.settingdata[this.getUrlSettingKey()] || '').trim();
        if (raw) {
            const info = this.toAssetsLocalInfo(raw);
            if (info) return info.isDir ? info.subdir : (info.subdir || null);
        }
        const key = this.getDefaultSaveDirKey();
        if (key) {
            const def = String(this.settingdata[key] || '').trim();
            if (def) return def.replace(/^\/+|\/+$/g, '');
        }
        return null;
    }

    protected extractUrlFromTitleImgAttr(attr: string): string | null {
        if (!attr) return null;
        const m = attr.match(/url\(("|')?(.*?)(\1)?\)/i);
        if (m && m[2]) return m[2];
        return null;
    }

    protected async quickUploadToTargetDir(docPath?: string): Promise<string | null> {
        const subdir = this.deriveTargetAssetsSubdir(docPath);
        if (!subdir) {
            showMessage('请将“题头图地址”或文档映射设置为 assets/<目录>（或 /data/assets/<目录>）');
            return null;
        }
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        return new Promise((resolve) => {
            input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return resolve(null);
                try {
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
            input.click();
        });
    }
}