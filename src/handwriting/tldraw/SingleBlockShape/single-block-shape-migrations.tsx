import { createShapePropsMigrationIds, createShapePropsMigrationSequence } from '@tldraw/tldraw'

const versions = createShapePropsMigrationIds('single-block', {
	addRefreshNonce: 1,
    addAllowBinding: 2,
    addLightweightPreviewText: 3,
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
		{
			id: versions.addAllowBinding,
			up(props) {
				props.allowBinding = props.allowBinding ?? true
			},
			down(props) {
				delete props.allowBinding
			},
		},
		{
			id: versions.addLightweightPreviewText,
			up(props) {
				props.previewText = props.previewText ?? ''
			},
			down(props) {
				delete props.previewText
			},
		},
	],
})
