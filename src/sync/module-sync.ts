import steveTools from "@/index";
import * as api from "@/api/api"
import { showMessage } from "siyuan";
declare const siyuan: any;

let url = "";
let token = "";

//TODO: 目前只能单向感知，即只能docker端感知到本地端的变化，不能本地端感知到docker端的变化
export class M_sync {
    private wsMessageHandler?: (e: MessageEvent) => Promise<void>;
    constructor(_plugin: steveTools) {}

    init = async (settingdata) => {
        // steveTools.outlog("同步模块初始化中...");
        // this.settingdata = settingdata;
        url = settingdata["sync-url"];
        token = settingdata["sync-token"];
        // console.debug("url: ", url);
        // console.debug("token: ", token);
        this.wsMessageHandler = async (e: MessageEvent) => {
            const msg = JSON.parse(e.data);
            if (msg.cmd === "syncing") {
                // console.debug(msg);
                if (msg.msg && msg.msg.startsWith('上传')) {
                    console.debug("同步结束");
                    //延时1s再同步
                    const currentHost = window.location.host;
                    if (url.includes(currentHost)) {
                        console.debug("取消感知");
                    } else {
                        setTimeout(async () => {
                            try {
                                let originalIcon = "";
                                const iconElement = document.querySelector('#plugin_siyuan-steve-tools_0 svg use');
                                if (iconElement) {
                                    // 临时改变图标
                                    originalIcon = iconElement.getAttribute('xlink:href');
                                    iconElement.setAttribute('xlink:href', '#iconHistory');
                                }
                                const state = await api.URLsync(url, token);
                                // console.debug("state: ", state);
                                if (state) {
                                    console.debug("docker感知成功");//OK：后面改为图标交互
                                    if (originalIcon) { // 确保 originalIcon 不为空
                                        iconElement.setAttribute('xlink:href', originalIcon);
                                    }
                                } else {
                                    showMessage("docker同步感知失败");
                                }
                            }
                            catch (e) {
                                showMessage("docker感知同步失败: " + e, -1, "error");
                            }
                        }, 1000);
                    }

                }

            }
            // console.debug(msg);
        };
        siyuan.ws.ws.addEventListener('message', this.wsMessageHandler);

        // steveTools.outlog("同步模块初始化完成");
    }

    async testSync() {
        // steveTools.outlog("测试同步...");
        let res: any = await api.testSync(url, token);
        console.debug("res: ", res);
        if (res) {
            showMessage("成功");
        } else {
            showMessage("失败");
        }
    }

    onunload() {
        if (this.wsMessageHandler) {
            try {
                siyuan.ws.ws.removeEventListener('message', this.wsMessageHandler);
            } catch (error) {
                console.warn('移除同步模块 WebSocket 监听失败', error);
            }
            this.wsMessageHandler = undefined;
        }
    }

}