/**
 * 样式面板内联 CSS 样式
 */
export const stylePanelStyles = `
	/* Color input: remove native swatch background/padding */
    .connector-color-input {
        background: transparent;
        padding: 0;
        height: 20px;
        width: 48px;
        border-radius: 4px;
        border: 1px solid var(--color-border);
        box-sizing: border-box;
    }
    .connector-color-input::-webkit-color-swatch-wrapper {
        padding: 0;
    }
    .connector-color-input::-webkit-color-swatch {
        border: none;
        background: transparent;
        border-radius: 4px;
    }
    /* Firefox */
    .connector-color-input::-moz-color-swatch {
        border: none;
        background: transparent;
        border-radius: 4px;
    }
    /* Toggle button row */
    .tlui-toggle-button-row {
        display: flex;
        gap: 0px;
    }
    .tlui-toggle-button {
        flex: 1 1 0;
        min-width: 0;
        font-weight: 400;
        color: var(--color-text);
    }
    .tlui-toggle-button--active {
        font-weight: 700;
        color: var(--b3-theme-on-surface, var(--color-text));
        background: var(--tl-color-muted-2);
    }
    .tlui-toggle-button--mixed {
        opacity: 0.8;
    }
    .tlui-toggle-icon {
        font-size: 16px;
        line-height: 1;
        display: inline-block;
        transform: translateY(-1px);
    }
    /* Style panel text input: align with native tlui-button metrics (40px row, 12px inset) */
    .tlui-style-panel__section > .tlui-input__wrapper {
        position: relative;
        height: 40px;
        padding: 0 var(--tl-space-4);
    }
    /* Hover/focus feedback mirrors .tlui-button::after (inset 4px, radius-2, muted bg) */
    .tlui-style-panel__section > .tlui-input__wrapper::after {
        content: '';
        position: absolute;
        inset: 4px;
        border-radius: var(--tl-radius-2);
        background: var(--tl-color-muted-2);
        opacity: 0;
        pointer-events: none;
    }
    .tlui-style-panel__section > .tlui-input__wrapper:hover::after,
    .tlui-style-panel__section > .tlui-input__wrapper:focus-within::after {
        opacity: 1;
    }
    .tlui-style-panel__section .slide-name-input {
        padding: 0;
    }
`
