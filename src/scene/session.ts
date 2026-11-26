// 一局的生命周期：固定倒计时、后台模拟、硬停、延后结算；三个视图之间的切换；现实天色。
import Phaser from "phaser";
import { playSfx } from "../audio";
import { clearBooth, departBooth } from "../booth";
import { GAME } from "../config";
import {
  DISHES,
  gainReputation,
  getArrivalSchedule,
  getDailyGoal,
  getDailyGoalOptions,
  getDailyRent,
  getDaylightProgress,
  getEventSchedule,
  getFestivalGoalMultiplier,
  getFloorRent,
  getGoalPayout,
  getGoalProgress,
  getLoanDue,
  getNightProgress,
  getRealClockLabel,
  getRealMinutes,
  getRepLevelInfo,
  getSessionDurationMs,
  getStreakBonus,
  GOAL_STREAK_TARGET,
  hasRecipe,
  isDaylight,
  isFestivalDay,
  loseReputation,
  NIGHT_COLOR,
  realSkyColor,
  REP_GAIN_RARE,
  REP_GAIN_SERVED,
  updateMeta,
} from "../logic";
import { CAMERA_CLOSED_X, CAMERA_OPEN_X, FLOOR_Y, MAX_EVENTS_PER_SESSION, SCREEN_H, SCREEN_W } from "./constants";
import type { TavernScene } from "./TavernScene";

export class SessionMethods {
  /** 准备阶段（已结算、未开业）才能操作管理；营业中与待结算只读。 */
  canManage(this: TavernScene): boolean {
    return this.session === "idle" && !this.settling;
  }

  // ===== 营业（后台倒计时）=====
  tickRunningSession(this: TavernScene, time: number) {
    if (this.session !== "running") return;
    const elapsed = time - this.sessionStartedAt;
    if (elapsed >= getSessionDurationMs()) {
      this.hardStopSession();
      return;
    }
    // 名单是开市时按声望锁定的；到店时刻铺满整个倒计时
    if (this.patronsSpawned < this.patronsTotal && elapsed >= this.arrivalTimes[this.patronsSpawned]) {
      this.spawnPatron(time);
      this.patronsSpawned += 1;
    }
    if (this.eventsThisSession < this.eventTimes.length && elapsed >= this.eventTimes[this.eventsThisSession]) {
      this.triggerRandomEvent();
    }

    this.queue = this.queue.filter((patron) => {
      // 还在路上（走进来、御剑落地）的客人不算排队，耐心从站定那一刻起算
      if (!patron.char.arrived) patron.expiresAt = time + patron.patienceMs;
      if (time >= patron.expiresAt) {
        this.sessionLost += 1;
        this.pendingRepLoss += 1;
        if (this.focusChar === patron.char) this.returnFromFocus();
        patron.char.say("等太久了……", "cold");
        this.patronWalk(patron.char, patron.kind, 1620, true, () => patron.char.destroy());
        this.log(`${patron.kind.name}候得不耐，拂袖离去`);
        return false;
      }
      return true;
    });
    this.queue.forEach((patron) => {
      patron.char.setPatience((patron.expiresAt - time) / patron.patienceMs);
    });

    this.resolveStaffTasks(time);

    this.booths.forEach((booth, index) => {
      if (booth.state === "cooking" && time >= booth.cookDoneAt) {
        this.finishCook(index, time);
      } else if (booth.state === "dining" && time >= booth.departAt && booth.currentDish) {
        // 售价依赖当天的招牌、楼层与等级，在桌子清空前算好
        const price = this.boothPrice(booth, booth.currentDish);
        const r = departBooth(booth, time);
        if (!r) return;
        const { matched, hasWish } = r;
        const dishName = r.dish.name;
        const guest = r.name ?? r.kind?.name ?? "食客";
        if (hasWish && !matched) booth.patronChar?.say("这不是我想吃的……", "cold");
        this.walkPatronOut(booth, r.kind, false);
        playSfx("coin");
        this.showCoinPopup(this.tablePosition(index).x, FLOOR_Y - 120, price);
        this.sessionServed += 1;
        this.notifyTask("serve");
        this.sessionRevenue += price;
        if (matched) {
          this.sessionWishes += 1;
          this.showWishReaction(this.tablePosition(index).x, FLOOR_Y - 140);
        }
        this.announceGoalIfReached();
        // 吃到想吃的，或本来就没点名、安稳吃完的，都可能记住这家店
        if (r.rememberDishId) this.rememberRegular(r.name, r.kind, r.rememberDishId, r.regular);
        this.log(
          matched
            ? `${guest}吃到了想吃的${dishName}，满意离店，收入 +${price} 灵石`
            : hasWish
              ? `${guest}没吃到想吃的${dishName}，只付半价，收入 +${price} 灵石`
              : `${guest}用罢${dishName}离店，收入 +${price} 灵石`,
        );
        const rare = (r.kind?.priceFactor ?? 1) >= GAME.rarePriceFactor;
        this.gainReputationFor(rare);
        if (this.session === "running") this.save();
      }
    });

    this.assignStaffWork();
    // 两桌同时用膳时，每 7 秒至少给一次碰杯，不靠随机闲聊撞运气
    if (!this.focusing && time - this.lastClinkAt > 7000) {
      const dining = this.booths.filter((b) => b.state === "dining" && b.patronChar);
      if (dining.length >= 2) this.showClink(dining[0].patronChar!, dining[1].patronChar!);
    }

    this.flushRepLoss();
  }

  /** 倒计时归零：立刻清场，未结账的客人不计收入、不扣声望。 */
  hardStopSession(this: TavernScene) {
    if (this.session !== "running") return;
    this.speedupConfirm = null;
    this.session = "ended";
    this.hardStopCleared =
      this.queue.length + this.booths.filter((booth) => booth.state !== "empty").length;
    if (this.focusing) this.returnFromFocus();
    this.queue.forEach((patron) => patron.char.destroy());
    this.queue = [];
    this.booths.forEach((booth) => {
      booth.patronChar?.destroy();
      booth.patronChar = undefined;
      booth.diningProp?.destroy();
      booth.diningProp = undefined;
      clearBooth(booth);
    });
    this.staffRt.forEach((rt) => {
      rt.task = null;
      rt.char.setCarrying(false);
    });
    this.log(`营业倒计时结束，打烊清场${this.hardStopCleared > 0 ? `（${this.hardStopCleared} 位未结账）` : ""}`);
    this.showEventToast("营业结束", true);
    if (this.view === "business") this.settleFinishedSession();
    else if (this.view === "cultivation") this.seatForNight();
  }

  // ===== 视图切换 =====
  /** 回主界面：营业可以在后台继续跑。 */
  enterHome(this: TavernScene) {
    if (false) return;
    const apply = () => {
      this.destroyOverlay();
      this.stopCelebration();
      this.settling = false;
      this.focusTimer?.remove();
      this.focusTimer = undefined;
      this.focusing = false;
      this.clearFocusCard();
      this.setFocusUiHidden(false);
      this.view = "home";
      const cam = this.cameras.main;
      cam.centerOn(CAMERA_CLOSED_X, SCREEN_H / 2);
      cam.setZoom(1);
      this.positionUi(false);
      this.refreshHud();
    };
    if (this.view === "business" && !this.transitioning) {
      this.transitioning = true;
      this.cameras.main.fadeOut(220, 0, 0, 0, () => {
        apply();
        this.cameras.main.fadeIn(220, 0, 0, 0);
        this.transitioning = false;
      });
    } else {
      apply();
    }
  }

  /** 进营业视图；如果这一局已经打烊，进来即结算。 */
  enterBusinessView(this: TavernScene) {
    if (this.transitioning) return;
    const apply = () => {
      this.view = "business";
      this.settling = false;
      const cam = this.cameras.main;
      cam.centerOn(CAMERA_OPEN_X, SCREEN_H / 2);
      cam.setZoom(1);
      // 若刚从修炼视图过来，先把打坐的人放回各自站位，再结算/庆祝
      if (this.session === "ended") {
        for (const e of this.workforce()) {
          const rt = this.staffRt.get(e.id);
          if (!rt) continue;
          rt.task = null;
          rt.char.setCarrying(false);
          rt.char.setMeditating(false);
          if (this.isGathering(e.id)) {
            rt.char.setVisible(false);
            continue;
          }
          const home = this.staffHome(e);
          rt.char.teleportTo(home.x, home.y);
        }
      }
      this.positionUi(true);
      this.refreshHud();
      if (this.session === "ended") this.settleFinishedSession();
    };
    if (this.view === "business") {
      apply();
      return;
    }
    this.destroyOverlay();
    this.stopCelebration();
    this.transitioning = true;
    this.cameras.main.fadeOut(220, 0, 0, 0, () => {
      apply();
      this.cameras.main.fadeIn(220, 0, 0, 0);
      this.transitioning = false;
    });
  }

  /** 进修炼视图；营业可以继续在后台跑，这时法坛上没有人。 */
  enterCultivationView(this: TavernScene) {
    if (this.transitioning) return;
    const apply = () => {
      this.view = "cultivation";
      this.settling = false;
      this.stopCelebration();
      const cam = this.cameras.main;
      cam.centerOn(CAMERA_CLOSED_X, SCREEN_H / 2);
      cam.setZoom(1);
      if (this.session !== "running") this.seatForNight();
      this.positionUi(false);
      this.refreshHud();
    };
    if (this.view === "business") {
      this.destroyOverlay();
      this.transitioning = true;
      this.cameras.main.fadeOut(220, 0, 0, 0, () => {
        apply();
        this.cameras.main.fadeIn(220, 0, 0, 0);
        this.transitioning = false;
      });
    } else {
      apply();
    }
  }

  // ===== 回合 =====
  openMenu(this: TavernScene) {
    if (this.session !== "idle" || this.transitioning) return;
    this.refreshTodayWeather();
    this.view = "menu";
    this.buildMenuOverlay();
  }

  startSession(this: TavernScene) {
    if (this.session !== "idle") return;
    const menu = this.getMenuDishes();
    if (menu.length === 0 || !menu.some((dish) => hasRecipe(this.inventory, dish.recipe)) || this.transitioning) return;
    this.destroyOverlay();
    this.stopCelebration();
    this.transitioning = true;

    this.cameras.main.fadeOut(450, 0, 0, 0, () => {
      this.session = "running";
      this.view = "business";
      this.settling = false;
      this.hardStopCleared = 0;
      // 跨过零点后重新取天气：同一天内始终一致
      this.refreshTodayWeather();
      this.cameras.main.centerOn(CAMERA_OPEN_X, SCREEN_H / 2);
      this.cameras.main.setZoom(1);
      this.focusTimer?.remove();
      this.focusing = false;
      this.positionUi(true);
      this.sessionStartedAt = this.time.now;

      this.queue.forEach((p) => p.char.destroy());
      this.queue = [];
      this.booths.forEach((booth) => {
        booth.patronChar?.destroy();
        booth.patronChar = undefined;
        booth.diningProp?.destroy();
        booth.diningProp = undefined;
        clearBooth(booth);
      });
      this.pendingFireId = null;

      for (const e of this.workforce()) {
        const rt = this.staffRt.get(e.id);
        if (!rt) continue;
        rt.task = null;
        rt.floor = 0;
        rt.char.setCarrying(false);
        rt.char.setMeditating(false);
        rt.char.setDepth(20);
        if (this.isGathering(e.id)) {
          rt.char.setVisible(false);
          continue;
        }
        const h = this.staffHome(e);
        rt.char.teleportTo(h.x, h.y);
      }

      this.dishCursor = 0;
      this.sessionServed = 0;
      this.firstGuestShown = false;
      this.activeFloor = 0;
      this.applyFloorLook();
      this.relayoutTables();
      this.refreshBoothVisibility();
      this.refreshFloorTabs();
      this.sessionRevenue = 0;
      this.sessionLost = 0;
      this.sessionWishes = 0;
      this.stockLost = 0;
      this.queueLost = 0;
      this.lastGift = null;
      this.goalAnnounced = false;
      this.regularsToday.clear();
      this.regularDueToday = this.regulars.length > 0;
      this.lastClinkAt = 0;
      this.sessionGoal = this.currentDayGoal();
      const specialDish = DISHES.find((d) => d.id === this.currentDailySpecial());
      if (specialDish) {
        const base = this.baseDishPrice(specialDish);
        const pct = base > 0 ? Math.round((this.dishPrice(specialDish) / base - 1) * 100) : 0;
        this.log(`今日招牌：${specialDish.name}，售价 +${pct}%`);
      }
      this.log(`今日天气：${this.weather.name}——${this.weather.desc}`);
      // 名单在开市时按声望锁定：营业中升级/掉级次日才生效
      const baseCount = getRepLevelInfo(this.reputation).patrons;
      // 灯会多来几位；第 1 天少来一位当教学缓冲
      const dayCount = baseCount + (isFestivalDay(this.day) ? GAME.festival.extraPatrons : 0);
      this.patronsTotal = Math.max(1, dayCount - (this.day === 1 ? GAME.session.firstDayFewerPatrons : 0));
      this.patronsSpawned = 0;
      this.pendingRepLoss = 0;
      this.repGainedToday = 0;
      this.repLostToday = 0;
      this.arrivalTimes = getArrivalSchedule(this.patronsTotal, Math.random);
      // 随机事件按当天人数缩放：约每 5 位客人 1 次，最多 4 次
      const eventCount = Math.min(
        MAX_EVENTS_PER_SESSION,
        Math.max(1, Math.floor(this.patronsTotal / GAME.events.patronsPerEvent)),
      );
      this.eventTimes = getEventSchedule(eventCount, Math.random);
      this.eventsThisSession = 0;
      this.grantDailyGift();
      this.notifyTask("start_session");
      // 开局先落一次快照：之后中途关页也能按提前打烊收回这天的收入
      this.save();
      playSfx("open");
      this.log("开张大吉，今日营业开始");
      this.showDayBanner();
      if (this.day === 1) this.showHint("掌柜会按伙计页的分工自动干活，营业结束后去伙计页调整顺序");

      this.cameras.main.fadeIn(450, 0, 0, 0);
      this.transitioning = false;
    });
  }

  /** 今日目标的当前进度（收入或满足口味的人数）。 */
  sessionGoalProgress(this: TavernScene): number {
    if (!this.sessionGoal) return 0;
    return getGoalProgress(this.sessionGoal, {
      served: this.sessionServed,
      revenue: this.sessionRevenue,
      wishes: this.sessionWishes,
    });
  }

  /** 结账后看目标是否刚好达成，达成那一刻提示一次。 */
  announceGoalIfReached(this: TavernScene) {
    if (this.goalAnnounced || !this.sessionGoal || this.sessionGoalProgress() < this.sessionGoal.target) return;
    this.goalAnnounced = true;
    playSfx("upgrade");
    this.showEventToast("今日目标达成", true);
  }

  /** 服务完一位客人加声望；稀客登门，名声传得更远。 */
  gainReputationFor(this: TavernScene, rare: boolean) {
    const gain = rare ? REP_GAIN_RARE : REP_GAIN_SERVED;
    this.reputation = gainReputation(this.reputation, gain);
    this.repGainedToday += gain;
  }

  /** 同一帧里积累的流失一次性结算：一批最多掉一级。 */
  flushRepLoss(this: TavernScene) {
    if (this.pendingRepLoss <= 0) return;
    this.reputation = loseReputation(this.reputation, this.pendingRepLoss);
    this.repLostToday += this.pendingRepLoss;
    this.pendingRepLoss = 0;
  }

  /** 玩家打开已打烊的一局：扣工资/租金、发目标奖励、天数 +1、记欠债天数。 */
  settleFinishedSession(this: TavernScene) {
    if (this.session !== "ended" || this.settling) return;
    this.focusTimer?.remove();
    this.focusTimer = undefined;
    this.focusing = false;
    this.focusChar = undefined;
    this.clearFocusCard();
    this.setFocusUiHidden(false);
    this.settling = true;
    this.staffRt.forEach((rt) => {
      rt.task = null;
      rt.char.setCarrying(false);
    });
    this.flushRepLoss();
    this.displayedCoins = this.coins;
    playSfx("close");
    this.log("打烊，今日营业结束");
    this.lastWages = this.settleWages();
    this.lastLoanDues = this.settleLoans();
    this.lastRent = getDailyRent(this.level) + getFloorRent(this.floorsBuilt);
    this.coins -= this.lastRent;
    this.settleDailyGoal();
    this.meta = updateMeta(this.meta, {
      served: this.sessionServed,
      revenue: this.sessionRevenue,
      goalMet: this.lastGoalResult?.met ?? false,
      realmIndex: this.realmIndex(),
      day: Math.max(1, this.day - 1),
      level: this.level,
    });
    // 余额为负即欠债：不清档，只是不能扩张、常客不来（ADR-0020）
    this.negativeStreak = this.coins < 0 ? this.negativeStreak + 1 : 0;
    // 结算完成后这一局就结束了；待结算状态不落盘
    this.session = "idle";
    this.startCelebration();
    this.buildSettlementOverlay();
    this.save();
  }

  /** 每回合按剩余本息均摊一期。 */
  settleLoans(this: TavernScene): { name: string; due: number }[] {
    const details: { name: string; due: number }[] = [];
    for (const loan of this.activeLoans) {
      if (loan.periodsLeft <= 0) continue;
      const due = getLoanDue(loan.remaining, loan.periodsLeft);
      loan.remaining -= due;
      loan.periodsLeft -= 1;
      this.coins -= due;
      details.push({ name: loan.name, due });
    }
    this.activeLoans = this.activeLoans.filter((l) => l.periodsLeft > 0);
    this.displayedCoins = this.coins;
    return details;
  }

  /** 打烊时结算今日目标，发了奖励再翻到第二天。 */
  settleDailyGoal(this: TavernScene) {
    const goal = this.sessionGoal;
    const sessionDay = this.day;
    this.day += 1;
    // 换日时保留玩家刚选的目标类型，只把目标值/奖励更新到新等级与天数
    const nextOptions = getDailyGoalOptions(this.day, this.level);
    this.dailyGoal = nextOptions.find((o) => o.kind === goal?.kind) ?? getDailyGoal(this.day, this.level);
    if (!goal) return;
    const stats = { served: this.sessionServed, revenue: this.sessionRevenue, wishes: this.sessionWishes };
    const payout = getGoalPayout(goal, stats);
    if (isFestivalDay(sessionDay)) {
      payout.coins = Math.round(payout.coins * getFestivalGoalMultiplier(sessionDay));
    }
    const streakBonus = getStreakBonus(this.level);
    const qualified = payout.met || payout.partial;
    this.goalStreak = qualified ? this.goalStreak + 1 : 0;
    const streakComplete = this.goalStreak >= GOAL_STREAK_TARGET;
    const streakCount = streakComplete ? GOAL_STREAK_TARGET : this.goalStreak;
    if (streakComplete) this.goalStreak = 0;
    this.lastGoalResult = {
      goal,
      met: payout.met,
      partial: payout.partial,
      progress: payout.progress,
      rewardCoins: payout.coins,
      streakCount,
      streakComplete,
      streakCoins: streakBonus.coins,
    };
    if (!qualified) {
      this.log(`第 ${this.day - 1} 日目标未达成：${goal.label}`);
      return;
    }
    this.coins += payout.coins;
    if (payout.met) this.notifyTask("goal_met");
    this.log(
      payout.met
        ? `第 ${this.day - 1} 日目标达成：${goal.label}，赏 ${payout.coins} 灵石`
        : `第 ${this.day - 1} 日目标差一点：${goal.label}（${payout.progress}/${goal.target}），半赏 ${payout.coins} 灵石`,
    );
    if (streakComplete) {
      this.coins += streakBonus.coins;
      this.log(`三日之约达成：连达 ${GOAL_STREAK_TARGET} 天，额外赏 ${streakBonus.coins} 灵石`);
    }
    this.displayedCoins = this.coins;
  }

  // ===== 现实天色 =====
  /** 唯一的现实时间读取点；Debug 可以覆盖成白天/夜晚方便验证。 */
  realNow(this: TavernScene): Date {
    if (this.debugClockMinutes === null) return new Date();
    return new Date(
      2000,
      0,
      1,
      Math.floor(this.debugClockMinutes / 60) % 24,
      Math.floor(this.debugClockMinutes % 60),
    );
  }

  /** 状态栏最右的现实时辰，如「子初三刻 · 夜 23:45」。 */
  clockLabel(this: TavernScene): string {
    return getRealClockLabel(getRealMinutes(this.realNow()));
  }

  updateSky(this: TavernScene, _time: number) {
    const minutes = getRealMinutes(this.realNow());
    const day = isDaylight(minutes);
    const dayK = getDaylightProgress(minutes);
    const nightK = getNightProgress(minutes);
    const color = realSkyColor(minutes);

    this.skyRect.setFillStyle(color, 1);
    // 营业视图在室内看不到天空：按天色亮度压一层夜色，让「夜晚经营」看得出来
    const lum =
      (0.299 * ((color >> 16) & 0xff) + 0.587 * ((color >> 8) & 0xff) + 0.114 * (color & 0xff)) / 255;
    this.businessNightTint.setAlpha(Phaser.Math.Clamp((0.6 - lum) * 0.7, 0, 0.32));
    this.stars.forEach((star) => star.setVisible(!day));
    // 室内窗户透出的天光与外面同步；夜里窗户只剩余夜色
    if (this.windowViews.length) {
      let winColor = NIGHT_COLOR;
      if (day) {
        const sky = Phaser.Display.Color.IntegerToColor(color);
        const warm = Phaser.Display.Color.IntegerToColor(0x8a6a4a);
        const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(sky, warm, 100, 28);
        winColor = Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);
      }
      this.windowViews.forEach((w) => w.setFillStyle(winColor, 1));
    }

    // 太阳白天从左弧到右，月亮夜里从左弧到右
    const k = day ? dayK : nightK;
    const x = 80 + (SCREEN_W - 160) * k;
    const y = 250 - Math.sin(Math.PI * k) * 170;
    this.sunMoon.setPosition(x, y);
    this.sunMoon.setFillStyle(day ? 0xffe8a0 : 0xdfe6ff, 1);
    this.sunMoon.setRadius(day ? 34 : 26);
    // 夜里给月亮咬出一弯缺口
    this.moonShadow.setVisible(!day);
    this.moonHalo.setVisible(!day);
    if (!day) {
      this.moonShadow.setPosition(x + 12, y - 8).setRadius(24).setFillStyle(color, 1);
      this.moonHalo.setPosition(x, y);
    }
  }
}
