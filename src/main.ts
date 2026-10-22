import Phaser from "phaser";

// 占位数值，先验证流程手感，后续可随时调整
const TABLE_COUNT_BASE = 3;
const PATRON_ARRIVAL_MIN_MS = 2000;
const PATRON_ARRIVAL_MAX_MS = 5000;
const ARRIVAL_SHRINK_PER_LEVEL_MS = 200;
const ARRIVAL_MIN_FLOOR_MS = 600;
const QUEUE_PATIENCE_MS = 8000;
const COOKING_MS = 2000;
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

// 雅座数量和排队上限按设计同步增长，共用同一条曲线
function getBoothCount(level: number): number {
  return TABLE_COUNT_BASE + (level - 1);
}

function getUpgradeCost(level: number): number {
  return Math.round(UPGRADE_BASE_COST * Math.pow(UPGRADE_COST_MULTIPLIER, level - 1));
}

function getArrivalRange(level: number): { min: number; max: number } {
  const reduction = (level - 1) * ARRIVAL_SHRINK_PER_LEVEL_MS;
  const min = Math.max(ARRIVAL_MIN_FLOOR_MS, PATRON_ARRIVAL_MIN_MS - reduction);
  const max = Math.max(min + 500, PATRON_ARRIVAL_MAX_MS - reduction);
  return { min, max };
}

// 装潢升级数值的自检
console.assert(getBoothCount(1) === TABLE_COUNT_BASE, "1 级应为基础雅座/排队容量");
console.assert(getBoothCount(3) === TABLE_COUNT_BASE + 2, "每级应 +1 雅座/排队容量");
console.assert(getUpgradeCost(1) === UPGRADE_BASE_COST, "1 级升级花费应为基础花费");
console.assert(getUpgradeCost(2) > getUpgradeCost(1), "升级花费应随等级递增");
console.assert(
  getArrivalRange(1).min === PATRON_ARRIVAL_MIN_MS && getArrivalRange(1).max === PATRON_ARRIVAL_MAX_MS,
  "1 级到店区间应为基础区间",
);
console.assert(getArrivalRange(5).min < getArrivalRange(1).min, "等级越高到店区间应越短");

type BoothState = "empty" | "awaitingCook" | "cooking" | "dining";

interface Booth {
  state: BoothState;
  cookDoneAt: number;
  departAt: number;
}

interface QueuedPatron {
  expiresAt: number;
}

interface StaffRoles {
  hawker: boolean; // 迎客：自动吆喝
  server: boolean; // 跑堂：自动招待
  cook: boolean; // 灶上：自动烹饪
  buyer: boolean; // 采买：自动采购
}

class TavernScene extends Phaser.Scene {
  private coins = STARTING_COINS;
  private inventory = STARTING_INVENTORY;
  private level = 1;
  private booths: Booth[] = [];
  private queue: QueuedPatron[] = [];
  private staff: StaffRoles = { hawker: false, server: false, cook: false, buyer: false };
  private chronicleLines: string[] = [];

  private coinsText!: Phaser.GameObjects.Text;
  private inventoryText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private queueText!: Phaser.GameObjects.Text;
  private chronicleText!: Phaser.GameObjects.Text;
  private boothTexts: Phaser.GameObjects.Text[] = [];

  private hawkButton!: Phaser.GameObjects.Text;
  private hireHawkerButton!: Phaser.GameObjects.Text;
  private serveButton!: Phaser.GameObjects.Text;
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

    this.boothTexts = this.booths.map((_, i) =>
      this.add.text(20, 345 + i * 30, "", { fontSize: "16px", color: "#ffffff" }),
    );

    const h = this.scale.height;
    this.hireHawkerButton = this.makeButton(h - 544, () => this.hireStaff("hawker"));
    this.hawkButton = this.makeButton(h - 486, () => this.hawk());
    this.hireServerButton = this.makeButton(h - 428, () => this.hireStaff("server"));
    this.serveButton = this.makeButton(h - 370, () => this.serveQueue());
    this.hireCookButton = this.makeButton(h - 312, () => this.hireStaff("cook"));
    this.cookButton = this.makeButton(h - 254, () => this.cookNext());
    this.hireBuyerButton = this.makeButton(h - 196, () => this.hireStaff("buyer"));
    this.purchaseButton = this.makeButton(h - 138, () => this.purchaseInventory());
    this.upgradeButton = this.makeButton(h - 80, () => this.upgradeTavern());

    this.refreshHud();
  }

  update(time: number) {
    // 排队耐心值超时
    this.queue = this.queue.filter((patron) => {
      if (time >= patron.expiresAt) {
        this.log("一位食客候得不耐，拂袖离去");
        return false;
      }
      return true;
    });

    // 烹饪完成 → 用膳；用膳结束 → 离店结算
    for (const booth of this.booths) {
      if (booth.state === "cooking" && time >= booth.cookDoneAt) {
        booth.state = "dining";
        booth.departAt = time + DINING_MS;
        this.log("出餐完毕，食客开始用膳");
      } else if (booth.state === "dining" && time >= booth.departAt) {
        booth.state = "empty";
        this.coins += REVENUE_PER_PATRON;
        this.log(`食客离店，收入 +${REVENUE_PER_PATRON} 灵石`);
      }
    }

    if (this.staff.server) {
      while (this.queue.length > 0 && this.serveQueue()) {
        // 跑堂到岗：尽量把排队食客都安排入座
      }
    }
    if (this.staff.cook) {
      while (this.cookNext()) {
        // 灶上到岗：把所有待烹饪的雅座都做了
      }
    }
    if (this.staff.buyer && this.inventory <= 0 && this.coins >= PURCHASE_COST) {
      this.purchaseInventory();
    }

    this.refreshHud();
  }

  private makeBooth(): Booth {
    return { state: "empty", cookDoneAt: 0, departAt: 0 };
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

  private hideButton(button: Phaser.GameObjects.Text) {
    button.setVisible(false).disableInteractive();
  }

  private scheduleNextHawk() {
    const { min, max } = getArrivalRange(this.level);
    const delay = Phaser.Math.Between(min, max);
    this.time.delayedCall(delay, () => {
      this.hawk();
      this.scheduleNextHawk();
    });
  }

  private hawk() {
    if (this.queue.length >= getBoothCount(this.level)) {
      this.log("门外已候满，吆喝不出新客");
      return;
    }
    this.queue.push({ expiresAt: this.time.now + QUEUE_PATIENCE_MS });
    this.log("吆喝一声，食客上门排队");
    this.refreshHud();
  }

  /** 把排队队首的食客安排进空雅座；成功返回 true，方便自动模式循环调用。 */
  private serveQueue(): boolean {
    if (this.queue.length === 0) return false;
    const freeBooth = this.booths.find((booth) => booth.state === "empty");
    if (!freeBooth) return false;

    this.queue.shift();
    freeBooth.state = "awaitingCook";
    this.log("食客入座雅座，等候烹饪");
    this.refreshHud();
    return true;
  }

  /** 给队首一个「待烹饪」雅座出餐；成功返回 true，方便自动模式循环调用。 */
  private cookNext(): boolean {
    const booth = this.booths.find((b) => b.state === "awaitingCook");
    if (!booth) return false;

    if (this.inventory <= 0) {
      booth.state = "empty";
      this.log("灵材不足，食客离开");
      this.refreshHud();
      return false;
    }

    this.inventory -= 1;
    booth.state = "cooking";
    booth.cookDoneAt = this.time.now + COOKING_MS;
    this.log("开始烹饪");
    this.refreshHud();
    return true;
  }

  private purchaseInventory() {
    if (this.coins < PURCHASE_COST) {
      this.log("灵石不足，无法采购");
      return;
    }
    this.coins -= PURCHASE_COST;
    this.inventory += PURCHASE_AMOUNT;
    this.log(`采购灵材 +${PURCHASE_AMOUNT}`);
    this.refreshHud();
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
    this.boothTexts.push(
      this.add.text(20, 345 + (this.booths.length - 1) * 30, "", {
        fontSize: "16px",
        color: "#ffffff",
      }),
    );
    this.log(`酒楼装潢升级到 ${this.level} 级，雅座与排队上限 +1`);
    this.refreshHud();
  }

  private hireStaff(role: keyof StaffRoles) {
    const cost = { hawker: HIRE_COST_HAWKER, server: HIRE_COST_SERVER, cook: HIRE_COST_COOK, buyer: HIRE_COST_BUYER }[
      role
    ];
    if (this.coins < cost) {
      this.log("灵石不足，无法雇人");
      return;
    }
    this.coins -= cost;
    this.staff[role] = true;

    const roleName = { hawker: "迎客", server: "跑堂", cook: "灶上", buyer: "采买" }[role];
    this.log(`雇到一位${roleName}伙计，此后自动运作`);

    if (role === "hawker") {
      this.hideButton(this.hireHawkerButton);
      this.hideButton(this.hawkButton);
      this.scheduleNextHawk();
    } else if (role === "server") {
      this.hideButton(this.hireServerButton);
      this.hideButton(this.serveButton);
    } else if (role === "cook") {
      this.hideButton(this.hireCookButton);
      this.hideButton(this.cookButton);
    } else {
      this.hideButton(this.hireBuyerButton);
      this.hideButton(this.purchaseButton);
    }
    this.refreshHud();
  }

  private log(text: string) {
    this.chronicleLines.push(text);
    if (this.chronicleLines.length > CHRONICLE_MAX_LINES) {
      this.chronicleLines.shift();
    }
  }

  private boothLabel(state: BoothState): string {
    return { empty: "空闲", awaitingCook: "待烹饪", cooking: "烹饪中", dining: "用膳中" }[state];
  }

  private refreshHud() {
    this.coinsText.setText(`灵石：${this.coins}`);
    this.inventoryText.setText(`灵材：${this.inventory}`);
    this.levelText.setText(`酒楼等级：${this.level}`);
    this.queueText.setText(`排队：${this.queue.length}/${getBoothCount(this.level)}`);
    this.chronicleText.setText(this.chronicleLines.join("\n"));

    this.booths.forEach((booth, i) => {
      this.boothTexts[i].setText(`雅座 ${i + 1}：${this.boothLabel(booth.state)}`);
    });

    this.hawkButton.setText("吆喝招揽");
    this.hireHawkerButton.setText(`雇迎客伙计（花费 ${HIRE_COST_HAWKER} 灵石 → 吆喝自动化）`);
    this.serveButton.setText("招待入座");
    this.hireServerButton.setText(`雇跑堂伙计（花费 ${HIRE_COST_SERVER} 灵石 → 招待自动化）`);
    this.cookButton.setText("动手烹饪");
    this.hireCookButton.setText(`雇灶上伙计（花费 ${HIRE_COST_COOK} 灵石 → 烹饪自动化）`);
    this.purchaseButton.setText(`采购灵材（花费 ${PURCHASE_COST} 灵石 → +${PURCHASE_AMOUNT} 灵材）`);
    this.hireBuyerButton.setText(`雇采买伙计（花费 ${HIRE_COST_BUYER} 灵石 → 采购自动化）`);
    this.upgradeButton.setText(
      `装潢升级（花费 ${getUpgradeCost(this.level)} 灵石 → 等级+1，雅座/排队+1，到店更快）`,
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
