STEVETOOLS
==========
[![GitHub release (latest by date)](https://img.shields.io/github/v/release/loonghfut/siyuan-steve-tools)](https://github.com/loonghfut/siyuan-steve-tools/releases)
[![GitHub stars](https://img.shields.io/github/stars/loonghfut/siyuan-steve-tools)](https://github.com/loonghfut/siyuan-steve-tools/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/loonghfut/siyuan-steve-tools)](https://github.com/loonghfut/siyuan-steve-tools/issues)
[![GitHub license](https://img.shields.io/github/license/loonghfut/siyuan-steve-tools)](https://github.com/loonghfut/siyuan-steve-tools/blob/main/LICENSE)
[![GitHub all releases](https://img.shields.io/github/downloads/loonghfut/siyuan-steve-tools/total)](https://github.com/loonghfut/siyuan-steve-tools/releases)

这是一个自用工具集合，在我自己使用的同时，分享出来也希望能够帮助到有相关需求的其他人。`<所有功能开源免费>`

（注：由于是自用工具插件，可能会有一些不完善的地方，甚至出现数据遗失！！（因为使用了思源数据操作相关的api），请自行测试无问题的情况下再使用，若在使用过程中出现问题，请及时反馈）   
 若介意请勿使用。
### 若发现BUG或者有好的建议，欢迎提issue或者PR。
由于最近几乎没有收益，因此功能的开发主要取决于我个人需求和相关功能使用情况，不再考虑开发和维护个人用不到且使用人数很少的功能（帮助过我的用户的需求除外），毕竟这本就是自用免费分享插件。

### [问题反馈请在社区发帖](https://ld246.com/post?type=5)  
（请优先在GitHub上反馈，实在访问不了再用社区发帖）
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

#### 目前主要是我自己使用，实在没精力和动力去制作详细教程（简单的使用方式会在社区发）。要是您希望我能制作详细教程，请[打赏](https://pic.imgdb.cn/item/6751b929d0e0a243d4de55a7.png)或者给项目点 [star](https://github.com/loonghfut/siyuan-steve-tools) ，若长期没有打赏和star，后续的功能交互提示可能会很潦草，还请见谅。

#### 更新日志:

### v0.11.1 (2025年08月02日)
- docs: 更新 v0.11.0 版本的更新日志 (loonghfut)
- docs: 更新 v0.11.0 版本的更新日志 (loonghfut)
- 滴答：优化用户提示 (loonghfut)
- 优化Protyle配置 (loonghfut)
- fix #89 (loonghfut)
- feat: 添加工具函数以获取所有视图ID并去重 #89 (loonghfut)
- feat: 添加 NetworkClient 类 (loonghfut)
- 统计升级 (loonghfut)
- 优化构建 (loonghfut)
- 更新设置描述 (loonghfut)
- 增加事件统计功能（视图筛选右侧） (loonghfut)
- 更新版本号至 0.11.1 (loonghfut)


更多详见[提交记录](https://github.com/loonghfut/siyuan-steve-tools/commits/main-2/)

#### 感谢：
- [wilsons](https://ld246.com/member/wilsons)：开发`生成日历文件ics功能`指导
- [Frostime](https://ld246.com/member/Frostime): 提供插件开发模板和开发工具包
- [seanduo](https://github.com/seanduo)：PR
- [BoysFight](https://github.com/BoysFight)：PR lifelog功能
- [Achuan-2](https://ld246.com/member/Achuan-2)：提供看板示例参考
- [空幽]()：打赏支持 `the first ` `the most`
- [挥墨留香](): 打赏支持 `the second `
- [博]()：打赏支持 `the third `
- [林（新塘版）]()：打赏支持 `the fourth `
- [VeryZHH]()：打赏支持 `the fifth ` 
- [5kyfkr](),[nco](),[谭*]()：打赏支持 `the newest `
[更多。。](https://github.com/loonghfut/siyuan-steve-tools/blob/main-2/sponsor.md)
#### 说明
- 日历视图基于fullcalendar开发，感谢fullcalendar的开发者。
- 画板视图基于tldraw开发，感谢tldraw的开发者。
#### 打赏
如果你觉得这个项目对你有帮助，欢迎打赏，以激励我更好的维护和更新这个项目。  
<img src="https://pic.imgdb.cn/item/6751b929d0e0a243d4de55a7.png" alt="图片描述" width="400" />


#### 免责声明
- 在介绍页面中，已提示本插件可能会有数据遗失的情况，请自行测试无问题的情况下再使用，作者不为你使用本产品所产生的任何后果负责。
- 禁止使用本产品用于任意违法乱纪相关行为。 作者不为你使用本产品所产生的任何后果负责。
