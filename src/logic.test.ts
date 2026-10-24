import { describe, expect, it } from "vitest";
import {
  BANKRUPT_STREAK,
  DISHES,
  LOANS,
  LOAN_PERIODS,
  MAX_STAFF_LEVEL,
  NIGHT_COLOR,
  PATRON_KINDS,
  RANDOM_EVENTS,
  REALMS,
  applyEvent,
  getArrivalInterval,
  getAscensionPriceMultiplier,
  getBoothCount,
  getCultivationGain,
  getDailyGoal,
  getGoalProgress,
  getLoanDue,
  isGoalMet,
  getNextRealm,
  pickPatronKind,
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
  getStaffDuration,
  getStaffLevel,
  getStaffWage,
  getStoveSpeedFactor,
  getStoveUpgradeCost,
  getUpgradeCost,
  getWishPrice,
  pickPatronWish,
  skyColorAt,
} from "./logic";

describe("雅座与升级", () => {
  it("1 级为 3 个雅座，每升一级 +1", () => {
    expect(getBoothCount(1)).toBe(3);
    expect(getBoothCount(2)).toBe(4);
    expect(getBoothCount(10)).toBe(12);
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

  it("只从今日菜单里挑偏爱菜，没有就返回 null", () => {
    const sword = PATRON_KINDS.find((k) => k.id === "sword")!;
    const wish = pickPatronWish(sword, ["jelly", "stirfry"], 0);
    expect(wish).toBe("jelly");
    expect(pickPatronWish(sword, ["stirfry"], 0)).toBeNull();
    expect(pickPatronWish(PATRON_KINDS.find((k) => k.id === "mortal")!, ["fish"], 0)).toBeNull();
  });

  it("roll 覆盖所有偏爱菜且始终落在菜单内", () => {
    const demon = PATRON_KINDS.find((k) => k.id === "demon")!;
    const menu = ["stirfry", "fish", "jelly"];
    const wishes = new Set([0, 0.49, 0.99].map((roll) => pickPatronWish(demon, menu, roll)));
    expect(wishes.size).toBe(2);
    for (const wish of wishes) expect(menu).toContain(wish);
  });

  it("命中口味加价 50%，未命中保持原价", () => {
    expect(getWishPrice(6, true)).toBe(9);
    expect(getWishPrice(6, false)).toBe(6);
    expect(getWishPrice(6, true)).toBeGreaterThan(getWishPrice(6, false));
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

  it("亲自下厨悟性翻倍", () => {
    expect(getCultivationGain(true)).toBe(getCultivationGain(false) * 2);
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
