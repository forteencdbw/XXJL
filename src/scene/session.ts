// 一天的生命周期：营业中每帧推进、开张、打烊结算（工资/还贷/目标/破产）、天色。
import Phaser from "phaser";
import { playSfx } from "../audio";
import { GAME } from "../config";
import { ARRIVAL_MAX_MS, ARRIVAL_MIN_MS, BANKRUPT_STREAK, DISHES, GOAL_STREAK_TARGET, NIGHT_COLOR, REALMS, REP_GAIN_RARE, REP_GAIN_SERVED, gainReputation, getArrivalInterval, getDailyGoal, getDailyGoalOptions, getDailyRent, getFestivalGoalMultiplier, getFloorRent, getGoalPayout, getLoanDue, getRealmClosingIngredients, getRepLevelInfo, getStreakBonus, isFestivalDay, loseReputation, skyColorAt, updateMeta } from "../logic";
import { ACTOR_Y, CAMERA_CLOSED_X, CAMERA_OPEN_X, DINING_MS, FLOOR_Y, MAX_EVENTS_PER_SESSION, NOMINAL_MS_PER_PATRON, PLAYER_HOME, PURCHASE_AMOUNT, PURCHASE_TARGET_STOCK, ROUND_END_DELAY_MS, SCREEN_H, SCREEN_W, SESSION_HARD_STOP_MS, SKY_TRANSITION_MS } from "./constants";
import type { TavernScene } from "./TavernScene";

export class SessionMethods {
  tickOpenSession(this: TavernScene, time: number) {
    // 名单是开市时按声望锁定的；到店间隔只决定拥挤度，不再决定人数
    if (this.patronsSpawned < this.patronsTotal && time >= this.nextArrivalAt) {
      this.spawnPatron(time);
      this.patronsSpawned += 1;
      this.nextArrivalAt = time + getArrivalInterval(this.level, Phaser.Math.Between(ARRIVAL_MIN_MS, ARRIVAL_MAX_MS));
    }

    // 随机事件按当天人数缩放：约每 5 位客人 1 次，最多 4 次
    const eventCap = Math.min(MAX_EVENTS_PER_SESSION, Math.max(1, Math.floor(this.patronsTotal / GAME.events.patronsPerEvent)));
    if (this.eventsThisSession < eventCap && time >= this.nextEventAt) {
      this.triggerRandomEvent(time);
    }

    this.queue = this.queue.filter((patron) => {
      if (time >= patron.expiresAt) {
        this.sessionLost += 1;
        this.pendingRepLoss += 1;
        if (this.focusChar === patron.char) this.returnFromFocus();
        patron.char.say("等太久了……", "cold");
        patron.char.walkTo(1620, ACTOR_Y, 500, () => patron.char.destroy());
        this.log(`${patron.kind.name}候得不耐，拂袖离去`);
        return false;
      }
      return true;
    });
    this.queue.forEach((patron) => {
      patron.char.setPatience((patron.expiresAt - time) / patron.patienceMs);
    });

    this.playerSeat = this.resolveSeat(this.playerSeat, time, "player");
    for (const e of this.employees) {
      const rt = this.staffRt.get(e.id);
      if (rt) rt.seat = this.resolveSeat(rt.seat, time, "staff", e);
    }

    this.booths.forEach((booth, index) => {
      if (booth.state === "cooking" && time >= booth.cookDoneAt) {
        playSfx("cook");
        booth.state = "dining";
        booth.departAt = time + DINING_MS;
        booth.patronChar?.setDining(true);
        this.showDiningProp(index);
        this.log("出餐完毕，食客开始用膳");
        // 另一桌正在用膳时，给一次看得见的碰杯，而不是只等 5.6 秒的随机闲聊
        const other = this.booths.find((b) => b !== booth && b.state === "dining" && b.patronChar);
        const clinkA = booth.patronChar;
        const clinkB = other?.patronChar;
        if (clinkA && clinkB) {
          this.time.delayedCall(250, () => {
            if (clinkA.active && clinkB.active) this.showClink(clinkA, clinkB);
          });
        }
        if (booth.cookingDriver === "player" && this.playerCookingBooth === index) {
          this.playerCookingBooth = null;
          this.moveActorHome("player", "cook");
        }
        const cookRt = booth.cookStaffId === null ? undefined : this.staffRt.get(booth.cookStaffId);
        if (booth.cookingDriver === "staff" && cookRt?.cookingBooth === index) {
          cookRt.cookingBooth = null;
          this.moveActorHome("staff", "cook", this.employeeById(booth.cookStaffId));
        }
      } else if (booth.state === "dining" && time >= booth.departAt) {
        const dish = booth.currentDish;
        const matched = dish !== null && booth.patronWish === dish.id;
        const hasWish = booth.patronWish !== null;
        const priceFactor = booth.patronKind?.priceFactor ?? 1;
        const price = dish ? this.boothPrice(booth, dish) : 0;
        const dishName = dish?.name ?? "菜";
        const guest = booth.patronName ?? booth.patronKind?.name ?? "食客";
        const guestName = booth.patronName;
        const guestKind = booth.patronKind;
        const guestWish = booth.patronWish;
        const guestRegular = booth.patronRegular;
        const personal = booth.cookingDriver === "player";
        booth.state = "empty";
        booth.cookingDriver = null;
        booth.currentDish = null;
        booth.comboBonus = 0;
        booth.patronKind = null;
        booth.patronWish = null;
        booth.patronName = null;
        booth.patronRegular = false;
        booth.diningProp?.destroy();
        booth.diningProp = undefined;
        booth.awaitingSince = 0;
        const leaver = booth.patronChar;
        booth.patronChar = undefined;
        if (this.focusChar === leaver) this.returnFromFocus();
        leaver?.setDining(false);
        leaver?.setSeated(false);
        if (hasWish && !matched) leaver?.say("这不是我想吃的……", "cold");
        leaver?.walkTo(440, ACTOR_Y, 500, () => leaver.destroy());
        playSfx("coin");
        this.showCoinPopup(this.tablePosition(index).x, FLOOR_Y - 120, price);
        this.sessionServed += 1;
        this.sessionRevenue += price;
        if (matched) {
          this.sessionWishes += 1;
          this.showWishReaction(this.tablePosition(index).x, FLOOR_Y - 140);
        }
        // 吃到想吃的，或本来就没点名、安稳吃完的，都可能记住这家店
        if (matched) this.rememberRegular(guestName, guestKind, guestWish, guestRegular);
        else if (!hasWish && dish) this.rememberRegular(guestName, guestKind, dish.id, guestRegular);
        this.log(
          matched
            ? `${guest}吃到了想吃的${dishName}，满意离店，收入 +${price} 灵石`
            : hasWish
              ? `${guest}没吃到想吃的${dishName}，只付半价，收入 +${price} 灵石`
              : `${guest}用罢${dishName}离店，收入 +${price} 灵石`,
        );
        const rare = priceFactor >= GAME.rarePriceFactor;
        this.gainReputationFor(rare);
        const cultGain = this.cultivationGainFor(personal, matched, rare);
        this.gainCultivation(cultGain);
        if (cultGain > 0) {
          this.showCultivationPopup(this.tablePosition(index).x, FLOOR_Y - 160, cultGain);
        }
      }
    });

    this.assignStaffWork(time);
    // 两桌同时用膳时，每 7 秒至少给一次碰杯，不靠随机闲聊撞运气
    if (!this.focusing && time - this.lastClinkAt > 7000) {
      const dining = this.booths.filter((b) => b.state === "dining" && b.patronChar);
      if (dining.length >= 2) {
        this.showClink(dining[0].patronChar!, dining[1].patronChar!);
      }
    }

    this.flushRepLoss();
    if (
      this.patronsSpawned >= this.patronsTotal &&
      this.queue.length === 0 &&
      this.booths.every((booth) => booth.state === "empty")
    ) {
      this.finishSession();
    }
  }

  tickPurchase(this: TavernScene, time: number) {
    if (this.playerPurchasing && time >= this.playerPurchasing.startedAt + this.playerPurchasing.duration) {
      this.inventory += this.playerPurchasing.amount;
      this.log(`采购到货 +${this.playerPurchasing.amount} 灵材`);
      this.playerPurchasing = null;
      this.save();
    }
  }

  tickClosedProcurement(this: TavernScene) {
    const buyer = this.bestBuyer();
    if (!buyer) return;
    // 酒楼越大，备货目标越高，避免高等级时 10 份存货撑不过一局
    const target = PURCHASE_TARGET_STOCK + this.level * GAME.staff.buyerTargetStockPerLevel;
    if (this.inventory >= target) return;
    const price = this.purchasePrice(false);
    let bought = 0;
    while (this.inventory < target && this.coins >= price) {
      this.coins -= price;
      this.displayedCoins = this.coins;
      this.inventory += PURCHASE_AMOUNT;
      bought += PURCHASE_AMOUNT;
      this.staffDidWork(buyer, "buy");
    }
    if (bought > 0) {
      this.displayedCoins = this.coins;
      this.log(`采买伙计补货 +${bought} 灵材`);
    }
  }

  // ===== 昼夜 =====
  updateSky(this: TavernScene, time: number) {
    let t = 1;
    let lit = false;
    if (this.gameState === "open") {
      const elapsed = time - this.sessionStartedAt;
      t = Phaser.Math.Clamp(elapsed / this.sessionNominalMs, 0, 1);
      lit = true;
    } else if (this.gameState === "selectingMenu") {
      t = 1;
    }

    let color = this.gameState === "open" ? skyColorAt(t) : NIGHT_COLOR;
    // 营业开始后的入场过渡：夜晚 → 清晨
    if (this.gameState === "open") {
      const elapsed = time - this.sessionStartedAt;
      if (elapsed < SKY_TRANSITION_MS) {
        const k = elapsed / SKY_TRANSITION_MS;
        const night = Phaser.Display.Color.IntegerToColor(NIGHT_COLOR);
        const dawn = Phaser.Display.Color.IntegerToColor(skyColorAt(t));
        const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(night, dawn, 100, k * 100);
        color = Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);
      }
    }
    this.skyRect.setFillStyle(color, 1);
    const showStars = this.gameState !== "open" || t > 0.8;
    this.stars.forEach((star) => star.setVisible(showStars));
    // 室内窗户透出的天光与外面同步；打烊时窗户只剩余夜色
    if (this.windowViews.length) {
      let winColor = NIGHT_COLOR;
      if (this.gameState === "open") {
        const sky = Phaser.Display.Color.IntegerToColor(color);
        const warm = Phaser.Display.Color.IntegerToColor(0x8a6a4a);
        const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(sky, warm, 100, 28);
        winColor = Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b);
      }
      this.windowViews.forEach((w) => w.setFillStyle(winColor, 1));
    }

    // 日月：营业期间从左侧地平线弧到右侧，夜晚显示月牙色
    if (this.gameState === "open") {
      const x = 80 + (SCREEN_W - 160) * t;
      const y = 250 - Math.sin(Math.PI * t) * 170;
      this.sunMoon.setPosition(x, y);
      this.sunMoon.setFillStyle(t > 0.82 ? 0xdfe6ff : 0xffe8a0, 1);
      this.sunMoon.setRadius(t > 0.82 ? 26 : 34);
    } else {
      this.sunMoon.setPosition(SCREEN_W - 140, 170);
      this.sunMoon.setFillStyle(0xdfe6ff, 1);
      this.sunMoon.setRadius(26);
    }
    // 夜里给月亮咬出一弯缺口；星空同步淡出
    const isMoon = this.gameState !== "open" || t > 0.82;
    this.moonShadow.setVisible(isMoon);
    this.moonHalo.setVisible(isMoon);
    if (isMoon) {
      this.moonShadow
        .setPosition(this.sunMoon.x + 12, this.sunMoon.y - 8)
        .setRadius(24)
        .setFillStyle(color, 1);
      this.moonHalo.setPosition(this.sunMoon.x, this.sunMoon.y);
    }

    // 夜晚时酒楼窗内透出灯火
    if (lit !== this.lastLit) {
      this.lastLit = lit;
      this.drawTavern(this.tavernGfx, lit);
    }
  }

  // ===== 回合 =====
  onStartButton(this: TavernScene) {
    if (this.settling || this.transitioning) return;
    if (this.gameState === "closed") this.openMenu();
    else if (this.gameState === "open") this.endSession();
  }

  openMenu(this: TavernScene) {
    this.refreshTodayOmen();
    this.gameState = "selectingMenu";
    this.buildMenuOverlay();
  }

  startSession(this: TavernScene) {
    if (this.getMenuDishes().length === 0 || this.inventory <= 0 || this.transitioning) return;
    this.destroyOverlay();
    this.transitioning = true;

    this.cameras.main.fadeOut(450, 0, 0, 0, () => {
      this.gameState = "open";
      this.settling = false;
      // 跨过零点后重新取天时：同一天内始终一致
      this.refreshTodayOmen();
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
        booth.state = "empty";
        booth.cookingDriver = null;
        booth.currentDish = null;
        booth.comboBonus = 0;
        booth.cookStartedAt = 0;
        booth.cookDoneAt = 0;
        booth.departAt = 0;
        booth.patronKind = null;
        booth.patronWish = null;
        booth.patronName = null;
        booth.patronRegular = false;
        booth.diningProp?.destroy();
        booth.diningProp = undefined;
        booth.awaitingSince = 0;
      });
      this.playerSeat = null;
      this.playerCookingBooth = null;
      this.pendingFireId = null;

      this.playerChar.teleportTo(PLAYER_HOME.x, PLAYER_HOME.y);
      for (const e of this.employees) {
        const rt = this.staffRt.get(e.id);
        if (!rt) continue;
        rt.seat = null;
        rt.cookingBooth = null;
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
      this.sessionCultivation = 0;
      this.combo = 0;
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
      this.log(`今日天时：${this.omen.name}——${this.omen.desc}`);
      // 名单在开市时按声望锁定：营业中升级/掉级次日才生效
      const baseCount = getRepLevelInfo(this.reputation).patrons;
      // 客流类天时与灯会直接改人数；第 1 天少来一位当教学缓冲
      const omenCount =
        Math.round(baseCount / this.omen.arrivalFactor) + (isFestivalDay(this.day) ? GAME.festival.extraPatrons : 0);
      this.patronsTotal = Math.max(1, omenCount - (this.day === 1 ? GAME.session.firstDayFewerPatrons : 0));
      this.patronsSpawned = 0;
      this.roundEnding = false;
      this.pendingRepLoss = 0;
      this.repGainedToday = 0;
      this.repLostToday = 0;
      this.sessionNominalMs = this.patronsTotal * NOMINAL_MS_PER_PATRON;
      this.sessionEndsAt = this.time.now + SESSION_HARD_STOP_MS;
      const firstArrival = getArrivalInterval(this.level, Phaser.Math.Between(ARRIVAL_MIN_MS, ARRIVAL_MAX_MS));
      // 每天开门后第一位客人都在 2.2 秒内到，避免开局长时间空等
      this.nextArrivalAt = this.time.now + Math.min(firstArrival, 2200);
      this.eventsThisSession = 0;
      this.nextEventAt = this.time.now + Phaser.Math.Between(9000, 16000);
      this.grantDailyGift();
      playSfx("open");
      this.log("开张大吉，今日营业开始");
      this.showDayBanner();

      this.cameras.main.fadeIn(450, 0, 0, 0);
      this.transitioning = false;
    });
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

  /** 名单走完：停顿一下作为清场过场，再弹结算。 */
  finishSession(this: TavernScene) {
    if (this.roundEnding || this.settling) return;
    this.roundEnding = true;
    this.log("最后一位客人离店，开始收摊");
    this.showEventToast("最后一位客人离店，收摊打烊", true);
    this.time.delayedCall(ROUND_END_DELAY_MS, () => this.endSession());
  }

  endSession(this: TavernScene) {
    if (this.settling) return;
    this.focusTimer?.remove();
    this.focusTimer = undefined;
    this.focusing = false;
    this.focusChar = undefined;
    this.clearFocusCard();
    this.setFocusUiHidden(false);
    this.settling = true;
    this.sessionEndsAt = 0;
    if (this.playerPurchasing) {
      this.inventory += this.playerPurchasing.amount;
      this.log(`打烊，采购的灵材到店 +${this.playerPurchasing.amount}`);
      this.playerPurchasing = null;
    }
    this.playerSeat = null;
    this.playerCookingBooth = null;
    this.staffRt.forEach((rt) => {
      rt.seat = null;
      rt.cookingBooth = null;
    });
    this.flushRepLoss();
    // 提前打烊时，名单上还没来的与还在排队的都算流失
    let closeLost = this.queue.length + Math.max(0, this.patronsTotal - this.patronsSpawned);
    this.sessionLost += closeLost;
    this.queue.forEach((p) => p.char.destroy());
    this.queue = [];
    // 打烊结算：已经在用膳的照常收钱；已下锅但没出餐的退回灵材，避免白白损失
    this.booths.forEach((booth) => {
      const dish = booth.currentDish;
      if (dish && booth.state === "dining") {
        const matched = booth.patronWish === dish.id;
        const factor = booth.patronKind?.priceFactor ?? 1;
        const price = this.boothPrice(booth, dish);
        this.coins += price;
        this.sessionServed += 1;
        this.sessionRevenue += price;
        if (matched) this.sessionWishes += 1;
        const personal = booth.cookingDriver === "player";
        const rare = factor >= GAME.rarePriceFactor;
        this.gainReputationFor(rare);
        this.gainCultivation(this.cultivationGainFor(personal, matched, rare));
        this.log(`打烊前最后一桌用罢${dish.name}${matched ? "" : "（口味不合半价）"}，收入 +${price}`);
      } else if (dish && booth.state === "cooking") {
        this.inventory += 1;
        this.sessionLost += 1;
        closeLost += 1;
        this.log(`打烊，${dish.name}未及出餐，灵材退回`);
      } else if (booth.state === "seating" || booth.state === "awaitingCook") {
        this.sessionLost += 1;
        closeLost += 1;
      }
      booth.patronChar?.destroy();
      booth.patronChar = undefined;
      booth.state = "empty";
      booth.cookingDriver = null;
      booth.currentDish = null;
      booth.comboBonus = 0;
      booth.patronKind = null;
      booth.patronWish = null;
      booth.patronName = null;
      booth.patronRegular = false;
      booth.diningProp?.destroy();
      booth.diningProp = undefined;
      booth.awaitingSince = 0;
    });
    if (closeLost > 0) {
      this.reputation = loseReputation(this.reputation, closeLost);
      this.repLostToday += closeLost;
    }
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
    this.updateBankruptStreak();
    // 结算/破产期间锁定副屏，避免重复结算或误买
    this.purchaseButton.setEnabled(false);
    this.startButton.setAlpha(0.4);
    this.serveButton.setAlpha(0.4);
    this.cookButton.setAlpha(0.4);
    // 镜头暂留营业视角，等玩家在结算面板点「打烊」后再拉远过渡
    if (this.gameState === "bankrupt") {
      this.buildBankruptOverlay();
    } else {
      this.startCelebration();
      this.buildSettlementOverlay();
    }
    const closingIngredients = getRealmClosingIngredients(this.realmIndex());
    if (closingIngredients > 0) {
      this.inventory += closingIngredients;
      this.log(`${REALMS[this.realmIndex()].name}境心念一动，打烊时凭空凝出 ${closingIngredients} 灵材`);
    }
    // 破产只重置本局，仙缘保留；其余情况立刻落盘
    if (this.gameState === "bankrupt") this.writeSave(this.freshSave(this.ascensions));
    else this.save();
    // 破产时 update() 不再刷新 HUD，这里只补状态栏的营业提示
    this.sessionText.setText("已打烊");
  }

  /** 从内部视角淡出到黑屏，切到打烊视角后再淡入。 */
  transitionToClosedView(this: TavernScene) {
    if (this.transitioning) return;
    this.stopCelebration();
    this.destroyOverlay();
    this.transitioning = true;
    const cam = this.cameras.main;
    cam.fadeOut(450, 0, 0, 0, () => {
      this.gameState = "closed";
      this.settling = false;
      cam.centerOn(CAMERA_CLOSED_X, SCREEN_H / 2);
      cam.setZoom(1);
      this.positionUi(false);
      cam.fadeIn(450, 0, 0, 0);
      this.transitioning = false;
    });
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
      payout.cultivation += GAME.festival.goalExtraCultivation;
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
      rewardCultivation: payout.cultivation,
      streakCount,
      streakComplete,
      streakCoins: streakBonus.coins,
      streakCultivation: streakBonus.cultivation,
    };
    if (!qualified) {
      this.log(`第 ${this.day - 1} 日目标未达成：${goal.label}`);
      return;
    }
    this.coins += payout.coins;
    this.log(
      payout.met
        ? `第 ${this.day - 1} 日目标达成：${goal.label}，赏 ${payout.coins} 灵石、${payout.cultivation} 修为`
        : `第 ${this.day - 1} 日目标差一点：${goal.label}（${payout.progress}/${goal.target}），半赏 ${payout.coins} 灵石、${payout.cultivation} 修为`,
    );
    this.gainCultivation(payout.cultivation);
    if (streakComplete) {
      this.coins += streakBonus.coins;
      this.gainCultivation(streakBonus.cultivation);
      this.log(
        `三日之约达成：连达 ${GOAL_STREAK_TARGET} 天，额外赏 ${streakBonus.coins} 灵石、${streakBonus.cultivation} 修为`,
      );
    }
    this.displayedCoins = this.coins;
  }

  /** 连续 5 个回合结束为负余额即破产。 */
  updateBankruptStreak(this: TavernScene) {
    if (this.coins < 0) {
      this.negativeStreak += 1;
      if (this.negativeStreak >= BANKRUPT_STREAK) {
        this.gameState = "bankrupt";
        this.log("连续五日亏空，酒楼倒闭了");
      }
    } else {
      this.negativeStreak = 0;
    }
  }
}
