import { NetworkClient } from "@/api/network";

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
// const config = {
//   SheetId:1,
//   ViewId:1,
//   PicFieldName:"@图片和附件",
//   Name:"@文本"
// }

// function main() {
//   const app = Application;
//   var data = Context.argv;
//   console.info(data.pic_name);
//   let pic_data = "data:image/jpeg;base64," + data.pic_data;
//   let pic_name = data.pic_name;
//   const range = app.Sheets(config.SheetId).Views(config.ViewId).RecordRange.Add()
//   const count = app.Sheets(config.SheetId).Views(config.ViewId).Records.Count;
//   console.warn(count);
//   app.Sheets(config.SheetId).Views(config.ViewId).RecordRange(count, config.Name).Value = pic_name;
//   app.Sheets(config.SheetId).Views(config.ViewId).RecordRange(count, config.PicFieldName).Value = Application.DBCellValue([{
//     fileData: pic_data,
//     fileName: pic_name
//   }])
//   return app.Sheets(config.SheetId).Views(config.ViewId).RecordRange(count, config.PicFieldName).Value.Value[0].LinkUrl
// }
// return main()
