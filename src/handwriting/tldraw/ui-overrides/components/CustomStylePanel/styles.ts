/**
 * 样式面板内联 CSS 样式
 */
export const stylePanelStyles = `
    .connector-width-input {
        color: var(--color-text);
        background: var(--b3-theme-surface);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        box-shadow: inset 0 1px 2px rgba(0,0,0,0.04);
        height: 32px;
        width: 77px;
        text-align: right;
        padding: 0 8px;
        box-sizing: border-box;
    }
    .connector-width-input::placeholder {
        color: var(--color-text-muted);
        opacity: 1;
    }
    /* 移除 number input 的上下微调按钮 */
    .connector-width-input::-webkit-outer-spin-button,
    .connector-width-input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }
    /* Firefox */
    .connector-width-input {
        -moz-appearance: textfield;
    }
    @media (prefers-color-scheme: light) {
        .connector-width-input::placeholder {
            color: rgba(0,0,0,0.45);
        }
    }
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
`
