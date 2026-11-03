// 主场景：字段（全部场景状态）、create/update 入口；方法按功能拆在 scene/ 其他文件。
import Phaser from "phaser";
import { playSfx } from "../audio";
import { GAME } from "../config";
import { BANKRUPT_STREAK, DISHES, EMPTY_META, FLOOR_UNLOCKS, GOAL_STREAK_TARGET, JOBS, JOB_NAMES, LOANS, LOAN_PERIODS, MAX_FLOORS, REALMS, STARTING_COINS, STARTING_INVENTORY, STAT_NAMES, getAchievements, getAscensionPriceMultiplier, getAscensionStartCoins, getAscensionStartInventory, getAscensionStartLevel, getCultivationGain, getDailyGift, getDailyGoal, getDailyGoalOptions, getDailyOmen, getDailyRent, getDailySpecial, getDishFans, getFloorPriceMultiplier, getFloorRent, getGiftStreak, getHireCost, getNextRealm, getPostCapPriceBonus, getPurchasePrice, getRealmIndex, getRealmPriceMultiplier, getRepLevelInfo, getSignUpgradeCost, getSpecialPrice, getStaffCap, getStaffWage, getStoveSpeedFactor, getStoveUpgradeCost, getStreakBonus, getTotalBoothCount, getTotalStars, getUpgradeCost, getWishPrice, isFestivalDay, localDateKey, moveJobUp, rollCandidate } from "../logic";
import type { DailyGoal, Dish, Employee, Job, LoanDef, MetaStats, OmenDef } from "../logic";
import { decodeSaveCode, encodeSaveCode } from "../savecode";
import { Character } from "./Character";
import type { CharacterLook } from "./Character";
import { ProgressButton } from "./ProgressButton";
import { ACTOR_Y, AUTOSAVE_MS, CAMERA_CLOSED_X, CARD_W, FLOOR_Y, PURCHASE_AMOUNT, SAVE_KEY, SCREEN_H, SCREEN_W, STATUS_BAR_H, USE_VECTOR_TITLE, XIAN_FONT } from "./constants";
import type { Booth, BoothVisual, GameState, PurchaseProgress, QueuedPatron, RegularGuest, SeatProgress, StaffRuntime, TapText } from "./types";
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
  selectedDishIds = new Set<string>();
  dishCursor = 0;
  sessionEndsAt = 0;
  sessionStartedAt = 0;
  /** 天色推进用的名义时长，随当天客人数变化。 */
  sessionNominalMs = 90000;
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
  sessionCultivation = 0;
  goalAnnounced = false;
  day = 1;
  ascensions = 0;
  ascending = false;
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
    rewardCultivation: number;
    streakCount: number;
    streakComplete: boolean;
    streakCoins: number;
    streakCultivation: number;
  } | null = null;
  goalStreak = 0;
  /** 本机日期与当日天时：跨天时在开店前刷新。 */
  todayKey = localDateKey();
  omen: OmenDef = getDailyOmen(localDateKey());
  lastGiftDate?: string;
  giftStreak = 0;
  lastGift: { streak: number; coins: number; cultivation: number; ingredients: number } | null =
    null;
  /** 玩家连续命中口味的次数，上错菜清零；伙计出菜不影响。 */
  combo = 0;

  playerSeat: SeatProgress | null = null;
  playerCookingBooth: number | null = null;
  playerPurchasing: PurchaseProgress | null = null;

  // 视觉对象
  skyRect!: Phaser.GameObjects.Rectangle;
  sunMoon!: Phaser.GameObjects.Arc;
  moonShadow!: Phaser.GameObjects.Arc;
  moonHalo!: Phaser.GameObjects.Arc;
  stars: Phaser.GameObjects.Arc[] = [];
  tavernGfx!: Phaser.GameObjects.Graphics;
  interiorGfx!: Phaser.GameObjects.Graphics;
  uiObjects: { obj: { x: number; setScrollFactor(v: number): unknown }; baseX: number }[] = [];

  playerChar!: Character;
  playerLabel!: Phaser.GameObjects.Text;
  interiorSign?: Phaser.GameObjects.Text;
  hudBar!: Phaser.GameObjects.Rectangle;
  hudLine!: Phaser.GameObjects.Rectangle;
  hudChips!: Phaser.GameObjects.Graphics;
  rightFrame!: Phaser.GameObjects.Container;
  closedBackdrop!: Phaser.GameObjects.Image;
  closedFloorText!: Phaser.GameObjects.Text;
  tutorialBanner!: Phaser.GameObjects.Text;
  playerGender: "male" | "female" = "male";

  coinsText!: Phaser.GameObjects.Text;
  inventoryText!: Phaser.GameObjects.Text;
  levelText!: Phaser.GameObjects.Text;
  realmText!: Phaser.GameObjects.Text;
  cultivationText!: Phaser.GameObjects.Text;
  goalText!: Phaser.GameObjects.Text;
  queueText!: Phaser.GameObjects.Text;
  sessionText!: Phaser.GameObjects.Text;
  reputationText!: Phaser.GameObjects.Text;
  reputationBarBg!: Phaser.GameObjects.Rectangle;
  reputationBar!: Phaser.GameObjects.Rectangle;
  chronicleText!: Phaser.GameObjects.Text;
  omenBadge!: Phaser.GameObjects.Text;
  comboBadge!: Phaser.GameObjects.Text;
  boothVisuals: BoothVisual[] = [];

  nextArrivalAt = 0;
  nextEventAt = 0;
  eventsThisSession = 0;
  /** HUD 上显示的灵石数，收益到账时从这里滚动到真实值。 */
  displayedCoins = STARTING_COINS;
  lastWages: { name: string; stars: number; wage: number }[] = [];
  lastLoanDues: { name: string; due: number }[] = [];
  lastRent = 0;
  activeLoans: { name: string; remaining: number; periodsLeft: number }[] = [];
  borrowedIds = new Set<string>();
  negativeStreak = 0;
  sfxMuted = false;
  sfxButton!: TapText;
  staffButton!: TapText;
  navPanel!: Phaser.GameObjects.Container;
  navTitle!: Phaser.GameObjects.Text;
  navCardObjects: (Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle)[] = [];
  bankButton!: TapText;
  serveButton!: TapText;
  cookButton!: Phaser.GameObjects.Text;
  dishChipLabel!: Phaser.GameObjects.Text;
  dishChips: TapText[] = [];
  purchaseButton!: ProgressButton;
  upgradeButton!: TapText;
  cultivationButton!: TapText;
  helpButton!: TapText;
  recordButton!: TapText;
  saveButton!: TapText;
  startButton!: TapText;
  lastAutosaveAt = 0;

  genderButton!: TapText;
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
  tutorialHintStage = 0;
  staffNotice = "";
  staffNoticeGood = true;

  constructor() {
    super("tavern");
  }

  create() {
    const hadSave = this.loadSave();
    this.ensureGlowTexture();
    this.ensurePaperTextures();
    this.ensureDishTexture();
    this.ensureInkTitleTexture();
    this.ensureClosedInkTexture();
    this.ensureInkInteriorTexture();
    this.booths = this.desiredFloors().map((floor) => this.makeBooth(floor));
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
    this.time.addEvent({ delay: 520, loop: true, callback: () => this.emitQi() });
    this.time.addEvent({ delay: 700, loop: true, callback: () => this.emitWeather() });
    this.time.addEvent({ delay: 900, loop: true, callback: () => this.emitInteriorMote() });
    this.time.addEvent({ delay: 2600, loop: true, callback: () => this.idleTwitch() });
    this.events.on("focus-character", (char: Character) => this.focusOnCharacter(char));
    // shortcut: 用 localStorage 存档；接入微信小游戏时换成 wx.setStorageSync / wx.getStorageSync
    addEventListener("beforeunload", () => this.save());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.save();
    });
    if (!hadSave) {
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
        }),
      );
    }
  }

  /** 窗户（随时间变色），单独保存以便 updateSky 调整。 */
  windowViews: Phaser.GameObjects.Rectangle[] = [];

  registerUi = (obj: { x: number; setScrollFactor(v: number): unknown }, baseX: number) => {
    obj.setScrollFactor(0);
    this.uiObjects.push({ obj, baseX });
  };

  update(time: number) {
    if (this.gameState === "bankrupt") return;
    // 覆盖层始终对齐相机可见区域，避免营业↔打烊镜头平移时错位
    if (this.overlay) this.overlay.setPosition(this.cameras.main.scrollX, this.cameras.main.scrollY);

    if (this.gameState === "open" && !this.settling) {
      if (time >= this.sessionEndsAt) {
        this.endSession();
        return;
      }
      this.tickOpenSession(time);
    }

    this.tickPurchase(time);
    if (this.gameState === "closed") this.tickClosedProcurement();

    this.updateSky(time);
    this.renderProgress(time);
    this.refreshHud();

    if (time - this.lastAutosaveAt >= AUTOSAVE_MS) {
      this.lastAutosaveAt = time;
      this.save();
    }
  }

  lastLit = false;

  buildMenuOverlay() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(100);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x060a12, 0.985).setOrigin(0, 0).setInteractive());
    // 菜单右下的淡墨山与月：填住空黑，又不会抢菜名
    const decor = this.add.graphics();
    decor.fillStyle(0xffe6b0, 0.05);
    decor.fillCircle(584, 368, 78);
    decor.fillStyle(0x8aa0b8, 0.06);
    decor.fillTriangle(300, 1040, 470, 760, 640, 1040);
    decor.fillTriangle(500, 1060, 640, 850, 780, 1060);
    decor.fillStyle(0x8a2a22, 0.1);
    decor.fillRect(600, 640, 44, 44);
    layer.add(decor);
    layer.add(
      this.add
        .text(622, 662, "灵膳", { fontSize: "17px", color: "#ffe6c8", fontFamily: XIAN_FONT, align: "center" })
        .setOrigin(0.5)
        .setAlpha(0.14)
        .setAngle(4),
    );
    layer.add(this.add.text(40, 58, "选择今日菜单", { fontSize: "36px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
    layer.add(
      this.add
        .text(690, 60, `天时 · ${this.omen.name}`, {
          fontSize: "21px",
          color: "#e0c9a0",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(1, 0),
    );
    const unlocked = this.unlockedDishIds();
    const booking = this.regulars.find((r) => unlocked.includes(r.wish));
    const bookingDish = booking ? DISHES.find((d) => d.id === booking.wish)?.name : undefined;
    layer.add(
      this.add.text(
        40,
        108,
        booking && bookingDish
          ? `常客 ${booking.name} 已在路上 · 想吃 ${bookingDish}（上菜单 +50%）`
          : "至少选一道菜才能开张；营业中可按顺序轮转，也可在出菜行指定",
        { fontSize: "18px", color: booking && bookingDish ? "#e0c060" : "#999999" },
      ),
    );
    const goalOptions = getDailyGoalOptions(this.day, this.level);
    this.dailyGoal =
      goalOptions.find((o) => o.kind === this.dailyGoal?.kind) ?? goalOptions[(this.day - 1) % goalOptions.length];
    const goal = this.dailyGoal;
    layer.add(
      this.add.text(
        40,
        142,
        `今日目标二选一 · 库存 ${this.inventory} · 日租 ${getDailyRent(this.level) + getFloorRent(this.floorsBuilt)} 灵石 · 天时 ${
          this.omen.name
        }：${this.omen.short}${isFestivalDay(this.day) ? " · 灯会赏 ×1.5" : ""}`,
        { fontSize: "16px", color: "#e0c060" },
      ),
    );
    // 二选一的目标卡：大数字 + 奖励，先让人一眼看懂今天在赌什么
    goalOptions.forEach((option, i) => {
      const x = 40 + i * 216;
      const selected = option.kind === goal.kind;
      const caption = option.kind === "revenue" ? "本日收入" : "满足口味";
      const value = option.kind === "revenue" ? `${option.target} 灵石` : `${option.target} 位`;
      const card = this.add
        .rectangle(x, 174, 200, 92, selected ? 0x3a1a14 : 0x14100c)
        .setOrigin(0, 0)
        .setStrokeStyle(2, selected ? 0xd9b45a : 0x4a3a2a)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          this.dailyGoal = option;
          this.buildMenuOverlay();
        });
      layer.add(card);
      layer.add(
        this.add.text(x + 12, 184, caption, {
          fontSize: "18px",
          color: selected ? "#e0c060" : "#999999",
        }),
      );
      layer.add(
        this.add.text(x + 12, 206, value, {
          fontSize: "30px",
          color: selected ? "#ffe6a8" : "#dddddd",
        }),
      );
      layer.add(
        this.add.text(x + 12, 244, `赏 ${option.rewardCoins} 灵石 · ${option.rewardCultivation} 修为`, {
          fontSize: "16px",
          color: selected ? "#e0c060" : "#999999",
        }),
      );
      if (selected) {
        layer.add(
          this.add.text(x + 174, 180, "✓", { fontSize: "22px", color: "#ffe6a8" }).setOrigin(0.5, 0),
        );
      }
    });
    const streakBonus = getStreakBonus(this.level);
    layer.add(
      this.add.text(
        40,
        268,
        `三日之约：已连达 ${this.goalStreak}/${GOAL_STREAK_TARGET} 天 · 满 ${GOAL_STREAK_TARGET} 天赏 ${streakBonus.coins} 灵石 + ${streakBonus.cultivation} 修为`,
        { fontSize: "16px", color: this.goalStreak > 0 ? "#c8b8a0" : "#8a7a62" },
      ),
    );
    const special = DISHES.find((d) => d.id === this.currentDailySpecial());
    if (special) {
      const base = this.baseDishPrice(special);
      const price = this.dishPrice(special);
      const pct = base > 0 ? Math.round((price / base - 1) * 100) : 0;
      layer.add(
        this.add.text(40, 290, `今日招牌：${special.name} · ${base}→${price} 灵石（+${pct}%，◆ 标记）`, {
          fontSize: "17px",
          color: "#ffd98a",
        }),
      );
    } else {
      layer.add(
        this.add.text(40, 290, "今日招牌：再解锁一道菜后开启", {
          fontSize: "17px",
          color: "#8a7a62",
        }),
      );
    }

    const available = DISHES.filter((d) => d.unlockLevel <= this.level);
    const specialId = this.currentDailySpecial();
    available.forEach((dish, i) => {
      const y = 316 + i * 96;
      const selected = this.selectedDishIds.has(dish.id);
      const row = this.add
        .rectangle(40, y, 640, 82, selected ? 0x3a1a14 : 0x14100c)
        .setOrigin(0, 0)
        .setStrokeStyle(2, selected ? 0xd9b45a : 0x4a3a2a);
      row.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
        if (this.selectedDishIds.has(dish.id)) this.selectedDishIds.delete(dish.id);
        else this.selectedDishIds.add(dish.id);
        this.buildMenuOverlay();
      });
      layer.add(row);
      layer.add(
        this.add.text(
          60,
          y + 10,
          `${selected ? "☑" : "☐"} ${dish.id === specialId ? "◆" : ""}${dish.name}`,
          { fontSize: "26px", color: "#ffffff" },
        ),
      );
      const fans = getDishFans(dish.id);
      layer.add(
        this.add.text(
          60,
          y + 50,
          `售价 ${this.dishPrice(dish)} 灵石 · 烹饪 ${(dish.cookMs / 1000).toFixed(1)}s${
            fans.length ? ` · ${fans.join("/")}爱吃` : ""
          }`,
          { fontSize: "17px", color: "#cccccc" },
        ),
      );
      // 每道菜一个小碗：菜单至少有“菜”，而不是只有一行价格
      const icon = this.add.graphics();
      const ix = 620;
      const iy = y + 40;
      const soup = [0x9fbf6a, 0xd8c8a8, 0x7ab0c8, 0xc87a5a, 0xd9b45a, 0x8a6a9a, 0xb8d8a0][i % 7];
      icon.fillStyle(0x000000, 0.2);
      icon.fillEllipse(ix, iy + 15, 54, 9);
      icon.fillStyle(0xe8dcc0, 0.96);
      icon.fillEllipse(ix, iy + 7, 54, 18);
      icon.fillStyle(0xc8b89a, 1);
      icon.fillEllipse(ix, iy + 10, 43, 12);
      icon.fillStyle(soup, 1);
      icon.fillEllipse(ix, iy + 4, 37, 10);
      icon.fillStyle(0xffffff, 0.18);
      icon.fillEllipse(ix - 7, iy, 17, 4);
      icon.fillStyle(0x6a8a4a, 1);
      icon.fillCircle(ix - 8, iy + 1, 2);
      icon.fillCircle(ix + 5, iy + 3, 1.8);
      icon.fillStyle(0xffe6c8, 0.28);
      icon.fillEllipse(ix - 5, iy - 12, 12, 4);
      icon.fillEllipse(ix + 7, iy - 16, 8, 3);
      icon.lineStyle(2, 0x8a5a32, 0.9);
      icon.lineBetween(ix + 18, iy - 16, ix + 29, iy + 10);
      icon.lineBetween(ix + 23, iy - 16, ix + 34, iy + 10);
      layer.add(icon);
      if (dish.id === specialId) {
        layer.add(
          this.add
            .text(ix + 24, iy - 26, "◆", { fontSize: "16px", color: "#ffd98a" })
            .setOrigin(0.5),
        );
      }
    });

    // 菜少时给一道大菜占住空桌，别让“卖菜的店”只剩黑屏
    if (available.length <= 3) {
      const showcase = special ?? available[0];
      const showcaseName = showcase?.name ?? "一炉烟火";
      layer.add(
        this.add
          .image(360, 700, "soft-glow")
          .setTint(0xffb060)
          .setAlpha(0.13)
          .setScale(2.4)
          .setBlendMode(Phaser.BlendModes.ADD),
      );
      const mat = this.add.graphics();
      mat.fillStyle(0x3a2818, 0.55);
      mat.fillEllipse(360, 812, 480, 64);
      mat.fillStyle(0x000000, 0.25);
      mat.fillEllipse(360, 792, 310, 34);
      layer.add(mat);
      layer.add(this.add.image(360, 700, "dish-feast").setDisplaySize(320, 320));
      layer.add(
        this.add
          .text(360, 866, `今日开张 · ${showcaseName}`, {
            fontSize: "24px",
            color: "#ffe6a8",
            fontFamily: XIAN_FONT,
          })
          .setOrigin(0.5)
          .setLetterSpacing(3),
      );
      layer.add(
        this.add
          .text(360, 904, "一炉烟火 · 半盏仙途", {
            fontSize: "15px",
            color: "#8a7a62",
            fontFamily: XIAN_FONT,
          })
          .setOrigin(0.5)
          .setLetterSpacing(3),
      );
    }

    if (this.inventory <= 0) {
      layer.add(
        this.add.text(40, 982, "库存为 0：先点下面「备货」再开张，否则客人来了没菜可做", {
          fontSize: "17px",
          color: "#ff9a8a",
          wordWrap: { width: 640 },
        }),
      );
    }

    const buyPrice = this.purchasePrice(false);
    const buy = this.add
      .text(40, 1056, `备货 +${PURCHASE_AMOUNT}（${buyPrice} 灵石）`, {
        fontSize: "20px",
        color: "#ffffff",
        backgroundColor: "#3a4a5a",
        padding: { x: 14, y: 8 },
      })
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => {
        playSfx("click");
        this.startPurchase();
        this.buildMenuOverlay();
      });
    this.expandHitArea(buy, 12);
    layer.add(buy);

    const count = this.getMenuDishes().length;
    const canStart = count > 0 && this.inventory > 0;
    const startLabel = count === 0 ? "至少选一道菜" : this.inventory <= 0 ? "库存为 0，先备货" : `开张大吉（已选 ${count} 道）`;
    const start = this.add.text(40, 1120, startLabel, {
      fontSize: "24px",
      color: canStart ? "#ffffff" : "#777777",
      backgroundColor: canStart ? "#8a2a22" : "#333333",
      padding: { x: 16, y: 12 },
    });
    if (canStart) {
      start.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
        playSfx("click");
        this.startSession();
      });
      this.expandHitArea(start);
    }
    layer.add(start);

    const cancel = this.add
      .text(430, 1120, "先不打烊，返回", {
        fontSize: "20px",
        color: "#cccccc",
        backgroundColor: "#333333",
        padding: { x: 16, y: 10 },
      })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        playSfx("click");
        this.gameState = "closed";
        this.destroyOverlay();
      });
    layer.add(cancel);
    this.expandHitArea(cancel);

    this.overlay = layer;
  }

  /** 二级页面：营造。雅座扩建、灶台专精、门面招幡三条线各花各的钱。 */
  buildBuildOverlay() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(100);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.97).setOrigin(0, 0).setInteractive());
    layer.add(this.add.text(40, 58, "营造", { fontSize: "36px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
    layer.add(this.add.text(40, 108, "灵石有限，先补当前的短板", { fontSize: "18px", color: "#999999" }));
    const nextFloor = this.floorsBuilt + 1;
    if (nextFloor < MAX_FLOORS) {
      const def = FLOOR_UNLOCKS[nextFloor - 1];
      const eligible = this.level >= def.level;
      const affordable = eligible && this.coins >= def.cost;
      layer.add(
        this.add
          .text(
            430,
            52,
            eligible ? `起${nextFloor === 1 ? "二楼" : "三楼"} · ${def.cost} 灵石` : `需 Lv${def.level} 起楼`,
            {
              fontSize: "20px",
              color: affordable ? "#ffffff" : "#8a7a62",
              backgroundColor: affordable ? "#8a2a22" : "#2a2018",
              padding: { x: 14, y: 10 },
            },
          )
          .setInteractive({ useHandCursor: true })
          .on("pointerup", () => {
            if (!eligible) {
              this.showHint(`酒楼到 Lv${def.level} 才能起${nextFloor === 1 ? "二楼" : "三楼"}`);
              return;
            }
            if (!affordable) {
              this.showHint(`起楼要 ${def.cost} 灵石`);
              return;
            }
            this.buildFloor();
          }),
      );
    } else {
      layer.add(this.add.text(480, 62, "三层已起", { fontSize: "18px", color: "#8a7a62" }));
    }

    const nextDish = DISHES.find((dish) => dish.unlockLevel > this.level);
    const dishHint = nextDish ? `${nextDish.unlockLevel} 级解锁「${nextDish.name}」` : "已解锁全部菜品";
    const stoveFactor = getStoveSpeedFactor(this.stoveLevel);
    const rows = [
      {
        title: `雅座扩建 · 酒楼 ${this.level} 级`,
        desc: `雅座/排队 ${getTotalBoothCount(this.level, this.floorsBuilt)} · ${dishHint}`,
        cost: getUpgradeCost(this.level),
        action: "扩建",
        run: () => this.upgradeTavern(),
      },
      {
        title: `灶台专精 · Lv${this.stoveLevel}`,
        desc: `烹饪耗时 -${Math.round((1 - stoveFactor) * 100)}% → -${Math.round(
          (1 - getStoveSpeedFactor(this.stoveLevel + 1)) * 100,
        )}%`,
        cost: getStoveUpgradeCost(this.stoveLevel),
        action: "精修",
        run: () => this.upgradeStove(),
      },
      {
        title: `门面招幡 · Lv${this.signLevel}`,
        desc: "招客效果待重做，目前只作门面装饰",
        cost: getSignUpgradeCost(this.signLevel),
        action: "挂幡",
        run: () => this.upgradeSign(),
      },
    ];

    rows.forEach((row, i) => {
      const y = 170 + i * 155;
      const affordable = row.cost <= this.coins;
      layer.add(this.add.rectangle(40, y, 640, 136, 0x2b2b2b).setOrigin(0, 0).setStrokeStyle(2, 0x555555));
      layer.add(this.add.text(56, y + 12, row.title, { fontSize: "24px", color: "#ffffff" }));
      layer.add(
        this.add.text(56, y + 50, row.desc, { fontSize: "17px", color: "#bbbbbb", wordWrap: { width: 460 } }),
      );
      layer.add(
        this.add.text(56, y + 88, `费用 ${row.cost} 灵石`, {
          fontSize: "19px",
          color: affordable ? "#9fe870" : "#ff9a8a",
        }),
      );
      layer.add(
        this.add
          .text(560, y + 50, row.action, {
            fontSize: "22px",
            color: affordable ? "#ffffff" : "#777777",
            backgroundColor: affordable ? "#3f6a3f" : "#3a3a3a",
            padding: { x: 20, y: 14 },
          })
          .setInteractive({ useHandCursor: true })
          .on("pointerup", () => {
            row.run();
            this.buildBuildOverlay();
          }),
      );
    });

    this.addOverlayClose(layer, 660);
    this.overlay = layer;
  }

  /** 星条：10 格，亮格数 = 星数，后跟数字。 */
  addStarBar(layer: Phaser.GameObjects.Container, x: number, y: number, job: Job, stars: number) {
    layer.add(this.add.text(x, y, STAT_NAMES[job], { fontSize: "15px", color: "#d8c8a0" }));
    for (let k = 0; k < GAME.staff.maxStars; k++) {
      layer.add(
        this.add.rectangle(x + 40 + k * 12, y + 3, 10, 12, k < stars ? 0xffd25a : 0x3a3a46).setOrigin(0, 0),
      );
    }
    layer.add(this.add.text(x + 40 + GAME.staff.maxStars * 12 + 4, y, `${stars}`, { fontSize: "15px", color: "#ffffff" }));
  }

  addChip(
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    bg: string,
    onTap: () => void,
    color = "#ffffff",
  ) {
    layer.add(
      this.add
        .text(x, y, label, { fontSize: "18px", color, backgroundColor: bg, padding: { x: 10, y: 6 } })
        .setInteractive({ useHandCursor: true })
        .on("pointerup", () => {
          playSfx("click");
          onTap();
        }),
    );
  }

  staffOverlayLayer(title: string): Phaser.GameObjects.Container {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(100);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.97).setOrigin(0, 0).setInteractive());
    layer.add(this.add.text(40, 58, title, { fontSize: "36px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
    if (this.staffNotice) {
      layer.add(
        this.add.text(40, 154, this.staffNotice, {
          fontSize: "16px",
          color: this.staffNoticeGood ? "#9fe870" : "#ff9a8a",
        }),
      );
    }
    return layer;
  }

  /** 二级页面：员工名单。每人勾选做哪些工作、用 ↑ 调先后，打烊时才能改。 */
  buildStaffOverlay() {
    const layer = this.staffOverlayLayer("伙计");
    const cap = getStaffCap(this.level);
    layer.add(
      this.add.text(40, 108, `${this.staffSummaryHint()}\n属性越契合越好：身法→招待快 · 厨艺→烹饪快且售价高 · 精明→采购便宜`, {
        fontSize: "15px",
        color: "#e0c060",
        wordWrap: { width: 640 },
      }),
    );
    this.addChip(layer, 470, 62, `招聘（已雇 ${this.employees.length}/${cap}）`, "#3a5a3a", () => {
      this.staffNotice = "";
      this.buildRecruitOverlay();
    });

    if (this.employees.length === 0) {
      layer.add(
        this.add.text(360, 400, "还没有伙计，点右上「招聘」雇第一位", { fontSize: "20px", color: "#888888" }).setOrigin(0.5),
      );
    }
    this.employees.forEach((e, i) => {
      const y = 184 + i * 136;
      layer.add(this.add.rectangle(40, y, 640, 126, 0x1e2636).setOrigin(0, 0).setStrokeStyle(1, 0x3a4660));
      layer.add(this.add.text(56, y + 10, e.name, { fontSize: "22px", color: "#ffffff" }));
      layer.add(this.add.text(170, y + 15, `日薪 ${getStaffWage(e)} 灵石`, { fontSize: "16px", color: "#bbbbbb" }));
      const confirming = this.pendingFireId === e.id;
      this.addChip(layer, confirming ? 548 : 590, y + 8, confirming ? "确认辞退" : "辞退", confirming ? "#8a2a2a" : "#4a2a2a", () => {
        if (confirming) this.fireStaff(e);
        else this.pendingFireId = e.id;
        this.buildStaffOverlay();
      });
      JOBS.forEach((job, k) => this.addStarBar(layer, 56 + k * 210, y + 46, job, e.stars[job]));
      e.jobs.forEach((slot, k) => {
        const x = 56 + k * 210;
        this.addChip(
          layer,
          x,
          y + 78,
          `${slot.on ? "✓" : "　"} ${k + 1}.${JOB_NAMES[slot.job]}`,
          slot.on ? "#3f6a3f" : "#3a3a3a",
          () => {
            slot.on = !slot.on;
            this.onRosterChanged();
          },
          slot.on ? "#ffffff" : "#888888",
        );
        if (k > 0) {
          this.addChip(layer, x + 128, y + 78, "↑", "#33405a", () => {
            moveJobUp(e, k);
            this.onRosterChanged();
          });
        }
      });
    });

    this.addOverlayClose(layer, 1150);
    this.overlay = layer;
  }

  onRosterChanged() {
    this.pendingFireId = null;
    this.rebuildStaffChars();
    this.save();
    this.buildStaffOverlay();
  }

  /** 候选人按天刷新；同一天读档后还是同一批。 */
  ensureCandidates(force = false) {
    if (!force && this.candidatesDay === this.day) return;
    this.candidatesDay = this.day;
    const used = new Set(this.employees.map((e) => e.name));
    this.candidates = Array.from({ length: GAME.staff.candidatesPerDay }, () => {
      const c = rollCandidate(this.nextStaffId++, Math.random);
      // 同名会让见闻录分不清是谁，撞名就换一个还没用过的
      if (used.has(c.name)) c.name = GAME.staff.names.find((n) => !used.has(n)) ?? c.name;
      used.add(c.name);
      return c;
    });
    this.save();
  }

  /** 二级页面：招聘。每天一批候选人，可付费再刷。 */
  buildRecruitOverlay() {
    this.ensureCandidates();
    const layer = this.staffOverlayLayer("招聘");
    const cap = getStaffCap(this.level);
    const full = this.employees.length >= cap;
    layer.add(
      this.add.text(
        40,
        108,
        full ? `人手已满（${this.employees.length}/${cap}），先辞退一位或扩建酒楼` : `已雇 ${this.employees.length}/${cap} · 每天来一批新面孔`,
        { fontSize: "16px", color: full ? "#ff9a8a" : "#e0c060" },
      ),
    );
    if (this.candidates.length === 0) {
      layer.add(this.add.text(360, 400, "今天的候选人都雇走了", { fontSize: "20px", color: "#888888" }).setOrigin(0.5));
    }
    this.candidates.forEach((c, i) => {
      const y = 190 + i * 150;
      const cost = getHireCost(c);
      layer.add(this.add.rectangle(40, y, 640, 136, 0x1e2636).setOrigin(0, 0).setStrokeStyle(1, 0x3a4660));
      layer.add(this.add.text(56, y + 12, c.name, { fontSize: "22px", color: "#ffffff" }));
      layer.add(
        this.add.text(170, y + 17, `总 ${getTotalStars(c)} 星 · 日薪 ${getStaffWage(c)} 灵石`, { fontSize: "16px", color: "#bbbbbb" }),
      );
      JOBS.forEach((job, k) => this.addStarBar(layer, 56 + k * 210, y + 54, job, c.stars[job]));
      this.addChip(layer, 56, y + 88, `雇佣 ${cost} 灵石`, full || this.coins < cost ? "#3a3a3a" : "#3a5a3a", () => {
        this.hireStaff(c);
        this.buildRecruitOverlay();
      });
    });
    const refreshCost = GAME.staff.refreshCost;
    this.addChip(layer, 40, 660, `换一批（${refreshCost} 灵石）`, "#33405a", () => {
      if (this.coins < refreshCost) {
        this.staffNotice = `灵石不足，换一批需 ${refreshCost} 灵石`;
        this.staffNoticeGood = false;
      } else {
        this.coins -= refreshCost;
        this.displayedCoins = this.coins;
        this.ensureCandidates(true);
        this.staffNotice = "";
      }
      this.buildRecruitOverlay();
    });
    this.addChip(layer, 520, 660, "返回伙计", "#33405a", () => {
      this.staffNotice = "";
      this.buildStaffOverlay();
    });
    this.addOverlayClose(layer, 1150);
    this.overlay = layer;
  }

  /** 二级页面：修行境界，列出全部境界、加成与当前进度。 */
  buildCultivationOverlay() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(100);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.97).setOrigin(0, 0).setInteractive());
    layer.add(this.add.text(40, 70, "修行境界", { fontSize: "30px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
    const next = getNextRealm(this.cultivation);
    layer.add(
      this.add.text(
        40,
        116,
        `当前「${REALMS[this.realmIndex()].name}」 · 修为 ${this.cultivation}${next ? ` / ${next.cultivation}` : "（圆满）"}`,
        { fontSize: "18px", color: "#ffd98a" },
      ),
    );
    layer.add(
      this.add.text(
        40,
        146,
        this.ascensions > 0
          ? `仙缘 ${this.ascensions} 重 · 菜品售价 +${Math.round(
              (getAscensionPriceMultiplier(this.ascensions) - 1) * 100,
            )}% · 下次飞升开局 Lv${getAscensionStartLevel(this.ascensions + 1)}`
          : "尚未飞升 · 每次飞升留一重仙缘，永久提高售价",
        { fontSize: "15px", color: "#c8a8ff" },
      ),
    );
    layer.add(
      this.add.text(40, 170, "每道菜离店得 1 点修为，亲自下厨得 2 点；突破自动发生", {
        fontSize: "14px",
        color: "#999999",
      }),
    );

    const current = this.realmIndex();
    REALMS.forEach((realm, i) => {
      const y = 200 + i * 68;
      const unlocked = this.cultivation >= realm.cultivation;
      const isCurrent = i === current;
      layer.add(
        this.add
          .rectangle(40, y, 640, 58, isCurrent ? 0x4a3a1a : 0x2b2b2b)
          .setOrigin(0, 0)
          .setStrokeStyle(2, isCurrent ? 0xffd98a : unlocked ? 0x5a5a3a : 0x444444),
      );
      layer.add(
        this.add.text(56, y + 7, realm.name, {
          fontSize: "20px",
          color: unlocked ? "#ffd98a" : "#777777",
        }),
      );
      layer.add(
        this.add.text(56, y + 32, `修为 ${realm.cultivation} · ${realm.perk}`, {
          fontSize: "14px",
          color: unlocked ? "#bbbbbb" : "#666666",
        }),
      );
      if (isCurrent) layer.add(this.add.text(610, y + 18, "当前", { fontSize: "16px", color: "#ffd98a" }));
    });

    const maxed = current === REALMS.length - 1;
    if (maxed) {
      layer.add(
        this.add
          .text(40, 780, "渡劫飞升（仙缘 +1）", {
            fontSize: "20px",
            color: "#3a2a10",
            backgroundColor: "#ffd98a",
            padding: { x: 16, y: 10 },
          })
          .setInteractive({ useHandCursor: true })
          .on("pointerup", () => this.buildAscendConfirmOverlay()),
      );
    }
    this.addOverlayClose(layer, 870);
    this.overlay = layer;
  }

  /** 飞升前的确认页：写清保留什么、失去什么。 */
  buildAscendConfirmOverlay() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(100);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.97).setOrigin(0, 0).setInteractive());
    layer.add(this.add.text(40, 90, "渡劫飞升", { fontSize: "32px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
    const next = this.ascensions + 1;
    const lines = [
      "踏破虚空，此局经营从头再来。",
      "",
      "保留：仙缘、玩家形象",
      `失去：灵石、灵材、酒楼 ${this.level} 级、灶台/门面、伙计、借据、修为、天数`,
      "",
      `飞升后：仙缘 ${next} 重，菜品售价 +${Math.round((getAscensionPriceMultiplier(next) - 1) * 100)}%`,
      `开局：酒楼 Lv${getAscensionStartLevel(next)} · 灵石 ${getAscensionStartCoins(next)} · 灵材 ${getAscensionStartInventory(next)}`,
    ];
    lines.forEach((line, i) => {
      layer.add(
        this.add.text(40, 170 + i * 34, line, {
          fontSize: "18px",
          color: line.startsWith("失去") ? "#ff9a8a" : "#dddddd",
        }),
      );
    });
    layer.add(
      this.add
        .text(40, 500, "确认飞升", {
          fontSize: "20px",
          color: "#3a2a10",
          backgroundColor: "#ffd98a",
          padding: { x: 16, y: 10 },
        })
        .setInteractive({ useHandCursor: true })
        .on("pointerup", () => this.ascend()),
    );
    layer.add(
      this.add
        .text(220, 500, "再等等", {
          fontSize: "20px",
          color: "#ffffff",
          backgroundColor: "#3a3a3a",
          padding: { x: 16, y: 10 },
        })
        .setInteractive({ useHandCursor: true })
        .on("pointerup", () => this.buildCultivationOverlay()),
    );
    this.overlay = layer;
  }

  /** 飞升：写入新周目存档后刷新页面，避免逐个重建场景对象。 */
  ascend() {
    if (this.ascending) return;
    this.ascending = true;
    this.destroyOverlay();
    playSfx("open");
    this.cameras.main.flash(1200, 255, 255, 220);
    this.writeSave(this.freshSave(this.ascensions + 1));
    this.time.delayedCall(1100, () => location.reload());
  }

  /** 二级页面：灵石商行，按酒楼等级解锁三档借贷。 */
  buildBankOverlay() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(100);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.97).setOrigin(0, 0).setInteractive());
    layer.add(this.add.text(40, 70, "灵石商行", { fontSize: "30px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
    layer.add(
      this.add.text(40, 116, `在贷 ${this.activeLoans.length} 笔 · 连亏 ${this.negativeStreak}/${BANKRUPT_STREAK} 日`, {
        fontSize: "15px",
        color: "#bbbbbb",
      }),
    );

    LOANS.forEach((def, i) => {
      const y = 170 + i * 120;
      const borrowed = this.borrowedIds.has(def.id);
      const levelLocked = this.level < def.unlockLevel;
      const dayLocked = this.day < def.minDay;
      const locked = levelLocked || dayLocked;
      layer.add(
        this.add.text(50, y, `${def.name} · 借 ${def.principal} 灵石`, {
          fontSize: "22px",
          color: borrowed ? "#666666" : "#7fe8dd",
        }),
      );
      layer.add(
        this.add.text(50, y + 34, `分 ${LOAN_PERIODS} 期偿还，共 ${def.totalRepay}（利钱 ${def.totalRepay - def.principal}）`, {
          fontSize: "15px",
          color: "#bbbbbb",
        }),
      );

      if (borrowed) {
        layer.add(this.add.text(430, y + 6, "已借", { fontSize: "18px", color: "#666666" }));
      } else if (locked) {
        layer.add(
          this.add.text(400, y + 6, dayLocked ? `需第 ${def.minDay} 日` : `需酒楼 ${def.unlockLevel} 级`, {
            fontSize: "16px",
            color: "#888888",
          }),
        );
      } else {
        const btn = this.add
          .text(400, y + 4, "立据借贷", {
            fontSize: "18px",
            color: "#ffffff",
            backgroundColor: "#5a4a2a",
            padding: { x: 14, y: 8 },
          })
          .setInteractive({ useHandCursor: true })
          .on("pointerup", () => {
            playSfx("click");
            this.takeLoan(def);
            this.buildBankOverlay();
          });
        layer.add(btn);
      }
    });

    this.addOverlayClose(layer, 620);
    this.overlay = layer;
  }

  /** 结算/破产共用弹窗外壳：只遮主屏的 30% 遮罩 + 上半屏卡片 + 入场动画。 */
  buildPopupCard(cardHeight: number, depth: number) {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(depth);
    // 遮罩只盖主屏并吞掉主屏内的点击；状态栏与副屏保持原样
    layer.add(
      this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.58).setOrigin(0, 0).setInteractive(),
    );
    const panel = this.add.container(SCREEN_W / 2, STATUS_BAR_H + 16);
    panel.add(
      this.add
        .rectangle(0, 0, CARD_W, cardHeight, 0x0d0a08, 1)
        .setOrigin(0.5, 0)
        .setStrokeStyle(2, 0x9a3a2a),
    );
    for (const [cx, cy] of [
      [-CARD_W / 2 + 8, 8],
      [CARD_W / 2 - 8, 8],
      [-CARD_W / 2 + 8, cardHeight - 8],
      [CARD_W / 2 - 8, cardHeight - 8],
    ] as const) {
      panel.add(this.add.rectangle(cx, cy, 10, 10, 0xd9b45a).setAngle(45));
    }
    panel.setAlpha(0).setScale(0.92);
    this.tweens.add({ targets: panel, alpha: 1, scale: 1, duration: 200, ease: "Sine.easeOut" });
    layer.add(panel);
    this.overlay = layer;
    return { panel, left: -CARD_W / 2 + 28 };
  }

  /** 打烊瞬间：在场角色原地跳跃 + 头顶粒子，循环到关闭弹窗。 */
  startCelebration() {
    if (this.celebrating) return;
    this.celebrating = true;
    for (const char of this.celebrationChars()) {
      this.tweens.killTweensOf(char);
      const baseY = char.y;
      this.tweens.add({
        targets: char,
        y: baseY - 16,
        duration: 240,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.tweens.add({
        targets: char,
        scaleY: 1.12,
        duration: 240,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
    this.celebrationTimer = this.time.addEvent({ delay: 300, loop: true, callback: () => this.emitSparkles() });
    this.emitSparkles();
  }

  stopCelebration() {
    if (!this.celebrating) return;
    this.celebrating = false;
    this.celebrationTimer?.remove();
    this.celebrationTimer = undefined;
    this.sparkles.forEach((spark) => spark.destroy());
    this.sparkles = [];
    this.celebrationChars().forEach((char) => {
      this.tweens.killTweensOf(char);
      char.setY(ACTOR_Y);
      char.setScale(char.scaleX, 1);
    });
  }

  celebrationChars(): Character[] {
    return [this.playerChar, ...this.staffChars()];
  }

  emitSparkles() {
    for (const char of this.celebrationChars()) {
      const x = char.x + Phaser.Math.Between(-18, 18);
      const y = char.y - 34;
      const spark = this.add.circle(x, y, Phaser.Math.Between(2, 4), 0xffe08a, 1).setDepth(25);
      this.sparkles.push(spark);
      this.tweens.add({
        targets: spark,
        y: y - Phaser.Math.Between(36, 64),
        alpha: 0,
        duration: 650,
        ease: "Sine.easeOut",
        onComplete: () => {
          spark.destroy();
          this.sparkles = this.sparkles.filter((s) => s !== spark);
        },
      });
    }
  }

  /** 连续亏空到上限后的破产结算，锁死所有操作。 */
  buildBankruptOverlay() {
    const { panel, left } = this.buildPopupCard(300, 150);
    panel.add(this.add.text(left, 22, "酒楼倒闭", { fontSize: "36px", color: "#ff6b6b" }));
    panel.add(this.add.text(left, 90, `连续 ${BANKRUPT_STREAK} 日入不敷出，`, { fontSize: "19px", color: "#dddddd" }));
    panel.add(this.add.text(left, 120, "灵石商行上门封了铺子。", { fontSize: "19px", color: "#dddddd" }));
    panel.add(
      this.add.text(left, 164, `酒楼等级 ${this.level} · 欠款 ${Math.abs(Math.min(this.coins, 0))} 灵石`, {
        fontSize: "19px",
        color: "#dddddd",
      }),
    );
    panel.add(
      this.add.text(
        left,
        this.ascensions > 0 ? 194 : 200,
        this.ascensions > 0 ? `仙缘 ${this.ascensions} 重仍在，重开后带走。` : "一切从头再来。",
        { fontSize: "16px", color: this.ascensions > 0 ? "#c8a8ff" : "#999999" },
      ),
    );
    panel.add(
      this.add
        .text(left, 226, "重开酒楼", {
          fontSize: "20px",
          color: "#ffffff",
          backgroundColor: "#5a2a2a",
          padding: { x: 16, y: 10 },
        })
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => location.reload()),
    );
  }

  buildSettlementOverlay() {
    const totalWage = this.lastWages.reduce((sum, w) => sum + w.wage, 0);
    const totalLoan = this.lastLoanDues.reduce((sum, d) => sum + d.due, 0);
    const totalRent = this.lastRent;
    const netIncome = this.sessionRevenue - totalWage - totalLoan - totalRent;
    const summary = [
      `今日天时：${this.omen.name} · ${this.omen.short}`,
      ...(this.lastGift
        ? [`开市利是：连续 ${this.lastGift.streak} 天 · +${this.lastGift.coins} 灵石、+${this.lastGift.cultivation} 修为`]
        : []),
      `修为增长：+${this.sessionCultivation}`,
      `声望：${getRepLevelInfo(this.reputation).title} · +${this.repGainedToday} / −${this.repLostToday} → ${this.reputation}`,
      `工资合计：${totalWage} 灵石`,
      `店面租金：${totalRent} 灵石`,
      `商行还账：${totalLoan} 灵石`,
      `余下：${this.coins} 灵石（连亏 ${this.negativeStreak}/${BANKRUPT_STREAK} 日）`,
      `流失食客：${this.sessionLost} 位`,
    ];
    if (this.stockLost > 0) {
      summary.push(`灵材不足流失：${this.stockLost} 位（下次先备货或急购）`);
    }
    if (this.queueLost > 0) {
      summary.push(`排队溢出流失：${this.queueLost} 位（门口排满，先招待）`);
    }
    const nextSpecial = DISHES.find(
      (d) => d.id === getDailySpecial(this.day, this.level, this.unlockedDishIds()),
    );
    // 明日天时按本机日期预告：给「明天再回来看看」一个具体的理由
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowOmen = getDailyOmen(localDateKey(tomorrow));
    summary.push(`明日天时：${tomorrowOmen.name} · ${tomorrowOmen.short}`);
    summary.push(
      isFestivalDay(this.day)
        ? "明日：灯会 · 客流更旺 · 目标赏 ×1.5（别错过）"
        : `明日：${nextSpecial ? `招牌 ${nextSpecial.name}` : "暂无招牌"} · 目标可自选`,
    );
    const nextCost = getUpgradeCost(this.level);
    summary.push(`下一阶：${nextCost} 灵石 → Lv${this.level + 1}，店内会添新陈设`);
    // 卡片高度按明细行数算，保证内容不溢出
    const cardHeight =
      212 +
      (this.lastWages.length > 0 ? 30 + this.lastWages.length * 28 + 10 : 0) +
      (this.lastLoanDues.length > 0 ? 30 + this.lastLoanDues.length * 28 + 10 : 0) +
      (this.lastGoalResult ? 86 : 0) +
      summary.length * 34 +
      100;
    const { panel, left } = this.buildPopupCard(cardHeight, 100);

    panel.add(this.add.text(left, 20, "今日营业结束", { fontSize: "34px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
    // 第一眼先给一天的结论：净赚多少、目标怎么样，而不是一屏会计科目
    panel.add(this.add.text(left, 76, "今日净收益", { fontSize: "17px", color: "#a89472" }));
    panel.add(
      this.add.text(left, 94, `${netIncome >= 0 ? "+" : ""}${netIncome} 灵石`, {
        fontSize: "54px",
        color: netIncome >= 0 ? "#9fe870" : "#ff9a8a",
        fontFamily: XIAN_FONT,
      }),
    );
    panel.add(
      this.add.text(
        left,
        158,
        `服务 ${this.sessionServed} 位 · 收入 ${this.sessionRevenue} · 支出 ${
          totalWage + totalLoan + totalRent
        }`,
        { fontSize: "17px", color: "#c8b8a0" },
      ),
    );
    const goalState = this.lastGoalResult
      ? this.lastGoalResult.met
        ? "目标达成"
        : this.lastGoalResult.partial
          ? "目标差一点"
          : "目标未达成"
      : "";
    const streakState = this.lastGoalResult
      ? this.lastGoalResult.streakComplete
        ? "三日之约达成"
        : `三日之约 ${this.lastGoalResult.streakCount}/${GOAL_STREAK_TARGET}`
      : "";
    panel.add(
      this.add.text(left, 184, [goalState, streakState].filter(Boolean).join(" · "), {
        fontSize: "17px",
        color: this.lastGoalResult?.met ? "#e0c060" : "#a89472",
      }),
    );
    let y = 212;

    if (this.lastWages.length > 0) {
      panel.add(this.add.text(left, y, "伙计工钱", { fontSize: "18px", color: "#aaaaaa" }));
      y += 30;
      for (const w of this.lastWages) {
        panel.add(
          this.add.text(left + 16, y, `${w.name} · ${w.stars} 星 · 日薪 ${w.wage} 灵石`, {
            fontSize: "19px",
            color: "#e8e8e8",
          }),
        );
        y += 28;
      }
      y += 10;
    }

    if (this.lastLoanDues.length > 0) {
      panel.add(this.add.text(left, y, "商行还账", { fontSize: "18px", color: "#aaaaaa" }));
      y += 30;
      for (const d of this.lastLoanDues) {
        panel.add(
          this.add.text(left + 16, y, `${d.name} · 本期还 ${d.due} 灵石`, { fontSize: "19px", color: "#e8e8e8" }),
        );
        y += 28;
      }
      y += 10;
    }

    if (this.lastGoalResult) {
      const {
        goal,
        met,
        partial,
        progress,
        rewardCoins,
        rewardCultivation,
        streakCount,
        streakComplete,
        streakCoins,
        streakCultivation,
      } = this.lastGoalResult;
      panel.add(
        this.add
          .rectangle(left - 8, y - 8, CARD_W - 20, 90, 0x14100c, 0.97)
          .setOrigin(0, 0)
          .setStrokeStyle(1, 0xd9b45a, 0.55),
      );
      panel.add(this.add.text(left, y, `今日目标 · ${goal.label}`, { fontSize: "19px", color: "#e0c9a0" }));
      y += 26;
      panel.add(
        this.add.text(
          left + 16,
          y,
          met
            ? `达成！+${rewardCoins} 灵石、+${rewardCultivation} 修为`
            : partial
              ? `差一点（${progress}/${goal.target}）· 半赏 +${rewardCoins} 灵石、+${rewardCultivation} 修为`
              : `未达成（${progress}/${goal.target}）`,
          { fontSize: "21px", color: met ? "#9fdf6a" : partial ? "#e0c060" : "#999999" },
        ),
      );
      y += 30;
      panel.add(
        this.add.text(
          left + 16,
          y,
          streakComplete
            ? `三日之约达成！额外 +${streakCoins} 灵石、+${streakCultivation} 修为`
            : `三日之约 ${streakCount}/${GOAL_STREAK_TARGET} · 满 ${GOAL_STREAK_TARGET} 天赏 ${streakCoins} 灵石 + ${streakCultivation} 修为`,
          { fontSize: "17px", color: streakComplete ? "#9fdf6a" : "#c8b8a0" },
        ),
      );
      y += 28;
    }

    summary.forEach((line) => {
      panel.add(this.add.text(left, y, line, { fontSize: "21px", color: "#e8e8e8" }));
      y += 34;
    });

    const closeY = y + 16;
    panel.add(
      this.add
        .rectangle(left + 272, closeY + 32, 544, 64, 0x8a2a22)
        .setStrokeStyle(2, 0xd9b45a, 0.75)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          this.stopCelebration();
          this.destroyOverlay();
          this.transitionToClosedView();
        }),
    );
    panel.add(
      this.add
        .text(left + 272, closeY + 32, `打烊 · 进入第 ${this.day} 日`, {
          fontSize: "25px",
          color: "#f5e6c8",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5),
    );
  }

  /** 玩法说明：新档第一次进门自动弹出，也可随时从「玩法」按钮打开。 */
  showHelp() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(110);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.97).setOrigin(0, 0).setInteractive());
    layer.add(this.add.text(40, 80, "灵膳楼 · 掌柜须知", { fontSize: "30px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
    layer.add(
      this.add.text(40, 142, "你是被逐出师门的散修，带着一口旧锅，在青云镇外支起「灵膳楼」。", {
        fontSize: "17px",
        color: "#c8b8a0",
        fontStyle: "italic",
        wordWrap: { width: 640 },
      }),
    );
    layer.add(
      this.add.text(40, 176, "白日营生，夜里修行；总有一天，要踏破虚空。", {
        fontSize: "17px",
        color: "#c8b8a0",
        fontStyle: "italic",
      }),
    );
    layer.add(this.add.rectangle(40, 218, 640, 2, 0x8a6a3a).setOrigin(0, 0));
    const lines = [
      "营业前：采购灵材、雇伙计并安排分工、营造升级、选菜单，然后「开始营业」。",
      "营业中：门口排队 → 招待入座 → 出菜行点菜 → 用膳结账。",
      "营业中可左右拖动画面，查看门外排队与空地。",
      "天时每天随本机日期更换；本机每天第一次开店领「开市利是」，连续越久赏越多。",
      "只有亲自下厨得修为；端对口味 +50%，有想吃的却上错只付半价。",
      "亲手连续端对口味会累积连击，最多 +25% 售价；上错一次清零。",
      "修为推动境界突破，境界提高售价、操作速度与客流。",
      "修到大乘可飞升：重置本局，仙缘永久提高售价与开局资源。",
      "每天一个目标，达成有额外灵石与修为；连亏 5 日破产。",
      "「账簿」看成绩、「存档」备份；缺灵石可去灵石商行借小借。",
    ];
    lines.forEach((line, i) => {
      layer.add(
        this.add.text(40, 250 + i * 42, line, {
          fontSize: "17px",
          color: "#dddddd",
          wordWrap: { width: 640 },
          lineSpacing: 6,
        }),
      );
    });
    this.addOverlayClose(layer, 650, "知道了，去营生");
    this.overlay = layer;
  }

  /** 二级页面：账簿。跨周目累计数据、本机最高记录与成就。 */
  buildRecordOverlay() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(100);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.97).setOrigin(0, 0).setInteractive());
    layer.add(this.add.text(40, 70, "账簿", { fontSize: "30px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
    const meta = this.meta;
    const realmName = REALMS[Math.min(Math.max(0, meta.maxRealm), REALMS.length - 1)].name;
    const stats = [
      `累计营业 ${meta.days} 日`,
      `累计食客 ${meta.served} 位`,
      `累计收益 ${meta.revenue} 灵石`,
      `单日最高 ${meta.bestRevenue} 灵石`,
      `单日最多 ${meta.bestServed} 位食客`,
      `每日目标达成 ${meta.goalsMet} 次`,
      `最高境界 ${realmName} · 当前仙缘 ${this.ascensions} 重`,
    ];
    stats.forEach((line, i) => {
      layer.add(this.add.text(40, 126 + i * 30, line, { fontSize: "18px", color: "#dddddd" }));
    });
    layer.add(this.add.text(400, 126, "本机单日榜", { fontSize: "18px", color: "#ffd98a" }));
    if (this.meta.topDays.length === 0) {
      layer.add(this.add.text(400, 160, "尚无记录", { fontSize: "14px", color: "#777777" }));
    } else {
      this.meta.topDays.forEach((record, i) => {
        layer.add(
          this.add.text(400, 158 + i * 26, `${i + 1}. 第${record.day}日 · Lv${record.level} · ${record.revenue} 灵石`, {
            fontSize: "14px",
            color: i === 0 ? "#ffd98a" : "#bbbbbb",
          }),
        );
      });
    }

    const achievements = getAchievements(meta, this.ascensions);
    const unlocked = achievements.filter((item) => item.unlocked).length;
    layer.add(
      this.add.text(40, 352, `成就 ${unlocked}/${achievements.length}`, { fontSize: "20px", color: "#ffd98a" }),
    );
    achievements.forEach((item, i) => {
      const y = 392 + i * 32;
      layer.add(
        this.add.text(48, y, `${item.unlocked ? "✓" : "○"} ${item.name}`, {
          fontSize: "16px",
          color: item.unlocked ? "#9fdf6a" : "#777777",
        }),
      );
      layer.add(
        this.add.text(236, y + 1, item.desc, {
          fontSize: "14px",
          color: item.unlocked ? "#bbbbbb" : "#666666",
        }),
      );
    });

    this.addOverlayClose(layer, 740);
    this.overlay = layer;
  }

  /** 导出/导入存档。用浏览器原生输入框承载长文本（Phaser 没有文本输入控件）。 */
  openSaveDialog(mode: "export" | "import") {
    document.getElementById("save-dialog")?.remove();
    const overlay = document.createElement("div");
    overlay.id = "save-dialog";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;font-family:system-ui,sans-serif;";
    const panel = document.createElement("div");
    panel.style.cssText =
      "width:min(92vw,560px);background:#1b2440;border:2px solid #3f5a7a;border-radius:10px;padding:18px;color:#fff;box-sizing:border-box;";
    const title = document.createElement("div");
    title.textContent = mode === "export" ? "导出存档" : "导入存档";
    title.style.cssText = "font-size:22px;color:#ffd98a;margin-bottom:8px;";
    const hint = document.createElement("div");
    hint.textContent =
      mode === "export"
        ? "复制整段导出码保存。换设备或清空浏览器后，在这里选「导入存档」恢复。"
        : "粘贴 LS2. 开头的导出码。导入会覆盖本机当前进度。";
    hint.style.cssText = "font-size:14px;color:#bbbbbb;line-height:1.5;margin-bottom:10px;";
    const textarea = document.createElement("textarea");
    textarea.value = mode === "export" ? encodeSaveCode(this.buildSaveData()) : "";
    textarea.readOnly = mode === "export";
    textarea.placeholder = mode === "import" ? "在这里粘贴导出码" : "";
    textarea.style.cssText =
      "width:100%;height:170px;box-sizing:border-box;background:#0e1524;color:#cfe2ff;border:1px solid #3f5a7a;border-radius:6px;padding:10px;font-family:monospace;font-size:12px;resize:none;";
    const status = document.createElement("div");
    status.style.cssText = "min-height:20px;font-size:13px;color:#ff9a8a;margin:6px 0;";
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;";

    const button = (label: string, primary: boolean, onClick: () => void) => {
      const btn = document.createElement("button");
      btn.textContent = label;
      btn.style.cssText = `flex:1;min-width:110px;padding:12px;border-radius:6px;border:0;font-size:16px;cursor:pointer;background:${
        primary ? "#3f6a3f" : "#3a3a3a"
      };color:#fff;`;
      btn.addEventListener("click", onClick);
      row.appendChild(btn);
    };

    if (mode === "export") {
      button("复制导出码", true, () => {
        textarea.focus();
        textarea.select();
        const done = () => {
          status.style.color = "#9fe870";
          status.textContent = "已复制到剪贴板";
        };
        const fallback = () => {
          try {
            document.execCommand("copy");
            done();
          } catch {
            status.style.color = "#ff9a8a";
            status.textContent = "复制失败，请手动全选复制";
          }
        };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(textarea.value).then(done, fallback);
        else fallback();
      });
    } else {
      button("确认导入", true, () => {
        const data = decodeSaveCode(textarea.value);
        if (!data || typeof data !== "object" || (data as { v?: unknown }).v !== 2) {
          status.textContent = "导出码无效或版本不匹配";
          return;
        }
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify(data));
          // 禁止 beforeunload 用当前内存状态覆盖刚导入的存档
          this.suppressSave = true;
          location.reload();
        } catch {
          status.textContent = "无法写入本地存档（浏览器存储不可用）";
        }
      });
    }
    button(mode === "export" ? "导入存档" : "导出存档", false, () =>
      this.openSaveDialog(mode === "export" ? "import" : "export"),
    );
    button("关闭", false, () => overlay.remove());

    panel.append(title, hint, textarea, status, row);
    overlay.appendChild(panel);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) overlay.remove();
    });
    document.body.appendChild(overlay);
    if (mode === "export") {
      textarea.focus();
      textarea.select();
    }
  }

  // ===== 修行 =====
  realmIndex(): number {
    return getRealmIndex(this.cultivation);
  }

  currentDayGoal(): DailyGoal {
    if (!this.dailyGoal) this.dailyGoal = getDailyGoal(this.day, this.level);
    return this.dailyGoal;
  }

  /** 售价按当前境界加成结算。 */
  currentDailySpecial(): string | null {
    return getDailySpecial(this.day, this.level, this.unlockedDishIds());
  }

  baseDishPrice(dish: Dish): number {
    return Math.round(
      dish.price *
        getRealmPriceMultiplier(this.realmIndex()) *
        getAscensionPriceMultiplier(this.ascensions),
    );
  }

  dishPrice(dish: Dish): number {
    const price = getSpecialPrice(this.baseDishPrice(dish), this.currentDailySpecial() === dish.id);
    return Math.round(price * this.omen.priceFactor);
  }

  /** 采购价含天时折扣。 */
  purchasePrice(emergency: boolean): number {
    return Math.max(
      1,
      Math.round(getPurchasePrice(this.bestBuyer()?.stars.buy ?? 0, emergency) * this.omen.purchaseFactor),
    );
  }

  /** 一桌离店时的成交价：菜品价 × 身份 × 楼层 × 口味 × 连击 × 烹饪质量。 */
  boothPrice(booth: Booth, dish: Dish): number {
    const matched = booth.patronWish === dish.id;
    const hasWish = booth.patronWish !== null;
    const base = Math.round(
      this.dishPrice(dish) *
        (booth.patronKind?.priceFactor ?? 1) *
        getFloorPriceMultiplier(booth.floor) *
        getPostCapPriceBonus(this.level),
    );
    return Math.round(
      getWishPrice(base, matched, hasWish, this.omen.wishBonus) * (1 + booth.comboBonus) * booth.cookQuality,
    );
  }

  /** 只有玩家亲自下厨才计修为，天时可再多悟一分。 */
  cultivationGainFor(personal: boolean, matched: boolean, rare: boolean): number {
    return (
      getCultivationGain(personal) +
      (personal && matched ? GAME.cultivation.wishHitBonus : 0) +
      (personal && rare ? GAME.cultivation.rareBonus : 0) +
      (personal ? this.omen.cultivationBonus : 0)
    );
  }

  /** 跨过零点后换天时；同一本机日期内保持不变。 */
  refreshTodayOmen() {
    const key = localDateKey();
    if (key === this.todayKey) return;
    this.todayKey = key;
    this.omen = getDailyOmen(key);
  }

  /** 本机每天第一次开店才发，当天再开不重复领。 */
  grantDailyGift() {
    this.refreshTodayOmen();
    if (this.lastGiftDate === this.todayKey) return;
    this.giftStreak = getGiftStreak(this.lastGiftDate, this.todayKey, this.giftStreak);
    this.lastGiftDate = this.todayKey;
    const gift = getDailyGift(this.giftStreak, this.level);
    this.lastGift = { streak: this.giftStreak, ...gift };
    this.coins += gift.coins;
    this.displayedCoins = this.coins;
    this.inventory += gift.ingredients;
    this.gainCultivation(gift.cultivation);
    // 利是修为算跨日奖励，不计入「今日下厨修为」，避免结算里同一笔 +2 出现两次
    this.sessionCultivation = Math.max(0, this.sessionCultivation - gift.cultivation);
    this.log(
      `开市利是（连续第 ${this.giftStreak} 天）：+${gift.coins} 灵石、+${gift.cultivation} 修为${
        gift.ingredients ? `、+${gift.ingredients} 灵材` : ""
      }`,
    );
    this.showEventToast(`开市利是 · 连续第 ${this.giftStreak} 天 +${gift.coins} 灵石`, true);
    // 一次性跨日奖励立即落盘：营业中刷新会回退本局，但不能重领利是
    this.writeSave(this.buildSaveData());
  }

  /** 连击只奖励玩家亲手命中口味；达到 2 连起飘字，不打断节奏。 */
  showComboPopup() {
    const t = this.add
      .text(this.playerChar.x, this.playerChar.y - 84, `连击 ×${this.combo}`, {
        fontSize: "18px",
        color: "#ffb45a",
        fontFamily: XIAN_FONT,
        stroke: "#2a1a0a",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(31);
    this.tweens.add({
      targets: t,
      y: t.y - 34,
      alpha: 0,
      duration: 900,
      ease: "Sine.easeOut",
      onComplete: () => t.destroy(),
    });
  }

  gainCultivation(amount: number) {
    const before = this.realmIndex();
    this.cultivation += amount;
    this.sessionCultivation += amount;
    const after = this.realmIndex();
    if (after > before) {
      const realm = REALMS[after];
      this.log(`灵台清明，境界突破至「${realm.name}」——${realm.perk}`);
      this.celebrateBreakthrough(realm.name);
    }
  }

  /** 突破：白光一闪、金色灵环扩散、境界浮字。 */
  celebrateBreakthrough(realmName: string) {
    playSfx("upgrade");
    this.showEventToast(`突破 · ${realmName}`, true);
    this.cameras.main.flash(500, 255, 236, 170);
    const { x, y } = this.playerChar;
    for (let i = 0; i < 3; i++) {
      const ring = this.add
        .circle(x, y, 20, 0x000000, 0)
        .setStrokeStyle(4, 0xffe08a, 0.9)
        .setDepth(30);
      this.tweens.add({
        targets: ring,
        scale: 4.5,
        alpha: 0,
        delay: i * 120,
        duration: 700,
        ease: "Cubic.easeOut",
        onComplete: () => ring.destroy(),
      });
    }
    const text = this.add
      .text(x, y - 90, `突破 · ${realmName}`, {
        fontSize: "26px",
        color: "#ffe08a",
        stroke: "#3a2a10",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(45);
    this.tweens.add({
      targets: text,
      y: y - 150,
      alpha: 0,
      duration: 1400,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy(),
    });
    this.refreshPlayerAura();
  }

  /** 境界灵气：颜色与大小随境界、仙缘变化。 */
  refreshPlayerAura() {
    const colors = [0x8ab4ff, 0x7fe8dd, 0x9fe870, 0xffd98a, 0xff9a6a, 0xc8a8ff, 0xff8ad8, 0xfff2c0];
    this.playerChar?.setAura(colors[this.realmIndex()] ?? 0xfff2c0, 1 + this.ascensions * 0.12);
  }

  /** 烹饪中的桌上冒热气；没开火时灶台自己冒。 */
  emitCookingSteam() {
    if (this.gameState !== "open" || this.settling) return;
    let puffs = 0;
    this.booths.forEach((booth, i) => {
      if (puffs >= 3 || booth.state !== "cooking") return;
      puffs += 1;
      const table = this.tablePosition(i);
      this.spawnSteam(table.x + Phaser.Math.Between(-10, 10), FLOOR_Y - 84);
    });
    if (puffs === 0) this.spawnSteam(-272 + Phaser.Math.Between(-8, 8), 826, 0.16);
  }

  /** 上菜后桌上出现碗筷与热气，让「用膳」这件事看得见。 */
  /** 用膳套件：桌沿上的碗、两只手、袖子与筷子，跟着整段用餐存在。 */
  showDiningProp(index: number) {
    const booth = this.booths[index];
    booth.diningProp?.destroy();
    const table = this.tablePosition(index);
    const skin = 0xffe0bd;
    const body = booth.patronKind?.bodyColor ?? 0x7a8a6a;
    const layer = this.add.container(table.x, FLOOR_Y - 24).setDepth(21);
    const arms = this.add.graphics();
    arms.lineStyle(5, body, 1);
    arms.beginPath();
    arms.moveTo(-22, 6);
    arms.lineTo(-10, 0);
    arms.strokePath();
    arms.beginPath();
    arms.moveTo(22, 6);
    arms.lineTo(14, 0);
    arms.strokePath();
    arms.fillStyle(skin, 1);
    arms.fillCircle(-9, 0, 3.4);
    arms.fillCircle(14, 0, 3.4);
    arms.lineStyle(1, 0xd8a07a, 0.8);
    arms.lineBetween(-11, -1, -8, -1);
    arms.lineBetween(12, -1, 15, -1);
    layer.add(arms);
    const bowl = this.add.ellipse(10, 0, 34, 13, 0xf1e4cc);
    const rim = this.add.ellipse(10, -1, 28, 9, 0xe8d8bc);
    const soup = this.add.ellipse(10, -1, 20, 6, 0xd98a4a);
    const stick = this.add.rectangle(15, -7, 2, 24, 0x6a4a2a).setAngle(26);
    layer.add([bowl, rim, soup, stick]);
    for (const x of [-2, 10]) {
      const steam = this.add.ellipse(x, -10, 10, 5, 0xe8e8e8, 0.22);
      layer.add(steam);
      this.tweens.add({
        targets: steam,
        y: -26,
        alpha: 0,
        duration: 1500,
        delay: Phaser.Math.Between(0, 700),
        repeat: -1,
        ease: "Sine.easeOut",
      });
    }
    booth.diningProp = layer;
  }

  /** 每日开张的题头：日期 + 今日天时，给每一局一个开场仪式。 */
  showDayBanner() {
    const weather = isFestivalDay(this.day)
      ? `灯会开市 · 天时 ${this.omen.name}`
      : `天时 · ${this.omen.name} · ${this.omen.short}`;
    const layer = this.add.container(0, 0).setScrollFactor(0).setDepth(29);
    const wrap = this.add.container(0, 0);
    wrap.add(
      this.add
        .text(360, 185, `第 ${this.day} 日`, {
          fontSize: "48px",
          color: "#ffe6a8",
          stroke: "#2a1a0a",
          strokeThickness: 5,
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(8),
    );
    wrap.add(this.add.rectangle(360, 231, 220, 1, 0xd9b45a, 0.6));
    wrap.add(
      this.add
        .text(360, 253, weather, {
          fontSize: "20px",
          color: "#e0c9a0",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(4),
    );
    wrap.setAlpha(0);
    layer.add(wrap);
    // 灯会开市的小金花：只在第 7/14/… 日出现
    if (isFestivalDay(this.day)) {
      for (let i = 0; i < 18; i++) {
        const angle = (Math.PI * 2 * i) / 18 + Phaser.Math.FloatBetween(-0.2, 0.2);
        const dist = Phaser.Math.Between(70, 190);
        const spark = this.add
          .circle(360, 200, Phaser.Math.FloatBetween(1.5, 3.5), i % 3 === 0 ? 0xff6a4a : 0xffd98a, 1)
          .setScrollFactor(0);
        layer.add(spark);
        this.tweens.add({
          targets: spark,
          x: 360 + Math.cos(angle) * dist,
          y: 200 + Math.sin(angle) * dist + 30,
          alpha: 0,
          duration: Phaser.Math.Between(900, 1500),
          delay: Phaser.Math.Between(0, 350),
          ease: "Sine.easeOut",
          onComplete: () => spark.destroy(),
        });
      }
    }
    // 日题头落在牌匾位置，暂时让出牌匾，避免两层大字叠在一起
    this.interiorSign?.setAlpha(0);
    this.tweens.add({ targets: wrap, alpha: 1, y: 8, duration: 500, ease: "Sine.easeOut" });
    this.tweens.add({
      targets: wrap,
      alpha: 0,
      y: -8,
      delay: 1700,
      duration: 700,
      ease: "Sine.easeIn",
      onComplete: () => {
        layer.destroy();
        this.interiorSign?.setAlpha(1);
      },
    });
  }

  /** 天时对应的天气粒子：晴=流萤，灵雾=低雾，落英=花瓣，夜雨=雨丝。纯氛围。 */
  emitWeather() {
    if (this.gameState !== "open" || this.settling) return;
    const mode = this.omen.visual;
    const cam = this.cameras.main;
    const x = cam.scrollX + Phaser.Math.Between(30, 690);
    if (mode === 1) {
      const mist = this.add
        .ellipse(
          x,
          Phaser.Math.Between(FLOOR_Y - 230, FLOOR_Y - 40),
          Phaser.Math.Between(160, 260),
          Phaser.Math.Between(20, 34),
          0xdfe9f5,
          0.06,
        )
        .setDepth(5);
      this.tweens.add({
        targets: mist,
        x: mist.x + Phaser.Math.Between(40, 90),
        alpha: 0,
        duration: 3200,
        ease: "Sine.easeOut",
        onComplete: () => mist.destroy(),
      });
    } else if (mode === 2) {
      const petal = this.add
        .rectangle(
          x,
          Phaser.Math.Between(120, 260),
          5,
          8,
          Math.random() < 0.5 ? 0xffb8c8 : 0xffd98a,
          0.85,
        )
        .setDepth(25)
        .setAngle(Phaser.Math.Between(0, 180));
      this.tweens.add({
        targets: petal,
        y: FLOOR_Y - 30,
        x: x + Phaser.Math.Between(-50, 50),
        angle: 260,
        alpha: 0,
        duration: Phaser.Math.Between(2600, 4200),
        ease: "Sine.easeIn",
        onComplete: () => petal.destroy(),
      });
    } else if (mode === 3) {
      const drop = this.add
        .rectangle(x, Phaser.Math.Between(140, 320), 2, Phaser.Math.Between(14, 26), 0xbcd6ff, 0.5)
        .setDepth(25);
      this.tweens.add({
        targets: drop,
        y: FLOOR_Y - 40,
        x: x - 24,
        alpha: 0,
        duration: Phaser.Math.Between(900, 1400),
        ease: "Sine.easeIn",
        onComplete: () => drop.destroy(),
      });
    } else if (Math.random() < 0.45) {
      const mote = this.add
        .circle(x, Phaser.Math.Between(400, FLOOR_Y - 60), 1.6, 0xffe08a, 0.55)
        .setDepth(24);
      this.tweens.add({
        targets: mote,
        y: mote.y - Phaser.Math.Between(30, 70),
        alpha: 0,
        duration: Phaser.Math.Between(1800, 2800),
        ease: "Sine.easeOut",
        onComplete: () => mote.destroy(),
      });
    }
  }

  /** 随机让一个在场的小人做个小动作。 */
  idleTwitch() {
    if (this.gameState !== "open" || this.settling) return;
    const chars: Character[] = [this.playerChar];
    for (const b of this.booths) if (b.patronChar) chars.push(b.patronChar);
    for (const q of this.queue) chars.push(q.char);
    for (const c of this.staffChars()) if (c.visible) chars.push(c);
    chars[Math.floor(Math.random() * chars.length)]?.twitch();
  }

  /** 点人物/桌卡：拉出一张人物卡，而不是裸镜头推近。 */
  focusOnCharacter(char: Character) {
    if (this.gameState !== "open" || this.settling) return;
    if (this.focusing && this.focusChar === char) {
      this.returnFromFocus();
      return;
    }
    if (!this.focusing) {
      this.focusing = true;
      this.setFocusUiHidden(true);
    }
    this.focusChar = char;
    // 用膳中的客人多留一会儿，卡还没收起饭不能先撤
    const diningBooth = this.booths.find((b) => b.patronChar === char && b.state === "dining");
    if (diningBooth) diningBooth.departAt = Math.max(diningBooth.departAt, this.time.now + 4500);
    this.focusTimer?.remove();
    this.eventToast?.destroy();
    this.eventToast = undefined;
    this.hintToast?.destroy();
    this.hintToast = undefined;
    char.clearBubble();
    this.clearFocusCard();
    const who = char.displayName ?? "人物";
    const line = this.focusLineFor(char);
    const overlay = this.add
      .rectangle(0, 0, SCREEN_W, SCREEN_H, 0x0a0704, 0.78)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100);
    const openedAt = this.time.now;
    overlay.setInteractive({ useHandCursor: true }).on("pointerup", () => {
      if (this.time.now - openedAt > 250) this.returnFromFocus();
    });
    const panel = this.add.graphics().setScrollFactor(0).setDepth(101);
    panel.fillStyle(0x1b140d, 0.97);
    panel.fillRoundedRect(180, 580, 360, 540, 18);
    panel.lineStyle(3, 0xd9b45a, 0.85);
    panel.strokeRoundedRect(180, 580, 360, 540, 18);
    panel.lineStyle(1, 0xd9b45a, 0.3);
    panel.strokeRoundedRect(194, 594, 332, 512, 14);
    // 卡内淡墨山与朱印，和标题页的水墨气质接上
    panel.fillStyle(0x0b0704, 0.45);
    panel.fillTriangle(205, 990, 300, 790, 395, 990);
    panel.fillTriangle(330, 990, 425, 820, 515, 990);
    panel.fillStyle(0x8a2a22, 0.85);
    panel.fillRect(506, 606, 16, 22);
    panel.lineStyle(1, 0xd9b45a, 0.6);
    panel.strokeRect(506, 606, 16, 22);
    const spec = char.portraitSpec();
    const portrait = new Character(
      this,
      360,
      900,
      spec.bodyColor,
      spec.hairColor,
      spec.longHair,
      spec.look,
    );
    portrait.usePixelArt(false);
    portrait.setScrollFactor(0).setScale(4.2).setDepth(101.5);
    portrait.disableInteractive();
    portrait.setMood(spec.mood);
    if (spec.dining) portrait.setDining(true);
    else if (spec.seated) portrait.setSeated(true);
    portrait.setDepth(101.5).setScrollFactor(0);
    this.tweens.add({
      targets: portrait,
      y: 894,
      duration: 220,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
    this.focusOverlay = overlay;
    this.focusPanel = panel;
    this.focusPortrait = portrait;
    this.focusName = this.add
      .text(360, 606, who, {
        fontSize: "20px",
        color: "#ffe6a8",
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(102);
    this.focusRole = this.add
      .text(360, 634, this.focusRoleLine(spec.look), {
        fontSize: "16px",
        color: "#c8b89a",
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(102);
    if (spec.seated || spec.dining) {
      // 卡内也给出桌沿/桌面，坐下的人不是悬空半身像
      const table = this.add.graphics().setScrollFactor(0).setDepth(101.55);
      table.fillStyle(0x4a3020, 1);
      table.fillRoundedRect(180, 1000, 360, 100, 6);
      table.fillStyle(0x6a4a2a, 1);
      table.fillRect(180, 1000, 360, 14);
      table.fillStyle(0x8a2a22, 0.9);
      table.fillRect(210, 1002, 300, 5);
      table.lineStyle(1, 0xd9b45a, 0.5);
      table.strokeRoundedRect(180, 1000, 360, 100, 6);
      this.focusTable = table;
    }
    if (spec.dining) {
      const prop = this.add.container(360, 970).setScrollFactor(0).setDepth(101.6);
      const bowl = this.add.ellipse(0, 0, 130, 44, 0xf1e4cc);
      const rim = this.add.ellipse(0, -2, 108, 30, 0xe8d8bc);
      const soup = this.add.ellipse(0, -2, 80, 20, 0xd98a4a);
      const stick = this.add.rectangle(18, -24, 6, 90, 0x6a4a2a).setAngle(26);
      prop.add([bowl, rim, soup, stick]);
      for (const sx of [-18, 18]) {
        const steam = this.add.ellipse(sx, -36, 36, 16, 0xf0e8e0, 0.38);
        prop.add(steam);
        this.tweens.add({
          targets: steam,
          y: -86,
          alpha: 0,
          duration: 1800,
          delay: Phaser.Math.Between(0, 800),
          repeat: -1,
          ease: "Sine.easeOut",
        });
      }
      this.focusProp = prop;
    }
    this.focusCaption = this.add
      .text(360, 1152, `${line ? `「${line}」\n` : ""}点画面任意处退出 · 3.6s`, {
        fontSize: "20px",
        color: "#ffe6c8",
        align: "center",
        fontFamily: XIAN_FONT,
        wordWrap: { width: 600 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(102);
    this.focusTimer = this.time.delayedCall(3600, () => this.returnFromFocus());
  }

  clearFocusCard() {
    this.focusOverlay?.destroy();
    this.focusOverlay = undefined;
    this.focusPanel?.destroy();
    this.focusPanel = undefined;
    this.focusPortrait?.destroy();
    this.focusPortrait = undefined;
    this.focusProp?.destroy();
    this.focusProp = undefined;
    this.focusTable?.destroy();
    this.focusTable = undefined;
    this.focusCaption?.destroy();
    this.focusCaption = undefined;
    this.focusName?.destroy();
    this.focusName = undefined;
    this.focusRole?.destroy();
    this.focusRole = undefined;
  }

  /** 特写台词按此人此刻在做什么来取，避免排队客人说"结账"。 */
  focusRoleLine(look: CharacterLook): string {
    const lines: Record<CharacterLook, string> = {
      player: "掌柜 · 青锋剑",
      sword: "剑修 · 飞剑「青霜」",
      rogue: "散修 · 短刃「无咎」",
      alchemist: "丹修 · 紫金丹葫",
      elder: "仙门长老 · 竹节杖",
      demon: "妖修 · 赤尾利爪",
      demonlord: "魔道散人 · 玄骨扇",
      mortal: "凡人 · 一副挑担",
      server: "跑堂 · 托盘",
      cook: "灶上 · 铁锅勺",
      hawker: "迎客 · 酒旗",
    };
    return lines[look] ?? "灵膳楼 · 食客";
  }

  focusLineFor(char: Character): string {
    if (this.queue.some((p) => p.char === char)) return "前面还有几位？";
    const booth = this.booths.find((b) => b.patronChar === char);
    if (booth) {
      const regular = booth.patronRegular
        ? this.regulars.find(
            (r) => r.name === booth.patronName && r.kindId === booth.patronKind?.id,
          )
        : undefined;
      if (regular) return `第 ${regular.visits + 1} 次来，还是老味道。`;
      const id = booth.patronKind?.id;
      if (booth.state === "dining") return id === "demon" ? "够味，痛快！" : "入口生津，灵气自生。";
      if (booth.state === "awaitingCook") return id === "demonlord" ? "本座只等一炷香。" : "菜还没好么？";
      return "店家，有劳。";
    }
    return char.lastLine ?? "";
  }

  /** 退出人物卡：恢复 HUD；点画面任意处、再点同一人或计时结束都会退出。 */
  returnFromFocus() {
    this.focusTimer?.remove();
    this.focusTimer = undefined;
    this.focusing = false;
    this.focusChar = undefined;
    this.clearFocusCard();
    this.setFocusUiHidden(false);
    this.refreshHud();
  }

  /** 特写期间收起界面；否则相机缩放会把屏幕固定的 HUD 一起放大、错位。 */
  setFocusUiHidden(hidden: boolean) {
    const ui: { setVisible(visible: boolean): unknown }[] = [
      this.hudBar,
      this.hudLine,
      this.hudChips,
      this.rightFrame,
      this.coinsText,
      this.inventoryText,
      this.queueText,
      this.realmText,
      this.cultivationText,
      this.goalText,
      this.sessionText,
      this.reputationText,
      this.reputationBarBg,
      this.reputationBar,
      this.chronicleText,
      this.omenBadge,
      this.comboBadge,
      this.sfxButton,
      this.startButton,
      this.serveButton,
      this.cookButton,
      this.dishChipLabel,
      ...this.dishChips,
      ...this.floorTabs.flatMap((tab) => [tab.bg, tab.label, tab.sub]),
    ];
    ui.forEach((obj) => obj.setVisible(!hidden));
    this.purchaseButton.setVisible(!hidden);
    this.tutorialBanner.setVisible(false);
  }

  /** 玩家亲自下厨/招待时，身周升起灵气微光。 */
  emitQi() {
    if (this.gameState !== "open" || this.settling) return;
    if (this.playerCookingBooth === null && this.playerSeat === null) return;
    const p = this.playerChar;
    const dot = this.add
      .circle(
        p.x + Phaser.Math.Between(-16, 16),
        p.y - Phaser.Math.Between(6, 38),
        Phaser.Math.FloatBetween(1.2, 2.6),
        Math.random() < 0.3 ? 0xffe08a : 0x9fe8ff,
        0.85,
      )
      .setDepth(19);
    this.tweens.add({
      targets: dot,
      y: dot.y - Phaser.Math.Between(24, 46),
      alpha: 0,
      duration: 720,
      ease: "Sine.easeOut",
      onComplete: () => dot.destroy(),
    });
  }

  spawnSteam(x: number, y: number, alpha = 0.26) {
    const puff = this.add.circle(x, y, Phaser.Math.Between(3, 5), 0xe8e8e8, alpha).setDepth(4);
    this.tweens.add({
      targets: puff,
      y: y - Phaser.Math.Between(30, 50),
      alpha: 0,
      scale: 1.8,
      duration: 900,
      ease: "Sine.easeOut",
      onComplete: () => puff.destroy(),
    });
  }

  /** 店里慢慢浮动的尘埃/灵光，让静态墙面有一点呼吸。 */
  emitInteriorMote() {
    if (this.gameState !== "open" || this.settling) return;
    const x = Phaser.Math.Between(-260, 260);
    const y = Phaser.Math.Between(380, 960);
    const mote = this.add
      .circle(x, y, Phaser.Math.FloatBetween(0.8, 2), 0xffe0a0, 0.35)
      .setDepth(6);
    this.tweens.add({
      targets: mote,
      y: y - Phaser.Math.Between(24, 60),
      x: x + Phaser.Math.Between(-18, 18),
      alpha: 0,
      duration: Phaser.Math.Between(2200, 3800),
      ease: "Sine.easeOut",
      onComplete: () => mote.destroy(),
    });
  }

  /** 门外空地的流萤，给营业中添一点活气。 */
  emitFirefly() {
    if (this.gameState !== "open" || this.settling || this.fireflyCount >= 6) return;
    this.fireflyCount += 1;
    const x = Phaser.Math.Between(380, 900);
    const y = Phaser.Math.Between(FLOOR_Y - 240, FLOOR_Y - 20);
    const dot = this.add.circle(x, y, Phaser.Math.Between(1, 3), 0xffe08a, 0.9).setDepth(6);
    this.tweens.add({
      targets: dot,
      x: x + Phaser.Math.Between(-40, 40),
      y: y + Phaser.Math.Between(-40, 20),
      alpha: 0,
      duration: Phaser.Math.Between(2200, 3600),
      ease: "Sine.easeInOut",
      onComplete: () => {
        dot.destroy();
        this.fireflyCount -= 1;
      },
    });
  }

  /** 小人偶尔冒一句话：排队、等菜、用膳和伙计各有台词，让画面不只剩数字。 */
  ambientBark() {
    if (this.gameState !== "open" || this.settling || this.focusing) return;
    if (Math.random() < 0.35) return;
    const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];
    const diningNow = this.booths.filter((b) => b.state === "dining" && b.patronChar);
    // 两桌都在用膳时，优先让他们真的碰一次杯（两人一起动 + 金色酒花），而不只是各说各话
    if (diningNow.length >= 2 && Math.random() < 0.55) {
      const i = Math.floor(Math.random() * diningNow.length);
      let j = Math.floor(Math.random() * (diningNow.length - 1));
      if (j >= i) j += 1;
      const a = diningNow[i].patronChar;
      const b = diningNow[j].patronChar;
      if (a && b) {
        this.showClink(a, b);
        return;
      }
    }
    const speakers: { char: Character; text: string; cold?: boolean }[] = [];
    this.booths.forEach((booth) => {
      const char = booth.patronChar;
      if (!char) return;
      const id = booth.patronKind?.id;
      if (booth.state === "awaitingCook") {
        speakers.push({
          char,
          text:
            id === "demonlord"
              ? "本座的时间，很贵。"
              : id === "elder"
                ? "一炷香内，可否？"
                : pick(["菜还没好么？", "这炉火候，有点意思。", "先上一壶清茶也行。"]),
          cold: id === "demonlord",
        });
      } else if (booth.state === "dining") {
        speakers.push({
          char,
          text:
            id === "sword"
              ? "剑意未平，先填五脏。"
              : id === "demon"
                ? "够味，痛快！"
                : id === "mortal"
                  ? "真香！"
                  : pick(["入口生津，灵气自生。", "掌柜好手艺。", "此味只应天上有。"]),
        });
      }
    });
    this.queue.slice(0, 2).forEach((p) => {
      speakers.push({ char: p.char, text: pick(["前面还有几位？", "这香气……不似凡间。", "听闻此楼灵膳能助修行。"]) });
    });
    const dining = this.booths.filter((b) => b.state === "dining" && b.patronChar);
    if (dining.length >= 2) {
      const others = dining[Math.floor(Math.random() * dining.length)].patronChar!;
      speakers.push({
        char: others,
        text: pick(["道友，共饮一杯？", "这家的灵茶不错。", "听闻掌柜是散修出身。", "山外云深，不如先吃。"])
      });
    }
    const jobLines: Record<Job | "none", string[]> = {
      cook: ["火候到了。", "再添一把柴。", "这锅气，成了。"],
      seat: ["客官里边请——", "小心台阶。", "雅座已备好。"],
      buy: ["今日有鲜货！", "灵材我盯着呢。", "客官，里边请！"],
      none: ["灵膳楼开张，仙凡同席！"],
    };
    for (const e of this.employees) {
      const char = this.staffRt.get(e.id)?.char;
      if (char?.visible) speakers.push({ char, text: pick(jobLines[this.firstJob(e) ?? "none"]) });
    }
    if (speakers.length === 0) return;
    const chosen = speakers[Math.floor(Math.random() * speakers.length)];
    chosen.char.say(chosen.text, chosen.cold ? "cold" : "warm");
  }

  /** 两桌食客碰杯：两人同时欠身，桌间升起金色酒花与「碰杯」。 */
  showClink(a: Character, b: Character) {
    this.lastClinkAt = this.time.now;
    a.pulse();
    b.pulse();
    a.cheer(a.x < b.x ? 1 : -1);
    b.cheer(b.x < a.x ? 1 : -1);
    a.say(
      ["道友，共饮一杯？", "此味配灵茶，正好。", "同席是缘，干杯。"][
        Math.floor(Math.random() * 3)
      ],
    );
    // 另一桌隔半秒回一句，画面里才像两个人在说话，而不是系统播报
    this.time.delayedCall(900, () => {
      if (b.active) b.say(["好酒！", "同饮。", "道友先请。", "这杯敬掌柜。"][Math.floor(Math.random() * 4)]);
    });
    const x = (a.x + b.x) / 2;
    const y = ACTOR_Y - 58;
    const label = this.add
      .text(x, y - 16, "碰杯", {
        fontSize: "15px",
        color: "#ffe6a8",
        backgroundColor: "rgba(30,22,15,0.9)",
        padding: { x: 6, y: 3 },
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setDepth(25);
    this.tweens.add({
      targets: label,
      y: y - 44,
      alpha: 0,
      duration: 1600,
      ease: "Sine.easeOut",
      onComplete: () => label.destroy(),
    });
    for (let i = 0; i < 4; i++) {
      const spark = this.add
        .circle(x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-8, 8), 2, 0xffe08a, 0.95)
        .setDepth(25);
      this.tweens.add({
        targets: spark,
        y: spark.y - Phaser.Math.Between(18, 30),
        alpha: 0,
        duration: 900,
        delay: i * 60,
        ease: "Sine.easeOut",
        onComplete: () => spark.destroy(),
      });
    }
  }

  getMenuDishes(): Dish[] {
    return DISHES.filter((d) => this.selectedDishIds.has(d.id) && d.unlockLevel <= this.level);
  }

  /** 食客点名的范围是已解锁的全部菜，不是今日菜单。 */
  unlockedDishIds(): string[] {
    return DISHES.filter((d) => d.unlockLevel <= this.level).map((d) => d.id);
  }

  showEventToast(message: string, good: boolean) {
    if (this.focusing) return;
    const toast = this.add
      .text(SCREEN_W / 2, 600, message, {
        fontSize: "19px",
        color: good ? "#ffe6c8" : "#ff9a8a",
        backgroundColor: "rgba(30,22,15,0.94)",
        padding: { x: 16, y: 10 },
        align: "center",
        wordWrap: { width: 600 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(45)
      .setAlpha(0);
    this.eventToast?.destroy();
    this.eventToast = toast;
    this.tweens.add({
      targets: toast,
      alpha: 1,
      y: 580,
      duration: 260,
      yoyo: true,
      hold: 1800,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (this.eventToast === toast) this.eventToast = undefined;
        toast.destroy();
      },
    });
  }

  buildFloor() {
    const next = this.floorsBuilt + 1;
    if (next >= MAX_FLOORS) return;
    const def = FLOOR_UNLOCKS[next - 1];
    if (this.level < def.level) {
      this.showHint(`酒楼到 Lv${def.level} 才能起${next === 1 ? "二楼" : "三楼"}`);
      return;
    }
    if (this.coins < def.cost) {
      this.showHint(`起楼要 ${def.cost} 灵石`);
      return;
    }
    this.coins -= def.cost;
    this.displayedCoins = this.coins;
    this.floorsBuilt = next;
    this.activeFloor = next;
    this.syncBooths();
    this.applyFloorLook();
    this.save();
    this.log(`起${next === 1 ? "二楼" : "三楼"}！新增雅座与新的楼层`);
    this.buildBuildOverlay();
  }

  upgradeTavern() {
    const cost = getUpgradeCost(this.level);
    if (this.coins < cost) {
      this.log("灵石不足，无法装潢升级");
      return;
    }
    this.coins -= cost;
    this.displayedCoins = this.coins;
    this.level += 1;
    this.syncBooths();
    this.drawInterior(this.interiorGfx);
    // 多一张桌子就会多吃货，升级附赠一点灵材，避免第二天立刻断货
    this.inventory += 5;
    // 打烊期升级发生在开张前：保持玩家已选的目标类型，只更新数值
    if (this.gameState === "closed") {
      const options = getDailyGoalOptions(this.day, this.level);
      this.dailyGoal = options.find((o) => o.kind === this.dailyGoal?.kind) ?? options[0];
    }
    const unlocked = DISHES.find((d) => d.unlockLevel === this.level);
    if (unlocked) this.selectedDishIds.add(unlocked.id);
    this.save();
    playSfx("upgrade");
    this.log(
      unlocked
        ? `酒楼扩建到 ${this.level} 级，解锁新菜品「${unlocked.name}」并加入今日菜单，附赠 5 灵材`
        : `酒楼扩建到 ${this.level} 级，附赠 5 灵材`,
    );
    this.destroyOverlay();
    this.showEventToast(`营造升至 Lv${this.level}`, true);
  }

  upgradeStove() {
    const cost = getStoveUpgradeCost(this.stoveLevel);
    if (this.coins < cost) {
      this.log("灵石不足，无法精修灶台");
      return;
    }
    this.coins -= cost;
    this.displayedCoins = this.coins;
    this.stoveLevel += 1;
    this.drawInterior(this.interiorGfx);
    this.save();
    playSfx("upgrade");
    this.log(`灶台精修至 Lv${this.stoveLevel}，烹饪耗时再降一成`);
    this.destroyOverlay();
    this.showEventToast(`灶台升至 Lv${this.stoveLevel}`, true);
  }

  upgradeSign() {
    const cost = getSignUpgradeCost(this.signLevel);
    if (this.coins < cost) {
      this.log("灵石不足，无法更换门面幡旗");
      return;
    }
    this.coins -= cost;
    this.displayedCoins = this.coins;
    this.signLevel += 1;
    this.drawTavern(this.tavernGfx, this.lastLit);
    this.save();
    playSfx("upgrade");
    this.log(`门面挂上新幡（招客效果待重做）`);
    this.destroyOverlay();
    this.showEventToast(`门幡升至 Lv${this.signLevel}`, true);
  }

  /** 灵石商行借贷：到账即加灵石，之后每回合还一期。 */
  takeLoan(def: LoanDef) {
    if (this.borrowedIds.has(def.id) || this.level < def.unlockLevel || this.day < def.minDay) return;
    this.borrowedIds.add(def.id);
    this.coins += def.principal;
    this.displayedCoins = this.coins;
    this.activeLoans.push({ name: def.name, remaining: def.totalRepay, periodsLeft: LOAN_PERIODS });
    this.save();
    playSfx("coin");
    this.log(`向灵石商行${def.name}，得 ${def.principal} 灵石，分 ${LOAN_PERIODS} 期偿还`);
  }

  /** 端对口味时桌上冒一颗心。 */
  showWishReaction(worldX: number, worldY: number) {
    const heart = this.add
      .text(worldX, worldY, "♥", {
        fontSize: "26px",
        color: "#ff8ab0",
        stroke: "#4a1a2a",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(26);
    this.tweens.add({
      targets: heart,
      y: worldY - 46,
      alpha: 0,
      scale: 1.5,
      duration: 900,
      ease: "Cubic.easeOut",
      onComplete: () => heart.destroy(),
    });
  }

  /** 亲自出菜得修为时，在桌上飘一行青色「+N 修为」。 */
  showCultivationPopup(worldX: number, worldY: number, amount: number) {
    const text = this.add
      .text(worldX, worldY, `+${amount} 修为`, {
        fontSize: "20px",
        color: "#9fe8ff",
        stroke: "#123040",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(26);
    this.tweens.add({
      targets: text,
      y: worldY - 42,
      alpha: 0,
      duration: 900,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy(),
    });
  }

  coinRollTween: Phaser.Tweens.Tween | null = null;

  /** 食客离店时在桌子上方弹出收益浮字，飞到 HUD 灵石处后让数字滚动。 */
  showCoinPopup(worldX: number, worldY: number, amount: number) {
    this.coins += amount;
    const cam = this.cameras.main;
    const sx = worldX - cam.scrollX;
    const sy = worldY;

    const container = this.add.container(sx, sy).setScrollFactor(0).setDepth(40);
    const glow = this.add.circle(0, 0, 16, 0x7fe8dd, 0.35);
    const stone = this.add.graphics();
    const shape = [
      new Phaser.Geom.Point(0, -13),
      new Phaser.Geom.Point(11, -4),
      new Phaser.Geom.Point(8, 11),
      new Phaser.Geom.Point(-8, 11),
      new Phaser.Geom.Point(-11, -4),
    ];
    stone.fillStyle(0x7fe8dd, 1);
    stone.fillPoints(shape, true);
    stone.lineStyle(2, 0xffffff, 0.9);
    stone.strokePoints(shape, true);
    stone.fillStyle(0xffffff, 0.55);
    stone.fillTriangle(-6, -3, 3, -5, -1, 7);
    const text = this.add.text(17, -10, `+${amount}`, {
      fontSize: "20px",
      color: "#a8f5e8",
      stroke: "#173a36",
      strokeThickness: 3,
    });
    container.add([glow, stone, text]);

    this.tweens.add({ targets: container, y: sy - 34, duration: 260, ease: "Sine.easeOut" });
    this.tweens.add({
      targets: container,
      x: 54,
      y: 22,
      scale: 0.45,
      alpha: 0,
      delay: 280,
      duration: 560,
      ease: "Cubic.easeIn",
      onComplete: () => {
        container.destroy(true);
        this.rollCoinsDisplay();
      },
    });
  }
}

// 方法按功能分散在各文件（见 src/ARCHITECTURE.md），这里合并进 TavernScene 的类型与原型。
export interface TavernScene extends TextureMethods, TitleMethods, SaveMethods, WorldMethods, UiMethods, FloorMethods, HudMethods, SessionMethods, ProductionMethods, StaffMethods, PatronMethods {}
for (const mixin of [TextureMethods, TitleMethods, SaveMethods, WorldMethods, UiMethods, FloorMethods, HudMethods, SessionMethods, ProductionMethods, StaffMethods, PatronMethods]) {
  for (const name of Object.getOwnPropertyNames(mixin.prototype)) {
    if (name === "constructor") continue;
    // 两个文件定义了同名方法会互相覆盖，启动时直接报错
    if (Object.prototype.hasOwnProperty.call(TavernScene.prototype, name)) throw new Error(`TavernScene 方法重名：${name}`);
    Object.defineProperty(TavernScene.prototype, name, Object.getOwnPropertyDescriptor(mixin.prototype, name)!);
  }
}
