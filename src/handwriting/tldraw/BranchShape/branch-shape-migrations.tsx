import { createShapePropsMigrationIds, createShapePropsMigrationSequence } from '@tldraw/tldraw'

const versions = createShapePropsMigrationIds('branch', {
	AddVersion: 1,
	AddShowOuterFrame: 2,
	RenameShowOuterFrameToShowBackground: 3,
	AddLineStyle: 4,
	AddRootShapeId: 5,
	MigrateChildIdsToRightChildIds: 6,
	AddTreeTableStyle: 7,
})

export const branchShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: versions.AddVersion,
			up(props) {
				props.version = 1
			},
			down(props) {
				delete props.version
			},
		},
		{
			id: versions.AddShowOuterFrame,
			up(props) {
				props.showOuterFrame = props.showOuterFrame ?? false
				props.version = 2
			},
			down(props) {
				delete props.showOuterFrame
				props.version = 1
			},
		},
		{
			id: versions.RenameShowOuterFrameToShowBackground,
			up(props) {
				props.showBackground = props.showBackground ?? props.showOuterFrame ?? false
				delete props.showOuterFrame
				props.version = 3
			},
			down(props) {
				props.showOuterFrame = props.showOuterFrame ?? props.showBackground ?? false
				delete props.showBackground
				props.version = 2
			},
		},
		{
			id: versions.AddLineStyle,
			up(props) {
				props.lineStyle = props.lineStyle ?? 'curve-solid'
				props.version = 4
			},
			down(props) {
				delete props.lineStyle
				props.version = 3
			},
		},
		{
			id: versions.AddRootShapeId,
			up(props) {
				props.version = 5
			},
			down(props) {
				delete props.rootShapeId
				props.version = 4
			},
		},
		{
			id: versions.MigrateChildIdsToRightChildIds,
			up(props) {
				props.rightChildIds = props.rightChildIds ?? props.childIds ?? []
				delete props.childIds
				props.version = 6
			},
			down(props) {
				props.childIds = props.rightChildIds ?? []
				delete props.rightChildIds
				props.version = 5
			},
		},
		{
			id: versions.AddTreeTableStyle,
			up(props) {
				props.version = 7
			},
			down(props) {
				if (props.lineStyle === 'tree-table') props.lineStyle = 'curve-solid'
				props.version = 6
			},
		},
	],
})
