import { appendBlock, putFile } from "@/api/api";
import { createDailynote } from "@frostime/siyuan-plugin-kits";
import steveTools from "@/index";
import { showMessage } from "siyuan";
import { runWpsScriptSync } from "../wps_api";
// import { createWebviewDock_for_wps, } from "@/api/api2";
// import { generateLinkCard } from "@/api/api3";
import * as ic from "@/icon"

export class WpsDataServ {
    private settingdata: any;
    private plugin: steveTools;
    private topBarButton: HTMLElement | null;

    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    async init(settingdata: any) {
        this.settingdata = settingdata;
        this.plugin.addIcons(`
            <symbol id="iconSTwps_data" viewBox="0 0 16 16">
                ${ic.steveTools_wps_data}
            </symbol>
            <symbol id="iconSTwps_data2" viewBox="0 0 55 55">
                ${ic.steveTools_wps_data2}
            </symbol>
            `);
        this.topBarButton = this.plugin.addTopBar({
            icon: "iconSTwps_data2",
            title: "导入WPS数据",
            position: "right",
            callback: async () => {
                await this.importWpsData();
            }
        });
        this.checkIsNewData();
    }

    private async checkIsNewData() {
        const result = await runWpsScriptSync({
            url: this.settingdata['wps-data-url'],
            token: this.settingdata['wps-airscript-token'],
            context: {
                argv: { name: 'check' }, //暂无
            }
        });
        if (result.result === false) {
            this.updateTopBarIcon("iconSTwps_data");
        }
    }

    private async importWpsData() {
        const result = await runWpsScriptSync({
            url: this.settingdata['wps-data-url'],
            token: this.settingdata['wps-airscript-token'],
            context: {
                argv: "", //暂无
            }
        });
        const data = result.result as IWpsRecord[];
        // console.log("导入WPS数据", data);
        // 从设置中读取需要提取的字段列表，按逗号/换行/分号分隔并去空白
        const fieldSetting: string = this.settingdata['wps-data-fields'] || '';
        const fieldList = fieldSetting
            .split(/[,;\n]/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
        const extract_data = extractFields(data, fieldList);
        // console.log("提取的WPS数据", extract_data);
        // 写入思源日记
        try {
            await this.insertIntoDailyNote(fieldList, extract_data);
            // showMessage?.("WPS数据已写入日记");
        } catch (e: any) {
            console.error("写入日记失败", e);
            showMessage?.("写入日记失败:" + e.message);
        }

        this.updateTopBarIcon("iconSTwps_data");
    }

    private updateTopBarIcon(iconName: string) {
        if (this.topBarButton) {
            const svgUse = this.topBarButton.querySelector('svg use');
            if (svgUse) {
                svgUse.setAttribute('xlink:href', `#${iconName}`);
            }
        }
    }

    private async insertIntoDailyNote(fieldList: string[], records: Array<Record<string, any>>) {
        if (!records.length) { showMessage?.("无新数据"); return; }
        const notebookId = this.settingdata['wps-data-notebook'];
        if (!notebookId) throw new Error('未配置 wps-data-notebook');
        const now = new Date();
        // console.log("当前时间（东八区）:", now);
        const dailyNoteResp = await createDailynote(notebookId, now);
        const dailyNoteId = dailyNoteResp;

        const templateStr: string = this.settingdata['wps-data-template'] || '';
        let content: string;
        if (templateStr.trim()) {
            content = await this.renderTemplate(templateStr, fieldList, records);
        } else {
            content = await this.buildMarkdownTable(fieldList, records);
        }
        if (content) {
            await appendBlock('markdown', content, dailyNoteId);
            showMessage?.("WPS数据已写入日记");
        } else {
            showMessage?.("无新数据");
        }

    }

    private async buildMarkdownTable(fieldList: string[], records: Array<Record<string, any>>): Promise<string> {
        const header = ['序号', ...fieldList].join(' | ');
        const sep = new Array(fieldList.length + 1).fill('---').join(' | ');
        const lines = await Promise.all(records.map(async (rec, idx) => {
            const cols = await Promise.all(fieldList.map(fn => this.formatFieldValue(rec[fn])));
            return [String(idx + 1), ...cols].join(' | ');
        }));
        return ['### WPS数据导入', '', header, sep, ...lines, ''].join('\n');
    }

    private async formatFieldValue(v: any): Promise<string> {
        if (v === null || v === undefined) return '';
        if (Array.isArray(v)) {
            // 附件数组 [{fileName,url}]
            if (v.length && typeof v[0] === 'object' && ('url' in v[0])) {
                return (await Promise.all(v.map((it: any) => this.handleAttachmentItem(it)))).join('<br/>');
            }
            return v.join('<br/>');
        }
        if (typeof v === 'object') {
            try { return '`' + JSON.stringify(v) + '`'; } catch { return String(v); }
        }
        // 统一日期格式为 `YYYY-MM-DD HH:MM:SS`，处理常见的带斜杠日期或时间戳
        const s = String(v).trim();
        const normalized = this.formatDateString(s);
        if (normalized) return normalized.replace(/\n/g, '<br/>');
        return s.replace(/\n/g, '<br/>');
    }

    /**
     * 尝试将字符串或数字表示的日期/时间标准化为 `YYYY-MM-DD HH:MM:SS`。
     * 支持：
     * - 形如 2025/10/11 08:08:16 或 2025-10-11 08:08:16
     * - 仅日期部分 2025/10/11 或 2025-10-11
     * - 毫秒或秒级时间戳（数字字符串）
     * 若无法解析则返回空字符串。
     */
    private formatDateString(input: string): string {
        if (!input) return '';
        // 纯数字的时间戳（秒或毫秒）
        if (/^\d{10}$/.test(input)) {
            // 10 位 -> 秒
            const t = parseInt(input, 10) * 1000;
            return this.dateToYMDHMS(new Date(t));
        }
        if (/^\d{13}$/.test(input)) {
            // 13 位 -> 毫秒
            const t = parseInt(input, 10);
            return this.dateToYMDHMS(new Date(t));
        }

        // 替换中文括号/全角空格，并把斜杠改为中划线，便于解析
        const s = input.replace(/[\u3000\s]+/g, ' ').trim();
        // 常见格式：YYYY/MM/DD 或 YYYY-MM-DD，可能带时间部分
        const dateTimeParts = s.split(' ');
        const datePart = dateTimeParts[0].replace(/\//g, '-');
        const timePart = dateTimeParts.slice(1).join(' ');
        // 简单校验日期部分是否为 YYYY-MM-DD 或 YYYY-M-D
        if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(datePart)) {
            // 补齐月/日为两位
            const [y, m, d] = datePart.split('-').map(p => p.padStart(2, '0'));
            let hm = '00:00:00';
            if (timePart) {
                // 只保留时分秒部分
                const t = timePart.trim().split(/[T\s]/)[0];
                const parts = t.split(':').map(p => p.padStart(2, '0'));
                const hh = parts[0] || '00';
                const mm = parts[1] || '00';
                const ss = parts[2] || '00';
                hm = `${hh}:${mm}:${ss}`;
            }
            return `${y}-${m}-${d} ${hm}`;
        }

        // 尝试用 Date 构造解析（作为最后手段）
        const parsed = Date.parse(s);
        if (!isNaN(parsed)) {
            return this.dateToYMDHMS(new Date(parsed));
        }
        return '';
    }

    private dateToYMDHMS(d: Date): string {
        const pad = (n: number) => String(n).padStart(2, '0');
        const y = d.getFullYear();
        const m = pad(d.getMonth() + 1);
        const day = pad(d.getDate());
        const hh = pad(d.getHours());
        const mm = pad(d.getMinutes());
        const ss = pad(d.getSeconds());
        return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
    }

    /**
     * 处理单个附件：若为图片则尝试下载到 /data/assets/wps/ 当下日期目录并返回本地 markdown；否则返回原链接。
     */
    private async handleAttachmentItem(att: any) {
        const name = att.fileName || '附件';
        const url = att.url || '';
        if (!url) return name;
        if (this.isImageUrl(url, name)) {
            const assetPath = await this.downloadAndStoreImage(url, name).catch(e => console.warn('下载图片失败', url, e));
            return `![${name}](${assetPath})`;
        }
        return `[${name}](${url})`;
    }

    private isImageUrl(url: string, name: string): boolean {
        if (!url) return false;
        // 1. data URI
        if (/^data:image\//i.test(url)) return true;
        // 常见图片扩展
        const exts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'apng', 'bmp', 'ico', 'tif', 'tiff'];
        const extReg = new RegExp(`\.(${exts.join('|')})(?:$|[?#])`, 'i');
        if (extReg.test(url)) return true;
        // 2. 文件名兜底
        if (name && extReg.test(name)) return true;
        // 3. 查询参数 format / type / ext 提示
        try {
            const u = new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
            const qp = (k: string) => (u.searchParams.get(k) || '').toLowerCase();
            const cand = [qp('format'), qp('type'), qp('ext')];
            if (cand.some(c => exts.includes(c.replace('image/', '')))) return true;
        } catch { /* ignore malformed url */ }
        // 4. 一些对象存储处理样式（含 image/ 或 x-oss-process=image/）
        if (/image\//i.test(url) || /x-oss-process=image\//i.test(url)) return true;
        return false;
    }

    private async downloadAndStoreImage(url: string, fileName: string) {
        try {
            const res = await fetch(url);
            if (!res.ok) return;
            const blob = await res.blob();
            const ext = (fileName.split('.').pop() || 'png').toLowerCase();
            const safeExt = ext.match(/^[a-z0-9]{1,5}$/) ? ext : 'png';
            const dateFolder = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const baseName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_{2,}/g, '_') || 'image';
            const finalName = baseName.endsWith('.' + safeExt) ? baseName : baseName + '.' + safeExt;
            const assetPath = `/data/assets/wps/${dateFolder}/${finalName}`;
            await putFile(assetPath, false, blob);
            return `assets/wps/${dateFolder}/${finalName}`
        } catch (e) {
            console.warn('保存图片失败', url, e);
        }
    }

    // 极简模板渲染：支持 {{#records}}...{{/records}} 循环，内部可用 {{序号}} 与字段名占位符；附件字段会转为 markdown 链接集合
    private async renderTemplate(tpl: string, fieldList: string[], records: Array<Record<string, any>>): Promise<string> {
        // 之前使用 String.replace 的同步回调，内部调用异步的 formatFieldValue 未 await，
        // 导致模板中出现 [object Promise]。这里改为手动匹配循环块并逐块异步渲染。
        const loopReg = /{{#records}}([\s\S]*?){{\/records}}/g;
        let output = tpl;
        const matches = [...tpl.matchAll(loopReg)];
        for (const m of matches) {
            const full = m[0];
            const inner = m[1];
            const renderedRecords = await Promise.all(records.map(async (rec, idx) => {
                let seg = inner.replace(/{{序号}}/g, String(idx + 1));
                for (const f of fieldList) {
                    const raw = rec[f];
                    const rep = await this.formatFieldValue(raw); // 关键：等待异步格式化
                    const fEsc = f.replace(/[.*+?^${}()|[\]\\]/g, r => `\\${r}`);
                    seg = seg.replace(new RegExp('{{' + fEsc + '}}', 'g'), rep);
                }
                return seg;
            }));
            output = output.replace(full, renderedRecords.join('\n'));
        }
        output = output.replace(/{{字段列表}}/g, fieldList.join(', '));
        return output;
    }

}


interface IWpsRecord {
    recordId?: string;
    fields: Record<string, any>;
}

interface IAttachmentItem {
    fileName?: string;
    url?: string;
    [k: string]: any;
}

/**
 * 提取指定字段的值。
 * 字段名以 (A) / （A） 结尾表示该字段是附件数组，仅返回 fileName 与 url。
 * @param records 原始返回数组
 * @param requestedFields 需要提取的字段名数组（可带 (A)）
 * @returns Record<string, any[]>
 */
// 返回结构：对象数组，每个对象代表一条记录；键为请求的字段原名(包含可能的 (A) 标记)。
// 附件字段值为 [{fileName,url}, ...]；缺失字段为 undefined。
export function extractFields(records: IWpsRecord[], requestedFields: string[]): Array<Record<string, any>> {
    if (!Array.isArray(records) || !Array.isArray(requestedFields)) return [];
    const ATTACH_FLAG_REG = /(?:\(|（)A(?:\)|）)\s*$/i;

    return records.map(rec => {
        const rowObj: Record<string, any> = {};
        const fieldsObj = rec?.fields || {};
        for (const originalName of requestedFields) {
            if (!originalName) { continue; }
            const isAttachment = ATTACH_FLAG_REG.test(originalName);
            const lookupName = originalName.replace(ATTACH_FLAG_REG, "").trim();
            if (!(lookupName in fieldsObj)) {
                rowObj[originalName] = undefined;
                continue;
            }
            const value = fieldsObj[lookupName];
            if (isAttachment && Array.isArray(value)) {
                rowObj[originalName] = (value as IAttachmentItem[]).map(att => ({
                    fileName: att.fileName ?? "",
                    url: att.url ?? ""
                }));
            } else {
                rowObj[originalName] = value;
            }
        }
        return rowObj;
    });
}