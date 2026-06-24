import { createShapePropsMigrationIds, createShapePropsMigrationSequence } from '@tldraw/tldraw'

const versions = createShapePropsMigrationIds('branch', {
	AddVersion: 1,
	AddShowOuterFrame: 2,
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
				props.showOuterFrame = false
				props.version = 2
			},
			down(props) {
				delete props.showOuterFrame
				props.version = 1
			},
		},
	],
})
