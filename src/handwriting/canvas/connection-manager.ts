import { BrowserJsPlumbInstance, newInstance, Connection } from '@jsplumb/browser-ui';
import { AnchorSpec } from '@jsplumb/common';

export class ConnectionManager {
    private jsPlumb: BrowserJsPlumbInstance;
    private canvasId: string;
    private container: HTMLElement;
    private connections: Map<string, Connection> = new Map();

    constructor(canvasId: string, container: HTMLElement) {
        this.canvasId = canvasId;
        this.container = container;

        // 初始化jsPlumb实例
        this.jsPlumb = newInstance({
            container: container,
            // 启用拖拽创建连线
            dragOptions: {
                cursor: 'crosshair',
                zIndex: 2000
            },
            // 设置连线外观
            paintStyle: {
                stroke: '#2196F3',
                strokeWidth: 2
            },
            // 设置连接线
            connector: {
                type: 'Bezier',
                options: {
                    curviness: 50
                }
            },
            // 端点样式
            endpoint: {
                type: 'Dot',
                options: {
                    radius: 5,
                    fill: '#2196F3'
                }
            },

            // 鼠标悬停样式
            hoverPaintStyle: {
                stroke: '#ff4081',
                strokeWidth: 3
            },
            // 端点悬停样式 
            endpointHoverStyle: {
                fill: '#ff4081',
                stroke: '#ff4081'
            },
            
        });

        // 监听连线删除事件
        this.jsPlumb.bind('connection:detach', (info) => {
            const connectionId = info.connection.id;
            this.connections.delete(connectionId);
        });
        this.jsPlumb.bind("beforeDrop", function (info) {
            const sourceId = info.sourceId; // 源节点 ID
            const targetId = info.targetId; // 目标节点 ID

            // 如果源节点和目标节点相同，则禁止连接
            if (sourceId === targetId) {
                return false; // 阻止连接
            }

            return true; // 允许连接
        });
        // 监听连线创建事件
        this.jsPlumb.bind('connection:add', (info) => {
            const connectionId = info.connection.id;
            this.connections.set(connectionId, info.connection);
            // 添加连线标签和删除按钮
            this.addConnectionOverlays(info.connection);
            console.log('connection:add', info);
        });
    }

    // 初始化块元素的连接点
    public initializeElement(element: HTMLElement): void {

        if (!element || !element.id) return;

        // 定义连接点的位置和样式
        const commonOptions = {
            maxConnections: -1, // 无限连接
            dragAllowedWhenFull: true,
            cssClass: 'block-endpoint',
            connectionType: 'basic',
            enabled: true
        };

        // 定义四个方向的连接点
        const anchors: { position: AnchorSpec, source: boolean, target: boolean }[] = [
            { position: 'Left', source: true, target: true },
            { position: 'Right', source: true, target: true },
            { position: 'Top', source: true, target: true },
            { position: 'Bottom', source: true, target: true }
        ];

        // 添加四个方向的连接点
        anchors.forEach(anchor => {
            // 源端点 - 可以作为连线起点
            if (anchor.source) {
                this.jsPlumb.addEndpoint(element, {
                    anchor: anchor.position,
                    source: false,
                    target: true,
                    ...commonOptions,
                    endpoint: {
                        type: 'Dot',
                        options: {
                            radius: 5,
                            cssClass: 'endpoint-source'
                        }
                    },
                    connectorStyle: { stroke: '#2196F3', strokeWidth: 2 },
                    connectorHoverStyle: { stroke: '#ff4081', strokeWidth: 3 },
                    connectorOverlays: [
                        {
                            type: 'Arrow',
                            options: {
                                location: 1,
                                width: 10,
                                length: 10
                            }
                        }
                    ]
                });
            }

            // 目标端点 - 可以作为连线终点
            if (anchor.target) {
                this.jsPlumb.addEndpoint(element, {
                    anchor: anchor.position,
                    source: true,
                    target: false,
                    ...commonOptions,
                    endpoint: {
                        type: 'Dot',
                        options: {
                            radius: 5,
                            cssClass: 'endpoint-target'
                        }
                    }
                });
            }
        });

        // 当元素移动时，重新绘制连线
        this.jsPlumb.revalidate(element);
    }

    // 添加连线标签和删除按钮
    private addConnectionOverlays(connection: Connection): void {
        // 添加删除按钮
        connection.addOverlay({
            type: 'Custom',
            options: {
                create: () => {
                    const deleteBtn = document.createElement('div');
                    deleteBtn.className = 'connection-delete-btn';
                    deleteBtn.innerHTML = '×';
                    
                    // 添加连接ID作为自定义属性
                    deleteBtn.dataset.connectionId = connection.id;
                    
                    deleteBtn.style.cssText = `
                        width: 16px; 
                        height: 16px; 
                        background-color: rgba(255, 77, 79, 0.8);
                        color: white; 
                        text-align: center;
                        border-radius: 50%; 
                        cursor: pointer;
                        font-size: 12px;
                        line-height: 16px;
                        visibility: hidden;
                    `;
    
                    deleteBtn.addEventListener('click', () => {
                        this.jsPlumb.deleteConnection(connection);
                        this.connections.delete(connection.id);
                    });
    
                    return deleteBtn;
                },
                location: 0.5,
                id: 'delete-button'
            }
        });

        // 添加标签
        connection.addOverlay({
            type: 'Custom',
            options: {
                create: () => {
                    const label = document.createElement('div');
                    label.className = 'connection-label';
                    label.innerText = '';
                    label.style.cssText = `
                        background-color: white; 
                        padding: 2px 5px; 
                        border: 1px solid #ddd;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 12px;
                    `;

                    label.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const text = prompt('输入连线标签:', label.innerText);
                        if (text !== null) {
                            label.innerText = text;
                        }
                    });

                    return label;
                },
                location: 0.5,
                id: 'label'
            }
        });

        // 添加连线交互
        this.addMouseInteraction(connection);
    }

    // 为连线添加交互功能
    private addMouseInteraction(connection: Connection): void {
        try {
            // 给连接添加唯一ID属性，便于后续引用
            const connectionId = connection.id;
            
            // 监听连线的hover事件
            connection.bind('mouseover', () => {
                // 找到与此连接关联的删除按钮
                const deleteBtn = document.querySelector(`.connection-delete-btn[data-connection-id="${connectionId}"]`);
                if (deleteBtn) {
                    (deleteBtn as HTMLElement).style.visibility = 'visible';
                }
            });
    
            connection.bind('mouseout', () => {
                const deleteBtn = document.querySelector(`.connection-delete-btn[data-connection-id="${connectionId}"]`);
                if (deleteBtn) {
                    (deleteBtn as HTMLElement).style.visibility = 'hidden';
                }
            });
        } catch (e) {
            console.error('设置连线交互时出错:', e);
        }
    }

    // 当块被移动时更新连线
    public updateConnections(): void {
        this.jsPlumb.repaintEverything();
    }

    // 更新指定元素的连线
    public updateElement(elementId: string): void {
        if (!elementId) return;

        const element = document.getElementById(elementId);
        if (element) {
            this.jsPlumb.revalidate(element);
        }
    }

    // 当缩放或平移画布时
    public updateZoom(zoom: number): void {
        this.jsPlumb.setZoom(zoom);
    }

    // 清理所有连线
    public cleanup(): void {
        this.jsPlumb.reset();
        this.connections.clear();
    }
}