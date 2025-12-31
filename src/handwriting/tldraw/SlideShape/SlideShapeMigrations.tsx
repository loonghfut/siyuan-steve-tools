import { createShapePropsMigrationIds, createShapePropsMigrationSequence } from '@tldraw/tldraw'


const versions = createShapePropsMigrationIds(
  // this must match the shape type in the shape definition
  'slide',
  {
    Addv: 1,
    Addcolor: 2,
    Addscreenshot: 3,
    AddborderStyle: 4,
  }
)

// Migrations for the custom card shape (optional but very helpful)
export const slideShapeMigrations = createShapePropsMigrationSequence({
  sequence: [
    {
      id: versions.Addv,
      up(props) {
        // it is safe to mutate the props object here
        props.version = 1
      },
      down(props) {
        delete props.version
      },
    },
    {
      id: versions.Addcolor,
      up(props) {
        // it is safe to mutate the props object here
        props.color = 'black'
      },
      down(props) {
        delete props.color
      },
    },
    {
      id: versions.Addscreenshot,
      up(props) {
        if (typeof props.screenshot !== 'string') {
          props.screenshot = ''
        }
      },
      down(props) {
        delete props.screenshot
      },
    },
    {
      id: versions.AddborderStyle,
      up(props) {
        // 添加边框样式属性，默认值
        if (typeof props.borderStyle !== 'string') {
          props.borderStyle = 'dashed'
        }
      },
      down(props) {
        delete props.borderStyle
      },
    },
  ],
})
