// 主线任务的纯逻辑：任务链、目标进度、领取与读档清洗。不依赖 Phaser/DOM。
import { GAME } from "./config";

/** 动作类目标：只从任务激活后按事件计数。 */
export type TaskActionKind =
  | "start_session"
  | "serve"
  | "open_gather"
  | "gather"
  | "open_warehouse"
  | "hire"
  | "job_change"
  | "goal_met"
  | "loan";

/** 状态类目标：激活时直接读当前值，已满足就立刻可领取。 */
export type TaskStateKind = "level" | "floors" | "reputation";

export type TaskGoalKind = TaskActionKind | TaskStateKind;

export const STATE_GOALS: TaskStateKind[] = ["level", "floors", "reputation"];

export interface TaskReward {
  coins?: number;
  jade?: number;
  /** 食材 id → 份数 */
  ingredients?: Record<string, number>;
}

export interface TaskObjective {
  kind: TaskGoalKind;
  /** 目标的一句话说明，任务页与进度条共用 */
  text: string;
  target: number;
}

export interface TaskDef {
  id: string;
  title: string;
  desc: string;
  objective: TaskObjective;
  reward: TaskReward;
}

export interface TaskState {
  /** 当前任务；null 表示主线走完 */
  activeId: string | null;
  progress: number;
  /** 已完成的任务 id，按完成顺序 */
  completed: string[];
}

export const TASKS: TaskDef[] = GAME.tasks as TaskDef[];
export const TASK_BY_ID: Record<string, TaskDef> = Object.fromEntries(TASKS.map((t) => [t.id, t]));

export function newTaskState(): TaskState {
  return { activeId: TASKS[0]?.id ?? null, progress: 0, completed: [] };
}

export function activeTask(state: TaskState): TaskDef | null {
  return state.activeId ? TASK_BY_ID[state.activeId] ?? null : null;
}

export function isStateGoal(kind: TaskGoalKind): kind is TaskStateKind {
  return (STATE_GOALS as string[]).includes(kind);
}

/** 目标是否已达成（可领取）。 */
export function isTaskReady(state: TaskState): boolean {
  const task = activeTask(state);
  return !!task && state.progress >= task.objective.target;
}

/** 动作类事件推进；进度夹在 0..target。返回是否在这一下刚好达成。 */
export function advanceTask(state: TaskState, kind: TaskActionKind, amount = 1): boolean {
  const task = activeTask(state);
  if (!task || task.objective.kind !== kind || amount <= 0) return false;
  const before = state.progress;
  state.progress = Math.min(task.objective.target, state.progress + amount);
  return before < task.objective.target && state.progress >= task.objective.target;
}

/** 状态类目标：用当前值覆盖进度（只增不减，避免读档后回退）。返回是否刚好达成。 */
export function syncTaskState(
  state: TaskState,
  values: Partial<Record<TaskStateKind, number>>,
): boolean {
  const task = activeTask(state);
  if (!task || !isStateGoal(task.objective.kind)) return false;
  const value = values[task.objective.kind];
  if (value === undefined) return false;
  const before = state.progress;
  state.progress = Math.max(before, Math.min(task.objective.target, Math.max(0, Math.floor(value))));
  return before < task.objective.target && state.progress >= task.objective.target;
}

/**
 * 领取奖励并切到下一条。未达成时返回 null。
 * 调用方负责发奖；这里只推进任务状态。
 */
export function claimTask(state: TaskState): { task: TaskDef; reward: TaskReward; next: TaskDef | null } | null {
  const task = activeTask(state);
  if (!task || state.progress < task.objective.target) return null;
  state.completed = [...state.completed, task.id];
  const index = TASKS.findIndex((t) => t.id === task.id);
  const next = TASKS[index + 1] ?? null;
  state.activeId = next?.id ?? null;
  state.progress = 0;
  return { task, reward: task.reward, next };
}

/** 读档清洗：丢掉未知 id，当前任务缺失或已完成时顺延到第一条未完成的任务。 */
export function sanitizeTaskState(raw: unknown): TaskState {
  const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawCompleted = Array.isArray(rec.completed) ? rec.completed : [];
  const seen = new Set<string>();
  const completed = TASKS.filter((t) => rawCompleted.includes(t.id) && seen.add(t.id)).map((t) => t.id);
  let activeId =
    typeof rec.activeId === "string" && TASK_BY_ID[rec.activeId] && !completed.includes(rec.activeId)
      ? rec.activeId
      : null;
  if (!activeId) activeId = TASKS.find((t) => !completed.includes(t.id))?.id ?? null;
  const target = activeId ? TASK_BY_ID[activeId].objective.target : 0;
  const progress = Math.max(0, Math.min(target, Math.floor(Number(rec.progress) || 0)));
  return { activeId, progress, completed };
}
