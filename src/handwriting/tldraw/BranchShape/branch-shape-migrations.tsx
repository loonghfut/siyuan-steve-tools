import { createShapePropsMigrationIds, createShapePropsMigrationSequence } from '@tldraw/tldraw'

const versions = createShapePropsMigrationIds('branch', {
	AddVersion: 1,
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
	],
})
