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


### v0.47.0 (2026年07月04日)
- feat(handwriting): 支持思源智能体操作 tldraw 白板（开发中） (loonghfut)
- refactor(handwriting/tldraw-agent): 重构智能体白板形状创建逻辑，支持卡片、单块和分支结构 (loonghfut)
- feat(handwriting/tldraw-agent): 新增智能体形状参数校验与颜色规范化 schema (loonghfut)
- feat(handwriting/tldraw-agent): 新增智能体文档大纲读取与思维导图插入功能 (loonghfut)
- refactor(handwriting/tldraw-agent): 重构智能体白板形状创建逻辑，拆分为独立模块并优化类型定义 (loonghfut)
- feat(handwriting/tldraw-agent): 新增智能体白板查询、形状操作与导航功能 (loonghfut)
- refactor(handwriting/tldraw-agent): 重构智能体动作注册机制，模块化提取白板列表、能力声明与快照摘要 (loonghfut)
- feat(handwriting/tldraw): 引入智能体运行时抽象层，解耦白板管理与代理操作 (loonghfut)
- fix(handwriting/tldraw-agent): 增加 connector 端点坐标验证，防止无效数值 (loonghfut)
- feat(handwriting/tldraw-agent): 为所有智能体动作增加未知参数校验，支持通过 shapeIds 创建连接器 (loonghfut)
- fix(handwriting/tldraw-agent): 统一 zoom 默认值为 true，删除形状前增加白板备份 (loonghfut)
- feat(handwriting/tldraw-agent): 创建形状前增加 blockId 格式与类型验证 (loonghfut)
- fix(handwriting/tldraw-agent): 处理无标题块文档，自动创建回退标题 (loonghfut)
- feat(handwriting/tldraw-agent): 新增创建总结子文档白板能力 (loonghfut)
- `feat(handwriting/tldraw-agent): 为智能体动作增加交互上下文前置校验与白板聚焦跟踪` (loonghfut)
- `refactor(handwriting/tldraw-agent): 统一快照摘要提取逻辑，补充形状创建工具使用引导` (loonghfut)
- `feat(handwriting/tldraw-agent): 增强智能体工具选择与形状创建参数处理` (loonghfut)
- `feat(handwriting/tldraw-agent): 为智能体动作添加活动状态高亮与执行反馈` (loonghfut)
- `docs(handwriting/tldraw-agent): 优化智能体工具描述并补充使用引导` (loonghfut)
- feat(handwriting/tldraw-agent): 扩展形状更新能力，支持卡片折叠状态控制 (loonghfut)
- `feat(handwriting/tldraw-agent): 引入计划执行器，支持通过 JSON 步骤批量编排白板操作` (loonghfut)
- refactor(handwriting/tldraw-agent): 重构智能体模块目录结构，按领域拆分到独立子目录 (loonghfut)
- fix(handwriting/tldraw-agent/whiteboards): 修复白板列表项标题字段的类型断言问题 (loonghfut)
- feat(handwriting/tldraw-agent): 增强形状创建能力声明，支持 frame 并优化默认类型引导 (loonghfut)
- feat(handwriting/tldraw-agent): 增加形状边界查询与卡片内容创建能力 (loonghfut)
- feat(handwriting/tldraw-agent): 增强 single-block 创建能力，支持内容 Markdown 与 kind 别名规范化 (loonghfut)
- feat(handwriting/tldraw-agent): 增强卡片内容创建能力，支持 Markdown 标题提取与级别保留 (loonghfut)
- feat(handwriting/tldraw-agent): 为所有 agent action 与 plan 应用添加 resultMode 参数，默认返回紧凑结果 (loonghfut)
- `refactor(handwriting/tldraw-agent): 优化 agent 工具返回体积，默认省略原始形状 ID 与样本数据` (loonghfut)
- feat(handwriting/tldraw-agent): 为 apply_plan 添加 branch 操作，支持 mind map 与层次布局 (loonghfut)
- refactor(handwriting/tldraw-agent): 将智能体白板操作开关移至高级设置分组 (loonghfut)
- feat(handwriting/tldraw-agent): 为形状详情与交互上下文添加关联块内容获取能力 (loonghfut)
- feat(handwriting/tldraw-agent): 为卡片形状关联块增加子内容加载与层级摘要支持 (loonghfut)
- fix(handwriting/tldraw-agent): 修复 note 形状尺寸属性更新支持问题 (loonghfut)
- chore(handwriting): 为智能体白板操作选项添加测试中标记 (loonghfut)
- feat(handwriting/tldraw-agent): 为摘要子文档创建添加 hPath 支持与路径验证 (loonghfut)
- refactor(handwriting/tldraw-agent): 将摘要子文档相关命名统一重命名为摘要文档 (loonghfut)
- feat(handwriting/tldraw-agent): 为连接器添加 branch 类型支持 (loonghfut)
- feat(handwriting/tldraw-agent): 新增 tldraw_edit_board 智能体动作与白板编辑引擎 (loonghfut)
- fix(handwriting/tldraw-agent): 为白板编辑操作添加写入预算限制与字段互斥校验 (loonghfut)
- fix(handwriting/tldraw-agent): 修正智能体动作注册为位置参数调用并统一编辑参数别名处理 (loonghfut)
- refactor(handwriting/tldraw-agent): 移除冗余动作注册并将 tldraw_edit_board 设为唯一写入入口 (loonghfut)
- `feat(handwriting/tldraw-agent): 支持操作别名规范化及动态选择表达式` (loonghfut)
- chore(deps): 升级 siyuan 依赖版本至 ^1.2.2 (loonghfut)
- fix(handwriting/tldraw-agent): 修正智能体动作注册为对象参数调用 (loonghfut)
- refactor(handwriting/tldraw-agent): 重构智能体提示词并补全参数别名与布局锚点容错 (loonghfut)
- feat(handwriting/tldraw-agent): 新增 tldraw_shape_command 动作并扩展 edit_board 节点类型与方向支持 (loonghfut)
- refactor(handwriting/tldraw-agent): 移除 tldraw_edit_board 动作并统一使用 tldraw_shape_command (loonghfut)
- feat(handwriting/tldraw-agent): 扩展 tldraw_shape_command 支持图形创建、连接、布局与聚焦操作 (loonghfut)
- `refactor(handwriting/tldraw-agent): 重构 shapeCommand 参数解析逻辑，增强目标对象与补丁构建灵活性` (loonghfut)
- fix(handwriting/tldraw-agent): 修正 shapeCommand 参数规范化逻辑，明确前端直接传参约定 (loonghfut)
- chore(handwriting/tldraw-agent): 添加 agent action 调用日志与错误追踪 (loonghfut)
- refactor(handwriting/tldraw-agent): 重构分支连接逻辑并增加图形类型校验 (loonghfut)
- docs(handwriting/tldraw-agent): 补充分支连接操作指引，明确自动布局约束 (loonghfut)
- feat(handwriting/tldraw-agent): 支持分支连接 side 参数与子节点侧边切换 (loonghfut)
- fix(handwriting/tldraw-branch): 增加分支连接校验，防止循环引用、重复根节点及非法形状类型 (loonghfut)
- feat(handwriting/tldraw-agent): 新增图形删除 action 并更新自动保存与执行权限说明 (loonghfut)
- fix(handwriting/tldraw-agent): 关联块形状删除权限收紧，需同时设置 allow 与 confirm 参数 (loonghfut)
- feat(handwriting/tldraw-agent): connect分支步骤支持side参数，补充连接器结果shape id归一化逻辑；修复分支连接提升根子节点过滤与分离问题，修正分支子节点id解析逻辑 (loonghfut)
- feat(handwriting/tldraw-agent): 新增 Agent 操作权限配置，支持自定义暴露给思源智能体的 actions 列表 (loonghfut)
- refactor(handwriting/tldraw-agent): 移除 shapes 目录下低级操作 action，新增 planning/document 高级动作，增加 defaultEnabled 控制默认启用列表 (loonghfut)
- feat(plugin): 适配思源 3.7.0 BCP 47 语言标识符规范，升级 minAppVersion 并统一 i18n 与文档命名 (loonghfut)
- chore(plugin): 升级插件版本至0.47.0，补充白板接入思源智能体的相关标注与说明 (loonghfut)
- docs(readme): 更新插件预览图片，新增预览图展示效果 (loonghfut)


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
