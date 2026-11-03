// 经营规则的场景侧换算：境界、价格、修为、天时、开市利是、菜单。
import { GAME } from "../config";
import { DISHES, REALMS, getAscensionPriceMultiplier, getCultivationGain, getDailyGift, getDailyGoal, getDailyOmen, getDailySpecial, getFloorPriceMultiplier, getGiftStreak, getPostCapPriceBonus, getPurchasePrice, getRealmIndex, getRealmPriceMultiplier, getSpecialPrice, getWishPrice, localDateKey } from "../logic";
import type { DailyGoal, Dish } from "../logic";
import type { Booth } from "./types";
import type { TavernScene } from "./TavernScene";

export class RuleMethods {
  // ===== 修行 =====
  realmIndex(this: TavernScene): number {
    return getRealmIndex(this.cultivation);
  }

  currentDayGoal(this: TavernScene): DailyGoal {
    if (!this.dailyGoal) this.dailyGoal = getDailyGoal(this.day, this.level);
    return this.dailyGoal;
  }

  /** 售价按当前境界加成结算。 */
  currentDailySpecial(this: TavernScene): string | null {
    return getDailySpecial(this.day, this.level, this.unlockedDishIds());
  }

  baseDishPrice(this: TavernScene, dish: Dish): number {
    return Math.round(
      dish.price *
        getRealmPriceMultiplier(this.realmIndex()) *
        getAscensionPriceMultiplier(this.ascensions),
    );
  }

  dishPrice(this: TavernScene, dish: Dish): number {
    const price = getSpecialPrice(this.baseDishPrice(dish), this.currentDailySpecial() === dish.id);
    return Math.round(price * this.omen.priceFactor);
  }

  /** 采购价含天时折扣。 */
  purchasePrice(this: TavernScene, emergency: boolean): number {
    return Math.max(
      1,
      Math.round(getPurchasePrice(this.bestBuyer()?.stars.buy ?? 0, emergency) * this.omen.purchaseFactor),
    );
  }

  /** 一桌离店时的成交价：菜品价 × 身份 × 楼层 × 口味 × 连击 × 烹饪质量。 */
  boothPrice(this: TavernScene, booth: Booth, dish: Dish): number {
    const matched = booth.patronWish === dish.id;
    const hasWish = booth.patronWish !== null;
    const base = Math.round(
      this.dishPrice(dish) *
        (booth.patronKind?.priceFactor ?? 1) *
        getFloorPriceMultiplier(booth.floor) *
        getPostCapPriceBonus(this.level),
    );
    return Math.round(
      getWishPrice(base, matched, hasWish, this.omen.wishBonus) * (1 + booth.comboBonus) * booth.cookQuality,
    );
  }

  /** 只有玩家亲自下厨才计修为，天时可再多悟一分。 */
  cultivationGainFor(this: TavernScene, personal: boolean, matched: boolean, rare: boolean): number {
    return (
      getCultivationGain(personal) +
      (personal && matched ? GAME.cultivation.wishHitBonus : 0) +
      (personal && rare ? GAME.cultivation.rareBonus : 0) +
      (personal ? this.omen.cultivationBonus : 0)
    );
  }

  /** 跨过零点后换天时；同一本机日期内保持不变。 */
  refreshTodayOmen(this: TavernScene) {
    const key = localDateKey();
    if (key === this.todayKey) return;
    this.todayKey = key;
    this.omen = getDailyOmen(key);
  }

  /** 本机每天第一次开店才发，当天再开不重复领。 */
  grantDailyGift(this: TavernScene) {
    this.refreshTodayOmen();
    if (this.lastGiftDate === this.todayKey) return;
    this.giftStreak = getGiftStreak(this.lastGiftDate, this.todayKey, this.giftStreak);
    this.lastGiftDate = this.todayKey;
    const gift = getDailyGift(this.giftStreak, this.level);
    this.lastGift = { streak: this.giftStreak, ...gift };
    this.coins += gift.coins;
    this.displayedCoins = this.coins;
    this.inventory += gift.ingredients;
    this.gainCultivation(gift.cultivation);
    // 利是修为算跨日奖励，不计入「今日下厨修为」，避免结算里同一笔 +2 出现两次
    this.sessionCultivation = Math.max(0, this.sessionCultivation - gift.cultivation);
    this.log(
      `开市利是（连续第 ${this.giftStreak} 天）：+${gift.coins} 灵石、+${gift.cultivation} 修为${
        gift.ingredients ? `、+${gift.ingredients} 灵材` : ""
      }`,
    );
    this.showEventToast(`开市利是 · 连续第 ${this.giftStreak} 天 +${gift.coins} 灵石`, true);
    // 一次性跨日奖励立即落盘：营业中刷新会回退本局，但不能重领利是
    this.writeSave(this.buildSaveData());
  }

  gainCultivation(this: TavernScene, amount: number) {
    const before = this.realmIndex();
    this.cultivation += amount;
    this.sessionCultivation += amount;
    const after = this.realmIndex();
    if (after > before) {
      const realm = REALMS[after];
      this.log(`灵台清明，境界突破至「${realm.name}」——${realm.perk}`);
      this.celebrateBreakthrough(realm.name);
    }
  }

  getMenuDishes(this: TavernScene): Dish[] {
    return DISHES.filter((d) => this.selectedDishIds.has(d.id) && d.unlockLevel <= this.level);
  }

  /** 食客点名的范围是已解锁的全部菜，不是今日菜单。 */
  unlockedDishIds(this: TavernScene): string[] {
    return DISHES.filter((d) => d.unlockLevel <= this.level).map((d) => d.id);
  }
}
