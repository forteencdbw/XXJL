// 二级页面：修为子系统入口（本期只占位，玩法待设计）。
import { REALMS } from "../../logic";
import { XIAN_FONT } from "../constants";
import type { TavernScene } from "../TavernScene";

export class CultivationOverlayMethods {
  /** 修为页：占位，只读显示存档里已有的修为、境界与仙缘。 */
  buildCultivationOverlay(this: TavernScene) {
    const layer = this.openSubsystemPage("修为");
    layer.add(
      this.add
        .text(360, 420, "修为 · 敬请期待", { fontSize: "34px", color: "#e0c9a0", fontFamily: XIAN_FONT })
        .setOrigin(0.5),
    );
    layer.add(
      this.add
        .text(
          360,
          500,
          `当前修为 ${this.cultivation} · ${REALMS[this.realmIndex()].name}\n仙缘 ${this.ascensions} 重（暂不生效）`,
          { fontSize: "20px", color: "#999999", align: "center", lineSpacing: 10 },
        )
        .setOrigin(0.5, 0),
    );
  }
}
