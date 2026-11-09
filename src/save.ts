// 存档编解码（纯逻辑，不依赖 Phaser）：新档长什么样、读进来的数据怎么清洗，都只在这里。
// 未上线前不做迁移：结构一变就升 SAVE_VERSION，旧存档与旧导出码直接作废。
import {
  DISHES,
  EMPTY_META,
  FLOOR_UNLOCKS,
  SHOPKEEPER_ID,
  STARTING_COINS,
  STARTING_INVENTORY,
  createShopkeeper,
  getNightDurationMs,
  getRealmIndex,
  sanitizeEmployees,
} from "./logic";
import type { DailyGoal, Employee, MetaStats, RootElement } from "./logic";

export const SAVE_VERSION = 3;

export interface RegularGuest {
  name: string;
  kindId: string;
  wish: string;
  visits: number;
}

export interface SaveData {
  v: typeof SAVE_VERSION;
  coins: number;
  inventory: number;
  level: number;
  stoveLevel: number;
  signLevel: number;
  /** 修仙界对本店的累计印象，决定每天到店人数与稀客比例。 */
  reputation: number;
  /** 掌柜（也是员工，不能辞退、不领工资）。 */
  shopkeeper: Employee;
  employees: Employee[];
  /** 今日招聘候选人与生成它们的天数。 */
  candidates: Employee[];
  candidatesDay: number;
  nextStaffId: number;
  borrowedIds: string[];
  activeLoans: { name: string; remaining: number; periodsLeft: number }[];
  negativeStreak: number;
  cultivation: number;
  day: number;
  ascensions: number;
  selectedDishIds: string[];
  playerGender: "male" | "female";
  /** 夜修已走的毫秒；营业中为 0。 */
  nightMs: number;
  meta: MetaStats;
  regulars: RegularGuest[];
  /** 当日目标快照：读档后不能因等级变化换目标，否则同一目标会显示两个数。 */
  dailyGoal: DailyGoal | null;
  goalStreak: number;
  /** 最近一次领开市利是的本机日期（YYYY-MM-DD）与连续天数。 */
  lastGiftDate?: string;
  giftStreak: number;
  floorsBuilt: number;
}

/** 新档要从上一份继承的东西：破产重开时保留仙缘、掌柜本人、账簿与利是记录；全新存档都不传。 */
export interface SaveCarry {
  ascensions?: number;
  playerGender?: "male" | "female";
  shopkeeperRoot?: RootElement[];
  meta?: MetaStats;
  lastGiftDate?: string;
  giftStreak?: number;
}

/** 新档（含破产重开）：第 1 日辰正开张，不先过夜。所有开局数值只在这里。 */
export function newSave(carry: SaveCarry = {}): SaveData {
  const shopkeeper = createShopkeeper();
  return {
    v: SAVE_VERSION,
    coins: STARTING_COINS,
    inventory: STARTING_INVENTORY,
    level: 1,
    stoveLevel: 0,
    signLevel: 0,
    reputation: 0,
    shopkeeper: carry.shopkeeperRoot ? { ...shopkeeper, root: carry.shopkeeperRoot } : shopkeeper,
    employees: [],
    candidates: [],
    candidatesDay: 0,
    nextStaffId: 1,
    borrowedIds: [],
    activeLoans: [],
    negativeStreak: 0,
    cultivation: 0,
    day: 1,
    ascensions: carry.ascensions ?? 0,
    selectedDishIds: DISHES.filter((d) => d.unlockLevel <= 1).map((d) => d.id),
    playerGender: carry.playerGender ?? "male",
    nightMs: getNightDurationMs(),
    meta: carry.meta ?? { ...EMPTY_META, topDays: [] },
    regulars: [],
    dailyGoal: null,
    goalStreak: 0,
    lastGiftDate: carry.lastGiftDate,
    giftStreak: carry.giftStreak ?? 0,
    floorsBuilt: 0,
  };
}

/** 这个酒楼等级最多能起几层楼（按 config 的解锁等级）。 */
export function getMaxFloorsBuilt(level: number): number {
  return FLOOR_UNLOCKS.filter((unlock) => level >= unlock.level).length;
}

/**
 * 读档与导入导出码共用：版本不对或不是对象时返回 null；
 * 其余字段逐项清洗，缺失或坏掉的按新档默认值补上，不会把坏数据带进游戏。
 */
export function parseSave(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Partial<Record<keyof SaveData, unknown>> & Record<string, unknown>;
  if (data.v !== SAVE_VERSION) return null;
  const base = newSave();
  const num = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const count = (value: unknown, fallback = 0) => Math.max(0, Math.floor(num(value, fallback)));
  const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
  const strings = (value: unknown) => arr(value).filter((v): v is string => typeof v === "string");
  const rec = (value: unknown) => (value && typeof value === "object" ? (value as Record<string, unknown>) : null);

  const level = Math.max(1, Math.floor(num(data.level, 1)));
  const cultivation = count(data.cultivation);
  // 身份字段以代码为准，防止导出码把掌柜改成可辞退的伙计
  const keeper = sanitizeEmployees([data.shopkeeper])[0] ?? base.shopkeeper;
  const employees = sanitizeEmployees(data.employees);
  const candidates = sanitizeEmployees(data.candidates);
  const maxId = Math.max(0, ...[...employees, ...candidates].map((e) => e.id));
  const goal = rec(data.dailyGoal);
  const meta = rec(data.meta);
  const metaStats: MetaStats = meta
    ? {
        days: count(meta.days),
        served: count(meta.served),
        revenue: count(meta.revenue),
        bestRevenue: count(meta.bestRevenue),
        bestServed: count(meta.bestServed),
        goalsMet: count(meta.goalsMet),
        maxRealm: count(meta.maxRealm),
        topDays: arr(meta.topDays)
          .map(rec)
          .filter(
            (r): r is Record<string, number> =>
              !!r && [r.day, r.level, r.served, r.revenue].every((v) => typeof v === "number" && Number.isFinite(v)),
          )
          .map((r) => ({
            day: Math.max(1, Math.floor(r.day)),
            level: Math.max(1, Math.floor(r.level)),
            served: count(r.served),
            revenue: count(r.revenue),
          }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5),
      }
    : base.meta;
  metaStats.maxRealm = Math.max(metaStats.maxRealm, getRealmIndex(cultivation));

  return {
    v: SAVE_VERSION,
    coins: num(data.coins, base.coins),
    inventory: count(data.inventory),
    level,
    stoveLevel: count(data.stoveLevel),
    signLevel: count(data.signLevel),
    reputation: count(data.reputation),
    shopkeeper: { ...keeper, id: SHOPKEEPER_ID, name: "掌柜" },
    employees,
    candidates,
    candidatesDay: count(data.candidatesDay),
    nextStaffId: Math.max(maxId + 1, count(data.nextStaffId)),
    borrowedIds: strings(data.borrowedIds),
    activeLoans: arr(data.activeLoans)
      .map(rec)
      .filter(
        (l): l is Record<string, number> & { name: string } =>
          !!l && typeof l.name === "string" && Number.isFinite(l.remaining) && Number.isFinite(l.periodsLeft),
      )
      .map((l) => ({ name: l.name, remaining: Math.max(0, l.remaining), periodsLeft: count(l.periodsLeft) })),
    negativeStreak: count(data.negativeStreak),
    cultivation,
    day: Math.max(1, Math.floor(num(data.day, 1))),
    ascensions: count(data.ascensions),
    selectedDishIds: strings(data.selectedDishIds),
    playerGender: data.playerGender === "female" ? "female" : "male",
    nightMs: Math.min(getNightDurationMs(), count(data.nightMs, getNightDurationMs())),
    meta: metaStats,
    regulars: arr(data.regulars)
      .map(rec)
      .filter(
        (r): r is Record<string, string> =>
          !!r && typeof r.name === "string" && typeof r.kindId === "string" && typeof r.wish === "string",
      )
      .slice(0, 6)
      .map((r) => ({ name: r.name, kindId: r.kindId, wish: r.wish, visits: Math.max(1, count(r.visits)) })),
    dailyGoal:
      goal && (goal.kind === "revenue" || goal.kind === "wish") && typeof goal.label === "string" && goal.label.length > 0
        ? {
            kind: goal.kind,
            label: goal.label,
            target: Math.max(1, Math.floor(num(goal.target, 1))),
            rewardCoins: count(goal.rewardCoins),
          }
        : null,
    goalStreak: count(data.goalStreak),
    lastGiftDate:
      typeof data.lastGiftDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.lastGiftDate)
        ? data.lastGiftDate
        : undefined,
    giftStreak: count(data.giftStreak),
    floorsBuilt: Math.min(getMaxFloorsBuilt(level), count(data.floorsBuilt)),
  };
}
