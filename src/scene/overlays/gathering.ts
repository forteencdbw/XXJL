// 采集：三个采集点、现实时间冷却、派空闲员工出门。
import Phaser from "phaser";
import { showRewardedAd } from "../../ads";
import { playSfx } from "../../audio";
import { GAME } from "../../config";
import {
  GATHERING_SPOTS,
  GATHER_COOLDOWN_MS,
  INGREDIENT_BY_ID,
  adjustIngredient,
  formatCountdown,
  getGatherYield,
  isGatherReady,
} from "../../logic";
import type { Employee } from "../../logic";
import { getPixelTexture } from "../../pixel";
import { XIAN_FONT } from "../constants";
import type { TavernScene } from "../TavernScene";

export class GatheringOverlayMethods {
  /** 每帧检查冷却；到期把员工放回岗位。走现实时间，与营业和页面都无关。 */
  tickGathering(this: TavernScene) {
    const now = Date.now();
    let changed = false;
    for (const spot of GATHERING_SPOTS) {
      const g = this.gathering[spot.id];
      if (!g || !isGatherReady(g.startedAt, now)) continue;
      delete this.gathering[spot.id];
      if (this.speedupConfirm === `gather:${spot.id}`) this.speedupConfirm = null;
      changed = true;
      const e = this.employeeById(g.employeeId);
      if (!e) continue;
      const rt = this.staffRt.get(e.id);
      if (rt) {
        rt.task = null;
        rt.char.setCarrying(false);
        const home = this.staffHome(e);
        rt.char.teleportTo(home.x, home.y);
      }
      if (this.view === "cultivation" && this.session !== "running") this.seatForNight();
      this.log(`${e.name}采集归来`);
    }
    if (changed && this.overlay && this.overlay === this.gatheringOverlayLayer) this.buildGatheringOverlay();
  }

  /** 派一个人出发：食材立刻到手，采集点进入现实时间冷却。 */
  assignGathering(this: TavernScene, spotId: string, ingredientId: string, e: Employee) {
    const spot = GATHERING_SPOTS.find((s) => s.id === spotId);
    if (!spot || !spot.ingredients.includes(ingredientId)) return;
    if (this.gathering[spotId]) return;
    if (this.isGathering(e.id)) {
      this.showHint(`${e.name}还在别处采集`);
      return;
    }
    if (this.staffRt.get(e.id)?.task) {
      this.showHint(`${e.name}手上有活，等闲下来再派`);
      return;
    }
    const amount = getGatherYield(e.stars.jiyuan, ingredientId);
    this.gathering[spotId] = { employeeId: e.id, ingredientId, startedAt: Date.now() };
    this.inventory = adjustIngredient(this.inventory, ingredientId, amount);
    const rt = this.staffRt.get(e.id);
    if (rt) {
      rt.task = null;
      rt.char.setCarrying(false);
      rt.char.setVisible(false);
    }
    this.staffDidWork(e);
    this.notifyTask("gather");
    const name = INGREDIENT_BY_ID[ingredientId].name;
    const lines = GAME.gathering.lines;
    const line = lines[Math.floor(Math.random() * lines.length) % lines.length];
    this.log(`${e.name}去${spot.name}采${name}，得 ${amount} 份`);
    this.showEventToast(`${e.name}：「${line}」${name} ×${amount}`, true);
    playSfx("click");
    this.save();
    this.buildGatheringOverlay();
  }

  /** 二次确认状态：5 秒内再点同一个按钮才算确认。 */
  isSpeedupConfirm(this: TavernScene, key: string): boolean {
    return this.speedupConfirm === key && Date.now() - this.speedupConfirmAt < 5000;
  }

  setSpeedupConfirm(this: TavernScene, key: string) {
    this.speedupConfirm = key;
    this.speedupConfirmAt = Date.now();
  }

  clearSpeedupConfirm(this: TavernScene) {
    this.speedupConfirm = null;
  }

  /** 看一次激励广告换仙玉；桩函数期间约 1 秒。 */
  async watchAdForJade(this: TavernScene) {
    if (this.adBusy) return;
    this.adBusy = true;
    if (this.overlay === this.gatheringOverlayLayer) this.buildGatheringOverlay();
    const ok = await showRewardedAd();
    this.adBusy = false;
    if (ok) {
      this.jade += GAME.ads.reward;
      this.save();
      this.showEventToast(`看广告 +${GAME.ads.reward} 仙玉`, true);
    } else {
      this.showHint("广告未看完，没有仙玉");
    }
    if (this.overlay && this.overlay === this.gatheringOverlayLayer) this.buildGatheringOverlay();
  }

  /** 花仙玉立刻结束一个采集点的冷却（二次确认）。 */
  requestGatherSpeedup(this: TavernScene, spotId: string) {
    const assignment = this.gathering[spotId];
    if (!assignment) return;
    const cost = GAME.speedup.gather;
    const key = `gather:${spotId}`;
    if (this.jade < cost) {
      this.showHint(`仙玉不足：加速需要 ${cost} 仙玉，先看广告`);
      return;
    }
    if (!this.isSpeedupConfirm(key)) {
      this.setSpeedupConfirm(key);
      this.buildGatheringOverlay();
      return;
    }
    this.jade -= cost;
    this.clearSpeedupConfirm();
    // 把开始时间拨到冷却结束之前，走正常的归队流程
    assignment.startedAt = Date.now() - GATHER_COOLDOWN_MS;
    this.tickGathering();
    this.save();
  }

  /** 花仙玉立刻打烊（二次确认）；等价于营业倒计时归零。 */
  requestSessionSpeedup(this: TavernScene) {
    if (this.session !== "running" || this.settling) return;
    const cost = GAME.speedup.session;
    if (this.jade < cost) {
      this.showHint(`仙玉不足：加速打烊需要 ${cost} 仙玉，先看广告`);
      return;
    }
    if (!this.isSpeedupConfirm("session")) {
      this.setSpeedupConfirm("session");
      return;
    }
    this.jade -= cost;
    this.clearSpeedupConfirm();
    this.log(`花 ${cost} 仙玉加速，直接打烊`);
    this.hardStopSession();
  }

  /** 采集页：三个点各一个槽位；选食材 → 点空闲伙计即可出发。 */
  buildGatheringOverlay(this: TavernScene) {
    const layer = this.openSubsystemPage("采集");
    this.gatheringOverlayLayer = layer;
    // 右上角：仙玉与看广告入口
    const jadeChip = this.add
      .text(690, 58, this.adBusy ? "观看中…" : `仙玉 ${this.jade} · 看广告 +${GAME.ads.reward}`, {
        fontSize: "18px",
        color: "#9fd8ff",
        backgroundColor: this.adBusy ? "#3a3a3a" : "#2a3a4a",
        padding: { x: 10, y: 6 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: !this.adBusy });
    if (!this.adBusy) jadeChip.on("pointerup", () => this.watchAdForJade());
    layer.add(jadeChip);
    layer.add(
      this.add.text(40, 108, "选采集点里的一种食材，再点一名空闲伙计，食材立刻到手；该点冷却 5 分钟（现实时间），伙计归队后才能再派。", {
        fontSize: "16px",
        color: "#c8b8a0",
        wordWrap: { width: 640, useAdvancedWrap: true },
        lineSpacing: 5,
      }),
    );
    const countdowns: { spotId: string; text: Phaser.GameObjects.Text }[] = [];
    const animations: { img: Phaser.GameObjects.Image; tool: Phaser.GameObjects.Rectangle; baseY: number }[] = [];

    GATHERING_SPOTS.forEach((spot, i) => {
      const y = 190 + i * 290;
      const g = this.gathering[spot.id];
      this.gatheringSelection[spot.id] ??= spot.ingredients[0];
      const selected = this.gatheringSelection[spot.id];
      layer.add(
        this.add
          .rectangle(40, y, 640, 270, 0x14100c, 0.98)
          .setOrigin(0, 0)
          .setStrokeStyle(2, 0x8a6a3a, 0.75),
      );
      layer.add(this.add.text(60, y + 14, spot.name, { fontSize: "26px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
      layer.add(this.add.text(60, y + 52, spot.desc, { fontSize: "15px", color: "#8a7a62" }));

      if (g) {
        const e = this.employeeById(g.employeeId);
        const ingredient = INGREDIENT_BY_ID[g.ingredientId];
        layer.add(
          this.add.text(60, y + 92, `${e?.name ?? "伙计"}正在采${ingredient.name}`, {
            fontSize: "20px",
            color: "#a8d8b0",
          }),
        );
        const cd = this.add.text(60, y + 128, "", { fontSize: "22px", color: "#ffd98a" });
        layer.add(cd);
        countdowns.push({ spotId: spot.id, text: cd });
        layer.add(this.add.text(60, y + 168, "冷却结束自动归队，期间不能派活", { fontSize: "15px", color: "#8a7a62" }));
        const speedCost = GAME.speedup.gather;
        const confirming = this.isSpeedupConfirm(`gather:${spot.id}`);
        const affordable = this.jade >= speedCost;
        layer.add(
          this.add
            .text(60, y + 200, confirming ? `确认加速 · 花 ${speedCost} 仙玉` : `加速 · ${speedCost} 仙玉`, {
              fontSize: "18px",
              color: confirming ? "#ffe6a8" : affordable ? "#dfe8f4" : "#8a8a8a",
              backgroundColor: confirming ? "#7a5a1a" : affordable ? "#2e3a4a" : "#2a2a2a",
              padding: { x: 10, y: 6 },
            })
            .setInteractive({ useHandCursor: true })
            .on("pointerup", () => this.requestGatherSpeedup(spot.id)),
        );
        // 小小的采集动作循环：像素小人一起一落，旁边一把工具来回摆
        const look = this.firstJob(e ?? this.shopkeeper) === "cook" ? "cook" : "server";
        const tex = getPixelTexture(this, {
          body: look === "server" ? 0x3a7a5a : 0x7a4a3a,
          hair: 0x2b2b2b,
          longHair: false,
          look,
          seated: false,
          dining: false,
          blink: false,
        });
        const img = this.add.image(568, y + 220, tex).setOrigin(0.5, 1).setScale(1.2);
        layer.add(img);
        const tool = this.add.rectangle(606, y + 206, 3, 42, 0x9a7a4a).setOrigin(0.5, 1);
        layer.add(tool);
        animations.push({ img, tool, baseY: y + 220 });
      } else {
        // 食材选择
        spot.ingredients.forEach((id, k) => {
          const on = id === selected;
          const chip = this.add
            .text(60 + k * 190, y + 92, `${INGREDIENT_BY_ID[id].name} ×${this.inventory[id] ?? 0}`, {
              fontSize: "17px",
              color: on ? "#ffe6a8" : "#c8b8a0",
              backgroundColor: on ? "#5a4a1a" : "#2e2119",
              padding: { x: 10, y: 6 },
            })
            .setInteractive({ useHandCursor: true })
            .on("pointerup", () => {
              playSfx("click");
              this.gatheringSelection[spot.id] = id;
              this.buildGatheringOverlay();
            });
          layer.add(chip);
        });
        layer.add(this.add.text(60, y + 140, "派谁去？", { fontSize: "15px", color: "#8a7a62" }));
        const idle = this.workforce().filter((e) => !this.isGathering(e.id) && !this.staffRt.get(e.id)?.task);
        if (idle.length === 0) {
          layer.add(this.add.text(60, y + 176, "没有空闲伙计——都出门或在忙。", { fontSize: "17px", color: "#ff9a8a" }));
        }
        idle.forEach((e, k) => {
          const x = 60 + (k % 4) * 158;
          const yy = y + 172 + Math.floor(k / 4) * 44;
          layer.add(
            this.add
              .text(x, yy, `${e.name} · 机缘${e.stars.jiyuan}`, {
                fontSize: "15px",
                color: "#dfe8f4",
                backgroundColor: "#2e3a4a",
                padding: { x: 8, y: 6 },
              })
              .setInteractive({ useHandCursor: true })
              .on("pointerup", () => this.assignGathering(spot.id, selected, e)),
          );
        });
      }
    });

    // 倒计时每 250ms 刷一次；页面关掉/重建时自动停
    const timer = this.time.addEvent({
      delay: 250,
      loop: true,
      callback: () => {
        if (this.overlay !== layer) {
          timer.remove();
          return;
        }
        for (const item of countdowns) {
          const g = this.gathering[item.spotId];
          if (!g) continue;
          item.text.setText(`采集中 · ${formatCountdown(Math.max(0, g.startedAt + GATHER_COOLDOWN_MS - Date.now()))}`);
        }
        // 采集动作循环：小人上下起伏，工具来回摆（用手动相位，避免每个页面挂永久 tween）
        const phase = Date.now() / 260;
        for (const a of animations) {
          a.img.y = a.baseY - 3 + Math.round(Math.sin(phase) * 3);
          a.tool.angle = Math.round(Math.sin(phase) * 28);
        }
      },
    });
  }
}
