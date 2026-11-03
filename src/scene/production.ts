// 产线：玩家/员工招待入座、烹饪、紧急采购。
import Phaser from "phaser";
import { playSfx } from "../audio";
import { GAME } from "../config";
import { DISHES, getCookQuality, getPlayerDuration, getPurchaseDuration, getRealmPlayerSpeedFactor, getRealmStaffSpeedFactor, getStaffDuration, getStoveSpeedFactor, isRarePatron } from "../logic";
import type { Dish, Employee } from "../logic";
import { ACTOR_Y, COMBO_MAX, COMBO_STEP, COOK_FLOOR_MS, COOK_SPOT, COOK_TAVERN_SHRINK_PER_LEVEL_MS, FLOOR_Y, PLAYER_HOME, PURCHASE_AMOUNT, SEAT_BASE_MS, SEAT_FLOOR_MS, SEAT_TAVERN_SHRINK_PER_LEVEL_MS, SERVE_SPOT } from "./constants";
import type { Booth, Driver, SeatProgress } from "./types";
import type { TavernScene } from "./TavernScene";

export class ProductionMethods {
  isPlayerBusy(this: TavernScene): boolean {
    return (
      this.playerSeat !== null ||
      this.playerCookingBooth !== null ||
      this.playerPurchasing !== null
    );
  }

  /** 玩家/伙计走到待客位再做动作；不再瞬移，也不再站到客人身上。 */
  moveActorTo(this: TavernScene, driver: Driver, kind: "seat" | "cook", travelMs: number, emp?: Employee) {
    const spot = kind === "seat" ? SERVE_SPOT : COOK_SPOT;
    if (driver === "player") {
      this.playerChar.walkTo(spot.x, spot.y, travelMs, () => this.playerChar.pulse());
      return;
    }
    const char = emp && this.staffRt.get(emp.id)?.char;
    char?.walkTo(spot.x, spot.y, travelMs, () => char.pulse());
  }

  moveActorHome(this: TavernScene, driver: Driver, _kind: "seat" | "cook", emp?: Employee) {
    if (driver === "player") {
      this.playerChar.walkTo(PLAYER_HOME.x, PLAYER_HOME.y, 300);
      return;
    }
    if (!emp) return;
    const home = this.staffHome(emp);
    this.staffRt.get(emp.id)?.char.walkTo(home.x, home.y, 300);
  }

  /** 返回是否真的开始领客（员工据此决定要不要去做下一项工作）。 */
  startSeat(this: TavernScene, driver: Driver, emp?: Employee): boolean {
    if (this.settling) return false;
    if (this.inventory <= 0) {
      if (driver === "player") this.showHint("灵材见底：先点左下「急购 +5」补货，再领客入座");
      return false;
    }
    if (driver === "player" && this.isPlayerBusy()) {
      this.showHint("你正忙着，稍等一下");
      return false;
    }
    const rt = emp && this.staffRt.get(emp.id);
    if (driver === "staff" && (!emp || !rt || rt.seat)) return false;
    if (this.queue.length === 0) {
      if (driver === "player") {
        this.showHint(
          this.booths.some((booth) => booth.state === "seating")
            ? "伙计正在领客入座，稍等"
            : "门外还没有客人，稍等",
        );
      }
      return false;
    }

    if (!this.queue[0]?.char.arrived) {
      if (driver === "player") this.showHint("客人还在路上，稍等");
      return false;
    }
    const emptyBooths = this.booths
      .map((booth, index) => ({ booth, index }))
      .filter(({ booth }) => booth.state === "empty");
    if (emptyBooths.length === 0) {
      if (driver === "player") this.showHint("雅座满了，先出菜");
      return false;
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
      if (candidates.length === 0) return false;
      // 玩家亲自领客时，镜头跟着客人上楼；伙计自动招待则留在当前层
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
              emp!.stars.seat,
              SEAT_BASE_MS,
              SEAT_TAVERN_SHRINK_PER_LEVEL_MS,
              SEAT_FLOOR_MS,
              this.level,
              getRealmStaffSpeedFactor(this.realmIndex()),
            ),
      boothIndex,
    };
    if (driver === "player") this.playerSeat = progress;
    else rt!.seat = progress;
    this.moveActorTo(driver, "seat", Math.min(400, progress.duration), emp);

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
    return true;
  }

  resolveSeat(this: TavernScene, progress: SeatProgress | null, time: number, driver: Driver, emp?: Employee): SeatProgress | null {
    if (!progress || time < progress.startedAt + progress.duration) return progress;
    const booth = this.booths[progress.boothIndex];
    if (booth) {
      playSfx("seat");
      booth.state = "awaitingCook";
      booth.awaitingSince = time;
      booth.patronChar?.setSeated(true);
      this.log(driver === "player" ? "你领食客入座雅座，等候烹饪" : `${emp?.name ?? "伙计"}领食客入座雅座`);
      if (emp) this.staffDidWork(emp, "seat");
      this.showBoothOrder(progress.boothIndex);
      if (this.day === 1 && this.tutorialHintStage <= 1) {
        this.tutorialHintStage = 2;
      }
    }
    this.moveActorHome(driver, "seat", emp);
    return null;
  }

  /** 入座时在桌上方飘出这一桌的订单，避免玩家只看到队列数字变化。 */
  showBoothOrder(this: TavernScene, index: number) {
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

  manualCook(this: TavernScene) {
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
  manualCookDish(this: TavernScene, dish: Dish) {
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

  cookDuration(this: TavernScene, dish: Dish, driver: Driver, emp?: Employee): number {
    return driver === "player"
      ? getPlayerDuration(
          dish.cookMs,
          COOK_TAVERN_SHRINK_PER_LEVEL_MS,
          COOK_FLOOR_MS,
          this.level,
          getRealmPlayerSpeedFactor(this.realmIndex()) * getStoveSpeedFactor(this.stoveLevel),
        )
      : getStaffDuration(
          emp?.stars.cook ?? 1,
          dish.cookMs,
          COOK_TAVERN_SHRINK_PER_LEVEL_MS,
          COOK_FLOOR_MS,
          this.level,
          getRealmStaffSpeedFactor(this.realmIndex()) * getStoveSpeedFactor(this.stoveLevel),
        );
  }

  canFinishBeforeClose(this: TavernScene, dish: Dish, driver: Driver, emp?: Employee): boolean {
    return this.sessionEndsAt <= 0 || this.time.now + this.cookDuration(dish, driver, emp) <= this.sessionEndsAt;
  }

  /** 返回是否真的起锅。 */
  startCook(this: TavernScene, booth: Booth, index: number, driver: Driver, dish?: Dish, emp?: Employee): boolean {
    if (booth.state !== "awaitingCook") return false;
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
      return false;
    }

    const menu = this.getMenuDishes();
    if (menu.length === 0) return false;
    const chosen = dish ?? menu[this.dishCursor % menu.length];
    const duration = this.cookDuration(chosen, driver, emp);
    // 打烊前做不完的菜不启动；轮转只在真正起锅后才前进，避免空转吃掉菜序
    if (!this.canFinishBeforeClose(chosen, driver, emp)) {
      if (driver === "player") this.showHint("这道菜来不及了，换道快菜");
      return false;
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
    booth.cookStaffId = emp?.id ?? null;
    // 厨艺决定这道菜的成色，直接体现在售价上
    booth.cookQuality = driver === "player" ? 1 : getCookQuality(emp?.stars.cook ?? 1);
    booth.currentDish = chosen;
    booth.cookStartedAt = this.time.now;
    booth.cookDoneAt = this.time.now + duration;
    if (driver === "player") this.playerCookingBooth = index;
    else if (emp) {
      const rt = this.staffRt.get(emp.id);
      if (rt) rt.cookingBooth = index;
      this.staffDidWork(emp, "cook");
    }
    this.moveActorTo(driver, "cook", Math.min(400, duration), emp);
    this.log(
      driver === "player"
        ? `你下厨为 ${index + 1} 号桌烹制${chosen.name}`
        : `${emp?.name ?? "伙计"}烹制${chosen.name}（雅座 ${index + 1}）`,
    );
    if (driver === "player" && this.day === 1 && this.tutorialHintStage === 2) {
      this.tutorialHintStage = 3;
      this.showHint("已起锅，等出餐");
    }
    return true;
  }

  /** 玩家点采购：打烊瞬间到货；营业中走 15 秒紧急采购（翻倍价）。灵石不足时赊账，费用照扣。 */
  startPurchase(this: TavernScene) {
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
}
