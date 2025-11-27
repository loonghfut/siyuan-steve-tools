import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { keymap } from '@codemirror/view'
import { indentWithTab, defaultKeymap, undo, redo, indentSelection } from '@codemirror/commands'
import { autocompletion, closeBrackets } from '@codemirror/autocomplete'
import { openSearchPanel, closeSearchPanel } from '@codemirror/search'

interface CodeEditorProps {
	value: string
	onChange?: (value: string) => void
	onSave?: () => void
	theme?: 'light' | 'dark'
	height?: string
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

		const extensions = [
			basicSetup,
			javascript({ jsx: false, typescript: false }),
			autocompletion(),
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
