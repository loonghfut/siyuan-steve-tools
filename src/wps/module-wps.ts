import steveTools from "@/index";
import { IProtyle, showMessage } from "siyuan";
import { runWpsScriptSync } from "./wps_api";
import { appendBlock } from "@/api/api";

// Wps 模块
export class M_Wps {
    private plugin: steveTools;
    private settingdata: any;
    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }
    private protyle: IProtyle;
    async init(settingdata: any) {
        this.settingdata = settingdata;
        // 在这里编写初始化逻辑, 可使用 settingdata 访问设置项
        console.log("Wps 模块初始化");
        this.plugin.eventBus.on("switch-protyle", (e) => {
            // console.log("当前 Protyle:", e.detail.protyle);
            this.protyle = e.detail.protyle;
        });
        // 示例: 根据设置添加一个顶部按钮
        this.plugin.addTopBar({
            icon: "iconInfo",
            title: "Wps",
            position: "left",
            callback: async () => {
                // showMessage("WPS插件已启用");
                // console.log(getAllEditor());
                await this.selectImageAndSend();
                // console.log("Wps clicked");
            }
        });
    }

    async selectImageAndSend() {
        const MAX_SIZE = 2 * 1024 * 1024; // 2MB

        // 创建文件选择框
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = async (e: any) => {
            const file = e.target.files[0];
            if (!file) return;
            let base64: string;
            // 检查文件大小
            if (file.size > MAX_SIZE) {
                // 压缩图片
                showMessage("图片过大，正在自动压缩...");
                base64 = await this.compressImageToBase64(file, MAX_SIZE);
            } else {
                // 直接读取
                base64 = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        resolve((reader.result as string).split(",")[1]);
                    };
                    reader.readAsDataURL(file);
                });
            }

            // 发送请求
            const result = await runWpsScriptSync({
                url: this.settingdata['wps-pic-url'],
                token: this.settingdata['wps-airscript-token'],
                context: {
                    argv: { pic_data: base64, pic_name: file.name },
                }
            });
            console.log(result);
            if (result.result.startsWith("https")) {
                if (this.protyle) {
                    appendBlock("markdown", `![${file.name}](${result.result})`, this.protyle.block.id);
                }
            } else {
                showMessage("图片发送失败，请重试");
            }
        };
        input.click();
    }

    // 压缩图片到指定大小（2MB以下）
    private async compressImageToBase64(file: File, maxSize: number): Promise<string> {
        return new Promise<string>((resolve) => {
            const img = new Image();
            const reader = new FileReader();
            reader.onload = (e) => {
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext("2d");
                    ctx?.drawImage(img, 0, 0);

                    let quality = 0.92;
                    let base64 = "";
                    do {
                        base64 = canvas.toDataURL("image/jpeg", quality);
                        // 去掉头部
                        const size = Math.ceil((base64.length - base64.indexOf(",") - 1) * 3 / 4);
                        if (size <= maxSize || quality < 0.5) break;
                        quality -= 0.05;
                    } while (true);

                    resolve(base64.split(",")[1]);
                };
                img.src = e.target?.result as string;
            };
            reader.readAsDataURL(file);
        });
    }

    onunload() {
        console.log("M_Wps unloaded");
    }
}
