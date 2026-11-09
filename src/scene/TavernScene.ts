// 主场景：字段（全部场景状态）、create/update 入口；方法按功能拆在 scene/ 其他文件。
import Phaser from "phaser";
import { createBooth } from "../booth";
import { createShopkeeper, DISHES, getNightDurationMs, getSessionDurationMs, EMPTY_META, getDailyWeather, localDateKey, STARTING_COINS, STARTING_INVENTORY } from "../logic";
import type { DailyGoal, Employee, MetaStats, WeatherDef } from "../logic";
import { Character } from "./Character";
import { AUTOSAVE_MS, CAMERA_CLOSED_X, SCREEN_H, USE_VECTOR_TITLE } from "./constants";
import type { Booth, BoothVisual, GameState, QueuedPatron, RegularGuest, StaffRuntime, TapText } from "./types";
import { TextureMethods } from "./textures";
import { TitleMethods } from "./title";
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

export class TavernScene extends Phaser.Scene {
  coins = STARTING_COINS;
  inventory = STARTING_INVENTORY;
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

  gameState: GameState = "closed";
  /** 子系统页面打开时整个店的时间冻结（场景时钟、计时器、补间）。 */
  worldPaused = false;
  /** 累计冻结的现实毫秒：场景时钟 = 现实时间 − 冻结时长。 */
  pausedMs = 0;
  lastRawTime = 0;
  /** 时间倍速（Debug 用）：场景时钟、计时器与补间一起加快。 */
  timeSpeed = 1;
  /** 夜修从这一刻起算（场景时钟）；默认很早，即新档直接处在天明。 */
  nightStartedAt = -1e12;
  /** 本次天明是否已弹过开张提醒。 */
  dawnPrompted = false;
  selectedDishIds = new Set<string>();
  dishCursor = 0;
  sessionStartedAt = 0;
  /** 当天已成型的客人总数：开市时按声望锁定，营业中升级次日才生效。 */
  patronsTotal = 0;
  /** 已经到过店（含排队时被拒）的客人数，用于判断名单是否走完。 */
  patronsSpawned = 0;
  roundEnding = false;
  sessionServed = 0;
  firstGuestShown = false;
  sessionRevenue = 0;
  sessionLost = 0;
  sessionWishes = 0;
  /** 因灵材见底而流失的客人数，结算时单独提示。 */
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
  closedBackdrop!: Phaser.GameObjects.Image;
  closedFloorText!: Phaser.GameObjects.Text;
  playerGender: "male" | "female" = "male";

  coinsText!: Phaser.GameObjects.Text;
  inventoryText!: Phaser.GameObjects.Text;
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
  purchaseButton!: TapText;
  upgradeButton!: TapText;
  cultivationButton!: TapText;
  /** 夜修副屏里的修为入口（营业中用底栏那颗）。 */
  nightCultivationButton!: TapText;
  startButton!: TapText;
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
    // 暂停：把场景时钟接到「现实时间 − 冻结时长」上，冻结期间 this.time.now 与计时器都停住
    const clock = this.time;
    this.events.off(Phaser.Scenes.Events.UPDATE, clock.update, clock);
    this.events.on(Phaser.Scenes.Events.UPDATE, (t: number, d: number) => {
      const dt = t - this.lastRawTime;
      // 冻结时把这段现实时间记成停顿；倍速时反过来让场景时钟多走
      if (this.worldPaused) this.pausedMs += dt;
      else this.pausedMs -= dt * (this.timeSpeed - 1);
      this.lastRawTime = t;
      clock.update(t - this.pausedMs, d * this.timeSpeed);
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
            if (this.gameState !== "open" || this.settling) return this.showHint("只有营业中才能跳到打烊");
            // 时钟拨到子初：没到的客人不来了，店里的客人照常走完再结算
            this.sessionStartedAt = Math.min(this.sessionStartedAt, this.time.now - getSessionDurationMs());
          },
          skipNight: () => {
            if (this.gameState !== "closed" || this.isDawn()) return this.showHint("只有夜修中才能跳到天明");
            this.nightStartedAt = this.time.now - getNightDurationMs();
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
    if (this.gameState === "bankrupt") return;
    // 场景时钟（暂停时冻结），不用 update 传进来的现实时间
    const time = this.time.now;
    // 覆盖层始终对齐相机可见区域，避免营业↔打烊镜头平移时错位
    if (this.overlay) this.overlay.setPosition(this.cameras.main.scrollX, this.cameras.main.scrollY);

    if (!this.worldPaused) {
      if (this.gameState === "open" && !this.settling) this.tickOpenSession(time);
      if (this.gameState === "closed") {
        this.tickClosedProcurement();
        this.tickNight();
      }
    }

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
export interface TavernScene extends TextureMethods, TitleMethods, SaveMethods, WorldMethods, UiMethods, FloorMethods, HudMethods, SessionMethods, ProductionMethods, StaffMethods, PatronMethods, RuleMethods, FxMethods, AmbientMethods, FocusMethods, MenuOverlayMethods, BuildOverlayMethods, StaffOverlayMethods, CultivationOverlayMethods, SettingsOverlayMethods, BankOverlayMethods, SettlementOverlayMethods, InfoOverlayMethods {}
for (const mixin of [TextureMethods, TitleMethods, SaveMethods, WorldMethods, UiMethods, FloorMethods, HudMethods, SessionMethods, ProductionMethods, StaffMethods, PatronMethods, RuleMethods, FxMethods, AmbientMethods, FocusMethods, MenuOverlayMethods, BuildOverlayMethods, StaffOverlayMethods, CultivationOverlayMethods, SettingsOverlayMethods, BankOverlayMethods, SettlementOverlayMethods, InfoOverlayMethods]) {
  for (const name of Object.getOwnPropertyNames(mixin.prototype)) {
    if (name === "constructor") continue;
    // 两个文件定义了同名方法会互相覆盖，启动时直接报错
    if (Object.prototype.hasOwnProperty.call(TavernScene.prototype, name)) throw new Error(`TavernScene 方法重名：${name}`);
    Object.defineProperty(TavernScene.prototype, name, Object.getOwnPropertyDescriptor(mixin.prototype, name)!);
  }
}
