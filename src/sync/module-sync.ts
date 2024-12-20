import steveTools from "@/index";
import * as api from "@/api"
import { showMessage } from "siyuan";
declare const siyuan: any;

let url = "";
let token = "";

//TODO: 目前只能单向感知，即只能docker端感知到本地端的变化，不能本地端感知到docker端的变化
export class M_sync {
    private plugin: steveTools;
    constructor(plugin: steveTools) {
        this.plugin = plugin;
    }

    init = async (settingdata) => {
        this.plugin.outlog("同步模块初始化中...");
        // this.settingdata = settingdata;
        url = settingdata["sync-url"];
        token = settingdata["sync-token"];
        // console.log("url: ", url);
        // console.log("token: ", token);
        siyuan.ws.ws.addEventListener('message', async (e) => {
            const msg = JSON.parse(e.data);
            if (msg.cmd === "syncing") {
                // console.log(msg);
                if (msg.msg && msg.msg.startsWith('上传')) {
                    console.log("同步结束");
                    //延时1s再同步
                    setTimeout(async () => {
                        const state = await api.URLsync(url, token);
                        // console.log("state: ", state);
                        if (state) {
                            console.log("docker感知成功");
                        } else {
                            showMessage("docker同步感知失败");
                        }
                    }, 1000);

                }

            }
            // console.log(msg);
        });

        this.plugin.outlog("同步模块初始化完成");
    }

    async testSync() {
        steveTools.prototype.outlog("测试同步...");
        let res: any = await api.testSync(url, token);
        console.log("res: ", res);
        if (res) {
            showMessage("成功");
        } else {
            showMessage("失败");
        }
    }

}