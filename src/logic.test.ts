import { describe, expect, it } from "vitest";
import {
  BANKRUPT_STREAK,
  DISHES,
  LOANS,
  LOAN_PERIODS,
  MAX_STAFF_LEVEL,
  NIGHT_COLOR,
  getArrivalInterval,
  getBoothCount,
  getLoanDue,
  getPlayerDuration,
  getPurchaseDiscount,
  getPurchaseDuration,
  getPurchasePrice,
  getStaffDuration,
  getStaffLevel,
  getStaffWage,
  getUpgradeCost,
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
    for (const d of DISHES) {
      expect(d.price).toBeGreaterThan(0);
      expect(d.cookMs).toBeGreaterThan(0);
    }
    expect(DISHES[DISHES.length - 1].cookMs).toBeGreaterThan(DISHES[0].cookMs);
  });

  it("昼夜色带两端不同，夜晚等于末端颜色", () => {
    expect(skyColorAt(0)).not.toBe(skyColorAt(1));
    expect(skyColorAt(1)).toBe(NIGHT_COLOR);
    expect(skyColorAt(1.5)).toBe(NIGHT_COLOR);
  });
});
