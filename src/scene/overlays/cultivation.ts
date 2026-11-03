// 二级页面：修行境界与飞升。
import { playSfx } from "../../audio";
import { REALMS, getAscensionPriceMultiplier, getAscensionStartCoins, getAscensionStartInventory, getAscensionStartLevel, getNextRealm } from "../../logic";
import { SCREEN_H, SCREEN_W, XIAN_FONT } from "../constants";
import type { TavernScene } from "../TavernScene";

export class CultivationOverlayMethods {
  /** 二级页面：修行境界，列出全部境界、加成与当前进度。 */
  buildCultivationOverlay(this: TavernScene) {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(100);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.97).setOrigin(0, 0).setInteractive());
    layer.add(this.add.text(40, 70, "修行境界", { fontSize: "30px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
    const next = getNextRealm(this.cultivation);
    layer.add(
      this.add.text(
        40,
        116,
        `当前「${REALMS[this.realmIndex()].name}」 · 修为 ${this.cultivation}${next ? ` / ${next.cultivation}` : "（圆满）"}`,
        { fontSize: "18px", color: "#ffd98a" },
      ),
    );
    layer.add(
      this.add.text(
        40,
        146,
        this.ascensions > 0
          ? `仙缘 ${this.ascensions} 重 · 菜品售价 +${Math.round(
              (getAscensionPriceMultiplier(this.ascensions) - 1) * 100,
            )}% · 下次飞升开局 Lv${getAscensionStartLevel(this.ascensions + 1)}`
          : "尚未飞升 · 每次飞升留一重仙缘，永久提高售价",
        { fontSize: "15px", color: "#c8a8ff" },
      ),
    );
    layer.add(
      this.add.text(40, 170, "每道菜离店得 1 点修为，亲自下厨得 2 点；突破自动发生", {
        fontSize: "14px",
        color: "#999999",
      }),
    );

    const current = this.realmIndex();
    REALMS.forEach((realm, i) => {
      const y = 200 + i * 68;
      const unlocked = this.cultivation >= realm.cultivation;
      const isCurrent = i === current;
      layer.add(
        this.add
          .rectangle(40, y, 640, 58, isCurrent ? 0x4a3a1a : 0x2b2b2b)
          .setOrigin(0, 0)
          .setStrokeStyle(2, isCurrent ? 0xffd98a : unlocked ? 0x5a5a3a : 0x444444),
      );
      layer.add(
        this.add.text(56, y + 7, realm.name, {
          fontSize: "20px",
          color: unlocked ? "#ffd98a" : "#777777",
        }),
      );
      layer.add(
        this.add.text(56, y + 32, `修为 ${realm.cultivation} · ${realm.perk}`, {
          fontSize: "14px",
          color: unlocked ? "#bbbbbb" : "#666666",
        }),
      );
      if (isCurrent) layer.add(this.add.text(610, y + 18, "当前", { fontSize: "16px", color: "#ffd98a" }));
    });

    const maxed = current === REALMS.length - 1;
    if (maxed) {
      layer.add(
        this.add
          .text(40, 780, "渡劫飞升（仙缘 +1）", {
            fontSize: "20px",
            color: "#3a2a10",
            backgroundColor: "#ffd98a",
            padding: { x: 16, y: 10 },
          })
          .setInteractive({ useHandCursor: true })
          .on("pointerup", () => this.buildAscendConfirmOverlay()),
      );
    }
    this.addOverlayClose(layer, 870);
    this.overlay = layer;
  }

  /** 飞升前的确认页：写清保留什么、失去什么。 */
  buildAscendConfirmOverlay(this: TavernScene) {
    this.destroyOverlay();
    const cam = this.cameras.main;
    const layer = this.add.container(cam.scrollX, cam.scrollY).setDepth(100);
    layer.add(this.add.rectangle(0, 0, SCREEN_W, SCREEN_H, 0x000000, 0.97).setOrigin(0, 0).setInteractive());
    layer.add(this.add.text(40, 90, "渡劫飞升", { fontSize: "32px", color: "#ffe6a8", fontFamily: XIAN_FONT }));
    const next = this.ascensions + 1;
    const lines = [
      "踏破虚空，此局经营从头再来。",
      "",
      "保留：仙缘、玩家形象",
      `失去：灵石、灵材、酒楼 ${this.level} 级、灶台/门面、伙计、借据、修为、天数`,
      "",
      `飞升后：仙缘 ${next} 重，菜品售价 +${Math.round((getAscensionPriceMultiplier(next) - 1) * 100)}%`,
      `开局：酒楼 Lv${getAscensionStartLevel(next)} · 灵石 ${getAscensionStartCoins(next)} · 灵材 ${getAscensionStartInventory(next)}`,
    ];
    lines.forEach((line, i) => {
      layer.add(
        this.add.text(40, 170 + i * 34, line, {
          fontSize: "18px",
          color: line.startsWith("失去") ? "#ff9a8a" : "#dddddd",
        }),
      );
    });
    layer.add(
      this.add
        .text(40, 500, "确认飞升", {
          fontSize: "20px",
          color: "#3a2a10",
          backgroundColor: "#ffd98a",
          padding: { x: 16, y: 10 },
        })
        .setInteractive({ useHandCursor: true })
        .on("pointerup", () => this.ascend()),
    );
    layer.add(
      this.add
        .text(220, 500, "再等等", {
          fontSize: "20px",
          color: "#ffffff",
          backgroundColor: "#3a3a3a",
          padding: { x: 16, y: 10 },
        })
        .setInteractive({ useHandCursor: true })
        .on("pointerup", () => this.buildCultivationOverlay()),
    );
    this.overlay = layer;
  }

  /** 飞升：写入新周目存档后刷新页面，避免逐个重建场景对象。 */
  ascend(this: TavernScene) {
    if (this.ascending) return;
    this.ascending = true;
    this.destroyOverlay();
    playSfx("open");
    this.cameras.main.flash(1200, 255, 255, 220);
    this.writeSave(this.freshSave(this.ascensions + 1));
    this.time.delayedCall(1100, () => location.reload());
  }
}
