// 采集：列表页、采集点详情页（动态山水）、现实时间冷却、派空闲员工出门。
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
import { GATHER_SCENE_H, GATHER_SCENE_W } from "../textures";
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

  /** 右上角：仙玉与看广告入口（列表页与详情页共用）。 */
  addJadeChip(this: TavernScene, layer: Phaser.GameObjects.Container) {
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
  }

  /** 采集页：列表页（三个点的状态卡）或某个点的详情页。 */
  buildGatheringOverlay(this: TavernScene) {
    if (this.gatheringSpot) {
      this.buildGatheringSpotPage(this.gatheringSpot);
      return;
    }
    const layer = this.openSubsystemPage("采集");
    this.gatheringOverlayLayer = layer;
    this.addJadeChip(layer);
    layer.add(
      this.add.text(40, 108, "点一个采集点进去，派一名空闲伙计，食材立刻到手；该点冷却 5 分钟（现实时间），伙计归队后才能再派。", {
        fontSize: "16px",
        color: "#c8b8a0",
        wordWrap: { width: 640, useAdvancedWrap: true },
        lineSpacing: 5,
      }),
    );
    const countdowns: { spotId: string; name: string; text: Phaser.GameObjects.Text }[] = [];
    GATHERING_SPOTS.forEach((spot, i) => {
      const y = 200 + i * 230;
      const g = this.gathering[spot.id];
      layer.add(
        this.add
          .rectangle(40, y, 640, 200, 0x14100c, 0.98)
          .setOrigin(0, 0)
          .setStrokeStyle(2, 0x8a6a3a, 0.75)
          .setInteractive({ useHandCursor: true })
          .on("pointerup", () => {
            playSfx("click");
            this.gatheringSpot = spot.id;
            this.gatheringPick = null;
            this.buildGatheringOverlay();
          }),
      );
      layer.add(this.add.text(60, y + 20, spot.name, { fontSize: "30px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
      layer.add(this.add.text(60, y + 66, spot.desc, { fontSize: "15px", color: "#8a7a62" }));
      layer.add(this.add.text(650, y + 100, "›", { fontSize: "44px", color: "#8a6a3a" }).setOrigin(1, 0.5));
      if (g) {
        const text = this.add.text(60, y + 130, "", { fontSize: "20px", color: "#ffd98a" });
        layer.add(text);
        countdowns.push({ spotId: spot.id, name: this.employeeById(g.employeeId)?.name ?? "伙计", text });
      } else {
        const names = spot.ingredients.map((id) => INGREDIENT_BY_ID[id].name).join(" / ");
        layer.add(this.add.text(60, y + 130, `空闲 · 可采：${names}`, { fontSize: "20px", color: "#a8d8b0" }));
      }
    });
    const refresh = () => {
      for (const item of countdowns) {
        const g = this.gathering[item.spotId];
        if (g) item.text.setText(`${item.name}采集中 · ${formatCountdown(Math.max(0, g.startedAt + GATHER_COOLDOWN_MS - Date.now()))}`);
      }
    };
    refresh();
    const timer = this.time.addEvent({
      delay: 250,
      loop: true,
      callback: () => (this.overlay !== layer ? timer.remove() : refresh()),
    });
  }

  /** 采集点详情页：上半屏是该点的动态山水，下面选食材、选人，按【采集】出发。 */
  buildGatheringSpotPage(this: TavernScene, spotId: string) {
    const spot = GATHERING_SPOTS.find((s) => s.id === spotId);
    if (!spot) {
      this.gatheringSpot = null;
      this.buildGatheringOverlay();
      return;
    }
    const layer = this.openSubsystemPage(spot.name, "返回", () => {
      playSfx("click");
      this.gatheringSpot = null;
      this.buildGatheringOverlay();
    });
    this.gatheringOverlayLayer = layer;
    this.addJadeChip(layer);

    // 山水：静态底图放大 2 倍，会动的部分叠在上面
    const ox = 40;
    const oy = 120;
    layer.add(this.add.image(ox, oy, this.ensureGatherSceneTexture(spot.id)).setOrigin(0, 0).setScale(GATHER_SCALE));
    const motions = addGatherSceneMotion(this, layer, spot.id, ox, oy);
    layer.add(
      this.add
        .rectangle(ox, oy, GATHER_SCENE_W * GATHER_SCALE, GATHER_SCENE_H * GATHER_SCALE)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x8a6a3a, 0.9),
    );
    layer.add(this.add.text(40, 694, spot.desc, { fontSize: "15px", color: "#8a7a62" }));

    const g = this.gathering[spot.id];
    let countdown: Phaser.GameObjects.Text | null = null;
    if (g) {
      const e = this.employeeById(g.employeeId);
      const ingredient = INGREDIENT_BY_ID[g.ingredientId];
      // 伙计画进山水里做采集动作：小人一起一落，旁边一把工具来回摆
      const [wx, wy] = WORKER_SPOT[spot.id] ?? [160, 250];
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
      const baseY = oy + wy * GATHER_SCALE;
      const img = this.add.image(ox + wx * GATHER_SCALE, baseY, tex).setOrigin(0.5, 1).setScale(1.2);
      const tool = this.add.rectangle(img.x + 38, baseY - 14, 3, 42, 0x9a7a4a).setOrigin(0.5, 1);
      layer.add([img, tool]);
      motions.push((t) => {
        const phase = t / 260;
        img.y = baseY - 3 + Math.round(Math.sin(phase) * 3);
        tool.angle = Math.round(Math.sin(phase) * 28);
      });

      layer.add(this.add.text(40, 736, `${e?.name ?? "伙计"}正在采${ingredient.name}`, { fontSize: "22px", color: "#a8d8b0" }));
      countdown = this.add.text(40, 776, "", { fontSize: "24px", color: "#ffd98a" });
      layer.add(countdown);
      layer.add(this.add.text(40, 820, "冷却结束自动归队，期间不能派活", { fontSize: "15px", color: "#8a7a62" }));
      const speedCost = GAME.speedup.gather;
      const confirming = this.isSpeedupConfirm(`gather:${spot.id}`);
      const affordable = this.jade >= speedCost;
      layer.add(
        this.add
          .text(40, 862, confirming ? `确认加速 · 花 ${speedCost} 仙玉` : `加速 · ${speedCost} 仙玉`, {
            fontSize: "20px",
            color: confirming ? "#ffe6a8" : affordable ? "#dfe8f4" : "#8a8a8a",
            backgroundColor: confirming ? "#7a5a1a" : affordable ? "#2e3a4a" : "#2a2a2a",
            padding: { x: 12, y: 8 },
          })
          .setInteractive({ useHandCursor: true })
          .on("pointerup", () => this.requestGatherSpeedup(spot.id)),
      );
    } else {
      this.gatheringSelection[spot.id] ??= spot.ingredients[0];
      const selected = this.gatheringSelection[spot.id];
      layer.add(this.add.text(40, 730, "采什么？", { fontSize: "15px", color: "#8a7a62" }));
      spot.ingredients.forEach((id, k) => {
        const on = id === selected;
        layer.add(
          this.add
            .text(40 + k * 200, 756, `${INGREDIENT_BY_ID[id].name} ×${this.inventory[id] ?? 0}`, {
              fontSize: "18px",
              color: on ? "#ffe6a8" : "#c8b8a0",
              backgroundColor: on ? "#5a4a1a" : "#2e2119",
              padding: { x: 12, y: 8 },
            })
            .setInteractive({ useHandCursor: true })
            .on("pointerup", () => {
              playSfx("click");
              this.gatheringSelection[spot.id] = id;
              this.buildGatheringOverlay();
            }),
        );
      });

      layer.add(this.add.text(40, 820, "派谁去？", { fontSize: "15px", color: "#8a7a62" }));
      const idle = this.workforce().filter((e) => !this.isGathering(e.id) && !this.staffRt.get(e.id)?.task);
      const pick =
        idle.find((e) => e.id === this.gatheringPick) ??
        idle.reduce<Employee | undefined>((best, e) => (!best || e.stars.jiyuan > best.stars.jiyuan ? e : best), undefined);
      if (!pick) {
        layer.add(this.add.text(40, 846, "没有空闲伙计——都出门或在忙。", { fontSize: "17px", color: "#ff9a8a" }));
      }
      idle.forEach((e, k) => {
        const on = e === pick;
        layer.add(
          this.add
            .text(40 + (k % 4) * 160, 846 + Math.floor(k / 4) * 46, `${e.name} · 机缘${e.stars.jiyuan}`, {
              fontSize: "15px",
              color: on ? "#ffe6a8" : "#dfe8f4",
              backgroundColor: on ? "#5a4a1a" : "#2e3a4a",
              padding: { x: 8, y: 6 },
            })
            .setInteractive({ useHandCursor: true })
            .on("pointerup", () => {
              playSfx("click");
              this.gatheringPick = e.id;
              this.buildGatheringOverlay();
            }),
        );
      });

      // 【采集】：没有空闲伙计时置灰
      const btn = this.add
        .rectangle(40, 960, 640, 90, pick ? 0x5a4a1a : 0x2a2a2a)
        .setOrigin(0, 0)
        .setStrokeStyle(2, pick ? 0xd9b45a : 0x4a4a4a);
      layer.add(btn);
      layer.add(
        this.add
          .text(360, 1005, pick ? `采集 · ${pick.name}去采${INGREDIENT_BY_ID[selected].name}` : "采集", {
            fontSize: "26px",
            color: pick ? "#ffe6a8" : "#7a7a7a",
            fontFamily: XIAN_FONT,
          })
          .setOrigin(0.5),
      );
      if (pick) btn.setInteractive({ useHandCursor: true }).on("pointerup", () => this.assignGathering(spot.id, selected, pick));
    }

    // 倒计时与山水动画共用一个计时器；页面关掉/重建时自动停
    const tick = () => {
      const now = this.time.now;
      if (countdown && g) countdown.setText(`采集中 · ${formatCountdown(Math.max(0, g.startedAt + GATHER_COOLDOWN_MS - Date.now()))}`);
      for (const m of motions) m(now);
    };
    tick();
    const timer = this.time.addEvent({
      delay: 33,
      loop: true,
      callback: () => (this.overlay !== layer ? timer.remove() : tick()),
    });
  }
}

const GATHER_SCALE = 2;
/** 在外伙计在各点山水里的落脚处（底图像素坐标，脚底）。 */
const WORKER_SPOT: Record<string, [number, number]> = { herb: [214, 240], stream: [150, 248], bamboo: [124, 274] };

type Motion = (t: number) => void;

/** 采集点山水里会动的部分：每个返回的函数按场景时钟（毫秒）摆一帧。 */
function addGatherSceneMotion(scene: TavernScene, layer: Phaser.GameObjects.Container, spotId: string, ox: number, oy: number): Motion[] {
  const S = GATHER_SCALE;
  const W = GATHER_SCENE_W * S;
  const H = GATHER_SCENE_H * S;
  const snap = (v: number) => Math.round(v / S) * S;
  const rect = (w: number, h: number, color: number, alpha = 1) => {
    const r = scene.add.rectangle(0, 0, w, h, color, alpha);
    layer.add(r);
    return r;
  };
  scene.ensureGlowTexture();
  const glow = (w: number, h: number, tint: number, alpha: number) => {
    const img = scene.add.image(0, 0, "soft-glow").setDisplaySize(w, h).setTint(tint).setAlpha(alpha);
    layer.add(img);
    return img;
  };
  const motions: Motion[] = [];

  /** 横向漂移的云雾，靠边时淡出，免得溢出画框。 */
  const mist = (yBg: number, w: number, h: number, speed: number, offset: number, alpha: number) => {
    const img = glow(w, h, 0xf2f4ec, alpha);
    const span = W + w;
    motions.push((t) => {
      const x = ox - w / 2 + ((t * speed + offset) % span);
      const inside = Math.min(x - ox, ox + W - x) - w / 2;
      img.setPosition(x, oy + yBg * S + Math.sin(t / 3000 + offset) * 4);
      img.setAlpha(alpha * Phaser.Math.Clamp(inside / 120 + 1, 0, 1));
    });
  };

  if (spotId === "herb") {
    mist(116, 300, 46, 0.012, 0, 0.4);
    mist(150, 260, 40, 0.008, 420, 0.35);
    mist(178, 320, 44, 0.01, 800, 0.3);
    // 药畦上的灵光：明灭、轻轻上浮
    for (let i = 0; i < 12; i++) {
      const x = ox + snap(30 + Math.random() * (W - 60));
      const y = oy + snap((196 + Math.random() * 70) * S);
      const ph = Math.random() * Math.PI * 2;
      const halo = glow(26, 26, 0xd8ffa0, 0);
      const dot = rect(4, 4, 0xf0ffc0, 0);
      motions.push((t) => {
        const a = Math.max(0, Math.sin(t / 900 + ph)) ** 2;
        const yy = snap(y - ((t / 40 + ph * 30) % 24));
        dot.setPosition(x, yy).setAlpha(a);
        halo.setPosition(x, yy).setAlpha(a * 0.6);
      });
    }
    // 白鹤：每 13 秒从远空掠过一次
    const crane = scene.add.container(0, 0);
    layer.add(crane);
    const wingL = scene.add.rectangle(-2, 0, 14, 3, 0xf4f4ee).setOrigin(1, 0.5);
    const wingR = scene.add.rectangle(2, 0, 14, 3, 0xf4f4ee).setOrigin(0, 0.5);
    crane.add([
      scene.add.rectangle(0, 0, 16, 5, 0xf4f4ee),
      scene.add.rectangle(10, -2, 8, 2, 0xf4f4ee),
      scene.add.rectangle(15, -2, 3, 3, 0xc8402e),
      scene.add.rectangle(-12, 1, 8, 2, 0x3a3a3a),
      wingL,
      wingR,
    ]);
    motions.push((t) => {
      const p = (t % 13000) / 7000;
      crane.setVisible(p < 1);
      if (p >= 1) return;
      crane.setPosition(snap(ox + 30 + p * (W - 60)), snap(oy + 70 + Math.sin(p * Math.PI * 2) * 14 - p * 30));
      crane.setAlpha(Math.min(1, p * 8, (1 - p) * 8));
      const flap = Math.sin(t / 160) * 30;
      wingL.angle = flap;
      wingR.angle = -flap;
    });
  } else if (spotId === "stream") {
    mist(108, 300, 44, 0.01, 0, 0.38);
    mist(140, 260, 36, 0.007, 500, 0.3);
    // 溪面波光：顺流而下，一闪一闪
    for (let i = 0; i < 18; i++) {
      const w = snap(6 + Math.random() * 10);
      const r = rect(w, 2, 0xf0fbf8, 0);
      const y = oy + snap((172 + Math.random() * 48) * S);
      const x0 = Math.random() * W;
      const v = 0.012 + Math.random() * 0.016;
      const ph = Math.random() * Math.PI * 2;
      motions.push((t) => {
        const x = ox + ((x0 + t * v) % (W - w)) + w / 2;
        r.setPosition(snap(x), y).setAlpha(0.15 + 0.7 * Math.max(0, Math.sin(t / 450 + ph)));
      });
    }
    // 柳丝：从树冠垂下，随风轻摆
    for (let i = 0; i < 9; i++) {
      const len = snap((36 + Math.random() * 40) * S);
      const strand = rect(2, len, i % 2 ? 0x6a9a52 : 0x86b064).setOrigin(0.5, 0);
      strand.setPosition(ox + snap((8 + i * 6) * S), oy + snap((132 + Math.random() * 8) * S));
      const ph = i * 0.6;
      motions.push((t) => {
        strand.angle = Math.sin(t / 1500 + ph) * 5;
      });
    }
    // 银鳞小鱼：每 5 秒跃出水面一次，入水溅起一圈涟漪
    const fish = rect(12, 4, 0xdfe9ee);
    const ripple = scene.add.ellipse(0, 0, 20, 6).setStrokeStyle(2, 0xf0fbf8);
    layer.add(ripple);
    const waterY = oy + 198 * S;
    motions.push((t) => {
      const k = Math.floor(t / 5200);
      const p = (t % 5200) / 900;
      const x0 = ox + (70 + ((k * 97) % 130)) * S;
      fish.setVisible(p < 1);
      if (p < 1) {
        fish.setPosition(snap(x0 + p * 44), snap(waterY - Math.sin(p * Math.PI) * 40));
        fish.angle = -40 + 80 * p;
      }
      const q = p - 1;
      ripple.setVisible(q >= 0 && q < 0.8);
      if (q >= 0 && q < 0.8) ripple.setPosition(x0 + 44, waterY + 4).setScale(1 + q * 2.5).setAlpha(1 - q / 0.8);
    });
  } else {
    mist(130, 320, 60, 0.006, 0, 0.32);
    mist(196, 300, 40, 0.009, 600, 0.28);
    // 前景几竿竹子：从根部轻轻摇
    for (const [xBg, ph] of [[22, 0], [40, 1.7], [294, 3.1]] as const) {
      const c = scene.add.container(ox + xBg * S, oy + H);
      layer.add(c);
      c.add(scene.add.rectangle(0, 0, 10, H, 0x4a7656).setOrigin(0.5, 1));
      for (let y = 40; y < H; y += 46) c.add(scene.add.rectangle(0, -y, 14, 3, 0x6e9a72));
      for (let k = 0; k < 7; k++) {
        const dir = k % 2 ? 1 : -1;
        const leaf = scene.add.rectangle(dir * 14, -(H - 40 - k * 50), 26, 5, k % 3 ? 0x3e6a48 : 0x5a8a5e);
        leaf.angle = dir * (20 + (k % 3) * 8);
        c.add(leaf);
      }
      motions.push((t) => {
        c.angle = Math.sin(t / 1900 + ph) * 1.4;
      });
    }
    // 飘落的竹叶
    for (let i = 0; i < 10; i++) {
      const leaf = rect(8, 3, i % 2 ? 0x7aa45a : 0x9ab86a);
      const period = 7000 + Math.random() * 5000;
      const off = Math.random() * period;
      const x0 = 60 + Math.random() * (W - 180);
      const ph = Math.random() * Math.PI * 2;
      motions.push((t) => {
        const p = ((t + off) % period) / period;
        leaf.setPosition(snap(ox + x0 + p * 70 + Math.sin(p * 9 + ph) * 26), snap(oy + 10 + p * (H - 30)));
        leaf.angle = Math.sin(p * 9 + ph) * 55;
        leaf.setAlpha(Math.min(1, p * 10, (1 - p) * 10));
      });
    }
    // 竹露：每 6 秒在某片叶尖亮起一颗，再滴落
    const dew = rect(4, 4, 0xeaffff, 0);
    const dewGlow = glow(28, 28, 0xe0fff8, 0);
    motions.push((t) => {
      const k = Math.floor(t / 6000);
      const p = (t % 6000) / 2400;
      const x = ox + snap((70 + ((k * 61) % 140)) * S);
      const y0 = oy + snap((60 + ((k * 37) % 70)) * S);
      if (p >= 1) {
        dew.setAlpha(0);
        dewGlow.setAlpha(0);
        return;
      }
      const glint = Math.min(1, p / 0.45);
      const fall = Math.max(0, (p - 0.55) / 0.45);
      const y = snap(y0 + fall * fall * 90);
      const a = glint * (1 - fall);
      dew.setPosition(x, y).setAlpha(a);
      dewGlow.setPosition(x, y).setAlpha(a * 0.7);
    });
  }
  return motions;
}
