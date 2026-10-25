import { describe, expect, it } from "vitest";
import {
  BANKRUPT_STREAK,
  DISHES,
  EMPTY_META,
  LOANS,
  LOAN_PERIODS,
  MAX_STAFF_LEVEL,
  NIGHT_COLOR,
  PATRON_KINDS,
  RANDOM_EVENTS,
  REALMS,
  applyEvent,
  getAchievements,
  getArrivalInterval,
  getAscensionPriceMultiplier,
  getAscensionStartCoins,
  getAscensionStartInventory,
  getAscensionStartLevel,
  FLOOR_UNLOCKS,
  MAX_FLOORS,
  getBoothCount,
  getCultivationGain,
  getFloorBoothCount,
  getFloorPriceMultiplier,
  getFloorRent,
  getPostCapPriceBonus,
  getTotalBoothCount,
  getDailyGoal,
  getDailyGoalOptions,
  getDailyRent,
  getDailySpecial,
  getFestivalGoalMultiplier,
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
  getPlayerDuration,
  getPurchaseDiscount,
  getPurchaseDuration,
  getPurchasePrice,
  getRealmArrivalFactor,
  getRealmIndex,
  getRealmPlayerSpeedFactor,
  getRealmPriceMultiplier,
  getRealmStaffSpeedFactor,
  getSignArrivalFactor,
  getSignUpgradeCost,
  getSpecialPrice,
  getStaffDuration,
  getStaffLevel,
  getStaffWage,
  getStoveSpeedFactor,
  getStoveUpgradeCost,
  getUpgradeCost,
  getWishPrice,
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
    expect(getSignArrivalFactor(0)).toBe(1);
    expect(getSignArrivalFactor(1)).toBeLessThan(1);
    expect(getSignArrivalFactor(999)).toBe(0.5);
  });
});

describe("伙计熟练度与工资", () => {
  it("每 3 点熟练度升一级，封顶 4 级", () => {
    expect(getStaffLevel(0)).toBe(1);
    expect(getStaffLevel(2)).toBe(1);
    expect(getStaffLevel(3)).toBe(2);
    expect(getStaffLevel(6)).toBe(3);
    expect(getStaffLevel(9)).toBe(MAX_STAFF_LEVEL);
    expect(getStaffLevel(999)).toBe(MAX_STAFF_LEVEL);
  });

  it("日薪按等级 1.3 倍递增", () => {
    expect(getStaffWage("hawker", 1)).toBe(5);
    expect(getStaffWage("hawker", 2)).toBe(7); // 5 * 1.3 = 6.5 → 7
    expect(getStaffWage("cook", 1)).toBe(10);
    expect(getStaffWage("cook", 2)).toBeGreaterThan(getStaffWage("cook", 1));
  });
});

describe("采购", () => {
  it("营业中紧急采购翻倍，采买等级提供折扣", () => {
    expect(getPurchasePrice(0, false)).toBe(5);
    expect(getPurchasePrice(0, true)).toBe(10);
    expect(getPurchasePrice(1, false)).toBe(5); // 5 * 0.92 = 4.6 → 5
    expect(getPurchasePrice(2, false)).toBeLessThan(getPurchasePrice(0, false));
  });

  it("折扣有上限，价格不低于 1", () => {
    expect(getPurchaseDiscount(100)).toBe(0.5);
    expect(getPurchasePrice(100, true)).toBe(5); // 10 * 0.5
    expect(getPurchasePrice(100, false)).toBeGreaterThanOrEqual(1);
  });

  it("紧急采购耗时随装潢缩短但不低于下限", () => {
    expect(getPurchaseDuration(1)).toBe(15000);
    expect(getPurchaseDuration(5)).toBeLessThan(getPurchaseDuration(1));
    expect(getPurchaseDuration(1000)).toBeGreaterThanOrEqual(3000);
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
  it("装潢和迎客等级都会缩短到店间隔", () => {
    const base = 5000;
    expect(getArrivalInterval(1, 0, base)).toBe(base);
    expect(getArrivalInterval(3, 0, base)).toBeLessThan(base);
    expect(getArrivalInterval(1, 3, base)).toBeLessThan(base);
  });

  it("到店间隔有下限", () => {
    expect(getArrivalInterval(999, 999, 7000)).toBeGreaterThanOrEqual(1500);
  });

  it("破产阈值为连续 5 回合", () => {
    expect(BANKRUPT_STREAK).toBe(5);
  });
});

describe("操作耗时", () => {
  it("玩家耗时受装潢缩短但不低于下限", () => {
    expect(getPlayerDuration(1200, 120, 300, 1)).toBe(1200);
    expect(getPlayerDuration(1200, 120, 300, 3)).toBeLessThan(1200);
    expect(getPlayerDuration(1200, 120, 300, 999)).toBe(300);
  });

  it("伙计 1 级比玩家慢，升级后追平以上", () => {
    const player = getPlayerDuration(2000, 0, 0, 1);
    expect(getStaffDuration("cook", 2000, 0, 0, 1, 1)).toBeGreaterThan(player);
    expect(getStaffDuration("cook", 2000, 0, 0, 1, MAX_STAFF_LEVEL)).toBeLessThan(player);
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

  it("每日目标三选一，奖励与目标随等级增长；租金随等级上涨", () => {
    const options = getDailyGoalOptions(1, 1);
    expect(options).toHaveLength(3);
    expect(new Set(options.map((o) => o.kind)).size).toBe(3);
    for (const o of options) {
      expect(o.target).toBeGreaterThan(0);
      expect(o.rewardCoins).toBeGreaterThan(0);
      expect(o.rewardCultivation).toBeGreaterThan(0);
    }
    expect(getDailyGoalOptions(1, 4)[0].target).toBeGreaterThan(options[0].target);
    expect(getDailyRent(1)).toBe(12);
    expect(getDailyRent(4)).toBeGreaterThan(getDailyRent(1));
  });

  it("三日之约奖励随等级提高，满三天有额外灵石与修为", () => {
    expect(GOAL_STREAK_TARGET).toBe(3);
    const level1 = getStreakBonus(1);
    const level4 = getStreakBonus(4);
    expect(level1.coins).toBeGreaterThan(0);
    expect(level1.cultivation).toBeGreaterThan(0);
    expect(level4.coins).toBeGreaterThan(level1.coins);
    expect(level4.cultivation).toBeGreaterThanOrEqual(level1.cultivation);
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
    const ev = (key: "coins" | "ingredients" | "cultivation") =>
      RANDOM_EVENTS.reduce((sum, e) => sum + e[key] * e.weight, 0) / totalWeight;
    expect(ev("coins")).toBeGreaterThan(0);
    expect(ev("ingredients")).toBeGreaterThan(0);
    expect(ev("cultivation")).toBeGreaterThan(0);
    for (const event of RANDOM_EVENTS) {
      expect(event.coins).toBeGreaterThanOrEqual(-4);
      expect(event.ingredients).toBeGreaterThanOrEqual(-2);
      expect(event.cultivation).toBeGreaterThanOrEqual(0);
    }
  });

  it("结算后灵材与修为不为负，灵石可扣成欠款", () => {
    const wind = RANDOM_EVENTS.find((e) => e.id === "wind")!;
    expect(applyEvent(wind, { coins: 10, ingredients: 1, cultivation: 5 })).toEqual({
      coins: 10,
      ingredients: 0,
      cultivation: 5,
    });
    const thief = RANDOM_EVENTS.find((e) => e.id === "thief")!;
    expect(applyEvent(thief, { coins: 3, ingredients: 2, cultivation: 0 }).coins).toBe(-1);
    const rain = RANDOM_EVENTS.find((e) => e.id === "rain")!;
    expect(applyEvent(rain, { coins: 0, ingredients: 0, cultivation: 0 }).ingredients).toBe(3);
  });
});

describe("每日目标", () => {
  it("三天一轮换，目标与奖励随等级成长", () => {
    const goals = [1, 2, 3].map((day) => getDailyGoal(day, 1));
    expect(new Set(goals.map((g) => g.kind)).size).toBe(3);
    expect(getDailyGoal(4, 1).kind).toBe(goals[0].kind);
    for (const goal of goals) {
      expect(goal.target).toBeGreaterThan(0);
      expect(goal.rewardCoins).toBeGreaterThan(0);
      expect(goal.rewardCultivation).toBeGreaterThan(0);
    }
    expect(getDailyGoal(1, 5).target).toBeGreaterThan(getDailyGoal(1, 1).target);
    expect(getDailyGoal(1, 5).rewardCoins).toBeGreaterThan(getDailyGoal(1, 1).rewardCoins);
  });

  it("进度按目标类型取对应统计，封顶不溢出", () => {
    const serve = getDailyGoal(1, 1);
    expect(getGoalProgress(serve, { served: 2, revenue: 999, wishes: 0 })).toBe(2);
    expect(getGoalProgress(serve, { served: 999, revenue: 0, wishes: 0 })).toBe(serve.target);
    const revenue = getDailyGoal(2, 1);
    expect(getGoalProgress(revenue, { served: 99, revenue: revenue.target - 1, wishes: 0 })).toBe(
      revenue.target - 1,
    );
    const wish = getDailyGoal(3, 1);
    expect(getGoalProgress(wish, { served: 0, revenue: 0, wishes: wish.target })).toBe(wish.target);
  });

  it("达到目标才算完成", () => {
    const goal = getDailyGoal(1, 1);
    expect(isGoalMet(goal, { served: goal.target - 1, revenue: 0, wishes: 0 })).toBe(false);
    expect(isGoalMet(goal, { served: goal.target, revenue: 0, wishes: 0 })).toBe(true);
  });

  it("达成奖励随当日收入增加，负收入不扣奖励", () => {
    const goal = getDailyGoal(1, 1);
    expect(getGoalCoinReward(goal, 0)).toBe(goal.rewardCoins);
    expect(getGoalCoinReward(goal, 100)).toBe(goal.rewardCoins + 15);
    expect(getGoalCoinReward(goal, -5)).toBe(goal.rewardCoins);
  });

  it("差一点给半赏，太远则没有", () => {
    const goal = getDailyGoal(1, 1);
    const near = getGoalPayout(goal, { served: goal.target - 1, revenue: 0, wishes: 0 });
    expect(near.met).toBe(false);
    expect(near.partial).toBe(true);
    expect(near.coins).toBeGreaterThan(0);
    expect(near.cultivation).toBeGreaterThan(0);
    const far = getGoalPayout(goal, { served: 0, revenue: 0, wishes: 0 });
    expect(far.partial).toBe(false);
    expect(far.coins).toBe(0);
    const met = getGoalPayout(goal, { served: goal.target, revenue: 100, wishes: 0 });
    expect(met.met).toBe(true);
    expect(met.coins).toBe(getGoalCoinReward(goal, 100));
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

  it("境界加成在对应境界开启后单调不降", () => {
    const last = REALMS.length - 1;
    expect(getRealmPriceMultiplier(0)).toBe(1);
    expect(getRealmPriceMultiplier(1)).toBeGreaterThan(1);
    expect(getRealmPriceMultiplier(last)).toBeGreaterThan(getRealmPriceMultiplier(1));
    expect(getRealmPlayerSpeedFactor(0)).toBe(1);
    expect(getRealmPlayerSpeedFactor(2)).toBeLessThan(1);
    expect(getRealmStaffSpeedFactor(0)).toBe(1);
    expect(getRealmStaffSpeedFactor(5)).toBeLessThan(1);
    expect(getRealmArrivalFactor(0)).toBe(1);
    expect(getRealmArrivalFactor(3)).toBeLessThan(1);
  });

  it("只有亲自下厨得修为，伙计出菜不得修为", () => {
    expect(getCultivationGain(true)).toBe(2);
    expect(getCultivationGain(false)).toBe(0);
  });

  it("每次飞升留一重仙缘，售价永久提高且无负数副作用", () => {
    expect(getAscensionPriceMultiplier(0)).toBe(1);
    expect(getAscensionPriceMultiplier(1)).toBeCloseTo(1.1);
    expect(getAscensionPriceMultiplier(3)).toBeCloseTo(1.3);
    expect(getAscensionPriceMultiplier(-5)).toBe(1);
    expect(getAscensionPriceMultiplier(2.9)).toBeCloseTo(1.2);
  });

  it("境界速度加成会缩短操作耗时，且仍受下限约束", () => {
    const normal = getPlayerDuration(1200, 0, 300, 1);
    expect(getPlayerDuration(1200, 0, 300, 1, 0.9)).toBeLessThan(normal);
    expect(getPlayerDuration(100, 0, 300, 1, 0.9)).toBe(300);
  });
});

describe("飞升开局与跨周目账簿", () => {
  it("多周目开局资源线性增长，负数按 0 重处理", () => {
    expect(getAscensionStartCoins(0)).toBe(20);
    expect(getAscensionStartCoins(1)).toBe(40);
    expect(getAscensionStartCoins(5)).toBe(120);
    expect(getAscensionStartInventory(0)).toBe(8);
    expect(getAscensionStartInventory(1)).toBe(10);
    expect(getAscensionStartInventory(5)).toBe(18);
    expect(getAscensionStartCoins(-3)).toBe(20);
    expect(getAscensionStartInventory(-3)).toBe(8);
  });

  it("每 3 重仙缘提高新周目开局酒楼等级", () => {
    expect(getAscensionStartLevel(0)).toBe(1);
    expect(getAscensionStartLevel(2)).toBe(1);
    expect(getAscensionStartLevel(3)).toBe(2);
    expect(getAscensionStartLevel(5)).toBe(2);
    expect(getAscensionStartLevel(6)).toBe(3);
    expect(getAscensionStartLevel(30)).toBe(11);
    expect(getAscensionStartLevel(-2)).toBe(1);
  });

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
