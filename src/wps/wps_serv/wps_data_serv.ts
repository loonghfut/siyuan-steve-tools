import { appendBlock } from "@/api/api";
import steveTools from "@/index";
import { IProtyle, showMessage } from "siyuan";
import { runWpsScriptSync } from "../wps_api";
import { createWebviewDock_for_wps, } from "@/api/api2";
import { generateLinkCard } from "@/api/api3";
import * as ic from "@/icon"

export class WpsDataServ {
    private settingdata: any;
    private plugin: steveTools;
    private protyle: IProtyle;
    private topBarButton

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