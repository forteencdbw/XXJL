// 跟随镜头的世界层：酒楼内外景像素绘制、窗、灯笼、猫、星空。
import Phaser from "phaser";
import { Character } from "./Character";
import { DOOR_X, EXTERIOR_X, FLOOR_Y, PLAYER_HOME, SCREEN_W, TAVERN_W, XIAN_FONT } from "./constants";
import type { TavernScene } from "./TavernScene";

export class WorldMethods {
  // ===== 世界（跟随镜头）=====
  buildWorld(this: TavernScene) {
    // 外观酒楼放到远处，打烊时镜头看它
    this.tavernGfx = this.add.graphics().setDepth(0).setX(EXTERIOR_X);
    this.drawTavern(this.tavernGfx, false);
    this.add
      .text(EXTERIOR_X, 583, "灵膳楼", {
        fontSize: "30px",
        color: "#ffe6a8",
        stroke: "#2a1a0a",
        strokeThickness: 2,
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setDepth(2);
    this.createSwayLantern(EXTERIOR_X - 165, 600);
    this.createSwayLantern(EXTERIOR_X + 165, 600);
    this.addGlow(EXTERIOR_X - 165, 600, 0xff7a3a, 1.1, 0.5);
    this.addGlow(EXTERIOR_X + 165, 600, 0xff7a3a, 1.1, 0.5);
    this.addGlow(EXTERIOR_X, 760, 0xffb060, 1.2, 0.18);

    // 营业时看的酒楼内部
    this.add.graphics().setDepth(-1).fillStyle(0x140e0a, 1).fillRect(-820, 0, 460, 1400);
    this.interiorGfx = this.add.graphics().setDepth(0);
    this.drawInterior(this.interiorGfx);
    for (const [x, y, tint, scale, alpha] of [
      [-230, 400, 0xffa050, 1.25, 0.45],
      [230, 400, 0xffa050, 1.25, 0.45],
      [-272, 850, 0xff7a3a, 1.7, 0.5],
      [DOOR_X, 890, 0xffb060, 1.35, 0.32],
      [70, 1000, 0xffb060, 1.7, 0.14],
      [700, FLOOR_Y - 64, 0xffb060, 0.8, 0.35],
      [1150, FLOOR_Y - 64, 0xffb060, 0.8, 0.3],
    ] as const) {
      this.addGlow(x, y, tint, scale, alpha);
    }
    this.createCat(142, 826);
    this.interiorSign = this.add
      .text(0, 212, "灵膳楼", {
        fontSize: "38px",
        color: "#ffe6a8",
        stroke: "#2a1a0a",
        strokeThickness: 4,
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setDepth(6.9)
      .setLetterSpacing(6);
    this.createSwayLantern(-280, 400);
    this.createSwayLantern(280, 400);

    this.playerChar = new Character(this, PLAYER_HOME.x, PLAYER_HOME.y, 0x4a7ab8, 0x2b2b2b, false, "player");
    this.playerChar.displayName = "掌柜";
    this.playerChar.setVisible(false);
    this.playerLabel = this.add
      .text(PLAYER_HOME.x, PLAYER_HOME.y - 120, "掌柜", {
        fontSize: "12px",
        color: "#ffe6a8",
        backgroundColor: "rgba(30,22,15,0.78)",
        padding: { x: 5, y: 2 },
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setDepth(26)
      .setVisible(false);
  }

  /** 酒楼内部（侧视图）：背景墙、地面、左侧厨房灶台、右侧门口、两侧窗户。 */
  drawInterior(this: TavernScene, gfx: Phaser.GameObjects.Graphics) {
    gfx.clear();
    // 背景墙：暗木与暖灰泥
    gfx.fillStyle(0x493629, 1);
    gfx.fillRect(-360, 0, 790, FLOOR_Y);
    gfx.fillStyle(0x5a4332, 1);
    gfx.fillRect(-360, 0, 790, 18);
    gfx.fillStyle(0x33251b, 1);
    gfx.fillRect(-360, FLOOR_Y - 20, 790, 20);
    for (const x of [-310, -180, -55, 55, 180, 310, 420]) gfx.fillRect(x - 5, 0, 10, FLOOR_Y);
    gfx.lineStyle(2, 0x5a4434, 0.5);
    for (let y = 130; y < FLOOR_Y - 20; y += 110) gfx.lineBetween(-360, y, 430, y);

    // 山水挂画
    gfx.fillStyle(0x2a1a10, 1);
    gfx.fillRect(-158, 410, 316, 164);
    gfx.fillStyle(0xe8dcc0, 0.95);
    gfx.fillRect(-150, 418, 300, 148);
    gfx.fillStyle(0x5a6a5a, 0.35);
    gfx.fillTriangle(-130, 540, -70, 462, -10, 540);
    gfx.fillTriangle(-60, 545, 20, 476, 100, 545);
    gfx.fillTriangle(40, 548, 110, 500, 170, 548);
    gfx.fillStyle(0x6a7a6a, 0.22);
    gfx.fillEllipse(40, 500, 210, 20);
    gfx.fillStyle(0x8a2a22, 0.9);
    gfx.fillRect(122, 526, 16, 20);
    gfx.lineStyle(2, 0x5a4a32, 1);
    gfx.lineBetween(-150, 410, -130, 432);
    gfx.lineBetween(150, 410, 130, 432);

    // 匾额
    gfx.fillStyle(0x2a1a10, 1);
    gfx.fillRect(-106, 174, 212, 76);
    gfx.fillStyle(0x3a2a1a, 1);
    gfx.fillRect(-100, 180, 200, 66);
    gfx.lineStyle(3, 0xd9b45a, 1);
    gfx.strokeRect(-100, 180, 200, 66);
    gfx.fillStyle(0x8a2a22, 1);
    gfx.fillRect(62, 206, 22, 22);

    // 窗框
    gfx.lineStyle(4, 0x2a1a10, 1);
    gfx.strokeRect(-155, 275, 90, 110);
    gfx.strokeRect(65, 275, 90, 110);

    // 靠墙的置物架与酒坛
    for (const sx of [-330]) {
      gfx.fillStyle(0x3a2a1a, 1);
      gfx.fillRect(sx, 520, 130, 8);
      gfx.fillRect(sx, 640, 130, 8);
      gfx.fillRect(sx, 760, 130, 8);
      gfx.fillStyle(0x2a1d12, 1);
      gfx.fillRect(sx + 4, 520, 6, 250);
      gfx.fillRect(sx + 120, 520, 6, 250);
      const jars = [
        { dx: 30, color: 0x5a7a6a },
        { dx: 62, color: 0xb8742a },
        { dx: 92, color: 0xd8c8a8 },
      ];
      for (const [row, y] of [474, 594, 714].entries()) {
        jars.forEach((jar, j) => {
          const jx = sx + jar.dx + (row % 2) * 6;
          gfx.fillStyle(jar.color, 1);
          gfx.fillEllipse(jx, y + 28, 22, 28);
          gfx.fillStyle(0x2a1a10, 0.8);
          gfx.fillRect(jx - 5, y + 16, 10, 5);
          if (row === 1 && j === 0) {
            gfx.fillStyle(0xd9b45a, 0.8);
            gfx.fillRect(jx - 4, y + 34, 8, 12);
          }
        });
      }
    }

    // 右墙小挂轴，填住窗与门之间的空墙
    gfx.fillStyle(0x2a1a10, 1);
    gfx.fillRect(168, 420, 38, 184);
    gfx.fillStyle(0xe8dcc0, 0.95);
    gfx.fillRect(172, 426, 30, 172);
    gfx.lineStyle(1.5, 0x3a3a32, 0.8);
    for (let i = 0; i < 7; i++) {
      const y = 446 + i * 20;
      gfx.lineBetween(180, y, 194, y);
    }
    gfx.fillStyle(0x8a2a22, 0.9);
    gfx.fillRect(180, 584, 12, 12);

    // 后柜：酒坛、茶壶、算盘，填住中间的空墙
    gfx.fillStyle(0x33230f, 1);
    gfx.fillRect(-200, 830, 400, 14);
    gfx.fillStyle(0x3a2818, 1);
    gfx.fillRect(-200, 844, 400, 96);
    gfx.lineStyle(1.5, 0x8a6a3a, 0.55);
    gfx.strokeRect(-200, 830, 400, 110);
    gfx.lineStyle(2, 0x2a1a10, 0.5);
    for (let x = -150; x < 200; x += 90) gfx.lineBetween(x, 850, x, 938);
    for (const [jx, color] of [
      [-170, 0x5a7a6a],
      [-120, 0xb8742a],
      [-70, 0xd8c8a8],
      [120, 0x6a7a9a],
      [170, 0xb8742a],
    ] as const) {
      gfx.fillStyle(color, 1);
      gfx.fillEllipse(jx, 818, 22, 26);
      gfx.fillStyle(0x2a1a10, 0.85);
      gfx.fillRect(jx - 5, 806, 10, 5);
    }
    gfx.fillStyle(0x6a4a2a, 1);
    gfx.fillCircle(-20, 814, 9);
    gfx.fillRect(-34, 814, 14, 4);
    gfx.lineStyle(2, 0x9a7a4a, 0.8);
    gfx.lineBetween(-4, 812, 8, 802);

    // 悬着的木牌菜单
    for (const [bx, by] of [
      [-110, 608],
      [0, 620],
      [110, 608],
    ] as const) {
      gfx.lineStyle(1.5, 0x8a6a4a, 0.8);
      gfx.lineBetween(bx, 590, bx - 22, by);
      gfx.lineBetween(bx, 590, bx + 22, by);
      gfx.fillStyle(0x2a1a10, 1);
      gfx.fillRect(bx - 30, by, 60, 78);
      gfx.fillStyle(0x3a2818, 1);
      gfx.fillRect(bx - 26, by + 4, 52, 70);
      gfx.lineStyle(2, 0xd9b45a, 0.55);
      gfx.strokeRect(bx - 26, by + 4, 52, 70);
      gfx.lineStyle(2, 0xe8dcc0, 0.45);
      for (let i = 0; i < 3; i++) gfx.lineBetween(bx - 12 + i * 12, by + 20, bx - 12 + i * 12, by + 58);
    }

    // 门侧木柱，收住室内外的交界
    gfx.fillStyle(0x2a1a10, 1);
    gfx.fillRect(344, 0, 24, FLOOR_Y);

    // 地面
    gfx.fillStyle(0x8a6a4a, 1);
    gfx.fillRect(-360, FLOOR_Y, 790, 1400 - FLOOR_Y);
    gfx.lineStyle(3, 0x5a4028, 1);
    gfx.lineBetween(-360, FLOOR_Y, 430, FLOOR_Y);
    gfx.lineStyle(2, 0x75583c, 0.6);
    for (let y = FLOOR_Y + 34; y < 1400; y += 46) gfx.lineBetween(-360, y, 430, y);
    for (let x = -320; x < 430; x += 96) gfx.lineBetween(x, FLOOR_Y, x, 1400);

    // 左侧厨房：石灶、铁锅、火与挂着的炊具
    gfx.fillStyle(0xff9a3a, 0.14);
    gfx.fillCircle(-272, 850, 84);
    gfx.fillStyle(0x7a7268, 1);
    gfx.fillRect(-345, 880, 150, 130);
    gfx.fillStyle(0x5f5850, 1);
    gfx.fillRect(-335, 860, 130, 30);
    gfx.fillStyle(0x8a8276, 0.7);
    for (let i = 0; i < 5; i++) gfx.fillRect(-335 + i * 28, 1000, 24, 6);
    gfx.fillStyle(0x4a4a4a, 1);
    gfx.fillRect(-305, 840, 70, 24);
    gfx.fillStyle(0xff7a3a, 0.95);
    gfx.fillCircle(-290, 852, 9);
    gfx.fillCircle(-255, 852, 9);
    if (this.stoveLevel >= 1) {
      gfx.fillStyle(0xffc060, 0.9);
      gfx.fillCircle(-280, 846, 6);
      gfx.fillCircle(-265, 850, 5);
    }
    if (this.stoveLevel >= 2) {
      gfx.fillStyle(0xffe0a0, 0.9);
      gfx.fillCircle(-300, 848, 4);
    }
    gfx.fillStyle(0x3a2a1a, 1);
    gfx.fillRect(-350, 700, 4, 26);
    gfx.lineStyle(3, 0x8a8276, 1);
    gfx.lineBetween(-350, 700, -312, 700);
    gfx.lineBetween(-312, 700, -312, 726);
    gfx.fillStyle(0x6a6a6a, 1);
    gfx.fillCircle(-312, 730, 6);

    // 右侧门口：门框、红帘与暖光
    gfx.fillStyle(0x3a2418, 1);
    gfx.fillRect(DOOR_X - 102, 782, 204, 38);
    gfx.fillStyle(0x2a1a10, 1);
    gfx.fillRect(DOOR_X - 88, 820, 176, FLOOR_Y - 820);
    gfx.fillStyle(0x6a4a2a, 1);
    gfx.fillRect(DOOR_X - 8, 820, 16, FLOOR_Y - 820);
    for (let i = 0; i < 4; i++) {
      gfx.fillStyle(i % 2 ? 0x8b2f22 : 0xa03a2a, 0.95);
      gfx.fillRect(DOOR_X - 80 + i * 40, 820, 34, 44);
    }
    gfx.fillStyle(0xffc86a, 0.08);
    gfx.beginPath();
    gfx.moveTo(DOOR_X - 70, FLOOR_Y);
    gfx.lineTo(DOOR_X + 70, FLOOR_Y);
    gfx.lineTo(300, 1220);
    gfx.lineTo(90, 1220);
    gfx.closePath();
    gfx.fillPath();
    // 门外地面延伸
    gfx.fillStyle(0x6a5a44, 1);
    gfx.fillRect(DOOR_X + 80, FLOOR_Y, 360 - DOOR_X - 80, 1400 - FLOOR_Y);

    // 门外空地：一路延伸到队尾，镜头可以拉过去看
    gfx.fillStyle(0x7a6a4a, 1);
    gfx.fillRect(360, FLOOR_Y, 1260, 1400 - FLOOR_Y);
    gfx.lineStyle(3, 0x5a4028, 1);
    gfx.lineBetween(360, FLOOR_Y, 1620, FLOOR_Y);
    // 空地装饰：树和石头
    gfx.fillStyle(0x4a3420, 1);
    gfx.fillRect(560, FLOOR_Y - 80, 14, 80);
    gfx.fillStyle(0x3a6a3a, 1);
    gfx.fillCircle(567, FLOOR_Y - 100, 46);
    gfx.fillStyle(0x2f5a2f, 1);
    gfx.fillCircle(567, FLOOR_Y - 118, 30);
    gfx.fillStyle(0x8a8a8a, 1);
    gfx.fillCircle(740, FLOOR_Y - 12, 20);
    gfx.fillCircle(800, FLOOR_Y - 8, 13);
    // 远处的树与石，让长队不落在空白里
    gfx.fillStyle(0x4a3420, 1);
    gfx.fillRect(1010, FLOOR_Y - 66, 12, 66);
    gfx.fillStyle(0x356335, 1);
    gfx.fillCircle(1016, FLOOR_Y - 86, 38);
    gfx.fillStyle(0x2f5a2f, 1);
    gfx.fillCircle(1016, FLOOR_Y - 102, 25);
    gfx.fillStyle(0x8a8a8a, 1);
    gfx.fillCircle(1120, FLOOR_Y - 12, 17);
    gfx.fillCircle(1180, FLOOR_Y - 7, 11);
    gfx.fillStyle(0x4a3420, 1);
    gfx.fillRect(1424, FLOOR_Y - 56, 10, 56);
    gfx.fillStyle(0x356335, 1);
    gfx.fillCircle(1429, FLOOR_Y - 72, 32);
    gfx.fillStyle(0x8a8a8a, 1);
    gfx.fillCircle(1520, FLOOR_Y - 9, 14);
    gfx.fillCircle(1570, FLOOR_Y - 5, 9);
    // 门右侧竹丛：挡住门外右侧的硬天空
    for (const [bx, top] of [
      [404, 720],
      [426, 690],
      [450, 750],
    ] as const) {
      gfx.fillStyle(0x2f4a2f, 1);
      gfx.fillRect(bx, top, 5, FLOOR_Y - top);
      gfx.fillStyle(0x356335, 0.95);
      gfx.fillCircle(bx + 4, top + 10, 16);
      gfx.fillCircle(bx - 8, top + 46, 13);
      gfx.fillCircle(bx + 16, top + 74, 11);
    }

    // 门外长队旁的木栅栏、石灯笼与远处屋脊
    for (let x = 660; x <= 1600; x += 84) {
      gfx.fillStyle(0x4a3420, 1);
      gfx.fillRect(x, FLOOR_Y - 54, 6, 54);
    }
    gfx.fillRect(650, FLOOR_Y - 46, 960, 5);
    gfx.fillRect(650, FLOOR_Y - 22, 960, 5);
    for (const lx of [700, 1150, 1500]) {
      gfx.fillStyle(0x6a665e, 1);
      gfx.fillRect(lx - 12, FLOOR_Y - 18, 24, 18);
      gfx.fillRect(lx - 6, FLOOR_Y - 58, 12, 42);
      gfx.fillStyle(0xffd98a, 0.9);
      gfx.fillRect(lx - 9, FLOOR_Y - 70, 18, 14);
      gfx.fillStyle(0x55524c, 1);
      gfx.fillTriangle(lx - 16, FLOOR_Y - 70, lx + 16, FLOOR_Y - 70, lx, FLOOR_Y - 84);
    }
    for (const [hx, hw] of [
      [820, 120],
      [1090, 90],
      [1380, 130],
    ] as const) {
      gfx.fillStyle(0x1a2430, 0.9);
      gfx.fillRect(hx - hw / 2, FLOOR_Y - 96, hw, 56);
      gfx.fillTriangle(hx - hw / 2 - 16, FLOOR_Y - 96, hx + hw / 2 + 16, FLOOR_Y - 96, hx, FLOOR_Y - 132);
      gfx.fillStyle(0xffd98a, 0.55);
      gfx.fillRect(hx - 6, FLOOR_Y - 82, 8, 10);
    }
    // 低处雾带：把远处山影和近处棕金内景揉在一起
    gfx.fillStyle(0xc8d8e8, 0.06);
    for (const [mx, my, mw] of [
      [520, 930, 300],
      [820, 916, 340],
      [1180, 934, 300],
      [1450, 922, 260],
    ] as const) {
      gfx.fillEllipse(mx, my, mw, 42);
    }

    // 排队区标记
    gfx.lineStyle(2, 0x8a7a5a, 1);
    gfx.lineBetween(380, FLOOR_Y - 2, 1200, FLOOR_Y - 2);

    // 等级陈设：升级后回到店里能看见变化
    if (this.level >= 2) {
      gfx.fillStyle(0x8a2a22, 0.95);
      gfx.fillRect(160, 300, 50, 112);
      gfx.fillStyle(0xd9b45a, 0.9);
      gfx.fillRect(160, 300, 50, 6);
      gfx.fillRect(160, 406, 50, 6);
      gfx.lineStyle(3, 0xe8b06a, 0.75);
      gfx.lineBetween(185, 320, 185, 386);
      gfx.lineBetween(175, 334, 195, 334);
      gfx.lineBetween(175, 356, 195, 356);
    }
    if (this.level >= 3) {
      gfx.lineStyle(2, 0xd9b45a, 0.45);
      gfx.lineBetween(-200, 760, 200, 760);
      gfx.lineBetween(-200, 762, 200, 762);
    }
    if (this.level >= 4) {
      gfx.fillStyle(0x6a4a2a, 1);
      gfx.fillRect(-188, 806, 26, 24);
      gfx.fillStyle(0x3a6a3a, 1);
      gfx.fillCircle(-175, 790, 16);
      gfx.fillCircle(-162, 778, 12);
    }
    if (this.level >= 2) {
      // 正中一盏大红灯笼：Lv2 回店最直观的变化
      gfx.fillStyle(0xff7a3a, 0.07);
      gfx.fillCircle(0, 332, 76);
      gfx.fillStyle(0xff8a4a, 0.11);
      gfx.fillCircle(0, 332, 56);
      gfx.fillStyle(0xffb060, 0.16);
      gfx.fillCircle(0, 332, 38);
      gfx.fillStyle(0x6a4a2a, 1);
      gfx.fillRect(-1, 266, 2, 38);
      gfx.fillStyle(0x2a1a10, 1);
      gfx.fillRect(-16, 302, 32, 6);
      gfx.fillStyle(0xff5c3c, 1);
      gfx.fillEllipse(0, 334, 36, 48);
      gfx.fillStyle(0xd9b45a, 0.95);
      gfx.fillRect(-16, 358, 32, 5);
      gfx.fillStyle(0xffd98a, 0.9);
      gfx.fillRect(-1, 366, 2, 16);
      gfx.fillCircle(0, 384, 3);
    }
    if (this.level >= 8) {
      gfx.fillStyle(0x6a2a22, 0.5);
      gfx.fillRoundedRect(-250, 1000, 470, 34, 8);
      gfx.lineStyle(2, 0xd9b45a, 0.45);
      gfx.strokeRoundedRect(-250, 1000, 470, 34, 8);
    }
  }

  /** 夜空星子：只在打烊夜景与深夜里出现，缓慢明灭。 */
  buildStars(this: TavernScene) {
    for (let i = 0; i < 46; i++) {
      const star = this.add
        .circle(
          Phaser.Math.Between(0, SCREEN_W),
          Phaser.Math.Between(0, 980),
          Phaser.Math.FloatBetween(0.7, 1.8),
          0xffffff,
          Phaser.Math.FloatBetween(0.2, 0.7),
        )
        .setScrollFactor(0)
        .setDepth(-19);
      this.stars.push(star);
      this.tweens.add({
        targets: star,
        alpha: 0.1,
        duration: Phaser.Math.Between(1400, 3200),
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(0, 2200),
        ease: "Sine.easeInOut",
      });
    }
  }

  buildWindows(this: TavernScene) {
    const positions = [
      { x: -110, y: 330 },
      { x: 110, y: 330 },
    ];
    for (const p of positions) {
      const w = this.add.rectangle(p.x, p.y, 90, 110, 0x74bdf7).setDepth(1).setStrokeStyle(4, 0x4a3324);
      this.windowViews.push(w);
    }
  }

  /** 柜台上打盹的小猫：给静态场景一个会动的小生命。 */
  createCat(this: TavernScene, x: number, y: number) {
    const cat = this.add.container(x, y).setDepth(5);
    cat.add(this.add.ellipse(0, 0, 28, 14, 0x3a3a44));
    cat.add(this.add.circle(10, -8, 8, 0x3a3a44));
    cat.add(this.add.triangle(6, -15, -3, 0, 3, 0, 0, -5, 0x3a3a44));
    cat.add(this.add.triangle(14, -15, -3, 0, 3, 0, 0, -5, 0x3a3a44));
    cat.add(this.add.circle(8, -9, 1, 0xffd98a));
    cat.add(this.add.circle(12, -9, 1, 0xffd98a));
    const tail = this.add.rectangle(16, 2, 3, 15, 0x3a3a44).setOrigin(0.5, 1).setAngle(-28);
    cat.add(tail);
    this.tweens.add({
      targets: tail,
      angle: -6,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  /** 暖光光斑：灯笼、灶火、门口的光落在地面和墙上。 */
  addGlow(this: TavernScene, x: number, y: number, tint: number, scale: number, alpha: number, depth = 4) {
    this.add
      .image(x, y, "soft-glow")
      .setTint(tint)
      .setAlpha(alpha)
      .setScale(scale)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(depth);
  }

  /** 门前灯笼：暖光、灯身、流苏，轻微摆动。 */
  createSwayLantern(this: TavernScene, x: number, y: number) {
    const lantern = this.add.container(x, y).setDepth(3);
    lantern.add(this.add.rectangle(0, -28, 2, 24, 0x2a1a10));
    const glow = this.add.circle(0, 0, 34, 0xff7a3a, 0.12);
    const body = this.add.ellipse(0, 0, 24, 34, 0xff5c3c);
    lantern.add(glow);
    lantern.add(body);
    lantern.add(this.add.rectangle(0, -18, 15, 4, 0x2a1a10));
    lantern.add(this.add.rectangle(0, 18, 15, 4, 0x2a1a10));
    lantern.add(this.add.rectangle(0, 26, 2, 10, 0xd9b45a));
    lantern.add(this.add.circle(0, 32, 2.5, 0xd9b45a));
    this.tweens.add({
      targets: lantern,
      angle: Phaser.Math.Between(3, 5) * (Math.random() < 0.5 ? -1 : 1),
      duration: Phaser.Math.Between(2400, 3400),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      delay: Phaser.Math.Between(0, 800),
    });
    // 烛火轻闪
    this.tweens.add({
      targets: body,
      alpha: { from: 0.82, to: 1 },
      duration: Phaser.Math.Between(900, 1600),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.08, to: 0.16 },
      duration: Phaser.Math.Between(1100, 1900),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  /** 窗棂盖在会随天色变色的窗玻璃上，避免白天只剩一块刺眼的蓝方块。 */
  buildWindowFrames(this: TavernScene) {
    const g = this.add.graphics().setDepth(2);
    for (const wx of [-155, 65]) {
      g.fillStyle(0xffcf7a, 0.12);
      g.fillRect(wx, 275, 90, 110);
      // 窗中远山、云与一点星/灯，别只留一块平色玻璃
      g.fillStyle(0x2a4a6a, 0.35);
      g.fillTriangle(wx, 380, wx + 26, 338, wx + 52, 380);
      g.fillTriangle(wx + 30, 382, wx + 62, 348, wx + 90, 382);
      g.fillStyle(0xffffff, 0.13);
      g.fillEllipse(wx + 46, 306, 38, 8);
      g.fillEllipse(wx + 24, 318, 26, 6);
      g.fillStyle(0xffe6a8, 0.35);
      g.fillCircle(wx + 72, 292, 1.6);
      g.fillStyle(0xffcf7a, 0.2);
      g.fillCircle(wx + 20, 296, 1.2);
      g.lineStyle(5, 0x2a1a10, 1);
      g.strokeRect(wx, 275, 90, 110);
      g.lineStyle(2, 0x2a1a10, 0.85);
      g.lineBetween(wx + 30, 275, wx + 30, 385);
      g.lineBetween(wx + 60, 275, wx + 60, 385);
      g.lineBetween(wx, 312, wx + 90, 312);
      g.lineBetween(wx, 348, wx + 90, 348);
      g.fillStyle(0x2a1a10, 1);
      g.fillRect(wx - 7, 383, 104, 7);
    }
  }

  /** 窗光落在地上：两束很淡的暖光，给室内一点纵深和呼吸。 */
  buildWindowLight(this: TavernScene) {
    const beams = this.add.graphics().setDepth(2.6).setBlendMode(Phaser.BlendModes.ADD);
    beams.fillStyle(0xffd9a0, 0.1);
    beams.beginPath();
    beams.moveTo(-155, 385);
    beams.lineTo(-65, 385);
    beams.lineTo(40, FLOOR_Y);
    beams.lineTo(-150, FLOOR_Y);
    beams.closePath();
    beams.fillPath();
    beams.beginPath();
    beams.moveTo(65, 385);
    beams.lineTo(155, 385);
    beams.lineTo(260, FLOOR_Y);
    beams.lineTo(70, FLOOR_Y);
    beams.closePath();
    beams.fillPath();
    this.tweens.add({
      targets: beams,
      alpha: { from: 0.75, to: 1 },
      duration: 4200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  /** 程序合成酒楼：屋檐、墙体、门窗、灯笼、招牌。夜晚时窗内透出灯火。 */
  drawTavern(this: TavernScene, gfx: Phaser.GameObjects.Graphics, lit: boolean) {
    gfx.clear();
    const half = TAVERN_W / 2;
    const baseY = 1120;

    // 远景山影与地面：让打烊视角不再悬在空里
    gfx.fillStyle(0x2a3448, 0.75);
    gfx.fillTriangle(-780, baseY, -610, 790, -430, baseY);
    gfx.fillTriangle(-560, baseY, -410, 900, -250, baseY);
    gfx.fillStyle(0x2f3a2a, 1);
    gfx.fillRect(-960, baseY, 1020, 1280 - baseY);
    // 门前石径
    gfx.fillStyle(0x4a4438, 1);
    gfx.fillPoints(
      [
        new Phaser.Geom.Point(-110, baseY),
        new Phaser.Geom.Point(40, baseY),
        new Phaser.Geom.Point(-240, 1280),
        new Phaser.Geom.Point(-760, 1280),
      ],
      true,
    );
    gfx.fillStyle(0x5a5448, 1);
    for (const [x, y, r] of [
      [-560, 1200, 12],
      [-390, 1240, 9],
      [-220, 1180, 7],
      [-650, 1170, 8],
      [-470, 1150, 5],
    ]) {
      gfx.fillCircle(x, y, r);
    }
    // 竹丛
    gfx.fillStyle(0x2f5a2f, 1);
    gfx.fillRect(-282, 880, 8, 240);
    gfx.fillRect(-264, 930, 7, 190);
    gfx.fillRect(-300, 970, 6, 150);
    gfx.fillStyle(0x3a6a3a, 1);
    gfx.fillCircle(-278, 880, 24);
    gfx.fillCircle(-257, 930, 19);
    gfx.fillCircle(-294, 972, 15);
    // 低处薄雾
    gfx.fillStyle(0xa8c0d8, 0.08);
    gfx.fillEllipse(-420, 1112, 420, 40);
    gfx.fillEllipse(-120, 1100, 300, 30);

    // 墙体与石基
    gfx.fillStyle(0x4a3627, 1);
    gfx.fillRect(-half - 8, 520, TAVERN_W + 16, baseY - 520);
    gfx.fillStyle(0x6b4a32, 1);
    gfx.fillRect(-half + 10, 538, TAVERN_W - 20, baseY - 556);
    gfx.fillStyle(0x3f3c36, 1);
    gfx.fillRect(-half - 12, baseY - 40, TAVERN_W + 24, 40);
    // 木柱与横梁
    gfx.fillStyle(0x3a2618, 1);
    for (const x of [-half + 10, -half / 2, half / 2, half - 10]) gfx.fillRect(x - 6, 520, 12, baseY - 548);
    gfx.fillRect(-half, 812, TAVERN_W, 14);
    gfx.fillRect(-half, 552, TAVERN_W, 10);

    // 屋檐：翘角、瓦线、脊饰
    gfx.fillStyle(0x2a0f0c, 1);
    gfx.fillTriangle(-half - 96, 548, half + 96, 548, 0, 362);
    gfx.fillStyle(0x7a2a1e, 1);
    gfx.fillTriangle(-half - 64, 540, half + 64, 540, 0, 386);
    gfx.fillStyle(0x5c1d16, 1);
    gfx.fillTriangle(-half - 96, 548, -half - 20, 548, -half - 126, 500);
    gfx.fillTriangle(half + 96, 548, half + 20, 548, half + 126, 500);
    gfx.lineStyle(2, 0x2a0f0c, 0.55);
    for (let i = -4; i <= 4; i++) gfx.lineBetween(0, 388, i * 44, 540);
    gfx.lineStyle(3, 0xd9b45a, 0.7);
    gfx.lineBetween(-half - 96, 548, half + 96, 548);
    gfx.fillStyle(0xd9b45a, 1);
    gfx.fillCircle(0, 386, 5);

    // 招牌木底与金边
    gfx.fillStyle(0x2a1a10, 1);
    gfx.fillRect(-86, 556, 172, 54);
    gfx.lineStyle(3, 0xd9b45a, 1);
    gfx.strokeRect(-86, 556, 172, 54);

    // 窗棂：营业时透出暖灯
    for (const wx of [-155, 85]) {
      gfx.fillStyle(lit ? 0xffcf7a : 0x2a2520, 1);
      gfx.fillRect(wx, 660, 70, 80);
      gfx.lineStyle(4, 0x3a2418, 1);
      gfx.strokeRect(wx, 660, 70, 80);
      gfx.lineStyle(2, 0x3a2418, 0.8);
      gfx.lineBetween(wx + 23, 660, wx + 23, 740);
      gfx.lineBetween(wx + 47, 660, wx + 47, 740);
      gfx.lineBetween(wx, 687, wx + 70, 687);
      gfx.lineBetween(wx, 713, wx + 70, 713);
    }

    // 门框、门帘与暖光
    gfx.fillStyle(0x33200f, 1);
    gfx.fillRect(-64, 890, 128, 230);
    gfx.fillStyle(lit ? 0xffc86a : 0x2a211a, 1);
    gfx.fillRect(-55, 900, 110, 220);
    gfx.fillStyle(0x8b2f22, 0.95);
    for (const dx of [-50, -25, 0, 25, 50]) gfx.fillRect(dx - 10, 900, 20, 34);
    gfx.fillStyle(0x2a1a10, 1);
    gfx.fillRect(-2, 934, 4, 186);
    if (lit) {
      gfx.fillStyle(0xffb85a, 0.12);
      gfx.beginPath();
      gfx.moveTo(-60, baseY);
      gfx.lineTo(60, baseY);
      gfx.lineTo(180, 1240);
      gfx.lineTo(-180, 1240);
      gfx.closePath();
      gfx.fillPath();
    }

    // 灯笼暖光（灯身是单独的摆动对象）
    gfx.fillStyle(0xff7a3a, lit ? 0.16 : 0.05);
    gfx.fillCircle(-165, 610, 42);
    gfx.fillCircle(165, 610, 42);

    // 台阶与苔痕
    gfx.fillStyle(0x6a665e, 1);
    gfx.fillRect(-96, baseY, 192, 22);
    gfx.fillStyle(0x4f4b44, 1);
    gfx.fillRect(-108, baseY + 22, 216, 12);
    gfx.fillStyle(0x2f4a2f, 0.7);
    gfx.fillEllipse(-130, baseY + 6, 36, 8);
    gfx.fillEllipse(140, baseY + 10, 28, 6);

    // 门面招幡：升级后多一面旗
    if (this.signLevel >= 1) {
      gfx.fillStyle(0x8b2f22, 0.95);
      gfx.fillRect(160, 610, 36, 260);
      gfx.fillStyle(0xd9b45a, 0.9);
      gfx.fillRect(160, 610, 36, 8);
      gfx.fillRect(160, 860, 36, 8);
      gfx.lineStyle(3, 0xe8b06a, 0.75);
      gfx.lineBetween(178, 640, 178, 830);
      gfx.lineBetween(168, 664, 188, 664);
      gfx.lineBetween(168, 694, 188, 694);
    }
    if (this.signLevel >= 2) {
      gfx.fillStyle(0x7a2a1e, 0.95);
      gfx.fillRect(-198, 650, 30, 210);
      gfx.fillStyle(0xd9b45a, 0.85);
      gfx.fillRect(-198, 650, 30, 7);
      gfx.fillRect(-198, 852, 30, 7);
    }
  }
}
