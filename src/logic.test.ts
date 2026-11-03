import { describe, expect, it } from "vitest";
import {
  BANKRUPT_STREAK,
  DISHES,
  EMPTY_META,
  GIFT_STREAK_CAP,
  LOANS,
  LOAN_PERIODS,
  NIGHT_COLOR,
  WEATHERS,
  formatClock,
  getArrivalSchedule,
  getClockMinutes,
  getEventSchedule,
  getSessionDurationMs,
  PATRON_KINDS,
  RANDOM_EVENTS,
  REALMS,
  applyEvent,
  getAchievements,
  FLOOR_UNLOCKS,
  MAX_FLOORS,
  getBoothCount,
  getFloorBoothCount,
  getFloorPriceMultiplier,
  getFloorRent,
  getPostCapPriceBonus,
  getTotalBoothCount,
  getDailyGoal,
  getDailyGoalOptions,
  getDailyGift,
  getDailyWeather,
  getDailyRent,
  getDailySpecial,
  getFestivalGoalMultiplier,
  getGiftStreak,
  getStreakBonus,
  GOAL_STREAK_TARGET,
  isFestivalDay,
  getDishFans,
  getGoalCoinReward,
  getGoalPayout,
  getGoalProgress,
  getLoanDue,
  isGoalMet,
  getNextRealm,
  pickPatronKind,
  pickPatronName,
  pickRandomEvent,
  getPurchaseDiscount,
  getPurchasePrice,
  getRealmIndex,
  getSignUpgradeCost,
  getRepGain,
  getRepLevel,
  getRepLevelInfo,
  getNextRepThreshold,
  gainReputation,
  loseReputation,
  REP_GAIN_RARE,
  REP_GAIN_SERVED,
  REP_LEVELS,
  REP_LOSS,
  getSpecialPrice,
  getStaffDuration,
  getWalkSpeed,
  createShopkeeper,
  getCookQuality,
  getHireCost,
  getStaffCap,
  getTotalStars,
  migrateLegacyStaff,
  moveJobUp,
  recordWork,
  rollCandidate,
  sanitizeEmployees,
  getStaffWage,
  getStoveSpeedFactor,
  getStoveUpgradeCost,
  getUpgradeCost,
  getWishPrice,
  localDateKey,
  pickPatronWish,
  skyColorAt,
  updateMeta,
} from "./logic";

describe("雅座与升级", () => {
  it("1 级为 3 个雅座，每升一级 +1", () => {
    expect(getBoothCount(1)).toBe(3);
    expect(getBoothCount(2)).toBe(4);
    expect(getBoothCount(10)).toBe(12);
  });

  it("三层楼：每层上限 4，起楼后按等级补桌，Lv8 满 12", () => {
    expect(MAX_FLOORS).toBe(3);
    expect(FLOOR_UNLOCKS.map((f) => [f.floor, f.level, f.cost])).toEqual([
      [1, 3, 120],
      [2, 6, 450],
    ]);
    expect([0, 1, 2].map((f) => getFloorBoothCount(1, 0, f))).toEqual([3, 0, 0]);
    expect([0, 1, 2].map((f) => getFloorBoothCount(2, 0, f))).toEqual([4, 0, 0]);
    expect([0, 1, 2].map((f) => getFloorBoothCount(3, 1, f))).toEqual([4, 2, 0]);
    expect([0, 1, 2].map((f) => getFloorBoothCount(5, 1, f))).toEqual([4, 4, 0]);
    expect([0, 1, 2].map((f) => getFloorBoothCount(6, 2, f))).toEqual([4, 4, 2]);
    expect([0, 1, 2].map((f) => getFloorBoothCount(8, 2, f))).toEqual([4, 4, 4]);
    expect(getTotalBoothCount(3, 0)).toBe(4);
    expect(getTotalBoothCount(3, 1)).toBe(6);
    expect(getTotalBoothCount(6, 1)).toBe(8);
    expect(getTotalBoothCount(6, 2)).toBe(10);
    expect(getTotalBoothCount(8, 2)).toBe(12);
    expect(getTotalBoothCount(10, 2)).toBe(12);
    expect([0, 1, 2].map(getFloorPriceMultiplier)).toEqual([1, 1.15, 1.25]);
    expect([0, 1, 2].map(getFloorRent)).toEqual([0, 6, 12]);
    expect(getPostCapPriceBonus(8)).toBe(1);
    expect(getPostCapPriceBonus(10)).toBeCloseTo(1.02);
  });

  it("装潢升级费用逐级递增", () => {
    for (let level = 1; level < 6; level++) {
      expect(getUpgradeCost(level + 1)).toBeGreaterThan(getUpgradeCost(level));
    }
  });

  it("灶台/门面专精：费用递增、加成递减且有下限", () => {
    for (let level = 0; level < 6; level++) {
      expect(getStoveUpgradeCost(level + 1)).toBeGreaterThan(getStoveUpgradeCost(level));
      expect(getSignUpgradeCost(level + 1)).toBeGreaterThan(getSignUpgradeCost(level));
    }
    expect(getStoveSpeedFactor(0)).toBe(1);
    expect(getStoveSpeedFactor(1)).toBeLessThan(1);
    expect(getStoveSpeedFactor(999)).toBe(0.5);
  });
});

describe("员工", () => {
  const seq = (...values: number[]) => {
    let i = 0;
    return () => values[i++ % values.length];
  };

  it("候选人每项至少 1 星，总星数固定", () => {
    for (const r of [0, 0.34, 0.67, 0.99]) {
      const e = rollCandidate(1, seq(r, 0.5, 0.1));
      expect(getTotalStars(e)).toBe(12);
      expect(Math.min(e.stars.seat, e.stars.cook, e.stars.buy)).toBeGreaterThanOrEqual(1);
      expect(Math.max(e.stars.seat, e.stars.cook, e.stars.buy)).toBeLessThanOrEqual(10);
    }
  });

  it("默认勾选全部工作，属性高的排前面", () => {
    const e = rollCandidate(1, () => 0.4); // 全部星落在 cook
    expect(e.stars.cook).toBe(10);
    expect(e.jobs[0]).toEqual({ job: "cook", on: true });
    expect(e.jobs.every((j) => j.on)).toBe(true);
  });

  it("工资与雇佣费随总星数涨", () => {
    const e = rollCandidate(1, () => 0);
    expect(getStaffWage(e)).toBe(Math.round(5 + 0.6 * 12));
    expect(getHireCost(e)).toBe(10 + 2 * 12);
  });

  it("可雇人数随酒楼等级增长", () => {
    expect(getStaffCap(1)).toBe(2);
    expect(getStaffCap(2)).toBe(3);
    expect(getStaffCap(10)).toBe(7);
  });

  it("干满 20 次对口属性 +1 星，封顶 10 星", () => {
    const e = rollCandidate(1, () => 0);
    const before = e.stars.cook;
    for (let i = 0; i < 19; i++) expect(recordWork(e, "cook")).toBe(false);
    expect(recordWork(e, "cook")).toBe(true);
    expect(e.stars.cook).toBe(before + 1);
    e.stars.seat = 10;
    for (let i = 0; i < 25; i++) recordWork(e, "seat");
    expect(e.stars.seat).toBe(10);
  });

  it("上移工作顺序", () => {
    const e = rollCandidate(1, () => 0);
    const order = e.jobs.map((j) => j.job);
    moveJobUp(e, 2);
    expect(e.jobs.map((j) => j.job)).toEqual([order[0], order[2], order[1]]);
    moveJobUp(e, 0);
    expect(e.jobs.map((j) => j.job)).toEqual([order[0], order[2], order[1]]);
  });

  it("属性越高越快、做得越好", () => {
    expect(getStaffDuration(1, 2000, 0, 0, 1)).toBeCloseTo(3200);
    expect(getStaffDuration(10, 2000, 0, 0, 1)).toBeLessThan(2000);
    expect(getWalkSpeed(1)).toBeCloseTo(168.75);
    expect(getWalkSpeed(10)).toBeGreaterThan(400);
    expect(getCookQuality(1)).toBeCloseTo(0.885);
    expect(getCookQuality(10)).toBeCloseTo(1.2);
  });

  it("掌柜：三项 4 星，默认烹饪、跑堂、采买全勾", () => {
    const k = createShopkeeper();
    expect(k.id).toBe(0);
    expect(k.stars).toEqual({ seat: 4, cook: 4, buy: 4 });
    expect(k.jobs).toEqual([
      { job: "cook", on: true },
      { job: "seat", on: true },
      { job: "buy", on: true },
    ]);
  });

  it("旧存档按岗位迁移，只勾原岗位", () => {
    const staff = migrateLegacyStaff({ hawker: 0, server: 2, cook: 4, buyer: 1 });
    expect(staff.map((e) => e.name)).toEqual(["跑堂伙计", "灶上伙计", "采买伙计"]);
    expect(staff[1].stars).toEqual({ seat: 2, cook: 6, buy: 2 });
    expect(staff[1].jobs[0]).toEqual({ job: "cook", on: true });
    expect(staff[1].jobs.filter((j) => j.on)).toHaveLength(1);
    expect(migrateLegacyStaff(undefined)).toEqual([]);
  });

  it("读档清洗坏数据", () => {
    const [e] = sanitizeEmployees([
      { id: 3, name: "阿福", stars: { seat: 99, cook: -1, buy: "x" }, jobs: [{ job: "cook", on: true }, { job: "bad" }] },
      { name: 5 },
    ]);
    expect(e.stars).toEqual({ seat: 10, cook: 1, buy: 1 });
    expect(e.jobs.map((j) => j.job)).toEqual(["cook", "seat", "buy"]);
    expect(e.jobs.map((j) => j.on)).toEqual([true, false, false]);
  });
});

describe("采购", () => {
  it("精明提供采买折扣", () => {
    expect(getPurchasePrice(0)).toBe(5);
    expect(getPurchasePrice(1)).toBe(5); // 5 * 0.95 = 4.75 → 5
    expect(getPurchasePrice(4)).toBeLessThan(getPurchasePrice(0));
  });

  it("折扣有上限，价格不低于 1", () => {
    expect(getPurchaseDiscount(100)).toBe(0.5);
    expect(getPurchasePrice(100)).toBe(3); // 5 * 0.5
  });
});

describe("灵石商行", () => {
  it("三档贷款按等级逐档解锁", () => {
    expect(LOANS.map((l) => l.unlockLevel)).toEqual([1, 3, 5]);
    expect(LOANS[0].minDay).toBe(3);
    expect(LOANS[0].totalRepay).toBeGreaterThan(LOANS[0].principal);
    expect(LOANS[2].totalRepay - LOANS[2].principal).toBeGreaterThan(
      LOANS[0].totalRepay - LOANS[0].principal,
    );
  });

  it("分期还款总和等于总还款额", () => {
    for (const loan of LOANS) {
      let remaining = loan.totalRepay;
      let periods = LOAN_PERIODS;
      let paid = 0;
      while (periods > 0) {
        const due = getLoanDue(remaining, periods);
        remaining -= due;
        periods -= 1;
        paid += due;
      }
      expect(paid).toBe(loan.totalRepay);
      expect(remaining).toBe(0);
    }
  });

  it("期数用尽后不再产生还款", () => {
    expect(getLoanDue(100, 0)).toBe(0);
  });
});

describe("顾客到店与破产阈值", () => {
  it("营业时钟：4 秒一刻，8 点到 23 点共 4 分钟，到打烊封顶", () => {
    expect(getSessionDurationMs()).toBe(240000);
    expect(getClockMinutes(0)).toBe(480);
    expect(getClockMinutes(3999)).toBe(480);
    expect(getClockMinutes(4000)).toBe(495);
    expect(getClockMinutes(240000)).toBe(23 * 60);
    expect(getClockMinutes(999999)).toBe(23 * 60);
  });

  it("时辰：初/正与刻", () => {
    expect(formatClock(8 * 60)).toBe("辰正");
    expect(formatClock(8 * 60 + 15)).toBe("辰正一刻");
    expect(formatClock(8 * 60 + 45)).toBe("辰正三刻");
    expect(formatClock(9 * 60)).toBe("巳初");
    expect(formatClock(12 * 60 + 30)).toBe("午正二刻");
    expect(formatClock(23 * 60)).toBe("子初");
    expect(formatClock(0)).toBe("子正");
    expect(formatClock(21 * 60)).toBe("亥初");
  });

  it("到店时刻：第一位开门即到，其余铺满到 21 点前", () => {
    const window = 13 * 4 * 4000;
    for (const r of [0, 0.5, 0.999]) {
      const times = getArrivalSchedule(5, () => r);
      expect(times).toHaveLength(5);
      expect(times[0]).toBeLessThanOrEqual(2200);
      expect(times[4]).toBeLessThanOrEqual(window);
      expect([...times].sort((x, y) => x - y)).toEqual(times);
    }
    expect(getArrivalSchedule(5, () => 0.5)[4]).toBeCloseTo(window * 0.8);
    expect(getArrivalSchedule(0, Math.random)).toEqual([]);
  });

  it("事件时刻落在开门到戌初之间", () => {
    const times = getEventSchedule(3, () => 0.999);
    expect(times).toHaveLength(3);
    expect(Math.max(...times)).toBeLessThan(11 * 4 * 4000);
  });

  it("破产阈值为连续 5 回合", () => {
    expect(BANKRUPT_STREAK).toBe(5);
  });
});

describe("菜品与昼夜", () => {
  it("菜品按等级解锁且售价/耗时为正", () => {
    expect(DISHES[0].unlockLevel).toBe(1);
    expect(new Set(DISHES.map((d) => d.id)).size).toBe(DISHES.length);
    for (let i = 0; i < DISHES.length; i++) {
      const d = DISHES[i];
      expect(d.price).toBeGreaterThan(0);
      expect(d.cookMs).toBeGreaterThan(0);
      if (i > 0) {
        expect(d.unlockLevel).toBeGreaterThanOrEqual(DISHES[i - 1].unlockLevel);
        expect(d.price).toBeGreaterThan(DISHES[i - 1].price);
      }
    }
    expect(DISHES[DISHES.length - 1].cookMs).toBeGreaterThan(DISHES[0].cookMs);
    // 高价菜每秒收益必须低于走量菜，菜单才有取舍
    for (let i = 1; i < DISHES.length; i++) {
      expect(DISHES[i].price / DISHES[i].cookMs).toBeLessThan(
        DISHES[i - 1].price / DISHES[i - 1].cookMs,
      );
    }
  });

  it("昼夜色带两端不同，夜晚等于末端颜色", () => {
    expect(skyColorAt(0)).not.toBe(skyColorAt(1));
    expect(skyColorAt(1)).toBe(NIGHT_COLOR);
    expect(skyColorAt(1.5)).toBe(NIGHT_COLOR);
  });
});

describe("食客类型与口味", () => {
  it("食客类型齐全，耐心、权重与客单价为正", () => {
    expect(PATRON_KINDS.length).toBeGreaterThanOrEqual(4);
    for (const kind of PATRON_KINDS) {
      expect(kind.patienceFactor).toBeGreaterThan(0);
      expect(kind.weight).toBeGreaterThan(0);
      expect(kind.priceFactor).toBeGreaterThan(0);
      expect(kind.name.length).toBeGreaterThan(0);
    }
    expect(new Set(PATRON_KINDS.map((k) => k.id)).size).toBe(PATRON_KINDS.length);
  });

  it("稀客权重低、客单价高，抽取能覆盖整个池子", () => {
    const elder = PATRON_KINDS.find((k) => k.id === "elder")!;
    const rogue = PATRON_KINDS.find((k) => k.id === "rogue")!;
    expect(elder.weight).toBeLessThan(rogue.weight);
    expect(elder.priceFactor).toBeGreaterThan(rogue.priceFactor);
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) seen.add(PATRON_KINDS.indexOf(pickPatronKind(i / 5000)));
    expect(seen.size).toBe(PATRON_KINDS.length);
    expect(pickPatronKind(0)).toBe(PATRON_KINDS[0]);
    expect(pickPatronKind(1)).toBe(PATRON_KINDS[PATRON_KINDS.length - 1]);
  });

  it("只从可用菜品里挑偏爱菜，没有就返回 null", () => {
    const sword = PATRON_KINDS.find((k) => k.id === "sword")!;
    const wish = pickPatronWish(sword, ["jelly", "stirfry"], 0);
    expect(wish).toBe("jelly");
    expect(pickPatronWish(sword, ["stirfry"], 0)).toBeNull();
    expect(pickPatronWish(PATRON_KINDS.find((k) => k.id === "mortal")!, ["fish"], 0)).toBeNull();
  });

  it("每类食客都有姓名池，抽取结果稳定且不越界", () => {
    for (const kind of PATRON_KINDS) {
      expect(kind.names.length).toBeGreaterThanOrEqual(2);
      expect(kind.names).toContain(pickPatronName(kind, 0));
      expect(kind.names).toContain(pickPatronName(kind, 0.999));
      expect(new Set([0, 0.5, 0.999].map((roll) => pickPatronName(kind, roll))).size).toBeGreaterThan(1);
    }
  });

  it("菜单页能看出每道菜被哪些食客偏爱", () => {
    expect(getDishFans("stirfry")).toEqual(expect.arrayContaining(["散修", "妖修"]));
    expect(getDishFans("porridge")).toEqual(expect.arrayContaining(["丹修"]));
    expect(getDishFans("not-a-dish")).toEqual([]);
  });

  it("每日目标二选一，奖励与目标随等级增长；租金随等级上涨", () => {
    const options = getDailyGoalOptions(1, 1);
    expect(options).toHaveLength(2);
    expect(new Set(options.map((o) => o.kind)).size).toBe(2);
    for (const o of options) {
      expect(o.target).toBeGreaterThan(0);
      expect(o.rewardCoins).toBeGreaterThan(0);
    }
    expect(getDailyGoalOptions(1, 4)[0].target).toBeGreaterThan(options[0].target);
    expect(getDailyRent(1)).toBe(12);
    expect(getDailyRent(4)).toBeGreaterThan(getDailyRent(1));
  });

  it("三日之约奖励随等级提高，满三天有额外灵石", () => {
    expect(GOAL_STREAK_TARGET).toBe(3);
    const level1 = getStreakBonus(1);
    const level4 = getStreakBonus(4);
    expect(level1.coins).toBeGreaterThan(0);
    expect(level4.coins).toBeGreaterThan(level1.coins);
  });

  it("每七天一次灯会，目标赏 ×1.5", () => {
    expect(isFestivalDay(1)).toBe(false);
    expect(isFestivalDay(7)).toBe(true);
    expect(isFestivalDay(14)).toBe(true);
    expect(getFestivalGoalMultiplier(7)).toBe(1.5);
    expect(getFestivalGoalMultiplier(8)).toBe(1);
  });

  it("今日招牌按天轮换，只有一道菜时不设招牌", () => {
    expect(getDailySpecial(1, 1, ["stirfry"])).toBeNull();
    const a = getDailySpecial(1, 1, ["stirfry", "porridge"]);
    const b = getDailySpecial(2, 1, ["stirfry", "porridge"]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a).not.toBe(b);
    expect(getDailySpecial(1, 1, ["stirfry", "porridge"])).toBe(a);
    expect(getSpecialPrice(8, true)).toBe(10);
    expect(getSpecialPrice(8, false)).toBe(8);
  });

  it("roll 覆盖所有偏爱菜且始终落在菜单内", () => {
    const demon = PATRON_KINDS.find((k) => k.id === "demon")!;
    const menu = ["stirfry", "fish", "jelly"];
    const wishes = new Set([0, 0.49, 0.99].map((roll) => pickPatronWish(demon, menu, roll)));
    expect(wishes.size).toBe(2);
    for (const wish of wishes) expect(menu).toContain(wish);
  });

  it("命中口味加价 50%；有想吃的却上错只付半价", () => {
    expect(getWishPrice(6, true)).toBe(9);
    expect(getWishPrice(6, false)).toBe(6);
    expect(getWishPrice(6, false, true)).toBe(3);
    expect(getWishPrice(6, true, true)).toBe(9);
    expect(getWishPrice(6, true)).toBeGreaterThan(getWishPrice(6, false, true));
  });
});

describe("随机事件", () => {
  it("按权重抽满整个池子，roll 边界不越界", () => {
    const ids = new Set<number>();
    for (let i = 0; i < 1000; i++) ids.add(RANDOM_EVENTS.indexOf(pickRandomEvent(i / 1000)));
    expect(ids.size).toBe(RANDOM_EVENTS.length);
    expect(pickRandomEvent(0)).toBe(RANDOM_EVENTS[0]);
    expect(pickRandomEvent(0.999999)).toBe(RANDOM_EVENTS[RANDOM_EVENTS.length - 1]);
  });

  it("事件池整体期望为正，单次损失有上限", () => {
    const totalWeight = RANDOM_EVENTS.reduce((sum, e) => sum + e.weight, 0);
    const ev = (key: "coins" | "ingredients") =>
      RANDOM_EVENTS.reduce((sum, e) => sum + e[key] * e.weight, 0) / totalWeight;
    expect(ev("coins")).toBeGreaterThan(0);
    expect(ev("ingredients")).toBeGreaterThan(0);
    for (const event of RANDOM_EVENTS) {
      expect(event.coins).toBeGreaterThanOrEqual(-4);
      expect(event.ingredients).toBeGreaterThanOrEqual(-2);
    }
  });

  it("结算后灵材不为负，灵石可扣成欠款", () => {
    const wind = RANDOM_EVENTS.find((e) => e.id === "wind")!;
    expect(applyEvent(wind, { coins: 10, ingredients: 1 })).toEqual({ coins: 10, ingredients: 0 });
    const thief = RANDOM_EVENTS.find((e) => e.id === "thief")!;
    expect(applyEvent(thief, { coins: 3, ingredients: 2 }).coins).toBe(-1);
    const rain = RANDOM_EVENTS.find((e) => e.id === "rain")!;
    expect(applyEvent(rain, { coins: 0, ingredients: 0 }).ingredients).toBe(3);
  });
});

describe("每日目标", () => {
  it("两天一轮换，目标与奖励随等级成长", () => {
    const goals = [1, 2].map((day) => getDailyGoal(day, 1));
    expect(new Set(goals.map((g) => g.kind)).size).toBe(2);
    expect(getDailyGoal(3, 1).kind).toBe(goals[0].kind);
    for (const goal of goals) {
      expect(goal.target).toBeGreaterThan(0);
      expect(goal.rewardCoins).toBeGreaterThan(0);
    }
    expect(getDailyGoal(1, 5).target).toBeGreaterThan(getDailyGoal(1, 1).target);
    expect(getDailyGoal(1, 5).rewardCoins).toBeGreaterThan(getDailyGoal(1, 1).rewardCoins);
  });

  it("进度按目标类型取对应统计，封顶不溢出", () => {
    const revenue = getDailyGoal(1, 1);
    expect(revenue.kind).toBe("revenue");
    expect(getGoalProgress(revenue, { served: 9, revenue: revenue.target - 1, wishes: 0 })).toBe(
      revenue.target - 1,
    );
    expect(getGoalProgress(revenue, { served: 0, revenue: 999, wishes: 0 })).toBe(revenue.target);
    const wish = getDailyGoal(2, 1);
    expect(wish.kind).toBe("wish");
    expect(getGoalProgress(wish, { served: 0, revenue: 0, wishes: wish.target })).toBe(wish.target);
  });

  it("达到目标才算完成", () => {
    const goal = getDailyGoal(1, 1);
    expect(isGoalMet(goal, { served: 0, revenue: goal.target - 1, wishes: 0 })).toBe(false);
    expect(isGoalMet(goal, { served: 0, revenue: goal.target, wishes: 0 })).toBe(true);
  });

  it("达成奖励随当日收入增加，负收入不扣奖励", () => {
    const goal = getDailyGoal(1, 1);
    expect(getGoalCoinReward(goal, 0)).toBe(goal.rewardCoins);
    expect(getGoalCoinReward(goal, 100)).toBe(goal.rewardCoins + 15);
    expect(getGoalCoinReward(goal, -5)).toBe(goal.rewardCoins);
  });

  it("差一点给半赏，太远则没有", () => {
    const goal = getDailyGoal(1, 1);
    const near = getGoalPayout(goal, { served: 0, revenue: goal.target - 1, wishes: 0 });
    expect(near.met).toBe(false);
    expect(near.partial).toBe(true);
    expect(near.coins).toBeGreaterThan(0);
    const far = getGoalPayout(goal, { served: 0, revenue: 0, wishes: 0 });
    expect(far.partial).toBe(false);
    expect(far.coins).toBe(0);
    const met = getGoalPayout(goal, { served: 0, revenue: goal.target, wishes: 0 });
    expect(met.met).toBe(true);
    expect(met.coins).toBe(getGoalCoinReward(goal, goal.target));
  });
});

describe("声望", () => {
  it("九级称号门槛递增，人数随等级提高", () => {
    expect(REP_LEVELS).toHaveLength(9);
    for (let i = 0; i < REP_LEVELS.length; i++) {
      expect(getRepLevel(REP_LEVELS[i].threshold)).toBe(i + 1);
      expect(getRepLevelInfo(REP_LEVELS[i].threshold).title).toBe(REP_LEVELS[i].title);
      if (i > 0) {
        expect(REP_LEVELS[i].threshold).toBeGreaterThan(REP_LEVELS[i - 1].threshold);
        expect(REP_LEVELS[i].patrons).toBeGreaterThanOrEqual(REP_LEVELS[i - 1].patrons);
      }
    }
    expect(getRepLevel(-50)).toBe(1);
  });

  it("稀客给更多声望", () => {
    const rogue = PATRON_KINDS.find((k) => k.id === "rogue")!;
    const elder = PATRON_KINDS.find((k) => k.id === "elder")!;
    expect(getRepGain(rogue)).toBe(REP_GAIN_SERVED);
    expect(getRepGain(elder)).toBe(REP_GAIN_RARE);
  });

  it("累积声望升级，封顶在最高门槛", () => {
    expect(gainReputation(55, REP_GAIN_SERVED)).toBe(65);
    expect(getRepLevel(65)).toBe(2);
    const cap = REP_LEVELS[REP_LEVELS.length - 1].threshold;
    expect(gainReputation(cap, 999)).toBe(cap);
    expect(getRepLevel(cap)).toBe(9);
  });

  it("流失一次最多掉一级，批量流失也只掉一级", () => {
    expect(loseReputation(760, 1)).toBe(760 - REP_LOSS);
    expect(loseReputation(760, 10)).toBe(560);
    // 一次走很多人也只回退到上一级门槛
    expect(loseReputation(760, 100)).toBe(REP_LEVELS[3].threshold);
    // 最低停留在一级 0 点
    expect(loseReputation(30, 99)).toBe(0);
    expect(loseReputation(760, 0)).toBe(760);
  });

  it("下一级门槛在满级时为 null", () => {
    expect(getNextRepThreshold(0)).toBe(REP_LEVELS[1].threshold);
    expect(getNextRepThreshold(REP_LEVELS[8].threshold)).toBeNull();
  });
});

describe("天气与开市利是", () => {
  it("同一天是同一种天气，连续 60 天覆盖全部四种", () => {
    expect(getDailyWeather("2026-10-26")).toBe(getDailyWeather("2026-10-26"));
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      seen.add(getDailyWeather(localDateKey(new Date(2026, 0, 1 + i))).id);
    }
    expect(seen.size).toBe(WEATHERS.length);
    expect(new Set(WEATHERS.map((w) => w.visual)).size).toBe(WEATHERS.length);
  });

  it("稀客权重倍率放大稀客比例（声望等级用）", () => {
    const countRare = (factor: number) => {
      let rare = 0;
      for (let i = 0; i < 5000; i++) {
        if (pickPatronKind(i / 5000, factor).priceFactor >= 1.8) rare += 1;
      }
      return rare;
    };
    expect(countRare(3)).toBeGreaterThan(countRare(1) * 2);
  });

  it("口味命中加价，上错只付半价", () => {
    expect(getWishPrice(100, true)).toBe(150);
    expect(getWishPrice(100, false, true)).toBe(50);
    expect(getWishPrice(100, false, false)).toBe(100);
  });

  it("连续开店：同日不变、隔日 +1、断一天归 1", () => {
    expect(getGiftStreak("2026-10-26", "2026-10-26", 4)).toBe(4);
    expect(getGiftStreak("2026-10-25", "2026-10-26", 4)).toBe(5);
    expect(getGiftStreak("2026-10-24", "2026-10-26", 4)).toBe(1);
    expect(getGiftStreak(undefined, "2026-10-26", 0)).toBe(1);
    expect(getGiftStreak("2026-02-28", "2026-03-01", 2)).toBe(3);
    expect(getGiftStreak("bogus", "2026-10-26", 2)).toBe(1);
  });

  it("开市利是随连续天数与酒楼等级增长，赏额封顶", () => {
    const day1 = getDailyGift(1, 1);
    const week = getDailyGift(GIFT_STREAK_CAP, 1);
    expect(day1.coins).toBeGreaterThan(0);
    expect(week.coins).toBeGreaterThan(day1.coins);
    expect(week.ingredients).toBeGreaterThan(0);
    expect(getDailyGift(99, 1).coins).toBe(week.coins);
    expect(getDailyGift(3, 5).coins).toBeGreaterThan(getDailyGift(3, 1).coins);
  });
});

describe("修为与境界", () => {
  it("境界阈值严格递增，起点为炼气", () => {
    expect(REALMS[0].name).toBe("炼气");
    expect(REALMS[0].cultivation).toBe(0);
    for (let i = 1; i < REALMS.length; i++) {
      expect(REALMS[i].cultivation).toBeGreaterThan(REALMS[i - 1].cultivation);
    }
  });

  it("修为落在区间内取对应境界，下一境界在阈值处推进", () => {
    expect(getRealmIndex(0)).toBe(0);
    expect(getRealmIndex(29)).toBe(0);
    expect(getRealmIndex(30)).toBe(1);
    expect(getRealmIndex(99999)).toBe(REALMS.length - 1);
    expect(getNextRealm(0)?.name).toBe("筑基");
    expect(getNextRealm(1000)).toBeNull();
  });

});

describe("飞升开局与跨周目账簿", () => {
  it("账簿累加、保留单日最高与历史最高境界", () => {
    const first = updateMeta(EMPTY_META, {
      served: 9,
      revenue: 63,
      goalMet: true,
      realmIndex: 1,
      day: 1,
      level: 1,
    });
    expect(first).toMatchObject({
      days: 1,
      served: 9,
      revenue: 63,
      bestRevenue: 63,
      bestServed: 9,
      goalsMet: 1,
      maxRealm: 1,
    });
    expect(first.topDays).toEqual([{ day: 1, level: 1, served: 9, revenue: 63 }]);
    const second = updateMeta(first, {
      served: 3,
      revenue: 20,
      goalMet: false,
      realmIndex: 0,
      day: 2,
      level: 2,
    });
    expect(second.days).toBe(2);
    expect(second.served).toBe(12);
    expect(second.revenue).toBe(83);
    expect(second.bestRevenue).toBe(63);
    expect(second.bestServed).toBe(9);
    expect(second.goalsMet).toBe(1);
    expect(second.maxRealm).toBe(1);
  });

  it("本机单日榜只留收入最高的 5 天并降序", () => {
    let meta = { ...EMPTY_META };
    for (const [i, revenue] of [10, 300, 50, 200, 80, 120].entries()) {
      meta = updateMeta(meta, {
        served: i,
        revenue,
        goalMet: false,
        realmIndex: 0,
        day: i + 1,
        level: 1,
      });
    }
    expect(meta.topDays.map((r) => r.revenue)).toEqual([300, 200, 120, 80, 50]);
    expect(meta.topDays.length).toBe(5);
    expect(meta.bestRevenue).toBe(300);
  });

  it("成就按账簿阈值解锁，完整账簿可全解锁", () => {
    const locked = getAchievements(EMPTY_META, 0);
    expect(locked.length).toBe(10);
    expect(new Set(locked.map((a) => a.id)).size).toBe(10);
    expect(locked.every((a) => !a.unlocked)).toBe(true);

    const newcomer = getAchievements({ ...EMPTY_META, served: 1 }, 0);
    expect(newcomer.find((a) => a.id === "first")?.unlocked).toBe(true);
    expect(newcomer.find((a) => a.id === "crowd")?.unlocked).toBe(false);

    const maxed = getAchievements(
      {
        days: 100,
        served: 100,
        revenue: 5000,
        bestRevenue: 200,
        bestServed: 15,
        goalsMet: 20,
        maxRealm: 7,
        topDays: [],
      },
      1,
    );
    expect(maxed.every((a) => a.unlocked)).toBe(true);
  });
});
