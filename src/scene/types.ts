// 场景内共享的类型：雅座、排队食客、进度、存档结构等。
import Phaser from "phaser";
import type { DailyGoal, Dish, Employee, MetaStats, PatronKind } from "../logic";
import { Character } from "./Character";

export type Driver = "player" | "staff";
export type GameState = "closed" | "selectingMenu" | "open" | "bankrupt";
export type TapText = Phaser.GameObjects.Text & { onTap: () => void };

export type BoothState = "empty" | "seating" | "awaitingCook" | "cooking" | "dining";

export interface Booth {
  floor: number;
  state: BoothState;
  cookingDriver: Driver | null;
  /** 掌勺员工 id；玩家下厨时为 null。 */
  cookStaffId: number | null;
  /** 起锅时锁定的烹饪质量（售价倍率）；玩家下厨为 1。 */
  cookQuality: number;
  currentDish: Dish | null;
  cookStartedAt: number;
  cookDoneAt: number;
  departAt: number;
  awaitingSince: number;
  /** 起锅时锁定的连击加价比例，离店结算时按此生效。 */
  comboBonus: number;
  patronChar?: Character;
  patronKind: PatronKind | null;
  patronWish: string | null;
  patronName: string | null;
  patronRegular: boolean;
  diningProp?: Phaser.GameObjects.Container;
}
export interface BoothVisual {
  floor: number;
  bg: Phaser.GameObjects.Rectangle;
  runner: Phaser.GameObjects.Rectangle;
  number: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  legs: Phaser.GameObjects.Rectangle[];
  barBg: Phaser.GameObjects.Rectangle;
  barFill: Phaser.GameObjects.Rectangle;
  zone: Phaser.GameObjects.Zone;
  candleGlow: Phaser.GameObjects.Image;
  candleBody: Phaser.GameObjects.Rectangle;
  candleFlame: Phaser.GameObjects.Ellipse;
}
export interface QueuedPatron {
  expiresAt: number;
  patienceMs: number;
  char: Character;
  kind: PatronKind;
  wish: string | null;
  name: string;
  regular: boolean;
}

export interface RegularGuest {
  name: string;
  kindId: string;
  wish: string;
  visits: number;
}
export interface OpProgress {
  startedAt: number;
  duration: number;
}
export interface SeatProgress extends OpProgress {
  boothIndex: number;
}
export interface PurchaseProgress extends OpProgress {
  amount: number;
}
/** 员工在营业中的临时状态，不进存档。 */
export interface StaffRuntime {
  char: Character;
  seat: SeatProgress | null;
  cookingBooth: number | null;
}

export interface SaveData {
  v: 2;
  coins: number;
  inventory: number;
  level: number;
  stoveLevel: number;
  signLevel: number;
  /** 修仙界对本店的累计印象，决定每天到店人数与稀客比例。 */
  reputation: number;
  employees: Employee[];
  /** 今日招聘候选人与生成它们的天数。 */
  candidates?: Employee[];
  candidatesDay?: number;
  nextStaffId?: number;
  /** 旧固定岗位制存档的等级，只用于迁移。 */
  staffLevel?: Partial<Record<"hawker" | "server" | "cook" | "buyer", number>>;
  borrowedIds: string[];
  activeLoans: { name: string; remaining: number; periodsLeft: number }[];
  negativeStreak: number;
  cultivation: number;
  day: number;
  ascensions: number;
  selectedDishIds: string[];
  playerGender: "male" | "female";
  meta: MetaStats;
  regulars?: RegularGuest[];
  /** 当日目标快照：读档后不能因等级变化换目标，否则同一目标会显示两个数。 */
  dailyGoal?: DailyGoal | null;
  goalStreak?: number;
  /** 最近一次领开市利是的本机日期（YYYY-MM-DD）与连续天数。 */
  lastGiftDate?: string;
  giftStreak?: number;
  floorsBuilt?: number;
}
