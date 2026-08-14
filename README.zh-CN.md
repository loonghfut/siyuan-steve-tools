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


### v0.54.0 (2026年08月14日)
- feat(aggregate): 重构内容聚合器定时器与领域模型，修复渲染、逻辑与竞态问题 (loonghfut)
- feat(aggregate): 重构Echarts UI类名与交互样式，新增聚合模块主题样式文件 (loonghfut)
- feat(aggregate): 新增SQL可视化预设工作台，内容聚合器支持内嵌打开与编辑预设 (loonghfut)
- 1 (loonghfut)
- fix(handwriting): 修复退出编辑时的闪动及加载状态抖动问题 (loonghfut)
- feat(bezier-connector): 拖拽预览时支持基于对侧端点位置解析 auto 端口 (loonghfut)
- fix(bezier-connector): 限制标准形状仅 bottom 端口可作为连接创建入口 (loonghfut)
- refactor(bezier-connector): 优化端口命中检测性能并简化连接线渲染逻辑 (loonghfut)
- feat(branch-collapse): 实现分支折叠/展开交互能力与配置项支持 (loonghfut)
- feat(branch-shape-util): 补充小地图渲染控制接口 (loonghfut)
- refactor(branch-collapse): 优化分支折叠后代计算并引入 EditorAtom 响应式缓存 (loonghfut)
- feat(bezier-connector): 补充连接器小地图隐藏支持并修正代码缩进格式 (loonghfut)
- feat(branch-collapse): 实现分支子树批量折叠/展开能力并新增右键触发交互 (loonghfut)
- perf(branch-collapse): 优化分支折叠动画快照捕获逻辑，仅收集关联分支形状降低性能开销 (loonghfut)
- perf(branch-layout, single-block-shape): 优化分支索引查询与 DOM 测量性能 (loonghfut)
- perf(single-block-shape): 优化 canCull 逻辑允许非编辑态卡片被剔除，并修正代码缩进格式 (loonghfut)
- fix(tldraw-manager, content-renderer): 补充全局交互事件监听修复容器外拖拽结束渲染停滞问题，重构数据库视图渲染逻辑避免并发冲突并增强异常处理 (loonghfut)
- feat(tldraw-manager): 启用原生 Frame 形状工具并配置颜色样式支持 (loonghfut)
- refactor(content-renderer): 移除renderAllContentIdle函数中冗余的条件渲染与空闲调度逻辑 (loonghfut)
- feat(tldraw-manager, FrameShape, content-renderer): 替换原生Frame形状工具为缩放不变形自定义实现，调整渲染空闲调度相关注释 (loonghfut)
- refactor(idle-scheduler, content-renderer, card-shape, single-block-shape): 重构空闲调度器支持AbortSignal取消机制，移除renderAllContentIdle冗余forceIdle参数，优化渲染错误处理区分主动取消与实际异常 (loonghfut)
- feat(frame-shape): 添加hideInMinimap方法，在小地图中隐藏缩放不变形Frame形状 (loonghfut)
- feat(card): 添加 CardContentVirtualizer 实现静态预览窗口化，提升长文档渲染性能 (loonghfut)
- refactor(card): 拆分静态预览加载队列，渲染器支持静态预览标记，视频仅预加载元数据 (loonghfut)
- perf(static-preview-load-queue): 将静态预览加载队列并发数从4提升至6，优化长文档预览加载性能 (loonghfut)
- perf(static-preview-load-queue, shape-load-manager, card): 优化静态预览加载优先级与队列调度，减少微小视口移动的不必要回调 (loonghfut)
- feat(handwriting): 禁用画板模块以减小包体积，白板已独立为ST白板插件 (loonghfut)
- chore(plugin): 升级版本号至 0.54.0 (loonghfut)


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
