// 二级页面：营造（雅座扩建、起楼、灶台、门幡）及其购买。
import { playSfx } from "../../audio";
import { DISHES, FLOOR_UNLOCKS, MAX_FLOORS, getDailyGoalOptions, getSignUpgradeCost, getStoveSpeedFactor, getStoveUpgradeCost, getTotalBoothCount, getUpgradeCost } from "../../logic";
import { SCREEN_H, SCREEN_W, XIAN_FONT } from "../constants";
import type { TavernScene } from "../TavernScene";

export class BuildOverlayMethods {
  /** 二级页面：营造。雅座扩建、灶台专精、门面招幡三条线各花各的钱。 */
  buildBuildOverlay(this: TavernScene) {
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

  buildFloor(this: TavernScene) {
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

  upgradeTavern(this: TavernScene) {
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

  upgradeStove(this: TavernScene) {
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

  upgradeSign(this: TavernScene) {
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
}
