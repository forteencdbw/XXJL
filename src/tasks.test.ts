import { describe, expect, it } from "vitest";
import {
  TASKS,
  advanceTask,
  claimTask,
  isTaskReady,
  newTaskState,
  sanitizeTaskState,
  syncTaskState,
} from "./tasks";

describe("主线任务", () => {
  it("新档从第一条开始", () => {
    const s = newTaskState();
    expect(s.activeId).toBe(TASKS[0].id);
    expect(s.progress).toBe(0);
    expect(isTaskReady(s)).toBe(false);
  });

  it("动作类只认对应事件，进度夹在目标值", () => {
    const s = newTaskState();
    expect(advanceTask(s, "serve")).toBe(false);
    expect(s.progress).toBe(0);
    expect(advanceTask(s, "start_session")).toBe(true);
    expect(s.progress).toBe(1);
    expect(isTaskReady(s)).toBe(true);
    advanceTask(s, "start_session");
    expect(s.progress).toBe(1);
  });

  it("状态类用当前值覆盖，提前满足也能立刻领取", () => {
    const s = newTaskState();
    // 走到第 7 条（Lv2）
    for (let i = 0; i < 6; i++) {
      s.progress = TASKS.find((t) => t.id === s.activeId)!.objective.target;
      claimTask(s);
    }
    expect(s.activeId).toBe("level_two");
    expect(syncTaskState(s, { level: 5 })).toBe(true);
    expect(s.progress).toBe(2);
    expect(isTaskReady(s)).toBe(true);
  });

  it("领取后切下一条；最后一条之后没有当前任务", () => {
    const s = newTaskState();
    s.activeId = TASKS[TASKS.length - 1].id;
    s.progress = TASKS[TASKS.length - 1].objective.target;
    const r = claimTask(s);
    expect(r?.next).toBeNull();
    expect(s.activeId).toBeNull();
    expect(s.completed).toContain(TASKS[TASKS.length - 1].id);
    expect(claimTask(s)).toBeNull();
  });

  it("未达成不能领取", () => {
    const s = newTaskState();
    expect(claimTask(s)).toBeNull();
    expect(s.activeId).toBe(TASKS[0].id);
  });

  it("读档清洗：未知 id 丢弃、当前任务缺失或已完成时顺延", () => {
    const s = sanitizeTaskState({
      activeId: "nope",
      progress: 99,
      completed: ["open_shop", "open_shop", "bad", "first_order"],
    });
    expect(s.completed).toEqual(["open_shop", "first_order"]);
    expect(s.activeId).toBe("gather_food");
    // 原进度 99 夹到目标值，说明已是可领取状态
    expect(s.progress).toBe(1);
  });
});
