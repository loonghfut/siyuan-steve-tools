import steveTools from "@/index";
import * as api from "@/api"
import { IProtyle, Protyle, showMessage } from "siyuan";
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
            maxSizeMB: 1,          
            maxWidthOrHeight: 1920, 
            useWebWorker: true      
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



    // 打开文件选择对话框
    private openFileDialog() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.onchange = async (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (!files) return;

            for (const file of Array.from(files)) {
                const compressedFile = await this.compressImage(file);
                if (compressedFile) {
                    try {
                        const response = await api.upload("assets/st_image", [compressedFile]);
                        if (response.succMap) {
                           console.log(response);
                            let imageId = response.succMap["blob"];
                            //去掉imageId的data/前缀
                            imageId = imageId.replace("data/","")
                            console.log(imageId);
                            this.insertImage(imageId);
                            showMessage("图片上传成功");
                        } else {
                            showMessage("图片上传失败");
                        }
                    } catch (error) {
                        console.error('上传失败:', error);
                        showMessage('图片上传失败');
                    }
                }
            }
        };
        input.click();
    }

    init(){
        // this.plugin.addIcons(`
        // <symbol id="iconImage" viewBox="0 0 512 512">
            
        // </symbol>
        // `);
        this.plugin.addTopBar({
            icon: "iconImgDown",
            title: "图片压缩",
            position: "right",
            callback: () => {
                this.openFileDialog();
            }
        });

    }

    // 插入图片到编辑器
    private insertImage(imageId: string) {
        if (this.M_image_protyle) {
            const imgMd = `![](${imageId})`;
            this.M_image_protyle.getInstance().insert(imgMd);
        }
    }



    onLayoutReady(){
        this.plugin.eventBus.on("switch-protyle", async (event) => {
            this.M_image_protyle = event.detail.protyle;
            console.log("switch-image-protyle");
        });
    }
}