/**
 * 自定义工具栏组件
 */
import React from 'react'
import {
    DefaultToolbar,
    DefaultToolbarContent,
    TldrawUiMenuItem,
    useTools,
    useIsToolSelected,
} from '@tldraw/tldraw'
import { settingdata } from '@/index'

export const CustomToolbar: React.FC<any> = (props) => {
    const tools = useTools()
    const isCardSelected = useIsToolSelected(tools['card'])
    const isSingleBlockSelected = useIsToolSelected(tools['single-block'])
    const isSlideSelected = useIsToolSelected(tools['slide'])
    const isJsShapeSelected = useIsToolSelected(tools['js-shape'])
    const isMindMapSelected = useIsToolSelected(tools['mind-map'])
    const isBranchSelected = useIsToolSelected(tools['branch'])
    const toolbarOrientation = (settingdata?.['tldraw-toolbar-orientation'] as 'vertical' | 'horizontal') || 'vertical'

    return (
        <DefaultToolbar {...props} orientation={toolbarOrientation}>
            <TldrawUiMenuItem {...tools['card']} isSelected={isCardSelected} />
            <TldrawUiMenuItem {...tools['single-block']} isSelected={isSingleBlockSelected} />
            <TldrawUiMenuItem {...tools['slide']} isSelected={isSlideSelected} />
            <DefaultToolbarContent />
            <TldrawUiMenuItem {...tools['js-shape']} isSelected={isJsShapeSelected} />
            <TldrawUiMenuItem {...tools['mind-map']} isSelected={isMindMapSelected} />
            <TldrawUiMenuItem {...tools['branch']} isSelected={isBranchSelected} />
        </DefaultToolbar>
    )
}
