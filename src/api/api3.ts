// showMessage 若需要可在运行环境通过 window.showMessage 使用，这里不直接导入以避免未使用警告

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

        // 计算右侧 padding（避免文字被按钮覆盖）
        const btnWidth = 36; // 与样式中的最小宽度保持一致
        const gap = 8;
        const totalBtnWidth = actions.length > 0 ? (actions.length * btnWidth + (actions.length - 1) * gap) : 0;
        const rightPadding = 12 + (totalBtnWidth ? (totalBtnWidth + 4) : 0); // 额外 +4 微调

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
        const styleBlock = actions.length ? `<style>\n.link-card-actions .btn{min-width:${btnWidth}px;height:32px;padding:0 8px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;
        color:var(--fc-button-text-color);
        background:var(--fc-button-bg-color);
        border:1px solid var(--fc-button-border-color);
        border-radius:8px;cursor:pointer;
        box-shadow:var(--b3-dialog-shadow);
        transition:background .15s,border-color .15s,transform .06s,box-shadow .15s;backdrop-filter:blur(4px);-webkit-tap-highlight-color:transparent;}\n.link-card-actions .btn:hover,.link-card-actions .btn:focus{background:var(--fc-button-hover-bg-color);border-color:var(--fc-button-hover-border-color);outline:none;}\n.link-card-actions .btn:active{background:var(--fc-button-active-bg-color);border-color:var(--fc-button-active-border-color);transform:translateY(1px);}\n</style>` : "";

        const cardHtml = `
<div class="link-card-wrapper" contenteditable="false" style="display:block;">
  <a class="link-card" data-link="${escapeHtml(url)}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"
     contenteditable="false"
     style="text-decoration:none;color:inherit;display:block;cursor:pointer;">
    <div style="position:relative;display:flex;align-items:center;gap:12px;border:1px solid ${colors.border};padding:12px ${rightPadding}px 12px 12px;border-radius:10px;box-shadow:${colors.shadow};background:var(--b3-theme-background,${colors.bgFallback});transition:background .25s,border-color .25s,box-shadow .25s;">
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
        const btnWidth = 36;
        const gap = 8;
        const totalBtnWidth = actions.length > 0 ? (actions.length * btnWidth + (actions.length - 1) * gap) : 0;
        const rightPadding = 12 + (totalBtnWidth ? (totalBtnWidth + 4) : 0);
        const styleBlock = actions.length ? `\n<style>\n.link-card-actions .btn{min-width:${btnWidth}px;height:32px;padding:0 8px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;color:#fff;background:#6b7280;border:1px solid #6b7280;border-radius:8px;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.2);transition:background .15s,transform .06s;}\n.link-card-actions .btn:hover{background:#4b5563;}\n.link-card-actions .btn:active{background:#374151;transform:translateY(1px);}\n</style>` : "";
        return `
<div class="link-card-wrapper" contenteditable="false" style="display:block;">
  <a class="link-card" data-link="${escapeHtml(url)}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"
     contenteditable="false"
     style="text-decoration:none;color:inherit;display:block;cursor:pointer;">
    <div style="position:relative;display:flex;align-items:center;gap:12px;border:1px solid ${colors.border};padding:12px ${rightPadding}px 12px 12px;border-radius:10px;background:var(--b3-theme-background,${colors.bgFallback});">
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

