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
    '优先级': 'mSelect',
    '分类': 'select',
    '标签': 'mSelect',
    '关联': 'relation',
    '主事件': 'checkbox',
    '链接': 'url',
    '全天': 'checkbox',
    '状态': 'select',
    '描述': 'text',
    'didaID': 'text'
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
 * 获取完整的字段配置（包括周期性事件字段）
 * @param isRecurring 是否为周期性事件
 * @returns 完整的字段配置对象
 */
export function getRequiredFields(isRecurring: boolean = false): RequiredFields {
    if (isRecurring) {
        const fields = { ...requiredFields };
        // 周期性事件移除状态字段，添加周期性字段
        delete fields['状态'];
        return { ...fields, ...recurringEventFields };
    }
    return { ...requiredFields };
}
