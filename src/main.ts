import Phaser from "phaser";
import { loadAudioSettings, playSfx, setBgmMuted, setSfxMuted, startBgm } from "./audio";
import {
  BANKRUPT_STREAK,
  DISHES,
  LOANS,
  LOAN_PERIODS,
  MAX_STAFF_LEVEL,
  NIGHT_COLOR,
  PATRON_KINDS,
  REALMS,
  applyEvent,
  getArrivalInterval,
  getAscensionPriceMultiplier,
  getBoothCount,
  getCultivationGain,
  getDailyGoal,
  getGoalProgress,
  getLoanDue,
  getNextRealm,
  getPlayerDuration,
  getPurchaseDuration,
  getPurchasePrice,
  getRealmArrivalFactor,
  getRealmIndex,
  getRealmPlayerSpeedFactor,
  getRealmPriceMultiplier,
  getRealmStaffSpeedFactor,
  getStaffDuration,
  getStaffLevel,
  getStaffWage,
  getUpgradeCost,
  getWishPrice,
  isGoalMet,
  pickPatronWish,
  pickRandomEvent,
  skyColorAt,
} from "./logic";
import { EXP_PER_LEVEL } from "./logic";
import type { DailyGoal, Dish, LoanDef, PatronKind, StaffRole } from "./logic";

// ===== 本文件独有的常量 =====
const QUEUE_PATIENCE_MS = 8000;
const LAST_CALL_MS = 10000;
const DINING_MS = 3000;
const SESSION_DURATION_MS = 60000;
const PURCHASE_AMOUNT = 5;
const PURCHASE_TARGET_STOCK = 10;
const STARTING_COINS = 20;
const STARTING_INVENTORY = 5;
const HIRE_COST_HAWKER = 30;
const HIRE_COST_SERVER = 40;
const HIRE_COST_COOK = 50;
const HIRE_COST_BUYER = 35;
const CHRONICLE_MAX_LINES = 5;
const SAVE_KEY = "tavern_save_v1";
const AUTOSAVE_MS = 2000;
const MAX_EVENTS_PER_SESSION = 2;

const SEAT_BASE_MS = 1200;
const SEAT_TAVERN_SHRINK_PER_LEVEL_MS = 120;
const SEAT_FLOOR_MS = 300;
const COOK_TAVERN_SHRINK_PER_LEVEL_MS = 200;
const COOK_FLOOR_MS = 500;

const COLOR_PLAYER = 0xffa94d;
const COLOR_STAFF = 0x4da6ff;

// ===== 视觉/布局 =====
const SCREEN_W = 720;
const SCREEN_H = 1280;
/** 界面分区（见 GLOSSARY）：状态栏 / 主屏 / 副屏。 */
const STATUS_BAR_H = 104;
const SECONDARY_TOP = 1077;
const CARD_W = 600;

const EXTERIOR_X = -2000;
const CAMERA_OPEN_X = 0;
const CAMERA_CLOSED_X = -2360;
const TAVERN_W = 360;
const SKY_TRANSITION_MS = 2000;

const FLOOR_Y = 1010;
const ACTOR_Y = FLOOR_Y - 34;
const TABLE_X_MIN = -175;
const TABLE_X_MAX = 145;
const QUEUE_X = 420;
const QUEUE_GAP = 70;
const PLAYER_HOME = { x: 0, y: ACTOR_Y };
const HAWKER_HOME = { x: 280, y: ACTOR_Y };
const SERVER_HOME = { x: 120, y: ACTOR_Y };
const COOK_HOME = { x: -290, y: ACTOR_Y };
const SERVE_SPOT = { x: 20, y: ACTOR_Y };
const COOK_SPOT = { x: -230, y: ACTOR_Y };
const DOOR_X = 320;

type Driver = "player" | "staff";
type GameState = "closed" | "selectingMenu" | "open" | "bankrupt";
type TapText = Phaser.GameObjects.Text & { onTap: () => void };

type BoothState = "empty" | "seating" | "awaitingCook" | "cooking" | "dining";

interface Booth {
  state: BoothState;
  cookingDriver: Driver | null;
  currentDish: Dish | null;
  cookStartedAt: number;
  cookDoneAt: number;
  departAt: number;
  patronChar?: Character;
  patronKind: PatronKind | null;
  patronWish: string | null;
}
interface BoothVisual {
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  legs: Phaser.GameObjects.Rectangle[];
}
interface QueuedPatron {
  expiresAt: number;
  char: Character;
  kind: PatronKind;
  wish: string | null;
}
interface OpProgress {
  startedAt: number;
  duration: number;
}
interface SeatProgress extends OpProgress {
  boothIndex: number;
}
interface PurchaseProgress extends OpProgress {
  amount: number;
}
interface StaffLevels {
  hawker: number;
  server: number;
  cook: number;
  buyer: number;
}

interface SaveData {
  v: 1;
  coins: number;
  inventory: number;
  level: number;
  staffLevel: StaffLevels;
  staffExp: StaffLevels;
  borrowedIds: string[];
  activeLoans: { name: string; remaining: number; periodsLeft: number }[];
  negativeStreak: number;
  cultivation: number;
  day: number;
  ascensions: number;
  selectedDishIds: string[];
  playerGender: "male" | "female";
}

/** 按钮内叠两条进度条：上=伙计（蓝），下=玩家（橙）。 */
class ProgressButton {
  private static readonly BAR_WIDTH = 165;
  private track: Phaser.GameObjects.Rectangle;
  private zone: Phaser.GameObjects.Zone;
  private playerFill: Phaser.GameObjects.Rectangle;
  private staffFill: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    onClick: () => void,
    register: (obj: { x: number; setScrollFactor(v: number): unknown }, baseX: number) => void,
  ) {
    this.track = scene.add
      .rectangle(x + width / 2, y + height / 2, width, height, 0x3a3a3a)
      .setStrokeStyle(1, 0x666666);
    const barX = x + width - ProgressButton.BAR_WIDTH - 10;
    this.staffFill = scene.add.rectangle(barX, y + 5, 0, 11, COLOR_STAFF).setOrigin(0, 0);
    this.playerFill = scene.add.rectangle(barX, y + height - 16, 0, 11, COLOR_PLAYER).setOrigin(0, 0);
    this.label = scene.add
      .text(x + 10, y + height / 2, "", { fontSize: "15px", color: "#ffffff" })
      .setOrigin(0, 0.5);
    this.zone = scene.add.zone(x, y, width, height).setOrigin(0, 0);
    register(this.zone, x);
    register(this.track, x);
    register(this.playerFill, barX);
    register(this.staffFill, barX);
    register(this.label, x + 10);
    // 用 pointerup + 位移阈值判定点击，避免玩家拖拽场景时误触按钮
    let sx = 0;
    let sy = 0;
    this.zone
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", (p: Phaser.Input.Pointer) => {
        sx = p.x;
        sy = p.y;
      })
      .on("pointerup", (p: Phaser.Input.Pointer) => {
        if (Math.hypot(p.x - sx, p.y - sy) < 12) {
          playSfx("click");
          onClick();
        }
      });
  }

  setLabel(text: string) {
    this.label.setText(text);
  }
  setProgress(playerFraction: number, staffFraction: number) {
    const w = ProgressButton.BAR_WIDTH;
    this.playerFill.width = w * Phaser.Math.Clamp(playerFraction, 0, 1);
    this.staffFill.width = w * Phaser.Math.Clamp(staffFraction, 0, 1);
  }
  private enabled = true;
  setEnabled(enabled: boolean) {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (enabled) {
      this.zone.setInteractive({ useHandCursor: true });
      this.track.setAlpha(1);
    } else {
      this.zone.disableInteractive();
      this.track.setAlpha(0.5);
    }
  }
  setVisible(visible: boolean) {
    this.track.setVisible(visible);
    this.playerFill.setVisible(visible);
    this.staffFill.setVisible(visible);
    this.label.setVisible(visible);
    if (!visible) this.zone.disableInteractive();
    else this.zone.setInteractive({ useHandCursor: true });
  }
}

/** 二头身 Q 版占位角色：大圆头 + 矩形身体 + 发型。 */
class Character extends Phaser.GameObjects.Container {
  private bodyRect: Phaser.GameObjects.Rectangle;
  private hairArc: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene, x: number, y: number, bodyColor: number, hairColor: number, longHair = false) {
    super(scene, x, y);
    this.bodyRect = scene.add.rectangle(0, 10, 26, 26, bodyColor);
    const head = scene.add.circle(0, -10, 16, 0xffe0bd);
    this.hairArc = scene.add.circle(0, -20, 14, hairColor);
    if (longHair) this.hairArc.setScale(1.1, 1.5);
    const legs = scene.add.rectangle(0, 30, 18, 14, 0x3a3a3a);
    this.add([legs, this.bodyRect, head, this.hairArc]);
    this.setDepth(20);
    scene.add.existing(this);
  }

  setBodyColor(color: number) {
    this.bodyRect.setFillStyle(color);
  }

  setHairColor(color: number) {
    this.hairArc.setFillStyle(color);
  }

  /** 操作中的占位动画：竖向缩放脉冲 + 上下浮动（不碰 scaleX，避免破坏朝向翻转）。 */
  pulse() {
    this.scene.tweens.add({
      targets: this,
      scaleY: 1.16,
      duration: 110,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
    });
    this.scene.tweens.add({
      targets: this,
      y: this.y - 6,
      duration: 160,
      yoyo: true,
      repeat: 3,
      ease: "Sine.easeInOut",
    });
  }

  walkTo(x: number, y: number, duration: number, onComplete?: () => void) {
    if (x < this.x - 2) this.setScale(-1, 1);
    else if (x > this.x + 2) this.setScale(1, 1);
    this.scene.tweens.add({
      targets: this,
      x,
      y,
      duration,
      ease: "Linear",
      onComplete: () => onComplete?.(),
    });
  }

  teleportTo(x: number, y: number) {
    this.scene.tweens.killTweensOf(this);
    this.setPosition(x, y);
  }
}

class TavernScene extends Phaser.Scene {
  private coins = STARTING_COINS;
  private inventory = STARTING_INVENTORY;
  private level = 1;
  private booths: Booth[] = [];
  private queue: QueuedPatron[] = [];
  private staffLevel: StaffLevels = { hawker: 0, server: 0, cook: 0, buyer: 0 };
  private staffExp: StaffLevels = { hawker: 0, server: 0, cook: 0, buyer: 0 };
  private chronicleLines: string[] = [];
  private cultivation = 0;

  private gameState: GameState = "closed";
  private selectedDishIds = new Set<string>();
  private dishCursor = 0;
  private sessionEndsAt = 0;
  private sessionStartedAt = 0;
  private sessionServed = 0;
  private sessionRevenue = 0;
  private sessionLost = 0;
  private sessionWishes = 0;
  private day = 1;
  private ascensions = 0;
  private ascending = false;
  private sessionGoal: DailyGoal | null = null;
  private lastGoalResult: { goal: DailyGoal; met: boolean; progress: number } | null = null;

  private playerSeat: SeatProgress | null = null;
  private playerCookingBooth: number | null = null;
  private playerPurchasing: PurchaseProgress | null = null;
  private staffSeat: SeatProgress | null = null;
  private staffCookingBooth: number | null = null;

  // 视觉对象
  private skyRect!: Phaser.GameObjects.Rectangle;
  private sunMoon!: Phaser.GameObjects.Arc;
  private tavernGfx!: Phaser.GameObjects.Graphics;
  private interiorGfx!: Phaser.GameObjects.Graphics;
  private uiObjects: { obj: { x: number; setScrollFactor(v: number): unknown }; baseX: number }[] = [];

  private playerChar!: Character;
  private staffChars: Partial<Record<StaffRole, Character>> = {};
  private playerGender: "male" | "female" = "male";

  private coinsText!: Phaser.GameObjects.Text;
  private inventoryText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private realmText!: Phaser.GameObjects.Text;
  private cultivationText!: Phaser.GameObjects.Text;
  private goalText!: Phaser.GameObjects.Text;
  private queueText!: Phaser.GameObjects.Text;
  private sessionText!: Phaser.GameObjects.Text;
  private chronicleText!: Phaser.GameObjects.Text;
  private tableTitle!: Phaser.GameObjects.Text;
  private boothVisuals: BoothVisual[] = [];

  private nextArrivalAt = 0;
  private nextEventAt = 0;
  private eventsThisSession = 0;
  private lastCallTriggered = false;
  /** HUD 上显示的灵石数，收益到账时从这里滚动到真实值。 */
  private displayedCoins = STARTING_COINS;
  private lastWages: { role: StaffRole; level: number; wage: number }[] = [];
  private lastLoanDues: { name: string; due: number }[] = [];
  private activeLoans: { name: string; remaining: number; periodsLeft: number }[] = [];
  private borrowedIds = new Set<string>();
  private negativeStreak = 0;
  private sfxMuted = false;
  private bgmMuted = false;
  private sfxButton!: TapText;
  private bgmButton!: TapText;
  private staffButton!: TapText;
  private bankButton!: TapText;
  private serveButton!: TapText;
  private cookButton!: Phaser.GameObjects.Text;
  private dishChipLabel!: Phaser.GameObjects.Text;
  private dishChips: TapText[] = [];
  private purchaseButton!: ProgressButton;
  private upgradeButton!: TapText;
  private cultivationButton!: TapText;
  private startButton!: TapText;
  private lastAutosaveAt = 0;

  private genderButton!: TapText;
  private overlay: Phaser.GameObjects.Container | null = null;
  /** 结算面板显示中：产线已停，但视图仍停在营业视角，等玩家点「打烊」再过渡。 */
  private settling = false;
  /** 视图过渡中，防止重复触发。 */
  private transitioning = false;
  private celebrating = false;
  private celebrationTimer?: Phaser.Time.TimerEvent;
  private sparkles: Phaser.GameObjects.Arc[] = [];

  constructor() {
    super("tavern");
  }

  create() {
    const hadSave = this.loadSave();
    this.booths = Array.from({ length: getBoothCount(this.level) }, () => this.makeBooth());
    if (this.selectedDishIds.size === 0) {
      this.selectedDishIds = new Set(DISHES.filter((d) => d.unlockLevel <= this.level).map((d) => d.id));
    }

    this.buildWorld();
    this.applyStaffCharacters();
    this.buildUi();

    this.cameras.main.centerOn(CAMERA_CLOSED_X, SCREEN_H / 2);
    this.setGender(this.playerGender);
    this.bindCameraDrag();
    this.refreshHud();
    // shortcut: 用 localStorage 存档；接入微信小游戏时换成 wx.setStorageSync / wx.getStorageSync
    addEventListener("beforeunload", () => this.save());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.save();
    });
    if (!hadSave) this.showGenderPicker();

    // Debug 面板只在开发环境引入，生产构建会被整块剔除
    if (import.meta.env.DEV) {
      (window as unknown as { __tavern?: TavernScene }).__tavern = this;
      void import("./debug").then(({ setupDebug }) =>
        setupDebug(this, {
          addCoins: (n) => {
            this.coins += n;
            this.refreshHud();
          },
        }),
      );
    }
  }

  private showGenderPicker() {
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(120);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.92).setOrigin(0, 0));
    layer.add(this.add.text(60, 220, "选择你的形象", { fontSize: "30px", color: "#ffffff" }));
    const pick = (x: number, label: string, gender: "male" | "female", color: string) => {
      const btn = this.add
        .text(x, 360, label, {
          fontSize: "28px",
          color: "#ffffff",
          backgroundColor: color,
          padding: { x: 40, y: 24 },
        })
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          this.setGender(gender);
          this.save();
          layer.destroy(true);
        });
      layer.add(btn);
    };
    pick(120, "男", "male", "#3f5a7a");
    pick(400, "女", "female", "#7a3f5a");
    this.overlay = layer;
  }

  // ===== 存档 =====
  /** 只存经营进度与选择；营业中不落盘——中途刷新等于放弃本局，避免带着收益跳过工资与还账。 */
  private save() {
    if (this.ascending || this.gameState === "bankrupt") return;
    if (this.gameState === "open" && !this.settling) return;
    const data: SaveData = {
      v: 1,
      coins: this.coins,
      inventory: this.inventory,
      level: this.level,
      staffLevel: this.staffLevel,
      staffExp: this.staffExp,
      borrowedIds: [...this.borrowedIds],
      activeLoans: this.activeLoans,
      negativeStreak: this.negativeStreak,
      cultivation: this.cultivation,
      day: this.day,
      ascensions: this.ascensions,
      selectedDishIds: [...this.selectedDishIds],
      playerGender: this.playerGender,
    };
    this.writeSave(data);
  }

  private writeSave(data: SaveData) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // 隐私模式或存储已满：放弃本次存档，不影响当前对局
    }
  }

  /** 新周目存档：飞升后保留仙缘与形象，其余归零。 */
  private freshSave(ascensions: number): SaveData {
    return {
      v: 1,
      coins: STARTING_COINS + ascensions * 20,
      inventory: STARTING_INVENTORY + ascensions * 2,
      level: 1,
      staffLevel: { hawker: 0, server: 0, cook: 0, buyer: 0 },
      staffExp: { hawker: 0, server: 0, cook: 0, buyer: 0 },
      borrowedIds: [],
      activeLoans: [],
      negativeStreak: 0,
      cultivation: 0,
      day: 1,
      ascensions,
      selectedDishIds: DISHES.filter((d) => d.unlockLevel <= 1).map((d) => d.id),
      playerGender: this.playerGender,
    };
  }

  /** 读档，返回是否读到有效存档；损坏或版本不符时按新档处理。 */
  private loadSave(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw) as Partial<SaveData>;
      if (data.v !== 1) return false;
      const num = (value: unknown, fallback: number) =>
        typeof value === "number" && Number.isFinite(value) ? value : fallback;
      const count = (value: unknown) => Math.max(0, Math.floor(num(value, 0)));
      this.coins = num(data.coins, STARTING_COINS);
      this.inventory = count(data.inventory);
      this.level = Math.max(1, Math.floor(num(data.level, 1)));
      this.cultivation = count(data.cultivation);
      this.negativeStreak = count(data.negativeStreak);
      this.day = Math.max(1, Math.floor(num(data.day, 1)));
      this.ascensions = Math.max(0, Math.floor(num(data.ascensions, 0)));
      this.playerGender = data.playerGender === "female" ? "female" : "male";
      for (const role of ["hawker", "server", "cook", "buyer"] as const) {
        this.staffLevel[role] = Math.min(MAX_STAFF_LEVEL, count(data.staffLevel?.[role]));
        this.staffExp[role] = count(data.staffExp?.[role]);
      }
      this.borrowedIds = new Set(
        (Array.isArray(data.borrowedIds) ? data.borrowedIds : []).filter(
          (id): id is string => typeof id === "string",
        ),
      );
      this.activeLoans = (Array.isArray(data.activeLoans) ? data.activeLoans : [])
        .filter(
          (loan) =>
            loan &&
            typeof loan.name === "string" &&
            Number.isFinite(loan.remaining) &&
            Number.isFinite(loan.periodsLeft),
        )
        .map((loan) => ({
          name: loan.name,
          remaining: Math.max(0, loan.remaining),
          periodsLeft: Math.max(0, Math.floor(loan.periodsLeft)),
        }));
      this.selectedDishIds = new Set(
        (Array.isArray(data.selectedDishIds) ? data.selectedDishIds : []).filter(
          (id): id is string => typeof id === "string",
        ),
      );
      this.displayedCoins = this.coins;
      return true;
    } catch {
      return false;
    }
  }

  private spawnStaffChar(role: Exclude<StaffRole, "buyer">) {
    const home = role === "hawker" ? HAWKER_HOME : role === "server" ? SERVER_HOME : COOK_HOME;
    const color = role === "hawker" ? 0x8a6a3a : role === "server" ? 0x3a7a5a : 0x7a4a3a;
    const char = new Character(this, home.x, home.y, color, 0x2b2b2b);
    char.setVisible(false);
    this.staffChars[role] = char;
  }

  /** 读档后按已雇岗位补出伙计角色。 */
  private applyStaffCharacters() {
    (["hawker", "server", "cook"] as const).forEach((role) => {
      if (this.staffLevel[role] > 0) this.spawnStaffChar(role);
    });
  }

  // ===== 世界（跟随镜头）=====
  private buildWorld() {
    // 外观酒楼放到远处，打烊时镜头看它
    this.tavernGfx = this.add.graphics().setDepth(0).setX(EXTERIOR_X);
    this.drawTavern(this.tavernGfx, false);

    // 营业时看的酒楼内部
    this.interiorGfx = this.add.graphics().setDepth(0);
    this.drawInterior(this.interiorGfx);

    this.playerChar = new Character(this, PLAYER_HOME.x, PLAYER_HOME.y, 0x4a7ab8, 0x2b2b2b, false);
    this.playerChar.setVisible(false);
  }

  /** 酒楼内部（侧视图）：背景墙、地面、左侧厨房灶台、右侧门口、两侧窗户。 */
  private drawInterior(gfx: Phaser.GameObjects.Graphics) {
    gfx.clear();
    // 背景墙
    gfx.fillStyle(0x6b5240, 1);
    gfx.fillRect(-360, 0, 720, FLOOR_Y);
    // 地面
    gfx.fillStyle(0x8a6a4a, 1);
    gfx.fillRect(-360, FLOOR_Y, 720, 1280 - FLOOR_Y);
    gfx.lineStyle(3, 0x5a4028, 1);
    gfx.lineBetween(-360, FLOOR_Y, 360, FLOOR_Y);

    // 左侧厨房：灶台（侧视）
    gfx.fillStyle(0x9a9a9a, 1);
    gfx.fillRect(-345, 880, 150, 130);
    gfx.fillStyle(0x6a6a6a, 1);
    gfx.fillRect(-335, 860, 130, 30);
    // 锅和火
    gfx.fillStyle(0x4a4a4a, 1);
    gfx.fillRect(-305, 840, 70, 24);
    gfx.fillStyle(0xff7a3a, 0.95);
    gfx.fillCircle(-290, 852, 9);
    gfx.fillCircle(-255, 852, 9);

    // 右侧门口
    gfx.fillStyle(0xd9b45a, 1);
    gfx.fillRect(DOOR_X - 95, 790, 190, 30);
    gfx.fillStyle(0x241610, 1);
    gfx.fillRect(DOOR_X - 80, 820, 160, FLOOR_Y - 820);
    // 门外地面延伸
    gfx.fillStyle(0x6a5a44, 1);
    gfx.fillRect(DOOR_X + 80, FLOOR_Y, 360 - DOOR_X - 80, 1280 - FLOOR_Y);

    // 门外空地
    gfx.fillStyle(0x7a6a4a, 1);
    gfx.fillRect(360, FLOOR_Y, 540, 1280 - FLOOR_Y);
    gfx.lineStyle(3, 0x5a4028, 1);
    gfx.lineBetween(360, FLOOR_Y, 900, FLOOR_Y);
    // 空地装饰：树和石头
    gfx.fillStyle(0x4a3420, 1);
    gfx.fillRect(560, FLOOR_Y - 80, 14, 80);
    gfx.fillStyle(0x3a6a3a, 1);
    gfx.fillCircle(567, FLOOR_Y - 100, 46);
    gfx.fillStyle(0x2f5a2f, 1);
    gfx.fillCircle(567, FLOOR_Y - 118, 30);
    gfx.fillStyle(0x8a8a8a, 1);
    gfx.fillCircle(740, FLOOR_Y - 12, 20);
    gfx.fillCircle(800, FLOOR_Y - 8, 13);
    // 排队区标记
    gfx.lineStyle(2, 0x8a7a5a, 1);
    gfx.lineBetween(400, FLOOR_Y - 2, 620, FLOOR_Y - 2);
  }

  /** 窗户（随时间变色），单独保存以便 updateSky 调整。 */
  private windowViews: Phaser.GameObjects.Rectangle[] = [];

  private buildWindows() {
    const positions = [
      { x: -110, y: 330 },
      { x: 110, y: 330 },
    ];
    for (const p of positions) {
      const w = this.add.rectangle(p.x, p.y, 90, 110, 0x74bdf7).setDepth(1).setStrokeStyle(4, 0x4a3324);
      this.windowViews.push(w);
    }
  }

  /** 程序合成酒楼：屋檐、墙体、门窗、灯笼、招牌。夜晚时窗内透出灯火。 */
  private drawTavern(gfx: Phaser.GameObjects.Graphics, lit: boolean) {
    gfx.clear();
    const half = TAVERN_W / 2;
    const baseY = 1120;

    // 墙体
    gfx.fillStyle(0x6b4a32, 1);
    gfx.fillRect(-half, 520, TAVERN_W, baseY - 520);
    // 屋檐（两层三角）
    gfx.fillStyle(0x8b2f22, 1);
    gfx.fillTriangle(-half - 50, 520, half + 50, 520, 0, 380);
    gfx.fillStyle(0x5c1d16, 1);
    gfx.fillTriangle(-half - 50, 520, half + 50, 520, 0, 460);
    // 招牌
    gfx.fillStyle(0xd9b45a, 1);
    gfx.fillRect(-80, 560, 160, 46);
    // 门
    gfx.fillStyle(lit ? 0xffcf7a : 0x3a2a1e, 1);
    gfx.fillRect(-55, 900, 110, 220);
    // 窗
    gfx.fillStyle(lit ? 0xffd98a : 0x2e2a26, 1);
    gfx.fillRect(-155, 660, 70, 80);
    gfx.fillRect(85, 660, 70, 80);
    gfx.lineStyle(3, 0x4a3324, 1);
    gfx.strokeRect(-155, 660, 70, 80);
    gfx.strokeRect(85, 660, 70, 80);
    // 灯笼
    gfx.fillStyle(lit ? 0xff5c3c : 0x7a3a2a, 1);
    gfx.fillCircle(-165, 610, 16);
    gfx.fillCircle(165, 610, 16);
    // 台阶
    gfx.fillStyle(0x8a8a8a, 1);
    gfx.fillRect(-90, baseY, 180, 20);
  }

  // ===== 屏幕固定层（天空/地面/日月/UI）=====
  private buildUi() {
    this.skyRect = this.add
.rectangle(0, 0, SCREEN_W, SCREEN_H, NIGHT_COLOR)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-20);
    this.sunMoon = this.add.circle(0, 0, 34, 0xffe8a0).setScrollFactor(0).setDepth(-15);
    this.buildWindows();

    // 顶部 HUD 悬浮条
    const hud = this.add
      .rectangle(0, 0, SCREEN_W, STATUS_BAR_H, 0x000000, 0.55)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(30);
    hud.setVisible(true);

    this.coinsText = this.addUiText(16, 10, "", "17px", "#7fe8dd");
    this.inventoryText = this.addUiText(16, 36, "", "17px", "#9fe870");
    this.levelText = this.addUiText(250, 10, "", "17px", "#87ceeb");
    this.queueText = this.addUiText(250, 36, "", "17px", "#e0b0ff");
    this.realmText = this.addUiText(400, 10, "", "15px", "#ffd98a");
    this.cultivationText = this.addUiText(400, 36, "", "14px", "#d8c8ff");
    this.goalText = this.addUiText(400, 62, "", "14px", "#9fdf6a");
    this.sessionText = this.addUiText(16, 62, "", "14px", "#a8d8ff");
    this.chronicleText = this.addUiText(16, 82, "", "13px", "#cccccc");
    this.tableTitle = this.addUiText(16, 176, "雅座", "13px", "#bbbbbb");

    const audio = loadAudioSettings();
    this.sfxMuted = audio.sfxMuted;
    this.bgmMuted = audio.bgmMuted;
    this.sfxButton = this.addUiButton(560, 8, () => {
      this.sfxMuted = !this.sfxMuted;
      setSfxMuted(this.sfxMuted);
      this.refreshAudioButtons();
    });
    this.bgmButton = this.addUiButton(560, 36, () => {
      this.bgmMuted = !this.bgmMuted;
      setBgmMuted(this.bgmMuted);
      this.refreshAudioButtons();
    });
    this.refreshAudioButtons();
    this.tableTitle.setVisible(false);

    // 营业中操作按钮：与采购/打烊同处底部操作区
    this.serveButton = this.addUiButton(330, 1194, () => this.startSeat("player"));
    this.cookButton = this.addUiButton(440, 1194, () => this.manualCook());
    // 出菜行：点哪道菜就做哪道，优先端给想吃它的那一桌
    this.dishChipLabel = this.addUiText(16, 1146, "出菜", "13px", "#bbbbbb");
    this.dishChips = DISHES.map((_, i) =>
      this.addUiButton(56 + i * 150, 1138, () => {
        const dish = this.getMenuDishes()[i];
        if (dish) this.manualCookDish(dish);
      }),
    );
    this.dishChips.forEach((chip) => chip.setVisible(false));

    // 通用按钮：底部固定
    this.purchaseButton = new ProgressButton(this, 16, 1194, 200, 34, () => this.startPurchase(), this.registerUi);
    this.startButton = this.addUiButton(230, 1194, () => this.onStartButton());

    // 打烊期的经营按钮（屏幕左侧竖排）
    this.staffButton = this.addUiButton(16, 700, () => this.buildStaffOverlay());
    this.upgradeButton = this.addUiButton(16, 760, () => this.upgradeTavern());
    this.genderButton = this.addUiButton(16, 820, () => this.toggleGender());
    this.bankButton = this.addUiButton(16, 880, () => this.buildBankOverlay());
    this.cultivationButton = this.addUiButton(16, 940, () => this.buildCultivationOverlay());

    this.buildBoothVisuals();
    this.positionUi(false);
  }

  private registerUi = (obj: { x: number; setScrollFactor(v: number): unknown }, baseX: number) => {
    obj.setScrollFactor(0);
    this.uiObjects.push({ obj, baseX });
  };

  private addUiText(x: number, y: number, text: string, fontSize: string, color: string): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, text, { fontSize, color }).setDepth(31).setScrollFactor(0);
    return t;
  }

  private addUiButton(x: number, y: number, onClick: () => void): TapText {
    let sx = 0;
    let sy = 0;
    const t = this.add
      .text(x, y, "", {
        fontSize: "15px",
        color: "#ffffff",
        backgroundColor: "#3a3a3a",
        padding: { x: 10, y: 8 },
      })
      .setDepth(31)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", (p: Phaser.Input.Pointer) => {
        sx = p.x;
        sy = p.y;
      })
      .on("pointerup", (p: Phaser.Input.Pointer) => {
        if (Math.hypot(p.x - sx, p.y - sy) < 12) {
          playSfx("click");
          t.onTap();
        }
      }) as TapText;
    t.onTap = onClick;
    return t;
  }

  private buildBoothVisuals() {
    this.booths.forEach((_, i) => this.addBoothVisual(i));
  }

  private addBoothVisual(_i: number) {
    const bg = this.add.rectangle(0, 0, 80, 16, 0x6a4a2a).setDepth(2).setStrokeStyle(2, 0x8a6a4a);
    const legs = [
      this.add.rectangle(0, 0, 7, 32, 0x4a3420).setDepth(1),
      this.add.rectangle(0, 0, 7, 32, 0x4a3420).setDepth(1),
    ];
    const label = this.add
      .text(0, 0, "", { fontSize: "10px", color: "#ffffff" })
      .setOrigin(0.5, 1)
      .setDepth(3);
    const visible = this.gameState === "open";
    [bg, label, ...legs].forEach((o) => o.setVisible(visible));
    this.boothVisuals.push({ bg, label, legs });
    this.relayoutTables();
  }

  /** 桌子在同一地面上横向均分，数量越多越窄。 */
  private relayoutTables() {
    const total = Math.max(this.booths.length, 1);
    const width = Math.min(84, 320 / total);
    this.boothVisuals.forEach((v, i) => {
      const x = total === 1 ? (TABLE_X_MIN + TABLE_X_MAX) / 2 : TABLE_X_MIN + (i * (TABLE_X_MAX - TABLE_X_MIN)) / (total - 1);
      v.bg.setPosition(x, FLOOR_Y - 48).setSize(width, 16);
      v.legs[0].setPosition(x - width / 2 + 10, FLOOR_Y - 30);
      v.legs[1].setPosition(x + width / 2 - 10, FLOOR_Y - 30);
      v.label.setPosition(x, FLOOR_Y - 86);
    });
  }

  private tablePosition(index: number): { x: number; y: number } {
    const total = Math.max(this.booths.length, 1);
    const x =
      total === 1 ? (TABLE_X_MIN + TABLE_X_MAX) / 2 : TABLE_X_MIN + (index * (TABLE_X_MAX - TABLE_X_MIN)) / (total - 1);
    return { x, y: ACTOR_Y };
  }

  // ===== 状态机 =====

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

  private tickOpenSession(time: number) {
    const remaining = this.sessionEndsAt - time;

    // 临近打烊：不再接客，已排队的也散去
    if (remaining <= LAST_CALL_MS) {
      if (!this.lastCallTriggered) {
        this.lastCallTriggered = true;
        this.dismissQueue();
        this.log("临近打烊，门外候客散去");
      }
    } else if (time >= this.nextArrivalAt) {
      this.spawnPatron(time);
      this.nextArrivalAt =
        time +
        getArrivalInterval(
          this.level,
          this.staffLevel.hawker,
          Phaser.Math.Between(4000, 7000),
          getRealmArrivalFactor(this.realmIndex()),
        );
    }

    if (this.eventsThisSession < MAX_EVENTS_PER_SESSION && time >= this.nextEventAt && remaining > LAST_CALL_MS) {
      this.triggerRandomEvent(time);
    }

    this.queue = this.queue.filter((patron) => {
      if (time >= patron.expiresAt) {
        this.sessionLost += 1;
        patron.char.walkTo(980, ACTOR_Y, 400, () => patron.char.destroy());
        this.log(`${patron.kind.name}候得不耐，拂袖离去`);
        return false;
      }
      return true;
    });

    this.playerSeat = this.resolveSeat(this.playerSeat, time, "player");
    this.staffSeat = this.resolveSeat(this.staffSeat, time, "staff");

    this.booths.forEach((booth, index) => {
      if (booth.state === "cooking" && time >= booth.cookDoneAt) {
        playSfx("cook");
        booth.state = "dining";
        booth.departAt = time + DINING_MS;
        this.log("出餐完毕，食客开始用膳");
        if (booth.cookingDriver === "player" && this.playerCookingBooth === index) {
          this.playerCookingBooth = null;
          this.moveActorHome("player", "cook");
        }
        if (booth.cookingDriver === "staff" && this.staffCookingBooth === index) {
          this.staffCookingBooth = null;
          this.moveActorHome("staff", "cook");
        }
      } else if (booth.state === "dining" && time >= booth.departAt) {
        const dish = booth.currentDish;
        const matched = dish !== null && booth.patronWish === dish.id;
        const price = dish ? getWishPrice(this.dishPrice(dish), matched) : 0;
        const dishName = dish?.name ?? "菜";
        const guest = booth.patronKind?.name ?? "食客";
        const personal = booth.cookingDriver === "player";
        booth.state = "empty";
        booth.cookingDriver = null;
        booth.currentDish = null;
        booth.patronKind = null;
        booth.patronWish = null;
        const leaver = booth.patronChar;
        booth.patronChar = undefined;
        leaver?.walkTo(440, ACTOR_Y, 500, () => leaver.destroy());
        playSfx("coin");
        this.showCoinPopup(this.tablePosition(index).x, FLOOR_Y - 120, price);
        this.sessionServed += 1;
        this.sessionRevenue += price;
        if (matched) this.sessionWishes += 1;
        this.log(
          matched
            ? `${guest}吃到了想吃的${dishName}，满意离店，收入 +${price} 灵石`
            : `${guest}用罢${dishName}离店，收入 +${price} 灵石`,
        );
        this.gainCultivation(getCultivationGain(personal) + (matched ? 1 : 0));
      }
    });

    if (this.staffLevel.server > 0 && !this.staffSeat) this.startSeat("staff");
    if (this.staffLevel.cook > 0 && this.staffCookingBooth === null) {
      const index = this.booths.findIndex((booth) => booth.state === "awaitingCook");
      if (index !== -1) this.startCook(this.booths[index], index, "staff");
    }
  }

  private tickPurchase(time: number) {
    if (this.playerPurchasing && time >= this.playerPurchasing.startedAt + this.playerPurchasing.duration) {
      this.inventory += this.playerPurchasing.amount;
      this.log(`采购到货 +${this.playerPurchasing.amount} 灵材`);
      this.playerPurchasing = null;
      this.save();
    }
  }

  private tickClosedProcurement() {
    if (this.staffLevel.buyer === 0) return;
    if (this.inventory >= PURCHASE_TARGET_STOCK) return;
    const price = getPurchasePrice(this.staffLevel.buyer, false);
    let bought = 0;
    while (this.inventory < PURCHASE_TARGET_STOCK && this.coins >= price) {
      this.coins -= price;
      this.displayedCoins = this.coins;
      this.inventory += PURCHASE_AMOUNT;
      bought += PURCHASE_AMOUNT;
    }
    if (bought > 0) {
      this.displayedCoins = this.coins;
      this.log(`采买伙计补货 +${bought} 灵材`);
    }
  }

  // ===== 昼夜 =====
  private updateSky(time: number) {
    let t = 1;
    let lit = false;
    if (this.gameState === "open") {
      const elapsed = time - this.sessionStartedAt;
      t = Phaser.Math.Clamp(elapsed / SESSION_DURATION_MS, 0, 1);
      lit = true;
    } else if (this.gameState === "selectingMenu") {
      t = 1;
    }

    let color = this.gameState === "open" ? skyColorAt(t) : NIGHT_COLOR;
    // 营业开始后的入场过渡：夜晚 → 清晨
    if (this.gameState === "open") {
      const elapsed = time - this.sessionStartedAt;
      if (elapsed < SKY_TRANSITION_MS) {
        const k = elapsed / SKY_TRANSITION_MS;
        const night = Phaser.Display.Color.IntegerToColor(NIGHT_COLOR);
        const dawn = Phaser.Display.Color.IntegerToColor(skyColorAt(t));
        const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(night, dawn, 100, k * 100);
        color = Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);
      }
    }
    this.skyRect.setFillStyle(color, 1);
    // 室内窗户透出的天光与外面同步；打烊时窗户只剩余夜色
    if (this.windowViews.length) {
      const winColor = this.gameState === "open" ? color : NIGHT_COLOR;
      this.windowViews.forEach((w) => w.setFillStyle(winColor, 1));
    }

    // 日月：营业期间从左侧地平线弧到右侧，夜晚显示月牙色
    if (this.gameState === "open") {
      const x = 80 + (SCREEN_W - 160) * t;
      const y = 250 - Math.sin(Math.PI * t) * 170;
      this.sunMoon.setPosition(x, y);
      this.sunMoon.setFillStyle(t > 0.82 ? 0xdfe6ff : 0xffe8a0, 1);
      this.sunMoon.setRadius(t > 0.82 ? 26 : 34);
    } else {
      this.sunMoon.setPosition(SCREEN_W - 140, 170);
      this.sunMoon.setFillStyle(0xdfe6ff, 1);
      this.sunMoon.setRadius(26);
    }

    // 夜晚时酒楼窗内透出灯火
    if (lit !== this.lastLit) {
      this.lastLit = lit;
      this.drawTavern(this.tavernGfx, lit);
    }
  }

  private lastLit = false;

  // ===== 回合 =====
  private onStartButton() {
    if (this.settling) return;
    if (this.gameState === "closed") this.openMenu();
    else if (this.gameState === "open") this.endSession();
  }

  private openMenu() {
    this.gameState = "selectingMenu";
    this.buildMenuOverlay();
  }

  private buildMenuOverlay() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(100);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.92).setOrigin(0, 0));
    layer.add(this.add.text(40, 70, "选择今日菜单", { fontSize: "30px", color: "#ffffff" }));
    layer.add(
      this.add.text(40, 115, "至少选一道菜才能开张；营业中按顺序轮转上菜", { fontSize: "16px", color: "#999999" }),
    );

    const available = DISHES.filter((d) => d.unlockLevel <= this.level);
    available.forEach((dish, i) => {
      const y = 180 + i * 92;
      const selected = this.selectedDishIds.has(dish.id);
      const row = this.add
        .rectangle(40, y, 640, 76, selected ? 0x4a5a3a : 0x2b2b2b)
        .setOrigin(0, 0)
        .setStrokeStyle(2, selected ? 0x9fdf6a : 0x555555);
      row.setInteractive({ useHandCursor: true }).on("pointerdown", () => {
        if (this.selectedDishIds.has(dish.id)) this.selectedDishIds.delete(dish.id);
        else this.selectedDishIds.add(dish.id);
        this.buildMenuOverlay();
      });
      layer.add(row);
      layer.add(
        this.add.text(60, y + 14, `${selected ? "☑" : "☐"} ${dish.name}`, { fontSize: "22px", color: "#ffffff" }),
      );
      layer.add(
        this.add.text(60, y + 46, `售价 ${this.dishPrice(dish)} 灵石 · 烹饪 ${(dish.cookMs / 1000).toFixed(1)}s`, {
          fontSize: "16px",
          color: "#cccccc",
        }),
      );
    });

    const count = this.selectedDishIds.size;
    const canStart = count > 0;
    const start = this.add.text(40, 1120, canStart ? `开张大吉（已选 ${count} 道）` : "至少选一道菜", {
      fontSize: "22px",
      color: canStart ? "#ffffff" : "#777777",
      backgroundColor: canStart ? "#3f7a3f" : "#333333",
      padding: { x: 16, y: 12 },
    });
    if (canStart) start.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.startSession());
    layer.add(start);

    const cancel = this.add
      .text(40, 1190, "先不打烊，返回", {
        fontSize: "18px",
        color: "#cccccc",
        backgroundColor: "#333333",
        padding: { x: 16, y: 10 },
      })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        this.gameState = "closed";
        this.destroyOverlay();
      });
    layer.add(cancel);

    this.overlay = layer;
  }

  private startSession() {
    if (this.selectedDishIds.size === 0 || this.transitioning) return;
    this.destroyOverlay();
    this.transitioning = true;

    this.cameras.main.fadeOut(450, 0, 0, 0, () => {
      this.gameState = "open";
      this.settling = false;
      this.cameras.main.centerOn(CAMERA_OPEN_X, SCREEN_H / 2);
      this.cameras.main.setZoom(1);
      this.positionUi(true);
      this.sessionStartedAt = this.time.now;

      this.queue.forEach((p) => p.char.destroy());
      this.queue = [];
      this.booths.forEach((booth) => {
        booth.patronChar?.destroy();
        booth.patronChar = undefined;
        booth.state = "empty";
        booth.cookingDriver = null;
        booth.currentDish = null;
        booth.cookStartedAt = 0;
        booth.cookDoneAt = 0;
        booth.departAt = 0;
        booth.patronKind = null;
        booth.patronWish = null;
      });
      this.playerSeat = null;
      this.playerCookingBooth = null;
      this.staffSeat = null;
      this.staffCookingBooth = null;

      this.playerChar.teleportTo(PLAYER_HOME.x, PLAYER_HOME.y);
      const homes: Record<string, { x: number; y: number }> = {
        hawker: HAWKER_HOME,
        server: SERVER_HOME,
        cook: COOK_HOME,
      };
      Object.entries(this.staffChars).forEach(([role, char]) => {
        const h = homes[role];
        if (h) char?.teleportTo(h.x, h.y);
      });

      this.dishCursor = 0;
      this.sessionServed = 0;
      this.sessionRevenue = 0;
      this.sessionLost = 0;
      this.sessionWishes = 0;
      this.sessionGoal = getDailyGoal(this.day, this.level);
      this.sessionEndsAt = this.time.now + SESSION_DURATION_MS;
      this.nextArrivalAt =
        this.time.now +
        getArrivalInterval(
          this.level,
          this.staffLevel.hawker,
          Phaser.Math.Between(4000, 7000),
          getRealmArrivalFactor(this.realmIndex()),
        );
      this.lastCallTriggered = false;
      this.eventsThisSession = 0;
      this.nextEventAt = this.time.now + Phaser.Math.Between(9000, 16000);
      playSfx("open");
      startBgm();
      this.log("开张大吉，今日营业开始");

      this.cameras.main.fadeIn(450, 0, 0, 0);
      this.transitioning = false;
    });
  }

  private endSession() {
    this.settling = true;
    this.sessionEndsAt = 0;
    if (this.playerPurchasing) {
      this.inventory += this.playerPurchasing.amount;
      this.log(`打烊，采购的灵材到店 +${this.playerPurchasing.amount}`);
      this.playerPurchasing = null;
    }
    this.playerSeat = null;
    this.playerCookingBooth = null;
    this.staffSeat = null;
    this.staffCookingBooth = null;
    this.queue.forEach((p) => p.char.destroy());
    this.queue = [];
    this.booths.forEach((booth) => {
      booth.patronChar?.destroy();
      booth.patronChar = undefined;
      booth.state = "empty";
      booth.cookingDriver = null;
      booth.currentDish = null;
      booth.patronKind = null;
      booth.patronWish = null;
    });
    playSfx("close");
    this.log("打烊，今日营业结束");
    this.gainStaffExperience();
    this.lastWages = this.settleWages();
    this.lastLoanDues = this.settleLoans();
    this.settleDailyGoal();
    this.updateBankruptStreak();
    // 结算/破产期间锁定副屏，避免重复结算或误买
    this.purchaseButton.setEnabled(false);
    this.startButton.setAlpha(0.4);
    this.serveButton.setAlpha(0.4);
    this.cookButton.setAlpha(0.4);
    // 镜头暂留营业视角，等玩家在结算面板点「打烊」后再拉远过渡
    if (this.gameState === "bankrupt") {
      this.buildBankruptOverlay();
    } else {
      this.startCelebration();
      this.buildSettlementOverlay();
    }
    if (this.realmIndex() >= 4) {
      this.inventory += 3;
      this.log("化神境心念一动，打烊时凭空凝出 3 灵材");
    }
    // 破产只重置本局，仙缘保留；其余情况立刻落盘
    if (this.gameState === "bankrupt") this.writeSave(this.freshSave(this.ascensions));
    else this.save();
    // 破产时 update() 不再刷新 HUD，这里只补状态栏的营业提示
    this.sessionText.setText("已打烊");
  }

  /** 从内部视角淡出到黑屏，切到打烊视角后再淡入。 */
  private transitionToClosedView() {
    if (this.transitioning) return;
    this.transitioning = true;
    const cam = this.cameras.main;
    cam.fadeOut(450, 0, 0, 0, () => {
      this.gameState = "closed";
      this.settling = false;
      cam.centerOn(CAMERA_CLOSED_X, SCREEN_H / 2);
      cam.setZoom(1);
      this.positionUi(false);
      cam.fadeIn(450, 0, 0, 0);
      this.transitioning = false;
    });
  }

  /** 二级页面：伙计列表，未雇佣的可在此雇佣，已雇佣的显示等级/熟练/日薪。 */
  private buildStaffOverlay() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(100);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.92).setOrigin(0, 0));
    layer.add(this.add.text(40, 70, "伙计", { fontSize: "30px", color: "#ffffff" }));

    const defs: { role: StaffRole; name: string; cost: number; desc: string }[] = [
      { role: "hawker", name: "迎客", cost: HIRE_COST_HAWKER, desc: "加速顾客到店" },
      { role: "server", name: "跑堂", cost: HIRE_COST_SERVER, desc: "自动招待入座" },
      { role: "cook", name: "灶上", cost: HIRE_COST_COOK, desc: "自动烹饪" },
      { role: "buyer", name: "采买", cost: HIRE_COST_BUYER, desc: "打烊自动补货 + 采购优惠" },
    ];

    defs.forEach((d, i) => {
      const y = 160 + i * 110;
      const level = this.staffLevel[d.role];
      if (level > 0) {
        layer.add(this.add.text(50, y, `${d.name} Lv${level}`, { fontSize: "22px", color: "#ffffff" }));
        layer.add(
          this.add.text(
            50,
            y + 36,
            `熟练 ${this.staffExp[d.role] % EXP_PER_LEVEL}/${EXP_PER_LEVEL} · 日薪 ${getStaffWage(d.role, level)} 灵石`,
            { fontSize: "16px", color: "#bbbbbb" },
          ),
        );
      } else {
        layer.add(this.add.text(50, y, `${d.name}（未雇佣）`, { fontSize: "22px", color: "#888888" }));
        layer.add(this.add.text(50, y + 36, d.desc, { fontSize: "16px", color: "#bbbbbb" }));
        const btn = this.add
          .text(400, y + 4, `雇 ${d.cost} 灵石`, {
            fontSize: "18px",
            color: "#ffffff",
            backgroundColor: "#3a5a3a",
            padding: { x: 14, y: 8 },
          })
          .setInteractive({ useHandCursor: true })
          .on("pointerup", () => {
            playSfx("click");
            this.hireStaff(d.role);
            this.buildStaffOverlay();
          });
        layer.add(btn);
      }
    });

    const close = this.add
      .text(40, 660, "关闭", {
        fontSize: "20px",
        color: "#ffffff",
        backgroundColor: "#3a3a3a",
        padding: { x: 16, y: 10 },
      })
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => this.destroyOverlay());
    layer.add(close);
    this.overlay = layer;
  }

  /** 二级页面：修行境界，列出全部境界、加成与当前进度。 */
  private buildCultivationOverlay() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(100);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.92).setOrigin(0, 0));
    layer.add(this.add.text(40, 70, "修行境界", { fontSize: "30px", color: "#ffffff" }));
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
          ? `仙缘 ${this.ascensions} 重 · 菜品售价 +${Math.round((getAscensionPriceMultiplier(this.ascensions) - 1) * 100)}%`
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
    layer.add(
      this.add
        .text(maxed ? 300 : 40, 780, "关闭", {
          fontSize: "20px",
          color: "#ffffff",
          backgroundColor: "#3a3a3a",
          padding: { x: 16, y: 10 },
        })
        .setInteractive({ useHandCursor: true })
        .on("pointerup", () => this.destroyOverlay()),
    );
    this.overlay = layer;
  }

  /** 飞升前的确认页：写清保留什么、失去什么。 */
  private buildAscendConfirmOverlay() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(100);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.95).setOrigin(0, 0));
    layer.add(this.add.text(40, 90, "渡劫飞升", { fontSize: "32px", color: "#ffd98a" }));
    const next = this.ascensions + 1;
    const lines = [
      "踏破虚空，此局经营从头再来。",
      "",
      "保留：仙缘、玩家形象",
      `失去：灵石、灵材、酒楼 ${this.level} 级、伙计、借据、修为、天数`,
      "",
      `飞升后：仙缘 ${next} 重，菜品售价 +${Math.round((getAscensionPriceMultiplier(next) - 1) * 100)}%`,
      `开局灵石 ${STARTING_COINS + next * 20}、灵材 ${STARTING_INVENTORY + next * 2}`,
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
  private ascend() {
    if (this.ascending) return;
    this.ascending = true;
    this.destroyOverlay();
    playSfx("open");
    this.cameras.main.flash(1200, 255, 255, 220);
    this.writeSave(this.freshSave(this.ascensions + 1));
    this.time.delayedCall(1100, () => location.reload());
  }

  /** 二级页面：灵石商行，按酒楼等级解锁三档借贷。 */
  private buildBankOverlay() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(100);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.92).setOrigin(0, 0));
    layer.add(this.add.text(40, 70, "灵石商行", { fontSize: "30px", color: "#ffffff" }));
    layer.add(
      this.add.text(40, 116, `在贷 ${this.activeLoans.length} 笔 · 连亏 ${this.negativeStreak}/${BANKRUPT_STREAK} 日`, {
        fontSize: "15px",
        color: "#bbbbbb",
      }),
    );

    LOANS.forEach((def, i) => {
      const y = 170 + i * 120;
      const borrowed = this.borrowedIds.has(def.id);
      const locked = this.level < def.unlockLevel;
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
        layer.add(this.add.text(400, y + 6, `需酒楼 ${def.unlockLevel} 级`, { fontSize: "16px", color: "#888888" }));
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

    const close = this.add
      .text(40, 620, "关闭", {
        fontSize: "20px",
        color: "#ffffff",
        backgroundColor: "#3a3a3a",
        padding: { x: 16, y: 10 },
      })
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => this.destroyOverlay());
    layer.add(close);
    this.overlay = layer;
  }

  /** 结算/破产共用弹窗外壳：只遮主屏的 30% 遮罩 + 上半屏卡片 + 入场动画。 */
  private buildPopupCard(cardHeight: number, depth: number) {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(depth);
    // 遮罩只盖主屏并吞掉主屏内的点击；状态栏与副屏保持原样
    layer.add(
      this.add
        .rectangle(0, STATUS_BAR_H, SCREEN_W, SECONDARY_TOP - STATUS_BAR_H, 0x000000, 0.3)
        .setOrigin(0, 0)
        .setInteractive(),
    );
    const panel = this.add.container(SCREEN_W / 2, STATUS_BAR_H + 16);
    panel.add(
      this.add
        .rectangle(0, 0, CARD_W, cardHeight, 0x1b2440, 0.98)
        .setOrigin(0.5, 0)
        .setStrokeStyle(2, 0x3f5a7a),
    );
    panel.setAlpha(0).setScale(0.92);
    this.tweens.add({ targets: panel, alpha: 1, scale: 1, duration: 200, ease: "Sine.easeOut" });
    layer.add(panel);
    this.overlay = layer;
    return { panel, left: -CARD_W / 2 + 28 };
  }

  /** 打烊瞬间：在场角色原地跳跃 + 头顶粒子，循环到关闭弹窗。 */
  private startCelebration() {
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

  private stopCelebration() {
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

  private celebrationChars(): Character[] {
    return [this.playerChar, ...Object.values(this.staffChars).filter((c): c is Character => c !== undefined)];
  }

  private emitSparkles() {
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
  private buildBankruptOverlay() {
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

  private buildSettlementOverlay() {
    const roleName = { hawker: "迎客", server: "跑堂", cook: "灶上", buyer: "采买" } as const;
    const totalWage = this.lastWages.reduce((sum, w) => sum + w.wage, 0);
    const totalLoan = this.lastLoanDues.reduce((sum, d) => sum + d.due, 0);
    const summary = [
      `服务食客：${this.sessionServed} 位`,
      `总收益：${this.sessionRevenue} 灵石`,
      `工资合计：${totalWage} 灵石`,
      `商行还账：${totalLoan} 灵石`,
      `净收益：${this.sessionRevenue - totalWage - totalLoan} 灵石`,
      `余下：${this.coins} 灵石（连亏 ${this.negativeStreak}/${BANKRUPT_STREAK} 日）`,
      `流失食客：${this.sessionLost} 位`,
    ];
    // 卡片高度按明细行数算，保证内容不溢出
    const cardHeight =
      76 +
      (this.lastWages.length > 0 ? 30 + this.lastWages.length * 28 + 10 : 0) +
      (this.lastLoanDues.length > 0 ? 30 + this.lastLoanDues.length * 28 + 10 : 0) +
      (this.lastGoalResult ? 58 : 0) +
      summary.length * 34 +
      18 +
      46 +
      20;
    const { panel, left } = this.buildPopupCard(cardHeight, 100);

    panel.add(this.add.text(left, 20, "今日营业结束", { fontSize: "30px", color: "#ffffff" }));
    let y = 76;

    if (this.lastWages.length > 0) {
      panel.add(this.add.text(left, y, "伙计工钱", { fontSize: "18px", color: "#aaaaaa" }));
      y += 30;
      for (const w of this.lastWages) {
        panel.add(
          this.add.text(left + 16, y, `${roleName[w.role]} Lv${w.level} · 日薪 ${w.wage} 灵石`, {
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
      const { goal, met, progress } = this.lastGoalResult;
      panel.add(this.add.text(left, y, `今日目标 · ${goal.label}`, { fontSize: "17px", color: "#aaaaaa" }));
      y += 26;
      panel.add(
        this.add.text(
          left + 16,
          y,
          met
            ? `达成！+${goal.rewardCoins} 灵石、+${goal.rewardCultivation} 修为`
            : `未达成（${progress}/${goal.target}）`,
          { fontSize: "18px", color: met ? "#9fdf6a" : "#999999" },
        ),
      );
      y += 32;
    }

    summary.forEach((line) => {
      panel.add(this.add.text(left, y, line, { fontSize: "20px", color: "#e8e8e8" }));
      y += 34;
    });

    const close = this.add
      .text(left, y + 18, "打烊", {
        fontSize: "20px",
        color: "#ffffff",
        backgroundColor: "#3f5a7a",
        padding: { x: 16, y: 10 },
      })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        this.stopCelebration();
        this.destroyOverlay();
        this.transitionToClosedView();
      });
    panel.add(close);
  }

  private destroyOverlay() {
    this.overlay?.destroy(true);
    this.overlay = null;
  }

  // ===== 场景与 UI =====
  private makeBooth(): Booth {
    return {
      state: "empty",
      cookingDriver: null,
      currentDish: null,
      cookStartedAt: 0,
      cookDoneAt: 0,
      departAt: 0,
      patronKind: null,
      patronWish: null,
    };
  }

  private positionUi(isOpen: boolean) {
    this.tableTitle.setVisible(isOpen);
    this.boothVisuals.forEach((v) => {
      v.bg.setVisible(isOpen);
      v.label.setVisible(isOpen);
      v.legs.forEach((l) => l.setVisible(isOpen));
    });

    this.serveButton.setVisible(isOpen);
    this.cookButton.setVisible(isOpen);
    this.staffButton.setVisible(!isOpen);
    this.bankButton.setVisible(!isOpen);
    this.upgradeButton.setVisible(!isOpen);
    this.genderButton.setVisible(!isOpen);
    this.cultivationButton.setVisible(!isOpen);

    this.playerChar.setVisible(isOpen);
    Object.values(this.staffChars).forEach((c) => c?.setVisible(isOpen));
    this.queue.forEach((p) => p.char.setVisible(isOpen));
    this.booths.forEach((b) => b.patronChar?.setVisible(isOpen));
    this.windowViews.forEach((w) => w.setVisible(isOpen));
  }

  private toggleGender() {
    this.setGender(this.playerGender === "male" ? "female" : "male");
  }

  /** 营业视角：玩家可水平拖拽镜头，从厨房左缘一直拖到空地尽头。 */
  private bindCameraDrag() {
    const cam = this.cameras.main;
    let startX = 0;
    let startScroll = 0;
    let active = false;

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.gameState !== "open" || this.transitioning || this.settling) return;
      startX = p.x;
      startScroll = cam.scrollX;
      active = true;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!active || !p.isDown) return;
      const dx = p.x - startX;
      if (Math.abs(dx) < 8) return;
      cam.scrollX = Phaser.Math.Clamp(startScroll - dx, -360, 180);
    });
    this.input.on("pointerup", () => {
      active = false;
    });
  }

  private refreshAudioButtons() {
    this.sfxButton?.setText(this.sfxMuted ? "音效：关" : "音效：开");
    this.bgmButton?.setText(this.bgmMuted ? "音乐：关" : "音乐：开");
  }

  private setGender(gender: "male" | "female") {
    this.playerGender = gender;
    this.playerChar.setBodyColor(gender === "male" ? 0x4a7ab8 : 0xc86a9e);
    this.playerChar.setHairColor(gender === "male" ? 0x2b2b2b : 0x4a2b1a);
    this.genderButton?.setText(gender === "male" ? "玩家形象：男（点击切换）" : "玩家形象：女（点击切换）");
  }

  private isPlayerBusy(): boolean {
    return (
      this.playerSeat !== null ||
      this.playerCookingBooth !== null ||
      this.playerPurchasing !== null
    );
  }

  // ===== 修行 =====
  private realmIndex(): number {
    return getRealmIndex(this.cultivation);
  }

  /** 售价按当前境界加成结算。 */
  private dishPrice(dish: Dish): number {
    return Math.round(
      dish.price *
        getRealmPriceMultiplier(this.realmIndex()) *
        getAscensionPriceMultiplier(this.ascensions),
    );
  }

  private gainCultivation(amount: number) {
    const before = this.realmIndex();
    this.cultivation += amount;
    const after = this.realmIndex();
    if (after > before) {
      const realm = REALMS[after];
      this.log(`灵台清明，境界突破至「${realm.name}」——${realm.perk}`);
      this.celebrateBreakthrough(realm.name);
    }
  }

  /** 突破：白光一闪、金色灵环扩散、境界浮字。 */
  private celebrateBreakthrough(realmName: string) {
    playSfx("upgrade");
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
  }

  private getMenuDishes(): Dish[] {
    return DISHES.filter((d) => this.selectedDishIds.has(d.id) && d.unlockLevel <= this.level);
  }

  private nextDish(): Dish {
    const menu = this.getMenuDishes();
    const dish = menu[this.dishCursor % menu.length];
    this.dishCursor += 1;
    return dish;
  }

  // ===== 产线 =====
  /** 系统生成一位到店顾客：队列有空位就走进来排队，排满则直接离开。 */
  private spawnPatron(time: number) {
    const kind = Phaser.Math.RND.pick(PATRON_KINDS);
    const char = new Character(this, 980, ACTOR_Y, kind.bodyColor, kind.hairColor);
    char.setVisible(this.gameState === "open");
    const wish = pickPatronWish(kind, this.getMenuDishes().map((d) => d.id), Math.random());

    if (this.queue.length >= getBoothCount(this.level)) {
      char.walkTo(1120, ACTOR_Y, 400, () => char.destroy());
      this.sessionLost += 1;
      this.log(`${kind.name}见门外排满，转身离去`);
      return;
    }

    char.walkTo(QUEUE_X + this.queue.length * QUEUE_GAP, ACTOR_Y, 700);
    this.queue.push({ expiresAt: time + QUEUE_PATIENCE_MS * kind.patienceFactor, char, kind, wish });
    this.staffChars.hawker?.pulse();
    playSfx("arrival");
    const wishName = DISHES.find((d) => d.id === wish)?.name;
    this.log(`${kind.name}来到门前排起队${wishName ? `，想吃${wishName}` : ""}`);
  }

  /** 临近打烊时清空排队：所有候客直接离开。 */
  private dismissQueue() {
    this.queue.forEach((p) => {
      p.char.walkTo(1120, ACTOR_Y, 600, () => p.char.destroy());
    });
    this.queue = [];
  }

  /** 随机事件：不打断操作，直接把结果记进见闻录并飘一条提示。 */
  private triggerRandomEvent(time: number) {
    const event = pickRandomEvent(Math.random());
    const next = applyEvent(event, {
      coins: this.coins,
      ingredients: this.inventory,
      cultivation: this.cultivation,
    });
    const gainedCultivation = next.cultivation - this.cultivation;
    this.coins = next.coins;
    this.displayedCoins = this.coins;
    this.inventory = next.ingredients;
    this.eventsThisSession += 1;
    this.nextEventAt = time + Phaser.Math.Between(14000, 24000);
    const parts: string[] = [];
    if (event.coins !== 0) parts.push(`灵石 ${event.coins > 0 ? "+" : ""}${event.coins}`);
    if (event.ingredients !== 0) parts.push(`灵材 ${event.ingredients > 0 ? "+" : ""}${event.ingredients}`);
    if (event.cultivation !== 0) parts.push(`修为 +${event.cultivation}`);
    this.log(`【事件】${event.text}${parts.length ? `（${parts.join("，")}）` : ""}`);
    if (gainedCultivation > 0) this.gainCultivation(gainedCultivation);
    this.showEventToast(event.text, event.kind !== "bad");
    playSfx("event");
  }

  private showEventToast(message: string, good: boolean) {
    const toast = this.add
      .text(SCREEN_W / 2, 600, message, {
        fontSize: "19px",
        color: good ? "#ffd98a" : "#ff9a8a",
        backgroundColor: good ? "#2a3a1a" : "#3a1a1a",
        padding: { x: 16, y: 10 },
        align: "center",
        wordWrap: { width: 600 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(45)
      .setAlpha(0);
    this.tweens.add({
      targets: toast,
      alpha: 1,
      y: 580,
      duration: 260,
      yoyo: true,
      hold: 1800,
      ease: "Sine.easeOut",
      onComplete: () => toast.destroy(),
    });
  }

  /** 玩家瞬移到目标点并做动作；伙计走过去再做动作。 */
  private moveActorTo(driver: Driver, kind: "seat" | "cook", travelMs: number) {
    const spot = kind === "seat" ? SERVE_SPOT : COOK_SPOT;
    if (driver === "player") {
      this.playerChar.teleportTo(spot.x, spot.y);
      this.playerChar.pulse();
      return;
    }
    const role = kind === "seat" ? "server" : "cook";
    const char = this.staffChars[role];
    char?.walkTo(spot.x, spot.y, travelMs, () => char.pulse());
  }

  private moveActorHome(driver: Driver, kind: "seat" | "cook") {
    const home = kind === "seat" ? SERVER_HOME : COOK_HOME;
    const actor = driver === "player" ? this.playerChar : this.staffChars[kind === "seat" ? "server" : "cook"];
    const target = driver === "player" ? PLAYER_HOME : home;
    actor?.walkTo(target.x, target.y, 300);
  }

  private startSeat(driver: Driver) {
    if (this.settling) return;
    if (driver === "player" && this.isPlayerBusy()) return;
    if (driver === "staff" && this.staffSeat) return;
    if (this.queue.length === 0) return;

    const boothIndex = this.booths.findIndex((booth) => booth.state === "empty");
    if (boothIndex === -1) return;

    const patron = this.queue.shift()!;
    const booth = this.booths[boothIndex];
    booth.state = "seating";
    const progress: SeatProgress = {
      startedAt: this.time.now,
      duration:
        driver === "player"
          ? getPlayerDuration(
              SEAT_BASE_MS,
              SEAT_TAVERN_SHRINK_PER_LEVEL_MS,
              SEAT_FLOOR_MS,
              this.level,
              getRealmPlayerSpeedFactor(this.realmIndex()),
            )
          : getStaffDuration(
              "server",
              SEAT_BASE_MS,
              SEAT_TAVERN_SHRINK_PER_LEVEL_MS,
              SEAT_FLOOR_MS,
              this.level,
              this.staffLevel.server,
              getRealmStaffSpeedFactor(this.realmIndex()),
            ),
      boothIndex,
    };
    if (driver === "player") this.playerSeat = progress;
    else this.staffSeat = progress;
    this.moveActorTo(driver, "seat", Math.min(400, progress.duration));

    // 顾客从门口走向桌子，移动时长与招待进度同步
    const table = this.tablePosition(boothIndex);
    patron.char.walkTo(table.x, table.y, progress.duration);
    booth.patronChar = patron.char;
    booth.patronKind = patron.kind;
    booth.patronWish = patron.wish;
  }

  private resolveSeat(progress: SeatProgress | null, time: number, driver: Driver): SeatProgress | null {
    if (!progress || time < progress.startedAt + progress.duration) return progress;
    const booth = this.booths[progress.boothIndex];
    if (booth) {
      playSfx("seat");
      booth.state = "awaitingCook";
      this.log(driver === "player" ? "你领食客入座雅座，等候烹饪" : "跑堂伙计领食客入座雅座");
    }
    this.moveActorHome(driver, "seat");
    return null;
  }

  private manualCook() {
    if (this.settling) return;
    if (this.isPlayerBusy()) return;
    const index = this.booths.findIndex((booth) => booth.state === "awaitingCook");
    if (index === -1) return;
    this.startCook(this.booths[index], index, "player");
  }

  /** 指定菜品出餐：优先端给正想吃这道菜的那一桌。 */
  private manualCookDish(dish: Dish) {
    if (this.settling || this.isPlayerBusy()) return;
    const awaiting = this.booths
      .map((booth, index) => ({ booth, index }))
      .filter(({ booth }) => booth.state === "awaitingCook");
    if (awaiting.length === 0) return;
    const target = awaiting.find(({ booth }) => booth.patronWish === dish.id) ?? awaiting[0];
    this.startCook(target.booth, target.index, "player", dish);
  }

  private startCook(booth: Booth, index: number, driver: Driver, dish: Dish = this.nextDish()) {
    if (booth.state !== "awaitingCook") return;
    if (this.inventory <= 0) {
      booth.state = "empty";
      const leaver = booth.patronChar;
      const guest = booth.patronKind?.name ?? "食客";
      booth.patronChar = undefined;
      booth.patronKind = null;
      booth.patronWish = null;
      leaver?.walkTo(440, ACTOR_Y, 400, () => leaver.destroy());
      this.sessionLost += 1;
      this.log(`灵材不足，${guest}没吃上菜便离开了`);
      return;
    }

    this.inventory -= 1;
    const duration =
      driver === "player"
        ? getPlayerDuration(
            dish.cookMs,
            COOK_TAVERN_SHRINK_PER_LEVEL_MS,
            COOK_FLOOR_MS,
            this.level,
            getRealmPlayerSpeedFactor(this.realmIndex()),
          )
        : getStaffDuration(
            "cook",
            dish.cookMs,
            COOK_TAVERN_SHRINK_PER_LEVEL_MS,
            COOK_FLOOR_MS,
            this.level,
            this.staffLevel.cook,
            getRealmStaffSpeedFactor(this.realmIndex()),
          );
    booth.state = "cooking";
    booth.cookingDriver = driver;
    booth.currentDish = dish;
    booth.cookStartedAt = this.time.now;
    booth.cookDoneAt = this.time.now + duration;
    if (driver === "player") this.playerCookingBooth = index;
    else this.staffCookingBooth = index;
    this.moveActorTo(driver, "cook", Math.min(400, duration));
    this.log(driver === "player" ? `你下厨烹制${dish.name}` : `灶上伙计烹制${dish.name}（雅座 ${index + 1}）`);
  }

  /** 玩家点采购：打烊瞬间到货；营业中走 15 秒紧急采购（翻倍价）。灵石不足时赊账，费用照扣。 */
  private startPurchase() {
    if (this.settling) return;
    const emergency = this.gameState === "open";
    const price = getPurchasePrice(this.staffLevel.buyer, emergency);

    if (this.isPlayerBusy()) return;
    const credit = this.coins < price;
    this.coins -= price;
    this.displayedCoins = this.coins;

    if (!emergency) {
      this.inventory += PURCHASE_AMOUNT;
      this.log(`${credit ? "灵石不足，赊账采购灵材" : "采购灵材"} +${PURCHASE_AMOUNT}`);
      this.save();
      return;
    }
    this.playerPurchasing = {
      startedAt: this.time.now,
      duration: getPurchaseDuration(this.level),
      amount: PURCHASE_AMOUNT,
    };
    this.save();
    this.log(credit ? "灵石不足，赊账紧急采购下单（价格翻倍），等货中" : "紧急采购下单（价格翻倍），等货中");
  }

  private upgradeTavern() {
    const cost = getUpgradeCost(this.level);
    if (this.coins < cost) {
      this.log("灵石不足，无法装潢升级");
      return;
    }
    this.coins -= cost;
    this.displayedCoins = this.coins;
    this.level += 1;
    this.booths.push(this.makeBooth());
    this.addBoothVisual(this.booths.length - 1);
    this.save();
    const unlocked = DISHES.find((d) => d.unlockLevel === this.level);
    this.log(
      unlocked ? `酒楼装潢升级到 ${this.level} 级，解锁新菜品「${unlocked.name}」` : `酒楼装潢升级到 ${this.level} 级`,
    );
  }

  private hireStaff(role: StaffRole) {
    if (this.staffLevel[role] > 0) return;
    const hireCost = {
      hawker: HIRE_COST_HAWKER,
      server: HIRE_COST_SERVER,
      cook: HIRE_COST_COOK,
      buyer: HIRE_COST_BUYER,
    }[role];
    if (this.coins < hireCost) {
      this.log("灵石不足，无法雇人");
      return;
    }
    this.coins -= hireCost;
    this.displayedCoins = this.coins;
    this.staffLevel[role] = 1;
    if (role !== "buyer") this.spawnStaffChar(role);
    this.save();

    const roleName = { hawker: "迎客", server: "跑堂", cook: "灶上", buyer: "采买" }[role];
    playSfx("upgrade");
    this.log(`雇到一位${roleName}伙计，此后自动运作`);
  }

  /** 打烊时给每位在职伙计加熟练度，满了自动升级。 */
  private gainStaffExperience() {
    const roles: StaffRole[] = ["hawker", "server", "cook", "buyer"];
    for (const role of roles) {
      if (this.staffLevel[role] <= 0) continue;
      this.staffExp[role] += 1;
      const nextLevel = getStaffLevel(this.staffExp[role]);
      if (nextLevel > this.staffLevel[role]) {
        this.staffLevel[role] = nextLevel;
        const roleName = { hawker: "迎客", server: "跑堂", cook: "灶上", buyer: "采买" }[role];
        this.log(`${roleName}伙计熟练度攒满，升到 ${nextLevel} 级`);
      }
    }
  }

  /** 按当前等级结算当日工资，灵石不够则扣到 0 为止。 */
  private settleWages(): { role: StaffRole; level: number; wage: number }[] {
    const roles: StaffRole[] = ["hawker", "server", "cook", "buyer"];
    const details = roles
      .filter((role) => this.staffLevel[role] > 0)
      .map((role) => ({ role, level: this.staffLevel[role], wage: getStaffWage(role, this.staffLevel[role]) }));
    const total = details.reduce((sum, d) => sum + d.wage, 0);
    // 工资可以扣成负数，负数表示欠款
    this.coins -= total;
    this.displayedCoins = this.coins;
    return details;
  }

  /** 灵石商行借贷：到账即加灵石，之后每回合还一期。 */
  private takeLoan(def: LoanDef) {
    if (this.borrowedIds.has(def.id) || this.level < def.unlockLevel) return;
    this.borrowedIds.add(def.id);
    this.coins += def.principal;
    this.displayedCoins = this.coins;
    this.activeLoans.push({ name: def.name, remaining: def.totalRepay, periodsLeft: LOAN_PERIODS });
    this.save();
    playSfx("coin");
    this.log(`向灵石商行${def.name}，得 ${def.principal} 灵石，分 ${LOAN_PERIODS} 期偿还`);
  }

  /** 每回合按剩余本息均摊一期。 */
  private settleLoans(): { name: string; due: number }[] {
    const details: { name: string; due: number }[] = [];
    for (const loan of this.activeLoans) {
      if (loan.periodsLeft <= 0) continue;
      const due = getLoanDue(loan.remaining, loan.periodsLeft);
      loan.remaining -= due;
      loan.periodsLeft -= 1;
      this.coins -= due;
      details.push({ name: loan.name, due });
    }
    this.activeLoans = this.activeLoans.filter((l) => l.periodsLeft > 0);
    this.displayedCoins = this.coins;
    return details;
  }

  /** 打烊时结算今日目标，发了奖励再翻到第二天。 */
  private settleDailyGoal() {
    const goal = this.sessionGoal;
    this.day += 1;
    if (!goal) return;
    const stats = { served: this.sessionServed, revenue: this.sessionRevenue, wishes: this.sessionWishes };
    const met = isGoalMet(goal, stats);
    this.lastGoalResult = { goal, met, progress: getGoalProgress(goal, stats) };
    if (!met) {
      this.log(`今日目标未达成：${goal.label}`);
      return;
    }
    this.coins += goal.rewardCoins;
    this.displayedCoins = this.coins;
    this.log(`今日目标达成：${goal.label}，赏 ${goal.rewardCoins} 灵石、${goal.rewardCultivation} 修为`);
    this.gainCultivation(goal.rewardCultivation);
  }

  /** 连续 5 个回合结束为负余额即破产。 */
  private updateBankruptStreak() {
    if (this.coins < 0) {
      this.negativeStreak += 1;
      if (this.negativeStreak >= BANKRUPT_STREAK) {
        this.gameState = "bankrupt";
        this.log("连续五日亏空，酒楼倒闭了");
      }
    } else {
      this.negativeStreak = 0;
    }
  }

  private log(text: string) {
    this.chronicleLines.push(text);
    if (this.chronicleLines.length > CHRONICLE_MAX_LINES) this.chronicleLines.shift();
  }

  private boothLabel(booth: Booth): string {
    const base = { empty: "空闲", seating: "招待中", awaitingCook: "待烹饪", cooking: "烹饪中", dining: "用膳中" }[
      booth.state
    ];
    return booth.state === "cooking" && booth.currentDish ? `${base}·${booth.currentDish.name}` : base;
  }

  private boothColor(state: BoothState): number {
    return { empty: 0x3a3a3a, seating: 0x8a6d3b, awaitingCook: 0x7a5a2a, cooking: 0xc97a2a, dining: 0x4a7a3a }[state];
  }

  private renderProgress(time: number) {

    const playerPurchaseFraction = this.playerPurchasing
      ? (time - this.playerPurchasing.startedAt) / this.playerPurchasing.duration
      : 0;
    this.purchaseButton.setProgress(playerPurchaseFraction, 0);
    this.purchaseButton.setEnabled(!this.isPlayerBusy() && !this.settling);

    this.booths.forEach((booth, i) => {
      const visual = this.boothVisuals[i];
      if (!visual) return;
      visual.bg.setFillStyle(this.boothColor(booth.state), 1);
    });
  }

  private coinRollTween: Phaser.Tweens.Tween | null = null;

  /** 食客离店时在桌子上方弹出收益浮字，飞到 HUD 灵石处后让数字滚动。 */
  private showCoinPopup(worldX: number, worldY: number, amount: number) {
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

  private rollCoinsDisplay() {
    this.coinRollTween?.remove();
    this.coinRollTween = this.tweens.addCounter({
      from: this.displayedCoins,
      to: this.coins,
      duration: 380,
      onUpdate: (tw) => {
        this.displayedCoins = Math.round(tw.getValue() as number);
      },
    });
  }

  private refreshHud() {
    const open = this.gameState === "open";

    this.coinsText.setText(`灵石：${this.displayedCoins}`);
    this.inventoryText.setText(`灵材：${this.inventory}`);
    this.levelText.setText(`酒楼等级：${this.level}`);
    this.queueText.setText(`排队：${this.queue.length}/${getBoothCount(this.level)}`);
    const next = getNextRealm(this.cultivation);
    this.realmText.setText(`境界：${REALMS[this.realmIndex()].name}`);
    this.cultivationText.setText(
      next ? `修为 ${this.cultivation}/${next.cultivation}` : `修为 ${this.cultivation} 圆满`,
    );
    if (this.settling) {
      this.sessionText.setText("已打烊");
      this.goalText.setText("");
    } else if (open && this.sessionGoal) {
      this.sessionText.setText(
        `营业中 · 剩余 ${Math.max(0, Math.ceil((this.sessionEndsAt - this.time.now) / 1000))}s · 本局 ${this.sessionServed} 位 / ${this.sessionRevenue} 灵石`,
      );
      const progress = getGoalProgress(this.sessionGoal, {
        served: this.sessionServed,
        revenue: this.sessionRevenue,
        wishes: this.sessionWishes,
      });
      const spent = this.sessionGoal.kind === "revenue" ? " 灵石" : " 位";
      const reached = progress >= this.sessionGoal.target;
      this.goalText.setText(reached ? "今日目标 ✓" : `目标 ${progress}/${this.sessionGoal.target}${spent}`);
      this.goalText.setColor(reached ? "#9fdf6a" : "#e0c060");
    } else {
      const goal = getDailyGoal(this.day, this.level);
      this.sessionText.setText(
        `第 ${this.day} 日 · 今日目标：${goal.label}（+${goal.rewardCoins} 灵石 / +${goal.rewardCultivation} 修为）`,
      );
      this.goalText.setText("");
    }
    this.chronicleText.setText(this.chronicleLines.join("\n"));

    const menu = this.getMenuDishes();
    const wished = new Set(
      this.booths
        .filter((booth) => booth.state === "awaitingCook")
        .map((booth) => booth.patronWish)
        .filter((id): id is string => typeof id === "string"),
    );
    this.booths.forEach((booth, i) => {
      const visual = this.boothVisuals[i];
      if (!visual) return;
      const guest = booth.patronKind?.name;
      const wishName =
        booth.state === "awaitingCook" ? DISHES.find((d) => d.id === booth.patronWish)?.name : undefined;
      const detail = guest ? `${guest}${wishName ? `·想吃${wishName}` : ""}` : "";
      visual.label.setText(
        booth.state === "empty" ? "" : `${this.boothLabel(booth)}${detail ? `\n${detail}` : ""}`,
      );
    });

    const showChips = open && !this.settling;
    this.dishChipLabel.setVisible(showChips);
    this.dishChips.forEach((chip, i) => {
      const dish = menu[i];
      chip.setVisible(showChips && dish !== undefined);
      if (!dish) return;
      const wanted = wished.has(dish.id);
      chip.setText(`${wanted ? "★" : ""}${dish.name} ${this.dishPrice(dish)}`);
      chip.setBackgroundColor(wanted ? "#7a5a1a" : "#3a3a3a");
    });

    this.startButton.setText(open ? "提前打烊" : "开始营业");

    const actionAlpha = this.settling ? 0.4 : 1;
    this.startButton.setAlpha(actionAlpha);
    this.serveButton.setAlpha(actionAlpha);
    this.cookButton.setAlpha(actionAlpha);

    this.serveButton.setVisible(open);
    this.cookButton.setVisible(open);
    this.staffButton.setVisible(!open);
    this.bankButton.setVisible(!open);
    this.upgradeButton.setVisible(!open);
    this.cultivationButton.setVisible(!open);
    this.purchaseButton.setVisible(true);

    this.staffButton.setText("伙计");
    this.bankButton.setText("灵石商行");
    this.cultivationButton.setText("修行·境界");

    this.serveButton.setText("招待入座");
    this.cookButton.setText("动手烹饪");

    const purchasePriceLabel = getPurchasePrice(this.staffLevel.buyer, open);
    this.purchaseButton.setLabel(
      open
        ? `紧急采购（${purchasePriceLabel} 灵石 → +${PURCHASE_AMOUNT} 灵材）`
        : `采购灵材（${purchasePriceLabel} 灵石 → +${PURCHASE_AMOUNT} 灵材）`,
    );
    const unlockedNext = DISHES.find((d) => d.unlockLevel === this.level + 1);
    this.upgradeButton.setText(
      unlockedNext
        ? `装潢升级（${getUpgradeCost(this.level)} 灵石 → 雅座/排队+1，解锁「${unlockedNext.name}」）`
        : `装潢升级（${getUpgradeCost(this.level)} 灵石 → 雅座/排队+1）`,
    );
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: SCREEN_W,
  height: SCREEN_H,
  backgroundColor: "#1b2440",
  scene: [TavernScene],
});
