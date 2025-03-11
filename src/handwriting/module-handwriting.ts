import * as ic from "@/icon"
import { openTab, Plugin } from "siyuan";
import './handwriting.css';
import { App, Leafer, Box, Line, Frame, ZoomEvent, Rect,DragEvent, Pen } from 'leafer-ui'
import '@leafer-in/viewport'


export class M_handwriting {
    private plugin: Plugin;
    private app: App;
    private background: Leafer;
    private leafer: Leafer;
    private stroke: Leafer;
    private gridContainer: Box;

    constructor(plugin: Plugin) {
        this.plugin = plugin;
    }

    async init(settingdata) {
        // 添加图标
        // Debug.enable = true;
        this.plugin.addIcons(`
            <symbol id="iconSTWhiteboard" viewBox="0 0 500 500">
               ${ic.steveTools_whiteboard}
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
        <div id='steveTool-whiteboard-${id}' style="width: 100%; height: 100%;"></div>`;
        this.app = new App({
            view: document.getElementById(`steveTool-whiteboard-${id}`),
            wheel: {
                zoomMode: true,
            },
        });
        this.background = this.app.addLeafer({
            // hittable: false,
            // usePartRender: false
            wheel: {
                zoomMode: true,
            },
        }) // 背景层，用于绘制网格等
        this.leafer = this.app.addLeafer() // 内容层
        this.stroke = this.app.addLeafer({
            // hittable: false           
            wheel: {
                zoomMode: true,
            },
        }) // 描边层，用于绘制经常变化的hover、select描边效果
        const frame = new Frame({
            fill: '#F6F6F6',
        })
        this.drawGrid();
        this.leafer.add(frame);
        this.background.on(ZoomEvent.ZOOM, function (e: ZoomEvent) {
            this.background.scale *= e.scale
        })
        this.leafer.add(Rect.one({ fill: '#32cd79', draggable: true }, 100, 100))

        const pen = new Pen()
        this.leafer.add(pen)
        this.leafer.on(DragEvent.START, (e: DragEvent) => {
            const point = e.getPagePoint() // 转换事件为 page 坐标 = pen.getPagePoint(e)  
            pen.setStyle({ stroke: '#32cd79', strokeWidth: 10, strokeCap: 'round', strokeJoin: 'round' })
            pen.moveTo(point.x, point.y)
        })
        
        this.leafer.on(DragEvent.DRAG, (e: DragEvent) => {
            const point = e.getPagePoint() // 转换事件为 page 坐标 = pen.getPagePoint(e)  
            pen.lineTo(point.x, point.y)
        })


    }

    private drawGrid() {
        console.log('drawGrid')
        const gridSize = 20;
        const gridColor = '#e0e0e0';
        this.gridContainer = new Box();

        // 获取当前视图边界
        const viewBox = (this.app.view as HTMLElement).getBoundingClientRect();
        console.log(viewBox);
        const left = Math.floor(viewBox.left / gridSize) * gridSize;
        const top = Math.floor(viewBox.top / gridSize) * gridSize;
        const right = Math.ceil((viewBox.left + viewBox.width) / gridSize) * gridSize;
        const bottom = Math.ceil((viewBox.top + viewBox.height) / gridSize) * gridSize;

        // 绘制水平线
        for (let y = top; y <= bottom; y += gridSize) {
            const line = new Line({
                points: [left, y, right, y],
                stroke: gridColor,
                strokeWidth: y % (gridSize * 5) === 0 ? 0.5 : 0.2 // 每5格加粗
            });
            this.gridContainer.add(line);
        }

        // 绘制垂直线
        for (let x = left; x <= right; x += gridSize) {
            const line = new Line({
                points: [x, top, x, bottom],
                stroke: gridColor,
                strokeWidth: x % (gridSize * 5) === 0 ? 0.5 : 0.2 // 每5格加粗
            });
            this.gridContainer.add(line);
        }

        // 添加到背景层
        this.background.add(this.gridContainer);
    }


    async onunload() {
        // 清理白板实例
        this.cleanUp();
    }

    private cleanUp() {

    }
}