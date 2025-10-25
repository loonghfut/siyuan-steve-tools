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


### v0.19.3 (2025年10月25日)
- 开始优化白板： 取消与日记的关联 (loonghfut)
- 创建块时增加一个空格 (loonghfut)
- feat: 更新依赖项 siyuan 至 1.1.5 版本 (loonghfut)
- 优化白板块删除处理 (loonghfut)
- feat: 更新卡片渲染模式设置，支持静态和动态渲染选项 (loonghfut)
- feat: 添加 Protyle 渲染完成等待逻辑，确保内容首次渲染一致性 (loonghfut)
- feat: 添加卡片刷新功能，通过更新 nonce 触发重新挂载逻辑 (loonghfut)
- feat: 添加“刷新所有卡片”功能，支持批量更新卡片状态 (loonghfut)
- feat: 更新tldraw版本 (loonghfut)
- 更新白板静态资源 (loonghfut)
- 修复部分图标无法显示的BUG (loonghfut)
- feat: 更新插件版本至0.19.0 增加高性能模式 Fixes #51 (loonghfut)
- docs: 更新 v0.19.0 版本的更新日志 (loonghfut)
- 完善tldraw相关许可 (loonghfut)
- feat: 更新插件版本至0.19.1 (loonghfut)
- docs: 更新 v0.19.1 版本的更新日志 (loonghfut)
- 更新 README.md (LoongSteve)
- 更新 README.md (LoongSteve)
- feat: 添加数据库 ID 字段选择功能，支持选择块 ID 或父块 ID (loonghfut)
- Merge branch 'main-2' of https://github.com/loonghfut/siyuan-steve-tools into main-2 (loonghfut)
- feat: 添加事件标签上色功能，支持通过标签自定义事件颜色 (loonghfut)
- feat: 添加事件元素块引用属性和事件提示气泡配置选项 (loonghfut)
- feat: 避免周期事件设置属性 (loonghfut)
- feat: 更新生成日程超级块内容，支持返回模板内指定块 ID (loonghfut)
- feat: 更新定时器管理逻辑，支持同时管理 setTimeout 和 setInterval，优化首次延迟计算 (loonghfut)
- feat: 更新插件版本至 0.19.2 (loonghfut)
- docs: 更新 v0.19.2 版本的更新日志 (loonghfut)
- feat: 聚合块支持聚合到日记里 (loonghfut)
- feat: 添加今日创建和今日更新过滤功能，支持本地时区 (loonghfut)
- feat: 添加时间单位选择功能，支持创建和更新的时间过滤 (loonghfut)
- feat: 更新插件版本至 0.19.3 (loonghfut)


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
