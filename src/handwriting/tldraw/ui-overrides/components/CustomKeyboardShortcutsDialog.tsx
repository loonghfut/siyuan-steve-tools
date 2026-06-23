/**
 * 自定义快捷键对话框组件
 */
import React from 'react'
import {
    DefaultKeyboardShortcutsDialog,
    DefaultKeyboardShortcutsDialogContent,
    TldrawUiMenuItem,
    useTools,
} from '@tldraw/tldraw'

export const CustomKeyboardShortcutsDialog: React.FC<any> = (props) => {
    const tools = useTools()

    return (
        <DefaultKeyboardShortcutsDialog {...props}>
            <TldrawUiMenuItem {...tools['card']} />
            <TldrawUiMenuItem {...tools['single-block']} />
            <TldrawUiMenuItem {...tools['slide']} />
            <TldrawUiMenuItem {...tools['js-shape']} />
            <TldrawUiMenuItem {...tools['mind-map']} />
            <TldrawUiMenuItem {...tools['branch']} />
            <DefaultKeyboardShortcutsDialogContent />
        </DefaultKeyboardShortcutsDialog>
    )
}
