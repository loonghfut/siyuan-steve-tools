import steveTools from "@/index";

// Wucai 模块
export class M_Wucai {
    private plugin: steveTools;
    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    async init(settingdata: any) {
        // 在这里编写初始化逻辑, 可使用 settingdata 访问设置项
        console.log("Wucai 模块初始化");
        // 示例: 根据设置添加一个顶部按钮
        // this.plugin.addTopBar({
        //   icon: "iconInfo",
        //   title: "Wucai",
        //   position: "left",
        //   callback: () => { console.log("Wucai clicked"); }
        // });
    }

    onunload() {
        console.log("M_Wucai unloaded");
    }
}
