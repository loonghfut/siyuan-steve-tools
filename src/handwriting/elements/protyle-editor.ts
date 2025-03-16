// import { Protyle } from 'siyuan';

// export class ProtyleEditor {
//     /**
//      * 初始化思源Protyle编辑器
//      * @param container 容器元素
//      * @param blockId 思源块ID
//      */
//     static initProtyleEditor(container: HTMLElement, blockId: string): Protyle | null {
//         try {
//             // 创建Protyle实例
//             const protyle = new Protyle(window.siyuan.ws.app, container, {
//                 blockId: blockId,
//                 mode: 'wysiwyg',
//                 render: {
//                     breadcrumb: false,
//                     gutter: false,
//                 },
//                 typewriterMode: false,
//                 after: () => {
//                     console.log('Protyle初始化完成:', blockId);
//                 }
//             });

//             return protyle;
//         } catch (e) {
//             console.error('初始化Protyle失败:', e);
//             return null;
//         }
//     }
// }