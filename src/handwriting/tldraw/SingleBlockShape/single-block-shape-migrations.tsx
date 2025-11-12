import { createShapePropsMigrationIds, createShapePropsMigrationSequence } from '@tldraw/tldraw'

const versions = createShapePropsMigrationIds('single-block', {
	addRefreshNonce: 1,
})

export const singleBlockShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: versions.addRefreshNonce,
			up(props) {
				props.refreshNonce = props.refreshNonce ?? Date.now()
			},
			down(props) {
				delete props.refreshNonce
			},
		},
	],
})
