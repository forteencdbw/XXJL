// 程序合成的占位音效（Web Audio）。后续可整体替换为真实音频资源。
// shortcut: 只支持 Web Audio；接入微信小游戏时需换成 wx.createInnerAudioContext 或适配层。

type SfxName = "click" | "arrival" | "seat" | "cook" | "coin" | "upgrade" | "event" | "open" | "close";

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
};

// 五声音阶的氛围乐句：长短音 + 休止 + 低音持续音，避免机械的单音循环。
// 仍是程序合成占位，正式美术/音频资产可整段替换。
export interface BgmStep {
  note: number | null;
  beats: number;
  bass?: number;
}
export const BGM_BEAT_MS = 380;
export const BGM_PATTERN: BgmStep[] = [
  { note: 392.0, beats: 1 },
  { note: 440.0, beats: 1 },
  { note: 523.25, beats: 2, bass: 130.81 },
  { note: null, beats: 1 },
  { note: 493.88, beats: 1 },
  { note: 440.0, beats: 1, bass: 146.83 },
  { note: 392.0, beats: 2 },
  { note: 329.63, beats: 1 },
  { note: 293.66, beats: 1 },
  { note: 261.63, beats: 2, bass: 130.81 },
  { note: null, beats: 1 },
  { note: 329.63, beats: 1 },
  { note: 392.0, beats: 2 },
  { note: 440.0, beats: 1 },
  { note: 523.25, beats: 2, bass: 196.0 },
  { note: null, beats: 1 },
];

let ctx: AudioContext | null = null;
let sfxGain: GainNode | null = null;
let bgmGain: GainNode | null = null;
let bgmTimer: number | null = null;
let sfxMuted = false;
let bgmMuted = false;

function ensure(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    sfxGain = ctx.createGain();
    bgmGain = ctx.createGain();
    sfxGain.gain.value = sfxMuted ? 0 : 1;
    bgmGain.gain.value = bgmMuted ? 0 : 1;
    sfxGain.connect(ctx.destination);
    bgmGain.connect(ctx.destination);
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

function playBgmNote(audio: AudioContext, freq: number, durationMs: number, gainValue: number) {
  const seconds = Math.max(0.2, durationMs / 1000);
  const t0 = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(gainValue, t0 + 0.12);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
  osc.connect(gain).connect(bgmGain!);
  osc.start(t0);
  osc.stop(t0 + seconds + 0.05);
}

export function startBgm() {
  if (bgmTimer !== null) return;
  const audio = ensure();
  let stepIndex = 0;
  const tick = () => {
    if (bgmTimer === null) return;
    const step = BGM_PATTERN[stepIndex % BGM_PATTERN.length];
    stepIndex += 1;
    const durationMs = step.beats * BGM_BEAT_MS;
    if (step.note !== null) playBgmNote(audio, step.note, durationMs * 0.95, 0.016);
    if (step.bass !== undefined) playBgmNote(audio, step.bass, durationMs * 2.5, 0.007);
    bgmTimer = window.setTimeout(tick, durationMs);
  };
  bgmTimer = window.setTimeout(tick, 0);
}

export function setSfxMuted(muted: boolean) {
  sfxMuted = muted;
  localStorage.setItem("tavern_sfx_muted", muted ? "1" : "0");
  if (sfxGain) sfxGain.gain.value = muted ? 0 : 1;
}

export function setBgmMuted(muted: boolean) {
  bgmMuted = muted;
  localStorage.setItem("tavern_bgm_muted", muted ? "1" : "0");
  if (bgmGain) bgmGain.gain.value = muted ? 0 : 1;
}

export function loadAudioSettings() {
  sfxMuted = localStorage.getItem("tavern_sfx_muted") === "1";
  bgmMuted = localStorage.getItem("tavern_bgm_muted") === "1";
  return { sfxMuted, bgmMuted };
}
