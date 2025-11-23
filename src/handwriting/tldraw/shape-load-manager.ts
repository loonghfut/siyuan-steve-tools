/*
Global ShapeLoadManager
Limits the number of simultaneously 'active / heavy' loaded shapes (mounting Protyle etc.)
Prioritization rules (sorted ascending by score):
 1. Editing shapes always allowed (score forced to -Infinity)
 2. In-viewport shapes before out-of-viewport
 3. Distance to viewport center (nearer first)
Optional: future extension for renderMode / collapsed state.

API:
  register(shapeId: string, metaProvider: () => ShapeLoadMeta, onPermissionChange: (allowed: boolean) => void): () => void
  isAllowed(shapeId: string): boolean
Configuration:
  maxActive from settingdata['tldraw-max-active-shapes'] or default 40
Internals:
  Recomputes every RECOMPUTE_MS (300ms) or on demand.
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
  metaProvider: () => ShapeLoadMeta
  onChange: (allowed: boolean, meta: ComputedMeta) => void
  lastAllowed: boolean
  lastComputed: ComputedMeta
}

class ShapeLoadManager {
  private shapes: Map<TLShapeId, RegisteredShape> = new Map()
  private editor: Editor | null = null
  private rafId: number | null = null
  private lastViewport: { minX: number; minY: number; maxX: number; maxY: number } | null = null
  private lastRecomputeAt = 0
  private PRELOAD_MARGIN_WORLD = 1600

  attachEditor(editor: Editor) {
    this.editor = editor
    this.ensureLoop()
  }

  register(shapeId: TLShapeId, metaProvider: () => ShapeLoadMeta, onPermissionChange: (allowed: boolean, meta: ComputedMeta) => void) {
    const existing = this.shapes.get(shapeId)
    if (existing) {
      existing.metaProvider = metaProvider
      existing.onChange = onPermissionChange
      return () => this.unregister(shapeId)
    }
    const entry: RegisteredShape = {
      id: shapeId,
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
    if (!this.editor) return
    const vp = this.editor.getViewportPageBounds()
    const now = performance.now()
    const since = now - this.lastRecomputeAt
    const changed = !this.lastViewport || !vp ||
      vp.minX !== this.lastViewport.minX ||
      vp.minY !== this.lastViewport.minY ||
      vp.maxX !== this.lastViewport.maxX ||
      vp.maxY !== this.lastViewport.maxY
    if (changed || since >= 500) {
      this.recompute()
    }
  }

  private recompute() {
    if (!this.editor) return
    const now = performance.now()
    this.lastRecomputeAt = now
    const viewport = this.editor.getViewportPageBounds()
    if (viewport) {
      this.lastViewport = { minX: viewport.minX, minY: viewport.minY, maxX: viewport.maxX, maxY: viewport.maxY }
    }

    const maxActive = Math.max(1, Number(settingdata['tldraw-max-active-shapes']) || 40)

    const sortable: Array<{ id: string; score: number; editing: boolean; meta: ComputedMeta }> = []
    for (const s of this.shapes.values()) {
      let provided: ShapeLoadMeta = { editing: false }
      try { provided = s.metaProvider() } catch { /* ignore */ }
      // compute visibility & distance globally
      let distance = Infinity
      let inViewport = false
      try {
        const vp = viewport
        const b = this.editor.getShapePageBounds(s.id)
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
        if (!inViewport) score += 1000
        sortable.push({ id: s.id, score, editing: false, meta: cmeta })
      }
    }

    sortable.sort((a, b) => a.score - b.score)

    const allowedSet = new Set<string>()
    let count = 0
    for (const item of sortable) {
      if (count < maxActive || item.editing) {
        allowedSet.add(item.id)
      }
      if (!item.editing) count++
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
