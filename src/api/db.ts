/**
 * DbService 类封装了数据库属性视图相关的 API 操作。
 */
export class DbService {
    private _avId: string;

    /**
     * 构造函数，初始化属性视图ID
     * @param avId 属性视图ID
     */
    constructor(avId: string) {
        this._avId = avId;
    }

    /**
     * 发送 POST 请求到指定 API 路径。
     * @param path API 路径
     * @param data 请求体数据
     */
    private async api(path: string, data: any = {}) {
        const response = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        return response.json();
    }

    /**
     * 获取属性视图的所有字段（键）。
     */
    async getKeys() {
        const res = await this.api('/api/av/getAttributeViewKeysByAvID', { avID: this._avId });
        return res.data || [];
    }

    /**
     * 渲染属性视图，支持分页和指定视图。
     * @param viewId 视图ID
     * @param page 页码
     * @param pageSize 每页数量
     */
    async render(viewId = '', page = 1, pageSize = -1) {
        const res = await this.api('/api/av/renderAttributeView', { id: this._avId, viewID: viewId, query: '', page, pageSize });
        return res.data || {};
    }

    /**
     * 添加一个字段（键）。
     * @param keyID 字段ID
     * @param keyName 字段名称
     * @param keyType 字段类型
     * @param keyIcon 字段图标
     * @param previousKeyID 插入位置前的字段ID
     */
    async addKey(keyID: string, keyName: string, keyType: string, keyIcon = '', previousKeyID = '') {
        return this.api('/api/av/addAttributeViewKey', { avID: this._avId, keyID, keyName, keyType, keyIcon, previousKeyID });
    }

    /**
     * 删除指定字段（键）。
     * @param keyID 字段ID
     */
    async removeKey(keyID: string) {
        return this.api('/api/av/removeAttributeViewKey', { avID: this._avId, keyID });
    }

    /**
     * 添加一行数据（块）。
     * @param values 字段值数组
     */
    async addRow(values: any[]) {
        return this.api('/api/av/appendAttributeViewDetachedBlocksWithValues', { avID: this._avId, blocksValues: [values] });
    }

    /**
     * 更新某行某字段的值。
     * @param rowId 行ID
     * @param keyId 字段ID
     * @param value 新值
     */
    async updateField(itemID: string, keyId: string, value: any) {
        return this.api('/api/av/setAttributeViewBlockAttr', { avID: this._avId, itemID, keyID: keyId, value });
    }

    /**
     * 批量删除指定行（块）。
     * @param rowIds 行ID数组
     */
    async removeRows(rowIds: string[]) {
        return this.api('/api/av/removeAttributeViewBlocks', { avID: this._avId, srcIDs: rowIds });
    }

    /**
     * 执行一组操作（事务），支持撤销操作。
     * @param operations 操作数组
     * @param undoOperations 撤销操作数组
     */
    // async transaction(operations: any[], undoOperations: any[] = []) {
    // }

}