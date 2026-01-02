/**
 * TLComponents 组件配置
 */
import type { TLComponents } from '@tldraw/tldraw'
import { SlidesPanel } from '../SlideShape/SlidesPanel'
import { CustomStylePanel } from './components/CustomStylePanel'
import { CustomQuickActions } from './components/CustomQuickActions'
import { CustomContextMenu } from './components/CustomContextMenu'
import { CustomMainMenu } from './components/CustomMainMenu'
import { CustomToolbar } from './components/CustomToolbar'
import { CustomKeyboardShortcutsDialog } from './components/CustomKeyboardShortcutsDialog'
import { InFrontOfCanvas } from './components/InFrontOfCanvas'

export const components: TLComponents = {
    HelperButtons: SlidesPanel,
    QuickActions: CustomQuickActions,
    StylePanel: CustomStylePanel,
    ContextMenu: CustomContextMenu,
    Toolbar: CustomToolbar,
    KeyboardShortcutsDialog: CustomKeyboardShortcutsDialog,
    MainMenu: CustomMainMenu,
    InFrontOfTheCanvas: InFrontOfCanvas,
}
