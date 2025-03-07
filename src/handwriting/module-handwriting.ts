import * as ic from "@/icon"
import { openTab, Plugin } from "siyuan";
import { WhiteboardUI } from './hw_fun/UI';
import './handwriting.css';


let editorId: string = 'default';

export class M_handwriting {
    private plugin: Plugin;
    private whiteboardInstances: Map<string, WhiteboardUI> = new Map();
    private pluginPathPrefix: string = '/data/plugins/siyuan-steve-tools/';

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    async init(settingdata) {
        // 添加图标
        this.plugin.addIcons(`
            <symbol id="iconSTWhiteboard" viewBox="0 0 500 500">
               ${ic.steveTools_whiteboard}
            </symbol>  
        `);
        this.addToolbarButton();
        // 添加样式
        this.addStyles();
    }

    async onLayoutReady(settingdata) {
        // 添加工具栏按钮


        // 添加命令
        this.addCommands();
    }

    private addStyles() {
        // 可以在此添加额外的样式
    }

    private addToolbarButton() {
        // 添加编辑器工具栏按钮
        this.plugin.addTopBar({
            icon: "iconSTWhiteboard",
            title: "画板",
            position: "right",
            callback: () => {
                this.toggleWhiteboard();
            }
        });
    }

    private addCommands() {
        // 添加命令
        this.plugin.addCommand({
            langKey: "ST_whiteboard",
            langText: "打开/关闭画板",
            hotkey: "",
            callback: () => {
                this.toggleWhiteboard();
            }
        });

        // 添加快捷键命令
        this.plugin.addCommand({
            langKey: "ST_whiteboard_save",
            langText: "保存画板内容",
            hotkey: "mod+shift+s",
            callback: () => {
                this.saveWhiteboard();
            }
        });
    }

    private async toggleWhiteboard () {
        // 创建画板容器
        const id = new Date().getTime().toString();
        const tab = await openTab({
            app: window.siyuan.ws.app,
            custom: {
                icon: "iconSTWhiteboard",
                title: `画板`,
                id: this.plugin.name + 'whiteboard',
            },
            // position: "right",
            keepCursor: false
        });
        tab.panelElement.innerHTML = `
        <div  id='whiteboard-${id}' ><div id='whiteboard-${id}' ></div></div>`;
        const container = document.getElementById(`whiteboard-${id}`);
        editorId = id;
        // 创建画板UI
        const whiteboardUI = new WhiteboardUI(container);
        this.whiteboardInstances.set(editorId, whiteboardUI);
    }

    private closeWhiteboard(editorId: string) {
        const whiteboard = this.whiteboardInstances.get(editorId);
        if (whiteboard) {
            whiteboard.destroy();
            this.whiteboardInstances.delete(editorId);
        }
    }

    private saveWhiteboard() {
        // 获取当前编辑器
        const activeEditor = this.getActiveEditor();
        if (!activeEditor) return;

        const editorId = activeEditor.getAttribute('data-node-id') || 'default';
        const whiteboard = this.whiteboardInstances.get(editorId);

        if (whiteboard) {
            // 这里可以实现保存功能，例如将图片插入到笔记中
            // 这需要调用思源的API来实现
        }
    }

    private getActiveEditor(): HTMLElement | null {
        return document.querySelector('.protyle-wysiwyg.protyle-wysiwyg--attr');
    }
}