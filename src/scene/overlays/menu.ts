// 二级页面：开张前选今日菜单与目标。
import Phaser from "phaser";
import { playSfx } from "../../audio";
import { DISHES, GOAL_STREAK_TARGET, getDailyGoalOptions, getDailyRent, getDishFans, getFloorRent, getStreakBonus, isFestivalDay } from "../../logic";
import { PURCHASE_AMOUNT, SCREEN_H, SCREEN_W, XIAN_FONT } from "../constants";
import type { TavernScene } from "../TavernScene";

export class MenuOverlayMethods {
  buildMenuOverlay(this: TavernScene) {
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
        .text(690, 60, `天气 · ${this.weather.name}`, {
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
        `今日目标二选一 · 库存 ${this.inventory} · 日租 ${getDailyRent(this.level) + getFloorRent(this.floorsBuilt)} 灵石${
          isFestivalDay(this.day) ? " · 灯会赏 ×1.5" : ""
        }`,
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
}
