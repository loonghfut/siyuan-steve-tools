import { updateBlock } from "@/api/api";
import { NetworkClient } from "@/api/network";
import { Dialog, showMessage } from "siyuan";

//链接卡片函数
export async function ChangeLinkStyle(url?: string, blockId?: string) {
  // showMessage(`测试中: ${url}, ${blockId}`)
  updateBlock("markdown", `<iframe src="${url}" width="600" height="700"></iframe>
{: custom-st-wps="2"}`, blockId);
}

// ...existing code...
// export async function ShowLinkContent(url: string) {
//   // 创建一个带简单工具栏的对话框，内容区用于挂载 webview 或 iframe
//   const dialog = new Dialog({
//     title: null,
//     content: `<div style="width:100%;height:100%;display:flex;flex-direction:column;">
//       <style>
//         #siyuan-webview-toolbar{
//           padding:8px 10px;
//           display:flex;
//           gap:8px;
//           align-items:center;
//           background:var(--b3-theme-background);
//           color:var(--b3-theme-on-background);
//           border-bottom:1px solid rgba(0,0,0,0.06);
//           box-shadow:0 1px 0 rgba(0,0,0,0.02) inset;
//         }
//         #siyuan-webview-toolbar button{
//           min-width:36px;
//           padding:6px 10px;
//           border-radius:6px;
//           border:1px solid transparent;
//           background:transparent;
//           color:inherit;
//           cursor:pointer;
//           font-weight:500;
//           transition:background .12s ease, transform .06s ease, border-color .12s;
//         }
//         #siyuan-webview-toolbar button:hover{
//           background:rgba(0,0,0,0.04);
//           border-color: rgba(0,0,0,0.06);
//           transform:translateY(-1px);
//         }
//         #siyuan-webview-toolbar button:active{ transform:translateY(0); }
//         #siyuan-webview-url{
//           flex:1;
//           padding:6px 10px;
//           border-radius:8px;
//           border:1px solid rgba(0,0,0,0.08);
//           background:rgba(0,0,0,0.03);
//           color:var(--b3-theme-on-background);
//           outline:none;
//         }
//         #siyuan-webview-url::placeholder{ color: rgba(255,255,255,0.55); }
//         #siyuan-webview-open{
//           min-width:88px;
//           padding:6px 10px;
//           border-radius:8px;
//           border:1px solid rgba(0,0,0,0.08);
//           background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.02));
//         }
//         /* container 保持主题背景 */
//         #siyuan-webview-container{
//           background:var(--b3-theme-background);
//           color:var(--b3-theme-on-background);
//         }
//       </style>
//       <div id="siyuan-webview-toolbar">
//         <button id="siyuan-webview-back" title="后退">←</button>
//         <button id="siyuan-webview-forward" title="前进">→</button>
//         <button id="siyuan-webview-reload" title="刷新">⟳</button>
//         <input id="siyuan-webview-url" style="flex:1;padding:4px" value="${url}" />
//         <button id="siyuan-webview-open" title="在新窗口打开">新窗口打开</button>
//       </div>
//       <div id="siyuan-webview-container" style="flex:1;position:relative;min-height:200px;overflow:hidden;"></div>
//     </div>`,
//     width: '70%',
//     height: '86.66%',
//     disableClose: false,
//     hideCloseIcon: true,
//     resizeCallback: () => {
//       // 对话框大小改变时不需要特殊处理，webview/iframe 使用百分比尺寸自适应
//     },
//   });

//   // 稍等 DOM 挂载
//   await new Promise((res) => setTimeout(res, 50));

//   try {
//     const container = document.getElementById('siyuan-webview-container');
//     if (!container) return;

//     // 尝试创建 Electron 的 <webview>，若不支持则回退到 <iframe>
//     let useWebview = true;
//     let webviewEl: any = null;

//     try {
//       webviewEl = document.createElement('webview') as any;
//       // 在非 Electron 环境 createElement 仍会返回元素但不可用，做简单检测
//       if (!webviewEl || webviewEl.tagName.toLowerCase() !== 'webview') {
//         useWebview = false;
//       }
//     } catch {
//       useWebview = false;
//     }

//     if (useWebview) {
//       webviewEl.src = url;
//       webviewEl.style.width = '100%';
//       webviewEl.style.height = '100%';
//       webviewEl.style.border = '0';
//       // 可根据需要设置属性（谨慎设置以免引发安全问题）
//       // webviewEl.setAttribute('allowpopups', ''); // 如需弹窗
//       container.appendChild(webviewEl);

//       // 更新地址栏、按钮状态
//       const urlInput = document.getElementById('siyuan-webview-url') as HTMLInputElement | null;
//       const backBtn = document.getElementById('siyuan-webview-back') as HTMLButtonElement | null;
//       const forwardBtn = document.getElementById('siyuan-webview-forward') as HTMLButtonElement | null;
//       const reloadBtn = document.getElementById('siyuan-webview-reload') as HTMLButtonElement | null;
//       const openBtn = document.getElementById('siyuan-webview-open') as HTMLButtonElement | null;

//       // 事件绑定（使用 any 以兼容类型）
//       webviewEl.addEventListener?.('did-finish-load', () => {
//         try {
//           if (urlInput) urlInput.value = webviewEl.getURL?.() || url;
//         } catch {}
//       });
//       webviewEl.addEventListener?.('did-fail-load', (e: any) => {
//         // 加载失败时可显示提示或切换为 iframe（此处仅记录）
//         console.warn('webview did-fail-load', e);
//       });

//       backBtn?.addEventListener('click', () => { try { webviewEl.goBack?.(); } catch {} });
//       forwardBtn?.addEventListener('click', () => { try { webviewEl.goForward?.(); } catch {} });
//       reloadBtn?.addEventListener('click', () => { try { webviewEl.reload?.(); } catch {} });
//       openBtn?.addEventListener('click', () => { try { window.open(webviewEl.getURL?.() || url, '_blank'); } catch { window.open(url, '_blank'); } });
//       urlInput?.addEventListener('keydown', (ev) => {
//         if ((ev as KeyboardEvent).key === 'Enter') {
//           const val = (ev.target as HTMLInputElement).value;
//           try { webviewEl.src = val; } catch { webviewEl.setAttribute('src', val); }
//         }
//       });
//     } else {
//       // 回退：使用安全的 iframe 预览（受 sandbox 限制）
//       const iframe = document.createElement('iframe');
//       iframe.src = url;
//       iframe.style.width = '100%';
//       iframe.style.height = '100%';
//       iframe.style.border = '0';
//       // sandbox 限制可以降低风险，根据需要调整 allow-xxx
//       iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
//       container.appendChild(iframe);

//       const urlInput = document.getElementById('siyuan-webview-url') as HTMLInputElement | null;
//       const backBtn = document.getElementById('siyuan-webview-back') as HTMLButtonElement | null;
//       const forwardBtn = document.getElementById('siyuan-webview-forward') as HTMLButtonElement | null;
//       const reloadBtn = document.getElementById('siyuan-webview-reload') as HTMLButtonElement | null;
//       const openBtn = document.getElementById('siyuan-webview-open') as HTMLButtonElement | null;

//       // iframe 无法直接控制历史（跨域限制），这里只实现刷新与地址跳转
//       reloadBtn?.addEventListener('click', () => { iframe.contentWindow?.location.reload(); });
//       openBtn?.addEventListener('click', () => { window.open(iframe.src, '_blank'); });
//       urlInput?.addEventListener('keydown', (ev) => {
//         if ((ev as KeyboardEvent).key === 'Enter') {
//           const val = (ev.target as HTMLInputElement).value;
//           iframe.src = val;
//         }
//       });
//       // 禁用后退/前进按钮（不可用）
//       backBtn && (backBtn.disabled = true);
//       forwardBtn && (forwardBtn.disabled = true);
//     }
//   } catch (err) {
//     // 出错时简单提示
//     showMessage(`无法预览该链接: ${(err as Error).message || err}`);
//   }
// }

export async function ShowLinkContent(url: string) {
  // 创建一个带简单工具栏的对话框，内容区用于挂载 webview 或 iframe
  const dialog = new Dialog({
    title: null,
    content: `<div style="width:100%;height:100%;display:flex;flex-direction:column;">
      <style>
        #siyuan-webview-toolbar{
          padding:8px 10px;
          display:flex;
          gap:8px;
          align-items:center;
          background:var(--b3-theme-background);
          color:var(--b3-theme-on-background);
          border-bottom:1px solid rgba(0,0,0,0.06);
          box-shadow:0 1px 0 rgba(0,0,0,0.02) inset;
        }
        #siyuan-webview-toolbar button{
          min-width:36px;
          padding:6px 10px;
          border-radius:6px;
          border:1px solid transparent;
          background:transparent;
          color:inherit;
          cursor:pointer;
          font-weight:500;
          transition:background .12s ease, transform .06s ease, border-color .12s;
        }
        #siyuan-webview-toolbar button:hover{
          background:rgba(0,0,0,0.04);
          border-color: rgba(0,0,0,0.06);
          transform:translateY(-1px);
        }
        #siyuan-webview-toolbar button:active{ transform:translateY(0); }
        #siyuan-webview-url{
          flex:1;
          padding:6px 10px;
          border-radius:8px;
          border:1px solid rgba(0,0,0,0.08);
          background:rgba(0,0,0,0.03);
          color:var(--b3-theme-on-background);
          outline:none;
        }
        #siyuan-webview-url::placeholder{ color: rgba(255,255,255,0.55); }
        #siyuan-webview-open{
          min-width:88px;
          padding:6px 10px;
          border-radius:8px;
          border:1px solid rgba(0,0,0,0.08);
          background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.02));
        }
        /* container 保持主题背景 */
        #siyuan-webview-container{
          background:var(--b3-theme-background);
          color:var(--b3-theme-on-background);
        }
      </style>
      <div id="siyuan-webview-toolbar">
        <button id="siyuan-webview-back" title="后退">←</button>
        <button id="siyuan-webview-forward" title="前进">→</button>
        <button id="siyuan-webview-reload" title="刷新">⟳</button>
        <input id="siyuan-webview-url" style="flex:1;padding:4px" value="${url}" />
        <button id="siyuan-webview-open" title="在新窗口打开">新窗口打开</button>
      </div>
      <div id="siyuan-webview-container" style="flex:1;position:relative;min-height:200px;overflow:hidden;"></div>
    </div>`,
    width: '70%',
    height: '86.66%',
    disableClose: false,
    hideCloseIcon: true,
    resizeCallback: () => {
      // 对话框大小改变时不需要特殊处理，webview/iframe 使用百分比尺寸自适应
    },
  });

  // 稍等 DOM 挂载
  await new Promise((res) => setTimeout(res, 50));

  try {
    const container = document.getElementById('siyuan-webview-container');
    if (!container) return;

    // 尝试创建 Electron 的 <webview>，若不支持则回退到 <iframe>
    let useWebview = true;
    let webviewEl: any = null;

    try {
      webviewEl = document.createElement('webview') as any;
      // 在非 Electron 环境 createElement 仍会返回元素但不可用，做简单检测
      if (!webviewEl || webviewEl.tagName.toLowerCase() !== 'webview') {
        useWebview = false;
      }
    } catch {
      useWebview = false;
    }

    if (useWebview) {
      webviewEl.src = url;
      webviewEl.style.width = '100%';
      webviewEl.style.height = '100%';
      webviewEl.style.border = '0';
      // 可根据需要设置属性（谨慎设置以免引发安全问题）
      // webviewEl.setAttribute('allowpopups', ''); // 如需弹窗
      container.appendChild(webviewEl);

      // 更新地址栏、按钮状态
      const urlInput = document.getElementById('siyuan-webview-url') as HTMLInputElement | null;
      const backBtn = document.getElementById('siyuan-webview-back') as HTMLButtonElement | null;
      const forwardBtn = document.getElementById('siyuan-webview-forward') as HTMLButtonElement | null;
      const reloadBtn = document.getElementById('siyuan-webview-reload') as HTMLButtonElement | null;
      const openBtn = document.getElementById('siyuan-webview-open') as HTMLButtonElement | null;

      // 事件绑定（使用 any 以兼容类型）
      webviewEl.addEventListener?.('did-finish-load', () => {
        try {
          if (urlInput) urlInput.value = webviewEl.getURL?.() || url;
        } catch {}
      });
      webviewEl.addEventListener?.('did-fail-load', (e: any) => {
        // 加载失败时可显示提示或切换为 iframe（此处仅记录）
        console.warn('webview did-fail-load', e);
      });

      backBtn?.addEventListener('click', () => { try { webviewEl.goBack?.(); } catch {} });
      forwardBtn?.addEventListener('click', () => { try { webviewEl.goForward?.(); } catch {} });
      reloadBtn?.addEventListener('click', () => { try { webviewEl.reload?.(); } catch {} });
      openBtn?.addEventListener('click', () => { try { window.open(webviewEl.getURL?.() || url, '_blank'); } catch { window.open(url, '_blank'); } });
      urlInput?.addEventListener('keydown', (ev) => {
        if ((ev as KeyboardEvent).key === 'Enter') {
          const val = (ev.target as HTMLInputElement).value;
          try { webviewEl.src = val; } catch { webviewEl.setAttribute('src', val); }
        }
      });
    } else {
      // 回退：使用安全的 iframe 预览（受 sandbox 限制）
      const iframe = document.createElement('iframe');
      iframe.src = url;
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = '0';
      // sandbox 限制可以降低风险，根据需要调整 allow-xxx
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
      container.appendChild(iframe);

      const urlInput = document.getElementById('siyuan-webview-url') as HTMLInputElement | null;
      const backBtn = document.getElementById('siyuan-webview-back') as HTMLButtonElement | null;
      const forwardBtn = document.getElementById('siyuan-webview-forward') as HTMLButtonElement | null;
      const reloadBtn = document.getElementById('siyuan-webview-reload') as HTMLButtonElement | null;
      const openBtn = document.getElementById('siyuan-webview-open') as HTMLButtonElement | null;

      // iframe 无法直接控制历史（跨域限制），这里只实现刷新与地址跳转
      reloadBtn?.addEventListener('click', () => { iframe.contentWindow?.location.reload(); });
      openBtn?.addEventListener('click', () => { window.open(iframe.src, '_blank'); });
      urlInput?.addEventListener('keydown', (ev) => {
        if ((ev as KeyboardEvent).key === 'Enter') {
          const val = (ev.target as HTMLInputElement).value;
          iframe.src = val;
        }
      });
      // 禁用后退/前进按钮（不可用）
      backBtn && (backBtn.disabled = true);
      forwardBtn && (forwardBtn.disabled = true);
    }
  } catch (err) {
    // 出错时简单提示
    showMessage(`无法预览该链接: ${(err as Error).message || err}`);
  }
}



/**
 * 提取一个 NodeIFrame 块中的 data-node-id 与 iframe url
 * @param blockEl 传入的块元素（detail.blockElements[0]）
 * @returns { id: string; url: string } | null
 */
export function extractIframeBlockInfo(blockEl: Element | null | undefined): { id: string; url: string } | null {
  if (!blockEl) return null;
  const id = (blockEl.getAttribute?.('data-node-id')) || '';
  if (!id) return null;
  // 兼容 data-src 情况
  const iframe = blockEl.querySelector?.('iframe');
  if (!iframe) return null;
  const url = iframe.getAttribute('src') || iframe.getAttribute('data-src') || '';
  if (!url) return null;
  return { id, url };
}








export interface RunWpsScriptSyncParams {
  url: string;
  token: string;
  context?: any;
}
/**
 * 同步执行 WPS 脚本
 * @param fileId 文件 ID
 * @param scriptId 脚本 ID
 * @param token AirScript-Token
 * @param context 运行时上下文参数        
 * const context = {
 *     argv: { name: "xiaomeng", age: 18 },
 *     sheet_name: "表名",
 *     range: "$B$156"
 * };
 * @returns Promise<{result: string, logs: any[], error: string, status: string}>
 */
export async function runWpsScriptSync(
  params: RunWpsScriptSyncParams
): Promise<{ result: string, logs: any[], error: string, status: string }> {
  const { url, token, context = {} } = params;
  if (!url || !token) {
    throw new Error("URL 和 Token 不能为空");
  }
  const body = JSON.stringify({ Context: context });

  const networkClient = new NetworkClient({
    serverUrl: "", // 留空或填写实际服务地址
    useProxy: true,
  });

  const res = await networkClient.request({
    method: "POST",
    path: url,
    body,
    headers: {
      "Content-Type": "application/json",
      "AirScript-Token": token,
    },
    timeout: 15000,
    contentType: "application/json"
  });

  if (!res.ok) {
    throw new Error(`请求失败: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return {
    result: json.data?.result ?? "",
    logs: json.data?.logs ?? [],
    error: json.error ?? "",
    status: json.status ?? ""
  };
}





//// airscript 图片处理
export const airscript_pic_code = `
const config = {
  SheetId: 2,
  ViewId: 1,
  PicFieldName: "@图片和附件",
  Name: "@文本"
};
function main() {
  const app = Application;
  const data = Context.argv;
  // 验证输入数据
  if (!data.pic_data || !data.pic_name) {
    console.error("缺少图片数据或图片名称");
    return null;
  }
  try {
    // 准备图片数据
    const pic_data = "data:image/jpeg;base64," + data.pic_data;
    const pic_name = data.pic_name;
    // 添加新记录
    app.Sheets(config.SheetId).Views(config.ViewId).RecordRange.Add();
    const count = app.Sheets(config.SheetId).Views(config.ViewId).Records.Count;
    // 设置记录字段值
    app.Sheets(config.SheetId).Views(config.ViewId).RecordRange(count, config.Name).Value = pic_name;
    app.Sheets(config.SheetId).Views(config.ViewId).RecordRange(count, config.PicFieldName).Value = Application.DBCellValue([{
      fileData: pic_data,
      fileName: pic_name
    }]);
    // 获取并验证URL，最多重试3次
    let url = null;
    const maxRetries = 3;
    let retryCount = 0;
    while (retryCount < maxRetries) {
      try {
        // 获取图片URL
        const fieldValue = app.Sheets(config.SheetId).Views(config.ViewId).RecordRange(count, config.PicFieldName).Value;
        url = fieldValue.Value[0].LinkUrl;
        // 检查URL是否有效且包含"weboffice"
        if (url && url.includes("weboffice")) {
          console.info("成功获取有效URL:", url);
          break;
        }
        // 未获取到有效URL，准备重试
        retryCount++;
        console.warn(\`第\${retryCount}次重试获取URL...\`);
        // 短暂延迟后重试，避免过于频繁
        if (retryCount < maxRetries) {
          Time.sleep(500); // 延迟500毫秒
        }
      } catch (innerErr) {
        console.error(\`获取URL时发生错误: \${innerErr.message}，正在重试...\`);
        retryCount++;
      }
    }
    if (!url || !url.includes("weboffice")) {
      console.error("达到最大重试次数，仍未获取到有效URL");
      return null;
    }
    return url;
  } catch (err) {
    console.error("执行过程中发生错误:", err.message);
    return null;
  }
}
return main();`



