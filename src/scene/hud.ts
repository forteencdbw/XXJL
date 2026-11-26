// 每帧刷新的 HUD：状态栏文字、按钮状态、雅座进度条、见闻录与提示。
import Phaser from "phaser";
import { GAME } from "../config";
import { DISHES, formatCountdown, getGoalStatus, getNextRepThreshold, getQueueStatus, getRepLevelInfo, getSessionDurationMs, getTotalBoothCount, isRarePatron } from "../logic";
import { boothLabel, cookProgress } from "../booth";
import { CHRONICLE_MAX_LINES, COLOR_STAFF, SCREEN_W, XIAN_FONT } from "./constants";
import type { BoothState } from "./types";
import type { TavernScene } from "./TavernScene";

export class HudMethods {
  refreshHud(this: TavernScene) {
    if (this.focusing) return;
    const business = this.view === "business";
    const running = this.session === "running";
    const cultivating = this.view === "cultivation";
    const home = this.view === "home";

    // 掌柜说话时气泡就在头顶，先收起「掌柜」名牌
    this.playerLabel.setVisible(business && this.playerChar.visible && !this.playerChar.isSpeaking());
    if (business) this.playerLabel.setPosition(this.playerChar.x, this.playerChar.y - 120);

    this.coinsText.setText(`灵石：${this.displayedCoins}`);
    this.jadeText.setText(`仙玉：${this.jade}`);
    this.levelText.setText(`酒楼等级：${this.level}`);
    const queue = getQueueStatus({
      queued: this.queue.length,
      cap: getTotalBoothCount(this.level, this.floorsBuilt),
      open: running,
      nextInMs:
        running && this.patronsSpawned < this.patronsTotal
          ? this.sessionStartedAt + (this.arrivalTimes[this.patronsSpawned] ?? 0) - this.time.now
          : null,
    });
    this.queueText.setText(queue.text);
    this.queueText.setColor({ full: "#ff9a8a", next: "#a8d8b0", done: "#d8c8a8", idle: "#d8c8a8" }[queue.tone]);
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
    } else if (running) {
      const remaining = Math.max(0, getSessionDurationMs() - (this.time.now - this.sessionStartedAt));
      this.sessionText.setText(
        `营业中 · 剩余 ${formatCountdown(remaining)} · 已服务 ${this.sessionServed}/${this.patronsTotal} · ${this.sessionRevenue}灵石`,
      );
      if (this.sessionGoal) {
        const goal = getGoalStatus(this.sessionGoal, this.sessionGoalProgress());
        this.goalText.setText(goal.text);
        this.goalText.setColor(goal.reached ? "#a8d8b0" : "#e0c060");
      } else {
        this.goalText.setText("");
      }
    } else if (this.session === "ended") {
      this.sessionText.setText(`第 ${this.day} 日 · 营业结束 · 回主界面【营业】结算`);
      this.goalText.setText(`本局收入 ${this.sessionRevenue} 灵石`);
      this.goalText.setColor("#ffd98a");
    } else {
      const goal = this.currentDayGoal();
      this.sessionText.setText(`第 ${this.day} 日 · 天气：${this.weather.name} · ${goal.label}`);
      // 状态栏常驻回访提示：今天还没领利是就写「待领」，领过则显示连续天数
      const giftPending = this.lastGiftDate !== this.todayKey;
      this.goalText.setText(giftPending ? "今日利是待领" : this.giftStreak > 0 ? `开店 ${this.giftStreak} 天` : "");
      this.goalText.setColor(giftPending ? "#ffd98a" : "#a89472");
    }
    this.chronicleText.setText(
      this.chronicleLines.map((line) => (line.length > 34 ? `${line.slice(0, 33)}…` : line)).join("\n"),
    );
    // 营业视图里把常驻日志收起：给主画面让位，其它视图常驻
    this.chronicleText.setVisible(!business);
    this.weatherBadge.setVisible(!this.settling);
    this.weatherBadge.setText(`天气 · ${this.weather.name}`);

    this.booths.forEach((booth, i) => {
      const visual = this.boothVisuals[i];
      if (!visual) return;
      const kind = booth.patronKind;
      const wishName =
        booth.state === "awaitingCook" ? DISHES.find((d) => d.id === booth.patronWish)?.name : undefined;
      // 用膳中的客人只留碗筷与人物，不再顶着卡片；等待/烹饪才需要信息
      const showLabel =
        business &&
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
      visual.label.setText(showLabel ? boothLabel(booth, this.time.now, wishName, marker) : "");
    });

    // 底部按钮按视图切换
    this.businessHomeButton.setVisible(business);
    this.cultivationButton.setVisible(business);
    this.sessionSpeedupButton.setVisible(business && running && !this.settling);
    const speedupCost = GAME.speedup.session;
    this.sessionSpeedupButton.setText(
      this.isSpeedupConfirm("session") ? `确认加速 · 花 ${speedupCost} 仙玉` : `加速打烊 · ${speedupCost} 仙玉`,
    );
    this.sessionSpeedupButton.setAlpha(this.jade < speedupCost ? 0.5 : 1);
    this.cultivationPageButton.setVisible(cultivating);
    this.cultivationHomeButton.setVisible(cultivating);
    const disabledAlpha = this.settling ? 0.4 : 1;
    this.businessHomeButton.setAlpha(disabledAlpha);
    this.cultivationButton.setAlpha(disabledAlpha);
    this.rightFrame.setVisible(business);
    this.businessNightTint.setVisible(business && !this.settling);
    this.closedBackdrop.setVisible(cultivating);
    this.cultivationNote.setVisible(cultivating && this.session === "running");
    this.refreshFloorTabs();
    // 主界面：门面 + 两张入口卡 + 管理入口；开着页面时收起，避免命中区压到面板
    this.setHomeVisible(home && !this.overlay);
    this.refreshHomeCards();
    this.refreshTaskTracker();
    this.setClosedNavVisible(home && !this.overlay);
    this.navTitle.setText(
      home ? `第 ${this.day} 日 · 天气：${this.weather.name}` : cultivating ? `修炼 · 天气：${this.weather.name}` : "",
    );

    this.upgradeButton.setText(`营造 Lv${this.level}`);
    // 营业中与待结算只读：入口还能进，操作按钮会自己拦
    const readonly = this.session !== "idle";
    [this.staffButton, this.upgradeButton, this.bankButton, this.warehouseButton].forEach((button) =>
      button.setAlpha(readonly ? 0.55 : 1),
    );
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
      } else {
        fraction = cookProgress(booth, time);
      }
      const showBar = this.view === "business" && this.session === "running" && booth.floor === this.activeFloor && fraction > 0;
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
