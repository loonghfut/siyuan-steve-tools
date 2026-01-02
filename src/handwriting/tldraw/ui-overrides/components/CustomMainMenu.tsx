/**
 * 自定义主菜单组件
 */
import React from 'react'
import {
    DefaultMainMenu,
    DefaultMainMenuContent,
    TldrawUiMenuSubmenu,
    TldrawUiMenuItem,
    useEditor,
} from '@tldraw/tldraw'
import { showMessage, confirm as syConfirm } from 'siyuan'

export const CustomMainMenu: React.FC = () => {
    const editor = useEditor()

    return (
        <DefaultMainMenu>
            <DefaultMainMenuContent />
            <TldrawUiMenuSubmenu id="sttools" label="更多">
                <TldrawUiMenuItem
                    id="backupData"
                    label="备份数据"
                    readonlyOk
                    onSelect={() => {
                        editor.emit('sttools:backupData')
                    }}
                />
                <TldrawUiMenuItem
                    id="rollbackData"
                    label="回滚数据"
                    readonlyOk
                    onSelect={() => {
                        editor.emit('sttools:rollbackData')
                    }}
                />
                <TldrawUiMenuItem
                    id="importData"
                    label="导入备份数据"
                    readonlyOk
                    onSelect={() => {
                        editor.emit('sttools:importData')
                    }}
                />
                <TldrawUiMenuItem
                    id="exportData"
                    label="导出数据"
                    readonlyOk
                    onSelect={() => {
                        editor.emit('sttools:exportData')
                    }}
                />
                <TldrawUiMenuItem
                    id="pruneAssets"
                    label="清理未使用资源"
                    readonlyOk
                    onSelect={() => {
                        try {
                            const title = '清理未使用资源'
                            const text = '确定要清理未被任何形状引用的 asset 吗？此操作会删除这些 asset 的 store 记录（不可撤销）。'
                            if (typeof syConfirm === 'function') {
                                syConfirm(title, text, () => {
                                    editor.emit('sttools:pruneAssets')
                                    showMessage('开始清理未使用资源')
                                }, () => { /* cancel callback, do nothing */ })
                            } else {
                                const confirmed = window.confirm(text)
                                if (!confirmed) return
                                editor.emit('sttools:pruneAssets')
                                showMessage('开始清理未使用资源')
                            }
                        } catch (err) {
                            console.error('emit pruneAssets failed', err)
                            showMessage('请求清理未使用资源失败', 4000, 'error')
                        }
                    }}
                />
            </TldrawUiMenuSubmenu>
        </DefaultMainMenu>
    )
}
