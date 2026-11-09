// 二级页面：设置（背景音乐、音效音量）。设置跟设备走，不进存档。
import { getAudioSettings, playSfx, setBgmVolume, setSfxVolume } from "../../audio";
import type { TavernScene } from "../TavernScene";

const TRACK_X = 60;
const TRACK_W = 520;

export class SettingsOverlayMethods {
  buildSettingsOverlay(this: TavernScene) {
    const layer = this.openSubsystemPage("设置");
    const audio = getAudioSettings();
    this.addVolumeSlider(layer, 220, "背景音乐", "暂无背景音乐，音量先存着", audio.bgm, setBgmVolume);
    this.addVolumeSlider(layer, 380, "音效", "", audio.sfx, setSfxVolume);
  }

  /** 0–100% 的滑条：点或拖动轨道即生效，松手时响一声试听。 */
  addVolumeSlider(
    this: TavernScene,
    layer: Phaser.GameObjects.Container,
    y: number,
    label: string,
    note: string,
    value: number,
    apply: (v: number) => void,
  ) {
    layer.add(this.add.text(TRACK_X, y, label, { fontSize: "24px", color: "#f5e6c8" }));
    if (note) layer.add(this.add.text(TRACK_X + 120, y + 6, note, { fontSize: "15px", color: "#8a8a8a" }));
    const percent = this.add.text(TRACK_X + TRACK_W + 30, y + 52, "", { fontSize: "22px", color: "#ffd25a" }).setOrigin(0, 0.5);
    const fill = this.add.rectangle(TRACK_X, y + 52, 1, 10, 0xd9b45a).setOrigin(0, 0.5);
    const knob = this.add.circle(TRACK_X, y + 52, 16, 0xffe6a8).setStrokeStyle(3, 0x8a6a3a);
    const show = (v: number) => {
      fill.width = Math.max(1, v * TRACK_W);
      knob.x = TRACK_X + v * TRACK_W;
      percent.setText(`${Math.round(v * 100)}%`);
    };
    // 轨道上下留足可点的余量，手指不必正好按在细线上
    const hit = this.add
      .rectangle(TRACK_X - 20, y + 52, TRACK_W + 40, 64, 0x000000, 0.001)
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    const set = (p: Phaser.Input.Pointer) => {
      const v = Math.round(Math.min(1, Math.max(0, (p.x - TRACK_X) / TRACK_W)) * 20) / 20;
      apply(v);
      show(v);
    };
    hit.on("pointerdown", set);
    hit.on("pointermove", (p: Phaser.Input.Pointer) => p.isDown && set(p));
    hit.on("pointerup", () => playSfx("click"));
    layer.add([this.add.rectangle(TRACK_X, y + 52, TRACK_W, 10, 0x3a3a46).setOrigin(0, 0.5), fill, knob, percent, hit]);
    show(value);
  }
}
