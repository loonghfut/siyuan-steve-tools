/**
 * Copyright (c) 2023 frostime. All rights reserved.
 * https://github.com/frostime/sy-plugin-template-vite
 * 
 * See API Document in [API.md](https://github.com/siyuan-note/siyuan/blob/master/API.md)
 * API 文档见 [API_zh_CN.md](https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md)
 */

import { fetchPost, fetchSyncPost, IWebSocketData } from "siyuan";
import { ISelectOption } from "@/calendar/interface";
import { settingdata } from "..";
import { AVManager } from "./db_pro";
// 创建 AVManager 实例 - 可以根据需要进行配置
const avManager = new AVManager();

// 请求队列，使用批量处理优化性能
const cellUpdateQueue: Array<{
    id: string;
    avID: string;
    keyID: string;
    keyName?: string;
    value: any;
    type: string;
    endtime?: string;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
}> = [];

// 添加块到数据库的队列 - 按 avID 分组
const addBlockQueue: Map<string, Array<{
    id: string;
    avID: string;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
}>> = new Map();

let isProcessingQueue = false;
const getBatchDelay = () => settingdata['transaction-delay'] || 1000; // 使用配置的事务延迟时间
const getQueueDelay = () => Math.min(settingdata['transaction-delay'] / 5, 200) || 200; // 队列延迟为事务延迟的1/5，最大200ms
const MAX_WAIT_TIME = 5000; // 最大等待时间，防止单个请求等待太久

// 队列处理定时器 - 按 avID 分别管理
const addBlockQueueTimers: Map<string, NodeJS.Timeout> = new Map();
let cellUpdateQueueTimer: NodeJS.Timeout | null = null;
let cellUpdateQueueStartTime: number | null = null; // 记录队列开始时间
export async function request(url: string, data: any) {
    let response: IWebSocketData = await fetchSyncPost(url, data);
    let res = response.code === 0 ? response.data : `${url}error`;
    return res;
}


// **************************************** Noteboook ****************************************


export async function lsNotebooks(): Promise<IReslsNotebooks> {
    let url = '/api/notebook/lsNotebooks';
    return request(url, '');
}


export async function openNotebook(notebook: NotebookId) {
    let url = '/api/notebook/openNotebook';
    return request(url, { notebook: notebook });
}


export async function closeNotebook(notebook: NotebookId) {
    let url = '/api/notebook/closeNotebook';
    return request(url, { notebook: notebook });
}


export async function renameNotebook(notebook: NotebookId, name: string) {
    let url = '/api/notebook/renameNotebook';
    return request(url, { notebook: notebook, name: name });
}


export async function createNotebook(name: string): Promise<Notebook> {
    let url = '/api/notebook/createNotebook';
    return request(url, { name: name });
}


export async function removeNotebook(notebook: NotebookId) {
    let url = '/api/notebook/removeNotebook';
    return request(url, { notebook: notebook });
}


export async function getNotebookConf(notebook: NotebookId): Promise<IResGetNotebookConf> {
    let data = { notebook: notebook };
    let url = '/api/notebook/getNotebookConf';
    return request(url, data);
}


export async function setNotebookConf(notebook: NotebookId, conf: NotebookConf): Promise<NotebookConf> {
    let data = { notebook: notebook, conf: conf };
    let url = '/api/notebook/setNotebookConf';
    return request(url, data);
}


// **************************************** File Tree ****************************************
export async function createDocWithMd(notebook: NotebookId, path: string, markdown: string): Promise<DocumentId> {
    let data = {
        notebook: notebook,
        path: path,
        markdown: markdown,
    };
    let url = '/api/filetree/createDocWithMd';
    return request(url, data);
}


export async function renameDoc(notebook: NotebookId, path: string, title: string): Promise<DocumentId> {
    let data = {
        doc: notebook,
        path: path,
        title: title
    };
    let url = '/api/filetree/renameDoc';
    return request(url, data);
}


export async function removeDoc(notebook: NotebookId, path: string) {
    let data = {
        notebook: notebook,
        path: path,
    };
    let url = '/api/filetree/removeDoc';
    return request(url, data);
}


export async function moveDocs(fromPaths: string[], toNotebook: NotebookId, toPath: string) {
    let data = {
        fromPaths: fromPaths,
        toNotebook: toNotebook,
        toPath: toPath
    };
    let url = '/api/filetree/moveDocs';
    return request(url, data);
}


export async function getHPathByPath(notebook: NotebookId, path: string): Promise<string> {
    let data = {
        notebook: notebook,
        path: path
    };
    let url = '/api/filetree/getHPathByPath';
    return request(url, data);
}


export async function getHPathByID(id: BlockId): Promise<string> {
    let data = {
        id: id
    };
    let url = '/api/filetree/getHPathByID';
    return request(url, data);
}


export async function getIDsByHPath(notebook: NotebookId, path: string): Promise<BlockId[]> {
    let data = {
        notebook: notebook,
        path: path
    };
    let url = '/api/filetree/getIDsByHPath';
    return request(url, data);
}

// **************************************** Asset Files ****************************************

export async function upload(assetsDirPath: string, files: any[]): Promise<IResUpload> {
    let form = new FormData();
    form.append('assetsDirPath', assetsDirPath);
    for (let file of files) {
        form.append('file[]', file);
    }
    let url = '/api/asset/upload';
    return request(url, form);
}

// **************************************** Block ****************************************
type DataType = "markdown" | "dom";
export async function insertBlock(
    dataType: DataType, data: string,
    nextID?: BlockId, previousID?: BlockId, parentID?: BlockId
): Promise<IResdoOperations[]> {
    let payload = {
        dataType: dataType,
        data: data,
        nextID: nextID,
        previousID: previousID,
        parentID: parentID
    }
    let url = '/api/block/insertBlock';
    return request(url, payload);
}


export async function prependBlock(dataType: DataType, data: string, parentID: BlockId | DocumentId): Promise<IResdoOperations[]> {
    let payload = {
        dataType: dataType,
        data: data,
        parentID: parentID
    }
    let url = '/api/block/prependBlock';
    return request(url, payload);
}


export async function appendBlock(dataType: DataType, data: string, parentID: BlockId | DocumentId): Promise<IResdoOperations[]> {
    let payload = {
        dataType: dataType,
        data: data,
        parentID: parentID
    }
    let url = '/api/block/appendBlock';
    return request(url, payload);
}


export async function updateBlock(dataType: DataType, data: string, id: BlockId): Promise<IResdoOperations[]> {
    let payload = {
        dataType: dataType,
        data: data,
        id: id
    }
    let url = '/api/block/updateBlock';
    return request(url, payload);
}


export async function deleteBlock(id: BlockId): Promise<IResdoOperations[]> {
    let data = {
        id: id
    }
    let url = '/api/block/deleteBlock';
    return request(url, data);
}


export async function moveBlock(id: BlockId, previousID?: PreviousID, parentID?: ParentID): Promise<IResdoOperations[]> {
    let data = {
        id: id,
        previousID: previousID,
        parentID: parentID
    }
    let url = '/api/block/moveBlock';
    return request(url, data);
}


export async function foldBlock(id: BlockId) {
    let data = {
        id: id
    }
    let url = '/api/block/foldBlock';
    return request(url, data);
}


export async function unfoldBlock(id: BlockId) {
    let data = {
        id: id
    }
    let url = '/api/block/unfoldBlock';
    return request(url, data);
}


export async function getBlockKramdown(id: BlockId): Promise<IResGetBlockKramdown> {
    let data = {
        id: id
    }
    let url = '/api/block/getBlockKramdown';
    return request(url, data);
}


export async function getChildBlocks(id: BlockId): Promise<IResGetChildBlock[]> {
    let data = {
        id: id
    }
    let url = '/api/block/getChildBlocks';
    return request(url, data);
}

export async function transferBlockRef(fromID: BlockId, toID: BlockId, refIDs: BlockId[]) {
    let data = {
        fromID: fromID,
        toID: toID,
        refIDs: refIDs
    }
    let url = '/api/block/transferBlockRef';
    return request(url, data);
}

// **************************************** Attributes ****************************************
export async function setBlockAttrs(id: BlockId, attrs: { [key: string]: string }) {
    let data = {
        id: id,
        attrs: attrs
    }
    let url = '/api/attr/setBlockAttrs';
    return request(url, data);
}


export async function getBlockAttrs(id: BlockId): Promise<{ [key: string]: string }> {
    let data = {
        id: id
    }
    let url = '/api/attr/getBlockAttrs';
    return request(url, data);
}

export async function getAttributeViewKeys(id: BlockId) {
    const data = {
        id: id
    }
    const url = '/api/av/getAttributeViewKeys';
    return request(url, data);
}

export async function getAttributeViewKeysByAvID(avid: BlockId) {
    const data = {
        avID: avid
    }
    const url = '/api/av/getAttributeViewKeysByAvID';
    return request(url, data);
}

export async function renderAttributeView(avid: BlockId, viewID?: string) {
    let data: any;
    if (viewID === undefined) {
        data = {
            id: avid, // avID,
            // viewID: '20241003141312-30yk3cr',//测试可以不用这个参数 //TODO：多视图的情况下需要
            // pageSize:9999999
            // page:2
        }
    } else {
        data = {
            id: avid, // avID,
            viewID: viewID,
            // pageSize:9999999
            // page:2
        }
    }

    const url = '/api/av/renderAttributeView';
    return request(url, data);
}



// const blockIDs = res.data.view.rows.map(item => item.id);



// **************************************** SQL ****************************************

export async function sql(sql: string): Promise<any[]> {
    let sqldata = {
        stmt: sql,
    };
    let url = '/api/query/sql';
    return request(url, sqldata);
}

export async function getBlockByID(blockId: string): Promise<Block> {
    let sqlScript = `select * from blocks where id ='${blockId}'`;
    let data = await sql(sqlScript);
    return data[0];
}

// **************************************** Template ****************************************

export async function render(id: DocumentId, path: string): Promise<IResGetTemplates> {
    let data = {
        id: id,
        path: path
    }
    let url = '/api/template/render';
    return request(url, data);
}


export async function renderSprig(template: string): Promise<string> {
    let url = '/api/template/renderSprig';
    return request(url, { template: template });
}

// **************************************** File ****************************************

export async function getFile(path: string): Promise<any> {
    let data = {
        path: path
    }
    let url = '/api/file/getFile';
    return new Promise((resolve, _) => {
        fetchPost(url, data, (content: any) => {
            resolve(content)
        });
    });
}


/**
 * fetchPost will secretly convert data into json, this func merely return Blob
 * @param endpoint 
 * @returns 
 */
export const getFileBlob = async (path: string): Promise<Blob | null> => {
    const endpoint = '/api/file/getFile'
    let response = await fetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
            path: path
        })
    });
    if (!response.ok) {
        return null;
    }
    let data = await response.blob();
    return data;
}


export async function putFile(path: string, isDir: boolean, file: any) {
    let form = new FormData();
    form.append('path', path);
    form.append('isDir', isDir.toString());
    // Copyright (c) 2023, terwer.
    // https://github.com/terwer/siyuan-plugin-importer/blob/v1.4.1/src/api/kernel-api.ts
    // form.append('modTime', Math.floor(Date.now() / 1000).toString());
    form.append('file', file);
    let url = '/api/file/putFile';
    return request(url, form);
}

export async function removeFile(path: string) {
    let data = {
        path: path
    }
    let url = '/api/file/removeFile';
    return request(url, data);
}



export async function readDir(path: string): Promise<IResReadDir> {
    let data = {
        path: path
    }
    let url = '/api/file/readDir';
    return request(url, data);
}


// **************************************** Export ****************************************

export async function exportMdContent(id: DocumentId): Promise<IResExportMdContent> {
    let data = {
        id: id
    }
    let url = '/api/export/exportMdContent';
    return request(url, data);
}

export async function exportResources(paths: string[], name: string): Promise<IResExportResources> {
    let data = {
        paths: paths,
        name: name
    }
    let url = '/api/export/exportResources';
    return request(url, data);
}

// **************************************** Convert ****************************************

export type PandocArgs = string;
export async function pandoc(args: PandocArgs[]) {
    let data = {
        args: args
    }
    let url = '/api/convert/pandoc';
    return request(url, data);
}

// **************************************** Notification ****************************************

// /api/notification/pushMsg
// {
//     "msg": "test",
//     "timeout": 7000
//   }
export async function pushMsg(msg: string, timeout: number = 7000) {
    let payload = {
        msg: msg,
        timeout: timeout
    };
    let url = "/api/notification/pushMsg";
    return request(url, payload);
}

export async function pushErrMsg(msg: string, timeout: number = 7000) {
    let payload = {
        msg: msg,
        timeout: timeout
    };
    let url = "/api/notification/pushErrMsg";
    return request(url, payload);
}

// **************************************** Network ****************************************
export async function forwardProxy(
    url: string, method: string = 'GET', payload: any = {},
    headers: any[] = [], timeout: number = 7000, contentType: string = "text/html"
): Promise<IResForwardProxy> {
    let data = {
        url: url,
        method: method,
        timeout: timeout,
        contentType: contentType,
        headers: headers,
        payload: payload
    }
    let url1 = '/api/network/forwardProxy';
    return request(url1, data);
}


// **************************************** System ****************************************

export async function bootProgress(): Promise<IResBootProgress> {
    return request('/api/system/bootProgress', {});
}


export async function version(): Promise<string> {
    return request('/api/system/version', {});
}


export async function currentTime(): Promise<number> {
    return request('/api/system/currentTime', {});
}



// **************************************** User ****************************************
export async function refresh() {
    fetch('/api/ui/reloadUI', { method: 'POST' })
}

export async function sync() {
    await fetch(`/api/sync/performSync`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            // 'Authorization': `token ${token}`
        },
        body: JSON.stringify({
        })
    });
}

export async function URLsync(myurl: string, token: string) {
    const response = await fetch(`${myurl}/api/sync/performSync`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `token ${token}`
        },
        body: JSON.stringify({
        })
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (data.code === 0) {
        return true;
    }
    return false;
}

export async function testSync(myurl: string, token: string) {
    const response = await fetch(`${myurl}/api/notebook/lsNotebooks`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `token ${token}`
        },
        body: JSON.stringify({
        })
    });
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (data.code === 0) {
        return true;
    }
    return false;
}

//导入思源文件.zip
export async function importSY(notebookId: string, file: Blob) {
    const formData = new FormData();
    formData.append('file', file, '日程.sy.zip');
    formData.append('notebook', notebookId);
    formData.append('toPath', '/');

    const response = await fetch('/api/import/importSY', {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.code === 0;
}

//触发网络下载
export const downloadFile = (file: Blob) => {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = '日程.sy.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export async function createDailyNote(app: string, notebookID: string) {
    let data = {
        app: app,
        notebook: notebookID
    }
    let url = '/api/filetree/createDailyNote';
    return request(url, data);
};

//暂时不用
export async function addBlockToDatabase(id: string, databaseId: string) {
    const data = {
        session: window.siyuan?.backStack[0].protyle.id,
        app: window.siyuan.ws.app.appId,
        transactions: [
            {
                doOperations: [
                    {
                        action: "insertAttrViewBlock",
                        avID: databaseId,
                        ignoreFillFilter: true,
                        srcs: [
                            {
                                id: id,
                                isDetached: false
                            }
                        ],
                        blockID: databaseId.split("-")[0]
                    },
                    {
                        action: "doUpdateUpdated",
                        id: databaseId.split("-")[0],
                        data: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace(/[:\-]|(\.\d{3})|T/g, "").slice(0, 14)
                    }
                ],
                undoOperations: [
                    {
                        action: "removeAttrViewBlock",
                        srcIDs: [id],
                        avID: databaseId
                    }
                ]
            }
        ],
        reqId: Date.now()
    };

    try {
        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error adding block to database:', error);
        throw error;
    }
}


export async function addBlockToDatabase_pro(id: string, avID: string): Promise<any> {
    return new Promise((resolve, reject) => {
        // 按 avID 分组添加到队列中
        if (!addBlockQueue.has(avID)) {
            addBlockQueue.set(avID, []);
        }

        addBlockQueue.get(avID)!.push({
            id,
            avID,
            resolve,
            reject
        });

        // 为每个 avID 单独管理定时器
        if (addBlockQueueTimers.has(avID)) {
            clearTimeout(addBlockQueueTimers.get(avID)!);
        }

        const timer = setTimeout(() => {
            processAddBlockQueueForAvID(avID);
            addBlockQueueTimers.delete(avID);
        }, getQueueDelay());

        addBlockQueueTimers.set(avID, timer);
    });
}

// 处理特定 avID 的添加块队列
async function processAddBlockQueueForAvID(avID: string) {
    const blocks = addBlockQueue.get(avID);
    if (!blocks || blocks.length === 0) {
        return;
    }

    try {
        console.log(`🚀 [批量添加块] 开始处理 ${blocks.length} 个块，avID: ${avID}`);

        // 构建批量添加的数据
        const sources = blocks.map(block => ({
            id: block.id,
            isDetached: false
        }));

        // 使用批量API添加所有块
        const result = await avManager.addAttributeViewBlocks(avID, sources, {
            ignoreFillFilter: true
        });

        // 成功后解析所有Promise
        blocks.forEach(block => block.resolve(result));

        console.log(`✅ [批量添加块] 成功添加 ${blocks.length} 个块到 avID: ${avID}`);

    } catch (error) {
        console.error(`❌ [批量添加块] 添加块失败，avID ${avID}:`, error);
        // 错误时拒绝所有Promise
        blocks.forEach(block => block.reject(error));
    }

    // 清除已处理的队列
    addBlockQueue.delete(avID);
}

interface UpdateMainKeyParams {
    avID: string;
    keyID: string;
    content: string;
    blockID: string;
}

// Modify the function to accept an object parameter
export async function updatemainkey(params: UpdateMainKeyParams): Promise<any> {
    return new Promise((resolve, reject) => {
        const delay = settingdata['transaction-delay'] || 1000;
        setTimeout(async () => {
            try {
                const { avID, keyID, content, blockID } = params; // Destructure the parameters
                const url = '/api/av/setAttributeViewBlockAttr';
                const payload = {
                    avID: avID,
                    keyID: keyID,
                    rowID: blockID,
                    value: {
                        block: {
                            content: content,
                            id: blockID
                        },
                        isDetached: false // Assuming this remains false, adjust if needed
                    }
                };
                const result = await request(url, payload);
                resolve(result);
            } catch (error) {
                reject(error);
            }
        }, delay); // 使用配置的延迟时间
    });
}




export async function updateAttrViewCell_pro(
    id: string,
    avID: string,
    keyID: string,
    value: string | Date | ISelectOption[] | boolean | {
        blockID: string,
        content: string,
        oldrelation: {
            ids: string[],
            contents: string[]
        },
        action: string
    },
    type: 'date' | 'select' | 'relation' | 'checkbox' | 'text' | 'mSelect' | 'url',
    endtime?: string
): Promise<any> {
    return new Promise((resolve, reject) => {
        // 将所有请求添加到队列中
        cellUpdateQueue.push({
            id,
            avID,
            keyID,
            value,
            type,
            endtime,
            resolve,
            reject
        });

        console.log(`📝 [队列] 添加单元格更新请求，队列当前长度: ${cellUpdateQueue.length}, avID: ${avID}`);

        // 记录队列开始时间
        if (!cellUpdateQueueStartTime) {
            cellUpdateQueueStartTime = Date.now();
        }

        // 智能定时器策略
        if (cellUpdateQueueTimer) {
            clearTimeout(cellUpdateQueueTimer);
        }

        // 动态调整等待时间
        const queueAge = Date.now() - cellUpdateQueueStartTime;
        const currentQueueSize = cellUpdateQueue.length;

        let waitTime = getQueueDelay();

        // 如果队列已经等待太久或队列很大，立即处理
        if (queueAge >= MAX_WAIT_TIME || currentQueueSize >= 50) {
            waitTime = 150; // 几乎立即处理
            console.log(`⚡ [队列] 触发立即处理 - 队列大小: ${currentQueueSize}, 等待时间: ${queueAge}ms`);
        } else if (currentQueueSize >= 4) {
            waitTime = 500; // 减少等待时间
        }

        cellUpdateQueueTimer = setTimeout(() => {
            processQueue();
            cellUpdateQueueTimer = null;
            cellUpdateQueueStartTime = null;
        }, waitTime);
    });
}

// 处理队列函数 - 使用批量API优化
async function processQueue() {
    if (isProcessingQueue || cellUpdateQueue.length === 0) {
        console.log(`⏸️ [队列处理] 跳过处理 - 正在处理: ${isProcessingQueue}, 队列长度: ${cellUpdateQueue.length}`);
        return;
    }

    isProcessingQueue = true;
    const totalItems = cellUpdateQueue.length;
    console.log(`🚀 [队列处理] 开始处理单元格更新队列，共 ${totalItems} 个项目`);

    // 按 avID 分组处理
    const groupedUpdates = new Map<string, Array<typeof cellUpdateQueue[0]>>();

    // 取出所有待处理的更新
    const allUpdates: Array<typeof cellUpdateQueue[0]> = [];
    while (cellUpdateQueue.length > 0) {
        const update = cellUpdateQueue.shift();
        if (!update) continue;
        allUpdates.push(update);

        if (!groupedUpdates.has(update.avID)) {
            groupedUpdates.set(update.avID, []);
        }
        groupedUpdates.get(update.avID)!.push(update);
    }

    console.log(`📊 [队列处理] 分组结果: ${groupedUpdates.size} 个avID，总共 ${allUpdates.length} 个更新`);

    // 按 avID 分组批量处理
    for (const [avID, updates] of groupedUpdates.entries()) {
        try {
            console.log(`🔄 [批量更新单元格] 开始处理 ${updates.length} 个单元格更新，avID: ${avID}`);

            // 预处理所有值并获取键信息
            const processedUpdates = await Promise.all(
                updates.map(async (update) => {
                    const processedValue = await processCellValue(update.value, update.type, update.endtime);

                    // 如果没有keyName，需要根据keyID获取
                    let keyName = update.keyName;
                    if (!keyName && update.keyID) {
                        const keys = await avManager.getAttributeViewKeysByAvID(avID);
                        const key = keys.find(k => k.id === update.keyID);
                        keyName = key?.name;
                    }

                    return {
                        ...update,
                        keyName,
                        processedValue
                    };
                })
            );

            // 构建批量更新数据
            const batchUpdates = processedUpdates
                .filter(update => update.keyName) // 只处理有效的键名
                .map(update => ({
                    keyName: update.keyName!,
                    rowID: update.id,
                    value: update.processedValue
                }));

            if (batchUpdates.length > 0) {
                // 使用批量API更新单元格
                const result = await avManager.batchUpdateCells(avID, batchUpdates);

                // 成功后解析所有Promise
                updates.forEach(update => update.resolve(result));

                console.log(`✅ [批量更新单元格] 成功更新 ${batchUpdates.length} 个单元格，avID: ${avID}`);
            } else {
                // 如果没有有效更新，拒绝所有Promise
                updates.forEach(update => update.reject(new Error('Invalid keyName for update')));
                console.warn(`⚠️  [批量更新单元格] 没有有效的键名，avID: ${avID}`);
            }

        } catch (error) {
            console.error(`❌ [批量更新单元格] 更新失败，avID ${avID}:`, error);
            // 错误时拒绝所有Promise
            updates.forEach(update => update.reject(error));
        }

        // 每个avID处理完后添加延迟
        if (groupedUpdates.size > 1) {
            const batchDelay = getBatchDelay();
            console.log(`⏱️ [批量处理] avID ${avID} 处理完成，等待 ${batchDelay}ms 后处理下一个avID...`);
            await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
    }

    isProcessingQueue = false;
    console.log(`✅ [队列处理] 队列处理完成，共处理了 ${totalItems} 个单元格更新`);
}

// 处理单元格值的函数（从原来的processCellUpdate中提取）
async function processCellValue(value: any, type: string, endtime?: string): Promise<any> {
    let processedValue: any;

    switch (type) {
        case 'date':
            const { start, end } = await getDateTimestamps(value as string);
            processedValue = {
                date: {
                    content: start,
                    isNotEmpty: true,
                    content2: endtime ? (await getDateTimestamps(endtime)).start : end,
                    isNotEmpty2: true,
                    hasEndDate: true,
                    isNotTime: false
                }
            };
            break;

        case 'select':
            processedValue = {
                select: {
                    content: (value as ISelectOption[])[0]?.content || '',
                    color: (value as ISelectOption[])[0]?.color || ''
                }
            };
            break;

        case 'mSelect':
            processedValue = {
                mSelect: (value as ISelectOption[]).map(option => ({
                    content: option.content,
                    color: option.color
                }))
            };
            break;

        case 'checkbox':
            processedValue = {
                checkbox: {
                    checked: value as boolean
                }
            };
            break;

        case 'relation':
            const { blockID, content, oldrelation, action } = value as {
                blockID: string,
                content: string,
                oldrelation: {
                    ids: string[],
                    contents: string[]
                },
                action: string
            };
            const readyContents = transformBlockData(oldrelation.contents);
            if (action === 'add') {
                if (!oldrelation.ids.includes(blockID)) {
                    oldrelation.ids.push(blockID);
                    readyContents.push({
                        block: { content: content, id: blockID },
                        isDetached: false,
                        type: "block"
                    });
                }
            } else if (action === 'remove') {
                const index = oldrelation.ids.indexOf(blockID);
                if (index !== -1) {
                    oldrelation.ids.splice(index, 1);
                    readyContents.splice(index, 1);
                }
            } else {
                throw new Error("Invalid relation action");
            }
            processedValue = {
                relation: oldrelation.ids.map(id => ({
                    blockID: id,
                    content: readyContents.find(c => c.block.id === id)?.block.content || ''
                }))
            };
            break;

        case 'text':
            processedValue = {
                text: {
                    content: value as string
                }
            };
            break;

        case 'url':
            processedValue = {
                url: {
                    content: value as string
                }
            };
            break;

        default:
            throw new Error(`Unsupported cell value type: ${type}`);
    }

    return processedValue;
}

function transformBlockData(input: any[]): any[] {
    return input.map(item => ({
        type: "block",
        block: {
            id: item.block.id,
            content: item.block.content
        },
        isDetached: false
    }));
}

export async function generateSiyuanID(more = false) {
    // 生成时间戳部分
    const now = new Date();
    const timestamp = now.getFullYear() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');

    // 生成随机字符串部分
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    let randomStr = '';
    for (let i = 0; i < 7; i++) {
        randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // 组合ID
    if (more) {
        return {
            id: `${timestamp}-${randomStr}`,
            timestamp,
            randomStr
        };
    } else {
        return `${timestamp}-${randomStr}`;
    }
}

async function getDateTimestamps(dateStr: string): Promise<{ start: number, end: number }> {
    // 解析日期字符串
    const parseDate = (dateStr: string): Date => {
        if (dateStr.includes('T')) {
            return new Date(dateStr);
        }
        return new Date(dateStr + 'T08:00:00+08:00');
    };

    const date = parseDate(dateStr);

    if (dateStr.includes('T')) {
        // 对于带时间的格式，end时间设为1小时后
        const n = settingdata['cal-time'] ? settingdata['cal-time'] : 0;//默认为 0
        const ONE_HOUR_MS = n * 60 * 60 * 1000; // 1小时的毫秒数
        return {
            start: date.getTime(),
            end: date.getTime() + ONE_HOUR_MS
        };
    } else {
        // 对于仅日期的格式，start和end都设为当天8点
        const fixedTime = date.getTime();
        return {
            start: fixedTime,
            end: fixedTime//TODO：后面优化点
        };
    }
}

import { PluginConfig } from "../savedata";

// 传入 PluginConfig 实例
export async function getFromApi2(
    path: string,
    params: Record<string, string> = {},
    headers: Record<string, string> = {},
    pluginConfig?: PluginConfig // 
): Promise<any> {
    const baseUrl = 'http://api2.232397.xyz';
    const today = new Date().toISOString().slice(0, 10);
    const key = `getFromApi2_${path}`;

    // 检查配置文件中的日期
    if (pluginConfig) {
        await pluginConfig.load();
        const lastDate = pluginConfig.get<string>(key);
        console.log(`api2ok`);
        if (lastDate === today) {
            // console.warn(`getFromApi2: 今日已请求，无需重复发送`);
            return {
                success: false,
                error: '今日已请求，无需重复发送'
            };
        }
    }

    const safeParams = params ?? {};
    const queryString = Object.keys(safeParams).length > 0
        ? '?' + new URLSearchParams(safeParams).toString()
        : '';

    const url = `${baseUrl}${path}${queryString}`;
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        });

        if (!response.ok) {
            console.warn(`api`);
        }

        const data = await response.text();

        // 请求成功后记录日期到配置
        if (pluginConfig) {
            pluginConfig.set(key, today);
            await pluginConfig.save();
        }

        return {
            success: true,
            data
        };
    } catch (error) {
        return {
            success: false,
            error: `请求出错: ${error instanceof Error ? error.message : String(error)}`
        };
    }
}

// **************************************** Status Bar ****************************************
export async function showStatusMessage(message: string, timeout: number = 3000, id?: string) {
    const statusContainer = document.getElementById('status');
    if (!statusContainer) {
        console.warn("Status bar container (#status) not found.");
        return;
    }

    let customStatusDiv: HTMLDivElement | null = null;

    if (id) {
        customStatusDiv = document.querySelector(`.custom-st-status-message[data-id="${id}"]`);
    }

    if (customStatusDiv) {
        // 如果存在相同 ID 的消息，则更新内容
        customStatusDiv.textContent = message;
    } else {
        // 否则创建新的消息
        customStatusDiv = document.createElement('div');
        customStatusDiv.className = 'custom-st-status-message'; // 使用自定义的 class 名称
        if (id) {
            customStatusDiv.dataset.id = id; // 存储 ID
        }
        customStatusDiv.textContent = message;

        // 添加点击事件监听器
        customStatusDiv.addEventListener('click', () => {
            customStatusDiv?.remove();
        });

        // 将新消息添加到状态栏的开头
        statusContainer.prepend(customStatusDiv);
    }


    if (timeout > 0) {
        setTimeout(() => {
            customStatusDiv?.remove();
        }, timeout);
    }
}