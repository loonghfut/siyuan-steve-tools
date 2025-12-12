/**
 * SingleBlock 数据库属性显示和编辑管理
 * 提供数据库属性的获取、显示和内联编辑功能
 */

import React, { useEffect, useState, useCallback } from 'react'
import { showMessage } from 'siyuan'
import { getDatabaseAttributesForBlock, DatabaseAttributeEntry, DatabaseAttributeOptions } from '@/api/database-attributes'
import { AVManager } from '@/api/db_pro'
import { setAttributeViewValue } from '@/api/db_interface'

// ============== 类型定义 ==============

export interface DbAttributeDisplayProps {
	blockId: string
	themeColor: {
		solid: string
		semi: string
	}
	shapeWidth: number
	refreshNonce?: number
	onRefresh?: () => void
}

export interface InlineEditOptions {
	element: HTMLElement
	avID: string
	blockID: string
	keyID: string
	keyName: string
	keyType: string
	currentValue: any
	selectOptions?: any[]
	onSave?: (newValue: any) => void
	onCancel?: () => void
}

// ============== 值转换函数 ==============

/**
 * 将用户输入转换为 API 需要的值格式
 */
export function convertToAVValue(keyType: string, value: any): setAttributeViewValue {
	switch (keyType) {
		case 'text':
			return { text: { content: String(value || '') } }

		case 'number':
			if (value && typeof value === 'object') {
				const content = Number(value.content ?? 0)
				return { number: { content } }
			}
			const numContent = Number(value) || 0
			return { number: { content: numContent } }

		case 'date':
			if (value && typeof value === 'object') {
				const content = Number(value.content ?? 0)
				const hasEndDate = Boolean(value.hasEndDate)
				const content2 = hasEndDate ? Number(value.content2 ?? 0) : undefined
				return {
					date: {
						content,
						isNotTime: Boolean(value.isNotTime) || false,
						hasEndDate,
						content2,
					},
				}
			}
			return { date: { content: Number(value ?? 0), isNotTime: false } }

		case 'url':
			return { url: { content: String(value || '') } }

		case 'email':
			return { email: { content: String(value || '') } }

		case 'phone':
			return { phone: { content: String(value || '') } }

		case 'checkbox':
			return { checkbox: { checked: Boolean(value) } }

		case 'select':
			return { mSelect: value ? [{ content: String(value), color: '' }] : [] }

		case 'mSelect':
			const values = Array.isArray(value) ? value : [value]
			return {
				mSelect: values.filter((v) => v).map((v) => ({
					content: String(v),
					color: '',
				})),
			}

		default:
			return { text: { content: String(value || '') } }
	}
}

// ============== 编辑器实现 ==============

/**
 * 解析原始值用于编辑
 */
function parseRawValueForEdit(rawValue: any, keyType: string): any {
	if (!rawValue) return null

	// rawValue 通常是数组格式 [{ checkbox: { checked: true } }]
	const firstValue = Array.isArray(rawValue) ? rawValue[0] : rawValue

	switch (keyType) {
		case 'checkbox':
			return firstValue?.checkbox?.checked ?? false
		case 'date':
		case 'created':
		case 'updated':
			return firstValue?.date ?? firstValue?.created ?? firstValue?.updated ?? null
		case 'number':
			return firstValue?.number?.content ?? null
		case 'text':
			return firstValue?.text?.content ?? ''
		case 'url':
			return firstValue?.url?.content ?? ''
		case 'email':
			return firstValue?.email?.content ?? ''
		case 'phone':
			return firstValue?.phone?.content ?? ''
		case 'select':
			return firstValue?.mSelect?.[0]?.content ?? firstValue?.select?.content ?? ''
		case 'mSelect':
			const mSelectValues = firstValue?.mSelect
			if (Array.isArray(mSelectValues)) {
				return mSelectValues.map((v: any) => v.content)
			}
			return []
		default:
			return firstValue?.text?.content ?? ''
	}
}

/**
 * 时间戳转 datetime-local 格式
 */
function timestampToDateInput(timestamp: number | null | undefined): string {
	if (!timestamp) return ''
	const ts = timestamp > 10000000000 ? timestamp : timestamp * 1000
	const date = new Date(ts)
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	const hours = String(date.getHours()).padStart(2, '0')
	const minutes = String(date.getMinutes()).padStart(2, '0')
	return `${year}-${month}-${day}T${hours}:${minutes}`
}

/**
 * 定位弹窗/下拉菜单
 */
function positionPopup(popup: HTMLElement, anchor: HTMLElement) {
	const rect = anchor.getBoundingClientRect()
	const popupRect = popup.getBoundingClientRect()
	
	let left = rect.left
	let top = rect.bottom + 4
	
	// 防止超出视口右边
	if (left + popupRect.width > window.innerWidth - 10) {
		left = window.innerWidth - popupRect.width - 10
	}
	// 防止超出视口底部
	if (top + popupRect.height > window.innerHeight - 10) {
		top = rect.top - popupRect.height - 4
	}
	
	popup.style.left = `${Math.max(10, left)}px`
	popup.style.top = `${Math.max(10, top)}px`
}

/**
 * 创建编辑弹窗的基础样式
 */
function createPopupStyles(): string {
	return `
		position: fixed;
		z-index: 999999;
		background: var(--b3-theme-surface, #fff);
		border: 1px solid var(--b3-border-color, #ddd);
		border-radius: 8px;
		box-shadow: 0 4px 16px rgba(0,0,0,0.15);
		padding: 8px;
		font-size: 13px;
		min-width: 150px;
	`
}

/**
 * 启动内联编辑
 */
export async function enableInlineEdit(options: InlineEditOptions) {
	const { keyType } = options

	// created 和 updated 字段不允许编辑
	if (['created', 'updated'].includes(keyType)) {
		showMessage('此字段不可编辑', 2000, 'info')
		return
	}

	switch (keyType) {
		case 'checkbox':
			await handleCheckboxEdit(options)
			break
		case 'select':
			handleSelectEdit(options)
			break
		case 'mSelect':
			handleMultiSelectEdit(options)
			break
		case 'date':
			handleDateEdit(options)
			break
		default:
			handlePopupEdit(options)
			break
	}
}

/**
 * 复选框编辑 - 直接切换
 */
async function handleCheckboxEdit(options: InlineEditOptions) {
	const { avID, blockID, keyName, currentValue, onSave } = options
	const parsedValue = parseRawValueForEdit(currentValue, 'checkbox')
	const newValue = !parsedValue

	try {
		const avManager = new AVManager()
		const mapping = await avManager.getItemIDsByBoundIDs(avID, [blockID])
		const itemID = mapping[blockID]

		if (!itemID) {
			showMessage('无法获取行ID', 3000, 'error')
			return
		}

		const value = convertToAVValue('checkbox', newValue)
		await avManager.setBlockAttribute(avID, keyName, itemID, value, blockID)
		showMessage('保存成功', 1500, 'info')

		if (onSave) {
			onSave(newValue)
		}
	} catch (error) {
		console.error('保存失败:', error)
		showMessage('保存失败', 3000, 'error')
	}
}

/**
 * 单选下拉菜单
 */
function handleSelectEdit(options: InlineEditOptions) {
	const { element, avID, blockID, keyName, currentValue, selectOptions, onSave, onCancel } = options
	const parsedValue = parseRawValueForEdit(currentValue, 'select')

	// 移除已存在的弹窗
	document.querySelectorAll('.sb-inline-edit-dropdown').forEach((el) => el.remove())

	const dropdown = document.createElement('div')
	dropdown.className = 'sb-inline-edit-dropdown'
	dropdown.style.cssText = createPopupStyles()

	// 添加空选项（清除值）
	const emptyOption = createDropdownOption('', '（清除）', parsedValue === '')
	dropdown.appendChild(emptyOption)

	// 添加备选项
	;(selectOptions || []).forEach((option: any) => {
		const optionId = option.name || option.content || option.id || ''
		const optionText = option.name || option.content || option.id || ''
		const isSelected = optionId === parsedValue
		const optionElement = createDropdownOption(optionId, optionText, isSelected, option.color)
		dropdown.appendChild(optionElement)
	})

	document.body.appendChild(dropdown)
	positionPopup(dropdown, element)

	// 点击选项保存
	const handleClick = async (e: MouseEvent) => {
		const target = e.target as HTMLElement
		const optionElement = target.closest('.sb-dropdown-option') as HTMLElement
		if (optionElement) {
			const value = optionElement.dataset.value || ''

			try {
				const avManager = new AVManager()
				const mapping = await avManager.getItemIDsByBoundIDs(avID, [blockID])
				const itemID = mapping[blockID]

				if (!itemID) {
					showMessage('无法获取行ID', 3000, 'error')
					dropdown.remove()
					return
				}

				const avValue = convertToAVValue('select', value)
				await avManager.setBlockAttribute(avID, keyName, itemID, avValue, blockID)

				dropdown.remove()
				showMessage('保存成功', 1500, 'info')

				if (onSave) onSave(value)
			} catch (error) {
				console.error('保存失败:', error)
				showMessage('保存失败', 3000, 'error')
				dropdown.remove()
			}
		}
	}

	dropdown.addEventListener('click', handleClick)

	// 点击外部关闭
	const handleOutsideClick = (e: MouseEvent) => {
		if (!dropdown.contains(e.target as Node) && e.target !== element) {
			dropdown.remove()
			document.removeEventListener('click', handleOutsideClick)
			if (onCancel) onCancel()
		}
	}
	setTimeout(() => document.addEventListener('click', handleOutsideClick), 10)
}

/**
 * 多选下拉菜单
 */
function handleMultiSelectEdit(options: InlineEditOptions) {
	const { element, avID, blockID, keyName, currentValue, selectOptions, onSave, onCancel } = options
	const parsedValue = parseRawValueForEdit(currentValue, 'mSelect')
	const selectedValues = new Set<string>(Array.isArray(parsedValue) ? parsedValue : [])

	document.querySelectorAll('.sb-inline-edit-dropdown').forEach((el) => el.remove())

	const dropdown = document.createElement('div')
	dropdown.className = 'sb-inline-edit-dropdown'
	dropdown.style.cssText = createPopupStyles() + 'max-height: 250px; overflow-y: auto;'

	// 添加备选项
	;(selectOptions || []).forEach((option: any) => {
		const optionId = option.name || option.content || option.id || ''
		const optionText = option.name || option.content || option.id || ''
		const isSelected = selectedValues.has(optionId)

		const optionElement = document.createElement('div')
		optionElement.className = 'sb-dropdown-option'
		optionElement.style.cssText = `
			padding: 6px 10px;
			cursor: pointer;
			display: flex;
			align-items: center;
			gap: 6px;
			border-radius: 4px;
		`

		const checkbox = document.createElement('input')
		checkbox.type = 'checkbox'
		checkbox.checked = isSelected
		checkbox.style.cssText = 'margin: 0; cursor: pointer;'

		const label = document.createElement('span')
		label.textContent = optionText
		if (option.color) {
			label.style.cssText = `
				padding: 1px 6px;
				border-radius: 4px;
				background-color: ${option.color};
				color: #fff;
			`
		}

		optionElement.appendChild(checkbox)
		optionElement.appendChild(label)
		dropdown.appendChild(optionElement)

		optionElement.addEventListener('click', (e) => {
			e.stopPropagation()
			checkbox.checked = !checkbox.checked
			if (checkbox.checked) {
				selectedValues.add(optionId)
			} else {
				selectedValues.delete(optionId)
			}
		})
	})

	// 保存按钮
	const buttonContainer = document.createElement('div')
	buttonContainer.style.cssText = 'display: flex; gap: 8px; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--b3-border-color, #eee);'

	const saveButton = document.createElement('button')
	saveButton.textContent = '保存'
	saveButton.style.cssText = `
		flex: 1;
		padding: 6px 12px;
		border: none;
		border-radius: 4px;
		background: var(--b3-theme-primary, #4285f4);
		color: #fff;
		cursor: pointer;
		font-size: 12px;
	`
	saveButton.addEventListener('click', async () => {
		const values = Array.from(selectedValues)

		try {
			const avManager = new AVManager()
			const mapping = await avManager.getItemIDsByBoundIDs(avID, [blockID])
			const itemID = mapping[blockID]

			if (!itemID) {
				showMessage('无法获取行ID', 3000, 'error')
				dropdown.remove()
				return
			}

			const avValue = convertToAVValue('mSelect', values)
			await avManager.setBlockAttribute(avID, keyName, itemID, avValue, blockID)

			dropdown.remove()
			showMessage('保存成功', 1500, 'info')

			if (onSave) onSave(values)
		} catch (error) {
			console.error('保存失败:', error)
			showMessage('保存失败', 3000, 'error')
			dropdown.remove()
		}
	})

	const cancelButton = document.createElement('button')
	cancelButton.textContent = '取消'
	cancelButton.style.cssText = `
		flex: 1;
		padding: 6px 12px;
		border: 1px solid var(--b3-border-color, #ddd);
		border-radius: 4px;
		background: transparent;
		cursor: pointer;
		font-size: 12px;
	`
	cancelButton.addEventListener('click', () => {
		dropdown.remove()
		if (onCancel) onCancel()
	})

	buttonContainer.appendChild(saveButton)
	buttonContainer.appendChild(cancelButton)
	dropdown.appendChild(buttonContainer)

	document.body.appendChild(dropdown)
	positionPopup(dropdown, element)

	// 点击外部关闭
	const handleOutsideClick = (e: MouseEvent) => {
		if (!dropdown.contains(e.target as Node) && e.target !== element) {
			dropdown.remove()
			document.removeEventListener('click', handleOutsideClick)
			if (onCancel) onCancel()
		}
	}
	setTimeout(() => document.addEventListener('click', handleOutsideClick), 10)
}

/**
 * 日期编辑器
 */
function handleDateEdit(options: InlineEditOptions) {
	const { element, avID, blockID, keyName, currentValue, onSave, onCancel } = options
	const parsedValue = parseRawValueForEdit(currentValue, 'date')

	document.querySelectorAll('.sb-inline-edit-popup').forEach((el) => el.remove())

	const popup = document.createElement('div')
	popup.className = 'sb-inline-edit-popup'
	popup.style.cssText = createPopupStyles() + 'min-width: 200px;'

	// 开始时间输入
	const startLabel = document.createElement('div')
	startLabel.textContent = '开始时间'
	startLabel.style.cssText = 'font-size: 11px; color: var(--b3-theme-on-surface-light, #666); margin-bottom: 4px;'
	popup.appendChild(startLabel)

	const startInput = document.createElement('input')
	startInput.type = 'datetime-local'
	startInput.value = timestampToDateInput(parsedValue?.content)
	startInput.style.cssText = 'width: 100%; padding: 6px; border: 1px solid var(--b3-border-color, #ddd); border-radius: 4px; margin-bottom: 8px; box-sizing: border-box;'
	popup.appendChild(startInput)

	// 是否有结束时间
	const hasEndContainer = document.createElement('div')
	hasEndContainer.style.cssText = 'display: flex; align-items: center; gap: 6px; margin-bottom: 8px;'
	
	const hasEndCheckbox = document.createElement('input')
	hasEndCheckbox.type = 'checkbox'
	hasEndCheckbox.checked = Boolean(parsedValue?.hasEndDate)
	hasEndCheckbox.id = 'sb-has-end-date'
	
	const hasEndLabel = document.createElement('label')
	hasEndLabel.textContent = '有结束时间'
	hasEndLabel.htmlFor = 'sb-has-end-date'
	hasEndLabel.style.cssText = 'font-size: 12px; cursor: pointer;'
	
	hasEndContainer.appendChild(hasEndCheckbox)
	hasEndContainer.appendChild(hasEndLabel)
	popup.appendChild(hasEndContainer)

	// 结束时间输入
	const endInput = document.createElement('input')
	endInput.type = 'datetime-local'
	endInput.value = timestampToDateInput(parsedValue?.content2)
	endInput.style.cssText = `width: 100%; padding: 6px; border: 1px solid var(--b3-border-color, #ddd); border-radius: 4px; margin-bottom: 8px; box-sizing: border-box; display: ${hasEndCheckbox.checked ? 'block' : 'none'};`
	popup.appendChild(endInput)

	hasEndCheckbox.addEventListener('change', () => {
		endInput.style.display = hasEndCheckbox.checked ? 'block' : 'none'
	})

	// 按钮容器
	const buttonContainer = document.createElement('div')
	buttonContainer.style.cssText = 'display: flex; gap: 8px;'

	const saveButton = document.createElement('button')
	saveButton.textContent = '保存'
	saveButton.style.cssText = `
		flex: 1;
		padding: 6px 12px;
		border: none;
		border-radius: 4px;
		background: var(--b3-theme-primary, #4285f4);
		color: #fff;
		cursor: pointer;
		font-size: 12px;
	`
	saveButton.addEventListener('click', async () => {
		const startTs = startInput.value ? new Date(startInput.value).getTime() : null
		const hasEnd = hasEndCheckbox.checked
		const endTs = hasEnd && endInput.value ? new Date(endInput.value).getTime() : null

		try {
			const avManager = new AVManager()
			const mapping = await avManager.getItemIDsByBoundIDs(avID, [blockID])
			const itemID = mapping[blockID]

			if (!itemID) {
				showMessage('无法获取行ID', 3000, 'error')
				popup.remove()
				return
			}

			const avValue = convertToAVValue('date', {
				content: startTs,
				hasEndDate: hasEnd,
				content2: endTs,
				isNotTime: false,
			})

			await avManager.setBlockAttribute(avID, keyName, itemID, avValue, blockID)

			popup.remove()
			showMessage('保存成功', 1500, 'info')

			if (onSave) {
				onSave({ content: startTs, hasEndDate: hasEnd, content2: endTs })
			}
		} catch (error) {
			console.error('保存失败:', error)
			showMessage('保存失败', 3000, 'error')
			popup.remove()
		}
	})

	const cancelButton = document.createElement('button')
	cancelButton.textContent = '取消'
	cancelButton.style.cssText = `
		flex: 1;
		padding: 6px 12px;
		border: 1px solid var(--b3-border-color, #ddd);
		border-radius: 4px;
		background: transparent;
		cursor: pointer;
		font-size: 12px;
	`
	cancelButton.addEventListener('click', () => {
		popup.remove()
		if (onCancel) onCancel()
	})

	buttonContainer.appendChild(saveButton)
	buttonContainer.appendChild(cancelButton)
	popup.appendChild(buttonContainer)

	document.body.appendChild(popup)
	positionPopup(popup, element)
}

/**
 * 通用弹窗编辑器（文本、数字、URL等）
 */
function handlePopupEdit(options: InlineEditOptions) {
	const { element, avID, blockID, keyName, keyType, currentValue, onSave, onCancel } = options
	const parsedValue = parseRawValueForEdit(currentValue, keyType)

	document.querySelectorAll('.sb-inline-edit-popup').forEach((el) => el.remove())

	const popup = document.createElement('div')
	popup.className = 'sb-inline-edit-popup'
	popup.style.cssText = createPopupStyles() + 'min-width: 180px;'

	// 创建输入框
	let inputElement: HTMLInputElement

	switch (keyType) {
		case 'number':
			inputElement = document.createElement('input')
			inputElement.type = 'number'
			inputElement.value = String(parsedValue ?? '')
			break
		case 'url':
			inputElement = document.createElement('input')
			inputElement.type = 'url'
			inputElement.value = String(parsedValue || '')
			inputElement.placeholder = 'https://'
			break
		case 'email':
			inputElement = document.createElement('input')
			inputElement.type = 'email'
			inputElement.value = String(parsedValue || '')
			inputElement.placeholder = 'email@example.com'
			break
		case 'phone':
			inputElement = document.createElement('input')
			inputElement.type = 'tel'
			inputElement.value = String(parsedValue || '')
			break
		default:
			inputElement = document.createElement('input')
			inputElement.type = 'text'
			inputElement.value = String(parsedValue || '')
			break
	}

	inputElement.style.cssText = 'width: 100%; padding: 8px; border: 1px solid var(--b3-border-color, #ddd); border-radius: 4px; margin-bottom: 8px; box-sizing: border-box;'
	popup.appendChild(inputElement)

	// 按钮容器
	const buttonContainer = document.createElement('div')
	buttonContainer.style.cssText = 'display: flex; gap: 8px;'

	const saveButton = document.createElement('button')
	saveButton.textContent = '保存'
	saveButton.style.cssText = `
		flex: 1;
		padding: 6px 12px;
		border: none;
		border-radius: 4px;
		background: var(--b3-theme-primary, #4285f4);
		color: #fff;
		cursor: pointer;
		font-size: 12px;
	`

	const doSave = async () => {
		let newValue: any = inputElement.value

		// 特殊处理数字
		if (keyType === 'number') {
			const isNotEmpty = inputElement.value.trim() !== ''
			newValue = { content: Number(newValue) || 0, isNotEmpty }
		}

		try {
			const avManager = new AVManager()
			const mapping = await avManager.getItemIDsByBoundIDs(avID, [blockID])
			const itemID = mapping[blockID]

			if (!itemID) {
				showMessage('无法获取行ID', 3000, 'error')
				popup.remove()
				return
			}

			const avValue = convertToAVValue(keyType, newValue)
			await avManager.setBlockAttribute(avID, keyName, itemID, avValue, blockID)

			popup.remove()
			showMessage('保存成功', 1500, 'info')

			if (onSave) onSave(newValue)
		} catch (error) {
			console.error('保存失败:', error)
			showMessage('保存失败', 3000, 'error')
			popup.remove()
		}
	}

	saveButton.addEventListener('click', doSave)

	const cancelButton = document.createElement('button')
	cancelButton.textContent = '取消'
	cancelButton.style.cssText = `
		flex: 1;
		padding: 6px 12px;
		border: 1px solid var(--b3-border-color, #ddd);
		border-radius: 4px;
		background: transparent;
		cursor: pointer;
		font-size: 12px;
	`
	cancelButton.addEventListener('click', () => {
		popup.remove()
		if (onCancel) onCancel()
	})

	// 键盘快捷键
	inputElement.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault()
			doSave()
		} else if (e.key === 'Escape') {
			e.preventDefault()
			popup.remove()
			if (onCancel) onCancel()
		}
	})

	buttonContainer.appendChild(saveButton)
	buttonContainer.appendChild(cancelButton)
	popup.appendChild(buttonContainer)

	document.body.appendChild(popup)
	positionPopup(popup, element)

	// 聚焦并选中
	setTimeout(() => {
		inputElement.focus()
		inputElement.select()
	}, 10)
}

/**
 * 创建下拉选项元素
 */
function createDropdownOption(value: string, text: string, isSelected: boolean, color?: string): HTMLElement {
	const option = document.createElement('div')
	option.className = 'sb-dropdown-option'
	option.dataset.value = value
	option.style.cssText = `
		padding: 6px 10px;
		cursor: pointer;
		border-radius: 4px;
		background: ${isSelected ? 'var(--b3-theme-primary-lightest, #e3f2fd)' : 'transparent'};
	`

	if (color && text !== '（清除）') {
		const colorBadge = document.createElement('span')
		colorBadge.textContent = text
		colorBadge.style.cssText = `
			padding: 1px 6px;
			border-radius: 4px;
			background-color: ${color};
			color: #fff;
			font-size: 12px;
		`
		option.appendChild(colorBadge)
	} else {
		option.textContent = text
	}

	option.addEventListener('mouseenter', () => {
		option.style.background = 'var(--b3-list-hover, #f5f5f5)'
	})
	option.addEventListener('mouseleave', () => {
		option.style.background = isSelected ? 'var(--b3-theme-primary-lightest, #e3f2fd)' : 'transparent'
	})

	return option
}

// ============== React 组件 ==============

/**
 * 数据库属性显示和编辑组件
 */
export function DbAttributeBar(props: DbAttributeDisplayProps) {
	const { blockId, themeColor, shapeWidth, refreshNonce, onRefresh } = props
	const [dbAttributes, setDbAttributes] = useState<DatabaseAttributeEntry[]>([])

	// 加载数据库属性
	useEffect(() => {
		if (!blockId) {
			setDbAttributes([])
			return
		}

		let cancelled = false
		const options: DatabaseAttributeOptions = {
			maxEntries: 6,
			forceRefresh: refreshNonce !== undefined,
		}

		getDatabaseAttributesForBlock(blockId, options)
			.then((attrs) => {
				if (!cancelled) {
					setDbAttributes(attrs)
				}
			})
			.catch(() => {
				if (!cancelled) {
					setDbAttributes([])
				}
			})

		return () => {
			cancelled = true
		}
	}, [blockId, refreshNonce])

	// 处理属性点击编辑
	const handleAttrClick = useCallback(
		async (e: React.MouseEvent<HTMLSpanElement>, attr: DatabaseAttributeEntry) => {
			e.preventDefault()
			e.stopPropagation()
            console.log('attr', attr)
			const element = e.currentTarget as HTMLElement

			// 获取选项列表（用于 select/mSelect）
			let selectOptions: any[] | undefined
			if (attr.keyType === 'select' || attr.keyType === 'mSelect') {
				try {
					const avManager = new AVManager()
					const keys = await avManager.getAttributeViewKeysByAvID(attr.avID)
					const keyInfo = keys.find((k: any) => k.id === attr.keyID)
					selectOptions = keyInfo?.options || []
				} catch {
					selectOptions = []
				}
			}

			enableInlineEdit({
				element,
				avID: attr.avID,
				blockID: blockId,
				keyID: attr.keyID,
				keyName: attr.keyName,
				keyType: attr.keyType,
				currentValue: attr.rawValue,
				selectOptions,
				onSave: () => {
					// 刷新属性显示
					if (onRefresh) {
						onRefresh()
					} else {
						// 重新加载属性
						getDatabaseAttributesForBlock(blockId, { forceRefresh: true })
							.then((attrs) => setDbAttributes(attrs))
							.catch(() => {})
					}
				},
			})
		},
		[blockId, onRefresh]
	)

	if (dbAttributes.length === 0) {
		return null
	}

	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: '4px',
				padding: '2px 6px',
				backgroundColor: themeColor.semi,
				borderRadius: '8px',
				boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
				pointerEvents: 'auto',
				whiteSpace: 'nowrap',
				overflow: 'hidden',
				maxWidth: `${Math.max(shapeWidth - 30, 100)}px`,
			}}
		>
			{dbAttributes.map((attr, idx) => (
				<span
					key={`${attr.keyID}-${idx}`}
					onClick={(e) => handleAttrClick(e, attr)}
					style={{
						fontSize: '10px',
						lineHeight: '14px',
						color: themeColor.solid,
						padding: '1px 4px',
						backgroundColor: 'rgba(255,255,255,0.5)',
						borderRadius: '4px',
						maxWidth: '80px',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						cursor: ['created', 'updated'].includes(attr.keyType) ? 'default' : 'pointer',
					}}
					title={`${attr.keyName}: ${attr.text}${['created', 'updated'].includes(attr.keyType) ? '' : ' (点击编辑)'}`}
				>
					{attr.text}
				</span>
			))}
		</div>
	)
}
