// 经营规则的场景侧换算：价格、天气、开市利是、菜单；境界只读（修为子系统占位）。
import { DISHES, getDailyGift, getDailyGoal, getDailySpecial, getDailyWeather, getFloorPriceMultiplier, getGiftStreak, getPostCapPriceBonus, getPurchasePrice, getRealmIndex, getSpecialPrice, getWishPrice, localDateKey } from "../logic";
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

  currentDailySpecial(this: TavernScene): string | null {
    return getDailySpecial(this.day, this.level, this.unlockedDishIds());
  }

  /** 菜品基础售价；境界与仙缘的加成随修为子系统停用。 */
  baseDishPrice(this: TavernScene, dish: Dish): number {
    return dish.price;
  }

  dishPrice(this: TavernScene, dish: Dish): number {
    return getSpecialPrice(this.baseDishPrice(dish), this.currentDailySpecial() === dish.id);
  }

  /** 采购价含采买员工的精明折扣。 */
  purchasePrice(this: TavernScene): number {
    return getPurchasePrice(this.bestBuyer()?.stars.buy ?? 0);
  }

  /** 一桌离店时的成交价：菜品价 × 身份 × 楼层 × 口味 × 烹饪质量。 */
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
      getWishPrice(base, matched, hasWish) * booth.cookQuality,
    );
  }

  /** 跨过零点后换天气；同一本机日期内保持不变。 */
  refreshTodayWeather(this: TavernScene) {
    const key = localDateKey();
    if (key === this.todayKey) return;
    this.todayKey = key;
    this.weather = getDailyWeather(key);
  }

  /** 本机每天第一次开店才发，当天再开不重复领。 */
  grantDailyGift(this: TavernScene) {
    this.refreshTodayWeather();
    if (this.lastGiftDate === this.todayKey) return;
    this.giftStreak = getGiftStreak(this.lastGiftDate, this.todayKey, this.giftStreak);
    this.lastGiftDate = this.todayKey;
    const gift = getDailyGift(this.giftStreak, this.level);
    this.lastGift = { streak: this.giftStreak, ...gift };
    this.coins += gift.coins;
    this.displayedCoins = this.coins;
    this.inventory += gift.ingredients;
    this.log(
      `开市利是（连续第 ${this.giftStreak} 天）：+${gift.coins} 灵石${
        gift.ingredients ? `、+${gift.ingredients} 灵材` : ""
      }`,
    );
    this.showEventToast(`开市利是 · 连续第 ${this.giftStreak} 天 +${gift.coins} 灵石`, true);
    // 一次性跨日奖励立即落盘：营业中刷新会回退本局，但不能重领利是
    this.writeSave(this.buildSaveData());
  }

  getMenuDishes(this: TavernScene): Dish[] {
    return DISHES.filter((d) => this.selectedDishIds.has(d.id) && d.unlockLevel <= this.level);
  }

  /** 食客点名的范围是已解锁的全部菜，不是今日菜单。 */
  unlockedDishIds(this: TavernScene): string[] {
    return DISHES.filter((d) => d.unlockLevel <= this.level).map((d) => d.id);
  }
}
