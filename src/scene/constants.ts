// 场景布局与玩法别名常量；玩法数值本身在 config.ts。
import { GAME } from "../config";

// 玩法数值都在 config.ts，这里只取别名
export const QUEUE_PATIENCE_MS = GAME.session.queuePatienceMs;
export const DINING_MS = GAME.session.diningMs;
/** 桌子入座后先给玩家这么久亲手出菜，伙计再接手。 */
export const COOK_PRIORITY_MS = GAME.session.cookPriorityMs;
/** 最后一位离店后停顿一下再结算，给清场留个过场。 */
export const ROUND_END_DELAY_MS = 1200;
/** 顾客进场动画整体放慢，体现悠闲。 */
export const ENTRANCE_SLOW = 1.5;
/** 玩家连续命中口味的连击：每次 +5%，最多 5 连（+25%）。 */
export const COMBO_STEP = GAME.combo.step;
export const COMBO_MAX = GAME.combo.max;
export const PURCHASE_AMOUNT = GAME.purchase.amount;
export const PURCHASE_TARGET_STOCK = GAME.staff.buyerTargetStockBase;
export const CHRONICLE_MAX_LINES = 1;
export const SAVE_KEY = "tavern_save_v2";
export const AUTOSAVE_MS = 2000;
/** 随机事件上限；实际次数按当天客人数缩放（约每 5 位 1 次）。 */
export const MAX_EVENTS_PER_SESSION = GAME.events.maxPerSession;

export const SEAT_BASE_MS = GAME.timing.seatBaseMs;
export const SEAT_TAVERN_SHRINK_PER_LEVEL_MS = GAME.timing.seatShrinkPerLevelMs;
export const SEAT_FLOOR_MS = GAME.timing.seatFloorMs;
export const COOK_TAVERN_SHRINK_PER_LEVEL_MS = GAME.timing.cookShrinkPerLevelMs;
export const COOK_FLOOR_MS = GAME.timing.cookFloorMs;

export const COLOR_PLAYER = 0xffa94d;
export const COLOR_STAFF = 0x4da6ff;

// ===== 视觉/布局 =====
export const SCREEN_W = 720;
export const SCREEN_H = 1280;
/** 界面分区（见 GLOSSARY）：状态栏 / 主屏 / 副屏。 */
export const STATUS_BAR_H = 124;
export const XIAN_FONT = '"KaiTi","STKaiti","Kaiti SC","Noto Serif SC",serif';
/** 旧的平滑标题页保留作回退；当前用 ink-title 像素底。 */
export const USE_VECTOR_TITLE = false;
export const CARD_W = 600;

export const EXTERIOR_X = -2000;
export const CAMERA_OPEN_X = 60;
export const CAMERA_CLOSED_X = -2000;
export const TAVERN_W = 360;
export const SKY_TRANSITION_MS = 2000;

export const FLOOR_Y = 1010;
export const ACTOR_Y = FLOOR_Y - 34;
export const TABLE_X_MIN = -250;
export const TABLE_X_MAX = 250;
export const QUEUE_X = 300;
export const QUEUE_GAP = 84;
export const TABLE_MARKS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];
export const PLAYER_HOME = { x: 240, y: ACTOR_Y };
export const HAWKER_HOME = { x: 280, y: ACTOR_Y };
export const SERVER_HOME = { x: 120, y: ACTOR_Y };
export const COOK_HOME = { x: -290, y: ACTOR_Y };
export const SERVE_SPOT = { x: 275, y: ACTOR_Y };
export const COOK_SPOT = { x: -230, y: ACTOR_Y };
export const DOOR_X = 320;
