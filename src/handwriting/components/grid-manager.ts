import Konva from 'konva';
import { WhiteboardOptions } from '../types/whiteboard-types';

export class GridManager {
    private stage: Konva.Stage;
    private layer: Konva.Layer;
    private gridGroup: Konva.Group | null = null;
    private background: Konva.Rect | null = null;
    private gridSize: number;
    private isDarkMode: boolean;
    
    constructor(stage: Konva.Stage, layer: Konva.Layer, options: WhiteboardOptions) {
        this.stage = stage;
        this.layer = layer;
        this.gridSize = options.gridSize || 50;
        this.isDarkMode = options.isDarkMode;
    }
    
    public createGrid(width: number, height: number): void {
        const gridSize = this.gridSize;
        const gridColor = this.isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';

        // 创建背景矩形
        const background = new Konva.Rect({
            x: 0,
            y: 0,
            width: width,
            height: height,
            fill: this.isDarkMode ? '#2d2d2d' : 'white',
            name: 'background'
        });
        this.layer.add(background);

        // 创建网格组
        const gridGroup = new Konva.Group({
            name: 'grid'
        });

        // 创建垂直线
        const verticalLines = new Konva.Line({
            points: [],
            stroke: gridColor,
            strokeWidth: 1,
        });

        // 创建水平线
        const horizontalLines = new Konva.Line({
            points: [],
            stroke: gridColor,
            strokeWidth: 1,
        });

        // 更新网格线的点
        this.updateGridLines(verticalLines, horizontalLines, width, height, gridSize);

        gridGroup.add(verticalLines);
        gridGroup.add(horizontalLines);
        this.layer.add(gridGroup);

        // 存储引用
        this.gridGroup = gridGroup;
        this.background = background;
        
        this.layer.batchDraw();
    }
    
    public updateGrid(stageScale: number): void {
        if (!this.gridGroup || !this.background) return;
    
        const width = this.stage.width();
        const height = this.stage.height();
        const scale = stageScale;
        const position = this.stage.position();
    
        // 计算背景矩形需要的尺寸和位置，以确保覆盖整个视口
        const bgX = -position.x / scale;
        const bgY = -position.y / scale;
        const bgWidth = width / scale;
        const bgHeight = height / scale;
    
        // 更新背景大小和位置
        this.background.position({
            x: bgX,
            y: bgY
        });
        this.background.size({
            width: bgWidth,
            height: bgHeight
        });
    
        // 更新网格线
        const verticalLines = this.gridGroup.findOne('Line') as Konva.Line;
        const horizontalLines = this.gridGroup.getChildren(node => node !== verticalLines)[0] as Konva.Line;
    
        if (verticalLines && horizontalLines) {
            this.updateGridLines(verticalLines, horizontalLines, width, height, this.gridSize);
        }
    }
    
    private updateGridLines(vLines: Konva.Line, hLines: Konva.Line, width: number, height: number, gridSize: number): void {
        const vPoints: number[] = [];
        const hPoints: number[] = [];

        // 计算当前视口的左上角和右下角在世界坐标系中的位置
        const scale = this.stage.scaleX();
        const position = this.stage.position();

        const topLeftX = -position.x / scale;
        const topLeftY = -position.y / scale;
        const bottomRightX = (width - position.x) / scale;
        const bottomRightY = (height - position.y) / scale;

        // 计算网格起始点
        const startX = Math.floor(topLeftX / gridSize) * gridSize;
        const startY = Math.floor(topLeftY / gridSize) * gridSize;
        const endX = Math.ceil(bottomRightX / gridSize) * gridSize;
        const endY = Math.ceil(bottomRightY / gridSize) * gridSize;

        // 生成垂直线
        for (let x = startX; x <= endX; x += gridSize) {
            vPoints.push(x, startY);
            vPoints.push(x, endY);
            vPoints.push(x, startY); // 移动点
        }

        // 生成水平线
        for (let y = startY; y <= endY; y += gridSize) {
            hPoints.push(startX, y);
            hPoints.push(endX, y);
            hPoints.push(startX, y); // 移动点
        }

        vLines.points(vPoints);
        hLines.points(hPoints);
    }
}