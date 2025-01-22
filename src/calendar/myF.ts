import * as api from '@/api';
import { ViewItem } from '@/calendar/interface';
import * as sy from 'siyuan'
import { settingdata } from '@/index';
import { Calendar } from '@fullcalendar/core';
import { moduleInstances } from '@/index';
// Define interfaces for better type safety
import { ISelectOption } from "@/calendar/interface";
import steveTools from "@/index";

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

            // steveTools.outlog(viewIds_Data);
        } catch (error) {
            console.error(`Error processing view ${va_id}:`, error);
        }
    }

    return viewIds_Data;
}

//获取视图值
export async function getViewValue(viewIds_Data: ViewItem[], isZQ = false) {
    const viewValue_Data = [];

    for (const viewId_Data of viewIds_Data) {
        try {
            const viewValue = await api.renderAttributeView(viewId_Data.rootid, viewId_Data.viewId);
            const data = extractDataFromTable(viewValue.view, isZQ);
            viewValue_Data.push({
                from: viewId_Data,
                data: data,
            });
            // steveTools.outlog(viewValue);
            // steveTools.outlog("ceshi1", data);


        } catch (error) {
            console.error(`Error processing view ${viewId_Data.viewId}:`, error);
        }
    }

    steveTools.outlog("ceshi2222:::::::::::::2", viewValue_Data);
    return viewValue_Data;
}



function extractDataFromTable(data: any, isZQ = false) {
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
                if (isZQ) {
                    if (columnMap.has('重复规则') && row.cells) {
                        const ruleCell = row.cells[columnMap.get('重复规则').index];
                        rowData['重复规则'] = {
                            content: ruleCell?.value?.text?.content || '',
                            keyID: ruleCell?.value?.keyID || ''
                        };
                    }
                    if (columnMap.has('持续时间') && row.cells) {
                        const numCell = row.cells[columnMap.get('持续时间').index];
                        rowData['持续时间'] = {
                            content: numCell?.value?.number?.content || '',
                            keyID: numCell?.value?.keyID || ''
                        };
                    }

                } else {
                    if (columnMap.has('状态') && row.cells) {
                        const statusCell = row.cells[columnMap.get('状态').index];
                        rowData['状态'] = {
                            content: statusCell?.value?.mSelect?.[0]?.content || '',
                            keyID: statusCell?.value?.keyID || ''
                        };
                    }
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
export async function convertToFullCalendarEvents(viewData: any[], viewData_zq: any[]) {
    const events = [];
    const addedEventIds = new Set();
    steveTools.outlog("viewData:::", viewData_zq);
    // 处理普通事件
    for (const view of viewData) {
        for (const item of view.data) {
            if (item['开始时间']?.start) {
                const eventId = item['事件']?.id || '';

                if (eventId && !addedEventIds.has(eventId)) {
                    addedEventIds.add(eventId);

                    const startDate = new Date(parseInt(item['开始时间'].start));
                    const endDate = item['开始时间'].end ? new Date(parseInt(item['开始时间'].end)) : null;

                    const isAllDay = !endDate ||
                        (startDate.getHours() === 0 && startDate.getMinutes() === 0 &&
                            (!endDate || (endDate.getHours() === 0 && endDate.getMinutes() === 0))) ||
                        (endDate && startDate.getTime() === endDate.getTime());

                    events.push({
                        id: eventId,
                        title: item['事件']?.content || '',
                        start: startDate,
                        end: endDate,
                        allDay: isAllDay,
                        extendedProps: {
                            blockId: eventId,
                            rootid: view.from.rootid,
                            status: item['状态']?.content || '',
                            description: item['描述']?.content || '',
                            isRecurring: false
                        }
                    });
                }
            }
        }
    }

    // 处理周期事件
    if (viewData_zq) {
        for (const view of viewData_zq) {
            for (const item of view.data) {
                if (item['开始时间']?.start) {
                    const eventId = item['事件']?.id || '';

                    if (eventId && !addedEventIds.has(eventId)) {
                        addedEventIds.add(eventId);

                        const startDate = new Date(parseInt(item['开始时间'].start));
                        const endDate = item['开始时间'].end ? new Date(parseInt(item['开始时间'].end)) : null;
                        steveTools.outlog("startDate:::", startDate, "endDate:::", endDate);
                        const isAllDay = !endDate ||
                            (startDate.getHours() === 0 && startDate.getMinutes() === 0 &&
                                (!endDate || (endDate.getHours() === 0 && endDate.getMinutes() === 0))) ||
                            (endDate && startDate.getTime() === endDate.getTime());
                        const rruleStr = item['重复规则']?.content
                            ? `DTSTART:${startDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z\n${item['重复规则'].content}`
                            : '';
                        events.push({
                            id: eventId,
                            title: item['事件']?.content || '',
                            start: startDate,
                            // end: endDate,
                            timeZone: 'local',
                            allDay: isAllDay,
                            rrule: rruleStr,
                            duration: item['持续时间']?.content || '',
                            extendedProps: {
                                blockId: eventId,
                                rootid: view.from.rootid,
                                // status: item['状态']?.content || '',
                                description: item['描述']?.content || '',
                                isRecurring: true,
                                recurringPattern: item['重复规则']?.content || ''
                            }
                        });
                    }
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
    let isok = false;
    steveTools.outlog("viewValue:::createEventInDatabase", viewValue);
    // 1. 创建面板HTML
    //// 获取当前日期的日记块ID
    // steveTools.outlog(settingdata);
    // steveTools.outlog(window.siyuan.ws.app);
    //加一个错误判断
    if (!settingdata["cal-create-pos"] || !settingdata["cal-db-id"]) {
        sy.showMessage('请先设置日程创建位置和日程创建数据库');
        return;
    }
    const daynote_id = await api.createDailyNote(window.siyuan.ws.app.appId, settingdata["cal-create-pos"]);
    //// 创建一个新块
    steveTools.outlog("daynote_id:::", daynote_id.id);
    const idid = await api.generateSiyuanID();
    const iddata = await api.appendBlock("dom", `<div data-node-id="${idid}" data-type="NodeSuperBlock" class="sb" data-sb-layout="row"><div data-node-id="${await api.generateSiyuanID()}" data-type="NodeParagraph" class="p" updated="20250121094434"><div contenteditable="true" spellcheck="false"></div><div class="protyle-attr" contenteditable="false">​</div></div><div data-node-id="${await api.generateSiyuanID()}" data-type="NodeParagraph" class="p" updated="20250121094435"><div contenteditable="true" spellcheck="false"></div><div class="protyle-attr" contenteditable="false">​</div></div><div class="protyle-attr" contenteditable="false">​</div></div>`, daynote_id.id);
    // const id = iddata[0].doOperations[0].id;
    const id = idid;
    // steveTools.outlog("iddata:::", iddata[0].doOperations[0].id);
    steveTools.outlog("dateStr:::", dateStr, "databaseId:::", settingdata["cal-db-id"]);
    const dialog = new sy.Dialog({
        title: `<div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <span>添加事件(按Ctrl+Enter提交)</span>
            <div>
                <button class="b3-button b3-button--text" style="padding: 4px 8px; font-size: 12px;">提交</button>
                <button class="b3-button b3-button--cancel" style="padding: 4px 8px; font-size: 12px;">取消</button>
            </div>
           </div>`,
        content: '<div id="eventPanel"></div>',
        width: '500px',
        height: 'auto',
        destroyCallback: async () => {
            if (!isok) {
                sy.showMessage('已取消添加事件');
                // await api.deleteBlock(id); //已知缺陷
                setTimeout(async () => await api.deleteBlock(id), 1500);//防崩
            }
            cancelBtn.removeEventListener('click', handleCancel);
            okBtn.removeEventListener('click', handleKeydown);
        },
        hideCloseIcon: true,
        // disableClose: true,
    })
    let ok = false;//防崩溃
    const eventPanel = document.getElementById('eventPanel');
    const okBtn = dialog.element.querySelector('.b3-button--text');
    const cancelBtn = dialog.element.querySelector('.b3-button--cancel');
    const handleCancel = () => {
        dialog.destroy();
    };

    //添加事件主代码
    const handleKeydown = async (e: KeyboardEvent) => {
        // console.log(e);
        if (e.type === 'click' && !ok) {sy.showMessage('请先输入内容') }
        if ((e.key === 'Enter' && e.ctrlKey && ok) || e.type === 'click' && ok) {
            e.preventDefault();
            window.siyuan.ws.ws.removeEventListener('message', messageHandler);
            // await new Promise(resolve => setTimeout(resolve, 100));
            isok = true;
            panel.protyle.element.removeEventListener('keydown', handleKeydown);
            // 删除空白块
            //// 获取块内容
            const block = await api.getBlockByID(id);
            //// 如果块内容为空，则删除块
            // steveTools.outlog("block:::", block.markdown);
            const markdownContent = block?.markdown?.trim() || '';
            console.log(markdownContent);
            steveTools.outlog("markdownContent:::", markdownContent);
            if (/^\{\{\{row\s*\}\}\}$/m.test(markdownContent)) {
                await api.deleteBlock(id);
                steveTools.outlog('删除空白块');
                dialog.destroy();
                sy.showMessage('已取消添加事件');
                return;
            }
            // 添加到日历
            //// 将块加入到数据库
            // steveTools.outlog("dasdsssssssssss::::::111111", panel);
            await api.addBlockToDatabase_pro(id, settingdata["cal-db-id"], panel);
            // 添加数据库属性
            //// 添加时间和状态属性
            const timeKeyID = await getKeyIDfromViewValue(viewValue, '开始时间');
            const statusKeyID = await getKeyIDfromViewValue(viewValue, '状态');
            const datata = await api.updateAttrViewCell_pro(id, settingdata["cal-db-id"], timeKeyID, dateStr, "date");
            const selectdata: ISelectOption[] = [{ content: "未完成" }];
            await api.updateAttrViewCell_pro(id, settingdata["cal-db-id"], statusKeyID, selectdata, "select");
            if (panel.isUploading()) {
                const checkUploading = setInterval(() => {
                    steveTools.outlog('destroyCallbackPANEL', panel.isUploading());
                    if (!panel.isUploading()) {
                        clearInterval(checkUploading);
                        setTimeout(() => calendar.refetchEvents(), 1500);
                    }
                }, 100);
            } else {
                setTimeout(() => calendar.refetchEvents(), 1500);
            }
            // 提示用户
            sy.showMessage('正在添加事件', -1, "info", "1");
            setTimeout(() => {
                dialog.destroy();
                sy.showMessage('已添加事件', 2000, "info", "1");
            }, 1000);

        }
    };

    cancelBtn.addEventListener('click', handleCancel);
    okBtn.addEventListener('click', handleKeydown);

    const panel = new sy.Protyle(window.siyuan.ws.app, eventPanel, {
        blockId: id,
        rootId: id,
        render: {
            breadcrumb: false,
        },
        action: ["cb-get-focus"],
        mode: "wysiwyg",
        // action: ["cb-get-focus"],

    });
    
    const messageHandler = async (e: MessageEvent) => {
        try {
            const msg = JSON.parse(e.data);
            if (msg.cmd === "transactions") {
                ok = true;
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };

    window.siyuan.ws.ws.addEventListener('message', messageHandler);
    // steveTools.outlog(msg);

    const debouncedHandleKeydown = debounce(handleKeydown, 300);
    panel.protyle.element.addEventListener('keydown', debouncedHandleKeydown);
    // panel.focus();

    steveTools.outlog("dasdsssssssssss::::::", panel);
    // 2. 添加到文档并显示

    // 3. 等待用户提交

}

export async function updateEventInDatabase(
    info: any,
    calendar: Calendar,
    viewValue
) {
    // 更新思源数据库中的时间
    steveTools.outlog("事件拖放", info);
    const blockId = info.event._def.extendedProps.blockId
    steveTools.outlog("blockId:::", blockId);
    const newStartDate = info.event.startStr;
    const newEndDate = info.event.endStr;
    steveTools.outlog("dateChange:::", newStartDate, newEndDate);
    const timeKeyID = await getKeyIDfromViewValue(viewValue, '开始时间');
    const rootid = info.event._def.extendedProps.rootid;
    steveTools.outlog("rootid:::", rootid);
    const datata = await api.updateAttrViewCell_pro(blockId, rootid, timeKeyID, newStartDate, "date", newEndDate);//TODOsettingdata["cal-db-id"]
    setTimeout(() => calendar.refetchEvents(), 1000);
    sy.showMessage('正在更新事件', -1, "info", "1");
    setTimeout(() => {
        sy.showMessage('已更新事件', 2000, "info", "1");
    }, 1000);
}

//TODO删除事件
//TODO优化代码
//TODO生成ics文件



async function getKeyIDfromViewValue(viewValue: any, key: string): Promise<string | undefined> {
    // First try to get keyID from existing viewValue
    const findKeyID = (data: any[]): string | undefined => {
        for (const view of data) {
            for (const item of view.data) {
                if (item?.[key]?.keyID) {
                    return item[key].keyID;
                }
            }
        }
        return undefined;
    };

    const existingKeyID = findKeyID(viewValue);
    if (existingKeyID) {
        return existingKeyID;
    }

    // If not found, fetch fresh data
    try {
        steveTools.outlog('Fetching fresh view data...');
        sy.showMessage('首次添加事件，请稍等...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        const Mcalendar = moduleInstances['M_calendar'];
        const av_ids = await Mcalendar.getAVreferenceid();

        if (!av_ids?.length) {
            console.warn('No reference IDs found');
            return undefined;
        }

        const viewIDs = await getViewId(av_ids);
        if (!viewIDs?.length) {
            console.warn('No view IDs found');
            return undefined;
        }

        const freshViewValue = await getViewValue(viewIDs);
        return findKeyID(freshViewValue);
    } catch (error) {
        console.error('Error fetching key ID:', error);
        return undefined;
    }
}

function debounce(func: Function, wait: number) {
    let timeout: NodeJS.Timeout;
    return function executedFunction(...args: any[]) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}



