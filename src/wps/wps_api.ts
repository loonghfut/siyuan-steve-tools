import { updateBlock } from "@/api/api";
import { NetworkClient } from "@/api/network";
import { showMessage } from "siyuan";


export async function ChangeLinkStyle(url?: string, blockId?: string) {
  showMessage(`测试中: ${url}, ${blockId}`)
  updateBlock("markdown", `<iframe src="${url}" width="600" height="400"></iframe>
{: custom-st-wps="2"}`, blockId);
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



