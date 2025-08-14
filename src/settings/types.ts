export interface BuildContext {
    plugin: any;
    moduleInstances: Record<string, any>;
    frontEnd: string;
    settings: Record<string, any>;
}

// ISettingItem 定义于全局声明 index.d.ts 中
export interface ExtendedSettingItem extends ISettingItem {
    dynamicOptions?: (ctx: BuildContext) => Promise<Record<string, string>> | Record<string, string>;
    onAfterChange?: (value: any, ctx: BuildContext) => void;
}

export interface SettingSubGroupDefinition {
    name: string;
    items: ExtendedSettingItem[];
}

export interface SettingGroupDefinition {
    name: string;
    subGroups?: SettingSubGroupDefinition[];
    items?: ExtendedSettingItem[];
}

export type SettingGroupsBuilder = (ctx: BuildContext) => SettingGroupDefinition[];
