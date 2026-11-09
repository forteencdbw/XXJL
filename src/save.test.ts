import { describe, expect, it } from "vitest";
import { getNightDurationMs } from "./logic";
import { getMaxFloorsBuilt, newSave, parseSave, SAVE_VERSION } from "./save";

describe("存档编解码", () => {
  it("新档：第 1 日辰正、开局数值、掌柜五项 4 星", () => {
    const s = newSave();
    expect(s.v).toBe(SAVE_VERSION);
    expect([s.day, s.level, s.floorsBuilt, s.employees.length]).toEqual([1, 1, 0, 0]);
    expect(s.nightMs).toBe(getNightDurationMs());
    expect(s.shopkeeper.name).toBe("掌柜");
    expect(s.selectedDishIds.length).toBeGreaterThan(0);
  });

  it("破产重开继承仙缘、性别、灵根、账簿与利是，其余归零", () => {
    const meta = { days: 9, served: 50, revenue: 900, bestRevenue: 200, bestServed: 12, goalsMet: 4, maxRealm: 1, topDays: [] };
    const s = newSave({ ascensions: 2, playerGender: "female", shopkeeperRoot: ["fire"], meta, lastGiftDate: "2026-11-01", giftStreak: 3 });
    expect(s).toMatchObject({ ascensions: 2, playerGender: "female", meta, lastGiftDate: "2026-11-01", giftStreak: 3, day: 1, coins: newSave().coins });
    expect(s.shopkeeper.root).toEqual(["fire"]);
  });

  it("新档原样存再读回来不变", () => {
    const s = newSave({ playerGender: "female" });
    expect(parseSave(JSON.parse(JSON.stringify(s)))).toEqual(JSON.parse(JSON.stringify(s)));
  });

  it("版本不对或不是对象就拒绝", () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave("x")).toBeNull();
    expect(parseSave({ ...newSave(), v: 2 })).toBeNull();
  });

  it("坏数据按默认值补上，数值夹到合法范围", () => {
    const s = parseSave({
      v: SAVE_VERSION,
      coins: "lots",
      inventory: -5,
      level: 4,
      floorsBuilt: 9,
      nightMs: 1e12,
      playerGender: "robot",
      shopkeeper: { id: 7, name: "伙计", root: ["fire"], stars: {}, jobs: [] },
      activeLoans: [{ name: "小额", remaining: 30, periodsLeft: 2.7 }, { name: 3 }],
      regulars: [{ name: "王二", kindId: "mortal", wish: "stirfry", visits: 0 }, { name: "缺字段" }],
      dailyGoal: { kind: "bad", label: "x" },
      lastGiftDate: "昨天",
    })!;
    expect(s.coins).toBe(newSave().coins);
    expect(s.inventory).toBe(0);
    expect(s.floorsBuilt).toBe(getMaxFloorsBuilt(4));
    expect(s.nightMs).toBe(getNightDurationMs());
    expect(s.playerGender).toBe("male");
    expect([s.shopkeeper.id, s.shopkeeper.name]).toEqual([0, "掌柜"]);
    expect(s.activeLoans).toEqual([{ name: "小额", remaining: 30, periodsLeft: 2 }]);
    expect(s.regulars).toEqual([{ name: "王二", kindId: "mortal", wish: "stirfry", visits: 1 }]);
    expect(s.dailyGoal).toBeNull();
    expect(s.lastGiftDate).toBeUndefined();
  });

  it("楼层上限跟着 config 的解锁等级走", () => {
    expect([1, 2, 3, 5, 6, 10].map(getMaxFloorsBuilt)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it("下一位伙计的编号不会和已有的人撞号", () => {
    const e = { ...newSave().shopkeeper, id: 5, name: "阿福" };
    expect(parseSave({ ...newSave(), employees: [e], nextStaffId: 2 })!.nextStaffId).toBe(6);
  });
});
