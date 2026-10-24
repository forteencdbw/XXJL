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
  { id: "ginseng", name: "九转灵参", price: 26, cookMs: 5200, unlockLevel: 6 },
  { id: "phoenix", name: "凤凰涅槃羹", price: 38, cookMs: 6500, unlockLevel: 8 },
  { id: "voidfruit", name: "太虚道果", price: 55, cookMs: 8000, unlockLevel: 10 },
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

// ===== 营造：除雅座扩建外的两条专精线 =====
export const STOVE_BASE_COST = 24;
export const STOVE_COST_MULTIPLIER = 1.75;
export const STOVE_SPEEDUP = 0.9;
export const STOVE_SPEED_FLOOR = 0.5;

export function getStoveUpgradeCost(level: number): number {
  return Math.round(STOVE_BASE_COST * Math.pow(STOVE_COST_MULTIPLIER, Math.max(0, level)));
}

/** 每级灶台专精让烹饪快 10%，乘算，最低到基础耗时的 50%。 */
export function getStoveSpeedFactor(level: number): number {
  return Math.max(STOVE_SPEED_FLOOR, Math.pow(STOVE_SPEEDUP, Math.max(0, level)));
}

export const SIGN_BASE_COST = 18;
export const SIGN_COST_MULTIPLIER = 1.7;
export const SIGN_ARRIVAL_SHRINK = 0.93;
export const SIGN_ARRIVAL_FLOOR = 0.5;

export function getSignUpgradeCost(level: number): number {
  return Math.round(SIGN_BASE_COST * Math.pow(SIGN_COST_MULTIPLIER, Math.max(0, level)));
}

/** 每级门面招幡让到店间隔缩短 7%，乘算，最低到基础间隔的 50%。 */
export function getSignArrivalFactor(level: number): number {
  return Math.max(SIGN_ARRIVAL_FLOOR, Math.pow(SIGN_ARRIVAL_SHRINK, Math.max(0, level)));
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

// ===== 食客类型与口味 =====
/** 不同来客的耐心与口味不同；偏爱菜在今日菜单里时才会提出想吃。 */
export interface PatronKind {
  id: string;
  name: string;
  bodyColor: number;
  hairColor: number;
  patienceFactor: number;
  favorites: string[];
  /** 抽取权重：常规食客高，仙门长老/魔道散人这类稀客很低。 */
  weight: number;
  /** 客单价倍率：身份越特殊越舍得掏灵石。 */
  priceFactor: number;
}

export const PATRON_KINDS: PatronKind[] = [
  { id: "rogue", name: "散修", bodyColor: 0x7a8a6a, hairColor: 0x2b2b2b, patienceFactor: 1, favorites: ["stirfry", "ginseng"], weight: 8, priceFactor: 1 },
  { id: "sword", name: "剑修", bodyColor: 0x5a7a9a, hairColor: 0x1b1b2b, patienceFactor: 0.8, favorites: ["fish", "jelly", "voidfruit"], weight: 8, priceFactor: 1.1 },
  { id: "alchemist", name: "丹修", bodyColor: 0x8a6a9a, hairColor: 0x3b2b3b, patienceFactor: 1.1, favorites: ["porridge", "jelly", "ginseng"], weight: 8, priceFactor: 1.05 },
  { id: "demon", name: "妖修", bodyColor: 0x9a5a3a, hairColor: 0x4a2b1b, patienceFactor: 1.2, favorites: ["fish", "stirfry", "phoenix"], weight: 8, priceFactor: 1.2 },
  { id: "mortal", name: "凡人", bodyColor: 0xb0a090, hairColor: 0x3b3b3b, patienceFactor: 1.3, favorites: [], weight: 8, priceFactor: 0.9 },
  { id: "elder", name: "仙门长老", bodyColor: 0xe8e0c8, hairColor: 0xdfe6ff, patienceFactor: 1.5, favorites: ["ginseng", "phoenix", "voidfruit"], weight: 1, priceFactor: 2.5 },
  { id: "demonlord", name: "魔道散人", bodyColor: 0x6a2a3a, hairColor: 0x1a1a1a, patienceFactor: 0.7, favorites: ["fish", "phoenix"], weight: 1, priceFactor: 1.8 },
];

/** 按权重抽食客类型；roll 取 [0,1) 方便测试。 */
export function pickPatronKind(roll: number): PatronKind {
  const total = PATRON_KINDS.reduce((sum, kind) => sum + kind.weight, 0);
  let cursor = Math.min(0.999999, Math.max(0, roll)) * total;
  for (const kind of PATRON_KINDS) {
    cursor -= kind.weight;
    if (cursor < 0) return kind;
  }
  return PATRON_KINDS[PATRON_KINDS.length - 1];
}

/** 从今日菜单里挑一道本类食客偏爱的菜；菜单里没有偏爱菜就不挑食。roll 取 [0,1)。 */
export function pickPatronWish(kind: PatronKind, menuDishIds: string[], roll: number): string | null {
  const options = kind.favorites.filter((id) => menuDishIds.includes(id));
  if (options.length === 0) return null;
  return options[Math.floor(roll * options.length) % options.length];
}

export const WISH_PRICE_BONUS = 0.5;

/** 端上食客想吃的菜，售价加成。 */
export function getWishPrice(base: number, matched: boolean): number {
  return matched ? Math.round(base * (1 + WISH_PRICE_BONUS)) : base;
}

// ===== 随机事件 =====
export interface RandomEventDef {
  id: string;
  text: string;
  kind: "good" | "bad" | "mixed";
  coins: number;
  ingredients: number;
  cultivation: number;
  weight: number;
}

/** 事件池整体期望为正，单次损失有硬上限（灵石 -4、灵材 -2）。 */
export const RANDOM_EVENTS: RandomEventDef[] = [
  { id: "rain", text: "灵雨润田，后厨凭空多出一筐灵材", kind: "good", coins: 0, ingredients: 3, cultivation: 0, weight: 2 },
  { id: "immortal", text: "一位过路仙长尝了口小菜，留下几块灵石", kind: "good", coins: 6, ingredients: 0, cultivation: 0, weight: 2 },
  { id: "guidance", text: "仙人指路，你在灶火间窥见一丝道韵", kind: "good", coins: 0, ingredients: 0, cultivation: 3, weight: 2 },
  { id: "tip", text: "食客吃得尽兴，多留了一份赏钱", kind: "good", coins: 5, ingredients: 0, cultivation: 0, weight: 2 },
  { id: "oldfriend", text: "旧友来访，叙旧之余留下一壶灵酒", kind: "good", coins: 3, ingredients: 0, cultivation: 2, weight: 1 },
  { id: "crane", text: "仙鹤衔芝落在檐角，赠你一味灵材与一段感悟", kind: "good", coins: 0, ingredients: 4, cultivation: 6, weight: 1 },
  { id: "beggar", text: "小妖讨食，你舍了一味灵材，换得它口中一段修行心得", kind: "mixed", coins: 0, ingredients: -1, cultivation: 4, weight: 2 },
  { id: "wind", text: "妖风过境，吹散了后厨晾着的一味灵材", kind: "bad", coins: 0, ingredients: -2, cultivation: 0, weight: 1 },
  { id: "thief", text: "蟊贼光顾，柜上少了几块灵石", kind: "bad", coins: -4, ingredients: 0, cultivation: 0, weight: 1 },
  { id: "mishap", text: "灶台走了水，赔了些灵石与灵材", kind: "bad", coins: -3, ingredients: -1, cultivation: 0, weight: 1 },
];

/** 按权重抽一个事件；roll 取 [0,1) 方便测试。 */
export function pickRandomEvent(roll: number): RandomEventDef {
  const total = RANDOM_EVENTS.reduce((sum, event) => sum + event.weight, 0);
  let cursor = Math.min(0.999999, Math.max(0, roll)) * total;
  for (const event of RANDOM_EVENTS) {
    cursor -= event.weight;
    if (cursor < 0) return event;
  }
  return RANDOM_EVENTS[RANDOM_EVENTS.length - 1];
}

export interface EventState {
  coins: number;
  ingredients: number;
  cultivation: number;
}

/** 结算事件：灵材与修为不为负，灵石按事件允许扣成欠款。 */
export function applyEvent(event: RandomEventDef, state: EventState): EventState {
  return {
    coins: state.coins + event.coins,
    ingredients: Math.max(0, state.ingredients + event.ingredients),
    cultivation: Math.max(0, state.cultivation + event.cultivation),
  };
}

// ===== 每日目标 =====
export type DailyGoalKind = "serve" | "revenue" | "wish";

export interface DailyGoal {
  kind: DailyGoalKind;
  label: string;
  target: number;
  rewardCoins: number;
  rewardCultivation: number;
}

export interface SessionStats {
  served: number;
  revenue: number;
  wishes: number;
}

/** 每日目标按天轮换，难度随酒楼等级成长；奖励跟着等级走。 */
export function getDailyGoal(day: number, level: number): DailyGoal {
  const rewardCoins = 8 + level * 4;
  const rewardCultivation = 2 + Math.floor(level / 3);
  const base = { rewardCoins, rewardCultivation };
  switch (((Math.max(1, day) - 1) % 3)) {
    case 0: {
      const target = 5 + level;
      return { ...base, kind: "serve", target, label: `接待 ${target} 位食客` };
    }
    case 1: {
      const target = 40 + level * 12;
      return { ...base, kind: "revenue", target, label: `本日收入 ${target} 灵石` };
    }
    default: {
      const target = 2 + Math.floor(level / 2);
      return { ...base, kind: "wish", target, label: `满足 ${target} 位食客的口味` };
    }
  }
}

export function getGoalProgress(goal: DailyGoal, stats: SessionStats): number {
  const value =
    goal.kind === "serve" ? stats.served : goal.kind === "revenue" ? stats.revenue : stats.wishes;
  return Math.min(goal.target, Math.max(0, value));
}

export function isGoalMet(goal: DailyGoal, stats: SessionStats): boolean {
  return getGoalProgress(goal, stats) >= goal.target;
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

/** 飞升一次留一重仙缘，跨周目永久提高售价。 */
export const ASCENSION_PRICE_BONUS = 0.1;

export function getAscensionPriceMultiplier(ascensions: number): number {
  return 1 + ASCENSION_PRICE_BONUS * Math.max(0, Math.floor(ascensions));
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
