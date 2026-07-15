/**
 * 自定义右键菜单组件
 */
import React from 'react'
import {
    DefaultContextMenu,
    DefaultContextMenuContent,
    ConvertToBookmarkMenuItem,
    ConvertToEmbedMenuItem,
    TldrawUiMenuGroup,
    TldrawUiMenuItem,
    TLUiContextMenuProps,
    useEditor,
} from '@tldraw/tldraw'
import { showMessage, Dialog } from 'siyuan'
import { addShapesToLibrary } from '../../shapelibrary/shape-library-manager'

export const CustomContextMenu: React.FC<TLUiContextMenuProps> = (props) => {
    const editor = useEditor()

    const handleAddToLibrary = React.useCallback(async () => {
        const selectedShapes = editor.getSelectedShapes()
        if (selectedShapes.length === 0) {
            showMessage('请先选中要添加的形状', 3000, 'error')
            return
        }

        const defaultName = `素材 ${new Date().toLocaleString('zh-CN')}`

        const dialog = new Dialog({
            title: '添加到素材库',
            content: `<div class="b3-dialog__content">
                <div class="b3-label">
                    <span>素材名称</span>
                    <input class="b3-text-field fn__block" id="shape-library-name-input" value="${defaultName}" />
                </div>
            </div>
            <div class="b3-dialog__action">
                <button class="b3-button b3-button--cancel">取消</button>
                <button class="b3-button b3-button--text" id="shape-library-confirm-btn">确定</button>
            </div>`,
            width: '400px',
        })

        const inputEl = dialog.element.querySelector('#shape-library-name-input') as HTMLInputElement
        const confirmBtn = dialog.element.querySelector('#shape-library-confirm-btn') as HTMLButtonElement
        const cancelBtn = dialog.element.querySelector('.b3-button--cancel') as HTMLButtonElement

        setTimeout(() => {
            inputEl?.focus()
            inputEl?.select()
        }, 100)

        const handleConfirm = async () => {
            const name = inputEl?.value?.trim() || defaultName
            dialog.destroy()
            await addShapesToLibrary(editor, name)
            editor.emit('sttools:addToShapeLibrary')
        }

        confirmBtn?.addEventListener('click', handleConfirm)
        cancelBtn?.addEventListener('click', () => dialog.destroy())

        inputEl?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleConfirm()
            } else if (e.key === 'Escape') {
                dialog.destroy()
            }
        })
    }, [editor])

    return (
        <DefaultContextMenu {...props}>
            <TldrawUiMenuGroup id="link-display-mode">
                <ConvertToEmbedMenuItem />
                <ConvertToBookmarkMenuItem />
            </TldrawUiMenuGroup>
            <TldrawUiMenuGroup id="shape-library">
                <TldrawUiMenuItem
                    id="add-to-library"
                    label="加入素材库"
                    icon="bookmark"
                    readonlyOk={false}
                    onSelect={handleAddToLibrary}
                />
            </TldrawUiMenuGroup>
            <DefaultContextMenuContent />
        </DefaultContextMenu>
    )
}
