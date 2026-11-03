// 纯数值逻辑：不依赖 Phaser / DOM，便于单元测试。数值本身都在 config.ts。
import { GAME } from "./config";

/** 员工可勾选的三项工作：招待入座 / 烹饪 / 采买。 */
export type Job = "seat" | "cook" | "buy";
export const JOBS: Job[] = ["seat", "cook", "buy"];
export const JOB_NAMES: Record<Job, string> = { seat: "招待", cook: "烹饪", buy: "采买" };
export const STAT_NAMES: Record<Job, string> = { seat: "身法", cook: "厨艺", buy: "精明" };

const C = GAME;
export const TABLE_COUNT_BASE = C.tavern.groundFloorBaseBooths;
export const ARRIVAL_MIN_MS = C.session.arrivalMinMs;
export const ARRIVAL_MAX_MS = C.session.arrivalMaxMs;
export const ARRIVAL_TAVERN_SHRINK_MS = C.session.arrivalShrinkPerLevelMs;
export const ARRIVAL_FLOOR_MS = C.session.arrivalFloorMs;
export const STARTING_COINS = C.start.coins;
export const STARTING_INVENTORY = C.start.ingredients;
export const PURCHASE_COST = C.purchase.cost;
export const PURCHASE_TIME_MS = C.purchase.emergencyTimeMs;
export const PURCHASE_EMERGENCY_MULTIPLIER = C.purchase.emergencyPriceMultiplier;
export const PURCHASE_TAVERN_SHRINK_PER_LEVEL_MS = C.purchase.emergencyShrinkPerLevelMs;
export const PURCHASE_FLOOR_MS = C.purchase.emergencyFloorMs;
export const UPGRADE_BASE_COST = C.tavern.upgradeBaseCost;
export const UPGRADE_COST_MULTIPLIER = C.tavern.upgradeCostMultiplier;
export const LOAN_PERIODS = C.bank.periods;
export const BANKRUPT_STREAK = C.bank.bankruptStreak;
export const NIGHT_COLOR = 0x1b2440;

export interface Dish {
  id: string;
  name: string;
  price: number;
  cookMs: number;
  unlockLevel: number;
}

// 价格越高、单位时间收益越低：高价菜靠口味/稀客加成才值得，走量菜靠翻台。
// price / cookMs（每秒收益）从 4.0 逐级降到 2.95，避免“只挂最贵一道菜”成为唯一解。
export const DISHES: Dish[] = C.dishes;

export interface LoanDef {
  id: string;
  name: string;
  principal: number;
  totalRepay: number;
  unlockLevel: number;
  /** 最早可借的第几天：小借要求先亲手经营两天。 */
  minDay: number;
}

export const LOANS: LoanDef[] = C.bank.loans;

export const SKY_STOPS = [
  { t: 0, color: 0xa8d8ff },
  { t: 0.28, color: 0x74bdf7 },
  { t: 0.68, color: 0xf0a05a },
  { t: 1, color: 0x1b2440 },
] as const;

export function getBoothCount(level: number): number {
  return TABLE_COUNT_BASE + (level - 1);
}

// ===== 楼层：一层散座 / 二层雅座 / 三层仙门包间 =====
export const MAX_FLOORS = 3;
export const FLOOR_CAP = C.tavern.boothsPerFloorCap;
export const FLOOR_UNLOCKS = C.tavern.floorUnlocks;

export type FloorIndex = 0 | 1 | 2;

/** floor 0/1/2 = 1F/2F/3F；未建成的楼层返回 0。 */
export function getFloorBoothCount(level: number, floorsBuilt: number, floor: number): number {
  if (floor < 0 || floor >= MAX_FLOORS || floor > floorsBuilt) return 0;
  const lvl = Math.max(1, level);
  if (floor === 0) return Math.min(FLOOR_CAP, TABLE_COUNT_BASE + Math.min(1, lvl - 1));
  // 楼上每层建成时 2 桌，之后酒楼每升一级 +1
  return Math.min(FLOOR_CAP, 2 + Math.max(0, lvl - FLOOR_UNLOCKS[floor - 1].level));
}

export function getTotalBoothCount(level: number, floorsBuilt: number): number {
  let total = 0;
  for (let floor = 0; floor < MAX_FLOORS; floor++) total += getFloorBoothCount(level, floorsBuilt, floor);
  return total;
}

export function getFloorPriceMultiplier(floor: number): number {
  return C.tavern.floorPriceMultipliers[Math.min(2, Math.max(0, floor))];
}

export function getFloorPatienceMultiplier(floor: number): number {
  return C.tavern.floorPatienceMultipliers[Math.min(2, Math.max(0, floor))];
}

/** 每多一层，日租 + rentPerFloor。 */
export function getFloorRent(floorsBuilt: number): number {
  return Math.max(0, floorsBuilt) * C.tavern.rentPerFloor;
}

/** 12 桌后的等级只给很小的全局售价成长。 */
export function getPostCapPriceBonus(level: number): number {
  return 1 + Math.max(0, level - C.tavern.postCapPriceStartLevel) * C.tavern.postCapPriceStep;
}

export function getUpgradeCost(level: number): number {
  return Math.round(UPGRADE_BASE_COST * Math.pow(UPGRADE_COST_MULTIPLIER, level - 1));
}

// ===== 营造：除雅座扩建外的两条专精线 =====
export const STOVE_BASE_COST = C.stove.baseCost;
export const STOVE_COST_MULTIPLIER = C.stove.costMultiplier;
export const STOVE_SPEEDUP = C.stove.speedupPerLevel;
export const STOVE_SPEED_FLOOR = C.stove.speedFloor;

export function getStoveUpgradeCost(level: number): number {
  return Math.round(STOVE_BASE_COST * Math.pow(STOVE_COST_MULTIPLIER, Math.max(0, level)));
}

/** 每级灶台专精让烹饪快 10%，乘算，最低到基础耗时的 50%。 */
export function getStoveSpeedFactor(level: number): number {
  return Math.max(STOVE_SPEED_FLOOR, Math.pow(STOVE_SPEEDUP, Math.max(0, level)));
}

export const SIGN_BASE_COST = C.sign.baseCost;
export const SIGN_COST_MULTIPLIER = C.sign.costMultiplier;

export function getSignUpgradeCost(level: number): number {
  return Math.round(SIGN_BASE_COST * Math.pow(SIGN_COST_MULTIPLIER, Math.max(0, level)));
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

/** 员工耗时：对口属性越高越快；stars 是这项工作对应的属性星数。 */
export function getStaffDuration(
  stars: number,
  base: number,
  shrinkPerLevel: number,
  floor: number,
  tavernLevel: number,
  speedFactor = 1,
): number {
  const raw = base * getStarSpeedFactor(stars) * speedFactor - (tavernLevel - 1) * shrinkPerLevel;
  return Math.max(floor, raw);
}

/** 到店间隔。base 由调用方传入随机值，保持函数纯净可测。 */
export function getArrivalInterval(tavernLevel: number, base: number): number {
  return Math.max(ARRIVAL_FLOOR_MS, base - (tavernLevel - 1) * ARRIVAL_TAVERN_SHRINK_MS);
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
  /** 每个来客都有名字，坐进店里才像个人。 */
  names: string[];
}

export const PATRON_KINDS: PatronKind[] = C.patronKinds;

/** 稀客：★ 标记、特殊音效、更多声望，受灵雾与声望放大权重。 */
export function isRarePatron(kind: PatronKind): boolean {
  return kind.priceFactor >= C.rarePriceFactor;
}

/** roll 取 [0,1)，同一类食客也有不同姓名。 */
export function pickPatronName(kind: PatronKind, roll: number): string {
  return kind.names[Math.floor(Math.min(0.999999, Math.max(0, roll)) * kind.names.length)];
}

/**
 * 按权重抽食客类型；roll 取 [0,1) 方便测试。
 * rareWeightFactor 只放大稀客（priceFactor ≥ 1.8）的权重，供「灵雾」天时使用。
 */
export function pickPatronKind(roll: number, rareWeightFactor = 1): PatronKind {
  const factor = Math.max(0, rareWeightFactor);
  const weightOf = (kind: PatronKind) => kind.weight * (isRarePatron(kind) ? factor : 1);
  const total = PATRON_KINDS.reduce((sum, kind) => sum + weightOf(kind), 0);
  let cursor = Math.min(0.999999, Math.max(0, roll)) * total;
  for (const kind of PATRON_KINDS) {
    cursor -= weightOf(kind);
    if (cursor < 0) return kind;
  }
  return PATRON_KINDS[PATRON_KINDS.length - 1];
}

/**
 * 从「当前已解锁的菜」里挑一道本类食客偏爱的菜。
 * 注意不是从今日菜单里挑：菜单没上的菜也会被点名，端不上就只付半价——这样“只挂一道最贵菜”会被口味需求惩罚。
 * roll 取 [0,1)。
 */
export function pickPatronWish(kind: PatronKind, availableDishIds: string[], roll: number): string | null {
  const options = kind.favorites.filter((id) => availableDishIds.includes(id));
  if (options.length === 0) return null;
  return options[Math.floor(roll * options.length) % options.length];
}

/** 菜单页提示：哪些食客类型会偏爱这道菜。 */
export function getDishFans(dishId: string): string[] {
  return PATRON_KINDS.filter((kind) => kind.favorites.includes(dishId)).map((kind) => kind.name);
}

// ===== 声望 =====
/**
 * 声望是修仙界对这家酒楼的长期印象：服务客人累积，客人流失回退。
 * 等级决定当天到店人数与稀客比例，是长线成长的主轴。
 */
export const REP_GAIN_SERVED = C.reputation.gainServed;
export const REP_GAIN_RARE = C.reputation.gainRare;
export const REP_LOSS = C.reputation.lossPerPatron;

export interface RepLevelDef {
  title: string;
  /** 达到本级所需的累计声望。 */
  threshold: number;
  /** 本级当天到店客人数。 */
  patrons: number;
}

export const REP_LEVELS: RepLevelDef[] = C.reputation.levels;

/** 当前声望所在等级下标（0 = 无名小馆）。 */
export function getRepTier(reputation: number): number {
  let tier = 0;
  for (let i = 0; i < REP_LEVELS.length; i++) {
    if (reputation >= REP_LEVELS[i].threshold) tier = i;
  }
  return tier;
}

/** 声望等级 1–9，同时用作稀客权重倍率。 */
export function getRepLevel(reputation: number): number {
  return getRepTier(reputation) + 1;
}

export function getRepLevelInfo(reputation: number): RepLevelDef {
  return REP_LEVELS[getRepTier(reputation)];
}

/** 下一级门槛；满级返回 null。 */
export function getNextRepThreshold(reputation: number): number | null {
  return REP_LEVELS[getRepTier(reputation) + 1]?.threshold ?? null;
}

/** 服务完一位客人：稀客登门，名声传得更远。 */
export function getRepGain(kind: PatronKind): number {
  return isRarePatron(kind) ? REP_GAIN_RARE : REP_GAIN_SERVED;
}

/** 声望封顶在最高一级门槛，避免无限累积后掉级失去意义。 */
export function gainReputation(reputation: number, amount: number): number {
  const cap = REP_LEVELS[REP_LEVELS.length - 1].threshold;
  return Math.min(cap, Math.max(0, reputation + Math.max(0, amount)));
}

/**
 * 一批流失最多掉一级：即使一次走了很多人（提前打烊清场、缺料连锁），
 * 也只回退到上一级门槛，防止一次失误清空一周进度。
 */
export function loseReputation(reputation: number, lostCount: number): number {
  if (lostCount <= 0) return reputation;
  const tier = getRepTier(reputation);
  const raw = Math.max(0, reputation - lostCount * REP_LOSS);
  if (tier === 0) return raw;
  return Math.max(REP_LEVELS[tier - 1].threshold, raw);
}

export const WISH_PRICE_BONUS = C.pricing.wishBonus;
export const WISH_MISS_MULTIPLIER = C.pricing.wishMissMultiplier;
export const DAILY_SPECIAL_BONUS = C.pricing.dailySpecialBonus;

/**
 * 今日招牌：从已解锁菜品里按天轮换一道，售价 +25%。
 * 只有一道菜时不设招牌，避免新手日凭空多一条规则；roll 由天数和等级确定，读档一致。
 */
export function getDailySpecial(day: number, level: number, availableDishIds: string[]): string | null {
  if (availableDishIds.length < 2) return null;
  const index =
    ((Math.max(1, day) * 7 + Math.max(1, level) * 3) % availableDishIds.length + availableDishIds.length) %
    availableDishIds.length;
  return availableDishIds[index] ?? null;
}

export function getSpecialPrice(base: number, isSpecial: boolean): number {
  return isSpecial ? Math.round(base * (1 + DAILY_SPECIAL_BONUS)) : base;
}

/** 端上想吃的菜加价；有想吃的却上错，食客只付半价。bonus 供天时叠加。 */
export function getWishPrice(base: number, matched: boolean, hasWish = false, bonus = 0): number {
  if (matched) return Math.round(base * (1 + WISH_PRICE_BONUS + Math.max(0, bonus)));
  if (hasWish) return Math.round(base * WISH_MISS_MULTIPLIER);
  return base;
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
export const RANDOM_EVENTS: RandomEventDef[] = C.events.pool;

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
export type DailyGoalKind = "revenue" | "wish";

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
  return getDailyGoalOptions(day, level)[(Math.max(1, day) - 1) % 2];
}

export function getGoalProgress(goal: DailyGoal, stats: SessionStats): number {
  const value = goal.kind === "revenue" ? stats.revenue : stats.wishes;
  return Math.min(goal.target, Math.max(0, value));
}

export function isGoalMet(goal: DailyGoal, stats: SessionStats): boolean {
  return getGoalProgress(goal, stats) >= goal.target;
}

export interface GoalPayout {
  met: boolean;
  partial: boolean;
  progress: number;
  coins: number;
  cultivation: number;
}

/** 每天二选一的目标：收入/口味，奖励略有差异，让玩家按今日菜单做选择。 */
export function getDailyGoalOptions(_day: number, level: number): DailyGoal[] {
  const G = C.dailyGoal;
  const rewardCoins = G.rewardCoinsBase + level * G.rewardCoinsPerLevel;
  const rewardCultivation = G.rewardCultivationBase + Math.floor(level / G.rewardCultivationLevelsPerStep);
  const revenueTarget = G.revenueBase + level * G.revenuePerLevel;
  const wishTarget = G.wishBase + Math.floor(level / G.wishLevelsPerStep);
  return [
    {
      kind: "revenue",
      label: `本日收入 ${revenueTarget} 灵石`,
      target: revenueTarget,
      rewardCoins: rewardCoins + G.revenueGoalExtraCoins,
      rewardCultivation,
    },
    {
      kind: "wish",
      label: `满足 ${wishTarget} 位食客的口味`,
      target: wishTarget,
      rewardCoins: rewardCoins,
      rewardCultivation: rewardCultivation + G.wishGoalExtraCultivation,
    },
  ];
}

/** 每天的店面租金，按等级缓慢上涨；结算时扣除。 */
export function getDailyRent(level: number): number {
  return C.tavern.rentBase + Math.max(1, level) * C.tavern.rentPerLevel;
}

/** 每七天一次灯会：客流更旺、目标赏更高，给长局一个周节奏。 */
export const FESTIVAL_INTERVAL = C.festival.interval;

export function isFestivalDay(day: number): boolean {
  return Math.max(1, day) % FESTIVAL_INTERVAL === 0;
}

/** 灯会日目标赏金倍率；修为另 +1。 */
export function getFestivalGoalMultiplier(day: number): number {
  return isFestivalDay(day) ? C.festival.goalCoinMultiplier : 1;
}

/** 连续三天达成（或拿到半赏）目标的三日之约奖励。 */
export const GOAL_STREAK_TARGET = C.dailyGoal.streakDays;

export function getStreakBonus(level: number): { coins: number; cultivation: number } {
  return {
    coins: C.dailyGoal.streakCoinsBase + Math.max(1, level) * C.dailyGoal.streakCoinsPerLevel,
    cultivation:
      C.dailyGoal.streakCultivationBase + Math.floor(Math.max(1, level) / C.dailyGoal.streakCultivationLevelsPerStep),
  };
}

/** 差一点也算数：达成给全赏，达到目标 60% 给半赏，避免 6/7、61/64 这类一整天空手。 */
export function getGoalPayout(goal: DailyGoal, stats: SessionStats): GoalPayout {
  const progress = getGoalProgress(goal, stats);
  const met = progress >= goal.target;
  const partial = !met && progress >= Math.ceil(goal.target * C.dailyGoal.partialThreshold);
  const fullCoins = getGoalCoinReward(goal, stats.revenue);
  return {
    met,
    partial,
    progress,
    coins: met ? fullCoins : partial ? Math.max(1, Math.round(fullCoins * C.dailyGoal.partialRewardRatio)) : 0,
    cultivation: met
      ? goal.rewardCultivation
      : partial
        ? Math.max(1, Math.ceil(goal.rewardCultivation * C.dailyGoal.partialRewardRatio))
        : 0,
  };
}

/** 目标奖励 = 基础灵石 + 当日菜品收入的 15%，让高流水的一天也值得为目标调整打法。 */
export const GOAL_REVENUE_BONUS = C.dailyGoal.revenueBonusRatio;

export function getGoalCoinReward(goal: DailyGoal, revenue: number): number {
  return goal.rewardCoins + Math.round(Math.max(0, revenue) * GOAL_REVENUE_BONUS);
}

// ===== 天时：按本机日期轮换的当日环境，让每天开门有不同打法 =====
/**
 * 天时每天（本机公历日期）固定一条，影响客流 / 稀客 / 口味 / 采购 / 修为。
 * 同一台设备同一天里玩多少回合都是同一条；跨天自动换。
 */
export interface OmenDef {
  id: string;
  name: string;
  /** 状态栏与题意用的短说明，控制在 8 字内。 */
  short: string;
  desc: string;
  /** 天气粒子：0=晴（金尘）1=灵雾 2=落英 3=夜雨。 */
  visual: 0 | 1 | 2 | 3;
  /** <1 客流变多；>1 客流变少。 */
  arrivalFactor: number;
  priceFactor: number;
  /** 口味命中额外加价，叠加在 +50% 之上。 */
  wishBonus: number;
  /** <1 采购更便宜。 */
  purchaseFactor: number;
  rareWeightFactor: number;
  /** 亲自下厨每道菜额外修为。 */
  cultivationBonus: number;
}

export const OMENS: OmenDef[] = C.omens;

/** 本机公历日期键，YYYY-MM-DD。 */
// shortcut: 天时与开市利是信任本机时钟，改系统日期可刷；接入服务端或需要防作弊时换成服务器日期
export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** 同一天永远是同一道天时；用日期字符串做稳定散列，读档/重开一致。 */
export function getDailyOmen(dateKey: string): OmenDef {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  return OMENS[hash % OMENS.length];
}

// ===== 开市利是：本机每天第一次开店的一次性奖励 =====
export const GIFT_STREAK_CAP = C.dailyGift.streakCap;

function dateDayNumber(key: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
}

/** 连续开店天数：同一天保持，隔一天 +1，断一天从 1 重来。 */
export function getGiftStreak(
  lastDate: string | null | undefined,
  today: string,
  streak: number,
): number {
  const todayNo = dateDayNumber(today);
  const lastNo = lastDate ? dateDayNumber(lastDate) : null;
  if (todayNo === null) return Math.max(1, streak);
  if (lastNo === null || todayNo < lastNo) return 1;
  if (todayNo === lastNo) return Math.max(1, streak);
  return todayNo === lastNo + 1 ? Math.max(1, streak) + 1 : 1;
}

/** 连续越久赏越多，封顶 7 天；按酒楼等级小幅增长，不让它变成主要收入。 */
export function getDailyGift(
  streak: number,
  level: number,
): { coins: number; cultivation: number; ingredients: number } {
  const s = Math.min(GIFT_STREAK_CAP, Math.max(1, Math.floor(streak)));
  return {
    coins: C.dailyGift.coinsBase + s * C.dailyGift.coinsPerStreakDay + Math.max(1, level) * C.dailyGift.coinsPerLevel,
    cultivation: 1 + Math.floor(s / C.dailyGift.cultivationStreakStep),
    ingredients: s >= C.dailyGift.ingredientsFromStreak ? C.dailyGift.ingredients : 0,
  };
}

// ===== 修为与境界 =====
/** 境界越高，酒楼的仙缘越盛：售价、操作速度、客流依次获得加成。 */
export interface RealmDef {
  name: string;
  cultivation: number;
  perk: string;
  priceMultiplier: number;
  playerSpeed: number;
  staffSpeed: number;
  closingIngredients: number;
}

export const REALMS: RealmDef[] = C.realms;

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

/** 只有亲自下厨才得修为：伙计出菜换灵石，玩家下厨换修行，两者不可兼得。 */
export function getCultivationGain(personal: boolean): number {
  return personal ? C.cultivation.perPersonalDish : 0;
}

export function getRealmPriceMultiplier(realmIndex: number): number {
  return realmAt(realmIndex).priceMultiplier;
}

export function getRealmPlayerSpeedFactor(realmIndex: number): number {
  return realmAt(realmIndex).playerSpeed;
}

export function getRealmStaffSpeedFactor(realmIndex: number): number {
  return realmAt(realmIndex).staffSpeed;
}

/** 打烊时凭空得的灵材（化神起）。 */
export function getRealmClosingIngredients(realmIndex: number): number {
  return realmAt(realmIndex).closingIngredients;
}

function realmAt(realmIndex: number): RealmDef {
  return REALMS[Math.min(REALMS.length - 1, Math.max(0, realmIndex))];
}

/** 飞升一次留一重仙缘，跨周目永久提高售价。 */
export const ASCENSION_PRICE_BONUS = C.ascension.priceBonus;
export const ASCENSION_START_COIN_BONUS = C.ascension.startCoinBonus;
export const ASCENSION_START_INGREDIENT_BONUS = C.ascension.startIngredientBonus;

export function getAscensionPriceMultiplier(ascensions: number): number {
  return 1 + ASCENSION_PRICE_BONUS * Math.max(0, Math.floor(ascensions));
}

/** 每 3 重仙缘，飞升后的新周目直接从更高酒楼等级开局，跳过早期重复劳动。 */
export function getAscensionStartLevel(ascensions: number): number {
  return 1 + Math.floor(Math.max(0, Math.floor(ascensions)) / C.ascension.levelEvery);
}

export function getAscensionStartCoins(ascensions: number): number {
  return STARTING_COINS + Math.max(0, Math.floor(ascensions)) * ASCENSION_START_COIN_BONUS;
}

export function getAscensionStartInventory(ascensions: number): number {
  return STARTING_INVENTORY + Math.max(0, Math.floor(ascensions)) * ASCENSION_START_INGREDIENT_BONUS;
}

// ===== 跨周目账簿与成就 =====
export interface MetaDayRecord {
  day: number;
  level: number;
  served: number;
  revenue: number;
}

export interface MetaStats {
  days: number;
  served: number;
  revenue: number;
  bestRevenue: number;
  bestServed: number;
  goalsMet: number;
  maxRealm: number;
  /** 本机单日收入前 5，按收入降序。 */
  topDays: MetaDayRecord[];
}

export const EMPTY_META: MetaStats = {
  days: 0,
  served: 0,
  revenue: 0,
  bestRevenue: 0,
  bestServed: 0,
  goalsMet: 0,
  maxRealm: 0,
  topDays: [],
};

export function updateMeta(
  meta: MetaStats,
  session: { served: number; revenue: number; goalMet: boolean; realmIndex: number; day: number; level: number },
): MetaStats {
  const topDays = [
    ...meta.topDays,
    {
      day: Math.max(1, session.day),
      level: Math.max(1, session.level),
      served: Math.max(0, session.served),
      revenue: Math.max(0, session.revenue),
    },
  ]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  return {
    days: meta.days + 1,
    served: meta.served + Math.max(0, session.served),
    revenue: meta.revenue + Math.max(0, session.revenue),
    bestRevenue: Math.max(meta.bestRevenue, session.revenue),
    bestServed: Math.max(meta.bestServed, session.served),
    goalsMet: meta.goalsMet + (session.goalMet ? 1 : 0),
    maxRealm: Math.max(meta.maxRealm, session.realmIndex),
    topDays,
  };
}

export interface AchievementView {
  id: string;
  name: string;
  desc: string;
  unlocked: boolean;
}

interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  test: (meta: MetaStats, ascensions: number) => boolean;
}

const ACHIEVEMENT_DEFS: AchievementDef[] = [
  { id: "first", name: "初出茅庐", desc: "累计接待 1 位食客", test: (m) => m.served >= 1 },
  { id: "crowd", name: "门庭若市", desc: "累计接待 100 位食客", test: (m) => m.served >= 100 },
  { id: "full", name: "高朋满座", desc: "单日接待 15 位食客", test: (m) => m.bestServed >= 15 },
  { id: "richday", name: "日进斗金", desc: "单日收入 200 灵石", test: (m) => m.bestRevenue >= 200 },
  { id: "goldcore", name: "金丹大道", desc: "达到金丹境", test: (m) => m.maxRealm >= 2 },
  { id: "nascent", name: "元婴出窍", desc: "达到元婴境", test: (m) => m.maxRealm >= 3 },
  { id: "great", name: "大乘圆满", desc: "达到大乘境", test: (m) => m.maxRealm >= 7 },
  { id: "ascend", name: "飞升上界", desc: "完成一次飞升", test: (_m, a) => a >= 1 },
  { id: "tycoon", name: "富甲一方", desc: "累计收入 5000 灵石", test: (m) => m.revenue >= 5000 },
  { id: "veteran", name: "百日光阴", desc: "累计营业 100 日", test: (m) => m.days >= 100 },
];

export function getAchievements(meta: MetaStats, ascensions: number): AchievementView[] {
  return ACHIEVEMENT_DEFS.map(({ test, ...view }) => ({ ...view, unlocked: test(meta, ascensions) }));
}

// ===== 员工 =====
export interface Employee {
  id: number;
  name: string;
  /** 三项属性（星），按工作对应：seat 身法 / cook 厨艺 / buy 精明。 */
  stars: Record<Job, number>;
  /** 每项工作累计完成次数，满 workPerStar 次对应属性 +1 星。 */
  work: Record<Job, number>;
  /** 工作优先级：从上往下，空闲时取第一件能做的；on=false 表示不做这项。 */
  jobs: { job: Job; on: boolean }[];
}

const S = C.staff;

export function getStaffCap(tavernLevel: number): number {
  return Math.min(S.capMax, S.capBase + Math.floor(Math.max(1, tavernLevel) / S.capLevelsPerSlot));
}

export function getTotalStars(e: Pick<Employee, "stars">): number {
  return e.stars.seat + e.stars.cook + e.stars.buy;
}

export function getStaffWage(e: Pick<Employee, "stars">): number {
  return Math.round(S.wageBase + S.wagePerStar * getTotalStars(e));
}

export function getHireCost(e: Pick<Employee, "stars">): number {
  return Math.round(S.hireCostBase + S.hireCostPerStar * getTotalStars(e));
}

/** 耗时倍率：1 星 1.6 倍玩家耗时，每多 1 星 ×0.9。 */
export function getStarSpeedFactor(stars: number): number {
  return S.speedAtOneStar * Math.pow(S.speedPerStar, Math.max(1, stars) - 1);
}

/** 烹饪质量 = 售价倍率，厨艺越高售价越高。 */
export function getCookQuality(stars: number): number {
  return S.qualityBase + S.qualityPerStar * Math.max(1, stars);
}

/** 采购折扣：精明每星 5%，封顶 50%；没有人勾采买时传 0。 */
export function getPurchaseDiscount(buyStars: number): number {
  return Math.min(S.buyDiscountCap, S.buyDiscountPerStar * Math.max(buyStars, 0));
}

export function getPurchasePrice(buyStars: number, emergency: boolean): number {
  const base = PURCHASE_COST * (emergency ? PURCHASE_EMERGENCY_MULTIPLIER : 1);
  return Math.max(1, Math.round(base * (1 - getPurchaseDiscount(buyStars))));
}

/** 新员工默认勾选全部工作，按属性从高到低排序（同分按 招待/烹饪/采买）。 */
export function defaultJobs(stars: Record<Job, number>): Employee["jobs"] {
  return [...JOBS].sort((a, b) => stars[b] - stars[a]).map((job) => ({ job, on: true }));
}

/** 随机生成候选人：每项至少 1 星，其余星数逐颗随机分配；rand 返回 [0,1)。 */
export function rollCandidate(id: number, rand: () => number): Employee {
  const stars: Record<Job, number> = { seat: 1, cook: 1, buy: 1 };
  for (let left = S.candidateTotalStars - 3; left > 0; left--) {
    const open = JOBS.filter((job) => stars[job] < S.maxStars);
    if (open.length === 0) break;
    stars[open[Math.floor(rand() * open.length) % open.length]] += 1;
  }
  const name = S.names[Math.floor(rand() * S.names.length) % S.names.length];
  return { id, name, stars, work: { seat: 0, cook: 0, buy: 0 }, jobs: defaultJobs(stars) };
}

/** 记一次工作；攒满次数就涨一星。返回是否涨星。 */
export function recordWork(e: Employee, job: Job): boolean {
  e.work[job] += 1;
  if (e.work[job] < S.workPerStar || e.stars[job] >= S.maxStars) return false;
  e.work[job] = 0;
  e.stars[job] += 1;
  return true;
}

/** 列表里上移一项工作。 */
export function moveJobUp(e: Employee, index: number): void {
  if (index <= 0 || index >= e.jobs.length) return;
  [e.jobs[index - 1], e.jobs[index]] = [e.jobs[index], e.jobs[index - 1]];
}

const LEGACY_JOB = { hawker: "seat", server: "seat", cook: "cook", buyer: "buy" } as const;
const LEGACY_NAME = { hawker: "迎客", server: "跑堂", cook: "灶上", buyer: "采买" } as const;

/**
 * 旧存档（固定岗位制）迁移：每个已雇岗位转成一名员工，只勾原岗位，
 * 对口属性按原等级折算。迎客的招客效果已拆，按招待处理。
 */
export function migrateLegacyStaff(levels: Partial<Record<keyof typeof LEGACY_JOB, number>> | undefined): Employee[] {
  const out: Employee[] = [];
  for (const role of ["hawker", "server", "cook", "buyer"] as const) {
    const level = Math.max(0, Math.floor(Number(levels?.[role]) || 0));
    if (level <= 0) continue;
    const job = LEGACY_JOB[role];
    const stars: Record<Job, number> = { seat: S.migrateOtherStars, cook: S.migrateOtherStars, buy: S.migrateOtherStars };
    stars[job] = Math.min(S.maxStars, level + S.migrateStarOffset);
    out.push({
      id: out.length + 1,
      name: `${LEGACY_NAME[role]}伙计`,
      stars,
      work: { seat: 0, cook: 0, buy: 0 },
      jobs: [job, ...JOBS.filter((j) => j !== job)].map((j) => ({ job: j, on: j === job })),
    });
  }
  return out;
}

/** 读档清洗：丢掉字段缺失的，数值夹到合法范围。 */
export function sanitizeEmployees(raw: unknown): Employee[] {
  if (!Array.isArray(raw)) return [];
  const clampStar = (v: unknown) => Math.min(S.maxStars, Math.max(1, Math.floor(Number(v) || 1)));
  const count = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
  return raw
    .filter((e) => e && typeof e.name === "string" && e.stars && Array.isArray(e.jobs))
    .map((e, i) => {
      const seen = new Set<Job>();
      const jobs = (e.jobs as { job: Job; on: unknown }[])
        .filter((j) => j && JOBS.includes(j.job) && !seen.has(j.job) && seen.add(j.job))
        .map((j) => ({ job: j.job, on: j.on !== false }));
      for (const job of JOBS) if (!seen.has(job)) jobs.push({ job, on: false });
      return {
        id: Number.isFinite(e.id) ? Math.floor(e.id) : i + 1,
        name: e.name,
        stars: { seat: clampStar(e.stars.seat), cook: clampStar(e.stars.cook), buy: clampStar(e.stars.buy) },
        work: { seat: count(e.work?.seat), cook: count(e.work?.cook), buy: count(e.work?.buy) },
        jobs,
      };
    });
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
