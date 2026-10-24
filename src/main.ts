import Phaser from "phaser";
import { loadAudioSettings, playSfx, setBgmMuted, setSfxMuted, startBgm } from "./audio";
import {
  BANKRUPT_STREAK,
  DISHES,
  EMPTY_META,
  LOANS,
  LOAN_PERIODS,
  MAX_STAFF_LEVEL,
  NIGHT_COLOR,
  REALMS,
  STARTING_COINS,
  STARTING_INVENTORY,
  applyEvent,
  getAchievements,
  getArrivalInterval,
  getAscensionPriceMultiplier,
  getAscensionStartCoins,
  getAscensionStartInventory,
  getAscensionStartLevel,
  getBoothCount,
  getCultivationGain,
  getDailyGoal,
  getDishFans,
  getGoalCoinReward,
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
  getSignArrivalFactor,
  getSignUpgradeCost,
  getStaffDuration,
  getStaffLevel,
  getStaffWage,
  getStoveSpeedFactor,
  getStoveUpgradeCost,
  getUpgradeCost,
  getWishPrice,
  isGoalMet,
  pickPatronKind,
  pickPatronWish,
  pickRandomEvent,
  skyColorAt,
  updateMeta,
} from "./logic";
import { EXP_PER_LEVEL } from "./logic";
import type { DailyGoal, Dish, LoanDef, MetaStats, PatronKind, StaffRole } from "./logic";
import { decodeSaveCode, encodeSaveCode } from "./savecode";

// ===== 本文件独有的常量 =====
const QUEUE_PATIENCE_MS = 8000;
const LAST_CALL_MS = 10000;
const DINING_MS = 3000;
/** 桌子入座后先给玩家这么久亲手出菜，伙计再接手。 */
const COOK_PRIORITY_MS = 1500;
const SESSION_DURATION_MS = 60000;
const PURCHASE_AMOUNT = 5;
const PURCHASE_TARGET_STOCK = 10;
const HIRE_COST_HAWKER = 30;
const HIRE_COST_SERVER = 40;
const HIRE_COST_COOK = 50;
const HIRE_COST_BUYER = 35;
const CHRONICLE_MAX_LINES = 1;
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
const STATUS_BAR_H = 130;
const XIAN_FONT = '"KaiTi","STKaiti","Kaiti SC","Noto Serif SC",serif';
const SECONDARY_TOP = 1077;
const CARD_W = 600;

const EXTERIOR_X = -2000;
const CAMERA_OPEN_X = 60;
const CAMERA_CLOSED_X = -2000;
const TAVERN_W = 360;
const SKY_TRANSITION_MS = 2000;

const FLOOR_Y = 1010;
const ACTOR_Y = FLOOR_Y - 34;
const TABLE_X_MIN = -230;
const TABLE_X_MAX = 170;
const QUEUE_X = 300;
const QUEUE_GAP = 34;
const TABLE_MARKS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];
const PLAYER_HOME = { x: 240, y: ACTOR_Y };
const HAWKER_HOME = { x: 280, y: ACTOR_Y };
const SERVER_HOME = { x: 120, y: ACTOR_Y };
const COOK_HOME = { x: -290, y: ACTOR_Y };
const SERVE_SPOT = { x: 275, y: ACTOR_Y };
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
  awaitingSince: number;
  patronChar?: Character;
  patronKind: PatronKind | null;
  patronWish: string | null;
}
interface BoothVisual {
  bg: Phaser.GameObjects.Rectangle;
  runner: Phaser.GameObjects.Rectangle;
  number: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  legs: Phaser.GameObjects.Rectangle[];
  barBg: Phaser.GameObjects.Rectangle;
  barFill: Phaser.GameObjects.Rectangle;
}
interface QueuedPatron {
  expiresAt: number;
  patienceMs: number;
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

interface AutoState {
  server: boolean;
  cook: boolean;
  buyer: boolean;
}

interface SaveData {
  v: 1;
  coins: number;
  inventory: number;
  level: number;
  stoveLevel: number;
  signLevel: number;
  auto: AutoState;
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
  meta: MetaStats;
  /** 当日目标快照：读档后不能因等级变化换目标，否则同一目标会显示两个数。 */
  dailyGoal?: DailyGoal | null;
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
    if (visible && this.enabled) this.zone.setInteractive({ useHandCursor: true });
    else this.zone.disableInteractive();
  }
}

/** 二头身 Q 版占位角色：大圆头 + 矩形身体 + 发型。 */
type CharacterLook =
  | "player"
  | "server"
  | "cook"
  | "hawker"
  | "sword"
  | "alchemist"
  | "demon"
  | "mortal"
  | "elder"
  | "demonlord"
  | "rogue";

/** 小人物：宽袖道袍、发髻、眼睛会眨，按身份带剑/葫芦/酒旗/托盘等小道具。 */
class Character extends Phaser.GameObjects.Container {
  private visual: Phaser.GameObjects.Container;
  private art: Phaser.GameObjects.Graphics;
  private eyeL: Phaser.GameObjects.Arc;
  private eyeR: Phaser.GameObjects.Arc;
  private eyeWhiteL: Phaser.GameObjects.Arc;
  private eyeWhiteR: Phaser.GameObjects.Arc;
  private aura?: Phaser.GameObjects.Arc;
  private patienceBg?: Phaser.GameObjects.Rectangle;
  private patienceFill?: Phaser.GameObjects.Rectangle;
  private idleTween?: Phaser.Tweens.Tween;
  private walkTween?: Phaser.Tweens.Tween;
  private bubble?: Phaser.GameObjects.Text;
  private bubbleTail?: Phaser.GameObjects.Triangle;
  private dining = false;
  private static readonly ART_SCALE = 1.18;
  private bodyColor: number;
  private hairColor: number;
  private longHair: boolean;
  private look: CharacterLook;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    bodyColor: number,
    hairColor: number,
    longHair = false,
    look: CharacterLook = "rogue",
  ) {
    super(scene, x, y);
    this.bodyColor = bodyColor;
    this.hairColor = hairColor;
    this.longHair = longHair;
    this.look = look;
    this.visual = scene.add.container(0, 0);
    this.visual.setScale(Character.ART_SCALE);
    this.art = scene.add.graphics();
    this.visual.add(this.art);
    this.eyeWhiteL = scene.add.circle(-4, -19, 3, 0xfff6e8).setDepth(1);
    this.eyeWhiteR = scene.add.circle(4, -19, 3, 0xfff6e8).setDepth(1);
    this.eyeL = scene.add.circle(-4, -19, 1.4, 0x2a1c16).setDepth(2);
    this.eyeR = scene.add.circle(4, -19, 1.4, 0x2a1c16).setDepth(2);
    this.visual.add([this.eyeWhiteL, this.eyeWhiteR, this.eyeL, this.eyeR]);
    this.add(this.visual);
    this.draw();
    this.setDepth(20);
    scene.add.existing(this);
    scene.tweens.add({
      targets: [this.eyeWhiteL, this.eyeWhiteR, this.eyeL, this.eyeR],
      scaleY: 0.12,
      duration: 70,
      yoyo: true,
      repeat: -1,
      repeatDelay: Phaser.Math.Between(2200, 5200),
      delay: Phaser.Math.Between(600, 4000),
    });
    this.startIdle();
    // 点人物会回一句身份台词；用拖动阈值区分镜头拖拽
    this.setInteractive(new Phaser.Geom.Rectangle(-24, -56, 48, 102), Phaser.Geom.Rectangle.Contains);
    let downX = 0;
    let downY = 0;
    this.on("pointerdown", (p: Phaser.Input.Pointer) => {
      downX = p.x;
      downY = p.y;
    });
    this.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (Math.hypot(p.x - downX, p.y - downY) < 14) {
        this.say(this.talkLine());
        this.scene.events.emit("focus-character", this);
      }
    });
  }

  /** 被点到时说的闲话，按身份区分。 */
  private talkLine(): string {
    const lines: Record<CharacterLook, string[]> = {
      player: ["今日也要好好营生。", "灵台清明。", "客官稍候。"],
      server: ["客官里边请——", "小心台阶。", "茶还是温的。"],
      cook: ["火候正好。", "这锅气，成了。", "再添一把柴。"],
      hawker: ["灵膳楼开张，仙凡同席！", "今日有鲜货！"],
      sword: ["剑在人在。", "这碗鱼脍有剑意。"],
      alchemist: ["丹火未熄。", "这汤里可入药。"],
      demon: ["哼，凡人的手艺。", "再来三碗！"],
      mortal: ["真香！", "老板，结账。"],
      elder: ["此子有慧根。", "灵膳一道，胜坐三日。"],
      demonlord: ["本座只等一炷香。", "这方天地，太小。"],
      rogue: ["道友，请了。", "山高路远，先吃为敬。"],
    };
    const pool = lines[this.look];
    return pool[Phaser.Math.Between(0, pool.length - 1)];
  }

  private shade(color: number, factor: number): number {
    const c = Phaser.Display.Color.IntegerToColor(color);
    return Phaser.Display.Color.GetColor(
      Math.round(c.red * factor),
      Math.round(c.green * factor),
      Math.round(c.blue * factor),
    );
  }

  private draw() {
    const g = this.art;
    const body = this.bodyColor;
    const dark = this.shade(body, 0.72);
    const deep = this.shade(body, 0.5);
    const skin = 0xffe0bd;
    const hair = this.hairColor;
    g.clear();

    // 影子与脚
    g.fillStyle(0x000000, 0.24);
    g.fillEllipse(0, 40, 38, 10);
    if (!this.dining) {
      g.fillStyle(0x211a16, 1);
      g.fillRect(-8, 30, 7, 10);
      g.fillRect(1, 30, 7, 10);
      g.fillStyle(0x14100d, 1);
      g.fillRect(-9, 38, 9, 4);
      g.fillRect(0, 38, 9, 4);
    }

    // 身份道具：画在袍子后面
    if (this.look === "sword" || this.look === "player") {
      g.lineStyle(3, 0xc8d4e0, 0.95);
      g.lineBetween(-15, 20, 14, -44);
      g.lineStyle(4, 0x7a4a2a, 1);
      g.lineBetween(8, -36, 16, -48);
      g.fillStyle(0xd9b45a, 1);
      g.fillCircle(10, -38, 3);
    } else if (this.look === "demon" || this.look === "demonlord") {
      g.lineStyle(5, deep, 1);
      g.beginPath();
      g.moveTo(-10, 20);
      g.lineTo(-20, 26);
      g.lineTo(-16, 38);
      g.strokePath();
    }

    // 长袍
    g.fillStyle(dark, 1);
    g.beginPath();
    g.moveTo(-12, -8);
    g.lineTo(12, -8);
    g.lineTo(18, 30);
    g.lineTo(-18, 30);
    g.closePath();
    g.fillPath();
    g.fillStyle(body, 1);
    g.beginPath();
    g.moveTo(-9, -8);
    g.lineTo(9, -8);
    g.lineTo(13, 28);
    g.lineTo(-13, 28);
    g.closePath();
    g.fillPath();
    // 衣褶
    g.lineStyle(1.5, deep, 0.7);
    g.lineBetween(-5, 2, -7, 26);
    g.lineBetween(6, 4, 8, 26);
    // 宽袖
    g.fillStyle(dark, 1);
    g.fillRoundedRect(-18, -4, 9, 22, 4);
    g.fillRoundedRect(9, -4, 9, 22, 4);
    g.fillStyle(skin, 1);
    g.fillCircle(-14, 18, 3.2);
    g.fillCircle(14, 18, 3.2);
    // 腰带
    g.fillStyle(0x2a211a, 1);
    g.fillRect(-13, 8, 26, 5);
    g.fillStyle(0xd9b45a, 0.9);
    g.fillRect(-3, 8, 6, 5);
    // 交领
    g.fillStyle(0xf1e4cc, 1);
    g.beginPath();
    g.moveTo(-7, -8);
    g.lineTo(7, -8);
    g.lineTo(0, 4);
    g.closePath();
    g.fillPath();
    g.fillStyle(skin, 1);
    g.fillTriangle(-4, -7, 4, -7, 0, 1);

    // 长发/后发
    if (this.longHair) {
      g.fillStyle(hair, 1);
      g.fillRoundedRect(-11, -26, 22, 50, 8);
    }
    // 脖子与头
    g.fillStyle(skin, 1);
    g.fillRect(-3, -12, 6, 5);
    g.fillCircle(0, -20, 11);
    // 后发与发髻：只盖住头顶，别把脸埋掉
    g.fillStyle(hair, 1);
    g.fillEllipse(0, -29, 24, 12);
    g.fillEllipse(-10, -20, 6, 18);
    g.fillEllipse(10, -20, 6, 18);
    g.fillCircle(0, -35, 5);
    if (this.look === "sword") {
      g.fillRect(-2, -44, 4, 12);
      g.fillStyle(0xd9b45a, 1);
      g.fillRect(-4, -33, 8, 3);
    } else if (this.look === "alchemist") {
      g.fillCircle(-9, -31, 4);
      g.fillCircle(9, -31, 4);
    } else if (this.look === "rogue") {
      g.fillStyle(0xd9b45a, 0.9);
      g.fillRect(-11, -25, 22, 3);
    } else if (this.look === "player") {
      g.fillStyle(0x7fe8dd, 1);
      g.fillCircle(0, -23, 1.8);
    }
    // 眉
    g.lineStyle(1.4, this.shade(hair, 1.2), 0.9);
    g.lineBetween(-7, -22.5, -2, -22.5);
    g.lineBetween(2, -22.5, 7, -22.5);
    if (this.look === "elder") {
      g.fillStyle(0xf2f4f8, 0.95);
      g.fillTriangle(-7, -13, 7, -13, 0, 6);
      g.fillStyle(0xe8ecf2, 1);
      g.fillEllipse(0, -25, 26, 14);
    }
    if (this.look === "mortal") {
      g.fillStyle(0xc8a45a, 1);
      g.fillEllipse(0, -28, 34, 8);
      g.fillTriangle(-11, -28, 11, -28, 0, -40);
    }
    if (this.look === "demon" || this.look === "demonlord") {
      g.fillStyle(0x3a2a2a, 1);
      g.fillTriangle(-9, -30, -4, -30, -7, -41);
      g.fillTriangle(4, -30, 9, -30, 7, -41);
    }
    // 发丝
    g.lineStyle(1.5, this.shade(hair, 1.35), 0.9);
    g.lineBetween(-8, -26, -10, -14);
    g.lineBetween(8, -26, 10, -14);
    // 嘴
    g.lineStyle(1.3, 0x9a5a4a, 0.9);
    g.beginPath();
    g.arc(0, -13, 3, 0, Math.PI, false);
    g.strokePath();

    // 身份道具：画在前面
    if (this.look === "elder") {
      g.lineStyle(3, 0x6a4a2a, 1);
      g.lineBetween(17, 30, 20, -46);
      g.lineStyle(2, 0x7fe8dd, 0.9);
      g.strokeCircle(20, -49, 5);
    }
    if (this.look === "alchemist") {
      g.fillStyle(0xf1e4cc, 1);
      g.beginPath();
      g.moveTo(13, 16);
      g.lineTo(27, 3);
      g.lineTo(22, 19);
      g.closePath();
      g.fillPath();
    }
    if (this.look === "player") {
      g.lineStyle(1.5, 0xd9b45a, 0.9);
      g.lineBetween(-9, -6, -13, 28);
      g.lineBetween(9, -6, 13, 28);
      g.lineBetween(-13, 27, 13, 27);
      g.fillStyle(0xffe6a8, 1);
      g.fillCircle(0, 10, 2.5);
    }
    if (this.look === "alchemist" || this.look === "demonlord") {
      g.fillStyle(0xb8742a, 1);
      g.fillCircle(15, 10, 5);
      g.fillCircle(15, 4, 3.2);
      g.lineStyle(1.5, 0x6a3a12, 1);
      g.lineBetween(15, 1, 15, -2);
    }
    if (this.look === "server") {
      g.fillStyle(0x6a4a2a, 1);
      g.fillEllipse(-16, 10, 20, 4);
      g.fillStyle(0x9fe8dd, 1);
      g.fillCircle(-16, 6, 3);
    }
    if (this.look === "cook") {
      g.fillStyle(0xf1e4cc, 0.95);
      g.fillRect(-8, 0, 16, 26);
      g.lineStyle(4, 0x9a9a9a, 1);
      g.lineBetween(15, 16, 9, -10);
      g.fillStyle(0x555555, 1);
      g.fillCircle(9, -10, 4);
    }
    if (this.look === "hawker") {
      g.lineStyle(2.5, 0x6a4a2a, 1);
      g.lineBetween(16, 18, 16, -36);
      g.fillStyle(0xb83a2a, 1);
      g.beginPath();
      g.moveTo(16, -36);
      g.lineTo(34, -30);
      g.lineTo(16, -22);
      g.closePath();
      g.fillPath();
      g.fillStyle(0xffd98a, 1);
      g.fillCircle(16, -40, 2);
    }
    if (this.look === "player") {
      g.fillStyle(0x7fe8dd, 1);
      g.fillCircle(0, 10, 3);
      g.lineStyle(1, 0x3a7a72, 1);
      g.lineBetween(0, 13, 0, 18);
    }
  }

  /** 呼吸/轻微摇晃；只动内部 visual，不打断外层的行走与朝向。 */
  private startIdle() {
    if (!this.scene || !this.visual?.active) return;
    this.stopIdle();
    this.idleTween = this.scene.tweens.add({
      targets: this.visual,
      scaleY: Character.ART_SCALE * 1.025,
      y: -1,
      duration: Phaser.Math.Between(1200, 1800),
      yoyo: true,
      repeat: -1,
      delay: Phaser.Math.Between(0, 900),
      ease: "Sine.easeInOut",
    });
  }

  private stopIdle() {
    this.idleTween?.remove();
    this.idleTween = undefined;
    this.visual.setScale(Character.ART_SCALE).setY(0);
  }

  setBodyColor(color: number) {
    this.bodyColor = color;
    this.draw();
  }

  setHairColor(color: number) {
    this.hairColor = color;
    this.draw();
  }

  setLongHair(long: boolean) {
    this.longHair = long;
    this.draw();
  }

  /** 用膳：收起腿、压低身子并做咀嚼起伏，看起来是坐着吃而不是站着。 */
  setDining(on: boolean) {
    if (this.dining === on || !this.scene || !this.visual?.active) return;
    this.dining = on;
    this.draw();
    this.stopIdle();
    if (on) {
      this.idleTween = this.scene.tweens.add({
        targets: this.visual,
        y: 3,
        scaleY: Character.ART_SCALE * 0.93,
        duration: 620,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    } else {
      this.startIdle();
    }
  }

  /** 被点进特写时的小动作：轻轻一欠身，让静止的人动一下。 */
  focusPose() {
    if (!this.scene || !this.visual?.active) return;
    this.stopIdle();
    this.visual.setAngle(4);
    const ring = this.scene.add
      .circle(this.x, this.y + 24, 18, 0x000000, 0)
      .setStrokeStyle(3, 0xffe08a, 0.9)
      .setDepth(25);
    this.scene.tweens.add({
      targets: ring,
      scale: 3.2,
      alpha: 0,
      duration: 1500,
      ease: "Sine.easeOut",
      onComplete: () => ring.destroy(),
    });
    this.scene.tweens.add({
      targets: this.visual,
      y: -16,
      scaleY: Character.ART_SCALE * 1.07,
      duration: 300,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.visual.setY(0).setScale(Character.ART_SCALE).setAngle(0);
        this.startIdle();
      },
    });
    for (let i = 0; i < 4; i++) {
      const spark = this.scene.add
        .circle(this.x + Phaser.Math.Between(-18, 18), this.y - 70, 2.4, 0xffe08a, 0.9)
        .setDepth(26);
      this.scene.tweens.add({
        targets: spark,
        y: spark.y - Phaser.Math.Between(22, 46),
        alpha: 0,
        duration: 700 + i * 90,
        delay: i * 50,
        ease: "Sine.easeOut",
        onComplete: () => spark.destroy(),
      });
    }
  }

  /** 偶尔的小动作：点一下头/耸肩，让静止画面里也有活气。 */
  twitch() {
    if (this.dining || !this.scene || !this.visual?.active) return;
    this.stopIdle();
    this.scene.tweens.add({
      targets: this.visual,
      y: -4,
      scaleY: Character.ART_SCALE * 1.02,
      duration: 170,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeOut",
      onComplete: () => this.startIdle(),
    });
  }

  /** 境界灵气：脚下的一圈光晕，随境界与仙缘变强。 */
  setAura(color: number, scale = 1, alpha = 0.18) {
    if (!this.aura) {
      this.aura = this.scene.add.circle(0, 30, 26, color, alpha);
      this.addAt(this.aura, 0);
    }
    this.aura.setFillStyle(color, alpha).setScale(scale);
  }

  /** 排队耐心条；入座后传 null 移除。 */
  setPatience(fraction: number | null) {
    if (fraction === null) {
      this.patienceBg?.destroy();
      this.patienceFill?.destroy();
      this.patienceBg = undefined;
      this.patienceFill = undefined;
      return;
    }
    if (!this.patienceBg) {
      this.patienceBg = this.scene.add.rectangle(-16, -50, 32, 4, 0x2a2a2a).setOrigin(0, 0.5);
      this.patienceFill = this.scene.add.rectangle(-16, -50, 32, 4, 0xffd98a).setOrigin(0, 0.5);
      this.add([this.patienceBg, this.patienceFill]);
    }
    const p = Phaser.Math.Clamp(fraction, 0, 1);
    this.patienceFill!.width = 32 * p;
    this.patienceFill!.setFillStyle(p > 0.35 ? 0xffd98a : 0xff7a6a);
  }

  /** 小人说话：气泡挂在世界坐标上，避免被朝向翻转镜像。 */
  say(text: string, tone: "warm" | "cold" = "warm") {
    this.bubble?.destroy();
    this.bubbleTail?.destroy();
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    const margin = Math.min(120, view.width * 0.22);
    const bx = Phaser.Math.Clamp(this.x, view.x + margin, view.right - margin);
    const bubble = this.scene.add
      .text(bx, this.y - 76, text, {
        fontSize: "18px",
        color: tone === "cold" ? "#d8e8ff" : "#2a1f14",
        backgroundColor: tone === "cold" ? "#2a3448" : "#f3e6cf",
        padding: { x: 8, y: 5 },
        fontFamily: '"KaiTi","STKaiti",serif',
        wordWrap: { width: 200 },
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(27);
    const bg = tone === "cold" ? 0x2a3448 : 0xf3e6cf;
    const tail = this.scene.add
      .triangle(bx, bubble.y + bubble.height / 2 - 2, -7, 0, 7, 0, 0, 8, bg)
      .setDepth(27);
    this.bubble = bubble;
    this.bubbleTail = tail;
    // 先完整显示 1.7 秒，再淡出，避免“刚冒出来就透明”
    this.scene.tweens.add({
      targets: [bubble, tail],
      y: "-=12",
      duration: 2400,
      ease: "Sine.easeOut",
    });
    this.scene.tweens.add({
      targets: [bubble, tail],
      alpha: 0,
      delay: 1700,
      duration: 650,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (this.bubble === bubble) this.bubble = undefined;
        if (this.bubbleTail === tail) this.bubbleTail = undefined;
        bubble.destroy();
        tail.destroy();
      },
    });
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
    // 走到一半被叫去别处时，先停掉旧的位移/脉冲，避免两个 tween 抢同一属性
    this.scene.tweens.killTweensOf(this);
    if (this.dining) {
      this.dining = false;
      this.draw();
    }
    this.stopIdle();
    this.walkTween?.remove();
    this.walkTween = this.scene.tweens.add({
      targets: this.visual,
      y: -3,
      duration: 150,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.scaleY = 1;
    if (x < this.x - 2) this.setScale(-1, 1);
    else if (x > this.x + 2) this.setScale(1, 1);
    this.scene.tweens.add({
      targets: this,
      x,
      y,
      duration,
      ease: "Linear",
      onComplete: () => {
        this.walkTween?.remove();
        this.walkTween = undefined;
        this.visual.setY(0);
        this.startIdle();
        onComplete?.();
      },
    });
  }

  teleportTo(x: number, y: number) {
    this.scene.tweens.killTweensOf(this);
    this.walkTween?.remove();
    this.walkTween = undefined;
    this.scaleY = 1;
    this.visual.setY(0);
    this.setPosition(x, y);
    this.startIdle();
  }
}

class TavernScene extends Phaser.Scene {
  private coins = STARTING_COINS;
  private inventory = STARTING_INVENTORY;
  private level = 1;
  private stoveLevel = 0;
  private signLevel = 0;
  private booths: Booth[] = [];
  private queue: QueuedPatron[] = [];
  private staffLevel: StaffLevels = { hawker: 0, server: 0, cook: 0, buyer: 0 };
  private staffExp: StaffLevels = { hawker: 0, server: 0, cook: 0, buyer: 0 };
  private chronicleLines: string[] = [];
  private cultivation = 0;
  private meta: MetaStats = { ...EMPTY_META };
  /** 跑堂/灶上/采买是否自动；关掉后工资照付，玩家可亲自操作或省钱。 */
  private auto: AutoState = { server: true, cook: true, buyer: true };

  private gameState: GameState = "closed";
  private selectedDishIds = new Set<string>();
  private dishCursor = 0;
  private sessionEndsAt = 0;
  private sessionStartedAt = 0;
  private sessionServed = 0;
  private sessionRevenue = 0;
  private sessionLost = 0;
  private sessionWishes = 0;
  private sessionCultivation = 0;
  private goalAnnounced = false;
  private day = 1;
  private ascensions = 0;
  private ascending = false;
  private suppressSave = false;
  private sessionGoal: DailyGoal | null = null;
  /** 当天目标在进入这一天时锁定，之后升级装潢不会临时抬高目标。 */
  private dailyGoal: DailyGoal | null = null;
  private lastGoalResult: { goal: DailyGoal; met: boolean; progress: number; rewardCoins: number } | null =
    null;

  private playerSeat: SeatProgress | null = null;
  private playerCookingBooth: number | null = null;
  private playerPurchasing: PurchaseProgress | null = null;
  private staffSeat: SeatProgress | null = null;
  private staffCookingBooth: number | null = null;

  // 视觉对象
  private skyRect!: Phaser.GameObjects.Rectangle;
  private sunMoon!: Phaser.GameObjects.Arc;
  private moonShadow!: Phaser.GameObjects.Arc;
  private moonHalo!: Phaser.GameObjects.Arc;
  private stars: Phaser.GameObjects.Arc[] = [];
  private tavernGfx!: Phaser.GameObjects.Graphics;
  private interiorGfx!: Phaser.GameObjects.Graphics;
  private uiObjects: { obj: { x: number; setScrollFactor(v: number): unknown }; baseX: number }[] = [];

  private playerChar!: Character;
  private playerLabel!: Phaser.GameObjects.Text;
  private hudBar!: Phaser.GameObjects.Rectangle;
  private hudLine!: Phaser.GameObjects.Rectangle;
  private tutorialBanner!: Phaser.GameObjects.Text;
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
  private navPanel!: Phaser.GameObjects.Container;
  private bankButton!: TapText;
  private serveButton!: TapText;
  private cookButton!: Phaser.GameObjects.Text;
  private dishChipLabel!: Phaser.GameObjects.Text;
  private dishChips: TapText[] = [];
  private purchaseButton!: ProgressButton;
  private upgradeButton!: TapText;
  private cultivationButton!: TapText;
  private helpButton!: TapText;
  private recordButton!: TapText;
  private saveButton!: TapText;
  private startButton!: TapText;
  private lastAutosaveAt = 0;

  private genderButton!: TapText;
  private overlay: Phaser.GameObjects.Container | null = null;
  /** 结算面板显示中：产线已停，但视图仍停在营业视角，等玩家点「打烊」再过渡。 */
  private settling = false;
  /** 视图过渡中，防止重复触发。 */
  private transitioning = false;
  private focusTimer?: Phaser.Time.TimerEvent;
  private focusChar?: Character;
  private focusCaption?: Phaser.GameObjects.Text;
  private focusReturn = { x: CAMERA_OPEN_X, y: SCREEN_H / 2 };
  private eventToast?: Phaser.GameObjects.Text;
  private hintToast?: Phaser.GameObjects.Text;
  private focusing = false;
  private celebrating = false;
  private celebrationTimer?: Phaser.Time.TimerEvent;
  private sparkles: Phaser.GameObjects.Arc[] = [];
  private fireflyCount = 0;
  private lastHintAt = -9999;
  private tutorialHintStage = 0;
  private staffNotice = "";
  private staffNoticeGood = true;

  constructor() {
    super("tavern");
  }

  create() {
    const hadSave = this.loadSave();
    this.ensureGlowTexture();
    this.booths = Array.from({ length: getBoothCount(this.level) }, () => this.makeBooth());
    if (this.selectedDishIds.size === 0) {
      this.selectedDishIds = new Set(DISHES.filter((d) => d.unlockLevel <= this.level).map((d) => d.id));
    }

    this.buildWorld();
    this.applyStaffCharacters();
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
    this.time.addEvent({ delay: 2600, loop: true, callback: () => this.idleTwitch() });
    this.events.on("focus-character", (char: Character) => this.focusOnCharacter(char));
    // shortcut: 用 localStorage 存档；接入微信小游戏时换成 wx.setStorageSync / wx.getStorageSync
    addEventListener("beforeunload", () => this.save());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.save();
    });
    if (!hadSave) this.showTitleScreen();

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

  /** 生成一张柔和的径向光晕，供月光、灯笼、灶火共用；比叠加同心圆干净。 */
  private ensureGlowTexture() {
    if (this.textures.exists("soft-glow")) return;
    const tex = this.textures.createCanvas("soft-glow", 256, 256);
    if (!tex) return;
    const ctx = tex.getContext();
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(255,255,255,0.6)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.2)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    tex.refresh();
  }

  /** 首次进入的标题页：月、山、灯、题字，先把「灵膳楼」的气质立住。 */
  private showTitleScreen() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(140);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x070b14, 1).setOrigin(0, 0).setInteractive());

    // 月光与远山
    layer.add(
      this.add
        .image(540, 210, "soft-glow")
        .setTint(0xffe8b0)
        .setAlpha(0.9)
        .setScale(1.55)
        .setBlendMode(Phaser.BlendModes.ADD),
    );
    layer.add(this.add.circle(540, 210, 38, 0xffefc2, 0.95));
    layer.add(this.add.circle(552, 202, 34, 0x070b14, 0.92));
    const hills = this.add.graphics();
    hills.fillStyle(0x111b2a, 1);
    hills.beginPath();
    hills.moveTo(0, 980);
    hills.lineTo(0, 760);
    hills.lineTo(120, 640);
    hills.lineTo(250, 790);
    hills.lineTo(370, 690);
    hills.lineTo(510, 830);
    hills.lineTo(640, 720);
    hills.lineTo(720, 800);
    hills.lineTo(720, 980);
    hills.closePath();
    hills.fillPath();
    hills.fillStyle(0x0b1420, 1);
    hills.beginPath();
    hills.moveTo(0, 1040);
    hills.lineTo(0, 920);
    hills.lineTo(180, 830);
    hills.lineTo(330, 950);
    hills.lineTo(470, 870);
    hills.lineTo(720, 1000);
    hills.lineTo(720, 1040);
    hills.closePath();
    hills.fillPath();
    // 远处山门
    hills.fillStyle(0x1a2436, 1);
    hills.fillRect(646, 700, 44, 10);
    hills.fillTriangle(634, 700, 702, 700, 668, 676);
    hills.fillStyle(0xffd98a, 0.5);
    hills.fillRect(662, 710, 6, 8);
    layer.add(hills);

    // 雾带
    for (const [x, y, w, a] of [
      [180, 880, 360, 0.05],
      [500, 930, 420, 0.04],
      [80, 950, 300, 0.03],
    ]) {
      layer.add(this.add.ellipse(x, y, w, 46, 0xc8d8e8, a));
    }

    const title = this.add
      .text(SCREEN_W / 2, 430, "灵膳楼", {
        fontSize: "104px",
        color: "#ffe6a8",
        stroke: "#241506",
        strokeThickness: 10,
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setLetterSpacing(14);
    layer.add(title);
    layer.add(
      this.add
        .text(SCREEN_W / 2, 552, "一炉烟火 · 半盏仙途", {
          fontSize: "24px",
          color: "#c8b8a0",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(6),
    );
    layer.add(this.add.rectangle(SCREEN_W / 2, 610, 300, 1, 0xb08a4a, 0.7));
    layer.add(
      this.add
        .text(SCREEN_W / 2, 660, "青云镇外 · 散修旧铺", {
          fontSize: "16px",
          color: "#8a7a62",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(3),
    );

    const button = this.add
      .rectangle(SCREEN_W / 2, 850, 280, 80, 0x2a1a12, 0.9)
      .setStrokeStyle(2, 0xe8b06a)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        playSfx("click");
        this.destroyOverlay();
        this.showGenderPicker();
      });
    layer.add(button);
    const buttonText = this.add
      .text(SCREEN_W / 2, 850, "推门入座", {
        fontSize: "28px",
        color: "#ffe6a8",
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5);
    layer.add(buttonText);
    layer.add(this.add.rectangle(SCREEN_W / 2, 946, 48, 48, 0x8a2a22, 0.95).setStrokeStyle(2, 0xe8b06a).setAngle(4));
    layer.add(
      this.add
        .text(SCREEN_W / 2, 946, "灵膳", {
          fontSize: "16px",
          color: "#ffe6c8",
          fontFamily: XIAN_FONT,
          align: "center",
          lineSpacing: 2,
        })
        .setOrigin(0.5)
        .setAngle(4),
    );
    this.tweens.add({
      targets: [button, buttonText],
      alpha: { from: 0.55, to: 1 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    layer.add(
      this.add
        .text(SCREEN_W / 2, 1028, "迎客入座 · 点菜出餐 · 打烊修行", {
          fontSize: "15px",
          color: "#8a7a62",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(3),
    );

    // 前景屋脊与窗火，填住标题下方的空黑
    const foreground = this.add.graphics();
    foreground.fillStyle(0x05080e, 1);
    foreground.beginPath();
    foreground.moveTo(0, 1280);
    foreground.lineTo(0, 1120);
    foreground.lineTo(140, 1058);
    foreground.lineTo(280, 1132);
    foreground.lineTo(430, 1072);
    foreground.lineTo(600, 1148);
    foreground.lineTo(720, 1096);
    foreground.lineTo(720, 1280);
    foreground.closePath();
    foreground.fillPath();
    foreground.fillStyle(0x0a0f18, 1);
    foreground.fillRect(292, 1120, 136, 76);
    foreground.fillTriangle(276, 1120, 444, 1120, 360, 1068);
    foreground.fillStyle(0xffb060, 0.65);
    foreground.fillRect(322, 1148, 10, 12);
    foreground.fillRect(388, 1148, 10, 12);
    foreground.fillStyle(0x0a0f18, 1);
    foreground.fillRect(468, 1160, 60, 40);
    foreground.fillTriangle(460, 1160, 536, 1160, 498, 1134);
    layer.add(foreground);

    // 浮尘/灵火
    for (let i = 0; i < 14; i++) {
      const mote = this.add.circle(
        Phaser.Math.Between(40, SCREEN_W - 40),
        Phaser.Math.Between(480, 1180),
        Phaser.Math.FloatBetween(1, 2.6),
        0xffd98a,
        Phaser.Math.FloatBetween(0.2, 0.7),
      );
      layer.add(mote);
      this.tweens.add({
        targets: mote,
        y: mote.y - Phaser.Math.Between(60, 160),
        x: mote.x + Phaser.Math.Between(-30, 30),
        alpha: 0,
        duration: Phaser.Math.Between(4200, 7600),
        delay: Phaser.Math.Between(0, 3000),
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 700, ease: "Sine.easeOut" });
    this.overlay = layer;
  }

  private showGenderPicker() {
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(120);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.97).setOrigin(0, 0).setInteractive());
    layer.add(
      this.add
        .text(360, 200, "选择你的形象", { fontSize: "30px", color: "#ffe6a8", fontFamily: XIAN_FONT })
        .setOrigin(0.5)
        .setLetterSpacing(4),
    );
    layer.add(
      this.add
        .text(360, 248, "踏进灵膳楼之前，先定一个行走江湖的模样", {
          fontSize: "15px",
          color: "#8a7a62",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5),
    );
    for (const x of [180, 540]) {
      layer.add(
        this.add
          .rectangle(x, 510, 176, 276, 0x1a120c, 0.82)
          .setStrokeStyle(2, 0x8a6a3a, 0.7),
      );
      layer.add(
        this.add
          .image(x, 500, "soft-glow")
          .setTint(0xffb060)
          .setAlpha(0.48)
          .setScale(1.35)
          .setBlendMode(Phaser.BlendModes.ADD),
      );
    }
    const male = new Character(this, 180, 500, 0x4a7ab8, 0x2b2b2b, false, "player");
    male.setScale(2.2).disableInteractive();
    const female = new Character(this, 540, 500, 0xc86a9e, 0x4a2b1a, true, "player");
    female.setScale(-2.2, 2.2).disableInteractive();
    layer.add([male, female]);
    layer.add(
      this.add
        .text(180, 622, "少年掌柜", {
          fontSize: "14px",
          color: "#c8b8a0",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5),
    );
    layer.add(
      this.add
        .text(540, 622, "少女掌柜", {
          fontSize: "14px",
          color: "#c8b8a0",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5),
    );

    const pick = (x: number, label: string, gender: "male" | "female", color: string) => {
      const btn = this.add
        .text(x, 700, label, {
          fontSize: "30px",
          color: "#ffe6c8",
          backgroundColor: color,
          padding: { x: 44, y: 18 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          this.setGender(gender);
          this.save();
          this.destroyOverlay();
        });
      layer.add(btn);
      this.expandHitArea(btn, 18);
    };
    pick(180, "男", "male", "#3f5a7a");
    pick(540, "女", "female", "#7a3f5a");
    this.overlay = layer;
  }

  // ===== 存档 =====
  /** 只存经营进度与选择；营业中不落盘——中途刷新等于放弃本局，避免带着收益跳过工资与还账。 */
  private buildSaveData(): SaveData {
    return {
      v: 1,
      coins: this.coins,
      inventory: this.inventory,
      level: this.level,
      stoveLevel: this.stoveLevel,
      signLevel: this.signLevel,
      auto: { ...this.auto },
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
      meta: this.meta,
      dailyGoal: this.dailyGoal,
    };
  }

  private save() {
    if (this.ascending || this.suppressSave || this.gameState === "bankrupt") return;
    if (this.gameState === "open" && !this.settling) return;
    this.writeSave(this.buildSaveData());
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
    const startLevel = getAscensionStartLevel(ascensions);
    return {
      v: 1,
      coins: getAscensionStartCoins(ascensions),
      inventory: getAscensionStartInventory(ascensions),
      level: startLevel,
      stoveLevel: 0,
      signLevel: 0,
      auto: { server: true, cook: true, buyer: true },
      staffLevel: { hawker: 0, server: 0, cook: 0, buyer: 0 },
      staffExp: { hawker: 0, server: 0, cook: 0, buyer: 0 },
      borrowedIds: [],
      activeLoans: [],
      negativeStreak: 0,
      cultivation: 0,
      day: 1,
      ascensions,
      selectedDishIds: DISHES.filter((d) => d.unlockLevel <= startLevel).map((d) => d.id),
      playerGender: this.playerGender,
      meta: this.meta,
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
      this.stoveLevel = count(data.stoveLevel);
      this.signLevel = count(data.signLevel);
      const auto = data.auto;
      this.auto = {
        server: auto?.server !== false,
        cook: auto?.cook !== false,
        buyer: auto?.buyer !== false,
      };
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
      const goal = data.dailyGoal;
      this.dailyGoal =
        goal &&
        (goal.kind === "serve" || goal.kind === "revenue" || goal.kind === "wish") &&
        typeof goal.label === "string" &&
        goal.label.length > 0
          ? {
              kind: goal.kind,
              label: goal.label,
              target: Math.max(1, Math.floor(num(goal.target, 1))),
              rewardCoins: count(goal.rewardCoins),
              rewardCultivation: count(goal.rewardCultivation),
            }
          : null;
      this.displayedCoins = this.coins;
      const meta = data.meta;
      this.meta = meta
        ? {
            days: count(meta.days),
            served: count(meta.served),
            revenue: count(meta.revenue),
            bestRevenue: count(meta.bestRevenue),
            bestServed: count(meta.bestServed),
            goalsMet: count(meta.goalsMet),
            maxRealm: count(meta.maxRealm),
            topDays: (Array.isArray(meta.topDays) ? meta.topDays : [])
              .filter(
                (record) =>
                  record &&
                  Number.isFinite(record.day) &&
                  Number.isFinite(record.level) &&
                  Number.isFinite(record.served) &&
                  Number.isFinite(record.revenue),
              )
              .map((record) => ({
                day: Math.max(1, Math.floor(record.day)),
                level: Math.max(1, Math.floor(record.level)),
                served: Math.max(0, Math.floor(record.served)),
                revenue: Math.max(0, Math.floor(record.revenue)),
              }))
              .sort((a, b) => b.revenue - a.revenue)
              .slice(0, 5),
          }
        : { ...EMPTY_META };
      this.meta.maxRealm = Math.max(this.meta.maxRealm, getRealmIndex(this.cultivation));
      return true;
    } catch {
      return false;
    }
  }

  private spawnStaffChar(role: Exclude<StaffRole, "buyer">) {
    const home = role === "hawker" ? HAWKER_HOME : role === "server" ? SERVER_HOME : COOK_HOME;
    const color = role === "hawker" ? 0x8a6a3a : role === "server" ? 0x3a7a5a : 0x7a4a3a;
    const char = new Character(this, home.x, home.y, color, 0x2b2b2b, false, role);
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
    this.add
      .text(EXTERIOR_X, 583, "灵膳楼", {
        fontSize: "30px",
        color: "#ffe6a8",
        stroke: "#2a1a0a",
        strokeThickness: 2,
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.createSwayLantern(EXTERIOR_X - 165, 600);
    this.createSwayLantern(EXTERIOR_X + 165, 600);
    this.addGlow(EXTERIOR_X - 165, 600, 0xff7a3a, 1.1, 0.5);
    this.addGlow(EXTERIOR_X + 165, 600, 0xff7a3a, 1.1, 0.5);
    this.addGlow(EXTERIOR_X, 760, 0xffb060, 1.2, 0.18);

    // 营业时看的酒楼内部
    this.add.graphics().setDepth(-1).fillStyle(0x140e0a, 1).fillRect(-820, 0, 460, 1400);
    this.interiorGfx = this.add.graphics().setDepth(0);
    this.drawInterior(this.interiorGfx);
    for (const [x, y, tint, scale, alpha] of [
      [-230, 400, 0xffa050, 1.25, 0.45],
      [230, 400, 0xffa050, 1.25, 0.45],
      [-272, 850, 0xff7a3a, 1.7, 0.5],
      [DOOR_X, 890, 0xffb060, 1.35, 0.32],
      [70, 1000, 0xffb060, 1.7, 0.14],
      [700, FLOOR_Y - 64, 0xffb060, 0.8, 0.35],
      [1150, FLOOR_Y - 64, 0xffb060, 0.8, 0.3],
    ] as const) {
      this.addGlow(x, y, tint, scale, alpha);
    }
    this.createCat(142, 826);
    this.add
      .text(0, 212, "灵膳楼", {
        fontSize: "38px",
        color: "#ffe6a8",
        stroke: "#2a1a0a",
        strokeThickness: 4,
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setDepth(2)
      .setLetterSpacing(6);
    this.createSwayLantern(-230, 400);
    this.createSwayLantern(230, 400);

    this.playerChar = new Character(this, PLAYER_HOME.x, PLAYER_HOME.y, 0x4a7ab8, 0x2b2b2b, false, "player");
    this.playerChar.setVisible(false);
    this.playerLabel = this.add
      .text(PLAYER_HOME.x, PLAYER_HOME.y - 120, "掌柜", {
        fontSize: "12px",
        color: "#ffe6a8",
        backgroundColor: "rgba(30,22,15,0.78)",
        padding: { x: 5, y: 2 },
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setDepth(26)
      .setVisible(false);
  }

  /** 酒楼内部（侧视图）：背景墙、地面、左侧厨房灶台、右侧门口、两侧窗户。 */
  private drawInterior(gfx: Phaser.GameObjects.Graphics) {
    gfx.clear();
    // 背景墙：暗木与暖灰泥
    gfx.fillStyle(0x493629, 1);
    gfx.fillRect(-360, 0, 720, FLOOR_Y);
    gfx.fillStyle(0x5a4332, 1);
    gfx.fillRect(-360, 0, 720, 18);
    gfx.fillStyle(0x33251b, 1);
    gfx.fillRect(-360, FLOOR_Y - 20, 720, 20);
    for (const x of [-310, -180, -55, 55, 180, 310]) gfx.fillRect(x - 5, 0, 10, FLOOR_Y);
    gfx.lineStyle(2, 0x5a4434, 0.5);
    for (let y = 130; y < FLOOR_Y - 20; y += 110) gfx.lineBetween(-360, y, 360, y);

    // 山水挂画
    gfx.fillStyle(0x2a1a10, 1);
    gfx.fillRect(-158, 410, 316, 164);
    gfx.fillStyle(0xe8dcc0, 0.95);
    gfx.fillRect(-150, 418, 300, 148);
    gfx.fillStyle(0x5a6a5a, 0.35);
    gfx.fillTriangle(-130, 540, -70, 462, -10, 540);
    gfx.fillTriangle(-60, 545, 20, 476, 100, 545);
    gfx.fillTriangle(40, 548, 110, 500, 170, 548);
    gfx.fillStyle(0x6a7a6a, 0.22);
    gfx.fillEllipse(40, 500, 210, 20);
    gfx.fillStyle(0x8a2a22, 0.9);
    gfx.fillRect(122, 526, 16, 20);
    gfx.lineStyle(2, 0x5a4a32, 1);
    gfx.lineBetween(-150, 410, -130, 432);
    gfx.lineBetween(150, 410, 130, 432);

    // 匾额
    gfx.fillStyle(0x2a1a10, 1);
    gfx.fillRect(-106, 174, 212, 76);
    gfx.fillStyle(0x3a2a1a, 1);
    gfx.fillRect(-100, 180, 200, 66);
    gfx.lineStyle(3, 0xd9b45a, 1);
    gfx.strokeRect(-100, 180, 200, 66);
    gfx.fillStyle(0x8a2a22, 1);
    gfx.fillRect(62, 206, 22, 22);

    // 窗框
    gfx.lineStyle(4, 0x2a1a10, 1);
    gfx.strokeRect(-155, 275, 90, 110);
    gfx.strokeRect(65, 275, 90, 110);

    // 靠墙的置物架与酒坛
    for (const sx of [-330]) {
      gfx.fillStyle(0x3a2a1a, 1);
      gfx.fillRect(sx, 520, 130, 8);
      gfx.fillRect(sx, 640, 130, 8);
      gfx.fillRect(sx, 760, 130, 8);
      gfx.fillStyle(0x2a1d12, 1);
      gfx.fillRect(sx + 4, 520, 6, 250);
      gfx.fillRect(sx + 120, 520, 6, 250);
      const jars = [
        { dx: 30, color: 0x5a7a6a },
        { dx: 62, color: 0xb8742a },
        { dx: 92, color: 0xd8c8a8 },
      ];
      for (const [row, y] of [474, 594, 714].entries()) {
        jars.forEach((jar, j) => {
          const jx = sx + jar.dx + (row % 2) * 6;
          gfx.fillStyle(jar.color, 1);
          gfx.fillEllipse(jx, y + 28, 22, 28);
          gfx.fillStyle(0x2a1a10, 0.8);
          gfx.fillRect(jx - 5, y + 16, 10, 5);
          if (row === 1 && j === 0) {
            gfx.fillStyle(0xd9b45a, 0.8);
            gfx.fillRect(jx - 4, y + 34, 8, 12);
          }
        });
      }
    }

    // 右墙小挂轴，填住窗与门之间的空墙
    gfx.fillStyle(0x2a1a10, 1);
    gfx.fillRect(168, 420, 38, 184);
    gfx.fillStyle(0xe8dcc0, 0.95);
    gfx.fillRect(172, 426, 30, 172);
    gfx.lineStyle(1.5, 0x3a3a32, 0.8);
    for (let i = 0; i < 7; i++) {
      const y = 446 + i * 20;
      gfx.lineBetween(180, y, 194, y);
    }
    gfx.fillStyle(0x8a2a22, 0.9);
    gfx.fillRect(180, 584, 12, 12);

    // 后柜：酒坛、茶壶、算盘，填住中间的空墙
    gfx.fillStyle(0x33230f, 1);
    gfx.fillRect(-200, 830, 400, 14);
    gfx.fillStyle(0x3a2818, 1);
    gfx.fillRect(-200, 844, 400, 96);
    gfx.lineStyle(1.5, 0x8a6a3a, 0.55);
    gfx.strokeRect(-200, 830, 400, 110);
    gfx.lineStyle(2, 0x2a1a10, 0.5);
    for (let x = -150; x < 200; x += 90) gfx.lineBetween(x, 850, x, 938);
    for (const [jx, color] of [
      [-170, 0x5a7a6a],
      [-120, 0xb8742a],
      [-70, 0xd8c8a8],
      [120, 0x6a7a9a],
      [170, 0xb8742a],
    ] as const) {
      gfx.fillStyle(color, 1);
      gfx.fillEllipse(jx, 818, 22, 26);
      gfx.fillStyle(0x2a1a10, 0.85);
      gfx.fillRect(jx - 5, 806, 10, 5);
    }
    gfx.fillStyle(0x6a4a2a, 1);
    gfx.fillCircle(-20, 814, 9);
    gfx.fillRect(-34, 814, 14, 4);
    gfx.lineStyle(2, 0x9a7a4a, 0.8);
    gfx.lineBetween(-4, 812, 8, 802);

    // 悬着的木牌菜单
    for (const [bx, by] of [
      [-110, 608],
      [0, 620],
      [110, 608],
    ] as const) {
      gfx.lineStyle(1.5, 0x8a6a4a, 0.8);
      gfx.lineBetween(bx, 590, bx - 22, by);
      gfx.lineBetween(bx, 590, bx + 22, by);
      gfx.fillStyle(0x2a1a10, 1);
      gfx.fillRect(bx - 30, by, 60, 78);
      gfx.fillStyle(0x3a2818, 1);
      gfx.fillRect(bx - 26, by + 4, 52, 70);
      gfx.lineStyle(2, 0xd9b45a, 0.55);
      gfx.strokeRect(bx - 26, by + 4, 52, 70);
      gfx.lineStyle(2, 0xe8dcc0, 0.45);
      for (let i = 0; i < 3; i++) gfx.lineBetween(bx - 12 + i * 12, by + 20, bx - 12 + i * 12, by + 58);
    }

    // 门侧木柱，收住室内外的交界
    gfx.fillStyle(0x2a1a10, 1);
    gfx.fillRect(344, 0, 24, FLOOR_Y);

    // 地面
    gfx.fillStyle(0x8a6a4a, 1);
    gfx.fillRect(-360, FLOOR_Y, 720, 1400 - FLOOR_Y);
    gfx.lineStyle(3, 0x5a4028, 1);
    gfx.lineBetween(-360, FLOOR_Y, 360, FLOOR_Y);
    gfx.lineStyle(2, 0x75583c, 0.6);
    for (let y = FLOOR_Y + 34; y < 1400; y += 46) gfx.lineBetween(-360, y, 360, y);
    for (let x = -320; x < 360; x += 96) gfx.lineBetween(x, FLOOR_Y, x, 1400);

    // 左侧厨房：石灶、铁锅、火与挂着的炊具
    gfx.fillStyle(0xff9a3a, 0.14);
    gfx.fillCircle(-272, 850, 84);
    gfx.fillStyle(0x7a7268, 1);
    gfx.fillRect(-345, 880, 150, 130);
    gfx.fillStyle(0x5f5850, 1);
    gfx.fillRect(-335, 860, 130, 30);
    gfx.fillStyle(0x8a8276, 0.7);
    for (let i = 0; i < 5; i++) gfx.fillRect(-335 + i * 28, 1000, 24, 6);
    gfx.fillStyle(0x4a4a4a, 1);
    gfx.fillRect(-305, 840, 70, 24);
    gfx.fillStyle(0xff7a3a, 0.95);
    gfx.fillCircle(-290, 852, 9);
    gfx.fillCircle(-255, 852, 9);
    if (this.stoveLevel >= 1) {
      gfx.fillStyle(0xffc060, 0.9);
      gfx.fillCircle(-280, 846, 6);
      gfx.fillCircle(-265, 850, 5);
    }
    if (this.stoveLevel >= 2) {
      gfx.fillStyle(0xffe0a0, 0.9);
      gfx.fillCircle(-300, 848, 4);
    }
    gfx.fillStyle(0x3a2a1a, 1);
    gfx.fillRect(-350, 700, 4, 26);
    gfx.lineStyle(3, 0x8a8276, 1);
    gfx.lineBetween(-350, 700, -312, 700);
    gfx.lineBetween(-312, 700, -312, 726);
    gfx.fillStyle(0x6a6a6a, 1);
    gfx.fillCircle(-312, 730, 6);

    // 右侧门口：门框、红帘与暖光
    gfx.fillStyle(0x3a2418, 1);
    gfx.fillRect(DOOR_X - 102, 782, 204, 38);
    gfx.fillStyle(0x2a1a10, 1);
    gfx.fillRect(DOOR_X - 88, 820, 176, FLOOR_Y - 820);
    gfx.fillStyle(0x6a4a2a, 1);
    gfx.fillRect(DOOR_X - 8, 820, 16, FLOOR_Y - 820);
    for (let i = 0; i < 4; i++) {
      gfx.fillStyle(i % 2 ? 0x8b2f22 : 0xa03a2a, 0.95);
      gfx.fillRect(DOOR_X - 80 + i * 40, 820, 34, 44);
    }
    gfx.fillStyle(0xffc86a, 0.08);
    gfx.beginPath();
    gfx.moveTo(DOOR_X - 70, FLOOR_Y);
    gfx.lineTo(DOOR_X + 70, FLOOR_Y);
    gfx.lineTo(300, 1220);
    gfx.lineTo(90, 1220);
    gfx.closePath();
    gfx.fillPath();
    // 门外地面延伸
    gfx.fillStyle(0x6a5a44, 1);
    gfx.fillRect(DOOR_X + 80, FLOOR_Y, 360 - DOOR_X - 80, 1400 - FLOOR_Y);

    // 门外空地：一路延伸到队尾，镜头可以拉过去看
    gfx.fillStyle(0x7a6a4a, 1);
    gfx.fillRect(360, FLOOR_Y, 1260, 1400 - FLOOR_Y);
    gfx.lineStyle(3, 0x5a4028, 1);
    gfx.lineBetween(360, FLOOR_Y, 1620, FLOOR_Y);
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
    // 远处的树与石，让长队不落在空白里
    gfx.fillStyle(0x4a3420, 1);
    gfx.fillRect(1010, FLOOR_Y - 66, 12, 66);
    gfx.fillStyle(0x356335, 1);
    gfx.fillCircle(1016, FLOOR_Y - 86, 38);
    gfx.fillStyle(0x2f5a2f, 1);
    gfx.fillCircle(1016, FLOOR_Y - 102, 25);
    gfx.fillStyle(0x8a8a8a, 1);
    gfx.fillCircle(1120, FLOOR_Y - 12, 17);
    gfx.fillCircle(1180, FLOOR_Y - 7, 11);
    gfx.fillStyle(0x4a3420, 1);
    gfx.fillRect(1424, FLOOR_Y - 56, 10, 56);
    gfx.fillStyle(0x356335, 1);
    gfx.fillCircle(1429, FLOOR_Y - 72, 32);
    gfx.fillStyle(0x8a8a8a, 1);
    gfx.fillCircle(1520, FLOOR_Y - 9, 14);
    gfx.fillCircle(1570, FLOOR_Y - 5, 9);
    // 门右侧竹丛：挡住门外右侧的硬天空
    for (const [bx, top] of [
      [404, 720],
      [426, 690],
      [450, 750],
    ] as const) {
      gfx.fillStyle(0x2f4a2f, 1);
      gfx.fillRect(bx, top, 5, FLOOR_Y - top);
      gfx.fillStyle(0x356335, 0.95);
      gfx.fillCircle(bx + 4, top + 10, 16);
      gfx.fillCircle(bx - 8, top + 46, 13);
      gfx.fillCircle(bx + 16, top + 74, 11);
    }

    // 门外长队旁的木栅栏、石灯笼与远处屋脊
    for (let x = 660; x <= 1600; x += 84) {
      gfx.fillStyle(0x4a3420, 1);
      gfx.fillRect(x, FLOOR_Y - 54, 6, 54);
    }
    gfx.fillRect(650, FLOOR_Y - 46, 960, 5);
    gfx.fillRect(650, FLOOR_Y - 22, 960, 5);
    for (const lx of [700, 1150, 1500]) {
      gfx.fillStyle(0x6a665e, 1);
      gfx.fillRect(lx - 12, FLOOR_Y - 18, 24, 18);
      gfx.fillRect(lx - 6, FLOOR_Y - 58, 12, 42);
      gfx.fillStyle(0xffd98a, 0.9);
      gfx.fillRect(lx - 9, FLOOR_Y - 70, 18, 14);
      gfx.fillStyle(0x55524c, 1);
      gfx.fillTriangle(lx - 16, FLOOR_Y - 70, lx + 16, FLOOR_Y - 70, lx, FLOOR_Y - 84);
    }
    for (const [hx, hw] of [
      [820, 120],
      [1090, 90],
      [1380, 130],
    ] as const) {
      gfx.fillStyle(0x1a2430, 0.9);
      gfx.fillRect(hx - hw / 2, FLOOR_Y - 96, hw, 56);
      gfx.fillTriangle(hx - hw / 2 - 16, FLOOR_Y - 96, hx + hw / 2 + 16, FLOOR_Y - 96, hx, FLOOR_Y - 132);
      gfx.fillStyle(0xffd98a, 0.55);
      gfx.fillRect(hx - 6, FLOOR_Y - 82, 8, 10);
    }
    // 低处雾带：把远处山影和近处棕金内景揉在一起
    gfx.fillStyle(0xc8d8e8, 0.06);
    for (const [mx, my, mw] of [
      [520, 930, 300],
      [820, 916, 340],
      [1180, 934, 300],
      [1450, 922, 260],
    ] as const) {
      gfx.fillEllipse(mx, my, mw, 42);
    }

    // 排队区标记
    gfx.lineStyle(2, 0x8a7a5a, 1);
    gfx.lineBetween(380, FLOOR_Y - 2, 1200, FLOOR_Y - 2);

    // 等级陈设：升级后回到店里能看见变化
    if (this.level >= 2) {
      gfx.fillStyle(0x8a2a22, 0.95);
      gfx.fillRect(160, 300, 50, 112);
      gfx.fillStyle(0xd9b45a, 0.9);
      gfx.fillRect(160, 300, 50, 6);
      gfx.fillRect(160, 406, 50, 6);
      gfx.lineStyle(3, 0xe8b06a, 0.75);
      gfx.lineBetween(185, 320, 185, 386);
      gfx.lineBetween(175, 334, 195, 334);
      gfx.lineBetween(175, 356, 195, 356);
    }
    if (this.level >= 3) {
      gfx.lineStyle(2, 0xd9b45a, 0.45);
      gfx.lineBetween(-200, 760, 200, 760);
      gfx.lineBetween(-200, 762, 200, 762);
    }
    if (this.level >= 4) {
      gfx.fillStyle(0x6a4a2a, 1);
      gfx.fillRect(-188, 806, 26, 24);
      gfx.fillStyle(0x3a6a3a, 1);
      gfx.fillCircle(-175, 790, 16);
      gfx.fillCircle(-162, 778, 12);
    }
    if (this.level >= 2) {
      for (const lx of [-110, 110]) {
        gfx.fillStyle(0xff7a3a, 0.16);
        gfx.fillCircle(lx, 348, 28);
        gfx.fillStyle(0x6a4a2a, 1);
        gfx.fillRect(lx - 1, 320, 2, 18);
        gfx.fillStyle(0xff5c3c, 1);
        gfx.fillEllipse(lx, 348, 18, 26);
        gfx.fillStyle(0xffd98a, 0.9);
        gfx.fillRect(lx - 1, 360, 2, 9);
      }
    }
    if (this.level >= 8) {
      gfx.fillStyle(0x6a2a22, 0.5);
      gfx.fillRoundedRect(-250, 1000, 470, 34, 8);
      gfx.lineStyle(2, 0xd9b45a, 0.45);
      gfx.strokeRoundedRect(-250, 1000, 470, 34, 8);
    }
  }

  /** 夜空星子：只在打烊夜景与深夜里出现，缓慢明灭。 */
  private buildStars() {
    for (let i = 0; i < 46; i++) {
      const star = this.add
        .circle(
          Phaser.Math.Between(0, SCREEN_W),
          Phaser.Math.Between(0, 980),
          Phaser.Math.FloatBetween(0.7, 1.8),
          0xffffff,
          Phaser.Math.FloatBetween(0.2, 0.7),
        )
        .setScrollFactor(0)
        .setDepth(-19);
      this.stars.push(star);
      this.tweens.add({
        targets: star,
        alpha: 0.1,
        duration: Phaser.Math.Between(1400, 3200),
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(0, 2200),
        ease: "Sine.easeInOut",
      });
    }
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

  /** 柜台上打盹的小猫：给静态场景一个会动的小生命。 */
  private createCat(x: number, y: number) {
    const cat = this.add.container(x, y).setDepth(5);
    cat.add(this.add.ellipse(0, 0, 28, 14, 0x3a3a44));
    cat.add(this.add.circle(10, -8, 8, 0x3a3a44));
    cat.add(this.add.triangle(6, -15, -3, 0, 3, 0, 0, -5, 0x3a3a44));
    cat.add(this.add.triangle(14, -15, -3, 0, 3, 0, 0, -5, 0x3a3a44));
    cat.add(this.add.circle(8, -9, 1, 0xffd98a));
    cat.add(this.add.circle(12, -9, 1, 0xffd98a));
    const tail = this.add.rectangle(16, 2, 3, 15, 0x3a3a44).setOrigin(0.5, 1).setAngle(-28);
    cat.add(tail);
    this.tweens.add({
      targets: tail,
      angle: -6,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  /** 暖光光斑：灯笼、灶火、门口的光落在地面和墙上。 */
  private addGlow(x: number, y: number, tint: number, scale: number, alpha: number, depth = 4) {
    this.add
      .image(x, y, "soft-glow")
      .setTint(tint)
      .setAlpha(alpha)
      .setScale(scale)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(depth);
  }

  /** 门前灯笼：暖光、灯身、流苏，轻微摆动。 */
  private createSwayLantern(x: number, y: number) {
    const lantern = this.add.container(x, y).setDepth(3);
    lantern.add(this.add.rectangle(0, -28, 2, 24, 0x2a1a10));
    lantern.add(this.add.circle(0, 0, 34, 0xff7a3a, 0.12));
    lantern.add(this.add.ellipse(0, 0, 24, 34, 0xff5c3c));
    lantern.add(this.add.rectangle(0, -18, 15, 4, 0x2a1a10));
    lantern.add(this.add.rectangle(0, 18, 15, 4, 0x2a1a10));
    lantern.add(this.add.rectangle(0, 26, 2, 10, 0xd9b45a));
    lantern.add(this.add.circle(0, 32, 2.5, 0xd9b45a));
    this.tweens.add({
      targets: lantern,
      angle: Phaser.Math.Between(3, 5) * (Math.random() < 0.5 ? -1 : 1),
      duration: Phaser.Math.Between(2400, 3400),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      delay: Phaser.Math.Between(0, 800),
    });
  }

  /** 窗棂盖在会随天色变色的窗玻璃上，避免白天只剩一块刺眼的蓝方块。 */
  private buildWindowFrames() {
    const g = this.add.graphics().setDepth(2);
    for (const wx of [-155, 65]) {
      g.fillStyle(0xffcf7a, 0.12);
      g.fillRect(wx, 275, 90, 110);
      // 窗中远山、云与一点星/灯，别只留一块平色玻璃
      g.fillStyle(0x2a4a6a, 0.35);
      g.fillTriangle(wx, 380, wx + 26, 338, wx + 52, 380);
      g.fillTriangle(wx + 30, 382, wx + 62, 348, wx + 90, 382);
      g.fillStyle(0xffffff, 0.13);
      g.fillEllipse(wx + 46, 306, 38, 8);
      g.fillEllipse(wx + 24, 318, 26, 6);
      g.fillStyle(0xffe6a8, 0.35);
      g.fillCircle(wx + 72, 292, 1.6);
      g.fillStyle(0xffcf7a, 0.2);
      g.fillCircle(wx + 20, 296, 1.2);
      g.lineStyle(5, 0x2a1a10, 1);
      g.strokeRect(wx, 275, 90, 110);
      g.lineStyle(2, 0x2a1a10, 0.85);
      g.lineBetween(wx + 30, 275, wx + 30, 385);
      g.lineBetween(wx + 60, 275, wx + 60, 385);
      g.lineBetween(wx, 312, wx + 90, 312);
      g.lineBetween(wx, 348, wx + 90, 348);
      g.fillStyle(0x2a1a10, 1);
      g.fillRect(wx - 7, 383, 104, 7);
    }
  }

  /** 程序合成酒楼：屋檐、墙体、门窗、灯笼、招牌。夜晚时窗内透出灯火。 */
  private drawTavern(gfx: Phaser.GameObjects.Graphics, lit: boolean) {
    gfx.clear();
    const half = TAVERN_W / 2;
    const baseY = 1120;

    // 远景山影与地面：让打烊视角不再悬在空里
    gfx.fillStyle(0x2a3448, 0.75);
    gfx.fillTriangle(-780, baseY, -610, 790, -430, baseY);
    gfx.fillTriangle(-560, baseY, -410, 900, -250, baseY);
    gfx.fillStyle(0x2f3a2a, 1);
    gfx.fillRect(-960, baseY, 1020, 1280 - baseY);
    // 门前石径
    gfx.fillStyle(0x4a4438, 1);
    gfx.fillPoints(
      [
        new Phaser.Geom.Point(-110, baseY),
        new Phaser.Geom.Point(40, baseY),
        new Phaser.Geom.Point(-240, 1280),
        new Phaser.Geom.Point(-760, 1280),
      ],
      true,
    );
    gfx.fillStyle(0x5a5448, 1);
    for (const [x, y, r] of [
      [-560, 1200, 12],
      [-390, 1240, 9],
      [-220, 1180, 7],
      [-650, 1170, 8],
      [-470, 1150, 5],
    ]) {
      gfx.fillCircle(x, y, r);
    }
    // 竹丛
    gfx.fillStyle(0x2f5a2f, 1);
    gfx.fillRect(-282, 880, 8, 240);
    gfx.fillRect(-264, 930, 7, 190);
    gfx.fillRect(-300, 970, 6, 150);
    gfx.fillStyle(0x3a6a3a, 1);
    gfx.fillCircle(-278, 880, 24);
    gfx.fillCircle(-257, 930, 19);
    gfx.fillCircle(-294, 972, 15);
    // 低处薄雾
    gfx.fillStyle(0xa8c0d8, 0.08);
    gfx.fillEllipse(-420, 1112, 420, 40);
    gfx.fillEllipse(-120, 1100, 300, 30);

    // 墙体与石基
    gfx.fillStyle(0x4a3627, 1);
    gfx.fillRect(-half - 8, 520, TAVERN_W + 16, baseY - 520);
    gfx.fillStyle(0x6b4a32, 1);
    gfx.fillRect(-half + 10, 538, TAVERN_W - 20, baseY - 556);
    gfx.fillStyle(0x3f3c36, 1);
    gfx.fillRect(-half - 12, baseY - 40, TAVERN_W + 24, 40);
    // 木柱与横梁
    gfx.fillStyle(0x3a2618, 1);
    for (const x of [-half + 10, -half / 2, half / 2, half - 10]) gfx.fillRect(x - 6, 520, 12, baseY - 548);
    gfx.fillRect(-half, 812, TAVERN_W, 14);
    gfx.fillRect(-half, 552, TAVERN_W, 10);

    // 屋檐：翘角、瓦线、脊饰
    gfx.fillStyle(0x2a0f0c, 1);
    gfx.fillTriangle(-half - 96, 548, half + 96, 548, 0, 362);
    gfx.fillStyle(0x7a2a1e, 1);
    gfx.fillTriangle(-half - 64, 540, half + 64, 540, 0, 386);
    gfx.fillStyle(0x5c1d16, 1);
    gfx.fillTriangle(-half - 96, 548, -half - 20, 548, -half - 126, 500);
    gfx.fillTriangle(half + 96, 548, half + 20, 548, half + 126, 500);
    gfx.lineStyle(2, 0x2a0f0c, 0.55);
    for (let i = -4; i <= 4; i++) gfx.lineBetween(0, 388, i * 44, 540);
    gfx.lineStyle(3, 0xd9b45a, 0.7);
    gfx.lineBetween(-half - 96, 548, half + 96, 548);
    gfx.fillStyle(0xd9b45a, 1);
    gfx.fillCircle(0, 386, 5);

    // 招牌木底与金边
    gfx.fillStyle(0x2a1a10, 1);
    gfx.fillRect(-86, 556, 172, 54);
    gfx.lineStyle(3, 0xd9b45a, 1);
    gfx.strokeRect(-86, 556, 172, 54);

    // 窗棂：营业时透出暖灯
    for (const wx of [-155, 85]) {
      gfx.fillStyle(lit ? 0xffcf7a : 0x2a2520, 1);
      gfx.fillRect(wx, 660, 70, 80);
      gfx.lineStyle(4, 0x3a2418, 1);
      gfx.strokeRect(wx, 660, 70, 80);
      gfx.lineStyle(2, 0x3a2418, 0.8);
      gfx.lineBetween(wx + 23, 660, wx + 23, 740);
      gfx.lineBetween(wx + 47, 660, wx + 47, 740);
      gfx.lineBetween(wx, 687, wx + 70, 687);
      gfx.lineBetween(wx, 713, wx + 70, 713);
    }

    // 门框、门帘与暖光
    gfx.fillStyle(0x33200f, 1);
    gfx.fillRect(-64, 890, 128, 230);
    gfx.fillStyle(lit ? 0xffc86a : 0x2a211a, 1);
    gfx.fillRect(-55, 900, 110, 220);
    gfx.fillStyle(0x8b2f22, 0.95);
    for (const dx of [-50, -25, 0, 25, 50]) gfx.fillRect(dx - 10, 900, 20, 34);
    gfx.fillStyle(0x2a1a10, 1);
    gfx.fillRect(-2, 934, 4, 186);
    if (lit) {
      gfx.fillStyle(0xffb85a, 0.12);
      gfx.beginPath();
      gfx.moveTo(-60, baseY);
      gfx.lineTo(60, baseY);
      gfx.lineTo(180, 1240);
      gfx.lineTo(-180, 1240);
      gfx.closePath();
      gfx.fillPath();
    }

    // 灯笼暖光（灯身是单独的摆动对象）
    gfx.fillStyle(0xff7a3a, lit ? 0.16 : 0.05);
    gfx.fillCircle(-165, 610, 42);
    gfx.fillCircle(165, 610, 42);

    // 台阶与苔痕
    gfx.fillStyle(0x6a665e, 1);
    gfx.fillRect(-96, baseY, 192, 22);
    gfx.fillStyle(0x4f4b44, 1);
    gfx.fillRect(-108, baseY + 22, 216, 12);
    gfx.fillStyle(0x2f4a2f, 0.7);
    gfx.fillEllipse(-130, baseY + 6, 36, 8);
    gfx.fillEllipse(140, baseY + 10, 28, 6);

    // 门面招幡：升级后多一面旗
    if (this.signLevel >= 1) {
      gfx.fillStyle(0x8b2f22, 0.95);
      gfx.fillRect(160, 610, 36, 260);
      gfx.fillStyle(0xd9b45a, 0.9);
      gfx.fillRect(160, 610, 36, 8);
      gfx.fillRect(160, 860, 36, 8);
      gfx.lineStyle(3, 0xe8b06a, 0.75);
      gfx.lineBetween(178, 640, 178, 830);
      gfx.lineBetween(168, 664, 188, 664);
      gfx.lineBetween(168, 694, 188, 694);
    }
    if (this.signLevel >= 2) {
      gfx.fillStyle(0x7a2a1e, 0.95);
      gfx.fillRect(-198, 650, 30, 210);
      gfx.fillStyle(0xd9b45a, 0.85);
      gfx.fillRect(-198, 650, 30, 7);
      gfx.fillRect(-198, 852, 30, 7);
    }
  }

  // ===== 屏幕固定层（天空/地面/日月/UI）=====
  private buildUi() {
    this.skyRect = this.add
.rectangle(0, 0, SCREEN_W, SCREEN_H, NIGHT_COLOR)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-20);

    // 远景：三层水墨山、山门、漂云。固定在屏幕上，给窗口外留出纵深。
    const backdrop = this.add.graphics().setScrollFactor(0).setDepth(-18);
    backdrop.fillStyle(0x1a2a40, 0.5);
    for (const [x1, px, x2] of [
      [-100, 720, 160],
      [80, 780, 340],
      [260, 690, 520],
      [440, 750, 700],
      [600, 700, 860],
    ] as const) {
      backdrop.fillTriangle(x1, 1040, px, 690, x2, 1040);
    }
    backdrop.fillStyle(0x121d2a, 0.8);
    for (const [x1, px, x2] of [
      [-140, 880, 200],
      [120, 930, 430],
      [360, 860, 660],
      [560, 920, 860],
    ] as const) {
      backdrop.fillTriangle(x1, 1100, px, 850, x2, 1100);
    }
    // 远山山门
    backdrop.fillStyle(0x0d1620, 0.95);
    backdrop.fillRect(174, 900, 52, 10);
    backdrop.fillTriangle(160, 900, 240, 900, 200, 872);
    backdrop.fillRect(188, 910, 24, 16);
    backdrop.fillStyle(0xffd98a, 0.55);
    backdrop.fillRect(197, 914, 5, 8);
    for (const [x, y, w, a] of [
      [150, 300, 300, 0.035],
      [480, 420, 380, 0.03],
      [280, 540, 260, 0.025],
    ] as const) {
      const cloud = this.add
        .ellipse(x, y, w, 26, 0xdfe9f5, a)
        .setScrollFactor(0)
        .setDepth(-17);
      this.tweens.add({
        targets: cloud,
        x: x + 70,
        duration: Phaser.Math.Between(22000, 34000),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    this.sunMoon = this.add.circle(0, 0, 34, 0xffe8a0).setScrollFactor(0).setDepth(-15);
    this.moonHalo = this.add.circle(0, 0, 82, 0xffe8b0, 0.07).setScrollFactor(0).setDepth(-16);
    this.moonShadow = this.add.circle(0, 0, 30, NIGHT_COLOR).setScrollFactor(0).setDepth(-14);
    this.buildStars();
    this.buildWindows();
    this.buildWindowFrames();

    // 顶部 HUD 悬浮条
    this.hudBar = this.add
      .rectangle(0, 0, SCREEN_W, STATUS_BAR_H, 0x000000, 0.72)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(30);
    this.hudBar.setVisible(true);
    this.hudLine = this.add
      .rectangle(0, STATUS_BAR_H - 2, SCREEN_W, 2, 0xd9b45a, 0.35)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(30.5);

    this.coinsText = this.addUiText(24, 10, "", "22px", "#7fe8dd");
    this.inventoryText = this.addUiText(200, 10, "", "22px", "#9fe870");
    this.levelText = this.addUiText(400, 10, "", "18px", "#87ceeb");
    this.queueText = this.addUiText(24, 38, "", "20px", "#e0b0ff");
    this.realmText = this.addUiText(400, 10, "", "18px", "#ffd98a");
    this.cultivationText = this.addUiText(230, 38, "", "18px", "#d8c8ff");
    this.goalText = this.addUiText(410, 38, "", "20px", "#9fdf6a");
    this.goalText.setWordWrapWidth(280);
    this.sessionText = this.addUiText(24, 64, "", "18px", "#a8d8ff");
    this.chronicleText = this.addUiText(24, 88, "", "19px", "#cccccc");
    [this.coinsText, this.inventoryText, this.queueText, this.realmText, this.cultivationText, this.goalText].forEach(
      (text) => text.setStyle({ fontStyle: "bold" }),
    );
    this.tutorialBanner = this.add
      .text(360, 1140, "", {
        fontSize: "18px",
        color: "#ffe6c8",
        backgroundColor: "rgba(30,22,15,0.92)",
        padding: { x: 14, y: 7 },
        align: "center",
        wordWrap: { width: 640 },
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(32)
      .setVisible(false);
    this.levelText.setVisible(false);

    const audio = loadAudioSettings();
    this.sfxMuted = audio.sfxMuted;
    this.bgmMuted = audio.bgmMuted;
    this.sfxButton = this.addUiButton(
      580,
      8,
      () => {
        this.sfxMuted = !this.sfxMuted;
        setSfxMuted(this.sfxMuted);
        this.refreshAudioButtons();
      },
      { x: 8, y: 4 },
      0,
    );
    this.bgmButton = this.addUiButton(
      580,
      36,
      () => {
        this.bgmMuted = !this.bgmMuted;
        setBgmMuted(this.bgmMuted);
        this.refreshAudioButtons();
      },
      { x: 8, y: 4 },
      0,
    );
    this.refreshAudioButtons();

    // 营业中操作按钮：与采购/打烊同处底部操作区
    this.serveButton = this.addUiButton(346, 1186, () => this.startSeat("player"), { x: 14, y: 28 }, 6, "20px");
    this.cookButton = this.addUiButton(460, 1186, () => this.manualCook(), { x: 14, y: 28 }, 6, "20px");
    this.serveButton.setBackgroundColor("#35543a");
    this.cookButton.setBackgroundColor("#5a3a1c");
    // 出菜行：点哪道菜就做哪道，优先端给想吃它的那一桌
    this.dishChipLabel = this.addUiText(16, 1004, "出菜 · 点菜名", "18px", "#e0c9a0");
    this.dishChips = DISHES.map((_, i) =>
      this.addUiButton(
        56 + (i % 4) * 150,
        1042 + Math.floor(i / 4) * 68,
        () => {
          const dish = this.getMenuDishes()[i];
          if (dish) this.manualCookDish(dish);
        },
        { x: 8, y: 22 },
        3,
        "17px",
      ),
    );
    this.dishChips.forEach((chip) => chip.setVisible(false));

    // 通用按钮：底部固定
    this.purchaseButton = new ProgressButton(this, 16, 1186, 200, 80, () => this.startPurchase(), this.registerUi);
    this.startButton = this.addUiButton(222, 1186, () => this.onStartButton(), { x: 12, y: 28 }, 6, "20px");

    // 打烊期的经营按钮：两列四行，保证每格都是可点的大按钮
    this.navPanel = this.add.container(0, 0).setScrollFactor(0).setDepth(30);
    this.navPanel.add(
      this.add
        .rectangle(8, 720, 704, 430, 0x1a120c, 0.72)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x8a6a3a, 0.45),
    );
    this.navPanel.add(
      this.add
        .text(360, 726, "掌柜事务", {
          fontSize: "18px",
          color: "#e0c9a0",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5, 0)
        .setLetterSpacing(4),
    );
    this.navPanel.add(this.add.rectangle(24, 750, 672, 1, 0x8a6a3a, 0.4).setOrigin(0, 0));
    const nav = { x: 12, y: 28 };
    this.staffButton = this.addUiButton(
      180,
      797,
      () => {
        this.staffNotice = "";
        this.buildStaffOverlay();
      },
      nav,
      6,
      "20px",
    ).setOrigin(0.5);
    this.upgradeButton = this.addUiButton(180, 901, () => this.buildBuildOverlay(), nav, 6, "20px").setOrigin(0.5);
    this.genderButton = this.addUiButton(180, 1005, () => this.toggleGender(), nav, 6, "20px").setOrigin(0.5);
    this.bankButton = this.addUiButton(180, 1109, () => this.buildBankOverlay(), nav, 6, "20px").setOrigin(0.5);
    this.cultivationButton = this.addUiButton(540, 797, () => this.buildCultivationOverlay(), nav, 6, "20px").setOrigin(0.5);
    this.helpButton = this.addUiButton(540, 901, () => this.showHelp(), nav, 6, "20px").setOrigin(0.5);
    this.recordButton = this.addUiButton(540, 1005, () => this.buildRecordOverlay(), nav, 6, "20px").setOrigin(0.5);
    this.saveButton = this.addUiButton(540, 1109, () => this.openSaveDialog("export"), nav, 6, "20px").setOrigin(0.5);

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

  /** 给手写的文本按钮加一圈可点余量，避免只点中文字本身。 */
  private expandHitArea(t: Phaser.GameObjects.Text, expand = 10) {
    // 已经 setInteractive 过的文本再传新的形状不会替换旧命中区，直接改 input.hitArea。
    if (t.input) {
      t.input.hitArea.setTo(-expand, -expand, t.width + expand * 2, t.height + expand * 2);
      t.input.cursor = "pointer";
      return;
    }
    t.setInteractive(
      new Phaser.Geom.Rectangle(-expand, -expand, t.width + expand * 2, t.height + expand * 2),
      Phaser.Geom.Rectangle.Contains,
    );
  }

  /** 副屏底部的大号关闭条：不再要求点中小字「关闭」。 */
  private addOverlayClose(layer: Phaser.GameObjects.Container, y: number, label = "关闭") {
    layer.add(
      this.add
        .rectangle(40, y, 640, 80, 0x33251b)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x8a6a3a)
        .setInteractive({ useHandCursor: true })
        .on("pointerup", () => this.destroyOverlay()),
    );
    layer.add(
      this.add.text(360, y + 40, label, { fontSize: "22px", color: "#f5e6c8" }).setOrigin(0.5),
    );
  }

  private addUiButton(
    x: number,
    y: number,
    onClick: () => void,
    padding: { x: number; y: number } = { x: 10, y: 8 },
    expand = 6,
    fontSize = "15px",
  ): TapText {
    let sx = 0;
    let sy = 0;
    const t = this.add
      .text(x, y, "", {
        fontSize,
        color: "#f5e6c8",
        backgroundColor: "#2e2119",
        padding,
      })
      .setDepth(31)
      .setScrollFactor(0) as TapText;
    // 关键：创建时文字还是空的，必须在每次 setText 后重算可点区域；
    // 否则视觉背景很大、实际只能点中最初那几个像素。
    const syncHit = () => {
      if (!t.input) return;
      t.input.hitArea.setTo(-expand, -expand, t.width + expand * 2, t.height + expand * 2);
    };
    t.setInteractive(new Phaser.Geom.Rectangle(-expand, -expand, 1, 1), Phaser.Geom.Rectangle.Contains);
    if (t.input) t.input.cursor = "pointer";
    const setText = t.setText.bind(t);
    t.setText = ((value: string | string[]) => {
      setText(value);
      syncHit();
      return t;
    }) as typeof t.setText;
    const setVisible = t.setVisible.bind(t);
    t.setVisible = ((visible: boolean) => {
      setVisible(visible);
      if (t.input) t.input.enabled = visible;
      return t;
    }) as typeof t.setVisible;
    t.on("pointerdown", (p: Phaser.Input.Pointer) => {
      sx = p.x;
      sy = p.y;
    }).on("pointerup", (p: Phaser.Input.Pointer) => {
      if (Math.hypot(p.x - sx, p.y - sy) < 12) {
        playSfx("click");
        t.onTap();
      }
    });
    t.onTap = onClick;
    syncHit();
    return t;
  }

  private buildBoothVisuals() {
    this.booths.forEach((_, i) => this.addBoothVisual(i));
  }

  private addBoothVisual(_i: number) {
    const bg = this.add.rectangle(0, 0, 80, 16, 0x6a4a2a).setDepth(2).setStrokeStyle(2, 0x8a6a4a);
    const runner = this.add.rectangle(0, 0, 60, 6, 0x8a2a22).setDepth(2.5).setStrokeStyle(1, 0xd9b45a, 0.7);
    const number = this.add
      .text(0, 0, "", {
        fontSize: "13px",
        color: "#e0c9a0",
        stroke: "#1a120a",
        strokeThickness: 3,
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setDepth(3);
    const legs = [
      this.add.rectangle(0, 0, 7, 32, 0x4a3420).setDepth(1),
      this.add.rectangle(0, 0, 7, 32, 0x4a3420).setDepth(1),
    ];
    const label = this.add
      .text(0, 0, "", {
        fontSize: "15px",
        color: "#ffe6c8",
        stroke: "#1a120a",
        strokeThickness: 3,
        padding: { x: 2, y: 1 },
        align: "center",
        lineSpacing: 1,
        wordWrap: { width: 130 },
      })
      .setOrigin(0.5, 1)
      .setDepth(3);
    const barBg = this.add.rectangle(0, 0, 80, 8, 0x1a1a1a).setOrigin(0, 0.5).setDepth(3);
    const barFill = this.add.rectangle(0, 0, 0, 8, COLOR_PLAYER).setOrigin(0, 0.5).setDepth(4);
    const visible = this.gameState === "open";
    [bg, runner, number, label, ...legs, barBg, barFill].forEach((o) => o.setVisible(visible));
    this.boothVisuals.push({ bg, runner, number, label, legs, barBg, barFill });
    this.relayoutTables();
  }

  /** 桌子在同一地面上横向均分，数量越多越窄。 */
  private relayoutTables() {
    const total = Math.max(this.booths.length, 1);
    const width = Math.min(84, 320 / total);
    this.boothVisuals.forEach((v, i) => {
      const x = total === 1 ? (TABLE_X_MIN + TABLE_X_MAX) / 2 : TABLE_X_MIN + (i * (TABLE_X_MAX - TABLE_X_MIN)) / (total - 1);
      v.bg.setPosition(x, FLOOR_Y - 30).setSize(width, 16);
      v.bg.setStrokeStyle(2, this.level >= 2 ? 0xd9b45a : 0x8a6a4a);
      v.runner
        .setPosition(x, FLOOR_Y - 34)
        .setSize(Math.max(30, width - 14), 5)
        .setVisible(this.gameState === "open" && this.level >= 2);
      v.number
        .setText(TABLE_MARKS[i] ?? `${i + 1}`)
        .setPosition(x, FLOOR_Y - 118)
        .setVisible(this.gameState === "open");
      v.legs[0].setPosition(x - width / 2 + 10, FLOOR_Y - 14);
      v.legs[1].setPosition(x + width / 2 - 10, FLOOR_Y - 14);
      // 桌子多时交错两行放标签，避免相邻两桌的文字叠在一起
      const stagger = total > 4 ? (i % 2) * 46 : 0;
      v.label.setPosition(x, FLOOR_Y - 92 - stagger);
      const barW = Math.max(36, width - 8);
      v.barBg.setPosition(x - barW / 2, FLOOR_Y - 70).setSize(barW, 8);
      v.barFill.setPosition(x - barW / 2, FLOOR_Y - 70);
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
          getRealmArrivalFactor(this.realmIndex()) * getSignArrivalFactor(this.signLevel),
        );
    }

    if (this.eventsThisSession < MAX_EVENTS_PER_SESSION && time >= this.nextEventAt && remaining > LAST_CALL_MS) {
      this.triggerRandomEvent(time);
    }

    this.queue = this.queue.filter((patron) => {
      if (time >= patron.expiresAt) {
        this.sessionLost += 1;
        patron.char.say("等太久了……", "cold");
        patron.char.walkTo(1620, ACTOR_Y, 500, () => patron.char.destroy());
        this.log(`${patron.kind.name}候得不耐，拂袖离去`);
        return false;
      }
      return true;
    });
    this.queue.forEach((patron) => {
      patron.char.setPatience((patron.expiresAt - time) / patron.patienceMs);
    });

    this.playerSeat = this.resolveSeat(this.playerSeat, time, "player");
    this.staffSeat = this.resolveSeat(this.staffSeat, time, "staff");

    this.booths.forEach((booth, index) => {
      if (booth.state === "cooking" && time >= booth.cookDoneAt) {
        playSfx("cook");
        booth.state = "dining";
        booth.departAt = time + DINING_MS;
        booth.patronChar?.setDining(true);
        this.showDiningProp(this.tablePosition(index).x);
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
        const hasWish = booth.patronWish !== null;
        const priceFactor = booth.patronKind?.priceFactor ?? 1;
        const price = dish
          ? getWishPrice(Math.round(this.dishPrice(dish) * priceFactor), matched, hasWish)
          : 0;
        const dishName = dish?.name ?? "菜";
        const guest = booth.patronKind?.name ?? "食客";
        const personal = booth.cookingDriver === "player";
        booth.state = "empty";
        booth.cookingDriver = null;
        booth.currentDish = null;
        booth.patronKind = null;
        booth.patronWish = null;
        booth.awaitingSince = 0;
        const leaver = booth.patronChar;
        booth.patronChar = undefined;
        if (hasWish && !matched) leaver?.say("这不是我想吃的……", "cold");
        leaver?.walkTo(440, ACTOR_Y, 500, () => leaver.destroy());
        playSfx("coin");
        this.showCoinPopup(this.tablePosition(index).x, FLOOR_Y - 120, price);
        this.sessionServed += 1;
        this.sessionRevenue += price;
        if (matched) {
          this.sessionWishes += 1;
          this.showWishReaction(this.tablePosition(index).x, FLOOR_Y - 140);
        }
        this.log(
          matched
            ? `${guest}吃到了想吃的${dishName}，满意离店，收入 +${price} 灵石`
            : hasWish
              ? `${guest}没吃到想吃的${dishName}，只付半价，收入 +${price} 灵石`
              : `${guest}用罢${dishName}离店，收入 +${price} 灵石`,
        );
        const rare = priceFactor >= 1.8;
        const cultGain =
          getCultivationGain(personal) + (personal && matched ? 1 : 0) + (personal && rare ? 1 : 0);
        this.gainCultivation(cultGain);
        if (cultGain > 0) {
          this.showCultivationPopup(this.tablePosition(index).x, FLOOR_Y - 160, cultGain);
        }
      }
    });

    if (this.auto.server && this.staffLevel.server > 0 && !this.staffSeat) this.startSeat("staff");
    if (this.auto.cook && this.staffLevel.cook > 0 && this.staffCookingBooth === null) {
      const menu = this.getMenuDishes();
      const next = menu.length ? menu[this.dishCursor % menu.length] : null;
      // 先确认轮到的菜能在打烊前做完；做不完就直接不接，避免每帧空转
      if (next && this.canFinishBeforeClose(next, "staff")) {
        const index = this.booths.findIndex(
          (booth) => booth.state === "awaitingCook" && time - booth.awaitingSince >= COOK_PRIORITY_MS,
        );
        if (index !== -1) this.startCook(this.booths[index], index, "staff");
      }
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
    if (this.staffLevel.buyer === 0 || !this.auto.buyer) return;
    // 酒楼越大，备货目标越高，避免高等级时 10 份存货撑不过一局
    const target = PURCHASE_TARGET_STOCK + this.level * 2;
    if (this.inventory >= target) return;
    const price = getPurchasePrice(this.staffLevel.buyer, false);
    let bought = 0;
    while (this.inventory < target && this.coins >= price) {
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
    const showStars = this.gameState !== "open" || t > 0.8;
    this.stars.forEach((star) => star.setVisible(showStars));
    // 室内窗户透出的天光与外面同步；打烊时窗户只剩余夜色
    if (this.windowViews.length) {
      let winColor = NIGHT_COLOR;
      if (this.gameState === "open") {
        const sky = Phaser.Display.Color.IntegerToColor(color);
        const warm = Phaser.Display.Color.IntegerToColor(0x8a6a4a);
        const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(sky, warm, 100, 28);
        winColor = Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);
      }
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
    // 夜里给月亮咬出一弯缺口；星空同步淡出
    const isMoon = this.gameState !== "open" || t > 0.82;
    this.moonShadow.setVisible(isMoon);
    this.moonHalo.setVisible(isMoon);
    if (isMoon) {
      this.moonShadow
        .setPosition(this.sunMoon.x + 12, this.sunMoon.y - 8)
        .setRadius(24)
        .setFillStyle(color, 1);
      this.moonHalo.setPosition(this.sunMoon.x, this.sunMoon.y);
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
    if (this.settling || this.transitioning) return;
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
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.97).setOrigin(0, 0).setInteractive());
    layer.add(this.add.text(40, 70, "选择今日菜单", { fontSize: "30px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
    layer.add(
      this.add.text(40, 115, "至少选一道菜才能开张；营业中可按顺序轮转，也可在出菜行指定", {
        fontSize: "16px",
        color: "#999999",
      }),
    );
    const goal = this.currentDayGoal();
    layer.add(
      this.add.text(
        40,
        148,
        `今日目标：${goal.label} · 库存 ${this.inventory} · 赏 ${goal.rewardCoins}灵石+收入15% · ${goal.rewardCultivation}修为`,
        { fontSize: "15px", color: "#e0c060", wordWrap: { width: 640 } },
      ),
    );

    const available = DISHES.filter((d) => d.unlockLevel <= this.level);
    available.forEach((dish, i) => {
      const y = 180 + i * 92;
      const selected = this.selectedDishIds.has(dish.id);
      const row = this.add
        .rectangle(40, y, 640, 76, selected ? 0x4a3a1a : 0x2a1e16)
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
      const fans = getDishFans(dish.id);
      layer.add(
        this.add.text(
          60,
          y + 46,
          `售价 ${this.dishPrice(dish)} 灵石 · 烹饪 ${(dish.cookMs / 1000).toFixed(1)}s${
            fans.length ? ` · ${fans.join("/")}爱吃` : ""
          }`,
          { fontSize: "15px", color: "#cccccc" },
        ),
      );
    });

    if (this.inventory <= 0) {
      layer.add(
        this.add.text(40, 1000, "库存为 0：先点下面「备货」再开张，否则客人来了没菜可做", {
          fontSize: "16px",
          color: "#ff9a8a",
          wordWrap: { width: 640 },
        }),
      );
    }

    const buyPrice = getPurchasePrice(this.staffLevel.buyer, false);
    layer.add(
      this.add
        .text(40, 1056, `备货 +${PURCHASE_AMOUNT}（${buyPrice} 灵石）`, {
          fontSize: "18px",
          color: "#ffffff",
          backgroundColor: "#3a4a5a",
          padding: { x: 14, y: 8 },
        })
        .setInteractive({ useHandCursor: true })
        .on("pointerup", () => {
          playSfx("click");
          this.startPurchase();
          this.buildMenuOverlay();
        }),
    );

    const count = this.getMenuDishes().length;
    const canStart = count > 0 && this.inventory > 0;
    const startLabel = count === 0 ? "至少选一道菜" : this.inventory <= 0 ? "库存为 0，先备货" : `开张大吉（已选 ${count} 道）`;
    const start = this.add.text(40, 1120, startLabel, {
      fontSize: "22px",
      color: canStart ? "#ffffff" : "#777777",
      backgroundColor: canStart ? "#3f7a3f" : "#333333",
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
      .text(420, 1120, "先不打烊，返回", {
        fontSize: "18px",
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

  private startSession() {
    if (this.getMenuDishes().length === 0 || this.inventory <= 0 || this.transitioning) return;
    this.destroyOverlay();
    this.transitioning = true;

    this.cameras.main.fadeOut(450, 0, 0, 0, () => {
      this.gameState = "open";
      this.settling = false;
      this.cameras.main.centerOn(CAMERA_OPEN_X, SCREEN_H / 2);
      this.cameras.main.setZoom(1);
      this.focusTimer?.remove();
      this.focusing = false;
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
        booth.awaitingSince = 0;
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
      this.sessionCultivation = 0;
      this.goalAnnounced = false;
      this.sessionGoal = this.currentDayGoal();
      this.sessionEndsAt = this.time.now + SESSION_DURATION_MS;
      const firstArrival = getArrivalInterval(
        this.level,
        this.staffLevel.hawker,
        Phaser.Math.Between(4000, 7000),
        getRealmArrivalFactor(this.realmIndex()) * getSignArrivalFactor(this.signLevel),
      );
      // 每天开门后第一位客人都在 2.2 秒内到，避免开局长时间空等
      this.nextArrivalAt = this.time.now + Math.min(firstArrival, 2200);
      this.lastCallTriggered = false;
      this.eventsThisSession = 0;
      this.nextEventAt = this.time.now + Phaser.Math.Between(9000, 16000);
      playSfx("open");
      startBgm();
      this.log("开张大吉，今日营业开始");
      this.showDayBanner();

      this.cameras.main.fadeIn(450, 0, 0, 0);
      this.transitioning = false;
    });
  }

  private endSession() {
    const wasFocusing = this.focusing;
    this.focusTimer?.remove();
    this.focusing = false;
    this.focusChar = undefined;
    this.focusCaption?.destroy();
    this.focusCaption = undefined;
    this.setFocusUiHidden(false);
    if (wasFocusing) {
      this.cameras.main.setZoom(1);
      this.cameras.main.centerOn(this.focusReturn.x, this.focusReturn.y);
    }
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
    this.sessionLost += this.queue.length;
    this.queue.forEach((p) => p.char.destroy());
    this.queue = [];
    // 打烊结算：已经在用膳的照常收钱；已下锅但没出餐的退回灵材，避免白白损失
    this.booths.forEach((booth) => {
      const dish = booth.currentDish;
      if (dish && booth.state === "dining") {
        const matched = booth.patronWish === dish.id;
        const hasWish = booth.patronWish !== null;
        const factor = booth.patronKind?.priceFactor ?? 1;
        const price = getWishPrice(Math.round(this.dishPrice(dish) * factor), matched, hasWish);
        this.coins += price;
        this.sessionServed += 1;
        this.sessionRevenue += price;
        if (matched) this.sessionWishes += 1;
        const personal = booth.cookingDriver === "player";
        const rare = (booth.patronKind?.priceFactor ?? 1) >= 1.8;
        this.gainCultivation(
          getCultivationGain(personal) + (personal && matched ? 1 : 0) + (personal && rare ? 1 : 0),
        );
        this.log(`打烊前最后一桌用罢${dish.name}${matched ? "" : "（口味不合半价）"}，收入 +${price}`);
      } else if (dish && booth.state === "cooking") {
        this.inventory += 1;
        this.sessionLost += 1;
        this.log(`打烊，${dish.name}未及出餐，灵材退回`);
      } else if (booth.state === "seating" || booth.state === "awaitingCook") {
        this.sessionLost += 1;
      }
      booth.patronChar?.destroy();
      booth.patronChar = undefined;
      booth.state = "empty";
      booth.cookingDriver = null;
      booth.currentDish = null;
      booth.patronKind = null;
      booth.patronWish = null;
      booth.awaitingSince = 0;
    });
    this.displayedCoins = this.coins;
    playSfx("close");
    this.log("打烊，今日营业结束");
    this.gainStaffExperience();
    this.lastWages = this.settleWages();
    this.lastLoanDues = this.settleLoans();
    this.settleDailyGoal();
    this.meta = updateMeta(this.meta, {
      served: this.sessionServed,
      revenue: this.sessionRevenue,
      goalMet: this.lastGoalResult?.met ?? false,
      realmIndex: this.realmIndex(),
      day: Math.max(1, this.day - 1),
      level: this.level,
    });
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

  /** 产线是串联的，提示当前最慢的一环（或缺失的岗位）。 */
  private staffBottleneckHint(): string {
    const hasServer = this.staffLevel.server > 0;
    const hasCook = this.staffLevel.cook > 0;
    if (!hasServer && !hasCook) return "当前瓶颈：缺跑堂与灶上，全靠你亲力亲为";
    if (!hasServer) return "当前瓶颈：缺跑堂，只能手动招待";
    if (!hasCook) return "当前瓶颈：缺灶上，只能手动烹饪";
    if (!this.auto.server && !this.auto.cook) return "当前瓶颈：跑堂与灶上自动都已暂停，全靠你亲力亲为";
    if (!this.auto.server) return "跑堂自动已暂停，只能手动招待";
    if (!this.auto.cook) return "灶上自动已暂停，只能手动烹饪（亲自下厨才得修为）";
    const menu = this.getMenuDishes();
    const avgCookMs = menu.length ? menu.reduce((sum, dish) => sum + dish.cookMs, 0) / menu.length : 2000;
    const factor = getRealmStaffSpeedFactor(this.realmIndex());
    const seat = getStaffDuration(
      "server",
      SEAT_BASE_MS,
      SEAT_TAVERN_SHRINK_PER_LEVEL_MS,
      SEAT_FLOOR_MS,
      this.level,
      this.staffLevel.server,
      factor,
    );
    const cook = getStaffDuration(
      "cook",
      avgCookMs,
      COOK_TAVERN_SHRINK_PER_LEVEL_MS,
      COOK_FLOOR_MS,
      this.level,
      this.staffLevel.cook,
      factor * getStoveSpeedFactor(this.stoveLevel),
    );
    return cook >= seat
      ? `当前瓶颈：灶上（平均每道 ${(cook / 1000).toFixed(1)}s）`
      : `当前瓶颈：跑堂（每位 ${(seat / 1000).toFixed(1)}s）`;
  }

  /** 二级页面：营造。雅座扩建、灶台专精、门面招幡三条线各花各的钱。 */
  private buildBuildOverlay() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(100);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.97).setOrigin(0, 0).setInteractive());
    layer.add(this.add.text(40, 70, "营造", { fontSize: "30px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
    layer.add(this.add.text(40, 116, "灵石有限，先补当前的短板", { fontSize: "15px", color: "#999999" }));

    const nextDish = DISHES.find((dish) => dish.unlockLevel > this.level);
    const dishHint = nextDish ? `${nextDish.unlockLevel} 级解锁「${nextDish.name}」` : "已解锁全部菜品";
    const stoveFactor = getStoveSpeedFactor(this.stoveLevel);
    const signFactor = getSignArrivalFactor(this.signLevel);
    const rows = [
      {
        title: `雅座扩建 · 酒楼 ${this.level} 级`,
        desc: `雅座/排队 ${getBoothCount(this.level)} · ${dishHint}`,
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
        desc: `到店间隔 -${Math.round((1 - signFactor) * 100)}% → -${Math.round(
          (1 - getSignArrivalFactor(this.signLevel + 1)) * 100,
        )}%`,
        cost: getSignUpgradeCost(this.signLevel),
        action: "挂幡",
        run: () => this.upgradeSign(),
      },
    ];

    rows.forEach((row, i) => {
      const y = 170 + i * 155;
      const affordable = row.cost <= this.coins;
      layer.add(this.add.rectangle(40, y, 640, 136, 0x2b2b2b).setOrigin(0, 0).setStrokeStyle(2, 0x555555));
      layer.add(this.add.text(56, y + 12, row.title, { fontSize: "22px", color: "#ffffff" }));
      layer.add(
        this.add.text(56, y + 50, row.desc, { fontSize: "14px", color: "#bbbbbb", wordWrap: { width: 460 } }),
      );
      layer.add(
        this.add.text(56, y + 88, `费用 ${row.cost} 灵石`, {
          fontSize: "17px",
          color: affordable ? "#9fe870" : "#ff9a8a",
        }),
      );
      layer.add(
        this.add
          .text(560, y + 50, row.action, {
            fontSize: "20px",
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

  /** 二级页面：伙计列表，未雇佣的可在此雇佣，已雇佣的显示等级/熟练/日薪。 */
  private buildStaffOverlay() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(100);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.97).setOrigin(0, 0).setInteractive());
    layer.add(this.add.text(40, 70, "伙计", { fontSize: "30px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
    layer.add(
      this.add.text(40, 116, `${this.staffBottleneckHint()}（灶上按菜单轮转，不读口味）`, {
        fontSize: "15px",
        color: "#e0c060",
        wordWrap: { width: 640 },
      }),
    );
    if (this.staffNotice) {
      layer.add(
        this.add.text(40, 138, this.staffNotice, {
          fontSize: "14px",
          color: this.staffNoticeGood ? "#9fe870" : "#ff9a8a",
        }),
      );
    }

    const defs: { role: StaffRole; name: string; cost: number; desc: string }[] = [
      { role: "hawker", name: "迎客", cost: HIRE_COST_HAWKER, desc: "加速顾客到店" },
      { role: "server", name: "跑堂", cost: HIRE_COST_SERVER, desc: "自动招待入座" },
      { role: "cook", name: "灶上", cost: HIRE_COST_COOK, desc: "自动烹饪" },
      { role: "buyer", name: "采买", cost: HIRE_COST_BUYER, desc: "打烊自动补货 + 采购优惠" },
    ];

    defs.forEach((d, i) => {
      const y = 160 + i * 110;
      const role = d.role;
      const level = this.staffLevel[role];
      if (level > 0) {
        layer.add(this.add.text(50, y, `${d.name} Lv${level}`, { fontSize: "22px", color: "#ffffff" }));
        layer.add(
          this.add.text(
            50,
            y + 36,
            `熟练 ${this.staffExp[role] % EXP_PER_LEVEL}/${EXP_PER_LEVEL} · 日薪 ${getStaffWage(role, level)} 灵石`,
            { fontSize: "16px", color: "#bbbbbb" },
          ),
        );
        if (role !== "hawker") {
          const enabled = this.auto[role];
          layer.add(
            this.add
              .text(480, y + 2, `自动：${enabled ? "开" : "关"}`, {
                fontSize: "16px",
                color: enabled ? "#ffffff" : "#888888",
                backgroundColor: enabled ? "#3f6a3f" : "#3a3a3a",
                padding: { x: 12, y: 8 },
              })
              .setInteractive({ useHandCursor: true })
              .on("pointerup", () => {
                playSfx("click");
                this.auto[role] = !enabled;
                this.save();
                this.buildStaffOverlay();
              }),
          );
        }
      } else {
        // 整行可点：不再要求点中“雇 X 灵石”几个字
        const hireRow = this.add
          .zone(40, y - 8, 640, 96)
          .setOrigin(0, 0)
          .setInteractive({ useHandCursor: true })
          .on("pointerup", () => {
            playSfx("click");
            this.hireStaff(role);
            this.buildStaffOverlay();
          });
        layer.add(hireRow);
        layer.add(this.add.text(50, y, `${d.name}（未雇佣）`, { fontSize: "22px", color: "#888888" }));
        layer.add(
          this.add.text(50, y + 36, `${d.desc} · 日薪 ${getStaffWage(role, 1)} 灵石`, {
            fontSize: "16px",
            color: "#bbbbbb",
          }),
        );
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

    this.addOverlayClose(layer, 660);
    this.overlay = layer;
  }

  /** 二级页面：修行境界，列出全部境界、加成与当前进度。 */
  private buildCultivationOverlay() {
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
  private buildAscendConfirmOverlay() {
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
        .rectangle(0, 0, CARD_W, cardHeight, 0x241a12, 1)
        .setOrigin(0.5, 0)
        .setStrokeStyle(2, 0x8a6a3a),
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
      `修为增长：+${this.sessionCultivation}`,
      `工资合计：${totalWage} 灵石`,
      `商行还账：${totalLoan} 灵石`,
      `净收益：${this.sessionRevenue - totalWage - totalLoan} 灵石`,
      `余下：${this.coins} 灵石（连亏 ${this.negativeStreak}/${BANKRUPT_STREAK} 日）`,
      `流失食客：${this.sessionLost} 位`,
    ];
    const nextCost = getUpgradeCost(this.level);
    summary.push(`下一阶：${nextCost} 灵石 → Lv${this.level + 1}，店内会添新陈设`);
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

    panel.add(this.add.text(left, 20, "今日营业结束", { fontSize: "30px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
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
      const { goal, met, progress, rewardCoins } = this.lastGoalResult;
      panel.add(this.add.text(left, y, `今日目标 · ${goal.label}`, { fontSize: "17px", color: "#aaaaaa" }));
      y += 26;
      panel.add(
        this.add.text(
          left + 16,
          y,
          met
            ? `达成！+${rewardCoins} 灵石、+${goal.rewardCultivation} 修为`
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

  /** 玩法说明：新档第一次进门自动弹出，也可随时从「玩法」按钮打开。 */
  private showHelp() {
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
      "营业前：采购灵材、雇伙计、营造升级、选菜单，然后「开始营业」。",
      "营业中：门口排队 → 招待入座 → 出菜行点菜 → 用膳结账。",
      "营业中可左右拖动画面，查看门外排队与空地。",
      "只有亲自下厨得修为；端对口味 +50%，有想吃的却上错只付半价。",
      "修为推动境界突破，境界提高售价、操作速度与客流。",
      "修到大乘可飞升：重置本局，仙缘永久提高售价与开局资源。",
      "每天一个目标，达成有额外灵石与修为；连亏 5 日破产。",
      "「账簿」看成绩、「存档」备份；缺灵石可去灵石商行借小借。",
    ];
    lines.forEach((line, i) => {
      layer.add(
        this.add.text(40, 252 + i * 48, line, {
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
  private buildRecordOverlay() {
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
  private openSaveDialog(mode: "export" | "import") {
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
        : "粘贴 LS1. 开头的导出码。导入会覆盖本机当前进度。";
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
        if (!data || typeof data !== "object" || (data as { v?: unknown }).v !== 1) {
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

  // ===== 场景与 UI =====
  private makeBooth(): Booth {
    return {
      state: "empty",
      cookingDriver: null,
      currentDish: null,
      cookStartedAt: 0,
      cookDoneAt: 0,
      departAt: 0,
      awaitingSince: 0,
      patronKind: null,
      patronWish: null,
    };
  }

  private positionUi(isOpen: boolean) {
    // 打烊时「开始营业」是主行动；营业中换成「提前打烊」配色。高度保持大按钮。
    this.startButton.setStyle({
      fontSize: isOpen ? "17px" : "20px",
      color: "#f5e6c8",
      backgroundColor: isOpen ? "#3f2a22" : "#3f6a3f",
      padding: isOpen ? { x: 20, y: 28 } : { x: 40, y: 28 },
    });
    this.boothVisuals.forEach((v) => {
      v.bg.setVisible(isOpen);
      v.runner.setVisible(isOpen && this.level >= 2);
      v.number.setVisible(isOpen);
      v.label.setVisible(isOpen);
      v.legs.forEach((l) => l.setVisible(isOpen));
      v.barBg.setVisible(isOpen);
      v.barFill.setVisible(isOpen);
    });

    this.serveButton.setVisible(isOpen);
    this.cookButton.setVisible(isOpen);
    this.navPanel.setVisible(!isOpen);
    this.staffButton.setVisible(!isOpen);
    this.bankButton.setVisible(!isOpen);
    this.upgradeButton.setVisible(!isOpen);
    this.genderButton.setVisible(!isOpen);
    this.cultivationButton.setVisible(!isOpen);
    this.helpButton.setVisible(!isOpen);
    this.recordButton.setVisible(!isOpen);
    this.saveButton.setVisible(!isOpen);

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
      // 右侧要能一直拉到队尾：12 个排队位最远到 x≈1190
      cam.scrollX = Phaser.Math.Clamp(startScroll - dx, -360, 900);
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
    this.playerChar.setLongHair(gender === "female");
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

  private currentDayGoal(): DailyGoal {
    if (!this.dailyGoal) this.dailyGoal = getDailyGoal(this.day, this.level);
    return this.dailyGoal;
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
    this.sessionCultivation += amount;
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
  private refreshPlayerAura() {
    const colors = [0x8ab4ff, 0x7fe8dd, 0x9fe870, 0xffd98a, 0xff9a6a, 0xc8a8ff, 0xff8ad8, 0xfff2c0];
    this.playerChar?.setAura(colors[this.realmIndex()] ?? 0xfff2c0, 1 + this.ascensions * 0.12);
  }

  /** 烹饪中的桌上冒热气；没开火时灶台自己冒。 */
  private emitCookingSteam() {
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
  private showDiningProp(x: number) {
    const px = x + 16;
    const y = FLOOR_Y - 24;
    const bowl = this.add.ellipse(px, y, 32, 12, 0xf1e4cc).setDepth(21);
    const soup = this.add.ellipse(px, y - 2, 22, 6, 0xd98a4a).setDepth(21);
    const stick = this.add.rectangle(px + 13, y - 6, 2, 24, 0x6a4a2a).setAngle(26).setDepth(21);
    this.spawnSteam(px, y - 14, 0.22);
    this.tweens.add({
      targets: [bowl, soup, stick],
      alpha: 0,
      delay: 2500,
      duration: 600,
      onComplete: () => {
        bowl.destroy();
        soup.destroy();
        stick.destroy();
      },
    });
  }

  /** 每日开张的题头：日期 + 天气，给每一局一个开场仪式。 */
  private showDayBanner() {
    const weather = ["晴", "灵雾", "落英"][(this.day - 1) % 3];
    const layer = this.add.container(0, 0).setScrollFactor(0).setDepth(29);
    const wrap = this.add.container(0, 0);
    wrap.add(
      this.add
        .text(360, 300, `第 ${this.day} 日`, {
          fontSize: "48px",
          color: "#ffe6a8",
          stroke: "#2a1a0a",
          strokeThickness: 5,
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(8),
    );
    wrap.add(this.add.rectangle(360, 346, 220, 1, 0xd9b45a, 0.6));
    wrap.add(
      this.add
        .text(360, 372, weather, {
          fontSize: "20px",
          color: "#e0c9a0",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(4),
    );
    wrap.setAlpha(0);
    layer.add(wrap);
    this.tweens.add({ targets: wrap, alpha: 1, y: 8, duration: 500, ease: "Sine.easeOut" });
    this.tweens.add({
      targets: wrap,
      alpha: 0,
      y: -8,
      delay: 1700,
      duration: 700,
      ease: "Sine.easeIn",
      onComplete: () => layer.destroy(),
    });
  }

  /** 每日天气的少量粒子：晴=流萤，灵雾=低雾，落英=花瓣。纯氛围，不改数值。 */
  private emitWeather() {
    if (this.gameState !== "open" || this.settling) return;
    const mode = (this.day - 1) % 3;
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
  private idleTwitch() {
    if (this.gameState !== "open" || this.settling) return;
    const chars: Character[] = [this.playerChar];
    for (const b of this.booths) if (b.patronChar) chars.push(b.patronChar);
    for (const q of this.queue) chars.push(q.char);
    for (const c of Object.values(this.staffChars)) if (c?.visible) chars.push(c);
    chars[Math.floor(Math.random() * chars.length)]?.twitch();
  }

  /** 点人物时的短暂特写：镜头推近、清空 HUD、停四秒、再拉回原视角。 */
  private focusOnCharacter(char: Character) {
    if (this.gameState !== "open" || this.settling) return;
    if (this.focusing && this.focusChar === char) {
      this.returnFromFocus();
      return;
    }
    const cam = this.cameras.main;
    if (!this.focusing) {
      this.focusReturn = { x: cam.midPoint.x, y: cam.midPoint.y };
      this.focusing = true;
      this.setFocusUiHidden(true);
    }
    this.focusChar = char;
    this.focusTimer?.remove();
    this.eventToast?.destroy();
    this.eventToast = undefined;
    this.hintToast?.destroy();
    this.hintToast = undefined;
    cam.pan(char.x, char.y - 14, 320, "Sine.easeInOut");
    cam.zoomTo(2.2, 320, "Sine.easeInOut");
    char.focusPose();
    this.focusCaption?.destroy();
    this.focusCaption = this.add
      .text(char.x, char.y - 152, "人物特写 · 再点一次退出", {
        fontSize: "14px",
        color: "#ffe6c8",
        backgroundColor: "rgba(30,22,15,0.85)",
        padding: { x: 8, y: 4 },
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setDepth(27);
    this.focusTimer = this.time.delayedCall(4200, () => this.returnFromFocus());
  }

  /** 退出人物特写：恢复 HUD、镜头和原视角；再点同一人也会立即退出。 */
  private returnFromFocus() {
    this.focusTimer?.remove();
    this.focusTimer = undefined;
    this.focusing = false;
    this.focusChar = undefined;
    this.focusCaption?.destroy();
    this.focusCaption = undefined;
    const cam = this.cameras.main;
    cam.pan(this.focusReturn.x, this.focusReturn.y, 360, "Sine.easeInOut");
    cam.zoomTo(1, 360, "Sine.easeInOut");
    this.time.delayedCall(380, () => {
      this.setFocusUiHidden(false);
      this.refreshHud();
    });
  }

  /** 特写期间收起界面；否则相机缩放会把屏幕固定的 HUD 一起放大、错位。 */
  private setFocusUiHidden(hidden: boolean) {
    const ui: { setVisible(visible: boolean): unknown }[] = [
      this.hudBar,
      this.hudLine,
      this.coinsText,
      this.inventoryText,
      this.queueText,
      this.realmText,
      this.cultivationText,
      this.goalText,
      this.sessionText,
      this.chronicleText,
      this.sfxButton,
      this.bgmButton,
      this.startButton,
      this.serveButton,
      this.cookButton,
      this.dishChipLabel,
      ...this.dishChips,
    ];
    ui.forEach((obj) => obj.setVisible(!hidden));
    this.purchaseButton.setVisible(!hidden);
    this.tutorialBanner.setVisible(false);
  }

  /** 玩家亲自下厨/招待时，身周升起灵气微光。 */
  private emitQi() {
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

  private spawnSteam(x: number, y: number, alpha = 0.26) {
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

  /** 门外空地的流萤，给营业中添一点活气。 */
  private emitFirefly() {
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
  private ambientBark() {
    if (this.gameState !== "open" || this.settling) return;
    if (Math.random() < 0.35) return;
    const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];
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
    const staffLines: [Character | undefined, string][] = [
      [this.staffChars.cook, pick(["火候到了。", "再添一把柴。", "这锅气，成了。"])],
      [this.staffChars.server, pick(["客官里边请——", "小心台阶。", "雅座已备好。"])],
      [this.staffChars.hawker, pick(["灵膳楼开张，仙凡同席！", "今日有鲜货！", "客官，里边请！"])],
    ];
    for (const [char, text] of staffLines) {
      if (char?.visible) speakers.push({ char, text });
    }
    if (speakers.length === 0) return;
    const chosen = speakers[Math.floor(Math.random() * speakers.length)];
    chosen.char.say(chosen.text, chosen.cold ? "cold" : "warm");
  }

  private getMenuDishes(): Dish[] {
    return DISHES.filter((d) => this.selectedDishIds.has(d.id) && d.unlockLevel <= this.level);
  }

  /** 食客点名的范围是已解锁的全部菜，不是今日菜单。 */
  private unlockedDishIds(): string[] {
    return DISHES.filter((d) => d.unlockLevel <= this.level).map((d) => d.id);
  }

  // ===== 产线 =====
  /** 队尾最多排到空地尽头；等级很高时自动压缩间距。 */
  private queueGap(): number {
    return Math.min(QUEUE_GAP, 770 / Math.max(1, getBoothCount(this.level) - 1));
  }

  /** 系统生成一位到店顾客：队列有空位就走进来排队，排满则直接离开。 */
  private spawnPatron(time: number) {
    const kind = pickPatronKind(Math.random());
    const rare = kind.priceFactor >= 1.8;
    const slotX = QUEUE_X + this.queue.length * this.queueGap();
    const spawnX = Math.max(980, slotX + 60);
    const longHair = kind.id === "alchemist" || kind.id === "demonlord" || kind.id === "elder";
    const char = new Character(this, spawnX, ACTOR_Y, kind.bodyColor, kind.hairColor, longHair, kind.id as CharacterLook);
    char.setVisible(this.gameState === "open");
    if (rare) char.setAura(kind.id === "elder" ? 0xffe08a : 0xff6a6a, 0.9, 0.35);
    // 点名范围是已解锁的全部菜：菜单没上的菜也会被点名，端不上就只付半价
    const wish = pickPatronWish(kind, this.unlockedDishIds(), Math.random());

    if (this.queue.length >= getBoothCount(this.level)) {
      char.walkTo(1620, ACTOR_Y, 500, () => char.destroy());
      this.sessionLost += 1;
      this.log(`${kind.name}见门外排满，转身离去`);
      return;
    }

    char.walkTo(slotX, ACTOR_Y, 700);
    const patience = QUEUE_PATIENCE_MS * kind.patienceFactor * (this.day === 1 ? 1.8 : 1);
    this.queue.push({ expiresAt: time + patience, patienceMs: patience, char, kind, wish });
    if (this.day === 1 && this.tutorialHintStage === 0) {
      this.tutorialHintStage = 1;
    }
    this.staffChars.hawker?.pulse();
    playSfx(rare ? "event" : "arrival");
    const wishName = DISHES.find((d) => d.id === wish)?.name;
    this.log(
      rare
        ? `【稀客】${kind.name}亲临门外${wishName ? `，想吃${wishName}` : ""}`
        : `${kind.name}来到门前排起队${wishName ? `，想吃${wishName}` : ""}`,
    );
    if (rare) this.showEventToast(`${kind.name}亲临门外`, true);
  }

  /** 临近打烊时清空排队：所有候客直接离开。 */
  private dismissQueue() {
    this.queue.forEach((p) => {
      p.char.walkTo(1620, ACTOR_Y, 600, () => p.char.destroy());
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
    if (event.kind === "bad") this.cameras.main.shake(220, 0.006);
    playSfx("event");
  }

  private showEventToast(message: string, good: boolean) {
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

  /** 玩家/伙计走到待客位再做动作；不再瞬移，也不再站到客人身上。 */
  private moveActorTo(driver: Driver, kind: "seat" | "cook", travelMs: number) {
    const spot = kind === "seat" ? SERVE_SPOT : COOK_SPOT;
    if (driver === "player") {
      this.playerChar.walkTo(spot.x, spot.y, travelMs, () => this.playerChar.pulse());
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
    if (driver === "player" && this.isPlayerBusy()) {
      this.showHint("你正忙着，稍等一下");
      return;
    }
    if (driver === "staff" && this.staffSeat) return;
    if (this.queue.length === 0) {
      if (driver === "player") {
        this.showHint(
          this.booths.some((booth) => booth.state === "seating")
            ? "跑堂正在领客入座，稍等"
            : "门外还没有客人，稍等",
        );
      }
      return;
    }

    const emptyBooths = this.booths
      .map((booth, index) => ({ booth, index }))
      .filter(({ booth }) => booth.state === "empty");
    if (emptyBooths.length === 0) {
      if (driver === "player") this.showHint("雅座满了，先出菜");
      return;
    }
    // 不总是从最左一张开始，客人分散入座，画面更像一间活着的店
    const { booth, index: boothIndex } =
      emptyBooths[Math.floor(Math.random() * emptyBooths.length)];

    const patron = this.queue.shift()!;
    patron.char.setPatience(null);
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
    if (patron.kind.priceFactor >= 1.8) {
      patron.char.say(patron.kind.id === "elder" ? "此子有慧根。" : "本座只等一炷香。", "cold");
    }
  }

  private resolveSeat(progress: SeatProgress | null, time: number, driver: Driver): SeatProgress | null {
    if (!progress || time < progress.startedAt + progress.duration) return progress;
    const booth = this.booths[progress.boothIndex];
    if (booth) {
      playSfx("seat");
      booth.state = "awaitingCook";
      booth.awaitingSince = time;
      this.log(driver === "player" ? "你领食客入座雅座，等候烹饪" : "跑堂伙计领食客入座雅座");
      this.showBoothOrder(progress.boothIndex);
      if (this.day === 1 && this.tutorialHintStage <= 1) {
        this.tutorialHintStage = 2;
      }
    }
    this.moveActorHome(driver, "seat");
    return null;
  }

  /** 入座时在桌上方飘出这一桌的订单，避免玩家只看到队列数字变化。 */
  private showBoothOrder(index: number) {
    const booth = this.booths[index];
    const table = this.tablePosition(index);
    const wish = DISHES.find((dish) => dish.id === booth.patronWish)?.name;
    const guest = booth.patronKind?.name ?? "食客";
    const cam = this.cameras.main;
    const toastX = Phaser.Math.Clamp(table.x, cam.scrollX + 150, cam.scrollX + 570);
    const toast = this.add
      .text(toastX, FLOOR_Y - 150, wish ? `${guest}入座：想吃${wish}` : `${guest}入座`, {
        fontSize: "16px",
        color: "#ffe8a0",
        backgroundColor: "#1b2440",
        padding: { x: 8, y: 5 },
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({
      targets: toast,
      y: FLOOR_Y - 186,
      alpha: 0,
      duration: 1300,
      ease: "Sine.easeOut",
      onComplete: () => toast.destroy(),
    });
  }

  private manualCook() {
    if (this.settling) return;
    if (this.isPlayerBusy()) {
      this.showHint("你正忙着，稍等一下");
      return;
    }
    const index = this.booths.findIndex((booth) => booth.state === "awaitingCook");
    if (index === -1) {
      this.showHint(
        this.booths.some((booth) => booth.state === "seating") ? "食客还在入座，稍等片刻" : "还没有待烹饪的客人",
      );
      return;
    }
    this.startCook(this.booths[index], index, "player");
  }

  /** 指定菜品出餐：优先端给正想吃这道菜的那一桌。 */
  private manualCookDish(dish: Dish) {
    if (this.settling) return;
    if (this.isPlayerBusy()) {
      this.showHint("你正忙着，稍等一下");
      return;
    }
    const awaiting = this.booths
      .map((booth, index) => ({ booth, index }))
      .filter(({ booth }) => booth.state === "awaitingCook");
    if (awaiting.length === 0) {
      this.showHint(
        this.booths.some((booth) => booth.state === "seating") ? "食客还在入座，稍等片刻" : "先点「招待入座」把客人领进来",
      );
      return;
    }
    const target = awaiting.find(({ booth }) => booth.patronWish === dish.id) ?? awaiting[0];
    this.startCook(target.booth, target.index, "player", dish);
  }

  private cookDuration(dish: Dish, driver: Driver): number {
    return driver === "player"
      ? getPlayerDuration(
          dish.cookMs,
          COOK_TAVERN_SHRINK_PER_LEVEL_MS,
          COOK_FLOOR_MS,
          this.level,
          getRealmPlayerSpeedFactor(this.realmIndex()) * getStoveSpeedFactor(this.stoveLevel),
        )
      : getStaffDuration(
          "cook",
          dish.cookMs,
          COOK_TAVERN_SHRINK_PER_LEVEL_MS,
          COOK_FLOOR_MS,
          this.level,
          this.staffLevel.cook,
          getRealmStaffSpeedFactor(this.realmIndex()) * getStoveSpeedFactor(this.stoveLevel),
        );
  }

  private canFinishBeforeClose(dish: Dish, driver: Driver): boolean {
    return this.sessionEndsAt <= 0 || this.time.now + this.cookDuration(dish, driver) <= this.sessionEndsAt;
  }

  private startCook(booth: Booth, index: number, driver: Driver, dish?: Dish) {
    if (booth.state !== "awaitingCook") return;
    if (this.inventory <= 0) {
      booth.state = "empty";
      const leaver = booth.patronChar;
      const guest = booth.patronKind?.name ?? "食客";
      booth.patronChar = undefined;
      booth.patronKind = null;
      booth.patronWish = null;
      booth.awaitingSince = 0;
      leaver?.walkTo(440, ACTOR_Y, 400, () => leaver.destroy());
      this.sessionLost += 1;
      this.log(`灵材不足，${guest}没吃上菜便离开了`);
      this.showHint("灵材不足，客人走了——赶紧备货");
      return;
    }

    const menu = this.getMenuDishes();
    if (menu.length === 0) return;
    const chosen = dish ?? menu[this.dishCursor % menu.length];
    const duration = this.cookDuration(chosen, driver);
    // 打烊前做不完的菜不启动；轮转只在真正起锅后才前进，避免空转吃掉菜序
    if (!this.canFinishBeforeClose(chosen, driver)) {
      if (driver === "player") this.showHint("这道菜来不及了，换道快菜");
      return;
    }
    if (dish === undefined) this.dishCursor += 1;
    this.inventory -= 1;
    booth.state = "cooking";
    booth.cookingDriver = driver;
    booth.currentDish = chosen;
    booth.cookStartedAt = this.time.now;
    booth.cookDoneAt = this.time.now + duration;
    if (driver === "player") this.playerCookingBooth = index;
    else this.staffCookingBooth = index;
    this.moveActorTo(driver, "cook", Math.min(400, duration));
    this.log(
      driver === "player"
        ? `你下厨为 ${index + 1} 号桌烹制${chosen.name}`
        : `灶上伙计烹制${chosen.name}（雅座 ${index + 1}）`,
    );
    if (driver === "player" && this.day === 1 && this.tutorialHintStage === 2) {
      this.tutorialHintStage = 3;
      this.showHint("已起锅，等出餐");
    }
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
    this.drawInterior(this.interiorGfx);
    this.save();
    playSfx("upgrade");
    const unlocked = DISHES.find((d) => d.unlockLevel === this.level);
    this.log(
      unlocked ? `酒楼扩建到 ${this.level} 级，解锁新菜品「${unlocked.name}」` : `酒楼扩建到 ${this.level} 级`,
    );
  }

  private upgradeStove() {
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
  }

  private upgradeSign() {
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
    this.log(`门面挂上新幡，到店间隔再缩短一些`);
  }

  private hireStaff(role: StaffRole) {
    if (this.staffLevel[role] > 0) return;
    const hireCost = {
      hawker: HIRE_COST_HAWKER,
      server: HIRE_COST_SERVER,
      cook: HIRE_COST_COOK,
      buyer: HIRE_COST_BUYER,
    }[role];
    const roleName = { hawker: "迎客", server: "跑堂", cook: "灶上", buyer: "采买" }[role];
    if (this.coins < hireCost) {
      this.staffNotice = `灵石不足，雇${roleName}需 ${hireCost} 灵石`;
      this.staffNoticeGood = false;
      this.log("灵石不足，无法雇人");
      return;
    }
    this.coins -= hireCost;
    this.displayedCoins = this.coins;
    this.staffLevel[role] = 1;
    if (role !== "buyer") this.spawnStaffChar(role);
    this.save();
    this.staffNotice = `已雇${roleName}（${hireCost} 灵石）`;
    this.staffNoticeGood = true;
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
    if (this.borrowedIds.has(def.id) || this.level < def.unlockLevel || this.day < def.minDay) return;
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
    this.dailyGoal = getDailyGoal(this.day, this.level);
    if (!goal) return;
    const stats = { served: this.sessionServed, revenue: this.sessionRevenue, wishes: this.sessionWishes };
    const met = isGoalMet(goal, stats);
    const rewardCoins = getGoalCoinReward(goal, this.sessionRevenue);
    this.lastGoalResult = { goal, met, progress: getGoalProgress(goal, stats), rewardCoins };
    if (!met) {
      this.log(`今日目标未达成：${goal.label}`);
      return;
    }
    this.coins += rewardCoins;
    this.displayedCoins = this.coins;
    this.log(`今日目标达成：${goal.label}，赏 ${rewardCoins} 灵石、${goal.rewardCultivation} 修为`);
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

  /** 对无效操作给出一次可见提示，避免“点了没反应”的错觉。 */
  private showHint(message: string) {
    if (this.focusing) return;
    if (this.time.now - this.lastHintAt < 1400) return;
    this.lastHintAt = this.time.now;
    const toast = this.add
      .text(SCREEN_W / 2, 142, message, {
        fontSize: "18px",
        color: "#ffe6c8",
        backgroundColor: "rgba(30,22,15,0.9)",
        padding: { x: 12, y: 6 },
        align: "center",
        wordWrap: { width: 560 },
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(45)
      .setAlpha(0);
    this.hintToast?.destroy();
    this.hintToast = toast;
    this.tweens.add({
      targets: toast,
      alpha: 1,
      y: 146,
      duration: 180,
      yoyo: true,
      hold: 1400,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (this.hintToast === toast) this.hintToast = undefined;
        toast.destroy();
      },
    });
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

      // 雅座上的操作进度：上座与烹饪共用一条，颜色区分玩家/伙计
      let fraction = 0;
      let color = COLOR_PLAYER;
      if (booth.state === "seating") {
        const progress =
          this.playerSeat?.boothIndex === i
            ? this.playerSeat
            : this.staffSeat?.boothIndex === i
              ? this.staffSeat
              : null;
        if (progress) {
          fraction = (time - progress.startedAt) / progress.duration;
          color = this.playerSeat === progress ? COLOR_PLAYER : COLOR_STAFF;
        }
      } else if (booth.state === "cooking") {
        fraction = (time - booth.cookStartedAt) / Math.max(1, booth.cookDoneAt - booth.cookStartedAt);
        color = booth.cookingDriver === "player" ? COLOR_PLAYER : COLOR_STAFF;
      }
      const showBar = this.gameState === "open" && fraction > 0;
      visual.barBg.setVisible(showBar);
      visual.barFill.setVisible(showBar);
      if (showBar) {
        visual.barFill.width = visual.barBg.width * Phaser.Math.Clamp(fraction, 0, 1);
        visual.barFill.setFillStyle(color, 1);
      }
    });
  }

  /** 端对口味时桌上冒一颗心。 */
  private showWishReaction(worldX: number, worldY: number) {
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
  private showCultivationPopup(worldX: number, worldY: number, amount: number) {
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
    if (this.focusing) return;
    const open = this.gameState === "open";
    this.playerLabel.setVisible(open);
    if (open) this.playerLabel.setPosition(this.playerChar.x, this.playerChar.y - 120);

    this.coinsText.setText(`灵石：${this.displayedCoins}`);
    this.inventoryText.setText(`灵材：${this.inventory}`);
    this.levelText.setText(`酒楼等级：${this.level}`);
    const queueCap = getBoothCount(this.level);
    if (open && !this.settling && !this.lastCallTriggered) {
      const nextIn = Math.max(0, Math.ceil((this.nextArrivalAt - this.time.now) / 1000));
      this.queueText.setText(`排队 ${this.queue.length}/${queueCap} · ${nextIn}s`);
    } else {
      this.queueText.setText(`排队：${this.queue.length}/${queueCap}`);
    }
    const next = getNextRealm(this.cultivation);
    this.realmText.setText(`境界：${REALMS[this.realmIndex()].name}`);
    this.cultivationText.setText(
      next ? `修为 ${this.cultivation}/${next.cultivation}` : `修为 ${this.cultivation} 圆满`,
    );
    if (this.settling) {
      this.sessionText.setText("已打烊");
      this.goalText.setText("");
    } else if (open && this.sessionGoal) {
      const busyLabel = this.playerSeat
        ? "招待中"
        : this.playerCookingBooth !== null
          ? "烹饪中"
          : this.playerPurchasing
            ? "采购中"
            : "";
      this.sessionText.setText(
        `营业 ${Math.max(0, Math.ceil((this.sessionEndsAt - this.time.now) / 1000))}s · ${this.sessionServed}位 / ${
          this.sessionRevenue
        }灵石${busyLabel ? ` · 掌柜${busyLabel}` : ""}`,
      );
      const progress = getGoalProgress(this.sessionGoal, {
        served: this.sessionServed,
        revenue: this.sessionRevenue,
        wishes: this.sessionWishes,
      });
      const kind = this.sessionGoal.kind;
      const prefix = kind === "serve" ? "接待" : kind === "revenue" ? "收入" : "口味";
      const unit = kind === "revenue" ? " 灵石" : " 位";
      const reached = progress >= this.sessionGoal.target;
      this.goalText.setText(
        reached ? "今日目标 ✓" : `${prefix} ${progress}/${this.sessionGoal.target}${unit}`,
      );
      this.goalText.setColor(reached ? "#9fdf6a" : "#e0c060");
      if (reached && !this.goalAnnounced) {
        this.goalAnnounced = true;
        playSfx("upgrade");
        this.showEventToast("今日目标达成", true);
      }
    } else {
      const goal = this.currentDayGoal();
      this.sessionText.setText(
        `第 ${this.day} 日 · 目标：${goal.label} · 赏 基础${goal.rewardCoins}灵石+当日收入15% · ${goal.rewardCultivation}修为`,
      );
      this.goalText.setText("");
    }
    this.chronicleText.setText(
      this.chronicleLines.map((line) => (line.length > 34 ? `${line.slice(0, 33)}…` : line)).join("\n"),
    );

    const menu = this.getMenuDishes();
    const canServeBeforeClose = menu.some((dish) => this.canFinishBeforeClose(dish, "player"));
    const wished = new Set(
      this.booths
        .filter((booth) => booth.state === "awaitingCook")
        .map((booth) => booth.patronWish)
        .filter((id): id is string => typeof id === "string"),
    );
    this.booths.forEach((booth, i) => {
      const visual = this.boothVisuals[i];
      if (!visual) return;
      const kind = booth.patronKind;
      const wishName =
        booth.state === "awaitingCook" ? DISHES.find((d) => d.id === booth.patronWish)?.name : undefined;
      // 用膳中的客人只留碗筷与人物，不再顶着卡片；等待/烹饪才需要信息
      const showLabel =
        open && (booth.state === "awaitingCook" || booth.state === "seating" || booth.state === "cooking");
      visual.label.setVisible(showLabel);
      visual.label.setColor(
        booth.state === "awaitingCook" && !canServeBeforeClose
          ? "#ff9a8a"
          : kind && kind.priceFactor >= 1.8
            ? "#ffd98a"
            : "#ffffff",
      );
      // 桌卡只留最短信息：想吃什么/做哪道/入座；固定桌号单独常驻
      const marker = kind && kind.priceFactor >= 1.8 ? "★" : "";
      const labelText =
        booth.state === "awaitingCook"
          ? `${marker}${wishName ?? "随意"}↓`
          : booth.state === "cooking"
            ? `${booth.currentDish?.name ?? "烹饪"} ${Math.max(
                0,
                Math.ceil((booth.cookDoneAt - this.time.now) / 1000),
              )}s`
            : "入座";
      visual.label.setText(showLabel ? labelText : "");
    });

    const busy = this.isPlayerBusy();
    const showChips = open && !this.settling;
    this.dishChipLabel.setVisible(showChips);
    this.dishChips.forEach((chip, i) => {
      const dish = menu[i];
      chip.setVisible(showChips && dish !== undefined);
      if (!dish) return;
      const finishable = this.canFinishBeforeClose(dish, "player");
      chip.setAlpha(showChips ? (busy || !finishable ? 0.5 : 1) : 1);
      const wanted = wished.has(dish.id);
      chip.setText(`${wanted ? "★" : ""}${dish.name} ${this.dishPrice(dish)}`);
      chip.setBackgroundColor(wanted ? "#6a4a14" : "#2e2119");
    });

    this.startButton.setText(open ? "提前打烊" : "开始营业");
    this.serveButton.setText(this.playerSeat ? "招待中…" : "招待入座");
    this.cookButton.setText(this.playerCookingBooth !== null ? "烹饪中…" : "动手烹饪");

    const actionAlpha = this.settling ? 0.4 : busy ? 0.35 : 1;
    this.startButton.setAlpha(this.settling ? 0.4 : 1);
    this.serveButton.setAlpha(actionAlpha);
    this.cookButton.setAlpha(actionAlpha);

    const guideVisible =
      open && this.day === 1 && this.tutorialHintStage >= 1 && this.tutorialHintStage <= 2 && !this.focusing;
    this.tutorialBanner.setVisible(guideVisible);
    if (guideVisible) {
      this.tutorialBanner.setText(
        this.tutorialHintStage === 1
          ? "① 点「招待入座」把客人领进来"
          : "② 点下方菜名出菜；★是客人想吃的菜",
      );
    }

    this.serveButton.setVisible(open);
    this.cookButton.setVisible(open);
    this.navPanel.setVisible(!open);
    this.staffButton.setVisible(!open);
    this.bankButton.setVisible(!open);
    this.upgradeButton.setVisible(!open);
    this.cultivationButton.setVisible(!open);
    this.helpButton.setVisible(!open);
    this.recordButton.setVisible(!open);
    this.saveButton.setVisible(!open);
    this.purchaseButton.setVisible(true);

    this.staffButton.setText("伙计");
    this.bankButton.setText("灵石商行");
    this.cultivationButton.setText("修行·境界");
    this.helpButton.setText("玩法");
    this.recordButton.setText("账簿");
    this.saveButton.setText("存档");

    this.serveButton.setText("招待入座");
    this.cookButton.setText("动手烹饪");

    const purchasePriceLabel = getPurchasePrice(this.staffLevel.buyer, open);
    this.purchaseButton.setLabel(
      open
        ? `急购 +${PURCHASE_AMOUNT}（${purchasePriceLabel} 灵石）`
        : `备货 +${PURCHASE_AMOUNT}（${purchasePriceLabel} 灵石）`,
    );
    this.upgradeButton.setText(`营造 Lv${this.level}`);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: SCREEN_W,
  height: SCREEN_H,
  backgroundColor: "#1b2440",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TavernScene],
});
