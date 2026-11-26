# 代码地图

Phaser 3 + TypeScript 竖屏经营游戏。领域词汇见根目录 `GLOSSARY.md`，设计决策见 `docs/adr/`。

## 分层

| 文件 | 职责 |
|---|---|
| `config.ts` | **所有玩法数值**（`GAME`）与加载校验。调数值只改这里。 |
| `logic.ts` | 纯规则函数，不依赖 Phaser/DOM，`logic.test.ts` 覆盖。读 `config.ts`。 |
| `booth.ts` | **雅座生命周期**（纯逻辑）：领座→等菜→烹饪→待传→传菜→用膳→离店的全部状态切换、清空、选下一桌、桌卡文字。场景不直接改雅座字段，只调这里。`booth.test.ts` 覆盖。 |
| `save.ts` | **存档编解码**（纯逻辑）：`newSave`（新档，所有开局数值）、`parseSave`（读档与导入共用的清洗，版本不符返回 null）、`SAVE_VERSION`。`save.test.ts` 覆盖。 |
| `tasks.ts` | **主线任务**（纯逻辑）：任务链、动作/状态目标、领取推进、读档清洗。`tasks.test.ts` 覆盖。 |
| `main.ts` | 入口：校验配置后启动 Phaser。 |
| `scene/` | 唯一的 Phaser 场景 `TavernScene`，按功能拆成多个文件（见下）。 |
| `ads.ts` | **广告桩**：唯一的广告入口 `showRewardedAd(): Promise<boolean>`；本期模拟等待后返回成功，接真实 SDK 只改这里。 |
| `audio.ts` / `pixel.ts` / `savecode.ts` / `debug.ts` | 音效、像素角色贴图、存档导出码、开发调试面板（按 P）。 |

## scene/ 的组织方式

`TavernScene` 是一个大类，所有场景状态都是它的字段，集中声明在 `scene/TavernScene.ts`。
方法按功能分在各文件里，每个文件导出一个 `XxxMethods` 类，方法首参写 `this: TavernScene`，
因此方法体里照常用 `this.字段` / `this.其他方法()`。`TavernScene.ts` 末尾把这些类合并进
`TavernScene` 的类型和原型（重名会在启动时报错）。

- **加新方法**：放进对应功能文件的 `XxxMethods` 类里，首参 `this: TavernScene`。
- **加新功能文件**：导出 `XxxMethods`，再在 `TavernScene.ts` 的 import、`interface TavernScene extends …` 和 mixin 列表里各加一处。
- **加新状态字段**：只在 `TavernScene.ts` 的类里声明（不要写 `private`，其他文件要访问）。
- **玩法计时一律用 `this.time.now`（场景时钟）或 `this.time` 计时器、`this.tweens` 补间**：打开任何页面都不再暂停营业（`worldPaused` 已移除）。两处例外：**现实时钟**（天色、状态栏时辰）只允许 `SessionMethods.realNow()` 读 `new Date()`，且只用于表现；**采集冷却**（`scene/overlays/gathering.ts`，以及 `logic.ts` 的 `isGatherReady`、主界面与伙计页的采集倒计时）直接读 `Date.now()`，因为要求关页面也继续走，见 ADR-0017。
- **加新子系统页面**：用 `this.openSubsystemPage(标题)` 开页（黑底、标题、底部关闭条都在里面，**不暂停**营业），往返回的 layer 里加内容即可。菜单、结算这类非子系统弹窗不走它。

## 想改什么，看哪个文件

| 想改 | 文件 |
|---|---|
| 场景状态字段、`create` 启动顺序、`update` 每帧分派 | `scene/TavernScene.ts` |
| 布局坐标、屏幕尺寸、玩法常量别名 | `scene/constants.ts` |
| 雅座/排队食客/存档结构等类型 | `scene/types.ts` |
| 小人外观、动画、气泡、走路 | `scene/Character.ts` |
| 营业倒计时、后台推进、硬停、延后结算（工资/还贷/目标/欠债天数）、主界面/营业/修炼视图切换、现实天色 | `scene/session.ts` |
| 主界面门面与【营业】【修炼】【采集】入口卡 | `scene/home.ts` |
| 员工（含掌柜）领座、烹饪、传菜的走路与动画（雅座状态切换调 `src/booth.ts`） | `scene/production.ts` |
| 员工派活顺序、站位、夜修打坐座位、成长、雇佣/辞退/工资 | `scene/staff.ts` |
| 任务进度记账、任务页、主界面任务小条、领取奖励 | `scene/tasks.ts`（各系统的 `notifyTask` 调用点在对应文件里） |
| 食客生成、进场方式、常客、随机事件 | `scene/patrons.ts` |
| 价格/天气/利是在场景侧的换算，菜单列表 | `scene/rules.ts` |
| 存档在场景侧：打包成存档、赋回场景、读写 localStorage（清洗与默认值在 `src/save.ts`；未上线前改结构就升版本号，不做迁移） | `scene/save.ts` |
| 副屏按钮与管理入口搭建、镜头拖拽、二级页面关闭 | `scene/ui.ts` |
| 每帧 HUD 文字、按钮状态、雅座进度条、见闻录/提示 | `scene/hud.ts` |
| 楼层切换、雅座视觉与布局 | `scene/floors.ts` |
| 酒楼内景像素画、窗、灯笼、猫 | `scene/world.ts` |
| 程序生成贴图（水墨标题、夜修法坛、菜品等） | `scene/textures.ts` |
| 标题画面、选性别、开场过场（结束后进主界面） | `scene/title.ts` |
| 浮字、庆祝、碰杯、事件提示 | `scene/fx.ts` |
| 天气粒子、灵气、蒸汽、闲聊等常驻氛围 | `scene/ambient.ts` |
| 点人物弹出的人物卡 | `scene/focus.ts` |
| 选菜单页（配方、缺料提示） | `scene/overlays/menu.ts` |
| 采集页（列表页 + 采集点详情页的动态山水、现实时间冷却、派员工、动作循环、看广告得仙玉、采集加速） | `scene/overlays/gathering.ts`（冷却清理、广告与两处加速方法也在这里；山水静态底图在 `scene/textures.ts`） |
| 仓库（目前只有「食材」标签页，按种列库存与介绍） | `scene/overlays/warehouse.ts` |
| 营造页（扩建/起楼/灶台/门幡） | `scene/overlays/build.ts` |
| 伙计名单、个人详情（加点、分工）、招聘页 | `scene/overlays/staff.ts` |
| 修为子系统入口（占位） | `scene/overlays/cultivation.ts` |
| 设置页（音量滑条；玩法、账簿、存档入口） | `scene/overlays/settings.ts`；音量读写在 `audio.ts` |
| 灵石商行 | `scene/overlays/bank.ts` |
| 结算弹窗 | `scene/overlays/settlement.ts` |
| 营业中快照的写入与恢复（刷新＝提前打烊） | `scene/save.ts` 的 `sessionSnapshot` / `restoreInterruptedSession` |
| 玩法说明、账簿、存档导入导出 | `scene/overlays/info.ts` |
