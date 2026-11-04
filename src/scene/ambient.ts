// 常驻氛围：天气粒子、灵气、蒸汽、萤火、小动作与闲聊。
import Phaser from "phaser";
import type { Job } from "../logic";
import { Character } from "./Character";
import { FLOOR_Y } from "./constants";
import type { TavernScene } from "./TavernScene";

export class AmbientMethods {
  /** 烹饪中的桌上冒热气；没开火时灶台自己冒。 */
  emitCookingSteam(this: TavernScene) {
    if (this.gameState !== "open" || this.settling) return;
    let puffs = 0;
    this.booths.forEach((booth, i) => {
      if (puffs >= 3 || booth.state !== "cooking") return;
      puffs += 1;
      const table = this.tablePosition(i);
      this.spawnSteam(table.x + Phaser.Math.Between(-10, 10), FLOOR_Y - 84);
    });
    if (puffs === 0) this.spawnSteam(-272 + Phaser.Math.Between(-8, 8), 826, 0.16);
  }

  /** 当日天气的粒子：晴=流萤，灵雾=低雾，落英=花瓣，夜雨=雨丝。纯氛围。 */
  emitWeather(this: TavernScene) {
    if (this.gameState !== "open" || this.settling) return;
    const mode = this.weather.visual;
    const cam = this.cameras.main;
    const x = cam.scrollX + Phaser.Math.Between(30, 690);
    if (mode === 1) {
      const mist = this.add
        .ellipse(
          x,
          Phaser.Math.Between(FLOOR_Y - 230, FLOOR_Y - 40),
          Phaser.Math.Between(160, 260),
          Phaser.Math.Between(20, 34),
          0xdfe9f5,
          0.06,
        )
        .setDepth(5);
      this.tweens.add({
        targets: mist,
        x: mist.x + Phaser.Math.Between(40, 90),
        alpha: 0,
        duration: 3200,
        ease: "Sine.easeOut",
        onComplete: () => mist.destroy(),
      });
    } else if (mode === 2) {
      const petal = this.add
        .rectangle(
          x,
          Phaser.Math.Between(120, 260),
          5,
          8,
          Math.random() < 0.5 ? 0xffb8c8 : 0xffd98a,
          0.85,
        )
        .setDepth(25)
        .setAngle(Phaser.Math.Between(0, 180));
      this.tweens.add({
        targets: petal,
        y: FLOOR_Y - 30,
        x: x + Phaser.Math.Between(-50, 50),
        angle: 260,
        alpha: 0,
        duration: Phaser.Math.Between(2600, 4200),
        ease: "Sine.easeIn",
        onComplete: () => petal.destroy(),
      });
    } else if (mode === 3) {
      const drop = this.add
        .rectangle(x, Phaser.Math.Between(140, 320), 2, Phaser.Math.Between(14, 26), 0xbcd6ff, 0.5)
        .setDepth(25);
      this.tweens.add({
        targets: drop,
        y: FLOOR_Y - 40,
        x: x - 24,
        alpha: 0,
        duration: Phaser.Math.Between(900, 1400),
        ease: "Sine.easeIn",
        onComplete: () => drop.destroy(),
      });
    } else if (Math.random() < 0.45) {
      const mote = this.add
        .circle(x, Phaser.Math.Between(400, FLOOR_Y - 60), 1.6, 0xffe08a, 0.55)
        .setDepth(24);
      this.tweens.add({
        targets: mote,
        y: mote.y - Phaser.Math.Between(30, 70),
        alpha: 0,
        duration: Phaser.Math.Between(1800, 2800),
        ease: "Sine.easeOut",
        onComplete: () => mote.destroy(),
      });
    }
  }

  /** 随机让一个在场的小人做个小动作。 */
  idleTwitch(this: TavernScene) {
    if (this.gameState !== "open" || this.settling) return;
    const chars: Character[] = [this.playerChar];
    for (const b of this.booths) if (b.patronChar) chars.push(b.patronChar);
    for (const q of this.queue) chars.push(q.char);
    for (const c of this.staffChars()) if (c.visible) chars.push(c);
    chars[Math.floor(Math.random() * chars.length)]?.twitch();
  }

  spawnSteam(this: TavernScene, x: number, y: number, alpha = 0.26) {
    const puff = this.add.circle(x, y, Phaser.Math.Between(3, 5), 0xe8e8e8, alpha).setDepth(4);
    this.tweens.add({
      targets: puff,
      y: y - Phaser.Math.Between(30, 50),
      alpha: 0,
      scale: 1.8,
      duration: 900,
      ease: "Sine.easeOut",
      onComplete: () => puff.destroy(),
    });
  }

  /** 店里慢慢浮动的尘埃/灵光，让静态墙面有一点呼吸。 */
  emitInteriorMote(this: TavernScene) {
    if (this.gameState !== "open" || this.settling) return;
    const x = Phaser.Math.Between(-260, 260);
    const y = Phaser.Math.Between(380, 960);
    const mote = this.add
      .circle(x, y, Phaser.Math.FloatBetween(0.8, 2), 0xffe0a0, 0.35)
      .setDepth(6);
    this.tweens.add({
      targets: mote,
      y: y - Phaser.Math.Between(24, 60),
      x: x + Phaser.Math.Between(-18, 18),
      alpha: 0,
      duration: Phaser.Math.Between(2200, 3800),
      ease: "Sine.easeOut",
      onComplete: () => mote.destroy(),
    });
  }

  /** 门外空地的流萤，给营业中添一点活气。 */
  emitFirefly(this: TavernScene) {
    if (this.gameState !== "open" || this.settling || this.fireflyCount >= 6) return;
    this.fireflyCount += 1;
    const x = Phaser.Math.Between(380, 900);
    const y = Phaser.Math.Between(FLOOR_Y - 240, FLOOR_Y - 20);
    const dot = this.add.circle(x, y, Phaser.Math.Between(1, 3), 0xffe08a, 0.9).setDepth(6);
    this.tweens.add({
      targets: dot,
      x: x + Phaser.Math.Between(-40, 40),
      y: y + Phaser.Math.Between(-40, 20),
      alpha: 0,
      duration: Phaser.Math.Between(2200, 3600),
      ease: "Sine.easeInOut",
      onComplete: () => {
        dot.destroy();
        this.fireflyCount -= 1;
      },
    });
  }

  /** 夜修吐息：灵气从四周往打坐的人身上聚，掌柜身边更浓。 */
  emitNightQi(this: TavernScene) {
    if (this.gameState !== "closed" || this.focusing) return;
    this.workforce().forEach((e, i) => {
      const char = this.staffRt.get(e.id)?.char;
      if (!char?.visible || (i > 0 && Math.random() < 0.5)) return;
      const count = i === 0 ? 3 : 1;
      for (let k = 0; k < count; k++) {
        const angle = Math.random() * Math.PI * 2;
        const r = Phaser.Math.Between(46, 80);
        const dot = this.add
          .rectangle(char.x + Math.cos(angle) * r, char.y + 10 + Math.sin(angle) * r * 0.5, 2, 2, i === 0 ? 0x9ff4ea : 0xc8e8ff, 0.8)
          .setDepth(char.depth + 0.5);
        this.tweens.add({
          targets: dot,
          x: char.x + Phaser.Math.Between(-6, 6),
          y: char.y - 6,
          alpha: 0,
          duration: Phaser.Math.Between(1400, 2200),
          ease: "Sine.easeIn",
          onComplete: () => dot.destroy(),
        });
      }
    });
  }

  /** 小人偶尔冒一句话：排队、等菜、用膳和伙计各有台词，让画面不只剩数字。 */
  ambientBark(this: TavernScene) {
    if (this.gameState !== "open" || this.settling || this.focusing) return;
    if (Math.random() < 0.35) return;
    const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];
    const diningNow = this.booths.filter((b) => b.state === "dining" && b.patronChar);
    // 两桌都在用膳时，优先让他们真的碰一次杯（两人一起动 + 金色酒花），而不只是各说各话
    if (diningNow.length >= 2 && Math.random() < 0.55) {
      const i = Math.floor(Math.random() * diningNow.length);
      let j = Math.floor(Math.random() * (diningNow.length - 1));
      if (j >= i) j += 1;
      const a = diningNow[i].patronChar;
      const b = diningNow[j].patronChar;
      if (a && b) {
        this.showClink(a, b);
        return;
      }
    }
    const speakers: { char: Character; text: string; cold?: boolean }[] = [];
    this.booths.forEach((booth) => {
      const char = booth.patronChar;
      if (!char) return;
      const id = booth.patronKind?.id;
      if (booth.state === "awaitingCook") {
        speakers.push({
          char,
          text:
            id === "demonlord"
              ? "本座的时间，很贵。"
              : id === "elder"
                ? "一炷香内，可否？"
                : pick(["菜还没好么？", "这炉火候，有点意思。", "先上一壶清茶也行。"]),
          cold: id === "demonlord",
        });
      } else if (booth.state === "dining") {
        speakers.push({
          char,
          text:
            id === "sword"
              ? "剑意未平，先填五脏。"
              : id === "demon"
                ? "够味，痛快！"
                : id === "mortal"
                  ? "真香！"
                  : pick(["入口生津，灵气自生。", "掌柜好手艺。", "此味只应天上有。"]),
        });
      }
    });
    this.queue.slice(0, 2).forEach((p) => {
      speakers.push({ char: p.char, text: pick(["前面还有几位？", "这香气……不似凡间。", "听闻此楼灵膳能助修行。"]) });
    });
    const dining = this.booths.filter((b) => b.state === "dining" && b.patronChar);
    if (dining.length >= 2) {
      const others = dining[Math.floor(Math.random() * dining.length)].patronChar!;
      speakers.push({
        char: others,
        text: pick(["道友，共饮一杯？", "这家的灵茶不错。", "听闻掌柜是散修出身。", "山外云深，不如先吃。"])
      });
    }
    const jobLines: Record<Job | "none", string[]> = {
      cook: ["火候到了。", "再添一把柴。", "这锅气，成了。"],
      seat: ["客官里边请——", "小心台阶。", "雅座已备好。"],
      buy: ["今日有鲜货！", "灵材我盯着呢。", "客官，里边请！"],
      none: ["灵膳楼开张，仙凡同席！"],
    };
    for (const e of this.employees) {
      const char = this.staffRt.get(e.id)?.char;
      if (char?.visible) speakers.push({ char, text: pick(jobLines[this.firstJob(e) ?? "none"]) });
    }
    if (speakers.length === 0) return;
    const chosen = speakers[Math.floor(Math.random() * speakers.length)];
    chosen.char.say(chosen.text, chosen.cold ? "cold" : "warm");
  }
}
