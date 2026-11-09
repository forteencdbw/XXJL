// 产线：员工（含掌柜）领座、烹饪、传菜，以及打烊采购。
import Phaser from "phaser";
import { playSfx } from "../audio";
import { GAME } from "../config";
import { DISHES, getCookQuality, getEffectiveStars, getStaffDuration, getStoveSpeedFactor, getWalkSpeed, isRarePatron } from "../logic";
import type { Employee, PatronKind } from "../logic";
import { finishCooking, finishSeating, finishServing, leaveUnserved, nextBoothToCook, nextBoothToServe, seatPatron, startCooking, startServing } from "../booth";
import { ACTOR_Y, COOK_FLOOR_MS, COOK_SPOT, COOK_TAVERN_SHRINK_PER_LEVEL_MS, DOOR_X, FLOOR_Y, PURCHASE_AMOUNT } from "./constants";
import type { Booth, StaffRuntime } from "./types";
import type { TavernScene } from "./TavernScene";

/** 领座时跑堂站在客人前面（桌子在门的左边）的距离。 */
const LEAD_GAP = 36;

export class ProductionMethods {
  /** 按跑堂的有效星数换算的走路耗时（毫秒）。 */
  walkMs(this: TavernScene, e: Employee, fromX: number, toX: number): number {
    return (Math.abs(toX - fromX) / getWalkSpeed(getEffectiveStars(e, "seat"))) * 1000;
  }

  /** 员工所在楼层与玩家正在看的楼层一致才显示。 */
  setStaffFloor(this: TavernScene, rt: StaffRuntime, floor: number) {
    rt.floor = floor;
    rt.char.setVisible(this.gameState === "open" && floor === this.activeFloor);
  }

  /** 做完一件事回到自己的站位；从楼上下来的先在门口出现。 */
  sendStaffHome(this: TavernScene, e: Employee, rt: StaffRuntime) {
    rt.task = null;
    if (rt.floor !== 0) {
      rt.char.teleportTo(DOOR_X, ACTOR_Y);
      this.setStaffFloor(rt, 0);
    }
    const home = this.staffHome(e);
    rt.char.walkTo(home.x, home.y, this.walkMs(e, rt.char.x, home.x));
  }

  /** 领座：跑堂先走到门口接人，再走在客人前面领到桌边；客人落座后跑堂才离开。返回是否接了这单。 */
  startSeat(this: TavernScene, e: Employee): boolean {
    const rt = this.staffRt.get(e.id);
    if (this.settling || !rt || rt.task || this.inventory <= 0) return false;
    const first = this.queue[0];
    if (!first?.char.arrived) return false;
    const emptyBooths = this.booths
      .map((booth, index) => ({ booth, index }))
      .filter(({ booth }) => booth.state === "empty");
    if (emptyBooths.length === 0) return false;
    let candidates = emptyBooths.filter(({ booth }) => booth.floor === this.activeFloor);
    if (candidates.length === 0) {
      const hasEmpty = (floor: number) => emptyBooths.some(({ booth }) => booth.floor === floor);
      // 稀客往楼上请，寻常客人先坐低层
      const targetFloor = isRarePatron(first.kind)
        ? hasEmpty(2) ? 2 : hasEmpty(1) ? 1 : 0
        : hasEmpty(1) ? 1 : hasEmpty(0) ? 0 : 2;
      candidates = emptyBooths.filter(({ booth }) => booth.floor === targetFloor);
      if (candidates.length === 0) return false;
    }
    // 不总是从最左一张开始，客人分散入座，画面更像一间活着的店
    const { booth, index: boothIndex } = candidates[Math.floor(Math.random() * candidates.length)];

    const patron = this.queue.shift()!;
    patron.char.setPatience(null);
    patron.char.setMood(isRarePatron(patron.kind) ? "cold" : "waiting");
    seatPatron(booth, patron);
    booth.patronChar = patron.char;

    const char = rt.char;
    const meetX = patron.char.x - LEAD_GAP;
    const table = this.tablePosition(boothIndex);
    const toDoor = this.walkMs(e, char.x, meetX);
    const toTable = this.walkMs(e, meetX, table.x - LEAD_GAP);
    rt.task = { kind: "seat", boothIndex, startedAt: this.time.now, duration: toDoor + toTable };
    char.walkTo(meetX, ACTOR_Y, toDoor, () => {
      if (!patron.char.active || rt.task?.boothIndex !== boothIndex) return;
      // 领去楼上：两人在门口一起上楼，玩家看哪层就在哪层看见他们
      this.setStaffFloor(rt, booth.floor);
      patron.char.setVisible(booth.floor === this.activeFloor);
      char.walkTo(table.x - LEAD_GAP, ACTOR_Y, toTable);
      patron.char.walkTo(table.x, table.y, toTable);
      if (isRarePatron(patron.kind)) {
        patron.char.say(patron.kind.id === "elder" ? "此子有慧根。" : "本座只等一炷香。", "cold");
      }
    });
    return true;
  }

  finishSeat(this: TavernScene, e: Employee, rt: StaffRuntime, time: number) {
    const index = rt.task!.boothIndex;
    const booth = this.booths[index];
    if (booth && finishSeating(booth, time)) {
      playSfx("seat");
      booth.patronChar?.setSeated(true);
      this.log(`${e.name}领食客入座雅座`);
      this.staffDidWork(e);
      this.showBoothOrder(index);
    }
    this.sendStaffHome(e, rt);
  }

  /** 客人离桌：收起碗筷、站起来走出门（生气时走快些），走到门口消失。 */
  walkPatronOut(this: TavernScene, booth: Booth, kind: PatronKind | null, angry: boolean) {
    const leaver = booth.patronChar;
    booth.patronChar = undefined;
    booth.diningProp?.destroy();
    booth.diningProp = undefined;
    if (!leaver) return;
    if (this.focusChar === leaver) this.returnFromFocus();
    leaver.setDining(false);
    leaver.setSeated(false);
    this.patronWalk(leaver, kind, 440, angry, () => leaver.destroy());
  }

  /** 入座时在桌上方飘出这一桌的订单，避免玩家只看到队列数字变化。 */
  showBoothOrder(this: TavernScene, index: number) {
    const booth = this.booths[index];
    if (booth.floor !== this.activeFloor) return;
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

  /** 烹饪：先接等得最久的一桌；客人想吃的菜在今日菜单上就做这道，否则按菜单轮转。返回是否起锅。 */
  startCook(this: TavernScene, e: Employee): boolean {
    const rt = this.staffRt.get(e.id);
    if (this.settling || !rt || rt.task) return false;
    const menu = this.getMenuDishes();
    if (menu.length === 0) return false;
    const index = nextBoothToCook(this.booths);
    if (index === -1) return false;
    const booth = this.booths[index];
    if (this.inventory <= 0) {
      const who = leaveUnserved(booth);
      this.stockLost += 1;
      const guest = who?.kind?.name ?? "食客";
      this.walkPatronOut(booth, who?.kind ?? null, true);
      this.sessionLost += 1;
      this.pendingRepLoss += 1;
      this.log(`灵材不足，${guest}没吃上菜便离开了`);
      this.showHint("灵材不足，客人走了——下次先多备货");
      return false;
    }

    const wished = menu.find((dish) => dish.id === booth.patronWish);
    const chosen = wished ?? menu[this.dishCursor++ % menu.length];
    const duration = getStaffDuration(
      getEffectiveStars(e, "cook"),
      chosen.cookMs,
      COOK_TAVERN_SHRINK_PER_LEVEL_MS,
      COOK_FLOOR_MS,
      this.level,
      getStoveSpeedFactor(this.stoveLevel),
    );
    this.inventory -= 1;
    // 神识决定这道菜的成色，直接体现在售价上
    const quality = getCookQuality(getEffectiveStars(e, "cook"));
    startCooking(booth, { dish: chosen, cookId: e.id, quality, now: this.time.now, duration });
    rt.task = { kind: "cook", boothIndex: index, startedAt: this.time.now, duration };
    this.staffDidWork(e);
    rt.char.walkTo(COOK_SPOT.x, COOK_SPOT.y, Math.min(400, duration), () => rt.char.pulse());
    this.log(`${e.name}烹制${chosen.name}（雅座 ${index + 1}）`);
    return true;
  }

  /** 菜做好了：放在灶台上等跑堂，掌勺的人可以接下一道。 */
  finishCook(this: TavernScene, index: number, time: number) {
    const booth = this.booths[index];
    if (!finishCooking(booth, time)) return;
    playSfx("cook");
    this.log(`${booth.currentDish?.name ?? "菜"}出锅，等跑堂传菜`);
    const cook = this.employeeById(booth.cookStaffId);
    const rt = cook && this.staffRt.get(cook.id);
    if (cook && rt?.task?.kind === "cook" && rt.task.boothIndex === index) this.sendStaffHome(cook, rt);
  }

  /** 传菜：跑堂走到灶台取菜，再端到客人桌上。返回是否接了这单。 */
  startServe(this: TavernScene, e: Employee): boolean {
    const rt = this.staffRt.get(e.id);
    if (this.settling || !rt || rt.task) return false;
    const index = nextBoothToServe(this.booths);
    if (index === -1) return false;
    const booth = this.booths[index];
    startServing(booth);
    const char = rt.char;
    const table = this.tablePosition(index);
    const dropX = table.x + LEAD_GAP;
    const toStove = this.walkMs(e, char.x, COOK_SPOT.x);
    const toTable = this.walkMs(e, COOK_SPOT.x, dropX);
    rt.task = { kind: "serve", boothIndex: index, startedAt: this.time.now, duration: toStove + toTable };
    char.walkTo(COOK_SPOT.x, ACTOR_Y, toStove, () => {
      if (rt.task?.boothIndex !== index) return;
      char.setCarrying(true);
      this.setStaffFloor(rt, booth.floor);
      char.walkTo(dropX, ACTOR_Y, toTable);
    });
    return true;
  }

  /** 菜端上桌，客人开始用膳。 */
  finishServe(this: TavernScene, e: Employee, rt: StaffRuntime, time: number) {
    const index = rt.task!.boothIndex;
    const booth = this.booths[index];
    rt.char.setCarrying(false);
    if (booth && finishServing(booth, time, GAME.session.diningMs)) {
      booth.patronChar?.setDining(true);
      this.showDiningProp(index);
      this.staffDidWork(e);
      this.log(`${e.name}把${booth.currentDish?.name ?? "菜"}端上桌，食客开始用膳`);
      // 另一桌正在用膳时，给一次看得见的碰杯，而不是只等随机闲聊
      const other = this.booths.find((b) => b !== booth && b.state === "dining" && b.patronChar);
      const clinkA = booth.patronChar;
      const clinkB = other?.patronChar;
      if (clinkA && clinkB) {
        this.time.delayedCall(250, () => {
          if (clinkA.active && clinkB.active) this.showClink(clinkA, clinkB);
        });
      }
    }
    this.sendStaffHome(e, rt);
  }

  /** 每帧收尾到期的领座/传菜，烹饪由雅座状态推进。 */
  resolveStaffTasks(this: TavernScene, time: number) {
    for (const e of this.workforce()) {
      const rt = this.staffRt.get(e.id);
      const task = rt?.task;
      if (!rt || !task || task.kind === "cook" || time < task.startedAt + task.duration) continue;
      if (task.kind === "seat") this.finishSeat(e, rt, time);
      else this.finishServe(e, rt, time);
    }
  }

  /** 打烊时采购：瞬间到货。灵石不足时赊账，费用照扣。 */
  startPurchase(this: TavernScene) {
    if (this.settling || this.gameState === "open") return;
    const price = this.purchasePrice();
    const credit = this.coins < price;
    this.coins -= price;
    this.displayedCoins = this.coins;
    this.inventory += PURCHASE_AMOUNT;
    this.log(`${credit ? "灵石不足，赊账采购灵材" : "采购灵材"} +${PURCHASE_AMOUNT}`);
    this.save();
  }
}
