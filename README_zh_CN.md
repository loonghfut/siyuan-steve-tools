STEVETOOLS
==========
[![GitHub release (latest by date)](https://img.shields.io/github/v/release/loonghfut/siyuan-steve-tools)](https://github.com/loonghfut/siyuan-steve-tools/releases)
[![GitHub stars](https://img.shields.io/github/stars/loonghfut/siyuan-steve-tools)](https://github.com/loonghfut/siyuan-steve-tools/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/loonghfut/siyuan-steve-tools)](https://github.com/loonghfut/siyuan-steve-tools/issues)
[![GitHub license](https://img.shields.io/github/license/loonghfut/siyuan-steve-tools)](https://github.com/loonghfut/siyuan-steve-tools/blob/main/LICENSE)
[![GitHub all releases](https://img.shields.io/github/downloads/loonghfut/siyuan-steve-tools/total)](https://github.com/loonghfut/siyuan-steve-tools/releases)

这是一个自用工具集合？那为什么做了那么多我用不到的功能？那为什么耗费那么多夜晚来开发维护用不到的功能？（反思），~~在我自己使用的同时，分享出来也希望能够帮助到有相关需求的其他人。~~  
`<所有功能模块开源>`  
有个人需求：有技术，自己拉源码，自己改; 没技术，自己拉源码让ai改。

（注：由于是自用工具插件，可能会有一些不完善的地方，甚至出现数据遗失！！（因为使用了思源数据操作相关的api），请自行测试无问题的情况下再使用，若在使用过程中出现问题，请及时反馈）   
### 若介意请勿使用。

### 自用中....自用中....自用中....
#### 免费使用遇到问题不用反馈，若有BUG影响到我的使用，我自然会修，过了几个版本BUG还在，麻烦自己拉源码修。  
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


### v0.20.6 (2025年11月04日)
- feat(minutiae): add background image functionality and settings (loonghfut)
- feat(minutiae): 支持在更新设置时跳过背景刷新选项 (loonghfut)
- feat(minutiae): 更新背景切换模式描述以支持持久化选项 (loonghfut)
- 优化图片切换逻辑 (loonghfut)
- feat(minutiae): 添加背景切换防抖阈值设置以优化图片请求频率 (loonghfut)
- feat(minutiae): 在启动模式下刷新背景以优化加载体验 (loonghfut)
- feat(plugin): 更新版本号至0.20.0 (loonghfut)
- docs: 更新 v0.20.0 版本的更新日志 (loonghfut)
- feat(minutiae): 禁止在设置更改时刷新背景以保持当前图像不变 (loonghfut)
- feat(plugin): 更新版本号至0.20.1 (loonghfut)
- docs: 更新 v0.20.1 版本的更新日志 (loonghfut)
- 优化快捷键添加到日程 (loonghfut)
- feat(calendar): 添加自动调整日历高度的功能 (loonghfut)
- 整理部分文件 (loonghfut)
- feat(calendar): 添加待安排事件面板及相关功能 (loonghfut)
- style(calendar): 调整未安排事件面板的样式和布局 (loonghfut)
- refactor(calendar): 重构待安排面板逻辑，封装为控制器并优化事件处理 (loonghfut)
- chore(plugin): 更新版本号至0.20.2 (loonghfut)
- docs: 更新 v0.20.2 版本的更新日志 (loonghfut)
- feat(calendar): 添加“过期未完成”事件的支持，更新相关接口和逻辑 (loonghfut)
- feat(calendar): 将“完成”与“归档”视作已完成，优化事件状态判断逻辑 (loonghfut)
- feat(calendar): 更新视图右侧按钮设置，添加“当月看板”标题并优化按钮列表 (loonghfut)
- feat(ai): 添加用户自定义 AI 地址列表支持，更新相关设置和逻辑 (loonghfut)
- feat(plugin): 更新版本号至 0.20.3 (loonghfut)
- docs: 更新 v0.20.3 版本的更新日志 (loonghfut)
- feat(calendar): 动态调整 timeGrid 视图的 slotMinTime 设置，优化事件显示范围 (loonghfut)
- feat(calendar): 更新时间网格视图按钮，添加计划按钮以优化用户体验 (loonghfut)
- fix(styles): 强制设置边框样式为无，以解决样式冲突问题 (loonghfut)
- feat(plugin): 更新版本号至 0.20.4 (loonghfut)
- docs: 更新 v0.20.4 版本的更新日志 (loonghfut)
- refactor(api): 注释掉调试日志以清理控制台输出 refactor(calendar): 注释掉调试日志以减少冗余信息 feat(calendar): 添加自定义属性设置以支持事件状态更新 (loonghfut)
- feat(aggregate): 添加 SQL 聚合器修改功能，优化用户体验 (loonghfut)
- feat(settings): 添加笔记本黑名单设置，防止自动设置题头图 (loonghfut)
- feat(settings): 添加笔记本黑名单编辑器，优化题头图设置功能 (loonghfut)
- feat(plugin): 更新版本号至0.20.5，并在描述中添加随机题头图背景图信息 (loonghfut)
- docs: 更新 v0.20.5 版本的更新日志 (loonghfut)
- fix(plugin): 修正插件描述和显示名称的语言标识，添加缺失的关键词 (loonghfut)
- 准备开始i18n (loonghfut)
- docs(i18n): 精简插件开发中的国际化说明，移除 YAML 文件相关内容 (loonghfut)
- feat(calendar): 修复QQ邮箱日历事件无法编辑问题 (loonghfut)
- feat(network-interceptor): 添加轻量级 fetch 拦截器以监听 /api/av/* 请求 (loonghfut)
- fix(plugin): 更新插件版本号至 0.20.6 (loonghfut)


更多详见[提交记录](https://github.com/loonghfut/siyuan-steve-tools/commits/main-2/)

#### 感谢：
- [wilsons](https://ld246.com/member/wilsons)：开发`生成日历文件ics功能`指导
- [Frostime](https://ld246.com/member/Frostime): 提供插件开发模板和开发工具包
- [seanduo](https://github.com/seanduo)：PR
- [BoysFight](https://github.com/BoysFight)：PR lifelog功能
- [Achuan-2](https://ld246.com/member/Achuan-2)：提供看板示例参考
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
