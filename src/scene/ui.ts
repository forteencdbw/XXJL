// 屏幕固定层 UI：搭建底栏/导航卡/按钮、镜头拖拽、性别与音效开关、二级页面关闭。
import Phaser from "phaser";
import { loadAudioSettings, playSfx } from "../audio";
import { NIGHT_COLOR } from "../logic";
import { NIGHT_PANEL_Y, NIGHT_STRIP_Y, SCREEN_H, SCREEN_W, STATUS_BAR_H, XIAN_FONT } from "./constants";
import type { TapText } from "./types";
import type { TavernScene } from "./TavernScene";

export class UiMethods {
  // ===== 屏幕固定层（天空/地面/日月/UI）=====
  buildUi(this: TavernScene) {
    this.skyRect = this.add
.rectangle(0, 0, SCREEN_W, SCREEN_H, NIGHT_COLOR)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-20);

    // 远景：三层水墨山、山门、漂云。固定在屏幕上，给窗口外留出纵深。
    const backdrop = this.add.graphics().setScrollFactor(0).setDepth(-18);
    backdrop.fillStyle(0x1a2a40, 0.5);
    for (const [x1, px, x2] of [
      [-100, 720, 160],
      [80, 780, 340],
      [260, 690, 520],
      [440, 750, 700],
      [600, 700, 860],
    ] as const) {
      backdrop.fillTriangle(x1, 1040, px, 690, x2, 1040);
    }
    backdrop.fillStyle(0x121d2a, 0.8);
    for (const [x1, px, x2] of [
      [-140, 880, 200],
      [120, 930, 430],
      [360, 860, 660],
      [560, 920, 860],
    ] as const) {
      backdrop.fillTriangle(x1, 1100, px, 850, x2, 1100);
    }
    // 远山山门
    backdrop.fillStyle(0x0d1620, 0.95);
    backdrop.fillRect(174, 900, 52, 10);
    backdrop.fillTriangle(160, 900, 240, 900, 200, 872);
    backdrop.fillRect(188, 910, 24, 16);
    backdrop.fillStyle(0xffd98a, 0.55);
    backdrop.fillRect(197, 914, 5, 8);
    for (const [x, y, w, a] of [
      [150, 300, 300, 0.035],
      [480, 420, 380, 0.03],
      [280, 540, 260, 0.025],
    ] as const) {
      const cloud = this.add
        .ellipse(x, y, w, 26, 0xdfe9f5, a)
        .setScrollFactor(0)
        .setDepth(-17);
      this.tweens.add({
        targets: cloud,
        x: x + 70,
        duration: Phaser.Math.Between(22000, 34000),
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    this.sunMoon = this.add.circle(0, 0, 34, 0xffe8a0).setScrollFactor(0).setDepth(-15);
    this.moonHalo = this.add.circle(0, 0, 82, 0xffe8b0, 0.07).setScrollFactor(0).setDepth(-16);
    this.moonShadow = this.add.circle(0, 0, 30, NIGHT_COLOR).setScrollFactor(0).setDepth(-14);
    this.buildStars();
    this.buildWindows();
    this.buildWindowFrames();
    this.buildWindowLight();
    this.buildSceneGrade();
    // 营业镜头右缘的立柱/帘：遮住墙外的天空色条，同时像一道前景画框
    this.rightFrame = this.add.container(0, 0).setScrollFactor(0).setDepth(22).setVisible(false);
    this.rightFrame.add(this.add.rectangle(710, 640, 20, 1280, 0x1a120c, 1));
    this.rightFrame.add(this.add.rectangle(700, 640, 3, 1280, 0x8a2a22, 0.85));
    this.rightFrame.add(this.add.rectangle(704, 640, 1.5, 1280, 0xd9b45a, 0.35));
    this.closedBackdrop = this.add
      .image(360, 640, "ink-closed")
      .setDisplaySize(SCREEN_W, SCREEN_H)
      .setScrollFactor(0)
      .setDepth(0.2)
      .setVisible(false);
    this.closedFloorText = this.add
      .text(360, 690, "", {
        fontSize: "20px",
        color: "#e0c9a0",
        fontFamily: XIAN_FONT,
        backgroundColor: "rgba(13,10,8,0.9)",
        padding: { x: 14, y: 6 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(31)
      .setVisible(false);
    this.interiorPixelImage = this.add
      .image(-360, 0, "ink-interior")
      .setOrigin(0, 0)
      .setDisplaySize(790, 1280)
      .setDepth(6);

    // 顶部 HUD 悬浮条
    this.hudBar = this.add
      .rectangle(0, 0, SCREEN_W, STATUS_BAR_H, 0x000000, 0.82)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(30);
    this.hudBar.setVisible(true);
    this.hudLine = this.add
      .rectangle(0, STATUS_BAR_H - 2, SCREEN_W, 2, 0xd9b45a, 0.35)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(30.5);
    // 四块很淡的底，把资源 / 境界 / 排队 / 进度分组，不再像一排调试数字
    this.hudChips = this.add.graphics().setScrollFactor(0).setDepth(30.2);
    this.hudChips.fillStyle(0x0a0704, 0.42);
    this.hudChips.fillRoundedRect(12, 2, 362, 34, 8);
    this.hudChips.fillRoundedRect(542, 2, 166, 34, 8);
    this.hudChips.fillRoundedRect(12, 36, 254, 30, 7);
    this.hudChips.fillRoundedRect(270, 36, 434, 30, 7);
    this.hudChips.lineStyle(1, 0x8a6a3a, 0.28);
    this.hudChips.strokeRoundedRect(12, 2, 362, 34, 8);
    this.hudChips.strokeRoundedRect(542, 2, 166, 34, 8);
    this.hudChips.strokeRoundedRect(12, 36, 254, 30, 7);
    this.hudChips.strokeRoundedRect(270, 36, 434, 30, 7);

    this.coinsText = this.addUiText(24, 6, "", "26px", "#ffe6a8");
    this.inventoryText = this.addUiText(190, 6, "", "26px", "#a8d8b0");
    this.levelText = this.addUiText(400, 6, "", "18px", "#87ceeb");
    this.queueText = this.addUiText(24, 40, "", "24px", "#d8c8a8");
    // 状态栏最右：营业时钟的时辰
    this.clockText = this.addUiText(696, 9, "", "21px", "#ffd98a").setOrigin(1, 0);
    this.clockText.setStyle({ fontStyle: "bold" });
    this.goalText = this.addUiText(440, 40, "", "25px", "#e0c060");
    this.goalText.setWordWrapWidth(260);
    this.sessionText = this.addUiText(24, 70, "", "21px", "#a8b8c8");
    // 声望常驻在进度行右侧：称号 + 当前/下一级 + 细进度条
    this.reputationText = this.addUiText(696, 70, "", "20px", "#d9b45a").setOrigin(1, 0);
    this.reputationBarBg = this.add
      .rectangle(546, 95, 150, 4, 0x3a3a3a)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(30.6);
    this.reputationBar = this.add
      .rectangle(546, 95, 150, 4, 0xd9b45a)
      .setOrigin(0, 0)
      .setScale(0, 1)
      .setScrollFactor(0)
      .setDepth(30.7);
    this.chronicleText = this.addUiText(24, 96, "", "17px", "#b8b0a0");
    this.weatherBadge = this.addUiText(24, 176, "", "17px", "#e0c9a0").setVisible(false);
    [this.coinsText, this.inventoryText, this.queueText, this.goalText].forEach(
      (text) => text.setStyle({ fontStyle: "bold" }),
    );
    this.levelText.setVisible(false);

    // 左下角最底部的版本号：压在所有层之上，标题页、营业、夜修都看得到
    this.add
      .text(8, SCREEN_H - 4, __APP_VERSION__, { fontSize: "12px", color: "#c8b8a0" })
      .setOrigin(0, 1)
      .setAlpha(0.45)
      .setScrollFactor(0)
      .setDepth(1000);

    loadAudioSettings();
    // 设置入口：状态栏右侧，营业与夜修都在
    this.settingsButton = this.addUiButton(630, 94, () => this.buildSettingsOverlay(), { x: 14, y: 4 }, 8, "18px");
    this.settingsButton.setText("设置");


    // 「开始营业」只在夜修走到辰正后出现，占副屏顶部那一条
    this.startButton = this.addUiButton(360, NIGHT_STRIP_Y, () => this.onStartButton(), { x: 60, y: 14 }, 6, "24px");
    this.startButton.setOrigin(0.5);
    // 营业中副屏只剩修为入口
    this.cultivationButton = this.addUiButton(560, 1186, () => this.buildCultivationOverlay(), { x: 30, y: 28 }, 6, "22px");
    this.cultivationButton.setBackgroundColor("#3a2e4a");
    this.cultivationButton.setText("修为");

    // 夜修期的副屏：顶部一条显示距天明还有几刻（天明后换成「开始营业」），下面两行四列的子系统入口
    this.navPanel = this.add.container(0, 0).setScrollFactor(0).setDepth(30);
    this.navPanel.add(
      this.add
        .rectangle(0, NIGHT_PANEL_Y, SCREEN_W, SCREEN_H - NIGHT_PANEL_Y, 0x0d0a08, 0.97)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x9a3a2a, 0.55),
    );
    this.navTitle = this.add
      .text(360, NIGHT_STRIP_Y, "", { fontSize: "21px", color: "#c8b8e0", fontFamily: XIAN_FONT })
      .setOrigin(0.5)
      .setLetterSpacing(3);
    this.navPanel.add(this.navTitle);
    const col = (i: number) => 93 + i * 178;
    const [row1, row2] = [NIGHT_PANEL_Y + 128, NIGHT_PANEL_Y + 226];
    this.staffButton = this.addNavCard(col(0), row1, "伙计", "招聘 · 分工", () => {
      this.staffNotice = "";
      this.buildStaffOverlay();
    });
    this.upgradeButton = this.addNavCard(col(1), row1, "营造 Lv1", "雅座 · 灶台", () => this.buildBuildOverlay());
    this.bankButton = this.addNavCard(col(2), row1, "灵石商行", "借贷 · 还账", () => this.buildBankOverlay());
    this.purchaseButton = this.addNavCard(col(3), row1, "备货", "", () => this.startPurchase());
    this.nightCultivationButton = this.addNavCard(col(0), row2, "修为", "修行 · 境界", () =>
      this.buildCultivationOverlay(),
    );
    this.helpButton = this.addNavCard(col(1), row2, "玩法", "规则与操作", () => this.showHelp(), true);
    this.recordButton = this.addNavCard(col(2), row2, "账簿", "累计 · 成就", () => this.buildRecordOverlay(), true);
    this.saveButton = this.addNavCard(col(3), row2, "存档", "导出 · 导入", () => this.openSaveDialog("export"), true);

    this.buildFloorTabs();
    this.buildBoothVisuals();
    this.positionUi(false);
  }

  addUiText(this: TavernScene, x: number, y: number, text: string, fontSize: string, color: string): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, text, { fontSize, color }).setDepth(31).setScrollFactor(0);
    return t;
  }

  /** 给手写的文本按钮加一圈可点余量，避免只点中文字本身。 */
  expandHitArea(this: TavernScene, t: Phaser.GameObjects.Text, expand = 10) {
    // 已经 setInteractive 过的文本再传新的形状不会替换旧命中区，直接改 input.hitArea。
    if (t.input) {
      t.input.hitArea.setTo(-expand, -expand, t.width + expand * 2, t.height + expand * 2);
      t.input.cursor = "pointer";
      return;
    }
    t.setInteractive(
      new Phaser.Geom.Rectangle(-expand, -expand, t.width + expand * 2, t.height + expand * 2),
      Phaser.Geom.Rectangle.Contains,
    );
  }

  /** 副屏底部的大号关闭条：不再要求点中小字「关闭」。 */
  addOverlayClose(this: TavernScene, layer: Phaser.GameObjects.Container, y: number, label = "关闭") {
    layer.add(
      this.add
        .rectangle(40, y, 640, 80, 0x33251b)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x8a6a3a)
        .setInteractive({ useHandCursor: true })
        .on("pointerup", () => this.destroyOverlay()),
    );
    layer.add(
      this.add.text(360, y + 40, label, { fontSize: "24px", color: "#f5e6c8" }).setOrigin(0.5),
    );
  }

  addUiButton(
    this: TavernScene,
    x: number,
    y: number,
    onClick: () => void,
    padding: { x: number; y: number } = { x: 10, y: 8 },
    expand = 6,
    fontSize = "15px",
  ): TapText {
    let sx = 0;
    let sy = 0;
    const t = this.add
      .text(x, y, "", {
        fontSize,
        color: "#f5e6c8",
        backgroundColor: "#2e2119",
        padding,
      })
      .setDepth(31)
      .setScrollFactor(0) as TapText;
    // 关键：创建时文字还是空的，必须在每次 setText 后重算可点区域；
    // 否则视觉背景很大、实际只能点中最初那几个像素。
    const syncHit = () => {
      if (!t.input) return;
      t.input.hitArea.setTo(-expand, -expand, t.width + expand * 2, t.height + expand * 2);
    };
    t.setInteractive(new Phaser.Geom.Rectangle(-expand, -expand, 1, 1), Phaser.Geom.Rectangle.Contains);
    if (t.input) t.input.cursor = "pointer";
    const setText = t.setText.bind(t);
    t.setText = ((value: string | string[]) => {
      setText(value);
      syncHit();
      return t;
    }) as typeof t.setText;
    const setVisible = t.setVisible.bind(t);
    t.setVisible = ((visible: boolean) => {
      setVisible(visible);
      if (t.input) t.input.enabled = visible;
      return t;
    }) as typeof t.setVisible;
    t.on("pointerdown", (p: Phaser.Input.Pointer) => {
      sx = p.x;
      sy = p.y;
    }).on("pointerup", (p: Phaser.Input.Pointer) => {
      if (Math.hypot(p.x - sx, p.y - sy) < 12) {
        playSfx("click");
        t.onTap();
      }
    });
    t.onTap = onClick;
    syncHit();
    return t;
  }

  /** 夜修副屏的事务卡：整卡可点，字号比旧文字按钮大，避免手机上挤成一列小字。 */
  addNavCard(
    this: TavernScene,
    x: number,
    y: number,
    label: string,
    subtitle: string,
    onClick: () => void,
    cool = false,
  ): TapText {
    const tap = () => {
      playSfx("click");
      onClick();
    };
    // 卡片不进 navPanel：容器 + scrollFactor(0) 会让命中区按世界坐标偏移。
    const card = this.add
      .rectangle(x, y, 168, 88, cool ? 0x10151c : 0x14100c, 0.97)
      .setStrokeStyle(2, cool ? 0x8a7a5a : 0x9a3a2a, 0.75)
      .setScrollFactor(0)
      .setDepth(31)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", tap);
    const title = this.add
      .text(x, y - 12, label, {
        fontSize: "25px",
        color: cool ? "#dfe8f4" : "#f5e6c8",
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setLetterSpacing(2)
      .setScrollFactor(0)
      .setDepth(32)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", tap) as TapText;
    title.onTap = onClick;
    const sub = this.add
      .text(x, y + 19, subtitle, {
        fontSize: "14px",
        color: cool ? "#8a9aac" : "#a89472",
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setLetterSpacing(1)
      .setScrollFactor(0)
      .setDepth(32);
    this.navCardObjects.push(card, title, sub);
    title.sub = sub;
    return title;
  }

  setNavCardsVisible(this: TavernScene, visible: boolean) {
    for (const obj of this.navCardObjects) {
      obj.setVisible(visible);
      if (obj.input) obj.input.enabled = visible;
    }
  }

  setClosedNavVisible(this: TavernScene, visible: boolean) {
    this.navPanel.setVisible(visible);
    this.setNavCardsVisible(visible);
    for (const button of [
      this.staffButton,
      this.bankButton,
      this.upgradeButton,
      this.helpButton,
      this.recordButton,
      this.saveButton,
    ]) {
      button?.setVisible(visible);
    }
  }

  positionUi(this: TavernScene, isOpen: boolean) {
    // 打烊时「开始营业」是主行动；营业中一定跑满到子初，不显示这个按钮
    this.startButton.setStyle({ color: "#f5e6c8", backgroundColor: "#8a2a22" });
    // 显隐每帧在 refreshHud 里按「夜修是否到辰正」决定
    this.startButton.setVisible(false);
    this.relayoutTables();
    this.setFloorTabsVisible(isOpen);
    this.applyFloorLook();

    this.setClosedNavVisible(!isOpen && !this.overlay);
    this.rightFrame.setVisible(isOpen);
    this.closedBackdrop.setVisible(!isOpen);

    // 掌柜与伙计的显隐按各自所在楼层，统一在 refreshBoothVisibility 里处理
    this.refreshBoothVisibility();
    this.windowViews.forEach((w) => w.setVisible(isOpen));
  }

  /** 营业视角：玩家可水平拖拽镜头，从厨房左缘一直拖到空地尽头。 */
  bindCameraDrag(this: TavernScene) {
    const cam = this.cameras.main;
    let startX = 0;
    let startScroll = 0;
    let active = false;

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.gameState !== "open" || this.transitioning || this.settling) return;
      startX = p.x;
      startScroll = cam.scrollX;
      active = true;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!active || !p.isDown) return;
      const dx = p.x - startX;
      if (Math.abs(dx) < 8) return;
      // 右侧要能一直拉到队尾：12 个排队位最远到 x≈1190
      cam.scrollX = Phaser.Math.Clamp(startScroll - dx, -360, 900);
    });
    this.input.on("pointerup", () => {
      active = false;
    });
  }

  setGender(this: TavernScene, gender: "male" | "female") {
    this.playerGender = gender;
    this.playerChar.setBodyColor(gender === "male" ? 0x4a7ab8 : 0xc86a9e);
    this.playerChar.setHairColor(gender === "male" ? 0x2b2b2b : 0x4a2b1a);
    this.playerChar.setLongHair(gender === "female");
  }

  destroyOverlay(this: TavernScene) {
    this.overlay?.destroy(true);
    this.overlay = null;
    this.setWorldPaused(false);
  }

  /** 子系统页面开着时冻结整个店：场景时钟（见 create）、计时器与补间一起停。 */
  setWorldPaused(this: TavernScene, on: boolean) {
    if (this.worldPaused === on) return;
    this.worldPaused = on;
    this.time.paused = on;
    this.tweens.paused = on;
  }
}
