// 入口：校验玩法配置后启动 Phaser。代码地图见 src/ARCHITECTURE.md。
import Phaser from "phaser";
import { GAME, validateConfig } from "./config";
import { TavernScene } from "./scene/TavernScene";
import { SCREEN_H, SCREEN_W } from "./scene/constants";

const configErrors = validateConfig(GAME);
if (configErrors.length > 0) {
  // 配置填错就不启动游戏，直接把出错项列在页面上
  const box = document.createElement("pre");
  box.style.cssText = "color:#ff6b6b;background:#1b1b1b;padding:24px;font:16px/1.6 monospace;white-space:pre-wrap;margin:0;min-height:100vh";
  box.textContent = `src/config.ts 配置有误，游戏未启动：\n\n${configErrors.map((e) => `· ${e}`).join("\n")}`;
  document.body.replaceChildren(box);
} else new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: SCREEN_W,
  height: SCREEN_H,
  backgroundColor: "#1b2440",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [TavernScene],
});
