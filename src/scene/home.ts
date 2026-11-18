// 主界面：酒楼门面 + 【营业】【修炼】两张入口卡；营业状态与倒计时写在卡上。
import Phaser from "phaser";
import { playSfx } from "../audio";
import { formatCountdown, GATHER_COOLDOWN_MS, getSessionDurationMs } from "../logic";
import { SCREEN_W, XIAN_FONT } from "./constants";
import type { TavernScene } from "./TavernScene";

export class HomeMethods {
  buildHomeView(this: TavernScene) {
    const layer = this.add.container(0, 0).setScrollFactor(0).setDepth(0.3);
    const g = this.add.graphics();
    // 远山，给门面一点纵深
    g.fillStyle(0x12202e, 0.85);
    g.fillTriangle(-40, 1080, 170, 820, 380, 1080);
    g.fillTriangle(280, 1080, 500, 790, 760, 1080);
    // 地面与台阶
    g.fillStyle(0x0a0f18, 1);
    g.fillRect(0, 1050, SCREEN_W, 30);
    g.fillStyle(0x2a2018, 1);
    g.fillRect(296, 1042, 128, 10);
    g.fillRect(312, 1032, 96, 10);
    // 酒楼门面
    g.fillStyle(0x241610, 1);
    g.fillRect(150, 850, 420, 200);
    g.fillStyle(0x3a1a14, 1);
    g.fillTriangle(118, 852, 602, 852, 360, 740);
    g.lineStyle(4, 0x7a2f22, 1);
    g.lineBetween(126, 852, 594, 852);
    g.fillStyle(0x5a241a, 1);
    g.fillRect(300, 738, 120, 8);
    // 两侧窗与门内暖光
    for (const wx of [208, 432]) {
      g.fillStyle(0xffb060, 0.92);
      g.fillRect(wx, 892, 80, 64);
      g.fillStyle(0xffd98a, 0.5);
      g.fillRect(wx + 6, 898, 30, 24);
      g.lineStyle(3, 0x2a1a10, 1);
      g.strokeRect(wx, 892, 80, 64);
      g.lineBetween(wx + 40, 892, wx + 40, 956);
      g.lineBetween(wx, 924, wx + 80, 924);
    }
    g.fillStyle(0x1a120c, 1);
    g.fillRect(330, 940, 60, 110);
    g.fillStyle(0xffb060, 0.65);
    g.fillRect(338, 950, 44, 52);
    g.lineStyle(3, 0x2a1a10, 1);
    g.strokeRect(330, 940, 60, 110);
    // 门前灯笼
    for (const lx of [188, 532]) {
      g.fillStyle(0x2a1a10, 1);
      g.fillRect(lx - 1, 850, 2, 22);
      g.fillStyle(0xff5c3c, 1);
      g.fillEllipse(lx, 886, 26, 36);
      g.fillStyle(0xd9b45a, 1);
      g.fillRect(lx - 10, 902, 20, 4);
    }
    layer.add(g);
    layer.add(
      this.add
        .image(360, 886, "soft-glow")
        .setTint(0xff9a4a)
        .setAlpha(0.16)
        .setScale(1.6)
        .setBlendMode(Phaser.BlendModes.ADD),
    );
    layer.add(
      this.add
        .text(360, 866, "灵膳楼", {
          fontSize: "30px",
          color: "#ffe6a8",
          stroke: "#241506",
          strokeThickness: 5,
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(8),
    );
    layer.add(
      this.add
        .text(360, 1018, "一炉烟火 · 半盏仙途", {
          fontSize: "16px",
          color: "#8a7a62",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setLetterSpacing(3),
    );
    this.homeFacade = layer;

    // 两张入口卡单独建：容器 + scrollFactor(0) 会让命中区按世界坐标偏移
    const makeCard = (y: number, title: string, onClick: () => void, height = 140) => {
      const card = this.add
        .rectangle(360, y, 460, height, 0x0d0a08, 0.94)
        .setStrokeStyle(2, 0xd9b45a, 0.8)
        .setScrollFactor(0)
        .setDepth(31)
        .setInteractive({ useHandCursor: true })
        .on("pointerup", () => {
          playSfx("click");
          onClick();
        });
      const titleText = this.add
        .text(360, y - height / 2 + 28, title, {
          fontSize: "38px",
          color: "#ffe6a8",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(32);
      const sub = this.add
        .text(360, y + height / 2 - 40, "", {
          fontSize: "19px",
          color: "#c8b8a0",
          fontFamily: XIAN_FONT,
          align: "center",
          wordWrap: { width: 420 },
          lineSpacing: 6,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(32);
      return { card, titleText, sub };
    };

    const open = makeCard(360, "营业", () => this.onHomeOpen(), 140);
    this.homeOpenCard = open.card;
    this.homeOpenTitle = open.titleText;
    this.homeOpenSub = open.sub;

    const cultivation = makeCard(530, "修炼", () => this.enterCultivationView(), 120);
    this.homeCultivationCard = cultivation.card;
    this.homeCultivationTitle = cultivation.titleText;
    this.homeCultivationSub = cultivation.sub;
    this.homeCultivationSub.setText("法坛打坐 · 随时进出");

    const gather = makeCard(680, "采集", () => this.buildGatheringOverlay(), 120);
    this.homeGatherCard = gather.card;
    this.homeGatherTitle = gather.titleText;
    this.homeGatherSub = gather.sub;
    this.homeGatherSub.setText("派伙计采食材 · 现实时间冷却");
  }

  /** 主界面【营业】卡：未开业进菜单，营业中回到店内，已打烊进结算。 */
  onHomeOpen(this: TavernScene) {
    if (this.session === "idle") {
      this.openMenu();
      return;
    }
    this.enterBusinessView();
  }

  /** 卡片上的状态文字每帧刷新。 */
  refreshHomeCards(this: TavernScene) {
    if (this.session === "running") {
      const remaining = Math.max(0, getSessionDurationMs() - (this.time.now - this.sessionStartedAt));
      this.homeOpenSub.setText(
        `营业中 · 剩余 ${formatCountdown(remaining)}\n收入 ${this.sessionRevenue} 灵石 · 排队 ${this.queue.length} 人`,
      );
      this.homeOpenSub.setColor("#a8d8b0");
    } else if (this.session === "ended") {
      this.homeOpenSub.setText("营业结束 · 点击结算");
      this.homeOpenSub.setColor("#ffd98a");
    } else {
      this.homeOpenSub.setText(`第 ${this.day} 日 · 点击开业`);
      this.homeOpenSub.setColor("#c8b8a0");
    }
    // 采集卡：有几人在外、最近一位多久归队
    const active = Object.values(this.gathering);
    if (active.length === 0) {
      this.homeGatherSub.setText("派伙计采食材 · 现实时间冷却");
      this.homeGatherSub.setColor("#c8b8a0");
    } else {
      const soonest = Math.min(...active.map((g) => g.startedAt + GATHER_COOLDOWN_MS - Date.now()));
      this.homeGatherSub.setText(`采集中 ${active.length}/3 · 最近 ${formatCountdown(Math.max(0, soonest))} 归队`);
      this.homeGatherSub.setColor("#a8d8b0");
    }
  }

  setHomeVisible(this: TavernScene, visible: boolean) {
    this.homeFacade?.setVisible(visible);
    for (const obj of [
      this.homeOpenCard,
      this.homeOpenTitle,
      this.homeOpenSub,
      this.homeCultivationCard,
      this.homeCultivationTitle,
      this.homeCultivationSub,
      this.homeGatherCard,
      this.homeGatherTitle,
      this.homeGatherSub,
    ]) {
      obj.setVisible(visible);
      if (obj.input) obj.input.enabled = visible;
    }
  }
}
