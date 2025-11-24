interface IResGetNotebookConf {
    box: string;
    conf: NotebookConf;
    name: string;
}

interface IReslsNotebooks {
    notebooks: Notebook[];
}

interface IResUpload {
    errFiles: string[];
    succMap: { [key: string]: string };
}

interface IResdoOperations {
    doOperations: doOperation[];
    undoOperations: doOperation[] | null;
}

interface IResGetBlockKramdown {
    id: BlockId;
    kramdown: string;
}

interface IResGetChildBlock {
    id: BlockId;
    type: BlockType;
    subtype?: BlockSubType;
    content?: string;
}

interface IResGetTemplates {
    content: string;
    path: string;
}

interface IResReadDir {
    isDir: boolean;
    isSymlink: boolean;
    name: string;
}

interface IResExportMdContent {
    hPath: string;
    content: string;
}

interface IResBootProgress {
    progress: number;
    details: string;
}

interface IResForwardProxy {
    body: string;
    contentType: string;
    elapsed: number;
    headers: { [key: string]: string };
    status: number;
    url: string;
}

interface IResExportResources {
    path: string;
}

// Outline / getDocOutline 返回的类型定义
interface OutlineBlock {
    box?: string;
    path?: string;
    hPath?: string;
    id: string;
    rootID?: string;
    parentID?: string;
    name?: string;
    alias?: string;
    memo?: string;
    tag?: string;
    content?: string;
    fcontent?: string;
    markdown?: string;
    folded?: boolean;
    type?: string; // e.g. "NodeHeading"
    subType?: string; // e.g. "h5"
    refText?: string;
    refs?: any; // 可以是 null 或复杂对象
    defID?: string;
    defPath?: string;
    ial?: any;
    children?: OutlineBlock[] | null; // 递归子节点
    depth?: number;
    count?: number;
    refCount?: number;
    sort?: number;
    created?: string;
    updated?: string;
    riffCardID?: string;
    riffCard?: any;
}

interface OutlineNode {
    id: string;
    box?: string;
    name?: string;
    hPath?: string;
    type?: string; // e.g. "outline"
    nodeType?: string; // e.g. "NodeHeading"
    subType?: string; // e.g. "h2"
    blocks?: OutlineBlock[];
    depth?: number;
    count?: number;
    folded?: boolean;
    updated?: string;
    created?: string;
}

// getDocOutline 接口返回的是 OutlineNode 的数组
type IResGetDocOutline = OutlineNode[];

