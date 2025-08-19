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
export async function generateLinkCard(url: string): Promise<string> {
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

        const cardHtml = `
<div class="link-card-wrapper" contenteditable="false" style="display:block;">
  <a class="link-card" data-link="${escapeHtml(url)}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"
     contenteditable="false"
     style="text-decoration:none;color:inherit;display:block;cursor:pointer;">
    <div style="display:flex;align-items:center;gap:12px;border:1px solid ${colors.border};padding:12px;border-radius:10px;box-shadow:${colors.shadow};background:var(--b3-theme-background,${colors.bgFallback});transition:background .25s,border-color .25s,box-shadow .25s;">
      <img src="${escapeHtml(icon)}" alt="${escapeHtml(domain)}" style="width:48px;height:48px;border-radius:8px;object-fit:cover;flex-shrink:0;background:#fff0;" />
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:14px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--b3-theme-on-background,${colors.title});">${escapeHtml(title)}</div>
        <div style="font-size:12px;margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--b3-theme-on-background,${colors.sub});">${escapeHtml(domain)}</div>
      </div>
    </div>
  </a>
</div>`.trim();

        return cardHtml;
    } catch {
        // 失败时的降级卡片
        const domain = (() => { try { return (new URL(url)).hostname.replace(/^www\./, ""); } catch { return url; } })();
        return `
<div class="link-card-wrapper" contenteditable="false" style="display:block;">
  <a class="link-card" data-link="${escapeHtml(url)}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"
     contenteditable="false"
     style="text-decoration:none;color:inherit;display:block;cursor:pointer;">
    <div style="display:flex;align-items:center;gap:12px;border:1px solid ${colors.border};padding:12px;border-radius:10px;background:var(--b3-theme-background,${colors.bgFallback});">
      <div style="width:48px;height:48px;border-radius:8px;background:${colors.letterBg};display:flex;align-items:center;justify-content:center;font-weight:600;color:var(--b3-theme-on-background,${colors.letterColor});font-size:18px;">
        ${escapeHtml((domain || "").charAt(0).toUpperCase())}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:600;font-size:14px;color:var(--b3-theme-on-background,${colors.title});">${escapeHtml(domain)}</div>
        <div style="font-size:12px;margin-top:6px;color:var(--b3-theme-on-background,${colors.sub});">无法获取页面信息</div>
      </div>
    </div>
  </a>
</div>`.trim();
    }
}

// 拦截链接卡片点击，避免直接跳转外部浏览器
export interface LinkCardInterceptOptions {
    root?: ParentNode;                 // 监听范围，默认 document
    openExternally?: boolean;          // true 则仍然外部打开
    preventDefault?: boolean;          // 默认 true：阻止默认跳转
    onClick?: (url: string, e: MouseEvent, anchor: HTMLAnchorElement) => void; // 自定义处理
    filter?: (url: string, anchor: HTMLAnchorElement) => boolean;             // 返回 false 可跳过拦截
}

/**
 * interceptLinkCardClicks({
 *   onClick: (url)=>{ /* 在这里用思源 API 打开 / 预览 *\/ }
 * });
 * 返回值为取消绑定函数。
 */
export function interceptLinkCardClicks(options: LinkCardInterceptOptions = {}) {
    if (typeof document === "undefined") return () => {};
    const {
        root = document,
        openExternally = false,
        preventDefault = true,
        onClick,
        filter
    } = options;

    const handler = (e: Event) => {
        const target = (e.target as HTMLElement)?.closest?.("a.link-card") as HTMLAnchorElement | null;
        if (!target) return;
        const url = target.getAttribute("data-link") || target.href;
        if (!url) return;

        if (filter && filter(url, target) === false) return;

        if (preventDefault) {
            e.preventDefault();
            e.stopPropagation();
        }

        if (onClick) {
            onClick(url, e as MouseEvent, target);
            return;
        }

        if (openExternally) {
            window.open(url, "_blank", "noopener");
            return;
        }

        // 默认行为：尝试使用思源内部 API（若存在），否则不跳转（留给 onClick）
        const w: any = window;
        if (w?.siyuan?.ws) {
            // 尝试调用思源 RPC（根据思源版本可能不同，以下为示例，可按实际 API 调整）
            try {
                // 假设存在统一 openURL 接口；若无请替换为当前版本合适的调用
                w.siyuan?.ws?.send?.("api/system/openURL", { url });
            } catch {
                // 回退外部
                window.open(url, "_blank", "noopener");
            }
        } else {
            // 没有思源环境：回退外部
            window.open(url, "_blank", "noopener");
        }
    };

    root.addEventListener("click", handler, true); // 捕获阶段优先阻止
    return () => root.removeEventListener("click", handler, true);
}

// 使用示例：
// const dispose = interceptLinkCardClicks({
//   onClick: (url)=>{ console.log("自定义处理:", url); },
//   preventDefault: true
// });