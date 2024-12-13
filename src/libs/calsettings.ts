
export function addSettings(settingUtils) {
    // settingUtils.addItem({
    //     key: "callink",
    //     value: "",
    //     type: "textarea",
    //     title: "文档块展示的字段(不填默认展示所有支持的字段)",
    //     description: "输入展示的字段(mSelect,number,date,text,mAsset,checkbox,phone,url,email)",
    //     action: {
    //         // Called when focus is lost and content changes
    //         callback: () => {
    //             settingUtils.takeAndSave("callink");
    //         }
    //     }
    // });
    // settingUtils.addItem({
    //     key: "dis-show-block",
    //     value: "mSelect,text",
    //     type: "textarea",
    //     title: "普通块展示的字段(不填默认展示所有支持的字段)",
    //     description: "输入展示的字段(mSelect,number,date,text,mAsset,checkbox,phone,url,email)",
    //     action: {
    //         // Called when focus is lost and content changes
    //         callback: () => {
    //             settingUtils.takeAndSave("dis-show-block");
    //         }
    //     }
    // });
    settingUtils.addItem({
        key: "Custom Element",
        value: "",
        type: "custom",
        direction: "row",
        title: "开发中。。。",
        description: "敬请期待。。",
        //Any custom element must offer the following methods
        createElement: (currentVal: any) => {
            let div = document.createElement('div');
            div.style.border = "1px solid var(--b3-theme-primary)";
            div.contentEditable = "true";
            div.textContent = currentVal;
            return div;
        },
        getEleVal: (ele: HTMLElement) => {
            return ele.textContent;
        },
        setEleVal: (ele: HTMLElement, val: any) => {
            ele.textContent = val;
        }
    });
        
}