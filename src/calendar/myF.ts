import * as api from '@/api';
import { ViewItem } from '@/calendar/interface';
import * as sy from 'siyuan'
import { settingdata } from '@/index';
import { Calendar } from '@fullcalendar/core';
import { moduleInstances } from '@/index';
// Define interfaces for better type safety
import { ISelectOption } from "@/calendar/interface";
import steveTools from "@/index";
import { refreshKanban } from './kanban';
import { runblockdata_for_sub, runblockdata_for_time } from './quickadd';
// import { isEventCompleted } from './calendar';
import { createDailynote } from '@frostime/siyuan-plugin-kits';

export const statusMap = {
    "未完成": "todo",
    "完成": "done",
    "进行中": "inprogress",
    "归档": "archive",
};
// Return type using interface
type ViewData = Promise<ViewItem[]>;

// Get view IDs and names
export async function getViewId(va_ids: string[]): ViewData {
    const viewIds_Data: ViewItem[] = [];

    for (const va_id of va_ids) {
        try {
            const view = await api.renderAttributeView(va_id);
            // # https://github.com/loonghfut/siyuan-steve-tools/issues/6
            const rootname = view.name ? `${view.name}-` : "";
            const rootid = view.id;
            view.views.forEach(viewItem => {
                viewIds_Data.push({
                    rootid: rootid,
                    viewId: viewItem.id,
                    name: rootname + viewItem.name
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
            // console.log("viewValue_CHUSHI:::", viewValue);
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

    // console.log("ceshi2222:::::::::::::2", viewValue_Data);
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
                // 提取优先级
                if (columnMap.has('优先级') && row.cells) {
                    const priorityCell = row.cells[columnMap.get('优先级').index];
                    rowData['优先级'] = {
                        content: priorityCell?.value?.mSelect?.[0]?.content || '',
                        keyID: priorityCell?.value?.keyID || ''
                    };
                }

                // 提取分类
                if (columnMap.has('分类') && row.cells) {
                    const categoryCell = row.cells[columnMap.get('分类').index];
                    rowData['分类'] = {
                        content: categoryCell?.value?.mSelect?.[0]?.content || '',
                        keyID: categoryCell?.value?.keyID || ''
                    };
                }

                // 提取子级
                if (columnMap.has('关联') && row.cells) {
                    const subCell = row.cells[columnMap.get('关联').index];
                    rowData['子级'] = {
                        contents: subCell?.value?.relation?.contents || '',
                        ids: subCell?.value?.relation?.blockIDs || '',
                        keyID: subCell?.value?.keyID || '',
                    };
                }

                //提取是否主事件
                if (columnMap.has('主事件') && row.cells) {
                    const mainCell = row.cells[columnMap.get('主事件').index];
                    rowData['主事件'] = {
                        content: mainCell?.value?.checkbox?.checked || false,
                        keyID: mainCell?.value?.keyID || ''
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
                    } else {
                        rowData['重复规则'] = {
                            content: '',
                            keyID: ''
                        };
                    }

                    if (columnMap.has('持续时间') && row.cells) {
                        const numCell = row.cells[columnMap.get('持续时间').index];
                        rowData['持续时间'] = {
                            content: numCell?.value?.number?.content || '',
                            keyID: numCell?.value?.keyID || ''
                        };
                    }
                    if (columnMap.has('完成日期') && row.cells) {
                        const endCell = row.cells[columnMap.get('完成日期').index];
                        // console.log("endCell", endCell);
                        rowData['完成日期'] = {
                            content: endCell?.value?.text?.content || '',
                            keyID: endCell?.value?.keyID || ''
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

//筛选事件函数
export async function filterViewValue(viewValue, filterKeys: string[] = []) {
    // 如果 filterKeys 为空数组，返回所有数据
    if (!filterKeys || filterKeys.length === 0) {
        return viewValue;
    }
    // console.log("filterKeys:::", filterKeys);
    // 筛选出匹配任一 ID 的视图
    const filteredViewValue = viewValue.filter(item =>
        filterKeys.includes(item.from.viewId)
    );

    if (filteredViewValue.length === 0 && !filterKeys.includes('qqcalendar')) {
        sy.showMessage('未找到匹配的视图，请重新选择', -1, "error");
    }

    return filteredViewValue;
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
                    let kramdown = "";
                    if (item['主事件']?.content || false) {
                        kramdown = (await api.getBlockKramdown(eventId)).kramdown;
                    }
                    events.push({
                        id: eventId,
                        title: item['事件']?.content || '',
                        start: startDate,
                        end: endDate,
                        allDay: isAllDay,
                        extendedProps: {
                            blockId: eventId,
                            kramdown: kramdown,
                            iskramdown: item['主事件']?.content || false,
                            rootid: view.from.rootid,
                            status: item['状态']?.content || '',
                            description: item['描述']?.content || '',
                            isRecurring: false,
                            priority: item['优先级']?.content || '无',
                            category: item['分类']?.content || '无',
                            sub: item['子级'] || '',
                            hasCircularRef: false,
                            statusid: item['状态']?.keyID || '',
                            priorityid: item['优先级']?.keyID || '',
                            categoryid: item['分类']?.keyID || '',
                            subid: item['子级']?.keyID || '',
                            descriptionid: item['描述']?.keyID || '',
                            Kstart: startDate,
                            Kend: endDate,
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
                        const isAllDay = false;
                        // (startDate.getHours() === 0 && startDate.getMinutes() === 0 &&
                        //     (!endDate || (endDate.getHours() === 0 && endDate.getMinutes() === 0))) ||
                        // (endDate && startDate.getTime() === endDate.getTime());

                        const rruleStr = item['重复规则']?.content
                            ? `DTSTART:${startDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z\n${item['重复规则'].content}`
                            : '';
                        if (!rruleStr) { continue; }

                        // 获取 kramdown 内容
                        let kramdown = "";
                        if (item['主事件']?.content || false) {
                            kramdown = (await api.getBlockKramdown(eventId)).kramdown;
                        }

                        events.push({
                            id: eventId,
                            title: item['事件']?.content || '',
                            start: startDate,
                            // end: endDate,
                            timeZone: 'local',
                            allDay: isAllDay,
                            rrule: rruleStr,
                            duration: item['持续时间']?.content || 1,
                            extendedProps: {
                                blockId: eventId,
                                rootid: view.from.rootid,
                                kramdown: kramdown,
                                status: '未完成',
                                description: item['描述']?.content || '',
                                priority: item['优先级']?.content || '无',
                                category: item['分类']?.content || '无',
                                isRecurring: true,
                                recurringPattern: item['重复规则']?.content || '',
                                okday: item['完成日期']?.content || '',
                                okdayid: item['完成日期']?.keyID || '',
                                ////////////////////////////////////////
                                // statusid: item['状态']?.keyID || '',
                                priorityid: item['优先级']?.keyID || '',
                                categoryid: item['分类']?.keyID || '',
                                subid: item['子级']?.keyID || '',
                                descriptionid: item['描述']?.keyID || '',
                                Kstart: startDate,
                                Kend: endDate,
                                sub: item['子级'] || '',
                                // hasCircularRef: false
                            }
                        });
                    }
                }
            }
        }
    }

    return events;
}
//查看事件
//@param forceSeeMore 是否强制使isSeeMore生效
export async function showEvent(blockID, rootId?, isSeeMore = false, forceSeeMore = false, qu_fan = false) {
    //// 判断是否存在此块
    let seemore = false;
    if (!forceSeeMore) {
        seemore = settingdata["cal-seemore"] || isSeeMore;
    } else {
        seemore = isSeeMore;
    }
    if (qu_fan) {
        seemore = !seemore;
    }
    const block = await api.getBlockByID(blockID);
    if (!block) {
        sy.showMessage('未找到此块');
        return;
    }
    if (!seemore) {
        const tab = await sy.openTab({
            app: window.siyuan.ws.app,
            doc: {
                id: blockID,
                action: ["cb-get-hl", "cb-get-all"],
            },
            // position: "right",
            keepCursor: false
        });

    } else {
        const dialog = new sy.Dialog({
            title: `事件详情`,
            content: '<div id="eventPanel-show"></div>',
            width: '500px',
            height: 'auto',
            destroyCallback: async (option) => {
                // console.log("ishandle",option?.ishandle)
                if (option?.ishandle) {
                } else {
                    await refreshKanban();
                }
            },
            hideCloseIcon: true,
            // disableClose: true,
        });
        const eventPanel = document.getElementById('eventPanel-show');
        const panel = new sy.Protyle(window.siyuan.ws.app, eventPanel, {
            blockId: blockID,
            rootId: blockID,
            render: {
                breadcrumb: false,
            },
            action: ["cb-get-focus",],
            mode: "wysiwyg",
            // action: ["cb-get-focus"],
            after: () => {
                if (seemore) {
                    // console.log(panel.protyle);
                    const parentElement = document.getElementById('eventPanel-show');
                    // console.log("parentElement", parentElement);
                    if (parentElement) {
                        const targetElement = parentElement.querySelector('.popover__block') && parentElement.querySelector(`[data-av-id="${rootId}"]`);
                        // const targetElement = parentElement.querySelector(`[data-av-id="${rootId}"]`);
                        // console.log("找到目标元素:", targetElement);
                        if (targetElement) {
                            (targetElement as HTMLElement).click();
                            dialog.destroy({ ishandle: "1" });
                        }
                    }
                }
            }

        });
    }
}

// 添加数据到思源数据库
//// 调用思源API创建块，块的内容为用户添加事件的面板
//// 将新创建的块添加到数据库中
//// 并设置此块的数据库属性，属性的值来源于用户添加事件的面板
//// 尽量使用思源的api实现
export async function createEventInDatabase(//OK:加一个是否刷新日历的参数
    dateStr: string,
    // databaseId?: string,
    calendar: Calendar,
    viewValue,
    db_id?: string,
    status = "",
    direct = { isdirect: false, directid: "" },
    isrefresh = true
) {
    let isok = false;
    status = status || "未完成";
    let to_db_id = db_id || settingdata["cal-db-id"];
    ///////////QQ日历//////////////
    createEventInDatabase_QQ(to_db_id, dateStr);
    if (to_db_id === 'qqcalendar') return;

    steveTools.outlog("viewValue:::createEventInDatabase", viewValue);
    function formatDateWithTime(dateStr: string, hour: number = 8): string {
        // 如果日期字符串已经包含时间部分，直接返回原值
        if (dateStr.includes('T')) {
            return dateStr;
        }
        // 确保日期格式为 YYYY-MM-DD
        const date = dateStr.split('T')[0];
        // 添加8点
        return `${date}T${hour.toString().padStart(2, '0')}:00`;
    }
    // 1. 创建面板HTML
    //// 获取当前日期的日记块ID
    //加一个错误判断
    if (!settingdata["cal-create-pos"] || !settingdata["cal-db-id"]) {
        sy.showMessage('请先设置日程创建位置和日程创建数据库');
        return;
    }
    if (direct.isdirect) {

        //块时间处理
        const blockdata = await api.getBlockKramdown(direct.directid);
        // console.log("blockdata:::", blockdata.kramdown);
        const ce = runblockdata_for_time(blockdata?.kramdown);
        const minsub = runblockdata_for_sub(blockdata?.kramdown);
        let ismain = false;
        if (minsub.length > 0) {
            ismain = true;
        }
        if (ce) {
            dateStr = ce;
        }
        //块时间处理

        await api.addBlockToDatabase_pro(direct.directid, to_db_id);
        const timeKeyID = await getKeyIDfromViewValue(viewValue, '开始时间', to_db_id);
        const statusKeyID = await getKeyIDfromViewValue(viewValue, '状态', to_db_id);
        const checkboxKeyID = await getKeyIDfromViewValue(viewValue, '主事件', to_db_id);
        const datata = await api.updateAttrViewCell_pro(direct.directid, to_db_id, timeKeyID, dateStr, "date");
        const selectdata: ISelectOption[] = [{ content: status }];
        // console.log("selectdata", selectdata);
        await api.updateAttrViewCell_pro(direct.directid, to_db_id, statusKeyID, selectdata, "select");
        await api.updateAttrViewCell_pro(direct.directid, to_db_id, checkboxKeyID, ismain, "checkbox");
        sy.showMessage('已添加事件', 2000, "info", "1");
        return true;
    }

    //// 创建一个新块
    let daynote_id;
    if (settingdata["cal-create-for-date"]) {
        daynote_id = await createDailynote(settingdata["cal-create-pos"], new Date(dateStr));
    } else {
        daynote_id = (await api.createDailyNote(window.siyuan.ws.app.appId, settingdata["cal-create-pos"])).id;
    }
    ////检查是否创建成功
    if (!daynote_id) {
        sy.showMessage('未找到日记块');
        return;
    }
    const idid = await api.generateSiyuanID() as string;

    await api.appendBlock("markdown", `{{{row

{: id="${await api.generateSiyuanID() as string}"}

{: id="${await api.generateSiyuanID() as string}"}
}}}
{: id="${idid}"  custom-st-event="${statusMap[status] || 'todo'}"}`, daynote_id)
    // const id = iddata[0].doOperations[0].id;
    const id = idid;
    // steveTools.outlog("iddata:::", iddata[0].doOperations[0].id);
    // console.log("dateStr:::", dateStr, "databaseId:::", to_db_id);
    const dialog = new sy.Dialog({
        title: `   <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <span>添加事件</span>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <select id="st-priority" class="b3-text-field" style="padding: 4px; font-size: 12px; width: auto; text-align: center;">
                                    <option value="" selected>加载中...</option>
                                </select>
                                <select id="st-category" class="b3-text-field" style="padding: 4px; font-size: 12px; width: auto; text-align: center;">
                                    <option value="" selected>加载中...</option>
                                </select>
                                <div style="display: flex; align-items: center;">
                                    <input type="datetime-local" 
                                    id="st-start-time"
                                    class="b3-text-field" 
                                    style="padding: 4px; font-size: 12px; width: 130px;"
                                    value="${formatDateWithTime(dateStr)}"/>
                                </div>
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
    // 加载分类选项
    const categorySelect = dialog.element.querySelector('#st-category') as HTMLSelectElement;
    await loadCategoryOptions(to_db_id, categorySelect);
    // 加载优先级选项
    const prioritySelect = dialog.element.querySelector('#st-priority') as HTMLSelectElement;
    await loadPriorityOptions(to_db_id, prioritySelect);
    ///////
    let ok = false;//防崩溃
    const eventPanel = document.getElementById('eventPanel');
    const okBtn = dialog.element.querySelector('.b3-button--text');
    const cancelBtn = dialog.element.querySelector('.b3-button--cancel');
    const handleCancel = () => {
        dialog.destroy();
    };


    const handleKeydown = async (e: KeyboardEvent) => {//添加事件主代码
        // console.log(e);
        if (e.type === 'click' && !ok) { sy.showMessage('请先输入内容') }
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
            // console.log(markdownContent);
            if (/^\{\{\{row\s*\}\}\}$/m.test(markdownContent)) {
                await api.deleteBlock(id);
                steveTools.outlog('删除空白块');
                dialog.destroy();
                sy.showMessage('已取消添加事件');
                return;
            }
            // 添加到日历
            //2025-02-12 修改：添加到数据库通过{: custom-avs="数据库ID"}属性实现
            //放弃：不稳定
            //// 将块加入到数据库
            await api.addBlockToDatabase_pro(id, to_db_id);
            // 添加数据库属性
            //// 添加时间和状态属性
            const timeKeyID = await getKeyIDfromViewValue(viewValue, '开始时间', to_db_id);
            // console.log("viewValue:::", viewValue);
            // console.log("timeKeyID:::", timeKeyID);
            const categoryKeyID = await getKeyIDfromViewValue(viewValue, '分类', to_db_id);
            const priorityKeyID = await getKeyIDfromViewValue(viewValue, '优先级', to_db_id);
            const checkboxKeyID = await getKeyIDfromViewValue(viewValue, '主事件', to_db_id);
            const statusKeyID = await getKeyIDfromViewValue(viewValue, '状态', to_db_id);
            //// 新：用户自定义改动开始时间,优先级,分类
            const category = (document.getElementById('st-category') as HTMLSelectElement).value;
            const newdateStr = (document.getElementById('st-start-time') as HTMLInputElement).value
            const priority = (document.getElementById('st-priority') as HTMLSelectElement).value;
            if (newdateStr) {
                dateStr = newdateStr;
            }
            ////块时间处理
            const blockdata = await api.getBlockKramdown(id);
            const ce = runblockdata_for_time(blockdata?.kramdown);
            const minsub = runblockdata_for_sub(blockdata?.kramdown);
            let ismain = false;
            // console.log("minsub", minsub);
            if (minsub.length > 0) {
                ismain = true;
            }
            if (ce) {
                dateStr = ce;
            }
            ////块时间处理
            await api.updateAttrViewCell_pro(id, to_db_id, timeKeyID, dateStr, "date");
            const selectdata: ISelectOption[] = [{ content: status }];
            const priorityData: ISelectOption[] = [{ content: priority }];
            const categoryData: ISelectOption[] = [{ content: category }];
            console.log("selectdata", selectdata);
            ///////////更新属性////////////////////
            if (category && categoryKeyID && categoryData && category !== "加载中..." && category !== "无") {
                await api.updateAttrViewCell_pro(id, to_db_id, categoryKeyID, categoryData, "select");
            }
            if (priority && priorityKeyID && priorityData) {
                await api.updateAttrViewCell_pro(id, to_db_id, priorityKeyID, priorityData, "select");
            }
            if (status && statusKeyID && selectdata) {
                await api.updateAttrViewCell_pro(id, to_db_id, statusKeyID, selectdata, "select");
            }
            if (checkboxKeyID) {
                await api.updateAttrViewCell_pro(id, to_db_id, checkboxKeyID, ismain, "checkbox");
            }
            //////////////////
            if (panel.isUploading()) {
                const checkUploading = setInterval(() => {
                    steveTools.outlog('destroyCallbackPANEL', panel.isUploading());
                    if (!panel.isUploading()) {
                        clearInterval(checkUploading);
                        if (isrefresh) {
                            setTimeout(() => calendar?.refetchEvents(), 1000);
                        }
                    }
                }, 100);
            } else {
                if (isrefresh) {
                    setTimeout(() => calendar?.refetchEvents(), 1000);//TODO:优化速度
                }
            }
            // 提示用户
            sy.showMessage('正在添加事件', -1, "info", "1");
            setTimeout(() => {
                dialog.destroy();
                sy.showMessage('已添加事件', 2000, "info", "1");
            }, 500);

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
    viewValue,
    is_more_one_day: boolean = false
) {
    // 更新思源数据库中的时间
    steveTools.outlog("事件拖放", info);
    const blockId = info.event._def.extendedProps.blockId
    steveTools.outlog("blockId:::", blockId);
    const newStartDate = info.event.startStr;
    let newEndDate = info.event.endStr;
    if (is_more_one_day && /^\d{4}-\d{2}-\d{2}$/.test(info.event.endStr)) {
        const endDate = new Date(info.event.endStr);
        endDate.setDate(endDate.getDate() - 1);
        newEndDate = endDate.toISOString();
    }
    steveTools.outlog("dateChange:::", newStartDate, newEndDate);
    const rootid = info.event._def.extendedProps.rootid;
    const timeKeyID = await getKeyIDfromViewValue(viewValue, '开始时间', rootid);
    steveTools.outlog("rootid:::", rootid);
    const datata = await api.updateAttrViewCell_pro(blockId, rootid, timeKeyID, newStartDate, "date", newEndDate);//TODOsettingdata["cal-db-id"]
    setTimeout(() => calendar.refetchEvents(), 1000);
    sy.showMessage('正在更新事件', -1, "info", "1");
    setTimeout(() => {
        sy.showMessage('已更新事件', 2000, "info", "1");
    }, 1000);
}



async function getKeyIDfromViewValue(viewValue: any, key: string, rootid: string): Promise<string | undefined> {
    // First try to get keyID from existing viewValue
    const findKeyID = (data: any[]): string | undefined => {
        for (const view of data) {
            for (const item of view.data) {
                if (item?.[key]?.keyID && view?.from?.rootid === rootid) {
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
        sy.showMessage('添加事件中，请稍等...', -1, "info", "1");
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
        sy.showMessage('添加事件中，请稍等...', 1, "info", "1");
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


export function changestatus_for_zq(event, date) {
    if (!event.okdayid) {
        sy.showMessage('未找到完成日期列', -1, "error");
        return;
    }

    let okdays = event.okday ? event.okday.split(',').map(d => d.trim()) : [];
    let newOkday = '';

    if (okdays.includes(date)) {
        // 如果日期存在，则删除
        okdays = okdays.filter(d => d !== date);
        sy.showMessage('已取消完成此事件', 3000, "info");
    } else {
        // 如果日期不存在，则添加
        okdays.push(date);
        sy.showMessage('已完成此事件', 3000, "info");
    }

    // 将数组转换回字符串
    newOkday = okdays.filter(Boolean).join(','); // filter(Boolean)用于移除空值

    api.updateAttrViewCell_pro(event.blockId, event.rootid, event.okdayid, newOkday, "text");
}


// 获取数据库中已有的分类列表
async function getCategories(dbId: string): Promise<string[]> {
    try {
        const view = await api.renderAttributeView(dbId);

        // 查找分类列
        const categoryColumn = view.view?.columns?.find(col => col.name === '分类');
        if (!categoryColumn) return ['无'];

        // 直接从选项中获取分类名称
        const categories = categoryColumn.options?.map(option => option.name) || [];

        // 如果没有预设选项，返回默认值
        if (!categories.length) {
            return ['无'];
        }

        // 返回排序后的分类列表（不包含"无"）
        return categories.sort();
    } catch (error) {
        console.error('获取分类列表失败:', error);
        return ['无'];
    }
}

async function loadCategoryOptions(to_db_id: any, categorySelect: HTMLSelectElement) {
    try {
        const categories = await getCategories(to_db_id);
        categorySelect.innerHTML = '';
        // 只在这里添加"无"选项
        categorySelect.appendChild(new Option('无', '无', true));
        // 添加其他分类
        categories.forEach(category => {
            if (category !== '无') { // 避免重复添加"无"选项
                categorySelect.appendChild(new Option(category, category));
            }
        });
    } catch (error) {
        console.error('加载分类失败:', error);
        sy.showMessage('加载分类失败', -1, "error");
    }
}




function createEventInDatabase_QQ(to_db_id: string, dateStr: string) {
    // 在 createEventInDatabase 函数中添加处理QQ日历的部分
    if (to_db_id === 'qqcalendar') {
        // 用户选择了QQ日历作为目标
        const calendar = moduleInstances['M_calendar']?.QQCalDAVClient;
        if (!calendar) {
            sy.showMessage('QQ日历客户端未初始化', -1, 'error');
            return;
        }

        try {
            // 获取QQ日历ID
            const calendarId = settingdata['cal-qq-calendar-url'];
            if (!calendarId) {
                sy.showMessage('未设置QQ日历ID', -1, 'error');
                return;
            }

            // 解析开始时间和结束时间
            console.log('dateStr:', dateStr);
            const startTime = new Date(dateStr);
            let endTime = new Date(startTime);
            endTime.setHours(startTime.getHours() + 1); // 默认1小时

            // 创建事件并获取面板输入内容
            const dialog = new sy.Dialog({
                title: '添加到QQ日历',
                content: `
                    <div style="padding: 16px;">
                        <div class="form-item">
                            <label>标题</label>
                            <input type="text" id="qq-event-title" class="b3-text-field" placeholder="请输入事件标题">
                        </div>
                        <div class="form-item">
                            <label>开始时间</label>
                            <input type="datetime-local" id="qq-event-start" class="b3-text-field" value="${formatDateForInput(startTime)}">
                        </div>
                        <div class="form-item">
                            <label>结束时间</label>
                            <input type="datetime-local" id="qq-event-end" class="b3-text-field" value="${formatDateForInput(endTime)}">
                        </div>
                        <div class="form-item">
                            <label>描述</label>
                            <textarea id="qq-event-desc" class="b3-text-field" rows="3" placeholder="事件描述(可选)"></textarea>
                        </div>
                        <div class="b3-dialog__action">
                            <button class="b3-button b3-button--cancel">取消</button>
                            <button class="b3-button b3-button--text" id="qq-confirm-btn">确认</button>
                        </div>
                    </div>
                `,
                width: '400px',
                height: 'auto',
            });

            // 添加确认按钮的事件监听器
            const confirmBtn = dialog.element.querySelector('#qq-confirm-btn');
            const cancelBtn = dialog.element.querySelector('.b3-button--cancel');

            cancelBtn.addEventListener('click', () => {
                dialog.destroy();
            });

            confirmBtn.addEventListener('click', async () => {
                // 获取表单值
                const title = (document.getElementById('qq-event-title') as HTMLInputElement).value;
                const start = new Date((document.getElementById('qq-event-start') as HTMLInputElement).value);
                const end = new Date((document.getElementById('qq-event-end') as HTMLInputElement).value);
                const description = (document.getElementById('qq-event-desc') as HTMLTextAreaElement).value;
                // const allDay = (document.getElementById('qq-event-allday') as HTMLInputElement).checked;

                if (!title) {
                    sy.showMessage('请输入事件标题', -1, 'error');
                    return; // 阻止继续执行
                }

                // 创建事件
                try {
                    sy.showMessage('正在添加事件到QQ日历...', -1, 'info', 'addcal');
                    await calendar.createEvent_new(calendarId, {
                        summary: title,
                        start: start,
                        end: end,
                        description: description,
                    });
                    await moduleInstances['M_calendar']?.updateEventsFromQQCalDAV();
                    refreshKanban();
                    // setTimeout(() => refreshKanban(), 1000);
                    sy.showMessage('已添加事件到QQ日历', 3000, 'info', 'addcal');
                    dialog.destroy();
                } catch (error) {
                    console.error('添加QQ日历事件失败:', error);
                    sy.showMessage('添加事件失败', -1, 'error');
                }
            });

            return;
        } catch (error) {
            console.error('添加QQ日历事件失败:', error);
            sy.showMessage('添加事件失败', -1, 'error');
            return;
        }
    }

    // 格式化日期为datetime-local输入框格式

}
function formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function updataqqcalendar(info) {
    const dialog = new sy.Dialog({
        title: '编辑QQ日历事件',
        content: `
            <div style="padding: 16px;">
                <div class="form-item">
                    <label>标题</label>
                    <input type="text" id="qq-edit-title" class="b3-text-field" value="${info.event.title}">
                </div>
                <div class="form-item">
                    <label>开始时间</label>
                    <input type="datetime-local" id="qq-edit-start" class="b3-text-field" value="${formatDateForInput(info.event.start)}">
                </div>
                <div class="form-item">
                    <label>结束时间</label>
                    <input type="datetime-local" id="qq-edit-end" class="b3-text-field" value="${formatDateForInput(info.event.end || new Date(info.event.start.getTime() + 60 * 60 * 1000))}">
                </div>
                <div class="form-item">
                    <label>描述</label>
                    <textarea id="qq-edit-desc" class="b3-text-field" rows="3">${info.event.extendedProps.description || ''}</textarea>
                </div>
                <div class="b3-dialog__action">
                    <button class="b3-button b3-button--cancel" id="qq-edit-cancel">取消</button>
                    <button class="b3-button b3-button--text" id="qq-edit-confirm">确认</button>
                </div>
            </div>
        `,
        width: '400px',
    });

    // 添加确认按钮事件
    const confirmBtn = dialog.element.querySelector('#qq-edit-confirm');
    confirmBtn.addEventListener('click', async () => {
        const title = (document.getElementById('qq-edit-title') as HTMLInputElement).value;
        const start = new Date((document.getElementById('qq-edit-start') as HTMLInputElement).value);
        const end = new Date((document.getElementById('qq-edit-end') as HTMLInputElement).value);
        const description = (document.getElementById('qq-edit-desc') as HTMLTextAreaElement).value;
        // const allDay = (document.getElementById('qq-edit-allday') as HTMLInputElement).checked;

        if (!title) {
            sy.showMessage('请输入事件标题', -1, 'error');
            return;
        }

        try {
            sy.showMessage('正在更新QQ日历事件...', 3000);
            const calendarId = settingdata['cal-qq-calendar-url'];
            const success = await moduleInstances['M_calendar'].QQCalDAVClient.updateEvent(
                calendarId,
                info.event.id,
                {
                    title: title,
                    start: start,
                    end: end,
                    description: description,
                }
            );

            if (success) {
                dialog.destroy();
                await moduleInstances['M_calendar']?.updateEventsFromQQCalDAV();
                refreshKanban();
            }
        } catch (error) {
            console.error('更新QQ日历事件失败:', error);
            sy.showMessage('更新事件失败', -1, 'error');
        }
    });
    // 添加删除按钮
    const footer = dialog.element.querySelector('.b3-dialog__action');
    if (footer) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'b3-button b3-button--cancel';
        deleteBtn.textContent = '删除';
        deleteBtn.style.backgroundColor = '#e53935';
        deleteBtn.style.color = 'white';
        deleteBtn.onclick = async () => {
            sy.confirm('删除事件', '确定要删除这个事件吗？此操作不可撤销。', async () => {
                const calendarId = settingdata['cal-qq-calendar-url'];
                const success = await moduleInstances['M_calendar'].QQCalDAVClient.deleteEvent(
                    calendarId,
                    info.event.id
                );

                if (success) {
                    dialog.destroy();
                    await moduleInstances['M_calendar']?.updateEventsFromQQCalDAV();
                    refreshKanban();
                    sy.showMessage('QQ日历事件已删除', 3000);
                }
            });
        };
        footer.insertBefore(deleteBtn, footer.firstChild);
    }
}


// 获取数据库中已有的优先级列表
async function getPriorities(dbId: string): Promise<string[]> {
    try {
        const view = await api.renderAttributeView(dbId);

        // 查找优先级列
        const priorityColumn = view.view?.columns?.find(col => col.name === '优先级');
        if (!priorityColumn) return ['无'];

        // 直接从选项中获取优先级名称
        const priorities = priorityColumn.options?.map(option => option.name) || [];

        // 如果没有预设选项，返回默认值
        if (!priorities.length) {
            return ['高', '中', '低', '无'];
        }

        // 返回排序后的优先级列表
        return priorities.sort();
    } catch (error) {
        console.error('获取优先级列表失败:', error);
        return ['高', '中', '低', '无'];
    }
}

// 加载优先级选项
async function loadPriorityOptions(to_db_id: any, prioritySelect: HTMLSelectElement) {
    try {
        const priorities = await getPriorities(to_db_id);
        prioritySelect.innerHTML = '';
        // 添加"无"选项
        prioritySelect.appendChild(new Option('无', '无', true));
        // 添加其他优先级
        priorities.forEach(priority => {
            if (priority !== '无') { // 避免重复添加"无"选项
                prioritySelect.appendChild(new Option(priority, priority));
            }
        });
    } catch (error) {
        console.error('加载优先级失败:', error);
        sy.showMessage('加载优先级失败', -1, "error");
    }
}