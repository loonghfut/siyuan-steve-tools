import { api } from "@frostime/siyuan-plugin-kits";

function extractDataAvId(markdown: string): string | null {
    const regex = /data-av-id="([^"]+)"/;
    const match = markdown.match(regex);
    return match ? match[1] : null;
}

export async function getAVreferenceid_pro(forwhat: string = 'dida') {
    const sqlStr = `SELECT markdown, content
        FROM blocks
        WHERE name = '${forwhat}'
        AND markdown LIKE '%NodeAttributeView%data-av-id%';`;

    const res = await api.sql(sqlStr);
    const avIds = res.map(item => ({
        id: extractDataAvId(item.markdown),
        name: item.content?.split(' ')[0] || 'N/A'
    })).filter(item => item.id !== null);

    console.log("avIDs", avIds); // 输出: [{id: '20241213113357-m9b143e', name: '...'}, ...]

    return avIds;
}


export const formatLocalDate = (timestamp: number) => {
    /// 格式化本地时间戳为 ISO 8601 字符串
    /// @param timestamp - 本地时间戳（毫秒）
    /// @returns 格式化后的字符串，例如 "2023-10-01T12:
    /// 如果时间戳为 0 或 undefined，则返回 undefined
    if (!timestamp) return undefined;
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// 辅助函数：将时间戳格式化为滴答API要求的格式 (e.g., "2025-07-08T01:31:00.000+0000")
export const formatDateForDida = (timestamp: number): string | undefined => {
    if (!timestamp) return undefined;

    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');

    const offsetMinutes = date.getTimezoneOffset();
    const offsetSign = offsetMinutes <= 0 ? '+' : '-';
    const offsetHours = Math.abs(offsetMinutes / 60);
    const offsetPaddedHours = Math.floor(offsetHours).toString().padStart(2, '0');
    const offsetPaddedMinutes = (Math.abs(offsetMinutes) % 60).toString().padStart(2, '0');
    const timezoneOffset = `${offsetSign}${offsetPaddedHours}${offsetPaddedMinutes}`;

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${timezoneOffset}`;
};

export const formatDateToISO = (dateInput: any): string | undefined => {
    if (!dateInput) return undefined;

    let date: Date;

    // 处理不同类型的日期输入
    if (dateInput instanceof Date) {
        date = dateInput;
    } else if (typeof dateInput === 'string') {
        date = new Date(dateInput);
    } else if (typeof dateInput === 'number') {
        date = new Date(dateInput);
    } else {
        return undefined;
    }

    // 检查日期是否有效
    if (isNaN(date.getTime())) {
        return undefined;
    }

    // 转换为 ISO 格式并替换时区为 +0000
    return date.toISOString().replace('Z', '+0000');
}