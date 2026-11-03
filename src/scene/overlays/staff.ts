// 二级页面：伙计名单（勾选/排序/辞退）与招聘。
import Phaser from "phaser";
import { playSfx } from "../../audio";
import { GAME } from "../../config";
import { JOBS, JOB_NAMES, STAT_NAMES, getHireCost, getStaffCap, getStaffWage, getTotalStars, moveJobUp, rollCandidate } from "../../logic";
import type { Job } from "../../logic";
import { SCREEN_H, SCREEN_W, XIAN_FONT } from "../constants";
import type { TavernScene } from "../TavernScene";

export class StaffOverlayMethods {
  /** 星条：10 格，亮格数 = 星数，后跟数字。 */
  addStarBar(this: TavernScene, layer: Phaser.GameObjects.Container, x: number, y: number, job: Job, stars: number) {
    layer.add(this.add.text(x, y, STAT_NAMES[job], { fontSize: "15px", color: "#d8c8a0" }));
    for (let k = 0; k < GAME.staff.maxStars; k++) {
      layer.add(
        this.add.rectangle(x + 40 + k * 12, y + 3, 10, 12, k < stars ? 0xffd25a : 0x3a3a46).setOrigin(0, 0),
      );
    }
    layer.add(this.add.text(x + 40 + GAME.staff.maxStars * 12 + 4, y, `${stars}`, { fontSize: "15px", color: "#ffffff" }));
  }

  addChip(
    this: TavernScene,
    layer: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    bg: string,
    onTap: () => void,
    color = "#ffffff",
  ) {
    layer.add(
      this.add
        .text(x, y, label, { fontSize: "18px", color, backgroundColor: bg, padding: { x: 10, y: 6 } })
        .setInteractive({ useHandCursor: true })
        .on("pointerup", () => {
          playSfx("click");
          onTap();
        }),
    );
  }

  staffOverlayLayer(this: TavernScene, title: string): Phaser.GameObjects.Container {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(100);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.97).setOrigin(0, 0).setInteractive());
    layer.add(this.add.text(40, 58, title, { fontSize: "36px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
    if (this.staffNotice) {
      layer.add(
        this.add.text(40, 154, this.staffNotice, {
          fontSize: "16px",
          color: this.staffNoticeGood ? "#9fe870" : "#ff9a8a",
        }),
      );
    }
    return layer;
  }

  /** 二级页面：员工名单。每人勾选做哪些工作、用 ↑ 调先后，打烊时才能改。 */
  buildStaffOverlay(this: TavernScene) {
    const layer = this.staffOverlayLayer("伙计");
    const cap = getStaffCap(this.level);
    layer.add(
      this.add.text(40, 108, `${this.staffSummaryHint()}\n属性越契合越好：身法→招待快 · 厨艺→烹饪快且售价高 · 精明→采购便宜`, {
        fontSize: "15px",
        color: "#e0c060",
        wordWrap: { width: 640 },
      }),
    );
    this.addChip(layer, 470, 62, `招聘（已雇 ${this.employees.length}/${cap}）`, "#3a5a3a", () => {
      this.staffNotice = "";
      this.buildRecruitOverlay();
    });

    if (this.employees.length === 0) {
      layer.add(
        this.add.text(360, 400, "还没有伙计，点右上「招聘」雇第一位", { fontSize: "20px", color: "#888888" }).setOrigin(0.5),
      );
    }
    this.employees.forEach((e, i) => {
      const y = 184 + i * 136;
      layer.add(this.add.rectangle(40, y, 640, 126, 0x1e2636).setOrigin(0, 0).setStrokeStyle(1, 0x3a4660));
      layer.add(this.add.text(56, y + 10, e.name, { fontSize: "22px", color: "#ffffff" }));
      layer.add(this.add.text(170, y + 15, `日薪 ${getStaffWage(e)} 灵石`, { fontSize: "16px", color: "#bbbbbb" }));
      const confirming = this.pendingFireId === e.id;
      this.addChip(layer, confirming ? 548 : 590, y + 8, confirming ? "确认辞退" : "辞退", confirming ? "#8a2a2a" : "#4a2a2a", () => {
        if (confirming) this.fireStaff(e);
        else this.pendingFireId = e.id;
        this.buildStaffOverlay();
      });
      JOBS.forEach((job, k) => this.addStarBar(layer, 56 + k * 210, y + 46, job, e.stars[job]));
      e.jobs.forEach((slot, k) => {
        const x = 56 + k * 210;
        this.addChip(
          layer,
          x,
          y + 78,
          `${slot.on ? "✓" : "　"} ${k + 1}.${JOB_NAMES[slot.job]}`,
          slot.on ? "#3f6a3f" : "#3a3a3a",
          () => {
            slot.on = !slot.on;
            this.onRosterChanged();
          },
          slot.on ? "#ffffff" : "#888888",
        );
        if (k > 0) {
          this.addChip(layer, x + 128, y + 78, "↑", "#33405a", () => {
            moveJobUp(e, k);
            this.onRosterChanged();
          });
        }
      });
    });

    this.addOverlayClose(layer, 1150);
    this.overlay = layer;
  }

  onRosterChanged(this: TavernScene) {
    this.pendingFireId = null;
    this.rebuildStaffChars();
    this.save();
    this.buildStaffOverlay();
  }

  /** 候选人按天刷新；同一天读档后还是同一批。 */
  ensureCandidates(this: TavernScene, force = false) {
    if (!force && this.candidatesDay === this.day) return;
    this.candidatesDay = this.day;
    const used = new Set(this.employees.map((e) => e.name));
    this.candidates = Array.from({ length: GAME.staff.candidatesPerDay }, () => {
      const c = rollCandidate(this.nextStaffId++, Math.random);
      // 同名会让见闻录分不清是谁，撞名就换一个还没用过的
      if (used.has(c.name)) c.name = GAME.staff.names.find((n) => !used.has(n)) ?? c.name;
      used.add(c.name);
      return c;
    });
    this.save();
  }

  /** 二级页面：招聘。每天一批候选人，可付费再刷。 */
  buildRecruitOverlay(this: TavernScene) {
    this.ensureCandidates();
    const layer = this.staffOverlayLayer("招聘");
    const cap = getStaffCap(this.level);
    const full = this.employees.length >= cap;
    layer.add(
      this.add.text(
        40,
        108,
        full ? `人手已满（${this.employees.length}/${cap}），先辞退一位或扩建酒楼` : `已雇 ${this.employees.length}/${cap} · 每天来一批新面孔`,
        { fontSize: "16px", color: full ? "#ff9a8a" : "#e0c060" },
      ),
    );
    if (this.candidates.length === 0) {
      layer.add(this.add.text(360, 400, "今天的候选人都雇走了", { fontSize: "20px", color: "#888888" }).setOrigin(0.5));
    }
    this.candidates.forEach((c, i) => {
      const y = 190 + i * 150;
      const cost = getHireCost(c);
      layer.add(this.add.rectangle(40, y, 640, 136, 0x1e2636).setOrigin(0, 0).setStrokeStyle(1, 0x3a4660));
      layer.add(this.add.text(56, y + 12, c.name, { fontSize: "22px", color: "#ffffff" }));
      layer.add(
        this.add.text(170, y + 17, `总 ${getTotalStars(c)} 星 · 日薪 ${getStaffWage(c)} 灵石`, { fontSize: "16px", color: "#bbbbbb" }),
      );
      JOBS.forEach((job, k) => this.addStarBar(layer, 56 + k * 210, y + 54, job, c.stars[job]));
      this.addChip(layer, 56, y + 88, `雇佣 ${cost} 灵石`, full || this.coins < cost ? "#3a3a3a" : "#3a5a3a", () => {
        this.hireStaff(c);
        this.buildRecruitOverlay();
      });
    });
    const refreshCost = GAME.staff.refreshCost;
    this.addChip(layer, 40, 660, `换一批（${refreshCost} 灵石）`, "#33405a", () => {
      if (this.coins < refreshCost) {
        this.staffNotice = `灵石不足，换一批需 ${refreshCost} 灵石`;
        this.staffNoticeGood = false;
      } else {
        this.coins -= refreshCost;
        this.displayedCoins = this.coins;
        this.ensureCandidates(true);
        this.staffNotice = "";
      }
      this.buildRecruitOverlay();
    });
    this.addChip(layer, 520, 660, "返回伙计", "#33405a", () => {
      this.staffNotice = "";
      this.buildStaffOverlay();
    });
    this.addOverlayClose(layer, 1150);
    this.overlay = layer;
  }
}
