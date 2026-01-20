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


### v0.33.2 (2026年01月20日)
- feat(SlideShape): 添加边框样式属性，支持实线、虚线和流动效果 (loonghfut)
- 1 (loonghfut)
- feat(SlideShapeUtil): 使用 HTMLContainer 包裹编辑输入，优化事件处理 (loonghfut)
- feat(CardShapeUtil): 添加动画效果和过渡样式，优化卡片形状组件的用户体验 (loonghfut)
- feat(CardShapeUtil): 实现懒加载和增量渲染，优化大文档的首屏加载性能 (loonghfut)
- feat: Add custom UI components for Tldraw (loonghfut)
- feat(SlideShapeUtil): 添加波浪边框动画效果，优化幻灯片边框样式 (loonghfut)
- feat(InFrontOfCanvas): 优化按钮样式和交互，添加图标组件 (loonghfut)
- feat(content-renderer): 添加嵌入块处理逻辑，优化渲染内容的获取 (loonghfut)
- feat(SlidesPanel): 实现幻灯片分组显示和折叠功能，优化用户界面 (loonghfut)
- feat(SlideFocus): 添加幻灯片聚焦模式，优化幻灯片面板样式和交互 (loonghfut)
- feat(SlidesPanel): 添加分组图标和优化幻灯片项显示 (loonghfut)
- feat(plugin): 更新版本号至0.33.0 (loonghfut)
- docs: 更新 v0.33.0 版本的更新日志 (loonghfut)
- feat(WuCai): 添加五彩服务 API 客户端库及相关接口定义 (loonghfut)
- feat(Wucai): 添加 Wucai 模块及相关设置和默认值 (loonghfut)
- feat: Implement WuCai synchronization module with enhanced settings and UI (loonghfut)
- Update issue templates (LoongSteve)
- Update issue templates (LoongSteve)
- Add issue template configuration file (LoongSteve)
- Change issue contact link to group feedback (LoongSteve)
- Add 'about' field to contact link in config.yml (LoongSteve)
- Delete .github/ISSUE_TEMPLATE/关于反馈.md (LoongSteve)
- feat(WuCai): 优化游标处理逻辑以确保同步准确性 (loonghfut)
- feat(WuCai): 添加自定义渲染模板支持，包括标题、meta 和高亮模板 (loonghfut)
- feat: 注释掉 Wucai 模块相关配置以暂时禁用该功能 (loonghfut)
- feat(TldrawManager): 优化性能，通过节流策略减少保存频率和广播频率 (loonghfut)
- feat(SlidesPanel): 移除空幻灯片提示信息 (loonghfut)
- feat: 更新版本号至 0.33.1 (loonghfut)
- docs: 更新 v0.33.1 版本的更新日志 (loonghfut)
- Merge branch 'main-2' of https://github.com/loonghfut/siyuan-steve-tools into main-2 (loonghfut)
- docs: 更新 v0.33.1 版本的更新日志 (loonghfut)
- feat(WebviewDock): 安全调用 initRun 方法以防止错误 (loonghfut)
- feat(WpsFileServ): 增加 WPS 云文档漫游 API 监控脚本以捕获 API 请求 (loonghfut)
- feat(WpsFileServ): 添加时间字段并格式化时间戳为可读字符串 (loonghfut)
- feat(WpsFileServ): 添加“今日”按钮以一键选中今日更新的文件 (loonghfut)


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
