import { getFile, putFile } from "./api/api";


export class PluginConfig {
    //记得load一下
    private configPath: string;
    private config: { [key: string]: any };
    private saveQueue: Promise<void> = Promise.resolve();

    constructor(pluginName: string, M_name: string) {
        this.configPath = `/data/storage/petal/${pluginName}/${M_name}/config.json`;
        this.config = {};
    }

    /**
     * 加载配置文件
     */
    async load(): Promise<void> {
        try {
            const configData = await getFile(this.configPath);
            // console.debug("::::", configData);
            if (configData) {
                this.config = configData;
            } else {
                // 如果配置文件不存在，保存默认配置
                console.warn("配置文件不存在");
                this.config = {};
            }
        } catch (error) {
            console.warn("配置文件加载失败", error);
            this.config = {};
        }
    }

    /**
     * 保存配置到文件
     */
    save(): Promise<void> {
        // Capture a snapshot at call time and serialize writes. Reloading after an
        // un-awaited save used to race with subsequent edits and could overwrite them.
        const configString = JSON.stringify(this.config, null, 2);
        const write = this.saveQueue.then(async () => {
            try {
                const blob = new Blob([configString], { type: 'application/json' });
                await putFile(this.configPath, false, blob);
                console.debug("配置文件保存成功:", this.configPath);
            } catch (error) {
                console.error("保存配置文件失败:", error);
                throw error;
            }
        });
        this.saveQueue = write.catch(() => undefined);
        return write;
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
