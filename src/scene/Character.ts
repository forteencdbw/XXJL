import Phaser from "phaser";
import { getPixelTexture } from "../pixel";
import type { PixelStyle } from "../pixel";

/** 二头身 Q 版占位角色：大圆头 + 矩形身体 + 发型。 */
export type CharacterLook =
  | "player"
  | "server"
  | "cook"
  | "hawker"
  | "sword"
  | "alchemist"
  | "demon"
  | "mortal"
  | "elder"
  | "demonlord"
  | "rogue";

/** 小人物：宽袖道袍、发髻、眼睛会眨，按身份带剑/葫芦/酒旗/托盘等小道具。 */
export class Character extends Phaser.GameObjects.Container {
  private visual: Phaser.GameObjects.Container;
  private art: Phaser.GameObjects.Graphics;
  private eyeL: Phaser.GameObjects.Arc;
  private eyeR: Phaser.GameObjects.Arc;
  private eyeWhiteL: Phaser.GameObjects.Arc;
  private eyeWhiteR: Phaser.GameObjects.Arc;
  private glintL: Phaser.GameObjects.Arc;
  private glintR: Phaser.GameObjects.Arc;
  private aura?: Phaser.GameObjects.Arc;
  private patienceBg?: Phaser.GameObjects.Rectangle;
  private patienceFill?: Phaser.GameObjects.Rectangle;
  private idleTween?: Phaser.Tweens.Tween;
  private walkTween?: Phaser.Tweens.Tween;
  private bubble?: Phaser.GameObjects.Text;
  private bubbleTail?: Phaser.GameObjects.Triangle;
  private dining = false;
  private seated = false;
  private mood: "idle" | "waiting" | "dining" | "cold" = "idle";
  private static readonly ART_SCALE = 1.22;
  private pixelImage?: Phaser.GameObjects.Image;
  private pixelEnabled = true;
  private pixelBlink = false;
  private bodyColor: number;
  private hairColor: number;
  private longHair: boolean;
  private look: CharacterLook;
  /** 特写字幕用：食客姓名或掌柜/伙计的岗位。 */
  displayName?: string;
  /** 进场动画未完成前不能招待，避免御剑/乘云途中被拉去入座。 */
  arrived = true;
  /** 最近一句台词，特写时并进字幕，避免气泡与桌卡叠字。 */
  lastLine?: string;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    bodyColor: number,
    hairColor: number,
    longHair = false,
    look: CharacterLook = "rogue",
  ) {
    super(scene, x, y);
    this.bodyColor = bodyColor;
    this.hairColor = hairColor;
    this.longHair = longHair;
    this.look = look;
    // 很淡的暖背光，把人物从深色墙面/柜台上托起来
    this.add(
      scene.add
        .image(0, -20, "soft-glow")
        .setTint(0xffb060)
        .setAlpha(0.07)
        .setScale(0.55)
        .setBlendMode(Phaser.BlendModes.ADD),
    );
    this.visual = scene.add.container(0, 0);
    this.visual.setScale(Character.ART_SCALE);
    this.art = scene.add.graphics();
    this.visual.add(this.art);
    this.eyeWhiteL = scene.add.circle(-4, -19, 3, 0xfff6e8).setDepth(1);
    this.eyeWhiteR = scene.add.circle(4, -19, 3, 0xfff6e8).setDepth(1);
    const pupil =
      look === "demonlord"
        ? 0x8a1a1a
        : look === "elder"
          ? 0x3a4a6a
          : look === "demon"
            ? 0x5a2a1a
            : look === "sword"
              ? 0x1a1a2a
              : 0x2a1c16;
    this.eyeL = scene.add.circle(-4, -19, 1.4, pupil).setDepth(2);
    this.eyeR = scene.add.circle(4, -19, 1.4, pupil).setDepth(2);
    const eyeRadius =
      look === "elder" ? 2.5 : look === "mortal" ? 3.2 : look === "sword" ? 2.7 : look === "demon" ? 2.9 : 3;
    const pupilRadius =
      look === "demon" || look === "demonlord" ? 1.7 : look === "elder" ? 1.1 : 1.4;
    this.eyeWhiteL.setRadius(eyeRadius);
    this.eyeWhiteR.setRadius(eyeRadius);
    this.eyeL.setRadius(pupilRadius);
    this.eyeR.setRadius(pupilRadius);
    this.glintL = scene.add.circle(-4.8, -20.2, 0.8, 0xffffff, 0.92).setDepth(3);
    this.glintR = scene.add.circle(3.2, -20.2, 0.8, 0xffffff, 0.92).setDepth(3);
    this.visual.add([this.eyeWhiteL, this.eyeWhiteR, this.eyeL, this.eyeR, this.glintL, this.glintR]);
    this.pixelImage = scene.add
      .image(0, 44, getPixelTexture(scene, this.pixelStyle()))
      .setOrigin(0.5, 1)
      .setScale(1.35);
    this.visual.add(this.pixelImage);
    this.art.setVisible(false);
    [this.eyeWhiteL, this.eyeWhiteR, this.eyeL, this.eyeR, this.glintL, this.glintR].forEach((e) =>
      e.setVisible(false),
    );
    this.add(this.visual);
    this.draw();
    this.setDepth(20);
    scene.add.existing(this);
    scene.tweens.add({
      targets: [this.eyeWhiteL, this.eyeWhiteR, this.eyeL, this.eyeR, this.glintL, this.glintR],
      scaleY: 0.12,
      duration: 70,
      yoyo: true,
      repeat: -1,
      repeatDelay: Phaser.Math.Between(2200, 5200),
      delay: Phaser.Math.Between(600, 4000),
    });
    this.startIdle();
    const blink = () => {
      if (!this.active || !this.pixelEnabled) return;
      this.pixelBlink = true;
      this.drawPixel();
      this.scene.time.delayedCall(110, () => {
        if (!this.active) return;
        this.pixelBlink = false;
        this.drawPixel();
        this.scene.time.delayedCall(Phaser.Math.Between(2400, 5200), blink);
      });
    };
    this.scene.time.delayedCall(Phaser.Math.Between(1200, 3000), blink);
    // 修士的细碎灵光：给剑修/丹修/长老/妖修一点“飘”的气
    const ethereal: Record<string, number> = {
      sword: 0xb8d8f0,
      elder: 0xffe6a8,
      alchemist: 0xa8e8c0,
      demon: 0xff8a6a,
      demonlord: 0xff5a5a,
    };
    if (ethereal[look]) {
      this.scene.time.addEvent({
        delay: 1500,
        loop: true,
        callback: () => {
          if (!this.active || !this.pixelEnabled) return;
          for (let i = 0; i < 2; i++) {
            const dot = this.scene.add
              .rectangle(
                this.x + Phaser.Math.Between(-26, 26),
                this.y - Phaser.Math.Between(10, 58),
                2,
                2,
                ethereal[look],
                0.7,
              )
              .setDepth(this.depth + 0.6);
            this.scene.tweens.add({
              targets: dot,
              y: dot.y - Phaser.Math.Between(14, 30),
              x: dot.x + Phaser.Math.Between(-8, 8),
              alpha: 0,
              duration: Phaser.Math.Between(900, 1500),
              onComplete: () => dot.destroy(),
            });
          }
        },
      });
    }
    // 点人物会回一句身份台词；用拖动阈值区分镜头拖拽
    this.setInteractive(new Phaser.Geom.Rectangle(-40, -70, 80, 118), Phaser.Geom.Rectangle.Contains);
    let downX = 0;
    let downY = 0;
    this.on("pointerdown", (p: Phaser.Input.Pointer) => {
      downX = p.x;
      downY = p.y;
    });
    this.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (Math.hypot(p.x - downX, p.y - downY) < 14) {
        this.say(this.talkLine());
        this.scene.events.emit("focus-character", this);
      }
    });
  }

  /** 被点到时说的闲话，按身份区分。 */
  private talkLine(): string {
    const lines: Record<CharacterLook, string[]> = {
      player: ["今日也要好好营生。", "灵台清明。", "客官稍候。"],
      server: ["客官里边请——", "小心台阶。", "茶还是温的。"],
      cook: ["火候正好。", "这锅气，成了。", "再添一把柴。"],
      hawker: ["灵膳楼开张，仙凡同席！", "今日有鲜货！"],
      sword: ["剑在人在。", "这碗鱼脍有剑意。"],
      alchemist: ["丹火未熄。", "这汤里可入药。"],
      demon: ["哼，凡人的手艺。", "再来三碗！"],
      mortal: ["真香！", "老板，结账。"],
      elder: ["此子有慧根。", "灵膳一道，胜坐三日。"],
      demonlord: ["本座只等一炷香。", "这方天地，太小。"],
      rogue: ["道友，请了。", "山高路远，先吃为敬。"],
    };
    const pool = lines[this.look];
    return pool[Phaser.Math.Between(0, pool.length - 1)];
  }

  private shade(color: number, factor: number): number {
    const c = Phaser.Display.Color.IntegerToColor(color);
    return Phaser.Display.Color.GetColor(
      Math.round(c.red * factor),
      Math.round(c.green * factor),
      Math.round(c.blue * factor),
    );
  }

  private pixelStyle(): PixelStyle {
    return {
      body: this.bodyColor,
      hair: this.hairColor,
      longHair: this.longHair,
      look: this.look,
      seated: this.seated,
      dining: this.dining,
      blink: this.pixelBlink,
    };
  }

  private drawPixel() {
    if (!this.pixelImage) return;
    this.pixelImage.setTexture(getPixelTexture(this.scene, this.pixelStyle()));
  }

  usePixelArt(enabled: boolean) {
    this.pixelEnabled = enabled;
    this.pixelImage?.setVisible(enabled);
    this.art.setVisible(!enabled);
    [this.eyeWhiteL, this.eyeWhiteR, this.eyeL, this.eyeR, this.glintL, this.glintR].forEach((e) =>
      e.setVisible(!enabled),
    );
    this.draw();
  }

  private draw() {
    if (this.pixelEnabled && this.pixelImage) {
      this.drawPixel();
      return;
    }
    const g = this.art;
    const body = this.bodyColor;
    const dark = this.shade(body, 0.72);
    const deep = this.shade(body, 0.5);
    const skin =
      this.look === "elder"
        ? 0xf2e8d8
        : this.look === "demon" || this.look === "demonlord"
          ? 0xe8c8a8
          : this.look === "mortal"
            ? 0xf0d0b0
            : 0xffe0bd;
    const headR =
      this.look === "mortal" ? 11.8 : this.look === "elder" ? 11.3 : this.look === "sword" ? 10.6 : 11;
    const faceW =
      this.look === "mortal" ? 1.04 : this.look === "sword" ? 0.94 : this.look === "demon" ? 0.97 : 1;
    const hair = this.hairColor;
    const trim =
      this.look === "demon" || this.look === "demonlord"
        ? 0x8a2a22
        : this.look === "elder"
          ? 0xd9b45a
          : 0xbfa06a;
    g.clear();

    // 影子与脚
    g.fillStyle(0x000000, 0.24);
    g.fillEllipse(0, 40, 38, 10);
    if (!this.dining && !this.seated) {
      g.fillStyle(0x211a16, 1);
      g.fillRect(-8, 30, 7, 10);
      g.fillRect(1, 30, 7, 10);
      g.fillStyle(0x14100d, 1);
      g.fillRect(-9, 38, 9, 4);
      g.fillRect(0, 38, 9, 4);
    }

    // 身份道具：画在袍子后面
    if (this.look === "sword" || this.look === "player") {
      g.lineStyle(3, 0xc8d4e0, 0.95);
      g.lineBetween(-15, 20, 14, -44);
      g.lineStyle(4, 0x7a4a2a, 1);
      g.lineBetween(8, -36, 16, -48);
      g.fillStyle(0xd9b45a, 1);
      g.fillCircle(10, -38, 3);
    } else if (this.look === "demon" || this.look === "demonlord") {
      g.lineStyle(5, deep, 1);
      g.beginPath();
      g.moveTo(-10, 20);
      g.lineTo(-20, 26);
      g.lineTo(-16, 38);
      g.strokePath();
    }

    // 长袍
    g.fillStyle(dark, 1);
    g.beginPath();
    g.moveTo(-12, -8);
    g.lineTo(12, -8);
    g.lineTo(18, 30);
    g.lineTo(-18, 30);
    g.closePath();
    g.fillPath();
    g.fillStyle(body, 1);
    g.beginPath();
    g.moveTo(-9, -8);
    g.lineTo(9, -8);
    g.lineTo(13, 28);
    g.lineTo(-13, 28);
    g.closePath();
    g.fillPath();
    // 受光面/暗面与下摆滚边，别让袍子是一块纯色
    g.fillStyle(0xffffff, 0.08);
    g.beginPath();
    g.moveTo(-9, -8);
    g.lineTo(-2, -8);
    g.lineTo(-6, 28);
    g.lineTo(-13, 28);
    g.closePath();
    g.fillPath();
    g.fillStyle(0x000000, 0.1);
    g.beginPath();
    g.moveTo(4, -8);
    g.lineTo(9, -8);
    g.lineTo(13, 28);
    g.lineTo(5, 28);
    g.closePath();
    g.fillPath();
    g.fillStyle(trim, 0.92);
    g.fillRect(-13, 25, 26, 3);
    if (this.dining || this.seated) {
      // 坐姿下摆：腿收起，衣摆摊在桌后
      g.fillStyle(deep, 1);
      g.fillEllipse(0, 31, 36, 12);
      g.fillStyle(body, 1);
      g.fillEllipse(0, 30, 29, 9);
      g.lineStyle(1.5, trim, 0.55);
      g.lineBetween(-13, 32, 13, 32);
    }
    // 衣褶
    g.lineStyle(1.5, deep, 0.7);
    g.lineBetween(-5, 2, -7, 26);
    g.lineBetween(6, 4, 8, 26);
    // 宽袖
    g.fillStyle(dark, 1);
    g.fillRoundedRect(-18, -4, 9, 22, 4);
    g.fillRoundedRect(9, -4, 9, 22, 4);
    g.fillStyle(trim, 0.8);
    g.fillRect(-18, 9, 9, 3);
    g.fillRect(9, 9, 9, 3);
    g.fillStyle(skin, 1);
    g.fillCircle(-14, 18, 3.2);
    g.fillCircle(14, 18, 3.2);
    g.lineStyle(1, 0xd8a07a, 0.65);
    g.lineBetween(-16, 18, -12, 18);
    g.lineBetween(12, 18, 16, 18);
    // 腰带
    g.fillStyle(0x2a211a, 1);
    g.fillRect(-13, 8, 26, 5);
    g.fillStyle(0xd9b45a, 0.9);
    g.fillRect(-3, 8, 6, 5);
    g.fillCircle(0, 10.5, 2.1);
    g.fillStyle(0x8a2a22, 0.9);
    g.fillRect(-1.5, 12, 3, 7);
    // 交领
    g.fillStyle(0xf1e4cc, 1);
    g.beginPath();
    g.moveTo(-7, -8);
    g.lineTo(7, -8);
    g.lineTo(0, 4);
    g.closePath();
    g.fillPath();
    g.fillStyle(skin, 1);
    g.fillTriangle(-4, -7, 4, -7, 0, 1);
    if (this.dining) {
      // 用膳时手搭在桌沿/碗边，别让双手垂在身侧
      g.fillStyle(0x000000, 0.1);
      g.fillEllipse(0, 28, 34, 8);
      g.lineStyle(3, dark, 1);
      g.lineBetween(-13, 19, 6, 12);
      g.lineBetween(13, 19, 14, 10);
      g.fillStyle(skin, 1);
      g.fillCircle(6, 12, 2.6);
      g.fillCircle(14, 10, 2.6);
      g.lineStyle(1, 0xd8a07a, 0.65);
      g.lineBetween(4, 12, 8, 12);
      g.lineBetween(12, 10, 16, 10);
      g.lineStyle(2, 0x6a4a2a, 1);
      g.lineBetween(11, 4, 18, -3);
    }

    // 长发/后发
    if (this.longHair) {
      g.fillStyle(hair, 1);
      g.fillRoundedRect(-11, -26, 22, 50, 8);
    }
    // 脖子与头
    g.fillStyle(skin, 1);
    g.fillRect(-3, -12, 6, 5);
    g.fillEllipse(0, -20, headR * 2 * faceW, headR * 2);
    // 脸侧阴影/颧骨高光，别是一块纯色圆
    g.fillStyle(0xc08060, 0.1);
    g.fillEllipse(headR * 0.45 * faceW, -18, headR * 0.8, headR * 1.5);
    g.fillStyle(0xffffff, 0.08);
    g.fillEllipse(-headR * 0.4 * faceW, -24, headR * 0.5, headR * 0.5);
    g.lineStyle(1.2, 0x4a3226, 0.35);
    g.strokeEllipse(0, -20, headR * 2 * faceW, headR * 2);
    // 上眼睑
    g.lineStyle(1, 0x4a2a20, 0.5);
    g.lineBetween(-6.5, -21.4, -1.5, -21.4);
    g.lineBetween(1.5, -21.4, 6.5, -21.4);
    // 后发与发髻：只盖住头顶，别把脸埋掉
    g.fillStyle(hair, 1);
    g.fillEllipse(0, -29, 24, 12);
    g.fillEllipse(-10, -20, 6, 18);
    g.fillEllipse(10, -20, 6, 18);
    g.fillCircle(0, -35, 5);
    if (this.look === "sword") {
      g.fillRect(-2, -44, 4, 12);
      g.fillStyle(0xd9b45a, 1);
      g.fillRect(-4, -33, 8, 3);
    } else if (this.look === "alchemist") {
      g.fillCircle(-9, -31, 4);
      g.fillCircle(9, -31, 4);
    } else if (this.look === "rogue") {
      g.fillStyle(0xd9b45a, 0.9);
      g.fillRect(-11, -25, 22, 3);
    } else if (this.look === "player") {
      g.fillStyle(0x7fe8dd, 1);
      g.fillCircle(0, -23, 1.8);
    }
    // 眉
    g.lineStyle(1.4, this.shade(hair, 1.2), 0.9);
    if (this.mood === "waiting") {
      g.lineBetween(-7, -24, -2, -21);
      g.lineBetween(2, -21, 7, -24);
    } else if (this.mood === "cold") {
      g.lineBetween(-7, -21, -2, -21);
      g.lineBetween(2, -21, 7, -21);
    } else if (this.mood === "dining") {
      g.lineBetween(-7, -21, -2, -23);
      g.lineBetween(2, -23, 7, -21);
    } else {
      g.lineBetween(-7, -22.5, -2, -22.5);
      g.lineBetween(2, -22.5, 7, -22.5);
    }
    if (this.look === "elder") {
      g.fillStyle(0xf2f4f8, 0.95);
      g.fillTriangle(-7, -13, 7, -13, 0, 6);
      g.fillStyle(0xe8ecf2, 1);
      g.fillEllipse(0, -25, 26, 14);
    }
    if (this.look === "mortal") {
      g.fillStyle(0xc8a45a, 1);
      g.fillEllipse(0, -28, 34, 8);
      g.fillTriangle(-11, -28, 11, -28, 0, -40);
    }
    if (this.look === "demon" || this.look === "demonlord") {
      g.fillStyle(0x3a2a2a, 1);
      g.fillTriangle(-9, -30, -4, -30, -7, -41);
      g.fillTriangle(4, -30, 9, -30, 7, -41);
    }
    // 发丝
    g.lineStyle(1.5, this.shade(hair, 1.35), 0.9);
    g.lineBetween(-8, -26, -10, -14);
    g.lineBetween(8, -26, 10, -14);
    // 耳朵、鼻子与发顶高光
    g.fillStyle(skin, 1);
    g.fillCircle(-(headR * faceW - 0.5), -17, 2.4);
    g.fillCircle(headR * faceW - 0.5, -17, 2.4);
    g.fillStyle(0xd8a07a, 0.55);
    g.fillCircle(-(headR * faceW - 0.5), -17, 1);
    g.fillCircle(headR * faceW - 0.5, -17, 1);
    g.lineStyle(1, 0xd8a07a, 0.7);
    g.lineBetween(1, -17, 2, -15);
    // 年龄/身份留下的小痕迹
    if (this.look === "mortal") {
      g.fillStyle(0xc88870, 0.55);
      for (const [fx, fy] of [
        [-6, -17],
        [-2, -16],
        [2, -17],
        [6, -16],
      ]) {
        g.fillCircle(fx, fy, 0.7);
      }
    } else if (this.look === "elder") {
      g.lineStyle(1, 0xb09070, 0.4);
      g.lineBetween(-6, -27, -2, -27);
      g.lineBetween(2, -27, 6, -27);
      g.lineBetween(-5, -29, -2, -29);
    } else if (this.look === "sword") {
      g.lineStyle(1, 0xb06a5a, 0.6);
      g.lineBetween(-7, -14, -4, -11);
    }
    g.fillStyle(this.shade(hair, 1.6), 0.35);
    g.fillEllipse(-4, -31, 12, 4);
    g.lineStyle(1, this.shade(hair, 1.6), 0.4);
    g.lineBetween(-6, -28, -9, -16);
    // 额前碎发
    g.lineStyle(1, this.shade(hair, 1.25), 0.5);
    g.lineBetween(-7, -28, -4, -23);
    g.lineBetween(-2, -30, 0, -24);
    g.lineBetween(3, -29, 5, -23);
    // 嘴：等菜微愁，用膳张嘴笑并带一点腮红，稀客冷脸
    if (this.mood === "dining") {
      g.lineStyle(1.2, 0x7a3a30, 0.85);
      g.beginPath();
      g.arc(0, -13, 3.8, 0.15, Math.PI - 0.15, false);
      g.strokePath();
      g.fillStyle(0x7a3a30, 0.95);
      g.fillEllipse(0, -12, 5.4, 2.6);
      g.fillStyle(0xffb0a0, 0.45);
      g.fillCircle(-7, -16, 3.2);
      g.fillCircle(7, -16, 3.2);
    } else if (this.mood === "waiting") {
      g.lineStyle(1.2, 0x9a5a4a, 0.8);
      g.beginPath();
      g.arc(0, -10, 2.4, Math.PI, Math.PI * 2, false);
      g.strokePath();
    } else if (this.mood === "cold") {
      g.lineStyle(1.2, 0x9a5a4a, 0.8);
      g.lineBetween(-2, -12, 2, -12);
    } else {
      g.lineStyle(1.3, 0x9a5a4a, 0.9);
      g.beginPath();
      g.arc(0, -13, 3, 0, Math.PI, false);
      g.strokePath();
    }

    // 身份道具：画在前面
    if (this.look === "elder") {
      g.lineStyle(3, 0x6a4a2a, 1);
      g.lineBetween(17, 30, 20, -46);
      g.lineStyle(2, 0x7fe8dd, 0.9);
      g.strokeCircle(20, -49, 5);
    }
    if (this.look === "alchemist") {
      g.fillStyle(0xf1e4cc, 1);
      g.beginPath();
      g.moveTo(13, 16);
      g.lineTo(27, 3);
      g.lineTo(22, 19);
      g.closePath();
      g.fillPath();
    }
    if (this.look === "player") {
      g.lineStyle(1.5, 0xd9b45a, 0.9);
      g.lineBetween(-9, -6, -13, 28);
      g.lineBetween(9, -6, 13, 28);
      g.lineBetween(-13, 27, 13, 27);
      g.fillStyle(0xffe6a8, 1);
      g.fillCircle(0, 10, 2.5);
    }
    if (this.look === "alchemist" || this.look === "demonlord") {
      g.fillStyle(0xb8742a, 1);
      g.fillCircle(15, 10, 5);
      g.fillCircle(15, 4, 3.2);
      g.lineStyle(1.5, 0x6a3a12, 1);
      g.lineBetween(15, 1, 15, -2);
    }
    if (this.look === "server") {
      g.fillStyle(0x6a4a2a, 1);
      g.fillEllipse(-16, 10, 20, 4);
      g.fillStyle(0x9fe8dd, 1);
      g.fillCircle(-16, 6, 3);
    }
    if (this.look === "cook") {
      g.fillStyle(0xf1e4cc, 0.95);
      g.fillRect(-8, 0, 16, 26);
      g.lineStyle(4, 0x9a9a9a, 1);
      g.lineBetween(15, 16, 9, -10);
      g.fillStyle(0x555555, 1);
      g.fillCircle(9, -10, 4);
    }
    if (this.look === "hawker") {
      g.lineStyle(2.5, 0x6a4a2a, 1);
      g.lineBetween(16, 18, 16, -36);
      g.fillStyle(0xb83a2a, 1);
      g.beginPath();
      g.moveTo(16, -36);
      g.lineTo(34, -30);
      g.lineTo(16, -22);
      g.closePath();
      g.fillPath();
      g.fillStyle(0xffd98a, 1);
      g.fillCircle(16, -40, 2);
    }
    if (this.look === "player") {
      g.fillStyle(0x7fe8dd, 1);
      g.fillCircle(0, 10, 3);
      g.lineStyle(1, 0x3a7a72, 1);
      g.lineBetween(0, 13, 0, 18);
    }
  }

  /** 呼吸/轻微摇晃；只动内部 visual，不打断外层的行走与朝向。 */
  private startIdle() {
    if (!this.scene || !this.visual?.active) return;
    this.stopIdle();
    this.idleTween = this.scene.tweens.add({
      targets: this.visual,
      scaleY: Character.ART_SCALE * 1.025,
      y: -1,
      duration: Phaser.Math.Between(1200, 1800),
      yoyo: true,
      repeat: -1,
      delay: Phaser.Math.Between(0, 900),
      ease: "Sine.easeInOut",
    });
  }

  private stopIdle() {
    this.idleTween?.remove();
    this.idleTween = undefined;
    this.visual.setScale(Character.ART_SCALE).setY(0);
  }

  setBodyColor(color: number) {
    this.bodyColor = color;
    this.draw();
  }

  setHairColor(color: number) {
    this.hairColor = color;
    this.draw();
  }

  setLongHair(long: boolean) {
    this.longHair = long;
    this.draw();
  }

  /** 特写用：同一套配色/身份/状态的肖像副本。 */
  portraitSpec() {
    return {
      bodyColor: this.bodyColor,
      hairColor: this.hairColor,
      longHair: this.longHair,
      look: this.look,
      mood: this.mood,
      dining: this.dining,
      seated: this.seated,
    };
  }

  /** 表情：排队等菜微愁、用膳张嘴笑、稀客冷脸。 */
  setMood(mood: "idle" | "waiting" | "dining" | "cold") {
    if (this.mood === mood) return;
    this.mood = mood;
    this.draw();
  }

  /** 入座后整个人沉到桌后；等菜和用膳都保持坐姿。 */
  setSeated(on: boolean) {
    if (this.seated === on || !this.scene || !this.visual?.active) return;
    this.seated = on;
    this.setDepth(on ? 6.2 : 20);
    this.draw();
  }

  /** 用膳：收起腿、坐到桌后（桌沿挡住腰腿），再做咀嚼起伏。 */
  setDining(on: boolean) {
    if (this.dining === on || !this.scene || !this.visual?.active) return;
    this.dining = on;
    if (on && !this.seated) {
      this.seated = true;
      this.setDepth(6.2);
    }
    this.mood = on ? "dining" : "idle";
    this.draw();
    this.stopIdle();
    if (on) {
      this.idleTween = this.scene.tweens.add({
        targets: this.visual,
        y: 3,
        scaleY: Character.ART_SCALE * 0.93,
        duration: 620,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    } else {
      this.startIdle();
    }
  }

  /** 被点进特写时的小动作：轻轻一欠身，让静止的人动一下。 */
  focusPose() {
    if (!this.scene || !this.visual?.active) return;
    this.stopIdle();
    this.visual.setAngle(4);
    const ring = this.scene.add
      .circle(this.x, this.y + 24, 18, 0x000000, 0)
      .setStrokeStyle(3, 0xffe08a, 0.9)
      .setDepth(25);
    this.scene.tweens.add({
      targets: ring,
      scale: 3.2,
      alpha: 0,
      duration: 1500,
      ease: "Sine.easeOut",
      onComplete: () => ring.destroy(),
    });
    this.scene.tweens.add({
      targets: this.visual,
      y: -16,
      scaleY: Character.ART_SCALE * 1.07,
      duration: 300,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.visual.setY(0).setScale(Character.ART_SCALE).setAngle(0);
        this.startIdle();
      },
    });
    for (let i = 0; i < 4; i++) {
      const spark = this.scene.add
        .circle(this.x + Phaser.Math.Between(-18, 18), this.y - 70, 2.4, 0xffe08a, 0.9)
        .setDepth(26);
      this.scene.tweens.add({
        targets: spark,
        y: spark.y - Phaser.Math.Between(22, 46),
        alpha: 0,
        duration: 700 + i * 90,
        delay: i * 50,
        ease: "Sine.easeOut",
        onComplete: () => spark.destroy(),
      });
    }
  }

  /** 偶尔的小动作：点一下头/耸肩，让静止画面里也有活气。 */
  twitch() {
    if (this.dining || !this.scene || !this.visual?.active) return;
    this.stopIdle();
    this.scene.tweens.add({
      targets: this.visual,
      y: -4,
      scaleY: Character.ART_SCALE * 1.02,
      duration: 170,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeOut",
      onComplete: () => this.startIdle(),
    });
  }

  /** 境界灵气：脚下的一圈光晕，随境界与仙缘变强。 */
  setAura(color: number, scale = 1, alpha = 0.18) {
    if (!this.aura) {
      this.aura = this.scene.add.circle(0, 30, 26, color, alpha);
      this.addAt(this.aura, 0);
    }
    this.aura.setFillStyle(color, alpha).setScale(scale);
  }

  /** 排队耐心条；入座后传 null 移除。 */
  setPatience(fraction: number | null) {
    if (fraction === null) {
      this.patienceBg?.destroy();
      this.patienceFill?.destroy();
      this.patienceBg = undefined;
      this.patienceFill = undefined;
      return;
    }
    if (!this.patienceBg) {
      this.patienceBg = this.scene.add.rectangle(-16, -50, 32, 4, 0x2a2a2a).setOrigin(0, 0.5);
      this.patienceFill = this.scene.add.rectangle(-16, -50, 32, 4, 0xffd98a).setOrigin(0, 0.5);
      this.add([this.patienceBg, this.patienceFill]);
    }
    const p = Phaser.Math.Clamp(fraction, 0, 1);
    this.patienceFill!.width = 32 * p;
    this.patienceFill!.setFillStyle(p > 0.35 ? 0xffd98a : 0xff7a6a);
  }

  /** 小人说话：气泡挂在世界坐标上（避免被朝向翻转镜像），每帧跟着人走。 */
  say(text: string, tone: "warm" | "cold" = "warm") {
    this.clearBubble();
    this.lastLine = text;
    const scene = this.scene;
    const bubble = scene.add
      .text(this.x, this.y, text, {
        fontSize: "20px",
        color: tone === "cold" ? "#d8e8ff" : "#2a1f14",
        backgroundColor: tone === "cold" ? "#2a3448" : "#f3e6cf",
        padding: { x: 9, y: 6 },
        fontFamily: '"KaiTi","STKaiti",serif',
        wordWrap: { width: 220 },
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(27);
    const bg = tone === "cold" ? 0x2a3448 : 0xf3e6cf;
    const tail = scene.add.triangle(this.x, 0, -7, 0, 7, 0, 0, 8, bg).setDepth(27);
    this.bubble = bubble;
    this.bubbleTail = tail;
    const rise = { y: 0 };
    const follow = () => {
      // 人被移除了，气泡跟着消失
      if (!this.active || !bubble.active) {
        scene.events.off("postupdate", follow);
        if (bubble.active) {
          bubble.destroy();
          tail.destroy();
        }
        return;
      }
      const view = scene.cameras.main.worldView;
      const margin = Math.min(120, view.width * 0.22);
      const bx = Phaser.Math.Clamp(this.x, view.x + margin, view.right - margin);
      // 尾巴尖落在头顶上方一点（耐心条在 -50，避开它）
      bubble.setPosition(bx, this.y - 58 - 8 - bubble.height / 2 + rise.y).setVisible(this.visible);
      tail.setPosition(bx, bubble.y + bubble.height / 2 - 2).setVisible(this.visible);
    };
    follow();
    scene.events.on("postupdate", follow);
    // 先完整显示 1.7 秒，再淡出，避免“刚冒出来就透明”
    scene.tweens.add({ targets: rise, y: -12, duration: 2400, ease: "Sine.easeOut" });
    scene.tweens.add({
      targets: [bubble, tail],
      alpha: 0,
      delay: 1700,
      duration: 650,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (this.bubble === bubble) this.bubble = undefined;
        if (this.bubbleTail === tail) this.bubbleTail = undefined;
        bubble.destroy();
        tail.destroy();
      },
    });
  }

  /** 特写时收起聊天气泡，让字幕独占画面。 */
  clearBubble() {
    this.bubble?.destroy();
    this.bubbleTail?.destroy();
    this.bubble = undefined;
    this.bubbleTail = undefined;
  }

  isSpeaking(): boolean {
    return this.bubble !== undefined;
  }

  /** 碰杯时向对方歪一下身子，别只是原地上下跳。 */
  cheer(dir: 1 | -1) {
    if (!this.scene || !this.visual?.active) return;
    this.scene.tweens.add({
      targets: this.visual,
      angle: dir * 7,
      duration: 190,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
      onComplete: () => this.visual.setAngle(0),
    });
  }

  /** 操作中的占位动画：竖向缩放脉冲 + 上下浮动（不碰 scaleX，避免破坏朝向翻转）。 */
  pulse() {
    this.scene.tweens.add({
      targets: this,
      scaleY: 1.16,
      duration: 110,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
    });
    this.scene.tweens.add({
      targets: this,
      y: this.y - 6,
      duration: 160,
      yoyo: true,
      repeat: 3,
      ease: "Sine.easeInOut",
    });
  }

  walkTo(x: number, y: number, duration: number, onComplete?: () => void) {
    // 走到一半被叫去别处时，先停掉旧的位移/脉冲，避免两个 tween 抢同一属性
    this.scene.tweens.killTweensOf(this);
    if (this.dining) {
      this.dining = false;
      this.draw();
    }
    this.stopIdle();
    this.walkTween?.remove();
    this.walkTween = this.scene.tweens.add({
      targets: this.visual,
      y: -3,
      duration: 150,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.scaleY = 1;
    if (x < this.x - 2) this.setScale(-1, 1);
    else if (x > this.x + 2) this.setScale(1, 1);
    this.scene.tweens.add({
      targets: this,
      x,
      y,
      duration,
      ease: "Linear",
      onComplete: () => {
        this.walkTween?.remove();
        this.walkTween = undefined;
        this.visual.setY(0);
        this.startIdle();
        onComplete?.();
      },
    });
  }

  teleportTo(x: number, y: number) {
    this.scene.tweens.killTweensOf(this);
    this.walkTween?.remove();
    this.walkTween = undefined;
    this.scaleY = 1;
    this.visual.setY(0);
    this.setPosition(x, y);
    this.startIdle();
  }
}
