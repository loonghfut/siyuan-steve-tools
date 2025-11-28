import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { keymap } from '@codemirror/view'
import { indentWithTab, defaultKeymap, undo, redo, indentSelection } from '@codemirror/commands'
import { autocompletion, closeBrackets, completeFromList, snippetCompletion } from '@codemirror/autocomplete'
import type { CompletionSource } from '@codemirror/autocomplete'
import { openSearchPanel, closeSearchPanel } from '@codemirror/search'

interface CodeEditorProps {
	value: string
	onChange?: (value: string) => void
	onSave?: () => void
	theme?: 'light' | 'dark'
	height?: string
	extraCompletions?: Array<any>
}

export interface CodeEditorRef {
	openSearch: () => void
	closeSearch: () => void
	formatCode: () => void
	undo: () => void
	redo: () => void
}

export const CodeEditor = forwardRef<CodeEditorRef, CodeEditorProps>(({ 
	value,
	onChange,
	onSave,
	theme = 'light',
	height = '100%',
	extraCompletions = [],
}, ref) => {
	const editorRef = useRef<HTMLDivElement>(null)
	const viewRef = useRef<EditorView | null>(null)

	useImperativeHandle(ref, () => ({
		openSearch: () => {
			if (viewRef.current) {
				openSearchPanel(viewRef.current)
			}
		},
		closeSearch: () => {
			if (viewRef.current) {
				closeSearchPanel(viewRef.current)
			}
		},
		formatCode: () => {
			if (viewRef.current) {
				indentSelection({ state: viewRef.current.state, dispatch: viewRef.current.dispatch })
			}
		},
		undo: () => {
			if (viewRef.current) {
				undo({ state: viewRef.current.state, dispatch: viewRef.current.dispatch })
			}
		},
		redo: () => {
			if (viewRef.current) {
				redo({ state: viewRef.current.state, dispatch: viewRef.current.dispatch })
			}
		},
	}))

	useEffect(() => {
		if (!editorRef.current) return

		const myCompletions = [
			// top-level environment variables
			{ label: 'api', type: 'variable', detail: 'Script runtime environment (alias for env)', info: 'api' },
			{ label: 'env', type: 'variable', detail: 'Script runtime environment', info: 'env' },
			{ label: 'api', type: 'variable', detail: 'Script runtime environment (alias for env)', info: 'api' },
			{ label: 'env', type: 'variable', detail: 'Script runtime environment', info: 'env' },
			// helpful snippets
			snippetCompletion('for (let ${1:i} = 0; ${1} < ${2:len}; ${1}++) {\n\t$0\n}', { label: 'for-loop', type: 'keyword', detail: 'for loop' }),
			snippetCompletion('console.log(${1:obj})', { label: 'console.log', type: 'keyword', detail: 'console.log' }),
			// Common shape props (externally injected) — merge via extraCompletions
			// merge external completions (if any)
			...extraCompletions,
		]

		// child properties under api/env
		let scriptFields = [
			{ label: 'dom', type: 'variable', detail: 'HTMLElement', info: 'Root DOM element' },
			{ label: 'saveData', type: 'function', detail: 'saveData(obj)', info: 'Merge and save shape data' },
			{ label: 'getData', type: 'function', detail: 'getData()', info: 'Get shape data (JSON)' },
			{ label: 'clearData', type: 'function', detail: 'clearData()', info: 'Clear shape data' },
			{ label: 'shape', type: 'variable', detail: 'shape', info: 'Current shape metadata' },
		]

		let shapeFields = [
			{ label: 'props.w', type: 'property', detail: 'width', info: 'shape.props.w' },
			{ label: 'props.h', type: 'property', detail: 'height', info: 'shape.props.h' },
			{ label: 'props.color', type: 'property', detail: 'color', info: 'shape.props.color' },
			{ label: 'id', type: 'property', detail: 'id', info: 'shape.id' },
			{ label: 'type', type: 'property', detail: 'type', info: 'shape.type' },
		]

		// inject extra completions into correct context groups
		let dataFields: Array<any> = []
		try {
			const extrasForShape = (extraCompletions || [])
				.filter((it: any) => typeof it.label === 'string' && it.label.startsWith('shape.'))
				.map((it: any) => ({ ...it, label: String((it.label as string).slice('shape.'.length)) }))
			if (extrasForShape.length) {
				shapeFields = [...shapeFields, ...extrasForShape]
			}
			// compute dataFields under shape.props.data.*
			dataFields = extrasForShape
				.filter((it: any) => typeof it.label === 'string' && it.label.startsWith('props.data.'))
				.map((it: any) => ({ ...it, label: String((it.label as string).slice('props.data.'.length)) }))
		} catch (e) {}

		const apiEnvCompletionSource: CompletionSource = (context) => {
			// match longer sequences like `api.shape.props.data.`
			const m = context.matchBefore(/(?:api|env)(?:\.[\w$]+)*\.?/)
			if (!m) return null
			const text = m.text
			const dotIndex = text.lastIndexOf('.')
			const from = m.from + dotIndex + 1
			// if user typed `api.shape.` or `env.shape.` provide nested shape fields
			if (/\b(?:api|env)\.shape\.props\.data\./.test(text)) {
				// suggest keys inside shape.props.data
				const innerDotIndex = text.lastIndexOf('.')
				const innerFrom = m.from + innerDotIndex + 1
				return { from: innerFrom, options: dataFields, validFor: /^\w*$/ }
			}
			if (/\b(?:api|env)\.shape\./.test(text)) {
				const innerDotIndex = text.lastIndexOf('.')
				const innerFrom = m.from + innerDotIndex + 1
				return { from: innerFrom, options: shapeFields, validFor: /^\w*$/ }
			}
			return { from, options: scriptFields, validFor: /^\w*$/ }
		}

		const extensions = [
			basicSetup,
			javascript({ jsx: false, typescript: false }),
			// enable default autocompletion plus our custom provider
			autocompletion({ override: [apiEnvCompletionSource, completeFromList(myCompletions as any)] }),
			closeBrackets(),
			oneDark,
			keymap.of([...defaultKeymap, indentWithTab]),
			EditorView.updateListener.of((update) => {
				if (update.docChanged && onChange) {
					onChange(update.state.doc.toString())
				}
			}),
			EditorView.theme({
				'&': { 
					height,
					fontSize: '13px',
					backgroundColor: '#282c34',
				},
				'.cm-scroller': { 
					overflow: 'auto',
					fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
					lineHeight: '1.6',
				},
				'.cm-content': { 
					padding: '12px 0',
					caretColor: '#528bff',
				},
				'.cm-line': {
					padding: '0 12px',
				},
				'.cm-activeLine': {
					backgroundColor: 'rgba(255, 255, 255, 0.05)',
				},
				'.cm-activeLineGutter': {
					backgroundColor: 'rgba(255, 255, 255, 0.05)',
				},
				'.cm-gutters': {
					backgroundColor: '#21252b',
					borderRight: '1px solid #181a1f',
					color: '#636d83',
					paddingRight: '8px',
					minWidth: '44px',
				},
				'.cm-lineNumbers .cm-gutterElement': {
					minWidth: '32px',
					textAlign: 'right',
					paddingRight: '8px',
				},
				'.cm-foldGutter': {
					width: '16px',
				},
				'.cm-cursor': {
					borderLeftColor: '#528bff',
					borderLeftWidth: '2px',
				},
				'.cm-selectionBackground, ::selection': {
					backgroundColor: 'rgba(82, 139, 255, 0.3)',
				},
				'&.cm-focused .cm-selectionBackground, &.cm-focused ::selection': {
					backgroundColor: 'rgba(82, 139, 255, 0.4)',
				},
				'.cm-matchingBracket': {
					backgroundColor: 'rgba(82, 139, 255, 0.2)',
					border: '1px solid #528bff',
					borderRadius: '2px',
				},
				'.cm-searchMatch': {
					backgroundColor: 'rgba(255, 191, 0, 0.2)',
				},
				'.cm-searchMatch.cm-searchMatch-selected': {
					backgroundColor: 'rgba(255, 128, 0, 0.3)',
				},
			}),
		]

		// 添加保存快捷键
		if (onSave) {
			extensions.push(
				keymap.of([
					{
						key: 'Mod-s',
						preventDefault: true,
						run: () => {
							onSave()
							return true
						},
					},
				])
			)
		}

		const state = EditorState.create({
			doc: value,
			extensions,
		})

		const view = new EditorView({
			state,
			parent: editorRef.current,
		})

		viewRef.current = view

		return () => {
			view.destroy()
			viewRef.current = null
		}
	}, [theme, height, onSave]) // 注意：value 和 onChange 不在依赖中，避免重建编辑器
	// 当外部 value 变化时,更新编辑器内容(但不触发 onChange)
	useEffect(() => {
		const view = viewRef.current
		if (!view) return

		const currentValue = view.state.doc.toString()
		if (currentValue !== value) {
			view.dispatch({
				changes: {
					from: 0,
					to: currentValue.length,
					insert: value,
				},
			})
		}
	}, [value])

	return <div ref={editorRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} />
})
