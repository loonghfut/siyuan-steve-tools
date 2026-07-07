declare module '@tldraw/editor' {
  interface TLGlobalShapePropsMap {
    card: { w:number; h:number }
  }
}
import type { TLShape } from '@tldraw/tldraw'
const s = null as any as TLShape
const ok = s.type === 'card'
