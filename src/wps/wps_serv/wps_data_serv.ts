import { appendBlock, createDailyNote, putFile } from "@/api/api";
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
                const result = await runWpsScriptSync({
                    url: this.settingdata['wps-data-url'],
                    token: this.settingdata['wps-airscript-token'],
                    context: {
                        argv: "",//暂无
                    }
                });
                const data = result.result as IWpsRecord[];
                console.log("导入WPS数据", data);
                // 从设置中读取需要提取的字段列表，按逗号/换行/分号分隔并去空白
                const fieldSetting: string = this.settingdata['wps-data-fields'] || '';
                const fieldList = fieldSetting
                    .split(/[,;\n]/)
                    .map(s => s.trim())
                    .filter(s => s.length > 0);
                const extract_data = extractFields(data, fieldList);
                console.log("提取的WPS数据", extract_data);
                // 写入思源日记
                try {
                    await this.insertIntoDailyNote(fieldList, extract_data);
                    showMessage?.("WPS数据已写入日记");
                } catch (e: any) {
                    console.error("写入日记失败", e);
                    showMessage?.("写入日记失败:" + e.message);
                }

                this.updateTopBarIcon("iconSTwps_data");
            }
        });

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
        if (!records.length) return;
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
        await appendBlock('markdown', content, dailyNoteId);
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
        return String(v).replace(/\n/g, '<br/>');
    }

    /**
     * 处理单个附件：若为图片则尝试下载到 /data/assets/wps/ 当下日期目录并返回本地 markdown；否则返回原链接。
     */
    private async handleAttachmentItem(att: any) {
        const name = att.fileName || '附件';
        const url = att.url || '';
        if (!url) return name;
        if (this.isImageUrl(url)) {
            const assetPath = await this.downloadAndStoreImage(url, name).catch(e => console.warn('下载图片失败', url, e));
            return `![${name}](${assetPath})`;
        }
        return `[${name}](${url})`;
    }

    private isImageUrl(url: string): boolean {
        return /(\.png|\.jpe?g|\.gif|\.webp|\.svg)(\?|$)/i.test(url);
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