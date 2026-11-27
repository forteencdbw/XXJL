import { describe, expect, it } from "vitest";
import { getMaxFloorsBuilt, newSave, parseSave, SAVE_VERSION } from "./save";

describe("存档编解码", () => {
  it("新档：第 1 日、开局数值、掌柜五项 4 星", () => {
    const s = newSave();
    expect(s.v).toBe(SAVE_VERSION);
    expect([s.day, s.level, s.floorsBuilt, s.employees.length]).toEqual([1, 1, 0, 0]);
    expect(s.shopkeeper.name).toBe("掌柜");
    expect(s.selectedDishIds.length).toBeGreaterThan(0);
  });

  it("旧档重开继承仙缘、性别、灵根、账簿与利是，其余归零", () => {
    const meta = { days: 9, served: 50, revenue: 900, bestRevenue: 200, bestServed: 12, goalsMet: 4, maxRealm: 1, topDays: [] };
    const tasks = { activeId: "gather_food", progress: 0, completed: ["open_shop", "first_order"] };
    const s = newSave({ ascensions: 2, playerGender: "female", shopkeeperRoot: ["fire"], meta, lastGiftDate: "2026-11-01", giftStreak: 3, jade: 7, tasks });
    expect(s).toMatchObject({ ascensions: 2, playerGender: "female", meta, lastGiftDate: "2026-11-01", giftStreak: 3, day: 1, coins: newSave().coins, jade: 7, tasks });
    expect(s.shopkeeper.root).toEqual(["fire"]);
  });

  it("营业中快照：收入与当日目标存得下、脏数据被清洗", () => {
    const goal = { kind: "revenue" as const, label: "本日收入", target: 80, rewardCoins: 12 };
    const s = newSave();
    s.session = { day: 1, goal, revenue: 55, served: 3, wishes: 1 };
    expect(parseSave(JSON.parse(JSON.stringify(s)))?.session).toEqual(s.session);
    const dirty = { ...s, session: { day: 0, goal: { kind: "nope" }, revenue: -5, served: "x" } };
    expect(parseSave(JSON.parse(JSON.stringify(dirty)))?.session).toEqual({
      day: 1,
      goal: null,
      revenue: 0,
      served: 0,
      wishes: 0,
    });
    expect(parseSave(JSON.parse(JSON.stringify(newSave())))?.session).toBeUndefined();
  });

  it("伙计外貌存得住；旧档没有外貌时按 id 补一个且稳定", () => {
    const s = newSave();
    const base = { id: 5, name: "小七", root: ["fire"], stars: { gengu: 4, shenshi: 4, jiyuan: 4, wuxing: 4, qigan: 4 }, level: 1, exp: 0, statPoints: 0, jobs: [] };
    s.employees = [{ ...base, look: { body: 0x3a7a5a, hair: 0x1a1a22, longHair: true } } as never];
    const read = parseSave(JSON.parse(JSON.stringify(s)))!;
    expect(read.employees[0].look).toEqual({ body: 0x3a7a5a, hair: 0x1a1a22, longHair: true });
    s.employees = [base as never];
    const old1 = parseSave(JSON.parse(JSON.stringify(s)))!;
    const old2 = parseSave(JSON.parse(JSON.stringify(s)))!;
    expect(old1.employees[0].look).toEqual(old2.employees[0].look);
    expect(old1.employees[0].look.body).toBeTypeOf("number");
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
      jade: -3,
      ingredients: { lingshu: -5, bogus: 9 },
      gathering: {
        herb: { employeeId: 99, ingredientId: "lingshu", startedAt: 1 },
        stream: { employeeId: 0, ingredientId: "lingmi", startedAt: 2 },
        bamboo: { employeeId: 0, ingredientId: "shanjun", startedAt: 3 },
      },
      level: 4,
      floorsBuilt: 9,
      playerGender: "robot",
      shopkeeper: { id: 7, name: "伙计", root: ["fire"], stars: {}, jobs: [] },
      activeLoans: [{ name: "小额", remaining: 30, periodsLeft: 2.7 }, { name: 3 }],
      regulars: [{ name: "王二", kindId: "mortal", wish: "stirfry", visits: 0 }, { name: "缺字段" }],
      dailyGoal: { kind: "bad", label: "x" },
      tasks: { activeId: "nope", progress: 999, completed: ["open_shop", "bad", "open_shop"] },
      lastGiftDate: "昨天",
    })!;
    expect(s.coins).toBe(newSave().coins);
    expect(s.jade).toBe(0);
    expect(s.ingredients.lingshu).toBe(0);
    expect(s.ingredients.daoguo).toBe(0);
    expect("bogus" in s.ingredients).toBe(false);
    // 不存在的员工丢弃；同一人只认第一处
    expect(Object.keys(s.gathering)).toEqual(["stream"]);
    expect(s.gathering.stream).toEqual({ employeeId: 0, ingredientId: "lingmi", startedAt: 2 });
    expect(s.floorsBuilt).toBe(getMaxFloorsBuilt(4));
    expect(s.playerGender).toBe("male");
    expect([s.shopkeeper.id, s.shopkeeper.name]).toEqual([0, "掌柜"]);
    expect(s.activeLoans).toEqual([{ name: "小额", remaining: 30, periodsLeft: 2 }]);
    expect(s.regulars).toEqual([{ name: "王二", kindId: "mortal", wish: "stirfry", visits: 1 }]);
    expect(s.dailyGoal).toBeNull();
    expect(s.tasks.completed).toEqual(["open_shop"]);
    expect(s.tasks.activeId).toBe("first_order");
    expect(s.tasks.progress).toBe(1);
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
