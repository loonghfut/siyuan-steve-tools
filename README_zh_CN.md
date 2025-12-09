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


### v0.27.2 (2025年12月09日)
- feat(mind-map): 添加子节点功能，更新相关组件和事件处理 (loonghfut)
- feat(context-menu): 添加编辑状态支持，允许在上下文菜单和键盘操作中进入编辑模式 (loonghfut)
- feat(mind-map): 添加确认对话框功能，支持节点删除和文本编辑实时更新 (loonghfut)
- feat(mind-map): 更新动作数组，支持获取所有数据 (loonghfut)
- feat(single-block): 添加 allowBinding 属性，支持绑定状态的动态切换 (loonghfut)
- feat(single-block): 添加透明背景属性，支持背景和边框的动态切换 (loonghfut)
- refactor(tldraw): 移除双击进入编辑模式的功能（tldraw自带有双击进入编辑的功能） (loonghfut)
- feat(CardShapeUtil, SingleBlockShapeUtil): 添加编辑模式切换时聚焦到形状的功能 (loonghfut)
- feat(CardShapeUtil, SingleBlockShapeUtil): 添加编辑模式切换时聚焦到形状并恢复视角的功能 (loonghfut)
- feat(CustomQuickActions): 将样式移至外层容器并更新图标以支持编辑时聚焦功能 (loonghfut)
- feat: add Bezier connector shape with interactive ports (loonghfut)
- feat: 重构端口相关功能，优化连接器状态管理与事件处理 (loonghfut)
- feat(CustomStylePanel): 添加贝塞尔连接器的颜色和线宽自定义功能 (loonghfut)
- feat(BezierConnectorShapeUtil): 添加拖拽过程中目标端口信息的存储与处理逻辑 feat(bezier-connector-binding): 优化连接器绑定更新逻辑，避免重复写入 fix(keep-connectors-at-bottom): 添加防重入锁以避免嵌套循环 (loonghfut)
- feat(BezierConnectorShape): 优化贝塞尔曲线控制点计算逻辑，支持垂直和水平主导控制点；更新端口定位逻辑，新增上下端口支持 (loonghfut)
- feat(Port): 调整端口位置偏移逻辑，统一向左和向上偏移 3px (loonghfut)
- feat(Port): 添加连接状态判断，优化端口可交互性；更新端口容器以支持悬停状态 (loonghfut)
- feat(BezierConnectorShape): 优化贝塞尔连接器端口样式，调整大小和颜色逻辑，增强可视化效果 (loonghfut)
- feat(BezierConnectorComponent): 添加端点原点可视化，增强连接器的可视化效果 (loonghfut)
- feat(SingleBlockShapeUtil): 添加悬停状态管理，增强组件交互性 (loonghfut)
- feat(CustomStylePanel): 添加连接器宽度和颜色输入样式，优化用户交互体验 (loonghfut)
- feat(BezierConnectorShapeUtil): 调整贝塞尔连接器的线宽，从2增加到3，优化视觉效果 (loonghfut)
- feat(BezierConnectorShapeUtil): 添加 SVG 导出功能，支持连接器的序列化和可视化 (loonghfut)
- fix(BezierConnectorShapeUtil): 调整连接器线宽，确保最小值为0.5以优化视觉效果 (loonghfut)
- fix(BezierConnectorShapeUtil): 调整贝塞尔连接器的线宽计算，确保更好的视觉效果 (loonghfut)
- refactor(BezierConnectorComponent): 提取渲染逻辑到 renderConnectorPathAndEndpoints 函数，优化代码复用 (loonghfut)
- fix(BezierConnectorShape): 使用 tldraw 官方颜色代替自定义十六进制颜色，优化连接器颜色一致性 (loonghfut)
- feat(BezierConnectorShapeUtil): 引入主题颜色，优化连接器的颜色一致性和可视化效果 (loonghfut)
- fix(BezierConnectorComponent): 优化主题颜色获取逻辑，确保在主题切换时正确渲染连接器颜色 (loonghfut)
- fix(PointingPort): 调整连接器的线宽，使用官方颜色代替自定义颜色 (loonghfut)
- feat(BezierConnectorShapeUtil): 增强控制点计算逻辑，支持端口方向优先，优化连接器路径生成 (loonghfut)
- feat(BezierConnectorShape): 移除端口连接限制，支持任意端口互连 (loonghfut)
- feat(port-utils): 引入缓存机制优化端口位置计算，提升性能和准确性 (loonghfut)
- fix(ui-overrides): 注释掉删除文本工具的代码 (loonghfut)
- feat(connection): 支持选择连接器类型（箭头/贝塞尔）并优化连接逻辑 (loonghfut)
- feat(SingleBlockShapeUtil): 在透明模式下隐藏端口覆盖层 (loonghfut)
- fix(CustomStylePanel): 修复连接模式状态管理，优化按钮样式 (loonghfut)
- feat(CustomStylePanel): 添加切换按钮行和样式，优化单块形状的连接和透明背景设置 (loonghfut)
- fix(connection): 确保状态变化通知函数有效，避免传入非函数值 (loonghfut)
- chore(plugin): 更新版本号至0.27.0 (loonghfut)
- docs: 更新 v0.27.0 版本的更新日志 (loonghfut)
- fix(TldrawManager): 修改获取块内容的方法，从 getBlockByID 更改为 getBlockKramdown (loonghfut)
- chore(plugin): 更新版本号至0.27.1 (loonghfut)
- feat(TldrawManager): 添加将链接插入kramdown内容末尾的功能 (loonghfut)
- chore(plugin): 更新版本号至0.27.2 (loonghfut)


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
