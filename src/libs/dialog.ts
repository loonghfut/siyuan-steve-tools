/*
 * Copyright (c) 2024 by frostime. All Rights Reserved.
 * @Author       : frostime
 * @Date         : 2024-03-23 21:37:33
 * @FilePath     : /src/libs/dialog.ts
 * @LastEditTime : 2024-10-16 14:48:42
 * @Description  : Kits about dialogs
 */
import { Dialog } from "siyuan";

export const inputDialog = (args: {
    title: string, placeholder?: string, defaultText?: string,
    confirm?: (text: string) => void, cancel?: () => void,
    width?: string, height?: string, confirmOnEnter?: boolean
}) => {
    let settled = false;
    const finishCancel = () => {
        if (settled) return;
        settled = true;
        args?.cancel?.();
        dialog.destroy();
    };
    const finishConfirm = () => {
        if (settled) return;
        settled = true;
        try {
            args?.confirm?.(target.value);
        } finally {
            dialog.destroy();
        }
    };
    const dialog = new Dialog({
        title: args.title,
        content: `<div class="b3-dialog__content">
    <div class="ft__breakword"><textarea class="b3-text-field fn__block" style="height: 100%;" placeholder=${args?.placeholder ?? ''}>${args?.defaultText ?? ''}</textarea></div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.siyuan.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text" id="confirmDialogConfirmBtn">${window.siyuan.languages.confirm}</button>
</div>`,
        width: args.width ?? "520px",
        height: args.height,
        // 点击遮罩或其它外部行为销毁 Dialog 时，也要结束 inputDialogSync。
        destroyCallback: () => {
            if (!settled) {
                settled = true;
                args?.cancel?.();
            }
        }
    });
    const target: HTMLTextAreaElement = dialog.element.querySelector(".b3-dialog__content>div.ft__breakword>textarea");
    const btnsElement = dialog.element.querySelectorAll(".b3-button");
    btnsElement[0].addEventListener("click", finishCancel);
    btnsElement[1].addEventListener("click", finishConfirm);
    const handleKeydown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            event.preventDefault();
            finishCancel();
        } else if (event.key === "Enter" && args?.confirmOnEnter) {
            event.preventDefault();
            finishConfirm();
        }
    };
    // 监听 Dialog 容器而不只监听 textarea，避免焦点落在其它控件时 Esc 失效。
    dialog.element.addEventListener("keydown", handleKeydown, true);
    // Dialog 创建后主动聚焦，并在下一帧再次聚焦以覆盖其内部初始化带来的焦点变化。
    target.focus();
    requestAnimationFrame(() => target.focus());
};

export const inputDialogSync = async (args: {
    title: string, placeholder?: string, defaultText?: string,
    width?: string, height?: string, confirmOnEnter?: boolean
}) => {
    return new Promise<string>((resolve) => {
        let newargs = {
            ...args, confirm: (text) => {
                resolve(text);
            }, cancel: () => {
                resolve(null);
            }
        };
        inputDialog(newargs);
    });
}


interface IConfirmDialogArgs {
    title: string;
    content: string | HTMLElement;
    confirm?: (ele?: HTMLElement) => void;
    cancel?: (ele?: HTMLElement) => void;
    width?: string;
    height?: string;
}

export const confirmDialog = (args: IConfirmDialogArgs) => {
    const { title, content, confirm, cancel, width, height } = args;

    const dialog = new Dialog({
        title,
        content: `<div class="b3-dialog__content">
    <div class="ft__breakword">
    </div>
</div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel">${window.siyuan.languages.cancel}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text" id="confirmDialogConfirmBtn">${window.siyuan.languages.confirm}</button>
</div>`,
        width: width,
        height: height
    });

    const target: HTMLElement = dialog.element.querySelector(".b3-dialog__content>div.ft__breakword");
    if (typeof content === "string") {
        target.innerHTML = content;
    } else {
        target.appendChild(content);
    }

    // 仅作用于底部 action 区域，避免内容区域其它 .b3-button 干扰
    const actionButtons = dialog.element.querySelectorAll(".b3-dialog__action .b3-button");
    const cancelBtn = actionButtons[0];
    const confirmBtn = actionButtons[1];
    cancelBtn?.addEventListener("click", () => {
        if (cancel) cancel(target);
        dialog.destroy();
    });
    confirmBtn?.addEventListener("click", () => {
        if (confirm) confirm(target);
        dialog.destroy();
    });
};


export const confirmDialogSync = async (args: IConfirmDialogArgs) => {
    return new Promise<HTMLElement>((resolve) => {
        let newargs = {
            ...args, confirm: (ele: HTMLElement) => {
                resolve(ele);
            }, cancel: (ele: HTMLElement) => {
                resolve(ele);
            }
        };
        confirmDialog(newargs);
    });
};


export const simpleDialog = (args: {
    title: string, ele: HTMLElement | DocumentFragment,
    width?: string, height?: string,
    callback?: () => void;
}) => {
    const dialog = new Dialog({
        title: args.title,
        content: `<div class="dialog-content" style="display: flex; height: 100%;"/>`,
        width: args.width,
        height: args.height,
        destroyCallback: args.callback
    });
    dialog.element.querySelector(".dialog-content").appendChild(args.ele);
    return {
        dialog,
        close: dialog.destroy.bind(dialog)
    };
}
