/**
 * 日历数据库字段配置
 * 定义了日历事件数据库中需要的字段及其类型
 */

export interface RequiredFields {
    [key: string]: string;
}

/**
 * 普通事件的必需字段配置
 */
export const requiredFields: RequiredFields = {
    '事件': 'block',
    '开始时间': 'date',
    '优先级': 'select',
    '分类': 'select',
    '关联': 'relation',
    '主事件': 'checkbox',
    '全天': 'checkbox',
    '状态': 'select',
    '描述': 'text',
    '标签': 'mSelect',
};

/**
 * 周期性事件的额外字段配置
 */
export const recurringEventFields: RequiredFields = {
    '重复规则': 'text',
    '持续时间': 'number',
    '完成日期': 'text'
};

/**
 * 滴答清单事件的必需字段配置
 */
export const didaRequiredFields: RequiredFields = {
    '事件': 'block',
    '开始时间': 'date',
    '优先级': 'select',
    '状态': 'select',
    '标签': 'mSelect',
    '链接': 'url',
    '描述': 'text',
    'didaID': 'text'
};

/**
 * 获取完整的字段配置（包括周期性事件字段）
 * @param isRecurring 是否为周期性事件
 * @param type 事件类型，normal: 普通事件，dida: 滴答清单事件
 * @returns 完整的字段配置对象
 */
export function getRequiredFields(isRecurring: boolean = false, type = "normal"): RequiredFields {
    if (type === "dida") {
        // 滴答清单事件不支持周期性，直接返回滴答字段
        return { ...didaRequiredFields };
    }

    if (isRecurring) {
        const fields = { ...requiredFields };
        // 周期性事件移除状态字段，添加周期性字段
        delete fields['状态'];
        return { ...fields, ...recurringEventFields };
    }
    return { ...requiredFields };
}

/**
 * 读取日历布局绑定的日期列 ID。
 *
 * 渲染响应里 AVTable.Calendar 直接是扁平的 AVCalendarSettings
 * （kernel/apicontract/av_types.go 的 AVTable.Calendar、av_calendar.go 的 AVCalendarSettings），
 * 所以路径是 view.calendar.dateKeyID；
 * 存储层的 AVLayoutCalendar 才是 view.calendar.settings.dateKeyID，这里一并兼容。
 */
export function readCalendarDateKeyID(data: any): string {
    const calendar = data?.calendar;
    if (!calendar) return "";
    return String(calendar.dateKeyID || calendar.settings?.dateKeyID || "");
}

/**
 * 解析日历布局（思源 3.8 新增的 calendar 布局）里「哪一列是日期」。
 *
 * 日历布局用 settings.dateKeyID 指定日期列（kernel/av/layout_calendar.go 的 CalendarSettings），
 * 这一列未必叫「开始时间」——用户可以把它配成任意日期列。
 * 取不到时回退到「开始时间」，与表格布局保持一致。
 *
 * @param columns 视图列定义（AVTableColumn[]）
 * @param dateKeyID 日历布局 settings.dateKeyID
 * @param fallback 找不到时的回退列名
 */
export function resolveCalendarDateFieldName(columns: any[] | undefined | null, dateKeyID?: string, fallback = '开始时间'): string {
    if (!dateKeyID || !Array.isArray(columns)) {
        return fallback;
    }
    const column = columns.find((field: any) => field && field.id === dateKeyID);
    return column?.name || fallback;
}
