import * as api from '@/api';
import { ViewItem } from '@/calendar/interface';
import * as sy from 'siyuan'
import { settingdata } from '@/index';
import { Calendar } from '@fullcalendar/core';
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
            const data = extractDataFromTable(viewValue.view);
            viewValue_Data.push({
                from: viewId_Data,
                data: data,
            });
            // console.log(viewValue);
            // console.log("ceshi1", data);


        } catch (error) {
            console.error(`Error processing view ${viewId_Data.viewId}:`, error);
        }
    }
    console.log("ceshi2222:::::::::::::2", viewValue_Data);
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
                        id: eventCell?.value?.block?.id || '',
                        keyID: eventCell?.value?.keyID || ''
                    };
                }

                // 提取开始时间
                if (columnMap.has('开始时间') && row.cells) {
                    const timeCell = row.cells[columnMap.get('开始时间').index];
                    rowData['开始时间'] = {
                        start: timeCell?.value?.date?.content || null,
                        end: timeCell?.value?.date?.content2 || null,
                        keyID: timeCell?.value?.keyID || ''
                    };
                }

                // 提取状态
                if (columnMap.has('状态') && row.cells) {
                    const statusCell = row.cells[columnMap.get('状态').index];
                    rowData['状态'] = {
                        content: statusCell?.value?.mSelect?.[0]?.content || '',
                        keyID: statusCell?.value?.keyID || ''
                    };
                }

                // 提取描述
                if (columnMap.has('描述') && row.cells) {
                    const descCell = row.cells[columnMap.get('描述').index];
                    rowData['描述'] = {
                        content: descCell?.value?.text?.content || '',
                        keyID: descCell?.value?.keyID || ''
                    };
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

//OK解决事件重复问题
//转换数据格式
export async function convertToFullCalendarEvents(viewData: any[]) {
    const events = [];
    const addedEventIds = new Set();

    for (const view of viewData) {
        for (const item of view.data) {
            if (item['开始时间']?.start) {
                const eventId = item['事件']?.id || '';

                if (eventId && !addedEventIds.has(eventId)) {
                    addedEventIds.add(eventId);

                    const startDate = new Date(parseInt(item['开始时间'].start));
                    const endDate = item['开始时间'].end ? new Date(parseInt(item['开始时间'].end)) : null;
                    
                    // 判断是否为全天事件
                    const isAllDay = endDate && 
                        startDate.getHours() === 0 && 
                        startDate.getMinutes() === 0 &&
                        endDate.getHours() === 23 && 
                        endDate.getMinutes() === 59 &&
                        startDate.toDateString() === endDate.toDateString();

                    events.push({
                        id: eventId,
                        title: item['事件']?.content || '',
                        start: startDate,
                        end: endDate,
                        allDay: isAllDay, // 添加全天事件标记
                        extendedProps: {
                            blockId: eventId,
                            status: item['状态'].content || '',
                            description: item['描述'].content || '',
                        }
                    });
                }
            }
        }
    }
    return events;
}



// 添加数据到思源数据库
//// 调用思源API创建块，块的内容为用户添加事件的面板
//// 将新创建的块添加到数据库中
//// 并设置此块的数据库属性，属性的值来源于用户添加事件的面板
//// 尽量使用思源的api实现
export async function createEventInDatabase(
    dateStr: string,
    // databaseId?: string,
    calendar: Calendar,
    viewValue
) {
    // 1. 创建面板HTML
    //// 获取当前日期的日记块ID
    // console.log(settingdata);
    // console.log(window.siyuan.ws.app);
    const daynote_id = await api.createDailyNote(window.siyuan.ws.app.appId, settingdata["cal-create-pos"]);
    //// 创建一个新块
    console.log("daynote_id:::", daynote_id.id);

    const iddata = await api.appendBlock("markdown", "- ", daynote_id.id);
    const id = iddata[0].doOperations[0].id;
    // console.log("iddata:::", iddata[0].doOperations[0].id);
    console.log("dateStr:::", dateStr, "databaseId:::", settingdata["cal-db-id"]);
    const dialog = new sy.Dialog({
        title: '添加事件',
        content: '<div id="eventPanel"></div>',
        width: '500px',
        destroyCallback: async (options) => {
            // 删除空白块
            //// 获取块内容
            const block = await api.getBlockByID(id);
            //// 如果块内容为空，则删除块
            if (!block?.markdown?.trim() || block?.markdown === '- ') {
                await api.deleteBlock(id);
                console.log('删除空白块');
                return;
            }
            // 添加到日历
            //// 将块加入到数据库
            // console.log("dasdsssssssssss::::::111111", panel);
            await api.addBlockToDatabase_pro(id, settingdata["cal-db-id"], panel);
            console.log('添加到日历');

            // 添加数据库属性
            //// 添加时间和状态属性
            console.log("viewValue:::", viewValue[0].data[0]['事件'].keyID);
            const datata = await api.updateAttrViewCell_pro(id, settingdata["cal-db-id"], viewValue[0].data[0]['开始时间'].keyID, dateStr, panel);

            console.log('destroyCallback', datata);
            setTimeout(() => calendar?.refetchEvents(), 1000);//TODO优化点
        },
        hideCloseIcon: true,
    })
    const eventPanel = document.getElementById('eventPanel');
    const panel = new sy.Protyle(window.siyuan.ws.app, eventPanel, {
        blockId: id,
        render: {
            breadcrumb: false,
        },

    });
    panel.focus();

    console.log("dasdsssssssssss::::::", panel);
    // 2. 添加到文档并显示

    // 3. 等待用户提交

}