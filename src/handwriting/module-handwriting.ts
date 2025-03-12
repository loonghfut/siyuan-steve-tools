import * as ic from "@/icon"
import { openTab, Plugin, showMessage } from "siyuan";
import './handwriting.css';
import Drawflow from 'drawflow';

export class M_handwriting {
    private plugin: Plugin;
    private drawflowInstances: Map<string, Drawflow> = new Map();
    private activeToolButtons: Map<string, HTMLElement> = new Map();

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    async init(settingdata) {
        // 添加图标
        this.plugin.addIcons(`
            <symbol id="iconSTWhiteboard" viewBox="0 0 500 500">
               ${ic.steveTools_whiteboard}
            </symbol>  
            <symbol id="iconSelect" viewBox="0 0 1024 1024">
                <path d="M864 0h-704c-52.8 0-96 43.2-96 96v832c0 52.8 43.2 96 96 96h704c52.8 0 96-43.2 96-96v-832c0-52.8-43.2-96-96-96zM832 896h-640v-768h640v768z"/>
            </symbol>
            <symbol id="iconRect" viewBox="0 0 1024 1024">
                <path d="M928 128h-832c-52.8 0-96 43.2-96 96v576c0 52.8 43.2 96 96 96h832c52.8 0 96-43.2 96-96v-576c0-52.8-43.2-96-96-96z"/>
            </symbol>
            <symbol id="iconCircle" viewBox="0 0 1024 1024">
                <path d="M512 0c-282.8 0-512 229.2-512 512s229.2 512 512 512 512-229.2 512-512-229.2-512-512-512z"/>
            </symbol>
            <symbol id="iconLine" viewBox="0 0 1024 1024">
                <path d="M904 120l-784 784c-15.6 15.6-15.6 40.8 0 56.4 15.6 15.6 40.8 15.6 56.4 0l784-784c15.6-15.6 15.6-40.8 0-56.4-15.6-15.6-40.8-15.6-56.4 0z"/>
            </symbol>
            <symbol id="iconText" viewBox="0 0 1024 1024">
                <path d="M896 64h-768c-52.8 0-96 43.2-96 96v704c0 52.8 43.2 96 96 96h768c52.8 0 96-43.2 96-96v-704c0-52.8-43.2-96-96-96zM896 864h-768v-704h768v704z"/>
                <path d="M448 256h128v512h-128z"/>
                <path d="M256 448h512v128h-512z"/>
            </symbol>
            <symbol id="iconClear" viewBox="0 0 1024 1024">
                <path d="M512 0c-282.8 0-512 229.2-512 512s229.2 512 512 512 512-229.2 512-512-229.2-512-512-512zM768 682.4l-85.6 85.6-170.4-170.4-170.4 170.4-85.6-85.6 170.4-170.4-170.4-170.4 85.6-85.6 170.4 170.4 170.4-170.4 85.6 85.6-170.4 170.4 170.4 170.4z"/>
            </symbol>
            <symbol id="iconZoomIn" viewBox="0 0 1024 1024">
                <path d="M512 0c-282.8 0-512 229.2-512 512s229.2 512 512 512 512-229.2 512-512-229.2-512-512-512zM800 544h-256v256h-64v-256h-256v-64h256v-256h64v256h256v64z"/>
            </symbol>
            <symbol id="iconZoomOut" viewBox="0 0 1024 1024">
                <path d="M512 0c-282.8 0-512 229.2-512 512s229.2 512 512 512 512-229.2 512-512-229.2-512-512-512zM800 544h-576v-64h576v64z"/>
            </symbol>
            <symbol id="iconSave" viewBox="0 0 1024 1024">
                <path d="M896 0h-896v1024h1024v-896l-128-128zM512 64h128v256h-128v-256zM896 896h-768v-768h64v320h576v-320h14.6l113.4 113.4v654.6z"/>
            </symbol>
        `);

        // 添加顶栏按钮
        this.plugin.addTopBar({
            icon: "iconSTWhiteboard",
            title: "画板",
            position: "right",
            callback: () => {
                this.openWhiteBoard();
            }
        });
    }

    async onLayoutReady(settingdata) {
        // 可以在这里初始化任何需要DOM加载完成后的逻辑
    }

    private async openWhiteBoard() {
        const id = new Date().getTime().toString();
        const whiteBoardTab = await openTab({
            app: this.plugin.app,
            custom: {
                id: "steveTool-whiteboard-" + id,
                title: "无限画板",
                icon: "iconSTWhiteboard",
                data: {
                    text: "steveTool-whiteboard"
                },
            }
        });

        whiteBoardTab.panelElement.innerHTML = `
        <div id='steveTool-whiteboard-${id}' style="width: 100%; height: 100%;">
            <div class="drawflow-toolbar">
                <button class="toolbar-btn" data-tool="select" title="选择">
                    <svg class="icon"><use xlink:href="#iconSelect"></use></svg>
                </button>
                <button class="toolbar-btn" data-tool="rect" title="矩形">
                    <svg class="icon"><use xlink:href="#iconRect"></use></svg>
                </button>
                <button class="toolbar-btn" data-tool="circle" title="圆形">
                    <svg class="icon"><use xlink:href="#iconCircle"></use></svg>
                </button>
                <button class="toolbar-btn" data-tool="line" title="连接线">
                    <svg class="icon"><use xlink:href="#iconLine"></use></svg>
                </button>
                <button class="toolbar-btn" data-tool="text" title="文本">
                    <svg class="icon"><use xlink:href="#iconText"></use></svg>
                </button>
                <div style="flex-grow: 1;"></div>
                <button class="toolbar-btn" data-tool="zoomIn" title="放大">
                    <svg class="icon"><use xlink:href="#iconZoomIn"></use></svg>
                </button>
                <button class="toolbar-btn" data-tool="zoomOut" title="缩小">
                    <svg class="icon"><use xlink:href="#iconZoomOut"></use></svg>
                </button>
                <button class="toolbar-btn" data-tool="save" title="保存">
                    <svg class="icon"><use xlink:href="#iconSave"></use></svg>
                </button>
                <button class="toolbar-btn" data-tool="clear" title="清空">
                    <svg class="icon"><use xlink:href="#iconClear"></use></svg>
                </button>
            </div>
            <div id='drawflow-${id}' class="drawflow-canvas" style="width: 100%; height: calc(100% - 40px);"></div>
        </div>`;
        
        // 初始化 Drawflow
        const drawflowEl = document.getElementById(`drawflow-${id}`);
        const editor = new Drawflow(drawflowEl);
        editor.start();
        
        // 设置默认缩放级别和模式
        editor.zoom = 1;
        editor.editor_mode = 'select';
        
        // 保存实例以便后续清理
        this.drawflowInstances.set(id, editor);

        // 添加基本事件监听
        editor.on('nodeCreated', (nodeId) => {
            console.log("Node created " + nodeId);
            this.setupNodeEvents(editor, nodeId);
        });

        editor.on('nodeRemoved', function (id) {
            console.log("Node removed " + id);
        });

        editor.on('zoom', function (zoom) {
            console.log("Zoom level: " + zoom);
        });

        const toolbar = whiteBoardTab.panelElement.querySelector('.drawflow-toolbar');
        toolbar.addEventListener('click', (e) => {
            const target = (e.target as HTMLElement).closest('.toolbar-btn') as HTMLElement;
            if (!target) return;

            const tool = target.dataset.tool;
            
            // 更新工具栏活动状态
            if (['select', 'rect', 'circle', 'line', 'text'].includes(tool)) {
                this.updateActiveToolButton(toolbar, tool);
            }
            
            this.handleToolAction(tool, editor);
        });
        
        // 默认选择 select 工具
        const selectButton = toolbar.querySelector('[data-tool="select"]') as HTMLElement;
        this.updateActiveToolButton(toolbar, 'select');
    }

    private updateActiveToolButton(toolbar: Element, activeTool: string) {
        // 移除所有按钮的活动状态
        toolbar.querySelectorAll('.toolbar-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // 给当前活动工具添加活动状态
        const activeButton = toolbar.querySelector(`[data-tool="${activeTool}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
        }
    }

        private setupNodeEvents(editor: Drawflow, nodeId: number) {
        // 获取节点的 DOM 元素
        const nodeElement = document.getElementById(`node-${nodeId}`);
        if (!nodeElement) return;
        
        const nodeHtml = nodeElement.querySelector('.drawflow_content_node');
        if (!nodeHtml) return;
        
        // 确定节点类型
        const nodeType = nodeElement.classList.contains('text-node') ? 'text' : 
                        nodeElement.classList.contains('circle-node') ? 'circle' : 'rect';
        
        // 文本节点支持编辑
        if (nodeType === 'text') {
            nodeHtml.addEventListener('dblclick', (e) => {
                const textDiv = nodeHtml.querySelector('div');
                if (textDiv) {
                    textDiv.contentEditable = 'true';
                    textDiv.focus();
                    
                    // 防止编辑时拖动节点
                    e.stopPropagation();
                }
            });
            
            // 使用捕获阶段监听失焦事件
            nodeHtml.addEventListener('blur', (e) => {
                const textDiv = e.target as HTMLElement;
                if (textDiv && textDiv.contentEditable === 'true') {
                    textDiv.contentEditable = 'false';
                    
                    // 保存更新的文本内容
                    editor.updateNodeDataFromId(nodeId, { 
                        text: textDiv.innerText 
                    });
                }
            }, true);
        }
        
        // 为节点添加删除按钮
        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'node-delete-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.style.cssText = 'position:absolute;top:-10px;right:-10px;width:20px;height:20px;background:red;color:white;border-radius:50%;text-align:center;line-height:18px;cursor:pointer;display:none;z-index:10;';
        
        nodeElement.style.position = 'relative';
        nodeElement.appendChild(deleteBtn);
        
        // 显示/隐藏删除按钮
        nodeElement.addEventListener('mouseenter', () => {
            deleteBtn.style.display = 'block';
        });
        
        nodeElement.addEventListener('mouseleave', () => {
            deleteBtn.style.display = 'none';
        });
        
        // 点击删除按钮删除节点
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            editor.removeNodeId(nodeId);
        });
    }

    private handleToolAction(tool: string, editor: Drawflow) {
        const x = 100; // 节点初始 X 坐标
        const y = 100; // 节点初始 Y 坐标
        
        switch (tool) {
            case 'select':
                editor.editor_mode = 'select';
                break;
                
            case 'rect':
                // 添加矩形节点
                editor.addNode(
                    'rect', // 节点类型
                    0,      // 输入端口
                    0,      // 输出端口
                    x,
                    y,
                    'drawflow-node rect-node', // CSS 类名
                    { width: 150, height: 100, content: '矩形' }, // 数据
                    '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">矩形</div>' // HTML 内容
                );
                break;
                
            case 'circle':
                // 添加圆形节点
                editor.addNode(
                    'circle',
                    0,
                    0,
                    x,
                    y,
                    'drawflow-node circle-node',
                    { radius: 75, content: '圆形' },
                    '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;">圆形</div>'
                );
                break;
                
            case 'line':
                editor.editor_mode = 'line';
                break;
                
            case 'text':
                // 添加文本节点
                editor.addNode(
                    'text',
                    0,
                    0,
                    x,
                    y,
                    'drawflow-node text-node',
                    { text: '双击编辑文本' },
                    '<div class="text-node" style="min-width:150px;min-height:40px;padding:10px;">双击编辑文本</div>'
                );
                break;
                
            case 'zoomIn':
                // 放大画布
                if (editor.zoom < 1.5) {
                    editor.zoom_in();
                }
                break;
                
            case 'zoomOut':
                // 缩小画布
                if (editor.zoom > 0.5) {
                    editor.zoom_out();
                }
                break;
                
            case 'save':
                // 保存画布内容
                this.saveWhiteboard(editor);
                break;
                
            case 'clear':
                // 确认后清空画布
                if (confirm('确定要清空画板吗？此操作不可撤销。')) {
                    editor.clear();
                }
                break;
        }
    }
    
    private saveWhiteboard(editor: Drawflow) {
        try {
            // 获取画布数据
            const data = editor.export();
            
            // 转换为JSON字符串
            const jsonData = JSON.stringify(data);
            
            // 创建Blob对象
            const blob = new Blob([jsonData], {type: 'application/json'});
            
            // 创建下载链接
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `whiteboard-${new Date().toISOString().slice(0, 10)}.json`;
            
            // 触发下载
            document.body.appendChild(a);
            a.click();
            
            // 清理
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            // 通知用户
            showMessage('画板已保存');
        } catch (error) {
            console.error('保存失败:', error);
            showMessage('保存失败: ' + error.message);
        }
    }

    async onunload() {
        // 清理白板实例
        this.cleanUp();
    }

    private cleanUp() {
        // 清理所有画板实例
        this.drawflowInstances.forEach((instance) => {
            instance.clear();
        });
        this.drawflowInstances.clear();
    }
}