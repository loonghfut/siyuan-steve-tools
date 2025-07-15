

// ============== AVManager 类实现 ==============

import { AttributeViewKey, 
         AttributeViewValue, 
         AVManagerOptions, 
         BlockSource, 
         DuplicateAttributeViewBlockResponse, 
         GetAttributeViewFilterSortResponse, 
         GetAttributeViewPrimaryKeyValuesResponse, 
         GetAttributeViewResponse, 
         GetMirrorDatabaseBlocksResponse, 
         IAVOperator, 
         KeyType, 
         LayoutType, 
         RenderAttributeViewResponse, 
         SearchAttributeViewNonRelationKeyResponse, 
         SearchAttributeViewRelationKeyResponse, 
         SearchAttributeViewResponse, 
         SetAttributeViewBlockAttrResponse, 
         ViewGroup,
        } from "./db_interface";

export class AVManager {
    private baseURL: string = '';
    private defaultHeaders: { [key: string]: string };
    private timeout: number;

    constructor(baseURL = '', options: AVManagerOptions = {}) {
        this.baseURL = baseURL;
        this.defaultHeaders = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        this.timeout = options.timeout || 30000;
    }

    // 生成符合SiYuan规范的随机ID
    generateId(): string {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    // 通用请求方法，包含超时和重试机制
    async request(endpoint: string, data: any = {}): Promise<any> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(`${this.baseURL}/api/av/${endpoint}`, {
                method: 'POST',
                headers: this.defaultHeaders,
                body: JSON.stringify(data),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            if (result.code !== 0) {
                throw new Error(result.msg || '请求失败');
            }
            
            return result.data;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('请求超时');
            }
            console.error(`API调用失败 [${endpoint}]:`, error);
            throw error;
        }
    }

    // ============== 属性视图基础操作 ==============
    
    /**
     * 获取属性视图信息
     * @param avID - 属性视图ID
     * @returns 属性视图信息
     */
    async getAttributeView(avID: string): Promise<GetAttributeViewResponse> {
        if (!avID) throw new Error('avID不能为空');
        return await this.request('getAttributeView', { id: avID });
    }

    /**
     * 渲染属性视图
     * @param avID - 属性视图ID
     * @param options - 渲染选项
     * @returns 渲染结果
     */
    async renderAttributeView(
        avID: string,
        options: { viewID?: string; page?: number; pageSize?: number; query?: any } = {}
    ): Promise<RenderAttributeViewResponse> {
        if (!avID) throw new Error('avID不能为空');
        
        const params = {
            id: avID,
            viewID: options.viewID || undefined,
            page: options.page || 1,
            pageSize: options.pageSize || -1,
            query: options.query || undefined
        };
        
        // 移除undefined值
        Object.keys(params).forEach(key => {
            if (params[key] === undefined) {
                delete params[key];
            }
        });
        
        return await this.request('renderAttributeView', params);
    }

    /**
     * 搜索属性视图
     * @param keyword - 搜索关键词
     * @param excludes - 排除的ID列表
     * @returns 搜索结果
     */
    async searchAttributeView(keyword: string, excludes: string[] = []): Promise<SearchAttributeViewResponse> {
        if (!keyword) throw new Error('keyword不能为空');
        return await this.request('searchAttributeView', { keyword, excludes });
    }

    /**
     * 复制属性视图
     * @param avID - 属性视图ID
     * @returns 复制结果
     */
    async duplicateAttributeView(avID: string): Promise<DuplicateAttributeViewBlockResponse> {
        if (!avID) throw new Error('avID不能为空');
        return await this.request('duplicateAttributeViewBlock', { avID });
    }

    /**
     * 更改布局类型
     * @param avID - 属性视图ID
     * @param blockID - 块ID
     * @param layoutType - 布局类型
     * @returns 渲染结果
     */
    async changeLayout(avID: string, blockID: string, layoutType: LayoutType): Promise<RenderAttributeViewResponse> {
        if (!avID || !blockID || !layoutType) {
            throw new Error('avID、blockID和layoutType不能为空');
        }
        
        const validLayouts = this.getLayoutTypes();
        if (!validLayouts.includes(layoutType)) {
            throw new Error(`无效的布局类型: ${layoutType}`);
        }
        
        return await this.request('changeAttrViewLayout', { avID, blockID, layoutType });
    }

    /**
     * 设置视图分组
     * @param avID - 属性视图ID
     * @param blockID - 块ID
     * @param group - 分组配置
     */
    async setViewGroup(avID: string, blockID: string, group: ViewGroup): Promise<void> {
        if (!avID || !blockID || !group) {
            throw new Error('avID、blockID和group不能为空');
        }
        return await this.request('setAttrViewGroup', { avID, blockID, group });
    }

    // ============== 属性视图键（字段）操作 ==============

    /**
     * 获取属性视图键列表
     * @param avID - 属性视图ID
     * @returns 键列表
     */
    async getAttributeViewKeys(avID: string): Promise<AttributeViewKey[]> {
        if (!avID) throw new Error('avID不能为空');
        return await this.request('getAttributeViewKeys', { id: avID });
    }

    /**
     * 根据avID获取属性视图键
     * @param avID - 属性视图ID
     * @returns 键列表
     */
    async getAttributeViewKeysByAvID(avID: string): Promise<AttributeViewKey[]> {
        if (!avID) throw new Error('avID不能为空');
        return await this.request('getAttributeViewKeysByAvID', { avID });
    }

    /**
     * 添加属性视图键
     * @param avID - 属性视图ID
     * @param options - 键选项
     */
    async addAttributeViewKey(avID: string, options: {
        keyID?: string;
        keyName?: string;
        keyType?: KeyType;
        keyIcon?: string;
        previousKeyID?: string;
    } = {}): Promise<void> {
        if (!avID) throw new Error('avID不能为空');
        
        const keyType = options.keyType || 'text';
        const validTypes = this.getKeyTypes();
        if (!validTypes.includes(keyType)) {
            throw new Error(`无效的键类型: ${keyType}`);
        }
        
        const params = {
            avID,
            keyID: options.keyID || this.generateId(),
            keyName: options.keyName || '新字段',
            keyType,
            keyIcon: options.keyIcon || '',
            previousKeyID: options.previousKeyID || ''
        };
        
        return await this.request('addAttributeViewKey', params);
    }

    /**
     * 删除属性视图键
     * @param avID - 属性视图ID
     * @param keyID - 键ID
     * @param removeRelationDest - 是否删除关联目标
     */
    async removeAttributeViewKey(avID: string, keyID: string, removeRelationDest: boolean = false): Promise<void> {
        if (!avID || !keyID) throw new Error('avID和keyID不能为空');
        return await this.request('removeAttributeViewKey', { avID, keyID, removeRelationDest });
    }

    /**
     * 排序属性视图键
     * @param avID - 属性视图ID
     * @param keyID - 键ID
     * @param previousKeyID - 前一个键ID
     */
    async sortAttributeViewKey(avID: string, keyID: string, previousKeyID: string): Promise<void> {
        if (!avID || !keyID) throw new Error('avID和keyID不能为空');
        return await this.request('sortAttributeViewKey', { avID, keyID, previousKeyID: previousKeyID || '' });
    }

    /**
     * 排序视图中的属性键
     * @param avID - 属性视图ID
     * @param keyID - 键ID
     * @param previousKeyID - 前一个键ID
     * @param viewID - 视图ID
     */
    async sortAttributeViewViewKey(avID: string, keyID: string, previousKeyID: string, viewID: string = ''): Promise<void> {
        if (!avID || !keyID) throw new Error('avID和keyID不能为空');
        return await this.request('sortAttributeViewViewKey', { 
            avID, 
            viewID, 
            keyID, 
            previousKeyID: previousKeyID || '' 
        });
    }

    /**
     * 搜索非关联键
     * @param avID - 属性视图ID
     * @param keyword - 搜索关键词
     * @returns 搜索结果
     */
    async searchNonRelationKey(avID: string, keyword: string): Promise<SearchAttributeViewNonRelationKeyResponse> {
        if (!avID || !keyword) throw new Error('avID和keyword不能为空');
        return await this.request('searchAttributeViewNonRelationKey', { avID, keyword });
    }

    /**
     * 搜索关联键
     * @param avID - 属性视图ID
     * @param keyword - 搜索关键词
     * @returns 搜索结果
     */
    async searchRelationKey(avID: string, keyword: string): Promise<SearchAttributeViewRelationKeyResponse> {
        if (!avID || !keyword) throw new Error('avID和keyword不能为空');
        return await this.request('searchAttributeViewRelationKey', { avID, keyword });
    }

    // ============== 属性视图数据块操作 ==============

    /**
     * 添加属性视图数据块
     * @param avID - 属性视图ID
     * @param sources - 数据源数组
     * @param options - 选项
     */
    async addAttributeViewBlocks(avID: string, sources: BlockSource[], options: {
        blockID?: string;
        previousID?: string;
        ignoreFillFilter?: boolean;
    } = {}): Promise<void> {
        if (!avID || !Array.isArray(sources)) {
            throw new Error('avID不能为空，sources必须是数组');
        }
        
        const params = {
            avID,
            srcs: sources,
            blockID: options.blockID || undefined,
            previousID: options.previousID || undefined,
            ignoreFillFilter: options.ignoreFillFilter !== false
        };
        
        // 移除undefined值
        Object.keys(params).forEach(key => {
            if (params[key] === undefined) {
                delete params[key];
            }
        });
        
        return await this.request('addAttributeViewBlocks', params);
    }

    /**
     * 删除属性视图数据块
     * @param avID - 属性视图ID
     * @param srcIDs - 源ID数组
     */
    async removeAttributeViewBlocks(avID: string, srcIDs: string[]): Promise<void> {
        if (!avID || !Array.isArray(srcIDs)) {
            throw new Error('avID不能为空，srcIDs必须是数组');
        }
        return await this.request('removeAttributeViewBlocks', { avID, srcIDs });
    }

    /**
     * 追加分离的数据块及其值
     * @param avID - 属性视图ID
     * @param blocksValues - 块值数组
     */
    async appendDetachedBlocksWithValues(avID: string, blocksValues: AttributeViewValue[][]): Promise<void> {
        if (!avID || !Array.isArray(blocksValues)) {
            throw new Error('avID不能为空，blocksValues必须是数组');
        }
        return await this.request('appendAttributeViewDetachedBlocksWithValues', { avID, blocksValues });
    }

    /**
     * 获取主键值
     * @param avID - 属性视图ID
     * @param options - 选项
     * @returns 主键值
     */
    async getPrimaryKeyValues(avID: string, options: {
        page?: number;
        pageSize?: number;
        keyword?: string;
    } = {}): Promise<GetAttributeViewPrimaryKeyValuesResponse> {
        if (!avID) throw new Error('avID不能为空');
        
        const params = {
            id: avID,
            page: options.page || 1,
            pageSize: options.pageSize || -1,
            keyword: options.keyword || undefined
        };
        
        // 移除undefined值
        Object.keys(params).forEach(key => {
            if (params[key] === undefined) {
                delete params[key];
            }
        });
        
        return await this.request('getAttributeViewPrimaryKeyValues', params);
    }

    // ============== 属性视图单元格操作 ==============

    /**
     * 设置块属性
     * @param avID - 属性视图ID
     * @param keyID - 键ID
     * @param rowID - 行ID
     * @param value - 值
     * @returns 设置结果
     */
    async setBlockAttribute(avID: string, keyID: string, rowID: string, value: any): Promise<SetAttributeViewBlockAttrResponse> {
        if (!avID || !keyID || !rowID) {
            throw new Error('avID、keyID和rowID不能为空');
        }
        return await this.request('setAttributeViewBlockAttr', { avID, keyID, rowID, value });
    }

    // ============== 数据库视图操作 ==============

    /**
     * 设置数据库块视图
     * @param blockID - 块ID
     * @param avID - 属性视图ID
     * @param viewID - 视图ID
     */
    async setDatabaseBlockView(blockID: string, avID: string, viewID: string): Promise<void> {
        if (!blockID || !avID || !viewID) {
            throw new Error('blockID、avID和viewID不能为空');
        }
        return await this.request('setDatabaseBlockView', { id: blockID, avID, viewID });
    }

    /**
     * 获取镜像数据库块
     * @param avID - 属性视图ID
     * @returns 镜像数据库块
     */
    async getMirrorDatabaseBlocks(avID: string): Promise<GetMirrorDatabaseBlocksResponse> {
        if (!avID) throw new Error('avID不能为空');
        return await this.request('getMirrorDatabaseBlocks', { avID });
    }

    // ============== 过滤和排序操作 ==============

    /**
     * 获取过滤和排序配置
     * @param avID - 属性视图ID
     * @param blockID - 块ID
     * @returns 过滤和排序配置
     */
    async getFilterSort(avID: string, blockID: string): Promise<GetAttributeViewFilterSortResponse> {
        if (!avID || !blockID) throw new Error('avID和blockID不能为空');
        return await this.request('getAttributeViewFilterSort', { id: avID, blockID });
    }

    // ============== 历史和快照操作 ==============

    /**
     * 渲染历史属性视图
     * @param avID - 属性视图ID
     * @param created - 创建时间
     * @returns 渲染结果
     */
    async renderHistoryAttributeView(avID: string, created: string): Promise<RenderAttributeViewResponse> {
        if (!avID || !created) throw new Error('avID和created不能为空');
        return await this.request('renderHistoryAttributeView', { id: avID, created });
    }

    /**
     * 渲染快照属性视图
     * @param avID - 属性视图ID
     * @param snapshot - 快照标识
     * @returns 渲染结果
     */
    async renderSnapshotAttributeView(avID: string, snapshot: string): Promise<RenderAttributeViewResponse> {
        if (!avID || !snapshot) throw new Error('avID和snapshot不能为空');
        return await this.request('renderSnapshotAttributeView', { id: avID, snapshot });
    }

    // ============== 图片和资源操作 ==============

    /**
     * 获取当前图片
     * @param avID - 属性视图ID
     * @param options - 选项
     * @returns 图片列表
     */
    async getCurrentImages(avID: string, options: {
        viewID?: string;
        query?: string;
    } = {}): Promise<string[]> {
        if (!avID) throw new Error('avID不能为空');
        
        const params = {
            id: avID,
            viewID: options.viewID || undefined,
            query: options.query || undefined
        };
        
        // 移除undefined值
        Object.keys(params).forEach(key => {
            if (params[key] === undefined) {
                delete params[key];
            }
        });
        
        return await this.request('getCurrentAttrViewImages', params);
    }

    // ============== 便捷操作方法 ==============

    async createTextKey(avID: string, keyName: string, previousKeyID: string = ''): Promise<void> {
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'text', previousKeyID });
    }

    async createNumberKey(avID: string, keyName: string, previousKeyID: string = ''): Promise<void> {
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'number', previousKeyID });
    }

    async createDateKey(avID: string, keyName: string, previousKeyID: string = ''): Promise<void> {
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'date', previousKeyID });
    }

    async createSelectKey(avID: string, keyName: string, previousKeyID: string = ''): Promise<void> {
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'select', previousKeyID });
    }

    async createMSelectKey(avID: string, keyName: string, previousKeyID: string = ''): Promise<void> {
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'mSelect', previousKeyID });
    }

    async createRelationKey(avID: string, keyName: string, previousKeyID: string = ''): Promise<void> {
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'relation', previousKeyID });
    }

    async createCheckboxKey(avID: string, keyName: string, previousKeyID: string = ''): Promise<void> {
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'checkbox', previousKeyID });
    }

    async createUrlKey(avID: string, keyName: string, previousKeyID: string = ''): Promise<void> {
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'url', previousKeyID });
    }

    async createEmailKey(avID: string, keyName: string, previousKeyID: string = ''): Promise<void> {
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'email', previousKeyID });
    }

    async createPhoneKey(avID: string, keyName: string, previousKeyID: string = ''): Promise<void> {
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'phone', previousKeyID });
    }

    async createTemplateKey(avID: string, keyName: string, previousKeyID: string = ''): Promise<void> {
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'template', previousKeyID });
    }

    async createCreatedKey(avID: string, keyName: string, previousKeyID: string = ''): Promise<void> {
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'created', previousKeyID });
    }

    async createUpdatedKey(avID: string, keyName: string, previousKeyID: string = ''): Promise<void> {
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'updated', previousKeyID });
    }

    // ============== 批量操作方法 ==============

    /**
     * 批量添加数据块
     * @param avID - 属性视图ID
     * @param blocks - 块数组
     * @param options - 选项
     */
    async batchAddBlocks(avID: string, blocks: Array<{
        id?: string;
        content?: string;
        markdown?: string;
        [key: string]: any;
    }>, options: {
        blockID?: string;
        previousID?: string;
        ignoreFillFilter?: boolean;
    } = {}): Promise<void> {
        if (!Array.isArray(blocks)) throw new Error('blocks必须是数组');
        
        const sources = blocks.map(block => ({
            id: block.id || this.generateId(),
            content: block.content || '',
            markdown: block.markdown || '',
            ...block
        }));
        
        return await this.addAttributeViewBlocks(avID, sources, options);
    }

    /**
     * 批量删除数据块
     * @param avID - 属性视图ID
     * @param blockIDs - 块ID数组
     */
    async batchRemoveBlocks(avID: string, blockIDs: string[]): Promise<void> {
        return await this.removeAttributeViewBlocks(avID, blockIDs);
    }

    /**
     * 批量更新单元格
     * @param avID - 属性视图ID
     * @param updates - 更新数组
     * @returns 更新结果
     */
    async batchUpdateCells(avID: string, updates: Array<{
        keyID: string;
        rowID: string;
        value: any;
    }>): Promise<Array<{ success: boolean; result?: any; error?: string }>> {
        if (!Array.isArray(updates)) throw new Error('updates必须是数组');
        
        const results = [];
        for (const update of updates) {
            try {
                const result = await this.setBlockAttribute(avID, update.keyID, update.rowID, update.value);
                results.push({ success: true, result });
            } catch (error) {
                results.push({ success: false, error: error.message });
            }
        }
        return results;
    }

    // ============== 工具方法 ==============

    /**
     * 获取支持的布局类型
     * @returns 布局类型数组
     */
    getLayoutTypes(): LayoutType[] {
        return ['table', 'board', 'calendar', 'gallery'];
    }

    /**
     * 获取支持的键类型
     * @returns 键类型数组
     */
    getKeyTypes(): KeyType[] {
        return [
            'text', 'number', 'date', 'select', 'mSelect', 
            'relation', 'checkbox', 'url', 'email', 'phone', 
            'template', 'created', 'updated'
        ];
    }

    /**
     * 验证布局类型
     * @param layoutType - 布局类型
     * @returns 是否有效
     */
    isValidLayoutType(layoutType: string): layoutType is LayoutType {
        return this.getLayoutTypes().includes(layoutType as LayoutType);
    }

    /**
     * 验证键类型
     * @param keyType - 键类型
     * @returns 是否有效
     */
    isValidKeyType(keyType: string): keyType is KeyType {
        return this.getKeyTypes().includes(keyType as KeyType);
    }

    // ============== 链式操作支持 ==============

    /**
     * 创建链式操作对象
     * @param avID - 属性视图ID
     * @returns 链式操作对象
     */
    withAV(avID: string): IAVOperator {
        if (!avID) throw new Error('avID不能为空');
        
        return {
            avID,
            manager: this,
            
            async render(options = {}) {
                return await this.manager.renderAttributeView(this.avID, options);
            },
            
            async addKey(options = {}) {
                return await this.manager.addAttributeViewKey(this.avID, options);
            },
            
            async removeKey(keyID, removeRelationDest = false) {
                return await this.manager.removeAttributeViewKey(this.avID, keyID, removeRelationDest);
            },
            
            async addBlocks(sources, options = {}) {
                return await this.manager.addAttributeViewBlocks(this.avID, sources, options);
            },
            
            async removeBlocks(srcIDs) {
                return await this.manager.removeAttributeViewBlocks(this.avID, srcIDs);
            },
            
            async setCell(keyID, rowID, value) {
                return await this.manager.setBlockAttribute(this.avID, keyID, rowID, value);
            },
            
            async getKeys() {
                return await this.manager.getAttributeViewKeys(this.avID);
            },
            
            async getPrimaryKeys(options = {}) {
                return await this.manager.getPrimaryKeyValues(this.avID, options);
            },
            
            async duplicate() {
                return await this.manager.duplicateAttributeView(this.avID);
            },
            
            async getFilterSort(blockID) {
                return await this.manager.getFilterSort(this.avID, blockID);
            },
            
            async getMirrorBlocks() {
                return await this.manager.getMirrorDatabaseBlocks(this.avID);
            },
            
            async getCurrentImages(options = {}) {
                return await this.manager.getCurrentImages(this.avID, options);
            }
        };
    }
}

// 导出类
export default AVManager;

// 兼容性导出
declare global {
    interface Window {
        AVManager: typeof AVManager;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AVManager;
} else if (typeof window !== 'undefined') {
    window.AVManager = AVManager;
}