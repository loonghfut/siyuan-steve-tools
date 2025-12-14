/*
Global ShapeLoadManager
Supports multiple tldraw instances, each shape registers with its own editor.
Limits the number of simultaneously 'active / heavy' loaded shapes (mounting Protyle etc.)
Prioritization rules (sorted ascending by score):
 1. Editing shapes always allowed (score forced to -Infinity)
 2. In-viewport shapes before out-of-viewport
 3. Distance to viewport center (nearer first)
Optional: future extension for renderMode / collapsed state.

API:
  register(shapeId: string, editor: Editor, metaProvider: () => ShapeLoadMeta, onPermissionChange: (allowed: boolean, meta: ComputedMeta) => void): () => void
  isAllowed(shapeId: string): boolean
Configuration:
  maxActive from settingdata['tldraw-max-active-shapes'] or default 40
Internals:
  Recomputes every 500ms or on demand.
  Each shape uses its own editor's viewport for visibility calculation.
*/

import { settingdata } from '@/index'
import type { Editor, TLShapeId } from '@tldraw/tldraw'

interface ShapeLoadMeta {
  editing: boolean
}

interface ComputedMeta {
  inViewport: boolean
  distance: number
}

interface RegisteredShape {
  id: TLShapeId
  editor: Editor
  metaProvider: () => ShapeLoadMeta
  onChange: (allowed: boolean, meta: ComputedMeta) => void
  lastAllowed: boolean
  lastComputed: ComputedMeta
}

class ShapeLoadManager {
  private shapes: Map<TLShapeId, RegisteredShape> = new Map()
  private editors: Set<Editor> = new Set()
  private rafId: number | null = null
  private lastRecomputeAt = 0
  private PRELOAD_MARGIN_WORLD = 1600

  attachEditor(editor: Editor) {
    this.editors.add(editor)
    this.ensureLoop()
  }

  register(shapeId: TLShapeId, editor: Editor, metaProvider: () => ShapeLoadMeta, onPermissionChange: (allowed: boolean, meta: ComputedMeta) => void) {
    const existing = this.shapes.get(shapeId)
    if (existing) {
      existing.editor = editor
      existing.metaProvider = metaProvider
      existing.onChange = onPermissionChange
      return () => this.unregister(shapeId)
    }
    const entry: RegisteredShape = {
      id: shapeId,
      editor,
      metaProvider,
      onChange: onPermissionChange,
      lastAllowed: false,
      lastComputed: { inViewport: true, distance: Infinity },
    }
    this.shapes.set(shapeId, entry)
    this.ensureLoop()
    return () => this.unregister(shapeId)
  }

  unregister(shapeId: TLShapeId) {
    this.shapes.delete(shapeId)
    if (this.shapes.size === 0) this.stopLoop()
  }

  isAllowed(shapeId: TLShapeId) {
    return this.shapes.get(shapeId)?.lastAllowed ?? false
  }

  private ensureLoop() {
    if (this.rafId !== null) return
    const tick = () => {
      this.rafId = window.requestAnimationFrame(() => {
        try {
          this.maybeRecompute()
        } finally {
          tick()
        }
      })
    }
    tick()
  }

  private stopLoop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  forceRecompute() {
    this.recompute()
  }

  private maybeRecompute() {
    const now = performance.now()
    const since = now - this.lastRecomputeAt
    if (since >= 500) {
      this.recompute()
    }
  }

  private recompute() {
    const now = performance.now()
    this.lastRecomputeAt = now

    const maxActive = Math.max(1, Number(settingdata['tldraw-max-active-shapes']) || 40)

    const sortable: Array<{ id: string; score: number; editing: boolean; meta: ComputedMeta }> = []
    for (const s of this.shapes.values()) {
      let provided: ShapeLoadMeta = { editing: false }
      try { provided = s.metaProvider() } catch { /* ignore */ }
      // compute visibility & distance using the shape's own editor
      let distance = Infinity
      let inViewport = false
      try {
        const vp = s.editor?.getViewportPageBounds()
        const b = s.editor?.getShapePageBounds(s.id)
        if (vp && b) {
          const expanded = {
            minX: vp.minX - this.PRELOAD_MARGIN_WORLD,
            minY: vp.minY - this.PRELOAD_MARGIN_WORLD,
            maxX: vp.maxX + this.PRELOAD_MARGIN_WORLD,
            maxY: vp.maxY + this.PRELOAD_MARGIN_WORLD,
          }
          inViewport = expanded.minX < b.maxX && expanded.maxX > b.minX && expanded.minY < b.maxY && expanded.maxY > b.minY
          const cx = vp.midX, cy = vp.midY
          const sx = (b.minX + b.maxX) / 2, sy = (b.minY + b.maxY) / 2
          distance = Math.hypot(cx - sx, cy - sy)
        }
      } catch { /* ignore */ }

      const cmeta: ComputedMeta = { inViewport, distance }
      if (provided.editing) {
        sortable.push({ id: s.id, score: -Infinity, editing: true, meta: cmeta })
      } else {
        let score = distance
        if (!inViewport) score += 1000000
        sortable.push({ id: s.id, score, editing: false, meta: cmeta })
      }
    }

    sortable.sort((a, b) => a.score - b.score)

    const allowedSet = new Set<string>()
    
    // 统计当前需要保留的形状数量（不包括编辑中的）
    let allowedCount = 0
    
    // 分离视口内和视口外的形状
    const inViewportItems = sortable.filter(item => !item.editing && item.meta.inViewport)
    const outOfViewportItems = sortable.filter(item => !item.editing && !item.meta.inViewport)
    
    // 第一步：编辑中的形状始终允许（不计入配额）
    for (const item of sortable) {
      if (item.editing) {
        allowedSet.add(item.id)
      }
    }
    
    // 第二步：优先加载视口内的形状（按距离排序，已排好序）
    for (const item of inViewportItems) {
      if (allowedCount < maxActive) {
        allowedSet.add(item.id)
        allowedCount++
      }
    }
    
    // 第三步：如果配额有剩余，保留视口外已加载的形状（防止频繁卸载/加载）
    for (const item of outOfViewportItems) {
      if (allowedCount >= maxActive) break
      
      const shape = this.shapes.get(item.id as TLShapeId)
      const wasAllowed = shape?.lastAllowed ?? false
      if (wasAllowed) {
        allowedSet.add(item.id)
        allowedCount++
      }
    }
    
    // 第四步：如果配额还有剩余，按优先级加载视口外的新形状
    for (const item of outOfViewportItems) {
      if (allowedCount >= maxActive) break
      if (allowedSet.has(item.id)) continue
      
      allowedSet.add(item.id)
      allowedCount++
    }

    // Notify changes
    for (const s of this.shapes.values()) {
      const newAllowed = allowedSet.has(s.id)
      const computed = sortable.find((x) => x.id === s.id)?.meta || { inViewport: false, distance: Infinity }
      const changed = newAllowed !== s.lastAllowed || computed.inViewport !== s.lastComputed.inViewport
      s.lastAllowed = newAllowed
      s.lastComputed = computed
      if (changed) {
        try { s.onChange(newAllowed, computed) } catch { /* ignore */ }
      }
    }
  }
}

export const shapeLoadManager = new ShapeLoadManager()
