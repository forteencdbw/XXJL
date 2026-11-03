import Phaser from "phaser";
import { playSfx } from "../audio";
import { COLOR_PLAYER, COLOR_STAFF } from "./constants";

/** 按钮内叠两条进度条：上=伙计（蓝），下=玩家（橙）。 */
export class ProgressButton {
  private static readonly BAR_WIDTH = 165;
  private track: Phaser.GameObjects.Rectangle;
  private zone: Phaser.GameObjects.Zone;
  private playerFill: Phaser.GameObjects.Rectangle;
  private staffFill: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    onClick: () => void,
    register: (obj: { x: number; setScrollFactor(v: number): unknown }, baseX: number) => void,
  ) {
    this.track = scene.add
      .rectangle(x + width / 2, y + height / 2, width, height, 0x3a3a3a)
      .setStrokeStyle(1, 0x666666)
      .setDepth(31);
    const barX = x + width - ProgressButton.BAR_WIDTH - 10;
    this.staffFill = scene.add.rectangle(barX, y + 5, 0, 11, COLOR_STAFF).setOrigin(0, 0).setDepth(31);
    this.playerFill = scene.add
      .rectangle(barX, y + height - 16, 0, 11, COLOR_PLAYER)
      .setOrigin(0, 0)
      .setDepth(31);
    this.label = scene.add
      .text(x + 10, y + height / 2, "", { fontSize: "15px", color: "#ffffff" })
      .setOrigin(0, 0.5)
      .setDepth(31);
    this.zone = scene.add.zone(x, y, width, height).setOrigin(0, 0).setDepth(31);
    register(this.zone, x);
    register(this.track, x);
    register(this.playerFill, barX);
    register(this.staffFill, barX);
    register(this.label, x + 10);
    // 用 pointerup + 位移阈值判定点击，避免玩家拖拽场景时误触按钮
    let sx = 0;
    let sy = 0;
    this.zone
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", (p: Phaser.Input.Pointer) => {
        sx = p.x;
        sy = p.y;
      })
      .on("pointerup", (p: Phaser.Input.Pointer) => {
        if (Math.hypot(p.x - sx, p.y - sy) < 12) {
          playSfx("click");
          onClick();
        }
      });
  }

  setLabel(text: string) {
    this.label.setText(text);
  }
  setProgress(playerFraction: number, staffFraction: number) {
    const w = ProgressButton.BAR_WIDTH;
    this.playerFill.width = w * Phaser.Math.Clamp(playerFraction, 0, 1);
    this.staffFill.width = w * Phaser.Math.Clamp(staffFraction, 0, 1);
  }
  private enabled = true;
  setEnabled(enabled: boolean) {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (enabled) {
      this.zone.setInteractive({ useHandCursor: true });
      this.track.setAlpha(1);
    } else {
      this.zone.disableInteractive();
      this.track.setAlpha(0.5);
    }
  }
  setVisible(visible: boolean) {
    this.track.setVisible(visible);
    this.playerFill.setVisible(visible);
    this.staffFill.setVisible(visible);
    this.label.setVisible(visible);
    if (visible && this.enabled) this.zone.setInteractive({ useHandCursor: true });
    else this.zone.disableInteractive();
  }
}
