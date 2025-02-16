import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsCommand } from "@aws-sdk/client-s3";
import { showMessage } from "siyuan";

export class ics_s3 {
    private s3Client: S3Client;
    private bucket: string;
    private region: string;
    private accessKeyId: string;
    private secretAccessKey: string;
    private endpoint: string;

    constructor({
        region,
        accessKeyId,
        secretAccessKey,
        bucket
    }: {
        region?: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        bucket?: string;
    }) {
        this.region = region || "";
        this.accessKeyId = accessKeyId || "";
        this.secretAccessKey = secretAccessKey || "";
        this.bucket = bucket || "";
        this.endpoint = "";
    }

    load_date_from_siyuan() {
        this.region = window.siyuan.config.sync.s3?.region;
        this.accessKeyId = window.siyuan.config.sync.s3?.accessKey;
        this.secretAccessKey = window.siyuan.config.sync.s3?.secretKey;
        this.bucket = window.siyuan.config.sync.s3?.bucket;
        this.endpoint = window.siyuan.config.sync.s3?.endpoint;
        console.log(this.region, this.accessKeyId, this.secretAccessKey, this.bucket);
    }

    async init(): Promise<void> {
        if (!this.region || !this.accessKeyId || !this.secretAccessKey || !this.bucket || !this.endpoint) {
            showMessage("ST_s3初始化失败: 请提供 region, accessKeyId, secretAccessKey, bucket", -1, "error");
            return;
        }
        try {
            this.s3Client = new S3Client({
                region: this.region,
                credentials: {
                    accessKeyId: this.accessKeyId,
                    secretAccessKey: this.secretAccessKey
                },
                endpoint: this.endpoint,
                forcePathStyle: true // 添加这个配置以支持自定义 endpoint
            });
        } catch (error) {
            showMessage(`ST_s3初始化失败: ${error.message}`, -1, "error");
        }

    }

    async testConnection(): Promise<boolean> {
        if (!this.s3Client) {
            showMessage("S3 客户端未初始化", -1, "error");
            return false;
        }

        try {
            // 尝试列出存储桶中的对象
            const command = new ListObjectsCommand({
                Bucket: this.bucket,
                MaxKeys: 1
            });
            await this.s3Client.send(command);
            showMessage("S3 连接测试成功", -1, "info");
            return true;
        } catch (error) {
            console.error("S3 连接测试失败:", error);
            showMessage(`S3 连接测试失败: ${error.message}`, -1, "error");
            return false;
        }
    }

    async uploadFile(key: string, content: string | Blob): Promise<void> {
        if (!this.s3Client) {
            throw new Error('S3 客户端未初始化');
        }

        let body: Buffer | string | Blob;
        let contentType = 'text/plain';

        try {
            if (content instanceof Blob) {
                // 将 Blob 转换为 ArrayBuffer 再转换为 Buffer
                const arrayBuffer = await content.arrayBuffer();
                body = Buffer.from(arrayBuffer);
                contentType = content.type || 'application/octet-stream';
            } else if (typeof content === 'string') {
                body = content;
            } else {
                throw new Error('不支持的内容类型');
            }

            const command = new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: body,
                ContentType: contentType
            });

            await this.s3Client.send(command);
            console.log(`上传文件成功: ${key}`);
        } catch (error) {
            console.error('上传错误详情:', error);
            throw new Error(`上传文件失败: ${error.message}`);
        }
    }


    async downloadFile(key: string): Promise<string> {
        const command = new GetObjectCommand({
            Bucket: this.bucket,
            Key: key
        });

        try {
            const response = await this.s3Client.send(command);
            const content = await response.Body.transformToString();
            return content;
        } catch (error) {
            throw new Error(`下载文件失败: ${error.message}`);
        }
    }
}