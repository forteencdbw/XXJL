import Phaser from "phaser";

// 占位数值，先验证循环手感，后续可随时调整
const TABLE_COUNT_BASE = 3;
const CUSTOMER_ARRIVAL_MIN_MS = 2000;
const CUSTOMER_ARRIVAL_MAX_MS = 5000;
const ARRIVAL_SHRINK_PER_LEVEL_MS = 200;
const ARRIVAL_MIN_FLOOR_MS = 600;
const CUSTOMER_STAY_MS = 3000;
const REVENUE_PER_CUSTOMER = 8;
const PURCHASE_COST = 5;
const PURCHASE_AMOUNT = 5;
const STARTING_COINS = 20;
const STARTING_INVENTORY = 5;
const UPGRADE_BASE_COST = 15;
const UPGRADE_COST_MULTIPLIER = 1.6;

function getTableCount(level: number): number {
  return TABLE_COUNT_BASE + (level - 1);
}

function getUpgradeCost(level: number): number {
  return Math.round(UPGRADE_BASE_COST * Math.pow(UPGRADE_COST_MULTIPLIER, level - 1));
}

function getArrivalRange(level: number): { min: number; max: number } {
  const reduction = (level - 1) * ARRIVAL_SHRINK_PER_LEVEL_MS;
  const min = Math.max(ARRIVAL_MIN_FLOOR_MS, CUSTOMER_ARRIVAL_MIN_MS - reduction);
  const max = Math.max(min + 500, CUSTOMER_ARRIVAL_MAX_MS - reduction);
  return { min, max };
}

// 装修/设备升级数值的自检
console.assert(getTableCount(1) === TABLE_COUNT_BASE, "1 级应为基础餐位数");
console.assert(getTableCount(3) === TABLE_COUNT_BASE + 2, "每级应 +1 餐位");
console.assert(getUpgradeCost(1) === UPGRADE_BASE_COST, "1 级升级花费应为基础花费");
console.assert(getUpgradeCost(2) > getUpgradeCost(1), "升级花费应随等级递增");
console.assert(
  getArrivalRange(1).min === CUSTOMER_ARRIVAL_MIN_MS && getArrivalRange(1).max === CUSTOMER_ARRIVAL_MAX_MS,
  "1 级到店区间应为基础区间",
);
console.assert(getArrivalRange(5).min < getArrivalRange(1).min, "等级越高到店区间应越短");

interface Table {
  occupied: boolean;
  departAt: number;
}

class RestaurantScene extends Phaser.Scene {
  private coins = STARTING_COINS;
  private inventory = STARTING_INVENTORY;
  private level = 1;
  private tables: Table[] = [];

  private coinsText!: Phaser.GameObjects.Text;
  private inventoryText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private upgradeButton!: Phaser.GameObjects.Text;
  private tableTexts: Phaser.GameObjects.Text[] = [];

  constructor() {
    super("restaurant");
  }

  create() {
    this.tables = Array.from({ length: getTableCount(this.level) }, () => ({
      occupied: false,
      departAt: 0,
    }));

    this.add.text(20, 20, "餐厅经营", { fontSize: "32px", color: "#ffffff" });

    this.coinsText = this.add.text(20, 80, "", { fontSize: "22px", color: "#ffd700" });
    this.inventoryText = this.add.text(20, 110, "", { fontSize: "22px", color: "#9fe870" });
    this.levelText = this.add.text(20, 140, "", { fontSize: "22px", color: "#87ceeb" });
    this.hintText = this.add.text(20, 180, "", { fontSize: "18px", color: "#cccccc" });

    this.tableTexts = this.tables.map((_, i) =>
      this.add.text(20, 230 + i * 36, "", { fontSize: "18px", color: "#ffffff" }),
    );

    this.upgradeButton = this.add
      .text(20, this.scale.height - 150, "", {
        fontSize: "18px",
        color: "#ffffff",
        backgroundColor: "#444444",
        padding: { x: 10, y: 8 },
      })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.upgradeRestaurant());

    this.add
      .text(
        20,
        this.scale.height - 80,
        `采购食材（花费 ${PURCHASE_COST} 金币 → +${PURCHASE_AMOUNT} 库存）`,
        {
          fontSize: "18px",
          color: "#ffffff",
          backgroundColor: "#444444",
          padding: { x: 10, y: 8 },
        },
      )
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.purchaseInventory());

    this.scheduleNextArrival();
    this.refreshHud();
  }

  update(time: number) {
    for (const table of this.tables) {
      if (table.occupied && time >= table.departAt) {
        table.occupied = false;
        this.coins += REVENUE_PER_CUSTOMER;
        this.hintText.setText(`顾客离店，收入 +${REVENUE_PER_CUSTOMER}`);
        this.refreshHud();
      }
    }
  }

  private scheduleNextArrival() {
    const { min, max } = getArrivalRange(this.level);
    const delay = Phaser.Math.Between(min, max);
    this.time.delayedCall(delay, () => {
      this.handleCustomerArrival();
      this.scheduleNextArrival();
    });
  }

  private handleCustomerArrival() {
    const freeTable = this.tables.find((table) => !table.occupied);

    if (!freeTable) {
      this.hintText.setText("顾客到店：餐位已满，顾客离开");
      return;
    }
    if (this.inventory <= 0) {
      this.hintText.setText("顾客到店：食材不足，顾客离开");
      return;
    }

    this.inventory -= 1;
    freeTable.occupied = true;
    freeTable.departAt = this.time.now + CUSTOMER_STAY_MS;
    this.hintText.setText("顾客到店，已入座用餐");
    this.refreshHud();
  }

  private purchaseInventory() {
    if (this.coins < PURCHASE_COST) {
      this.hintText.setText("金币不足，无法采购");
      return;
    }
    this.coins -= PURCHASE_COST;
    this.inventory += PURCHASE_AMOUNT;
    this.refreshHud();
  }

  private upgradeRestaurant() {
    const cost = getUpgradeCost(this.level);
    if (this.coins < cost) {
      this.hintText.setText("金币不足，无法升级餐厅");
      return;
    }
    this.coins -= cost;
    this.level += 1;
    this.tables.push({ occupied: false, departAt: 0 });
    this.tableTexts.push(
      this.add.text(20, 230 + (this.tables.length - 1) * 36, "", {
        fontSize: "18px",
        color: "#ffffff",
      }),
    );
    this.hintText.setText(`餐厅升级到 ${this.level} 级，餐位 +1`);
    this.refreshHud();
  }

  private refreshHud() {
    this.coinsText.setText(`金币：${this.coins}`);
    this.inventoryText.setText(`库存：${this.inventory}`);
    this.levelText.setText(`餐厅等级：${this.level}`);
    this.upgradeButton.setText(
      `升级餐厅（花费 ${getUpgradeCost(this.level)} 金币 → 等级+1，餐位+1，到店更快）`,
    );
    this.tables.forEach((table, i) => {
      this.tableTexts[i].setText(`餐位 ${i + 1}：${table.occupied ? "用餐中" : "空闲"}`);
    });
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: 720,
  height: 1280,
  backgroundColor: "#2d2d2d",
  scene: [RestaurantScene],
});
