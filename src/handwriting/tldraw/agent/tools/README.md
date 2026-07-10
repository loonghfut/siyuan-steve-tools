# tldraw Agent 工具返回结构文档

本文档列出所有 tldraw Agent 工具在被 AI 调用时返回给 AI 的内容结构。每个工具的 handler 返回类型为 `{ result?: string; error?: string }`，其中 `result` 是 `JSON.stringify(value)` 后的字符串，AI 收到后需反序列化为下述 JSON 结构。

工具注册入口见 [./index.ts](./index.ts)，工具元数据（名称、分类、风险、默认启用）见 [./metadata.ts](./metadata.ts)。

## 目录

- [通用返回机制](#通用返回机制)
- [共用辅助与错误约定](#共用辅助与错误约定)
- [system 类（系统/上下文）](#system-类系统上下文)
  - [tldraw_get_agent_capabilities](#tldraw_get_agent_capabilities)
  - [tldraw_get_interaction_context](#tldraw_get_interaction_context)
  - [tldraw_get_visual_context](#tldraw_get_visual_context)
- [shape 类（形状操作）](#shape-类形状操作)
  - [tldraw_shape_command](#tldraw_shape_command)
  - [tldraw_apply_plan](#tldraw_apply_plan)
  - [tldraw_delete_shapes](#tldraw_delete_shapes)
  - [tldraw_get_shape_details](#tldraw_get_shape_details)
  - [tldraw_zoom_to_shapes](#tldraw_zoom_to_shapes)
  - [tldraw_select_shape](#tldraw_select_shape)
- [whiteboard 类（白板管理）](#whiteboard-类白板管理)
  - [tldraw_list_whiteboards](#tldraw_list_whiteboards)
  - [tldraw_open_whiteboard](#tldraw_open_whiteboard)
  - [tldraw_import_mermaid](#tldraw_import_mermaid)
  - [tldraw_get_summary](#tldraw_get_summary)
  - [tldraw_get_snapshot_summary](#tldraw_get_snapshot_summary)
  - [tldraw_backup_whiteboard](#tldraw_backup_whiteboard)
  - [tldraw_list_backups](#tldraw_list_backups)
  - [tldraw_preview_backup](#tldraw_preview_backup)
  - [tldraw_delete_whiteboard_file](#tldraw_delete_whiteboard_file)
  - [tldraw_save_whiteboard](#tldraw_save_whiteboard)
- [document 类（思源文档联动）](#document-类思源文档联动)
  - [siyuan_read_doc_outline_for_tldraw](#siyuan_read_doc_outline_for_tldraw)
  - [tldraw_insert_doc_outline_mindmap](#tldraw_insert_doc_outline_mindmap)
  - [siyuan_create_summary_doc_whiteboard](#siyuan_create_summary_doc_whiteboard)
  - [tldraw_navigate_to_block](#tldraw_navigate_to_block)
- [关键设计说明](#关键设计说明)

---

## 通用返回机制

所有工具的 handler 返回类型均为 `{ result?: string; error?: string }`：

- `result` = `JSON.stringify(value)` —— AI 收到的是 JSON 字符串，解析后得到下文给出的结构。
- `error` = 字符串错误信息（`Error.message` 或 `String(error)`）。

成功时返回 `{ result }`，失败时返回 `{ error }`，二者互斥（由 [./shared.ts](./shared.ts) 的 `jsonResult` / 各处 `return { error }` 保证）。

## 共用辅助与错误约定

辅助函数定义在 [./shared.ts](./shared.ts)：

| 辅助函数 | 作用 |
|---|---|
| `disabledResult()` | 插件设置 `tldraw-agent-actions-enable !== true` 时返回 `{ error: "STtools tldraw agent actions are disabled in plugin settings." }`，否则 `null` |
| `jsonResult(value)` | 返回 `{ result: JSON.stringify(value) }` |
| `stringifyError(error)` | `Error` 取 `message`，否则 `String(error)` |
| `requireOpenWhiteboard(args)` | 缺 ID 返回 `{ error: "missing required argument: whiteboardId" }`；实例未打开返回 `{ error: "Whiteboard <id> is not open. Call tldraw_open_whiteboard first." }`；成功返回 `{ whiteboardId, instance }` |

**两条"错误"通道**（AI 调用时既要看 `error` 也要看结构内的 `ok`/`errors`）：

1. handler 层的 `{ error }`：硬错误，如参数缺失、白板未打开、内部异常。
2. 结构化 result 里的 `errors: string[]` + `ok: false`：业务级软失败，如目标解析为空、patch 为空、需用户确认等。这类仍通过 `jsonResult` 返回，不进入 `error` 字段。

**默认禁用的工具**（`defaultEnabled: false`，需用户在设置里开启）：`tldraw_apply_plan`、`tldraw_insert_doc_outline_mindmap`、`siyuan_create_summary_doc_whiteboard`。

---

## system 类（系统/上下文）

### tldraw_get_agent_capabilities

- **文件**: [./system/get-agent-capabilities.ts](./system/get-agent-capabilities.ts)
- **功能**: 列出 Agent 可用能力、安全规则与被故意屏蔽的高危操作。
- **成功返回**: 对象，字段：
  - `version`(=2), `enabled`(true)
  - `agentPrompt`(string[])、`preferred`(string[])
  - `read` / `openNavigateSave` / `createEditLayout`（工具名数组）
  - `toolSelectionHints`：含 `shapeCommand`、`inspect` 子对象
  - `customShapeGuide`(数组 `{type, purpose, createWith, notes}`)、`layoutRecipes`(string[])
  - `hiddenLegacyActions`、`destructive`、`safetyRules`、`intentionallyBlocked`（均为 string[]）
  - `enabledActions`：当前启用的工具名数组
- **错误**: 仅全局禁用。

### tldraw_get_interaction_context

- **文件**: [./system/get-interaction-context.ts](./system/get-interaction-context.ts)
- **功能**: 读取当前聚焦白板、打开的白板列表与选择状态。
- **成功返回**:
  - `focusedWhiteboardId`(string|null)、`hasFocusedWhiteboard`、`focusedWhiteboard`(对象|null)
  - `anyWhiteboardHasSelection`、`openWhiteboardCount`
  - `openWhiteboards`: 数组，每项：
    - `id`, `title`, `isFocused`, `focusedAt`, `isOpen`, `visualContextAvailable`, `hasSelection`
    - `selectedShapeIds`(仅 `includeSelectedShapeIds=true` 时存在)
    - `selectedShapeCount`
    - `selectedShapeDetails`(仅 `includeSelectedShapeDetails=true` 且有选中时存在，结构同 [tldraw_get_shape_details](#tldraw_get_shape_details) 的 `AgentShapeSummary`)
    - `shapeCount`, `shapeTypeCounts`
  - `nextStepHint`(给 AI 的下一步提示；复杂空间推理时会提示继续调用 `tldraw_get_visual_context`)
- **错误**: 全局禁用 / 未知参数 / 内部抛错。

### tldraw_get_visual_context

- **文件**: [./system/get-visual-context.ts](./system/get-visual-context.ts)
- **功能**: 读取更贴近官方 Agent starter kit 的视觉上下文，组合当前视口、结构化形状数据、离屏簇和可选 SVG 预览。
- **成功返回**:
  - `whiteboardId`, `title`, `generatedAt`
  - `viewport?`: `{x,y,w,h}`
  - `selection`: `{selectedShapeIds, selectedShapeCount, returnedShapeCount, truncated, bounds?, shapes?}`
  - `visible`: `{shapeCount, returnedShapeCount, truncated, shapeIds, shapes?}`
  - `offscreen`: `{shapeCount, clusterCount, truncated, clusters}`
    - `clusters[]`: `{id, location, direction?, shapeCount, selectedShapeCount, bounds, shapeTypeCounts, sampleShapeIds, sampleShapes?}`
  - `scene`: `{totalShapeCount, visibleShapeCount, offscreenShapeCount, selectedShapeCount, dominantShapeTypes}`
  - `svg?`: `{shapeCount, truncated, svg}`（仅 `includeSvg=true`）
- **默认参数**:
  - `includeSelectionDetails=true`
  - `includeVisibleShapeDetails=true`
  - `includeOffscreenClusters=true`
  - `includeLinkedBlockContent=true`
  - `includeSvg=false`
  - `shapeLimit=12`
  - `clusterLimit=6`
- **错误**: 无聚焦白板 / 白板未打开 / 未知参数 / 内部抛错。

---

## shape 类（形状操作）

### tldraw_shape_command

- **文件**: [./shapes/shape-command.ts](./shapes/shape-command.ts)（核心逻辑在 `./internal/operations/manager-ops.ts` 的 `runAgentShapeCommand`）
- **功能**: 按 `intent` 执行语义形状操作（读取/检查/更新/创建/连接/布局/聚焦），是核心万能工具。
- **成功返回** `AgentShapeCommandResult`：
  - 基础字段：`ok`, `intent`, `whiteboardId`, `target`, `items`(随 intent 变化), `updatedShapeIds`, `errors`(string[]), `saved`, `summary`(仅 `resultMode='full'` 时存在)
  - **各 intent 的 `items` 结构**：

    | intent | items 结构 |
    |---|---|
    | `readSelectedContent` | `{shape, content}` 数组（`content` = 关联块内容或 `null`） |
    | `inspectEditable` | `{shape, editableFields: {name, kind, current?, enumValues?, min?, max?, writable, description?}[]}` |
    | `updateShape` | `{shapeId, before, after, changedFields, contentWrite?}` |
    | `createShapes` | `{created: 别名→id[], createdShapeIds, externalCreatedBlockIds, counts}` |
    | `connectShapes` | `{createdShapeIds, counts}` |
    | `layoutShapes` | `{layout, affectedShapeIds, counts}` |
    | `focusShapes` | `{focusedShapeIds, selectedShapeIds}` |

  - **`AgentShapeSummary`** = `{id, type, x, y, bounds:{x,y,w,h}, rotation, parentId, index, props, bindings?}`。`props` 仅含白名单字段 + `blockId`/`isLinkedBlock`/`richText`/`blockContent`。
  - **`AgentEditableFieldSpec`** = `{name, kind: 'number'|'boolean'|'enum'|'string'|'color', current?, enumValues?, min?, max?, writable, description?}`。
- **错误**: 无聚焦白板 (`"No focused whiteboard. Focus/open a whiteboard, or pass whiteboardId."`) / 白板未打开 / intent 非法 (`"intent must be one of readSelectedContent, inspectEditable, updateShape, createShapes, connectShapes, layoutShapes, focusShapes"`) / 内部抛错。
- **软失败**: 以下情形不抛错，返回 `ok:false` 并把原因写入 `errors` 数组：`unsupported intent`、`target resolved to no shapes`、`createShapes requires node or nodes`、`connectShapes requires from/to or at least two selected shapes`、`updateShape requires a non-empty patch object`、`card content update requires explicit user confirmation...`。

### tldraw_apply_plan

- **文件**: [./planning/apply-plan.ts](./planning/apply-plan.ts)（核心逻辑在 `./internal/planning/plan-runner.ts` 的 `executeAgentPlan`）· **默认禁用**
- **功能**: 将一个 JSON 白板计划（steps）批量应用到聚焦/已打开白板。
- **成功返回**，始终含 `goal`, `dryRun`, `writeCount`, `saved`, `summary`：
  - **compact（默认）**：额外 `createdAliases`(别名→数量)、`createdCount`、`lastShapeCount`、`normalizedSteps`(仅 `dryRun=true` 时存在)
  - **full（`resultMode='full'`）**：额外 `created`(别名→id[])、`lastShapeIds`、`normalizedSteps`、`results`(每步原始返回，按 op 异构)
  - `summary` 在 full 模式为完整 AgentSummary（含 `selectedShapeIds`、`sampleShapes`）；compact 模式为 `compactPlanSummary`（去 `selectedShapeIds`/`sampleShapes`，加 `selectedShapeCount`）
- **错误**: `steps must be a non-empty array` / `steps[i].op must be one of create, branch, connect, update, layout, focus, save` / `"plan writes exceed 50; split this into smaller tldraw_apply_plan calls"` / 各参数校验 / 白板未打开。

### tldraw_delete_shapes

- **文件**: [./shapes/delete-shapes.ts](./shapes/delete-shapes.ts)
- **功能**: 删除最多 50 个形状；缺 `confirm` 为 dry-run 预览，确认删除前总会先建白板备份。
- **成功返回**：
  - **dryRun（`confirm !== true`）**：`{dryRun: true, deletedShapeIds, blocked: [{shapeId, reason}], summary}`
  - **确认删除（`confirm === true`）**：`{dryRun: false, deletedShapeIds, blocked: [{shapeId, reason}], backup, summary}`
  - `blocked` 原因如 `"shape not found"`、`"linked SiYuan block shape requires explicit user intent: pass allowLinkedBlockShapes=true and confirmLinkedBlockShapes=true"`
  - `backup`（仅确认删除且 `deletable.length > 0` 时非 null）：`{...备份结果, snapshot}`（snapshot 为快照摘要，含 `isOpen`）
  - `summary` 为 compact 或 full AgentSummary
- **错误**: 缺 shapeId (`"missing required argument: shapeId or shapeIds"`) / 白板未打开 / 内部抛错。

### tldraw_get_shape_details

- **文件**: [./shapes/get-shape-details.ts](./shapes/get-shape-details.ts)
- **功能**: 读取白板上形状的安全详情（边界、绑定、关联块内容；脚本/数据/截图类字段被屏蔽）。
- **成功返回**:
  - `shapes`: `AgentShapeSummary[]`
    - `props.blockContent` 在 `includeLinkedBlockContent !== false`（默认 true）时，card/single-block/slide/mind-map 形状含关联块内容（`AgentLinkedBlockContent`）
    - `bindings` 仅 `includeBindings === true` 时存在，每项 `{id, type, fromId, toId, props}`
  - `totalMatched`(匹配总形状数，可能大于返回数)
  - `truncated`(是否因 `limit` 截断)
- **错误**: 白板未打开 / 内部抛错（如 editor 未初始化）。

### tldraw_zoom_to_shapes

- **文件**: [./shapes/zoom-to-shapes.ts](./shapes/zoom-to-shapes.ts)
- **功能**: 选中并缩放视野到最多 50 个形状。
- **成功返回**: `{ zoomedShapeIds: string[] }`（实际存在并被缩放的 id，去重取前 50 且仅保留 editor 中存在的形状；无有效 id 则空数组且不缩放）
- **错误**: 缺 shapeId / 白板未打开 / 内部抛错。

### tldraw_select_shape

- **文件**: [./shapes/select-shape.ts](./shapes/select-shape.ts)
- **功能**: 选中单个形状并可选缩放（`zoom` 默认 true）。
- **成功返回**: `{ selectedShapeIds: string[] }`（操作完成后 editor 当前选中的 id 列表）
- **错误**: 缺 shapeId (`"missing required argument: shapeId"`) / `"Shape not found: <id>"` / 白板未打开 / 内部抛错。

---

## whiteboard 类（白板管理）

### tldraw_list_whiteboards

- **文件**: [./whiteboards/list-whiteboards.ts](./whiteboards/list-whiteboards.ts)（核心逻辑在 `./internal/whiteboards/whiteboard-list.ts`）
- **功能**: 列出所有白板文件，返回安全的规划元数据（不返回完整快照 JSON）。
- **成功返回**:
  - `whiteboards`: 数组，每项：
    - `id`, `fileName`, `path`, `fileMtime`, `fileMtimeText?`, `fileSize?`, `fileSizeText?`
    - `isOpen`, `link`
    - `blockExists?`, `blockType?`, `blockSubType?`, `blockCreatedAt?`, `blockUpdatedAt?`, `docId?`, `docTitle?`, `docPath?`, `tags?`
    - `title`(最终标题，live 标题/docTitle/id 优先级)
    - `effectiveUpdatedAt?`, `effectiveUpdatedAtIso?`, `effectiveUpdatedAtSource?`(`'blockUpdatedAt'|'docUpdatedAt'|'fileMtime'|'blockCreatedAt'|'docCreatedAt'`)
    - `metadataError?`
    - `snapshot?`（仅前 `summaryLimit` 个白板，或排序为 shapeCount 时预加载）：
      - 打开时：`source: 'open-editor'`、`pageCount`、`shapeCount`、`assetCount`、`storeRecordCount`、`approxJsonBytes`、`shapeTypeCounts`、`selectedShapeIds`、`sampleShapes?`
      - 读文件成功时：`source: 'saved-file'`、上述计数 + `linkedBlockShapeCount`、`bounds?`、`pages`(最多10)、`sampleShapes?`
      - 读文件失败时：`source: 'saved-file'`、`error: string`
  - `totals`: `{matched, returned, open, linkedToExistingBlock, withMetadataErrors, snapshotSummariesRequested}`
  - `safety`: `{fullSnapshotJsonReturned: false, shapeTextReturnedByDefault: false, includeShapeSamples, snapshotSummariesLimitedTo}`
- **错误**: 全局禁用 / 内部抛错。

### tldraw_open_whiteboard

- **文件**: [./whiteboards/open-whiteboard.ts](./whiteboards/open-whiteboard.ts)
- **功能**: 打开已有白板，或在省略 ID / `createNew:true` 时创建后端 SiYuan 文档并打开新白板。
- **成功返回**:
  - **打开已有**：`{whiteboardId, created: false, opened: true, title}`
  - **新建**：`{whiteboardId, docId, created: true, opened: true, title, notebook, requestedHPath, hPath, placementSource}`
    - `placementSource` ∈ `'explicit-path' | 'sibling-doc' | 'focused-whiteboard' | 'first-notebook'`
- **错误**: `"Failed to create backing SiYuan document for the new whiteboard."` / `"Document or block not found: ..."` / `"Block ... is not a document and has no root document."` / `"Root document not found for block: ..."` / `"Failed to resolve document human-readable path: ..."` / `"No notebook is available. Pass notebook/box when creating a new whiteboard."` / `"Document not found after creation: ..."` / 全局禁用。

### tldraw_import_mermaid

- **文件**: [./whiteboards/import-mermaid.ts](./whiteboards/import-mermaid.ts)
- **作用**: 把 Mermaid 文本导入到当前打开白板，生成可编辑图形。
- **主要参数**:
  - `whiteboardId?` / `id?` / `rootId?`: 白板 ID；省略时使用当前聚焦白板
  - `mermaid` / `text` / `code`: Mermaid 源文本
  - `select?`(boolean): 是否选中新导入图形，默认 `true`
  - `zoom?`(boolean): 是否缩放到导入图形，默认 `true`
  - `save?`(boolean): 是否立即保存，默认 `false`（仍会触发自动保存）
- **返回**:
  - `{ok, whiteboardId, createdShapeIds, createdShapeCount, selected, zoomed, saved}`
- **错误**: 无聚焦白板 / 白板未打开 / 缺少 Mermaid 文本 / Mermaid 导入内部异常。

### tldraw_get_summary

- **文件**: [./whiteboards/get-summary.ts](./whiteboards/get-summary.ts)
- **功能**: 读取白板紧凑摘要；打开时读 live editor，未打开时读保存的快照文件。
- **成功返回**（两套结构）：
  - **打开时**：`{id, title, isOpen: true, pageCount, shapeCount, assetCount, selectedShapeIds, shapeTypeCounts, sampleShapes?}`
  - **未打开时**：`{id, isOpen: false, pageCount, shapeCount, assetCount, storeRecordCount, approxJsonBytes, shapeTypeCounts, linkedBlockShapeCount, sampleShapes?}`
  - `sampleShapes` 仅 `includeShapeSamples=true` 时存在：`{id, type, x, y, bounds:{x,y,w,h}, props}[]`
  - 注意：两套结构字段不一致——live 版有 `title`/`selectedShapeIds`，无 `storeRecordCount`/`approxJsonBytes`/`linkedBlockShapeCount`；saved 版反之。
- **错误**: 未知参数 / 缺 ID / `"Whiteboard file not found: <id>"` / 内部抛错。

### tldraw_get_snapshot_summary

- **文件**: [./whiteboards/get-snapshot-summary.ts](./whiteboards/get-snapshot-summary.ts)
- **功能**: 读取白板快照的计数、页面记录（最多 50）和大致大小，不返回完整 JSON。
- **成功返回**: `{id, source, pageCount, shapeCount, assetCount, storeRecordCount, approxJsonBytes, shapeTypeCounts, linkedBlockShapeCount, pages, isOpen, sampleShapes?}`
  - `source` ∈ `'open-editor' | 'saved-file'`
  - `pages`(最多50)：`{id, name?, index?}[]`
- **错误**: 缺 ID / `"Whiteboard file not found: <id>"` / 内部抛错。

### tldraw_backup_whiteboard

- **文件**: [./whiteboards/backup-whiteboard.ts](./whiteboards/backup-whiteboard.ts)（逻辑在 `./internal/operations/manager-ops.ts` 的 `backupAgentWhiteboard`）
- **功能**: 为已打开的白板创建备份文件（执行风险操作前使用）。
- **成功返回**: `{success, fileName?, filePath?, error?, data?, snapshot}`
  - `snapshot` 为快照摘要：`{id, source: 'open-editor', pageCount, shapeCount, assetCount, storeRecordCount, approxJsonBytes, shapeTypeCounts, linkedBlockShapeCount, pages, isOpen}`
- **错误**: 缺 ID / 白板未打开 / 内部抛错。
- **注意**: 备份本身失败不抛错，而是返回 `success: false, error: "..."` 在 result 中。

### tldraw_list_backups

- **文件**: [./whiteboards/list-backups.ts](./whiteboards/list-backups.ts)
- **功能**: 列出 trash/backup 目录中的备份文件，可按白板 ID 过滤，仅返回安全元数据。
- **成功返回**: `{backups: [{name, drawingId, path, date(ISO 字符串), title}]}`
  - 已按 `date` 降序，`limit` 范围 1-100 默认 30
- **错误**: 内部抛错 / 全局禁用。

### tldraw_preview_backup

- **文件**: [./whiteboards/preview-backup.ts](./whiteboards/preview-backup.ts)（返回值来自 `WhiteboardFileManager.getBackupPreview`）
- **功能**: 预览备份文件（不恢复），返回计数和简化样本。
- **成功返回**: `{shapeCount, pageCount, pageNames, shapeSamples, pagePreviews?}`
  - `pageNames`(最多前 3 个页面名)
  - `shapeSamples`(最多前 3 个形状的 `"type (label)"` 字符串)
  - `pagePreviews?`: 每页一项 `{id?, name?, shapes: [{id?, type?, x, y, w, h}]}`
- **错误**: 缺 backupPath (`"missing required argument: backupPath"`) / `"backupPath must be inside the STtools tldraw trash/backup directory"` / 读取解析失败（如 `"备份文件为空"`） / 全局禁用。

### tldraw_delete_whiteboard_file

- **文件**: [./whiteboards/delete-whiteboard-file.ts](./whiteboards/delete-whiteboard-file.ts)
- **功能**: dry-run 或将已关闭的白板文件移到 trash 目录；拒绝删除当前打开的白板。
- **成功返回**:
  - **dryRun（默认，`confirm !== true`）**：`{dryRun: true, whiteboardId, fileSize, message: "Pass confirm:true to move this whiteboard file to trash."}`
  - **确认删除（`confirm === true`）**：`{dryRun: false, whiteboardId, fileSize, success, fileName?, filePath?, error?, data?}`
- **错误**: 缺 ID / `"Whiteboard <id> is currently open; close it before deleting its file."` / `"Whiteboard file not found: <id>"` / 内部抛错。
- **注意**: 删除内部失败（`success: false`）进入成功分支返回结构化结果，而非 `error` 字段。

### tldraw_save_whiteboard

- **文件**: [./whiteboards/save-whiteboard.ts](./whiteboards/save-whiteboard.ts)（逻辑在 `./internal/operations/manager-ops.ts` 的 `saveAgentWhiteboard`）
- **功能**: 立即保存当前打开白板的快照。
- **成功返回**: `{success: true, summary: {id, title, isOpen, pageCount, shapeCount, assetCount, shapeTypeCounts, selectedShapeCount}}`
  - compact 模式，`selectedShapeIds` 被替换为 `selectedShapeCount`
- **错误**: 缺 ID / 白板未打开 / `"Tldraw editor is not initialized"` / 内部抛错。

---

## document 类（思源文档联动）

### siyuan_read_doc_outline_for_tldraw

- **文件**: [./documents/read-doc-outline.ts](./documents/read-doc-outline.ts)
- **功能**: 读取思源文档大纲（标题/块树），供 Agent 规划白板结构。
- **成功返回**: `{docId, outlineNodeCount, outline}`
  - `outlineNodeCount`：完整大纲的递归节点总数（未截断的真实总数）
  - `outline`：大纲摘要数组，最多 `maxNodes` 个（默认 120，范围 1-500）。每项：`{id, title, type?, subType?, depth?, children?}`（`type`/`subType`/`depth`/`children` 为 undefined/空时被 `JSON.stringify` 省略）
- **错误**: 缺 docId (`"missing required argument: docId"`) / 内部抛错。

### tldraw_insert_doc_outline_mindmap

- **文件**: [./documents/insert-doc-outline-mindmap.ts](./documents/insert-doc-outline-mindmap.ts) · **默认禁用**
- **功能**: 把思源文档大纲插入到已打开白板，形成 branch/思维导图布局；缺失主卡片会自动创建，无标题块时采样内容块并创建兜底 h6 标题。
- **成功返回** `AgentDocOutlineBoardResult`：`{docId, layout: "outline-mindmap", mainShapeId, createdMainShape, outlineNodeCount, branchId, createdShapeIds, createdFallbackHeadingId, createdFallbackHeadingIds, skippedCount, outline}`
  - `branchId`：根 branch shape ID（字符串），无可创建项时为 `null`
  - `createdShapeIds`：实际新建的卡片 shape ID 数组
  - `createdFallbackHeadingId`/`createdFallbackHeadingIds`：兜底 h6 标题块 ID（大纲本就有节点时为 `null`/`[]`）
  - `skippedCount`：因白板上已存在对应 blockId 而跳过的项数
  - `outline`：大纲摘要数组（此处默认上限 80），节点结构同上
- **错误**: 缺 docId / 白板未打开 / `"Main shape not found: <mainShapeId>"` / `"Main shape must be a card: <mainShapeId>"` / `"Failed to create document main card."` / 内部抛错。

### siyuan_create_summary_doc_whiteboard

- **文件**: [./documents/create-summary-doc-whiteboard.ts](./documents/create-summary-doc-whiteboard.ts) · **默认禁用** · 两阶段调用
- **功能**: 在源文档旁创建摘要文档，填充分层 Markdown 摘要，打开其白板并把标题转成思维导图。
- **成功返回 A**（未传 `summaryMarkdown`）——返回源文档信息让 AI 生成摘要：
  - `{docId, title, box, path, hPath, sourceMarkdown, truncated, instructions}`
  - `sourceMarkdown`：导出的 Markdown；超过 `maxChars`（默认 30000，范围 1000-80000）则截断，`truncated` 标记是否截断
  - `instructions`：固定三条给 AI 的指令：
    1. `"Summarize the source document into hierarchical Markdown."`
    2. `"Use heading blocks to represent levels; prefer ## through ###### and avoid # headings."`
    3. `"Call this action again with docId and summaryMarkdown to create the summary document whiteboard mindmap."`
- **成功返回 B**（传了 `summaryMarkdown`）——创建并返回：
  - `{sourceDocId, summaryDocId, summaryTitle, summaryPath, summaryHPath, requestedSummaryHPath, summaryStoragePath, whiteboardOpened, mindmapInserted, pendingReason, retry, mindmap}`
  - `whiteboardOpened`：是否打开了白板（`openWhiteboard !== false` 时为 true）
  - `mindmapInserted`：是否成功插入思维导图（`Boolean(mindmap)`）
  - `pendingReason`：白板未在 `waitMs`（默认 8000ms）内打开时为 `"Whiteboard <summaryDocId> did not finish opening before timeout."`，否则为 `null`
  - `retry`：超时时为 `{action: "tldraw_insert_doc_outline_mindmap", args: {docId, whiteboardId, select, zoom}}`，否则为 `null`
  - `mindmap`：成功时为 `AgentDocOutlineBoardResult`（结构同 [tldraw_insert_doc_outline_mindmap](#tldraw_insert_doc_outline_mindmap)），未插入时为 `null`
- **错误**: 缺 docId / `"summaryMarkdown cannot be empty."` / `"Document or block not found: ..."` / `"Source document hpath is empty."` / `"Failed to create summary document."` / `"Document not found after creation: ..."` / `"Created document is in another notebook: ..."` / `"Created document hpath mismatch: ..."` / `"Created document is not in source document parent: ..."` / 内部抛错。

### tldraw_navigate_to_block

- **文件**: [./documents/navigate-to-block.ts](./documents/navigate-to-block.ts)
- **功能**: 在已打开白板上找到/选中与某个思源块关联的 tldraw shape（可选缩放）。
- **成功返回**: `{found, shapeId, selectedShapeIds}`
  - `found`：是否找到并选中了 shape
  - `shapeId`：找到的 shape ID（字符串）；未解析到时为 `null`
  - `selectedShapeIds`：操作完成后 editor 当前选中的 shape ID 数组
  - 三种分支：
    1. 未解析到 shapeId：`{found: false, shapeId: null, selectedShapeIds: [...]}`
    2. shapeId 存在但 `getShape` 返回空：`{found: false, shapeId: "<id>", selectedShapeIds: [...]}`
    3. 成功（执行 `editor.select` 并按 `zoom !== false` 缩放）：`{found: true, shapeId: "<id>", selectedShapeIds: [...]}`
- **错误**: 未知参数 / 缺 blockId (`"missing required argument: blockId"`) / 白板未打开 / 内部抛错。

---

## 关键设计说明

1. **两条"错误"通道**：handler 层的 `{ error }` 用于硬错误（参数/白板状态/异常）；结构化 result 里的 `errors: string[]` + `ok: false` 用于业务软失败。AI 调用时既要检查 `error` 字段，也要检查结构内的 `ok`/`errors`。

2. **`summary` 的 compact/full 模式**贯穿 `tldraw_shape_command`、`tldraw_apply_plan`、`tldraw_delete_shapes`、`tldraw_save_whiteboard`：
   - compact（默认）：去掉 `selectedShapeIds` 和 `sampleShapes`，改用 `selectedShapeCount`
   - full（`resultMode='full'`）：保留完整字段，用于调试

3. **默认禁用的工具**（`defaultEnabled: false`）：`tldraw_apply_plan`、`tldraw_insert_doc_outline_mindmap`、`siyuan_create_summary_doc_whiteboard`。

4. **安全设计**：
   - `tldraw_list_whiteboards`/`tldraw_get_snapshot_summary` 只返回计数和摘要样本，`fullSnapshotJsonReturned` 始终为 `false`
   - `tldraw_get_shape_details` 屏蔽脚本/数据/截图类字段
   - 删除类操作（`tldraw_delete_shapes`、`tldraw_delete_whiteboard_file`）默认 dry-run，`tldraw_delete_shapes` 确认删除前强制先备份

5. **复杂工具的实现位置**：`tldraw_shape_command` 与 `tldraw_apply_plan` 的复杂返回结构主要在 [./internal/operations/manager-ops.ts](./internal/operations/manager-ops.ts) 和 [./internal/planning/plan-runner.ts](./internal/planning/plan-runner.ts) 中构造，工具文件本身只做参数归一化与白板校验。结果类型定义在 [./internal/core/types.ts](./internal/core/types.ts)。
