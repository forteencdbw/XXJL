// 二级页面：伙计名单（勾选/排序/辞退）与招聘。
import Phaser from "phaser";
import { playSfx } from "../../audio";
import { GAME } from "../../config";
import { getEffectiveStars, getExpToNext, getHireCost, getRootBonus, getRootName, getStaffCap, getStaffWage, getTotalStars, JOB_ELEMENT, JOB_NAMES, JOB_STAT, JOBS, ELEMENT_NAMES, moveJobUp, rollCandidate, SHOPKEEPER_ID, spendStatPoint, STAT_NAMES, STATS } from "../../logic";
import type { Employee, Stat } from "../../logic";
import { SCREEN_H, SCREEN_W, XIAN_FONT } from "../constants";
import type { TavernScene } from "../TavernScene";

export class StaffOverlayMethods {
  /** 星条：10 格，亮格数 = 星数，后跟数字。 */
  addStarBar(this: TavernScene, layer: Phaser.GameObjects.Container, x: number, y: number, stat: Stat, stars: number) {
    layer.add(this.add.text(x, y, STAT_NAMES[stat], { fontSize: "15px", color: "#d8c8a0" }));
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

  /** 二级页面：员工名单。每人一行精简信息，点进去看详情、加点、调分工。 */
  buildStaffOverlay(this: TavernScene) {
    const layer = this.staffOverlayLayer("伙计");
    const cap = getStaffCap(this.level);
    layer.add(
      this.add.text(40, 108, `${this.staffSummaryHint()}\n点人物：看详情、加属性点、调分工`, {
        fontSize: "15px",
        color: "#e0c060",
        wordWrap: { width: 640 },
      }),
    );
    this.addChip(layer, 470, 62, `招聘（已雇 ${this.employees.length}/${cap}）`, "#3a5a3a", () => {
      this.staffNotice = "";
      this.buildRecruitOverlay();
    });

    this.workforce().forEach((e, i) => {
      const y = 184 + i * 118;
      const keeper = e.id === SHOPKEEPER_ID;
      layer.add(
        this.add
          .rectangle(40, y, 640, 112, keeper ? 0x2a2418 : 0x1e2636)
          .setOrigin(0, 0)
          .setStrokeStyle(1, keeper ? 0x8a6a3a : 0x3a4660)
          .setInteractive({ useHandCursor: true })
          .on("pointerup", () => {
            playSfx("click");
            this.staffNotice = "";
            this.pendingFireId = null;
            this.buildStaffDetail(e);
          }),
      );
      layer.add(this.add.text(56, y + 10, e.name, { fontSize: "22px", color: keeper ? "#ffe6a8" : "#ffffff" }));
      layer.add(this.add.text(160, y + 14, `${e.level} 级 · ${getRootName(e.root)}`, { fontSize: "17px", color: "#d9b45a" }));
      const order = e.jobs.filter((slot) => slot.on).map((slot, k) => `${k + 1}.${JOB_NAMES[slot.job]}`);
      layer.add(this.add.text(56, y + 46, order.length ? order.join("  ") : "没有分工", { fontSize: "17px", color: order.length ? "#b8d8c8" : "#ff9a8a" }));
      layer.add(this.add.text(56, y + 78, keeper ? "不领工资 · 不能辞退" : `日薪 ${getStaffWage(e)} 灵石`, { fontSize: "15px", color: "#bbbbbb" }));
      if (e.statPoints > 0) {
        layer.add(
          this.add
            .text(664, y + 14, `可加点 ${e.statPoints}`, { fontSize: "16px", color: "#1a120c", backgroundColor: "#ffd25a", padding: { x: 8, y: 4 } })
            .setOrigin(1, 0),
        );
      }
      layer.add(this.add.text(664, y + 72, "详情 ›", { fontSize: "16px", color: "#8a9aac" }).setOrigin(1, 0));
    });

    this.addOverlayClose(layer, 1150);
    this.overlay = layer;
    this.setWorldPaused(true);
  }

  /** 二级页面：一个人的详情。灵根、经验、五项属性与加点、工作勾选与顺序、辞退。 */
  buildStaffDetail(this: TavernScene, e: Employee) {
    const layer = this.staffOverlayLayer(e.name);
    const keeper = e.id === SHOPKEEPER_ID;
    this.addChip(layer, 560, 62, "返回名单", "#33405a", () => {
      this.pendingFireId = null;
      this.staffNotice = "";
      this.buildStaffOverlay();
    });
    layer.add(
      this.add.text(40, 108, `${getRootName(e.root)} · ${keeper ? "不领工资 · 不能辞退" : `日薪 ${getStaffWage(e)} 灵石`}`, {
        fontSize: "18px",
        color: "#d9b45a",
      }),
    );
    const maxed = e.level >= GAME.staff.maxLevel;
    const need = getExpToNext(e.level);
    layer.add(
      this.add.text(40, 136, `${e.level} 级 · ${maxed ? "已满级" : `经验 ${e.exp}/${need}`}${e.statPoints > 0 ? ` · 可加点 ${e.statPoints}` : ""}`, {
        fontSize: "17px",
        color: e.statPoints > 0 ? "#ffd25a" : "#c8b8a0",
      }),
    );

    STATS.forEach((stat, i) => {
      const y = 186 + i * 92;
      layer.add(this.add.rectangle(40, y, 640, 84, 0x1e2636).setOrigin(0, 0).setStrokeStyle(1, 0x3a4660));
      this.addStarBar(layer, 56, y + 14, stat, e.stars[stat]);
      const job = JOBS.find((j) => JOB_STAT[j] === stat);
      const bonus = job ? getRootBonus(e, job) : 0;
      const effect = !job
        ? "留给修行，暂无经营作用"
        : `管${JOB_NAMES[job]}${bonus > 0 ? ` · ${ELEMENT_NAMES[JOB_ELEMENT[job]]}灵根 +${bonus}，按 ${getEffectiveStars(e, job)} 星算` : ""}`;
      layer.add(this.add.text(56, y + 48, effect, { fontSize: "15px", color: bonus > 0 ? "#9fe870" : "#a8b8c8" }));
      if (e.statPoints > 0 && e.stars[stat] < GAME.staff.maxStars) {
        this.addChip(layer, 616, y + 22, "+", "#7a5a1a", () => {
          if (spendStatPoint(e, stat)) this.onRosterChanged(e);
        });
      }
    });

    layer.add(this.add.text(40, 660, "工作顺序（点勾选做不做，↑ 调先后）", { fontSize: "17px", color: "#e0c060" }));
    e.jobs.forEach((slot, k) => {
      const x = 40 + k * 215;
      this.addChip(
        layer,
        x,
        696,
        `${slot.on ? "✓" : "　"} ${k + 1}.${JOB_NAMES[slot.job]}`,
        slot.on ? "#3f6a3f" : "#3a3a3a",
        () => {
          slot.on = !slot.on;
          this.onRosterChanged(e);
        },
        slot.on ? "#ffffff" : "#888888",
      );
      if (k > 0) {
        this.addChip(layer, x + 128, 696, "↑", "#33405a", () => {
          moveJobUp(e, k);
          this.onRosterChanged(e);
        });
      }
    });

    if (!keeper) {
      const confirming = this.pendingFireId === e.id;
      this.addChip(layer, 40, 770, confirming ? "确认辞退" : "辞退", confirming ? "#8a2a2a" : "#4a2a2a", () => {
        if (confirming) {
          this.fireStaff(e);
          this.buildStaffOverlay();
        } else {
          this.pendingFireId = e.id;
          this.buildStaffDetail(e);
        }
      });
    }

    this.addOverlayClose(layer, 1150);
    this.overlay = layer;
    this.setWorldPaused(true);
  }

  /** 改了分工或加了点：重排站位并存档，留在详情页。 */
  onRosterChanged(this: TavernScene, e: Employee) {
    this.pendingFireId = null;
    this.rebuildStaffChars();
    this.save();
    this.buildStaffDetail(e);
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
        this.add.text(170, y + 17, `${getRootName(c.root)} · 总 ${getTotalStars(c)} 星 · 日薪 ${getStaffWage(c)} 灵石`, { fontSize: "16px", color: "#bbbbbb" }),
      );
      STATS.forEach((stat, k) => this.addStarBar(layer, 56 + (k % 3) * 210, y + 44 + Math.floor(k / 3) * 24, stat, c.stars[stat]));
      this.addChip(layer, 56, y + 96, `雇佣 ${cost} 灵石`, full || this.coins < cost ? "#3a3a3a" : "#3a5a3a", () => {
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
    this.setWorldPaused(true);
  }
}
