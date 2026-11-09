// 雅座生命周期（纯逻辑，不依赖 Phaser）：一张桌从空到领座、烹饪、传菜、用膳、离店的全部状态切换。
// 场景只负责走路、动画、音效；状态与字段只在这里改。状态不对时切换函数返回 false、什么也不改
// （客人可能在半路离开，跑堂与掌勺之间也会有先后，这些竞争本来就会发生）。
import type { Dish, PatronKind } from "./logic";

/** awaitingServe：菜已出锅放在灶台上等跑堂；serving：跑堂正端着走过来。 */
export type BoothState = "empty" | "seating" | "awaitingCook" | "cooking" | "awaitingServe" | "serving" | "dining";

export interface BoothData {
  floor: number;
  state: BoothState;
  patronKind: PatronKind | null;
  patronWish: string | null;
  patronName: string | null;
  patronRegular: boolean;
  /** 领座完成、开始等菜的时刻：掌勺的人先接等得最久的一桌。 */
  awaitingSince: number;
  currentDish: Dish | null;
  /** 掌勺员工 id。 */
  cookStaffId: number | null;
  /** 起锅时锁定的烹饪质量（售价倍率）。 */
  cookQuality: number;
  cookStartedAt: number;
  cookDoneAt: number;
  /** 出锅时刻：跑堂先端出锅最早的一桌。 */
  readyAt: number;
  departAt: number;
}

export interface SeatingPatron {
  kind: PatronKind;
  wish: string | null;
  name: string;
  regular: boolean;
}

export function createBooth(floor = 0): BoothData {
  return {
    floor,
    state: "empty",
    patronKind: null,
    patronWish: null,
    patronName: null,
    patronRegular: false,
    awaitingSince: 0,
    currentDish: null,
    cookStaffId: null,
    cookQuality: 1,
    cookStartedAt: 0,
    cookDoneAt: 0,
    readyAt: 0,
    departAt: 0,
  };
}

/** 清空成空桌（楼层不变）。所有离开桌子的路径都走这里，不会漏清字段。 */
export function clearBooth(b: BoothData): void {
  Object.assign(b, createBooth(b.floor));
}

/** 空桌 → 领座中：跑堂正把客人领过来。 */
export function seatPatron(b: BoothData, p: SeatingPatron): boolean {
  if (b.state !== "empty") return false;
  b.state = "seating";
  b.patronKind = p.kind;
  b.patronWish = p.wish;
  b.patronName = p.name;
  b.patronRegular = p.regular;
  return true;
}

/** 客人落座 → 等菜。 */
export function finishSeating(b: BoothData, now: number): boolean {
  if (b.state !== "seating") return false;
  b.state = "awaitingCook";
  b.awaitingSince = now;
  return true;
}

/** 等菜 → 烹饪：锁定菜、掌勺人与成色。 */
export function startCooking(
  b: BoothData,
  c: { dish: Dish; cookId: number; quality: number; now: number; duration: number },
): boolean {
  if (b.state !== "awaitingCook") return false;
  b.state = "cooking";
  b.currentDish = c.dish;
  b.cookStaffId = c.cookId;
  b.cookQuality = c.quality;
  b.cookStartedAt = c.now;
  b.cookDoneAt = c.now + c.duration;
  return true;
}

/** 到点出锅 → 放在灶台上等跑堂。 */
export function finishCooking(b: BoothData, now: number): boolean {
  if (b.state !== "cooking" || now < b.cookDoneAt) return false;
  b.state = "awaitingServe";
  b.readyAt = now;
  return true;
}

/** 跑堂接手传菜。 */
export function startServing(b: BoothData): boolean {
  if (b.state !== "awaitingServe") return false;
  b.state = "serving";
  return true;
}

/** 菜端上桌 → 用膳，吃完的时刻在此定下。 */
export function finishServing(b: BoothData, now: number, diningMs: number): boolean {
  if (b.state !== "serving") return false;
  b.state = "dining";
  b.departAt = now + diningMs;
  return true;
}

/** 被点进人物卡时多留一会儿：卡还没收起，饭不能先撤。 */
export function holdDining(b: BoothData, until: number): void {
  if (b.state === "dining") b.departAt = Math.max(b.departAt, until);
}

export interface DepartResult {
  kind: PatronKind | null;
  name: string | null;
  wish: string | null;
  regular: boolean;
  dish: Dish;
  /** 吃到了点名的那道菜。 */
  matched: boolean;
  hasWish: boolean;
  /** 会被记成常客时点名的菜：吃到想吃的、或本来不挑而吃完的；否则 null。 */
  rememberDishId: string | null;
}

/** 用膳结束 → 离店：清空桌子，返回结账要用的这桌信息；还没吃完或桌上没菜时返回 null。 */
export function departBooth(b: BoothData, now: number): DepartResult | null {
  if (b.state !== "dining" || now < b.departAt || !b.currentDish) return null;
  const dish = b.currentDish;
  const hasWish = b.patronWish !== null;
  const matched = b.patronWish === dish.id;
  const result: DepartResult = {
    kind: b.patronKind,
    name: b.patronName,
    wish: b.patronWish,
    regular: b.patronRegular,
    dish,
    matched,
    hasWish,
    rememberDishId: matched || !hasWish ? dish.id : null,
  };
  clearBooth(b);
  return result;
}

/** 等菜时灵材见底 → 客人没吃上就走。返回走的是谁。 */
export function leaveUnserved(b: BoothData): { kind: PatronKind | null; name: string | null } | null {
  if (b.state !== "awaitingCook") return null;
  const who = { kind: b.patronKind, name: b.patronName };
  clearBooth(b);
  return who;
}

/** 掌勺的人接哪一桌：等得最久的。没有就返回 -1。 */
export function nextBoothToCook(booths: readonly BoothData[]): number {
  return oldest(booths, "awaitingCook", (b) => b.awaitingSince);
}

/** 跑堂先端哪一桌：出锅最早的。没有就返回 -1。 */
export function nextBoothToServe(booths: readonly BoothData[]): number {
  return oldest(booths, "awaitingServe", (b) => b.readyAt);
}

function oldest(booths: readonly BoothData[], state: BoothState, at: (b: BoothData) => number): number {
  let index = -1;
  booths.forEach((b, i) => {
    if (b.state === state && (index === -1 || at(b) < at(booths[index]))) index = i;
  });
  return index;
}

/** 桌卡上的一行字；空桌与用膳中不挂卡，返回空串。 */
export function boothLabel(b: BoothData, now: number, wishName: string | undefined, marker: string): string {
  switch (b.state) {
    case "seating":
      return "入座";
    case "awaitingCook":
      return `${marker}${wishName ?? "随意"}↓`;
    case "cooking":
      return `${b.currentDish?.name ?? "烹饪"} ${Math.max(0, Math.ceil((b.cookDoneAt - now) / 1000))}s`;
    case "awaitingServe":
      return `${b.currentDish?.name ?? "菜"} 待传`;
    case "serving":
      return "上菜中";
    default:
      return "";
  }
}

/** 烹饪进度 0–1；不在烹饪返回 0（领座、传菜的进度跟着跑堂的任务走，由场景算）。 */
export function cookProgress(b: BoothData, now: number): number {
  if (b.state !== "cooking") return 0;
  return Math.min(1, Math.max(0, (now - b.cookStartedAt) / Math.max(1, b.cookDoneAt - b.cookStartedAt)));
}
