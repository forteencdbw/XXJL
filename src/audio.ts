// 程序合成的占位音效（Web Audio）。后续可整体替换为真实音频资源。
// shortcut: 只支持 Web Audio；接入微信小游戏时需换成 wx.createInnerAudioContext 或适配层。

type SfxName =
  | "click"
  | "arrival"
  | "seat"
  | "cook"
  | "coin"
  | "upgrade"
  | "event"
  | "open"
  | "close"
  | "whoosh"
  | "chime"
  | "rumble";

const SFX_DEFS: Record<SfxName, { notes: number[]; dur: number; type: OscillatorType; gain: number }> = {
  click: { notes: [720], dur: 0.05, type: "square", gain: 0.03 },
  arrival: { notes: [420, 560], dur: 0.1, type: "sine", gain: 0.07 },
  seat: { notes: [520], dur: 0.09, type: "sine", gain: 0.06 },
  cook: { notes: [600, 800], dur: 0.12, type: "triangle", gain: 0.07 },
  coin: { notes: [800, 1050], dur: 0.1, type: "sine", gain: 0.08 },
  upgrade: { notes: [440, 550, 660], dur: 0.12, type: "triangle", gain: 0.07 },
  event: { notes: [330, 415, 494], dur: 0.16, type: "sine", gain: 0.06 },
  open: { notes: [392, 523, 659], dur: 0.16, type: "sine", gain: 0.08 },
  close: { notes: [523, 392, 294], dur: 0.16, type: "sine", gain: 0.08 },
  whoosh: { notes: [1046, 784, 523], dur: 0.09, type: "sawtooth", gain: 0.035 },
  chime: { notes: [1046, 1318, 1568], dur: 0.12, type: "sine", gain: 0.055 },
  rumble: { notes: [130, 98, 78], dur: 0.2, type: "triangle", gain: 0.07 },
};

let ctx: AudioContext | null = null;
let sfxGain: GainNode | null = null;
// 音量 0–1，存在本机（跟设备走，不进存档）
let sfxVolume = 1;
let bgmVolume = 0.6;
const SFX_KEY = "tavern_sfx_volume";
const BGM_KEY = "tavern_bgm_volume";

function ensure(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    sfxGain = ctx.createGain();
    sfxGain.gain.value = sfxVolume;
    sfxGain.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function playSfx(name: SfxName) {
  const def = SFX_DEFS[name];
  const audio = ensure();
  def.notes.forEach((freq, i) => {
    const t0 = audio.currentTime + i * def.dur * 0.85;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = def.type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(def.gain, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + def.dur);
    osc.connect(gain).connect(sfxGain!);
    osc.start(t0);
    osc.stop(t0 + def.dur + 0.02);
  });
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function setSfxVolume(v: number) {
  sfxVolume = clamp01(v);
  localStorage.setItem(SFX_KEY, String(sfxVolume));
  if (sfxGain) sfxGain.gain.value = sfxVolume;
}

/** 背景音乐音量：本期还没有背景音乐，只保存数值，以后的音乐按它播放。 */
export function setBgmVolume(v: number) {
  bgmVolume = clamp01(v);
  localStorage.setItem(BGM_KEY, String(bgmVolume));
}

export function getAudioSettings() {
  return { sfx: sfxVolume, bgm: bgmVolume };
}

export function loadAudioSettings() {
  const read = (key: string, fallback: number) => {
    const v = Number(localStorage.getItem(key));
    return localStorage.getItem(key) !== null && Number.isFinite(v) ? clamp01(v) : fallback;
  };
  // 旧的「音效关」开关按 0% 处理
  sfxVolume = read(SFX_KEY, localStorage.getItem("tavern_sfx_muted") === "1" ? 0 : 1);
  bgmVolume = read(BGM_KEY, 0.6);
}
