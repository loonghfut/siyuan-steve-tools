// ============== AVManager 类实现 ==============

import { showMessage } from "siyuan";
import {
    AttributeViewKey,
    AttributeViewValue,
    AVManagerOptions,
    BlockSource,
    BatchReplaceAttributeViewBlocksRequest,
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
    setAttributeViewValue,
    ViewGroup,
} from "./db_interface";
import { updateMainBlockName } from "./api";

export class AVManager {
    private baseURL: string = '';
    private defaultHeaders: { [key: string]: string };
    private timeout: number;
    // 键缓存，用于减少API调用
    private keyCache: Map<string, { keys: AttributeViewKey[], timestamp: number }> = new Map();
    private cacheTimeout: number = 1 * 60 * 1000; // 1分钟缓存

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

            // 以文本读取以提高对空响应/非 JSON 响应的容错性
            const raw = await response.text();
            if (!raw || raw.trim() === '') {
                throw new Error(`响应为空（${endpoint}）`);
            }
            let parsed: any;
            try {
                parsed = JSON.parse(raw);
            } catch (e: any) {
                const preview = raw.length > 200 ? raw.slice(0, 200) + '…' : raw;
                throw new Error(`JSON 解析失败（${endpoint}）：${e?.message || e}，响应片段：${preview}`);
            }

            if (parsed.code !== 0) {
                throw new Error(parsed.msg || '请求失败');
            }

            return parsed.data;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('请求超时');
            }
            console.error(`API调用失败 [${endpoint}]:`, error);
            throw error;
        }
    }

    // ============== 缓存相关方法 ==============

    /**
     * 获取属性视图键（带缓存）
     * @param avID - 属性视图ID
     * @param forceRefresh - 是否强制刷新缓存
     * @returns 键列表
     */
    private async getAttributeViewKeysWithCache(avID: string, forceRefresh: boolean = false): Promise<AttributeViewKey[]> {
        const now = Date.now();
        const cached = this.keyCache.get(avID);

        if (!forceRefresh && cached && (now - cached.timestamp) < this.cacheTimeout) {
            return cached.keys;
        }

        const keys = await this.getAttributeViewKeysByAvID(avID);
        this.keyCache.set(avID, { keys, timestamp: now });
        return keys;
    }

    /**
     * 根据键名查找键ID
     * @param avID - 属性视图ID
     * @param keyName - 键名称
     * @returns 键对象
     */
    private async findKeyByName(avID: string, keyName: string): Promise<AttributeViewKey> {
        const keys = await this.getAttributeViewKeysWithCache(avID);
        const key = keys.find(k => k.name === keyName);
        // console.log("kEEY", key);
        if (!key) {
            showMessage(`未找到名称为 ${keyName} 的属性键`, -1, "error");
            console.error(`未找到名称为 ${keyName} 的属性键`);
        }
        return key;
    }


    private async findMainKey(avID: string): Promise<AttributeViewKey> {
        const keys = await this.getAttributeViewKeysWithCache(avID);
        const key = keys.find(k => k.type === 'block');
        if (!key) {
            showMessage(`未找到类型为 block 的属性键`, -1, "error");
            console.error(`未找到类型为 block 的属性键`);
            throw new Error('未找到类型为 block 的属性键');
        }
        return key;
    }

    /**
     * 清除键缓存
     * @param avID - 属性视图ID（可选，不传则清除所有缓存）
     */
    clearKeyCache(avID?: string): void {
        if (avID) {
            this.keyCache.delete(avID);
        } else {
            this.keyCache.clear();
        }
    }

    // ============== 属性视图基础操作 ==============

    /**
     * 获取属性视图信息
     * @param avID - 属性视图ID
     * @returns 属性视图信息
     * ok
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
            pageSize: options.pageSize || 99999,
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
     * ?
     */
    async getAttributeViewKeys(blockID: string): Promise<AttributeViewKey[]> {
        if (!blockID) throw new Error('avID不能为空');
        return await this.request('getAttributeViewKeys', { id: blockID });
    }

    /**
     * 根据avID获取属性视图键
     * @param avID - 属性视图ID
     * @returns 键列表
     * ok
     */
    async getAttributeViewKeysByAvID(avID: string): Promise<AttributeViewKey[]> {
        if (!avID) throw new Error('avID不能为空');
        return await this.request('getAttributeViewKeysByAvID', { avID });
    }

    /**
     * 添加属性视图键
     * @param avID - 属性视图ID
     * @param options - 键选项
     * ok
     */
    async addAttributeViewKey(avID: string, options: {
        keyID?: string;
        keyName?: string;
        keyType?: KeyType;
        keyIcon?: string;
        previousKeyID?: string;
        previousKeyName?: string;
    } = {}): Promise<void> {
        if (!avID) throw new Error('avID不能为空');

        if (options.keyType === 'block') {
            // showMessage(`修改 block 类型的键`, -1, "error");
            const previousKey1 = await this.findMainKey(avID);
            updateMainBlockName(previousKey1.id, avID, options.keyName);
            return;
        }

        const keyType = options.keyType || 'text';
        const validTypes = this.getKeyTypes();
        if (!validTypes.includes(keyType)) {
            throw new Error(`无效的键类型: ${keyType}`);
        }

        // 处理previousKeyID，优先使用previousKeyName
        let previousKeyID = options.previousKeyID || '';
        if (options.previousKeyName) {
            const previousKey = await this.findKeyByName(avID, options.previousKeyName);
            previousKeyID = previousKey.id;
        }



        const params = {
            avID,
            keyID: options.keyID || this.generateId(),
            keyName: options.keyName || '新字段',
            keyType,
            keyIcon: options.keyIcon || '',
            previousKeyID
        };

        const result = await this.request('addAttributeViewKey', params);
        // 添加键后清除缓存
        this.clearKeyCache(avID);
        return result;
    }

    /**
     * 删除属性视图键
     * @param avID - 属性视图ID
     * @param keyID - 键ID
     * @param removeRelationDest - 是否删除关联目标
     */
    async removeAttributeViewKey(avID: string, keyID: string, removeRelationDest: boolean = false): Promise<void> {
        if (!avID || !keyID) throw new Error('avID和keyID不能为空');
        const result = await this.request('removeAttributeViewKey', { avID, keyID, removeRelationDest });
        // 删除键后清除缓存
        this.clearKeyCache(avID);
        return result;
    }

    /**
     * 根据属性名称删除属性视图键
     * @param avID - 属性视图ID
     * @param keyName - 键名称
     * @param removeRelationDest - 是否删除关联目标
     * ok
     */
    async removeAttributeViewKeyByName(avID: string, keyName: string, removeRelationDest: boolean = false): Promise<void> {
        if (!avID || !keyName) throw new Error('avID和keyName不能为空');
        const keys = await this.getAttributeViewKeysByAvID(avID);
        const key = keys.find(k => k.name === keyName);
        if (!key) throw new Error(`未找到名称为 ${keyName} 的属性键`);
        return await this.removeAttributeViewKey(avID, key.id, removeRelationDest);
    }

    /**
     * 排序属性视图键
     * @param avID - 属性视图ID
     * @param keyName - 键名称
     * @param previousKeyName - 前一个键名称
     */
    async sortAttributeViewKey(avID: string, keyName: string, previousKeyName: string): Promise<void> {
        if (!avID || !keyName) throw new Error('avID和keyName不能为空');
        const key = await this.findKeyByName(avID, keyName);
        const previousKey = previousKeyName ? await this.findKeyByName(avID, previousKeyName) : null;
        return await this.request('sortAttributeViewKey', {
            avID,
            keyID: key.id,
            previousKeyID: previousKey?.id || ''
        });
    }

    /**
     * 排序视图中的属性键
     * @param avID - 属性视图ID
     * @param keyName - 键名称
     * @param previousKeyName - 前一个键名称
     * @param viewID - 视图ID
     */
    async sortAttributeViewViewKey(avID: string, keyName: string, previousKeyName: string, viewID: string = ''): Promise<void> {
        if (!avID || !keyName) throw new Error('avID和keyName不能为空');
        const key = await this.findKeyByName(avID, keyName);
        const previousKey = previousKeyName ? await this.findKeyByName(avID, previousKeyName) : null;
        return await this.request('sortAttributeViewViewKey', {
            avID,
            viewID,
            keyID: key.id,
            previousKeyID: previousKey?.id || ''
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
     * 根据一组 itemID 获取其绑定的块 ID 映射
     * /api/av/getAttributeViewBoundBlockIDsByItemIDs
     * @param avID 属性视图 ID
     * @param itemIDs 项目(行) ID 列表
     * @returns 形如 { itemID: blockID | "" } 的映射 (空字符串表示未绑定块)
     */
    async getBoundBlockIDsByItemIDs(avID: string, itemIDs: string[]): Promise<Record<string, string>> {
        if (!avID) throw new Error('avID不能为空');
        if (!Array.isArray(itemIDs)) throw new Error('itemIDs 必须是数组');
        if (itemIDs.length === 0) return {};
        return await this.request('getAttributeViewBoundBlockIDsByItemIDs', { avID, itemIDs });
    }

    /**
     * 根据一组绑定块 ID 获取对应的 itemID 映射
     * /api/av/getAttributeViewItemIDsByBoundIDs
     * @param avID 属性视图 ID
     * @param blockIDs 绑定块 ID 列表
     * @returns 形如 { blockID: itemID } 的映射
     */
    async getItemIDsByBoundIDs(avID: string, blockIDs: string[]): Promise<Record<string, string>> {
        if (!avID) throw new Error('avID不能为空');
        if (!Array.isArray(blockIDs)) throw new Error('blockIDs 必须是数组');
        if (blockIDs.length === 0) return {};
        return await this.request('getAttributeViewItemIDsByBoundIDs', { avID, blockIDs });
    }

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

        // 转换keyName为keyID
        const processedBlocksValues = await Promise.all(
            blocksValues.map(async (blockValues) => {
                return await Promise.all(
                    blockValues.map(async (value) => {
                        // 如果提供了keyName但没有keyID，则查找keyID
                        if (value.keyName && !value.keyID) {
                            const key = await this.findKeyByName(avID, value.keyName);
                            return { ...value, keyID: key.id };
                        }
                        // 如果既没有keyName也没有keyID，抛出错误
                        if (!value.keyID && !value.keyName) {
                            throw new Error(`每个属性值必须包含keyID或keyName`);
                        }
                        return value;
                    })
                );
            })
        );

        return await this.request('appendAttributeViewDetachedBlocksWithValues', {
            avID,
            blocksValues: processedBlocksValues
        });
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
            pageSize: options.pageSize || 99999,
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
     * @param keyName - 键名称
     * @param rowID - 行ID
     * @param value - 值
     * @returns 设置结果
     */
    async setBlockAttribute(avID: string, keyName: string, itemID: string | undefined, value: setAttributeViewValue, blockID?: string): Promise<SetAttributeViewBlockAttrResponse> {
        if (!avID || !keyName) {
            throw new Error('avID、keyName不能为空');
        }
        // 若未提供 itemID 但提供了 blockID，则映射获取 itemID
        if (!itemID && blockID) {
            const map = await this.getItemIDsByBoundIDs(avID, [blockID]);
            itemID = map[blockID];
        }
        if (!itemID) {
            throw new Error('缺少 itemID，且无法通过 blockID 映射获得');
        }
        const key = await this.findKeyByName(avID, keyName);
        return await this.request('setAttributeViewBlockAttr', { avID, keyID: key.id, itemID, value });
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

    async createTextKey(avID: string, keyName: string, previousKeyName: string = ''): Promise<void> {
        const previousKey = previousKeyName ? await this.findKeyByName(avID, previousKeyName) : null;
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'text', previousKeyID: previousKey?.id || '' });
    }

    async createNumberKey(avID: string, keyName: string, previousKeyName: string = ''): Promise<void> {
        const previousKey = previousKeyName ? await this.findKeyByName(avID, previousKeyName) : null;
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'number', previousKeyID: previousKey?.id || '' });
    }

    async createDateKey(avID: string, keyName: string, previousKeyName: string = ''): Promise<void> {
        const previousKey = previousKeyName ? await this.findKeyByName(avID, previousKeyName) : null;
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'date', previousKeyID: previousKey?.id || '' });
    }

    async createSelectKey(avID: string, keyName: string, previousKeyName: string = ''): Promise<void> {
        const previousKey = previousKeyName ? await this.findKeyByName(avID, previousKeyName) : null;
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'select', previousKeyID: previousKey?.id || '' });
    }

    async createMSelectKey(avID: string, keyName: string, previousKeyName: string = ''): Promise<void> {
        const previousKey = previousKeyName ? await this.findKeyByName(avID, previousKeyName) : null;
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'mSelect', previousKeyID: previousKey?.id || '' });
    }

    async createRelationKey(avID: string, keyName: string, previousKeyName: string = ''): Promise<void> {
        const previousKey = previousKeyName ? await this.findKeyByName(avID, previousKeyName) : null;
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'relation', previousKeyID: previousKey?.id || '' });
    }

    async createCheckboxKey(avID: string, keyName: string, previousKeyName: string = ''): Promise<void> {
        const previousKey = previousKeyName ? await this.findKeyByName(avID, previousKeyName) : null;
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'checkbox', previousKeyID: previousKey?.id || '' });
    }

    async createUrlKey(avID: string, keyName: string, previousKeyName: string = ''): Promise<void> {
        const previousKey = previousKeyName ? await this.findKeyByName(avID, previousKeyName) : null;
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'url', previousKeyID: previousKey?.id || '' });
    }

    async createEmailKey(avID: string, keyName: string, previousKeyName: string = ''): Promise<void> {
        const previousKey = previousKeyName ? await this.findKeyByName(avID, previousKeyName) : null;
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'email', previousKeyID: previousKey?.id || '' });
    }

    async createPhoneKey(avID: string, keyName: string, previousKeyName: string = ''): Promise<void> {
        const previousKey = previousKeyName ? await this.findKeyByName(avID, previousKeyName) : null;
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'phone', previousKeyID: previousKey?.id || '' });
    }

    async createTemplateKey(avID: string, keyName: string, previousKeyName: string = ''): Promise<void> {
        const previousKey = previousKeyName ? await this.findKeyByName(avID, previousKeyName) : null;
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'template', previousKeyID: previousKey?.id || '' });
    }

    async createCreatedKey(avID: string, keyName: string, previousKeyName: string = ''): Promise<void> {
        const previousKey = previousKeyName ? await this.findKeyByName(avID, previousKeyName) : null;
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'created', previousKeyID: previousKey?.id || '' });
    }

    async createUpdatedKey(avID: string, keyName: string, previousKeyName: string = ''): Promise<void> {
        const previousKey = previousKeyName ? await this.findKeyByName(avID, previousKeyName) : null;
        return await this.addAttributeViewKey(avID, { keyName, keyType: 'updated', previousKeyID: previousKey?.id || '' });
    }

    // ============== 批量操作方法 ==============

    /**
     * 批量添加数据块
     * @param avID - 属性视图ID
     * @param blocks - 块数组
     * @param options - 选项
     * ok
     */
    async batchAddBlocks(avID: string, blocks: Array<{
        id: string;
        content?: string;
        isDetached: boolean;
        itemID: string;
    }>, options: {
        blockID?: string;
        previousID?: string;
        ignoreFillFilter?: boolean;
    } = {}): Promise<void> {
        if (!Array.isArray(blocks)) throw new Error('blocks必须是数组');

        const sources = blocks.map(block => ({
            id: block.id || this.generateId(),
            isDetached: block.isDetached !== undefined ? block.isDetached : false,
            content: block.content || '',
            itemID: block.itemID || this.generateId(),
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
     * 批量替换属性视图中的块 (内核 API: /api/av/batchReplaceAttributeViewBlocks)
     * @param avID 属性视图 ID
     * @param mappings 旧块 -> 新块 的映射，如 [{"oldID":"newID"}]
     * @param isDetached 是否作为游离块（默认 false 与内核一致）
     */
    async batchReplaceBlocks(avID: string, mappings: Array<Record<string, string>>, isDetached: boolean = false): Promise<void> {
        if (!avID) throw new Error('avID不能为空');
        if (!Array.isArray(mappings) || mappings.length === 0) throw new Error('mappings 必须是非空数组');

        const payload: BatchReplaceAttributeViewBlocksRequest = {
            avID,
            isDetached,
            oldNew: mappings
        };
        return await this.request('batchReplaceAttributeViewBlocks', payload);
    }

    /**
     * 批量更新单元格（使用原生批量API）
     * @param avID - 属性视图ID
     * @param updates - 更新数组
     * @returns 更新结果
     */
    async batchUpdateCells(avID: string, updates: Array<{
        keyName: string;
        rowID?: string; // itemID
        blockID?: string; // 若提供且 rowID 缺失则自动映射
        value: setAttributeViewValue;
    }>): Promise<any> {
        if (!avID) throw new Error('avID不能为空');
        if (!Array.isArray(updates)) throw new Error('updates必须是数组');
        if (updates.length === 0) return { success: true, message: '没有需要更新的数据' };

        // 收集需要通过 blockID 映射的项
        const needMapBlockIDs = Array.from(new Set(
            updates.filter(u => !u.rowID && u.blockID).map(u => u.blockID as string)
        ));
        let blockToItem: Record<string, string> = {};
        if (needMapBlockIDs.length > 0) {
            blockToItem = await this.getItemIDsByBoundIDs(avID, needMapBlockIDs);
        }

        // 转换keyName为keyID
        const processedValues = await Promise.all(
            updates.map(async (update) => {
                let { rowID } = update;
                if (!rowID && update.blockID) {
                    rowID = blockToItem[update.blockID];
                }
                if (!update.keyName || !rowID) {
                    throw new Error('每个更新项必须包含keyName且需提供 rowID 或 blockID');
                }

                const key = await this.findKeyByName(avID, update.keyName);
                return {
                    keyID: key.id,
                    itemID: rowID,
                    value: update.value
                };
            })
        );

        return await this.request('batchSetAttributeViewBlockAttrs', {
            avID,
            values: processedValues
        });
    }

    /**
     * 批量更新单元格（兼容旧版本，逐个更新）
     * @param avID - 属性视图ID
     * @param updates - 更新数组
     * @returns 更新结果
     * @deprecated 建议使用 batchUpdateCells 方法，性能更好
     */
    async batchUpdateCellsLegacy(avID: string, updates: Array<{
        keyName: string;
        rowID?: string;
        blockID?: string;
        value: setAttributeViewValue;
    }>): Promise<Array<{ success: boolean; result?: any; error?: string }>> {
        if (!Array.isArray(updates)) throw new Error('updates必须是数组');

        // 预映射
        const needMapBlockIDs = Array.from(new Set(
            updates.filter(u => !u.rowID && u.blockID).map(u => u.blockID as string)
        ));
        let blockToItem: Record<string, string> = {};
        if (needMapBlockIDs.length > 0) {
            blockToItem = await this.getItemIDsByBoundIDs(avID, needMapBlockIDs);
        }

        const results = [];
        for (const update of updates) {
            try {
                let rowID = update.rowID;
                if (!rowID && update.blockID) {
                    rowID = blockToItem[update.blockID];
                }
                const result = await this.setBlockAttribute(avID, update.keyName, rowID, update.value, update.blockID);
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
    createOperator(avID: string): AVOperator {
        return new AVOperator(avID, this);
    }
}

// AVOperator 类应在 AVManager 外部定义
class AVOperator implements IAVOperator {
    avID: string;
    manager: AVManager;

    constructor(avID: string, manager: AVManager) {
        this.avID = avID;
        this.manager = manager;
    }

    async render(options: {
        viewID?: string;
        page?: number;
        pageSize?: number;
        query?: string;
    } = {}): Promise<RenderAttributeViewResponse> {
        return await this.manager.renderAttributeView(this.avID, options);
    }

    async addKey(options: {
        keyID?: string;
        keyName?: string;
        keyType?: KeyType;
        keyIcon?: string;
        previousKeyID?: string;
        previousKeyName?: string;
    } = {}): Promise<void> {
        return await this.manager.addAttributeViewKey(this.avID, options);
    }

    async removeKey(keyName: string, removeRelationDest: boolean = false): Promise<void> {
        return await this.manager.removeAttributeViewKeyByName(this.avID, keyName, removeRelationDest);
    }

    async removeKeyByName(keyName: string, removeRelationDest: boolean = false): Promise<void> {
        return await this.manager.removeAttributeViewKeyByName(this.avID, keyName, removeRelationDest);
    }

    async addBlocksMore(blocksValues: AttributeViewValue[][]): Promise<void> {
        return await this.manager.appendDetachedBlocksWithValues(this.avID, blocksValues);
    }

    async addBlocks(
        sources: BlockSource[],
        options: {
            blockID?: string;
            previousID?: string;
            ignoreFillFilter?: boolean;
        } = {}
    ): Promise<void> {
        return await this.manager.addAttributeViewBlocks(this.avID, sources, options);
    }

    async removeBlocks(srcIDs: string[]): Promise<void> {
        return await this.manager.removeAttributeViewBlocks(this.avID, srcIDs);
    }

    async setCell(
        keyName: string,
        itemID: string | undefined,
        value: setAttributeViewValue,
        blockID?: string
    ): Promise<SetAttributeViewBlockAttrResponse> {
        return await this.manager.setBlockAttribute(this.avID, keyName, itemID, value, blockID);
    }

    async setCells(
        updates: Array<{
            keyName: string;
            rowID?: string;
            blockID?: string;
            value: setAttributeViewValue;
        }>
    ): Promise<any> {
        return await this.manager.batchUpdateCells(this.avID, updates);
    }

    /**
     * 批量替换块
     * @param mappings 映射数组 [{oldID: newID}, ...]
     * @param isDetached 是否游离
     */
    async replaceBlocks(mappings: Array<Record<string, string>>, isDetached: boolean = false): Promise<void> {
        return await this.manager.batchReplaceBlocks(this.avID, mappings, isDetached);
    }

    async getKeys(): Promise<AttributeViewKey[]> {
        return await this.manager.getAttributeViewKeysByAvID(this.avID);
    }

    async getPrimaryKeys(options: {
        page?: number;
        pageSize?: number;
        keyword?: string;
    } = {}): Promise<GetAttributeViewPrimaryKeyValuesResponse> {
        return await this.manager.getPrimaryKeyValues(this.avID, options);
    }

    async duplicate(): Promise<DuplicateAttributeViewBlockResponse> {
        return await this.manager.duplicateAttributeView(this.avID);
    }

    async getFilterSort(blockID: string): Promise<GetAttributeViewFilterSortResponse> {
        return await this.manager.getFilterSort(this.avID, blockID);
    }

    async getMirrorBlocks(): Promise<GetMirrorDatabaseBlocksResponse> {
        return await this.manager.getMirrorDatabaseBlocks(this.avID);
    }

    async getCurrentImages(options: {
        viewID?: string;
        query?: string;
    } = {}): Promise<string[]> {
        return await this.manager.getCurrentImages(this.avID, options);
    }

    /**
     * 获取若干 itemID 对应绑定块ID 映射
     */
    async getBoundBlockIDs(itemIDs: string[]): Promise<Record<string, string>> {
        return await this.manager.getBoundBlockIDsByItemIDs(this.avID, itemIDs);
    }

    /**
     * 获取若干绑定块ID 对应 itemID 映射
     */
    async getItemIDsByBlocks(blockIDs: string[]): Promise<Record<string, string>> {
        return await this.manager.getItemIDsByBoundIDs(this.avID, blockIDs);
    }
}

// 导出类
// export default AVManager;

// // 兼容性导出
declare global {
    interface Window {
        AVManager: typeof AVManager;
    }
}

window.AVManager = AVManager;
