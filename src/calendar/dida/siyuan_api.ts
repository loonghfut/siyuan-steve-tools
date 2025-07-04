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

    console.log("avIDs",avIds); // 输出: [{id: '20241213113357-m9b143e', name: '...'}, ...]

    return avIds;
}

