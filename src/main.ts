import Phaser from "phaser";

// 占位数值，先验证流程手感，后续可随时调整
const TABLE_COUNT_BASE = 3;
const QUEUE_PATIENCE_MS = 8000;
const DINING_MS = 3000;
const SESSION_DURATION_MS = 60000;
const PURCHASE_COST = 5;
const PURCHASE_AMOUNT = 5;
const PURCHASE_TIME_MS = 15000;
const PURCHASE_EMERGENCY_MULTIPLIER = 2;
const PURCHASE_TARGET_STOCK = 10;
const PURCHASE_TAVERN_SHRINK_PER_LEVEL_MS = 300;
const PURCHASE_FLOOR_MS = 3000;
const PURCHASE_STAFF_LEVEL_SPEEDUP = 0.85;
const STARTING_COINS = 20;
const STARTING_INVENTORY = 5;
const UPGRADE_BASE_COST = 15;
const UPGRADE_COST_MULTIPLIER = 1.6;
const HIRE_COST_HAWKER = 30;
const HIRE_COST_SERVER = 40;
const HIRE_COST_COOK = 50;
const HIRE_COST_BUYER = 35;
const CHRONICLE_MAX_LINES = 5;

const HAWK_BASE_MS = 3500;
const HAWK_TAVERN_SHRINK_PER_LEVEL_MS = 200;
const HAWK_FLOOR_MS = 400;

const SEAT_BASE_MS = 1200;
const SEAT_TAVERN_SHRINK_PER_LEVEL_MS = 120;
const SEAT_FLOOR_MS = 300;

const COOK_TAVERN_SHRINK_PER_LEVEL_MS = 200;
const COOK_FLOOR_MS = 500;

// 伙计 1 级耗时是玩家基准的 1.6 倍（更慢）
const STAFF_SPEED_PENALTY = 1.6;
// 各岗位成长曲线不同：基础越快的岗位每级提速越少，让三岗逐渐收敛、瓶颈在岗位间转移
const STAFF_LEVEL_SPEEDUP = { hawker: 0.86, server: 0.94, cook: 0.9 } as const;

const STAFF_UPGRADE_BASE_COST = { hawker: 10, server: 12, cook: 15, buyer: 12 } as const;
const STAFF_UPGRADE_COST_MULTIPLIER = 1.6;

const COLOR_PLAYER = 0xffa94d;
const COLOR_STAFF = 0x4da6ff;

type Driver = "player" | "staff";
type ProductionRole = "hawker" | "server" | "cook";
type StaffRole = ProductionRole | "buyer";
type GameState = "closed" | "selectingMenu" | "open";

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

function getStaffUpgradeCost(role: StaffRole, level: number): number {
  const base = STAFF_UPGRADE_BASE_COST[role];
  return Math.round(base * Math.pow(STAFF_UPGRADE_COST_MULTIPLIER, level - 1));
}

/** 采购耗时：玩家固定基准（受装潢略缩），采买伙计随等级提速。 */
function getPurchaseDuration(tavernLevel: number, staffLevel: number, isStaff: boolean): number {
  const shrink = (tavernLevel - 1) * PURCHASE_TAVERN_SHRINK_PER_LEVEL_MS;
  if (!isStaff) return Math.max(PURCHASE_FLOOR_MS, PURCHASE_TIME_MS - shrink);
  const raw = PURCHASE_TIME_MS * Math.pow(PURCHASE_STAFF_LEVEL_SPEEDUP, Math.max(staffLevel, 1) - 1) - shrink;
  return Math.max(PURCHASE_FLOOR_MS, raw);
}

// 数值自检
console.assert(getBoothCount(1) === TABLE_COUNT_BASE, "1 级应为基础雅座/排队容量");
console.assert(getUpgradeCost(2) > getUpgradeCost(1), "升级花费应随等级递增");
console.assert(DISHES[0].unlockLevel === 1, "第一道菜应在 1 级即可用");
console.assert(DISHES.every((d) => d.price > 0 && d.cookMs > 0), "菜品应有正售价与耗时");
console.assert(
  DISHES[DISHES.length - 1].cookMs > DISHES[0].cookMs,
  "高售价菜品应更耗时（快速走量 vs 高客单价）",
);
console.assert(
  getStaffDuration("hawker", HAWK_BASE_MS, HAWK_TAVERN_SHRINK_PER_LEVEL_MS, HAWK_FLOOR_MS, 1, 1) > HAWK_BASE_MS,
  "伙计 1 级应比玩家慢",
);
console.assert(
  STAFF_LEVEL_SPEEDUP.server > STAFF_LEVEL_SPEEDUP.cook && STAFF_LEVEL_SPEEDUP.cook > STAFF_LEVEL_SPEEDUP.hawker,
  "基础越快的岗位成长应越慢",
);
console.assert(getPurchaseDuration(1, 0, false) === PURCHASE_TIME_MS, "采购基础耗时应为 15 秒");
console.assert(getPurchaseDuration(1, 3, true) < getPurchaseDuration(1, 1, true), "采买等级越高采购越快");

type BoothState = "empty" | "seating" | "awaitingCook" | "cooking" | "dining";

interface Booth {
  state: BoothState;
  cookingDriver: Driver | null;
  currentDish: Dish | null;
  cookStartedAt: number;
  cookDoneAt: number;
  departAt: number;
}

interface BoothVisual {
  text: Phaser.GameObjects.Text;
  progressTrack: Phaser.GameObjects.Rectangle;
  progressFill: Phaser.GameObjects.Rectangle;
}

interface QueuedPatron {
  expiresAt: number;
}

interface OpProgress {
  startedAt: number;
  duration: number;
}

interface SeatProgress extends OpProgress {
  boothIndex: number;
}

interface StaffLevels {
  hawker: number;
  server: number;
  cook: number;
  buyer: number;
}

interface PurchaseProgress extends OpProgress {
  amount: number;
}

/** 按钮内叠两条进度条：上=伙计（蓝），下=玩家（橙），两者独立并行。 */
class ProgressButton {
  private static readonly BAR_WIDTH = 165;

  private track: Phaser.GameObjects.Rectangle;
  private playerFill: Phaser.GameObjects.Rectangle;
  private staffFill: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number, onClick: () => void) {
    this.track = scene.add.rectangle(x, y, width, height, 0x444444).setOrigin(0, 0);
    const barX = x + width - ProgressButton.BAR_WIDTH - 10;
    this.staffFill = scene.add.rectangle(barX, y + 5, 0, 11, COLOR_STAFF).setOrigin(0, 0);
    this.playerFill = scene.add.rectangle(barX, y + height - 16, 0, 11, COLOR_PLAYER).setOrigin(0, 0);
    this.label = scene.add
      .text(x + 10, y + height / 2, "", { fontSize: "16px", color: "#ffffff" })
      .setOrigin(0, 0.5);
    this.track.setInteractive({ useHandCursor: true }).on("pointerdown", onClick);
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
      this.track.setInteractive({ useHandCursor: true });
      this.track.setAlpha(1);
    } else {
      this.track.disableInteractive();
      this.track.setAlpha(0.6);
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

class TavernScene extends Phaser.Scene {
  private coins = STARTING_COINS;
  private inventory = STARTING_INVENTORY;
  private level = 1;
  private booths: Booth[] = [];
  private queue: QueuedPatron[] = [];
  private staffLevel: StaffLevels = { hawker: 0, server: 0, cook: 0, buyer: 0 };
  private chronicleLines: string[] = [];

  private gameState: GameState = "closed";
  private selectedDishIds = new Set<string>();
  private dishCursor = 0;
  private sessionEndsAt = 0;
  private sessionServed = 0;
  private sessionRevenue = 0;
  private sessionLost = 0;

  private playerHawk: OpProgress | null = null;
  private playerSeat: SeatProgress | null = null;
  private playerCookingBooth: number | null = null;
  private playerPurchasing: PurchaseProgress | null = null;

  private staffHawk: OpProgress | null = null;
  private staffSeat: SeatProgress | null = null;
  private staffCookingBooth: number | null = null;
  private staffPurchasing: PurchaseProgress | null = null;

  private coinsText!: Phaser.GameObjects.Text;
  private inventoryText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private queueText!: Phaser.GameObjects.Text;
  private lineText!: Phaser.GameObjects.Text;
  private sessionText!: Phaser.GameObjects.Text;
  private chronicleText!: Phaser.GameObjects.Text;
  private boothVisuals: BoothVisual[] = [];

  private hawkButton!: ProgressButton;
  private hireHawkerButton!: Phaser.GameObjects.Text;
  private serveButton!: ProgressButton;
  private hireServerButton!: Phaser.GameObjects.Text;
  private cookButton!: Phaser.GameObjects.Text;
  private hireCookButton!: Phaser.GameObjects.Text;
  private purchaseButton!: ProgressButton;
  private hireBuyerButton!: Phaser.GameObjects.Text;
  private upgradeButton!: Phaser.GameObjects.Text;
  private startButton!: Phaser.GameObjects.Text;

  private overlay: Phaser.GameObjects.Container | null = null;

  constructor() {
    super("tavern");
  }

  create() {
    this.booths = Array.from({ length: getBoothCount(this.level) }, () => this.makeBooth());
    this.selectedDishIds = new Set(DISHES.filter((d) => d.unlockLevel <= this.level).map((d) => d.id));

    this.add.text(20, 20, "酒楼经营", { fontSize: "32px", color: "#ffffff" });

    this.coinsText = this.add.text(20, 70, "", { fontSize: "20px", color: "#ffd700" });
    this.inventoryText = this.add.text(20, 100, "", { fontSize: "20px", color: "#9fe870" });
    this.levelText = this.add.text(20, 130, "", { fontSize: "20px", color: "#87ceeb" });
    this.queueText = this.add.text(20, 160, "", { fontSize: "20px", color: "#e0b0ff" });
    this.lineText = this.add.text(20, 190, "", { fontSize: "16px", color: "#ff9d9d" });
    this.sessionText = this.add.text(20, 215, "", { fontSize: "16px", color: "#a8d8ff" });

    this.add.text(20, 245, "见闻录：", { fontSize: "16px", color: "#888888" });
    this.chronicleText = this.add.text(20, 270, "", {
      fontSize: "16px",
      color: "#cccccc",
      lineSpacing: 6,
    });

    this.boothVisuals = this.booths.map((_, i) => this.makeBoothVisual(i));

    const h = this.scale.height;
    this.startButton = this.makeButton(h - 596, () => this.onStartButton());
    this.hireHawkerButton = this.makeButton(h - 544, () => this.hireStaff("hawker"));
    this.hawkButton = new ProgressButton(this, 20, h - 486, 460, 36, () => this.startHawk("player"));
    this.hireServerButton = this.makeButton(h - 428, () => this.hireStaff("server"));
    this.serveButton = new ProgressButton(this, 20, h - 370, 460, 36, () => this.startSeat("player"));
    this.hireCookButton = this.makeButton(h - 312, () => this.hireStaff("cook"));
    this.cookButton = this.makeButton(h - 254, () => this.manualCook());
    this.hireBuyerButton = this.makeButton(h - 196, () => this.hireStaff("buyer"));
    this.purchaseButton = new ProgressButton(this, 20, h - 138, 460, 36, () => this.startPurchase("player"));
    this.upgradeButton = this.makeButton(h - 80, () => this.upgradeTavern());

    this.refreshHud();
  }

  update(time: number) {
    if (this.gameState === "open") {
      if (time >= this.sessionEndsAt) {
        this.endSession();
        return;
      }
      this.tickOpenSession(time);
    }

    this.tickPurchase(time);
    if (this.gameState === "closed") this.tickClosedProcurement();

    this.renderProgress(time);
    this.refreshHud();
  }

  /** 采购到货：下单时已扣钱，进度条跑完才真正入库。 */
  private tickPurchase(time: number) {
    if (this.playerPurchasing && time >= this.playerPurchasing.startedAt + this.playerPurchasing.duration) {
      this.inventory += this.playerPurchasing.amount;
      this.log(`采购到货 +${this.playerPurchasing.amount} 灵材`);
      this.playerPurchasing = null;
    }
    if (this.staffPurchasing && time >= this.staffPurchasing.startedAt + this.staffPurchasing.duration) {
      this.inventory += this.staffPurchasing.amount;
      this.log(`采买伙计补货到店 +${this.staffPurchasing.amount} 灵材`);
      this.staffPurchasing = null;
    }
  }

  /** 打烊阶段采买伙计按正常价自动补货，一直补到目标库存。营业中不插手。 */
  private tickClosedProcurement() {
    if (this.staffLevel.buyer === 0 || this.staffPurchasing) return;
    if (this.inventory >= PURCHASE_TARGET_STOCK) return;
    if (this.coins < PURCHASE_COST) return;
    this.startPurchase("staff");
  }

  private tickOpenSession(time: number) {
    this.queue = this.queue.filter((patron) => {
      if (time >= patron.expiresAt) {
        this.sessionLost += 1;
        this.log("一位食客候得不耐，拂袖离去");
        return false;
      }
      return true;
    });

    this.playerHawk = this.resolveHawk(this.playerHawk, time, "player");
    this.staffHawk = this.resolveHawk(this.staffHawk, time, "staff");
    this.playerSeat = this.resolveSeat(this.playerSeat, time, "player");
    this.staffSeat = this.resolveSeat(this.staffSeat, time, "staff");

    this.booths.forEach((booth, index) => {
      if (booth.state === "cooking" && time >= booth.cookDoneAt) {
        booth.state = "dining";
        booth.departAt = time + DINING_MS;
        this.log("出餐完毕，食客开始用膳");
        if (booth.cookingDriver === "player" && this.playerCookingBooth === index) this.playerCookingBooth = null;
        if (booth.cookingDriver === "staff" && this.staffCookingBooth === index) this.staffCookingBooth = null;
      } else if (booth.state === "dining" && time >= booth.departAt) {
        const price = booth.currentDish?.price ?? 0;
        const dishName = booth.currentDish?.name ?? "菜";
        booth.state = "empty";
        booth.cookingDriver = null;
        booth.currentDish = null;
        this.coins += price;
        this.sessionServed += 1;
        this.sessionRevenue += price;
        this.log(`食客用罢${dishName}离店，收入 +${price} 灵石`);
      }
    });

    if (this.staffLevel.hawker > 0 && !this.staffHawk) this.startHawk("staff");
    if (this.staffLevel.server > 0 && !this.staffSeat) this.startSeat("staff");
    if (this.staffLevel.cook > 0 && this.staffCookingBooth === null) {
      const index = this.booths.findIndex((booth) => booth.state === "awaitingCook");
      if (index !== -1) this.startCook(this.booths[index], index, "staff");
    }
  }

  // ---------- 营业回合 ----------

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
    const layer = this.add.container(0, 0).setDepth(100);
    layer.add(this.add.rectangle(0, 0, 720, 1280, 0x000000, 0.92).setOrigin(0, 0));
    layer.add(this.add.text(40, 70, "选择今日菜单", { fontSize: "30px", color: "#ffffff" }));
    layer.add(
      this.add.text(40, 115, "至少选一道菜才能开张；营业中按顺序轮转上菜", {
        fontSize: "16px",
        color: "#999999",
      }),
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
        this.add.text(60, y + 14, `${selected ? "☑" : "☐"} ${dish.name}`, {
          fontSize: "22px",
          color: "#ffffff",
        }),
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
    const start = this.add
      .text(40, 1120, canStart ? `开张大吉（已选 ${count} 道）` : "至少选一道菜", {
        fontSize: "22px",
        color: canStart ? "#ffffff" : "#777777",
        backgroundColor: canStart ? "#3f7a3f" : "#333333",
        padding: { x: 16, y: 12 },
      });
    if (canStart) {
      start.setInteractive({ useHandCursor: true }).on("pointerdown", () => this.startSession());
    }
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
    if (this.selectedDishIds.size === 0) return;
    this.destroyOverlay();
    this.gameState = "open";

    this.queue = [];
    this.booths.forEach((booth) => {
      booth.state = "empty";
      booth.cookingDriver = null;
      booth.currentDish = null;
      booth.cookStartedAt = 0;
      booth.cookDoneAt = 0;
      booth.departAt = 0;
    });
    this.playerHawk = null;
    this.playerSeat = null;
    this.playerCookingBooth = null;
    this.staffHawk = null;
    this.staffSeat = null;
    this.staffCookingBooth = null;

    this.dishCursor = 0;
    this.sessionServed = 0;
    this.sessionRevenue = 0;
    this.sessionLost = 0;
    this.sessionEndsAt = this.time.now + SESSION_DURATION_MS;
    this.log("开张大吉，今日营业开始");
  }

  private endSession() {
    this.gameState = "closed";
    this.sessionEndsAt = 0;
    // 打烊时在途采购立即到货，钱已扣不退还
    if (this.playerPurchasing) {
      this.inventory += this.playerPurchasing.amount;
      this.log(`打烊，采购的灵材到店 +${this.playerPurchasing.amount}`);
      this.playerPurchasing = null;
    }
    if (this.staffPurchasing) {
      this.inventory += this.staffPurchasing.amount;
      this.log(`打烊，采买伙计的货到店 +${this.staffPurchasing.amount}`);
      this.staffPurchasing = null;
    }
    this.playerHawk = null;
    this.playerSeat = null;
    this.playerCookingBooth = null;
    this.staffHawk = null;
    this.staffSeat = null;
    this.staffCookingBooth = null;
    this.queue = [];
    this.booths.forEach((booth) => {
      booth.state = "empty";
      booth.cookingDriver = null;
      booth.currentDish = null;
    });
    this.log("打烊，今日营业结束");
    this.buildSettlementOverlay();
  }

  private buildSettlementOverlay() {
    this.destroyOverlay();
    const layer = this.add.container(0, 0).setDepth(100);
    layer.add(this.add.rectangle(0, 0, 720, 1280, 0x000000, 0.92).setOrigin(0, 0));
    layer.add(this.add.text(40, 200, "今日营业结束", { fontSize: "32px", color: "#ffffff" }));
    const lines = [
      `服务食客：${this.sessionServed} 位`,
      `总收益：${this.sessionRevenue} 灵石`,
      `流失食客：${this.sessionLost} 位`,
    ];
    lines.forEach((line, i) => {
      layer.add(this.add.text(40, 320 + i * 60, line, { fontSize: "24px", color: "#e8e8e8" }));
    });
    const close = this.add
      .text(40, 620, "回到打烊状态", {
        fontSize: "22px",
        color: "#ffffff",
        backgroundColor: "#3f5a7a",
        padding: { x: 16, y: 12 },
      })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.destroyOverlay());
    layer.add(close);
    this.overlay = layer;
  }

  private destroyOverlay() {
    this.overlay?.destroy(true);
    this.overlay = null;
  }

  // ---------- 场景与 UI ----------

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

  private makeBoothVisual(index: number): BoothVisual {
    const y = 400 + index * 30;
    const text = this.add.text(20, y, "", { fontSize: "16px", color: "#ffffff" });
    const progressTrack = this.add.rectangle(360, y + 3, 120, 12, 0x444444).setOrigin(0, 0).setVisible(false);
    const progressFill = this.add.rectangle(360, y + 3, 0, 12, COLOR_PLAYER).setOrigin(0, 0).setVisible(false);
    return { text, progressTrack, progressFill };
  }

  private makeButton(y: number, onClick: () => void): Phaser.GameObjects.Text {
    return this.add
      .text(20, y, "", {
        fontSize: "16px",
        color: "#ffffff",
        backgroundColor: "#444444",
        padding: { x: 10, y: 6 },
      })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", onClick);
  }

  private setButtonEnabled(button: Phaser.GameObjects.Text, enabled: boolean) {
    if (enabled) {
      button.setInteractive({ useHandCursor: true }).setAlpha(1);
    } else {
      button.disableInteractive().setAlpha(0.6);
    }
  }

  private isPlayerBusy(): boolean {
    return (
      this.playerHawk !== null ||
      this.playerSeat !== null ||
      this.playerCookingBooth !== null ||
      this.playerPurchasing !== null
    );
  }

  private getUnlockedDishes(): Dish[] {
    return DISHES.filter((d) => d.unlockLevel <= this.level);
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

  // ---------- 产线动作 ----------

  private startHawk(driver: Driver) {
    if (driver === "player" && this.isPlayerBusy()) return;
    if (driver === "staff" && this.staffHawk) return;
    if (this.queue.length >= getBoothCount(this.level)) return;

    const duration =
      driver === "player"
        ? getPlayerDuration(HAWK_BASE_MS, HAWK_TAVERN_SHRINK_PER_LEVEL_MS, HAWK_FLOOR_MS, this.level)
        : getStaffDuration(
            "hawker",
            HAWK_BASE_MS,
            HAWK_TAVERN_SHRINK_PER_LEVEL_MS,
            HAWK_FLOOR_MS,
            this.level,
            this.staffLevel.hawker,
          );
    const progress: OpProgress = { startedAt: this.time.now, duration };
    if (driver === "player") this.playerHawk = progress;
    else this.staffHawk = progress;
  }

  private resolveHawk(progress: OpProgress | null, time: number, driver: Driver): OpProgress | null {
    if (!progress || time < progress.startedAt + progress.duration) return progress;
    if (this.queue.length >= getBoothCount(this.level)) {
      this.sessionLost += 1;
      this.log("门外已候满，吆喝不出新客");
    } else {
      this.queue.push({ expiresAt: time + QUEUE_PATIENCE_MS });
      this.log(driver === "player" ? "你吆喝一声，食客上门排队" : "迎客伙计招来一位食客排队");
    }
    return null;
  }

  private startSeat(driver: Driver) {
    if (driver === "player" && this.isPlayerBusy()) return;
    if (driver === "staff" && this.staffSeat) return;
    if (this.queue.length === 0) return;

    const boothIndex = this.booths.findIndex((booth) => booth.state === "empty");
    if (boothIndex === -1) return;

    this.queue.shift();
    this.booths[boothIndex].state = "seating";
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
  }

  private resolveSeat(progress: SeatProgress | null, time: number, driver: Driver): SeatProgress | null {
    if (!progress || time < progress.startedAt + progress.duration) return progress;
    const booth = this.booths[progress.boothIndex];
    if (booth) {
      booth.state = "awaitingCook";
      this.log(driver === "player" ? "你领食客入座雅座，等候烹饪" : "跑堂伙计领食客入座雅座");
    }
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
    this.log(
      driver === "player" ? `你下厨烹制${dish.name}` : `灶上伙计烹制${dish.name}（雅座 ${index + 1}）`,
    );
  }

  /** 打烊阶段按正常价采购；营业中只允许紧急采购，价格翻倍。下单即扣钱，到货才入库。 */
  private startPurchase(driver: Driver) {
    const emergency = this.gameState === "open";
    const price = emergency ? PURCHASE_COST * PURCHASE_EMERGENCY_MULTIPLIER : PURCHASE_COST;

    if (driver === "player") {
      if (this.isPlayerBusy()) return;
      if (this.coins < price) {
        this.log(emergency ? "灵石不足，无法紧急采购" : "灵石不足，无法采购");
        return;
      }
      this.coins -= price;
      this.playerPurchasing = {
        startedAt: this.time.now,
        duration: getPurchaseDuration(this.level, 0, false),
        amount: PURCHASE_AMOUNT,
      };
      this.log(emergency ? "紧急采购下单（价格翻倍），等货中" : "采购下单，等货中");
    } else {
      if (this.staffPurchasing) return;
      if (this.coins < price) return;
      this.coins -= price;
      this.staffPurchasing = {
        startedAt: this.time.now,
        duration: getPurchaseDuration(this.level, this.staffLevel.buyer, true),
        amount: PURCHASE_AMOUNT,
      };
      this.log("采买伙计出门补货了");
    }
  }

  private upgradeTavern() {
    const cost = getUpgradeCost(this.level);
    if (this.coins < cost) {
      this.log("灵石不足，无法装潢升级");
      return;
    }
    this.coins -= cost;
    this.level += 1;
    this.booths.push(this.makeBooth());
    this.boothVisuals.push(this.makeBoothVisual(this.booths.length - 1));

    const unlocked = DISHES.find((d) => d.unlockLevel === this.level);
    this.log(
      unlocked
        ? `酒楼装潢升级到 ${this.level} 级，解锁新菜品「${unlocked.name}」`
        : `酒楼装潢升级到 ${this.level} 级`,
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
    this.staffLevel[role] = 1;

    const roleName = { hawker: "迎客", server: "跑堂", cook: "灶上", buyer: "采买" }[role];
    this.log(`雇到一位${roleName}伙计，此后自动运作`);

    const hireButton = {
      hawker: this.hireHawkerButton,
      server: this.hireServerButton,
      cook: this.hireCookButton,
      buyer: this.hireBuyerButton,
    }[role];
    hireButton.off("pointerdown").on("pointerdown", () => this.upgradeStaff(role));
  }

  private upgradeStaff(role: StaffRole) {
    const cost = getStaffUpgradeCost(role, this.staffLevel[role]);
    if (this.coins < cost) {
      this.log("灵石不足，无法提升伙计等级");
      return;
    }
    this.coins -= cost;
    this.staffLevel[role] += 1;
    const roleName = { hawker: "迎客", server: "跑堂", cook: "灶上", buyer: "采买" }[role];
    this.log(`${roleName}伙计升至 ${this.staffLevel[role]} 级，手脚更利索了`);
  }

  private log(text: string) {
    this.chronicleLines.push(text);
    if (this.chronicleLines.length > CHRONICLE_MAX_LINES) {
      this.chronicleLines.shift();
    }
  }

  private boothLabel(booth: Booth): string {
    const base = { empty: "空闲", seating: "招待中", awaitingCook: "待烹饪", cooking: "烹饪中", dining: "用膳中" }[
      booth.state
    ];
    return booth.state === "cooking" && booth.currentDish ? `${base}·${booth.currentDish.name}` : base;
  }

  private getStaffBottleneck(): string {
    const durations: Record<ProductionRole, number> = {
      hawker: getStaffDuration("hawker", HAWK_BASE_MS, HAWK_TAVERN_SHRINK_PER_LEVEL_MS, HAWK_FLOOR_MS, this.level, this.staffLevel.hawker),
      server: getStaffDuration("server", SEAT_BASE_MS, SEAT_TAVERN_SHRINK_PER_LEVEL_MS, SEAT_FLOOR_MS, this.level, this.staffLevel.server),
      // 烹饪耗时随菜品变化，这里用菜品平均耗时做基准估算
      cook: getStaffDuration(
        "cook",
        DISHES.reduce((sum, d) => sum + d.cookMs, 0) / DISHES.length,
        COOK_TAVERN_SHRINK_PER_LEVEL_MS,
        COOK_FLOOR_MS,
        this.level,
        this.staffLevel.cook,
      ),
    };
    const nameOf: Record<ProductionRole, string> = { hawker: "迎客", server: "跑堂", cook: "灶上" };

    if (this.staffLevel.hawker === 0 || this.staffLevel.server === 0 || this.staffLevel.cook === 0) {
      const hired = (["hawker", "server", "cook"] as ProductionRole[])
        .filter((role) => this.staffLevel[role] > 0)
        .map((role) => `${nameOf[role]} ${(durations[role] / 1000).toFixed(1)}s`);
      return `伙计产线：${hired.length ? hired.join(" / ") : "尚未雇人"}`;
    }

    let slowestRole: ProductionRole = "hawker";
    for (const role of ["server", "cook"] as ProductionRole[]) {
      if (durations[role] > durations[slowestRole]) slowestRole = role;
    }
    const list = (["hawker", "server", "cook"] as ProductionRole[])
      .map((role) => `${nameOf[role]} ${(durations[role] / 1000).toFixed(1)}s`)
      .join(" / ");
    return `伙计产线：${list}（瓶颈：${nameOf[slowestRole]}）`;
  }

  private renderProgress(time: number) {
    const playerHawkFraction = this.playerHawk
      ? (time - this.playerHawk.startedAt) / this.playerHawk.duration
      : 0;
    const staffHawkFraction = this.staffHawk ? (time - this.staffHawk.startedAt) / this.staffHawk.duration : 0;
    this.hawkButton.setProgress(playerHawkFraction, staffHawkFraction);
    this.hawkButton.setEnabled(
      this.gameState === "open" && this.queue.length < getBoothCount(this.level) && !this.isPlayerBusy(),
    );

    const playerSeatFraction = this.playerSeat
      ? (time - this.playerSeat.startedAt) / this.playerSeat.duration
      : 0;
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
    const staffPurchaseFraction = this.staffPurchasing
      ? (time - this.staffPurchasing.startedAt) / this.staffPurchasing.duration
      : 0;
    this.purchaseButton.setProgress(playerPurchaseFraction, staffPurchaseFraction);
    const purchasePrice =
      this.gameState === "open" ? PURCHASE_COST * PURCHASE_EMERGENCY_MULTIPLIER : PURCHASE_COST;
    this.purchaseButton.setEnabled(!this.isPlayerBusy() && this.coins >= purchasePrice);

    this.booths.forEach((booth, i) => {
      const visual = this.boothVisuals[i];
      const cooking = booth.state === "cooking";
      visual.progressTrack.setVisible(cooking);
      visual.progressFill.setVisible(cooking);
      if (cooking) {
        visual.progressFill.setFillStyle(booth.cookingDriver === "player" ? COLOR_PLAYER : COLOR_STAFF);
        const fraction = (time - booth.cookStartedAt) / (booth.cookDoneAt - booth.cookStartedAt);
        visual.progressFill.width = (visual.progressTrack.width as number) * Phaser.Math.Clamp(fraction, 0, 1);
      }
    });
  }

  private refreshHud() {
    const open = this.gameState === "open";

    this.coinsText.setText(`灵石：${this.coins}`);
    this.inventoryText.setText(`灵材：${this.inventory}`);
    this.levelText.setText(`酒楼等级：${this.level}`);
    this.queueText.setText(`排队：${this.queue.length}/${getBoothCount(this.level)}`);
    this.lineText.setText(this.getStaffBottleneck());
    this.sessionText.setText(
      open
        ? `营业中 · 剩余 ${Math.max(0, Math.ceil((this.sessionEndsAt - this.time.now) / 1000))}s · 本局 ${this.sessionServed} 位 / ${this.sessionRevenue} 灵石`
        : `打烊中 · 已解锁菜品 ${this.getUnlockedDishes().length} 道`,
    );
    this.chronicleText.setText(this.chronicleLines.join("\n"));

    this.booths.forEach((booth, i) => {
      this.boothVisuals[i].text.setText(`雅座 ${i + 1}：${this.boothLabel(booth)}`);
    });

    this.startButton.setText(open ? "提前打烊" : "开始营业");

    // 营业中只留采购与产线操作；经营操作收在打烊时
    this.startButton.setVisible(true);
    this.hawkButton.setVisible(open);
    this.serveButton.setVisible(open);
    this.cookButton.setVisible(open);
    this.hireHawkerButton.setVisible(!open);
    this.hireServerButton.setVisible(!open);
    this.hireCookButton.setVisible(!open);
    this.hireBuyerButton.setVisible(!open);
    this.upgradeButton.setVisible(!open);
    this.purchaseButton.setVisible(true);

    this.hawkButton.setLabel("吆喝招揽");
    this.hireHawkerButton.setText(
      this.staffLevel.hawker > 0
        ? `升级迎客伙计（${getStaffUpgradeCost("hawker", this.staffLevel.hawker)} 灵石 → ${
            this.staffLevel.hawker
          }→${this.staffLevel.hawker + 1} 级）`
        : `雇迎客伙计（${HIRE_COST_HAWKER} 灵石 → 自动吆喝）`,
    );

    this.serveButton.setLabel("招待入座");
    this.hireServerButton.setText(
      this.staffLevel.server > 0
        ? `升级跑堂伙计（${getStaffUpgradeCost("server", this.staffLevel.server)} 灵石 → ${
            this.staffLevel.server
          }→${this.staffLevel.server + 1} 级）`
        : `雇跑堂伙计（${HIRE_COST_SERVER} 灵石 → 自动招待）`,
    );

    this.cookButton.setText("动手烹饪");
    this.hireCookButton.setText(
      this.staffLevel.cook > 0
        ? `升级灶上伙计（${getStaffUpgradeCost("cook", this.staffLevel.cook)} 灵石 → ${
            this.staffLevel.cook
          }→${this.staffLevel.cook + 1} 级）`
        : `雇灶上伙计（${HIRE_COST_COOK} 灵石 → 自动烹饪）`,
    );

    const purchasePriceLabel =
      this.gameState === "open" ? PURCHASE_COST * PURCHASE_EMERGENCY_MULTIPLIER : PURCHASE_COST;
    this.purchaseButton.setLabel(
      this.gameState === "open"
        ? `紧急采购（${purchasePriceLabel} 灵石 → +${PURCHASE_AMOUNT} 灵材）`
        : `采购灵材（${purchasePriceLabel} 灵石 → +${PURCHASE_AMOUNT} 灵材）`,
    );
    this.hireBuyerButton.setText(
      this.staffLevel.buyer > 0
        ? `升级采买伙计（${getStaffUpgradeCost("buyer", this.staffLevel.buyer)} 灵石 → ${
            this.staffLevel.buyer
          }→${this.staffLevel.buyer + 1} 级）`
        : `雇采买伙计（${HIRE_COST_BUYER} 灵石 → 打烊自动补货）`,
    );

    const unlocked = DISHES.find((d) => d.unlockLevel === this.level + 1);
    this.upgradeButton.setText(
      unlocked
        ? `装潢升级（花费 ${getUpgradeCost(this.level)} 灵石 → 等级+1，雅座/排队+1，解锁「${unlocked.name}」）`
        : `装潢升级（花费 ${getUpgradeCost(this.level)} 灵石 → 等级+1，雅座/排队+1）`,
    );
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: 720,
  height: 1280,
  backgroundColor: "#2d2d2d",
  scene: [TavernScene],
});
