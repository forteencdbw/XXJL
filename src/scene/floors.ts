// 楼层与雅座：雅座视觉、楼层切换标签、桌位布局、按楼层增减雅座。
import Phaser from "phaser";
import { playSfx } from "../audio";
import { FLOOR_UNLOCKS, MAX_FLOORS, getFloorBoothCount } from "../logic";
import { ACTOR_Y, COLOR_PLAYER, FLOOR_Y, TABLE_MARKS, TABLE_X_MAX, TABLE_X_MIN, XIAN_FONT } from "./constants";
import type { Booth, BoothVisual } from "./types";
import type { TavernScene } from "./TavernScene";

export class FloorMethods {
  buildFloorTabs(this: TavernScene) {
    const names = ["散座", "雅座+15%", "包间+25%"];
    for (let floor = 0; floor < MAX_FLOORS; floor++) {
      const x = 124 + floor * 160;
      const bg = this.add
        .rectangle(x, 132, 152, 38, 0x14100c, 0.96)
        .setOrigin(0, 0)
        .setStrokeStyle(2, 0x4a3a2a, 0.8)
        .setScrollFactor(0)
        .setDepth(31)
        .setVisible(false)
        .setInteractive({ useHandCursor: true })
        .on("pointerup", () => {
          playSfx("click");
          if (floor > this.floorsBuilt) {
            const def = FLOOR_UNLOCKS[floor - 1];
            this.showHint(
              def
                ? `先到 Lv${def.level} 并在营造里花 ${def.cost} 灵石起${floor === 1 ? "二楼" : "三楼"}`
                : "这层还没起",
            );
            return;
          }
          this.switchFloor(floor);
        });
      const label = this.add
        .text(x + 26, 151, `${floor + 1}F`, {
          fontSize: "20px",
          color: "#e0c9a0",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(32)
        .setVisible(false);
      const sub = this.add
        .text(x + 94, 151, names[floor], {
          fontSize: "14px",
          color: "#a89472",
          fontFamily: XIAN_FONT,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(32)
        .setVisible(false);
      this.floorTabs.push({ bg, label, sub });
    }
  }

  buildBoothVisuals(this: TavernScene) {
    this.booths.forEach((_, i) => this.addBoothVisual(i));
  }

  addBoothVisual(this: TavernScene, i: number) {
    const bg = this.add.rectangle(0, 0, 80, 16, 0x6a4a2a).setDepth(6.5).setStrokeStyle(2, 0x8a6a4a);
    const runner = this.add.rectangle(0, 0, 60, 6, 0x8a2a22).setDepth(6.6).setStrokeStyle(1, 0xd9b45a, 0.7);
    const number = this.add
      .text(0, 0, "", {
        fontSize: "15px",
        color: "#e0c9a0",
        stroke: "#1a120a",
        strokeThickness: 3,
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5)
      .setDepth(6.8);
    const legs = [
      this.add.rectangle(0, 0, 7, 32, 0x4a3420).setDepth(6.4),
      this.add.rectangle(0, 0, 7, 32, 0x4a3420).setDepth(6.4),
    ];
    const label = this.add
      .text(0, 0, "", {
        fontSize: "19px",
        color: "#ffe6c8",
        stroke: "#1a120a",
        strokeThickness: 3,
        padding: { x: 2, y: 1 },
        align: "center",
        lineSpacing: 1,
        wordWrap: { width: 110 },
        fontFamily: XIAN_FONT,
      })
      .setOrigin(0.5, 1)
      .setDepth(6.8);
    const barBg = this.add.rectangle(0, 0, 80, 8, 0x1a1a1a).setOrigin(0, 0.5).setDepth(6.9);
    const barFill = this.add.rectangle(0, 0, 0, 8, COLOR_PLAYER).setOrigin(0, 0.5).setDepth(6.95);
    // 每桌一支小烛：给人物和桌面一点暖光，而不是只有顶灯
    const candleGlow = this.add
      .image(0, 0, "soft-glow")
      .setTint(0xffa050)
      .setAlpha(0.16)
      .setScale(0.6)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(7);
    const candleBody = this.add.rectangle(0, 0, 7, 13, 0xf0e2c8).setDepth(7.1);
    const candleFlame = this.add.ellipse(0, 0, 7, 11, 0xffd98a).setDepth(7.2);
    this.tweens.add({
      targets: candleGlow,
      alpha: { from: 0.12, to: 0.2 },
      duration: Phaser.Math.Between(900, 1500),
      yoyo: true,
      repeat: -1,
      delay: Phaser.Math.Between(0, 500),
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: candleFlame,
      alpha: { from: 0.65, to: 1 },
      scaleY: { from: 0.85, to: 1.1 },
      duration: Phaser.Math.Between(700, 1200),
      yoyo: true,
      repeat: -1,
      delay: Phaser.Math.Between(0, 500),
      ease: "Sine.easeInOut",
    });
    // 整张桌子都是「看这位客人」的点击区，别让玩家去点米粒大的人
    const zone = this.add.zone(0, 0, 80, 150).setOrigin(0.5, 0).setDepth(7.3);
    let zx = 0;
    let zy = 0;
    zone
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", (p: Phaser.Input.Pointer) => {
        zx = p.x;
        zy = p.y;
      })
      .on("pointerup", (p: Phaser.Input.Pointer) => {
        if (Math.hypot(p.x - zx, p.y - zy) >= 12) return;
        const patron = this.booths[i]?.patronChar;
        if (patron) this.focusOnCharacter(patron);
      });
    const visible = this.gameState === "open";
    [bg, runner, number, label, ...legs, barBg, barFill, candleGlow, candleBody, candleFlame].forEach((o) =>
      o.setVisible(visible),
    );
    this.boothVisuals.push({
      floor: this.booths[i]?.floor ?? 0,
      bg,
      runner,
      number,
      label,
      legs,
      barBg,
      barFill,
      zone,
      candleGlow,
      candleBody,
      candleFlame,
    });
    this.relayoutTables();
  }

  /** 每层各自在 500 宽里均分；只有当前楼层的桌子/点击区可见。 */
  relayoutTables(this: TavernScene) {
    for (let floor = 0; floor < MAX_FLOORS; floor++) {
      const visuals = this.boothVisuals.filter((v) => v.floor === floor);
      const total = Math.max(visuals.length, 1);
      const width = Math.min(84, 500 / total);
      const active = this.gameState === "open" && floor === this.activeFloor;
      visuals.forEach((v, i) => {
        const x =
          total === 1
            ? (TABLE_X_MIN + TABLE_X_MAX) / 2
            : TABLE_X_MIN + (i * (TABLE_X_MAX - TABLE_X_MIN)) / (total - 1);
        v.bg.setPosition(x, FLOOR_Y - 30).setSize(width, 16).setVisible(active);
        v.bg.setStrokeStyle(2, this.level >= 2 || floor > 0 ? 0xd9b45a : 0x8a6a4a);
        v.runner
          .setPosition(x, FLOOR_Y - 34)
          .setSize(Math.max(30, width - 14), 5)
          .setVisible(active && (this.level >= 2 || floor > 0));
        const cx = x + Math.min(28, width * 0.32);
        v.candleGlow.setPosition(cx, FLOOR_Y - 44).setVisible(active);
        v.candleBody.setPosition(cx, FLOOR_Y - 36).setVisible(active);
        v.candleFlame.setPosition(cx, FLOOR_Y - 44).setVisible(active);
        const stagger = total >= 4 ? (i % 2) * 46 : 0;
        v.number
          .setText(TABLE_MARKS[i] ?? `${i + 1}`)
          .setPosition(x, FLOOR_Y - 150 - stagger)
          .setVisible(active);
        v.legs[0].setPosition(x - width / 2 + 10, FLOOR_Y - 14).setVisible(active);
        v.legs[1].setPosition(x + width / 2 - 10, FLOOR_Y - 14).setVisible(active);
        v.label.setPosition(x, FLOOR_Y - 116 - stagger).setVisible(active);
        const zoneWidth = Math.max(36, Math.min(90, 500 / total));
        v.zone.setPosition(x, FLOOR_Y - 170).setSize(zoneWidth, 160);
        if (v.zone.input) {
          v.zone.input.hitArea.setSize(zoneWidth, 160);
          v.zone.input.enabled = active;
        }
        const barW = Math.max(36, width - 8);
        v.barBg.setPosition(x - barW / 2, FLOOR_Y - 70).setSize(barW, 8).setVisible(active);
        v.barFill.setPosition(x - barW / 2, FLOOR_Y - 70).setVisible(active);
      });
    }
  }

  applyFloorLook(this: TavernScene) {
    const tints = [0xffffff, 0xffe4d6, 0xd8f4ec];
    this.interiorPixelImage.setTint(tints[this.activeFloor] ?? 0xffffff);
  }

  setFloorTabsVisible(this: TavernScene, visible: boolean) {
    for (const tab of this.floorTabs) {
      tab.bg.setVisible(visible);
      tab.label.setVisible(visible);
      tab.sub.setVisible(visible);
      if (tab.bg.input) tab.bg.input.enabled = visible;
    }
  }

  refreshFloorTabs(this: TavernScene) {
    const open = this.gameState === "open";
    this.setFloorTabsVisible(open);
    if (!open) return;
    const names = ["散座", "雅座+15%", "包间+25%"];
    this.floorTabs.forEach((tab, floor) => {
      const built = floor <= this.floorsBuilt;
      const active = floor === this.activeFloor;
      const total = this.booths.filter((b) => b.floor === floor).length;
      const free = this.booths.filter((b) => b.floor === floor && b.state === "empty").length;
      tab.bg.setFillStyle(active ? 0x8a2a22 : built ? 0x14100c : 0x0b0906, 0.96);
      tab.bg.setStrokeStyle(2, active ? 0xd9b45a : built ? 0x4a3a2a : 0x2a2018, 0.9);
      tab.label.setText(`${floor + 1}F`).setColor(active ? "#ffe6a8" : built ? "#e0c9a0" : "#5a4a3a");
      tab.sub
        .setText(built ? `${names[floor]} · ${free}/${total}` : "未起")
        .setColor(active ? "#f5e6c8" : built ? "#a89472" : "#5a4a3a");
      tab.bg.setAlpha(built ? 1 : 0.72);
      tab.label.setAlpha(built ? 1 : 0.6);
      tab.sub.setAlpha(built ? 1 : 0.6);
      if (tab.bg.input) tab.bg.input.enabled = true;
    });
  }

  refreshBoothVisibility(this: TavernScene) {
    const open = this.gameState === "open";
    this.booths.forEach((booth, i) => {
      // 正被领座的客人跟着跑堂走：还在门口时算一楼，上楼后才算目标楼层
      const escort = [...this.staffRt.values()].find((rt) => rt.task?.kind === "seat" && rt.task.boothIndex === i);
      const visible = open && (escort ? escort.floor : booth.floor) === this.activeFloor;
      booth.patronChar?.setVisible(visible);
      booth.diningProp?.setVisible(visible);
    });
    const queueVisible = open && this.activeFloor === 0;
    this.queue.forEach((patron) => patron.char.setVisible(queueVisible));
    // 营业中掌柜和伙计在哪层就只在哪层露面；夜里都在法坛打坐
    this.staffRt.forEach((rt) => rt.char.setVisible(!open || rt.floor === this.activeFloor));
  }

  switchFloor(this: TavernScene, floor: number) {
    if (floor === this.activeFloor || floor < 0 || floor > this.floorsBuilt) return;
    const apply = () => {
      this.activeFloor = floor;
      this.applyFloorLook();
      this.relayoutTables();
      this.refreshBoothVisibility();
      this.refreshFloorTabs();
    };
    if (this.gameState === "open" && !this.settling) {
      this.cameras.main.fadeOut(140, 0, 0, 0, () => {
        apply();
        this.cameras.main.fadeIn(160, 0, 0, 0);
      });
    } else {
      apply();
    }
  }

  /** 当前楼层优先；返回该桌在本层的横向坐标。 */
  tablePosition(this: TavernScene, index: number): { x: number; y: number } {
    const booth = this.booths[index];
    const floor = booth?.floor ?? 0;
    const visuals = this.boothVisuals.filter((v) => v.floor === floor);
    const local = this.booths.slice(0, index).filter((b) => b.floor === floor).length;
    const total = Math.max(visuals.length, 1);
    const x =
      total === 1
        ? (TABLE_X_MIN + TABLE_X_MAX) / 2
        : TABLE_X_MIN + (local * (TABLE_X_MAX - TABLE_X_MIN)) / (total - 1);
    return { x, y: ACTOR_Y };
  }

  // ===== 状态机 =====

  // ===== 场景与 UI =====
  desiredFloors(this: TavernScene): number[] {
    const floors: number[] = [];
    for (let floor = 0; floor <= this.floorsBuilt; floor++) {
      const count = getFloorBoothCount(this.level, this.floorsBuilt, floor);
      for (let i = 0; i < count; i++) floors.push(floor);
    }
    return floors;
  }

  /** 等级或楼层变化后，让桌位数组与楼层派生数量一致；只增不减。 */
  syncBooths(this: TavernScene) {
    const desired = this.desiredFloors();
    while (this.booths.length < desired.length) {
      this.booths.push(this.makeBooth(desired[this.booths.length]));
    }
    while (this.booths.length > desired.length) {
      const booth = this.booths.pop();
      booth?.patronChar?.destroy();
      booth?.diningProp?.destroy();
      const visual = this.boothVisuals.pop();
      if (visual) this.destroyBoothVisual(visual);
    }
    this.booths.forEach((booth, i) => {
      booth.floor = desired[i] ?? 0;
    });
    while (this.boothVisuals.length < this.booths.length) {
      this.addBoothVisual(this.boothVisuals.length);
    }
    this.relayoutTables();
    this.refreshBoothVisibility();
  }

  destroyBoothVisual(this: TavernScene, v: BoothVisual) {
    [v.bg, v.runner, v.number, v.label, ...v.legs, v.barBg, v.barFill, v.candleGlow, v.candleBody, v.candleFlame, v.zone].forEach(
      (obj) => obj.destroy(),
    );
  }

  makeBooth(this: TavernScene, floor = 0): Booth {
    return {
      floor,
      state: "empty",
      cookStaffId: null,
      cookQuality: 1,
      currentDish: null,
      cookStartedAt: 0,
      cookDoneAt: 0,
      departAt: 0,
      awaitingSince: 0,
      readyAt: 0,
      patronKind: null,
      patronWish: null,
      patronName: null,
      patronRegular: false,
    };
  }
}
