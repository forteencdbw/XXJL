// 场景内共享的类型：雅座、排队食客、进度、存档结构等。
import Phaser from "phaser";
import type { DailyGoal, Dish, Employee, MetaStats, PatronKind } from "../logic";
import { Character } from "./Character";

export type GameState = "closed" | "selectingMenu" | "open" | "bankrupt";
export type TapText = Phaser.GameObjects.Text & { onTap: () => void; sub?: Phaser.GameObjects.Text };

/** awaitingServe：菜已出锅放在灶台上等跑堂；serving：跑堂正端着走过来。 */
export type BoothState = "empty" | "seating" | "awaitingCook" | "cooking" | "awaitingServe" | "serving" | "dining";

export interface Booth {
  floor: number;
  state: BoothState;
  /** 掌勺员工 id。 */
  cookStaffId: number | null;
  /** 起锅时锁定的烹饪质量（售价倍率）。 */
  cookQuality: number;
  currentDish: Dish | null;
  cookStartedAt: number;
  cookDoneAt: number;
  departAt: number;
  awaitingSince: number;
  /** 出锅时刻，跑堂先端等得最久的一桌。 */
  readyAt: number;
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
/** 员工手上的一件活：领座 / 烹饪 / 传菜。 */
export interface StaffTask extends OpProgress {
  kind: "seat" | "cook" | "serve";
  boothIndex: number;
}
/** 员工在营业中的临时状态，不进存档。 */
export interface StaffRuntime {
  char: Character;
  task: StaffTask | null;
  /** 人在哪层：领座/传菜去楼上时跟着上楼，玩家看哪层才显示哪层的人。 */
  floor: number;
}

export interface SaveData {
  v: 3;
  coins: number;
  inventory: number;
  level: number;
  stoveLevel: number;
  signLevel: number;
  /** 修仙界对本店的累计印象，决定每天到店人数与稀客比例。 */
  reputation: number;
  employees: Employee[];
  /** 掌柜（也是员工，不能辞退、不领工资）。 */
  shopkeeper: Employee;
  /** 今日招聘候选人与生成它们的天数。 */
  candidates?: Employee[];
  candidatesDay?: number;
  nextStaffId?: number;
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
  regulars?: RegularGuest[];
  /** 当日目标快照：读档后不能因等级变化换目标，否则同一目标会显示两个数。 */
  dailyGoal?: DailyGoal | null;
  goalStreak?: number;
  /** 最近一次领开市利是的本机日期（YYYY-MM-DD）与连续天数。 */
  lastGiftDate?: string;
  giftStreak?: number;
  floorsBuilt: number;
}
