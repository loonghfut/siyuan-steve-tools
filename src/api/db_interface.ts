/**
 * SiYuan 属性视图管理器
 * 提供对属性视图（Attribute View）的完整操作接口
 */

import { AVManager } from "./db_pro";

// ============== 类型定义 ==============

// 基础类型定义
export interface APIResponse<T = any> {
    code: number;
    msg: string;
    data: T;
}

export interface BaseRequest {
    [key: string]: any;
}

// 属性视图相关类型
export interface AttributeView {
    id: string;
    name: string;
    views: View[];
    isMirror: boolean;
}

export interface View {
    id: string;
    icon: string;
    name: string;
    desc?: string;
    hideAttrViewName: boolean;
    type: LayoutType;
    pageSize?: number;
}

export interface ViewGroup {
    keyID: string;
    sort: string;
    dir: string;
}

export interface AttributeViewKey {
    id: string;
    name: string;
    type: KeyType;
    icon: string;
    options?: KeyOption[];
}

export interface KeyOption {
    id: string;
    name: string;
    color: string;
}

export interface AttributeViewValue {
    keyID?: string;
    keyName?: string;
    // 主键类型（block类型）
    block?: {
        content?: string;
        blockID?: string;
        id?: string;
        isDetached?: boolean;
    };
    // 文字类型
    text?: {
        content?: string;
    };
    // 数字类型
    number?: {
        content?: number;
    };
    // 日期类型
    date?: {
        content?: number;
        hasEndDate?: boolean;
        isNotTime?: boolean;
    };
    // 复选框类型
    checkbox?: {
        checked?: boolean;
    };
    // URL类型
    url?: {
        content?: string;
    };
    // 邮箱类型
    email?: {
        content?: string;
    };
    // 电话类型
    phone?: {
        content?: string;
    };
    // 多选类型
    mSelect?: Array<{
        content: string;
        color: string;
    }>;
    // 关联类型
    relation?: Array<{
        blockID: string;
        content: string;
    }>;
    // 模板类型
    template?: {
        content?: string;
    };
    // 创建时间类型
    created?: {
        content?: number;
    };
    // 更新时间类型
    updated?: {
        content?: number;
    };
    // 单选类型
    select?: {
        content: string;
        color: string;
    };
}

export interface AttributeViewRow {
    id: string;
    values: AttributeViewValue[];
}

export interface RefDefs {
    refID: string;
    defIDs: string[];
}

export interface FilterSort {
    filters: Filter[];
    sorts: Sort[];
}

export interface Filter {
    keyID: string;
    operator: string;
    value: any;
}

export interface Sort {
    keyID: string;
    order: 'asc' | 'desc';
}

// 枚举类型
export type LayoutType = 'table' | 'board' | 'calendar' | 'gallery';

export type KeyType =
    | 'text'
    | 'number'
    | 'date'
    | 'select'
    | 'mSelect'
    | 'relation'
    | 'checkbox'
    | 'url'
    | 'email'
    | 'phone'
    | 'template'
    | 'created'
    | 'updated'
    | 'block';

// 请求参数类型
export interface SetAttrViewGroupRequest {
    avID: string;
    blockID: string;
    group: ViewGroup;
}

export interface ChangeAttrViewLayoutRequest {
    avID: string;
    blockID: string;
    layoutType: LayoutType;
}

export interface DuplicateAttributeViewBlockRequest {
    avID: string;
}

export interface GetAttributeViewKeysByAvIDRequest {
    avID: string;
}

export interface GetMirrorDatabaseBlocksRequest {
    avID: string;
}

export interface SetDatabaseBlockViewRequest {
    id: string;
    avID: string;
    viewID: string;
}

export interface GetAttributeViewPrimaryKeyValuesRequest {
    id: string;
    page?: number;
    pageSize?: number;
    keyword?: string;
}

export interface AppendAttributeViewDetachedBlocksWithValuesRequest {
    avID: string;
    blocksValues: AttributeViewValue[][];
}

export interface AddAttributeViewBlocksRequest {
    avID: string;
    blockID?: string;
    previousID?: string;
    ignoreFillFilter?: boolean;
    srcs: BlockSource[];
}

export interface BlockSource {
    id: string;
    isDetached: boolean,              // 游离块
    content?: string,
    itemID: string
}

export interface RemoveAttributeViewBlocksRequest {
    avID: string;
    srcIDs: string[];
}

export interface AddAttributeViewKeyRequest {
    avID: string;
    keyID: string;
    keyName: string;
    keyType: KeyType;
    keyIcon: string;
    previousKeyID: string;
}

export interface RemoveAttributeViewKeyRequest {
    avID: string;
    keyID: string;
    removeRelationDest?: boolean;
}

export interface SortAttributeViewKeyRequest {
    avID: string;
    keyID: string;
    previousKeyID: string;
}

export interface SortAttributeViewViewKeyRequest {
    avID: string;
    viewID?: string;
    keyID: string;
    previousKeyID: string;
}

export interface GetAttributeViewFilterSortRequest {
    id: string;
    blockID: string;
}

export interface SearchAttributeViewNonRelationKeyRequest {
    avID: string;
    keyword: string;
}

export interface SearchAttributeViewRelationKeyRequest {
    avID: string;
    keyword: string;
}

export interface GetAttributeViewRequest {
    id: string;
}

export interface SearchAttributeViewRequest {
    keyword: string;
    excludes?: string[];
}

export interface RenderSnapshotAttributeViewRequest {
    id: string;
    snapshot: string;
}

export interface RenderHistoryAttributeViewRequest {
    id: string;
    created: string;
}

export interface RenderAttributeViewRequest {
    id: string;
    viewID?: string;
    page?: number;
    pageSize?: number;
    query?: string;
}

export interface GetCurrentAttrViewImagesRequest {
    id: string;
    viewID?: string;
    query?: string;
}

export interface GetAttributeViewKeysRequest {
    id: string;
}

export interface SetAttributeViewBlockAttrRequest {
    avID: string;
    keyID: string;
    itemID: string;
    value: any;
}

export interface BatchSetAttributeViewBlockAttrsRequest {
    avID: string;
    values: Array<{
        keyID: string;
        itemID: string;
        value: setAttributeViewValue;
    }>;
}

// 批量替换属性视图数据块请求
export interface BatchReplaceAttributeViewBlocksRequest {
    avID: string;
    isDetached?: boolean;
    /**
     * 旧块 ID 与新块 ID 的映射数组；
     * 例如: [{"oldBlockID1": "newBlockID1"}, {"oldBlockID2": "newBlockID2"}]
     */
    oldNew: Array<Record<string, string>>;
}

// 响应数据类型
export interface DuplicateAttributeViewBlockResponse {
    avID: string;
    blockID: string;
}

export interface GetMirrorDatabaseBlocksResponse {
    refDefs: RefDefs[];
}

export interface GetAttributeViewPrimaryKeyValuesResponse {
    name: string;
    blockIDs: string[];
    rows: AttributeViewRow[];
}

export interface GetAttributeViewFilterSortResponse {
    filters: Filter[];
    sorts: Sort[];
}

export interface SearchAttributeViewNonRelationKeyResponse {
    keys: AttributeViewKey[];
}

export interface SearchAttributeViewRelationKeyResponse {
    keys: AttributeViewKey[];
}

export interface GetAttributeViewResponse {
    av: AttributeView;
}

export interface SearchAttributeViewResponse {
    results: AttributeView[];
}

export interface RenderAttributeViewResponse {
    name: string;
    id: string;
    viewType: string;
    viewID: string;
    views: View[];
    view: any;
    isMirror: boolean;
}

export type setAttributeViewValue =
    | { text: { content: string } }
    | { number: { content: number } }
    | { date: { content: number; isNotTime?: boolean; hasEndDate?: boolean; content2?: number } }
    | { mSelect: Array<{ content: string; color?: string }> }
    | { checkbox: { checked: boolean } }
    | { url: { content: string } }
    | { email: { content: string } }
    | { phone: { content: string } }
    | { mAsset: Array<{ type: "file" | "image"; name: string; content: string }> }
    | { relation: { blockIDs: string[] } }
    | { block: { id: string; icon?: string; content: string; created?: number; updated?: number } };


export interface SetAttributeViewBlockAttrResponse {
    value: any;
}

// 链式操作接口
export interface IAVOperator {
    avID: string;
    manager: AVManager;

    render(options?: {
        viewID?: string;
        page?: number;
        pageSize?: number;
        query?: string;
    }): Promise<RenderAttributeViewResponse>;

    addKey(options?: {
        keyID?: string;
        keyName?: string;
        keyType?: KeyType;
        keyIcon?: string;
        previousKeyID?: string;
        previousKeyName?: string;
    }): Promise<void>;

    removeKey(keyName: string, removeRelationDest?: boolean): Promise<void>;
    removeKeyByName(keyName: string, removeRelationDest?: boolean): Promise<void>;
    addBlocksMore(blocksValues: AttributeViewValue[][]): Promise<void>;
    addBlocks(sources: BlockSource[], options?: {
        blockID?: string;
        previousID?: string;
        ignoreFillFilter?: boolean;
    }): Promise<void>;
    removeBlocks(srcIDs: string[]): Promise<void>;

    setCell(keyName: string, rowID: string, value: setAttributeViewValue): Promise<SetAttributeViewBlockAttrResponse>;
    
    setCells(updates: Array<{
        keyName: string;
        rowID: string;
        value: setAttributeViewValue;
    }>);
    getKeys(): Promise<AttributeViewKey[]>;

    getPrimaryKeys(options?: {
        page?: number;
        pageSize?: number;
        keyword?: string;
    }): Promise<GetAttributeViewPrimaryKeyValuesResponse>;

    duplicate(): Promise<DuplicateAttributeViewBlockResponse>;

    getFilterSort(blockID: string): Promise<GetAttributeViewFilterSortResponse>;

    getMirrorBlocks(): Promise<GetMirrorDatabaseBlocksResponse>;

    getCurrentImages(options?: {
        viewID?: string;
        query?: string;
    }): Promise<string[]>;
}

// 配置选项
export interface AVManagerOptions {
    baseURL?: string;
    headers?: Record<string, string>;
    timeout?: number;
}