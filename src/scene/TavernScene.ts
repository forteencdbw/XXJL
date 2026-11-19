// 主场景：字段（全部场景状态）、create/update 入口；方法按功能拆在 scene/ 其他文件。
import Phaser from "phaser";
import { createBooth } from "../booth";
import { createShopkeeper, DISHES, getSessionDurationMs, EMPTY_META, getDailyWeather, localDateKey, STARTING_COINS, STARTING_JADE, startingStock } from "../logic";
import type { DailyGoal, Employee, GatherAssignment, IngredientStock, MetaStats, WeatherDef } from "../logic";
import { newTaskState } from "../tasks";
import type { TaskState } from "../tasks";
import { Character } from "./Character";
import { AUTOSAVE_MS, CAMERA_CLOSED_X, SCREEN_H, USE_VECTOR_TITLE } from "./constants";
import type { Booth, BoothVisual, QueuedPatron, RegularGuest, SceneView, SessionPhase, StaffRuntime, TapText } from "./types";
import { TextureMethods } from "./textures";
import { TitleMethods } from "./title";
import { HomeMethods } from "./home";
import { SaveMethods } from "./save";
import { WorldMethods } from "./world";
import { UiMethods } from "./ui";
import { FloorMethods } from "./floors";
import { HudMethods } from "./hud";
import { SessionMethods } from "./session";
import { ProductionMethods } from "./production";
import { StaffMethods } from "./staff";
import { PatronMethods } from "./patrons";
import { RuleMethods } from "./rules";
import { FxMethods } from "./fx";
import { AmbientMethods } from "./ambient";
import { FocusMethods } from "./focus";
import { MenuOverlayMethods } from "./overlays/menu";
import { BuildOverlayMethods } from "./overlays/build";
import { StaffOverlayMethods } from "./overlays/staff";
import { CultivationOverlayMethods } from "./overlays/cultivation";
import { SettingsOverlayMethods } from "./overlays/settings";
import { BankOverlayMethods } from "./overlays/bank";
import { SettlementOverlayMethods } from "./overlays/settlement";
import { InfoOverlayMethods } from "./overlays/info";
import { GatheringOverlayMethods } from "./overlays/gathering";
import { WarehouseOverlayMethods } from "./overlays/warehouse";
import { TaskMethods } from "./tasks";

export class TavernScene extends Phaser.Scene {
  coins = STARTING_COINS;
  /** 看广告攒的仙玉：只用于加速，破产与飞升都保留。 */
  jade = STARTING_JADE;
  /** 广告播放中，防止重复点。 */
  adBusy = false;
  /** 待确认的加速操作："session" 或 "gather:<spotId>"；超时自动失效。 */
  speedupConfirm: string | null = null;
  speedupConfirmAt = 0;
  /** 食材库存：按食材 id 分别计数。 */
  inventory: IngredientStock = startingStock();
  /** 采集点 id → 当前占用（员工、食材、现实时间开始时刻）。 */
  gathering: Record<string, GatherAssignment> = {};
  /** 主线任务：当前任务、目标进度、已完成清单。 */
  taskState: TaskState = newTaskState();
  /** 同一条任务的完成提示只飘一次。 */
  taskToastFor: string | null = null;
  /** 采集页里每个点当前选中的食材（重建页面时保留）。 */
  gatheringSelection: Record<string, string> = {};
  /** 当前打开的采集页；用于冷却结束时原地刷新。 */
  gatheringOverlayLayer?: Phaser.GameObjects.Container;
  level = 1;
  /** 0=只有一楼，1=已起二楼，2=已起三楼。 */
  floorsBuilt = 0;
  activeFloor = 0;
  interiorPixelImage!: Phaser.GameObjects.Image;
  floorTabs: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text; sub: Phaser.GameObjects.Text }[] =
    [];
  stoveLevel = 0;
  signLevel = 0;
  booths: Booth[] = [];
  queue: QueuedPatron[] = [];
  /** 掌柜：玩家在店里的化身，按分工自动干活，不能辞退、不领工资。 */
  shopkeeper: Employee = createShopkeeper();
  /** 雇来的伙计（不含掌柜）。 */
  employees: Employee[] = [];
  candidates: Employee[] = [];
  candidatesDay = 0;
  nextStaffId = 1;
  staffRt = new Map<number, StaffRuntime>();
  /** 第一次点「辞退」只变成「确认辞退」，防误触。 */
  pendingFireId: number | null = null;
  chronicleLines: string[] = [];
  cultivation = 0;
  /** 修仙界对本店的长期印象；服务客人累积，流失客人回退。 */
  reputation = 0;
  repGainedToday = 0;
  repLostToday = 0;
  /** 同一帧内积累的流失，一次性结算，保证一批最多掉一级。 */
  pendingRepLoss = 0;
  meta: MetaStats = { ...EMPTY_META };
  /** 吃过满意一餐的熟客，隔日还会回来点同一道菜。 */
  regulars: RegularGuest[] = [];
  regularsToday = new Set<string>();
  /** 今天还没见到常客时，保证至少来一位，避免关系层在短局里完全隐身。 */
  regularDueToday = false;

  /** 当前画面：主界面 / 选菜单 / 营业 / 修炼。 */
  view: SceneView = "home";
  /** 本局状态：未开业 / 倒计时中 / 已打烊待结算。营业与画面独立，切走也会继续跑。 */
  session: SessionPhase = "idle";
  bankrupt = false;
  /** 时间倍速（Debug 用）：场景时钟、计时器与补间一起加快。 */
  timeSpeed = 1;
  lastRawTime = 0;
  /** 场景时钟相对现实时间的偏移，只由 Debug 倍速产生。 */
  speedOffsetMs = 0;
  /** Debug：覆盖现实时刻（分钟），用于验证白天/夜晚画面；null = 用本机时间。 */
  debugClockMinutes: number | null = null;
  /** 硬停时清场、未结账的客人数，结算单单独提示。 */
  hardStopCleared = 0;
  selectedDishIds = new Set<string>();
  dishCursor = 0;
  sessionStartedAt = 0;
  /** 当天已成型的客人总数：开市时按声望锁定，营业中升级次日才生效。 */
  patronsTotal = 0;
  /** 已经到过店（含排队时被拒）的客人数，用于判断名单是否走完。 */
  patronsSpawned = 0;
  sessionServed = 0;
  firstGuestShown = false;
  sessionRevenue = 0;
  sessionLost = 0;
  sessionWishes = 0;
  /** 因食材不足而流失的客人数，结算时单独提示。 */
  stockLost = 0;
  /** 门口排满而流失的客人数，单独提示，避免玩家只看到总流失。 */
  queueLost = 0;
  goalAnnounced = false;
  day = 1;
  ascensions = 0;
  suppressSave = false;
  sessionGoal: DailyGoal | null = null;
  /** 当天目标在进入这一天时锁定，之后升级装潢不会临时抬高目标。 */
  dailyGoal: DailyGoal | null = null;
  lastGoalResult: {
    goal: DailyGoal;
    met: boolean;
    partial: boolean;
    progress: number;
    rewardCoins: number;
    streakCount: number;
    streakComplete: boolean;
    streakCoins: number;
  } | null = null;
  goalStreak = 0;
  /** 本机日期与当日天气：跨天时在开店前刷新。 */
  todayKey = localDateKey();
  weather: WeatherDef = getDailyWeather(localDateKey());
  lastGiftDate?: string;
  giftStreak = 0;
  lastGift: { streak: number; coins: number; ingredients: number } | null = null;

  // 视觉对象
  skyRect!: Phaser.GameObjects.Rectangle;
  sunMoon!: Phaser.GameObjects.Arc;
  moonShadow!: Phaser.GameObjects.Arc;
  moonHalo!: Phaser.GameObjects.Arc;
  stars: Phaser.GameObjects.Arc[] = [];
  interiorGfx!: Phaser.GameObjects.Graphics;

  playerChar!: Character;
  playerLabel!: Phaser.GameObjects.Text;
  interiorSign?: Phaser.GameObjects.Text;
  hudBar!: Phaser.GameObjects.Rectangle;
  hudLine!: Phaser.GameObjects.Rectangle;
  hudChips!: Phaser.GameObjects.Graphics;
  rightFrame!: Phaser.GameObjects.Container;
  /** 营业视图的现实夜色压暗层；主界面与修炼用天色本身表达昼夜。 */
  businessNightTint!: Phaser.GameObjects.Rectangle;
  closedBackdrop!: Phaser.GameObjects.Image;
  closedFloorText!: Phaser.GameObjects.Text;
  /** 修炼视图里营业仍在后台跑时的说明。 */
  cultivationNote!: Phaser.GameObjects.Text;
  playerGender: "male" | "female" = "male";

  coinsText!: Phaser.GameObjects.Text;
  jadeText!: Phaser.GameObjects.Text;
  levelText!: Phaser.GameObjects.Text;
  goalText!: Phaser.GameObjects.Text;
  queueText!: Phaser.GameObjects.Text;
  sessionText!: Phaser.GameObjects.Text;
  reputationText!: Phaser.GameObjects.Text;
  reputationBarBg!: Phaser.GameObjects.Rectangle;
  reputationBar!: Phaser.GameObjects.Rectangle;
  chronicleText!: Phaser.GameObjects.Text;
  weatherBadge!: Phaser.GameObjects.Text;
  clockText!: Phaser.GameObjects.Text;
  boothVisuals: BoothVisual[] = [];

  /** 当天每位客人 / 每个随机事件的触发时刻（相对开门的现实毫秒，升序）。 */
  arrivalTimes: number[] = [];
  eventTimes: number[] = [];
  eventsThisSession = 0;
  /** HUD 上显示的灵石数，收益到账时从这里滚动到真实值。 */
  displayedCoins = STARTING_COINS;
  lastWages: { name: string; stars: number; wage: number }[] = [];
  lastLoanDues: { name: string; due: number }[] = [];
  lastRent = 0;
  activeLoans: { name: string; remaining: number; periodsLeft: number }[] = [];
  borrowedIds = new Set<string>();
  negativeStreak = 0;
  settingsButton!: TapText;
  staffButton!: TapText;
  navPanel!: Phaser.GameObjects.Container;
  navTitle!: Phaser.GameObjects.Text;
  navCardObjects: (Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle)[] = [];
  bankButton!: TapText;
  warehouseButton!: TapText;
  upgradeButton!: TapText;
  /** 营业视图底部：回主界面、跳修炼、花仙玉立刻打烊。 */
  businessHomeButton!: TapText;
  cultivationButton!: TapText;
  sessionSpeedupButton!: TapText;
  /** 修炼视图底部：只读修为页与回主界面。 */
  cultivationPageButton!: TapText;
  cultivationHomeButton!: TapText;
  /** 主界面的门面与三张入口卡。 */
  homeFacade?: Phaser.GameObjects.Container;
  homeOpenCard!: Phaser.GameObjects.Rectangle;
  homeOpenTitle!: Phaser.GameObjects.Text;
  homeOpenSub!: Phaser.GameObjects.Text;
  homeCultivationCard!: Phaser.GameObjects.Rectangle;
  homeCultivationTitle!: Phaser.GameObjects.Text;
  homeCultivationSub!: Phaser.GameObjects.Text;
  homeGatherCard!: Phaser.GameObjects.Rectangle;
  homeGatherTitle!: Phaser.GameObjects.Text;
  homeGatherSub!: Phaser.GameObjects.Text;
  /** 主界面右上角的任务小条。 */
  taskTracker?: Phaser.GameObjects.Text;
  taskTrackerBg?: Phaser.GameObjects.Rectangle;
  lastAutosaveAt = 0;

  overlay: Phaser.GameObjects.Container | null = null;
  /** 结算面板显示中：产线已停，但视图仍停在营业视角，等玩家点「打烊」再过渡。 */
  settling = false;
  /** 视图过渡中，防止重复触发。 */
  transitioning = false;
  focusTimer?: Phaser.Time.TimerEvent;
  /** 两桌同时用膳时的碰杯节流，保证不靠 5.6 秒随机闲聊也能看到。 */
  lastClinkAt = 0;
  focusChar?: Character;
  focusCaption?: Phaser.GameObjects.Text;
  focusOverlay?: Phaser.GameObjects.Rectangle;
  focusPanel?: Phaser.GameObjects.Graphics;
  focusPortrait?: Character;
  focusProp?: Phaser.GameObjects.Container;
  focusTable?: Phaser.GameObjects.Graphics;
  focusName?: Phaser.GameObjects.Text;
  focusRole?: Phaser.GameObjects.Text;
  eventToast?: Phaser.GameObjects.Text;
  hintToast?: Phaser.GameObjects.Text;
  focusing = false;
  celebrating = false;
  celebrationTimer?: Phaser.Time.TimerEvent;
  sparkles: Phaser.GameObjects.Arc[] = [];
  fireflyCount = 0;
  lastHintAt = -9999;
  staffNotice = "";
  staffNoticeGood = true;

  constructor() {
    super("tavern");
  }

  create() {
    // 场景时钟：只在 Debug 倍速时偏离现实时间；营业时间不会被任何页面暂停。
    const clock = this.time;
    this.events.off(Phaser.Scenes.Events.UPDATE, clock.update, clock);
    this.events.on(Phaser.Scenes.Events.UPDATE, (t: number, d: number) => {
      const dt = t - this.lastRawTime;
      this.speedOffsetMs -= dt * (this.timeSpeed - 1);
      this.lastRawTime = t;
      clock.update(t - this.speedOffsetMs, d * this.timeSpeed);
    });
    const hadSave = this.loadSave();
    this.ensureGlowTexture();
    this.ensurePaperTextures();
    this.ensureDishTexture();
    this.ensureInkTitleTexture();
    this.ensureClosedInkTexture();
    this.ensureInkInteriorTexture();
    this.booths = this.desiredFloors().map((floor) => createBooth(floor));
    if (this.selectedDishIds.size === 0) {
      this.selectedDishIds = new Set(DISHES.filter((d) => d.unlockLevel <= this.level).map((d) => d.id));
    }

    this.buildWorld();
    this.rebuildStaffChars();
    this.buildUi();

    this.cameras.main.centerOn(CAMERA_CLOSED_X, SCREEN_H / 2);
    this.setGender(this.playerGender);
    this.refreshPlayerAura();
    this.bindCameraDrag();
    this.view = "home";
    this.session = "idle";
    this.positionUi(false);
    this.refreshHud();
    this.time.addEvent({ delay: 700, loop: true, callback: () => this.emitCookingSteam() });
    this.time.addEvent({ delay: 1100, loop: true, callback: () => this.emitFirefly() });
    this.time.addEvent({ delay: 5600, loop: true, callback: () => this.ambientBark() });
    this.time.addEvent({ delay: 700, loop: true, callback: () => this.emitWeather() });
    this.time.addEvent({ delay: 900, loop: true, callback: () => this.emitInteriorMote() });
    this.time.addEvent({ delay: 2600, loop: true, callback: () => this.idleTwitch() });
    this.time.addEvent({ delay: 420, loop: true, callback: () => this.emitNightQi() });
    this.events.on("focus-character", (char: Character) => this.focusOnCharacter(char));
    // shortcut: 用 localStorage 存档；接入微信小游戏时换成 wx.setStorageSync / wx.getStorageSync
    addEventListener("beforeunload", () => this.save());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.save();
    });
    if (!hadSave) {
      // 新档要等选定掌柜性别才落盘，否则中途关页面会存下默认性别并就此锁定
      this.suppressSave = true;
      if (USE_VECTOR_TITLE) this.showTitleScreen();
      else this.showInkPixelTitle();
    }

    // Debug 面板只在开发环境引入，生产构建会被整块剔除
    if (import.meta.env.DEV) {
      (window as unknown as { __tavern?: TavernScene }).__tavern = this;
      void import("../debug").then(({ setupDebug }) =>
        setupDebug(this, {
          addCoins: (n) => {
            this.coins += n;
            this.refreshHud();
          },
          skipDay: () => {
            if (this.session !== "running") return this.showHint("只有营业中才能跳到打烊");
            // 把倒计时拨到 0：下一次 tick 会硬停，按当前视图决定是否直接结算
            this.sessionStartedAt = Math.min(this.sessionStartedAt, this.time.now - getSessionDurationMs());
          },
          toggleClock: () => {
            this.debugClockMinutes = this.debugClockMinutes === null ? 23 * 60 : this.debugClockMinutes === 23 * 60 ? 12 * 60 : null;
            this.showHint(
              this.debugClockMinutes === null
                ? "现实时钟：恢复本机时间"
                : `现实时钟：锁定 ${this.debugClockMinutes === 12 * 60 ? "正午" : "子夜"}`,
            );
            this.updateSky(this.time.now);
            this.refreshHud();
          },
          toggleSpeed: () => {
            this.timeSpeed = this.timeSpeed === 1 ? 10 : 1;
            this.tweens.timeScale = this.timeSpeed;
            this.showHint(`时间倍速 ×${this.timeSpeed}`);
            return this.timeSpeed;
          },
          speed: () => this.timeSpeed,
        }),
      );
    }
  }

  /** 窗户（随时间变色），单独保存以便 updateSky 调整。 */
  windowViews: Phaser.GameObjects.Rectangle[] = [];


  update() {
    if (this.bankrupt) return;
    // 场景时钟（Debug 倍速会加快），不用 update 传进来的现实时间
    const time = this.time.now;
    // 覆盖层始终对齐相机可见区域，避免营业↔打烊镜头平移时错位
    if (this.overlay) this.overlay.setPosition(this.cameras.main.scrollX, this.cameras.main.scrollY);

    this.refreshTodayWeather();
    // 采集冷却走现实时间，与营业、页面都无关
    this.tickGathering();
    // 状态类任务（等级/楼层/声望）每帧补账
    this.syncActiveTask();
    // 营业是后台进程：不管玩家在看主界面、修炼还是子系统页，都照常推进
    if (this.session === "running") this.tickRunningSession(time);

    this.updateSky(time);
    this.renderProgress(time);
    this.refreshHud();

    if (time - this.lastAutosaveAt >= AUTOSAVE_MS) {
      this.lastAutosaveAt = time;
      this.save();
    }
  }


  coinRollTween: Phaser.Tweens.Tween | null = null;
}

// 方法按功能分散在各文件（见 src/ARCHITECTURE.md），这里合并进 TavernScene 的类型与原型。
export interface TavernScene extends TextureMethods, TitleMethods, HomeMethods, SaveMethods, WorldMethods, UiMethods, FloorMethods, HudMethods, SessionMethods, ProductionMethods, StaffMethods, PatronMethods, RuleMethods, FxMethods, AmbientMethods, FocusMethods, MenuOverlayMethods, BuildOverlayMethods, StaffOverlayMethods, CultivationOverlayMethods, SettingsOverlayMethods, BankOverlayMethods, SettlementOverlayMethods, InfoOverlayMethods, GatheringOverlayMethods, WarehouseOverlayMethods, TaskMethods {}
for (const mixin of [TextureMethods, TitleMethods, HomeMethods, SaveMethods, WorldMethods, UiMethods, FloorMethods, HudMethods, SessionMethods, ProductionMethods, StaffMethods, PatronMethods, RuleMethods, FxMethods, AmbientMethods, FocusMethods, MenuOverlayMethods, BuildOverlayMethods, StaffOverlayMethods, CultivationOverlayMethods, SettingsOverlayMethods, BankOverlayMethods, SettlementOverlayMethods, InfoOverlayMethods, GatheringOverlayMethods, WarehouseOverlayMethods, TaskMethods]) {
  for (const name of Object.getOwnPropertyNames(mixin.prototype)) {
    if (name === "constructor") continue;
    // 两个文件定义了同名方法会互相覆盖，启动时直接报错
    if (Object.prototype.hasOwnProperty.call(TavernScene.prototype, name)) throw new Error(`TavernScene 方法重名：${name}`);
    Object.defineProperty(TavernScene.prototype, name, Object.getOwnPropertyDescriptor(mixin.prototype, name)!);
  }
}
