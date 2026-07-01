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


### v0.46.0 (2026年07月01日)
- feat(tldraw): 优化白板卡片样式与无障碍支持，更新 TypeScript 及 Vite 配置 (loonghfut)
- feat(mind-map): 支持编辑后快捷创建兄弟/子节点，添加折叠展开按钮 (loonghfut)
- refactor(branch): 移除分支拖拽全局状态，优化吸附检查逻辑 (loonghfut)
- fix(branch): 根据同侧子节点边界动态计算单块初始 Y 坐标 (loonghfut)
- feat(branch): 删除分支时自动提升唯一子节点到父分支 (loonghfut)
- feat(single-block): 支持 Enter 键在分支中创建兄弟节点 (loonghfut)
- feat(branch): 支持分支中心内容(rootShapeId)的附加、分离与拖拽同步 (loonghfut)
- fix(branch): 修复根节点吸附阈值偏差、子节点替换后根引用残留问题，优化分离按钮图标语义 (loonghfut)
- feat(branch): 导出根节点查找函数并添加选中所属分支的快捷按钮 (loonghfut)
- feat(branch): 优化分支吸附边界计算并新增根节点附加高亮 (loonghfut)
- refactor(branch): 简化分支吸附计算逻辑，移除冗余的附件边界判断 (loonghfut)
- feat(branch): 为根节点分支添加左右附加块的操作按钮 (loonghfut)
- feat(branch): 为分支几何体添加多类型命中目标支持 (loonghfut)
- fix(SingleBlockShape): 修正编辑态退出时 Protyle 快照保存的时序问题 (loonghfut)
- feat(SingleBlockShape): 新增 fit-width 按钮，支持根据内容自动调整块宽度 (loonghfut)
- fix(SingleBlockShape): 限制 fit-width 仅收缩宽度，防止意外增宽 (loonghfut)
- fix(branch): 将 branch 纳入新建形状自动置底逻辑 (loonghfut)
- feat(fitSingleBlockWidth): 基于渲染内容宽度优化自适应测量逻辑 (loonghfut)
- perf(fitSingleBlockWidth): 引入元素可见性缓存与提前终止机制，优化内容宽度测量性能 (loonghfut)
- fix(branch): 增强分支重新布局机制，确保根形状关联分支正确更新 (loonghfut)
- refactor(branch): 重构分支布局更新机制，移除异步队列并优化批量删除处理 (loonghfut)
- refactor(branch): 移除分支吸收形状候选类型及相关处理逻辑 (loonghfut)
- fix(branch): 防止自动布局覆盖显式创建的分支关系 (loonghfut)
- fix(doc-outline): 将卡片 ID 从 leftChildIds 迁移至 rootShapeId 属性 (loonghfut)
- feat(card): 新增卡片中心分支创建功能，补充画布前对应操作入口 (loonghfut)
- fix(branch): 补充空中心分支删除能力，完善画布前分支取消吸附入口 (loonghfut)
- feat(shape-library): 添加形状时自动包含分支关联形状 (loonghfut)
- refactor(shape-library): 重构素材库面板样式与结构，新增搜索和图标组件 (loonghfut)
- feat(card): 添加折叠卡片文本自动适配字号功能 (loonghfut)
- refactor(card): 重构折叠卡片文本自动适配字号的DOM测量逻辑 (loonghfut)
- feat(card): 优化折叠卡片交互体验，添加切换图标悬停动画与事件处理逻辑 (loonghfut)
- fix(card): 折叠卡片时隐藏字体调整按钮 (loonghfut)
- fix(bezier-connector): 修复选中状态下端口因悬停重复显示的问题 (loonghfut)
- feat(card): 扩展中心分支创建功能以支持 single-block 形状 (loonghfut)
- chore(plugin): 升级版本号至 0.46.0 (loonghfut)


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
