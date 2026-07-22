/**
 * 样式面板内联 CSS 样式
 */
export const stylePanelStyles = `
	/* Keep custom controls on the same metrics as tldraw's native style panel. */
	.tlui-style-panel .tlui-custom-button-row,
	.tlui-style-panel .tlui-toggle-button-row {
		display: flex;
		width: 100%;
		gap: 0;
	}

	.tlui-style-panel .tlui-custom-button-row > .tlui-button,
	.tlui-style-panel .tlui-toggle-button-row > .tlui-button {
		flex: 1 1 0;
		min-width: 0;
		padding-left: 0;
		padding-right: 0;
	}
	.tlui-style-panel .tlui-custom-panel-group {
		display: flex;
		flex-direction: column;
		width: 100%;
	}
	.tlui-style-panel .tlui-custom-panel-note {
		padding: var(--tl-space-3) var(--tl-space-4);
		color: var(--tl-color-text-3);
		font-size: 12px;
		line-height: 1.35;
		word-break: break-word;
	}

	/* Native tldraw selected controls use the button's hint layer, rather than a
	 * solid custom background or a font-weight change. */
	.tlui-style-panel .tlui-toggle-button--active::after {
		background: var(--tl-color-hint);
		opacity: 1;
	}
	.tlui-style-panel .tlui-toggle-button--active,
	.tlui-style-panel .tlui-toggle-button--active:hover {
		color: var(--tl-color-text-1);
		font-weight: inherit;
	}
	.tlui-style-panel .tlui-toggle-button--mixed {
		opacity: 0.55;
	}

	/* Inputs intentionally retain tldraw's 44px wrapper height and its own
	 * hover/focus treatment.  The previous 40px override made text controls
	 * visibly shorter than native dropdowns and sliders. */
	.tlui-style-panel .tlui-input__wrapper {
		position: relative;
		height: 44px;
		padding: 0 var(--tl-space-4);
	}
	.tlui-style-panel .tlui-input__wrapper::after {
		content: '';
		position: absolute;
		inset: 4px;
		border-radius: var(--tl-radius-2);
		background: var(--tl-color-muted-2);
		opacity: 0;
		pointer-events: none;
	}
	.tlui-style-panel .tlui-input__wrapper:hover::after,
	.tlui-style-panel .tlui-input__wrapper:focus-within::after {
		opacity: 1;
	}
	.tlui-style-panel .tlui-input__wrapper > * {
		position: relative;
		z-index: var(--tl-layer-above);
	}
	.tlui-style-panel .slide-name-input {
		padding-left: 0;
		padding-right: 0;
	}

	/* Color inputs are rendered as the same compact low-contrast control used by
	 * tldraw's native pickers. */
	.tlui-style-panel .connector-color-input {
		width: 40px;
		height: 40px;
		padding: 12px;
		border: 0;
		border-radius: var(--tl-radius-2);
		background: transparent;
		box-sizing: border-box;
	}
	.tlui-style-panel .connector-color-input:hover {
		background: var(--tl-color-muted-2);
	}
	.tlui-style-panel .connector-color-input::-webkit-color-swatch-wrapper { padding: 0; }
	.tlui-style-panel .connector-color-input::-webkit-color-swatch {
		border: 1px solid var(--tl-color-divider);
		border-radius: var(--tl-radius-1);
	}
	.tlui-style-panel .connector-color-input::-moz-color-swatch {
		border: 1px solid var(--tl-color-divider);
		border-radius: var(--tl-radius-1);
	}
`
