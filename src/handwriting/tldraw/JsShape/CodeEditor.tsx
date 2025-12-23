import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import { keymap } from '@codemirror/view'
import { indentWithTab, defaultKeymap, undo, redo, indentSelection } from '@codemirror/commands'
import { autocompletion, closeBrackets, completeFromList, snippetCompletion } from '@codemirror/autocomplete'
import { linter, Diagnostic } from '@codemirror/lint'
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
	setDiagnostics?: (diags: Diagnostic[]) => void
	setDiagnosticsFromLineCol?: (line: number, col: number, message: string) => void
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
	// external diagnostics shared between host and editor
	let externalDiagnostics: Diagnostic[] = []

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
		setDiagnostics: (diags: Diagnostic[]) => {
			if (viewRef.current) {
				externalDiagnostics = diags
				// request a measure to encourage re-linting
				try { viewRef.current.requestMeasure() } catch {}
			}
		},
		setDiagnosticsFromLineCol: (line: number, col: number, message: string) => {
			if (!viewRef.current) return
			const doc = viewRef.current.state.doc
			const safeLine = Math.max(1, Math.floor(line))
			const safeCol = Math.max(1, Math.floor(col))
			const lineInfo = doc.line(safeLine)
			const from = Math.max(lineInfo.from + safeCol - 1, lineInfo.from)
			const to = Math.min(from + 1, lineInfo.to)
			externalDiagnostics = [{ from, to, severity: 'error', message, source: 'Runtime' }]
			try { viewRef.current.requestMeasure() } catch {}
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
			snippetCompletion('console.debug(${1:obj})', { label: 'console.debug', type: 'keyword', detail: 'console.debug' }),
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

		let domFields = [
			{ label: 'innerHTML', type: 'property', detail: 'string', info: 'element.innerHTML' },
			{ label: 'textContent', type: 'property', detail: 'string', info: 'element.textContent' },
			{ label: 'appendChild', type: 'function', detail: 'appendChild(node)', info: 'Append a child node' },
			{ label: 'removeChild', type: 'function', detail: 'removeChild(node)', info: 'Remove a child node' },
			{ label: 'querySelector', type: 'function', detail: 'querySelector(selector)', info: 'Find first matching element' },
			{ label: 'querySelectorAll', type: 'function', detail: 'querySelectorAll(selector)', info: 'Find all matching elements' },
			{ label: 'createElement', type: 'function', detail: 'createElement(tag)', info: 'Create a new element (document.createElement)' },
			{ label: 'addEventListener', type: 'function', detail: 'addEventListener(type, handler)', info: 'Add event listener' },
			{ label: 'removeEventListener', type: 'function', detail: 'removeEventListener(type, handler)', info: 'Remove event listener' },
			{ label: 'classList', type: 'property', detail: 'DOMTokenList', info: 'element.classList' },
			{ label: 'style', type: 'property', detail: 'CSSStyleDeclaration', info: 'element.style' },
			{ label: 'setAttribute', type: 'function', detail: 'setAttribute(name, value)', info: 'Set attribute' },
			{ label: 'getAttribute', type: 'function', detail: 'getAttribute(name)', info: 'Get attribute' },
			{ label: 'dataset', type: 'property', detail: 'DOMStringMap', info: 'data-* attributes' },
			{ label: 'children', type: 'property', detail: 'HTMLCollection', info: 'Child elements' },
			{ label: 'parentElement', type: 'property', detail: 'Element | null', info: 'Parent element' },
			{ label: 'append', type: 'function', detail: 'append(...nodesOrStrings)', info: 'Append nodes or strings' },
			{ label: 'prepend', type: 'function', detail: 'prepend(...nodesOrStrings)', info: 'Prepend nodes or strings' },
			{ label: 'replaceChildren', type: 'function', detail: 'replaceChildren(...nodesOrStrings)', info: 'Replace children' },
			{ label: 'cloneNode', type: 'function', detail: 'cloneNode(deep)', info: 'Clone node' },
			{ label: 'dispatchEvent', type: 'function', detail: 'dispatchEvent(event)', info: 'Dispatch event' },
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
			// also parse any completions provided for dom.* into domFields
			const extrasForDom = (extraCompletions || [])
				.filter((it: any) => typeof it.label === 'string' && it.label.startsWith('dom.'))
				.map((it: any) => ({ ...it, label: String((it.label as string).slice('dom.'.length)) }))
			if (extrasForDom.length) {
				domFields = [...domFields, ...extrasForDom]
			}
		} catch (e) {}

		// JS syntax linter — try to parse code with Function to catch syntax errors
		const syntaxLinter = linter((view) => {
			const code = view.state.doc.toString()
			try {
				// Passing param names only to parse, not execute
				// eslint-disable-next-line no-new-func
				new Function('api', 'env', `'use strict'\n${code}`)
				return []
			} catch (err: any) {
				const message = err?.message || String(err)
				// try to extract line/col from message like '(1:10)' or 'Line 1:10'
				let line = 1
				let col = 1
				const match = message.match(/\((\d+):(\d+)\)/) || message.match(/Line (\d+):(\d+)/)
				if (match) {
					line = Number(match[1])
					col = Number(match[2])
				}
				const doc = view.state.doc
				const lineInfo = doc.line(line)
				const from = Math.max(lineInfo.from + col - 1, lineInfo.from)
				const to = Math.min(from + 1, lineInfo.to)
				const d: Diagnostic = {
					from,
					to,
					severity: 'error',
					message,
					source: 'Syntax',
				}
				return [d]
			}
		})

		// external diagnostics (e.g. runtime errors) can be set by the host
		// (value stored in outer-scope `externalDiagnostics`)
		const externalLinter = linter(() => externalDiagnostics)

		const apiEnvCompletionSource: CompletionSource = (context) => {
			// match longer sequences like `api.shape.props.data.`
			const m = context.matchBefore(/(?:api|env)(?:\.[\w$]+)*\.?/)
			if (!m) return null
			const text = m.text
			const dotIndex = text.lastIndexOf('.')
			const from = m.from + dotIndex + 1
			// if user typed `api.shape.props.data.` provide nested data fields
			if (/\b(?:api|env)\.shape\.props\.data\./.test(text)) {
				// suggest keys inside shape.props.data
				const innerDotIndex = text.lastIndexOf('.')
				const innerFrom = m.from + innerDotIndex + 1
				return { from: innerFrom, options: dataFields, validFor: /^\w*$/ }
			}

            
			// if user typed `api.shape.` provide nested shape fields
			if (/\b(?:api|env)\.shape\./.test(text)) {
				const innerDotIndex = text.lastIndexOf('.')
				const innerFrom = m.from + innerDotIndex + 1
				return { from: innerFrom, options: shapeFields, validFor: /^\w*$/ }
			}
			// if user typed `api.dom.` or `env.dom.` provide dom fields
			if (/\b(?:api|env)\.dom\./.test(text)) {
				const innerDotIndex = text.lastIndexOf('.')
				const innerFrom = m.from + innerDotIndex + 1
				return { from: innerFrom, options: domFields, validFor: /^\w*$/ }
			}
			return { from, options: scriptFields, validFor: /^\w*$/ }
		}

		const extensions = [
			basicSetup,
			javascript({ jsx: false, typescript: false }),
			// enable default autocompletion plus our custom provider
			autocompletion({ override: [apiEnvCompletionSource, completeFromList(myCompletions as any)] }),
			// add syntax linter
			syntaxLinter,
			// add external diagnostic linter (for runtime errors passed from host)
			externalLinter,
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
