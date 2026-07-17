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
和思源深度融合的日历视图和看板视图, 同时用于生成日历文件ics，实现日程同步到支持url订阅的日历软件中，比如thunderbird，小米日历，苹果日历等，支持订阅ics链接导入其他软件日程，支持与滴答清单的初步联动。     
2. docker同步感知：    
win端s3同步后，docker端感知s3同步。  
3. ai网页侧边栏：    
嵌入了一些ai的网页，方便使用。    
4. 媒体资源压缩：  
压缩媒体资源后再导入思源。  
5. tldraw白板：【已接入思源智能体】  
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


### v0.49.1 (2026年07月17日)
- fix(tldraw-agent): 移除不必要的类型断言，直接访问 plugin.addAgentAction (loonghfut)
- feat(tldraw-agent): tldraw_open_whiteboard 支持创建新白板，自动生成关联 SiYuan 文档 (loonghfut)
- feat(agent): 建立 tools 架构替代原有 actions，引入 SiYuan 适配器层与集中式元数据管理 (loonghfut)
- docs(agent/tools): 添加 README 文档，说明 tools 模块结构与扩展方式 (loonghfut)
- feat(tldraw): 升级 tldraw 至 v5.2.3 并完成 API 适配 (loonghfut)
- chore(tldraw): 清理临时类型检查与模块增强文件 (loonghfut)
- feat(tldraw): 添加 Mermaid 导入功能与 Overlay 覆盖层支持 (loonghfut)
- `docs(agent/tools): 补充 tldraw_import_mermaid 工具 API 文档` (loonghfut)
- `refactor(tldraw): 移除 MermaidImportPanel 组件及关联状态管理代码` (loonghfut)
- chore(gitignore): 添加 AGENTS.md 到忽略列表并修复文件末尾换行 (loonghfut)
- feat(tldraw-agent): 新增 tldraw_get_visual_context 工具，增强 Agent 空间推理能力 (loonghfut)
- refactor(tldraw-shape): 重构关联块缺失的状态处理逻辑，统一 CardShape 与 SingleBlockShape 的交互流程，新增刷新、删除操作入口及对应提示 UI (loonghfut)
- fix(tldraw-shape):删除 ui-overrides 备份文件 (loonghfut)
- refactor(tldraw-shape): 重构 SingleBlockShape indicator 渲染逻辑，统一使用几何边界作为尺寸基准并添加圆角样式 (loonghfut)
- fix(tldraw-shape): 为 SingleBlockShape 内容容器添加样式类并隐藏滚动条 (loonghfut)
- refactor(tldraw-shape): 提取 getShapeHostElement 工具函数，统一 CardShape 与 SingleBlockShape 宿主元素查询逻辑 (loonghfut)
- refactor(tldraw-shape): 提取 export-dom-snapshot 序列化工具，统一 CardShape 与 SingleBlockShape 的 DOM 快照导出逻辑 (loonghfut)
- feat(tldraw-export): 添加 SVG 导出快照缓存与进度提示，统一导出准备流程并支持异步资源加载 (loonghfut)
- feat(tldraw-export): 新增导出图片质量与像素比设置项，统一配置获取接口并优化宿主元素查询与运行时节点清理 (loonghfut)
- refactor(tldraw-shape): 提取 canBindBranchToTarget 工具函数，统一 CardShape、SingleBlockShape 与 BranchShape 的绑定策略逻辑 (loonghfut)
- fix(tldraw-branch): 移除冗余分支绑定策略文件，统一各形状 canBind 实现并新增分支结构自动修复逻辑 (loonghfut)
- refactor(tldraw-branch-layout): 迁移分支结构修复逻辑至统一布局模块，关联操作后自动触发修复并调整单块形状默认文字颜色 (loonghfut)
- fix(manager-ops): 修复思源块创建后 SQL 索引未就绪的竞态问题，新增等待块可查询机制 (loonghfut)
- feat(tldraw-card): 卡片形状新增内部间隙与内阴影渲染，导出 SVG 时增加背景色描边以保持视觉一致性 (loonghfut)
- chore(deps): 升级 React 与 ReactDOM 依赖版本至 19.2.1 (loonghfut)
- perf(svg-export): 新增大批量形状导出时的轮廓渲染模式，超过阈值自动启用以提升导出性能，适配卡片与单块形状的轮廓导出逻辑 (loonghfut)
- feat(svg-export): 将导出轮廓模式的形状数量阈值从硬编码改为可配置，新增设置项支持用户自定义阈值，提升导出性能调整的灵活性 (loonghfut)
- feat(handwriting): 将双击画板空白处创建形状的配置项从布尔开关升级为下拉选择，支持文本与单块两种模式，同时兼容旧版布尔配置的自动转换 (loonghfut)
- feat(branch): 优化空分支视觉呈现与布局逻辑，修复多级分支粘贴错乱及根节点删除后的分支清理问题 (loonghfut)
- fix(branch): 修复分支布局坐标计算逻辑，统一使用页面坐标替代本地坐标，解决嵌套父级形状下的位置偏移问题 (loonghfut)
- fix(branch): 修复撤销/重放历史时分支布局更新的误判问题，避免历史重放过程中形状被错误处理为剪贴板粘贴导致ID重映射 (loonghfut)
- refactor(branch): 移除 childIds 属性，统一使用 rightChildIds，更新版本号至 6 (loonghfut)
- fix(branch): 修复分支对齐和布局逻辑，优化形状中心计算，确保正确的页面坐标更新 (loonghfut)
- refactor(InFrontOfCanvas): 更新中心分支函数调用，统一处理卡片和单块形状 (loonghfut)
- fix(branch): 修复分支与根形状同时选中时拖拽导致坐标重复计算的问题 (loonghfut)
- fix(SingleBlockShapeUtil): 修复单块形状的背景透明与边框显示逻辑，确保导出一致性 (loonghfut)
- feat(export-image): 支持 PNG 导出时填充思源笔记主题背景 (loonghfut)
- fix(export-image): 修复导出背景未启用时仍强制合成主题背景的问题 (loonghfut)
- feat(card): 优化卡片创建流程，支持按卡片隔离并发控制与标题询问 (loonghfut)
- style(handwriting): 修复手写画布前景元素层级显示异常 (loonghfut)
- feat(dialog, card): 输入对话框新增回车确认能力，优化交互与焦点逻辑 (loonghfut)
- refactor(handwriting): 移除冗余自定义嵌入定义，仅保留哔哩哔哩嵌入类型 (loonghfut)
- fix(handwriting): 修复 MermaidPasteHandler 组件卸载时未注销外部内容处理器的问题 (loonghfut)
- fix(handwriting): 修复 tldraw 5.2.3 中 Canva 嵌入图标资源缺失导致的 404 错误 (loonghfut)
- feat(handwriting): 右键菜单新增嵌入/书签切换，支持普通网页 iframe 嵌入 (loonghfut)
- refactor(handwriting): 优化分支布局更新逻辑，采用邻接表+BFS提升连接查找性能 (loonghfut)
- perf(handwriting): 优化分支布局函数调用，透传分支列表减少重复查询并移除冗余pageShapes字段 (loonghfut)
- feat(handwriting): 新增Slide截图侧边栏dock及暂存存储能力，重构Slide与思源块的关联逻辑移除shape上冗余的blockId字段，优化链接构建实现 (loonghfut)
- feat(SlideShape): 支持幻灯片截图关联多个思源块，优化关联块查找与批量更新逻辑 (loonghfut)
- fix(handwriting): 修正Slide截图侧边栏图标为图片图标 (loonghfut)
- refactor(handwriting): 抽离思源主题同步工具至独立模块，采用 requestAnimationFrame 防抖优化主题监听性能，补充 tldraw 按钮与滑块的主题样式适配 (loonghfut)
- fix(siyuan-theme): 注释思源主题同步工具中的光标颜色配置项，修复光标样式显示异常问题 (loonghfut)
- refactor(SlideShape): 重构Slide截图保存逻辑，移除冗余的思源块关联、图片上传及块更新流程，简化操作路径仅保留侧边栏暂存能力 (loonghfut)
- refactor(SlideShape): 重构Slide截图存储与关联逻辑，将本地dataUrl存储改为上传后imageUrl存储，移除冗余的图片上传、思源块关联及块更新流程，简化操作路径仅保留侧边栏暂存能力；新增capture接口可选返回dataUrl，升级store数据版本至v2 (loonghfut)
- feat(SlideShape): 实现Slide截图关联思源块自动更新逻辑，抽离uploadSlideScreenshotImage方法统一复用资源上传路径 (loonghfut)
- style(CustomStylePanel, SlideShape): 为Slide名称输入框添加专属className，补充自定义样式面板输入框的视觉对齐规则与交互反馈样式，统一组件视觉规范 (loonghfut)
- feat(SlidesPanel): 重构SlidesPanel样式架构，新增面板折叠、幻灯片拖拽排序与重命名交互能力，统一CSS变量前缀为tl-规范替换原有主题变量引用 (loonghfut)
- feat(SlidesPanel): 新增响应工具栏方向的布局能力，工具栏垂直时面板改为底部横向排列，拖拽排序逻辑适配横向/纵向模式 (loonghfut)
- refactor(agent): 新增相机聚焦核心模块，统一视图定位与缩放逻辑，替换原有 zoomToSelection 调用，支持计划执行后自动聚焦与视口中心计算 (loonghfut)
- feat(ui-overrides): 为全部自定义注册工具补充工具栏拖拽创建能力，统一复用onDragFromToolbarToCreateShape实现拖拽生成对应形状 (loonghfut)
- refactor(link-builder, module-handwriting): 重构tldraw深链接构建逻辑，移除buildTldrawLink冗余title参数，新增动态查询白板标题能力 (loonghfut)
- feat(tldraw-link-icon): 抽离tldraw链接图标监听逻辑为独立控制器，新增搜索预览场景图标同步能力 (loonghfut)
- feat(search): 新增搜索面板，支持文本搜索与快速操作集成 (loonghfut)
- feat(sync-tldraw): 新增同步到 tldraw 的脚本及 npm 命令 (loonghfut)
- chore(plugin): 升级插件版本号至 0.49.0 (loonghfut)
- docs: 更新 v0.49.0 版本的更新日志 (loonghfut)
- feat(BezierConnectorShape): 支持自动端口与形状级连接吸附 (loonghfut)
- fix(BezierConnectorShape): 修复拖拽端点不跟手与 branch 误吸附问题 (loonghfut)
- chore(plugin): 升级插件版本号至 0.49.1 (loonghfut)


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
