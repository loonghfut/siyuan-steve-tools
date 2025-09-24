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

#### 开发动力来源[打赏](https://pic.imgdb.cn/item/6751b929d0e0a243d4de55a7.png) [star](https://github.com/loonghfut/siyuan-steve-tools) 

#### 更新日志:


### v0.15.1 (2025年09月24日)
- 增加实时预览查询 (loonghfut)
- feat: 添加结果预览和工具提示功能，优化筛选区域的折叠状态持久化 (loonghfut)
- feat: 添加 SQL 结果预览列设置，支持自定义列显示 (loonghfut)
- feat: 添加 SQL 可视化生成器tab模式支持 (loonghfut)
- feat: 优化 SQL 复制功能，添加内容修剪和包装 (loonghfut)
- feat: 添加筛选预设控制功能，支持保存和应用预设 (loonghfut)
- feat: 优化加载状态显示，添加骨架屏和淡入动画效果 (loonghfut)
- 修复部分样式错误 (loonghfut)
- feat: 添加当前预设名称显示功能，优化预设状态更新逻辑 (loonghfut)
- 优化部分设置描述 (loonghfut)
- feat: 添加复制嵌入块功能，优化确认模态框参数 (loonghfut)
- feat: 添加预设快速切换功能，优化预设菜单样式和事件处理 (loonghfut)
- feat: 添加预设去重功能，优化保存预设流程 (loonghfut)
- feat: 优化当前预设名称更新逻辑，添加基于内容自动匹配功能 (loonghfut)
- feat: 调整“无限高”模式下的最大高度，优化局部滚动体验 (loonghfut)
- feat: 添加行号列到可视化 SQL 表格，优化表格样式和列宽自适应 (loonghfut)
- feat: 添加 SQL 结果预览列最大宽度设置，优化可视化表格显示 (loonghfut)
- feat: 优化嵌入块按钮文本，提升用户界面友好性 (loonghfut)
- feat: 更新插件版本号至 0.15.0 (loonghfut)
- docs: 更新 v0.15.0 版本的更新日志 (loonghfut)
- feat: 添加结果预览刷新按钮，支持实时查询更新 (loonghfut)
- feat: 增强 SQL 规则表达式处理，支持数字字段的有效性检查 (loonghfut)
- feat: 添加多选下拉交互，优化筛选功能的用户体验 (loonghfut)
- feat: 添加分段嵌入功能，支持时间段的 SQL 查询与预览 (loonghfut)
- 优化部分细节 (loonghfut)
- feat: 优化分段嵌入复制功能，增加结果探测与空段过滤 (loonghfut)
- fix: 更新 QQ 日历事件获取逻辑，确保首次进入面板时拉取并写入事件缓存 (loonghfut)
- fix: 更新插件版本号至 0.15.1 (loonghfut)


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
