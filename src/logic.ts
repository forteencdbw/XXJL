// 纯数值逻辑：不依赖 Phaser / DOM，便于单元测试。

export type ProductionRole = "hawker" | "server" | "cook";
export type StaffRole = ProductionRole | "buyer";

export const TABLE_COUNT_BASE = 3;
export const ARRIVAL_MIN_MS = 4000;
export const ARRIVAL_MAX_MS = 7000;
export const ARRIVAL_TAVERN_SHRINK_MS = 150;
export const ARRIVAL_HAWKER_SHRINK = 0.08;
export const ARRIVAL_FLOOR_MS = 1500;
export const PURCHASE_COST = 5;
export const PURCHASE_TIME_MS = 15000;
export const PURCHASE_EMERGENCY_MULTIPLIER = 2;
export const PURCHASE_TAVERN_SHRINK_PER_LEVEL_MS = 300;
export const PURCHASE_FLOOR_MS = 3000;
export const PURCHASE_DISCOUNT_PER_LEVEL = 0.08;
export const PURCHASE_DISCOUNT_CAP = 0.5;
export const UPGRADE_BASE_COST = 15;
export const UPGRADE_COST_MULTIPLIER = 1.6;
export const STAFF_SPEED_PENALTY = 1.6;
// 4 级时三岗都应快于玩家：1.6 × 0.82^3 ≈ 0.88、0.85^3 ≈ 0.98、0.84^3 ≈ 0.95
export const STAFF_LEVEL_SPEEDUP = { hawker: 0.82, server: 0.85, cook: 0.84 } as const;
export const EXP_PER_LEVEL = 3;
export const MAX_STAFF_LEVEL = 4;
export const STAFF_BASE_WAGE = { hawker: 5, server: 8, cook: 10, buyer: 6 } as const;
export const WAGE_PER_LEVEL = 1.3;
export const LOAN_PERIODS = 12;
export const BANKRUPT_STREAK = 5;
export const NIGHT_COLOR = 0x1b2440;

export interface Dish {
  id: string;
  name: string;
  price: number;
  cookMs: number;
  unlockLevel: number;
}

export const DISHES: Dish[] = [
  { id: "stirfry", name: "清炒灵蔬", price: 6, cookMs: 1500, unlockLevel: 1 },
  { id: "porridge", name: "灵米粥", price: 8, cookMs: 2000, unlockLevel: 2 },
  { id: "jelly", name: "玉露羹", price: 12, cookMs: 2800, unlockLevel: 3 },
  { id: "fish", name: "龙涎鱼脍", price: 18, cookMs: 4000, unlockLevel: 4 },
];

export interface LoanDef {
  id: string;
  name: string;
  principal: number;
  totalRepay: number;
  unlockLevel: number;
}

export const LOANS: LoanDef[] = [
  { id: "small", name: "小借", principal: 200, totalRepay: 240, unlockLevel: 1 },
  { id: "medium", name: "中借", principal: 500, totalRepay: 650, unlockLevel: 3 },
  { id: "large", name: "大借", principal: 1200, totalRepay: 1680, unlockLevel: 5 },
];

export const SKY_STOPS = [
  { t: 0, color: 0xa8d8ff },
  { t: 0.28, color: 0x74bdf7 },
  { t: 0.68, color: 0xf0a05a },
  { t: 1, color: 0x1b2440 },
] as const;

export function getBoothCount(level: number): number {
  return TABLE_COUNT_BASE + (level - 1);
}

export function getUpgradeCost(level: number): number {
  return Math.round(UPGRADE_BASE_COST * Math.pow(UPGRADE_COST_MULTIPLIER, level - 1));
}

export function getPlayerDuration(
  base: number,
  shrinkPerLevel: number,
  floor: number,
  tavernLevel: number,
  speedFactor = 1,
): number {
  return Math.max(floor, base * speedFactor - (tavernLevel - 1) * shrinkPerLevel);
}

export function getStaffDuration(
  role: ProductionRole,
  base: number,
  shrinkPerLevel: number,
  floor: number,
  tavernLevel: number,
  staffLevel: number,
  speedFactor = 1,
): number {
  const raw =
    base *
      STAFF_SPEED_PENALTY *
      Math.pow(STAFF_LEVEL_SPEEDUP[role], Math.max(staffLevel, 1) - 1) *
      speedFactor -
    (tavernLevel - 1) * shrinkPerLevel;
  return Math.max(floor, raw);
}

/** 到店间隔。base 由调用方传入随机值，保持函数纯净可测。 */
export function getArrivalInterval(
  tavernLevel: number,
  hawkerLevel: number,
  base: number,
  speedFactor = 1,
): number {
  const hawkerFactor = Math.max(0.35, 1 - ARRIVAL_HAWKER_SHRINK * hawkerLevel);
  return Math.max(
    ARRIVAL_FLOOR_MS,
    base * hawkerFactor * speedFactor - (tavernLevel - 1) * ARRIVAL_TAVERN_SHRINK_MS,
  );
}

// ===== 修为与境界 =====
/** 境界越高，酒楼的仙缘越盛：售价、操作速度、客流依次获得加成。 */
export interface RealmDef {
  name: string;
  cultivation: number;
  perk: string;
}

export const REALMS: RealmDef[] = [
  { name: "炼气", cultivation: 0, perk: "初入仙途" },
  { name: "筑基", cultivation: 30, perk: "菜品售价 +10%" },
  { name: "金丹", cultivation: 80, perk: "玩家操作速度 +10%" },
  { name: "元婴", cultivation: 160, perk: "顾客到店间隔 -15%" },
  { name: "化神", cultivation: 280, perk: "打烊时自动领悟 3 灵材" },
  { name: "炼虚", cultivation: 450, perk: "伙计操作速度 +10%" },
  { name: "合体", cultivation: 700, perk: "菜品售价 +20%" },
  { name: "大乘", cultivation: 1000, perk: "菜品售价 +30%" },
];

export function getRealmIndex(cultivation: number): number {
  let index = 0;
  for (let i = 0; i < REALMS.length; i++) {
    if (cultivation >= REALMS[i].cultivation) index = i;
  }
  return index;
}

export function getNextRealm(cultivation: number): RealmDef | null {
  return REALMS[getRealmIndex(cultivation) + 1] ?? null;
}

/** 亲自下厨比让伙计代劳多一倍悟性：修行与赚钱是一组取舍。 */
export function getCultivationGain(personal: boolean): number {
  return personal ? 2 : 1;
}

export function getRealmPriceMultiplier(realmIndex: number): number {
  if (realmIndex >= 7) return 1.3;
  if (realmIndex >= 6) return 1.2;
  if (realmIndex >= 1) return 1.1;
  return 1;
}

export function getRealmPlayerSpeedFactor(realmIndex: number): number {
  return realmIndex >= 2 ? 0.9 : 1;
}

export function getRealmStaffSpeedFactor(realmIndex: number): number {
  return realmIndex >= 5 ? 0.9 : 1;
}

export function getRealmArrivalFactor(realmIndex: number): number {
  return realmIndex >= 3 ? 0.85 : 1;
}

export function getStaffLevel(exp: number): number {
  return Math.min(MAX_STAFF_LEVEL, 1 + Math.floor(exp / EXP_PER_LEVEL));
}

export function getStaffWage(role: StaffRole, level: number): number {
  return Math.round(STAFF_BASE_WAGE[role] * Math.pow(WAGE_PER_LEVEL, Math.max(level, 1) - 1));
}

export function getPurchaseDiscount(buyerLevel: number): number {
  return Math.min(PURCHASE_DISCOUNT_CAP, PURCHASE_DISCOUNT_PER_LEVEL * Math.max(buyerLevel, 0));
}

export function getPurchasePrice(buyerLevel: number, emergency: boolean): number {
  const base = PURCHASE_COST * (emergency ? PURCHASE_EMERGENCY_MULTIPLIER : 1);
  return Math.max(1, Math.round(base * (1 - getPurchaseDiscount(buyerLevel))));
}

export function getPurchaseDuration(tavernLevel: number): number {
  const shrink = (tavernLevel - 1) * PURCHASE_TAVERN_SHRINK_PER_LEVEL_MS;
  return Math.max(PURCHASE_FLOOR_MS, PURCHASE_TIME_MS - shrink);
}

/** 每期应还金额：剩余本息按剩余期数均摊并向上取整，末期自然补齐。 */
export function getLoanDue(remaining: number, periodsLeft: number): number {
  if (periodsLeft <= 0) return 0;
  return Math.ceil(remaining / periodsLeft);
}

/** 昼夜色带插值。t: 0=清晨 1=夜晚。纯 RGB 通道线性插值。 */
export function skyColorAt(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    const a = SKY_STOPS[i];
    const b = SKY_STOPS[i + 1];
    if (clamped >= a.t && clamped <= b.t) {
      const k = (clamped - a.t) / (b.t - a.t || 1);
      const ar = (a.color >> 16) & 0xff;
      const ag = (a.color >> 8) & 0xff;
      const ab = a.color & 0xff;
      const br = (b.color >> 16) & 0xff;
      const bg = (b.color >> 8) & 0xff;
      const bb = b.color & 0xff;
      const r = Math.round(ar + (br - ar) * k);
      const g = Math.round(ag + (bg - ag) * k);
      const bl = Math.round(ab + (bb - ab) * k);
      return (r << 16) | (g << 8) | bl;
    }
  }
  return SKY_STOPS[SKY_STOPS.length - 1].color;
}
