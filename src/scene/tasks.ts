// 任务：主线进度的事件记账、任务页、主界面任务小条。
import Phaser from "phaser";
import { playSfx } from "../audio";
import { adjustIngredient, INGREDIENT_BY_ID } from "../logic";
import { TASK_BY_ID, TASKS, activeTask, advanceTask, claimTask, isTaskReady, syncTaskState } from "../tasks";
import type { TaskActionKind, TaskReward, TaskStateKind } from "../tasks";
import { XIAN_FONT } from "./constants";
import type { TavernScene } from "./TavernScene";

export class TaskMethods {
  /** 动作类目标记账；刚好达成时提示一次。 */
  notifyTask(this: TavernScene, kind: TaskActionKind, amount = 1) {
    if (this.suppressSave) return;
    if (advanceTask(this.taskState, kind, amount)) this.onTaskJustCompleted();
  }

  /** 每帧按当前状态刷新状态类目标（等级/楼层/声望）；只增不减。 */
  syncActiveTask(this: TavernScene) {
    if (this.suppressSave) return;
    const values: Partial<Record<TaskStateKind, number>> = {
      level: this.level,
      floors: this.floorsBuilt,
      reputation: this.reputation,
    };
    if (syncTaskState(this.taskState, values)) this.onTaskJustCompleted();
  }

  onTaskJustCompleted(this: TavernScene) {
    const task = activeTask(this.taskState);
    if (!task || this.taskToastFor === task.id) return;
    this.taskToastFor = task.id;
    this.showEventToast(`任务完成 · ${task.title}`, true);
    this.log(`任务完成：${task.title}，回主界面领取奖励`);
  }

  taskRewardText(this: TavernScene, reward: TaskReward): string {
    const parts: string[] = [];
    if (reward.coins) parts.push(`${reward.coins} 灵石`);
    if (reward.jade) parts.push(`${reward.jade} 仙玉`);
    for (const [id, amount] of Object.entries(reward.ingredients ?? {})) {
      parts.push(`${INGREDIENT_BY_ID[id]?.name ?? id}×${amount}`);
    }
    return parts.length ? parts.join(" · ") : "无";
  }

  applyTaskReward(this: TavernScene, reward: TaskReward) {
    if (reward.coins) {
      this.coins += reward.coins;
      this.displayedCoins = this.coins;
    }
    if (reward.jade) this.jade += reward.jade;
    for (const [id, amount] of Object.entries(reward.ingredients ?? {})) {
      this.inventory = adjustIngredient(this.inventory, id, amount);
    }
  }

  /** 领取当前任务奖励，切到下一条并落盘。 */
  claimTaskReward(this: TavernScene) {
    if (!isTaskReady(this.taskState)) return;
    const result = claimTask(this.taskState);
    if (!result) return;
    this.applyTaskReward(result.reward);
    this.taskToastFor = null;
    this.log(`领取任务奖励：${result.task.title} → ${this.taskRewardText(result.reward)}`);
    // 新任务如果是状态类，立刻按当前值补账
    this.syncActiveTask();
    this.save();
    this.buildTaskOverlay();
  }

  /** 主界面右上角的任务小条。 */
  refreshTaskTracker(this: TavernScene) {
    if (!this.taskTracker || !this.taskTrackerBg) return;
    const task = activeTask(this.taskState);
    const visible = !!task && this.view === "home" && !this.overlay && !this.bankrupt && !this.suppressSave;
    this.taskTracker.setVisible(visible);
    this.taskTrackerBg.setVisible(visible);
    if (!task) return;
    const ready = isTaskReady(this.taskState);
    this.taskTracker.setText(
      ready ? "任务 · 可领取奖励 ›" : `任务 · ${task.title}  ${this.taskState.progress}/${task.objective.target} ›`,
    );
    this.taskTracker.setColor(ready ? "#ffd98a" : "#c8b8a0");
  }

  /** 全屏任务页：当前任务卡 + 已完成清单。 */
  buildTaskOverlay(this: TavernScene) {
    const layer = this.openSubsystemPage("任务");
    const done = this.taskState.completed.length;
    layer.add(
      this.add
        .text(690, 62, `主线 ${done}/${TASKS.length}`, { fontSize: "20px", color: "#c8b8a0" })
        .setOrigin(1, 0),
    );
    const task = activeTask(this.taskState);

    if (!task) {
      layer.add(
        this.add
          .text(360, 420, "主线暂告一段落，后续版本继续。", {
            fontSize: "24px",
            color: "#ffe6a8",
            fontFamily: XIAN_FONT,
          })
          .setOrigin(0.5),
      );
      this.addTaskHistory(layer, 510);
      return;
    }

    const ready = isTaskReady(this.taskState);
    const { target } = task.objective;
    layer.add(
      this.add
        .rectangle(40, 116, 640, 390, 0x14100c, 0.98)
        .setOrigin(0, 0)
        .setStrokeStyle(2, ready ? 0xd9b45a : 0x4a3a2a, 0.9),
    );
    layer.add(
      this.add.text(64, 138, task.title, { fontSize: "32px", color: "#ffe6a8", fontFamily: XIAN_FONT }),
    );
    layer.add(
      this.add.text(64, 190, task.desc, {
        fontSize: "18px",
        color: "#c8b8a0",
        wordWrap: { width: 588, useAdvancedWrap: true },
        lineSpacing: 6,
      }),
    );
    layer.add(
      this.add.text(64, 300, `${task.objective.text}  ${this.taskState.progress}/${target}`, {
        fontSize: "20px",
        color: ready ? "#a8d8b0" : "#e0c060",
      }),
    );
    // 进度条
    layer.add(this.add.rectangle(64, 340, 560, 12, 0x3a3a46).setOrigin(0, 0));
    layer.add(
      this.add
        .rectangle(64, 340, Math.max(1, (560 * Math.min(this.taskState.progress, target)) / target), 12, 0xd9b45a)
        .setOrigin(0, 0),
    );
    layer.add(
      this.add.text(64, 370, `奖励：${this.taskRewardText(task.reward)}`, { fontSize: "18px", color: "#ffd98a" }),
    );
    const claim = this.add.text(64, 420, ready ? "领取奖励" : "进行中", {
      fontSize: "22px",
      color: ready ? "#1a120c" : "#888888",
      backgroundColor: ready ? "#ffd25a" : "#2a2a2a",
      padding: { x: 22, y: 10 },
    });
    if (ready) {
      claim.setInteractive({ useHandCursor: true }).on("pointerup", () => {
        playSfx("upgrade");
        this.claimTaskReward();
      });
    }
    layer.add(claim);

    this.addTaskHistory(layer, 540);
  }

  /** 已完成任务清单：一行一条，最多一屏放得下。 */
  addTaskHistory(this: TavernScene, layer: Phaser.GameObjects.Container, y: number) {
    const history = this.taskState.completed.map((id) => TASK_BY_ID[id]).filter((t) => !!t);
    layer.add(this.add.text(40, y, `已完成 ${history.length}`, { fontSize: "18px", color: "#8a7a62" }));
    history.forEach((task, i) => {
      const rowY = y + 34 + i * 44;
      layer.add(this.add.text(56, rowY, `✓ ${task.title}`, { fontSize: "17px", color: "#b8d8c8" }));
      layer.add(
        this.add
          .text(664, rowY + 2, this.taskRewardText(task.reward), { fontSize: "14px", color: "#8a8a8a" })
          .setOrigin(1, 0),
      );
    });
  }
}
