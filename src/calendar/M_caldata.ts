import { PluginConfig } from "@/savedata";

export class M_caldata extends PluginConfig {
    constructor(pluginName: string) {
        super(pluginName, "M_calendar");
    }

    // 重写加载方法，添加日历特定的默认值
    async load(): Promise<void> {
        await super.load(); // 调用父类的 load 方法
        // 设置日历模块的默认值
        if (Object.keys(this.getAll()).length === 0) {
            this.set("viewId", "");
            this.set("viewName", "全部视图");
            await this.save();
        }
    }
    
    // 添加用于处理多视图ID的方法
    getViewIds(): string[] {
        const viewIdStr = this.get("viewId") as string;
        return viewIdStr ? viewIdStr.split(',') : [];
    }
    
    // 设置多视图ID
    setViewIds(ids: string[]): void {
        this.set("viewId", ids.join(','));
    }
    
    // 添加视图ID
    addViewId(id: string): string[] {
        const ids = this.getViewIds();
        if (!ids.includes(id) && id) {
            ids.push(id);
            this.setViewIds(ids);
        }
        return ids;
    }
    
    // 移除视图ID
    removeViewId(id: string): string[] {
        let ids = this.getViewIds();
        ids = ids.filter(item => item !== id);
        this.setViewIds(ids);
        return ids;
    }
    
    // 切换视图ID（如果存在则删除，不存在则添加）
    toggleViewId(id: string): string[] {
        const ids = this.getViewIds();
        console.log("当前视图ID列表:", ids);
        console.log("尝试切换视图ID:", id);
        if (ids.includes(id)) {
            return this.removeViewId(id);
        } else {
            return this.addViewId(id);
        }
    }
    
    // 清除所有视图ID
    clearViewIds(): void {
        this.set("viewId", "");
    }
}