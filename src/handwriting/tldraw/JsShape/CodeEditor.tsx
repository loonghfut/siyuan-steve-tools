import React, { useEffect, useRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { keymap } from '@codemirror/view'
import { indentWithTab, defaultKeymap } from '@codemirror/commands'
import { autocompletion, closeBrackets } from '@codemirror/autocomplete'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { HighlightStyle, tags as t } from '@codemirror/highlight'

interface CodeEditorProps {
	value: string
	onChange?: (value: string) => void
	onSave?: () => void
	theme?: 'light' | 'dark' | 'high-contrast'
	height?: string
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
	value,
	onChange,
	onSave,
	theme = 'light',
	height = '100%',
}) => {
	const editorRef = useRef<HTMLDivElement>(null)
	const viewRef = useRef<EditorView | null>(null)

	useEffect(() => {
		if (!editorRef.current) return

		const extensions: any[] = [
			basicSetup,
			javascript({ jsx: false, typescript: false }),
			autocompletion(),
			closeBrackets(),
			syntaxHighlighting(defaultHighlightStyle),
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
				},
				'.cm-scroller': { 
					overflow: 'auto',
					fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
					lineHeight: '1.6',
				},
				'.cm-content': { 
					padding: '12px 0',
					caretColor: theme === 'dark' ? '#528bff' : '#0969da',
				},
				'.cm-line': {
					padding: '0 12px',
				},
				'.cm-activeLine': {
					backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
				},
				'.cm-activeLineGutter': {
					backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
				},
				'.cm-gutters': {
					backgroundColor: theme === 'dark' ? '#1e1e1e' : '#f6f8fa',
					borderRight: `1px solid ${theme === 'dark' ? '#333' : '#e1e4e8'}`,
					color: theme === 'dark' ? '#6e7681' : '#57606a',
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
					borderLeftColor: theme === 'dark' ? '#528bff' : '#0969da',
					borderLeftWidth: '2px',
				},
				'.cm-selectionBackground, ::selection': {
					backgroundColor: theme === 'dark' ? 'rgba(82, 139, 255, 0.3)' : 'rgba(9, 105, 218, 0.15)',
				},
				'&.cm-focused .cm-selectionBackground, &.cm-focused ::selection': {
					backgroundColor: theme === 'dark' ? 'rgba(82, 139, 255, 0.4)' : 'rgba(9, 105, 218, 0.2)',
				},
				'.cm-matchingBracket': {
					backgroundColor: theme === 'dark' ? 'rgba(82, 139, 255, 0.2)' : 'rgba(9, 105, 218, 0.1)',
					border: `1px solid ${theme === 'dark' ? '#528bff' : '#0969da'}`,
					borderRadius: '2px',
				},
				'.cm-searchMatch': {
					backgroundColor: theme === 'dark' ? 'rgba(255, 191, 0, 0.2)' : 'rgba(255, 191, 0, 0.3)',
				},
				'.cm-searchMatch.cm-searchMatch-selected': {
					backgroundColor: theme === 'dark' ? 'rgba(255, 128, 0, 0.3)' : 'rgba(255, 128, 0, 0.4)',
				},
			}),
		]

		// 高对比度模式：自定义高对比度高亮与主题
		const highContrastHighlight = HighlightStyle.define([
			{ tag: t.keyword, color: '#ffcc00', fontWeight: '700' }, // 黄金色
			{ tag: [t.name, t.variableName], color: '#ffffff' },
			{ tag: [t.string, t.character, t.special(t.string)], color: '#00ff7f' }, // 亮绿色
			{ tag: [t.number, t.bool, t.null], color: '#ff7b00' }, // 橙色
			{ tag: t.comment, color: '#9aa4b2', fontStyle: 'italic' },
			{ tag: [t.function(t.variableName)], color: '#59c2ff' }, // 亮蓝
			{ tag: t.operator, color: '#ffd7ff' },
			{ tag: t.punctuation, color: '#ffffff' },
		])

		if (theme === 'dark') {
			extensions.push(oneDark)
		} else if (theme === 'high-contrast') {
			// 强制使用黑色背景与高对比度配色
			extensions.push(
				// TS type mismatch on some versions; ensure highlight style is accepted
				syntaxHighlighting(highContrastHighlight as any),
				EditorView.theme({
					'&': { backgroundColor: '#000', color: '#fff' },
					'.cm-scroller': { backgroundColor: '#000' },
					'.cm-gutters': { backgroundColor: '#000', color: '#fff' },
					'.cm-line': { color: '#fff' },
				})
			)
		}

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

	// 当外部 value 变化时，更新编辑器内容（但不触发 onChange）
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
}
