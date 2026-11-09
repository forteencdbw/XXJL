// 存档在场景这一侧：把场景状态打包成存档、把存档赋回场景、读写 localStorage。
// 新档默认值与读档清洗在 src/save.ts（纯逻辑，有单测）。
import { newSave, parseSave, SAVE_VERSION } from "../save";
import type { SaveData } from "../save";
import { SAVE_KEY } from "./constants";
import type { TavernScene } from "./TavernScene";

export class SaveMethods {
  /** 只存经营进度与选择；营业中不落盘——中途刷新等于放弃本局，避免带着收益跳过工资与还账。 */
  buildSaveData(this: TavernScene): SaveData {
    return {
      v: SAVE_VERSION,
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

  /** 把一份（已清洗的）存档赋回场景。 */
  applySave(this: TavernScene, data: SaveData) {
    this.coins = data.coins;
    this.displayedCoins = data.coins;
    this.inventory = data.inventory;
    this.level = data.level;
    this.stoveLevel = data.stoveLevel;
    this.signLevel = data.signLevel;
    this.reputation = data.reputation;
    this.shopkeeper = data.shopkeeper;
    this.employees = data.employees;
    this.candidates = data.candidates;
    this.candidatesDay = data.candidatesDay;
    this.nextStaffId = data.nextStaffId;
    this.borrowedIds = new Set(data.borrowedIds);
    this.activeLoans = data.activeLoans;
    this.negativeStreak = data.negativeStreak;
    this.cultivation = data.cultivation;
    this.day = data.day;
    this.ascensions = data.ascensions;
    this.selectedDishIds = new Set(data.selectedDishIds);
    this.playerGender = data.playerGender;
    this.nightStartedAt = this.time.now - data.nightMs;
    this.meta = data.meta;
    this.dailyGoal = data.dailyGoal;
    this.regulars = data.regulars;
    this.goalStreak = data.goalStreak;
    this.lastGiftDate = data.lastGiftDate;
    this.giftStreak = data.giftStreak;
    this.floorsBuilt = data.floorsBuilt;
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

  /** 新周目存档（破产重开）：保留仙缘、掌柜本人（性别、灵根）、账簿与利是记录，其余从头来。 */
  freshSave(this: TavernScene): SaveData {
    return newSave({
      ascensions: this.ascensions,
      playerGender: this.playerGender,
      shopkeeperRoot: this.shopkeeper.root,
      meta: this.meta,
      lastGiftDate: this.lastGiftDate,
      giftStreak: this.giftStreak,
    });
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
