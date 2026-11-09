// 场景内共享的类型：雅座、排队食客、进度、存档结构等。
import Phaser from "phaser";
import type { BoothData } from "../booth";
import type { PatronKind } from "../logic";
import { Character } from "./Character";

export type GameState = "closed" | "selectingMenu" | "open" | "bankrupt";
export type TapText = Phaser.GameObjects.Text & { onTap: () => void; sub?: Phaser.GameObjects.Text };

export type { BoothState } from "../booth";

/** 雅座 = 纯数据（状态切换只经 src/booth.ts）+ 场景里的画面对象（顾客小人、碗筷）。 */
export interface Booth extends BoothData {
  patronChar?: Character;
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

export type { RegularGuest, SaveData } from "../save";
