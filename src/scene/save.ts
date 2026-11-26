// 存档在场景这一侧：把场景状态打包成存档、把存档赋回场景、读写 localStorage。
// 新档默认值与读档清洗在 src/save.ts（纯逻辑，有单测）。
import { newSave, parseSave, SAVE_VERSION } from "../save";
import type { SaveData, SessionSnapshot } from "../save";
import { SAVE_KEY } from "./constants";
import type { TavernScene } from "./TavernScene";

export class SaveMethods {
  /** 只存经营进度与选择；营业中刷新等于放弃本局。 */
  buildSaveData(this: TavernScene): SaveData {
    return {
      v: SAVE_VERSION,
      coins: this.coins,
      jade: this.jade,
      ingredients: this.inventory,
      gathering: this.gathering,
      tasks: this.taskState,
      level: this.level,
      stoveLevel: this.stoveLevel,
      signLevel: this.signLevel,
      reputation: this.reputation,
      shopkeeper: this.shopkeeper,
      employees: this.employees,
      candidates: this.candidates,
      candidatesDay: this.candidatesDay,
      recruitPity: this.recruitPity,
      nextStaffId: this.nextStaffId,
      borrowedIds: [...this.borrowedIds],
      activeLoans: this.activeLoans,
      negativeStreak: this.negativeStreak,
      cultivation: this.cultivation,
      day: this.day,
      ascensions: this.ascensions,
      selectedDishIds: [...this.selectedDishIds],
      playerGender: this.playerGender,
      meta: this.meta,
      dailyGoal: this.dailyGoal,
      regulars: this.regulars,
      goalStreak: this.goalStreak,
      lastGiftDate: this.lastGiftDate,
      giftStreak: this.giftStreak,
      floorsBuilt: this.floorsBuilt,
      session: this.session === "running" ? this.sessionSnapshot() : undefined,
    };
  }

  /** 营业中的存档快照：恢复后按提前打烊结算这一局，已结账的收入不丢。 */
  sessionSnapshot(this: TavernScene): SessionSnapshot {
    return {
      day: this.day,
      goal: this.sessionGoal,
      revenue: this.sessionRevenue,
      served: this.sessionServed,
      wishes: this.sessionWishes,
    };
  }

  /** 把一份（已清洗的）存档赋回场景。 */
  applySave(this: TavernScene, data: SaveData) {
    this.coins = data.coins;
    this.displayedCoins = data.coins;
    this.jade = data.jade;
    this.inventory = { ...data.ingredients };
    this.gathering = { ...data.gathering };
    this.taskState = { ...data.tasks, completed: [...data.tasks.completed] };
    this.level = data.level;
    this.stoveLevel = data.stoveLevel;
    this.signLevel = data.signLevel;
    this.reputation = data.reputation;
    this.shopkeeper = data.shopkeeper;
    this.employees = data.employees;
    this.candidates = data.candidates;
    this.candidatesDay = data.candidatesDay;
    this.recruitPity = data.recruitPity;
    this.nextStaffId = data.nextStaffId;
    this.borrowedIds = new Set(data.borrowedIds);
    this.activeLoans = data.activeLoans;
    this.negativeStreak = data.negativeStreak;
    this.cultivation = data.cultivation;
    this.day = data.day;
    this.ascensions = data.ascensions;
    this.selectedDishIds = new Set(data.selectedDishIds);
    this.playerGender = data.playerGender;
    this.meta = data.meta;
    this.dailyGoal = data.dailyGoal;
    this.regulars = data.regulars;
    this.goalStreak = data.goalStreak;
    this.lastGiftDate = data.lastGiftDate;
    this.giftStreak = data.giftStreak;
    this.floorsBuilt = data.floorsBuilt;
    this.restoreInterruptedSession(data.session);
  }

  /** 上次关页时还在营业：恢复当天的收入与统计，标成已打烊，进营业视图即结算。 */
  restoreInterruptedSession(this: TavernScene, s: SessionSnapshot | undefined) {
    if (!s || s.day !== this.day) return;
    this.sessionRevenue = s.revenue;
    this.sessionServed = s.served;
    this.sessionWishes = s.wishes;
    this.sessionGoal = s.goal;
    this.session = "ended";
    this.interruptedSession = true;
  }

  /** 准备阶段与营业中都会落盘；营业中存的是进行时快照（刷新＝提前打烊）。待结算不落盘。 */
  save(this: TavernScene) {
    if (this.suppressSave) return;
    if (this.session === "ended") return;
    this.writeSave(this.buildSaveData());
  }

  writeSave(this: TavernScene, data: SaveData) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // 隐私模式或存储已满：放弃本次存档，不影响当前对局
    }
  }

  /** 读档并赋回场景；没有存档、损坏或版本不符时按新档开局。返回是否读到了有效存档。 */
  loadSave(this: TavernScene): boolean {
    let data: SaveData | null = null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      data = raw ? parseSave(JSON.parse(raw)) : null;
    } catch {
      data = null;
    }
    this.applySave(data ?? newSave());
    return data !== null;
  }
}
