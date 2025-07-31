import * as api from '@/api/api';
import { ViewItem } from '@/calendar/interface';
import * as sy from 'siyuan'
import { settingdata } from '@/index';
import { Calendar } from '@fullcalendar/core';
import { moduleInstances } from '@/index';
// Define interfaces for better type safety
import { ISelectOption } from "@/calendar/interface";
import steveTools from "@/index";
import { refreshKanban } from './kanban';
import { runblockdata_for_category, runblockdata_for_note, runblockdata_for_sub, runblockdata_for_time, runblockdata_for_title } from './quickadd';
// import { isEventCompleted } from './calendar';
import { createDailynote } from '@frostime/siyuan-plugin-kits';
import { getRequiredFields } from './fieldConfig';

export const statusMap = new Proxy({
    // 保留原有的映射关系作为已知状态
    "未完成": "todo",
    "完成": "done",
    "进行中": "inprogress",
    "归档": "archive",
}, {
    get: (target, prop) => {
        // 如果是已知状态，返回预设映射
        if (typeof prop === 'string' && prop in target) {
            return target[prop];
        }

        // 对于未知状态，生成一个规范化的代码
        if (typeof prop === 'string') {
            // 将中文或其他语言的状态名转换为英文标识符:
            // 1. 转换为小写
            // 2. 移除空格和特殊字符
            // 3. 如果是纯中文或其他非拉丁字符，使用拼音首字母或生成唯一标识
            const code = prop
                .toLowerCase()
                .replace(/\s+/g, '')
                .replace(/[^\w\u4e00-\u9fa5]/gi, '');

            // 如果处理后为空字符串，返回默认状态
            return code || 'todo';
        }

        // 任何异常情况返回默认状态
        return 'todo';
    }
});
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
            const data = await extractDataFromTable(viewValue.view, viewId_Data.rootid, isZQ);
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



async function extractDataFromTable(data: any, avID: string, isZQ = false) {
    const isGalleryView = data && data.hasOwnProperty('fields') && data.hasOwnProperty('cards');
    const isTableView = data && data.hasOwnProperty('columns') && data.hasOwnProperty('rows');

    if (!isGalleryView && !isTableView) {
        console.warn('Invalid or unrecognized data structure received:', data);
        return [];
    }

    // 定义需要的字段及其类型
    const requiredFields = getRequiredFields(isZQ);

    // 1. 创建字段映射
    const fieldMap = new Map();
    const fields = isGalleryView ? data.fields : data.columns;
    fields.forEach((field: any, index: number) => {
        if (field && field.name) {
            fieldMap.set(field.name, {
                id: field.id,
                index: index // index is for Table view
            });
        }
    });

    // 2. 检查缺失的字段并创建（仅在启用自动创建功能时）
    if (settingdata["cal-auto-create-fields"]) {
        const missingFields: string[] = [];
        for (const [fieldName, _fieldType] of Object.entries(requiredFields)) {
            if (!fieldMap.has(fieldName)) {
                missingFields.push(fieldName);
            }
        }

        // 如果有缺失的字段，创建它们
        if (missingFields.length > 0) {
            console.log(`检测到缺失的字段: ${missingFields.join(', ')}，正在自动创建...`);
            sy.showMessage(`检测到缺失的字段: ${missingFields.join(', ')}，正在自动创建...`);
            sy.showMessage(`数据库字段创建后，请不要删除，无用字段请自行隐藏`, -1, "error");
            try {
                for (const fieldName of missingFields) {
                    const fieldType = requiredFields[fieldName];
                    await api.addAttributeViewKey(avID, fieldName, fieldType);
                    console.log(`成功创建字段: ${fieldName} (类型: ${fieldType})`);
                }
                
                // 重新获取视图数据以包含新创建的字段
                const updatedViewValue = await api.renderAttributeView(avID);
                const updatedData = updatedViewValue.view;
                
                // 更新字段映射
                fieldMap.clear();
                const updatedFields = isGalleryView ? updatedData.fields : updatedData.columns;
                updatedFields.forEach((field: any, index: number) => {
                    if (field && field.name) {
                        fieldMap.set(field.name, {
                            id: field.id,
                            index: index
                        });
                    }
                });
                
                // 使用更新后的数据
                data = updatedData;
            } catch (error) {
                console.error('创建字段时出错:', error);
                // 即使创建字段失败，也继续处理现有数据
            }
        }
    }

    // 3. 提取数据
    const items = isGalleryView ? data.cards : data.rows;
    if (!items || !Array.isArray(items)) {
        return [];
    }

    try {
        const result = items.map((item: any) => {
            const rowData: any = {};
            let getCell;

            if (isGalleryView) {
                // For Gallery view, create a map from keyID to value for quick lookup
                const valueMap = new Map();
                item.values.forEach((v: any) => {
                    if (v.value?.keyID) {
                        valueMap.set(v.value.keyID, v.value);
                    }
                });
                getCell = (fieldName: string) => {
                    const field = fieldMap.get(fieldName);
                    return field ? valueMap.get(field.id) : undefined;
                };
            } else { // isTableView
                // For Table view, get cell by index
                getCell = (fieldName: string) => {
                    const field = fieldMap.get(fieldName);
                    return field && item.cells ? item.cells[field.index]?.value : undefined;
                };
            }

            try {
                // 提取事件
                const eventCell = getCell('事件');
                if (eventCell) {
                    rowData['事件'] = {
                        content: eventCell.block?.content || '',
                        id: eventCell.block?.id || item.id || '', // Fallback to item.id for gallery
                        keyID: eventCell.keyID || ''
                    };
                }

                // 提取开始时间
                const timeCell = getCell('开始时间');
                if (timeCell) {
                    const dateValue = timeCell.date;
                    rowData['开始时间'] = {
                        start: dateValue?.content || null,
                        end: dateValue?.hasEndDate ? (dateValue?.content2 || null) : null,
                        keyID: timeCell.keyID || '',
                        hasEndDate: dateValue?.hasEndDate || false
                    };
                }

                // 提取优先级
                const priorityCell = getCell('优先级');
                if (priorityCell) {
                    rowData['优先级'] = {
                        content: priorityCell.mSelect?.[0]?.content || '',
                        keyID: priorityCell.keyID || ''
                    };
                }

                // 提取分类
                const categoryCell = getCell('分类');
                if (categoryCell) {
                    rowData['分类'] = {
                        content: categoryCell.mSelect?.[0]?.content || '',
                        keyID: categoryCell.keyID || ''
                    };
                }

                // 提取标签
                const tagCell = getCell('标签');
                if (tagCell) {
                    // console.log("tagCell:::", tagCell);
                    rowData['标签'] = {
                        content: tagCell.mSelect?.map((item: ISelectOption) => item.content) || [],
                        keyID: tagCell.keyID || ''
                    };
                }

                // 提取子级 (关联)
                const subCell = getCell('关联');
                if (subCell) {
                    rowData['子级'] = {
                        contents: subCell.relation?.contents || '',
                        ids: subCell.relation?.blockIDs || '',
                        keyID: subCell.keyID || '',
                    };
                }

                //提取是否主事件
                const mainCell = getCell('主事件');
                if (mainCell) {
                    rowData['主事件'] = {
                        content: mainCell.checkbox?.checked || false,
                        keyID: mainCell.keyID || ''
                    };
                }

                //提取链接
                const linkCell = getCell('链接');
                if (linkCell) {
                    rowData['链接'] = {
                        content: linkCell.url?.content || '',
                        keyID: linkCell.keyID || ''
                    };
                }

                //提取是否全天事件
                const allDayCell = getCell('全天');
                if (allDayCell) {
                    rowData['全天'] = {
                        content: allDayCell.checkbox?.checked || false,
                        keyID: allDayCell.keyID || ''
                    };
                }

                // 提取状态或周期性事件的字段
                if (isZQ) {
                    const ruleCell = getCell('重复规则');
                    rowData['重复规则'] = {
                        content: ruleCell?.text?.content || '',
                        keyID: ruleCell?.keyID || ''
                    };

                    const numCell = getCell('持续时间');
                    rowData['持续时间'] = {
                        content: numCell?.number?.content || '',
                        keyID: numCell?.keyID || ''
                    };

                    const endCell = getCell('完成日期');
                    rowData['完成日期'] = {
                        content: endCell?.text?.content || '',
                        keyID: endCell?.keyID || ''
                    };
                } else {
                    const statusCell = getCell('状态');
                    if (statusCell) {
                        rowData['状态'] = {
                            content: statusCell.mSelect?.[0]?.content || '',
                            keyID: statusCell.keyID || ''
                        };
                    }
                }

                // 提取描述
                const descCell = getCell('描述');
                if (descCell) {
                    rowData['描述'] = {
                        content: descCell.text?.content || '',
                        keyID: descCell.keyID || ''
                    };
                }

                // 2025/7/5新增：提取 didaID
                const didaIdCell = getCell('didaID');
                if (didaIdCell) {
                    rowData['didaID'] = {
                        content: didaIdCell.text?.content || '',
                        keyID: didaIdCell.keyID || ''
                    };
                }
                // console.log("rowData:::", rowData);
                return rowData;
            } catch (error) {
                console.error('Error processing row/card:', item, error);
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

    if (filteredViewValue.length === 0 && !filterKeys.includes('qqcalendar') && !filterKeys.includes('icsSubscription')) {
        sy.showMessage('未找到匹配的视图，请重新选择', -1, "error");
    }

    return filteredViewValue;
}



//OK解决事件重复问题
//转换数据格式
export async function convertToFullCalendarEvents(viewData: any[], viewData_zq: any[]) {
    const events = [];
    const addedEventIds = new Set();
    console.log("viewData:::", viewData);
    // 处理普通事件
    for (const view of viewData) {
        for (const item of view.data) {
            if (item['开始时间']?.start) {
                const eventId = item['事件']?.id || '';

                if (eventId && !addedEventIds.has(eventId)) {
                    addedEventIds.add(eventId);

                    const startDate = new Date(parseInt(item['开始时间'].start));
                    const endDate = item['开始时间'].end ? new Date(parseInt(item['开始时间'].end)) : null;

                    // 优先使用数据库中的全天设置，如果没有则按原逻辑判断
                    const isAllDay = item['全天']?.content !== undefined 
                        ? item['全天'].content 
                        : (startDate.getHours() === 0 && startDate.getMinutes() === 0 &&
                            (!endDate || (endDate.getHours() === 0 && endDate.getMinutes() === 0)));

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
                            allDayId: item['全天']?.keyID || '',
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
        await sy.openTab({
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
        new sy.Protyle(window.siyuan.ws.app, eventPanel, {
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
        // console.log("createEventInDatabase:::", await checkBlockInEvent(direct.directid, to_db_id));
        if (await checkBlockInEvent(direct.directid, to_db_id)) {
            console.log("目标数据库已存在此事件");
            return;
        }
        //块时间处理
        const blockdata = await api.getBlockKramdown(direct.directid);
        // console.log("blockdata:::", blockdata.kramdown);
        const ce = runblockdata_for_time(blockdata?.kramdown);
        const minsub = runblockdata_for_sub(blockdata?.kramdown);
        const categorie = runblockdata_for_category(blockdata?.kramdown);
        const note = runblockdata_for_note(blockdata?.kramdown);
        const title = runblockdata_for_title(blockdata?.kramdown);
        console.log("title:::", title);
        let ismain = false;
        if (minsub.length > 0) {
            ismain = true;
        }
        if (ce) {
            dateStr = ce;
            // console.log("ce:::", ce);
        }
        // console.log("dateStr:::", dateStr);
        //块时间处理

        await api.addBlockToDatabase_pro(direct.directid, to_db_id);
        const timeKeyID = await getKeyIDfromViewValue(viewValue, '开始时间', to_db_id);
        const statusKeyID = await getKeyIDfromViewValue(viewValue, '状态', to_db_id);
        const checkboxKeyID = await getKeyIDfromViewValue(viewValue, '主事件', to_db_id);
        const allDayKeyID = await getKeyIDfromViewValue(viewValue, '全天', to_db_id);
        const categoryKeyID = await getKeyIDfromViewValue(viewValue, '分类', to_db_id);
        const noteKeyID = await getKeyIDfromViewValue(viewValue, '描述', to_db_id);
        const titleKeyID = await getKeyIDfromViewValue(viewValue, '事件', to_db_id);
        const priorityKeyID = await getKeyIDfromViewValue(viewValue, '优先级', to_db_id);
        if (titleKeyID && title) {
            console.log("titleKeyID:::", titleKeyID);
            await api.updatemainkey({
                avID: to_db_id,
                blockID: direct.directid,
                keyID: titleKeyID,
                content: title,
            });
        }
        // 批量更新：不使用 await，让请求积累到队列中
        const updatePromises: Promise<any>[] = [];
        
        if (categoryKeyID && categorie) {
            const categoryData: ISelectOption[] = [{ content: categorie }];
            updatePromises.push(api.updateAttrViewCell_pro(direct.directid, to_db_id, categoryKeyID, categoryData, "select"));
        }
        if (noteKeyID && note) {
            updatePromises.push(api.updateAttrViewCell_pro(direct.directid, to_db_id, noteKeyID, note, "text"));
        }
        updatePromises.push(api.updateAttrViewCell_pro(direct.directid, to_db_id, timeKeyID, dateStr, "date"));
        
        const selectdata: ISelectOption[] = [{ content: status }];
        // console.log("selectdata", selectdata);
        // 2025/7/5新增默认添加优先级
        updatePromises.push(api.updateAttrViewCell_pro(direct.directid, to_db_id, priorityKeyID, [{ content: "无" }], "select"));
        updatePromises.push(api.updateAttrViewCell_pro(direct.directid, to_db_id, statusKeyID, selectdata, "select"));
        updatePromises.push(api.updateAttrViewCell_pro(direct.directid, to_db_id, checkboxKeyID, ismain, "checkbox"));
        // 默认设置为非全天事件
        if (allDayKeyID) {
            updatePromises.push(api.updateAttrViewCell_pro(direct.directid, to_db_id, allDayKeyID, false, "checkbox"));
        }
        
        // 等待所有更新完成
        await Promise.all(updatePromises);
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
                                <label style="display: flex; align-items: center; gap: 2px; font-size: 12px;">
                                    <input type="checkbox" id="st-all-day" style="margin: 0;">
                                    全天
                                </label>
                                <button class="b3-button b3-button--text" style="padding: 4px 8px; font-size: 12px;">提交</button>
                                <button class="b3-button b3-button--cancel" style="padding: 4px 8px; font-size: 12px;">取消</button>
                            </div>
                           </div>`,
        content: '<div id="eventPanel"></div>',
        width: '700px',
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
    
    // 添加全天选项的交互逻辑
    const allDayCheckbox = dialog.element.querySelector('#st-all-day') as HTMLInputElement;
    const startTimeInput = dialog.element.querySelector('#st-start-time') as HTMLInputElement;
    
    allDayCheckbox.addEventListener('change', () => {
        if (allDayCheckbox.checked) {
            // 全天事件：设置为当天00:00
            const currentDate = startTimeInput.value.split('T')[0];
            startTimeInput.value = `${currentDate}T00:00`;
        }
    });
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
            const allDayKeyID = await getKeyIDfromViewValue(viewValue, '全天', to_db_id);
            const statusKeyID = await getKeyIDfromViewValue(viewValue, '状态', to_db_id);
            const noteKeyID = await getKeyIDfromViewValue(viewValue, '描述', to_db_id);
            //// 新：用户自定义改动开始时间,优先级,分类
            const category2 = (document.getElementById('st-category') as HTMLSelectElement).value;
            const newdateStr = (document.getElementById('st-start-time') as HTMLInputElement).value
            const priority = (document.getElementById('st-priority') as HTMLSelectElement).value;
            const isAllDay = (document.getElementById('st-all-day') as HTMLInputElement).checked;
            if (newdateStr) {
                dateStr = newdateStr;
            }
            ////块时间处理
            const blockdata = await api.getBlockKramdown(id);
            const ce = runblockdata_for_time(blockdata?.kramdown);
            const minsub = runblockdata_for_sub(blockdata?.kramdown);
            const category1 = runblockdata_for_category(blockdata?.kramdown);
            const note = runblockdata_for_note(blockdata?.kramdown);
            // 手动输入分类优先
            const category = category1 || category2;
            let ismain = false;
            // console.log("minsub", minsub);
            if (minsub.length > 0) {
                ismain = true;
            }
            if (ce) {
                dateStr = ce;
            }
            ////块时间处理 - 批量更新优化
            const updatePromises2: Promise<any>[] = [];
            
            updatePromises2.push(api.updateAttrViewCell_pro(id, to_db_id, timeKeyID, dateStr, "date"));
            
            const selectdata: ISelectOption[] = [{ content: status }];
            const priorityData: ISelectOption[] = [{ content: priority }];
            const categoryData: ISelectOption[] = [{ content: category }];
            console.log("selectdata", selectdata);
            
            ///////////更新属性////////////////////
            if (noteKeyID && note) {
                updatePromises2.push(api.updateAttrViewCell_pro(id, to_db_id, noteKeyID, note, "text"));
            }
            if (category && categoryKeyID && categoryData && category !== "加载中..." && category !== "无") {
                updatePromises2.push(api.updateAttrViewCell_pro(id, to_db_id, categoryKeyID, categoryData, "select"));
            }
            if (priority && priorityKeyID && priorityData) {
                updatePromises2.push(api.updateAttrViewCell_pro(id, to_db_id, priorityKeyID, priorityData, "select"));
            }
            if (status && statusKeyID && selectdata) {
                updatePromises2.push(api.updateAttrViewCell_pro(id, to_db_id, statusKeyID, selectdata, "select"));
            }
            if (checkboxKeyID) {
                updatePromises2.push(api.updateAttrViewCell_pro(id, to_db_id, checkboxKeyID, ismain, "checkbox"));
            }
            if (allDayKeyID) {
                updatePromises2.push(api.updateAttrViewCell_pro(id, to_db_id, allDayKeyID, isAllDay, "checkbox"));
            }
            
            // 等待所有更新完成
            await Promise.all(updatePromises2);
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

export async function checkBlockInEvent(blockId: string, to_db_id: string) {
    const attrs = await api.getBlockAttrs(blockId);
    // console.log("attrs", attrs);
    // 判断 "custom-avs" 是否存在
    if ("custom-avs" in attrs) {
        const avsValue = attrs["custom-avs"];
        // 将 "custom-avs" 的值按逗号分割成数组
        const avsList = avsValue.split(',');
        // 判断 to_db_id 是否在数组中
        const isInEvent = avsList.includes(to_db_id);
        // console.log("Is block in the specified event database?", isInEvent);
        return isInEvent;
    }
    // 如果 "custom-avs" 不存在，则返回 false
    // console.log("Is block in the specified event database?", false);
    return false;
}

export async function updateEventInDatabase(
    info: any,
    calendar: Calendar,
    viewValue,
    is_more_one_day: boolean = false
) {
    // 更新思源数据库中的时间
    const blockId = info.event._def.extendedProps.blockId
    const newStartDate = info.event.startStr;
    let newEndDate = info.event.endStr;
    if (is_more_one_day && /^\d{4}-\d{2}-\d{2}$/.test(info.event.endStr)) {
        const endDate = new Date(info.event.endStr);
        endDate.setDate(endDate.getDate() - 1);
        newEndDate = endDate.toISOString();
    }
    const rootid = info.event._def.extendedProps.rootid;
    // 检测是否拖拽到全天区域或从全天区域拖拽出来
    const isAllDay = info.event.allDay;
    const wasAllDay = info.oldEvent ? info.oldEvent.allDay : false;
    
    // 准备批量更新的promise数组
    const updatePromises: Promise<any>[] = [];
    
    // 更新时间
    const timeKeyID = await getKeyIDfromViewValue(viewValue, '开始时间', rootid);
    updatePromises.push(api.updateAttrViewCell_pro(blockId, rootid, timeKeyID, newStartDate, "date", newEndDate));
    
    // 如果全天状态发生变化，更新全天属性
    if (isAllDay !== wasAllDay) {
        const allDayKeyID = await getKeyIDfromViewValue(viewValue, '全天', rootid);
        if (allDayKeyID) {
            updatePromises.push(api.updateAttrViewCell_pro(blockId, rootid, allDayKeyID, isAllDay, "checkbox"));
        } else {
            sy.showMessage("未找到全天字段，无法更新全天属性", 2000, "error");
        }
    }
    
    // 等待所有更新完成
    await Promise.all(updatePromises);
    
    api.handleDidaListEvent(rootid, blockId);

    setTimeout(() => calendar.refetchEvents(), 1000);
    sy.showMessage('正在更新事件', -1, "info", "1");
    setTimeout(() => {
        sy.showMessage('已更新事件', 2000, "info", "1");
    }, 1000);
}


//TODO：急急优化
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

        // 兼容表格和画廊视图
        const columnsOrFields = view.view?.columns || view.view?.fields || [];
        // 查找分类列
        const categoryColumn = columnsOrFields.find((col: any) => col.name === '分类');
        if (!categoryColumn) return ['无'];

        // 直接从选项中获取分类名称
        const categories = categoryColumn.options?.map((option: any) => option.name) || [];

        // 如果没有预设选项，返回默认值
        if (!categories.length) {
            return ['无'];
        }

        // 返回排序后的分类列表
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
                            <label style="display: flex; align-items: center; gap: 8px;">
                                <input type="checkbox" id="qq-event-allday">
                                全天事件
                            </label>
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
                const allDay = (document.getElementById('qq-event-allday') as HTMLInputElement).checked;

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
                        allDay: allDay,
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
        const allDay = (document.getElementById('qq-edit-allday') as HTMLInputElement).checked;

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
                    isAllDay: allDay,
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
        // console.log('获取优先级列表:', dbId);
        const view = await api.renderAttributeView(dbId);
        // console.log('获取优先级列表:', view);

        // 兼容表格和画廊视图
        const columnsOrFields = view.view?.columns || view.view?.fields || [];
        // 查找优先级列
        const priorityColumn = columnsOrFields.find((col: any) => col.name === '优先级');
        // console.log('获取优先级列表:', priorityColumn);
        if (!priorityColumn) return ['无'];

        // 直接从选项中获取优先级名称
        const priorities = priorityColumn.options?.map((option: any) => option.name) || [];

        // 如果没有预设选项，返回默认值
        if (!priorities.length) {
            return ['高', '中', '低', '无'];
        }

        // 返回排序后的优先级列表
        // console.log('获取优先级列表:', priorities);
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