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
