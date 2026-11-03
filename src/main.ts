import Phaser from "phaser";
import { loadAudioSettings, playSfx, setSfxMuted } from "./audio";
import { getPixelTexture, type PixelStyle } from "./pixel";
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
  FLOOR_UNLOCKS,
  MAX_FLOORS,
  getCultivationGain,
  getFloorBoothCount,
  getFloorPriceMultiplier,
  getFloorRent,
  getPostCapPriceBonus,
  getTotalBoothCount,
  getDailyGoal,
  getDailyGoalOptions,
  getDailyGift,
  getDailyOmen,
  getDailyRent,
  getDailySpecial,
  getFestivalGoalMultiplier,
  getGiftStreak,
  getStreakBonus,
  GOAL_STREAK_TARGET,
  isFestivalDay,
  getDishFans,
  getGoalPayout,
  getGoalProgress,
  getLoanDue,
  getNextRealm,
  getPlayerDuration,
  getPurchaseDuration,
  getPurchasePrice,
  getRepLevelInfo,
  getRepLevel,
  getNextRepThreshold,
  gainReputation,
  loseReputation,
  REP_GAIN_RARE,
  REP_GAIN_SERVED,
  getRealmIndex,
  getRealmPlayerSpeedFactor,
  getRealmPriceMultiplier,
  getRealmStaffSpeedFactor,
  getRealmClosingIngredients,
  isRarePatron,
  ARRIVAL_MIN_MS,
  ARRIVAL_MAX_MS,
  getSignUpgradeCost,
  getSpecialPrice,
  getStaffDuration,
  getStaffLevel,
  getStaffWage,
  getStoveSpeedFactor,
  getStoveUpgradeCost,
  getUpgradeCost,
  getWishPrice,
  localDateKey,
  PATRON_KINDS,
  pickPatronKind,
  pickPatronName,
  pickPatronWish,
  pickRandomEvent,
  skyColorAt,
  updateMeta,
} from "./logic";
import { EXP_PER_LEVEL } from "./logic";
import type { DailyGoal, Dish, LoanDef, MetaStats, OmenDef, PatronKind, StaffRole } from "./logic";
import { decodeSaveCode, encodeSaveCode } from "./savecode";
import { GAME, validateConfig } from "./config";

// ===== 本文件独有的常量 =====
// 玩法数值都在 config.ts，这里只取别名
const QUEUE_PATIENCE_MS = GAME.session.queuePatienceMs;
const DINING_MS = GAME.session.diningMs;
/** 桌子入座后先给玩家这么久亲手出菜，伙计再接手。 */
const COOK_PRIORITY_MS = GAME.session.cookPriorityMs;
/** 保底上限：名单耗尽即结算，这个只防卡死。 */
const SESSION_HARD_STOP_MS = 15 * 60 * 1000;
/** 最后一位离店后停顿一下再结算，给清场留个过场。 */
const ROUND_END_DELAY_MS = 1200;
/** 天色推进用的名义时长：客人越多，一局在视觉上过得越久。 */
const NOMINAL_MS_PER_PATRON = 20000;
/** 顾客进场动画整体放慢，体现悠闲。 */
const ENTRANCE_SLOW = 1.5;
/** 玩家连续命中口味的连击：每次 +5%，最多 5 连（+25%）。 */
const COMBO_STEP = GAME.combo.step;
const COMBO_MAX = GAME.combo.max;
const PURCHASE_AMOUNT = GAME.purchase.amount;
const PURCHASE_TARGET_STOCK = GAME.staff.buyerTargetStockBase;
const HIRE_COST_HAWKER = GAME.staff.hireCost.hawker;
const HIRE_COST_SERVER = GAME.staff.hireCost.server;
const HIRE_COST_COOK = GAME.staff.hireCost.cook;
const HIRE_COST_BUYER = GAME.staff.hireCost.buyer;
const CHRONICLE_MAX_LINES = 1;
const SAVE_KEY = "tavern_save_v2";
const AUTOSAVE_MS = 2000;
/** 随机事件上限；实际次数按当天客人数缩放（约每 5 位 1 次）。 */
const MAX_EVENTS_PER_SESSION = GAME.events.maxPerSession;

const SEAT_BASE_MS = GAME.timing.seatBaseMs;
const SEAT_TAVERN_SHRINK_PER_LEVEL_MS = GAME.timing.seatShrinkPerLevelMs;
const SEAT_FLOOR_MS = GAME.timing.seatFloorMs;
const COOK_TAVERN_SHRINK_PER_LEVEL_MS = GAME.timing.cookShrinkPerLevelMs;
const COOK_FLOOR_MS = GAME.timing.cookFloorMs;

const COLOR_PLAYER = 0xffa94d;
const COLOR_STAFF = 0x4da6ff;

// ===== 视觉/布局 =====
const SCREEN_W = 720;
const SCREEN_H = 1280;
/** 界面分区（见 GLOSSARY）：状态栏 / 主屏 / 副屏。 */
const STATUS_BAR_H = 124;
const XIAN_FONT = '"KaiTi","STKaiti","Kaiti SC","Noto Serif SC",serif';
/** 旧的平滑标题页保留作回退；当前用 ink-title 像素底。 */
const USE_VECTOR_TITLE = false;
const CARD_W = 600;

const EXTERIOR_X = -2000;
const CAMERA_OPEN_X = 60;
const CAMERA_CLOSED_X = -2000;
const TAVERN_W = 360;
const SKY_TRANSITION_MS = 2000;

const FLOOR_Y = 1010;
const ACTOR_Y = FLOOR_Y - 34;
const TABLE_X_MIN = -250;
const TABLE_X_MAX = 250;
const QUEUE_X = 300;
const QUEUE_GAP = 84;
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
  floor: number;
  state: BoothState;
  cookingDriver: Driver | null;
  currentDish: Dish | null;
  cookStartedAt: number;
  cookDoneAt: number;
  departAt: number;
  awaitingSince: number;
  /** 起锅时锁定的连击加价比例，离店结算时按此生效。 */
  comboBonus: number;
  patronChar?: Character;
  patronKind: PatronKind | null;
  patronWish: string | null;
  patronName: string | null;
  patronRegular: boolean;
  diningProp?: Phaser.GameObjects.Container;
}
interface BoothVisual {
  floor: number;
  bg: Phaser.GameObjects.Rectangle;
  runner: Phaser.GameObjects.Rectangle;
  number: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  legs: Phaser.GameObjects.Rectangle[];
  barBg: Phaser.GameObjects.Rectangle;
  barFill: Phaser.GameObjects.Rectangle;
  zone: Phaser.GameObjects.Zone;
  candleGlow: Phaser.GameObjects.Image;
  candleBody: Phaser.GameObjects.Rectangle;
  candleFlame: Phaser.GameObjects.Ellipse;
}
interface QueuedPatron {
  expiresAt: number;
  patienceMs: number;
  char: Character;
  kind: PatronKind;
  wish: string | null;
  name: string;
  regular: boolean;
}

interface RegularGuest {
  name: string;
  kindId: string;
  wish: string;
  visits: number;
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
  v: 2;
  coins: number;
  inventory: number;
  level: number;
  stoveLevel: number;
  signLevel: number;
  /** 修仙界对本店的累计印象，决定每天到店人数与稀客比例。 */
  reputation: number;
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
  regulars?: RegularGuest[];
  /** 当日目标快照：读档后不能因等级变化换目标，否则同一目标会显示两个数。 */
  dailyGoal?: DailyGoal | null;
  goalStreak?: number;
  /** 最近一次领开市利是的本机日期（YYYY-MM-DD）与连续天数。 */
  lastGiftDate?: string;
  giftStreak?: number;
  floorsBuilt?: number;
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
      .setStrokeStyle(1, 0x666666)
      .setDepth(31);
    const barX = x + width - ProgressButton.BAR_WIDTH - 10;
    this.staffFill = scene.add.rectangle(barX, y + 5, 0, 11, COLOR_STAFF).setOrigin(0, 0).setDepth(31);
    this.playerFill = scene.add
      .rectangle(barX, y + height - 16, 0, 11, COLOR_PLAYER)
      .setOrigin(0, 0)
      .setDepth(31);
    this.label = scene.add
      .text(x + 10, y + height / 2, "", { fontSize: "15px", color: "#ffffff" })
      .setOrigin(0, 0.5)
      .setDepth(31);
    this.zone = scene.add.zone(x, y, width, height).setOrigin(0, 0).setDepth(31);
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
  private glintL: Phaser.GameObjects.Arc;
  private glintR: Phaser.GameObjects.Arc;
  private aura?: Phaser.GameObjects.Arc;
  private patienceBg?: Phaser.GameObjects.Rectangle;
  private patienceFill?: Phaser.GameObjects.Rectangle;
  private idleTween?: Phaser.Tweens.Tween;
  private walkTween?: Phaser.Tweens.Tween;
  private bubble?: Phaser.GameObjects.Text;
  private bubbleTail?: Phaser.GameObjects.Triangle;
  private dining = false;
  private seated = false;
  private mood: "idle" | "waiting" | "dining" | "cold" = "idle";
  private static readonly ART_SCALE = 1.22;
  private pixelImage?: Phaser.GameObjects.Image;
  private pixelEnabled = true;
  private pixelBlink = false;
  private bodyColor: number;
  private hairColor: number;
  private longHair: boolean;
  private look: CharacterLook;
  /** 特写字幕用：食客姓名或掌柜/伙计的岗位。 */
  displayName?: string;
  /** 进场动画未完成前不能招待，避免御剑/乘云途中被拉去入座。 */
  arrived = true;
  /** 最近一句台词，特写时并进字幕，避免气泡与桌卡叠字。 */
  lastLine?: string;

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
    // 很淡的暖背光，把人物从深色墙面/柜台上托起来
    this.add(
      scene.add
        .image(0, -20, "soft-glow")
        .setTint(0xffb060)
        .setAlpha(0.07)
        .setScale(0.55)
        .setBlendMode(Phaser.BlendModes.ADD),
    );
    this.visual = scene.add.container(0, 0);
    this.visual.setScale(Character.ART_SCALE);
    this.art = scene.add.graphics();
    this.visual.add(this.art);
    this.eyeWhiteL = scene.add.circle(-4, -19, 3, 0xfff6e8).setDepth(1);
    this.eyeWhiteR = scene.add.circle(4, -19, 3, 0xfff6e8).setDepth(1);
    const pupil =
      look === "demonlord"
        ? 0x8a1a1a
        : look === "elder"
          ? 0x3a4a6a
          : look === "demon"
            ? 0x5a2a1a
            : look === "sword"
              ? 0x1a1a2a
              : 0x2a1c16;
    this.eyeL = scene.add.circle(-4, -19, 1.4, pupil).setDepth(2);
    this.eyeR = scene.add.circle(4, -19, 1.4, pupil).setDepth(2);
    const eyeRadius =
      look === "elder" ? 2.5 : look === "mortal" ? 3.2 : look === "sword" ? 2.7 : look === "demon" ? 2.9 : 3;
    const pupilRadius =
      look === "demon" || look === "demonlord" ? 1.7 : look === "elder" ? 1.1 : 1.4;
    this.eyeWhiteL.setRadius(eyeRadius);
    this.eyeWhiteR.setRadius(eyeRadius);
    this.eyeL.setRadius(pupilRadius);
    this.eyeR.setRadius(pupilRadius);
    this.glintL = scene.add.circle(-4.8, -20.2, 0.8, 0xffffff, 0.92).setDepth(3);
    this.glintR = scene.add.circle(3.2, -20.2, 0.8, 0xffffff, 0.92).setDepth(3);
    this.visual.add([this.eyeWhiteL, this.eyeWhiteR, this.eyeL, this.eyeR, this.glintL, this.glintR]);
    this.pixelImage = scene.add
      .image(0, 44, getPixelTexture(scene, this.pixelStyle()))
      .setOrigin(0.5, 1)
      .setScale(1.35);
    this.visual.add(this.pixelImage);
    this.art.setVisible(false);
    [this.eyeWhiteL, this.eyeWhiteR, this.eyeL, this.eyeR, this.glintL, this.glintR].forEach((e) =>
      e.setVisible(false),
    );
    this.add(this.visual);
    this.draw();
    this.setDepth(20);
    scene.add.existing(this);
    scene.tweens.add({
      targets: [this.eyeWhiteL, this.eyeWhiteR, this.eyeL, this.eyeR, this.glintL, this.glintR],
      scaleY: 0.12,
      duration: 70,
      yoyo: true,
      repeat: -1,
      repeatDelay: Phaser.Math.Between(2200, 5200),
      delay: Phaser.Math.Between(600, 4000),
    });
    this.startIdle();
    const blink = () => {
      if (!this.active || !this.pixelEnabled) return;
      this.pixelBlink = true;
      this.drawPixel();
      this.scene.time.delayedCall(110, () => {
        if (!this.active) return;
        this.pixelBlink = false;
        this.drawPixel();
        this.scene.time.delayedCall(Phaser.Math.Between(2400, 5200), blink);
      });
    };
    this.scene.time.delayedCall(Phaser.Math.Between(1200, 3000), blink);
    // 修士的细碎灵光：给剑修/丹修/长老/妖修一点“飘”的气
    const ethereal: Record<string, number> = {
      sword: 0xb8d8f0,
      elder: 0xffe6a8,
      alchemist: 0xa8e8c0,
      demon: 0xff8a6a,
      demonlord: 0xff5a5a,
    };
    if (ethereal[look]) {
      this.scene.time.addEvent({
        delay: 1500,
        loop: true,
        callback: () => {
          if (!this.active || !this.pixelEnabled) return;
          for (let i = 0; i < 2; i++) {
            const dot = this.scene.add
              .rectangle(
                this.x + Phaser.Math.Between(-26, 26),
                this.y - Phaser.Math.Between(10, 58),
                2,
                2,
                ethereal[look],
                0.7,
              )
              .setDepth(this.depth + 0.6);
            this.scene.tweens.add({
              targets: dot,
              y: dot.y - Phaser.Math.Between(14, 30),
              x: dot.x + Phaser.Math.Between(-8, 8),
              alpha: 0,
              duration: Phaser.Math.Between(900, 1500),
              onComplete: () => dot.destroy(),
            });
          }
        },
      });
    }
    // 点人物会回一句身份台词；用拖动阈值区分镜头拖拽
    this.setInteractive(new Phaser.Geom.Rectangle(-40, -70, 80, 118), Phaser.Geom.Rectangle.Contains);
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

  private pixelStyle(): PixelStyle {
    return {
      body: this.bodyColor,
      hair: this.hairColor,
      longHair: this.longHair,
      look: this.look,
      seated: this.seated,
      dining: this.dining,
      blink: this.pixelBlink,
    };
  }

  private drawPixel() {
    if (!this.pixelImage) return;
    this.pixelImage.setTexture(getPixelTexture(this.scene, this.pixelStyle()));
  }

  usePixelArt(enabled: boolean) {
    this.pixelEnabled = enabled;
    this.pixelImage?.setVisible(enabled);
    this.art.setVisible(!enabled);
    [this.eyeWhiteL, this.eyeWhiteR, this.eyeL, this.eyeR, this.glintL, this.glintR].forEach((e) =>
      e.setVisible(!enabled),
    );
    this.draw();
  }

  private draw() {
    if (this.pixelEnabled && this.pixelImage) {
      this.drawPixel();
      return;
    }
    const g = this.art;
    const body = this.bodyColor;
    const dark = this.shade(body, 0.72);
    const deep = this.shade(body, 0.5);
    const skin =
      this.look === "elder"
        ? 0xf2e8d8
        : this.look === "demon" || this.look === "demonlord"
          ? 0xe8c8a8
          : this.look === "mortal"
            ? 0xf0d0b0
            : 0xffe0bd;
    const headR =
      this.look === "mortal" ? 11.8 : this.look === "elder" ? 11.3 : this.look === "sword" ? 10.6 : 11;
    const faceW =
      this.look === "mortal" ? 1.04 : this.look === "sword" ? 0.94 : this.look === "demon" ? 0.97 : 1;
    const hair = this.hairColor;
    const trim =
      this.look === "demon" || this.look === "demonlord"
        ? 0x8a2a22
        : this.look === "elder"
          ? 0xd9b45a
          : 0xbfa06a;
    g.clear();

    // 影子与脚
    g.fillStyle(0x000000, 0.24);
    g.fillEllipse(0, 40, 38, 10);
    if (!this.dining && !this.seated) {
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
    // 受光面/暗面与下摆滚边，别让袍子是一块纯色
    g.fillStyle(0xffffff, 0.08);
    g.beginPath();
    g.moveTo(-9, -8);
    g.lineTo(-2, -8);
    g.lineTo(-6, 28);
    g.lineTo(-13, 28);
    g.closePath();
    g.fillPath();
    g.fillStyle(0x000000, 0.1);
    g.beginPath();
    g.moveTo(4, -8);
    g.lineTo(9, -8);
    g.lineTo(13, 28);
    g.lineTo(5, 28);
    g.closePath();
    g.fillPath();
    g.fillStyle(trim, 0.92);
    g.fillRect(-13, 25, 26, 3);
    if (this.dining || this.seated) {
      // 坐姿下摆：腿收起，衣摆摊在桌后
      g.fillStyle(deep, 1);
      g.fillEllipse(0, 31, 36, 12);
      g.fillStyle(body, 1);
      g.fillEllipse(0, 30, 29, 9);
      g.lineStyle(1.5, trim, 0.55);
      g.lineBetween(-13, 32, 13, 32);
    }
    // 衣褶
    g.lineStyle(1.5, deep, 0.7);
    g.lineBetween(-5, 2, -7, 26);
    g.lineBetween(6, 4, 8, 26);
    // 宽袖
    g.fillStyle(dark, 1);
    g.fillRoundedRect(-18, -4, 9, 22, 4);
    g.fillRoundedRect(9, -4, 9, 22, 4);
    g.fillStyle(trim, 0.8);
    g.fillRect(-18, 9, 9, 3);
    g.fillRect(9, 9, 9, 3);
    g.fillStyle(skin, 1);
    g.fillCircle(-14, 18, 3.2);
    g.fillCircle(14, 18, 3.2);
    g.lineStyle(1, 0xd8a07a, 0.65);
    g.lineBetween(-16, 18, -12, 18);
    g.lineBetween(12, 18, 16, 18);
    // 腰带
    g.fillStyle(0x2a211a, 1);
    g.fillRect(-13, 8, 26, 5);
    g.fillStyle(0xd9b45a, 0.9);
    g.fillRect(-3, 8, 6, 5);
    g.fillCircle(0, 10.5, 2.1);
    g.fillStyle(0x8a2a22, 0.9);
    g.fillRect(-1.5, 12, 3, 7);
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
    if (this.dining) {
      // 用膳时手搭在桌沿/碗边，别让双手垂在身侧
      g.fillStyle(0x000000, 0.1);
      g.fillEllipse(0, 28, 34, 8);
      g.lineStyle(3, dark, 1);
      g.lineBetween(-13, 19, 6, 12);
      g.lineBetween(13, 19, 14, 10);
      g.fillStyle(skin, 1);
      g.fillCircle(6, 12, 2.6);
      g.fillCircle(14, 10, 2.6);
      g.lineStyle(1, 0xd8a07a, 0.65);
      g.lineBetween(4, 12, 8, 12);
      g.lineBetween(12, 10, 16, 10);
      g.lineStyle(2, 0x6a4a2a, 1);
      g.lineBetween(11, 4, 18, -3);
    }

    // 长发/后发
    if (this.longHair) {
      g.fillStyle(hair, 1);
      g.fillRoundedRect(-11, -26, 22, 50, 8);
    }
    // 脖子与头
    g.fillStyle(skin, 1);
    g.fillRect(-3, -12, 6, 5);
    g.fillEllipse(0, -20, headR * 2 * faceW, headR * 2);
    // 脸侧阴影/颧骨高光，别是一块纯色圆
    g.fillStyle(0xc08060, 0.1);
    g.fillEllipse(headR * 0.45 * faceW, -18, headR * 0.8, headR * 1.5);
    g.fillStyle(0xffffff, 0.08);
    g.fillEllipse(-headR * 0.4 * faceW, -24, headR * 0.5, headR * 0.5);
    g.lineStyle(1.2, 0x4a3226, 0.35);
    g.strokeEllipse(0, -20, headR * 2 * faceW, headR * 2);
    // 上眼睑
    g.lineStyle(1, 0x4a2a20, 0.5);
    g.lineBetween(-6.5, -21.4, -1.5, -21.4);
    g.lineBetween(1.5, -21.4, 6.5, -21.4);
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
    if (this.mood === "waiting") {
      g.lineBetween(-7, -24, -2, -21);
      g.lineBetween(2, -21, 7, -24);
    } else if (this.mood === "cold") {
      g.lineBetween(-7, -21, -2, -21);
      g.lineBetween(2, -21, 7, -21);
    } else if (this.mood === "dining") {
      g.lineBetween(-7, -21, -2, -23);
      g.lineBetween(2, -23, 7, -21);
    } else {
      g.lineBetween(-7, -22.5, -2, -22.5);
      g.lineBetween(2, -22.5, 7, -22.5);
    }
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
    // 耳朵、鼻子与发顶高光
    g.fillStyle(skin, 1);
    g.fillCircle(-(headR * faceW - 0.5), -17, 2.4);
    g.fillCircle(headR * faceW - 0.5, -17, 2.4);
    g.fillStyle(0xd8a07a, 0.55);
    g.fillCircle(-(headR * faceW - 0.5), -17, 1);
    g.fillCircle(headR * faceW - 0.5, -17, 1);
    g.lineStyle(1, 0xd8a07a, 0.7);
    g.lineBetween(1, -17, 2, -15);
    // 年龄/身份留下的小痕迹
    if (this.look === "mortal") {
      g.fillStyle(0xc88870, 0.55);
      for (const [fx, fy] of [
        [-6, -17],
        [-2, -16],
        [2, -17],
        [6, -16],
      ]) {
        g.fillCircle(fx, fy, 0.7);
      }
    } else if (this.look === "elder") {
      g.lineStyle(1, 0xb09070, 0.4);
      g.lineBetween(-6, -27, -2, -27);
      g.lineBetween(2, -27, 6, -27);
      g.lineBetween(-5, -29, -2, -29);
    } else if (this.look === "sword") {
      g.lineStyle(1, 0xb06a5a, 0.6);
      g.lineBetween(-7, -14, -4, -11);
    }
    g.fillStyle(this.shade(hair, 1.6), 0.35);
    g.fillEllipse(-4, -31, 12, 4);
    g.lineStyle(1, this.shade(hair, 1.6), 0.4);
    g.lineBetween(-6, -28, -9, -16);
    // 额前碎发
    g.lineStyle(1, this.shade(hair, 1.25), 0.5);
    g.lineBetween(-7, -28, -4, -23);
    g.lineBetween(-2, -30, 0, -24);
    g.lineBetween(3, -29, 5, -23);
    // 嘴：等菜微愁，用膳张嘴笑并带一点腮红，稀客冷脸
    if (this.mood === "dining") {
      g.lineStyle(1.2, 0x7a3a30, 0.85);
      g.beginPath();
      g.arc(0, -13, 3.8, 0.15, Math.PI - 0.15, false);
      g.strokePath();
      g.fillStyle(0x7a3a30, 0.95);
      g.fillEllipse(0, -12, 5.4, 2.6);
      g.fillStyle(0xffb0a0, 0.45);
      g.fillCircle(-7, -16, 3.2);
      g.fillCircle(7, -16, 3.2);
    } else if (this.mood === "waiting") {
      g.lineStyle(1.2, 0x9a5a4a, 0.8);
      g.beginPath();
      g.arc(0, -10, 2.4, Math.PI, Math.PI * 2, false);
      g.strokePath();
    } else if (this.mood === "cold") {
      g.lineStyle(1.2, 0x9a5a4a, 0.8);
      g.lineBetween(-2, -12, 2, -12);
    } else {
      g.lineStyle(1.3, 0x9a5a4a, 0.9);
      g.beginPath();
      g.arc(0, -13, 3, 0, Math.PI, false);
      g.strokePath();
    }

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

  /** 特写用：同一套配色/身份/状态的肖像副本。 */
  portraitSpec() {
    return {
      bodyColor: this.bodyColor,
      hairColor: this.hairColor,
      longHair: this.longHair,
      look: this.look,
      mood: this.mood,
      dining: this.dining,
      seated: this.seated,
    };
  }

  /** 表情：排队等菜微愁、用膳张嘴笑、稀客冷脸。 */
  setMood(mood: "idle" | "waiting" | "dining" | "cold") {
    if (this.mood === mood) return;
    this.mood = mood;
    this.draw();
  }

  /** 入座后整个人沉到桌后；等菜和用膳都保持坐姿。 */
  setSeated(on: boolean) {
    if (this.seated === on || !this.scene || !this.visual?.active) return;
    this.seated = on;
    this.setDepth(on ? 6.2 : 20);
    this.draw();
  }

  /** 用膳：收起腿、坐到桌后（桌沿挡住腰腿），再做咀嚼起伏。 */
  setDining(on: boolean) {
    if (this.dining === on || !this.scene || !this.visual?.active) return;
    this.dining = on;
    if (on && !this.seated) {
      this.seated = true;
      this.setDepth(6.2);
    }
    this.mood = on ? "dining" : "idle";
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
    this.lastLine = text;
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    const margin = Math.min(120, view.width * 0.22);
    const bx = Phaser.Math.Clamp(this.x, view.x + margin, view.right - margin);
    const bubble = this.scene.add
      .text(bx, this.y - 200, text, {
        fontSize: "20px",
        color: tone === "cold" ? "#d8e8ff" : "#2a1f14",
        backgroundColor: tone === "cold" ? "#2a3448" : "#f3e6cf",
        padding: { x: 9, y: 6 },
        fontFamily: '"KaiTi","STKaiti",serif',
        wordWrap: { width: 220 },
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

  /** 特写时收起聊天气泡，让字幕独占画面。 */
  clearBubble() {
    this.bubble?.destroy();
    this.bubbleTail?.destroy();
    this.bubble = undefined;
    this.bubbleTail = undefined;
  }

  isSpeaking(): boolean {
    return this.bubble !== undefined;
  }

  /** 碰杯时向对方歪一下身子，别只是原地上下跳。 */
  cheer(dir: 1 | -1) {
    if (!this.scene || !this.visual?.active) return;
    this.scene.tweens.add({
      targets: this.visual,
      angle: dir * 7,
      duration: 190,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
      onComplete: () => this.visual.setAngle(0),
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
  /** 0=只有一楼，1=已起二楼，2=已起三楼。 */
  private floorsBuilt = 0;
  private activeFloor = 0;
  private interiorPixelImage!: Phaser.GameObjects.Image;
  private floorTabs: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text; sub: Phaser.GameObjects.Text }[] =
    [];
  private stoveLevel = 0;
  private signLevel = 0;
  private booths: Booth[] = [];
  private queue: QueuedPatron[] = [];
  private staffLevel: StaffLevels = { hawker: 0, server: 0, cook: 0, buyer: 0 };
  private staffExp: StaffLevels = { hawker: 0, server: 0, cook: 0, buyer: 0 };
  private chronicleLines: string[] = [];
  private cultivation = 0;
  /** 修仙界对本店的长期印象；服务客人累积，流失客人回退。 */
  private reputation = 0;
  private repGainedToday = 0;
  private repLostToday = 0;
  /** 同一帧内积累的流失，一次性结算，保证一批最多掉一级。 */
  private pendingRepLoss = 0;
  private meta: MetaStats = { ...EMPTY_META };
  /** 吃过满意一餐的熟客，隔日还会回来点同一道菜。 */
  private regulars: RegularGuest[] = [];
  private regularsToday = new Set<string>();
  /** 今天还没见到常客时，保证至少来一位，避免关系层在短局里完全隐身。 */
  private regularDueToday = false;
  /** 跑堂/灶上/采买是否自动；关掉后工资照付，玩家可亲自操作或省钱。 */
  private auto: AutoState = { server: true, cook: true, buyer: true };

  private gameState: GameState = "closed";
  private selectedDishIds = new Set<string>();
  private dishCursor = 0;
  private sessionEndsAt = 0;
  private sessionStartedAt = 0;
  /** 天色推进用的名义时长，随当天客人数变化。 */
  private sessionNominalMs = 90000;
  /** 当天已成型的客人总数：开市时按声望锁定，营业中升级次日才生效。 */
  private patronsTotal = 0;
  /** 已经到过店（含排队时被拒）的客人数，用于判断名单是否走完。 */
  private patronsSpawned = 0;
  private roundEnding = false;
  private sessionServed = 0;
  private firstGuestShown = false;
  private sessionRevenue = 0;
  private sessionLost = 0;
  private sessionWishes = 0;
  /** 因灵材见底而流失的客人数，结算时单独提示。 */
  private stockLost = 0;
  /** 门口排满而流失的客人数，单独提示，避免玩家只看到总流失。 */
  private queueLost = 0;
  private sessionCultivation = 0;
  private goalAnnounced = false;
  private day = 1;
  private ascensions = 0;
  private ascending = false;
  private suppressSave = false;
  private sessionGoal: DailyGoal | null = null;
  /** 当天目标在进入这一天时锁定，之后升级装潢不会临时抬高目标。 */
  private dailyGoal: DailyGoal | null = null;
  private lastGoalResult: {
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
  private goalStreak = 0;
  /** 本机日期与当日天时：跨天时在开店前刷新。 */
  private todayKey = localDateKey();
  private omen: OmenDef = getDailyOmen(localDateKey());
  private lastGiftDate?: string;
  private giftStreak = 0;
  private lastGift: { streak: number; coins: number; cultivation: number; ingredients: number } | null =
    null;
  /** 玩家连续命中口味的次数，上错菜清零；伙计出菜不影响。 */
  private combo = 0;

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
  private interiorSign?: Phaser.GameObjects.Text;
  private hudBar!: Phaser.GameObjects.Rectangle;
  private hudLine!: Phaser.GameObjects.Rectangle;
  private hudChips!: Phaser.GameObjects.Graphics;
  private rightFrame!: Phaser.GameObjects.Container;
  private closedBackdrop!: Phaser.GameObjects.Image;
  private closedFloorText!: Phaser.GameObjects.Text;
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
  private reputationText!: Phaser.GameObjects.Text;
  private reputationBarBg!: Phaser.GameObjects.Rectangle;
  private reputationBar!: Phaser.GameObjects.Rectangle;
  private chronicleText!: Phaser.GameObjects.Text;
  private omenBadge!: Phaser.GameObjects.Text;
  private comboBadge!: Phaser.GameObjects.Text;
  private boothVisuals: BoothVisual[] = [];

  private nextArrivalAt = 0;
  private nextEventAt = 0;
  private eventsThisSession = 0;
  /** HUD 上显示的灵石数，收益到账时从这里滚动到真实值。 */
  private displayedCoins = STARTING_COINS;
  private lastWages: { role: StaffRole; level: number; wage: number }[] = [];
  private lastLoanDues: { name: string; due: number }[] = [];
  private lastRent = 0;
  private activeLoans: { name: string; remaining: number; periodsLeft: number }[] = [];
  private borrowedIds = new Set<string>();
  private negativeStreak = 0;
  private sfxMuted = false;
  private sfxButton!: TapText;
  private staffButton!: TapText;
  private navPanel!: Phaser.GameObjects.Container;
  private navTitle!: Phaser.GameObjects.Text;
  private navCardObjects: (Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle)[] = [];
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
  /** 两桌同时用膳时的碰杯节流，保证不靠 5.6 秒随机闲聊也能看到。 */
  private lastClinkAt = 0;
  private focusChar?: Character;
  private focusCaption?: Phaser.GameObjects.Text;
  private focusOverlay?: Phaser.GameObjects.Rectangle;
  private focusPanel?: Phaser.GameObjects.Graphics;
  private focusPortrait?: Character;
  private focusProp?: Phaser.GameObjects.Container;
  private focusTable?: Phaser.GameObjects.Graphics;
  private focusName?: Phaser.GameObjects.Text;
  private focusRole?: Phaser.GameObjects.Text;
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

  /** 纸纹与暗角：给纯矢量画面加一层很薄的质感，避免大色块像 UI 原型。 */
  private ensurePaperTextures() {
    if (!this.textures.exists("paper-grain")) {
      const grain = this.textures.createCanvas("paper-grain", 256, 256);
      if (grain) {
        const ctx = grain.getContext();
        for (let i = 0; i < 1100; i++) {
          const light = Math.random() > 0.45;
          ctx.fillStyle = light
            ? `rgba(255,244,224,${0.02 + Math.random() * 0.04})`
            : `rgba(0,0,0,${0.02 + Math.random() * 0.04})`;
          ctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
        }
        grain.refresh();
      }
    }
    if (!this.textures.exists("vignette")) {
      const vig = this.textures.createCanvas("vignette", 360, 640);
      if (vig) {
        const ctx = vig.getContext();
        const grad = ctx.createRadialGradient(180, 300, 80, 180, 320, 390);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(0.62, "rgba(0,0,0,0.06)");
        grad.addColorStop(1, "rgba(0,0,0,0.55)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 360, 640);
        vig.refresh();
      }
    }
  }

  /** 一张手绘感的灵膳大碗：菜单空桌时用它，比几何椭圆更像“菜”。 */
  private ensureDishTexture() {
    if (this.textures.exists("dish-feast")) return;
    const tex = this.textures.createCanvas("dish-feast", 512, 512);
    if (!tex) return;
    const c = tex.getContext();
    c.clearRect(0, 0, 512, 512);
    // 桌面投影
    const shadow = c.createRadialGradient(256, 430, 20, 256, 430, 200);
    shadow.addColorStop(0, "rgba(0,0,0,0.42)");
    shadow.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = shadow;
    c.beginPath();
    c.ellipse(256, 430, 205, 38, 0, 0, Math.PI * 2);
    c.fill();
    // 陶碗外壁
    const bowl = c.createLinearGradient(0, 285, 0, 445);
    bowl.addColorStop(0, "#d8ded2");
    bowl.addColorStop(0.45, "#9aa89a");
    bowl.addColorStop(1, "#4d5a50");
    c.fillStyle = bowl;
    c.beginPath();
    c.moveTo(78, 300);
    c.bezierCurveTo(102, 438, 410, 438, 434, 300);
    c.closePath();
    c.fill();
    c.strokeStyle = "rgba(40,48,42,0.65)";
    c.lineWidth = 3;
    c.stroke();
    // 碗沿
    const rim = c.createLinearGradient(0, 255, 0, 350);
    rim.addColorStop(0, "#f3ead4");
    rim.addColorStop(0.5, "#d9c9a6");
    rim.addColorStop(1, "#a58a5f");
    c.fillStyle = rim;
    c.beginPath();
    c.ellipse(256, 300, 178, 44, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(255,230,170,0.55)";
    c.lineWidth = 2;
    c.stroke();
    // 汤
    const soup = c.createRadialGradient(220, 286, 12, 256, 310, 170);
    soup.addColorStop(0, "#e8b85f");
    soup.addColorStop(0.55, "#b8782f");
    soup.addColorStop(1, "#6d431c");
    c.fillStyle = soup;
    c.beginPath();
    c.ellipse(256, 305, 150, 33, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(80,40,10,0.35)";
    c.lineWidth = 2;
    c.stroke();
    // 面/汤面弧线
    c.lineCap = "round";
    c.strokeStyle = "rgba(255,229,166,0.9)";
    c.lineWidth = 6;
    for (const [sx, sy, dx, dy] of [
      [150, 302, 96, -8],
      [168, 314, 82, 4],
      [190, 296, 70, 6],
    ] as const) {
      c.beginPath();
      c.moveTo(sx, sy);
      c.bezierCurveTo(sx + dx * 0.4, sy + dy - 10, sx + dx * 0.75, sy + dy + 8, sx + dx, sy + dy);
      c.stroke();
    }
    // 青菜与配菜
    const leaf = (x: number, y: number, rot: number, color: string) => {
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      const grd = c.createLinearGradient(0, -10, 0, 10);
      grd.addColorStop(0, color);
      grd.addColorStop(1, "rgba(40,80,40,0.85)");
      c.fillStyle = grd;
      c.beginPath();
      c.ellipse(0, 0, 26, 9, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "rgba(220,240,190,0.4)";
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(-18, 0);
      c.lineTo(18, 0);
      c.stroke();
      c.restore();
    };
    leaf(200, 290, -0.3, "#8fbf62");
    leaf(318, 300, 0.4, "#6fa64e");
    leaf(286, 282, 0.1, "#a8d878");
    // 菌片与胡萝卜
    c.fillStyle = "#e8d6b0";
    c.beginPath();
    c.ellipse(338, 290, 13, 7, -0.3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#d97a3a";
    c.beginPath();
    c.arc(230, 318, 7, 0, Math.PI * 2);
    c.fill();
    // 油光
    c.fillStyle = "rgba(255,244,210,0.35)";
    c.beginPath();
    c.ellipse(205, 294, 28, 5, -0.1, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(330, 316, 18, 4, 0.2, 0, Math.PI * 2);
    c.fill();
    // 筷子
    c.save();
    c.rotate(0.58);
    c.fillStyle = "#6d3f20";
    c.fillRect(360, 170, 7, 210);
    c.fillStyle = "#8a5a32";
    c.fillRect(378, 170, 7, 210);
    c.fillStyle = "#d9b45a";
    c.fillRect(360, 170, 7, 18);
    c.fillRect(378, 170, 7, 18);
    c.restore();
    // 热气：柔边曲线
    c.lineCap = "round";
    for (const [sx, sy, h] of [
      [206, 260, 120],
      [256, 246, 150],
      [308, 262, 110],
    ] as const) {
      const steam = c.createLinearGradient(0, sy, 0, sy - h);
      steam.addColorStop(0, "rgba(255,240,215,0.0)");
      steam.addColorStop(0.3, "rgba(255,240,215,0.32)");
      steam.addColorStop(1, "rgba(255,240,215,0)");
      c.strokeStyle = steam;
      c.lineWidth = 10;
      c.beginPath();
      c.moveTo(sx, sy);
      c.bezierCurveTo(sx - 22, sy - h * 0.35, sx + 24, sy - h * 0.6, sx - 6, sy - h);
      c.stroke();
    }
    tex.refresh();
  }

  /** 水墨像素风的标题底：360×640 硬边像素，最近邻放大。 */
  private ensureInkTitleTexture() {
    if (this.textures.exists("ink-title")) return;
    const W = 360;
    const H = 640;
    const tex = this.textures.createCanvas("ink-title", W, H);
    if (!tex) return;
    const c = tex.getContext();
    const px = (x: number, y: number, w: number, h: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    c.fillStyle = "#070b14";
    c.fillRect(0, 0, W, H);
    // 天空的稀疏像素与星
    for (let i = 0; i < 6800; i++) {
      const x = Math.random() * W;
      const y = Math.random() * 470;
      const a = Math.random();
      px(x, y, 1, 1, a > 0.9 ? "#2a3a50" : a > 0.64 ? "#122032" : "#0b1421");
    }
    for (let i = 0; i < 34; i++) {
      px(Math.random() * W, Math.random() * 300, 1, 1, Math.random() > 0.7 ? "#d8c8a0" : "#6a7a8a");
    }
    // 月亮与抖动光晕
    const moon = (cx: number, cy: number, r: number, col: string, chance = 1) => {
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          if (x * x + y * y <= r * r && Math.random() < chance) px(cx + x, cy + y, 1, 1, col);
        }
      }
    };
    moon(272, 106, 34, "#1e2b3e", 0.35);
    moon(272, 106, 26, "#3a4a5e", 0.55);
    moon(272, 106, 20, "#f2e6c2", 1);
    moon(266, 100, 6, "#fff6dc", 1);
    // 云带
    for (const [y0, len] of [
      [150, 150],
      [172, 110],
      [206, 180],
    ] as const) {
      for (let i = 0; i < len * 2.4; i++) {
        px(Math.random() * 360, y0 + Math.random() * 18, 1, 1, Math.random() > 0.55 ? "#1a2638" : "#131e2e");
      }
    }
    // 山的像素三角：逐行填，保留硬边
    const tri = (pts: [number, number][], col: string, edge?: string) => {
      const ys = pts.map((p) => p[1]);
      const minY = Math.floor(Math.min(...ys));
      const maxY = Math.floor(Math.max(...ys));
      for (let y = minY; y <= maxY; y++) {
        const xs: number[] = [];
        for (let i = 0; i < pts.length; i++) {
          const [x1, y1] = pts[i];
          const [x2, y2] = pts[(i + 1) % pts.length];
          if ((y1 <= y && y2 >= y) || (y2 <= y && y1 >= y)) {
            if (y1 === y2) {
              xs.push(x1, x2);
            } else {
              xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
            }
          }
        }
        if (xs.length < 2) continue;
        const x0 = Math.floor(Math.min(...xs));
        const x1 = Math.ceil(Math.max(...xs));
        px(x0, y, Math.max(1, x1 - x0), 1, col);
        if (edge && Math.random() > 0.55) {
          px(x0, y, 1, 1, edge);
          px(x1 - 1, y, 1, 1, edge);
        }
      }
    };
    tri(
      [
        [0, 430],
        [90, 330],
        [180, 430],
      ],
      "#101b2a",
      "#1c2b3e",
    );
    tri(
      [
        [140, 440],
        [255, 312],
        [380, 440],
      ],
      "#0d1724",
      "#182638",
    );
    tri(
      [
        [0, 470],
        [70, 390],
        [165, 470],
      ],
      "#0a1420",
      "#152234",
    );
    // 雾气
    for (let i = 0; i < 420; i++) {
      px(20 + Math.random() * 320, 420 + Math.random() * 30, 1, 1, Math.random() > 0.5 ? "#1a2838" : "#243448");
    }
    // 前景山坡与地面
    for (let i = 0; i < 520; i++) {
      px(Math.random() * W, 592 + Math.random() * 48, 1, 1, Math.random() > 0.5 ? "#0b1018" : "#070b12");
    }
    px(0, 618, W, 22, "#0c131b");
    // 左侧松影
    px(67, 512, 5, 108, "#0a1110");
    px(59, 520, 8, 3, "#0c1614");
    px(71, 548, 8, 3, "#0c1614");
    for (const [lx, ly] of [
      [56, 514],
      [64, 528],
      [52, 540],
      [68, 554],
    ] as const) {
      px(lx, ly, 12, 3, "#0c1714");
      px(lx - 3, ly - 2, 9, 2, "#0e1a16");
    }
    // 右侧竹影
    for (const [bx, top] of [
      [292, 520],
      [300, 548],
      [284, 566],
    ] as const) {
      px(bx, top, 2, 110, "#101a14");
      px(bx - 4, top + 14, 10, 2, "#16241a");
      px(bx - 6, top + 38, 12, 2, "#16241a");
      px(bx - 4, top + 62, 10, 2, "#16241a");
    }
    // 两层屋檐
    tri(
      [
        [180, 514],
        [74, 558],
        [286, 558],
      ],
      "#4a201a",
      "#9a3a2a",
    );
    px(68, 556, 26, 3, "#6a2a20");
    px(266, 556, 26, 3, "#6a2a20");
    tri(
      [
        [180, 508],
        [96, 544],
        [264, 544],
      ],
      "#2a1411",
      "#7a2f22",
    );
    for (let y = 518; y < 556; y += 5) {
      const half = Math.floor(((y - 508) / 36) * 84);
      px(180 - half, y, half * 2, 1, "#5a241a");
    }
    // 墙体与柱
    px(112, 558, 136, 62, "#2a1c14");
    px(118, 564, 124, 56, "#3a2818");
    px(112, 558, 10, 62, "#20140d");
    px(238, 558, 10, 62, "#20140d");
    px(112, 558, 136, 3, "#5a3a22");
    // 匾额
    px(154, 558, 52, 14, "#1a120c");
    px(156, 560, 48, 10, "#3a2416");
    px(156, 560, 48, 1, "#d9b45a");
    px(156, 569, 48, 1, "#d9b45a");
    px(176, 563, 3, 4, "#e8c070");
    px(182, 563, 3, 4, "#e8c070");
    // 窗与暖光
    for (const wx of [128, 206]) {
      px(wx, 574, 28, 26, "#3a2a1a");
      px(wx + 2, 576, 24, 22, "#e0a050");
      px(wx + 2, 576, 24, 2, "#f4c878");
      px(wx + 13, 576, 2, 22, "#3a2a1a");
      px(wx + 2, 586, 24, 2, "#3a2a1a");
      for (let i = 0; i < 16; i++) {
        px(wx + 1 + Math.random() * 26, 573 - Math.random() * 10, 1, 1, Math.random() > 0.5 ? "#5a4a3a" : "#3a3028");
      }
      for (let i = 0; i < 10; i++) {
        px(wx + 3 + Math.random() * 22, 578 + Math.random() * 18, 1, 1, "#ffd08a");
      }
    }
    // 门与台阶
    px(172, 588, 16, 32, "#160f0a");
    px(174, 590, 12, 30, "#0b0806");
    px(170, 618, 20, 4, "#4a3420");
    px(166, 622, 28, 3, "#3a2818");
    // 灯笼
    for (const lx of [100, 260]) {
      px(lx - 1, 550, 2, 8, "#1a120a");
      px(lx - 4, 558, 9, 11, "#a02a20");
      px(lx - 3, 559, 7, 8, "#ff6a3a");
      px(lx - 2, 560, 3, 5, "#ffd08a");
      px(lx - 1, 569, 2, 5, "#d9b45a");
      for (let i = 0; i < 10; i++) {
        px(lx - 8 + Math.random() * 16, 556 + Math.random() * 16, 1, 1, "#6a3a2a");
      }
    }
    // 门前石径与草
    for (let i = 0; i < 40; i++) px(150 + Math.random() * 60, 622 + Math.random() * 16, 1, 1, "#3a3a30");
    for (let i = 0; i < 24; i++) px(80 + Math.random() * 200, 626 + Math.random() * 12, 1, 1, "#1a2418");
    // 鹤影
    for (const [cx, cy] of [
      [150, 190],
      [198, 166],
    ] as const) {
      px(cx - 5, cy + 1, 3, 1, "#0a1018");
      px(cx + 2, cy + 1, 3, 1, "#0a1018");
      px(cx - 2, cy, 1, 1, "#0a1018");
      px(cx + 1, cy, 1, 1, "#0a1018");
    }
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  /** 营业内景的像素底：墙、窗、挂画、后柜、灶台、门与地面。 */
  private ensureInkInteriorTexture() {
    if (this.textures.exists("ink-interior")) return;
    const W = 395;
    const H = 640;
    const tex = this.textures.createCanvas("ink-interior", W, H);
    if (!tex) return;
    const c = tex.getContext();
    const px = (x: number, y: number, w: number, h: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    const dab = (x: number, y: number, w: number, col: string) => {
      for (let i = 0; i < w; i++) px(x + Math.random() * w, y + Math.random() * 3, 1, 1, col);
    };
    // 墙
    px(0, 0, W, 505, "#3a2a20");
    px(0, 0, W, 9, "#5a4330");
    px(0, 496, W, 9, "#241a12");
    for (let y = 55; y < 496; y += 55) px(0, y, W, 1, "#2e2118");
    for (const x of [25, 90, 152, 208, 270, 335, 390]) px(x, 0, 3, 505, "#2a1c14");
    // 墙面墨点
    for (let i = 0; i < 900; i++) {
      px(Math.random() * W, Math.random() * 500, 1, 1, Math.random() > 0.5 ? "#302218" : "#422f22");
    }
    // 山水挂画
    px(101, 205, 158, 82, "#1a120c");
    px(105, 209, 150, 74, "#c8b89a");
    px(108, 212, 144, 68, "#d8c8a8");
    for (let i = 0; i < 5; i++) {
      const bx = 120 + i * 24;
      const bh = 18 + Math.random() * 20;
      for (let y = 0; y < bh; y++) px(bx + y * 0.4, 270 - y, 22 - y * 0.3, 1, i % 2 ? "#5a6a5a" : "#4a5a50");
    }
    px(236, 266, 7, 8, "#8a2a22");
    // 匾额
    px(127, 87, 106, 38, "#1a120c");
    px(131, 91, 98, 30, "#3a2416");
    px(131, 91, 98, 1, "#d9b45a");
    px(131, 120, 98, 1, "#d9b45a");
    px(220, 100, 8, 10, "#8a2a22");
    // 窗
    for (const wx of [102, 212]) {
      px(wx - 3, 134, 51, 61, "#2a1a10");
      px(wx, 137, 45, 55, "#1a2638");
      px(wx + 2, 139, 41, 51, "#d99a4a");
      px(wx + 2, 139, 41, 2, "#f4c878");
      px(wx + 22, 139, 2, 51, "#2a1a10");
      px(wx + 2, 162, 41, 2, "#2a1a10");
      // 窗中山与云
      for (let i = 0; i < 6; i++) px(wx + 6 + i * 5, 182 - i * 3, 8, 1, "#3a4a3a");
      dab(wx + 2, 176, 40, "#5a4a32");
      // 暖光
      for (let i = 0; i < 18; i++) px(wx + 4 + Math.random() * 37, 142 + Math.random() * 44, 1, 1, "#ffd08a");
      dab(wx - 2, 196, 48, "#5a3a24");
    }
    // 左侧货架酒坛
    px(15, 250, 65, 8, "#3a2a1a");
    px(15, 310, 65, 8, "#3a2a1a");
    px(15, 370, 65, 8, "#3a2a1a");
    px(17, 250, 3, 128, "#241810");
    px(76, 250, 3, 128, "#241810");
    for (const [row, y] of [232, 292, 352].entries()) {
      for (let j = 0; j < 3; j++) {
        const jx = 24 + j * 19;
        const col = ["#5a7a6a", "#b8742a", "#d8c8a8"][j];
        px(jx, y + 10, 11, 18, col);
        px(jx + 2, y + 6, 7, 5, col);
        px(jx + 4, y + 7, 3, 2, "#2a1a10");
        if (row === 1 && j === 0) px(jx + 4, y + 16, 3, 5, "#d9b45a");
      }
    }
    // 后柜
    px(80, 415, 200, 7, "#1a120c");
    px(80, 422, 200, 48, "#2a1c12");
    px(80, 422, 200, 2, "#5a3a22");
    for (let x = 100; x < 280; x += 30) px(x, 428, 1, 38, "#1a120c");
    for (const [jx, col] of [
      [90, "#5a7a6a"],
      [112, "#b8742a"],
      [134, "#d8c8a8"],
      [230, "#6a7a9a"],
      [252, "#b8742a"],
    ] as const) {
      px(jx, 397, 11, 18, col);
      px(jx + 2, 393, 7, 5, col);
      px(jx + 4, 394, 3, 2, "#2a1a10");
    }
    // 茶壶与算盘
    px(160, 400, 14, 14, "#6a4a2a");
    px(166, 396, 3, 6, "#6a4a2a");
    px(178, 414, 18, 4, "#8a5a32");
    for (let i = 0; i < 5; i++) px(180 + i * 3, 415, 1, 2, "#d9b45a");
    // 小黑猫
    px(246, 408, 10, 6, "#2a2a30");
    px(254, 401, 6, 6, "#2a2a30");
    px(254, 399, 2, 3, "#2a2a30");
    px(259, 399, 2, 3, "#2a2a30");
    px(256, 403, 1, 1, "#ffd98a");
    px(259, 403, 1, 1, "#ffd98a");
    // 挂着的木牌菜单
    for (const bx of [160, 200, 240]) {
      px(bx, 300, 1, 20, "#6a4a2a");
      px(bx - 12, 320, 25, 34, "#1a120c");
      px(bx - 10, 323, 21, 28, "#3a2818");
      px(bx - 10, 323, 21, 1, "#d9b45a");
      for (let i = 0; i < 3; i++) px(bx - 5, 330 + i * 6, 11, 1, "#c8b89a");
    }
    // 灶台
    px(7, 440, 75, 65, "#7a7268");
    px(7, 432, 75, 12, "#5f5850");
    px(20, 418, 38, 16, "#4a4a4a");
    px(22, 414, 34, 8, "#8a827a");
    for (let i = 0; i < 8; i++) {
      px(28 + Math.random() * 24, 414 + Math.random() * 8, 2, 2, i % 2 ? "#ff7a3a" : "#ffd06a");
    }
    for (let i = 0; i < 5; i++) px(8 + i * 14, 496, 11, 4, "#8a8276");
    // 门口与红帘
    px(296, 410, 88, 95, "#2a1a10");
    px(302, 416, 76, 89, "#1a120c");
    px(330, 416, 8, 89, "#5a3a22");
    for (let i = 0; i < 4; i++) px(305 + i * 17, 416, 13, 20, i % 2 ? "#8b2f22" : "#a03a2a");
    px(298, 505, 84, 6, "#4a3420");
    dab(310, 505, 60, "#ffb060");
    // 地面
    px(0, 505, W, 135, "#6a5238");
    for (let y = 512; y < 640; y += 14) px(0, y, W, 1, "#4a3826");
    for (let x = 8; x < W; x += 26) px(x, 505, 1, 135, "#5a442e");
    for (let i = 0; i < 700; i++) px(Math.random() * W, 505 + Math.random() * 135, 1, 1, "#57422c");
    // 灯笼
    for (const lx of [40, 320]) {
      px(lx - 1, 184, 2, 6, "#1a120a");
      px(lx - 4, 190, 9, 12, "#a02a20");
      px(lx - 2, 192, 5, 7, "#ff6a3a");
      px(lx - 1, 202, 2, 4, "#d9b45a");
      dab(lx - 8, 190, 18, "#6a3a24");
      dab(lx - 12, 198, 26, "#5a3424");
    }
    // 两束斜光，抖动像素
    for (let i = 0; i < 380; i++) {
      const y = 195 + Math.random() * 300;
      const x = 108 + (y - 195) * 0.45 + (Math.random() - 0.5) * 34;
      px(x, y, 1, 1, Math.random() > 0.5 ? "#7a5a3a" : "#8a6844");
    }
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  /** 打烊页的像素酒楼：夜空、山、门窗、灯笼，替掉平滑矢量立面。 */
  private ensureClosedInkTexture() {
    if (this.textures.exists("ink-closed")) return;
    const W = 360;
    const H = 640;
    const tex = this.textures.createCanvas("ink-closed", W, H);
    if (!tex) return;
    const c = tex.getContext();
    const px = (x: number, y: number, w: number, h: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    };
    c.fillStyle = "#070b14";
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 6500; i++) {
      const a = Math.random();
      px(Math.random() * W, Math.random() * 420, 1, 1, a > 0.9 ? "#2a3a50" : a > 0.65 ? "#122032" : "#0b1421");
    }
    for (let i = 0; i < 30; i++) px(Math.random() * W, Math.random() * 220, 1, 1, "#6a7a8a");
    // 月
    for (let y = -16; y <= 16; y++) {
      for (let x = -16; x <= 16; x++) {
        if (x * x + y * y <= 256) px(292 + x, 86 + y, 1, 1, "#f2e6c2");
        else if (x * x + y * y <= 400 && Math.random() < 0.25) px(292 + x, 86 + y, 1, 1, "#2a3a4c");
      }
    }
    // 山
    const tri = (pts: [number, number][], col: string, edge: string) => {
      const ys = pts.map((p) => p[1]);
      for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) {
        const xs: number[] = [];
        for (let i = 0; i < pts.length; i++) {
          const [x1, y1] = pts[i];
          const [x2, y2] = pts[(i + 1) % pts.length];
          if ((y1 <= y && y2 >= y) || (y2 <= y && y1 >= y)) {
            xs.push(y1 === y2 ? x1 : x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
          }
        }
        if (xs.length < 2) continue;
        const x0 = Math.floor(Math.min(...xs));
        const x1 = Math.ceil(Math.max(...xs));
        px(x0, y, Math.max(1, x1 - x0), 1, col);
        if (Math.random() > 0.6) px(x0, y, 1, 1, edge);
      }
    };
    tri(
      [
        [0, 330],
        [90, 235],
        [190, 330],
      ],
      "#101b2a",
      "#1c2b3e",
    );
    tri(
      [
        [130, 340],
        [250, 225],
        [380, 340],
      ],
      "#0d1724",
      "#182638",
    );
    for (let i = 0; i < 500; i++) {
      px(Math.random() * W, 315 + Math.random() * 30, 1, 1, Math.random() > 0.5 ? "#1a2838" : "#243448");
    }
    // 两层屋檐
    tri(
      [
        [180, 146],
        [56, 206],
        [304, 206],
      ],
      "#4a201a",
      "#9a3a2a",
    );
    px(48, 204, 34, 4, "#6a2a20");
    px(278, 204, 34, 4, "#6a2a20");
    tri(
      [
        [180, 138],
        [82, 188],
        [278, 188],
      ],
      "#2a1411",
      "#7a2f22",
    );
    for (let y = 150; y < 206; y += 5) {
      const half = Math.floor(((y - 138) / 50) * 98);
      px(180 - half, y, half * 2, 1, "#5a241a");
    }
    // 墙体
    px(96, 208, 168, 190, "#2a1c14");
    px(104, 216, 152, 180, "#3a2818");
    px(96, 208, 12, 190, "#20140d");
    px(252, 208, 12, 190, "#20140d");
    px(96, 208, 168, 4, "#5a3a22");
    // 匾额
    px(150, 208, 60, 18, "#1a120c");
    px(153, 211, 54, 12, "#3a2416");
    px(153, 211, 54, 1, "#d9b45a");
    px(153, 222, 54, 1, "#d9b45a");
    for (const gx of [168, 178, 188]) px(gx, 214, 4, 5, "#e8c070");
    // 窗与暖光
    for (const wx of [118, 206]) {
      px(wx, 236, 36, 34, "#3a2a1a");
      px(wx + 3, 239, 30, 28, "#e0a050");
      px(wx + 3, 239, 30, 3, "#f4c878");
      px(wx + 17, 239, 3, 28, "#3a2a1a");
      px(wx + 3, 252, 30, 2, "#3a2a1a");
      for (let i = 0; i < 22; i++) px(wx + 2 + Math.random() * 32, 235 - Math.random() * 12, 1, 1, "#5a4a3a");
      for (let i = 0; i < 18; i++) px(wx + 5 + Math.random() * 26, 242 + Math.random() * 22, 1, 1, "#ffd08a");
    }
    // 门与台阶
    px(168, 282, 24, 116, "#160f0a");
    px(171, 285, 18, 110, "#0b0806");
    px(165, 396, 30, 5, "#4a3420");
    px(160, 401, 40, 4, "#3a2818");
    // 灯笼
    for (const lx of [78, 282]) {
      px(lx - 1, 194, 2, 10, "#1a120a");
      px(lx - 5, 204, 11, 14, "#a02a20");
      px(lx - 4, 205, 9, 10, "#ff6a3a");
      px(lx - 2, 206, 4, 6, "#ffd08a");
      px(lx - 1, 218, 2, 6, "#d9b45a");
      for (let i = 0; i < 14; i++) px(lx - 10 + Math.random() * 20, 202 + Math.random() * 20, 1, 1, "#6a3a2a");
    }
    // 竹与石径
    for (const [bx, top] of [
      [36, 230],
      [326, 214],
    ] as const) {
      px(bx, top, 3, 180, "#101a14");
      for (let i = 0; i < 4; i++) px(bx - 7, top + 22 + i * 34, 14, 2, "#16241a");
    }
    for (let i = 0; i < 70; i++) px(130 + Math.random() * 100, 404 + Math.random() * 90, 1, 1, "#3a3a30");
    for (let i = 0; i < 120; i++) px(Math.random() * 360, 500 + Math.random() * 140, 1, 1, "#0a0f16");
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  /** 水墨像素标题页：像素底图 + 楷体题字，风格从这里定下来。 */
  private showInkPixelTitle() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(140);
    layer.add(
      this.add
        .image(360, 640, "ink-title")
        .setDisplaySize(SCREEN_W, SCREEN_H)
        .setInteractive()
        .on("pointerdown", () => {
          playSfx("click");
          this.showGenderPicker();
        }),
    );
    layer.add(
      this.add
        .image(360, 640, "vignette")
        .setDisplaySize(SCREEN_W, SCREEN_H)
        .setAlpha(0.8),
    );
    const title = this.add
      .text(360, 414, "灵膳楼", {
        fontSize: "98px",
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
        .text(360, 530, "一炉烟火 · 半盏仙途", {
          fontSize: "23px",
          color: "#c8b8a0",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(6),
    );
    layer.add(this.add.rectangle(360, 588, 300, 1, 0xb08a4a, 0.7));
    layer.add(
      this.add
        .text(360, 638, "青云镇外 · 散修旧铺", {
          fontSize: "16px",
          color: "#8a7a62",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(3),
    );
    const button = this.add
      .rectangle(360, 830, 300, 82, 0x1a120c, 0.94)
      .setStrokeStyle(3, 0xd9b45a)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        playSfx("click");
        this.showGenderPicker();
      });
    layer.add(button);
    // 像素角标
    for (const [bx, by] of [
      [214, 792],
      [506, 792],
      [214, 864],
      [506, 864],
    ] as const) {
      layer.add(this.add.rectangle(bx, by, 6, 6, 0xd9b45a).setAngle(45));
    }
    layer.add(
      this.add
        .text(360, 830, "推门入座", {
          fontSize: "28px",
          color: "#ffe6a8",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5),
    );
    layer.add(
      this.add.rectangle(360, 930, 48, 48, 0x8a2a22, 0.95).setStrokeStyle(2, 0xe8b06a).setAngle(4),
    );
    layer.add(
      this.add
        .text(360, 930, "灵膳", {
          fontSize: "16px",
          color: "#ffe6c8",
          fontFamily: XIAN_FONT,
          align: "center",
          lineSpacing: 2,
        })
        .setOrigin(0.5)
        .setAngle(4),
    );
    layer.add(
      this.add
        .text(360, 990, "迎客入座 · 点菜出餐 · 打烊修行", {
          fontSize: "15px",
          color: "#8a7a62",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(3),
    );
    // 少量像素浮尘：和底图同一套硬边
    for (let i = 0; i < 18; i++) {
      const dot = this.add.rectangle(
        Phaser.Math.Between(40, 680),
        Phaser.Math.Between(460, 1080),
        Phaser.Math.Between(2, 4),
        Phaser.Math.Between(2, 4),
        Math.random() > 0.5 ? 0xffd98a : 0xc8d8e8,
        Phaser.Math.FloatBetween(0.18, 0.5),
      );
      layer.add(dot);
      this.tweens.add({
        targets: dot,
        y: dot.y - Phaser.Math.Between(40, 120),
        alpha: 0,
        duration: Phaser.Math.Between(3600, 6800),
        delay: Phaser.Math.Between(0, 2500),
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 700, ease: "Sine.easeOut" });
    this.overlay = layer;
  }

  private buildSceneGrade() {
    this.add
      .image(360, 640, "vignette")
      .setDisplaySize(SCREEN_W, SCREEN_H)
      .setScrollFactor(0)
      .setDepth(24)
      .setAlpha(0.62);
    this.add
      .tileSprite(360, 640, SCREEN_W, SCREEN_H, "paper-grain")
      .setScrollFactor(0)
      .setDepth(24.5)
      .setAlpha(0.55);
  }

  /** 首次进入的标题页：月、山、灯、题字，先把「灵膳楼」的气质立住。 */
  private showTitleScreen() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(140);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x070b14, 1).setOrigin(0, 0).setInteractive());

    // 月光与远山
    const moonGlow = this.add
      .image(540, 210, "soft-glow")
      .setTint(0xffe8b0)
      .setAlpha(0.9)
      .setScale(1.55)
      .setBlendMode(Phaser.BlendModes.ADD);
    layer.add(moonGlow);
    this.tweens.add({
      targets: moonGlow,
      alpha: 0.7,
      scale: 1.66,
      duration: 3200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    layer.add(this.add.circle(540, 210, 38, 0xffefc2, 0.95));
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
    // 慢慢飘的夜云，让标题不是一张静止的图
    for (const [x, y, cw, a] of [
      [130, 300, 420, 0.035],
      [470, 382, 520, 0.03],
    ]) {
      const cloud = this.add.ellipse(x, y, cw, 78, 0xdfe9f5, a);
      layer.add(cloud);
      this.tweens.add({
        targets: cloud,
        x: x + 90,
        duration: 26000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    // 两只越过月亮的鹤影：给静态夜空一点方向和生气
    for (const [cx, cy, dir] of [
      [300, 312, 1],
      [430, 270, 1],
    ] as const) {
      const crane = this.add.graphics();
      crane.lineStyle(3, 0x0a1018, 0.62);
      crane.beginPath();
      crane.moveTo(-13, 2);
      crane.lineTo(0, -5);
      crane.lineTo(13, 2);
      crane.strokePath();
      crane.lineStyle(2, 0x0a1018, 0.42);
      crane.lineBetween(-13, 2, -21, 8);
      crane.lineBetween(13, 2, 21, 8);
      crane.setPosition(cx, cy);
      layer.add(crane);
      this.tweens.add({
        targets: crane,
        x: cx + 90 * dir,
        y: cy - 12,
        duration: 24000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
    // 落英：只有几片，慢慢斜落
    for (let i = 0; i < 9; i++) {
      const petal = this.add.ellipse(
        Phaser.Math.Between(40, SCREEN_W - 40),
        Phaser.Math.Between(560, 1120),
        Phaser.Math.Between(4, 7),
        Phaser.Math.Between(2, 4),
        0xffc8d8,
        Phaser.Math.FloatBetween(0.2, 0.42),
      );
      layer.add(petal);
      this.tweens.add({
        targets: petal,
        x: petal.x + Phaser.Math.Between(30, 90),
        y: petal.y + Phaser.Math.Between(90, 180),
        angle: Phaser.Math.Between(120, 260),
        alpha: 0,
        duration: Phaser.Math.Between(6800, 11000),
        delay: Phaser.Math.Between(0, 4000),
        repeat: -1,
        ease: "Sine.easeInOut",
      });
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
    foreground.fillStyle(0xffb060, 0.85);
    foreground.fillRect(316, 1144, 20, 24);
    foreground.fillRect(384, 1144, 20, 24);
    // 窗里两个喝酒的剪影，让标题页先有"人"
    foreground.fillStyle(0x2a1a10, 0.95);
    foreground.fillCircle(325, 1152, 4);
    foreground.fillRect(317, 1157, 16, 9);
    foreground.fillCircle(393, 1152, 4);
    foreground.fillRect(385, 1157, 16, 9);
    foreground.fillStyle(0x0a0f18, 1);
    foreground.fillRect(468, 1160, 60, 40);
    foreground.fillTriangle(460, 1160, 536, 1160, 498, 1134);
    layer.add(foreground);
    layer.add(
      this.add
        .image(360, 1148, "soft-glow")
        .setTint(0xff9a4a)
        .setAlpha(0.22)
        .setScale(0.9)
        .setBlendMode(Phaser.BlendModes.ADD),
    );
    // 窗上两缕热气
    for (const sx of [326, 394]) {
      const steam = this.add.ellipse(sx, 1132, 18, 9, 0xffe6c8, 0.16);
      layer.add(steam);
      this.tweens.add({
        targets: steam,
        y: steam.y - 34,
        alpha: 0,
        duration: 2600,
        delay: Phaser.Math.Between(0, 1200),
        repeat: -1,
        ease: "Sine.easeOut",
      });
    }

    // 檐下小灯笼：给标题底部一点暖光和摆动
    const titleLantern = this.add.container(360, 1108);
    titleLantern.add(this.add.rectangle(0, -30, 2, 22, 0x2a1a10));
    titleLantern.add(
      this.add
        .image(0, 0, "soft-glow")
        .setTint(0xff8a4a)
        .setAlpha(0.28)
        .setScale(0.34)
        .setBlendMode(Phaser.BlendModes.ADD),
    );
    titleLantern.add(this.add.ellipse(0, 0, 24, 32, 0xff5c3c));
    titleLantern.add(this.add.rectangle(0, -16, 15, 4, 0x2a1a10));
    titleLantern.add(this.add.rectangle(0, 16, 15, 4, 0x2a1a10));
    titleLantern.add(this.add.rectangle(0, 23, 2, 9, 0xd9b45a));
    layer.add(titleLantern);
    this.tweens.add({
      targets: titleLantern,
      angle: 4,
      duration: 2600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

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

    layer.add(
      this.add
        .image(360, 640, "vignette")
        .setDisplaySize(SCREEN_W, SCREEN_H)
        .setAlpha(0.9),
    );
    layer.add(
      this.add
        .tileSprite(360, 640, SCREEN_W, SCREEN_H, "paper-grain")
        .setAlpha(0.7),
    );
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 700, ease: "Sine.easeOut" });
    this.overlay = layer;
  }

  private showGenderPicker() {
    this.destroyOverlay();
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
    male.usePixelArt(false);
    male.setScale(2.2).disableInteractive();
    const female = new Character(this, 540, 500, 0xc86a9e, 0x4a2b1a, true, "player");
    female.usePixelArt(false);
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
          this.showOpening();
        });
      layer.add(btn);
      this.expandHitArea(btn, 18);
    };
    pick(180, "男", "male", "#3f5a7a");
    pick(540, "女", "female", "#7a3f5a");
    this.overlay = layer;
  }

  /** 新档进店前的四秒开场：一段旁白把“旧铺、灵火、今夜开张”立住，可点任意处跳过。 */
  private showOpening() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(130);
    layer.add(
      this.add
        .rectangle(0, 0, SCREEN_W, SCREEN_H, 0x05080e, 1)
        .setOrigin(0, 0)
        .setInteractive()
        .on("pointerdown", () => this.finishOpening(layer)),
    );
    const ink = this.add.graphics();
    ink.fillStyle(0xc8d8e8, 0.035);
    ink.fillCircle(560, 330, 72);
    ink.fillStyle(0x8aa0b8, 0.05);
    ink.fillTriangle(-20, 1280, 210, 1030, 440, 1280);
    ink.fillTriangle(280, 1280, 480, 1080, 740, 1280);
    layer.add(ink);
    layer.add(
      this.add
        .image(360, 980, "soft-glow")
        .setTint(0xff8a4a)
        .setAlpha(0.2)
        .setScale(2.2)
        .setBlendMode(Phaser.BlendModes.ADD),
    );
    const lantern = this.add.container(360, 980);
    lantern.add(this.add.rectangle(0, -30, 2, 24, 0x2a1a10));
    lantern.add(this.add.ellipse(0, 0, 22, 30, 0xff5c3c, 0.92));
    lantern.add(this.add.rectangle(0, -15, 14, 4, 0x2a1a10));
    lantern.add(this.add.rectangle(0, 15, 14, 4, 0x2a1a10));
    lantern.add(this.add.rectangle(0, 22, 2, 9, 0xd9b45a));
    layer.add(lantern);
    for (const sx of [324, 396]) {
      const steam = this.add.ellipse(sx, 960, 18, 8, 0xffe6c8, 0.12);
      layer.add(steam);
      this.tweens.add({
        targets: steam,
        y: 910,
        alpha: 0,
        duration: 2600,
        delay: Phaser.Math.Between(0, 900),
        repeat: -1,
        ease: "Sine.easeOut",
      });
    }
    const lines = [
      { text: "青云镇外，夜雨初歇。", y: 500, delay: 250 },
      { text: "一间旧铺，半炉灵火。", y: 574, delay: 1150 },
      { text: "掌柜，今日开张吗？", y: 682, delay: 2150 },
    ];
    for (const [i, line] of lines.entries()) {
      const text = this.add
        .text(360, line.y, line.text, {
          fontSize: i === 2 ? "32px" : "26px",
          color: i === 2 ? "#ffe6a8" : "#c8b8a0",
          fontFamily: XIAN_FONT,
          stroke: i === 2 ? "#241506" : undefined,
          strokeThickness: i === 2 ? 4 : 0,
        })
        .setOrigin(0.5)
        .setAlpha(0)
        .setLetterSpacing(4);
      layer.add(text);
      this.tweens.add({
        targets: text,
        alpha: 1,
        duration: 520,
        delay: line.delay,
        hold: 900,
        yoyo: true,
        ease: "Sine.easeOut",
      });
    }
    layer.add(
      this.add
        .text(360, 1122, "点任意处跳过", { fontSize: "16px", color: "#7a6a54", fontFamily: XIAN_FONT })
        .setOrigin(0.5)
        .setAlpha(0.7)
        .setLetterSpacing(3),
    );
    layer.add(
      this.add
        .image(360, 640, "vignette")
        .setDisplaySize(SCREEN_W, SCREEN_H)
        .setAlpha(0.95),
    );
    layer.add(
      this.add
        .tileSprite(360, 640, SCREEN_W, SCREEN_H, "paper-grain")
        .setAlpha(0.7),
    );
    this.overlay = layer;
    this.time.delayedCall(4300, () => this.finishOpening(layer));
  }

  private finishOpening(layer: Phaser.GameObjects.Container) {
    if (this.overlay !== layer) return;
    playSfx("click");
    layer.list.forEach((child) => this.tweens.killTweensOf(child));
    this.destroyOverlay();
  }

  // ===== 存档 =====
  /** 只存经营进度与选择；营业中不落盘——中途刷新等于放弃本局，避免带着收益跳过工资与还账。 */
  private buildSaveData(): SaveData {
    return {
      v: 2,
      coins: this.coins,
      inventory: this.inventory,
      level: this.level,
      stoveLevel: this.stoveLevel,
      signLevel: this.signLevel,
      reputation: this.reputation,
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
      regulars: this.regulars,
      goalStreak: this.goalStreak,
      lastGiftDate: this.lastGiftDate,
      giftStreak: this.giftStreak,
      floorsBuilt: this.floorsBuilt,
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
      v: 2,
      coins: getAscensionStartCoins(ascensions),
      inventory: getAscensionStartInventory(ascensions),
      level: startLevel,
      stoveLevel: 0,
      signLevel: 0,
      reputation: 0,
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
      goalStreak: 0,
      lastGiftDate: this.lastGiftDate,
      giftStreak: this.giftStreak,
      floorsBuilt: 0,
    };
  }

  /** 读档，返回是否读到有效存档；损坏或版本不符时按新档处理。 */
  private loadSave(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw) as Partial<SaveData>;
      if (data.v !== 2) return false;
      const num = (value: unknown, fallback: number) =>
        typeof value === "number" && Number.isFinite(value) ? value : fallback;
      const count = (value: unknown) => Math.max(0, Math.floor(num(value, 0)));
      this.coins = num(data.coins, STARTING_COINS);
      this.inventory = count(data.inventory);
      this.level = Math.max(1, Math.floor(num(data.level, 1)));
      this.stoveLevel = count(data.stoveLevel);
      this.signLevel = count(data.signLevel);
      this.reputation = count(data.reputation);
      const auto = data.auto;
      this.auto = {
        server: auto?.server !== false,
        cook: auto?.cook !== false,
        buyer: auto?.buyer !== false,
      };
      this.cultivation = count(data.cultivation);
      this.negativeStreak = count(data.negativeStreak);
      this.goalStreak = Math.max(0, Math.floor(num(data.goalStreak, 0)));
      this.lastGiftDate =
        typeof data.lastGiftDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.lastGiftDate)
          ? data.lastGiftDate
          : undefined;
      this.giftStreak = count(data.giftStreak);
      // 旧存档没有 floorsBuilt：按等级免费补楼；新存档以实际建成为准
      const autoFloors = this.level >= 6 ? 2 : this.level >= 3 ? 1 : 0;
      this.floorsBuilt =
        data.floorsBuilt === undefined
          ? autoFloors
          : Math.max(0, Math.min(autoFloors, Math.floor(num(data.floorsBuilt, 0))));
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
        (goal.kind === "revenue" || goal.kind === "wish") &&
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
      this.regulars = (Array.isArray(data.regulars) ? data.regulars : [])
        .filter(
          (r) =>
            r &&
            typeof r.name === "string" &&
            typeof r.kindId === "string" &&
            typeof r.wish === "string",
        )
        .slice(0, 6)
        .map((r) => ({
          name: r.name,
          kindId: r.kindId,
          wish: r.wish,
          visits: Math.max(1, count(r.visits)),
        }));
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
    char.displayName = role === "hawker" ? "迎客伙计" : role === "server" ? "跑堂伙计" : "灶上伙计";
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
    this.interiorSign = this.add
      .text(0, 212, "灵膳楼", {
        fontSize: "38px",
        color: "#ffe6a8",
        stroke: "#2a1a0a",
        strokeThickness: 4,
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setDepth(6.9)
      .setLetterSpacing(6);
    this.createSwayLantern(-280, 400);
    this.createSwayLantern(280, 400);

    this.playerChar = new Character(this, PLAYER_HOME.x, PLAYER_HOME.y, 0x4a7ab8, 0x2b2b2b, false, "player");
    this.playerChar.displayName = "掌柜";
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
    gfx.fillRect(-360, 0, 790, FLOOR_Y);
    gfx.fillStyle(0x5a4332, 1);
    gfx.fillRect(-360, 0, 790, 18);
    gfx.fillStyle(0x33251b, 1);
    gfx.fillRect(-360, FLOOR_Y - 20, 790, 20);
    for (const x of [-310, -180, -55, 55, 180, 310, 420]) gfx.fillRect(x - 5, 0, 10, FLOOR_Y);
    gfx.lineStyle(2, 0x5a4434, 0.5);
    for (let y = 130; y < FLOOR_Y - 20; y += 110) gfx.lineBetween(-360, y, 430, y);

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
    gfx.fillRect(-360, FLOOR_Y, 790, 1400 - FLOOR_Y);
    gfx.lineStyle(3, 0x5a4028, 1);
    gfx.lineBetween(-360, FLOOR_Y, 430, FLOOR_Y);
    gfx.lineStyle(2, 0x75583c, 0.6);
    for (let y = FLOOR_Y + 34; y < 1400; y += 46) gfx.lineBetween(-360, y, 430, y);
    for (let x = -320; x < 430; x += 96) gfx.lineBetween(x, FLOOR_Y, x, 1400);

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
      // 正中一盏大红灯笼：Lv2 回店最直观的变化
      gfx.fillStyle(0xff7a3a, 0.07);
      gfx.fillCircle(0, 332, 76);
      gfx.fillStyle(0xff8a4a, 0.11);
      gfx.fillCircle(0, 332, 56);
      gfx.fillStyle(0xffb060, 0.16);
      gfx.fillCircle(0, 332, 38);
      gfx.fillStyle(0x6a4a2a, 1);
      gfx.fillRect(-1, 266, 2, 38);
      gfx.fillStyle(0x2a1a10, 1);
      gfx.fillRect(-16, 302, 32, 6);
      gfx.fillStyle(0xff5c3c, 1);
      gfx.fillEllipse(0, 334, 36, 48);
      gfx.fillStyle(0xd9b45a, 0.95);
      gfx.fillRect(-16, 358, 32, 5);
      gfx.fillStyle(0xffd98a, 0.9);
      gfx.fillRect(-1, 366, 2, 16);
      gfx.fillCircle(0, 384, 3);
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
    const glow = this.add.circle(0, 0, 34, 0xff7a3a, 0.12);
    const body = this.add.ellipse(0, 0, 24, 34, 0xff5c3c);
    lantern.add(glow);
    lantern.add(body);
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
    // 烛火轻闪
    this.tweens.add({
      targets: body,
      alpha: { from: 0.82, to: 1 },
      duration: Phaser.Math.Between(900, 1600),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.08, to: 0.16 },
      duration: Phaser.Math.Between(1100, 1900),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
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

  /** 窗光落在地上：两束很淡的暖光，给室内一点纵深和呼吸。 */
  private buildWindowLight() {
    const beams = this.add.graphics().setDepth(2.6).setBlendMode(Phaser.BlendModes.ADD);
    beams.fillStyle(0xffd9a0, 0.1);
    beams.beginPath();
    beams.moveTo(-155, 385);
    beams.lineTo(-65, 385);
    beams.lineTo(40, FLOOR_Y);
    beams.lineTo(-150, FLOOR_Y);
    beams.closePath();
    beams.fillPath();
    beams.beginPath();
    beams.moveTo(65, 385);
    beams.lineTo(155, 385);
    beams.lineTo(260, FLOOR_Y);
    beams.lineTo(70, FLOOR_Y);
    beams.closePath();
    beams.fillPath();
    this.tweens.add({
      targets: beams,
      alpha: { from: 0.75, to: 1 },
      duration: 4200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
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
    this.buildWindowLight();
    this.buildSceneGrade();
    // 营业镜头右缘的立柱/帘：遮住墙外的天空色条，同时像一道前景画框
    this.rightFrame = this.add.container(0, 0).setScrollFactor(0).setDepth(22).setVisible(false);
    this.rightFrame.add(this.add.rectangle(710, 640, 20, 1280, 0x1a120c, 1));
    this.rightFrame.add(this.add.rectangle(700, 640, 3, 1280, 0x8a2a22, 0.85));
    this.rightFrame.add(this.add.rectangle(704, 640, 1.5, 1280, 0xd9b45a, 0.35));
    this.closedBackdrop = this.add
      .image(360, 640, "ink-closed")
      .setDisplaySize(SCREEN_W, SCREEN_H)
      .setScrollFactor(0)
      .setDepth(0.2)
      .setVisible(false);
    this.closedFloorText = this.add
      .text(360, 690, "", {
        fontSize: "20px",
        color: "#e0c9a0",
        fontFamily: XIAN_FONT,
        backgroundColor: "rgba(13,10,8,0.9)",
        padding: { x: 14, y: 6 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(31)
      .setVisible(false);
    this.interiorPixelImage = this.add
      .image(-360, 0, "ink-interior")
      .setOrigin(0, 0)
      .setDisplaySize(790, 1280)
      .setDepth(6);

    // 顶部 HUD 悬浮条
    this.hudBar = this.add
      .rectangle(0, 0, SCREEN_W, STATUS_BAR_H, 0x000000, 0.82)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(30);
    this.hudBar.setVisible(true);
    this.hudLine = this.add
      .rectangle(0, STATUS_BAR_H - 2, SCREEN_W, 2, 0xd9b45a, 0.35)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(30.5);
    // 四块很淡的底，把资源 / 境界 / 排队 / 进度分组，不再像一排调试数字
    this.hudChips = this.add.graphics().setScrollFactor(0).setDepth(30.2);
    this.hudChips.fillStyle(0x0a0704, 0.42);
    this.hudChips.fillRoundedRect(12, 2, 362, 34, 8);
    this.hudChips.fillRoundedRect(404, 2, 168, 34, 8);
    this.hudChips.fillRoundedRect(12, 36, 254, 30, 7);
    this.hudChips.fillRoundedRect(270, 36, 434, 30, 7);
    this.hudChips.lineStyle(1, 0x8a6a3a, 0.28);
    this.hudChips.strokeRoundedRect(12, 2, 362, 34, 8);
    this.hudChips.strokeRoundedRect(404, 2, 168, 34, 8);
    this.hudChips.strokeRoundedRect(12, 36, 254, 30, 7);
    this.hudChips.strokeRoundedRect(270, 36, 434, 30, 7);

    this.coinsText = this.addUiText(24, 6, "", "26px", "#ffe6a8");
    this.inventoryText = this.addUiText(190, 6, "", "26px", "#a8d8b0");
    this.levelText = this.addUiText(400, 6, "", "18px", "#87ceeb");
    this.queueText = this.addUiText(24, 40, "", "24px", "#d8c8a8");
    this.realmText = this.addUiText(430, 9, "", "21px", "#e0c9a0");
    this.cultivationText = this.addUiText(300, 42, "", "21px", "#b8d8c8");
    this.goalText = this.addUiText(440, 40, "", "25px", "#e0c060");
    this.goalText.setWordWrapWidth(260);
    this.sessionText = this.addUiText(24, 70, "", "21px", "#a8b8c8");
    // 声望常驻在进度行右侧：称号 + 当前/下一级 + 细进度条
    this.reputationText = this.addUiText(696, 70, "", "20px", "#d9b45a").setOrigin(1, 0);
    this.reputationBarBg = this.add
      .rectangle(546, 95, 150, 4, 0x3a3a3a)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(30.6);
    this.reputationBar = this.add
      .rectangle(546, 95, 150, 4, 0xd9b45a)
      .setOrigin(0, 0)
      .setScale(0, 1)
      .setScrollFactor(0)
      .setDepth(30.7);
    this.chronicleText = this.addUiText(24, 96, "", "17px", "#b8b0a0");
    this.omenBadge = this.addUiText(24, 176, "", "17px", "#e0c9a0").setVisible(false);
    this.comboBadge = this.addUiText(696, 174, "", "19px", "#ffb45a")
      .setOrigin(1, 0)
      .setVisible(false);
    this.comboBadge.setStyle({ fontStyle: "bold" });
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
    this.refreshAudioButtons();

    // 营业中操作按钮：与采购/打烊同处底部操作区
    this.serveButton = this.addUiButton(346, 1186, () => this.startSeat("player"), { x: 14, y: 28 }, 6, "20px");
    this.cookButton = this.addUiButton(460, 1186, () => this.manualCook(), { x: 14, y: 28 }, 6, "20px");
    this.serveButton.setBackgroundColor("#35543a");
    this.cookButton.setBackgroundColor("#5a3a1c");
    // 出菜行：点哪道菜就做哪道，优先端给想吃它的那一桌
    this.dishChipLabel = this.addUiText(16, 1014, "出菜 · 点菜名", "19px", "#e0c9a0");
    this.dishChips = DISHES.map((_, i) =>
      this.addUiButton(
        56 + (i % 4) * 150,
        1042 + Math.floor(i / 4) * 68,
        () => {
          const dish = this.getMenuDishes()[i];
          if (dish) this.manualCookDish(dish);
        },
        { x: 8, y: 20 },
        3,
        "18px",
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
        .rectangle(8, 720, 704, 430, 0x0d0a08, 0.9)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x9a3a2a, 0.55),
    );
    this.navTitle = this.add
      .text(360, 724, "掌柜事务", {
        fontSize: "22px",
        color: "#e0c9a0",
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5, 0)
      .setLetterSpacing(6);
    this.navPanel.add(this.navTitle);    this.navPanel.add(this.add.rectangle(24, 750, 672, 1, 0x8a6a3a, 0.4).setOrigin(0, 0));
    this.staffButton = this.addNavCard(180, 797, "伙计", "雇佣 · 日薪 · 熟练", () => {
      this.staffNotice = "";
      this.buildStaffOverlay();
    });
    this.upgradeButton = this.addNavCard(180, 901, "营造 Lv1", "雅座 · 灶台 · 门面", () =>
      this.buildBuildOverlay(),
    );
    this.genderButton = this.addNavCard(180, 1005, "形象 · 男", "点击切换", () => this.toggleGender());
    this.bankButton = this.addNavCard(180, 1109, "灵石商行", "借贷 · 还账", () => this.buildBankOverlay());
    this.cultivationButton = this.addNavCard(540, 797, "修行 · 境界", "修为 · 突破 · 飞升", () =>
      this.buildCultivationOverlay(),
      true,
    );
    this.helpButton = this.addNavCard(540, 901, "玩法", "规则与操作", () => this.showHelp(), true);
    this.recordButton = this.addNavCard(540, 1005, "账簿", "累计 · 成就", () => this.buildRecordOverlay(), true);
    this.saveButton = this.addNavCard(540, 1109, "存档", "导出 · 导入", () => this.openSaveDialog("export"), true);

    this.buildFloorTabs();
    this.buildBoothVisuals();
    this.positionUi(false);
  }

  private buildFloorTabs() {
    const names = ["散座", "雅座+15%", "包间+25%"];
    for (let floor = 0; floor < MAX_FLOORS; floor++) {
      const x = 124 + floor * 160;
      const bg = this.add
        .rectangle(x, 132, 152, 38, 0x14100c, 0.96)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x4a3a2a, 0.8)
        .setScrollFactor(0)
        .setDepth(31)
        .setVisible(false)
        .setInteractive({ useHandCursor: true })
        .on("pointerup", () => {
          playSfx("click");
          if (floor > this.floorsBuilt) {
            const def = FLOOR_UNLOCKS[floor - 1];
            this.showHint(
              def
                ? `先到 Lv${def.level} 并在营造里花 ${def.cost} 灵石起${floor === 1 ? "二楼" : "三楼"}`
                : "这层还没起",
            );
            return;
          }
          this.switchFloor(floor);
        });
      const label = this.add
        .text(x + 26, 151, `${floor + 1}F`, {
          fontSize: "20px",
          color: "#e0c9a0",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(32)
        .setVisible(false);
      const sub = this.add
        .text(x + 94, 151, names[floor], {
          fontSize: "14px",
          color: "#a89472",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(32)
        .setVisible(false);
      this.floorTabs.push({ bg, label, sub });
    }
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
      this.add.text(360, y + 40, label, { fontSize: "24px", color: "#f5e6c8" }).setOrigin(0.5),
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

  /** 打烊页的两列事务卡：整卡可点，字号比旧文字按钮大，避免手机上挤成一列小字。 */
  private addNavCard(
    x: number,
    y: number,
    label: string,
    subtitle: string,
    onClick: () => void,
    cool = false,
  ): TapText {
    const tap = () => {
      playSfx("click");
      onClick();
    };
    // 卡片不进 navPanel：容器 + scrollFactor(0) 会让命中区按世界坐标偏移。
    const card = this.add
      .rectangle(x, y, 332, 82, cool ? 0x10151c : 0x14100c, 0.97)
      .setStrokeStyle(2, cool ? 0x8a7a5a : 0x9a3a2a, 0.75)
      .setScrollFactor(0)
      .setDepth(31)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", tap);
    const title = this.add
      .text(x, y - 12, label, {
        fontSize: "25px",
        color: cool ? "#dfe8f4" : "#f5e6c8",
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setLetterSpacing(2)
      .setScrollFactor(0)
      .setDepth(32)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", tap) as TapText;
    title.onTap = onClick;
    const sub = this.add
      .text(x, y + 19, subtitle, {
        fontSize: "15px",
        color: cool ? "#8a9aac" : "#a89472",
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setLetterSpacing(1)
      .setScrollFactor(0)
      .setDepth(32);
    this.navCardObjects.push(card, title, sub);
    return title;
  }

  private setNavCardsVisible(visible: boolean) {
    for (const obj of this.navCardObjects) {
      obj.setVisible(visible);
      if (obj.input) obj.input.enabled = visible;
    }
  }

  private setClosedNavVisible(visible: boolean) {
    this.navPanel.setVisible(visible);
    this.setNavCardsVisible(visible);
    for (const button of [
      this.staffButton,
      this.bankButton,
      this.upgradeButton,
      this.genderButton,
      this.cultivationButton,
      this.helpButton,
      this.recordButton,
      this.saveButton,
    ]) {
      button?.setVisible(visible);
    }
  }

  private buildBoothVisuals() {
    this.booths.forEach((_, i) => this.addBoothVisual(i));
  }

  private addBoothVisual(i: number) {
    const bg = this.add.rectangle(0, 0, 80, 16, 0x6a4a2a).setDepth(6.5).setStrokeStyle(2, 0x8a6a4a);
    const runner = this.add.rectangle(0, 0, 60, 6, 0x8a2a22).setDepth(6.6).setStrokeStyle(1, 0xd9b45a, 0.7);
    const number = this.add
      .text(0, 0, "", {
        fontSize: "15px",
        color: "#e0c9a0",
        stroke: "#1a120a",
        strokeThickness: 3,
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setDepth(6.8);
    const legs = [
      this.add.rectangle(0, 0, 7, 32, 0x4a3420).setDepth(6.4),
      this.add.rectangle(0, 0, 7, 32, 0x4a3420).setDepth(6.4),
    ];
    const label = this.add
      .text(0, 0, "", {
        fontSize: "19px",
        color: "#ffe6c8",
        stroke: "#1a120a",
        strokeThickness: 3,
        padding: { x: 2, y: 1 },
        align: "center",
        lineSpacing: 1,
        wordWrap: { width: 110 },
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5, 1)
      .setDepth(6.8);
    const barBg = this.add.rectangle(0, 0, 80, 8, 0x1a1a1a).setOrigin(0, 0.5).setDepth(6.9);
    const barFill = this.add.rectangle(0, 0, 0, 8, COLOR_PLAYER).setOrigin(0, 0.5).setDepth(6.95);
    // 每桌一支小烛：给人物和桌面一点暖光，而不是只有顶灯
    const candleGlow = this.add
      .image(0, 0, "soft-glow")
      .setTint(0xffa050)
      .setAlpha(0.16)
      .setScale(0.6)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(7);
    const candleBody = this.add.rectangle(0, 0, 7, 13, 0xf0e2c8).setDepth(7.1);
    const candleFlame = this.add.ellipse(0, 0, 7, 11, 0xffd98a).setDepth(7.2);
    this.tweens.add({
      targets: candleGlow,
      alpha: { from: 0.12, to: 0.2 },
      duration: Phaser.Math.Between(900, 1500),
      yoyo: true,
      repeat: -1,
      delay: Phaser.Math.Between(0, 500),
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: candleFlame,
      alpha: { from: 0.65, to: 1 },
      scaleY: { from: 0.85, to: 1.1 },
      duration: Phaser.Math.Between(700, 1200),
      yoyo: true,
      repeat: -1,
      delay: Phaser.Math.Between(0, 500),
      ease: "Sine.easeInOut",
    });
    // 整张桌子都是「看这位客人」的点击区，别让玩家去点米粒大的人
    const zone = this.add.zone(0, 0, 80, 150).setOrigin(0.5, 0).setDepth(7.3);
    let zx = 0;
    let zy = 0;
    zone
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", (p: Phaser.Input.Pointer) => {
        zx = p.x;
        zy = p.y;
      })
      .on("pointerup", (p: Phaser.Input.Pointer) => {
        if (Math.hypot(p.x - zx, p.y - zy) >= 12) return;
        const patron = this.booths[i]?.patronChar;
        if (patron) this.focusOnCharacter(patron);
      });
    const visible = this.gameState === "open";
    [bg, runner, number, label, ...legs, barBg, barFill, candleGlow, candleBody, candleFlame].forEach((o) =>
      o.setVisible(visible),
    );
    this.boothVisuals.push({
      floor: this.booths[i]?.floor ?? 0,
      bg,
      runner,
      number,
      label,
      legs,
      barBg,
      barFill,
      zone,
      candleGlow,
      candleBody,
      candleFlame,
    });
    this.relayoutTables();
  }

  /** 每层各自在 500 宽里均分；只有当前楼层的桌子/点击区可见。 */
  private relayoutTables() {
    for (let floor = 0; floor < MAX_FLOORS; floor++) {
      const visuals = this.boothVisuals.filter((v) => v.floor === floor);
      const total = Math.max(visuals.length, 1);
      const width = Math.min(84, 500 / total);
      const active = this.gameState === "open" && floor === this.activeFloor;
      visuals.forEach((v, i) => {
        const x =
          total === 1
            ? (TABLE_X_MIN + TABLE_X_MAX) / 2
            : TABLE_X_MIN + (i * (TABLE_X_MAX - TABLE_X_MIN)) / (total - 1);
        v.bg.setPosition(x, FLOOR_Y - 30).setSize(width, 16).setVisible(active);
        v.bg.setStrokeStyle(2, this.level >= 2 || floor > 0 ? 0xd9b45a : 0x8a6a4a);
        v.runner
          .setPosition(x, FLOOR_Y - 34)
          .setSize(Math.max(30, width - 14), 5)
          .setVisible(active && (this.level >= 2 || floor > 0));
        const cx = x + Math.min(28, width * 0.32);
        v.candleGlow.setPosition(cx, FLOOR_Y - 44).setVisible(active);
        v.candleBody.setPosition(cx, FLOOR_Y - 36).setVisible(active);
        v.candleFlame.setPosition(cx, FLOOR_Y - 44).setVisible(active);
        const stagger = total >= 4 ? (i % 2) * 46 : 0;
        v.number
          .setText(TABLE_MARKS[i] ?? `${i + 1}`)
          .setPosition(x, FLOOR_Y - 150 - stagger)
          .setVisible(active);
        v.legs[0].setPosition(x - width / 2 + 10, FLOOR_Y - 14).setVisible(active);
        v.legs[1].setPosition(x + width / 2 - 10, FLOOR_Y - 14).setVisible(active);
        v.label.setPosition(x, FLOOR_Y - 116 - stagger).setVisible(active);
        const zoneWidth = Math.max(36, Math.min(90, 500 / total));
        v.zone.setPosition(x, FLOOR_Y - 170).setSize(zoneWidth, 160);
        if (v.zone.input) {
          v.zone.input.hitArea.setSize(zoneWidth, 160);
          v.zone.input.enabled = active;
        }
        const barW = Math.max(36, width - 8);
        v.barBg.setPosition(x - barW / 2, FLOOR_Y - 70).setSize(barW, 8).setVisible(active);
        v.barFill.setPosition(x - barW / 2, FLOOR_Y - 70).setVisible(active);
      });
    }
  }

  private applyFloorLook() {
    const tints = [0xffffff, 0xffe4d6, 0xd8f4ec];
    this.interiorPixelImage.setTint(tints[this.activeFloor] ?? 0xffffff);
  }

  private setFloorTabsVisible(visible: boolean) {
    for (const tab of this.floorTabs) {
      tab.bg.setVisible(visible);
      tab.label.setVisible(visible);
      tab.sub.setVisible(visible);
      if (tab.bg.input) tab.bg.input.enabled = visible;
    }
  }

  private refreshFloorTabs() {
    const open = this.gameState === "open";
    this.setFloorTabsVisible(open);
    if (!open) return;
    const names = ["散座", "雅座+15%", "包间+25%"];
    this.floorTabs.forEach((tab, floor) => {
      const built = floor <= this.floorsBuilt;
      const active = floor === this.activeFloor;
      const total = this.booths.filter((b) => b.floor === floor).length;
      const free = this.booths.filter((b) => b.floor === floor && b.state === "empty").length;
      tab.bg.setFillStyle(active ? 0x8a2a22 : built ? 0x14100c : 0x0b0906, 0.96);
      tab.bg.setStrokeStyle(2, active ? 0xd9b45a : built ? 0x4a3a2a : 0x2a2018, 0.9);
      tab.label.setText(`${floor + 1}F`).setColor(active ? "#ffe6a8" : built ? "#e0c9a0" : "#5a4a3a");
      tab.sub
        .setText(built ? `${names[floor]} · ${free}/${total}` : "未起")
        .setColor(active ? "#f5e6c8" : built ? "#a89472" : "#5a4a3a");
      tab.bg.setAlpha(built ? 1 : 0.72);
      tab.label.setAlpha(built ? 1 : 0.6);
      tab.sub.setAlpha(built ? 1 : 0.6);
      if (tab.bg.input) tab.bg.input.enabled = true;
    });
  }

  private refreshBoothVisibility() {
    const open = this.gameState === "open";
    this.booths.forEach((booth) => {
      const visible = open && booth.floor === this.activeFloor;
      booth.patronChar?.setVisible(visible);
      booth.diningProp?.setVisible(visible);
    });
    const queueVisible = open && this.activeFloor === 0;
    this.queue.forEach((patron) => patron.char.setVisible(queueVisible));
  }

  private switchFloor(floor: number, force = false) {
    if (floor === this.activeFloor || floor < 0 || floor > this.floorsBuilt) return;
    if (!force && this.isPlayerBusy()) {
      this.showHint("掌柜正在忙，忙完再上楼");
      return;
    }
    const apply = () => {
      this.activeFloor = floor;
      this.applyFloorLook();
      this.relayoutTables();
      this.refreshBoothVisibility();
      this.refreshFloorTabs();
    };
    if (this.gameState === "open" && !this.settling) {
      this.cameras.main.fadeOut(140, 0, 0, 0, () => {
        apply();
        this.cameras.main.fadeIn(160, 0, 0, 0);
      });
    } else {
      apply();
    }
  }

  /** 当前楼层优先；返回该桌在本层的横向坐标。 */
  private tablePosition(index: number): { x: number; y: number } {
    const booth = this.booths[index];
    const floor = booth?.floor ?? 0;
    const visuals = this.boothVisuals.filter((v) => v.floor === floor);
    const local = this.booths.slice(0, index).filter((b) => b.floor === floor).length;
    const total = Math.max(visuals.length, 1);
    const x =
      total === 1
        ? (TABLE_X_MIN + TABLE_X_MAX) / 2
        : TABLE_X_MIN + (local * (TABLE_X_MAX - TABLE_X_MIN)) / (total - 1);
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
    // 名单是开市时按声望锁定的；到店间隔只决定拥挤度，不再决定人数
    if (this.patronsSpawned < this.patronsTotal && time >= this.nextArrivalAt) {
      this.spawnPatron(time);
      this.patronsSpawned += 1;
      this.nextArrivalAt = time + getArrivalInterval(this.level, Phaser.Math.Between(ARRIVAL_MIN_MS, ARRIVAL_MAX_MS));
    }

    // 随机事件按当天人数缩放：约每 5 位客人 1 次，最多 4 次
    const eventCap = Math.min(MAX_EVENTS_PER_SESSION, Math.max(1, Math.floor(this.patronsTotal / GAME.events.patronsPerEvent)));
    if (this.eventsThisSession < eventCap && time >= this.nextEventAt) {
      this.triggerRandomEvent(time);
    }

    this.queue = this.queue.filter((patron) => {
      if (time >= patron.expiresAt) {
        this.sessionLost += 1;
        this.pendingRepLoss += 1;
        if (this.focusChar === patron.char) this.returnFromFocus();
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
        this.showDiningProp(index);
        this.log("出餐完毕，食客开始用膳");
        // 另一桌正在用膳时，给一次看得见的碰杯，而不是只等 5.6 秒的随机闲聊
        const other = this.booths.find((b) => b !== booth && b.state === "dining" && b.patronChar);
        const clinkA = booth.patronChar;
        const clinkB = other?.patronChar;
        if (clinkA && clinkB) {
          this.time.delayedCall(250, () => {
            if (clinkA.active && clinkB.active) this.showClink(clinkA, clinkB);
          });
        }
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
        const price = dish ? this.boothPrice(booth, dish) : 0;
        const dishName = dish?.name ?? "菜";
        const guest = booth.patronName ?? booth.patronKind?.name ?? "食客";
        const guestName = booth.patronName;
        const guestKind = booth.patronKind;
        const guestWish = booth.patronWish;
        const guestRegular = booth.patronRegular;
        const personal = booth.cookingDriver === "player";
        booth.state = "empty";
        booth.cookingDriver = null;
        booth.currentDish = null;
        booth.comboBonus = 0;
        booth.patronKind = null;
        booth.patronWish = null;
        booth.patronName = null;
        booth.patronRegular = false;
        booth.diningProp?.destroy();
        booth.diningProp = undefined;
        booth.awaitingSince = 0;
        const leaver = booth.patronChar;
        booth.patronChar = undefined;
        if (this.focusChar === leaver) this.returnFromFocus();
        leaver?.setDining(false);
        leaver?.setSeated(false);
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
        // 吃到想吃的，或本来就没点名、安稳吃完的，都可能记住这家店
        if (matched) this.rememberRegular(guestName, guestKind, guestWish, guestRegular);
        else if (!hasWish && dish) this.rememberRegular(guestName, guestKind, dish.id, guestRegular);
        this.log(
          matched
            ? `${guest}吃到了想吃的${dishName}，满意离店，收入 +${price} 灵石`
            : hasWish
              ? `${guest}没吃到想吃的${dishName}，只付半价，收入 +${price} 灵石`
              : `${guest}用罢${dishName}离店，收入 +${price} 灵石`,
        );
        const rare = priceFactor >= GAME.rarePriceFactor;
        this.gainReputationFor(rare);
        const cultGain = this.cultivationGainFor(personal, matched, rare);
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
          (booth) => booth.state === "awaitingCook" && booth.floor === this.activeFloor && time - booth.awaitingSince >= COOK_PRIORITY_MS,
        );
        if (index !== -1) this.startCook(this.booths[index], index, "staff");
      }
    }
    // 两桌同时用膳时，每 7 秒至少给一次碰杯，不靠随机闲聊撞运气
    if (!this.focusing && time - this.lastClinkAt > 7000) {
      const dining = this.booths.filter((b) => b.state === "dining" && b.patronChar);
      if (dining.length >= 2) {
        this.showClink(dining[0].patronChar!, dining[1].patronChar!);
      }
    }

    this.flushRepLoss();
    if (
      this.patronsSpawned >= this.patronsTotal &&
      this.queue.length === 0 &&
      this.booths.every((booth) => booth.state === "empty")
    ) {
      this.finishSession();
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
    const target = PURCHASE_TARGET_STOCK + this.level * GAME.staff.buyerTargetStockPerLevel;
    if (this.inventory >= target) return;
    const price = this.purchasePrice(false);
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
      t = Phaser.Math.Clamp(elapsed / this.sessionNominalMs, 0, 1);
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
    this.refreshTodayOmen();
    this.gameState = "selectingMenu";
    this.buildMenuOverlay();
  }

  private buildMenuOverlay() {
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

  private startSession() {
    if (this.getMenuDishes().length === 0 || this.inventory <= 0 || this.transitioning) return;
    this.destroyOverlay();
    this.transitioning = true;

    this.cameras.main.fadeOut(450, 0, 0, 0, () => {
      this.gameState = "open";
      this.settling = false;
      // 跨过零点后重新取天时：同一天内始终一致
      this.refreshTodayOmen();
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
        booth.comboBonus = 0;
        booth.cookStartedAt = 0;
        booth.cookDoneAt = 0;
        booth.departAt = 0;
        booth.patronKind = null;
        booth.patronWish = null;
        booth.patronName = null;
        booth.patronRegular = false;
        booth.diningProp?.destroy();
        booth.diningProp = undefined;
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
      this.firstGuestShown = false;
      this.activeFloor = 0;
      this.applyFloorLook();
      this.relayoutTables();
      this.refreshBoothVisibility();
      this.refreshFloorTabs();
      this.sessionRevenue = 0;
      this.sessionLost = 0;
      this.sessionWishes = 0;
      this.stockLost = 0;
      this.queueLost = 0;
      this.sessionCultivation = 0;
      this.combo = 0;
      this.lastGift = null;
      this.goalAnnounced = false;
      this.regularsToday.clear();
      this.regularDueToday = this.regulars.length > 0;
      this.lastClinkAt = 0;
      this.sessionGoal = this.currentDayGoal();
      const specialDish = DISHES.find((d) => d.id === this.currentDailySpecial());
      if (specialDish) {
        const base = this.baseDishPrice(specialDish);
        const pct = base > 0 ? Math.round((this.dishPrice(specialDish) / base - 1) * 100) : 0;
        this.log(`今日招牌：${specialDish.name}，售价 +${pct}%`);
      }
      this.log(`今日天时：${this.omen.name}——${this.omen.desc}`);
      // 名单在开市时按声望锁定：营业中升级/掉级次日才生效
      const baseCount = getRepLevelInfo(this.reputation).patrons;
      // 客流类天时与灯会直接改人数；第 1 天少来一位当教学缓冲
      const omenCount =
        Math.round(baseCount / this.omen.arrivalFactor) + (isFestivalDay(this.day) ? GAME.festival.extraPatrons : 0);
      this.patronsTotal = Math.max(1, omenCount - (this.day === 1 ? GAME.session.firstDayFewerPatrons : 0));
      this.patronsSpawned = 0;
      this.roundEnding = false;
      this.pendingRepLoss = 0;
      this.repGainedToday = 0;
      this.repLostToday = 0;
      this.sessionNominalMs = this.patronsTotal * NOMINAL_MS_PER_PATRON;
      this.sessionEndsAt = this.time.now + SESSION_HARD_STOP_MS;
      const firstArrival = getArrivalInterval(this.level, Phaser.Math.Between(ARRIVAL_MIN_MS, ARRIVAL_MAX_MS));
      // 每天开门后第一位客人都在 2.2 秒内到，避免开局长时间空等
      this.nextArrivalAt = this.time.now + Math.min(firstArrival, 2200);
      this.eventsThisSession = 0;
      this.nextEventAt = this.time.now + Phaser.Math.Between(9000, 16000);
      this.grantDailyGift();
      playSfx("open");
      this.log("开张大吉，今日营业开始");
      this.showDayBanner();

      this.cameras.main.fadeIn(450, 0, 0, 0);
      this.transitioning = false;
    });
  }

  /** 服务完一位客人加声望；稀客登门，名声传得更远。 */
  private gainReputationFor(rare: boolean) {
    const gain = rare ? REP_GAIN_RARE : REP_GAIN_SERVED;
    this.reputation = gainReputation(this.reputation, gain);
    this.repGainedToday += gain;
  }

  /** 同一帧里积累的流失一次性结算：一批最多掉一级。 */
  private flushRepLoss() {
    if (this.pendingRepLoss <= 0) return;
    this.reputation = loseReputation(this.reputation, this.pendingRepLoss);
    this.repLostToday += this.pendingRepLoss;
    this.pendingRepLoss = 0;
  }

  /** 名单走完：停顿一下作为清场过场，再弹结算。 */
  private finishSession() {
    if (this.roundEnding || this.settling) return;
    this.roundEnding = true;
    this.log("最后一位客人离店，开始收摊");
    this.showEventToast("最后一位客人离店，收摊打烊", true);
    this.time.delayedCall(ROUND_END_DELAY_MS, () => this.endSession());
  }

  private endSession() {
    if (this.settling) return;
    this.focusTimer?.remove();
    this.focusTimer = undefined;
    this.focusing = false;
    this.focusChar = undefined;
    this.clearFocusCard();
    this.setFocusUiHidden(false);
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
    this.flushRepLoss();
    // 提前打烊时，名单上还没来的与还在排队的都算流失
    let closeLost = this.queue.length + Math.max(0, this.patronsTotal - this.patronsSpawned);
    this.sessionLost += closeLost;
    this.queue.forEach((p) => p.char.destroy());
    this.queue = [];
    // 打烊结算：已经在用膳的照常收钱；已下锅但没出餐的退回灵材，避免白白损失
    this.booths.forEach((booth) => {
      const dish = booth.currentDish;
      if (dish && booth.state === "dining") {
        const matched = booth.patronWish === dish.id;
        const factor = booth.patronKind?.priceFactor ?? 1;
        const price = this.boothPrice(booth, dish);
        this.coins += price;
        this.sessionServed += 1;
        this.sessionRevenue += price;
        if (matched) this.sessionWishes += 1;
        const personal = booth.cookingDriver === "player";
        const rare = factor >= GAME.rarePriceFactor;
        this.gainReputationFor(rare);
        this.gainCultivation(this.cultivationGainFor(personal, matched, rare));
        this.log(`打烊前最后一桌用罢${dish.name}${matched ? "" : "（口味不合半价）"}，收入 +${price}`);
      } else if (dish && booth.state === "cooking") {
        this.inventory += 1;
        this.sessionLost += 1;
        closeLost += 1;
        this.log(`打烊，${dish.name}未及出餐，灵材退回`);
      } else if (booth.state === "seating" || booth.state === "awaitingCook") {
        this.sessionLost += 1;
        closeLost += 1;
      }
      booth.patronChar?.destroy();
      booth.patronChar = undefined;
      booth.state = "empty";
      booth.cookingDriver = null;
      booth.currentDish = null;
      booth.comboBonus = 0;
      booth.patronKind = null;
      booth.patronWish = null;
      booth.patronName = null;
      booth.patronRegular = false;
      booth.diningProp?.destroy();
      booth.diningProp = undefined;
      booth.awaitingSince = 0;
    });
    if (closeLost > 0) {
      this.reputation = loseReputation(this.reputation, closeLost);
      this.repLostToday += closeLost;
    }
    this.displayedCoins = this.coins;
    playSfx("close");
    this.log("打烊，今日营业结束");
    this.gainStaffExperience();
    this.lastWages = this.settleWages();
    this.lastLoanDues = this.settleLoans();
    this.lastRent = getDailyRent(this.level) + getFloorRent(this.floorsBuilt);
    this.coins -= this.lastRent;
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
    const closingIngredients = getRealmClosingIngredients(this.realmIndex());
    if (closingIngredients > 0) {
      this.inventory += closingIngredients;
      this.log(`${REALMS[this.realmIndex()].name}境心念一动，打烊时凭空凝出 ${closingIngredients} 灵材`);
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
    this.stopCelebration();
    this.destroyOverlay();
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

  /** 二级页面：伙计列表，未雇佣的可在此雇佣，已雇佣的显示等级/熟练/日薪。 */
  private buildStaffOverlay() {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(100);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.97).setOrigin(0, 0).setInteractive());
    layer.add(this.add.text(40, 58, "伙计", { fontSize: "36px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
    layer.add(
      this.add.text(40, 108, `${this.staffBottleneckHint()}（灶上按菜单轮转，不读口味）`, {
        fontSize: "18px",
        color: "#e0c060",
        wordWrap: { width: 640 },
      }),
    );
    if (this.staffNotice) {
      layer.add(
        this.add.text(40, 136, this.staffNotice, {
          fontSize: "16px",
          color: this.staffNoticeGood ? "#9fe870" : "#ff9a8a",
        }),
      );
    }

    const defs: { role: StaffRole; name: string; cost: number; desc: string }[] = [
      { role: "hawker", name: "迎客", cost: HIRE_COST_HAWKER, desc: "招客效果待重做（仍照付日薪）" },
      { role: "server", name: "跑堂", cost: HIRE_COST_SERVER, desc: "自动招待入座" },
      { role: "cook", name: "灶上", cost: HIRE_COST_COOK, desc: "自动烹饪" },
      { role: "buyer", name: "采买", cost: HIRE_COST_BUYER, desc: "打烊自动补货 + 采购优惠" },
    ];

    defs.forEach((d, i) => {
      const y = 160 + i * 110;
      const role = d.role;
      const level = this.staffLevel[role];
      if (level > 0) {
        layer.add(this.add.text(50, y, `${d.name} Lv${level}`, { fontSize: "24px", color: "#ffffff" }));
        layer.add(
          this.add.text(
            50,
            y + 36,
            `熟练 ${this.staffExp[role] % EXP_PER_LEVEL}/${EXP_PER_LEVEL} · 日薪 ${getStaffWage(role, level)} 灵石`,
            { fontSize: "18px", color: "#bbbbbb" },
          ),
        );
        if (role !== "hawker") {
          const enabled = this.auto[role];
          layer.add(
            this.add
              .text(480, y + 2, `自动：${enabled ? "开" : "关"}`, {
                fontSize: "20px",
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
        layer.add(this.add.text(50, y, `${d.name}（未雇佣）`, { fontSize: "24px", color: "#888888" }));
        layer.add(
          this.add.text(50, y + 36, `${d.desc} · 日薪 ${getStaffWage(role, 1)} 灵石`, {
            fontSize: "18px",
            color: "#bbbbbb",
          }),
        );
        const btn = this.add
          .text(400, y + 4, `雇 ${d.cost} 灵石`, {
            fontSize: "20px",
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

  // ===== 场景与 UI =====
  private desiredFloors(): number[] {
    const floors: number[] = [];
    for (let floor = 0; floor <= this.floorsBuilt; floor++) {
      const count = getFloorBoothCount(this.level, this.floorsBuilt, floor);
      for (let i = 0; i < count; i++) floors.push(floor);
    }
    return floors;
  }

  /** 等级或楼层变化后，让桌位数组与楼层派生数量一致；只增不减。 */
  private syncBooths() {
    const desired = this.desiredFloors();
    while (this.booths.length < desired.length) {
      this.booths.push(this.makeBooth(desired[this.booths.length]));
    }
    while (this.booths.length > desired.length) {
      const booth = this.booths.pop();
      booth?.patronChar?.destroy();
      booth?.diningProp?.destroy();
      const visual = this.boothVisuals.pop();
      if (visual) this.destroyBoothVisual(visual);
    }
    this.booths.forEach((booth, i) => {
      booth.floor = desired[i] ?? 0;
    });
    while (this.boothVisuals.length < this.booths.length) {
      this.addBoothVisual(this.boothVisuals.length);
    }
    this.relayoutTables();
    this.refreshBoothVisibility();
  }

  private destroyBoothVisual(v: BoothVisual) {
    [v.bg, v.runner, v.number, v.label, ...v.legs, v.barBg, v.barFill, v.candleGlow, v.candleBody, v.candleFlame, v.zone].forEach(
      (obj) => obj.destroy(),
    );
  }

  private makeBooth(floor = 0): Booth {
    return {
      floor,
      state: "empty",
      cookingDriver: null,
      currentDish: null,
      cookStartedAt: 0,
      cookDoneAt: 0,
      departAt: 0,
      awaitingSince: 0,
      comboBonus: 0,
      patronKind: null,
      patronWish: null,
      patronName: null,
      patronRegular: false,
    };
  }

  private positionUi(isOpen: boolean) {
    // 打烊时「开始营业」是主行动；营业中换成「提前打烊」配色。高度保持大按钮。
    this.startButton.setStyle({
      fontSize: isOpen ? "18px" : "24px",
      color: "#f5e6c8",
      backgroundColor: isOpen ? "#2a1c18" : "#8a2a22",
      padding: isOpen ? { x: 20, y: 28 } : { x: 30, y: 26 },
    });
    this.relayoutTables();
    this.setFloorTabsVisible(isOpen);
    this.applyFloorLook();

    this.serveButton.setVisible(isOpen);
    this.cookButton.setVisible(isOpen);
    this.setClosedNavVisible(!isOpen && !this.overlay);
    this.rightFrame.setVisible(isOpen);
    this.closedBackdrop.setVisible(!isOpen);

    this.playerChar.setVisible(isOpen);
    Object.values(this.staffChars).forEach((c) => c?.setVisible(isOpen));
    this.refreshBoothVisibility();
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
  }

  private setGender(gender: "male" | "female") {
    this.playerGender = gender;
    this.playerChar.setBodyColor(gender === "male" ? 0x4a7ab8 : 0xc86a9e);
    this.playerChar.setHairColor(gender === "male" ? 0x2b2b2b : 0x4a2b1a);
    this.playerChar.setLongHair(gender === "female");
    this.genderButton?.setText(gender === "male" ? "形象 · 男" : "形象 · 女");
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
  private currentDailySpecial(): string | null {
    return getDailySpecial(this.day, this.level, this.unlockedDishIds());
  }

  private baseDishPrice(dish: Dish): number {
    return Math.round(
      dish.price *
        getRealmPriceMultiplier(this.realmIndex()) *
        getAscensionPriceMultiplier(this.ascensions),
    );
  }

  private dishPrice(dish: Dish): number {
    const price = getSpecialPrice(this.baseDishPrice(dish), this.currentDailySpecial() === dish.id);
    return Math.round(price * this.omen.priceFactor);
  }

  /** 采购价含天时折扣。 */
  private purchasePrice(emergency: boolean): number {
    return Math.max(
      1,
      Math.round(getPurchasePrice(this.staffLevel.buyer, emergency) * this.omen.purchaseFactor),
    );
  }

  /** 一桌离店时的成交价：菜品价 × 身份 × 楼层 × 口味 × 连击。 */
  private boothPrice(booth: Booth, dish: Dish): number {
    const matched = booth.patronWish === dish.id;
    const hasWish = booth.patronWish !== null;
    const base = Math.round(
      this.dishPrice(dish) *
        (booth.patronKind?.priceFactor ?? 1) *
        getFloorPriceMultiplier(booth.floor) *
        getPostCapPriceBonus(this.level),
    );
    return Math.round(
      getWishPrice(base, matched, hasWish, this.omen.wishBonus) * (1 + booth.comboBonus),
    );
  }

  /** 只有玩家亲自下厨才计修为，天时可再多悟一分。 */
  private cultivationGainFor(personal: boolean, matched: boolean, rare: boolean): number {
    return (
      getCultivationGain(personal) +
      (personal && matched ? GAME.cultivation.wishHitBonus : 0) +
      (personal && rare ? GAME.cultivation.rareBonus : 0) +
      (personal ? this.omen.cultivationBonus : 0)
    );
  }

  /** 跨过零点后换天时；同一本机日期内保持不变。 */
  private refreshTodayOmen() {
    const key = localDateKey();
    if (key === this.todayKey) return;
    this.todayKey = key;
    this.omen = getDailyOmen(key);
  }

  /** 本机每天第一次开店才发，当天再开不重复领。 */
  private grantDailyGift() {
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
  private showComboPopup() {
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
  /** 用膳套件：桌沿上的碗、两只手、袖子与筷子，跟着整段用餐存在。 */
  private showDiningProp(index: number) {
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
  private showDayBanner() {
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
  private emitWeather() {
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
  private idleTwitch() {
    if (this.gameState !== "open" || this.settling) return;
    const chars: Character[] = [this.playerChar];
    for (const b of this.booths) if (b.patronChar) chars.push(b.patronChar);
    for (const q of this.queue) chars.push(q.char);
    for (const c of Object.values(this.staffChars)) if (c?.visible) chars.push(c);
    chars[Math.floor(Math.random() * chars.length)]?.twitch();
  }

  /** 点人物/桌卡：拉出一张人物卡，而不是裸镜头推近。 */
  private focusOnCharacter(char: Character) {
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

  private clearFocusCard() {
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
  private focusRoleLine(look: CharacterLook): string {
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

  private focusLineFor(char: Character): string {
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
  private returnFromFocus() {
    this.focusTimer?.remove();
    this.focusTimer = undefined;
    this.focusing = false;
    this.focusChar = undefined;
    this.clearFocusCard();
    this.setFocusUiHidden(false);
    this.refreshHud();
  }

  /** 特写期间收起界面；否则相机缩放会把屏幕固定的 HUD 一起放大、错位。 */
  private setFocusUiHidden(hidden: boolean) {
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

  /** 店里慢慢浮动的尘埃/灵光，让静态墙面有一点呼吸。 */
  private emitInteriorMote() {
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

  /** 两桌食客碰杯：两人同时欠身，桌间升起金色酒花与「碰杯」。 */
  private showClink(a: Character, b: Character) {
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
    return Math.min(QUEUE_GAP, 770 / Math.max(1, getTotalBoothCount(this.level, this.floorsBuilt) - 1));
  }

  /** 吃到心心念念那道菜的客人，会变成隔日再来的常客（最多记住 6 位）。 */
  private rememberRegular(
    name: string | null,
    kind: PatronKind | null,
    wish: string | null,
    isRegular: boolean,
  ) {
    if (!name || !kind || !wish) return;
    const dishName = DISHES.find((d) => d.id === wish)?.name ?? "招牌菜";
    const existing = this.regulars.find((r) => r.name === name && r.kindId === kind.id);
    if (existing) {
      // 同名同身份的散客不是那位常客，不能替他累计到访
      if (!isRegular) return;
      existing.visits += 1;
      existing.wish = wish;
      this.log(`常客${name}第 ${existing.visits} 次来店，还是那口${dishName}`);
      return;
    }
    if (this.regulars.length >= GAME.regulars.max) return;
    this.regulars.push({ name, kindId: kind.id, wish, visits: 1 });
    // 今天刚成为常客的人，今天不再从门口刷出来
    this.regularsToday.add(name);
    this.log(`${name}记住了灵膳楼的${dishName}，成了常客`);
  }

  /** 每位修士有自己的进店方式：御剑、乘云、化烟、裂空；凡人/散修走进来。 */
  private patronEntrance(char: Character, kind: PatronKind, slotX: number) {
    char.arrived = false;
    char.setScale(char.x < slotX ? 1 : -1, 1);
    const id = kind.id;
    const bark =
      {
        sword: "御剑而来。",
        elder: "乘云而至。",
        alchemist: "丹香先到。",
        demon: "让开！",
        demonlord: "这方天地，太窄。",
        rogue: "道友，请了。",
        mortal: "来碗热的。",
      }[id] ?? "";
    const sayOnArrive = () => {
      if (char.active && bark) char.say(bark);
    };
    const spark = (x: number, y: number, color: number, count = 2) => {
      for (let i = 0; i < count; i++) {
        const dot = this.add
          .rectangle(x + Phaser.Math.Between(-8, 8), y + Phaser.Math.Between(-8, 8), 2, 2, color, 0.8)
          .setDepth(21);
        this.tweens.add({
          targets: dot,
          x: dot.x + Phaser.Math.Between(-22, 22),
          y: dot.y - Phaser.Math.Between(10, 34),
          alpha: 0,
          duration: Phaser.Math.Between(500, 900),
          onComplete: () => dot.destroy(),
        });
      }
    };
    if (id === "sword") {
      // 御剑：从门外滑进来，剑在脚下，落地才收剑
      playSfx("whoosh");
      char.setX(Math.min(char.x, slotX + 200));
      char.setY(ACTOR_Y - 54);
      const board = this.add.container(char.x, char.y + 30).setDepth(19.8);
      const g = this.add.graphics();
      g.fillStyle(0x9aa8b8, 1);
      g.fillRect(-34, -2, 68, 4);
      g.fillStyle(0xe8eef4, 1);
      g.fillRect(-34, -2, 40, 2);
      g.fillStyle(0xd9b45a, 1);
      g.fillRect(34, -5, 9, 10);
      g.fillStyle(0x6a4a2a, 1);
      g.fillRect(40, -2, 12, 4);
      board.add(g);
      for (let i = 0; i < 10; i++) {
        this.time.delayedCall(70 * i, () => {
          if (char.active) spark(char.x - 22, char.y + 32, 0xb8d8f0, 1);
        });
      }
      this.tweens.add({
        targets: [char, board],
        x: slotX,
        duration: 1050 * ENTRANCE_SLOW,
        ease: "Sine.easeOut",
        onComplete: () => {
          this.tweens.add({
            targets: board,
            alpha: 0,
            duration: 220,
            onComplete: () => board.destroy(),
          });
          this.tweens.add({
            targets: char,
            y: ACTOR_Y,
            duration: 260 * ENTRANCE_SLOW,
            ease: "Bounce.easeOut",
            onComplete: () => {
              char.arrived = true;
              sayOnArrive();
            },
          });
          spark(char.x, char.y + 30, 0xffe6a8, 6);
        },
      });
      return;
    }
    if (id === "elder" || id === "alchemist") {
      // 乘云：长老/丹修离地半尺漂进来
      playSfx("chime");
      const green = id === "alchemist";
      char.setX(Math.min(char.x, slotX + 200));
      char.setY(ACTOR_Y - 30);
      const cloud = this.add.container(char.x, char.y + 26).setDepth(19.8);
      cloud.add(this.add.rectangle(0, 4, 42, 7, green ? 0x6a9a7a : 0xa8c8d8, 0.9));
      cloud.add(this.add.rectangle(-15, 8, 22, 7, green ? 0x8ac89a : 0xc8e0ee, 0.85));
      cloud.add(this.add.rectangle(15, 8, 22, 7, green ? 0x8ac89a : 0xc8e0ee, 0.85));
      cloud.add(this.add.rectangle(0, 11, 54, 5, 0x6a7a8a, 0.35));
      for (let i = 0; i < 10; i++) {
        this.time.delayedCall(90 * i, () => {
          if (char.active) spark(char.x, char.y + 34, green ? 0xa8e8c0 : 0xffe6a8, 1);
        });
      }
      this.tweens.add({
        targets: [char, cloud],
        x: slotX,
        duration: 1150 * ENTRANCE_SLOW,
        ease: "Sine.easeOut",
        onComplete: () => {
          this.tweens.add({ targets: cloud, alpha: 0, duration: 260, onComplete: () => cloud.destroy() });
          this.tweens.add({
            targets: char,
            y: ACTOR_Y,
            duration: 300 * ENTRANCE_SLOW,
            ease: "Sine.easeOut",
            onComplete: () => {
              char.arrived = true;
              sayOnArrive();
            },
          });
          spark(char.x, char.y + 30, green ? 0xa8e8c0 : 0xffe6a8, 5);
        },
      });
      return;
    }
    if (id === "demon") {
      // 妖修：化作赤烟落地
      playSfx("rumble");
      char.setPosition(slotX, ACTOR_Y - 62).setAlpha(0);
      const flash = this.add
        .rectangle(slotX, ACTOR_Y - 34, 92, 120, 0x8a2a22, 0.28)
        .setDepth(19.7)
        .setScale(0.2);
      this.tweens.add({
        targets: flash,
        scaleX: 1.2,
        scaleY: 1,
        alpha: 0,
        duration: 500,
        onComplete: () => flash.destroy(),
      });
      this.time.delayedCall(60, () => spark(slotX, ACTOR_Y - 30, 0xff8a6a, 12));
      this.tweens.add({
        targets: char,
        y: ACTOR_Y,
        alpha: 1,
        duration: 520 * ENTRANCE_SLOW,
        ease: "Bounce.easeOut",
        onComplete: () => {
          char.arrived = true;
          sayOnArrive();
        },
      });
      return;
    }
    if (id === "demonlord") {
      // 魔道：裂开一道暗红缝隙再走出来
      playSfx("rumble");
      char.setPosition(slotX, ACTOR_Y).setAlpha(0);
      const rift = this.add.container(slotX, ACTOR_Y - 32).setDepth(19.7);
      rift.add(this.add.rectangle(-8, 0, 4, 92, 0x2a0a10, 0.95).setScale(1, 0));
      rift.add(this.add.rectangle(7, 0, 4, 92, 0x8a2a22, 0.9).setScale(1, 0));
      rift.add(this.add.rectangle(0, 0, 2, 100, 0xff5a5a, 0.7).setScale(1, 0));
      this.tweens.add({
        targets: rift.list,
        scaleY: 1,
        duration: 260 * ENTRANCE_SLOW,
        ease: "Sine.easeOut",
        onComplete: () => {
          this.tweens.add({
            targets: char,
            alpha: 1,
            duration: 220 * ENTRANCE_SLOW,
            onComplete: () => {
              char.arrived = true;
              sayOnArrive();
            },
          });
          this.time.delayedCall(180, () => {
            this.tweens.add({
              targets: rift,
              alpha: 0,
              duration: 260,
              onComplete: () => rift.destroy(),
            });
          });
          spark(slotX, ACTOR_Y - 40, 0xff5a5a, 10);
        },
      });
      return;
    }
    // 凡人/散修：正常走进来；散修脚下有急行的尘，凡人慢慢挑担
    playSfx("arrival");
    const walkMs = (id === "rogue" ? 430 : 760) * ENTRANCE_SLOW;
    char.walkTo(slotX, ACTOR_Y, walkMs, () => {
      char.arrived = true;
      sayOnArrive();
    });
    for (let i = 0; i < 4; i++) {
      this.time.delayedCall(120 * i, () => {
        if (char.active) spark(char.x + 12, ACTOR_Y - 2, id === "rogue" ? 0xb8b0a0 : 0x8a7a62, 1);
      });
    }
  }

  /** 系统生成一位到店顾客：队列有空位就走进来排队，排满则直接离开。 */
  private spawnPatron(time: number) {
    const unlocked = this.unlockedDishIds();
    const regularPool = this.regulars.filter(
      (r) => !this.regularsToday.has(r.name) && unlocked.includes(r.wish),
    );
    const forceRegular = this.regularDueToday && regularPool.length > 0;
    const regular = forceRegular
      ? regularPool[0]
      : regularPool.length > 0 && Math.random() < GAME.regulars.returnChance
        ? regularPool[Math.floor(Math.random() * regularPool.length)]
        : null;
    if (regular) {
      this.regularsToday.add(regular.name);
      if (forceRegular) this.regularDueToday = false;
    }
    const isFirstGuest = !this.firstGuestShown;
    this.firstGuestShown = true;
    // 声望越高，仙门贵客越愿意登门：等级 1–9 直接当作稀客权重倍率
    const rareWeight = this.omen.rareWeightFactor * getRepLevel(this.reputation);
    // 新档第一位客人固定是御剑而来的白无锋：让玩家先看到本作最有辨识度的出场
    const tutorialSword = isFirstGuest && this.day === 1 && !regular;
    const kind = tutorialSword
      ? (PATRON_KINDS.find((k) => k.id === "sword") ?? pickPatronKind(Math.random(), rareWeight))
      : regular
        ? (PATRON_KINDS.find((k) => k.id === regular.kindId) ?? pickPatronKind(Math.random(), rareWeight))
        : pickPatronKind(Math.random(), rareWeight);
    const rare = isRarePatron(kind);
    const slotX = QUEUE_X + this.queue.length * this.queueGap();
    const spawnX = Math.max(980, slotX + 60);
    const longHair = kind.id === "alchemist" || kind.id === "demonlord" || kind.id === "elder";
    const char = new Character(this, spawnX, ACTOR_Y, kind.bodyColor, kind.hairColor, longHair, kind.id as CharacterLook);
    char.setVisible(this.gameState === "open");
    char.setMood(rare ? "cold" : "waiting");
    const name = regular?.name ?? (tutorialSword ? "白无锋" : pickPatronName(kind, Math.random()));
    char.displayName = regular ? `${name}（常客）` : name;
    if (rare) char.setAura(kind.id === "elder" ? 0xffe08a : 0xff6a6a, 0.9, 0.35);
    // 点名范围是已解锁的全部菜：菜单没上的菜也会被点名，端不上就只付半价
    const wish = regular ? regular.wish : pickPatronWish(kind, unlocked, Math.random());

    if (this.queue.length >= getTotalBoothCount(this.level, this.floorsBuilt)) {
      char.walkTo(1620, ACTOR_Y, 500, () => char.destroy());
      this.sessionLost += 1;
      this.queueLost += 1;
      this.log(`${name}见门外排满，转身离去`);
      this.showHint("门外排满了，新客转身离开——先点「招待入座」清位");
      return;
    }

    this.patronEntrance(char, kind, slotX);
    const patience = QUEUE_PATIENCE_MS * kind.patienceFactor * (this.day === 1 ? GAME.session.firstDayPatienceMultiplier : 1);
    this.queue.push({ expiresAt: time + patience, patienceMs: patience, char, kind, wish, name, regular: !!regular });
    if (this.day === 1 && this.tutorialHintStage === 0) {
      this.tutorialHintStage = 1;
    }
    this.staffChars.hawker?.pulse();
    playSfx(rare ? "event" : "arrival");
    const wishName = DISHES.find((d) => d.id === wish)?.name;
    this.log(
      regular
        ? `常客${name}又来了，还是想吃${wishName ?? "招牌菜"}`
        : rare
          ? `【稀客】${name}（${kind.name}）亲临门外${wishName ? `，想吃${wishName}` : ""}`
          : `${name}（${kind.name}）来到门前排起队${wishName ? `，想吃${wishName}` : ""}`,
    );
    if (regular && wishName) char.say(`还是那道${wishName}。`);
    if (rare) this.showEventToast(`${name}（${kind.name}）亲临门外`, true);
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
    if (this.inventory <= 0) {
      if (driver === "player") this.showHint("灵材见底：先点左下「急购 +5」补货，再领客入座");
      return;
    }
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

    if (!this.queue[0]?.char.arrived) {
      if (driver === "player") this.showHint("客人还在路上，稍等");
      return;
    }
    const emptyBooths = this.booths
      .map((booth, index) => ({ booth, index }))
      .filter(({ booth }) => booth.state === "empty");
    if (emptyBooths.length === 0) {
      if (driver === "player") this.showHint("雅座满了，先出菜");
      return;
    }
    const first = this.queue[0];
    let candidates = emptyBooths.filter(({ booth }) => booth.floor === this.activeFloor);
    if (candidates.length === 0) {
      const hasEmpty = (floor: number) => emptyBooths.some(({ booth }) => booth.floor === floor);
      const rare = (first?.kind.priceFactor ?? 1) >= GAME.rarePriceFactor;
      const targetFloor = rare
        ? hasEmpty(2)
          ? 2
          : hasEmpty(1)
            ? 1
            : 0
        : hasEmpty(1)
          ? 1
          : hasEmpty(0)
            ? 0
            : 2;
      candidates = emptyBooths.filter(({ booth }) => booth.floor === targetFloor);
      if (candidates.length === 0) return;
      // 玩家亲自领客时，镜头跟着客人上楼；跑堂自动招待则留在当前层
      if (driver === "player" && targetFloor !== this.activeFloor) {
        this.activeFloor = targetFloor;
        this.applyFloorLook();
        this.relayoutTables();
        this.refreshBoothVisibility();
        this.refreshFloorTabs();
      }
    }
    // 不总是从最左一张开始，客人分散入座，画面更像一间活着的店
    const { booth, index: boothIndex } =
      candidates[Math.floor(Math.random() * candidates.length)];

    const patron = this.queue.shift()!;
    patron.char.setVisible(booth.floor === this.activeFloor);
    patron.char.setPatience(null);
    patron.char.setMood(isRarePatron(patron.kind) ? "cold" : "waiting");
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
    booth.patronName = patron.name;
    booth.patronRegular = patron.regular;
    if (isRarePatron(patron.kind)) {
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
      booth.patronChar?.setSeated(true);
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
      .text(toastX, FLOOR_Y - 280, wish ? `${guest}入座：想吃${wish}` : `${guest}入座`, {
        fontSize: "16px",
        color: "#ffe8a0",
        backgroundColor: "#1b2440",
        padding: { x: 8, y: 5 },
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({
      targets: toast,
      y: FLOOR_Y - 316,
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
    const index = this.booths.findIndex(
      (booth) => booth.state === "awaitingCook" && booth.floor === this.activeFloor,
    );
    if (index === -1) {
      this.showHint(
        this.booths.some((booth) => booth.state === "seating" && booth.floor === this.activeFloor)
          ? "食客还在入座，稍等片刻"
          : "本层没有待烹饪的客人",
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
      .filter(({ booth }) => booth.state === "awaitingCook" && booth.floor === this.activeFloor);
    if (awaiting.length === 0) {
      this.showHint(
        this.booths.some((booth) => booth.state === "seating" && booth.floor === this.activeFloor)
          ? "食客还在入座，稍等片刻"
          : "本层没有待出菜的客人",
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
      this.stockLost += 1;
      const leaver = booth.patronChar;
      const guest = booth.patronKind?.name ?? "食客";
      booth.patronChar = undefined;
      if (this.focusChar === leaver) this.returnFromFocus();
      leaver?.setSeated(false);
      booth.patronKind = null;
      booth.patronWish = null;
      booth.patronName = null;
      booth.patronRegular = false;
      booth.diningProp?.destroy();
      booth.diningProp = undefined;
      booth.awaitingSince = 0;
      leaver?.walkTo(440, ACTOR_Y, 400, () => leaver.destroy());
      this.sessionLost += 1;
      this.pendingRepLoss += 1;
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
    // 连击在起锅时锁定：命中口味 +1 连，上错清零；伙计出菜不参与
    booth.comboBonus = 0;
    if (driver === "player") {
      if (booth.patronWish === chosen.id) {
        this.combo = Math.min(COMBO_MAX, this.combo + 1);
        booth.comboBonus = this.combo * COMBO_STEP;
        if (this.combo >= 2) this.showComboPopup();
      } else if (booth.patronWish !== null && this.combo > 0) {
        this.log(`口味不合，连击中断（${this.combo} 连）`);
        this.combo = 0;
      }
    }
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
    const price = this.purchasePrice(emergency);

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
      // 营业中急购是救火，不该让玩家被锁 15 秒；压到约 9 秒
      duration: Math.round(getPurchaseDuration(this.level) * GAME.purchase.emergencyDurationScale),
      amount: PURCHASE_AMOUNT,
    };
    this.save();
    this.log(credit ? "灵石不足，赊账紧急采购下单（价格翻倍），等货中" : "紧急采购下单（价格翻倍），等货中");
  }

  private buildFloor() {
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

  private upgradeTavern() {
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
    this.destroyOverlay();
    this.showEventToast(`灶台升至 Lv${this.stoveLevel}`, true);
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
    this.log(`门面挂上新幡（招客效果待重做）`);
    this.destroyOverlay();
    this.showEventToast(`门幡升至 Lv${this.signLevel}`, true);
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
    const sessionDay = this.day;
    this.day += 1;
    // 换日时保留玩家刚选的目标类型，只把目标值/奖励更新到新等级与天数
    const nextOptions = getDailyGoalOptions(this.day, this.level);
    this.dailyGoal = nextOptions.find((o) => o.kind === goal?.kind) ?? getDailyGoal(this.day, this.level);
    if (!goal) return;
    const stats = { served: this.sessionServed, revenue: this.sessionRevenue, wishes: this.sessionWishes };
    const payout = getGoalPayout(goal, stats);
    if (isFestivalDay(sessionDay)) {
      payout.coins = Math.round(payout.coins * getFestivalGoalMultiplier(sessionDay));
      payout.cultivation += GAME.festival.goalExtraCultivation;
    }
    const streakBonus = getStreakBonus(this.level);
    const qualified = payout.met || payout.partial;
    this.goalStreak = qualified ? this.goalStreak + 1 : 0;
    const streakComplete = this.goalStreak >= GOAL_STREAK_TARGET;
    const streakCount = streakComplete ? GOAL_STREAK_TARGET : this.goalStreak;
    if (streakComplete) this.goalStreak = 0;
    this.lastGoalResult = {
      goal,
      met: payout.met,
      partial: payout.partial,
      progress: payout.progress,
      rewardCoins: payout.coins,
      rewardCultivation: payout.cultivation,
      streakCount,
      streakComplete,
      streakCoins: streakBonus.coins,
      streakCultivation: streakBonus.cultivation,
    };
    if (!qualified) {
      this.log(`第 ${this.day - 1} 日目标未达成：${goal.label}`);
      return;
    }
    this.coins += payout.coins;
    this.log(
      payout.met
        ? `第 ${this.day - 1} 日目标达成：${goal.label}，赏 ${payout.coins} 灵石、${payout.cultivation} 修为`
        : `第 ${this.day - 1} 日目标差一点：${goal.label}（${payout.progress}/${goal.target}），半赏 ${payout.coins} 灵石、${payout.cultivation} 修为`,
    );
    this.gainCultivation(payout.cultivation);
    if (streakComplete) {
      this.coins += streakBonus.coins;
      this.gainCultivation(streakBonus.cultivation);
      this.log(
        `三日之约达成：连达 ${GOAL_STREAK_TARGET} 天，额外赏 ${streakBonus.coins} 灵石、${streakBonus.cultivation} 修为`,
      );
    }
    this.displayedCoins = this.coins;
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
      const showBar = this.gameState === "open" && booth.floor === this.activeFloor && fraction > 0;
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
    this.inventoryText.setColor(this.inventory <= 0 ? "#ff9a8a" : "#a8d8b0");
    this.levelText.setText(`酒楼等级：${this.level}`);
    const queueCap = getTotalBoothCount(this.level, this.floorsBuilt);
    if (open && !this.settling && this.queue.length >= queueCap) {
      this.queueText.setText(`排队 ${this.queue.length}/${queueCap} · 已满`);
      this.queueText.setColor("#ff9a8a");
    } else if (open && !this.settling && this.patronsSpawned < this.patronsTotal) {
      const nextIn = Math.max(0, Math.ceil((this.nextArrivalAt - this.time.now) / 1000));
      this.queueText.setText(`排队 ${this.queue.length}/${queueCap} · 下位 ${nextIn}s`);
      this.queueText.setColor("#a8d8b0");
    } else if (open && !this.settling) {
      this.queueText.setText(`排队 ${this.queue.length}/${queueCap} · 客人已到齐`);
      this.queueText.setColor("#d8c8a8");
    } else {
      this.queueText.setText(`排队：${this.queue.length}/${queueCap}`);
      this.queueText.setColor("#d8c8a8");
    }
    const repInfo = getRepLevelInfo(this.reputation);
    const nextRep = getNextRepThreshold(this.reputation);
    this.reputationText.setText(
      nextRep === null ? `${repInfo.title} · 声望圆满` : `${repInfo.title} · ${this.reputation}/${nextRep}`,
    );
    const repSpan = nextRep === null ? 1 : nextRep - repInfo.threshold;
    const repRatio =
      nextRep === null ? 1 : Phaser.Math.Clamp((this.reputation - repInfo.threshold) / repSpan, 0, 1);
    this.reputationBar.setScale(repRatio, 1);
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
        `已服务 ${this.sessionServed}/${this.patronsTotal} · ${this.sessionRevenue}灵石${
          busyLabel ? ` · 掌柜${busyLabel}` : ""
        }`,
      );
      const progress = getGoalProgress(this.sessionGoal, {
        served: this.sessionServed,
        revenue: this.sessionRevenue,
        wishes: this.sessionWishes,
      });
      const kind = this.sessionGoal.kind;
      const prefix = kind === "revenue" ? "收入" : "口味";
      const unit = kind === "revenue" ? " 灵石" : " 位";
      const reached = progress >= this.sessionGoal.target;
      this.goalText.setText(
        reached ? "今日目标 ✓" : `${prefix} ${progress}/${this.sessionGoal.target}${unit}`,
      );
      this.goalText.setColor(reached ? "#a8d8b0" : "#e0c060");
      if (reached && !this.goalAnnounced) {
        this.goalAnnounced = true;
        playSfx("upgrade");
        this.showEventToast("今日目标达成", true);
      }
    } else {
      const goal = this.currentDayGoal();
      // 打烊页：奖励明细留给菜单目标卡，HUD 只留日期、天时与目标，避免长行压到画面
      this.sessionText.setText(`第 ${this.day} 日 · 天时：${this.omen.name} · ${goal.label}`);
      this.goalText.setText("");
      // 事务面板标题常驻回访提示：今天还没领利是就写「待领」，领过则显示连续天数
      const giftPending = this.lastGiftDate !== this.todayKey;
      this.navTitle.setText(
        giftPending ? "掌柜事务 · 今日利是待领" : this.giftStreak > 0 ? `掌柜事务 · 连开 ${this.giftStreak} 天` : "掌柜事务",
      );
      this.navTitle.setColor(giftPending ? "#ffd98a" : "#e0c9a0");
    }
    this.chronicleText.setText(
      this.chronicleLines.map((line) => (line.length > 34 ? `${line.slice(0, 33)}…` : line)).join("\n"),
    );
    // 营业中把常驻日志与声音开关收起：给主画面让位，日志在打烊视图里看
    this.chronicleText.setVisible(!open);
    this.sfxButton.setVisible(!open);
    const showOmen = open && !this.settling;
    this.omenBadge.setVisible(showOmen);
    this.omenBadge.setText(`天时 · ${this.omen.name}（${this.omen.short}）`);
    this.comboBadge.setVisible(showOmen && this.combo > 0);
    this.comboBadge.setText(`连击 ×${this.combo} · 收益 +${this.combo * 5}%`);

    const menu = this.getMenuDishes();
    const canServeBeforeClose = menu.some((dish) => this.canFinishBeforeClose(dish, "player"));
    const wished = new Set(
      this.booths
        .filter((booth) => booth.state === "awaitingCook" && booth.floor === this.activeFloor)
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
        open &&
        booth.floor === this.activeFloor &&
        (booth.state === "awaitingCook" || booth.state === "seating" || booth.state === "cooking") &&
        !(booth.patronChar?.isSpeaking() ?? false);
      visual.label.setVisible(showLabel);
      const regular = booth.patronRegular;
      visual.label.setColor(
        booth.state === "awaitingCook" && !canServeBeforeClose
          ? "#ff9a8a"
          : (kind && isRarePatron(kind)) || regular
            ? "#ffd98a"
            : "#ffffff",
      );
      // 桌卡只留最短信息：想吃什么/做哪道/入座；桌号单独常驻，常客用「常·」标记
      const marker = kind && isRarePatron(kind) ? "★" : regular ? "常·" : "";
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
    const specialId = this.currentDailySpecial();
    const specialDish = specialId ? DISHES.find((d) => d.id === specialId) : undefined;
    this.dishChipLabel.setVisible(showChips);
    this.dishChipLabel.setText("出菜 · 点菜名");
    this.dishChips.forEach((chip, i) => {
      const dish = menu[i];
      chip.setVisible(showChips && dish !== undefined);
      if (!dish) return;
      const finishable = this.canFinishBeforeClose(dish, "player");
      chip.setAlpha(showChips ? (busy || !finishable ? 0.5 : 1) : 1);
      const wanted = wished.has(dish.id);
      const special = dish.id === specialDish?.id;
      chip.setText(`${wanted ? "★" : ""}${special ? "◆" : ""}${dish.name} ${this.dishPrice(dish)}`);
      chip.setBackgroundColor(special ? "#4a3a14" : wanted ? "#6a4a14" : "#2e2119");
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
    this.rightFrame.setVisible(open);
    this.closedBackdrop.setVisible(!open);
    this.closedFloorText
      .setVisible(!open)
      .setText(
        ["一层 · 散座", "二层 · 雅座", "三层 · 仙门包间"][this.floorsBuilt] ?? "一层 · 散座",
      );
    this.refreshFloorTabs();
    // 菜单/店铺面板打开时也收起事务卡，避免透明卡片的命中区压到面板按钮上
    this.setClosedNavVisible(this.gameState === "closed" && !this.overlay);
    this.purchaseButton.setVisible(true);

    this.staffButton.setText("伙计");
    this.bankButton.setText("灵石商行");
    this.cultivationButton.setText("修行 · 境界");
    this.helpButton.setText("玩法");
    this.recordButton.setText("账簿");
    this.saveButton.setText("存档");

    this.serveButton.setText("招待入座");
    this.cookButton.setText("动手烹饪");

    const purchasePriceLabel = this.purchasePrice(open);
    if (this.playerPurchasing && open) {
      const left = Math.max(
        0,
        Math.ceil(
          (this.playerPurchasing.startedAt + this.playerPurchasing.duration - this.time.now) / 1000,
        ),
      );
      this.purchaseButton.setLabel(`急购中… ${left}s（暂停招待/烹饪）`);
    } else {
      this.purchaseButton.setLabel(
        open
          ? `急购 +${PURCHASE_AMOUNT}（${purchasePriceLabel} 灵石，约 ${Math.round((getPurchaseDuration(this.level) * GAME.purchase.emergencyDurationScale) / 1000)}s）`
          : `备货 +${PURCHASE_AMOUNT}（${purchasePriceLabel} 灵石）`,
      );
    }
    this.upgradeButton.setText(`营造 Lv${this.level}`);
  }
}

const configErrors = validateConfig(GAME);
if (configErrors.length > 0) {
  // 配置填错就不启动游戏，直接把出错项列在页面上
  const box = document.createElement("pre");
  box.style.cssText = "color:#ff6b6b;background:#1b1b1b;padding:24px;font:16px/1.6 monospace;white-space:pre-wrap;margin:0;min-height:100vh";
  box.textContent = `src/config.ts 配置有误，游戏未启动：\n\n${configErrors.map((e) => `· ${e}`).join("\n")}`;
  document.body.replaceChildren(box);
} else new Phaser.Game({
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
