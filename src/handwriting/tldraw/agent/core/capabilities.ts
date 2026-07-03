export function getTldrawAgentCapabilities() {
    return {
        version: 2,
        enabled: true,
        agentPrompt: [
            'For simple custom-shape reads and edits, call tldraw_shape_command first. It can use the focused whiteboard and current selection automatically.',
            'To answer "what is the selected card content?", call tldraw_shape_command with {intent:"readSelectedContent"}; do not fetch shape ids first.',
            'To change selected custom shape properties, call tldraw_shape_command with intent "inspectEditable" if you need available fields, then intent "updateShape" with a small patch.',
            'For batch creation, connection, layout, or complex multi-step changes, call tldraw_edit_board. Do not use legacy write tools.',
            'If the user refers to the current board or selected shapes, omit whiteboardId and use $selection / $selection[0]. The focused whiteboard is used automatically.',
            'Always send operations as an array. Best shape creation template: {operations:[{op:"createNodes",nodes:[{as:"a",kind:"single-block",text:"..."}],layout:{style:"nearSelection"}}],save:true}.',
            'Best branch template from the selected shape: createNodes children with aliases, then {op:"connect",kind:"branch",from:"$selection[0]",to:["$created.a","$created.b"],layout:{style:"tree",side:"right"}}, then focus "$last".',
            'Best loose-note template: createNodes with kind:"single-block" or "text", layout {style:"grid"|"rightOf"|"below"|"nearSelection"}. Let the runtime place shapes; avoid x/y unless the user asks for exact coordinates.',
            'Use card for existing document/heading blocks or substantial content, single-block for compact notes, text/note for unlinked labels, frame for visual grouping, slide/mind-map/js-shape for their custom experiences.',
            'Use connect kind:"branch" for hierarchy; use connect kind:"relation" for ordinary relationships. References: $selection, $selection[0], $created.alias, $last, $block.<blockId>, $kind.<shapeType>.',
            'For risky or large edits, set mode:"preview" first. For normal edits, commit once with save:true. Use result:"debug" only when troubleshooting.',
        ],
        preferred: [
            'tldraw_shape_command',
            'tldraw_edit_board',
        ],
        read: [
            'tldraw_shape_command',
            'tldraw_get_interaction_context',
            'tldraw_list_whiteboards',
            'tldraw_get_summary',
            'tldraw_get_shape_details',
            'tldraw_get_snapshot_summary',
            'tldraw_list_backups',
            'tldraw_preview_backup',
            'siyuan_read_doc_outline_for_tldraw',
        ],
        openNavigateSave: [
            'tldraw_open_whiteboard',
            'tldraw_select_shape',
            'tldraw_zoom_to_shapes',
            'tldraw_navigate_to_block',
            'tldraw_save_whiteboard',
        ],
        createEditLayout: [
            'tldraw_shape_command',
            'tldraw_edit_board',
        ],
        toolSelectionHints: {
            shapeCommand: {
                action: 'tldraw_shape_command',
                purpose: 'Primary semantic tool for simple custom-shape reads, editable-field inspection, and property updates.',
                references: ['$selection', '$selection[0]', '$block.<blockId>', '$kind.card', '$kind.single-block', '$kind.branch', '$kind.bezier-connector', '$kind.mind-map', '$kind.slide', '$kind.js-shape'],
                intents: ['readSelectedContent', 'inspectEditable', 'updateShape'],
                editableExamples: {
                    card: ['color', 'isCollapsed', 'showMask', 'isMain', 'renderMode', 'collapsedTextSize', 'collapsedTextAlign'],
                    'single-block': ['color', 'transparentBackground', 'allowBinding', 'connectOnEnter'],
                    branch: ['color', 'lineStyle', 'lineWidth', 'horizontalGap', 'verticalGap', 'snapDistance', 'showBackground'],
                    'bezier-connector': ['color', 'strokeWidth', 'strokeStyle', 'labelPosition', 'text'],
                    'mind-map': ['color', 'theme', 'direction', 'fontSize', 'nodeWidth', 'nodeHeight', 'lineWidth', 'horizontalGap', 'verticalGap', 'text'],
                    slide: ['color', 'name', 'borderStyle'],
                    'js-shape': ['color', 'interactive', 'restrictDom'],
                },
                defaults: {
                    whiteboardId: 'omit it for the focused board',
                    target: '$selection',
                    save: 'true when the user asked to modify the board',
                },
                examples: [
                    { intent: 'readSelectedContent' },
                    { intent: 'inspectEditable', target: '$selection[0]' },
                    { intent: 'updateShape', target: '$selection[0]', patch: { color: 'blue', isCollapsed: true }, save: true },
                ],
            },
            editBoard: {
                action: 'tldraw_edit_board',
                purpose: 'Primary batch/complex write tool. Send one operations array that creates, connects, lays out, focuses, and saves the board.',
                references: ['$selection', '$selection[0]', '$created.name', '$last', '$block.<blockId>', '$kind.<shapeType>'],
                defaults: {
                    whiteboardId: 'omit it for the focused board',
                    layout: 'use nearSelection/rightOf/below/grid/tree/mindmap/frameAround instead of manual coordinates',
                    save: 'true for normal user-requested edits',
                    result: 'minimal; use debug only after an error',
                },
                exampleArgs: {
                    goal: 'Expand the selected card into a right-side branch',
                    operations: [
                        {
                            op: 'createNodes',
                            nodes: [
                                { as: 'background', kind: 'single-block', text: 'Background' },
                                { as: 'problem', kind: 'single-block', text: 'Problem' },
                                { as: 'next', kind: 'single-block', text: 'Next step' },
                            ],
                            layout: { style: 'rightOf', anchor: '$selection[0]' },
                        },
                        {
                            op: 'connect',
                            kind: 'branch',
                            from: '$selection[0]',
                            to: ['$created.background', '$created.problem', '$created.next'],
                            layout: { style: 'tree', side: 'right' },
                        },
                        { op: 'focus', target: '$last' },
                    ],
                    save: true,
                },
            },
            quickCreate: {
                action: 'tldraw_edit_board',
                purpose: 'Create one or more new notes or custom shapes near the current view/selection.',
                exampleArgs: {
                    operations: [
                        {
                            op: 'createNodes',
                            nodes: [
                                { as: 'idea1', kind: 'single-block', text: 'First idea' },
                                { as: 'idea2', kind: 'single-block', text: 'Second idea' },
                            ],
                            layout: { style: 'nearSelection' },
                        },
                        { op: 'focus', target: '$last' },
                    ],
                    save: true,
                },
            },
            preview: {
                action: 'tldraw_edit_board',
                purpose: 'Validate a large or uncertain edit without changing the whiteboard or creating SiYuan blocks.',
                exampleArgs: {
                    mode: 'preview',
                    operations: [
                        { op: 'layout', target: '$selection', style: 'grid', columns: 3 },
                    ],
                },
            },
            inspect: {
                action: 'tldraw_shape_command',
                guidance: 'Use tldraw_shape_command inspectEditable/readSelectedContent for selected custom-shape work. Use tldraw_get_shape_details only when exact bounds, bindings, or many raw shape details are needed.',
            },
        },
        customShapeGuide: [
            {
                type: 'card',
                purpose: 'A large SiYuan document or heading card for article sections, overview documents, or rich linked content.',
                createWith: 'tldraw_edit_board op createNodes kind:"card"',
                notes: [
                    'Use blockId to reference an existing document/heading block, or contentMarkdown/title/text to create a new heading block.',
                    'Content belongs to the bound SiYuan block; use tldraw_shape_command to read content or update whiteboard card properties such as color, collapse state, mask, renderMode, and collapsed text settings.',
                ],
            },
            {
                type: 'single-block',
                purpose: 'A compact SiYuan paragraph block for atomic notes, branch leaves, labels, todos, and short facts.',
                createWith: 'tldraw_edit_board op createNodes kind:"single-block"',
                notes: [
                    'Use blockId for an existing paragraph, or text/contentMarkdown/title to create a new paragraph block.',
                    'Use this as the default branch leaf and compact content node.',
                    'Use tldraw_shape_command for simple reads and property updates of selected single-block shapes.',
                ],
            },
            {
                type: 'branch',
                purpose: 'A visual hierarchy connector from one root shape to left/right child shapes.',
                createWith: 'tldraw_edit_board op connect kind:"branch"',
                notes: [
                    'Do not hand-place branch geometry. Provide from/to refs and optional layout side/style.',
                    'Use layout style "tree" for one-sided hierarchies and "mindmap" for balanced left/right maps.',
                    'Use tldraw_shape_command to update branch lineStyle, lineWidth, spacing, snapDistance, color, and showBackground.',
                ],
            },
            {
                type: 'bezier-connector',
                purpose: 'A curved, bindable relationship connector with an optional label.',
                createWith: 'tldraw_edit_board op connect kind:"relation"',
                notes: [
                    'Use relation connections for non-hierarchical semantic links.',
                    'The runtime chooses shape ports automatically.',
                    'Use tldraw_shape_command to update strokeWidth, strokeStyle, labelPosition, label text, and color.',
                ],
            },
            {
                type: 'frame',
                purpose: 'A visual boundary around related shapes.',
                createWith: 'tldraw_edit_board op layout style:"frameAround" or createNodes kind:"frame"',
                notes: [
                    'Use frameAround when grouping existing shapes visually.',
                ],
            },
            {
                type: 'mind-map',
                purpose: 'A custom structured mind-map shape with editable root text, theme, direction, node sizing, and spacing.',
                createWith: 'tldraw_edit_board op createNodes kind:"mind-map"',
                notes: [
                    'Use tldraw_shape_command for root text, theme, direction, fontSize, nodeWidth, nodeHeight, lineWidth, spacing, size, and color.',
                    'Node-level add/move/delete remains outside tldraw_shape_command in this version.',
                ],
            },
            {
                type: 'slide',
                purpose: 'A custom slide frame used for focused whiteboard presentation sections.',
                createWith: 'tldraw_edit_board op createNodes kind:"slide"',
                notes: [
                    'Use tldraw_shape_command to update slide name, borderStyle, size, position, and color.',
                    'Screenshot capture and block linking remain UI-specific actions.',
                ],
            },
            {
                type: 'js-shape',
                purpose: 'A custom JavaScript-rendered shape.',
                createWith: 'tldraw_edit_board op createNodes kind:"js-shape"',
                notes: [
                    'Use tldraw_shape_command to update size, position, color, interactive, and restrictDom.',
                    'Agent-supplied script and raw data writes remain blocked.',
                ],
            },
        ],
        layoutRecipes: [
            'Add notes: op createNodes, nodes kind single-block/text, layout style nearSelection or grid, save true.',
            'Expand selection into a branch: create child nodes, connect kind branch from $selection[0] to $created aliases, focus $last, save true.',
            'Connect existing shapes: op connect, kind relation, from one ref, to one or more refs, optional text label.',
            'Move existing shapes: op layout for automatic placement; op updateNodes only for exact x/y/w/h/text/color changes.',
            'Frame a group: op layout, style frameAround, target $selection or explicit refs.',
            'Document outlines may be read for planning, but whiteboard creation/editing still goes through tldraw_edit_board.',
        ],
        hiddenLegacyActions: [
            'Legacy/basic write actions are intentionally not registered for Agent use; use tldraw_edit_board instead.',
        ],
        destructive: [
            'tldraw_delete_whiteboard_file',
        ],
        safetyRules: [
            'Agent actions must be enabled in plugin settings.',
            'Most write actions require the whiteboard to be open so the user can observe changes.',
            'tldraw_edit_board has per-edit limits: 200 created nodes, 300 connections, and 500 updates.',
            'tldraw_shape_command only changes whitelisted semantic fields and never performs raw props mutation, JS script writes, or arbitrary data writes.',
            'mode:"preview" validates without modifying the whiteboard or creating SiYuan blocks.',
            'Failures return committedShapeIds and externalCreatedBlockIds when partial work happened; automatic cleanup is not performed.',
            'Default results do not include raw snapshots, full props, or shape samples.',
            'Deletion remains outside tldraw_edit_board and keeps dry-run/confirm safeguards.',
            'JS shape script execution, arbitrary raw store mutation, backup restore/import, and direct SiYuan block content edits remain blocked.',
        ],
        intentionallyBlocked: [
            'Restoring/importing a whiteboard backup through Agent is blocked because it overwrites current data.',
            'Arbitrary raw store/props mutation is blocked.',
            'Agent-supplied JavaScript execution is blocked.',
            'Full snapshot JSON exfiltration is blocked; create a backup file instead.',
            'Direct SiYuan block content deletion/update through tldraw actions is blocked.',
            'External asset insertion is blocked until upload, size, and type validation are implemented.',
        ],
    };
}
