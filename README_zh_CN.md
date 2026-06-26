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
9. memos同步：  
支持与memos的单向同步（memos -> 思源），支持全量同步和增量同步，支持最新memos版本。  

#### 开发动力来源[打赏](https://pic.imgdb.cn/item/6751b929d0e0a243d4de55a7.png) [star](https://github.com/loonghfut/siyuan-steve-tools) 

#### 更新日志:


### v0.43.0 (2026年06月26日)
- feat: 添加分支形状工具及相关功能 (loonghfut)
- feat: 更新分支附件处理逻辑，优化拖动后形状的连接性 (loonghfut)
- feat: 添加分支形状的左右子节点支持，优化布局逻辑 (loonghfut)
- feat: 添加分支交互状态管理，支持拖动和连接提示 (loonghfut)
- feat: 添加分支附件拖动功能，优化形状连接交互 (loonghfut)
- feat: 添加端口悬停延时设置，优化端口显示逻辑 (loonghfut)
- feat: 添加对分支形状的支持，优化连接逻辑和拖动交互 (loonghfut)
- feat: 调整分支形状的样式和布局参数，优化视觉效果 (loonghfut)
- feat: 添加延迟附加候选者管理，优化分支附加逻辑 (loonghfut)
- feat: 优化分支附加逻辑，增加延迟附加候选者管理和提示调度功能 (loonghfut)
- feat: 优化分支附加逻辑，增加延迟附加候选者管理和提示调度功能 (loonghfut)
- feat: 调整分支布局边距参数，优化分支宽度和高度计算 (loonghfut)
- feat: 添加保持分支布局更新功能，优化子形状尺寸变化后的重排逻辑 (loonghfut)
- feat: 优化分支布局逻辑，调整节点尺寸和位置计算 (loonghfut)
- feat: 优化分支布局更新逻辑，简化相关函数调用 (loonghfut)
- feat: 增强链接处理逻辑，支持新的链接格式并优化静态链接交互 (loonghfut)
- feat: 优化块创建和缓存逻辑，支持字体大小参数，提升性能和可维护性 (loonghfut)
- feat: 添加静态链接处理功能，优化链接点击和拖拽交互，提升用户体验 (loonghfut)
- feat: 优化端口位置计算，支持端口外移以避免误触 (loonghfut)
- feat: 添加 Branch 样式面板区块，支持外框显示/隐藏功能 (loonghfut)
- feat: 添加 Branch 工具，更新图标并支持自定义图标映射 (loonghfut)
- feat: 添加对目标形状的支持，优化分支附加和吸收逻辑 (loonghfut)
- feat: 添加断开吸附功能，支持完全断开当前 Branch 的所有吸附关系 (loonghfut)
- feat: 添加插入文档关系功能，支持在大纲和子文档面板中插入多个文档块 (loonghfut)
- refactor(doc-outline): extract shared data loading logic into dedicated module (loonghfut)
- refactor(card-style): optimize data loading with on-demand SQL checks (loonghfut)
- 优化样式面板细节 (loonghfut)
- 优化样式，改为图标 (loonghfut)
- 文档一键插入大纲有层级结构 (loonghfut)
- fix(doc-outline): update branch references after inserting relations (loonghfut)
- feat(card): add card collapse toggle with multi-select support (loonghfut)
- - doc-outline-data.ts 中添加 SQL 预查询，在 loadChildDocsForDoc 中提前判断是否存在子文档 - CardStyleSection.tsx 移除冗余的原始 SQL 检查逻辑，直接根据返回空数组显示提示 (loonghfut)
- chore(kilo): initialize kilo configuration directory (loonghfut)
- feat(doc-outline): 插入文档关系时默认折叠大纲卡片 (loonghfut)
- style(card): 更改卡片折叠时文字默认对齐方式为居中 (loonghfut)
- feat(doc-outline): 插入文档关系时同步大纲块 tldraw 链接属性 (loonghfut)
- feat(branch-shape): 实现形状删除后自动清理分支引用 (loonghfut)
- chore(plugin): bump 版本至 0.43.0 (loonghfut)


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
