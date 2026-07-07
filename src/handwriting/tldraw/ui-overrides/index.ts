/**
 * UI Overrides 主入口
 * 重新导出所有模块
 */

// 类型定义（包含 TLEventMap 扩展）
export * from './types'

// UI Overrides 对象
export { uiOverrides } from './overrides'

// TL Components 配置
export { components } from './components'

// 面板状态管理
export {
    toggleShapeLibrary,
    useShapeLibraryOpen,
    toggleDocOutline,
    setDocOutlineDocId,
    useDocOutlineOpen,
    useDocOutlineDocId,
    toggleChildDocs,
    useChildDocsOpen,
} from './panel-state'
