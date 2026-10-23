import Phaser from "phaser";

// 占位数值，先验证流程手感，后续可随时调整
const TABLE_COUNT_BASE = 3;
const QUEUE_PATIENCE_MS = 8000;
const DINING_MS = 3000;
const REVENUE_PER_PATRON = 8;
const PURCHASE_COST = 5;
const PURCHASE_AMOUNT = 5;
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

const COOK_BASE_MS = 2000;
const COOK_TAVERN_SHRINK_PER_LEVEL_MS = 200;
const COOK_FLOOR_MS = 500;

// 伙计 1 级耗时是玩家基准的 1.6 倍（更慢），每升一级耗时 ×0.85，约 4 级追平玩家
const STAFF_SPEED_PENALTY = 1.6;
const STAFF_LEVEL_SPEEDUP = 0.85;

const STAFF_UPGRADE_BASE_COST = { hawker: 10, server: 12, cook: 15 } as const;
const STAFF_UPGRADE_COST_MULTIPLIER = 1.6;

const COLOR_PLAYER = 0xffa94d;
const COLOR_STAFF = 0x4da6ff;

type Driver = "player" | "staff";

function getBoothCount(level: number): number {
  return TABLE_COUNT_BASE + (level - 1);
}

function getUpgradeCost(level: number): number {
  return Math.round(UPGRADE_BASE_COST * Math.pow(UPGRADE_COST_MULTIPLIER, level - 1));
}

/** 玩家手动操作耗时：只受装潢等级影响，玩家速度不随伙计等级变化。 */
function getPlayerDuration(base: number, shrinkPerLevel: number, floor: number, tavernLevel: number): number {
  return Math.max(floor, base - (tavernLevel - 1) * shrinkPerLevel);
}

/** 伙计自动操作耗时：同样受装潢加速，再叠加伙计等级带来的提速。 */
function getStaffDuration(
  base: number,
  shrinkPerLevel: number,
  floor: number,
  tavernLevel: number,
  staffLevel: number,
): number {
  const raw =
    base * STAFF_SPEED_PENALTY * Math.pow(STAFF_LEVEL_SPEEDUP, Math.max(staffLevel, 1) - 1) -
    (tavernLevel - 1) * shrinkPerLevel;
  return Math.max(floor, raw);
}

function getStaffUpgradeCost(role: "hawker" | "server" | "cook", level: number): number {
  const base = STAFF_UPGRADE_BASE_COST[role];
  return Math.round(base * Math.pow(STAFF_UPGRADE_COST_MULTIPLIER, level - 1));
}

// 数值自检
console.assert(getBoothCount(1) === TABLE_COUNT_BASE, "1 级应为基础雅座/排队容量");
console.assert(getUpgradeCost(1) === UPGRADE_BASE_COST, "1 级升级花费应为基础花费");
console.assert(getUpgradeCost(2) > getUpgradeCost(1), "升级花费应随等级递增");
console.assert(
  getPlayerDuration(HAWK_BASE_MS, HAWK_TAVERN_SHRINK_PER_LEVEL_MS, HAWK_FLOOR_MS, 1) === HAWK_BASE_MS,
  "1 级装潢玩家耗时应为基础值",
);
console.assert(
  getPlayerDuration(HAWK_BASE_MS, HAWK_TAVERN_SHRINK_PER_LEVEL_MS, HAWK_FLOOR_MS, 3) < HAWK_BASE_MS,
  "装潢等级越高玩家应越快",
);
console.assert(
  getStaffDuration(HAWK_BASE_MS, HAWK_TAVERN_SHRINK_PER_LEVEL_MS, HAWK_FLOOR_MS, 1, 1) > HAWK_BASE_MS,
  "伙计 1 级应比玩家慢",
);
console.assert(
  getStaffDuration(HAWK_BASE_MS, HAWK_TAVERN_SHRINK_PER_LEVEL_MS, HAWK_FLOOR_MS, 1, 4) < HAWK_BASE_MS,
  "伙计约 4 级应追上并超过玩家",
);
console.assert(
  getStaffDuration(HAWK_BASE_MS, HAWK_TAVERN_SHRINK_PER_LEVEL_MS, HAWK_FLOOR_MS, 5, 5) >= HAWK_FLOOR_MS,
  "伙计耗时不应低于下限",
);
console.assert(getStaffUpgradeCost("hawker", 1) === STAFF_UPGRADE_BASE_COST.hawker, "1→2 级花费应为基础花费");
console.assert(getStaffUpgradeCost("hawker", 2) > getStaffUpgradeCost("hawker", 1), "伙计升级花费应递增");

type BoothState = "empty" | "seating" | "awaitingCook" | "cooking" | "dining";

interface Booth {
  state: BoothState;
  cookingDriver: Driver | null;
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
}

class TavernScene extends Phaser.Scene {
  private coins = STARTING_COINS;
  private inventory = STARTING_INVENTORY;
  private level = 1;
  private booths: Booth[] = [];
  private queue: QueuedPatron[] = [];
  private staffLevel: StaffLevels = { hawker: 0, server: 0, cook: 0 };
  private buyerHired = false;
  private chronicleLines: string[] = [];

  private playerHawk: OpProgress | null = null;
  private staffHawk: OpProgress | null = null;
  private playerSeat: SeatProgress | null = null;
  private staffSeat: SeatProgress | null = null;

  private coinsText!: Phaser.GameObjects.Text;
  private inventoryText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private queueText!: Phaser.GameObjects.Text;
  private chronicleText!: Phaser.GameObjects.Text;
  private boothVisuals: BoothVisual[] = [];

  private hawkButton!: ProgressButton;
  private hireHawkerButton!: Phaser.GameObjects.Text;
  private serveButton!: ProgressButton;
  private hireServerButton!: Phaser.GameObjects.Text;
  private cookButton!: Phaser.GameObjects.Text;
  private hireCookButton!: Phaser.GameObjects.Text;
  private purchaseButton!: Phaser.GameObjects.Text;
  private hireBuyerButton!: Phaser.GameObjects.Text;
  private upgradeButton!: Phaser.GameObjects.Text;

  constructor() {
    super("tavern");
  }

  create() {
    this.booths = Array.from({ length: getBoothCount(this.level) }, () => this.makeBooth());

    this.add.text(20, 20, "酒楼经营", { fontSize: "32px", color: "#ffffff" });

    this.coinsText = this.add.text(20, 70, "", { fontSize: "20px", color: "#ffd700" });
    this.inventoryText = this.add.text(20, 100, "", { fontSize: "20px", color: "#9fe870" });
    this.levelText = this.add.text(20, 130, "", { fontSize: "20px", color: "#87ceeb" });
    this.queueText = this.add.text(20, 160, "", { fontSize: "20px", color: "#e0b0ff" });

    this.add.text(20, 195, "见闻录：", { fontSize: "16px", color: "#888888" });
    this.chronicleText = this.add.text(20, 220, "", {
      fontSize: "16px",
      color: "#cccccc",
      lineSpacing: 6,
    });

    this.boothVisuals = this.booths.map((_, i) => this.makeBoothVisual(i));

    const h = this.scale.height;
    this.hireHawkerButton = this.makeButton(h - 544, () => this.hireStaff("hawker"));
    this.hawkButton = new ProgressButton(this, 20, h - 486, 460, 36, () => this.startHawk("player"));
    this.hireServerButton = this.makeButton(h - 428, () => this.hireStaff("server"));
    this.serveButton = new ProgressButton(this, 20, h - 370, 460, 36, () => this.startSeat("player"));
    this.hireCookButton = this.makeButton(h - 312, () => this.hireStaff("cook"));
    this.cookButton = this.makeButton(h - 254, () => this.manualCook());
    this.hireBuyerButton = this.makeButton(h - 196, () => this.hireStaff("buyer"));
    this.purchaseButton = this.makeButton(h - 138, () => this.purchaseInventory());
    this.upgradeButton = this.makeButton(h - 80, () => this.upgradeTavern());

    this.refreshHud();
  }

  update(time: number) {
    this.queue = this.queue.filter((patron) => {
      if (time >= patron.expiresAt) {
        this.log("一位食客候得不耐，拂袖离去");
        return false;
      }
      return true;
    });

    this.playerHawk = this.resolveHawk(this.playerHawk, time, "player");
    this.staffHawk = this.resolveHawk(this.staffHawk, time, "staff");
    this.playerSeat = this.resolveSeat(this.playerSeat, time, "player");
    this.staffSeat = this.resolveSeat(this.staffSeat, time, "staff");

    this.booths.forEach((booth) => {
      if (booth.state === "cooking" && time >= booth.cookDoneAt) {
        booth.state = "dining";
        booth.departAt = time + DINING_MS;
        this.log("出餐完毕，食客开始用膳");
      } else if (booth.state === "dining" && time >= booth.departAt) {
        booth.state = "empty";
        booth.cookingDriver = null;
        this.coins += REVENUE_PER_PATRON;
        this.log(`食客离店，收入 +${REVENUE_PER_PATRON} 灵石`);
      }
    });

    // 伙计到岗后独立开自己的产线，与玩家的手动进度并行，互不影响
    if (this.staffLevel.hawker > 0 && !this.staffHawk) this.startHawk("staff");
    if (this.staffLevel.server > 0 && !this.staffSeat) this.startSeat("staff");
    if (this.staffLevel.cook > 0) {
      this.booths.forEach((booth, i) => {
        if (booth.state === "awaitingCook") this.startCook(booth, i, "staff");
      });
    }
    if (this.buyerHired && this.inventory <= 0 && this.coins >= PURCHASE_COST) {
      this.purchaseInventory();
    }

    this.renderProgress(time);
    this.refreshHud();
  }

  private makeBooth(): Booth {
    return { state: "empty", cookingDriver: null, cookStartedAt: 0, cookDoneAt: 0, departAt: 0 };
  }

  private makeBoothVisual(index: number): BoothVisual {
    const y = 345 + index * 30;
    const text = this.add.text(20, y, "", { fontSize: "16px", color: "#ffffff" });
    const progressTrack = this.add.rectangle(230, y + 3, 120, 12, 0x444444).setOrigin(0, 0).setVisible(false);
    const progressFill = this.add.rectangle(230, y + 3, 0, 12, COLOR_PLAYER).setOrigin(0, 0).setVisible(false);
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

  private hideButton(button: Phaser.GameObjects.Text) {
    button.setVisible(false).disableInteractive();
  }

  private startHawk(driver: Driver) {
    if (driver === "player" && this.playerHawk) return;
    if (driver === "staff" && this.staffHawk) return;
    if (this.queue.length >= getBoothCount(this.level)) return;

    const duration =
      driver === "player"
        ? getPlayerDuration(HAWK_BASE_MS, HAWK_TAVERN_SHRINK_PER_LEVEL_MS, HAWK_FLOOR_MS, this.level)
        : getStaffDuration(
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
      this.log("门外已候满，吆喝不出新客");
    } else {
      this.queue.push({ expiresAt: time + QUEUE_PATIENCE_MS });
      this.log(driver === "player" ? "你吆喝一声，食客上门排队" : "迎客伙计招来一位食客排队");
    }
    return null;
  }

  private startSeat(driver: Driver) {
    if (driver === "player" && this.playerSeat) return;
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
    const index = this.booths.findIndex((booth) => booth.state === "awaitingCook");
    if (index === -1) return;
    this.startCook(this.booths[index], index, "player");
  }

  /** 同一雅座只能被一方认领，玩家和伙计各自去找空闲的待烹饪雅座，天然不会重复扣库存。 */
  private startCook(booth: Booth, index: number, driver: Driver) {
    if (booth.state !== "awaitingCook") return;
    if (this.inventory <= 0) {
      booth.state = "empty";
      this.log("灵材不足，食客离开");
      return;
    }

    this.inventory -= 1;
    const duration =
      driver === "player"
        ? getPlayerDuration(COOK_BASE_MS, COOK_TAVERN_SHRINK_PER_LEVEL_MS, COOK_FLOOR_MS, this.level)
        : getStaffDuration(
            COOK_BASE_MS,
            COOK_TAVERN_SHRINK_PER_LEVEL_MS,
            COOK_FLOOR_MS,
            this.level,
            this.staffLevel.cook,
          );
    booth.state = "cooking";
    booth.cookingDriver = driver;
    booth.cookStartedAt = this.time.now;
    booth.cookDoneAt = this.time.now + duration;
    this.log(driver === "player" ? "你开始烹饪" : `灶上伙计开始烹饪（雅座 ${index + 1}）`);
  }

  private purchaseInventory() {
    if (this.coins < PURCHASE_COST) {
      this.log("灵石不足，无法采购");
      return;
    }
    this.coins -= PURCHASE_COST;
    this.inventory += PURCHASE_AMOUNT;
    this.log(`采购灵材 +${PURCHASE_AMOUNT}`);
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
    this.log(`酒楼装潢升级到 ${this.level} 级，雅座/排队+1，你也干得更快了`);
  }

  private hireStaff(role: "hawker" | "server" | "cook" | "buyer") {
    if (role === "buyer") {
      if (this.buyerHired) return;
      if (this.coins < HIRE_COST_BUYER) {
        this.log("灵石不足，无法雇人");
        return;
      }
      this.coins -= HIRE_COST_BUYER;
      this.buyerHired = true;
      this.log("雇到一位采买伙计，此后自动运作");
      this.hideButton(this.hireBuyerButton);
      this.hideButton(this.purchaseButton);
      return;
    }

    if (this.staffLevel[role] > 0) return;
    const hireCost = { hawker: HIRE_COST_HAWKER, server: HIRE_COST_SERVER, cook: HIRE_COST_COOK }[role];
    if (this.coins < hireCost) {
      this.log("灵石不足，无法雇人");
      return;
    }
    this.coins -= hireCost;
    this.staffLevel[role] = 1;

    const roleName = { hawker: "迎客", server: "跑堂", cook: "灶上" }[role];
    this.log(`雇到一位${roleName}伙计，此后自动运作`);

    const hireButton = { hawker: this.hireHawkerButton, server: this.hireServerButton, cook: this.hireCookButton }[
      role
    ];
    hireButton.off("pointerdown").on("pointerdown", () => this.upgradeStaff(role));
  }

  private upgradeStaff(role: "hawker" | "server" | "cook") {
    const cost = getStaffUpgradeCost(role, this.staffLevel[role]);
    if (this.coins < cost) {
      this.log("灵石不足，无法提升伙计等级");
      return;
    }
    this.coins -= cost;
    this.staffLevel[role] += 1;
    const roleName = { hawker: "迎客", server: "跑堂", cook: "灶上" }[role];
    this.log(`${roleName}伙计升至 ${this.staffLevel[role]} 级，手脚更利索了`);
  }

  private log(text: string) {
    this.chronicleLines.push(text);
    if (this.chronicleLines.length > CHRONICLE_MAX_LINES) {
      this.chronicleLines.shift();
    }
  }

  private boothLabel(state: BoothState): string {
    return { empty: "空闲", seating: "招待中", awaitingCook: "待烹饪", cooking: "烹饪中", dining: "用膳中" }[state];
  }

  private renderProgress(time: number) {
    const playerHawkFraction = this.playerHawk
      ? (time - this.playerHawk.startedAt) / this.playerHawk.duration
      : 0;
    const staffHawkFraction = this.staffHawk ? (time - this.staffHawk.startedAt) / this.staffHawk.duration : 0;
    this.hawkButton.setProgress(playerHawkFraction, staffHawkFraction);
    this.hawkButton.setEnabled(!this.playerHawk && this.queue.length < getBoothCount(this.level));

    const playerSeatFraction = this.playerSeat
      ? (time - this.playerSeat.startedAt) / this.playerSeat.duration
      : 0;
    const staffSeatFraction = this.staffSeat ? (time - this.staffSeat.startedAt) / this.staffSeat.duration : 0;
    this.serveButton.setProgress(playerSeatFraction, staffSeatFraction);
    this.serveButton.setEnabled(
      !this.playerSeat && this.queue.length > 0 && this.booths.some((booth) => booth.state === "empty"),
    );

    this.setButtonEnabled(
      this.cookButton,
      this.booths.some((booth) => booth.state === "awaitingCook") && this.inventory > 0,
    );

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
    this.coinsText.setText(`灵石：${this.coins}`);
    this.inventoryText.setText(`灵材：${this.inventory}`);
    this.levelText.setText(`酒楼等级：${this.level}`);
    this.queueText.setText(`排队：${this.queue.length}/${getBoothCount(this.level)}`);
    this.chronicleText.setText(this.chronicleLines.join("\n"));

    this.booths.forEach((booth, i) => {
      this.boothVisuals[i].text.setText(`雅座 ${i + 1}：${this.boothLabel(booth.state)}`);
    });

    this.hawkButton.setLabel("吆喝招揽");
    this.hireHawkerButton.setText(
      this.staffLevel.hawker > 0
        ? `升级迎客伙计（花费 ${getStaffUpgradeCost("hawker", this.staffLevel.hawker)} 灵石 → ${
            this.staffLevel.hawker
          }→${this.staffLevel.hawker + 1} 级，吆喝更快）`
        : `雇迎客伙计（花费 ${HIRE_COST_HAWKER} 灵石 → 自动吆喝）`,
    );

    this.serveButton.setLabel("招待入座");
    this.hireServerButton.setText(
      this.staffLevel.server > 0
        ? `升级跑堂伙计（花费 ${getStaffUpgradeCost("server", this.staffLevel.server)} 灵石 → ${
            this.staffLevel.server
          }→${this.staffLevel.server + 1} 级，招待更快）`
        : `雇跑堂伙计（花费 ${HIRE_COST_SERVER} 灵石 → 自动招待）`,
    );

    this.cookButton.setText("动手烹饪");
    this.hireCookButton.setText(
      this.staffLevel.cook > 0
        ? `升级灶上伙计（花费 ${getStaffUpgradeCost("cook", this.staffLevel.cook)} 灵石 → ${
            this.staffLevel.cook
          }→${this.staffLevel.cook + 1} 级，烹饪更快）`
        : `雇灶上伙计（花费 ${HIRE_COST_COOK} 灵石 → 自动烹饪）`,
    );

    this.purchaseButton.setText(`采购灵材（花费 ${PURCHASE_COST} 灵石 → +${PURCHASE_AMOUNT} 灵材）`);
    this.hireBuyerButton.setText(`雇采买伙计（花费 ${HIRE_COST_BUYER} 灵石 → 采购自动化）`);
    this.upgradeButton.setText(
      `装潢升级（花费 ${getUpgradeCost(this.level)} 灵石 → 等级+1，雅座/排队+1，双方都更快）`,
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
