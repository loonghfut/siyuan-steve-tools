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
    public cursorID_b: string;
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
    
    // 压缩单个视频
    private async compressVideo(videoFile: File): Promise<File | null> {
        return new Promise(async (resolve) => {
            try {
                console.log(`原始视频大小: ${(videoFile.size / 1024 / 1024).toFixed(2)} MB`);
                
                // 为大型文件显示警告
                if (videoFile.size > 50 * 1024 * 1024) { // 50MB
                    if (!confirm(`视频文件超过50MB，可能需要较长时间处理。是否继续？`)) {
                        return resolve(null);
                    }
                }
                
                // 简单方式：使用canvas和MediaRecorder直接压缩，而不逐帧处理
                const video = document.createElement('video');
                video.muted = true;
                video.autoplay = true;
                video.playsInline = true;
                video.src = URL.createObjectURL(videoFile);
                
                video.onloadedmetadata = async () => {
                    // 调整视频大小，按比例降低分辨率
                    const originalWidth = video.videoWidth;
                    const originalHeight = video.videoHeight;
                    const maxDimension = 1280;
                    
                    let targetWidth = originalWidth;
                    let targetHeight = originalHeight;
                    
                    if (originalWidth > maxDimension || originalHeight > maxDimension) {
                        if (originalWidth > originalHeight) {
                            targetWidth = maxDimension;
                            targetHeight = Math.floor(originalHeight * (maxDimension / originalWidth));
                        } else {
                            targetHeight = maxDimension;
                            targetWidth = Math.floor(originalWidth * (maxDimension / originalHeight));
                        }
                    }
                    
                    // 创建canvas和视频流
                    const canvas = document.createElement('canvas');
                    canvas.width = targetWidth;
                    canvas.height = targetHeight;
                    const ctx = canvas.getContext('2d');
                    
                    if (!ctx) {
                        console.error('无法创建canvas上下文');
                        return resolve(null);
                    }
                    
                    // 确定支持的编码格式
                    const supportedTypes = [
                        'video/webm;codecs=h264',
                        'video/webm;codecs=vp9',
                        'video/webm;codecs=vp8',
                        'video/webm'
                    ].filter(type => MediaRecorder.isTypeSupported(type));
                    
                    if (supportedTypes.length === 0) {
                        console.error('浏览器不支持所需的视频编码格式');
                        return resolve(null);
                    }
                    
                    // 选择格式和配置压缩率
                    const mimeType = supportedTypes[0];
                    const stream = canvas.captureStream();
                    
                    // 根据分辨率调整比特率
                    let bitrate = 1500000; // 默认 1.5Mbps
                    if (targetWidth >= 1280 || targetHeight >= 720) {
                        bitrate = 2500000; // 720p+ 使用 2.5Mbps
                    }
                    
                    // 创建媒体记录器
                    const mediaRecorder = new MediaRecorder(stream, {
                        mimeType,
                        videoBitsPerSecond: bitrate
                    });
                    
                    // 收集数据
                    const chunks: BlobPart[] = [];
                    mediaRecorder.ondataavailable = (e) => {
                        if (e.data && e.data.size > 0) {
                            chunks.push(e.data);
                        }
                    };
                    
                    // 压缩完成后返回文件
                    mediaRecorder.onstop = () => {
                        video.pause();
                        URL.revokeObjectURL(video.src);
                        
                        const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
                        const compressedFile = new File([blob], videoFile.name, {
                            type: mimeType.split(';')[0]
                        });
                        
                        console.log(`压缩后视频大小: ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB`);
                        resolve(compressedFile);
                    };
                    
                    // 优化：绘制每隔n毫秒
                    const drawInterval = 50; // 每50ms绘制一次，约20fps
                    let isRecording = false;
                    
                    // 使用requestAnimationFrame优化性能
                    const drawFrame = () => {
                        if (!isRecording) return;
                        
                        // 绘制当前视频帧到canvas
                        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
                        
                        // 继续请求下一帧
                        setTimeout(() => {
                            requestAnimationFrame(drawFrame);
                        }, drawInterval);
                    };
                    
                    // 启动压缩处理
                    showMessage(`开始压缩视频，请稍候...`, -1, "info","st-video");
                    video.onplay = () => {
                        mediaRecorder.start(100);
                        isRecording = true;
                        drawFrame();
                        
                        // 监听进度并显示
                        const startTime = Date.now();
                        const duration = video.duration;
                        const progressInterval = setInterval(() => {
                            const progress = (video.currentTime / duration * 100).toFixed(0);
                            
                            // 计算预计剩余时间
                            const elapsedTime = (Date.now() - startTime) / 1000;
                            const processedPercentage = video.currentTime / duration;
                            
                            if (processedPercentage > 0.05) {  
                                const estimatedTotalTime = elapsedTime / processedPercentage;
                                const remainingTime = Math.max(0, estimatedTotalTime - elapsedTime);
                                showMessage(`视频压缩进度: ${progress}% (剩余约${Math.ceil(remainingTime)}秒)`, -1, "info",'st-video');
                            } else {
                                showMessage(`视频压缩进度: ${progress}%`, -1, "info",'st-video');
                            }
                        }, 1000);
                        
                        // 视频结束时停止录制
                        video.onended = () => {
                            isRecording = false;
                            mediaRecorder.stop();
                            clearInterval(progressInterval);
                        };
                    };
                    
                    // 开始播放视频
                    try {
                        await video.play();
                    } catch (error) {
                        console.error('播放视频失败:', error);
                        resolve(null);
                    }
                };
                
                video.onerror = () => {
                    console.error('视频加载失败');
                    URL.revokeObjectURL(video.src);
                    resolve(null);
                };
                
            } catch (error) {
                console.error('视频压缩失败:', error);
                resolve(null);
            }
        });
    }

    async handleSelectionChange() {
        const blockId = getCursorBlockId();
        if (blockId) {
            this.cursorID = blockId;
        }
    }

    // 打开文件选择对话框
    private openFileDialog() {
        if (!this.cursorID) return showMessage("请将光标放在需要插入媒体的位置", -1, "error");
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,video/*'; // 同时接受图片和视频
        input.multiple = true;
        input.onchange = async (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (!files) return;

            const fileArray = Array.from(files);
            let totalSize = 0;
            let totalCompressedSize = 0;

            showMessage(`开始处理 ${fileArray.length} 个文件...`, 3000, "info");

            for (let i = 0; i < fileArray.length; i++) {
                const file = fileArray[i];
                showMessage(`正在处理第 ${i + 1}/${fileArray.length} 个文件...`, -1, "info",'st-file');

                let compressedFile: File | null = null;
                
                // 根据文件类型选择处理方法
                if (file.type.startsWith('image/')) {
                    compressedFile = await this.compressImage(file);
                } else if (file.type.startsWith('video/')) {
                    compressedFile = await this.compressVideo(file);
                }

                if (compressedFile) {
                    totalSize += file.size;
                    totalCompressedSize += compressedFile.size;

                    // 创建带有 "st_" 前缀的新文件
                    const renamedFile = new File([compressedFile], `st_${file.name.replace(/\.[^/.]+$/, "")}.${compressedFile.type.split('/')[1]}`, {
                        type: compressedFile.type
                    });

                    try {
                        if(!this.cursorID) return showMessage("请将光标放在需要插入媒体的位置", -1, "error");
                        
                        // 根据文件类型选择上传目录
                        const uploadDir = file.type.startsWith('image/') ? "assets/st_image" : "assets/st_video";
                        const response = await api.upload(uploadDir, [renamedFile]);
                        
                        if (response.succMap) {
                            // console.log('上传成功:', response.succMap);
                            let mediaId = response.succMap[renamedFile.name].replace("data/", "");
                            
                            // 根据媒体类型选择插入方式
                            if (file.type.startsWith('image/')) {
                                await this.insertMedia(mediaId, false);
                            } else {
                                await this.insertMedia(mediaId, true);
                            }
                        } else {
                            showMessage(`第 ${i + 1} 个文件上传失败`, -1, "error",'st-file');
                        }
                    } catch (error) {
                        console.error('上传失败:', error);
                        showMessage(`第 ${i + 1} 个文件上传失败`, -1, "error",'st-file');
                    }
                }
            }

            // 计算并显示压缩效果总结
            const originalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
            const compressedSizeMB = (totalCompressedSize / 1024 / 1024).toFixed(2);
            const compressionRatio = ((1 - totalCompressedSize / totalSize) * 100).toFixed(1);

            showMessage(`
                压缩完成！
                处理文件：${fileArray.length} 个
                原始大小：${originalSizeMB} MB
                压缩后：${compressedSizeMB} MB
                压缩率：${compressionRatio}%
            `.replace(/\s+/g, ' '), 6000, "info",'st-file');
            showMessage('',1,'info','st-video');
        };
        input.click();
    }

    init() {
        this.plugin.addTopBar({
            icon: "iconImgDown",
            title: "压缩资源",
            position: "right",
            callback: () => {
                this.openFileDialog();
            }
        });
    }

    // 插入媒体到编辑器
    private requestQueue: { mediaId: string, isVideo: boolean, resolve: () => void }[] = [];
    private isProcessing = false;
    private readonly DELAY_TIME = 500; // 500ms delay between each request

    private async processQueue() {
        if (this.isProcessing || this.requestQueue.length === 0) return;

        this.isProcessing = true;
        while (this.requestQueue.length > 0) {
            const item = this.requestQueue.shift();
            if (!item) continue;

            if (this.M_image_protyle) {
                let markdown = '';
                
                // 根据媒体类型构建不同的Markdown
                if (item.isVideo) {
                    markdown = `<video controls src="${item.mediaId}"></video>`;
                } else {
                    markdown = `![](${item.mediaId})`;
                }

                console.log("插入媒体", this.cursorID);
                if (this.cursorID) {
                    await api.appendBlock("markdown", markdown, this.cursorID);
                } else {
                    showMessage("请将光标放在需要插入媒体的位置", -1, "error");
                }
                console.log("插入媒体", item.mediaId);
                item.resolve();
                await new Promise(resolve => setTimeout(resolve, this.DELAY_TIME));
            }
        }
        this.isProcessing = false;
    }

    private async insertMedia(mediaId: string, isVideo: boolean = false) {
        return new Promise<void>((resolve) => {
            this.requestQueue.push({ mediaId, isVideo, resolve });
            this.processQueue();
        });
    }

    onLayoutReady() {
        this.plugin.eventBus.on("click-editorcontent", this.handleSelectionChange.bind(this));
        this.plugin.eventBus.on("switch-protyle", async (event) => {
            this.M_image_protyle = event.detail.protyle;
            this.cursorID_b = event.detail.protyle.block.id;
            this.cursorID = this.cursorID_b;
            console.log("switch-image-protyle");
        });
    }
}

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
        // console.log(blockElement.getAttribute('data-node-id'));
        return blockElement.getAttribute('data-node-id');
    } else {
        return null;
    }
}