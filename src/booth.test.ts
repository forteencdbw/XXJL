import { describe, expect, it } from "vitest";
import {
  boothLabel,
  clearBooth,
  cookProgress,
  createBooth,
  departBooth,
  finishCooking,
  finishSeating,
  finishServing,
  leaveUnserved,
  nextBoothToCook,
  nextBoothToServe,
  seatPatron,
  startCooking,
  startServing,
} from "./booth";
import { DISHES, PATRON_KINDS } from "./logic";

const kind = PATRON_KINDS[0];
const dish = DISHES[0];
const other = DISHES[1];
const guest = (wish: string | null = dish.id) => ({ kind, wish, name: "沈青崖", regular: false });

describe("雅座生命周期", () => {
  it("领座 → 起锅 → 出锅 → 传菜 → 上桌 → 离店，离店后桌子回到初始状态", () => {
    const b = createBooth(1);
    expect(seatPatron(b, guest())).toBe(true);
    expect(b.state).toBe("seating");
    expect(finishSeating(b, 100)).toBe(true);
    expect([b.state, b.awaitingSince]).toEqual(["awaitingCook", 100]);
    expect(startCooking(b, { dish, cookId: 3, quality: 1.1, now: 200, duration: 1000 })).toBe(true);
    expect(finishCooking(b, 1199)).toBe(false);
    expect(finishCooking(b, 1200)).toBe(true);
    expect([b.state, b.readyAt]).toEqual(["awaitingServe", 1200]);
    expect(startServing(b)).toBe(true);
    expect(finishServing(b, 1500, 4500)).toBe(true);
    expect([b.state, b.departAt]).toEqual(["dining", 6000]);
    expect(departBooth(b, 5999)).toBeNull();
    const r = departBooth(b, 6000)!;
    expect(r).toMatchObject({ kind, name: "沈青崖", dish, matched: true, hasWish: true, rememberDishId: dish.id });
    expect(b).toEqual(createBooth(1));
  });

  it("上错菜不记常客；不挑的客人吃完记住这道菜", () => {
    const serve = (wish: string | null, cooked = dish) => {
      const b = createBooth();
      seatPatron(b, guest(wish));
      finishSeating(b, 0);
      startCooking(b, { dish: cooked, cookId: 0, quality: 1, now: 0, duration: 0 });
      finishCooking(b, 0);
      startServing(b);
      finishServing(b, 0, 0);
      return departBooth(b, 0)!;
    };
    expect(serve(other.id)).toMatchObject({ matched: false, hasWish: true, rememberDishId: null });
    expect(serve(null)).toMatchObject({ matched: false, hasWish: false, rememberDishId: dish.id });
  });

  it("状态不对时拒绝切换，什么也不改", () => {
    const b = createBooth();
    expect(finishSeating(b, 1)).toBe(false);
    expect(startCooking(b, { dish, cookId: 0, quality: 1, now: 0, duration: 0 })).toBe(false);
    expect(startServing(b)).toBe(false);
    expect(finishServing(b, 0, 0)).toBe(false);
    expect(leaveUnserved(b)).toBeNull();
    expect(b).toEqual(createBooth());
    seatPatron(b, guest());
    expect(seatPatron(b, guest())).toBe(false);
    expect(b.state).toBe("seating");
  });

  it("等菜时灵材见底，客人离开并清空所有字段", () => {
    const b = createBooth(2);
    seatPatron(b, guest());
    finishSeating(b, 50);
    expect(leaveUnserved(b)).toEqual({ kind, name: "沈青崖" });
    expect(b).toEqual(createBooth(2));
  });

  it("清空会重置掌勺人、成色与出锅时刻（过去漏清的字段）", () => {
    const b = createBooth();
    Object.assign(b, { state: "dining", cookStaffId: 4, cookQuality: 1.3, readyAt: 99, cookDoneAt: 9 });
    clearBooth(b);
    expect(b).toEqual(createBooth());
  });

  it("下一桌：掌勺接等得最久的，跑堂先端出锅最早的", () => {
    const booths = [createBooth(), createBooth(), createBooth()];
    expect(nextBoothToCook(booths)).toBe(-1);
    Object.assign(booths[0], { state: "awaitingCook", awaitingSince: 30 });
    Object.assign(booths[2], { state: "awaitingCook", awaitingSince: 10 });
    Object.assign(booths[1], { state: "awaitingServe", readyAt: 5 });
    expect(nextBoothToCook(booths)).toBe(2);
    expect(nextBoothToServe(booths)).toBe(1);
  });

  it("桌卡文字与烹饪进度", () => {
    const b = createBooth();
    expect(boothLabel(b, 0, undefined, "")).toBe("");
    seatPatron(b, guest());
    expect(boothLabel(b, 0, undefined, "")).toBe("入座");
    finishSeating(b, 0);
    expect(boothLabel(b, 0, "灵蔬", "★")).toBe("★灵蔬↓");
    expect(boothLabel(b, 0, undefined, "")).toBe("随意↓");
    startCooking(b, { dish, cookId: 0, quality: 1, now: 0, duration: 2000 });
    expect(boothLabel(b, 500, undefined, "")).toBe(`${dish.name} 2s`);
    expect(cookProgress(b, 500)).toBeCloseTo(0.25);
    finishCooking(b, 2000);
    expect(boothLabel(b, 2000, undefined, "")).toBe(`${dish.name} 待传`);
    expect(cookProgress(b, 2000)).toBe(0);
  });
});
