import Phaser from "phaser";
import { loadAudioSettings, playSfx, setBgmMuted, setSfxMuted, startBgm } from "./audio";

// ===== 数值（占位，先验证手感）=====
const TABLE_COUNT_BASE = 3;
const QUEUE_PATIENCE_MS = 8000;
const ARRIVAL_MIN_MS = 4000;
const ARRIVAL_MAX_MS = 7000;
const ARRIVAL_TAVERN_SHRINK_MS = 150;
const ARRIVAL_HAWKER_SHRINK = 0.08;
const ARRIVAL_FLOOR_MS = 1500;
const LAST_CALL_MS = 10000;
const DINING_MS = 3000;
const SESSION_DURATION_MS = 60000;
const PURCHASE_COST = 5;
const PURCHASE_AMOUNT = 5;
const PURCHASE_TIME_MS = 15000;
const PURCHASE_EMERGENCY_MULTIPLIER = 2;
const PURCHASE_TARGET_STOCK = 10;
const PURCHASE_TAVERN_SHRINK_PER_LEVEL_MS = 300;
const PURCHASE_FLOOR_MS = 3000;
const PURCHASE_DISCOUNT_PER_LEVEL = 0.08;
const PURCHASE_DISCOUNT_CAP = 0.5;
const STARTING_COINS = 20;
const STARTING_INVENTORY = 5;
const UPGRADE_BASE_COST = 15;
const UPGRADE_COST_MULTIPLIER = 1.6;
const HIRE_COST_HAWKER = 30;
const HIRE_COST_SERVER = 40;
const HIRE_COST_COOK = 50;
const HIRE_COST_BUYER = 35;
const CHRONICLE_MAX_LINES = 5;

const SEAT_BASE_MS = 1200;
const SEAT_TAVERN_SHRINK_PER_LEVEL_MS = 120;
const SEAT_FLOOR_MS = 300;
const COOK_TAVERN_SHRINK_PER_LEVEL_MS = 200;
const COOK_FLOOR_MS = 500;

const STAFF_SPEED_PENALTY = 1.6;
const STAFF_LEVEL_SPEEDUP = { hawker: 0.86, server: 0.94, cook: 0.9 } as const;

// 熟练度：每回合 +1，每 3 点升一级，最高 4 级
const EXP_PER_LEVEL = 3;
const MAX_STAFF_LEVEL = 4;
// 各岗位基础日薪，每高一级涨 30%
const STAFF_BASE_WAGE = { hawker: 5, server: 8, cook: 10, buyer: 6 } as const;
const WAGE_PER_LEVEL = 1.3;

const COLOR_PLAYER = 0xffa94d;
const COLOR_STAFF = 0x4da6ff;

// ===== 视觉/布局 =====
const SCREEN_W = 720;
const SCREEN_H = 1280;

// 世界坐标：内部场景在 x=0，外观酒楼在左侧（镜头向左平移过去）
const EXTERIOR_X = -2000;
const CAMERA_OPEN_X = 0; // 营业：正视内部
const CAMERA_CLOSED_X = -2360; // 打烊：外观在屏幕右侧露左半
const TAVERN_W = 360;
const SKY_TRANSITION_MS = 2000;

// 酒楼内部布局（侧视图，世界坐标）
const FLOOR_Y = 1010; // 地面线
const ACTOR_Y = FLOOR_Y - 34; // 角色脚踩地面的中心高度
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

const SKY_STOPS = [
  { t: 0, color: 0xa8d8ff }, // 清晨
  { t: 0.28, color: 0x74bdf7 }, // 正午
  { t: 0.68, color: 0xf0a05a }, // 黄昏
  { t: 1, color: 0x1b2440 }, // 夜晚
] as const;
const NIGHT_COLOR = 0x1b2440;

type Driver = "player" | "staff";
type ProductionRole = "hawker" | "server" | "cook";
type StaffRole = ProductionRole | "buyer";
type GameState = "closed" | "selectingMenu" | "open";
type TapText = Phaser.GameObjects.Text & { onTap: () => void };

interface Dish {
  id: string;
  name: string;
  price: number;
  cookMs: number;
  unlockLevel: number;
}

const DISHES: Dish[] = [
  { id: "stirfry", name: "清炒灵蔬", price: 6, cookMs: 1500, unlockLevel: 1 },
  { id: "porridge", name: "灵米粥", price: 8, cookMs: 2000, unlockLevel: 2 },
  { id: "jelly", name: "玉露羹", price: 12, cookMs: 2800, unlockLevel: 3 },
  { id: "fish", name: "龙涎鱼脍", price: 18, cookMs: 4000, unlockLevel: 4 },
];

function getBoothCount(level: number): number {
  return TABLE_COUNT_BASE + (level - 1);
}
function getUpgradeCost(level: number): number {
  return Math.round(UPGRADE_BASE_COST * Math.pow(UPGRADE_COST_MULTIPLIER, level - 1));
}
function getPlayerDuration(base: number, shrinkPerLevel: number, floor: number, tavernLevel: number): number {
  return Math.max(floor, base - (tavernLevel - 1) * shrinkPerLevel);
}
function getStaffDuration(
  role: ProductionRole,
  base: number,
  shrinkPerLevel: number,
  floor: number,
  tavernLevel: number,
  staffLevel: number,
): number {
  const raw =
    base * STAFF_SPEED_PENALTY * Math.pow(STAFF_LEVEL_SPEEDUP[role], Math.max(staffLevel, 1) - 1) -
    (tavernLevel - 1) * shrinkPerLevel;
  return Math.max(floor, raw);
}
/** 顾客到店间隔：基础随机区间，受装潢等级和迎客伙计等级缩短。 */
function getArrivalInterval(tavernLevel: number, hawkerLevel: number): number {
  const base = Phaser.Math.Between(ARRIVAL_MIN_MS, ARRIVAL_MAX_MS);
  const hawkerFactor = Math.max(0.35, 1 - ARRIVAL_HAWKER_SHRINK * hawkerLevel);
  return Math.max(ARRIVAL_FLOOR_MS, base * hawkerFactor - (tavernLevel - 1) * ARRIVAL_TAVERN_SHRINK_MS);
}

/** 熟练度点数换算等级：每 3 点一级，最高 4 级。 */
function getStaffLevel(exp: number): number {
  return Math.min(MAX_STAFF_LEVEL, 1 + Math.floor(exp / EXP_PER_LEVEL));
}

/** 日薪 = 岗位基础日薪 × 1.3^(等级-1)。 */
function getStaffWage(role: StaffRole, level: number): number {
  return Math.round(STAFF_BASE_WAGE[role] * Math.pow(WAGE_PER_LEVEL, Math.max(level, 1) - 1));
}

/** 采买伙计提供采购折扣，每级 -8%，最多 -50%。 */
function getPurchaseDiscount(buyerLevel: number): number {
  return Math.min(PURCHASE_DISCOUNT_CAP, PURCHASE_DISCOUNT_PER_LEVEL * Math.max(buyerLevel, 0));
}

/** 采购价格：营业中翻倍；采买等级提供折扣（玩家手动采购同样享受）。 */
function getPurchasePrice(buyerLevel: number, emergency: boolean): number {
  const base = PURCHASE_COST * (emergency ? PURCHASE_EMERGENCY_MULTIPLIER : 1);
  return Math.max(1, Math.round(base * (1 - getPurchaseDiscount(buyerLevel))));
}

/** 营业中紧急采购的等待时长（受装潢小幅缩短）。打烊采购不走这个。 */
function getPurchaseDuration(tavernLevel: number): number {
  const shrink = (tavernLevel - 1) * PURCHASE_TAVERN_SHRINK_PER_LEVEL_MS;
  return Math.max(PURCHASE_FLOOR_MS, PURCHASE_TIME_MS - shrink);
}

/** 按关键帧在昼夜色带里插值。t: 0=清晨 1=夜晚。 */
function skyColorAt(t: number): number {
  const clamped = Phaser.Math.Clamp(t, 0, 1);
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    const a = SKY_STOPS[i];
    const b = SKY_STOPS[i + 1];
    if (clamped >= a.t && clamped <= b.t) {
      const k = (clamped - a.t) / (b.t - a.t || 1);
      const ca = Phaser.Display.Color.IntegerToColor(a.color);
      const cb = Phaser.Display.Color.IntegerToColor(b.color);
      const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(ca, cb, 100, k * 100);
      return Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);
    }
  }
  return SKY_STOPS[SKY_STOPS.length - 1].color;
}

// ===== 自检 =====
console.assert(getBoothCount(1) === TABLE_COUNT_BASE, "1 级应为基础雅座/排队容量");
console.assert(getUpgradeCost(2) > getUpgradeCost(1), "升级花费应随等级递增");
console.assert(DISHES[0].unlockLevel === 1, "第一道菜应在 1 级即可用");
console.assert(getPurchaseDuration(1) === PURCHASE_TIME_MS, "营业中紧急采购基础耗时应为 15 秒");
console.assert(getPurchasePrice(0, false) === PURCHASE_COST, "无采买时打烊采购应为原价");
console.assert(getPurchasePrice(0, true) === PURCHASE_COST * 2, "无采买时营业中采购应翻倍");
console.assert(getPurchasePrice(2, false) < getPurchasePrice(0, false), "采买等级越高采购越便宜");
console.assert(getPurchasePrice(99, false) >= 1, "折扣后价格不应低于 1");
console.assert(skyColorAt(0) !== skyColorAt(1), "昼夜色带端点应不同");
console.assert(skyColorAt(1) === NIGHT_COLOR, "夜晚色应等于色带末端");

type BoothState = "empty" | "seating" | "awaitingCook" | "cooking" | "dining";

interface Booth {
  state: BoothState;
  cookingDriver: Driver | null;
  currentDish: Dish | null;
  cookStartedAt: number;
  cookDoneAt: number;
  departAt: number;
  patronChar?: Character;
}
interface BoothVisual {
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  legs: Phaser.GameObjects.Rectangle[];
}
interface QueuedPatron {
  expiresAt: number;
  char: Character;
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

/** 按钮内叠两条进度条：上=伙计（蓝），下=玩家（橙）。 */
class ProgressButton {
  private static readonly BAR_WIDTH = 165;
  private track: Phaser.GameObjects.Rectangle;
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
    this.track = scene.add.rectangle(x, y, width, height, 0x3a3a3a).setOrigin(0, 0).setStrokeStyle(1, 0x666666);
    const barX = x + width - ProgressButton.BAR_WIDTH - 10;
    this.staffFill = scene.add.rectangle(barX, y + 5, 0, 11, COLOR_STAFF).setOrigin(0, 0);
    this.playerFill = scene.add.rectangle(barX, y + height - 16, 0, 11, COLOR_PLAYER).setOrigin(0, 0);
    this.label = scene.add
      .text(x + 10, y + height / 2, "", { fontSize: "15px", color: "#ffffff" })
      .setOrigin(0, 0.5);
    register(this.track, x);
    register(this.playerFill, barX);
    register(this.staffFill, barX);
    register(this.label, x + 10);
    // 用 pointerup + 位移阈值判定点击，避免玩家拖拽场景时误触按钮
    let sx = 0;
    let sy = 0;
    this.track
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
  setEnabled(enabled: boolean) {
    if (enabled) {
      this.track.setInteractive({ useHandCursor: true }).setAlpha(1);
    } else {
      this.track.disableInteractive().setAlpha(0.5);
    }
  }
  setVisible(visible: boolean) {
    this.track.setVisible(visible);
    this.playerFill.setVisible(visible);
    this.staffFill.setVisible(visible);
    this.label.setVisible(visible);
    if (!visible) this.track.disableInteractive();
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

  private gameState: GameState = "closed";
  private selectedDishIds = new Set<string>();
  private dishCursor = 0;
  private sessionEndsAt = 0;
  private sessionStartedAt = 0;
  private sessionServed = 0;
  private sessionRevenue = 0;
  private sessionLost = 0;

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
  private queueText!: Phaser.GameObjects.Text;
  private sessionText!: Phaser.GameObjects.Text;
  private chronicleText!: Phaser.GameObjects.Text;
  private tableTitle!: Phaser.GameObjects.Text;
  private boothVisuals: BoothVisual[] = [];

  private nextArrivalAt = 0;
  private lastCallTriggered = false;
  /** HUD 上显示的灵石数，收益到账时从这里滚动到真实值。 */
  private displayedCoins = STARTING_COINS;
  private lastWages: { role: StaffRole; level: number; wage: number }[] = [];
  private sfxMuted = false;
  private bgmMuted = false;
  private sfxButton!: TapText;
  private bgmButton!: TapText;
  private hireHawkerButton!: TapText;
  private serveButton!: ProgressButton;
  private hireServerButton!: TapText;
  private cookButton!: Phaser.GameObjects.Text;
  private hireCookButton!: TapText;
  private purchaseButton!: ProgressButton;
  private hireBuyerButton!: TapText;
  private upgradeButton!: TapText;
  private startButton!: TapText;

  private genderButton!: TapText;
  private overlay: Phaser.GameObjects.Container | null = null;
  /** 结算面板显示中：产线已停，但视图仍停在营业视角，等玩家点「打烊」再过渡。 */
  private settling = false;
  /** 视图过渡中，防止重复触发。 */
  private transitioning = false;

  constructor() {
    super("tavern");
  }

  create() {
    this.booths = Array.from({ length: getBoothCount(this.level) }, () => this.makeBooth());
    this.selectedDishIds = new Set(DISHES.filter((d) => d.unlockLevel <= this.level).map((d) => d.id));

    this.buildWorld();
    this.buildUi();

    this.cameras.main.centerOn(CAMERA_CLOSED_X, SCREEN_H / 2);
    this.setGender("male");
    this.bindCameraDrag();
    this.refreshHud();
    // shortcut: 用 localStorage 记性别；接入微信小游戏时换成 wx.setStorageSync
    if (!localStorage.getItem("tavern_gender")) this.showGenderPicker();

    // Debug 面板只在开发环境引入，生产构建会被整块剔除
    if (import.meta.env.DEV) {
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
          localStorage.setItem("tavern_gender", gender);
          layer.destroy(true);
        });
      layer.add(btn);
    };
    pick(120, "男", "male", "#3f5a7a");
    pick(400, "女", "female", "#7a3f5a");
    this.overlay = layer;
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
    const hud = this.add.rectangle(0, 0, SCREEN_W, 104, 0x000000, 0.55).setOrigin(0, 0).setScrollFactor(0).setDepth(30);
    hud.setVisible(true);

    this.coinsText = this.addUiText(16, 10, "", "17px", "#ffd700");
    this.inventoryText = this.addUiText(16, 36, "", "17px", "#9fe870");
    this.levelText = this.addUiText(250, 10, "", "17px", "#87ceeb");
    this.queueText = this.addUiText(250, 36, "", "17px", "#e0b0ff");
    this.sessionText = this.addUiText(16, 62, "", "14px", "#a8d8ff");
    this.chronicleText = this.addUiText(370, 82, "", "13px", "#cccccc");
    this.tableTitle = this.addUiText(16, 108, "雅座", "13px", "#bbbbbb");

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

    // 营业中就地按钮（世界坐标，贴在门口/桌区/厨房）
    this.serveButton = new ProgressButton(this, SERVE_SPOT.x - 80, SERVE_SPOT.y - 10, 170, 34, () => this.startSeat("player"), () => {});
    this.cookButton = this.addWorldButton(COOK_SPOT.x - 80, COOK_SPOT.y - 10, () => this.manualCook());

    // 通用按钮：底部固定
    this.purchaseButton = new ProgressButton(this, 16, 1194, 200, 34, () => this.startPurchase(), this.registerUi);
    this.startButton = this.addUiButton(230, 1194, () => this.onStartButton());

    // 打烊期的经营按钮（屏幕左侧竖排）
    this.hireHawkerButton = this.addUiButton(16, 700, () => this.hireStaff("hawker"));
    this.hireServerButton = this.addUiButton(16, 760, () => this.hireStaff("server"));
    this.hireCookButton = this.addUiButton(16, 820, () => this.hireStaff("cook"));
    this.hireBuyerButton = this.addUiButton(16, 880, () => this.hireStaff("buyer"));
    this.upgradeButton = this.addUiButton(16, 940, () => this.upgradeTavern());
    this.genderButton = this.addUiButton(16, 1000, () => this.toggleGender());

    this.buildBoothVisuals();
    this.positionUi(false);
  }

  private addWorldButton(x: number, y: number, onClick: () => void): Phaser.GameObjects.Text {
    let sx = 0;
    let sy = 0;
    return this.add
      .text(x, y, "", {
        fontSize: "15px",
        color: "#ffffff",
        backgroundColor: "#3a3a3a",
        padding: { x: 10, y: 8 },
      })
      .setDepth(25)
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
    const label = this.add.text(0, 0, "", { fontSize: "11px", color: "#ffffff" }).setDepth(3);
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
      v.label.setPosition(x - width / 2 + 2, FLOOR_Y - 92);
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
      this.nextArrivalAt = time + getArrivalInterval(this.level, this.staffLevel.hawker);
    }

    this.queue = this.queue.filter((patron) => {
      if (time >= patron.expiresAt) {
        this.sessionLost += 1;
        patron.char.walkTo(980, ACTOR_Y, 400, () => patron.char.destroy());
        this.log("一位食客候得不耐，拂袖离去");
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
        const price = booth.currentDish?.price ?? 0;
        const dishName = booth.currentDish?.name ?? "菜";
        booth.state = "empty";
        booth.cookingDriver = null;
        booth.currentDish = null;
        const leaver = booth.patronChar;
        booth.patronChar = undefined;
        leaver?.walkTo(440, ACTOR_Y, 500, () => leaver.destroy());
        playSfx("coin");
        this.showCoinPopup(this.tablePosition(index).x, FLOOR_Y - 120, price);
        this.sessionServed += 1;
        this.sessionRevenue += price;
        this.log(`食客用罢${dishName}离店，收入 +${price} 灵石`);
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
        this.add.text(60, y + 46, `售价 ${dish.price} 灵石 · 烹饪 ${(dish.cookMs / 1000).toFixed(1)}s`, {
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
      this.sessionEndsAt = this.time.now + SESSION_DURATION_MS;
      this.nextArrivalAt = this.time.now + getArrivalInterval(this.level, this.staffLevel.hawker);
      this.lastCallTriggered = false;
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
    });
    playSfx("close");
    this.log("打烊，今日营业结束");
    this.gainStaffExperience();
    this.lastWages = this.settleWages();
    // 镜头暂留营业视角，等玩家在结算面板点「打烊」后再拉远过渡
    this.buildSettlementOverlay();
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

  private buildSettlementOverlay() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(100);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.92).setOrigin(0, 0));
    layer.add(this.add.text(40, 90, "今日营业结束", { fontSize: "32px", color: "#ffffff" }));

    const roleName = { hawker: "迎客", server: "跑堂", cook: "灶上", buyer: "采买" } as const;
    let y = 170;
    if (this.lastWages.length > 0) {
      layer.add(this.add.text(40, y, "伙计工钱", { fontSize: "18px", color: "#aaaaaa" }));
      y += 34;
      for (const w of this.lastWages) {
        layer.add(
          this.add.text(56, y, `${roleName[w.role]} Lv${w.level} · 日薪 ${w.wage} 灵石`, {
            fontSize: "19px",
            color: "#e8e8e8",
          }),
        );
        y += 30;
      }
      y += 10;
    }

    const totalWage = this.lastWages.reduce((sum, w) => sum + w.wage, 0);
    const summary = [
      `服务食客：${this.sessionServed} 位`,
      `总收益：${this.sessionRevenue} 灵石`,
      `工资合计：${totalWage} 灵石`,
      `净收益：${this.sessionRevenue - totalWage} 灵石`,
      `流失食客：${this.sessionLost} 位`,
    ];
    summary.forEach((line) => {
      layer.add(this.add.text(40, y, line, { fontSize: "21px", color: "#e8e8e8" }));
      y += 40;
    });

    const close = this.add
      .text(40, Math.min(y + 40, 1150), "打烊", {
        fontSize: "22px",
        color: "#ffffff",
        backgroundColor: "#3f5a7a",
        padding: { x: 16, y: 12 },
      })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        this.destroyOverlay();
        this.transitionToClosedView();
      });
    layer.add(close);
    this.overlay = layer;
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
    this.hireHawkerButton.setVisible(!isOpen);
    this.hireServerButton.setVisible(!isOpen);
    this.hireCookButton.setVisible(!isOpen);
    this.hireBuyerButton.setVisible(!isOpen);
    this.upgradeButton.setVisible(!isOpen);
    this.genderButton.setVisible(!isOpen);

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
      if (this.gameState !== "open" || this.transitioning) return;
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

  private setButtonEnabled(button: Phaser.GameObjects.Text, enabled: boolean) {
    if (enabled) {
      button.setInteractive({ useHandCursor: true }).setAlpha(1);
    } else {
      button.disableInteractive().setAlpha(0.5);
    }
  }

  private isPlayerBusy(): boolean {
    return (
      this.playerSeat !== null ||
      this.playerCookingBooth !== null ||
      this.playerPurchasing !== null
    );
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
    const char = new Character(this, 980, ACTOR_Y, 0xc0a080, 0x2b2b2b);
    char.setVisible(this.gameState === "open");

    if (this.queue.length >= getBoothCount(this.level)) {
      char.walkTo(1120, ACTOR_Y, 400, () => char.destroy());
      this.sessionLost += 1;
      this.log("门外已排满，食客转身离去");
      return;
    }

    char.walkTo(QUEUE_X + this.queue.length * QUEUE_GAP, ACTOR_Y, 700);
    this.queue.push({ expiresAt: time + QUEUE_PATIENCE_MS, char });
    this.staffChars.hawker?.pulse();
    playSfx("arrival");
    this.log("一位食客来到门前排起队");
  }

  /** 临近打烊时清空排队：所有候客直接离开。 */
  private dismissQueue() {
    this.queue.forEach((p) => {
      p.char.walkTo(1120, ACTOR_Y, 600, () => p.char.destroy());
    });
    this.queue = [];
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
          ? getPlayerDuration(SEAT_BASE_MS, SEAT_TAVERN_SHRINK_PER_LEVEL_MS, SEAT_FLOOR_MS, this.level)
          : getStaffDuration(
              "server",
              SEAT_BASE_MS,
              SEAT_TAVERN_SHRINK_PER_LEVEL_MS,
              SEAT_FLOOR_MS,
              this.level,
              this.staffLevel.server,
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
    if (this.isPlayerBusy()) return;
    const index = this.booths.findIndex((booth) => booth.state === "awaitingCook");
    if (index === -1) return;
    this.startCook(this.booths[index], index, "player");
  }

  private startCook(booth: Booth, index: number, driver: Driver) {
    if (booth.state !== "awaitingCook") return;
    if (this.inventory <= 0) {
      booth.state = "empty";
      const leaver = booth.patronChar;
      booth.patronChar = undefined;
      leaver?.walkTo(440, ACTOR_Y, 400, () => leaver.destroy());
      this.sessionLost += 1;
      this.log("灵材不足，食客离开");
      return;
    }

    const dish = this.nextDish();
    this.inventory -= 1;
    const duration =
      driver === "player"
        ? getPlayerDuration(dish.cookMs, COOK_TAVERN_SHRINK_PER_LEVEL_MS, COOK_FLOOR_MS, this.level)
        : getStaffDuration(
            "cook",
            dish.cookMs,
            COOK_TAVERN_SHRINK_PER_LEVEL_MS,
            COOK_FLOOR_MS,
            this.level,
            this.staffLevel.cook,
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

  /** 玩家点采购：打烊瞬间到货；营业中走 15 秒紧急采购（翻倍价）。 */
  private startPurchase() {
    const emergency = this.gameState === "open";
    const price = getPurchasePrice(this.staffLevel.buyer, emergency);

    if (this.isPlayerBusy()) return;
    if (this.coins < price) {
      this.log(emergency ? "灵石不足，无法紧急采购" : "灵石不足，无法采购");
      return;
    }
    this.coins -= price;
    this.displayedCoins = this.coins;

    if (!emergency) {
      this.inventory += PURCHASE_AMOUNT;
      this.log(`采购灵材 +${PURCHASE_AMOUNT}`);
      return;
    }
    this.playerPurchasing = {
      startedAt: this.time.now,
      duration: getPurchaseDuration(this.level),
      amount: PURCHASE_AMOUNT,
    };
    this.log("紧急采购下单（价格翻倍），等货中");
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

    if (role !== "buyer") {
      const home = role === "hawker" ? HAWKER_HOME : role === "server" ? SERVER_HOME : COOK_HOME;
      const color = role === "hawker" ? 0x8a6a3a : role === "server" ? 0x3a7a5a : 0x7a4a3a;
      const char = new Character(this, home.x, home.y, color, 0x2b2b2b);
      char.setVisible(this.gameState === "open");
      this.staffChars[role] = char;
    }

    const roleName = { hawker: "迎客", server: "跑堂", cook: "灶上", buyer: "采买" }[role];
    playSfx("upgrade");
    this.log(`雇到一位${roleName}伙计，此后自动运作`);
    const hireButton = {
      hawker: this.hireHawkerButton,
      server: this.hireServerButton,
      cook: this.hireCookButton,
      buyer: this.hireBuyerButton,
    }[role];
    hireButton.onTap = () => {};
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
    const paid = Math.min(total, this.coins);
    this.coins -= paid;
    this.displayedCoins = this.coins;
    if (paid < total) this.log(`灵石不足，只付了 ${paid}/${total} 灵石工钱`);
    return details;
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
    const playerSeatFraction = this.playerSeat ? (time - this.playerSeat.startedAt) / this.playerSeat.duration : 0;
    const staffSeatFraction = this.staffSeat ? (time - this.staffSeat.startedAt) / this.staffSeat.duration : 0;
    this.serveButton.setProgress(playerSeatFraction, staffSeatFraction);
    this.serveButton.setEnabled(
      this.gameState === "open" &&
        !this.isPlayerBusy() &&
        this.queue.length > 0 &&
        this.booths.some((booth) => booth.state === "empty"),
    );

    this.setButtonEnabled(
      this.cookButton,
      this.gameState === "open" &&
        !this.isPlayerBusy() &&
        this.inventory > 0 &&
        this.booths.some((booth) => booth.state === "awaitingCook"),
    );

    const playerPurchaseFraction = this.playerPurchasing
      ? (time - this.playerPurchasing.startedAt) / this.playerPurchasing.duration
      : 0;
    this.purchaseButton.setProgress(playerPurchaseFraction, 0);
    const purchasePrice = getPurchasePrice(this.staffLevel.buyer, this.gameState === "open");
    this.purchaseButton.setEnabled(!this.isPlayerBusy() && this.coins >= purchasePrice);

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
    const icon = this.add.circle(0, 0, 9, 0xffd700).setStrokeStyle(2, 0xfff2a0);
    const text = this.add.text(14, -10, `+${amount}`, {
      fontSize: "20px",
      color: "#ffd700",
      stroke: "#4a3000",
      strokeThickness: 3,
    });
    container.add([icon, text]);

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
    this.sessionText.setText(
      open
        ? `营业中 · 剩余 ${Math.max(0, Math.ceil((this.sessionEndsAt - this.time.now) / 1000))}s · 本局 ${this.sessionServed} 位 / ${this.sessionRevenue} 灵石`
        : "",
    );
    this.chronicleText.setText(this.chronicleLines.join("\n"));

    this.booths.forEach((booth, i) => {
      const visual = this.boothVisuals[i];
      if (visual) visual.label.setText(`雅座${i + 1} ${this.boothLabel(booth)}`);
    });

    this.startButton.setText(open ? "提前打烊" : "开始营业");

    this.serveButton.setVisible(open);
    this.cookButton.setVisible(open);
    this.hireHawkerButton.setVisible(!open);
    this.hireServerButton.setVisible(!open);
    this.hireCookButton.setVisible(!open);
    this.hireBuyerButton.setVisible(!open);
    this.upgradeButton.setVisible(!open);
    this.purchaseButton.setVisible(true);

    this.hireHawkerButton.setText(
      this.staffLevel.hawker > 0
        ? `迎客 Lv${this.staffLevel.hawker} · 熟练 ${this.staffExp.hawker % EXP_PER_LEVEL}/${EXP_PER_LEVEL}`
        : `雇迎客伙计（${HIRE_COST_HAWKER} 灵石 → 加速顾客到店）`,
    );

    this.serveButton.setLabel("招待入座");
    this.hireServerButton.setText(
      this.staffLevel.server > 0
        ? `跑堂 Lv${this.staffLevel.server} · 熟练 ${this.staffExp.server % EXP_PER_LEVEL}/${EXP_PER_LEVEL}`
        : `雇跑堂伙计（${HIRE_COST_SERVER} 灵石 → 自动招待）`,
    );

    this.cookButton.setText("动手烹饪");
    this.hireCookButton.setText(
      this.staffLevel.cook > 0
        ? `灶上 Lv${this.staffLevel.cook} · 熟练 ${this.staffExp.cook % EXP_PER_LEVEL}/${EXP_PER_LEVEL}`
        : `雇灶上伙计（${HIRE_COST_COOK} 灵石 → 自动烹饪）`,
    );

    const purchasePriceLabel = getPurchasePrice(this.staffLevel.buyer, open);
    this.purchaseButton.setLabel(
      open
        ? `紧急采购（${purchasePriceLabel} 灵石 → +${PURCHASE_AMOUNT} 灵材）`
        : `采购灵材（${purchasePriceLabel} 灵石 → +${PURCHASE_AMOUNT} 灵材）`,
    );
    this.hireBuyerButton.setText(
      this.staffLevel.buyer > 0
        ? `采买 Lv${this.staffLevel.buyer} · 熟练 ${this.staffExp.buyer % EXP_PER_LEVEL}/${EXP_PER_LEVEL}`
        : `雇采买伙计（${HIRE_COST_BUYER} 灵石 → 打烊自动补货 + 采购优惠）`,
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
