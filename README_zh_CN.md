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


### v0.31.2 (2025年12月24日)
- feat: 注释掉处理图片下载的逻辑，简化附件处理 (loonghfut)
- feat: 添加生成链接卡片的功能，支持插入为卡片格式 (loonghfut)
- feat: 更新依赖项 siyuan 至版本 1.1.6 (loonghfut)
- feat: 移除 CardShapeUtil 中的 defId 属性，简化实例化逻辑 (loonghfut)
- feat: 移除多个渲染器，整合为使用思源原生渲染方法 (loonghfut)
- feat: 更新最小应用版本至 3.5.1 (loonghfut)
- feat: 添加配置选项以控制 Card 形状边框的显示 (loonghfut)
- feat: 根据设置选项控制 Card 边框的显示和端口偏移 (loonghfut)
- feat: 优化 CardShapeUtil 中的 DOM 渲染逻辑，确保依赖已挂载的 DOM 进行内容渲染 (loonghfut)
- feat: 重写 CardShapeUtil 中的 canCull 方法，始终返回 false (loonghfut)
- feat: 添加对主卡片的支持，优化静态预览获取逻辑 (loonghfut)
- feat: 添加 shouldSkipMeasurement 参数以控制尺寸测量逻辑 (loonghfut)
- feat: 更改配置 (loonghfut)
- feat: 添加线条样式支持，允许选择实线或虚线 (loonghfut)
- feat: 添加任务同步锁和时间戳管理，优化防抖同步逻辑 (loonghfut)
- 优化AI功能体验 (loonghfut)
- feat: 添加加载错误状态管理，优化尺寸测量逻辑 (loonghfut)
- feat: 将链接保存到自定义属性中，优化块内容管理 (loonghfut)
- feat: 添加自定义链接图标支持，优化链接处理逻辑 (loonghfut)
- feat: 优化图标点击处理逻辑，添加链接解码和调度注入功能 (loonghfut)
- feat: 更新块属性以支持自定义链接，优化块管理逻辑 (loonghfut)
- feat: 重构画板设置，新增高级设置分组，优化设置项组织 (loonghfut)
- feat: 优化样式，调整特定元素的显示属性和内边距，改善用户界面体验 (loonghfut)
- feat: 添加自定义卡片标题设置，支持使用时间戳变量 (loonghfut)
- feat: 在块属性中添加自定义标志以支持新功能 (loonghfut)
- feat: 在.gitignore中添加tldraw-main以排除相关文件 (loonghfut)
- feat: 添加贝塞尔连接器的富文本标签支持，优化标签交互与样式 (loonghfut)
- feat: 添加连接线类型互换功能，支持批量转换箭头与贝塞尔连接器 (loonghfut)
- feat: 当工具为手型时，隐藏端口以优化用户体验 (loonghfut)
- feat: 添加延时显示功能，优化端口在父元素悬停时的可见性 (loonghfut)
- feat: 优化内容渲染，使用临时 Protyle 实例并在渲染后销毁 (loonghfut)
- feat: 添加手势支持，优化手型工具的交互体验 (loonghfut)
- feat: 添加 canCull 方法，禁止形状被裁剪 (loonghfut)
- feat: 注释掉输入框样式以便于调试 (loonghfut)
- feat: 根据设置动态调整js边框样式 (loonghfut)
- feat: 添加获取嵌入 DOM 内容的功能，优化静态 DOM 内容处理 (loonghfut)
- feat: 添加 protyle-html 转换为普通 DOM 的功能，优化内容渲染 (loonghfut)
- feat: 优化手动刷新逻辑，支持通过 refreshNonce 触发缓存绕过 (loonghfut)
- feat: 添加 tl-html-container 样式以优化渲染节点的最小高度 (loonghfut)
- feat: 添加模块加载检查，防止重复加载已加载模块 (loonghfut)
- feat: 更新版本号至0.31.0，并优化错误提示信息以指导用户使用高版本插件 (loonghfut)
- docs: 更新 v0.31.0 版本的更新日志 (loonghfut)
- feat: 添加白板文件更新机制，支持删除和刷新操作的自动通知 (loonghfut)
- feat: 添加延迟删除机制以应对 tldraw 自动保存竞争问题 (loonghfut)
- 优化日志输出 (loonghfut)
- feat: 更新版本号至0.31.1 (loonghfut)
- docs: 更新 v0.31.1 版本的更新日志 (loonghfut)
- docs: 更新感谢名单 (loonghfut)
- 删除无用代码 (loonghfut)
- feat: 添加 cameraSlideFriction 选项以增强相机滑动效果 (loonghfut)
- Refactor code structure for improved readability and maintainability (loonghfut)
- feat: 在编辑器初始化时启用自动对齐模式 (loonghfut)
- feat: 更新吸附模式设置，允许根据用户偏好配置 (loonghfut)
- feat: 添加画布点击清除文本选区功能，并在销毁时移除监听器 (loonghfut)
- feat: 修改 MindMapBindingUI 和 CustomStylePanel 中的 zoomIn 属性为 false (loonghfut)
- feat: 更新插件版本至 0.31.2 (loonghfut)


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
