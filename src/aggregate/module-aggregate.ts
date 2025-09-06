import steveTools from "@/index";

// Aggregate 模块
export class M_Aggregate {
    private plugin: steveTools;
    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    async init(settingdata: any) {
        // 在这里编写初始化逻辑, 可使用 settingdata 访问设置项
        console.log("Aggregate 模块初始化");
        // 示例: 根据设置添加一个顶部按钮
        // this.plugin.addTopBar({
        //   icon: "iconInfo",
        //   title: "Aggregate",
        //   position: "left",
        //   callback: () => { console.log("Aggregate clicked"); }
        // });
    }

    onunload() {
        console.log("M_Aggregate unloaded");
    }
}
