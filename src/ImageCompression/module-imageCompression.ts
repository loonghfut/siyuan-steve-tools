import steveTools from "@/index";
import * as api from "@/api"
import { IProtyle, Protyle, showMessage } from "siyuan";
// import * as ic from "@/icon"
import imageCompression from 'browser-image-compression';
declare const siyuan: any;

export class M_imageCompression {
    private plugin: steveTools;
    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    public M_image_protyle:IProtyle;
    // 压缩单个图片
    private async compressImage(imageFile: File) {
        const options = {
            maxSizeMB: 1,          // 最大文件大小
            maxWidthOrHeight: 1920, // 最大宽度/高度
            useWebWorker: true      // 使用 Web Worker 加速
        };
        
        try {
            console.log(`原始图片大小: ${(imageFile.size / 1024 / 1024).toFixed(2)} MB`);
            const compressedFile = await imageCompression(imageFile, options);
            console.log(`压缩后图片大小: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);
            return compressedFile;
        } catch (error) {
            console.error('压缩图片失败:', error);
            return null;
        }
    }

    init(){
    }

    onLayoutReady(){
        this.plugin.eventBus.on("switch-protyle", async (event) => {
            this.M_image_protyle = event.detail.protyle;
            console.log("switch-image-protyle");
        });
    }

}