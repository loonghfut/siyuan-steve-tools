import { showMessage } from "siyuan";
import { createClient, WebDAVClient } from "webdav";

export class WebDAVSync {
    private webdavClient: WebDAVClient;
    private serverUrl: string;
    private username: string;
    private password: string;
    private remotePath: string;

    constructor({
        serverUrl,
        username,
        password,
        remotePath
    }: {
        serverUrl?: string;
        username?: string;
        password?: string;
        remotePath?: string;
    }) {
        this.serverUrl = serverUrl || "";
        this.username = username || "";
        this.password = password || "";
        this.remotePath = remotePath || "";
    }

    /**
     * 初始化 WebDAV 客户端
     */
    async init(): Promise<void> {
        if (!this.serverUrl) {
            showMessage("WebDAV 初始化失败: 请提供服务器地址", -1, "error");
            return;
        }

        try {
            this.webdavClient = createClient(this.serverUrl, {
                username: this.username,
                password: this.password,
                maxBodyLength: 1024 * 1024 * 10, // 10 MB
                maxContentLength: 1024 * 1024 * 10
            });

            // 尝试创建远程目录路径
            await this.ensureDirectoryExists();
        } catch (error) {
            console.error("WebDAV 初始化失败:", error);
            showMessage(`WebDAV 初始化失败: ${error.message}`, -1, "error");
        }
    }

    /**
     * 确保远程目录存在
     */
    private async ensureDirectoryExists(): Promise<void> {
        if (!this.remotePath || this.remotePath === "/") return;
        
        try {
            // 分割路径，依次创建目录
            const paths = this.remotePath.split("/").filter(p => p);
            let currentPath = "/";
            
            for (const path of paths) {
                currentPath += path + "/";
                try {
                    // 检查目录是否存在
                    await this.webdavClient.stat(currentPath);
                } catch (e) {
                    // 如果目录不存在，创建目录
                    try {
                        await this.webdavClient.createDirectory(currentPath);
                    } catch (createError) {
                        console.warn(`无法创建目录 ${currentPath}:`, createError);
                    }
                }
            }
        } catch (error) {
            console.error("创建目录结构失败:", error);
            throw new Error(`确保目录存在失败: ${error.message}`);
        }
    }

    /**
     * 测试 WebDAV 连接
     */
    async testConnection(): Promise<boolean> {
        if (!this.webdavClient) {
            showMessage("WebDAV 客户端未初始化", -1, "error");
            return false;
        }

        try {
            // 尝试检查根目录的状态
            await this.webdavClient.stat("/");
            return true;
        } catch (error) {
            console.error("WebDAV 连接测试失败:", error);
            showMessage(`WebDAV 连接测试失败: ${error.message}`, -1, "error");
            return false;
        }
    }

    /**
     * 上传文件到 WebDAV 服务器
     * @param path 文件路径（相对于远程路径）
     * @param content 文件内容（字符串或二进制数据）
     */
    async uploadFile(path: string, content: string | Blob): Promise<void> {
        if (!this.webdavClient) {
            throw new Error('WebDAV 客户端未初始化');
        }

        try {
            let body: Buffer | string | Blob | ArrayBuffer;

            if (content instanceof Blob) {
                // 将 Blob 转换为 ArrayBuffer
                body = await content.arrayBuffer();
            } else if (typeof content === 'string') {
                body = content;
            } else {
                throw new Error('不支持的内容类型');
            }

            // 构建完整路径
            const fullPath = this.remotePath.endsWith('/') ? 
                this.remotePath + path : 
                `${this.remotePath}/${path}`;

            // 上传文件
            await this.webdavClient.putFileContents(fullPath, body, {
                contentLength: content instanceof Blob ? content.size : undefined,
                overwrite: true,
                onUploadProgress: (progressEvent) => {
                    // 可以在这里添加上传进度处理
                    console.debug(`上传进度: ${progressEvent.loaded}/${progressEvent.total}`);
                }
            });

            console.debug(`WebDAV 上传文件成功: ${fullPath}`);
            // showMessage(`WebDAV 上传文件成功: ${fullPath}`, 3000, 'info');
        } catch (error) {
            console.error('WebDAV 上传错误详情:', error);
            showMessage(`WebDAV 上传文件失败: ${error.message}`, -1, 'error');
            throw new Error(`WebDAV 上传文件失败: ${error.message}`);
        }
    }

    /**
     * 从 WebDAV 服务器下载文件
     * @param path 文件路径（相对于远程路径）
     * @returns 文件内容
     */
    async downloadFile(path: string): Promise<string> {
        if (!this.webdavClient) {
            throw new Error('WebDAV 客户端未初始化');
        }

        try {
            // 构建完整路径
            const fullPath = this.remotePath.endsWith('/') ? 
                this.remotePath + path : 
                `${this.remotePath}/${path}`;

            // 下载文件内容
            const content = await this.webdavClient.getFileContents(fullPath, { format: "text" });
            return content as string;
        } catch (error) {
            console.error('WebDAV 下载错误详情:', error);
            throw new Error(`下载文件失败: ${error.message}`);
        }
    }
}
