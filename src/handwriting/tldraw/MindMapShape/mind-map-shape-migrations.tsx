import { createShapePropsMigrationIds, createShapePropsMigrationSequence } from '@tldraw/tldraw'

const versions = createShapePropsMigrationIds(
    'mind-map',
    {
        AddVersion: 1,
    }
)

// 思维导图形状迁移
export const mindMapShapeMigrations = createShapePropsMigrationSequence({
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
