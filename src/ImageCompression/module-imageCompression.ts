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
    public cursorID: string;
    public M_image_protyle: IProtyle;

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

    async handleSelectionChange() {
        const blockId = getCursorBlockId();
        if (blockId) {
            // showMessage(`光标所在的块ID: ${blockId}`);
            this.cursorID = blockId;
            console.log("光标所在的块ID", this.cursorID);
        }
    }

    // 打开文件选择对话框
    private openFileDialog() {
        if (!this.cursorID) return showMessage("请将光标放在需要插入图片的位置", -1, "error");
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

            showMessage(`开始处理 ${fileArray.length} 张图片...`, -1, "info", "image_upload");

            for (let i = 0; i < fileArray.length; i++) {
                const file = fileArray[i];
                showMessage(`正在处理第 ${i + 1}/${fileArray.length} 张图片...`, -1, "info", "image_upload");

                const compressedFile = await this.compressImage(file);
                if (compressedFile) {
                    totalSize += file.size;
                    totalCompressedSize += compressedFile.size;

                    // Create a new File with "st_" prefix
                    const renamedFile = new File([compressedFile], `st_${file.name}`, {
                        type: compressedFile.type
                    });

                    try {
                        const response = await api.upload("assets/st_image", [renamedFile]);
                        if (response.succMap) {
                            // console.log('上传成功:', response.succMap);
                            let imageId = response.succMap[renamedFile.name].replace("data/", "");
                            await this.insertImage(imageId);
                        } else {
                            showMessage(`第 ${i + 1} 张图片上传失败`, -1, "error");
                        }
                    } catch (error) {
                        console.error('上传失败:', error);
                        showMessage(`第 ${i + 1} 张图片上传失败`, -1, "error");
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
            `.replace(/\s+/g, ' '), -1, "info", "image_upload");
        };
        input.click();
    }

    init() {
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
    private requestQueue: { imageId: string, resolve: () => void }[] = [];
    private isProcessing = false;
    private readonly DELAY_TIME = 1000; // 500ms delay between each request

    private async processQueue() {
        if (this.isProcessing || this.requestQueue.length === 0) return;

        this.isProcessing = true;
        while (this.requestQueue.length > 0) {
            const item = this.requestQueue.shift();
            if (!item) continue;

            if (this.M_image_protyle) {
                const imgMd = `![](${item.imageId})`;

                // this.M_image_protyle.getInstance().insert(imgMd, true, true);
                console.log("插入图片", this.cursorID);
                if (this.cursorID) {
                    api.appendBlock("markdown", imgMd, this.cursorID);
                } else {
                    showMessage("请将光标放在需要插入图片的位置", -1, "error");
                }
                console.log("插入图片", item.imageId);
                item.resolve();
                await new Promise(resolve => setTimeout(resolve, this.DELAY_TIME));
            }
        }
        this.isProcessing = false;
    }

    private async insertImage(imageId: string) {
        return new Promise<void>((resolve) => {
            this.requestQueue.push({ imageId, resolve });
            this.processQueue();
        });
    }



    onLayoutReady() {
        this.plugin.eventBus.on("click-editorcontent", this.handleSelectionChange.bind(this));
        this.plugin.eventBus.on("switch-protyle", async (event) => {
            this.M_image_protyle = event.detail.protyle;
            console.log("switch-image-protyle");
        });
    }
}

// export function getCursorElement() {
//     const selection = window.getSelection();
//     if (selection.rangeCount > 0) {
//         const range = selection.getRangeAt(0);
//         // 获取光标所在的元素
//         const cursorElement = getCursorElementRecursive(range.startContainer);
//         return cursorElement;
//     }
//     return null;
// }
// function getCursorElementRecursive(node) {
//     if (node.nodeType === Node.TEXT_NODE) {
//         // 如果是文本节点，返回其父元素节点
//         return node.parentElement;
//     } else {
//         // 如果是元素节点，直接返回
//         return node;
//     }
// }

// //获取光标位置id
// let cursorElementId = getCursorElement()?.closest('[data-type]')?.getAttribute('data-node-id');
// let cursorElement = getCursorElement();
// if (cursorElement?.closest('.li')) {
//     cursorElementId = cursorElement.closest('.li').getAttribute('data-node-id');
//     console.log("c", cursorElementId);
// }
// console.log("cursorElement", cursorElementId);
// const cursorID = cursorElementId;
// //获取光标位置id

export function getCursorBlockId() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;

    const range = selection.getRangeAt(0);
    let container = range.startContainer;

    // 如果 startContainer 是文本节点，则获取其父元素
    if (container.nodeType === Node.TEXT_NODE) {
        container = container.parentElement;
    }

    // 确保 container 是一个元素节点
    if (!(container instanceof Element)) {
        return null;
    }

    const blockElement = container.closest('.protyle-wysiwyg [data-node-id]');

    if (blockElement) {
        console.log(blockElement.getAttribute('data-node-id'));
        return blockElement.getAttribute('data-node-id');
    } else {
        return null;
    }
}