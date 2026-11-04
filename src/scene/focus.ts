// 点人物弹出人物卡（特写）。
import Phaser from "phaser";
import { Character } from "./Character";
import type { CharacterLook } from "./Character";
import { SCREEN_H, SCREEN_W, XIAN_FONT } from "./constants";
import type { TavernScene } from "./TavernScene";

export class FocusMethods {
  /** 点人物/桌卡：拉出一张人物卡，而不是裸镜头推近。 */
  focusOnCharacter(this: TavernScene, char: Character) {
    // 营业中与夜修都能点人看；结算、菜单、页面开着时不行
    if ((this.gameState !== "open" && this.gameState !== "closed") || this.settling || this.overlay) return;
    if (this.focusing && this.focusChar === char) {
      this.returnFromFocus();
      return;
    }
    if (!this.focusing) {
      this.focusing = true;
      this.setFocusUiHidden(true);
    }
    this.focusChar = char;
    // 用膳中的客人多留一会儿，卡还没收起饭不能先撤
    const diningBooth = this.booths.find((b) => b.patronChar === char && b.state === "dining");
    if (diningBooth) diningBooth.departAt = Math.max(diningBooth.departAt, this.time.now + 4500);
    this.focusTimer?.remove();
    this.eventToast?.destroy();
    this.eventToast = undefined;
    this.hintToast?.destroy();
    this.hintToast = undefined;
    char.clearBubble();
    this.clearFocusCard();
    const who = char.displayName ?? "人物";
    const line = this.focusLineFor(char);
    const overlay = this.add
      .rectangle(0, 0, SCREEN_W, SCREEN_H, 0x0a0704, 0.78)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(100);
    const openedAt = this.time.now;
    overlay.setInteractive({ useHandCursor: true }).on("pointerup", () => {
      if (this.time.now - openedAt > 250) this.returnFromFocus();
    });
    const panel = this.add.graphics().setScrollFactor(0).setDepth(101);
    panel.fillStyle(0x1b140d, 0.97);
    panel.fillRoundedRect(180, 580, 360, 540, 18);
    panel.lineStyle(3, 0xd9b45a, 0.85);
    panel.strokeRoundedRect(180, 580, 360, 540, 18);
    panel.lineStyle(1, 0xd9b45a, 0.3);
    panel.strokeRoundedRect(194, 594, 332, 512, 14);
    // 卡内淡墨山与朱印，和标题页的水墨气质接上
    panel.fillStyle(0x0b0704, 0.45);
    panel.fillTriangle(205, 990, 300, 790, 395, 990);
    panel.fillTriangle(330, 990, 425, 820, 515, 990);
    panel.fillStyle(0x8a2a22, 0.85);
    panel.fillRect(506, 606, 16, 22);
    panel.lineStyle(1, 0xd9b45a, 0.6);
    panel.strokeRect(506, 606, 16, 22);
    const spec = char.portraitSpec();
    const portrait = new Character(
      this,
      360,
      900,
      spec.bodyColor,
      spec.hairColor,
      spec.longHair,
      spec.look,
    );
    portrait.usePixelArt(false);
    portrait.setScrollFactor(0).setScale(4.2).setDepth(101.5);
    portrait.disableInteractive();
    portrait.setMood(spec.mood);
    if (spec.dining) portrait.setDining(true);
    else if (spec.seated) portrait.setSeated(true);
    portrait.setDepth(101.5).setScrollFactor(0);
    this.tweens.add({
      targets: portrait,
      y: 894,
      duration: 220,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
    this.focusOverlay = overlay;
    this.focusPanel = panel;
    this.focusPortrait = portrait;
    this.focusName = this.add
      .text(360, 606, who, {
        fontSize: "20px",
        color: "#ffe6a8",
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(102);
    this.focusRole = this.add
      .text(360, 634, this.focusRoleLine(spec.look), {
        fontSize: "16px",
        color: "#c8b89a",
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(102);
    if (spec.seated || spec.dining) {
      // 卡内也给出桌沿/桌面，坐下的人不是悬空半身像
      const table = this.add.graphics().setScrollFactor(0).setDepth(101.55);
      table.fillStyle(0x4a3020, 1);
      table.fillRoundedRect(180, 1000, 360, 100, 6);
      table.fillStyle(0x6a4a2a, 1);
      table.fillRect(180, 1000, 360, 14);
      table.fillStyle(0x8a2a22, 0.9);
      table.fillRect(210, 1002, 300, 5);
      table.lineStyle(1, 0xd9b45a, 0.5);
      table.strokeRoundedRect(180, 1000, 360, 100, 6);
      this.focusTable = table;
    }
    if (spec.dining) {
      const prop = this.add.container(360, 970).setScrollFactor(0).setDepth(101.6);
      const bowl = this.add.ellipse(0, 0, 130, 44, 0xf1e4cc);
      const rim = this.add.ellipse(0, -2, 108, 30, 0xe8d8bc);
      const soup = this.add.ellipse(0, -2, 80, 20, 0xd98a4a);
      const stick = this.add.rectangle(18, -24, 6, 90, 0x6a4a2a).setAngle(26);
      prop.add([bowl, rim, soup, stick]);
      for (const sx of [-18, 18]) {
        const steam = this.add.ellipse(sx, -36, 36, 16, 0xf0e8e0, 0.38);
        prop.add(steam);
        this.tweens.add({
          targets: steam,
          y: -86,
          alpha: 0,
          duration: 1800,
          delay: Phaser.Math.Between(0, 800),
          repeat: -1,
          ease: "Sine.easeOut",
        });
      }
      this.focusProp = prop;
    }
    this.focusCaption = this.add
      .text(360, 1152, `${line ? `「${line}」\n` : ""}点画面任意处退出 · 3.6s`, {
        fontSize: "20px",
        color: "#ffe6c8",
        align: "center",
        fontFamily: XIAN_FONT,
        wordWrap: { width: 600 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(102);
    this.focusTimer = this.time.delayedCall(3600, () => this.returnFromFocus());
  }

  clearFocusCard(this: TavernScene) {
    this.focusOverlay?.destroy();
    this.focusOverlay = undefined;
    this.focusPanel?.destroy();
    this.focusPanel = undefined;
    this.focusPortrait?.destroy();
    this.focusPortrait = undefined;
    this.focusProp?.destroy();
    this.focusProp = undefined;
    this.focusTable?.destroy();
    this.focusTable = undefined;
    this.focusCaption?.destroy();
    this.focusCaption = undefined;
    this.focusName?.destroy();
    this.focusName = undefined;
    this.focusRole?.destroy();
    this.focusRole = undefined;
  }

  /** 特写台词按此人此刻在做什么来取，避免排队客人说"结账"。 */
  focusRoleLine(this: TavernScene, look: CharacterLook): string {
    const lines: Record<CharacterLook, string> = {
      player: "掌柜 · 青锋剑",
      sword: "剑修 · 飞剑「青霜」",
      rogue: "散修 · 短刃「无咎」",
      alchemist: "丹修 · 紫金丹葫",
      elder: "仙门长老 · 竹节杖",
      demon: "妖修 · 赤尾利爪",
      demonlord: "魔道散人 · 玄骨扇",
      mortal: "凡人 · 一副挑担",
      server: "跑堂 · 托盘",
      cook: "灶上 · 铁锅勺",
      hawker: "迎客 · 酒旗",
    };
    return lines[look] ?? "灵膳楼 · 食客";
  }

  focusLineFor(this: TavernScene, char: Character): string {
    if (this.queue.some((p) => p.char === char)) return "前面还有几位？";
    const booth = this.booths.find((b) => b.patronChar === char);
    if (booth) {
      const regular = booth.patronRegular
        ? this.regulars.find(
            (r) => r.name === booth.patronName && r.kindId === booth.patronKind?.id,
          )
        : undefined;
      if (regular) return `第 ${regular.visits + 1} 次来，还是老味道。`;
      const id = booth.patronKind?.id;
      if (booth.state === "dining") return id === "demon" ? "够味，痛快！" : "入口生津，灵气自生。";
      if (booth.state === "awaitingCook") return id === "demonlord" ? "本座只等一炷香。" : "菜还没好么？";
      return "店家，有劳。";
    }
    return char.lastLine ?? "";
  }

  /** 退出人物卡：恢复 HUD；点画面任意处、再点同一人或计时结束都会退出。 */
  returnFromFocus(this: TavernScene) {
    this.focusTimer?.remove();
    this.focusTimer = undefined;
    this.focusing = false;
    this.focusChar = undefined;
    this.clearFocusCard();
    this.setFocusUiHidden(false);
    this.refreshHud();
  }

  /** 特写期间收起界面；否则相机缩放会把屏幕固定的 HUD 一起放大、错位。 */
  setFocusUiHidden(this: TavernScene, hidden: boolean) {
    const ui: { setVisible(visible: boolean): unknown }[] = [
      this.hudBar,
      this.hudLine,
      this.hudChips,
      this.rightFrame,
      this.coinsText,
      this.inventoryText,
      this.queueText,
      this.goalText,
      this.sessionText,
      this.reputationText,
      this.reputationBarBg,
      this.reputationBar,
      this.chronicleText,
      this.weatherBadge,
      this.clockText,
      this.sfxButton,
      this.startButton,
      this.cultivationButton,
      ...this.floorTabs.flatMap((tab) => [tab.bg, tab.label, tab.sub]),
    ];
    ui.forEach((obj) => obj.setVisible(!hidden));
    // 营业中（含收尾结算）没有开始按钮；特写/结算恢复界面时别把它带回来
    if (this.gameState === "open") this.startButton.setVisible(false);
  }
}
