// WebAudio 纯合成:动作音效 + 程序化 BGM(零音频文件、零许可负担、完全离线)
// 浏览器自动播放策略:首次用户手势(开始对局/继续上局按钮)后才 init/resume。
let ctx = null;
let sfxGain = null;
let bgmGain = null;
let sfxOn = true;
let bgmOn = false;
let bgmTimer = null;
let nextBarTime = 0;
let barIndex = 0;

const BAR = 2.4; // 每小节秒数
// 进程:Am → F → C → G(宽松 lo-fi 和弦垫 + 低音)
const PROG = [
  { bass: 110.0, chord: [220.0, 261.63, 329.63] },
  { bass: 87.31, chord: [174.61, 220.0, 261.63] },
  { bass: 130.81, chord: [261.63, 329.63, 392.0] },
  { bass: 98.0, chord: [196.0, 246.94, 293.66] },
];

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  sfxGain = ctx.createGain();
  sfxGain.gain.value = 1;
  sfxGain.connect(master);
  bgmGain = ctx.createGain();
  bgmGain.gain.value = 0;
  bgmGain.connect(master);
  return ctx;
}

function resume() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function noiseBuffer(dur) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// 滤波噪声爆发(牌声/爆炸基底)
function burst({ dur = 0.08, freq = 2000, type = 'bandpass', q = 1.2, gain = 0.5, at = 0, sweepTo = null } = {}) {
  const t0 = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(sfxGain);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

// 单音(可选滑音)
function tone({ freq = 440, dur = 0.15, type = 'sine', gain = 0.3, at = 0, slideTo = null } = {}) {
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(sfxGain);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

const SFX = {
  deal: () => {
    for (let i = 0; i < 6; i++) burst({ dur: 0.05, freq: 1900 + Math.random() * 900, gain: 0.28, at: i * 0.08 });
  },
  play: () => {
    burst({ dur: 0.06, freq: 2600, q: 2, gain: 0.5 });
    tone({ freq: 190, dur: 0.05, type: 'triangle', gain: 0.14 });
  },
  pass: () => burst({ dur: 0.14, type: 'lowpass', freq: 420, gain: 0.32 }),
  bid: () => {
    tone({ freq: 660, dur: 0.09, gain: 0.22 });
    tone({ freq: 880, dur: 0.13, gain: 0.22, at: 0.09 });
  },
  bomb: () => {
    burst({ dur: 0.42, type: 'lowpass', freq: 1100, sweepTo: 90, gain: 0.85 });
    tone({ freq: 82, dur: 0.4, type: 'sine', gain: 0.5, slideTo: 36 });
  },
  rocket: () => {
    burst({ dur: 0.3, type: 'lowpass', freq: 1400, sweepTo: 120, gain: 0.7 });
    burst({ dur: 0.55, type: 'lowpass', freq: 900, sweepTo: 60, gain: 0.9, at: 0.18 });
    tone({ freq: 110, dur: 0.55, type: 'sine', gain: 0.55, slideTo: 30, at: 0.18 });
    tone({ freq: 1200, dur: 0.25, type: 'sawtooth', gain: 0.12, slideTo: 300 });
  },
  win: () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.28, at: i * 0.13 }));
  },
  lose: () => {
    [440, 349.23, 261.63].forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'sawtooth', gain: 0.16, at: i * 0.18 }));
  },
  error: () => tone({ freq: 160, dur: 0.16, type: 'square', gain: 0.18 }),
};

export function sfx(name) {
  if (!sfxOn) return;
  if (!ensure()) return;
  resume();
  SFX[name]?.();
}

function scheduleBar(t) {
  const { bass, chord } = PROG[barIndex % PROG.length];
  chord.forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.5);
    g.gain.linearRampToValueAtTime(0.038, t + BAR - 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + BAR);
    o.connect(g).connect(bgmGain);
    o.start(t);
    o.stop(t + BAR + 0.1);
    void i;
  });
  const b = ctx.createOscillator();
  b.type = 'sine';
  b.frequency.value = bass;
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.0001, t);
  bg.gain.linearRampToValueAtTime(0.12, t + 0.3);
  bg.gain.linearRampToValueAtTime(0.0001, t + BAR - 0.2);
  b.connect(bg).connect(bgmGain);
  b.start(t);
  b.stop(t + BAR);
  barIndex++;
}

function startBgm() {
  if (!ensure()) return;
  resume();
  bgmGain.gain.cancelScheduledValues(ctx.currentTime);
  bgmGain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.2);
  if (bgmTimer) return;
  nextBarTime = ctx.currentTime + 0.1;
  bgmTimer = setInterval(() => {
    while (nextBarTime < ctx.currentTime + 1.0) {
      scheduleBar(nextBarTime);
      nextBarTime += BAR;
    }
  }, 300);
}

function stopBgm() {
  if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
  if (ctx && bgmGain) {
    bgmGain.gain.cancelScheduledValues(ctx.currentTime);
    bgmGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
  }
}

export function setSfxEnabled(v) { sfxOn = !!v; }
export function setBgmEnabled(v) {
  bgmOn = !!v;
  if (bgmOn) startBgm();
  else stopBgm();
}
export function isBgmOn() { return bgmOn; }
