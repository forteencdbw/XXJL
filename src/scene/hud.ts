// 每帧刷新的 HUD：状态栏文字、按钮状态、雅座进度条、见闻录与提示。
import Phaser from "phaser";
import { playSfx } from "../audio";
import { DISHES, getGoalProgress, getNextRepThreshold, getRepLevelInfo, getTotalBoothCount, isRarePatron } from "../logic";
import { CHRONICLE_MAX_LINES, COLOR_STAFF, PURCHASE_AMOUNT, SCREEN_W, XIAN_FONT } from "./constants";
import type { BoothState } from "./types";
import type { TavernScene } from "./TavernScene";

export class HudMethods {
  refreshHud(this: TavernScene) {
    if (this.focusing) return;
    const open = this.gameState === "open";
    // 掌柜说话时气泡就在头顶，先收起「掌柜」名牌
    this.playerLabel.setVisible(open && this.playerChar.visible && !this.playerChar.isSpeaking());
    if (open) this.playerLabel.setPosition(this.playerChar.x, this.playerChar.y - 120);

    this.coinsText.setText(`灵石：${this.displayedCoins}`);
    this.inventoryText.setText(`灵材：${this.inventory}`);
    this.inventoryText.setColor(this.inventory <= 0 ? "#ff9a8a" : "#a8d8b0");
    this.levelText.setText(`酒楼等级：${this.level}`);
    const queueCap = getTotalBoothCount(this.level, this.floorsBuilt);
    if (open && !this.settling && this.queue.length >= queueCap) {
      this.queueText.setText(`排队 ${this.queue.length}/${queueCap} · 已满`);
      this.queueText.setColor("#ff9a8a");
    } else if (open && !this.settling && this.patronsSpawned < this.patronsTotal) {
      const nextAt = this.sessionStartedAt + (this.arrivalTimes[this.patronsSpawned] ?? 0);
      const nextIn = Math.max(0, Math.ceil((nextAt - this.time.now) / 1000));
      this.queueText.setText(`排队 ${this.queue.length}/${queueCap} · 下位 ${nextIn}s`);
      this.queueText.setColor("#a8d8b0");
    } else if (open && !this.settling) {
      this.queueText.setText(`排队 ${this.queue.length}/${queueCap} · 客人已到齐`);
      this.queueText.setColor("#d8c8a8");
    } else {
      this.queueText.setText(`排队：${this.queue.length}/${queueCap}`);
      this.queueText.setColor("#d8c8a8");
    }
    const repInfo = getRepLevelInfo(this.reputation);
    const nextRep = getNextRepThreshold(this.reputation);
    this.reputationText.setText(
      nextRep === null ? `${repInfo.title} · 声望圆满` : `${repInfo.title} · ${this.reputation}/${nextRep}`,
    );
    const repSpan = nextRep === null ? 1 : nextRep - repInfo.threshold;
    const repRatio =
      nextRep === null ? 1 : Phaser.Math.Clamp((this.reputation - repInfo.threshold) / repSpan, 0, 1);
    this.reputationBar.setScale(repRatio, 1);
    this.clockText.setText(this.clockLabel());
    if (this.settling) {
      this.sessionText.setText("已打烊");
      this.goalText.setText("");
    } else if (open && this.sessionGoal) {
      this.sessionText.setText(
        `已服务 ${this.sessionServed}/${this.patronsTotal} · ${this.sessionRevenue}灵石`,
      );
      const progress = getGoalProgress(this.sessionGoal, {
        served: this.sessionServed,
        revenue: this.sessionRevenue,
        wishes: this.sessionWishes,
      });
      const kind = this.sessionGoal.kind;
      const prefix = kind === "revenue" ? "收入" : "口味";
      const unit = kind === "revenue" ? " 灵石" : " 位";
      const reached = progress >= this.sessionGoal.target;
      this.goalText.setText(
        reached ? "今日目标 ✓" : `${prefix} ${progress}/${this.sessionGoal.target}${unit}`,
      );
      this.goalText.setColor(reached ? "#a8d8b0" : "#e0c060");
      if (reached && !this.goalAnnounced) {
        this.goalAnnounced = true;
        playSfx("upgrade");
        this.showEventToast("今日目标达成", true);
      }
    } else {
      const goal = this.currentDayGoal();
      // 打烊页：奖励明细留给菜单目标卡，HUD 只留日期、天气与目标，避免长行压到画面
      this.sessionText.setText(`第 ${this.day} 日 · 天气：${this.weather.name} · ${goal.label}`);
      this.goalText.setText("");
      // 事务面板标题常驻回访提示：今天还没领利是就写「待领」，领过则显示连续天数
      const giftPending = this.lastGiftDate !== this.todayKey;
      this.navTitle.setText(
        giftPending ? "掌柜事务 · 今日利是待领" : this.giftStreak > 0 ? `掌柜事务 · 连开 ${this.giftStreak} 天` : "掌柜事务",
      );
      this.navTitle.setColor(giftPending ? "#ffd98a" : "#e0c9a0");
    }
    this.chronicleText.setText(
      this.chronicleLines.map((line) => (line.length > 34 ? `${line.slice(0, 33)}…` : line)).join("\n"),
    );
    // 营业中把常驻日志与声音开关收起：给主画面让位，日志在打烊视图里看
    this.chronicleText.setVisible(!open);
    this.sfxButton.setVisible(!open);
    const showWeather = open && !this.settling;
    this.weatherBadge.setVisible(showWeather);
    this.weatherBadge.setText(`天气 · ${this.weather.name}`);

    this.booths.forEach((booth, i) => {
      const visual = this.boothVisuals[i];
      if (!visual) return;
      const kind = booth.patronKind;
      const wishName =
        booth.state === "awaitingCook" ? DISHES.find((d) => d.id === booth.patronWish)?.name : undefined;
      // 用膳中的客人只留碗筷与人物，不再顶着卡片；等待/烹饪才需要信息
      const showLabel =
        open &&
        booth.floor === this.activeFloor &&
        booth.state !== "empty" &&
        booth.state !== "dining" &&
        !(booth.patronChar?.isSpeaking() ?? false);
      visual.label.setVisible(showLabel);
      const regular = booth.patronRegular;
      visual.label.setColor(
        (kind && isRarePatron(kind)) || regular
            ? "#ffd98a"
            : "#ffffff",
      );
      // 桌卡只留最短信息：想吃什么/做哪道/入座；桌号单独常驻，常客用「常·」标记
      const marker = kind && isRarePatron(kind) ? "★" : regular ? "常·" : "";
      const labelText =
        booth.state === "awaitingCook"
          ? `${marker}${wishName ?? "随意"}↓`
          : booth.state === "cooking"
            ? `${booth.currentDish?.name ?? "烹饪"} ${Math.max(
                0,
                Math.ceil((booth.cookDoneAt - this.time.now) / 1000),
              )}s`
            : booth.state === "awaitingServe"
              ? `${booth.currentDish?.name ?? "菜"} 待传`
              : booth.state === "serving"
                ? "上菜中"
                : "入座";
      visual.label.setText(showLabel ? labelText : "");
    });

    this.startButton.setText("开始营业");

    this.startButton.setAlpha(this.settling ? 0.4 : 1);
    this.cultivationButton.setAlpha(this.settling ? 0.4 : 1);
    this.rightFrame.setVisible(open);
    this.closedBackdrop.setVisible(!open);
    this.closedFloorText
      .setVisible(!open)
      .setText(
        ["一层 · 散座", "二层 · 雅座", "三层 · 仙门包间"][this.floorsBuilt] ?? "一层 · 散座",
      );
    this.refreshFloorTabs();
    // 菜单/店铺面板打开时也收起事务卡，避免透明卡片的命中区压到面板按钮上
    this.setClosedNavVisible(this.gameState === "closed" && !this.overlay);
    // 营业中没有任何手动按钮；采购只在打烊时出现
    this.purchaseButton.setVisible(!open);

    this.staffButton.setText("伙计");
    this.bankButton.setText("灵石商行");
    this.helpButton.setText("玩法");
    this.recordButton.setText("账簿");
    this.saveButton.setText("存档");


    this.purchaseButton.setText(`备货 +${PURCHASE_AMOUNT}（${this.purchasePrice()} 灵石）`);
    this.upgradeButton.setText(`营造 Lv${this.level}`);
  }

  rollCoinsDisplay(this: TavernScene) {
    this.coinRollTween?.remove();
    this.coinRollTween = this.tweens.addCounter({
      from: this.displayedCoins,
      to: this.coins,
      duration: 380,
      onUpdate: (tw) => {
        this.displayedCoins = Math.round(tw.getValue() as number);
      },
    });
  }

  renderProgress(this: TavernScene, time: number) {

    this.booths.forEach((booth, i) => {
      const visual = this.boothVisuals[i];
      if (!visual) return;
      visual.bg.setFillStyle(this.boothColor(booth.state), 1);

      // 雅座上的操作进度：领座、烹饪、传菜共用一条
      let fraction = 0;
      if (booth.state === "seating" || booth.state === "serving") {
        const task = [...this.staffRt.values()].find((rt) => rt.task?.boothIndex === i && rt.task.kind !== "cook")?.task;
        if (task) fraction = (time - task.startedAt) / Math.max(1, task.duration);
      } else if (booth.state === "cooking") {
        fraction = (time - booth.cookStartedAt) / Math.max(1, booth.cookDoneAt - booth.cookStartedAt);
      }
      const showBar = this.gameState === "open" && booth.floor === this.activeFloor && fraction > 0;
      visual.barBg.setVisible(showBar);
      visual.barFill.setVisible(showBar);
      if (showBar) {
        visual.barFill.width = visual.barBg.width * Phaser.Math.Clamp(fraction, 0, 1);
        visual.barFill.setFillStyle(COLOR_STAFF, 1);
      }
    });
  }

  boothColor(this: TavernScene, state: BoothState): number {
    return {
      empty: 0x3a3a3a,
      seating: 0x8a6d3b,
      awaitingCook: 0x7a5a2a,
      cooking: 0xc97a2a,
      awaitingServe: 0xb08a2a,
      serving: 0x9a8a3a,
      dining: 0x4a7a3a,
    }[state];
  }

  log(this: TavernScene, text: string) {
    this.chronicleLines.push(text);
    if (this.chronicleLines.length > CHRONICLE_MAX_LINES) this.chronicleLines.shift();
  }

  /** 对无效操作给出一次可见提示，避免“点了没反应”的错觉。 */
  showHint(this: TavernScene, message: string) {
    if (this.focusing) return;
    if (this.time.now - this.lastHintAt < 1400) return;
    this.lastHintAt = this.time.now;
    const toast = this.add
      .text(SCREEN_W / 2, 142, message, {
        fontSize: "18px",
        color: "#ffe6c8",
        backgroundColor: "rgba(30,22,15,0.9)",
        padding: { x: 12, y: 6 },
        align: "center",
        wordWrap: { width: 560 },
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(45)
      .setAlpha(0);
    this.hintToast?.destroy();
    this.hintToast = toast;
    this.tweens.add({
      targets: toast,
      alpha: 1,
      y: 146,
      duration: 180,
      yoyo: true,
      hold: 1400,
      ease: "Sine.easeOut",
      onComplete: () => {
        if (this.hintToast === toast) this.hintToast = undefined;
        toast.destroy();
      },
    });
  }
}
