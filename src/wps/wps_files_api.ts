import { NetworkClient } from "@/api/network";

/**
 * 查询 WPS 网盘分组文件列表参数
 */
export interface WpsFilesQueryOptions {
    /** 分组 groupId，*/
    groupId: string;
    /** 父目录 id (parentid)，*/
    parentId: string;
    /** 文件夹 id (folderid)，*/
    folderid?: string;//共享
    /** 偏移量 (offset)，默认 0 */
    offset?: number;
    /** 数量 (count)，默认 20 */
    count?: number;
    /** 排序字段 orderby，默认 mtime */
    orderBy?: string;
    /** 排序方向 desc/asc，默认 desc */
    order?: string;
    /** include=acl,pic_thumbnail 等，默认 acl,pic_thumbnail */
    include?: string;
    /** linkgroup=true */
    linkGroup?: boolean;
    /** with_link=true */
    withLink?: boolean;
    /** 额外 query 参数（会覆盖同名内置）*/
    extraQuery?: Record<string, string | number | boolean | undefined>;
    /** 头部配置 */
    headers?: {
        /** 完整 Cookie 字符串（浏览器端直连时请确保不含敏感信息或改用代理） */
        cookie?: string;
        /** 自定义 UA；浏览器直连通常无需设置 */
        userAgent?: string;
        accept?: string;
    } & Record<string, string | undefined>;
    /** 如果需要，可覆盖 Host（通常需要代理才能生效） */
    hostHeader?: string;
}

export interface FetchWpsFilesOptions extends WpsFilesQueryOptions {
    /** 基础域名，默认 https://drive.kdocs.cn */
    baseUrl?: string;
    /** 复用已有 NetworkClient；未提供则内部创建（仅用于本次调用） */
    client?: NetworkClient;
    /** NetworkClient 是否走代理（未传 client 时才生效，默认 true） */
    useProxy?: boolean;
}

export interface WpsFilesResponse<T = any> {
    raw: Response; // 原始 Response（代理封装后仍保持 fetch Response 语义）
    data: T;       // 解析后的 JSON
}

/**
 * 拼接查询参数
 */
function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        usp.append(k, String(v));
    });
    return usp.toString();
}

/**
 * 获取 WPS 分组目录文件列表（封装原始示例 fetch）
 */
export async function fetchWpsFiles<T = any>(options: FetchWpsFilesOptions): Promise<WpsFilesResponse<T>> {
    const {
        groupId,
        parentId,
        folderid,
        offset = 0,
        count = 20,
        orderBy = "mtime",
        order = "desc",
        include = "acl,pic_thumbnail",
        linkGroup = true,
        withLink = true,
        extraQuery = {},
        headers = { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3" },
        hostHeader,
        baseUrl = window.siyuanWPS?.baseUrl,
        client,
        useProxy = true,
    } = options;

    if (!groupId) throw new Error("groupId 不能为空");
    if (!parentId) throw new Error("parentId 不能为空");
    if (!baseUrl) throw new Error("baseUrl 不能为空");
    const queryObj: Record<string, string | number | boolean | undefined> = {
        parentid: parentId,
        folderid,
        linkgroup: linkGroup,
        include,
        with_link: withLink,
        offset,
        count,
        orderby: orderBy,
        order,
        ...extraQuery,
    };

    const queryStr = buildQuery(queryObj);
    const path = `/api/v5/groups/${encodeURIComponent(groupId)}/files?${queryStr}`;

    const nc = client || new NetworkClient({
        serverUrl: baseUrl,
        useProxy, // 若要设置受限头部（如 Cookie / Host），推荐保持 true，通过代理转发
    });

    // 组装请求头
    const reqHeaders: Record<string, string> = {};
    if (headers.cookie) reqHeaders["Cookie"] = headers.cookie; // 大写 C 更显式
    if (headers.userAgent) reqHeaders["User-Agent"] = headers.userAgent;
    reqHeaders["Accept"] = headers.accept || headers["accept"] || "*/*";
    // 复制用户额外 header（排除已单独处理的）
    Object.entries(headers).forEach(([k, v]) => {
        if (!v) return;
        const lk = k.toLowerCase();
        if (["cookie", "user-agent", "accept"].includes(lk)) return; // 已处理
        reqHeaders[k] = v;
    });
    if (hostHeader) reqHeaders["Host"] = hostHeader; // 仅代理环境才能生效
    // Connection 在浏览器 fetch 中为受限头，透传需要代理；这里若用户设置也加上
    if (headers["Connection"]) reqHeaders["Connection"] = headers["Connection"] as string;

    const response = await nc.request({
        method: "GET",
        path,
        headers: reqHeaders,
        timeout: 15000,
    });

    // 解析 JSON（失败则抛错）
    let data: any;
    const text = await response.text();
    try {
        data = text ? JSON.parse(text) : {};
    } catch (e) {
        throw new Error("WPS 文件列表返回非 JSON: " + text.slice(0, 200));
    }

    return { raw: response, data } as WpsFilesResponse<T>;
}


