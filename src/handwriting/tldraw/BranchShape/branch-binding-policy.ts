import type { TLShapeUtilCanBindOpts } from '@tldraw/tldraw'

/**
 * A branch is a structural connector, not generic content. In particular, a
 * card or single-block used as another branch's root must never become the
 * branch's binding endpoint just because both shapes share a center.
 */
export function canBindBranchToTarget({ fromShape, toShape }: TLShapeUtilCanBindOpts) {
	return fromShape.type !== 'branch' || toShape.type === 'branch'
}
