import { getFileBlob } from "@/api";
import { showMessage } from "siyuan";
import { calendarpath } from "../module-calendar";

export class ics_alist {
    private alist;
    private findAlistPlugin() {
        const plugins = (window as any).siyuan?.ws?.app?.plugins || [];
        const alistPlugin = plugins.find(
            (plugin: any) => plugin.displayName === 'Alist附件管理'
        );
        return alistPlugin || null;
    }

    init() {
        const plugin = this.findAlistPlugin();
        if (plugin) {
            console.log("找到Alist插件实例");
            this.alist = plugin;
        } else {
            console.warn("未找到Alist插件实例");
            this.alist = null;
        }
    }
    async upload_ics() {
        if (!this.alist) {
            showMessage("未找到Alist插件实例,请先安装alist附件管理插件", -1, "error");
            return;
        }
        //获取ics文件
        const ics = await getFileBlob(calendarpath)
        // console.log(ics);
        //上传ics文件
        ////包装成File对象
        const file = new File([ics], "calendar.ics", { type: "text/calendar" });
        // console.log(this.alist.constructor.handleFileUploadwithoutlink)
        await this.alist.constructor.handleFileUploadwithoutlink(file);
        // console.log(result);
    }
}