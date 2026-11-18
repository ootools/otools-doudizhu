import { test } from 'node:test';
import assert from 'node:assert/strict';

function installAudioContext() {
  const created = { intervals: new Map(), cleared: [], oscillators: [], gains: [], filters: [] };
  let nextInterval = 1;
  globalThis.window = {
    AudioContext: class {
      constructor() {
        this.currentTime = 10;
        this.sampleRate = 1000;
        this.state = 'running';
        this.destination = {};
      }
      createGain() {
        const node = {
          gain: {
            value: 1,
            calls: [],
            setValueAtTime(...args) { this.calls.push(['setValueAtTime', ...args]); },
            linearRampToValueAtTime(...args) { this.calls.push(['linearRampToValueAtTime', ...args]); },
            exponentialRampToValueAtTime(...args) { this.calls.push(['exponentialRampToValueAtTime', ...args]); },
            cancelScheduledValues(...args) { this.calls.push(['cancelScheduledValues', ...args]); },
          },
          connect() { return this; },
        };
        created.gains.push(node);
        return node;
      }
      createOscillator() {
        const node = {
          type: '', frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
          connect() { return this; }, start(time) { this.startedAt = time; }, stop(time) { this.stoppedAt = time; },
        };
        created.oscillators.push(node);
        return node;
      }
      createBiquadFilter() {
        const node = {
          type: '', frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, Q: { value: 0 },
          connect() { return this; },
        };
        created.filters.push(node);
        return node;
      }
      createBuffer(channels, length) {
        const data = new Float32Array(length);
        return { getChannelData() { return data; } };
      }
      createBufferSource() {
        return { buffer: null, connect() { return this; }, start() {}, stop() {} };
      }
      resume() { this.state = 'running'; return Promise.resolve(); }
    },
  };
  globalThis.setInterval = (fn, ms) => {
    const id = nextInterval++;
    created.intervals.set(id, { fn, ms });
    return id;
  };
  globalThis.clearInterval = (id) => {
    created.cleared.push(id);
    created.intervals.delete(id);
  };
  return created;
}

function freshAudioModule() {
  return import(`../web/js/audio.js?test=${Date.now()}-${Math.random()}`);
}

test('BGM repeated enable creates one scheduler and disable fades within one second', async () => {
  const audio = installAudioContext();
  const mod = await freshAudioModule();
  mod.setBgmEnabled(true);
  mod.setBgmEnabled(true);
  assert.equal(audio.intervals.size, 1, 'repeated enable must not duplicate the scheduler');
  const bgmBus = audio.gains[2];
  mod.setBgmEnabled(false);
  assert.equal(audio.intervals.size, 0, 'disable must stop future scheduling');
  assert.equal(audio.cleared.length, 1);
  const fade = bgmBus.gain.calls.find((c) => c[0] === 'linearRampToValueAtTime' && c[1] === 0);
  assert.ok(fade, 'disable must ramp BGM bus to silence');
  assert.ok(fade[2] <= 11, `fade target ${fade[2]} should be within one second of currentTime`);
});

test('BGM can restart after disable without multiplying scheduler speed', async () => {
  const audio = installAudioContext();
  const mod = await freshAudioModule();
  mod.setBgmEnabled(true);
  const [first] = audio.intervals.values();
  mod.setBgmEnabled(false);
  mod.setBgmEnabled(true);
  assert.equal(audio.intervals.size, 1);
  const [restarted] = audio.intervals.values();
  assert.equal(restarted.ms, first.ms);
});

test('SFX enable state stays independent of BGM toggle', async () => {
  const audio = installAudioContext();
  const mod = await freshAudioModule();
  mod.setSfxEnabled(false);
  mod.setBgmEnabled(true);
  const before = audio.oscillators.length + audio.filters.length;
  mod.sfx('bid');
  assert.equal(audio.oscillators.length + audio.filters.length, before, 'disabled SFX should stay silent while BGM is enabled');
  mod.setSfxEnabled(true);
  mod.sfx('bid');
  assert.ok(audio.oscillators.length > 0, 'enabling SFX should restore action sounds');
});

test('one BGM scheduler schedules notes at varied times within each bar', async () => {
  const audio = installAudioContext();
  const mod = await freshAudioModule();
  mod.setBgmEnabled(true);
  const [scheduler] = audio.intervals.values();
  scheduler.fn();
  const starts = [...new Set(audio.oscillators.map((o) => o.startedAt))].sort((a, b) => a - b);
  assert.ok(starts.length > 1, 'a plucked pattern should stagger notes rather than stack a sustained chord');
  assert.ok(starts.every((t) => t >= 10 && t < 13), 'first bar notes should be scheduled within the first bar window');
});
