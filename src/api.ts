/**
 * Copyright (c) 2023 frostime. All rights reserved.
 * https://github.com/frostime/sy-plugin-template-vite
 * 
 * See API Document in [API.md](https://github.com/siyuan-note/siyuan/blob/master/API.md)
 * API 文档见 [API_zh_CN.md](https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md)
 */

import { fetchPost, fetchSyncPost, IWebSocketData } from "siyuan";
import { IOperation, Protyle } from "siyuan";
import { ISelectOption } from "@/calendar/interface";

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
    location.reload()
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


export async function addBlockToDatabase_pro(id: string, avID: string, protyle?: Protyle) {
    let doOperations: IOperation[] = [];
    let undoOperations: IOperation[] = [];
    doOperations.push(
        {
            action: "insertAttrViewBlock",
            avID: avID,
            ignoreFillFilter: true,
            srcs: [{
                id: id,
                isDetached: false
            }],
            // blockID: avID //TODO:这里的blockID是数据库块的id
        },
    );
    doOperations.push(
        {
            action: "doUpdateUpdated",
            id: id,
            data: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().replace(/[:\-]|(\.\d{3})|T/g, "").slice(0, 14)
        }
    );
    undoOperations.push(
        {
            action: "removeAttrViewBlock",
            srcIDs: [id],
            avID: avID
        }
    );
    Protyle.prototype.transaction(doOperations, undoOperations);
}



export async function updateAttrViewCell_pro(
    id: string,
    avID: string,
    keyID: string,
    value: string | Date | ISelectOption[] | {
        blockID: string,
        content: string,
        oldrelation: {
            ids: string[],
            contents: string[]
        },
        action: string
    },
    type: 'date' | 'select' | 'relation',
    endtime?: string
) {
    const doOperations: IOperation[] = [];
    const newId = await generateSiyuanID();
    let cellData: any;

    switch (type) {
        case 'date':
            const { start, end } = await getDateTimestamps(value as string);
            cellData = {
                type: "date",
                date: {
                    content: start,
                    isNotEmpty: true,
                    content2: endtime ? (await getDateTimestamps(endtime)).start : end,
                    isNotEmpty2: true,
                    hasEndDate: true,
                    isNotTime: false
                },
                id
            };
            break;

        case 'select':
            cellData = {
                type: "select",
                id: newId,
                mSelect: value as ISelectOption[]
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
                if (oldrelation.ids.includes(blockID)) return;
                oldrelation.ids.push(blockID);
                readyContents.push({
                    block: { content: content, id: blockID },
                    isDetached: false,
                    type: "block"
                });
            } else if (action === 'remove') {
                const index = oldrelation.ids.indexOf(blockID);
                if (index === -1) return;
                oldrelation.ids.splice(index, 1);
                readyContents.splice(index, 1);
            } else {
                console.error("action error");
                return
            }
            cellData = {
                type: "relation",
                id: newId,
                relation: {
                    blockIDs: oldrelation.ids,
                    contents: readyContents
                }
            };
            break;
    }

    doOperations.push({
        action: "updateAttrViewCell",
        id: newId,
        avID,
        keyID,
        rowID: id,
        data: cellData
    });

    doOperations.push({
        action: "doUpdateUpdated",
        id,
        data: new Date(Date.now() + 8 * 60 * 60 * 1000)
            .toISOString()
            .replace(/[:\-]|(\.\d{3})|T/g, "")
            .slice(0, 14)
    });

    Protyle.prototype.transaction(doOperations, []);
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




export async function generateSiyuanID() {
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
    return `${timestamp}-${randomStr}`;
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
        return {
            start: date.getTime(),
            end: date.getTime() + 3600000 // 加一小时(1000 * 60 * 60)
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