import steveTools from "@/index";

// Memos 模块
export class M_Memos {
    private plugin: steveTools;
    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    async init(settingdata: any) {
        // 在这里编写初始化逻辑, 可使用 settingdata 访问设置项
        console.log("Memos 模块初始化");
        // 示例: 根据设置添加一个顶部按钮
        // this.plugin.addTopBar({
        //   icon: "iconInfo",
        //   title: "Memos",
        //   position: "left",
        //   callback: () => { console.log("Memos clicked"); }
        // });
    }

    onunload() {
        console.log("M_Memos unloaded");
    }
}
