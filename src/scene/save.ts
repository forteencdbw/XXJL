// 存档：序列化、新周目存档、读档清洗。未上线前改结构就升版本号，旧档直接作废。
import { DISHES, EMPTY_META, SHOPKEEPER_ID, STARTING_COINS, STARTING_INVENTORY, createShopkeeper, getNightDurationMs, getRealmIndex, sanitizeEmployees } from "../logic";
import { SAVE_KEY } from "./constants";
import type { SaveData } from "./types";
import type { TavernScene } from "./TavernScene";

export class SaveMethods {
  // ===== 存档 =====
  /** 只存经营进度与选择；营业中不落盘——中途刷新等于放弃本局，避免带着收益跳过工资与还账。 */
  buildSaveData(this: TavernScene): SaveData {
    return {
      v: 3,
      coins: this.coins,
      inventory: this.inventory,
      level: this.level,
      stoveLevel: this.stoveLevel,
      signLevel: this.signLevel,
      reputation: this.reputation,
      shopkeeper: this.shopkeeper,
      employees: this.employees,
      candidates: this.candidates,
      candidatesDay: this.candidatesDay,
      nextStaffId: this.nextStaffId,
      borrowedIds: [...this.borrowedIds],
      activeLoans: this.activeLoans,
      negativeStreak: this.negativeStreak,
      cultivation: this.cultivation,
      day: this.day,
      ascensions: this.ascensions,
      selectedDishIds: [...this.selectedDishIds],
      playerGender: this.playerGender,
      // 营业中（含结算弹窗）不算夜修；夜里记下走到哪，刷新后接着走
      nightMs: this.gameState === "open" ? 0 : this.nightElapsed(),
      meta: this.meta,
      dailyGoal: this.dailyGoal,
      regulars: this.regulars,
      goalStreak: this.goalStreak,
      lastGiftDate: this.lastGiftDate,
      giftStreak: this.giftStreak,
      floorsBuilt: this.floorsBuilt,
    };
  }

  save(this: TavernScene) {
    if (this.suppressSave || this.gameState === "bankrupt") return;
    if (this.gameState === "open" && !this.settling) return;
    this.writeSave(this.buildSaveData());
  }

  writeSave(this: TavernScene, data: SaveData) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // 隐私模式或存储已满：放弃本次存档，不影响当前对局
    }
  }

  /** 新周目存档（破产重开）：保留仙缘数值与掌柜性别，其余归零；仙缘加成随修为子系统停用。 */
  freshSave(this: TavernScene, ascensions: number): SaveData {
    const startLevel = 1;
    return {
      v: 3,
      coins: STARTING_COINS,
      inventory: STARTING_INVENTORY,
      level: startLevel,
      stoveLevel: 0,
      signLevel: 0,
      reputation: 0,
      // 灵根是掌柜本人的，破产重开也不变
      shopkeeper: { ...createShopkeeper(), root: this.shopkeeper.root },
      employees: [],
      candidates: [],
      candidatesDay: 0,
      nextStaffId: 1,
      borrowedIds: [],
      activeLoans: [],
      negativeStreak: 0,
      cultivation: 0,
      day: 1,
      ascensions,
      selectedDishIds: DISHES.filter((d) => d.unlockLevel <= startLevel).map((d) => d.id),
      playerGender: this.playerGender,
      // 新周目从第 1 日辰正开张，不先过夜
      nightMs: getNightDurationMs(),
      meta: this.meta,
      goalStreak: 0,
      lastGiftDate: this.lastGiftDate,
      giftStreak: this.giftStreak,
      floorsBuilt: 0,
    };
  }

  /** 读档，返回是否读到有效存档；损坏或版本不符时按新档处理。 */
  loadSave(this: TavernScene): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw) as Partial<SaveData>;
      if (data.v !== 3) return false;
      const num = (value: unknown, fallback: number) =>
        typeof value === "number" && Number.isFinite(value) ? value : fallback;
      const count = (value: unknown) => Math.max(0, Math.floor(num(value, 0)));
      this.coins = num(data.coins, STARTING_COINS);
      this.inventory = count(data.inventory);
      this.level = Math.max(1, Math.floor(num(data.level, 1)));
      this.stoveLevel = count(data.stoveLevel);
      this.signLevel = count(data.signLevel);
      this.reputation = count(data.reputation);
      this.cultivation = count(data.cultivation);
      this.negativeStreak = count(data.negativeStreak);
      this.goalStreak = Math.max(0, Math.floor(num(data.goalStreak, 0)));
      this.lastGiftDate =
        typeof data.lastGiftDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.lastGiftDate)
          ? data.lastGiftDate
          : undefined;
      this.giftStreak = count(data.giftStreak);
      const maxFloors = this.level >= 6 ? 2 : this.level >= 3 ? 1 : 0;
      this.floorsBuilt = Math.min(maxFloors, count(data.floorsBuilt));
      this.day = Math.max(1, Math.floor(num(data.day, 1)));
      this.ascensions = Math.max(0, Math.floor(num(data.ascensions, 0)));
      this.playerGender = data.playerGender === "female" ? "female" : "male";
      this.nightStartedAt = this.time.now - Math.min(getNightDurationMs(), count(num(data.nightMs, getNightDurationMs())));
      // 身份字段以代码为准，防止导出码把掌柜改成可辞退的伙计
      const keeper = sanitizeEmployees([data.shopkeeper])[0] ?? createShopkeeper();
      this.shopkeeper = { ...keeper, id: SHOPKEEPER_ID, name: "掌柜" };
      this.employees = sanitizeEmployees(data.employees);
      this.candidates = sanitizeEmployees(data.candidates);
      this.candidatesDay = count(data.candidatesDay);
      const maxId = Math.max(0, ...[...this.employees, ...this.candidates].map((e) => e.id));
      this.nextStaffId = Math.max(maxId + 1, count(data.nextStaffId));
      this.borrowedIds = new Set(
        (Array.isArray(data.borrowedIds) ? data.borrowedIds : []).filter(
          (id): id is string => typeof id === "string",
        ),
      );
      this.activeLoans = (Array.isArray(data.activeLoans) ? data.activeLoans : [])
        .filter(
          (loan) =>
            loan &&
            typeof loan.name === "string" &&
            Number.isFinite(loan.remaining) &&
            Number.isFinite(loan.periodsLeft),
        )
        .map((loan) => ({
          name: loan.name,
          remaining: Math.max(0, loan.remaining),
          periodsLeft: Math.max(0, Math.floor(loan.periodsLeft)),
        }));
      this.selectedDishIds = new Set(
        (Array.isArray(data.selectedDishIds) ? data.selectedDishIds : []).filter(
          (id): id is string => typeof id === "string",
        ),
      );
      const goal = data.dailyGoal;
      this.dailyGoal =
        goal &&
        (goal.kind === "revenue" || goal.kind === "wish") &&
        typeof goal.label === "string" &&
        goal.label.length > 0
          ? {
              kind: goal.kind,
              label: goal.label,
              target: Math.max(1, Math.floor(num(goal.target, 1))),
              rewardCoins: count(goal.rewardCoins),
            }
          : null;
      this.regulars = (Array.isArray(data.regulars) ? data.regulars : [])
        .filter(
          (r) =>
            r &&
            typeof r.name === "string" &&
            typeof r.kindId === "string" &&
            typeof r.wish === "string",
        )
        .slice(0, 6)
        .map((r) => ({
          name: r.name,
          kindId: r.kindId,
          wish: r.wish,
          visits: Math.max(1, count(r.visits)),
        }));
      this.displayedCoins = this.coins;
      const meta = data.meta;
      this.meta = meta
        ? {
            days: count(meta.days),
            served: count(meta.served),
            revenue: count(meta.revenue),
            bestRevenue: count(meta.bestRevenue),
            bestServed: count(meta.bestServed),
            goalsMet: count(meta.goalsMet),
            maxRealm: count(meta.maxRealm),
            topDays: (Array.isArray(meta.topDays) ? meta.topDays : [])
              .filter(
                (record) =>
                  record &&
                  Number.isFinite(record.day) &&
                  Number.isFinite(record.level) &&
                  Number.isFinite(record.served) &&
                  Number.isFinite(record.revenue),
              )
              .map((record) => ({
                day: Math.max(1, Math.floor(record.day)),
                level: Math.max(1, Math.floor(record.level)),
                served: Math.max(0, Math.floor(record.served)),
                revenue: Math.max(0, Math.floor(record.revenue)),
              }))
              .sort((a, b) => b.revenue - a.revenue)
              .slice(0, 5),
          }
        : { ...EMPTY_META };
      this.meta.maxRealm = Math.max(this.meta.maxRealm, getRealmIndex(this.cultivation));
      return true;
    } catch {
      return false;
    }
  }
}
