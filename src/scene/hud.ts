// 每帧刷新的 HUD：状态栏文字、按钮状态、雅座进度条、见闻录与提示。
import Phaser from "phaser";
import { playSfx } from "../audio";
import { GAME } from "../config";
import { DISHES, REALMS, getGoalProgress, getNextRealm, getNextRepThreshold, getPurchaseDuration, getRepLevelInfo, getTotalBoothCount, isRarePatron } from "../logic";
import { CHRONICLE_MAX_LINES, COLOR_PLAYER, COLOR_STAFF, PURCHASE_AMOUNT, SCREEN_W, XIAN_FONT } from "./constants";
import type { BoothState } from "./types";
import type { TavernScene } from "./TavernScene";

export class HudMethods {
  refreshHud(this: TavernScene) {
    if (this.focusing) return;
    const open = this.gameState === "open";
    this.playerLabel.setVisible(open);
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
      const nextIn = Math.max(0, Math.ceil((this.nextArrivalAt - this.time.now) / 1000));
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
    const next = getNextRealm(this.cultivation);
    this.realmText.setText(`境界：${REALMS[this.realmIndex()].name}`);
    this.cultivationText.setText(
      next ? `修为 ${this.cultivation}/${next.cultivation}` : `修为 ${this.cultivation} 圆满`,
    );
    if (this.settling) {
      this.sessionText.setText("已打烊");
      this.goalText.setText("");
    } else if (open && this.sessionGoal) {
      const busyLabel = this.playerSeat
        ? "招待中"
        : this.playerCookingBooth !== null
          ? "烹饪中"
          : this.playerPurchasing
            ? "采购中"
            : "";
      this.sessionText.setText(
        `已服务 ${this.sessionServed}/${this.patronsTotal} · ${this.sessionRevenue}灵石${
          busyLabel ? ` · 掌柜${busyLabel}` : ""
        }`,
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
      // 打烊页：奖励明细留给菜单目标卡，HUD 只留日期、天时与目标，避免长行压到画面
      this.sessionText.setText(`第 ${this.day} 日 · 天时：${this.omen.name} · ${goal.label}`);
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
    const showOmen = open && !this.settling;
    this.omenBadge.setVisible(showOmen);
    this.omenBadge.setText(`天时 · ${this.omen.name}（${this.omen.short}）`);
    this.comboBadge.setVisible(showOmen && this.combo > 0);
    this.comboBadge.setText(`连击 ×${this.combo} · 收益 +${this.combo * 5}%`);

    const menu = this.getMenuDishes();
    const canServeBeforeClose = menu.some((dish) => this.canFinishBeforeClose(dish, "player"));
    const wished = new Set(
      this.booths
        .filter((booth) => booth.state === "awaitingCook" && booth.floor === this.activeFloor)
        .map((booth) => booth.patronWish)
        .filter((id): id is string => typeof id === "string"),
    );
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
        (booth.state === "awaitingCook" || booth.state === "seating" || booth.state === "cooking") &&
        !(booth.patronChar?.isSpeaking() ?? false);
      visual.label.setVisible(showLabel);
      const regular = booth.patronRegular;
      visual.label.setColor(
        booth.state === "awaitingCook" && !canServeBeforeClose
          ? "#ff9a8a"
          : (kind && isRarePatron(kind)) || regular
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
            : "入座";
      visual.label.setText(showLabel ? labelText : "");
    });

    const busy = this.isPlayerBusy();
    const showChips = open && !this.settling;
    const specialId = this.currentDailySpecial();
    const specialDish = specialId ? DISHES.find((d) => d.id === specialId) : undefined;
    this.dishChipLabel.setVisible(showChips);
    this.dishChipLabel.setText("出菜 · 点菜名");
    this.dishChips.forEach((chip, i) => {
      const dish = menu[i];
      chip.setVisible(showChips && dish !== undefined);
      if (!dish) return;
      const finishable = this.canFinishBeforeClose(dish, "player");
      chip.setAlpha(showChips ? (busy || !finishable ? 0.5 : 1) : 1);
      const wanted = wished.has(dish.id);
      const special = dish.id === specialDish?.id;
      chip.setText(`${wanted ? "★" : ""}${special ? "◆" : ""}${dish.name} ${this.dishPrice(dish)}`);
      chip.setBackgroundColor(special ? "#4a3a14" : wanted ? "#6a4a14" : "#2e2119");
    });

    this.startButton.setText(open ? "提前打烊" : "开始营业");
    this.serveButton.setText(this.playerSeat ? "招待中…" : "招待入座");
    this.cookButton.setText(this.playerCookingBooth !== null ? "烹饪中…" : "动手烹饪");

    const actionAlpha = this.settling ? 0.4 : busy ? 0.35 : 1;
    this.startButton.setAlpha(this.settling ? 0.4 : 1);
    this.serveButton.setAlpha(actionAlpha);
    this.cookButton.setAlpha(actionAlpha);

    const guideVisible =
      open && this.day === 1 && this.tutorialHintStage >= 1 && this.tutorialHintStage <= 2 && !this.focusing;
    this.tutorialBanner.setVisible(guideVisible);
    if (guideVisible) {
      this.tutorialBanner.setText(
        this.tutorialHintStage === 1
          ? "① 点「招待入座」把客人领进来"
          : "② 点下方菜名出菜；★是客人想吃的菜",
      );
    }

    this.serveButton.setVisible(open);
    this.cookButton.setVisible(open);
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
    this.purchaseButton.setVisible(true);

    this.staffButton.setText("伙计");
    this.bankButton.setText("灵石商行");
    this.cultivationButton.setText("修行 · 境界");
    this.helpButton.setText("玩法");
    this.recordButton.setText("账簿");
    this.saveButton.setText("存档");

    this.serveButton.setText("招待入座");
    this.cookButton.setText("动手烹饪");

    const purchasePriceLabel = this.purchasePrice(open);
    if (this.playerPurchasing && open) {
      const left = Math.max(
        0,
        Math.ceil(
          (this.playerPurchasing.startedAt + this.playerPurchasing.duration - this.time.now) / 1000,
        ),
      );
      this.purchaseButton.setLabel(`急购中… ${left}s（暂停招待/烹饪）`);
    } else {
      this.purchaseButton.setLabel(
        open
          ? `急购 +${PURCHASE_AMOUNT}（${purchasePriceLabel} 灵石，约 ${Math.round((getPurchaseDuration(this.level) * GAME.purchase.emergencyDurationScale) / 1000)}s）`
          : `备货 +${PURCHASE_AMOUNT}（${purchasePriceLabel} 灵石）`,
      );
    }
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

    const playerPurchaseFraction = this.playerPurchasing
      ? (time - this.playerPurchasing.startedAt) / this.playerPurchasing.duration
      : 0;
    this.purchaseButton.setProgress(playerPurchaseFraction, 0);
    this.purchaseButton.setEnabled(!this.isPlayerBusy() && !this.settling);

    this.booths.forEach((booth, i) => {
      const visual = this.boothVisuals[i];
      if (!visual) return;
      visual.bg.setFillStyle(this.boothColor(booth.state), 1);

      // 雅座上的操作进度：上座与烹饪共用一条，颜色区分玩家/伙计
      let fraction = 0;
      let color = COLOR_PLAYER;
      if (booth.state === "seating") {
        const progress =
          this.playerSeat?.boothIndex === i
            ? this.playerSeat
            : ([...this.staffRt.values()].find((rt) => rt.seat?.boothIndex === i)?.seat ?? null);
        if (progress) {
          fraction = (time - progress.startedAt) / progress.duration;
          color = this.playerSeat === progress ? COLOR_PLAYER : COLOR_STAFF;
        }
      } else if (booth.state === "cooking") {
        fraction = (time - booth.cookStartedAt) / Math.max(1, booth.cookDoneAt - booth.cookStartedAt);
        color = booth.cookingDriver === "player" ? COLOR_PLAYER : COLOR_STAFF;
      }
      const showBar = this.gameState === "open" && booth.floor === this.activeFloor && fraction > 0;
      visual.barBg.setVisible(showBar);
      visual.barFill.setVisible(showBar);
      if (showBar) {
        visual.barFill.width = visual.barBg.width * Phaser.Math.Clamp(fraction, 0, 1);
        visual.barFill.setFillStyle(color, 1);
      }
    });
  }

  boothColor(this: TavernScene, state: BoothState): number {
    return { empty: 0x3a3a3a, seating: 0x8a6d3b, awaitingCook: 0x7a5a2a, cooking: 0xc97a2a, dining: 0x4a7a3a }[state];
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
