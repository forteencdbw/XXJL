// 标题画面、选性别、开场过场。
import Phaser from "phaser";
import { playSfx } from "../audio";
import { Character } from "./Character";
import { SCREEN_H, SCREEN_W, XIAN_FONT } from "./constants";
import type { TavernScene } from "./TavernScene";

export class TitleMethods {
  /** 水墨像素标题页：像素底图 + 楷体题字，风格从这里定下来。 */
  showInkPixelTitle(this: TavernScene) {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(140);
    layer.add(
      this.add
        .image(360, 640, "ink-title")
        .setDisplaySize(SCREEN_W, SCREEN_H)
        .setInteractive()
        .on("pointerdown", () => {
          playSfx("click");
          this.showGenderPicker();
        }),
    );
    layer.add(
      this.add
        .image(360, 640, "vignette")
        .setDisplaySize(SCREEN_W, SCREEN_H)
        .setAlpha(0.8),
    );
    const title = this.add
      .text(360, 414, "灵膳楼", {
        fontSize: "98px",
        color: "#ffe6a8",
        stroke: "#241506",
        strokeThickness: 10,
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setLetterSpacing(14);
    layer.add(title);
    layer.add(
      this.add
        .text(360, 530, "一炉烟火 · 半盏仙途", {
          fontSize: "23px",
          color: "#c8b8a0",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(6),
    );
    layer.add(this.add.rectangle(360, 588, 300, 1, 0xb08a4a, 0.7));
    layer.add(
      this.add
        .text(360, 638, "青云镇外 · 散修旧铺", {
          fontSize: "16px",
          color: "#8a7a62",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(3),
    );
    const button = this.add
      .rectangle(360, 830, 300, 82, 0x1a120c, 0.94)
      .setStrokeStyle(3, 0xd9b45a)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        playSfx("click");
        this.showGenderPicker();
      });
    layer.add(button);
    // 像素角标
    for (const [bx, by] of [
      [214, 792],
      [506, 792],
      [214, 864],
      [506, 864],
    ] as const) {
      layer.add(this.add.rectangle(bx, by, 6, 6, 0xd9b45a).setAngle(45));
    }
    layer.add(
      this.add
        .text(360, 830, "推门入座", {
          fontSize: "28px",
          color: "#ffe6a8",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5),
    );
    layer.add(
      this.add.rectangle(360, 930, 48, 48, 0x8a2a22, 0.95).setStrokeStyle(2, 0xe8b06a).setAngle(4),
    );
    layer.add(
      this.add
        .text(360, 930, "灵膳", {
          fontSize: "16px",
          color: "#ffe6c8",
          fontFamily: XIAN_FONT,
          align: "center",
          lineSpacing: 2,
        })
        .setOrigin(0.5)
        .setAngle(4),
    );
    layer.add(
      this.add
        .text(360, 990, "迎客入座 · 点菜出餐 · 打烊修行", {
          fontSize: "15px",
          color: "#8a7a62",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(3),
    );
    // 少量像素浮尘：和底图同一套硬边
    for (let i = 0; i < 18; i++) {
      const dot = this.add.rectangle(
        Phaser.Math.Between(40, 680),
        Phaser.Math.Between(460, 1080),
        Phaser.Math.Between(2, 4),
        Phaser.Math.Between(2, 4),
        Math.random() > 0.5 ? 0xffd98a : 0xc8d8e8,
        Phaser.Math.FloatBetween(0.18, 0.5),
      );
      layer.add(dot);
      this.tweens.add({
        targets: dot,
        y: dot.y - Phaser.Math.Between(40, 120),
        alpha: 0,
        duration: Phaser.Math.Between(3600, 6800),
        delay: Phaser.Math.Between(0, 2500),
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 700, ease: "Sine.easeOut" });
    this.overlay = layer;
  }

  buildSceneGrade(this: TavernScene) {
    this.add
      .image(360, 640, "vignette")
      .setDisplaySize(SCREEN_W, SCREEN_H)
      .setScrollFactor(0)
      .setDepth(24)
      .setAlpha(0.62);
    this.add
      .tileSprite(360, 640, SCREEN_W, SCREEN_H, "paper-grain")
      .setScrollFactor(0)
      .setDepth(24.5)
      .setAlpha(0.55);
  }

  /** 首次进入的标题页：月、山、灯、题字，先把「灵膳楼」的气质立住。 */
  showTitleScreen(this: TavernScene) {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(140);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x070b14, 1).setOrigin(0, 0).setInteractive());

    // 月光与远山
    const moonGlow = this.add
      .image(540, 210, "soft-glow")
      .setTint(0xffe8b0)
      .setAlpha(0.9)
      .setScale(1.55)
      .setBlendMode(Phaser.BlendModes.ADD);
    layer.add(moonGlow);
    this.tweens.add({
      targets: moonGlow,
      alpha: 0.7,
      scale: 1.66,
      duration: 3200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    layer.add(this.add.circle(540, 210, 38, 0xffefc2, 0.95));
    const hills = this.add.graphics();
    hills.fillStyle(0x111b2a, 1);
    hills.beginPath();
    hills.moveTo(0, 980);
    hills.lineTo(0, 760);
    hills.lineTo(120, 640);
    hills.lineTo(250, 790);
    hills.lineTo(370, 690);
    hills.lineTo(510, 830);
    hills.lineTo(640, 720);
    hills.lineTo(720, 800);
    hills.lineTo(720, 980);
    hills.closePath();
    hills.fillPath();
    hills.fillStyle(0x0b1420, 1);
    hills.beginPath();
    hills.moveTo(0, 1040);
    hills.lineTo(0, 920);
    hills.lineTo(180, 830);
    hills.lineTo(330, 950);
    hills.lineTo(470, 870);
    hills.lineTo(720, 1000);
    hills.lineTo(720, 1040);
    hills.closePath();
    hills.fillPath();
    // 远处山门
    hills.fillStyle(0x1a2436, 1);
    hills.fillRect(646, 700, 44, 10);
    hills.fillTriangle(634, 700, 702, 700, 668, 676);
    hills.fillStyle(0xffd98a, 0.5);
    hills.fillRect(662, 710, 6, 8);
    layer.add(hills);

    // 雾带
    for (const [x, y, w, a] of [
      [180, 880, 360, 0.05],
      [500, 930, 420, 0.04],
      [80, 950, 300, 0.03],
    ]) {
      layer.add(this.add.ellipse(x, y, w, 46, 0xc8d8e8, a));
    }
    // 慢慢飘的夜云，让标题不是一张静止的图
    for (const [x, y, cw, a] of [
      [130, 300, 420, 0.035],
      [470, 382, 520, 0.03],
    ]) {
      const cloud = this.add.ellipse(x, y, cw, 78, 0xdfe9f5, a);
      layer.add(cloud);
      this.tweens.add({
        targets: cloud,
        x: x + 90,
        duration: 26000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    // 两只越过月亮的鹤影：给静态夜空一点方向和生气
    for (const [cx, cy, dir] of [
      [300, 312, 1],
      [430, 270, 1],
    ] as const) {
      const crane = this.add.graphics();
      crane.lineStyle(3, 0x0a1018, 0.62);
      crane.beginPath();
      crane.moveTo(-13, 2);
      crane.lineTo(0, -5);
      crane.lineTo(13, 2);
      crane.strokePath();
      crane.lineStyle(2, 0x0a1018, 0.42);
      crane.lineBetween(-13, 2, -21, 8);
      crane.lineBetween(13, 2, 21, 8);
      crane.setPosition(cx, cy);
      layer.add(crane);
      this.tweens.add({
        targets: crane,
        x: cx + 90 * dir,
        y: cy - 12,
        duration: 24000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
    // 落英：只有几片，慢慢斜落
    for (let i = 0; i < 9; i++) {
      const petal = this.add.ellipse(
        Phaser.Math.Between(40, SCREEN_W - 40),
        Phaser.Math.Between(560, 1120),
        Phaser.Math.Between(4, 7),
        Phaser.Math.Between(2, 4),
        0xffc8d8,
        Phaser.Math.FloatBetween(0.2, 0.42),
      );
      layer.add(petal);
      this.tweens.add({
        targets: petal,
        x: petal.x + Phaser.Math.Between(30, 90),
        y: petal.y + Phaser.Math.Between(90, 180),
        angle: Phaser.Math.Between(120, 260),
        alpha: 0,
        duration: Phaser.Math.Between(6800, 11000),
        delay: Phaser.Math.Between(0, 4000),
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    const title = this.add
      .text(SCREEN_W / 2, 430, "灵膳楼", {
        fontSize: "104px",
        color: "#ffe6a8",
        stroke: "#241506",
        strokeThickness: 10,
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setLetterSpacing(14);
    layer.add(title);
    layer.add(
      this.add
        .text(SCREEN_W / 2, 552, "一炉烟火 · 半盏仙途", {
          fontSize: "24px",
          color: "#c8b8a0",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(6),
    );
    layer.add(this.add.rectangle(SCREEN_W / 2, 610, 300, 1, 0xb08a4a, 0.7));
    layer.add(
      this.add
        .text(SCREEN_W / 2, 660, "青云镇外 · 散修旧铺", {
          fontSize: "16px",
          color: "#8a7a62",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(3),
    );

    const button = this.add
      .rectangle(SCREEN_W / 2, 850, 280, 80, 0x2a1a12, 0.9)
      .setStrokeStyle(2, 0xe8b06a)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        playSfx("click");
        this.destroyOverlay();
        this.showGenderPicker();
      });
    layer.add(button);
    const buttonText = this.add
      .text(SCREEN_W / 2, 850, "推门入座", {
        fontSize: "28px",
        color: "#ffe6a8",
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5);
    layer.add(buttonText);
    layer.add(this.add.rectangle(SCREEN_W / 2, 946, 48, 48, 0x8a2a22, 0.95).setStrokeStyle(2, 0xe8b06a).setAngle(4));
    layer.add(
      this.add
        .text(SCREEN_W / 2, 946, "灵膳", {
          fontSize: "16px",
          color: "#ffe6c8",
          fontFamily: XIAN_FONT,
          align: "center",
          lineSpacing: 2,
        })
        .setOrigin(0.5)
        .setAngle(4),
    );
    this.tweens.add({
      targets: [button, buttonText],
      alpha: { from: 0.55, to: 1 },
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    layer.add(
      this.add
        .text(SCREEN_W / 2, 1028, "迎客入座 · 点菜出餐 · 打烊修行", {
          fontSize: "15px",
          color: "#8a7a62",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(3),
    );

    // 前景屋脊与窗火，填住标题下方的空黑
    const foreground = this.add.graphics();
    foreground.fillStyle(0x05080e, 1);
    foreground.beginPath();
    foreground.moveTo(0, 1280);
    foreground.lineTo(0, 1120);
    foreground.lineTo(140, 1058);
    foreground.lineTo(280, 1132);
    foreground.lineTo(430, 1072);
    foreground.lineTo(600, 1148);
    foreground.lineTo(720, 1096);
    foreground.lineTo(720, 1280);
    foreground.closePath();
    foreground.fillPath();
    foreground.fillStyle(0x0a0f18, 1);
    foreground.fillRect(292, 1120, 136, 76);
    foreground.fillTriangle(276, 1120, 444, 1120, 360, 1068);
    foreground.fillStyle(0xffb060, 0.85);
    foreground.fillRect(316, 1144, 20, 24);
    foreground.fillRect(384, 1144, 20, 24);
    // 窗里两个喝酒的剪影，让标题页先有"人"
    foreground.fillStyle(0x2a1a10, 0.95);
    foreground.fillCircle(325, 1152, 4);
    foreground.fillRect(317, 1157, 16, 9);
    foreground.fillCircle(393, 1152, 4);
    foreground.fillRect(385, 1157, 16, 9);
    foreground.fillStyle(0x0a0f18, 1);
    foreground.fillRect(468, 1160, 60, 40);
    foreground.fillTriangle(460, 1160, 536, 1160, 498, 1134);
    layer.add(foreground);
    layer.add(
      this.add
        .image(360, 1148, "soft-glow")
        .setTint(0xff9a4a)
        .setAlpha(0.22)
        .setScale(0.9)
        .setBlendMode(Phaser.BlendModes.ADD),
    );
    // 窗上两缕热气
    for (const sx of [326, 394]) {
      const steam = this.add.ellipse(sx, 1132, 18, 9, 0xffe6c8, 0.16);
      layer.add(steam);
      this.tweens.add({
        targets: steam,
        y: steam.y - 34,
        alpha: 0,
        duration: 2600,
        delay: Phaser.Math.Between(0, 1200),
        repeat: -1,
        ease: "Sine.easeOut",
      });
    }

    // 檐下小灯笼：给标题底部一点暖光和摆动
    const titleLantern = this.add.container(360, 1108);
    titleLantern.add(this.add.rectangle(0, -30, 2, 22, 0x2a1a10));
    titleLantern.add(
      this.add
        .image(0, 0, "soft-glow")
        .setTint(0xff8a4a)
        .setAlpha(0.28)
        .setScale(0.34)
        .setBlendMode(Phaser.BlendModes.ADD),
    );
    titleLantern.add(this.add.ellipse(0, 0, 24, 32, 0xff5c3c));
    titleLantern.add(this.add.rectangle(0, -16, 15, 4, 0x2a1a10));
    titleLantern.add(this.add.rectangle(0, 16, 15, 4, 0x2a1a10));
    titleLantern.add(this.add.rectangle(0, 23, 2, 9, 0xd9b45a));
    layer.add(titleLantern);
    this.tweens.add({
      targets: titleLantern,
      angle: 4,
      duration: 2600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // 浮尘/灵火
    for (let i = 0; i < 14; i++) {
      const mote = this.add.circle(
        Phaser.Math.Between(40, SCREEN_W - 40),
        Phaser.Math.Between(480, 1180),
        Phaser.Math.FloatBetween(1, 2.6),
        0xffd98a,
        Phaser.Math.FloatBetween(0.2, 0.7),
      );
      layer.add(mote);
      this.tweens.add({
        targets: mote,
        y: mote.y - Phaser.Math.Between(60, 160),
        x: mote.x + Phaser.Math.Between(-30, 30),
        alpha: 0,
        duration: Phaser.Math.Between(4200, 7600),
        delay: Phaser.Math.Between(0, 3000),
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    layer.add(
      this.add
        .image(360, 640, "vignette")
        .setDisplaySize(SCREEN_W, SCREEN_H)
        .setAlpha(0.9),
    );
    layer.add(
      this.add
        .tileSprite(360, 640, SCREEN_W, SCREEN_H, "paper-grain")
        .setAlpha(0.7),
    );
    layer.setAlpha(0);
    this.tweens.add({ targets: layer, alpha: 1, duration: 700, ease: "Sine.easeOut" });
    this.overlay = layer;
  }

  showGenderPicker(this: TavernScene) {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(120);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.97).setOrigin(0, 0).setInteractive());
    layer.add(
      this.add
        .text(360, 200, "选择掌柜性别", { fontSize: "30px", color: "#ffe6a8", fontFamily: XIAN_FONT })
        .setOrigin(0.5)
        .setLetterSpacing(4),
    );
    layer.add(
      this.add
        .text(360, 248, "踏进灵膳楼之前，先定一个行走江湖的模样", {
          fontSize: "15px",
          color: "#8a7a62",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5),
    );
    const cards = new Map<"male" | "female", Phaser.GameObjects.Rectangle>();
    for (const x of [180, 540]) {
      const card = this.add.rectangle(x, 510, 176, 276, 0x1a120c, 0.82).setStrokeStyle(2, 0x8a6a3a, 0.7);
      cards.set(x === 180 ? "male" : "female", card);
      layer.add(card);
      layer.add(
        this.add
          .image(x, 500, "soft-glow")
          .setTint(0xffb060)
          .setAlpha(0.48)
          .setScale(1.35)
          .setBlendMode(Phaser.BlendModes.ADD),
      );
    }
    const male = new Character(this, 180, 500, 0x4a7ab8, 0x2b2b2b, false, "player");
    male.usePixelArt(false);
    male.setScale(2.2).disableInteractive();
    const female = new Character(this, 540, 500, 0xc86a9e, 0x4a2b1a, true, "player");
    female.usePixelArt(false);
    female.setScale(-2.2, 2.2).disableInteractive();
    layer.add([male, female]);
    layer.add(
      this.add
        .text(180, 622, "少年掌柜", {
          fontSize: "14px",
          color: "#c8b8a0",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5),
    );
    layer.add(
      this.add
        .text(540, 622, "少女掌柜", {
          fontSize: "14px",
          color: "#c8b8a0",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5),
    );

    let chosen: "male" | "female" | null = null;
    const pick = (x: number, label: string, gender: "male" | "female", color: string) => {
      const btn = this.add
        .text(x, 700, label, {
          fontSize: "30px",
          color: "#ffe6c8",
          backgroundColor: color,
          padding: { x: 44, y: 18 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          playSfx("click");
          chosen = gender;
          cards.forEach((card, key) =>
            key === gender ? card.setStrokeStyle(4, 0xffe6a8, 1) : card.setStrokeStyle(2, 0x8a6a3a, 0.7),
          );
          confirm.setAlpha(1);
        });
      layer.add(btn);
      this.expandHitArea(btn, 18);
    };
    pick(180, "男", "male", "#3f5a7a");
    pick(540, "女", "female", "#7a3f5a");
    const confirm = this.add
      .text(360, 830, "确认", {
        fontSize: "28px",
        color: "#ffe6a8",
        fontFamily: XIAN_FONT,
        backgroundColor: "#2a1a12",
        padding: { x: 56, y: 16 },
      })
      .setOrigin(0.5)
      .setAlpha(0.4)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => {
        if (!chosen) return;
        playSfx("click");
        this.setGender(chosen);
        this.suppressSave = false;
        this.save();
        this.showOpening();
      });
    layer.add(confirm);
    this.expandHitArea(confirm, 18);
    layer.add(
      this.add
        .text(360, 900, "选定后，本存档不可更改", { fontSize: "16px", color: "#c8b8a0", fontFamily: XIAN_FONT })
        .setOrigin(0.5),
    );
    this.overlay = layer;
  }

  /** 新档进店前的四秒开场：一段旁白把“旧铺、灵火、今夜开张”立住，可点任意处跳过。 */
  showOpening(this: TavernScene) {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(130);
    layer.add(
      this.add
        .rectangle(0, 0, SCREEN_W, SCREEN_H, 0x05080e, 1)
        .setOrigin(0, 0)
        .setInteractive()
        .on("pointerdown", () => this.finishOpening(layer)),
    );
    const ink = this.add.graphics();
    ink.fillStyle(0xc8d8e8, 0.035);
    ink.fillCircle(560, 330, 72);
    ink.fillStyle(0x8aa0b8, 0.05);
    ink.fillTriangle(-20, 1280, 210, 1030, 440, 1280);
    ink.fillTriangle(280, 1280, 480, 1080, 740, 1280);
    layer.add(ink);
    layer.add(
      this.add
        .image(360, 980, "soft-glow")
        .setTint(0xff8a4a)
        .setAlpha(0.2)
        .setScale(2.2)
        .setBlendMode(Phaser.BlendModes.ADD),
    );
    const lantern = this.add.container(360, 980);
    lantern.add(this.add.rectangle(0, -30, 2, 24, 0x2a1a10));
    lantern.add(this.add.ellipse(0, 0, 22, 30, 0xff5c3c, 0.92));
    lantern.add(this.add.rectangle(0, -15, 14, 4, 0x2a1a10));
    lantern.add(this.add.rectangle(0, 15, 14, 4, 0x2a1a10));
    lantern.add(this.add.rectangle(0, 22, 2, 9, 0xd9b45a));
    layer.add(lantern);
    for (const sx of [324, 396]) {
      const steam = this.add.ellipse(sx, 960, 18, 8, 0xffe6c8, 0.12);
      layer.add(steam);
      this.tweens.add({
        targets: steam,
        y: 910,
        alpha: 0,
        duration: 2600,
        delay: Phaser.Math.Between(0, 900),
        repeat: -1,
        ease: "Sine.easeOut",
      });
    }
    const lines = [
      { text: "青云镇外，夜雨初歇。", y: 500, delay: 250 },
      { text: "一间旧铺，半炉灵火。", y: 574, delay: 1150 },
      { text: "掌柜，今日开张吗？", y: 682, delay: 2150 },
    ];
    for (const [i, line] of lines.entries()) {
      const text = this.add
        .text(360, line.y, line.text, {
          fontSize: i === 2 ? "32px" : "26px",
          color: i === 2 ? "#ffe6a8" : "#c8b8a0",
          fontFamily: XIAN_FONT,
          stroke: i === 2 ? "#241506" : undefined,
          strokeThickness: i === 2 ? 4 : 0,
        })
        .setOrigin(0.5)
        .setAlpha(0)
        .setLetterSpacing(4);
      layer.add(text);
      this.tweens.add({
        targets: text,
        alpha: 1,
        duration: 520,
        delay: line.delay,
        hold: 900,
        yoyo: true,
        ease: "Sine.easeOut",
      });
    }
    layer.add(
      this.add
        .text(360, 1122, "点任意处跳过", { fontSize: "16px", color: "#7a6a54", fontFamily: XIAN_FONT })
        .setOrigin(0.5)
        .setAlpha(0.7)
        .setLetterSpacing(3),
    );
    layer.add(
      this.add
        .image(360, 640, "vignette")
        .setDisplaySize(SCREEN_W, SCREEN_H)
        .setAlpha(0.95),
    );
    layer.add(
      this.add
        .tileSprite(360, 640, SCREEN_W, SCREEN_H, "paper-grain")
        .setAlpha(0.7),
    );
    this.overlay = layer;
    this.time.delayedCall(4300, () => this.finishOpening(layer));
  }

  finishOpening(this: TavernScene, layer: Phaser.GameObjects.Container) {
    if (this.overlay !== layer) return;
    playSfx("click");
    layer.list.forEach((child) => this.tweens.killTweensOf(child));
    this.destroyOverlay();
  }
}
