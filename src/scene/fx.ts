// 一次性表现：浮字、连击、突破、庆祝、碰杯、日题头、事件提示。
import Phaser from "phaser";
import { playSfx } from "../audio";
import { isFestivalDay } from "../logic";
import { Character } from "./Character";
import { ACTOR_Y, FLOOR_Y, SCREEN_W, XIAN_FONT } from "./constants";
import type { TavernScene } from "./TavernScene";

export class FxMethods {
  /** 连击只奖励玩家亲手命中口味；达到 2 连起飘字，不打断节奏。 */
  showComboPopup(this: TavernScene) {
    const t = this.add
      .text(this.playerChar.x, this.playerChar.y - 84, `连击 ×${this.combo}`, {
        fontSize: "18px",
        color: "#ffb45a",
        fontFamily: XIAN_FONT,
        stroke: "#2a1a0a",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(31);
    this.tweens.add({
      targets: t,
      y: t.y - 34,
      alpha: 0,
      duration: 900,
      ease: "Sine.easeOut",
      onComplete: () => t.destroy(),
    });
  }

  /** 突破：白光一闪、金色灵环扩散、境界浮字。 */
  celebrateBreakthrough(this: TavernScene, realmName: string) {
    playSfx("upgrade");
    this.showEventToast(`突破 · ${realmName}`, true);
    this.cameras.main.flash(500, 255, 236, 170);
    const { x, y } = this.playerChar;
    for (let i = 0; i < 3; i++) {
      const ring = this.add
        .circle(x, y, 20, 0x000000, 0)
        .setStrokeStyle(4, 0xffe08a, 0.9)
        .setDepth(30);
      this.tweens.add({
        targets: ring,
        scale: 4.5,
        alpha: 0,
        delay: i * 120,
        duration: 700,
        ease: "Cubic.easeOut",
        onComplete: () => ring.destroy(),
      });
    }
    const text = this.add
      .text(x, y - 90, `突破 · ${realmName}`, {
        fontSize: "26px",
        color: "#ffe08a",
        stroke: "#3a2a10",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(45);
    this.tweens.add({
      targets: text,
      y: y - 150,
      alpha: 0,
      duration: 1400,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy(),
    });
    this.refreshPlayerAura();
  }

  /** 境界灵气：颜色与大小随境界、仙缘变化。 */
  refreshPlayerAura(this: TavernScene) {
    const colors = [0x8ab4ff, 0x7fe8dd, 0x9fe870, 0xffd98a, 0xff9a6a, 0xc8a8ff, 0xff8ad8, 0xfff2c0];
    this.playerChar?.setAura(colors[this.realmIndex()] ?? 0xfff2c0, 1 + this.ascensions * 0.12);
  }

  /** 上菜后桌上出现碗筷与热气，让「用膳」这件事看得见。 */
  /** 用膳套件：桌沿上的碗、两只手、袖子与筷子，跟着整段用餐存在。 */
  showDiningProp(this: TavernScene, index: number) {
    const booth = this.booths[index];
    booth.diningProp?.destroy();
    const table = this.tablePosition(index);
    const skin = 0xffe0bd;
    const body = booth.patronKind?.bodyColor ?? 0x7a8a6a;
    const layer = this.add.container(table.x, FLOOR_Y - 24).setDepth(21);
    const arms = this.add.graphics();
    arms.lineStyle(5, body, 1);
    arms.beginPath();
    arms.moveTo(-22, 6);
    arms.lineTo(-10, 0);
    arms.strokePath();
    arms.beginPath();
    arms.moveTo(22, 6);
    arms.lineTo(14, 0);
    arms.strokePath();
    arms.fillStyle(skin, 1);
    arms.fillCircle(-9, 0, 3.4);
    arms.fillCircle(14, 0, 3.4);
    arms.lineStyle(1, 0xd8a07a, 0.8);
    arms.lineBetween(-11, -1, -8, -1);
    arms.lineBetween(12, -1, 15, -1);
    layer.add(arms);
    const bowl = this.add.ellipse(10, 0, 34, 13, 0xf1e4cc);
    const rim = this.add.ellipse(10, -1, 28, 9, 0xe8d8bc);
    const soup = this.add.ellipse(10, -1, 20, 6, 0xd98a4a);
    const stick = this.add.rectangle(15, -7, 2, 24, 0x6a4a2a).setAngle(26);
    layer.add([bowl, rim, soup, stick]);
    for (const x of [-2, 10]) {
      const steam = this.add.ellipse(x, -10, 10, 5, 0xe8e8e8, 0.22);
      layer.add(steam);
      this.tweens.add({
        targets: steam,
        y: -26,
        alpha: 0,
        duration: 1500,
        delay: Phaser.Math.Between(0, 700),
        repeat: -1,
        ease: "Sine.easeOut",
      });
    }
    booth.diningProp = layer;
  }

  /** 每日开张的题头：日期 + 今日天气，给每一局一个开场仪式。 */
  showDayBanner(this: TavernScene) {
    const weather = isFestivalDay(this.day)
      ? `灯会开市 · 天气 ${this.weather.name}`
      : `天气 · ${this.weather.name} · ${this.weather.desc}`;
    const layer = this.add.container(0, 0).setScrollFactor(0).setDepth(29);
    const wrap = this.add.container(0, 0);
    wrap.add(
      this.add
        .text(360, 185, `第 ${this.day} 日`, {
          fontSize: "48px",
          color: "#ffe6a8",
          stroke: "#2a1a0a",
          strokeThickness: 5,
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(8),
    );
    wrap.add(this.add.rectangle(360, 231, 220, 1, 0xd9b45a, 0.6));
    wrap.add(
      this.add
        .text(360, 253, weather, {
          fontSize: "20px",
          color: "#e0c9a0",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(4),
    );
    wrap.setAlpha(0);
    layer.add(wrap);
    // 灯会开市的小金花：只在第 7/14/… 日出现
    if (isFestivalDay(this.day)) {
      for (let i = 0; i < 18; i++) {
        const angle = (Math.PI * 2 * i) / 18 + Phaser.Math.FloatBetween(-0.2, 0.2);
        const dist = Phaser.Math.Between(70, 190);
        const spark = this.add
          .circle(360, 200, Phaser.Math.FloatBetween(1.5, 3.5), i % 3 === 0 ? 0xff6a4a : 0xffd98a, 1)
          .setScrollFactor(0);
        layer.add(spark);
        this.tweens.add({
          targets: spark,
          x: 360 + Math.cos(angle) * dist,
          y: 200 + Math.sin(angle) * dist + 30,
          alpha: 0,
          duration: Phaser.Math.Between(900, 1500),
          delay: Phaser.Math.Between(0, 350),
          ease: "Sine.easeOut",
          onComplete: () => spark.destroy(),
        });
      }
    }
    // 日题头落在牌匾位置，暂时让出牌匾，避免两层大字叠在一起
    this.interiorSign?.setAlpha(0);
    this.tweens.add({ targets: wrap, alpha: 1, y: 8, duration: 500, ease: "Sine.easeOut" });
    this.tweens.add({
      targets: wrap,
      alpha: 0,
      y: -8,
      delay: 1700,
      duration: 700,
      ease: "Sine.easeIn",
      onComplete: () => {
        layer.destroy();
        this.interiorSign?.setAlpha(1);
      },
    });
  }

  /** 打烊瞬间：在场角色原地跳跃 + 头顶粒子，循环到关闭弹窗。 */
  startCelebration(this: TavernScene) {
    if (this.celebrating) return;
    this.celebrating = true;
    for (const char of this.celebrationChars()) {
      this.tweens.killTweensOf(char);
      const baseY = char.y;
      this.tweens.add({
        targets: char,
        y: baseY - 16,
        duration: 240,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.tweens.add({
        targets: char,
        scaleY: 1.12,
        duration: 240,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
    this.celebrationTimer = this.time.addEvent({ delay: 300, loop: true, callback: () => this.emitSparkles() });
    this.emitSparkles();
  }

  stopCelebration(this: TavernScene) {
    if (!this.celebrating) return;
    this.celebrating = false;
    this.celebrationTimer?.remove();
    this.celebrationTimer = undefined;
    this.sparkles.forEach((spark) => spark.destroy());
    this.sparkles = [];
    this.celebrationChars().forEach((char) => {
      this.tweens.killTweensOf(char);
      char.setY(ACTOR_Y);
      char.setScale(char.scaleX, 1);
    });
  }

  celebrationChars(this: TavernScene): Character[] {
    return [this.playerChar, ...this.staffChars()];
  }

  emitSparkles(this: TavernScene) {
    for (const char of this.celebrationChars()) {
      const x = char.x + Phaser.Math.Between(-18, 18);
      const y = char.y - 34;
      const spark = this.add.circle(x, y, Phaser.Math.Between(2, 4), 0xffe08a, 1).setDepth(25);
      this.sparkles.push(spark);
      this.tweens.add({
        targets: spark,
        y: y - Phaser.Math.Between(36, 64),
        alpha: 0,
        duration: 650,
        ease: "Sine.easeOut",
        onComplete: () => {
          spark.destroy();
          this.sparkles = this.sparkles.filter((s) => s !== spark);
        },
      });
    }
  }

  /** 两桌食客碰杯：两人同时欠身，桌间升起金色酒花与「碰杯」。 */
  showClink(this: TavernScene, a: Character, b: Character) {
    this.lastClinkAt = this.time.now;
    a.pulse();
    b.pulse();
    a.cheer(a.x < b.x ? 1 : -1);
    b.cheer(b.x < a.x ? 1 : -1);
    a.say(
      ["道友，共饮一杯？", "此味配灵茶，正好。", "同席是缘，干杯。"][
        Math.floor(Math.random() * 3)
      ],
    );
    // 另一桌隔半秒回一句，画面里才像两个人在说话，而不是系统播报
    this.time.delayedCall(900, () => {
      if (b.active) b.say(["好酒！", "同饮。", "道友先请。", "这杯敬掌柜。"][Math.floor(Math.random() * 4)]);
    });
    const x = (a.x + b.x) / 2;
    const y = ACTOR_Y - 58;
    const label = this.add
      .text(x, y - 16, "碰杯", {
        fontSize: "15px",
        color: "#ffe6a8",
        backgroundColor: "rgba(30,22,15,0.9)",
        padding: { x: 6, y: 3 },
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setDepth(25);
    this.tweens.add({
      targets: label,
      y: y - 44,
      alpha: 0,
      duration: 1600,
      ease: "Sine.easeOut",
      onComplete: () => label.destroy(),
    });
    for (let i = 0; i < 4; i++) {
      const spark = this.add
        .circle(x + Phaser.Math.Between(-10, 10), y + Phaser.Math.Between(-8, 8), 2, 0xffe08a, 0.95)
        .setDepth(25);
      this.tweens.add({
        targets: spark,
        y: spark.y - Phaser.Math.Between(18, 30),
        alpha: 0,
        duration: 900,
        delay: i * 60,
        ease: "Sine.easeOut",
        onComplete: () => spark.destroy(),
      });
    }
  }

  /** 端对口味时桌上冒一颗心。 */
  showWishReaction(this: TavernScene, worldX: number, worldY: number) {
    const heart = this.add
      .text(worldX, worldY, "♥", {
        fontSize: "26px",
        color: "#ff8ab0",
        stroke: "#4a1a2a",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(26);
    this.tweens.add({
      targets: heart,
      y: worldY - 46,
      alpha: 0,
      scale: 1.5,
      duration: 900,
      ease: "Cubic.easeOut",
      onComplete: () => heart.destroy(),
    });
  }

  /** 亲自出菜得修为时，在桌上飘一行青色「+N 修为」。 */
  showCultivationPopup(this: TavernScene, worldX: number, worldY: number, amount: number) {
    const text = this.add
      .text(worldX, worldY, `+${amount} 修为`, {
        fontSize: "20px",
        color: "#9fe8ff",
        stroke: "#123040",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(26);
    this.tweens.add({
      targets: text,
      y: worldY - 42,
      alpha: 0,
      duration: 900,
      ease: "Cubic.easeOut",
      onComplete: () => text.destroy(),
    });
  }

  /** 食客离店时在桌子上方弹出收益浮字，飞到 HUD 灵石处后让数字滚动。 */
  showCoinPopup(this: TavernScene, worldX: number, worldY: number, amount: number) {
    this.coins += amount;
    const cam = this.cameras.main;
    const sx = worldX - cam.scrollX;
    const sy = worldY;

    const container = this.add.container(sx, sy).setScrollFactor(0).setDepth(40);
    const glow = this.add.circle(0, 0, 16, 0x7fe8dd, 0.35);
    const stone = this.add.graphics();
    const shape = [
      new Phaser.Geom.Point(0, -13),
      new Phaser.Geom.Point(11, -4),
      new Phaser.Geom.Point(8, 11),
      new Phaser.Geom.Point(-8, 11),
      new Phaser.Geom.Point(-11, -4),
    ];
    stone.fillStyle(0x7fe8dd, 1);
    stone.fillPoints(shape, true);
    stone.lineStyle(2, 0xffffff, 0.9);
    stone.strokePoints(shape, true);
    stone.fillStyle(0xffffff, 0.55);
    stone.fillTriangle(-6, -3, 3, -5, -1, 7);
    const text = this.add.text(17, -10, `+${amount}`, {
      fontSize: "20px",
      color: "#a8f5e8",
      stroke: "#173a36",
      strokeThickness: 3,
    });
    container.add([glow, stone, text]);

    this.tweens.add({ targets: container, y: sy - 34, duration: 260, ease: "Sine.easeOut" });
    this.tweens.add({
      targets: container,
      x: 54,
      y: 22,
      scale: 0.45,
      alpha: 0,
      delay: 280,
      duration: 560,
      ease: "Cubic.easeIn",
      onComplete: () => {
        container.destroy(true);
        this.rollCoinsDisplay();
      },
    });
  }

  showEventToast(this: TavernScene, message: string, good: boolean) {
    if (this.focusing) return;
    const toast = this.add
      .text(SCREEN_W / 2, 600, message, {
        fontSize: "19px",
        color: good ? "#ffe6c8" : "#ff9a8a",
        backgroundColor: "rgba(30,22,15,0.94)",
        padding: { x: 16, y: 10 },
        align: "center",
        wordWrap: { width: 600 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(45)
      .setAlpha(0);
    this.eventToast?.destroy();
    this.eventToast = toast;
    this.tweens.add({
      targets: toast,
      alpha: 1,
      y: 580,
      duration: 260,
      yoyo: true,
      hold: 1800,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (this.eventToast === toast) this.eventToast = undefined;
        toast.destroy();
      },
    });
  }
}
