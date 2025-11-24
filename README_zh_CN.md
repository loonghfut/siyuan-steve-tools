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


### v0.23.0 (2025年11月24日)
- fix: 注释掉不必要的属性以简化组件配置 (loonghfut)
- 优化跳转聚焦情况 (loonghfut)
- feat: 添加文档块题头图渲染选项 (loonghfut)
- feat: 添加对段落类型的处理逻辑以更新和创建形状 (loonghfut)
- 优化块删除逻辑 (loonghfut)
- 优化单一块样式 (loonghfut)
- 优化悬浮按钮 (loonghfut)
- feat: 添加单一块类型的高度还原按钮 (loonghfut)
- 优化块的尺寸计算，确保宽高不小于1像素 (loonghfut)
- 优化自定义样式面板，添加背景选项并移除按钮事件冒泡处理 (loonghfut)
- feat: 添加选择相邻图形功能，支持上下左右方向选择 (loonghfut)
- feat: 添加编辑选中图形功能，支持通过回车键编辑单一选中图形 (loonghfut)
- feat: 优化相邻图形选择功能，合并方向选择逻辑并保持选中图形居中 (loonghfut)
- feat: 添加 DOM 尺寸测量功能，优化 single-block 形状的高度计算与观察 (loonghfut)
- fix: 调整单块形状的最小高度，从 28 增加到 50 (loonghfut)
- 增加单独渲染设置 (loonghfut)
- 记录点：快速创建箭头 (loonghfut)
- feat: 优化连接功能，创建绑定箭头指向新形状 (loonghfut)
- refactor: 移除思维导图节点工具和形状工具的相关代码 (loonghfut)
- refactor: 清理不必要的 CSS 规则，优化单块形状的复选框样式 feat: 修改回车新建时连接的行为，增强用户体验 refactor: 精简选择相邻形状的逻辑，优化候选形状的选择策略 (loonghfut)
- feat: 添加连接模式管理器，支持形状之间的连接功能 (loonghfut)
- 优化退出连接逻辑 (loonghfut)
- 优化状态按钮颜色 (loonghfut)
- feat: 更新连接模式管理器，支持选中创建的箭头并返回箭头ID (loonghfut)
- feat: 添加排列相连单块形状的功能，支持上下左右排列 (loonghfut)
- fix: 修复箭头绑定逻辑，确保正确识别连接的单块形状 (loonghfut)
- feat: 更新箭头选择和显示逻辑，确保新创建的箭头在底层并调整箭头头部样式 (loonghfut)
- feat: 增加 Protyle 实例构造的超时与异常保护，避免加载队列阻塞 (loonghfut)
- fix: 更新样式面板逻辑，确保正确处理单块形状和卡片选择 (loonghfut)
- feat: 添加关联单块创建功能，支持在画布上点击放置并生成箭头连接 (loonghfut)
- feat: 引入全局形状加载管理器，优化重载控制与可见性管理 (loonghfut)
- feat: 添加 isNewlyCreated 属性，延迟在编辑时创建思源块以保持用户体验一致性 (loonghfut)
- Merge branch 'main-2' into 性能优化 (loonghfut)
- feat: 添加最大激活形状数设置，优化资源管理 (loonghfut)
- feat: 优化卡片形状的预览样式，调整字体大小和透明度 (loonghfut)
- feat: 修改预览加载提示文本为“双击加载内容” (loonghfut)
- feat: 添加 TProtyleAction 类型支持，优化 Protyle 实例创建时的动作处理 (loonghfut)
- feat: 优化连接块的样式面板，调整按钮布局和图标 (loonghfut)
- feat: 调整连接箭头的样式，修改起始和结束箭头的显示 (loonghfut)
- feat: 更新新创建形状的处理逻辑，确保在编辑态下正确创建块 (loonghfut)
- feat: 更新样式和背景设置，优化界面一致性 (loonghfut)
- feat: 增强强制创建新画板的备份逻辑，添加用户确认提示 (loonghfut)
- feat: 添加画板备份回滚功能，集成备份管理面板 (loonghfut)
- feat: 添加备份预览功能，显示形状和页面信息 (loonghfut)
- feat: 添加白板卡片视图组件，支持白板列表展示与操作 (loonghfut)
- feat: 优化搜索框失焦处理，添加按下Esc键清空搜索功能 (loonghfut)
- feat: 实现动态增量加载白板卡片，支持触底自动加载与手动加载功能 (loonghfut)
- feat: 更新白板卡片视图，调整显示选项和样式 (loonghfut)
- feat: 调整搜索框样式，修改最小宽度以优化用户体验 (loonghfut)
- feat: 优化搜索框切换逻辑，保留查询状态以提升用户体验 (loonghfut)
- feat: 实现动态增量加载白板卡片，优化元数据抓取与排序逻辑 (loonghfut)
- feat: 更新 ShapeLoadManager 以支持多个 tldraw 实例，每个形状注册其独立编辑器 (loonghfut)
- feat: 添加 getDocOutline 接口及相关类型定义，支持文档大纲获取功能 (loonghfut)
- feat: 更新版本号至 0.23.0 (loonghfut)


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
