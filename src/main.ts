import Phaser from "phaser";

// 占位数值，先验证循环手感，后续可随时调整
const TABLE_COUNT = 3;
const CUSTOMER_ARRIVAL_MIN_MS = 2000;
const CUSTOMER_ARRIVAL_MAX_MS = 5000;
const CUSTOMER_STAY_MS = 3000;
const REVENUE_PER_CUSTOMER = 8;
const PURCHASE_COST = 5;
const PURCHASE_AMOUNT = 5;
const STARTING_COINS = 20;
const STARTING_INVENTORY = 5;

interface Table {
  occupied: boolean;
  departAt: number;
}

class RestaurantScene extends Phaser.Scene {
  private coins = STARTING_COINS;
  private inventory = STARTING_INVENTORY;
  private tables: Table[] = [];

  private coinsText!: Phaser.GameObjects.Text;
  private inventoryText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private tableTexts: Phaser.GameObjects.Text[] = [];

  constructor() {
    super("restaurant");
  }

  create() {
    this.tables = Array.from({ length: TABLE_COUNT }, () => ({ occupied: false, departAt: 0 }));

    this.add.text(20, 20, "餐厅经营", { fontSize: "32px", color: "#ffffff" });

    this.coinsText = this.add.text(20, 80, "", { fontSize: "22px", color: "#ffd700" });
    this.inventoryText = this.add.text(20, 110, "", { fontSize: "22px", color: "#9fe870" });
    this.hintText = this.add.text(20, 150, "", { fontSize: "18px", color: "#cccccc" });

    this.tableTexts = this.tables.map((_, i) =>
      this.add.text(20, 200 + i * 36, "", { fontSize: "18px", color: "#ffffff" }),
    );

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
    const delay = Phaser.Math.Between(CUSTOMER_ARRIVAL_MIN_MS, CUSTOMER_ARRIVAL_MAX_MS);
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

  private refreshHud() {
    this.coinsText.setText(`金币：${this.coins}`);
    this.inventoryText.setText(`库存：${this.inventory}`);
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
