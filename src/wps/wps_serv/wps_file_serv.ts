import { appendBlock, generateSiyuanID, updateBlock } from "@/api/api";
import steveTools from "@/index";
import { showMessage } from "siyuan";
import { ChangeLinkStyle, extractIframeBlockInfo, ShowLinkContent } from "../wps_api";
import { createWebviewDock_for_wps, getCursorBlockId, } from "@/api/api2";
import { F5, generateLinkCard } from "@/api/api3";
import * as ic from "@/icon"
import { api } from "@frostime/siyuan-plugin-kits";
import { confirmDialog } from "@/libs/dialog";
import { fetchWpsFiles } from "../wps_files_api";
declare global {
    interface Window {
        wps?: any;
        siyuanWPS?: {
            version: string;
            loaded: boolean;
            groupId: string;
            parentId: string;
            cookie: string;
            [key: string]: any;
        }
    }
}

// 捕获的 WPS 文件记录结构
interface WpsFileRecord {
    link_id: string;
    link_url: string;
    name: string;
    file_type: string;
    file_src: string;
}

export class WpsFileServ {
    private settingdata: any;
    private plugin: steveTools;
    // private protyle: IProtyle;
    private cursorID: string;
    private cursorID_b: string;
    private WPSfile?: Window["siyuanWPS"];

    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    async init(settingdata: any) {
        this.settingdata = settingdata;

        this.plugin.addIcons(`
                <symbol id="iconSTwps" viewBox="0 0 32 32">
                   ${ic.steveTools_wps}
                </symbol>
                <symbol id="iconSTwpsFile" viewBox="0 0 20 20">
                   ${ic.steveTools_wps_file}
                </symbol>
            `)


        // 初始化全局函数
        window.wps = {
            ChangeLinkStyle,
            ShowLinkContent,
        };


        const handleWpsFileInsert = async (e: { webview: any; getCurrentUrl: () => string }) => {
            // 单条插入：改为模板形式（保留旧卡片逻辑可选）
            const fileurl = e.getCurrentUrl();
            if (fileurl === "https://www.kdocs.cn/m/") {
                // showMessage("WPS最近 (主页不插入)", 1200, "info");
                // this.handleInsertFilelist();
                this.importAllCapturedToCurrent();
                return;
            }
            // 构造临时记录对象
            const linkId = await generateSiyuanID(); // 若没有真实 link_id，用新生成的 ID
            const record = {
                link_id: linkId,
                link_url: fileurl,
                name: fileurl.split('/').pop() || fileurl,
                file_type: '',
                file_src: ''
            } as WpsFileRecord;
            const blockMd = this.generateWpsBlock(record);
            if (!this.cursorID) {
                showMessage('未获取到光标位置，无法插入', 1500, 'error');
                return;
            }
            appendBlock('markdown', blockMd, this.cursorID);
            showMessage('已插入链接块', 1200, 'info');
        };
        const roamingMonitorSnippet = `(()=>{try{if((window as any).__ROAMING_MONITOR_INSTALLED__)return;(window as any).__ROAMING_MONITOR_INSTALLED__=true;const TARGET='https://drive.kdocs.cn/api/v3/roaming';const log=(tag,url,body)=>{try{console.log('[RoamingAPI]',tag,url,body);}catch(_){} };const of=window.fetch; if(of){window.fetch=async (...args)=>{const r=await of(...args);try{const raw=args[0];const u=typeof raw==='string'?raw:(raw&&raw.url)||''; if(u.includes(TARGET)){r.clone().text().then(t=>log('fetch',u,t)).catch(()=>{});} }catch(_){} return r;};}const oOpen=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u,...rest){(this as any).__isRoaming= typeof u==='string' && u.includes(TARGET);return oOpen.call(this,m,u,...rest);};const oSend=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(b){if((this as any).__isRoaming){this.addEventListener('load',function(){try{log('xhr',this.responseURL,this.responseText);}catch(_){} });}return oSend.call(this,b);};}catch(e){console.error('roaming monitor inject failed',e);} })();`;
        createWebviewDock_for_wps({
            plugin: this.plugin,
            config: {
                position: "RightTop",
                size: { width: 500, height: 0 },
                icon: "iconSTwps",
                title: "WPS文件",
            },
            buttons: [
                { id: 'refresh', text: '刷新', builtInAction: 'refresh', order: 0 },
                { id: 'single', text: '插入', order: 1, onClick: handleWpsFileInsert },
                // { id: 'batch', text: '批量导入', order: 2, onClick: () => this.importAllCapturedToCurrent() },
                // { id: 'list', text: '旧式列表', order: 3, onClick: () => this.handleInsertFilelist() }
            ],
            type: "wps-file-dock",
            url: this.settingdata["wps-file-weburl"],
            emptyUrlMessage: "请先配置网址...",
            containerClass: "wps-file-dock-container",
            iframeStyle: "height: 99vh ; width: 100%;  pointer-events: auto;",
            pointerEventsDelay: 300,
            zoom: 1,
            injectJS: ["console.log('WPS文件加载完成');" + roamingMonitorSnippet]
        });

        // this.plugin.eventBus.on("open-menu-link", this.blockIconEvent.bind(this));
        this.plugin.eventBus.on("click-blockicon", this.blockIconEvent.bind(this));
        this.plugin.eventBus.on("click-editorcontent", this.handleSelectionChange.bind(this));
        this.plugin.eventBus.on("switch-protyle", async (event) => {
            this.cursorID_b = event.detail.protyle.block.id;
            this.cursorID = this.cursorID_b;
            // console.log("switch-image-protyle");
        });
    }

    async onLayoutReady() {
        this.WPSfile = window.siyuanWPS;
        // console.log(this.WPSfile);
        if (this.WPSfile.loaded) {
            this.plugin.addTopBar({
                icon: "iconSTwpsFile",
                title: "WPS文件拉取",
                position: "right",
                callback: async () => {
                    const { data } = await fetchWpsFiles({
                        groupId: this.WPSfile.groupId,
                        parentId: this.WPSfile.parentId,
                        headers: { cookie: this.WPSfile.cookie }
                    });
                    console.log(data);
                }
            });
        }
    }



    async blockIconEvent({ detail }: any) {
        const blockEl: HTMLElement | undefined = detail.blockElements?.[0];
        if (!blockEl) return;
        if (blockEl.getAttribute("custom-st-wps") === "1") {
            detail.menu.addItem({
                iconHTML: "",
                label: "转换为链接",
                click: async () => {
                    try {
                        const protyleHtml = blockEl.querySelector('protyle-html');
                        const dataContent = protyleHtml?.getAttribute('data-content') || '';
                        const decoded = dataContent
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .replace(/&amp;/g, '&')
                            .replace(/&quot;/g, '"')
                            .replace(/&#39;/g, "'");
                        const match = decoded.match(/<a[^>]+?(?:data-link|href)="([^"]+)"/i);
                        const url = match?.[1];
                        if (!url) { showMessage('未能解析链接', 2000, 'error'); return; }
                        let title = '';
                        try {
                            const tmp = document.createElement('div');
                            tmp.innerHTML = decoded;
                            const titleEl = tmp.querySelector('.link-card-inner > div[style*="flex:1"] > div:first-child');
                            title = titleEl?.textContent?.trim() || '';
                        } catch { }
                        if (!title) title = url;
                        const esc = (s: string) => s.replace(/([\\`*_{}\[\]()#+\-.!])/g, '\\$1');
                        const md = `[${esc(title)}](${url.replace(/\)/g, '%29')})`;
                        const id = blockEl.getAttribute('data-node-id') as string;
                        await updateBlock('markdown', md, id);
                        showMessage('已还原为链接', 1500, 'info');
                    } catch (e) {
                        console.error(e); showMessage('转换失败', 2000, 'error');
                    }
                }
            });
            return;
        }
        const info = extractIframeBlockInfo(blockEl);
        if (!info) return;
        detail.menu.addItem({
            iconHTML: "",
            label: "转换为卡片",
            click: async () => {
                const cardHtml = await generateLinkCard(info.url, [
                    { id: 'change', title: '转换', text: '★', onClick: `window.wps.ChangeLinkStyle('${info.url}', '${info.id}');` },
                    { id: 'show', title: '预览', text: '🔍', onClick: `window.wps.ShowLinkContent('${info.url}');` }
                ]);
                updateBlock('markdown', `<div>${cardHtml}</div>\n{: id="${info.id}"  custom-st-wps="1"}`, info.id);
            }
        });
    }



    async handleSelectionChange() {
        const blockId = getCursorBlockId();
        if (blockId) {
            this.cursorID = blockId;
        }
    }

    async handleInsertFilelist() {
        try {
            const w: any = window as any;
            const data: any[] = Array.isArray(w.wpsdoc) ? w.wpsdoc : [];
            if (!data.length) {
                showMessage('暂无可插入的 WPS 列表数据', 1500, 'info');
                return;
            }
            // 再次按 link_id 去重，防御性处理
            const map = new Map<string, any>();
            for (const item of data) {
                if (!item) continue;
                const id = item.link_id || item.id || '';
                const url = item.link_url || item.url || '';
                const name = item.name || '';
                if (!id || !url || !name) continue;
                if (!map.has(id)) map.set(id, { name, url });
            }
            if (!map.size) {
                showMessage('数据无有效条目', 1500, 'info');
                return;
            }
            // 生成 Markdown 行 [name](url)
            const esc = (s: string) => s.replace(/([\\`*_{}\[\]()#+\-.!])/g, '\\$1');
            const lines: string[] = [];
            for (const { name, url } of map.values()) {
                // 右括号在链接里要处理
                const safeUrl = String(url).replace(/\)/g, '%29');
                lines.push(`[${esc(String(name))}](${safeUrl})`);
            }
            const md = lines.join('\n\n');
            if (!this.cursorID) {
                showMessage('未获取到光标位置，无法插入', 1500, 'error');
                return;
            }
            appendBlock('markdown', md, this.cursorID);
            console.log(md);
            showMessage(`已插入 ${lines.length} 条`, 1500, 'info');
        } catch (e) {
            console.error('handleInsertFilelist error', e);
            showMessage('插入列表失败', 2000, 'error');
        }
    }

    /*** ---------------- 新增：仿 ICS 风格的 WPS 文件块导入 ---------------- ***/

    // WPS 文件记录接口（与捕获的字段保持一致）
    private getWpsTemplate(): string {
        // 允许用户在设置中自定义模板 (可选 key: wps-file-block-template)
        return this.settingdata?.['wps-file-block-template'] || this.defaultWpsTemplate();
    }

    private defaultWpsTemplate(): string {
        return `### {{name}}

链接： [{{name}}]({{url}})

类型： {{file_type}}

来源： {{file_src}}

原始链接： {{url}}`;
    }

    private renderWpsTemplate(tpl: string, data: Record<string, any>): string {
        let out = tpl.replace(/\{\{(\w+)\}\}/g, (_m, k) => {
            const v = data[k];
            return (v === undefined || v === null) ? '' : String(v);
        });
        // 清理多余空行
        out = out.replace(/^\s*[\r\n]/gm, '').replace(/\n{3,}/g, '\n\n');
        return out;
    }

    private async checkWpsBlockExists() {
        const importedIDs = new Set<string>();
        try {
            // 查询包含特定自定义属性的块
            // 假设 'attributes' 列存储块的属性
            const sqlStr = `
                SELECT ial FROM blocks 
                WHERE ial LIKE '%custom-wps-id=%' limit 9999999
            `;
            const results: { ial: string }[] = await api.sql(sqlStr);

            const uidRegex = /custom-wps-id="([^"]+)"/;
            for (const row of results) {
                if (row.ial) {
                    const match = row.ial.match(uidRegex);
                    if (match && match[1]) {
                        importedIDs.add(match[1]);
                    }
                }
            }


            // console.log(`Found ${importedUIDs.size} imported event UIDs from SiYuan.`);
        } catch (error) {
            console.error('获取已导入WPS文件ID时出错:', error);
            showMessage('获取已导入WPS文件列表失败，更新检查可能不准确。', 3000, 'error');
        }
        // console.log("已导入的UIDs:");
        // for (const uid of importedIDs) {
        //     console.log(uid);
        // }
        return importedIDs;
    }

    private generateWpsBlock(rec: WpsFileRecord): string {
        const tpl = this.getWpsTemplate();
        const md = this.renderWpsTemplate(tpl, {
            name: rec.name || rec.link_url,
            url: rec.link_url,
            file_type: rec.file_type || '',
            file_src: rec.file_src || ''
        });
        // 超级块包装 + 标识属性，便于去重与后续更新
        return `{{{row
${md}
}}}
{: custom-wps-id="${rec.link_id}" custom-wps-link="${rec.link_url}" custom-wps-name="${rec.name || ''}" custom-wps-block="true"}
`; 
    }

    // --- UI 构建：返回一个用于 confirmDialog 的元素与回调上下文 ---
    private buildWpsImportDialog(list: WpsFileRecord[], exists: Set<string>) {
        const wrapper = document.createElement('div');
        wrapper.className = 'st-wps-import-wrapper';
        wrapper.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;height:100%;';

        // 顶部工具栏
        const topBar = document.createElement('div');
        topBar.className = 'st-wps-import-toolbar';
        topBar.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
                topBar.innerHTML = `
                        <input type="text" placeholder="搜索 (名称/类型/来源/链接)" class="b3-text-field" style="flex:1;min-width:220px;" />
                        <label style="display:flex;align-items:center;gap:4px;font-size:12px;opacity:.9;">
                            <input type="checkbox" id="wps-skip-exist" />跳过已存在
                        </label>
            <button class="b3-button" data-act="select-all">全选</button>
            <button class="b3-button" data-act="unselect-all">全不选</button>
            <button class="b3-button" data-act="invert">反选</button>
            <span style="margin-left:auto;font-size:12px;opacity:.7;" data-stat></span>
            <div style="flex-basis:100%;height:0;"></div>
        `;
        wrapper.appendChild(topBar);
        const searchInput = topBar.querySelector('input.b3-text-field') as HTMLInputElement;
        const skipExistCheckbox = topBar.querySelector('#wps-skip-exist') as HTMLInputElement;
        const statSpan = topBar.querySelector('[data-stat]') as HTMLSpanElement;

        // 列表区域
        const listBox = document.createElement('div');
        listBox.className = 'st-wps-import-list';
        listBox.style.cssText = 'flex:1;overflow:auto;border: var(--b3-border-color) 1px solid;padding:6px;display:flex;flex-direction:column;gap:4px;font-size:13px;';
        wrapper.appendChild(listBox);

        // 条目渲染
        const itemElements: HTMLElement[] = [];
        for (const rec of list) {
            const item = document.createElement('label');
            item.className = 'st-wps-import-item';
            item.style.cssText = 'display:flex;gap:6px;align-items:flex-start;padding:4px 6px;border-radius:4px;cursor:pointer;border:1px solid transparent;';
            item.dataset.id = rec.link_id;
            const already = exists.has(rec.link_id);
            // 初始 skip-exist=false，因此已存在可选但默认不勾选
            item.innerHTML = `
                <input type="checkbox" ${already ? '' : 'checked'} />
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:500;word-break:break-all;">${rec.name || rec.link_url}</div>
                    <div style="color:var(--b3-theme-on-surface-light);word-break:break-all;">${rec.link_url}</div>
                    <div style="margin-top:2px;font-size:12px;opacity:.8;">类型: ${rec.file_type || '-'} | 来源: ${rec.file_src || '-'}${already ? ' | <span style="color:var(--b3-protyle-inline-mark-bg);">已存在</span>' : ''}</div>
                </div>`;
            item.addEventListener('mouseenter', () => item.style.borderColor = 'var(--b3-theme-primary)');
            item.addEventListener('mouseleave', () => item.style.borderColor = 'transparent');
            listBox.appendChild(item);
            itemElements.push(item);
        }

        const updateStat = () => {
            const total = itemElements.length;
            const selectable = itemElements.filter(el => !(el.querySelector('input') as HTMLInputElement).disabled).length;
            const selected = itemElements.filter(el => { const cb = el.querySelector('input') as HTMLInputElement; return cb.checked && !cb.disabled; }).length;
            statSpan.textContent = `共 ${total} 条，可导入 ${selectable} 条，已选 ${selected} 条`;
        };
        updateStat();

        const applyFilter = () => {
            const kw = searchInput.value.trim().toLowerCase();
            let visibleCount = 0;
            for (const el of itemElements) {
                const id = el.dataset.id;
                const rec = list.find(r => r.link_id === id);
                if (!rec) continue;
                const text = `${rec.name}\n${rec.link_url}\n${rec.file_type}\n${rec.file_src}`.toLowerCase();
                const show = !kw || text.includes(kw);
                el.style.display = show ? '' : 'none';
                if (show) visibleCount++;
            }
            statSpan.dataset.visible = String(visibleCount);
        };
        searchInput.addEventListener('input', applyFilter);

        topBar.addEventListener('click', (ev) => {
            const btn = (ev.target as HTMLElement).closest('button[data-act]') as HTMLButtonElement;
            if (!btn) return;
            const act = btn.dataset.act;
            const visible = itemElements.filter(el => el.style.display !== 'none');
            if (act === 'select-all') {
                visible.forEach(el => { const cb = el.querySelector('input') as HTMLInputElement; if (!cb.disabled) cb.checked = true; });
            } else if (act === 'unselect-all') {
                visible.forEach(el => { const cb = el.querySelector('input') as HTMLInputElement; if (!cb.disabled) cb.checked = false; });
            } else if (act === 'invert') {
                visible.forEach(el => { const cb = el.querySelector('input') as HTMLInputElement; if (!cb.disabled) cb.checked = !cb.checked; });
            }
            updateStat();
        });

        skipExistCheckbox.addEventListener('change', () => {
            const skip = skipExistCheckbox.checked;
            itemElements.forEach(el => {
                const cb = el.querySelector('input') as HTMLInputElement;
                const id = el.dataset.id;
                const already = exists.has(id);
                if (already) {
                    if (skip) { cb.disabled = true; cb.checked = false; }
                    else { cb.disabled = false; /* 保持未选中 */ }
                }
            });
            updateStat();
        });

        listBox.addEventListener('change', (e) => {
            if ((e.target as HTMLElement).tagName === 'INPUT') updateStat();
        });

        return {
            element: wrapper,
            getSelection: () => {
                const allowDuplicates = !skipExistCheckbox.checked;
                const selected: { rec: WpsFileRecord; duplicate: boolean }[] = [];
                for (const el of itemElements) {
                    const cb = el.querySelector('input') as HTMLInputElement;
                    if (cb.disabled || !cb.checked) continue;
                    const rec = list.find(r => r.link_id === el.dataset.id);
                    if (!rec) continue;
                    const isDup = exists.has(rec.link_id);
                    if (isDup && !allowDuplicates) continue; // 安全兜底
                    selected.push({ rec, duplicate: isDup });
                }
                return { selected, allowDuplicates };
            }
        };
    }

    async importAllCapturedToCurrent() {
        // 需求：弹出面板 -> 支持搜索筛选 -> 勾选要导入 -> 执行插入
        try {
            const w: any = window as any;
            const rawList: WpsFileRecord[] = Array.isArray(w.wpsdoc) ? w.wpsdoc : [];
            if (!rawList.length) { showMessage('没有捕获的 WPS 文件数据', 1600, 'info'); return; }
            if (!this.cursorID) { showMessage('未获取到光标位置', 1600, 'error'); return; }

            // 去重
            const map = new Map<string, WpsFileRecord>();
            for (const r of rawList) { if (r && r.link_id && r.link_url && !map.has(r.link_id)) map.set(r.link_id, r); }
            const list = Array.from(map.values());
            if (!list.length) { showMessage('无有效 WPS 文件记录', 1600, 'info'); return; }

            const exists = await this.checkWpsBlockExists();
            const ui = this.buildWpsImportDialog(list, exists);
            confirmDialog({
                title: '选择要导入的 WPS 文件',
                content: ui.element,
                width: '700px',
                height: '560px',
                confirm: async () => {
                    const { selected, allowDuplicates } = ui.getSelection();
                    if (!selected.length) { showMessage('未选择任何可导入项', 1600, 'info'); return; }
                    await this.insertSelectedWpsRecords(selected.map(s => s.rec), exists, { allowDuplicates });
                }
            });
        } catch (e) {
            console.error(e);
            showMessage('打开选择面板失败', 2000, 'error');
        }
    }

    private async insertSelectedWpsRecords(records: WpsFileRecord[], exists?: Set<string>, options?: { allowDuplicates?: boolean }) {
        try {
            if (!this.cursorID) { showMessage('未获取到光标位置', 1600, 'error'); return; }
            const setlocationid = this.cursorID;
            const importedSet = exists || await this.checkWpsBlockExists();
            let imported = 0; let skipped = 0; let failed = 0;
            const allowDup = options?.allowDuplicates;
            // 批量一次性插入（合并为一个 markdown 块）
            const toInsert: WpsFileRecord[] = [];
            for (const rec of records) {
                if (!allowDup && importedSet.has(rec.link_id)) {
                    skipped++;
                    continue;
                }
                toInsert.push(rec);
            }

            if (toInsert.length === 0) {
                showMessage('无可导入项', 1600, 'info');
                // 已统计 skipped
            } else {
                const batchContent = toInsert.map(r => this.generateWpsBlock(r)).join('\n\n');
                try {
                    await appendBlock('markdown', batchContent, setlocationid);
                    // 标记已插入并统计
                    for (const rec of toInsert) {
                        importedSet.add(rec.link_id);
                        imported++;
                    }
                } catch (err) {
                    console.error('批量插入失败', err);
                    failed = toInsert.length;
                    showMessage('批量插入失败', 2000, 'error');
                }
            }
            const dupNote = allowDup ? ' (允许重复)' : '';
            showMessage(`导入完成${dupNote}: 新增 ${imported} 条, 跳过 ${skipped} 条, 失败 ${failed} 条`, 4000, 'info');
            if (imported > 10) {
                // 延时触发 F5，让 UI 有时间完成插入
                setTimeout(() => {
                    try {
                        F5();
                    } catch (err) {
                        console.error('Delayed F5 failed', err);
                    }
                }, 1000);
            }
        } catch (e) {
            console.error('选择导入异常', e);
            showMessage('导入过程发生错误', 2000, 'error');
        }
    }
}
