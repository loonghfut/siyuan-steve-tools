// showMessage 若需要可在运行环境通过 window.showMessage 使用，这里不直接导入以避免未使用警告
import { api } from "@frostime/siyuan-plugin-kits";
import { getTag, TagItem } from "./api";

export function escapeHtml(s: string) {
    return String(s || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * 根据 URL 生成精美链接卡片的 HTML
 * - 会尝试抓取页面 title 和 icon（支持相对 icon 地址解析）
 * - 若抓取失败则使用 favicon 服务或首字母占位图
 */
export interface LinkCardAction {
    /** 按钮唯一 id（用于生成 class） */
    id?: string;
    /** 按钮标题 / 提示 */
    title?: string;
    /** 按钮显示文本（若提供 html 则忽略）*/
    text?: string;
    /** 自定义按钮内部 html（不转义，需自行保证安全） */
    html?: string;
    /** onclick 回调主体代码（函数体部分，会自动包装 e.stopPropagation 等） */
    onClick?: string;
    /** 额外类名 */
    className?: string;
}

/**
 * 生成链接卡片
 * @param url 目标链接
 * @param actions 按钮数组：数量与回调由此控制
 */
export async function generateLinkCard(url: string, actions: LinkCardAction[] = []): Promise<string> {
    // 深色模式检测（适配思源：如外层可能加 dark 类；同时兜底系统暗色）
    const isDark =
        (typeof document !== "undefined" &&
            (document.documentElement.classList.contains("dark")
                || document.documentElement.classList.contains("theme-dark")
                || document.body.classList.contains("b3-theme-dark"))) ||
        (typeof window !== "undefined" &&
            window.matchMedia &&
            window.matchMedia("(prefers-color-scheme: dark)").matches);

    // 颜色与样式变量
    const colors = {
        bgFallback: isDark ? "#1f2937" : "#ffffff",
        border: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
        shadow: isDark ? "0 4px 14px rgba(0,0,0,0.6)" : "0 6px 18px rgba(0,0,0,0.06)",
        title: isDark ? "#e5e7eb" : "#111827",
        sub: isDark ? "#9ca3af" : "#6b7280",
        letterBg: isDark ? "linear-gradient(135deg,#374151,#1f2937)" : "linear-gradient(135deg,#f3f4f6,#e5e7eb)",
        letterColor: isDark ? "#f3f4f6" : "#374151"
    };

    try {
        const resp = await fetch(url, { mode: "cors" });
        const html = await resp.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const title =
            doc.querySelector('meta[property="og:title"]')?.getAttribute("content")
            || doc.querySelector('meta[name="twitter:title"]')?.getAttribute("content")
            || doc.querySelector("title")?.textContent
            || url;

        let icon =
            doc.querySelector('link[rel="icon"]')?.getAttribute("href")
            || doc.querySelector('link[rel="shortcut icon"]')?.getAttribute("href")
            || doc.querySelector('meta[property="og:image"]')?.getAttribute("content")
            || `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(url)}`;

        // 将相对路径解析为绝对 URL
        try {
            icon = new URL(icon, resp.url).toString();
        } catch { /* ignore */ }

        const domain = (() => {
            try { return (new URL(url)).hostname.replace(/^www\./, ""); }
            catch { return url; }
        })();

        // 计算按钮整体宽度（用于 hover 时再扩展 padding）
        const btnWidth = 36; // 与样式中的最小宽度保持一致
        const gap = 8;
        const totalBtnWidth = actions.length > 0 ? (actions.length * btnWidth + (actions.length - 1) * gap) : 0; // 不含左右额外空间

        // 生成按钮 HTML
        const actionsHtml = actions.length
            ? `<div class="link-card-actions" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);display:flex;gap:${gap}px;z-index:2;">${actions.map((act, idx) => {
                const id = act.id || `act${idx}`;
                const titleAttr = escapeHtml(act.title || act.text || id);
                const inner = act.html ?? escapeHtml(act.text || "");
                const cls = `btn btn-${escapeHtml(id)}${act.className ? " " + escapeHtml(act.className) : ""}`;
                const onClickBody = act.onClick || "";
                // 内联 onclick，自动包装阻止冒泡 & 默认行为
                const onClick = `(function(e){e.stopPropagation();e.preventDefault();try{${onClickBody}}catch(err){console.error('linkCard action error',err);if(window.showMessage){window.showMessage('Action error: '+err,'error');}}})(event)`;
                return `<button type="button" class="${cls}" title="${titleAttr}" aria-label="${titleAttr}" onclick="${onClick}">${inner || ""}</button>`;
            }).join("")}</div>`
            : "";

        // 公共样式（会重复插入，多次插入浏览器会去重；如需只插入一次，可在外部自行抽取）
        const styleBlock = actions.length ? `<style>\n/* 按钮显示控制：默认隐藏，不占初始布局。hover 或内聚焦时显示并为按钮腾出空间 */\n.link-card-wrapper.with-actions{--_ac-pad-extra:calc(var(--_actions-width,0px) + 12px);}/* 12px = 右侧原始内边距 */\n.link-card-wrapper.with-actions .link-card-inner{padding-right:12px;transition:padding-right .18s ease;}\n.link-card-wrapper.with-actions:hover .link-card-inner,\n.link-card-wrapper.with-actions:focus-within .link-card-inner{padding-right:var(--_ac-pad-extra);}\n.link-card-wrapper.with-actions .link-card-actions{opacity:0;pointer-events:none;transition:opacity .18s ease, filter .18s ease;filter:blur(2px);}\n.link-card-wrapper.with-actions:hover .link-card-actions,\n.link-card-wrapper.with-actions .link-card-actions:focus-within,\n.link-card-wrapper.with-actions:focus-within .link-card-actions{opacity:1;pointer-events:auto;filter:blur(0);}\n/* 按钮容器定位 */\n.link-card-wrapper.with-actions .link-card-actions{position:absolute;right:12px;top:50%;transform:translateY(-50%);display:flex;gap:${gap}px;z-index:2;}\n/* 按钮样式 */\n.link-card-actions .btn{min-width:${btnWidth}px;height:30px;padding:0 10px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;line-height:1;color:var(--fc-button-text-color,#fff);background:var(--fc-button-bg-color,#2563eb);border:1px solid var(--fc-button-border-color,#2563eb);border-radius:7px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.25);transition:background .15s,border-color .15s,transform .08s,box-shadow .15s,color .15s,opacity .18s;backdrop-filter:blur(6px) saturate(160%);-webkit-tap-highlight-color:transparent;user-select:none;}\n.link-card-actions .btn:hover,.link-card-actions .btn:focus{background:var(--fc-button-hover-bg-color,#1d4ed8);border-color:var(--fc-button-hover-border-color,#1d4ed8);outline:none;}\n.link-card-actions .btn:active{background:var(--fc-button-active-bg-color,#1e40af);border-color:var(--fc-button-active-border-color,#1e40af);transform:translateY(1px);}\n.link-card-actions .btn:disabled{opacity:.55;cursor:not-allowed;transform:none;}\n</style>` : "";

        const cardHtml = `
<div class="link-card-wrapper${actions.length ? ' with-actions' : ''}" contenteditable="false" style="display:block;${actions.length ? `--_actions-width:${totalBtnWidth}px;` : ''}">
  <a class="link-card" data-link="${escapeHtml(url)}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"
     contenteditable="false"
     style="text-decoration:none;color:inherit;display:block;cursor:pointer;">
    <div class="link-card-inner" style="position:relative;display:flex;align-items:center;gap:12px;border:1px solid ${colors.border};padding:12px;border-radius:10px;box-shadow:${colors.shadow};background:var(--b3-theme-background,${colors.bgFallback});transition:background .25s,border-color .25s,box-shadow .25s;">
      <img src="${escapeHtml(icon)}" alt="${escapeHtml(domain)}" style="width:48px;height:48px;border-radius:8px;object-fit:cover;flex-shrink:0;background:#fff0;" />
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:14px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--b3-theme-on-background,${colors.title});">${escapeHtml(title)}</div>
        <div style="font-size:12px;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--b3-theme-on-background,${colors.sub});">${escapeHtml(domain)}</div>
      </div>
      ${actionsHtml}
    </div>
  </a>
</div>${styleBlock}`.trim();

        return cardHtml;
    } catch {
        // 失败时的降级卡片
        const domain = (() => { try { return (new URL(url)).hostname.replace(/^www\./, ""); } catch { return url; } })();
        const actionsHtml = actions.length ? `<div class="link-card-actions" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);display:flex;gap:8px;z-index:2;">${actions.map((act, idx) => {
            const id = act.id || `act${idx}`;
            const titleAttr = escapeHtml(act.title || act.text || id);
            const inner = act.html ?? escapeHtml(act.text || "");
            const cls = `btn btn-${escapeHtml(id)}${act.className ? " " + escapeHtml(act.className) : ""}`;
            const onClickBody = act.onClick || "";
            const onClick = `(function(e){e.stopPropagation();e.preventDefault();try{${onClickBody}}catch(err){console.error('linkCard action error',err);if(window.showMessage){window.showMessage('Action error: '+err,'error');}}})(event)`;
            return `<button type=\"button\" class=\"${cls}\" title=\"${titleAttr}\" aria-label=\"${titleAttr}\" onclick=\"${onClick}\">${inner}</button>`;
        }).join("")}</div>` : "";
        const btnWidth = 36; const gap = 8; const totalBtnWidth = actions.length > 0 ? (actions.length * btnWidth + (actions.length - 1) * gap) : 0;
        const styleBlock = actions.length ? `\n<style>\n.link-card-wrapper.with-actions{--_ac-pad-extra:calc(var(--_actions-width,0px) + 12px);}\n.link-card-wrapper.with-actions .link-card-inner{padding-right:12px;transition:padding-right .18s ease;}\n.link-card-wrapper.with-actions:hover .link-card-inner,\n.link-card-wrapper.with-actions:focus-within .link-card-inner{padding-right:var(--_ac-pad-extra);}\n.link-card-wrapper.with-actions .link-card-actions{opacity:0;pointer-events:none;transition:opacity .18s ease, filter .18s ease;filter:blur(2px);}\n.link-card-wrapper.with-actions:hover .link-card-actions,\n.link-card-wrapper.with-actions .link-card-actions:focus-within,\n.link-card-wrapper.with-actions:focus-within .link-card-actions{opacity:1;pointer-events:auto;filter:blur(0);}\n.link-card-wrapper.with-actions .link-card-actions{position:absolute;right:12px;top:50%;transform:translateY(-50%);display:flex;gap:${gap}px;z-index:2;}\n.link-card-actions .btn{min-width:${btnWidth}px;height:30px;padding:0 10px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;line-height:1;color:#fff;background:#6b7280;border:1px solid #6b7280;border-radius:7px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.25);transition:background .15s,border-color .15s,transform .08s,box-shadow .15s;}\n.link-card-actions .btn:hover,.link-card-actions .btn:focus{background:#4b5563;}\n.link-card-actions .btn:active{background:#374151;transform:translateY(1px);}\n</style>` : "";
        return `
<div class="link-card-wrapper${actions.length ? ' with-actions' : ''}" contenteditable="false" style="display:block;${actions.length ? `--_actions-width:${totalBtnWidth}px;` : ''}">
  <a class="link-card" data-link="${escapeHtml(url)}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"
     contenteditable="false"
     style="text-decoration:none;color:inherit;display:block;cursor:pointer;">
  <div class="link-card-inner" style="position:relative;display:flex;align-items:center;gap:12px;border:1px solid ${colors.border};padding:12px;border-radius:10px;background:var(--b3-theme-background,${colors.bgFallback});transition:padding-right .18s ease;">
      <div style="width:48px;height:48px;border-radius:8px;background:${colors.letterBg};display:flex;align-items:center;justify-content:center;font-weight:600;color:var(--b3-theme-on-background,${colors.letterColor});font-size:18px;">
        ${escapeHtml((domain || "").charAt(0).toUpperCase())}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:14px;color:var(--b3-theme-on-background,${colors.title});">${escapeHtml(domain)}</div>
        <div style="font-size:12px;margin-top:6px;color:var(--b3-theme-on-background,${colors.sub});">无法获取页面信息</div>
      </div>
      ${actionsHtml}
    </div>
  </a>
</div>${styleBlock}`.trim();
    }
}


export function F5() {
    const event = new KeyboardEvent("keydown", {
        key: "F5",
        code: "F5",
        keyCode: 116,
        which: 116,
        bubbles: true,
        cancelable: true
    });
    document.dispatchEvent(event);
}
export function extractDataAvId(markdown: string): string | null {
    const regex = /data-av-id="([^"]+)"/;
    const match = markdown.match(regex);
    return match ? match[1] : null;
}


export const extractNewAvId = (oldAvs: string, newAvs: string): string | null => {
    console.debug("提取新的 avID:", oldAvs, newAvs);
    if (!newAvs) return null;
    const oldList = oldAvs ? oldAvs.split(',') : [];
    const newList = newAvs.split(',');
    const added = newList.find(id => !oldList.includes(id));
    return added || null; // 如果有多个新增的 ID，只返回第一个
};



/**
 * 获取所有标签（扁平 name 列表）
 * 依赖 /api/tag/getTag
 */
export async function getalltages(): Promise<string[]> {
    try {
        const tree = await getTag(window.siyuan.config.tag.sort);
        const result: string[] = [];
        const walk = (nodes: TagItem[] | null) => {
            if (!nodes) return;
            for (const n of nodes) {
                if (n?.name) result.push(n.name);
                if (n?.children && n.children.length) walk(n.children as TagItem[]);
            }
        };
        walk(tree);
        // 去重并去空
        return Array.from(new Set(result.filter(Boolean)));
    } catch (e) {
        console.warn("getalltages failed:", e);
        return [];
    }
}


export async function getallavids() {
    const sqlStr = `SELECT markdown, content
            FROM blocks
            WHERE markdown LIKE '%NodeAttributeView%data-av-id%';`;
    const res = await api.sql(sqlStr);
    const avIds = res.map(item => ({
        id: extractDataAvId(item.markdown),
        name: item.content?.split(' ')[0] || 'N/A'
    })).filter(item => item.id !== null);
    console.debug("avIds", avIds); // 输出: [{id: '20241213113357-m9b143e', name: '...'}, ...]
    return avIds;
}