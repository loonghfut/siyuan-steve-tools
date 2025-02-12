import { getFile, putFile } from "./api";

export class PluginConfig {
    private configPath: string;
    private config: { [key: string]: any };

    constructor(pluginName: string,M_name:string) {
        this.configPath = `/data/storage/petal/${pluginName}/${M_name}/config.json`;
        this.config = {};
    }

    /**
     * 加载配置文件
     */
    async load(): Promise<void> {
        try {
            const configData = await getFile(this.configPath);
            // console.log("::::",configData);
            if (configData) {
                this.config = configData;
            } else {
                // 如果配置文件不存在，保存默认配置
                console.warn("配置文件不存在，将创建并保存默认配置");
                await this.save();
            }
        } catch (error) {
            console.warn("配置文件加载失败，将创建并保存默认配置", error);
            await this.save();
        }
    }

    /**
     * 保存配置到文件
     */
    async save(): Promise<void> {
        try {
            const configString = JSON.stringify(this.config, null, 2);
            const blob = new Blob([configString], { type: 'application/json' });
            await putFile(this.configPath, false, blob);
        } catch (error) {
            console.error("保存配置文件失败:", error);
            throw error;
        }
    }

    /**
     * 获取配置项
     * @param key 配置键
     * @param defaultValue 默认值
     */
    get<T>(key: string, defaultValue?: T): T {
        return this.config[key] ?? defaultValue;
    }

    /**
     * 设置配置项
     * @param key 配置键
     * @param value 配置值
     */
    set(key: string, value: any): void {
        this.config[key] = value;
    }

    /**
     * 删除配置项
     * @param key 配置键
     */
    delete(key: string): void {
        delete this.config[key];
    }

    /**
     * 获取所有配置
     */
    getAll(): { [key: string]: any } {
        return { ...this.config };
    }

    /**
     * 重置所有配置
     * @param config 新的配置对象
     */
    async reset(config: { [key: string]: any } = {}): Promise<void> {
        this.config = { ...config };
        await this.save();
    }
}