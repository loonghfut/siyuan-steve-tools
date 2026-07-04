export type TldrawAgentActionCategory = 'system' | 'whiteboard' | 'shape' | 'document';

export type TldrawAgentActionMeta = {
    name: string;
    title: string;
    category: TldrawAgentActionCategory;
    risk: 'read' | 'write' | 'danger';
    description: string;
};

export const TLDRAW_AGENT_ACTIONS_META: TldrawAgentActionMeta[] = [
    {
        name: 'tldraw_get_agent_capabilities',
        title: 'Agent 能力说明',
        category: 'system',
        risk: 'read',
        description: '让 Agent 读取白板能力、安全规则和可用操作说明。',
    },
    {
        name: 'tldraw_get_interaction_context',
        title: '读取当前上下文',
        category: 'system',
        risk: 'read',
        description: '读取当前聚焦白板、打开的白板和选择状态。',
    },
    {
        name: 'tldraw_shape_command',
        title: '语义形状命令',
        category: 'shape',
        risk: 'write',
        description: '用于读取、创建、更新、连接、布局和聚焦形状的高层命令。',
    },
    {
        name: 'tldraw_delete_shapes',
        title: '删除形状',
        category: 'shape',
        risk: 'danger',
        description: '删除白板形状；确认删除前会创建备份。',
    },
    {
        name: 'tldraw_list_whiteboards',
        title: '列出白板',
        category: 'whiteboard',
        risk: 'read',
        description: '列出白板和安全摘要，不返回完整白板 JSON。',
    },
    {
        name: 'tldraw_open_whiteboard',
        title: '打开白板',
        category: 'whiteboard',
        risk: 'write',
        description: '按文档或根块 ID 打开 STtools tldraw 白板。',
    },
    {
        name: 'tldraw_get_summary',
        title: '读取白板摘要',
        category: 'whiteboard',
        risk: 'read',
        description: '读取打开或已保存白板的紧凑摘要。',
    },
    {
        name: 'siyuan_read_doc_outline_for_tldraw',
        title: '读取文档大纲',
        category: 'document',
        risk: 'read',
        description: '读取思源文档大纲，供 Agent 规划白板结构。',
    },
    {
        name: 'tldraw_get_shape_details',
        title: '读取形状详情',
        category: 'shape',
        risk: 'read',
        description: '读取形状布局、绑定和安全的关联块内容。',
    },
    {
        name: 'tldraw_get_snapshot_summary',
        title: '读取快照摘要',
        category: 'whiteboard',
        risk: 'read',
        description: '读取白板快照的计数、页面记录和大致大小。',
    },
    {
        name: 'tldraw_backup_whiteboard',
        title: '备份白板',
        category: 'whiteboard',
        risk: 'write',
        description: '为打开的白板创建备份文件。',
    },
    {
        name: 'tldraw_list_backups',
        title: '列出备份',
        category: 'whiteboard',
        risk: 'read',
        description: '列出白板备份和回收站文件的安全元数据。',
    },
    {
        name: 'tldraw_preview_backup',
        title: '预览备份',
        category: 'whiteboard',
        risk: 'read',
        description: '预览备份文件的页面、形状数量和简化样本。',
    },
    {
        name: 'tldraw_delete_whiteboard_file',
        title: '删除白板文件',
        category: 'whiteboard',
        risk: 'danger',
        description: '将关闭的白板文件移动到 STtools 回收站，默认 dry-run。',
    },
    {
        name: 'tldraw_save_whiteboard',
        title: '保存白板',
        category: 'whiteboard',
        risk: 'write',
        description: '立即保存当前打开白板的快照。',
    },
    {
        name: 'tldraw_navigate_to_block',
        title: '跳转到关联块',
        category: 'document',
        risk: 'read',
        description: '定位并选择与思源块关联的白板形状。',
    },
    {
        name: 'tldraw_zoom_to_shapes',
        title: '缩放到形状',
        category: 'shape',
        risk: 'read',
        description: '选择并缩放到一个或多个形状。',
    },
    {
        name: 'tldraw_select_shape',
        title: '选择形状',
        category: 'shape',
        risk: 'read',
        description: '选择并可选缩放到指定形状。',
    },
];

export const DEFAULT_TLDRAW_AGENT_ACTION_NAMES = TLDRAW_AGENT_ACTIONS_META.map((action) => action.name);

export function getTldrawAgentActionMeta(name: string): TldrawAgentActionMeta | undefined {
    return TLDRAW_AGENT_ACTIONS_META.find((action) => action.name === name);
}
