export function getTldrawAgentCapabilities() {
    return {
        version: 2,
        enabled: true,
        agentPrompt: [
            'You operate an STtools-enhanced tldraw whiteboard inside SiYuan. Use tldraw_edit_board as the only write entrypoint for whiteboard edits.',
            'Prefer one semantic tldraw_edit_board call per user intent. It supports createNodes, connect, layout, updateNodes, focus, and save operations in a single request.',
            'Do not hand-calculate coordinates unless the user asks for exact placement. Use layout styles nearSelection, rightOf, below, grid, tree, mindmap, and frameAround so the runtime computes positions.',
            'Use references instead of raw IDs whenever possible: $selection, $selection[0], $created.name, $last, $block.<blockId>, and $kind.<shapeType>.',
            'Default node kinds are card, single-block, text, and frame. Use card for document/heading/substantial content, single-block for compact notes, text for unlinked labels, and frame for grouping.',
            'Use connect kind:"branch" for hierarchy and mind-map-like structures. Use connect kind:"relation" for ordinary labeled relationships; the runtime creates bezier connectors and chooses ports.',
            'Use mode:"preview" before large or uncertain edits. Preview validates references, block IDs, unsupported fields, and operation limits without modifying the board or creating SiYuan blocks.',
            'Keep results minimal by default. Use result:"debug" only when troubleshooting or when a compact summary is needed after the edit.',
        ],
        preferred: [
            'tldraw_edit_board',
        ],
        read: [
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
            'tldraw_edit_board',
        ],
        toolSelectionHints: {
            editBoard: {
                action: 'tldraw_edit_board',
                purpose: 'V2 high-efficiency semantic whiteboard editor. Create, connect, layout, update, focus, and save in one call.',
                references: ['$selection', '$selection[0]', '$created.name', '$last', '$block.<blockId>', '$kind.<shapeType>'],
                resultMode: 'minimal by default; use debug only for troubleshooting',
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
                action: 'tldraw_get_shape_details',
                guidance: 'Use only when exact bounds, bindings, or linked block content are needed before a semantic edit.',
            },
        },
        customShapeGuide: [
            {
                type: 'card',
                purpose: 'A large SiYuan document or heading card for article sections, overview documents, or rich linked content.',
                createWith: 'tldraw_edit_board op createNodes kind:"card"',
                notes: [
                    'Use blockId to reference an existing document/heading block, or contentMarkdown/title/text to create a new heading block.',
                    'Content belongs to the bound SiYuan block; whiteboard updates only move, resize, recolor, expand, or collapse the card.',
                ],
            },
            {
                type: 'single-block',
                purpose: 'A compact SiYuan paragraph block for atomic notes, branch leaves, labels, todos, and short facts.',
                createWith: 'tldraw_edit_board op createNodes kind:"single-block"',
                notes: [
                    'Use blockId for an existing paragraph, or text/contentMarkdown/title to create a new paragraph block.',
                    'Use this as the default branch leaf and compact content node.',
                ],
            },
            {
                type: 'branch',
                purpose: 'A visual hierarchy connector from one root shape to left/right child shapes.',
                createWith: 'tldraw_edit_board op connect kind:"branch"',
                notes: [
                    'Do not hand-place branch geometry. Provide from/to refs and optional layout side/style.',
                    'Use layout style "tree" for one-sided hierarchies and "mindmap" for balanced left/right maps.',
                ],
            },
            {
                type: 'bezier-connector',
                purpose: 'A curved, bindable relationship connector with an optional label.',
                createWith: 'tldraw_edit_board op connect kind:"relation"',
                notes: [
                    'Use relation connections for non-hierarchical semantic links.',
                    'The runtime chooses shape ports automatically.',
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
        ],
        layoutRecipes: [
            'Create a small branch: createNodes for children, connect kind:"branch" from $selection[0] to the $created aliases, then focus $last.',
            'Create many loose notes: createNodes with kind:"single-block" and layout style:"grid"; save once at the end.',
            'Move existing shapes: updateNodes for exact patches, or layout with style rightOf/below/grid/tree/mindmap for runtime-computed placement.',
            'Group content: layout style:"frameAround" with target $selection or a list of aliases.',
            'Document outlines may be read for planning, but whiteboard creation/editing still goes through tldraw_edit_board operations.',
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
