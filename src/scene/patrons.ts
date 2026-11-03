// 来客：生成食客与进场方式、常客记忆、随机事件。
import Phaser from "phaser";
import { playSfx } from "../audio";
import { GAME } from "../config";
import { DISHES, PATRON_KINDS, applyEvent, getRepLevel, getTotalBoothCount, isRarePatron, pickPatronKind, pickPatronName, pickPatronWish, pickRandomEvent } from "../logic";
import type { PatronKind } from "../logic";
import { Character } from "./Character";
import type { CharacterLook } from "./Character";
import { ACTOR_Y, ENTRANCE_SLOW, QUEUE_GAP, QUEUE_PATIENCE_MS, QUEUE_X } from "./constants";
import type { TavernScene } from "./TavernScene";

export class PatronMethods {
  // ===== 产线 =====
  /** 队尾最多排到空地尽头；等级很高时自动压缩间距。 */
  queueGap(this: TavernScene): number {
    return Math.min(QUEUE_GAP, 770 / Math.max(1, getTotalBoothCount(this.level, this.floorsBuilt) - 1));
  }

  /** 吃到心心念念那道菜的客人，会变成隔日再来的常客（最多记住 6 位）。 */
  rememberRegular(
    this: TavernScene,
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
  patronEntrance(this: TavernScene, char: Character, kind: PatronKind, slotX: number) {
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
  spawnPatron(this: TavernScene, time: number) {
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
  triggerRandomEvent(this: TavernScene, time: number) {
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
}
