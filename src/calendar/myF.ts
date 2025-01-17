import * as api from '@/api';
import { ViewItem } from '@/calendar/interface';
// Define interfaces for better type safety


// Return type using interface
type ViewData = Promise<ViewItem[]>;

// Get view IDs and names
export async function getViewId(va_ids: string[]): ViewData {
    const viewIds_Data: ViewItem[] = [];

    for (const va_id of va_ids) {
        try {
            const view = await api.renderAttributeView(va_id);
            const rootid = view.id;
            view.views.forEach(viewItem => {
                viewIds_Data.push({
                    rootid: rootid,
                    viewId: viewItem.id,
                    name: viewItem.name
                });
            });

            console.log(viewIds_Data);
        } catch (error) {
            console.error(`Error processing view ${va_id}:`, error);
        }
    }

    return viewIds_Data;
}

//获取视图值
export async function getViewValue(viewIds_Data: ViewItem[]) {
    const viewValue_Data = [];

    for (const viewId_Data of viewIds_Data) {
        try {
            const viewValue = await api.renderAttributeView(viewId_Data.rootid, viewId_Data.viewId);
            viewValue_Data.push({

            });
            const data = extractDataFromTable(viewValue.view);
            console.log(viewValue);
            console.log("ceshi1", data);

        } catch (error) {
            console.error(`Error processing view ${viewId_Data.viewId}:`, error);
        }
    }

    return viewValue_Data;
}



function extractDataFromTable(data: any) {
    // 数据有效性检查
    if (!data || !data.columns || !Array.isArray(data.columns) || !data.rows) {
        console.warn('Invalid data structure received:', data);
        return [];
    }

    // 1. 创建字段映射
    const columnMap = new Map();
    try {
        data.columns.forEach((col: any, index: number) => {
            if (col && col.name) {
                columnMap.set(col.name, {
                    index: index,
                    id: col.id
                });
            }
        });

        // 2. 提取数据
        const result = data.rows.map((row: any) => {
            const rowData: any = {};

            try {
                // 提取事件
                if (columnMap.has('事件') && row.cells) {
                    const eventCell = row.cells[columnMap.get('事件').index];
                    rowData['事件'] = {
                        content: eventCell?.value?.block?.content || '',
                        id: eventCell?.value?.block?.id || ''
                    };
                }

                // 提取开始时间
                if (columnMap.has('开始时间') && row.cells) {
                    const timeCell = row.cells[columnMap.get('开始时间').index];
                    rowData['开始时间'] = {
                        start: timeCell?.value?.date?.content || null,
                        end: timeCell?.value?.date?.content2 || null
                    };
                }

                // 提取状态
                if (columnMap.has('状态') && row.cells) {
                    const statusCell = row.cells[columnMap.get('状态').index];
                    rowData['状态'] = statusCell?.value?.mSelect?.[0]?.content || '';
                }

                // 提取描述
                if (columnMap.has('描述') && row.cells) {
                    const descCell = row.cells[columnMap.get('描述').index];
                    rowData['描述'] = descCell?.value?.text?.content || '';
                }

                return rowData;
            } catch (error) {
                console.error('Error processing row:', error);
                return {};
            }
        });

        return result;
    } catch (error) {
        console.error('Error in extractDataFromTable:', error);
        return [];
    }
}

const testjson = {
    "id": "20241213113357-tuugpcw",
    "icon": "",
    "name": "表格",
    "desc": "",
    "hideAttrViewName": false,
    "filters": [],
    "sorts": [],
    "columns": [
        {
            "id": "20241213113357-svieuq5",
            "name": "事件",
            "type": "block",
            "icon": "",
            "wrap": false,
            "hidden": false,
            "pin": false,
            "width": "146px",
            "desc": "",
            "calc": null,
            "numberFormat": "",
            "template": ""
        },
        {
            "id": "20241213113357-mw9230g",
            "name": "开始时间",
            "type": "date",
            "icon": "",
            "wrap": false,
            "hidden": false,
            "pin": false,
            "width": "279px",
            "desc": "",
            "calc": null,
            "numberFormat": "",
            "template": ""
        },
        {
            "id": "20250111123406-3epoj13",
            "name": "状态",
            "type": "select",
            "icon": "",
            "wrap": false,
            "hidden": false,
            "pin": false,
            "width": "82px",
            "desc": "",
            "calc": null,
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
                },
                {
                    "name": "232324",
                    "color": "3",
                    "desc": ""
                }
            ],
            "numberFormat": "",
            "template": ""
        },
        {
            "id": "20241213113836-oyoy83j",
            "name": "描述",
            "type": "text",
            "icon": "",
            "wrap": false,
            "hidden": false,
            "pin": false,
            "width": "154px",
            "desc": "",
            "calc": null,
            "numberFormat": "",
            "template": ""
        }
    ],
    "rows": [
        {
            "id": "20250108230155-hnrc91q",
            "cells": [
                {
                    "id": "20250108230156-en3rs7u",
                    "value": {
                        "id": "20250108230156-en3rs7u",
                        "keyID": "20241213113357-svieuq5",
                        "blockID": "20250108230155-hnrc91q",
                        "type": "block",
                        "isDetached": true,
                        "createdAt": 1736348516401,
                        "updatedAt": 1737089198598,
                        "block": {
                            "id": "20250108230155-hnrc91q",
                            "icon": "",
                            "content": "21313333333333",
                            "created": 1736348516401,
                            "updated": 1737089198598
                        }
                    },
                    "valueType": "block",
                    "color": "",
                    "bgColor": ""
                },
                {
                    "id": "20250108230159-pssgj23",
                    "value": {
                        "id": "20250108230159-pssgj23",
                        "keyID": "20241213113357-mw9230g",
                        "blockID": "20250108230155-hnrc91q",
                        "type": "date",
                        "createdAt": 1736348529069,
                        "updatedAt": 1737089198598,
                        "date": {
                            "content": 1736316060000,
                            "isNotEmpty": true,
                            "hasEndDate": true,
                            "isNotTime": false,
                            "content2": 1736436540000,
                            "isNotEmpty2": true,
                            "formattedContent": ""
                        }
                    },
                    "valueType": "date",
                    "color": "",
                    "bgColor": ""
                },
                {
                    "id": "20250111124906-cyfnhfm",
                    "value": {
                        "id": "20250111124906-cyfnhfm",
                        "keyID": "20250111123406-3epoj13",
                        "blockID": "20250108230155-hnrc91q",
                        "type": "select",
                        "createdAt": 1736570973346,
                        "updatedAt": 1737040255548,
                        "mSelect": [
                            {
                                "content": "未完成",
                                "color": "2"
                            }
                        ]
                    },
                    "valueType": "select",
                    "color": "",
                    "bgColor": ""
                },
                {
                    "id": "20250108230209-twei07g",
                    "value": {
                        "id": "20250108230209-twei07g",
                        "keyID": "20241213113836-oyoy83j",
                        "blockID": "20250108230155-hnrc91q",
                        "type": "text",
                        "createdAt": 1736348530739,
                        "updatedAt": 1736348531739,
                        "text": {
                            "content": "2131"
                        }
                    },
                    "valueType": "text",
                    "color": "",
                    "bgColor": ""
                }
            ]
        },
        {
            "id": "20250116222554-yahqj0a",
            "cells": [
                {
                    "id": "20250116222554-wca1oh2",
                    "value": {
                        "id": "20250116222554-wca1oh2",
                        "keyID": "20241213113357-svieuq5",
                        "blockID": "20250116222554-yahqj0a",
                        "type": "block",
                        "isDetached": true,
                        "createdAt": 1737037554843,
                        "updatedAt": 1737089207943,
                        "block": {
                            "id": "20250116222554-yahqj0a",
                            "icon": "",
                            "content": "3242342",
                            "created": 1737037554843,
                            "updated": 1737089207943
                        }
                    },
                    "valueType": "block",
                    "color": "",
                    "bgColor": ""
                },
                {
                    "id": "20250116222558-3njefey",
                    "value": {
                        "id": "20250116222558-3njefey",
                        "keyID": "20241213113357-mw9230g",
                        "blockID": "20250116222554-yahqj0a",
                        "type": "date",
                        "createdAt": 1737037561257,
                        "updatedAt": 1737089207943,
                        "date": {
                            "content": 1744732800000,
                            "isNotEmpty": true,
                            "hasEndDate": true,
                            "isNotTime": false,
                            "content2": 1748107560000,
                            "isNotEmpty2": true,
                            "formattedContent": ""
                        }
                    },
                    "valueType": "date",
                    "color": "",
                    "bgColor": ""
                },
                {
                    "id": "20250116222632-q1wknml",
                    "value": {
                        "id": "20250116222632-q1wknml",
                        "keyID": "20250111123406-3epoj13",
                        "blockID": "20250116222554-yahqj0a",
                        "type": "select",
                        "createdAt": 1737037597491,
                        "updatedAt": 1737037598491,
                        "mSelect": [
                            {
                                "content": "未完成",
                                "color": "2"
                            }
                        ]
                    },
                    "valueType": "select",
                    "color": "",
                    "bgColor": ""
                },
                {
                    "id": "20250116222632-8pgexgm",
                    "value": {
                        "id": "20250116222632-8pgexgm",
                        "keyID": "20241213113836-oyoy83j",
                        "blockID": "20250116222554-yahqj0a",
                        "type": "text",
                        "createdAt": 1737037595232,
                        "updatedAt": 1737037596232,
                        "text": {
                            "content": "2131231"
                        }
                    },
                    "valueType": "text",
                    "color": "",
                    "bgColor": ""
                }
            ]
        },
        {
            "id": "20250116222124-vie01gh",
            "cells": [
                {
                    "id": "20250116222124-o1nd0ei",
                    "value": {
                        "id": "20250116222124-o1nd0ei",
                        "keyID": "20241213113357-svieuq5",
                        "blockID": "20250116222124-vie01gh",
                        "type": "block",
                        "isDetached": true,
                        "createdAt": 1737037284856,
                        "updatedAt": 1737089202451,
                        "block": {
                            "id": "20250116222124-vie01gh",
                            "icon": "",
                            "content": "qewqrqer",
                            "created": 1737037284856,
                            "updated": 1737089202451
                        }
                    },
                    "valueType": "block",
                    "color": "",
                    "bgColor": ""
                },
                {
                    "id": "20250116222538-wr5j8if",
                    "value": {
                        "id": "20250116222538-wr5j8if",
                        "keyID": "20241213113357-mw9230g",
                        "blockID": "20250116222124-vie01gh",
                        "type": "date",
                        "createdAt": 1737037541270,
                        "updatedAt": 1737089202451,
                        "date": {
                            "content": 1737037500000,
                            "isNotEmpty": true,
                            "hasEndDate": true,
                            "isNotTime": false,
                            "content2": 1737296700000,
                            "isNotEmpty2": true,
                            "formattedContent": ""
                        }
                    },
                    "valueType": "date",
                    "color": "",
                    "bgColor": ""
                },
                {
                    "id": "20250116222545-5h4orc3",
                    "value": {
                        "id": "20250116222545-5h4orc3",
                        "keyID": "20250111123406-3epoj13",
                        "blockID": "20250116222124-vie01gh",
                        "type": "select",
                        "createdAt": 1737037547007,
                        "updatedAt": 1737037599410,
                        "mSelect": [
                            {
                                "content": "未完成",
                                "color": "2"
                            }
                        ]
                    },
                    "valueType": "select",
                    "color": "",
                    "bgColor": ""
                },
                {
                    "id": "20250116222541-2u2u09x",
                    "value": {
                        "id": "20250116222541-2u2u09x",
                        "keyID": "20241213113836-oyoy83j",
                        "blockID": "20250116222124-vie01gh",
                        "type": "text",
                        "createdAt": 1737037544860,
                        "updatedAt": 1737037545860,
                        "text": {
                            "content": "33333333"
                        }
                    },
                    "valueType": "text",
                    "color": "",
                    "bgColor": ""
                }
            ]
        }
    ],
    "rowCount": 3,
    "pageSize": 50
};

