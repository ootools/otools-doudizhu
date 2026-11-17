// DouZero 推理 Worker(vendored 文件形态;blob 形态由 douzero.js 内联同款逻辑)
import * as ort from '../../vendor/ort/ort.wasm.min.mjs';

const dims = { landlord: 373, landlord_up: 484, landlord_down: 484 };
const sessions = {};

self.onmessage = async (ev) => {
  const msg = ev.data;
  try {
    if (msg.type === 'init') {
      for (const pos of Object.keys(msg.models)) {
        sessions[pos] = await ort.InferenceSession.create(msg.models[pos], { executionProviders: ['wasm'] });
      }
      self.postMessage({ type: 'ready' });
    } else if (msg.type === 'pick') {
      const t0 = performance.now();
      const zT = new ort.Tensor('float32', msg.z, [msg.count, 5, 162]);
      const xT = new ort.Tensor('float32', msg.x, [msg.count, dims[msg.position]]);
      const out = await sessions[msg.position].run({ z: zT, x: xT });
      const q = out.q.data;
      self.postMessage({ type: 'q', q: Array.from(q), seq: msg.seq, ms: performance.now() - t0 });
    }
  } catch (e) {
    self.postMessage({ type: 'error', message: String(e && e.message || e), seq: msg && msg.seq });
  }
};
