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
let sfxMuted = false;

function ensure(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    sfxGain = ctx.createGain();
    sfxGain.gain.value = sfxMuted ? 0 : 1;
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

export function setSfxMuted(muted: boolean) {
  sfxMuted = muted;
  localStorage.setItem("tavern_sfx_muted", muted ? "1" : "0");
  if (sfxGain) sfxGain.gain.value = muted ? 0 : 1;
}

export function loadAudioSettings() {
  sfxMuted = localStorage.getItem("tavern_sfx_muted") === "1";
  return { sfxMuted };
}
