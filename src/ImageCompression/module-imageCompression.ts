import steveTools from "@/index";
import * as api from "@/api"
import { IProtyle, showMessage } from "siyuan";
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
    
            const fileArray = Array.from(files);
            let totalSize = 0;
            let totalCompressedSize = 0;
            
            showMessage(`开始处理 ${fileArray.length} 张图片...`,-1,"info","image_upload");
    
            for (let i = 0; i < fileArray.length; i++) {
                const file = fileArray[i];
                showMessage(`正在处理第 ${i + 1}/${fileArray.length} 张图片...`,-1,"info","image_upload");
                
                const compressedFile = await this.compressImage(file);
                if (compressedFile) {
                    totalSize += file.size;
                    totalCompressedSize += compressedFile.size;
                    
                    try {
                        const response = await api.upload("assets/st_image", [compressedFile]);
                        if (response.succMap) {
                            let imageId = response.succMap["blob"].replace("data/","");
                            await this.insertImage(imageId);
                        } else {
                            showMessage(`第 ${i + 1} 张图片上传失败`,-1,"error");
                        }
                    } catch (error) {
                        console.error('上传失败:', error);
                        showMessage(`第 ${i + 1} 张图片上传失败`,-1,"error");
                    }
                }
            }
    
            // 计算并显示压缩效果总结
            const originalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
            const compressedSizeMB = (totalCompressedSize / 1024 / 1024).toFixed(2);
            const compressionRatio = ((1 - totalCompressedSize / totalSize) * 100).toFixed(1);
            
            showMessage(`
                压缩完成！
                处理图片：${fileArray.length} 张
                原始大小：${originalSizeMB} MB
                压缩后：${compressedSizeMB} MB
                压缩率：${compressionRatio}%
            `.replace(/\s+/g, ' '),-1,"info","image_upload");
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
    private async insertImage(imageId: string) {
        if (this.M_image_protyle) {
            const imgMd = `![](${imageId})`;
            this.M_image_protyle.getInstance().insert(imgMd, true, true);
        }
    }



    onLayoutReady(){
        this.plugin.eventBus.on("switch-protyle", async (event) => {
            this.M_image_protyle = event.detail.protyle;
            console.log("switch-image-protyle");
        });
    }
}