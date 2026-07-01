import { getBranchShapeDefaultProps } from '../BranchShape/branch-shape-props'
import { getCardShapeDefaultProps } from '../CardShape/card-shape-props'
import { getSingleBlockShapeDefaultProps } from '../SingleBlockShape/single-block-shape-props'

export function getAgentCardDefaults() {
	return getCardShapeDefaultProps()
}

export function getAgentSingleBlockDefaults() {
	return getSingleBlockShapeDefaultProps()
}

export function getAgentBranchDefaults() {
	return getBranchShapeDefaultProps()
}

export const AGENT_SHAPE_BOUNDS = {
	minSize: 1,
	maxSize: 4000,
	minBranchHorizontalGap: 20,
	maxBranchHorizontalGap: 2000,
	minBranchVerticalGap: 8,
	maxBranchVerticalGap: 1000,
	minBranchLineWidth: 1,
	maxBranchLineWidth: 24,
	minBranchSnapDistance: 40,
	maxBranchSnapDistance: 2000,
}
