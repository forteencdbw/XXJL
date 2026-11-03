// 结算弹窗与破产弹窗。
import { BANKRUPT_STREAK, DISHES, GOAL_STREAK_TARGET, getDailyOmen, getDailySpecial, getRepLevelInfo, getUpgradeCost, isFestivalDay, localDateKey } from "../../logic";
import { CARD_W, SCREEN_H, SCREEN_W, STATUS_BAR_H, XIAN_FONT } from "../constants";
import type { TavernScene } from "../TavernScene";

export class SettlementOverlayMethods {
  /** 结算/破产共用弹窗外壳：只遮主屏的 30% 遮罩 + 上半屏卡片 + 入场动画。 */
  buildPopupCard(this: TavernScene, cardHeight: number, depth: number) {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(depth);
    // 遮罩只盖主屏并吞掉主屏内的点击；状态栏与副屏保持原样
    layer.add(
      this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.58).setOrigin(0, 0).setInteractive(),
    );
    const panel = this.add.container(SCREEN_W / 2, STATUS_BAR_H + 16);
    panel.add(
      this.add
        .rectangle(0, 0, CARD_W, cardHeight, 0x0d0a08, 1)
        .setOrigin(0.5, 0)
        .setStrokeStyle(2, 0x9a3a2a),
    );
    for (const [cx, cy] of [
      [-CARD_W / 2 + 8, 8],
      [CARD_W / 2 - 8, 8],
      [-CARD_W / 2 + 8, cardHeight - 8],
      [CARD_W / 2 - 8, cardHeight - 8],
    ] as const) {
      panel.add(this.add.rectangle(cx, cy, 10, 10, 0xd9b45a).setAngle(45));
    }
    panel.setAlpha(0).setScale(0.92);
    this.tweens.add({ targets: panel, alpha: 1, scale: 1, duration: 200, ease: "Sine.easeOut" });
    layer.add(panel);
    this.overlay = layer;
    return { panel, left: -CARD_W / 2 + 28 };
  }

  buildSettlementOverlay(this: TavernScene) {
    const totalWage = this.lastWages.reduce((sum, w) => sum + w.wage, 0);
    const totalLoan = this.lastLoanDues.reduce((sum, d) => sum + d.due, 0);
    const totalRent = this.lastRent;
    const netIncome = this.sessionRevenue - totalWage - totalLoan - totalRent;
    const summary = [
      `今日天时：${this.omen.name} · ${this.omen.short}`,
      ...(this.lastGift
        ? [`开市利是：连续 ${this.lastGift.streak} 天 · +${this.lastGift.coins} 灵石、+${this.lastGift.cultivation} 修为`]
        : []),
      `修为增长：+${this.sessionCultivation}`,
      `声望：${getRepLevelInfo(this.reputation).title} · +${this.repGainedToday} / −${this.repLostToday} → ${this.reputation}`,
      `工资合计：${totalWage} 灵石`,
      `店面租金：${totalRent} 灵石`,
      `商行还账：${totalLoan} 灵石`,
      `余下：${this.coins} 灵石（连亏 ${this.negativeStreak}/${BANKRUPT_STREAK} 日）`,
      `流失食客：${this.sessionLost} 位`,
    ];
    if (this.stockLost > 0) {
      summary.push(`灵材不足流失：${this.stockLost} 位（下次先备货或急购）`);
    }
    if (this.queueLost > 0) {
      summary.push(`排队溢出流失：${this.queueLost} 位（门口排满，先招待）`);
    }
    const nextSpecial = DISHES.find(
      (d) => d.id === getDailySpecial(this.day, this.level, this.unlockedDishIds()),
    );
    // 明日天时按本机日期预告：给「明天再回来看看」一个具体的理由
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowOmen = getDailyOmen(localDateKey(tomorrow));
    summary.push(`明日天时：${tomorrowOmen.name} · ${tomorrowOmen.short}`);
    summary.push(
      isFestivalDay(this.day)
        ? "明日：灯会 · 客流更旺 · 目标赏 ×1.5（别错过）"
        : `明日：${nextSpecial ? `招牌 ${nextSpecial.name}` : "暂无招牌"} · 目标可自选`,
    );
    const nextCost = getUpgradeCost(this.level);
    summary.push(`下一阶：${nextCost} 灵石 → Lv${this.level + 1}，店内会添新陈设`);
    // 卡片高度按明细行数算，保证内容不溢出
    const cardHeight =
      212 +
      (this.lastWages.length > 0 ? 30 + this.lastWages.length * 28 + 10 : 0) +
      (this.lastLoanDues.length > 0 ? 30 + this.lastLoanDues.length * 28 + 10 : 0) +
      (this.lastGoalResult ? 86 : 0) +
      summary.length * 34 +
      100;
    const { panel, left } = this.buildPopupCard(cardHeight, 100);

    panel.add(this.add.text(left, 20, "今日营业结束", { fontSize: "34px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
    // 第一眼先给一天的结论：净赚多少、目标怎么样，而不是一屏会计科目
    panel.add(this.add.text(left, 76, "今日净收益", { fontSize: "17px", color: "#a89472" }));
    panel.add(
      this.add.text(left, 94, `${netIncome >= 0 ? "+" : ""}${netIncome} 灵石`, {
        fontSize: "54px",
        color: netIncome >= 0 ? "#9fe870" : "#ff9a8a",
        fontFamily: XIAN_FONT,
      }),
    );
    panel.add(
      this.add.text(
        left,
        158,
        `服务 ${this.sessionServed} 位 · 收入 ${this.sessionRevenue} · 支出 ${
          totalWage + totalLoan + totalRent
        }`,
        { fontSize: "17px", color: "#c8b8a0" },
      ),
    );
    const goalState = this.lastGoalResult
      ? this.lastGoalResult.met
        ? "目标达成"
        : this.lastGoalResult.partial
          ? "目标差一点"
          : "目标未达成"
      : "";
    const streakState = this.lastGoalResult
      ? this.lastGoalResult.streakComplete
        ? "三日之约达成"
        : `三日之约 ${this.lastGoalResult.streakCount}/${GOAL_STREAK_TARGET}`
      : "";
    panel.add(
      this.add.text(left, 184, [goalState, streakState].filter(Boolean).join(" · "), {
        fontSize: "17px",
        color: this.lastGoalResult?.met ? "#e0c060" : "#a89472",
      }),
    );
    let y = 212;

    if (this.lastWages.length > 0) {
      panel.add(this.add.text(left, y, "伙计工钱", { fontSize: "18px", color: "#aaaaaa" }));
      y += 30;
      for (const w of this.lastWages) {
        panel.add(
          this.add.text(left + 16, y, `${w.name} · ${w.stars} 星 · 日薪 ${w.wage} 灵石`, {
            fontSize: "19px",
            color: "#e8e8e8",
          }),
        );
        y += 28;
      }
      y += 10;
    }

    if (this.lastLoanDues.length > 0) {
      panel.add(this.add.text(left, y, "商行还账", { fontSize: "18px", color: "#aaaaaa" }));
      y += 30;
      for (const d of this.lastLoanDues) {
        panel.add(
          this.add.text(left + 16, y, `${d.name} · 本期还 ${d.due} 灵石`, { fontSize: "19px", color: "#e8e8e8" }),
        );
        y += 28;
      }
      y += 10;
    }

    if (this.lastGoalResult) {
      const {
        goal,
        met,
        partial,
        progress,
        rewardCoins,
        rewardCultivation,
        streakCount,
        streakComplete,
        streakCoins,
        streakCultivation,
      } = this.lastGoalResult;
      panel.add(
        this.add
          .rectangle(left - 8, y - 8, CARD_W - 20, 90, 0x14100c, 0.97)
          .setOrigin(0, 0)
          .setStrokeStyle(1, 0xd9b45a, 0.55),
      );
      panel.add(this.add.text(left, y, `今日目标 · ${goal.label}`, { fontSize: "19px", color: "#e0c9a0" }));
      y += 26;
      panel.add(
        this.add.text(
          left + 16,
          y,
          met
            ? `达成！+${rewardCoins} 灵石、+${rewardCultivation} 修为`
            : partial
              ? `差一点（${progress}/${goal.target}）· 半赏 +${rewardCoins} 灵石、+${rewardCultivation} 修为`
              : `未达成（${progress}/${goal.target}）`,
          { fontSize: "21px", color: met ? "#9fdf6a" : partial ? "#e0c060" : "#999999" },
        ),
      );
      y += 30;
      panel.add(
        this.add.text(
          left + 16,
          y,
          streakComplete
            ? `三日之约达成！额外 +${streakCoins} 灵石、+${streakCultivation} 修为`
            : `三日之约 ${streakCount}/${GOAL_STREAK_TARGET} · 满 ${GOAL_STREAK_TARGET} 天赏 ${streakCoins} 灵石 + ${streakCultivation} 修为`,
          { fontSize: "17px", color: streakComplete ? "#9fdf6a" : "#c8b8a0" },
        ),
      );
      y += 28;
    }

    summary.forEach((line) => {
      panel.add(this.add.text(left, y, line, { fontSize: "21px", color: "#e8e8e8" }));
      y += 34;
    });

    const closeY = y + 16;
    panel.add(
      this.add
        .rectangle(left + 272, closeY + 32, 544, 64, 0x8a2a22)
        .setStrokeStyle(2, 0xd9b45a, 0.75)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => {
          this.stopCelebration();
          this.destroyOverlay();
          this.transitionToClosedView();
        }),
    );
    panel.add(
      this.add
        .text(left + 272, closeY + 32, `打烊 · 进入第 ${this.day} 日`, {
          fontSize: "25px",
          color: "#f5e6c8",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5),
    );
  }

  /** 连续亏空到上限后的破产结算，锁死所有操作。 */
  buildBankruptOverlay(this: TavernScene) {
    const { panel, left } = this.buildPopupCard(300, 150);
    panel.add(this.add.text(left, 22, "酒楼倒闭", { fontSize: "36px", color: "#ff6b6b" }));
    panel.add(this.add.text(left, 90, `连续 ${BANKRUPT_STREAK} 日入不敷出，`, { fontSize: "19px", color: "#dddddd" }));
    panel.add(this.add.text(left, 120, "灵石商行上门封了铺子。", { fontSize: "19px", color: "#dddddd" }));
    panel.add(
      this.add.text(left, 164, `酒楼等级 ${this.level} · 欠款 ${Math.abs(Math.min(this.coins, 0))} 灵石`, {
        fontSize: "19px",
        color: "#dddddd",
      }),
    );
    panel.add(
      this.add.text(
        left,
        this.ascensions > 0 ? 194 : 200,
        this.ascensions > 0 ? `仙缘 ${this.ascensions} 重仍在，重开后带走。` : "一切从头再来。",
        { fontSize: "16px", color: this.ascensions > 0 ? "#c8a8ff" : "#999999" },
      ),
    );
    panel.add(
      this.add
        .text(left, 226, "重开酒楼", {
          fontSize: "20px",
          color: "#ffffff",
          backgroundColor: "#5a2a2a",
          padding: { x: 16, y: 10 },
        })
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => location.reload()),
    );
  }
}
