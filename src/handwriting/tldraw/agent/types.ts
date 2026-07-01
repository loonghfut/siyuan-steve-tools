export type AgentCreateKind = 'card' | 'single-block' | 'branch'
export type AgentBranchSide = 'left' | 'right'
export type AgentNodeKind = 'card' | 'single-block' | 'branch'

export type AgentShapeRef =
    | string
    | {
        shapeId?: string
        id?: string
        kind?: AgentNodeKind
        blockId?: string
        x?: number
        y?: number
        w?: number
        h?: number
        color?: string
        isMain?: boolean
        isCollapsed?: boolean
        showMask?: boolean
        side?: AgentBranchSide
        rootShapeId?: string
        root?: AgentShapeRef
        childShapeIds?: string[]
        children?: AgentShapeRef[]
        leftChildren?: AgentShapeRef[]
        rightChildren?: AgentShapeRef[]
        direction?: AgentBranchSide
        horizontalGap?: number
        verticalGap?: number
        lineStyle?: string
        lineWidth?: number
        snapDistance?: number
        showBackground?: boolean
    }

export type AgentCreateShapeArgs = {
    kind: AgentCreateKind
    x?: number
    y?: number
    w?: number
    h?: number
    color?: string
    blockId?: string
    isMain?: boolean
    isCollapsed?: boolean
    showMask?: boolean
    select?: boolean
    zoom?: boolean
    rootShapeId?: string
    root?: AgentShapeRef
    childShapeIds?: string[]
    children?: AgentShapeRef[]
    leftChildren?: AgentShapeRef[]
    rightChildren?: AgentShapeRef[]
    direction?: AgentBranchSide
    horizontalGap?: number
    verticalGap?: number
    lineStyle?: string
    lineWidth?: number
    snapDistance?: number
    showBackground?: boolean
}

export type AgentCreateShapeResult = {
    createdShapeIds: string[]
    selectedShapeIds: string[]
    focusedShapeId?: string
    branchId?: string
    rootShapeId?: string
    leftChildIds?: string[]
    rightChildIds?: string[]
    createdNodes: AgentCreatedNode[]
}

export type AgentCreatedNode = {
    id: string
    kind: AgentNodeKind
    blockId?: string
}
