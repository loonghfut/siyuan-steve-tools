import { createShapePropsMigrationIds, createShapePropsMigrationSequence } from '@tldraw/tldraw'

const versions = createShapePropsMigrationIds('branch', {
	AddVersion: 1,
	AddShowOuterFrame: 2,
	RenameShowOuterFrameToShowBackground: 3,
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
	],
})
