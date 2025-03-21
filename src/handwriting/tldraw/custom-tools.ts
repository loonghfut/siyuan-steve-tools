import {
    TLBaseShape,
    TLShapeUtilFlag,
    createShapeId,
    BaseBoxShapeUtil,
    TLOnResizeHandler,
    HTMLContainer
} from '@tldraw/tldraw';

// 定义思源块形状类型
export type SiyuanBlockShape = TLBaseShape<
    'siyuan-block',
    {
        blockId: string;
        width: number;
        height: number;
        isEditing: boolean;
        content: string;
    }
>;

// 创建思源块形状工具
export class SiyuanBlockUtil extends BaseBoxShapeUtil<SiyuanBlockShape> {
    static override type = 'siyuan-block' as const;
    static override flags = {
        [TLShapeUtilFlag.Deletable]: true,
        [TLShapeUtilFlag.Resizable]: true,
        [TLShapeUtilFlag.Moveable]: true,
    };

    override getDefaultProps(): SiyuanBlockShape['props'] {
        return {
            blockId: '',
            width: 300,
            height: 200,
            isEditing: false,
            content: '',
        };
    }

    // 渲染思源块
    override component(shape: SiyuanBlockShape) {
        const {
            blockId,
            width,
            height,
            isEditing,
            content,
        } = shape.props;

        return (
            <HTMLContainer
                id={shape.id}
                style={{
                    width: width + 'px',
                    height: height + 'px',
                    backgroundColor: 'var(--tl-container-background)',
                    borderRadius: '3px',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.12)'
                }}
            >
                {/* 工具栏区域 */}
                <div
                    style={{
                        padding: '4px 8px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        borderBottom: '1px solid var(--tl-container-border)',
                        background: 'var(--tl-container-headerBackground)',
                    }}
                >
                    <div style={{ fontSize: '12px' }}>思源块</div>
                    <div style={{ fontSize: '12px', opacity: 0.5 }}>{blockId}</div>
                </div>

                {/* 块内容区域 */}
                <div
                    style={{
                        flex: 1,
                        padding: '8px',
                        overflow: 'auto',
                    }}
                >
                    {isEditing ? (
                        <div id={`siyuan-block-editor-${blockId}`} style={{ height: '100%' }} />
                    ) : (
                        <div style={{ wordBreak: 'break-word' }}>{content}</div>
                    )}
                </div>
            </HTMLContainer>
        );
    }

    // 调整大小处理器
    override onResize: TLOnResizeHandler<SiyuanBlockShape> = (shape, info) => {
        return {
            props: {
                width: Math.max(100, info.bounds.width),
                height: Math.max(100, info.bounds.height),
            },
        };
    };

    // 指示何时应该呈现HTML容器
    override indicator(shape: SiyuanBlockShape) {
        return {
            bounds: this.getBounds(shape),
        };
    }
}

// 导出自定义形状
export const customShapeUtils = [SiyuanBlockUtil];