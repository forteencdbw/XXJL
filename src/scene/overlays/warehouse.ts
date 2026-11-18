// 二级页面：仓库。本期只有「食材」标签页，按种列出库存与介绍。
import { GATHERING_SPOTS, INGREDIENTS, totalIngredients } from "../../logic";
import { XIAN_FONT } from "../constants";
import type { TavernScene } from "../TavernScene";

export class WarehouseOverlayMethods {
  buildWarehouseOverlay(this: TavernScene) {
    const layer = this.openSubsystemPage("仓库");
    // 标签页：以后加别的分类时在这里并排
    layer.add(
      this.add
        .text(40, 116, "食材", {
          fontSize: "22px",
          color: "#ffe6a8",
          fontFamily: XIAN_FONT,
          backgroundColor: "#3a2a18",
          padding: { x: 14, y: 6 },
        })
        .setOrigin(0, 0),
    );
    layer.add(this.add.text(120, 124, "其他分类待开放", { fontSize: "15px", color: "#6a6a6a" }));
    layer.add(
      this.add.text(40, 168, `共 ${totalIngredients(this.inventory)} 份 · ${INGREDIENTS.length} 种 · 食材只能靠采集获得`, {
        fontSize: "16px",
        color: "#c8b8a0",
      }),
    );

    INGREDIENTS.forEach((ingredient, i) => {
      const y = 208 + i * 114;
      const count = this.inventory[ingredient.id] ?? 0;
      const sources = GATHERING_SPOTS.filter((s) => s.ingredients.includes(ingredient.id))
        .map((s) => s.name)
        .join("、");
      layer.add(
        this.add
          .rectangle(40, y, 640, 104, count > 0 ? 0x1e2636 : 0x181818)
          .setOrigin(0, 0)
          .setStrokeStyle(1, 0x3a4660),
      );
      layer.add(
        this.add.text(56, y + 10, ingredient.name, {
          fontSize: "22px",
          color: ingredient.rare ? "#ffd98a" : "#ffffff",
        }),
      );
      if (ingredient.rare) {
        layer.add(
          this.add.text(56 + ingredient.name.length * 23 + 8, y + 16, "稀有", {
            fontSize: "13px",
            color: "#c9a86a",
            backgroundColor: "#3a2a18",
            padding: { x: 5, y: 2 },
          }),
        );
      }
      layer.add(
        this.add
          .text(660, y + 12, `×${count}`, {
            fontSize: "24px",
            color: count > 0 ? "#a8d8b0" : "#ff9a8a",
          })
          .setOrigin(1, 0),
      );
      layer.add(this.add.text(56, y + 42, `产自 ${sources || "暂无"}` , { fontSize: "14px", color: "#8a9aac" }));
      layer.add(
        this.add.text(56, y + 66, ingredient.desc, {
          fontSize: "14px",
          color: "#a8b8c8",
          wordWrap: { width: 560, useAdvancedWrap: true },
        }),
      );
    });
  }
}
