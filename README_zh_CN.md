STEVETOOLS
==========
[![GitHub release (latest by date)](https://img.shields.io/github/v/release/loonghfut/siyuan-steve-tools)](https://github.com/loonghfut/siyuan-steve-tools/releases)
[![GitHub stars](https://img.shields.io/github/stars/loonghfut/siyuan-steve-tools)](https://github.com/loonghfut/siyuan-steve-tools/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/loonghfut/siyuan-steve-tools)](https://github.com/loonghfut/siyuan-steve-tools/issues)
[![GitHub all releases](https://img.shields.io/github/downloads/loonghfut/siyuan-steve-tools/total)](https://github.com/loonghfut/siyuan-steve-tools/releases)

这是一个自用工具集合？那为什么做了那么多我用不到的功能？那为什么耗费那么多夜晚来开发维护用不到的功能？（反思），~~在我自己使用的同时，分享出来也希望能够帮助到有相关需求的其他人。~~  
`<所有功能模块开源>`  
有个人需求：有技术，自己拉源码，自己改; 没技术，自己拉源码让ai改。

（注：由于是自用工具插件，可能会有一些不完善的地方，甚至出现数据遗失！！（因为使用了思源数据操作相关的api），请自行测试无问题的情况下再使用，若在使用过程中出现问题，请及时反馈）   
### 若介意请勿使用。

### 免费使用遇到问题不用反馈，若有BUG影响到我的使用，我自然会修，过了几个版本BUG还在，麻烦自己拉源码修。  
若打赏过，遇到BUG可以反馈，我尽量抽出时间尽力解决一下；有个人需求可以提，如果实现简单我会顺手做了。
为方便和打赏用户沟通，故临时建了反馈QQ群（随时可能解散），加之前请填一下[申请表](https://www.kdocs.cn/wo/sl/v1lC0R0)

#### 目前工具 ([插件演示和教程](https://ld246.com/search?q=sttools))
1. 互联日程管理：   （[相关演示](https://ld246.com/article/1737464243546?r=stevehfut)） [简单教程](https://ld246.com/article/1738929421466?r=stevehfut)   [视频教程](https://ld246.com/article/1739584703693)  
和思源深度融合的日历视图和看板视图, 同时用于生成日历文件ics，实现日程同步到支持url订阅的日历软件中，比如thunderbird，小米日历，苹果日历等，支持订阅ics链接导入其他软件日程，支持与滴答清单的初步联动。     
2. docker同步感知：    
win端s3同步后，docker端感知s3同步。  
3. ai网页侧边栏：    
嵌入了一些ai的网页，方便使用。    
4. 媒体资源压缩：  
压缩媒体资源后再导入思源。  
5. tldraw白板：  
模仿AFFINE，深度绑定思源的tldraw白板，支持嵌入思源块和链接跳转  
6. Lifelog：（开源替代，如需更好体验请使用[叶归插件](https://simplest-frontend.feishu.cn/docx/B3NndXHi7oLLXJxnxQmcczRsnse)）  
用法基本和叶归插件一样，由[BoysFight](https://github.com/BoysFight) PR实现。  
7. WPS联动：  
方便在思源中使用WPS（office文件嵌入，预览、编辑、同步），多维表格数据导入，图片上传。
8. 聚合查询：  
可视化生成SQL语句，查询思源数据库，支持多条件筛选，排序等功能，支持结果预览和嵌入块。  
可视化图表生成器（基于数据库，SQL查询）

#### 开发动力来源[打赏](https://pic.imgdb.cn/item/6751b929d0e0a243d4de55a7.png) [star](https://github.com/loonghfut/siyuan-steve-tools) 

#### 更新日志:


### v0.32.0 (2025年12月29日)
- docs: 更新 v0.31.2 版本的更新日志 (loonghfut)
- fix(tldraw): 修复画布点击清除选区时误触发的问题 (loonghfut)
- feat(types): 添加Svelte组件类型声明文件 (loonghfut)
- Refactor code structure for improved readability and maintainability (loonghfut)
- refactor(tldraw): 移除多选和批量操作相关逻辑，简化白板管理功能 (loonghfut)
- fix(tldraw): 优化画板预览加载逻辑，调整观察者根元素和边距设置 (loonghfut)
- feat(tldraw): 增强白板上下文菜单的可访问性，添加ARIA角色和标签 (loonghfut)
- Refactor Tldraw file management: Introduce WhiteboardFileManager for unified file operations (loonghfut)
- feat(tldraw): 添加页签管理功能，替换实例销毁逻辑为页签关闭逻辑 (loonghfut)
- fix(tldraw): 改进extractDrawingId方法，增强文件名解析逻辑以支持时间戳和原因 (loonghfut)
- fix(file-manager): 改进extractDrawingId方法，增强文件名解析逻辑以支持严格格式和时间戳 (loonghfut)
- feat(tldraw): 添加标签编辑功能，支持批量添加和移除标签，增强选择工具 (loonghfut)
- feat(tldraw): 添加标签保存后的响应式更新和刷新按钮，优化用户体验（未完成） (loonghfut)
- fix(tldraw): 修改标签处理逻辑，使用逗号分隔标签以简化存储和更新 (loonghfut)
- feat(tldraw): 添加刷新功能以更新白板元数据，增强用户交互体验 (loonghfut)
- feat(tldraw): 优化选择卡片样式，增强用户交互体验 (loonghfut)
- 1 (loonghfut)
- feat(tldraw): 重构白板卡片组件，增强可复用性和交互性 (loonghfut)
- feat(tldraw): 增强白板卡片组件，重构类型定义和计算逻辑以提升可读性和性能 (loonghfut)
- 更改文件位置 (loonghfut)
- feat(CardShapeUtil): 添加静态预览获取功能，优化文档块渲染逻辑 (loonghfut)
- feat(api): 添加获取文档信息的接口及相关类型定义 (loonghfut)
- feat(CardShapeUtil): 添加文档信息获取功能，优化主卡片渲染逻辑 (loonghfut)
- fix(CardShapeUtil): 修复静态资源 URL 构建逻辑，移除不必要的前缀 (loonghfut)
- fix(custom-tldraw.css): 调整 WYSIWYG 编辑器内边距，减少左侧填充 (loonghfut)
- refactor(CardShapeUtil): 优化 Protyle 生命周期管理，简化手动刷新逻辑 (loonghfut)
- feat(CardShapeUtil): 添加折叠状态管理，支持折叠前高度恢复 (loonghfut)
- feat(CardShapeUtil): 添加文档信息解析功能，优化折叠状态下的展示逻辑 (loonghfut)
- feat(CardShapeUtil): 优化折叠高度计算逻辑，支持主卡片的特殊处理 (loonghfut)
- feat(CardShapeUtil): 添加标题图像背景渐变回退，优化卡片渲染逻辑 (loonghfut)
- feat(CardShapeUtil): 添加 CardShape 导出逻辑，支持将卡片内容导出为 SVG (loonghfut)
- feat(CardShapeUtil): 支持折叠状态下的卡片内容复制，优化导出逻辑 (loonghfut)
- fix(CardShapeUtil): 调整折叠状态下的高度计算逻辑，优化卡片编辑体验 (loonghfut)
- feat(TldrawManager): 添加折叠状态支持，优化拖拽行为和高度设置 (loonghfut)
- fix(CardShapeUtil): 增加预览文本长度限制，优化折叠状态下的显示效果 (loonghfut)
- feat(CardShapeUtil): 优化折叠状态下的显示效果，添加折叠图标和内容摘要 (loonghfut)
- fix(CustomStylePanel): 更新 Markdown 生成逻辑，添加自定义 tldraw 链接属性 (loonghfut)
- fix(SingleBlockShapeUtil): 调整最小高度逻辑，确保内容高度不低于最小值 (loonghfut)
- fix(SingleBlockShapeUtil): 优化 SVG 导出逻辑，确保高度和边框样式与实际渲染一致 (loonghfut)
- fix(SingleBlockShapeUtil): 调整高度计算逻辑，考虑边框样式以确保准确测量 (loonghfut)
- feat(M_handwriting): 添加白板按钮并设置文档树观察器 (loonghfut)
- feat(M_handwriting): 根据设置决定是否在文档树中显示白板按钮 (loonghfut)
- fix(CardShapeUtil): 禁用主形状的面包屑显示 (loonghfut)
- fix(CardShapeUtil): 优化背景图像提取逻辑，支持从不同属性中获取背景定义 (loonghfut)
- feat(DocOutline): 添加文档大纲面板及管理功能，支持块的添加与拖拽操作 (loonghfut)
- feat(DocOutline): 添加HTML实体移除功能，优化节点名称和内容处理 (loonghfut)
- feat(DocOutline): 添加刷新按钮以重新加载文档大纲 (loonghfut)
- feat(DocOutline): 优化大纲节点结构，支持递归转换和拖拽功能 (loonghfut)
- feat(DocOutline): 更新HTML实体处理逻辑，统一使用blocks替代children (loonghfut)
- feat(DocTree): 添加文档文件列表接口及相关类型定义 (loonghfut)
- feat(ChildDocsPanel): 添加子文档面板组件及位置管理功能 (loonghfut)
- feat(TldrawManager): 添加子文档拖放处理功能 (loonghfut)
- feat(ChildDocsPanel): 优化文档添加检测逻辑，使用缓存提高性能 (loonghfut)
- feat(ChildDocsPanel, DocOutlinePanel): 优化文档添加检测逻辑，使用状态管理替代引用 (loonghfut)
- feat(CustomQuickActions): 更新子文档菜单项图标为工具笔记 (loonghfut)
- feat(plugin.json): 更新版本号至0.32.0 (loonghfut)


更多详见[提交记录](https://github.com/loonghfut/siyuan-steve-tools/commits/main-2/)

#### 感谢：
- [Frostime](https://ld246.com/member/Frostime): 提供插件开发模板和开发工具包
- [seanduo](https://github.com/seanduo)：PR
- [BoysFight](https://github.com/BoysFight)：PR lifelog功能
- [空幽]()： `the first ` `the most` 打赏支持

~~##### 收费预告：仅仅在插件介绍页感谢打赏用户是不够的，为使之前打赏的用户不虚此心，减少我的精力损耗，后续会开始收费，之前用户无论打赏多少，都可一直享受免费使用权（只需提供之前的打赏证明即可）。~~  
~~收费项目：此插件所有功能~~   
~~收费时间：可能明天，可能明年，可能也不会。~~  
~~破解方式：椒盐模式，不要脸即可破解😁~~


#### 说明
- 日历视图基于fullcalendar开发，感谢fullcalendar的开发者。
- 画板视图基于tldraw开发，感谢tldraw的开发者。

#### 打赏
如果你觉得这个项目对你有帮助，欢迎打赏，以激励我更好的维护和更新这个项目。  
<img src="https://pic.imgdb.cn/item/6751b929d0e0a243d4de55a7.png" alt="图片描述" width="400" />


#### 免责声明
- 在介绍页面中，已提示本插件可能会有数据遗失的情况，请自行测试无问题的情况下再使用，作者不为你使用本产品所产生的任何后果负责。
- 禁止使用本产品用于任意违法乱纪相关行为。 作者不为你使用本产品所产生的任何后果负责。
