import * as api from "@/api"

export async function ToEventNote(info) {

    //获取id
    console.log(info);
    console.log(info.event.title);
    const title = info.event.title;
    //去除空格
    const title1 = title.replace(/\s*/g, "");
    const sqlStr = `
    SELECT *
    FROM blocks
    WHERE content = '${title1}' 
    AND type = 'p';
    `;
    const res = await api.sql(sqlStr);
    console.log(res);


}

// 接口定义
interface View {
    id: string;
    name: string;
}

interface ScheduleData {
    id: string;
    name: string;
    keyValues: KeyValue[];
    keyIDs: string[];
    viewID: string;
    views: View[];
}

interface KeyValue {
    key: {
        id: string;
        name: string;
        type: string;
        options?: Array<{ name: string; color: string }>;
    };
    values: any[];
}

export interface ScheduleItem {
    id: string;
    event: string;
    startTime: Date;
    endTime: Date;
    description: string;
    status: string;
}

// 主类实现
export class ScheduleManager {
    private data: ScheduleData | ScheduleData[];
    private scheduleItems: ScheduleItem[] = [];

    constructor(jsonData: ScheduleData | ScheduleData[]) {
        this.data = jsonData;
        this.parseScheduleData();
    }

    private parseScheduleData() {
        if (Array.isArray(this.data)) {
            // 处理数组数据
            this.data.forEach(item => {
                this.parseScheduleItem(item);
            });
        } else {
            // 处理单个对象
            this.parseScheduleItem(this.data);
        }
    }

    private parseScheduleItem(data: ScheduleData) {
        const events = this.findKeyValues('事件', data);
        const times = this.findKeyValues('开始时间', data);
        const descriptions = this.findKeyValues('描述', data);
        const statuses = this.findKeyValues('状态', data);

        events.forEach((event, index) => {
            const timeData = times[index]?.date;

            if (event.block && timeData) {
                this.scheduleItems.push({
                    id: event.blockID,
                    event: event.block.content,
                    startTime: new Date(timeData.content),
                    endTime: new Date(timeData.content2),
                    description: descriptions[index]?.text?.content || '',
                    status: statuses[index]?.mSelect?.[0]?.content || ''
                });
            }
        });
    }

    private findKeyValues(keyName: string, data: ScheduleData): any[] {
        const keyValue = data.keyValues.find(kv => kv.key.name === keyName);
        return keyValue ? keyValue.values : [];
    }

    // 获取所有日程
    public getAllSchedules(): ScheduleItem[] {
        return this.scheduleItems;
    }

    // 按状态筛选
    public getSchedulesByStatus(status: string): ScheduleItem[] {
        return this.scheduleItems.filter(item => item.status === status);
    }

    // 获取指定时间范围的日程
    public getSchedulesByDateRange(start: Date, end: Date): ScheduleItem[] {
        return this.scheduleItems.filter(item =>
            item.startTime >= start && item.endTime <= end
        );
    }

    // 按描述搜索
    public searchByDescription(keyword: string): ScheduleItem[] {
        return this.scheduleItems.filter(item =>
            item.description.toLowerCase().includes(keyword.toLowerCase())
        );
    }
}

// 使用示例:

const scheduleJson = [
    {
        "spec": 1,
        "id": "20250113201132-xe84ui2",
        "name": "日程",
        "keyValues": [
            {
                "key": {
                    "id": "20241213113357-svieuq5",
                    "name": "事件",
                    "type": "block",
                    "icon": "",
                    "desc": "",
                    "numberFormat": "",
                    "template": ""
                },
                "values": [
                    {
                        "id": "20250113200906-u6b2gde",
                        "keyID": "20241213113357-svieuq5",
                        "blockID": "20250113200906-i6f48vx",
                        "type": "block",
                        "isDetached": true,
                        "createdAt": 1736770146627,
                        "updatedAt": 1736770211064,
                        "block": {
                            "id": "20250113200906-i6f48vx",
                            "icon": "",
                            "content": "测试",
                            "created": 1736770146627,
                            "updated": 1736770211064
                        }
                    }
                ]
            },
            {
                "key": {
                    "id": "20241213113357-mw9230g",
                    "name": "开始时间",
                    "type": "date",
                    "icon": "",
                    "desc": "",
                    "numberFormat": "",
                    "template": ""
                },
                "values": [
                    {
                        "id": "20241213113602-am369cr",
                        "keyID": "20241213113357-mw9230g",
                        "blockID": "20241002230817-klzb7u1",
                        "type": "date",
                        "createdAt": 1734060979737,
                        "updatedAt": 1734085829529,
                        "date": {
                            "content": 1734060960000,
                            "isNotEmpty": true,
                            "hasEndDate": true,
                            "isNotTime": false,
                            "content2": 1734046680000,
                            "isNotEmpty2": true,
                            "formattedContent": ""
                        }
                    },
                    {
                        "id": "20241213124948-22wvoqt",
                        "keyID": "20241213113357-mw9230g",
                        "blockID": "20241213113421-prrbto9",
                        "type": "date",
                        "createdAt": 1734065399165,
                        "updatedAt": 1736259986101,
                        "date": {
                            "content": 1734126540000,
                            "isNotEmpty": true,
                            "hasEndDate": true,
                            "isNotTime": false,
                            "content2": 1734065340000,
                            "isNotEmpty2": true,
                            "formattedContent": ""
                        }
                    },
                    {
                        "id": "20250113200914-z4i4i0z",
                        "keyID": "20241213113357-mw9230g",
                        "blockID": "20250113200906-i6f48vx",
                        "type": "date",
                        "createdAt": 1736770156002,
                        "updatedAt": 1736770171208,
                        "date": {
                            "content": 1736770140000,
                            "isNotEmpty": true,
                            "hasEndDate": true,
                            "isNotTime": false,
                            "content2": 1736856540000,
                            "isNotEmpty2": true,
                            "formattedContent": ""
                        }
                    }
                ]
            },
            {
                "key": {
                    "id": "20241213113836-oyoy83j",
                    "name": "描述",
                    "type": "text",
                    "icon": "",
                    "desc": "",
                    "numberFormat": "",
                    "template": ""
                },
                "values": [
                    {
                        "id": "20241213123653-nqqa1um",
                        "keyID": "20241213113836-oyoy83j",
                        "blockID": "20241002230817-klzb7u1",
                        "type": "text",
                        "createdAt": 1734064614923,
                        "updatedAt": 1734265321474,
                        "text": {
                            "content": "测试日历插件"
                        }
                    },
                    {
                        "id": "20241213124959-pifzx34",
                        "keyID": "20241213113836-oyoy83j",
                        "blockID": "20241213113421-prrbto9",
                        "type": "text",
                        "createdAt": 1734065403965,
                        "updatedAt": 1736259407974,
                        "text": {
                            "content": "22323453524234"
                        }
                    },
                    {
                        "id": "20250113200931-vt1koaw",
                        "keyID": "20241213113836-oyoy83j",
                        "blockID": "20250113200906-i6f48vx",
                        "type": "text",
                        "createdAt": 1736770211064,
                        "updatedAt": 1736770212064,
                        "text": {
                            "content": "测试描述"
                        }
                    }
                ]
            },
            {
                "key": {
                    "id": "20250111123406-3epoj13",
                    "name": "状态",
                    "type": "select",
                    "icon": "",
                    "desc": "",
                    "options": [
                        {
                            "name": "完成",
                            "color": "1",
                            "desc": ""
                        },
                        {
                            "name": "未完成",
                            "color": "2",
                            "desc": ""
                        }
                    ],
                    "numberFormat": "",
                    "template": ""
                },
                "values": [
                    {
                        "id": "20250111123427-1utvnw8",
                        "keyID": "20250111123406-3epoj13",
                        "blockID": "20241002230817-klzb7u1",
                        "type": "select",
                        "createdAt": 1736570069852,
                        "updatedAt": 1736570070852,
                        "mSelect": [
                            {
                                "content": "完成",
                                "color": "1"
                            }
                        ]
                    },
                    {
                        "id": "20250111123824-vwfxxyc",
                        "keyID": "20250111123406-3epoj13",
                        "blockID": "20241213113421-prrbto9",
                        "type": "select",
                        "createdAt": 1736570313195,
                        "updatedAt": 1736570314195,
                        "mSelect": [
                            {
                                "content": "完成",
                                "color": "1"
                            }
                        ]
                    },
                    {
                        "id": "20250113200906-qrc5f6d",
                        "keyID": "20250111123406-3epoj13",
                        "blockID": "20250113200906-i6f48vx",
                        "type": "select",
                        "createdAt": 1736770149464,
                        "updatedAt": 1736770150464,
                        "mSelect": [
                            {
                                "content": "完成",
                                "color": "1"
                            }
                        ]
                    }
                ]
            }
        ],
        "keyIDs": [
            "20241213113357-svieuq5",
            "20241213113357-mw9230g",
            "20241213113836-oyoy83j",
            "20250111123406-3epoj13"
        ],
        "viewID": "20241213113357-tuugpcw",
        "views": [
            {
                "id": "20241213113357-tuugpcw",
                "icon": "",
                "name": "表格",
                "hideAttrViewName": false,
                "desc": "",
                "type": "table",
                "table": {
                    "spec": 0,
                    "id": "20241213113357-5fkirhm",
                    "columns": [
                        {
                            "id": "20241213113357-svieuq5",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": "100px"
                        },
                        {
                            "id": "20241213113357-mw9230g",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": "264px"
                        },
                        {
                            "id": "20241213113836-oyoy83j",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": "127px"
                        },
                        {
                            "id": "20250111123406-3epoj13",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": "82px"
                        }
                    ],
                    "rowIds": [
                        "20250113200906-i6f48vx",
                        "20241002230817-klzb7u1",
                        "20241213113421-prrbto9"
                    ],
                    "filters": [],
                    "sorts": [],
                    "pageSize": 50
                }
            }
        ]
    },
    {
        "spec": 1,
        "id": "20250113200532-klg3vdz",
        "name": "日程",
        "keyValues": [
            {
                "key": {
                    "id": "20241213113357-svieuq5",
                    "name": "事件",
                    "type": "block",
                    "icon": "",
                    "desc": "",
                    "numberFormat": "",
                    "template": ""
                },
                "values": [
                    {
                        "id": "20250113200906-u6b2gde",
                        "keyID": "20241213113357-svieuq5",
                        "blockID": "20250113200906-i6f48vx",
                        "type": "block",
                        "isDetached": true,
                        "createdAt": 1736770146627,
                        "updatedAt": 1736770211064,
                        "block": {
                            "id": "20250113200906-i6f48vx",
                            "icon": "",
                            "content": "测试",
                            "created": 1736770146627,
                            "updated": 1736770211064
                        }
                    }
                ]
            },
            {
                "key": {
                    "id": "20241213113357-mw9230g",
                    "name": "开始时间",
                    "type": "date",
                    "icon": "",
                    "desc": "",
                    "numberFormat": "",
                    "template": ""
                },
                "values": [
                    {
                        "id": "20241213113602-am369cr",
                        "keyID": "20241213113357-mw9230g",
                        "blockID": "20241002230817-klzb7u1",
                        "type": "date",
                        "createdAt": 1734060979737,
                        "updatedAt": 1734085829529,
                        "date": {
                            "content": 1734060960000,
                            "isNotEmpty": true,
                            "hasEndDate": true,
                            "isNotTime": false,
                            "content2": 1734046680000,
                            "isNotEmpty2": true,
                            "formattedContent": ""
                        }
                    },
                    {
                        "id": "20241213124948-22wvoqt",
                        "keyID": "20241213113357-mw9230g",
                        "blockID": "20241213113421-prrbto9",
                        "type": "date",
                        "createdAt": 1734065399165,
                        "updatedAt": 1736259986101,
                        "date": {
                            "content": 1734126540000,
                            "isNotEmpty": true,
                            "hasEndDate": true,
                            "isNotTime": false,
                            "content2": 1734065340000,
                            "isNotEmpty2": true,
                            "formattedContent": ""
                        }
                    },
                    {
                        "id": "20250113200914-z4i4i0z",
                        "keyID": "20241213113357-mw9230g",
                        "blockID": "20250113200906-i6f48vx",
                        "type": "date",
                        "createdAt": 1736770156002,
                        "updatedAt": 1736770171208,
                        "date": {
                            "content": 1736770140000,
                            "isNotEmpty": true,
                            "hasEndDate": true,
                            "isNotTime": false,
                            "content2": 1736856540000,
                            "isNotEmpty2": true,
                            "formattedContent": ""
                        }
                    }
                ]
            },
            {
                "key": {
                    "id": "20241213113836-oyoy83j",
                    "name": "描述",
                    "type": "text",
                    "icon": "",
                    "desc": "",
                    "numberFormat": "",
                    "template": ""
                },
                "values": [
                    {
                        "id": "20241213123653-nqqa1um",
                        "keyID": "20241213113836-oyoy83j",
                        "blockID": "20241002230817-klzb7u1",
                        "type": "text",
                        "createdAt": 1734064614923,
                        "updatedAt": 1734265321474,
                        "text": {
                            "content": "测试日历插件"
                        }
                    },
                    {
                        "id": "20241213124959-pifzx34",
                        "keyID": "20241213113836-oyoy83j",
                        "blockID": "20241213113421-prrbto9",
                        "type": "text",
                        "createdAt": 1734065403965,
                        "updatedAt": 1736259407974,
                        "text": {
                            "content": "22323453524234"
                        }
                    },
                    {
                        "id": "20250113200931-vt1koaw",
                        "keyID": "20241213113836-oyoy83j",
                        "blockID": "20250113200906-i6f48vx",
                        "type": "text",
                        "createdAt": 1736770211064,
                        "updatedAt": 1736770212064,
                        "text": {
                            "content": "测试描述"
                        }
                    }
                ]
            },
            {
                "key": {
                    "id": "20250111123406-3epoj13",
                    "name": "状态",
                    "type": "select",
                    "icon": "",
                    "desc": "",
                    "options": [
                        {
                            "name": "完成",
                            "color": "1",
                            "desc": ""
                        },
                        {
                            "name": "未完成",
                            "color": "2",
                            "desc": ""
                        }
                    ],
                    "numberFormat": "",
                    "template": ""
                },
                "values": [
                    {
                        "id": "20250111123427-1utvnw8",
                        "keyID": "20250111123406-3epoj13",
                        "blockID": "20241002230817-klzb7u1",
                        "type": "select",
                        "createdAt": 1736570069852,
                        "updatedAt": 1736570070852,
                        "mSelect": [
                            {
                                "content": "完成",
                                "color": "1"
                            }
                        ]
                    },
                    {
                        "id": "20250111123824-vwfxxyc",
                        "keyID": "20250111123406-3epoj13",
                        "blockID": "20241213113421-prrbto9",
                        "type": "select",
                        "createdAt": 1736570313195,
                        "updatedAt": 1736570314195,
                        "mSelect": [
                            {
                                "content": "完成",
                                "color": "1"
                            }
                        ]
                    },
                    {
                        "id": "20250113200906-qrc5f6d",
                        "keyID": "20250111123406-3epoj13",
                        "blockID": "20250113200906-i6f48vx",
                        "type": "select",
                        "createdAt": 1736770149464,
                        "updatedAt": 1736770150464,
                        "mSelect": [
                            {
                                "content": "完成",
                                "color": "1"
                            }
                        ]
                    }
                ]
            }
        ],
        "keyIDs": [
            "20241213113357-svieuq5",
            "20241213113357-mw9230g",
            "20241213113836-oyoy83j",
            "20250111123406-3epoj13"
        ],
        "viewID": "20241213113357-tuugpcw",
        "views": [
            {
                "id": "20241213113357-tuugpcw",
                "icon": "",
                "name": "表格",
                "hideAttrViewName": false,
                "desc": "",
                "type": "table",
                "table": {
                    "spec": 0,
                    "id": "20241213113357-5fkirhm",
                    "columns": [
                        {
                            "id": "20241213113357-svieuq5",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": "100px"
                        },
                        {
                            "id": "20241213113357-mw9230g",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": "264px"
                        },
                        {
                            "id": "20241213113836-oyoy83j",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": "127px"
                        },
                        {
                            "id": "20250111123406-3epoj13",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": "82px"
                        }
                    ],
                    "rowIds": [
                        "20250113200906-i6f48vx",
                        "20241002230817-klzb7u1",
                        "20241213113421-prrbto9"
                    ],
                    "filters": [],
                    "sorts": [],
                    "pageSize": 50
                }
            }
        ]
    },
    {
        "spec": 1,
        "id": "20250113213909-aohhq35",
        "name": "日程",
        "keyValues": [
            {
                "key": {
                    "id": "20241213113357-svieuq5",
                    "name": "事件",
                    "type": "block",
                    "icon": "",
                    "desc": "",
                    "numberFormat": "",
                    "template": ""
                },
                "values": [
                    {
                        "id": "20250113200906-u6b2gde",
                        "keyID": "20241213113357-svieuq5",
                        "blockID": "20250113200906-i6f48vx",
                        "type": "block",
                        "isDetached": true,
                        "createdAt": 1736770146627,
                        "updatedAt": 1736770211064,
                        "block": {
                            "id": "20250113200906-i6f48vx",
                            "icon": "",
                            "content": "测试",
                            "created": 1736770146627,
                            "updated": 1736770211064
                        }
                    },
                    {
                        "id": "20250113214517-28sbf90",
                        "keyID": "20241213113357-svieuq5",
                        "blockID": "20250113214356-hz8dzge",
                        "type": "block",
                        "createdAt": 1736775917754,
                        "updatedAt": 1736775931747,
                        "block": {
                            "id": "20250113214356-hz8dzge",
                            "icon": "",
                            "content": "背单词",
                            "created": 1736775917754,
                            "updated": 1736775931747
                        }
                    },
                    {
                        "id": "20250116171508-n89s867",
                        "keyID": "20241213113357-svieuq5",
                        "blockID": "20250116164136-ee1tqjb",
                        "type": "block",
                        "createdAt": 1737018908655,
                        "updatedAt": 1737018922487,
                        "block": {
                            "id": "20250116164136-ee1tqjb",
                            "icon": "",
                            "content": "我2315",
                            "created": 1737018908655,
                            "updated": 1737018922487
                        }
                    }
                ]
            },
            {
                "key": {
                    "id": "20241213113357-mw9230g",
                    "name": "开始时间",
                    "type": "date",
                    "icon": "",
                    "desc": "",
                    "numberFormat": "",
                    "template": ""
                },
                "values": [
                    {
                        "id": "20241213113602-am369cr",
                        "keyID": "20241213113357-mw9230g",
                        "blockID": "20241002230817-klzb7u1",
                        "type": "date",
                        "createdAt": 1734060979737,
                        "updatedAt": 1734085829529,
                        "date": {
                            "content": 1734060960000,
                            "isNotEmpty": true,
                            "hasEndDate": true,
                            "isNotTime": false,
                            "content2": 1734046680000,
                            "isNotEmpty2": true,
                            "formattedContent": ""
                        }
                    },
                    {
                        "id": "20241213124948-22wvoqt",
                        "keyID": "20241213113357-mw9230g",
                        "blockID": "20241213113421-prrbto9",
                        "type": "date",
                        "createdAt": 1734065399165,
                        "updatedAt": 1736259986101,
                        "date": {
                            "content": 1734126540000,
                            "isNotEmpty": true,
                            "hasEndDate": true,
                            "isNotTime": false,
                            "content2": 1734065340000,
                            "isNotEmpty2": true,
                            "formattedContent": ""
                        }
                    },
                    {
                        "id": "20250113200914-z4i4i0z",
                        "keyID": "20241213113357-mw9230g",
                        "blockID": "20250113200906-i6f48vx",
                        "type": "date",
                        "createdAt": 1736770156002,
                        "updatedAt": 1736770171208,
                        "date": {
                            "content": 1736770140000,
                            "isNotEmpty": true,
                            "hasEndDate": true,
                            "isNotTime": false,
                            "content2": 1736856540000,
                            "isNotEmpty2": true,
                            "formattedContent": ""
                        }
                    },
                    {
                        "id": "20250113214519-ik2xtjp",
                        "keyID": "20241213113357-mw9230g",
                        "blockID": "20250113214356-hz8dzge",
                        "type": "date",
                        "createdAt": 1736775926879,
                        "updatedAt": 1736775927879,
                        "date": {
                            "content": 1736775900000,
                            "isNotEmpty": true,
                            "hasEndDate": true,
                            "isNotTime": false,
                            "content2": 1737568140000,
                            "isNotEmpty2": true,
                            "formattedContent": ""
                        }
                    },
                    {
                        "id": "20250116171510-ai4ysh8",
                        "keyID": "20241213113357-mw9230g",
                        "blockID": "20250116164136-ee1tqjb",
                        "type": "date",
                        "createdAt": 1737018917438,
                        "updatedAt": 1737018918438,
                        "date": {
                            "content": 1737018900000,
                            "isNotEmpty": true,
                            "hasEndDate": true,
                            "isNotTime": false,
                            "content2": 1737018900000,
                            "isNotEmpty2": true,
                            "formattedContent": ""
                        }
                    }
                ]
            },
            {
                "key": {
                    "id": "20241213113836-oyoy83j",
                    "name": "描述",
                    "type": "text",
                    "icon": "",
                    "desc": "",
                    "numberFormat": "",
                    "template": ""
                },
                "values": [
                    {
                        "id": "20241213123653-nqqa1um",
                        "keyID": "20241213113836-oyoy83j",
                        "blockID": "20241002230817-klzb7u1",
                        "type": "text",
                        "createdAt": 1734064614923,
                        "updatedAt": 1734265321474,
                        "text": {
                            "content": "测试日历插件"
                        }
                    },
                    {
                        "id": "20241213124959-pifzx34",
                        "keyID": "20241213113836-oyoy83j",
                        "blockID": "20241213113421-prrbto9",
                        "type": "text",
                        "createdAt": 1734065403965,
                        "updatedAt": 1736259407974,
                        "text": {
                            "content": "22323453524234"
                        }
                    },
                    {
                        "id": "20250113200931-vt1koaw",
                        "keyID": "20241213113836-oyoy83j",
                        "blockID": "20250113200906-i6f48vx",
                        "type": "text",
                        "createdAt": 1736770211064,
                        "updatedAt": 1736770212064,
                        "text": {
                            "content": "测试描述"
                        }
                    },
                    {
                        "id": "20250113214529-shcrqef",
                        "keyID": "20241213113836-oyoy83j",
                        "blockID": "20250113214356-hz8dzge",
                        "type": "text",
                        "createdAt": 1736775929857,
                        "updatedAt": 1736775930857,
                        "text": {
                            "content": "测试"
                        }
                    },
                    {
                        "id": "20250116171521-h3i937x",
                        "keyID": "20241213113836-oyoy83j",
                        "blockID": "20250116164136-ee1tqjb",
                        "type": "text",
                        "createdAt": 1737018921007,
                        "updatedAt": 1737018922007,
                        "text": {
                            "content": "222222222444444444"
                        }
                    }
                ]
            },
            {
                "key": {
                    "id": "20250111123406-3epoj13",
                    "name": "状态",
                    "type": "select",
                    "icon": "",
                    "desc": "",
                    "options": [
                        {
                            "name": "完成",
                            "color": "1",
                            "desc": ""
                        },
                        {
                            "name": "未完成",
                            "color": "2",
                            "desc": ""
                        }
                    ],
                    "numberFormat": "",
                    "template": ""
                },
                "values": [
                    {
                        "id": "20250111123427-1utvnw8",
                        "keyID": "20250111123406-3epoj13",
                        "blockID": "20241002230817-klzb7u1",
                        "type": "select",
                        "createdAt": 1736570069852,
                        "updatedAt": 1736570070852,
                        "mSelect": [
                            {
                                "content": "完成",
                                "color": "1"
                            }
                        ]
                    },
                    {
                        "id": "20250111123824-vwfxxyc",
                        "keyID": "20250111123406-3epoj13",
                        "blockID": "20241213113421-prrbto9",
                        "type": "select",
                        "createdAt": 1736570313195,
                        "updatedAt": 1736570314195,
                        "mSelect": [
                            {
                                "content": "完成",
                                "color": "1"
                            }
                        ]
                    },
                    {
                        "id": "20250113200906-qrc5f6d",
                        "keyID": "20250111123406-3epoj13",
                        "blockID": "20250113200906-i6f48vx",
                        "type": "select",
                        "createdAt": 1736770149464,
                        "updatedAt": 1736770150464,
                        "mSelect": [
                            {
                                "content": "完成",
                                "color": "1"
                            }
                        ]
                    },
                    {
                        "id": "20250113214527-0qz2aip",
                        "keyID": "20250111123406-3epoj13",
                        "blockID": "20250113214356-hz8dzge",
                        "type": "select",
                        "createdAt": 1736775931747,
                        "updatedAt": 1736775932747,
                        "mSelect": [
                            {
                                "content": "未完成",
                                "color": "2"
                            }
                        ]
                    },
                    {
                        "id": "20250116171510-d005s4k",
                        "keyID": "20250111123406-3epoj13",
                        "blockID": "20250116164136-ee1tqjb",
                        "type": "select",
                        "createdAt": 1737018922487,
                        "updatedAt": 1737018923487,
                        "mSelect": [
                            {
                                "content": "未完成",
                                "color": "2"
                            }
                        ]
                    }
                ]
            }
        ],
        "keyIDs": [
            "20241213113357-svieuq5",
            "20241213113357-mw9230g",
            "20241213113836-oyoy83j",
            "20250111123406-3epoj13"
        ],
        "viewID": "20241213113357-tuugpcw",
        "views": [
            {
                "id": "20241213113357-tuugpcw",
                "icon": "",
                "name": "表格",
                "hideAttrViewName": false,
                "desc": "",
                "type": "table",
                "table": {
                    "spec": 0,
                    "id": "20241213113357-5fkirhm",
                    "columns": [
                        {
                            "id": "20241213113357-svieuq5",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": "100px"
                        },
                        {
                            "id": "20241213113357-mw9230g",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": "264px"
                        },
                        {
                            "id": "20241213113836-oyoy83j",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": "127px"
                        },
                        {
                            "id": "20250111123406-3epoj13",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": "82px"
                        }
                    ],
                    "rowIds": [
                        "20250116164136-ee1tqjb",
                        "20250113214356-hz8dzge",
                        "20250113200906-i6f48vx",
                        "20241002230817-klzb7u1",
                        "20241213113421-prrbto9"
                    ],
                    "filters": [],
                    "sorts": [],
                    "pageSize": 50
                }
            }
        ]
    },
    {
        "spec": 1,
        "id": "20241213113357-m9b143e",
        "name": "日程",
        "keyValues": [
            {
                "key": {
                    "id": "20241213113357-svieuq5",
                    "name": "事件",
                    "type": "block",
                    "icon": "",
                    "desc": "",
                    "numberFormat": "",
                    "template": ""
                },
                "values": [
                    {
                        "id": "20250108230156-en3rs7u",
                        "keyID": "20241213113357-svieuq5",
                        "blockID": "20250108230155-hnrc91q",
                        "type": "block",
                        "isDetached": true,
                        "createdAt": 1736348516401,
                        "updatedAt": 1736571026486,
                        "block": {
                            "id": "20250108230155-hnrc91q",
                            "icon": "",
                            "content": "2131",
                            "created": 1736348516401,
                            "updated": 1736571026486
                        }
                    }
                ]
            },
            {
                "key": {
                    "id": "20241213113357-mw9230g",
                    "name": "开始时间",
                    "type": "date",
                    "icon": "",
                    "desc": "",
                    "numberFormat": "",
                    "template": ""
                },
                "values": [
                    {
                        "id": "20241213113602-am369cr",
                        "keyID": "20241213113357-mw9230g",
                        "blockID": "20241002230817-klzb7u1",
                        "type": "date",
                        "createdAt": 1734060979737,
                        "updatedAt": 1734085829529,
                        "date": {
                            "content": 1734060960000,
                            "isNotEmpty": true,
                            "hasEndDate": true,
                            "isNotTime": false,
                            "content2": 1734046680000,
                            "isNotEmpty2": true,
                            "formattedContent": ""
                        }
                    },
                    {
                        "id": "20241213124948-22wvoqt",
                        "keyID": "20241213113357-mw9230g",
                        "blockID": "20241213113421-prrbto9",
                        "type": "date",
                        "createdAt": 1734065399165,
                        "updatedAt": 1736259986101,
                        "date": {
                            "content": 1734126540000,
                            "isNotEmpty": true,
                            "hasEndDate": true,
                            "isNotTime": false,
                            "content2": 1734065340000,
                            "isNotEmpty2": true,
                            "formattedContent": ""
                        }
                    },
                    {
                        "id": "20250108230159-pssgj23",
                        "keyID": "20241213113357-mw9230g",
                        "blockID": "20250108230155-hnrc91q",
                        "type": "date",
                        "createdAt": 1736348529069,
                        "updatedAt": 1736348617930,
                        "date": {
                            "content": 1736316060000,
                            "isNotEmpty": true,
                            "hasEndDate": true,
                            "isNotTime": false,
                            "content2": 1736350140000,
                            "isNotEmpty2": true,
                            "formattedContent": ""
                        }
                    }
                ]
            },
            {
                "key": {
                    "id": "20241213113836-oyoy83j",
                    "name": "描述",
                    "type": "text",
                    "icon": "",
                    "desc": "",
                    "numberFormat": "",
                    "template": ""
                },
                "values": [
                    {
                        "id": "20241213123653-nqqa1um",
                        "keyID": "20241213113836-oyoy83j",
                        "blockID": "20241002230817-klzb7u1",
                        "type": "text",
                        "createdAt": 1734064614923,
                        "updatedAt": 1734265321474,
                        "text": {
                            "content": "测试日历插件"
                        }
                    },
                    {
                        "id": "20241213124959-pifzx34",
                        "keyID": "20241213113836-oyoy83j",
                        "blockID": "20241213113421-prrbto9",
                        "type": "text",
                        "createdAt": 1734065403965,
                        "updatedAt": 1736259407974,
                        "text": {
                            "content": "22323453524234"
                        }
                    },
                    {
                        "id": "20250108230209-twei07g",
                        "keyID": "20241213113836-oyoy83j",
                        "blockID": "20250108230155-hnrc91q",
                        "type": "text",
                        "createdAt": 1736348530739,
                        "updatedAt": 1736348531739,
                        "text": {
                            "content": "2131"
                        }
                    }
                ]
            },
            {
                "key": {
                    "id": "20250111123406-3epoj13",
                    "name": "状态",
                    "type": "select",
                    "icon": "",
                    "desc": "",
                    "options": [
                        {
                            "name": "完成",
                            "color": "1",
                            "desc": ""
                        },
                        {
                            "name": "未完成",
                            "color": "2",
                            "desc": ""
                        }
                    ],
                    "numberFormat": "",
                    "template": ""
                },
                "values": [
                    {
                        "id": "20250111123427-1utvnw8",
                        "keyID": "20250111123406-3epoj13",
                        "blockID": "20241002230817-klzb7u1",
                        "type": "select",
                        "createdAt": 1736570069852,
                        "updatedAt": 1736570070852,
                        "mSelect": [
                            {
                                "content": "完成",
                                "color": "1"
                            }
                        ]
                    },
                    {
                        "id": "20250111123824-vwfxxyc",
                        "keyID": "20250111123406-3epoj13",
                        "blockID": "20241213113421-prrbto9",
                        "type": "select",
                        "createdAt": 1736570313195,
                        "updatedAt": 1736570314195,
                        "mSelect": [
                            {
                                "content": "完成",
                                "color": "1"
                            }
                        ]
                    },
                    {
                        "id": "20250111124906-cyfnhfm",
                        "keyID": "20250111123406-3epoj13",
                        "blockID": "20250108230155-hnrc91q",
                        "type": "select",
                        "createdAt": 1736570973346,
                        "updatedAt": 1736571026486,
                        "mSelect": [
                            {
                                "content": "未完成",
                                "color": "2"
                            }
                        ]
                    }
                ]
            }
        ],
        "keyIDs": [
            "20241213113357-svieuq5",
            "20241213113357-mw9230g",
            "20241213113836-oyoy83j",
            "20250111123406-3epoj13"
        ],
        "viewID": "20241213113357-tuugpcw",
        "views": [
            {
                "id": "20241213113357-tuugpcw",
                "icon": "",
                "name": "表格",
                "hideAttrViewName": false,
                "desc": "",
                "type": "table",
                "table": {
                    "spec": 0,
                    "id": "20241213113357-5fkirhm",
                    "columns": [
                        {
                            "id": "20241213113357-svieuq5",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": "146px"
                        },
                        {
                            "id": "20241213113357-mw9230g",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": "279px"
                        },
                        {
                            "id": "20241213113836-oyoy83j",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": "154px"
                        },
                        {
                            "id": "20250111123406-3epoj13",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": "82px"
                        }
                    ],
                    "rowIds": [
                        "20241002230817-klzb7u1",
                        "20241213113421-prrbto9",
                        "20250108230155-hnrc91q"
                    ],
                    "filters": [],
                    "sorts": [],
                    "pageSize": 50
                }
            },
            {
                "id": "20241213165724-p46yrlx",
                "icon": "",
                "name": "表格",
                "hideAttrViewName": false,
                "desc": "",
                "type": "table",
                "table": {
                    "spec": 0,
                    "id": "20241213165725-yfxnwfo",
                    "columns": [
                        {
                            "id": "20241213113357-svieuq5",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": ""
                        },
                        {
                            "id": "20241213113357-mw9230g",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": ""
                        },
                        {
                            "id": "20241213113836-oyoy83j",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": ""
                        },
                        {
                            "id": "20250111123406-3epoj13",
                            "wrap": false,
                            "hidden": false,
                            "pin": false,
                            "width": ""
                        }
                    ],
                    "rowIds": [
                        "20241002230817-klzb7u1",
                        "20250108230155-hnrc91q",
                        "20241213113421-prrbto9"
                    ],
                    "filters": [
                        {
                            "column": "20241213113836-oyoy83j",
                            "operator": "Contains",
                            "value": {
                                "type": "text",
                                "text": {
                                    "content": "13"
                                }
                            },
                            "relativeDate": null,
                            "relativeDate2": null
                        }
                    ],
                    "sorts": [],
                    "pageSize": 50
                }
            }
        ]
    }
]//... 你的JSON数据

//便利JSON数据

const manager = new ScheduleManager(scheduleJson[0]);

// 获取所有日程
const allSchedules = manager.getAllSchedules();

// 获取已完成的日程
const completedSchedules = manager.getSchedulesByStatus('完成');

// 获取特定日期范围的日程
const rangeSchedules = manager.getSchedulesByDateRange(
    new Date('2024-01-01'),
    new Date('2025-01-31')
);

console.log("222222222222222222222", allSchedules);
console.log("222222222222222222222", completedSchedules);
console.log("222222222222222222222", rangeSchedules);
