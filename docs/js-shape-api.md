# JS 形状运行时 API

本说明文档汇总了 `JS Shape` 可用的运行时参数、交互约定以及最佳实践，方便快速查阅。

## 打开编辑器与基础操作

- 选中 JS 形状后，使用画布上方悬浮工具条中的 `</>` 按钮进入脚本编辑器。无需再双击形状。
- 编辑器左侧提供脚本输入区，支持 `Ctrl / Cmd + S` 快捷保存并立即执行。
- 可通过同一工具条中的 `⚡` 按钮手动重新执行脚本。
- `允许交互` 开关会切换形状 DOM 是否接管指针事件；开启交互后仍可通过画布默认拖拽移动形状，如需阻止拖拽请在事件中调用 `event.stopPropagation()`。
 - 默认情况下，新建 JS 形状默认允许 DOM 交互；你可以在编辑器中切换 `允许交互` 设置。

## 运行时上下文 `api`

脚本会收到单个参数 `api`，包含以下字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `dom` | `HTMLDivElement` | 渲染容器，脚本应将自定义 DOM 挂载到此节点内部。脚本重跑时容器会被自动清空。 |
| `shape` | `IJsShape` | 当前形状的数据对象，可读取尺寸、颜色、附加属性等信息。请勿直接修改该对象。 |
| `state` | `any` | 上一次执行时 `setState` 存储的状态。适合缓存轻量数据或控制 UI。 |
| `setState(next)` | `(next: PartialState \| (prev) => any)` | 更新运行时状态。传入对象时会与旧值浅合并，也可传入函数基于 `prev` 计算。调用后会触发脚本重新执行。返回 `undefined` 将忽略更新。 |
| `invalidate()` | `() => void` | 手动请求重新执行脚本，例如在异步请求完成后刷新 DOM。 |
| `editor` | `Editor` | `tldraw` 的 `Editor` 实例，可用于选择/定位其他形状或创建命令。请谨慎使用破坏性 API。 |
| `signal` | `AbortSignal` | 当脚本被重新执行或形状被删除时会触发，可用于取消异步请求或清理副作用。 |
| `console` | `Console` | 浏览器原生控制台对象，便于调试。 |
| `fetch` | `Window.fetch` | 浏览器内置 `fetch`，已自动绑定 `signal`，脚本结束时会尝试中断未完成请求。 |
| `requestAnimationFrame(cb)` / `cancelAnimationFrame(id)` | 包装后的动画帧 API，会在脚本结束或重新运行时统一清理，避免泄漏。 |

> **提示**：脚本返回一个函数时会被视为清理器（cleanup），在下一次执行或形状销毁时自动调用。

## 交互与指针处理

- 默认情况下（未勾选“允许交互”）形状 DOM 不会接收指针事件，拖拽/选择与其他图形一致。
- 启用“允许交互”后，DOM 会接管点击事件，但画布依旧可以直接拖动/选中形状。如果某些元素需要阻止画布拖拽，可在其事件处理函数内调用：
  ```ts
  element.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
  });
  ```
- 可通过悬浮工具条中的鼠标图标快速切换交互模式，无需打开样式面板。

## 常见模式示例

```ts
const { dom, state, setState, invalidate, signal } = api

if (!state.items) {
    setState({ items: [] })
    return
}

dom.innerHTML = `<ul class="todo"></ul>`
const list = dom.querySelector('.todo')!
list.innerHTML = state.items.map((text) => `<li>${text}</li>`).join('')

document.addEventListener('keydown', (event) => {
    if (event.key === 'r') {
        invalidate() // 手动触发刷新
    }
}, { signal })
```

## 导出与打印（SVG 导出）

- `JS Shape` 的导出现在实现所见即所得（WYSIWYG）：当导出为 SVG 时，运行时渲染出来的 DOM 会被序列化并内嵌到导出的 SVG 中（使用 `<foreignObject>`），并尝试将外部资源（如图片）转换为 data URL 以便离线查看。
- 注意：导出只会序列化当前的 DOM 状态和样式（会内联计算样式），不会执行脚本或保留事件监听器。某些依赖运行时脚本的动态行为（例如基于窗口大小变动的动画）在静态导出中可能不能重现。

如果你希望导出的 SVG 精确还原运行时样式，建议在脚本中把重要的视觉样式应用到内联样式上，或在脚本中生成适合导出的静态结构。


更多示例与最佳实践将持续补充，若有新增需求欢迎 PR。
