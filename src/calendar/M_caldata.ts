import { PluginConfig } from "@/savedata";

export class M_caldata extends PluginConfig {
    constructor(pluginName: string) {
        super(pluginName, "M_calendar");
    }

    //   重写加载方法，添加日历特定的默认值
    async load(): Promise<void> {
        await super.load(); // 调用父类的 load 方法
        // 设置日历模块的默认值
        if (Object.keys(this.getAll()).length === 0) {
            this.set("viewId", "");
            this.set("viewName", "全部视图");
            await this.save();
        }
    }
}