STEVETOOLS
==========
[![GitHub release (latest by date)](https://img.shields.io/github/v/release/loonghfut/siyuan-steve-tools)](https://github.com/loonghfut/siyuan-steve-tools/releases)
[![GitHub stars](https://img.shields.io/github/stars/loonghfut/siyuan-steve-tools)](https://github.com/loonghfut/siyuan-steve-tools/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/loonghfut/siyuan-steve-tools)](https://github.com/loonghfut/siyuan-steve-tools/issues)
[![GitHub all releases](https://img.shields.io/github/downloads/loonghfut/siyuan-steve-tools/total)](https://github.com/loonghfut/siyuan-steve-tools/releases)

`<所有功能模块开源>`  
有个人需求：有技术，自己拉源码，自己改; 没技术，自己拉源码让ai改。

（注：由于是自用工具插件，可能会有一些不完善的地方，甚至出现数据遗失！！（因为使用了思源数据操作相关的api），请自行测试无问题的情况下再使用，若在使用过程中出现问题，请及时反馈）   
### 若介意请勿使用。

### 免费使用遇到问题不用反馈，若有BUG影响到我的使用，我自然会修，过了几个版本BUG还在，麻烦自己拉源码修。  
若打赏过，遇到BUG可以反馈，我尽量抽出时间尽力解决一下；有个人需求可以提，如果实现简单我会顺手做了。
为方便和打赏用户沟通，故临时建了反馈QQ群（随时可能解散），加之前请填一下[申请表](https://www.kdocs.cn/wo/sl/v1lC0R0)

#### 目前工具 ([插件演示和教程](https://ld246.com/search?q=sttools))
1. 互联日程管理：   （[相关演示](https://ld246.com/article/1737464243546?r=stevehfut)） [简单教程](https://ld246.com/article/1738929421466?r=stevehfut)   [视频教程](https://ld246.com/article/1739584703693)  
和思源深度融合的日历视图，同时用于生成日历文件ics，实现日程同步到支持url订阅的日历软件中，比如thunderbird，小米日历，苹果日历等，支持订阅ics链接导入其他软件日程，支持与滴答清单的初步联动。
2. docker同步感知：    
win端s3同步后，docker端感知s3同步。  
3. ai网页侧边栏：    
嵌入了一些ai的网页，方便使用。    
4. 媒体资源压缩：  
压缩媒体资源后再导入思源。  
5. [tldraw白板](siyuan://bazaar/plugins/siyuan-steve-tldraw/readme)：【已接入思源智能体】 【为减少包体积，已经独立为[ST白板](siyuan://bazaar/plugins/siyuan-steve-tldraw/readme)】   
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


### v0.53.0 (2026年08月05日)
- chore(plugin): 升级 siyuan 依赖版本至 ^1.2.3 (loonghfut)
- docs(dida): 重构 Dida365 API 文档，更新为完整版本 (loonghfut)
- 1 (loonghfut)
- refactor(dida): 重构 Dida365 模块为分层架构，拆分 API 客户端、特性模块、映射器、存储与同步协调器，新增专注与习惯功能骨架，替换原有单体服务实现 (loonghfut)
- refactor(calendar): 移除QQ邮箱日历功能，重构特殊日历源统一管理机制 (loonghfut)
- refactor(calendar): 移除看板与四象限视图，重构日历运行时管理机制 (loonghfut)
- feat(calendar): 重构日历模块分层架构，新增数据统计与快速创建功能，调整集成模块组织方式 (loonghfut)
- refactor(calendar): 重构日历缓存策略与事务处理流程，扩展属性视图渲染接口配置能力 (loonghfut)
- 改进样式 (loonghfut)
- feat(calendar): 移除事件DOM块引用属性配置，简化事件元素渲染逻辑 (loonghfut)
- feat(calendar): 新增批量任务标记接口与超级块任务状态同步能力，调整事务监听自写判断逻辑 (loonghfut)
- feat(calendar): 重构任务块与日历状态双向同步机制，新增任务块状态反向同步能力，优化防重复调用逻辑 (loonghfut)
- feat(calendar): 重构任务状态同步逻辑，移除冗余队列，新增事务对比识别与重试机制 (loonghfut)
- fix(task-sync): 修复反向同步时已完成任务缓存缺失的判断逻辑 (loonghfut)
- refactor(calendar): 优化任务块状态绑定查找机制，支持直接绑定优先匹配 (loonghfut)
- feat(task-sync): 新增块级滴答任务ID属性读写能力，建立思源块与滴答任务的直接关联映射 (loonghfut)
- perf(task-sync): 使用 SQL 批量查询替代逐条读取，优化全量同步性能 (loonghfut)
- chore(plugin): 升级版本号至 0.52.0 (loonghfut)
- refactor(calendar): 引入 AV 写入生命周期观察者模式与运行时上下文，解耦 API 层与日历模块 (loonghfut)
- chore(plugin): 插件版本更新至 0.52.1 (loonghfut)
- refactor(calendar): 将日程超级块重构为引述块，统一创建逻辑并优化状态同步 (loonghfut)
- perf(whiteboard): 优化卡片渲染与白板缩略图性能 (loonghfut)
- fix(card): 修正卡片剔除策略，仅保留当前编辑卡片不被剔除 (loonghfut)
- perf(handwriting): 引入渲染准入控制机制，重构编辑状态响应式处理并统一低细节预览阈值 (loonghfut)
- fix(card, single-block): 修正卡片与单块形状的预览占位互斥逻辑，调整加载状态初始值避免冗余渲染 (loonghfut)
- refactor(card, single-block): 补充 previewText 数据迁移，统一渲染流程中的轻量预览文本提取与持久化 (loonghfut)
- perf(handwriting): 优化低细节预览渲染性能，动态适配字体大小并缩短预览文本长度 (loonghfut)
- refactor(card, single-block): 重构轻量预览渲染流程，统一低缩放与内容限流场景的占位处理，移除冗余加载提示组件，确保视口剔除与低缩放渲染的视觉一致性 (loonghfut)
- feat(calendar): 重构任务块状态同步与自写标记逻辑，新增task类型自写标识，优化任务DOM解析性能并消除状态同步回声 (loonghfut)
- feat(card, single-block): 新增轻量预览数量阈值配置，优化低细节渲染触发策略 (loonghfut)
- docs(handwriting): 修正 Card 轻量预览数量阈值配置描述中的默认值 (loonghfut)
- perf(handwriting): 使用 EditorAtom 缓存可见 Card/SingleBlock 数量，减少 getRenderingShapes 调用开销 (loonghfut)
- chore(plugin): 升级版本号至 0.53.0 (loonghfut)


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
