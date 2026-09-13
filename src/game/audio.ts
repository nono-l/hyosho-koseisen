let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let music: GainNode | null = null;
let sfx: GainNode | null = null;
let musicTimer: number | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    music = ctx.createGain();
    sfx = ctx.createGain();
    music.gain.value = 0.22;
    sfx.gain.value = 0.45;
    master.gain.value = 0.85;
    music.connect(master);
    sfx.connect(master);
    master.connect(ctx.destination);
  }
  return ctx;
}

export function unlockAudio() {
  const c = ac();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
}

export function setMuted(v: boolean) {
  muted = v;
  if (master) master.gain.setTargetAtTime(v ? 0 : 0.85, ac()!.currentTime, 0.03);
}

export function isMuted() {
  return muted;
}

function beep(
  freq: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  dest: GainNode,
  slide?: number,
) {
  const c = ac();
  if (!c || !dest) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noiseBurst(dur: number, vol: number, dest: GainNode, hp = 400) {
  const c = ac();
  if (!c || !dest) return;
  const n = c.createBufferSource();
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  n.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = hp;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  n.connect(f);
  f.connect(g);
  g.connect(dest);
  n.start(t);
  n.stop(t + dur);
}

export const sfxPlay = {
  click() {
    if (!sfx) return;
    beep(880, 0.06, "triangle", 0.12, sfx, 1.4);
  },
  deploy() {
    if (!sfx) return;
    beep(240, 0.14, "square", 0.16, sfx, 2.2);
    beep(520, 0.1, "triangle", 0.1, sfx, 1.6);
  },
  shoot() {
    if (!sfx) return;
    beep(420 + Math.random() * 80, 0.05, "square", 0.07, sfx, 0.4);
  },
  hit() {
    if (!sfx) return;
    noiseBurst(0.06, 0.12, sfx, 800);
    beep(180, 0.07, "sawtooth", 0.06, sfx, 0.5);
  },
  explode() {
    if (!sfx) return;
    noiseBurst(0.28, 0.28, sfx, 200);
    beep(120, 0.32, "sawtooth", 0.18, sfx, 0.3);
  },
  freeze() {
    if (!sfx) return;
    beep(920, 0.18, "sine", 0.1, sfx, 1.8);
    beep(1400, 0.12, "triangle", 0.06, sfx, 1.3);
  },
  spell() {
    if (!sfx) return;
    beep(600, 0.2, "triangle", 0.14, sfx, 2.4);
    noiseBurst(0.16, 0.1, sfx, 1200);
  },
  win() {
    if (!sfx) return;
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => beep(f, 0.28, "triangle", 0.16, sfx!, 1.02), i * 140);
    });
  },
  lose() {
    if (!sfx) return;
    beep(320, 0.5, "sawtooth", 0.14, sfx, 0.4);
    beep(180, 0.7, "triangle", 0.12, sfx, 0.5);
  },
  deny() {
    if (!sfx) return;
    beep(160, 0.12, "square", 0.1, sfx, 0.7);
  },
};

export function startBattleMusic() {
  stopBattleMusic();
  const c = ac();
  if (!c || !music) return;
  const pulse = () => {
    if (!music || muted) return;
    const root = 110;
    beep(root, 0.35, "sine", 0.18, music, 1);
    beep(root * 1.5, 0.45, "triangle", 0.08, music, 1);
    beep(root * 2, 0.2, "sine", 0.05, music, 1.02);
  };
  pulse();
  musicTimer = window.setInterval(pulse, 1600);
}

export function stopBattleMusic() {
  if (musicTimer != null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", unlockAudio, { once: true });
  window.addEventListener("keydown", unlockAudio, { once: true });
  document.addEventListener("visibilitychange", () => {
    const c = ac();
    if (c && document.visibilityState === "visible" && c.state === "suspended") void c.resume();
  });
}
