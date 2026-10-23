import Phaser from "phaser";

/** 只在开发环境挂载的调试面板。生产构建通过动态 import 整块剔除。 */
export interface DebugActions {
  addCoins: (n: number) => void;
}

export function setupDebug(scene: Phaser.Scene, actions: DebugActions) {
  let panel: Phaser.GameObjects.Container | null = null;

  const build = () => {
    const cam = scene.cameras.main;
    const layer = scene.add.container(cam.scrollX, cam.scrollY).setDepth(200);
    layer.add(scene.add.rectangle(0, 0, 720, 1280, 0x000000, 0.85).setOrigin(0, 0));
    layer.add(scene.add.text(40, 60, "DEBUG 面板 · 按 P 关闭", { fontSize: "24px", color: "#ff6666" }));

    const items: { label: string; run: () => void }[] = [
      { label: "+1000 灵石", run: () => actions.addCoins(1000) },
    ];

    items.forEach((item, i) => {
      const btn = scene.add
        .text(60, 160 + i * 70, item.label, {
          fontSize: "20px",
          color: "#ffffff",
          backgroundColor: "#3a3a3a",
          padding: { x: 16, y: 10 },
        })
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", item.run);
      layer.add(btn);
    });

    return layer;
  };

  scene.input.keyboard?.on("keydown-P", () => {
    if (panel) {
      panel.destroy(true);
      panel = null;
    } else {
      panel = build();
    }
  });
}
