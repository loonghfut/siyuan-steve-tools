import { updateBlock } from "@/api/api";
import { NetworkClient } from "@/api/network";
import { Dialog, showMessage } from "siyuan";
import { getWpsBrowserEnvScript, getWpsWebviewAttributes, getWpsWebviewUserAgent } from "./webview_env";

//链接卡片函数
export async function ChangeLinkStyle(url?: string, blockId?: string) {
  // showMessage(`测试中: ${url}, ${blockId}`)
  updateBlock("markdown", `<iframe src="${url}" width="600" height="700"></iframe>
{: custom-st-wps-iframe="1"}`, blockId);
}

export async function ShowLinkContent(url: string) {
  const DESKTOP_UA = getWpsWebviewUserAgent();
  const WEBVIEW_ATTRS = getWpsWebviewAttributes({
    userAgent: DESKTOP_UA,
    partition: 'persist:st-wps-preview',
    emulateBrowserEnv: true,
  });
  const BROWSER_ENV_SCRIPT = getWpsBrowserEnvScript({
    userAgent: DESKTOP_UA,
    partition: 'persist:st-wps-preview',
    emulateBrowserEnv: true,
  });
  const cleanupFns: Array<() => void> = [];

  // 创建一个带简单工具栏的对话框，内容区用于挂载 webview 或 iframe
  const dialog = new Dialog({
    title: null,
    content: `<div class="siyuan-webview-wrapper" style="width:100%;height:100%;display:flex;flex-direction:column;border-radius:12px;overflow:hidden;background:var(--b3-theme-background);color:var(--b3-theme-on-background);">
      <style>
        .siyuan-webview-wrapper{ /* 确保整个对话框内容区域圆角并隐藏溢出 */ 
          border-radius:12px;
          overflow:hidden;
          background:var(--b3-theme-background);
          color:var(--b3-theme-on-background);
        }
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
        /* toolbar 顶部保留圆角视觉（实际圆角由 wrapper 控制） */
        #siyuan-webview-toolbar{ border-top-left-radius:12px; border-top-right-radius:12px; }
        #siyuan-webview-toolbar button{
          min-width:36px;
          padding:6px 10px;
          border-radius:8px;
          border:1px solid rgba(0,0,0,0.06);
          background:rgba(255,255,255,0.02);
          color:var(--b3-theme-on-background);
          cursor:pointer;
          font-weight:600;
          transition:background .12s ease, transform .06s ease, border-color .12s, box-shadow .12s;
          box-shadow: none;
        }
        #siyuan-webview-toolbar button:hover{
          background:rgba(255,255,255,0.03);
          border-color: rgba(0,0,0,0.08);
          transform:translateY(-1px);
          box-shadow:0 2px 6px rgba(0,0,0,0.04);
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
        /* container 保持主题背景并与 wrapper 圆角契合（底部圆角） */
        #siyuan-webview-container{
          background:var(--b3-theme-background);
          color:var(--b3-theme-on-background);
          border-bottom-left-radius:12px;
          border-bottom-right-radius:12px;
        }
      </style>
      <div id="siyuan-webview-toolbar">
        <button id="siyuan-webview-back" title="后退">←</button>
        <button id="siyuan-webview-forward" title="前进">→</button>
        <button id="siyuan-webview-reload" title="刷新">⟳</button>
        <input id="siyuan-webview-url" style="flex:1;padding:4px" value="${url}" />
        <button id="siyuan-webview-open" title="浏览器打开">浏览器打开</button>
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
  void dialog;

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
      Object.entries(WEBVIEW_ATTRS).forEach(([key, value]) => {
        webviewEl.setAttribute(key, value);
      });
      // 可根据需要设置属性（谨慎设置以免引发安全问题）
      webviewEl.setAttribute('allowpopups', '');
      container.appendChild(webviewEl);

      // 更新地址栏、按钮状态
      const urlInput = document.getElementById('siyuan-webview-url') as HTMLInputElement | null;
      const backBtn = document.getElementById('siyuan-webview-back') as HTMLButtonElement | null;
      const forwardBtn = document.getElementById('siyuan-webview-forward') as HTMLButtonElement | null;
      const reloadBtn = document.getElementById('siyuan-webview-reload') as HTMLButtonElement | null;
      const openBtn = document.getElementById('siyuan-webview-open') as HTMLButtonElement | null;

      // 事件绑定（使用 any 以兼容类型）
      const onDidFinishLoad = () => {
        try {
          webviewEl.executeJavaScript?.(BROWSER_ENV_SCRIPT);
          if (urlInput) urlInput.value = webviewEl.getURL?.() || url;
        } catch {}
      };
      const onDidFailLoad = (e: any) => {
        // 加载失败时可显示提示或切换为 iframe（此处仅记录）
        console.warn('webview did-fail-load', e);
      };
      webviewEl.addEventListener?.('did-finish-load', onDidFinishLoad);
      webviewEl.addEventListener?.('did-fail-load', onDidFailLoad);
      cleanupFns.push(() => {
        try { webviewEl.removeEventListener?.('did-finish-load', onDidFinishLoad); } catch {}
        try { webviewEl.removeEventListener?.('did-fail-load', onDidFailLoad); } catch {}
      });

      // 轻量休眠：预览窗口长期闲置时切到 about:blank，交互后自动唤醒
      const SLEEP_MS = 5 * 60 * 1000;
      let lastActiveAt = Date.now();
      let sleeping = false;
      let lastUrl = url;
      const markActive = () => {
        lastActiveAt = Date.now();
        if (sleeping) {
          try {
            webviewEl.setAttribute('src', lastUrl || url);
            sleeping = false;
          } catch {}
        }
      };
      const sleepTimer = window.setInterval(() => {
        if (sleeping) return;
        if (Date.now() - lastActiveAt < SLEEP_MS) return;
        try {
          const current = webviewEl.getURL?.() || webviewEl.getAttribute?.('src') || '';
          if (current && current !== 'about:blank') lastUrl = current;
          webviewEl.setAttribute('src', 'about:blank');
          sleeping = true;
        } catch {}
      }, 30000);
      const activeEvents: Array<keyof HTMLElementEventMap> = ['mousemove', 'mousedown', 'wheel', 'keydown', 'touchstart'];
      activeEvents.forEach((evt) => container.addEventListener(evt, markActive as EventListener, { passive: true }));
      const onVisibility = () => {
        if (!document.hidden) markActive();
      };
      document.addEventListener('visibilitychange', onVisibility);
      cleanupFns.push(() => {
        try { window.clearInterval(sleepTimer); } catch {}
        try { document.removeEventListener('visibilitychange', onVisibility); } catch {}
        activeEvents.forEach((evt) => {
          try { container.removeEventListener(evt, markActive as EventListener); } catch {}
        });
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

    // 轮询检测对话框是否已销毁，及时移除监听器/定时器
    const destroyWatch = window.setInterval(() => {
      if (container.isConnected) return;
      window.clearInterval(destroyWatch);
      for (const fn of cleanupFns) {
        try { fn(); } catch {}
      }
    }, 1000);
    cleanupFns.push(() => {
      try { window.clearInterval(destroyWatch); } catch {}
    });
  } catch (err) {
    // 出错时简单提示
    for (const fn of cleanupFns) {
      try { fn(); } catch {}
    }
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
  const id = blockEl.getAttribute?.('data-node-id') || '';
  if (!id) return null;

  // 优先尝试 iframe（包含 data-src）
  const iframe = blockEl.querySelector?.('iframe');
  const iframeUrl = iframe?.getAttribute('src') || iframe?.getAttribute('data-src') || '';
  if (iframeUrl) return { id, url: iframeUrl };

  // 尝试标准 <a href="...">
  const aEl = blockEl.querySelector?.('a[href]');
  const aUrl = aEl?.getAttribute('href') || '';
  if (aUrl) return { id, url: aUrl };

  // 尝试带 data-href 的元素（例如 <span data-type="a" data-href="...">）
  const dataHrefEl = blockEl.querySelector?.('[data-href]');
  const dataHrefUrl = dataHrefEl?.getAttribute('data-href') || '';
  if (dataHrefUrl) return { id, url: dataHrefUrl };

  return null;
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
): Promise<{ result: any, logs: any[], error: string, status: string }> {
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

export const airscript_data_code =`
function main() {
  // 1. 基础配置（基于指定文档，可调整）
  const TARGET_SHEET_NAME = "思源"; // 目标表名（参考Sheet _ AirScript文档.docx）
  const MAX_RECORDS_PER_PAGE = 100; // 单页最大记录数（参考Record _ AirScript文档.docx）
  let targetSheetId = null;
  let allFieldInfo = []; // 缓存字段信息（复用对象，参考最佳实践 _ AirScript文档.docx）
  const allRawRecords = []; // 存储所有分页记录

  // 2. 查找目标表ID（基于Sheet _ AirScript文档.docx的GetSheets方法）
  const app = Application;
  const allSheets = app.Sheet.GetSheets();
  for (let i = 0; i < allSheets.length; i++) {
    const sheet = allSheets[i];
    if (sheet.name !== null && sheet.name !== undefined && sheet.name === TARGET_SHEET_NAME) {
      targetSheetId = sheet.id;
      break;
    }
  }
  if (targetSheetId === null) {
    throw new Error(\`目标表不存在：\${TARGET_SHEET_NAME}（参考Sheet文档：表名需完全匹配）\`);
  }

  // 3. 缓存字段信息（基于Field _ AirScript文档.docx的GetFields方法，仅请求1次）
  const fieldsResult = app.Field.GetFields({ SheetId: targetSheetId });
  if (fieldsResult !== null && fieldsResult !== undefined) {
    allFieldInfo = fieldsResult;
  }

  // 4. 分页读取核心逻辑（严格遵循Record _ AirScript文档.docx的nextOffset规范）
  let currentOffset = ""; // 初始值为空字符串（符合Record文档“空字符串从第一条开始”的定义）
  let hasNextPage = true;

  while (hasNextPage) {
    try {
      // 调用Record文档的GetRecords，传入筛选条件（基于附录 _ AirScript文档.docx）
      const pageResult = app.Record.GetRecords({
        SheetId: targetSheetId,
        Offset: currentOffset,
        MaxRecords: MAX_RECORDS_PER_PAGE,
        Filter: {
          mode: "AND",
          criteria: [{ field: "同步", op: "NotEqu", values: ["已发送"] }] // 符合附录筛选规则
        }
      });

      // 处理当前页记录（基于Record文档返回的records数组）
      const currentPageRecords = pageResult.records || [];
      if (currentPageRecords.length > 0) {
        allRawRecords.push(...currentPageRecords);
      }

      // 判断下一页（基于Record文档的nextOffset存在性）
      if (pageResult.nextOffset !== undefined && pageResult.nextOffset !== null) {
        currentOffset = pageResult.nextOffset;
      } else {
        hasNextPage = false;
      }

    } catch (error) {
      throw new Error(\`分页读取失败（Offset=\${currentOffset}）：\${error.message}\`);
    }
  }

  // 5. 字段格式处理（新增附件字段专属逻辑，基于附录 _ AirScript文档.docx）
  if (allRawRecords.length === 0) {
    if (Context.argv.name == "check") {
      return false;
    }
    return "[]";
  }
  if (Context.argv.name == "check") {
    return true;
  }
  const formattedRecords = allRawRecords.map(record => {
    const formattedFields = {};
    for (const fieldName in record.fields) {
      if (!record.fields.hasOwnProperty(fieldName)) continue;

      const fieldValue = record.fields[fieldName];
      const fieldType = getFieldTypeFromCache(allFieldInfo, fieldName); // 复用缓存的字段类型

      // 基于附录文档的字段类型处理，新增Attachment（附件）分支
      switch (fieldType) {
        case "Date":
          formattedFields[fieldName] = fieldValue || ""; // 日期：保留原格式（yyyy/mm/dd）
          break;
        case "Time":
          formattedFields[fieldName] = fieldValue || ""; // 时间：保留原格式（hh:mm:ss）
          break;
        case "MultipleSelect":
          formattedFields[fieldName] = Array.isArray(fieldValue) ? fieldValue : []; // 多选项：数组格式
          break;
        case "Number":
        case "Currency":
        case "Percentage":
          formattedFields[fieldName] = fieldValue !== null ? Number(fieldValue) : 0; // 数值：转为Number
          break;
        case "Checkbox":
          formattedFields[fieldName] = fieldValue === true || fieldValue === "true"; // 复选框：布尔值
          break;
        // -------------------------- 新增：附件字段处理 --------------------------
        case "Attachment":
          const attachments = Array.isArray(fieldValue) ? fieldValue : [];
          const processedAttachments = [];

          // 使用for循环遍历附件
          for (let i = 0; i < attachments.length; i++) {
            const attachment = attachments[i];

            // 跳过非对象类型的元素
            if (typeof attachment !== 'object' || attachment === null) {
              console.warn(\`第\${i + 1}个元素不是有效的附件对象，已跳过\`);
              continue;
            }

            // 提取基础信息并设置默认值
            let fileName = attachment.fileName;
            if (!fileName) {
              fileName = '未知文件名';
            }

            let linkUrl = attachment.linkUrl || '';
            const size = attachment.size || 0;
            let source = attachment.source || 'unknown';
            const type = attachment.type || '';
            const uploadId = attachment.uploadId || '';

            // 如果是ks3上传的附件，并且有uploadId，则获取完整URL
            if (source === 'upload_ks3' && uploadId) {
              try {
                linkUrl = app.Record.GetAttachmentURL({
                  UploadId: uploadId,
                  Source: "upload_ks3"
                });
              } catch (error) {
                console.error(\`获取附件"\${fileName}"的URL失败:\`, error);
                // 保留原始linkUrl作为备用
              }
            }

            // 将处理后的附件添加到结果数组
            processedAttachments.push({
              fileName,
              url: linkUrl,
              size,
              source,
              type,
              uploadId
            });
          }

          // 更新格式化字段
          formattedFields[fieldName] = processedAttachments;
          break;
        // ----------------------------------------------------------------------
        default:
          formattedFields[fieldName] = fieldValue || ""; // 其他类型（文本/单选等）：保留原值
          break;
      }
    }
    return {
      recordId: record.id || "", // 记录唯一ID（参考Record文档返回结构）
      fields: formattedFields
    };
  });
  batchSetSingleSelect();//标记已发送
  return formattedRecords;
}

/**
 * 辅助函数：从缓存获取字段类型（基于Field _ AirScript文档.docx，复用对象优化性能）
 * @param {Array} allFieldInfo - Field.GetFields返回的缓存字段信息
 * @param {string} fieldName - 字段名
 * @returns {string} 字段类型（如Attachment、MultiLineText等，参考附录文档）
 */
function getFieldTypeFromCache(allFieldInfo, fieldName) {
  for (let i = 0; i < allFieldInfo.length; i++) {
    const field = allFieldInfo[i];
    if (field.name === fieldName) {
      return field.type;
    }
  }
  return ""; // 未找到字段时返回空（符合Field文档逻辑）
}

function batchSetSingleSelect() {
  // 1. 基础配置（需按实际修改）
  const SHEET_NAME = "思源"; // 目标表名（Sheet文档）
  const FIELD_NAME = "同步"; // 单选字段名（Field文档）
  const SET_VALUE = "已发送"; // 单选值（附录文档：需匹配现有选项）
  const BATCH_SIZE = 50; // 单次批量数（最佳实践文档）
  let sheetId = null, allRecords = [];

  // 2. 找表ID（Sheet文档）
  const sheets = Application.Sheet.GetSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].name === SHEET_NAME) {
      sheetId = sheets[i].id;
      break;
    }
  }
  if (!sheetId) throw new Error("表不存在");

  // 3. 分页取待更新记录（Record文档）
  let offset = "", hasNext = true;
  while (hasNext) {
    const res = Application.Record.GetRecords({
      SheetId: sheetId,
      Offset: offset,
      MaxRecords: BATCH_SIZE,
      Filter: { mode: "AND", criteria: [{ field: FIELD_NAME, op: "NotEqu", values: [SET_VALUE] }] } // 附录文档筛选
    });
    allRecords = allRecords.concat(res.records || []);
    hasNext = res.nextOffset !== undefined && res.nextOffset !== null;
    offset = res.nextOffset || "";
  }
  if (allRecords.length === 0) return "无待更新记录";

  // 4. 批量设值（Record文档）
  let success = 0;
  for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
    const batch = allRecords.slice(i, i + BATCH_SIZE).map(r => ({
      id: r.id,
      fields: { [FIELD_NAME]: SET_VALUE } // 附录文档：单选值为字符串
    }));
    Application.Record.UpdateRecords({ SheetId: sheetId, Records: batch });
    success += batch.length;
  }
  return \`成功更新\${success}/\${allRecords.length}条\`;
}
const data = main();//获取记录数据

return data;
`

