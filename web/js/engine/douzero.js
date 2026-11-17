// DouZero 推理会话:onnxruntime-web(vendored)+ Web Worker 优先,三级降级
// (vendored worker 文件 → blob worker → 主线程),会话失败/单步 >800ms 抛 DouzeroUnavailable。
// node 侧(Task 17)复用 pickMoveCore,只需提供 infer({z, x, dim}) → Promise<q>。
import { buildBatch, Z_SHAPE, seatToPosition } from './douzero-encode.js';

export class DouzeroUnavailable extends Error {}

const STEP_TIMEOUT_MS = 800;
const POSITIONS = ['landlord', 'landlord_up', 'landlord_down'];

/**
 * 纯编排:对 batch 前向取 argmax。session 需提供 infer({z, x, dim}) → Promise<Float32Array>。
 * 供浏览器会话与 node 会话(Task 17)共用。
 */
export async function pickMoveCore(infer, state, seat, candidates) {
  const t0 = performance.now();
  if (!candidates || candidates.length === 0) throw new DouzeroUnavailable('无候选动作');
  const { z, x, dim, count } = buildBatch(state, seat, candidates);
  const position = seatToPosition(state, seat);
  // z 共享一份,展开为 [B, 5*162](行间相同)
  const zBatch = new Float32Array(count * z.length);
  for (let i = 0; i < count; i++) zBatch.set(z, i * z.length);
  const q = await infer({ z: zBatch, x, dim, count, position });
  let best = 0;
  for (let i = 1; i < count; i++) if (q[i] > q[best]) best = i;
  return {
    cards: candidates[best],
    q: q[best],
    elapsedMs: performance.now() - t0,
  };
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new DouzeroUnavailable(`${label} 超时 ${ms}ms`)), ms)),
  ]);
}

function absolute(url) {
  return new URL(url, import.meta.url).href;
}

// ---- Worker 协议 ----
// → {type:'init', models:{landlord,landlord_up,landlord_down}}   ← {type:'ready'}
// → {type:'pick', z, x, dim, position}                            ← {type:'q', q}

function spawnVendoredWorker() {
  const url = absolute('./douzero-worker.js');
  return new Worker(url, { type: 'module' });
}

function spawnBlobWorker(ortUrl, workerSrcUrl) {
  // blob worker 内:相对路径 import 解析不了,须完整 origin URL 动态 import(spike 踩坑实录);
  // 且 blob 内不可设 ort.env.wasm.wasmPaths(会静默卡死),ort 自行按脚本 URL 取 wasm。
  const src = `
    const ort = await import(${JSON.stringify(ortUrl)});
    const workerUrl = ${JSON.stringify(workerSrcUrl)};
    const code = await (await fetch(workerUrl)).text();
    // 以 data URL 方式加载共享的会话逻辑会破坏相对路径,这里直接内联最小实现:
    let sessions = {};
    const dims = { landlord: 373, landlord_up: 484, landlord_down: 484 };
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
          self.postMessage({ type: 'q', q: Array.from(q), ms: performance.now() - t0 });
        }
      } catch (e) {
        self.postMessage({ type: 'error', message: String(e && e.message || e) });
      }
    };
  `;
  const blob = new Blob([src], { type: 'text/javascript' });
  return new Worker(URL.createObjectURL(blob), { type: 'module' });
}

function wireWorker(worker, models) {
  return new Promise((resolveSession, rejectSession) => {
    const pending = new Map();
    worker.addEventListener('message', (ev) => {
      const msg = ev.data;
      if (msg.type === 'ready') {
        resolveSession({
          infer: ({ z, x, dim, count, position }) => new Promise((res, rej) => {
            const p = { res, rej };
            pending.set(pending.size, p);
            worker.postMessage({ type: 'pick', z, x, dim, count, position, seq: pending.size - 1 });
          }),
          dispose: () => worker.terminate(),
        });
      } else if (msg.type === 'q') {
        const p = pending.get(msg.seq);
        pending.delete(msg.seq);
        p && p.res(msg.q);
      } else if (msg.type === 'error') {
        const p = pending.get(msg.seq);
        if (p) { pending.delete(msg.seq); p.rej(new DouzeroUnavailable(msg.message)); }
        else rejectSession(new DouzeroUnavailable(msg.message));
      }
    });
    worker.addEventListener('error', (ev) => rejectSession(new DouzeroUnavailable('worker 错误: ' + ev.message)));
    worker.postMessage({ type: 'init', models });
  });
}

function mainThreadSession(models) {
  let sessions = null;
  const dims = { landlord: 373, landlord_up: 484, landlord_down: 484 };
  return {
    ready: (async () => {
      const ort = await import(absolute('../../vendor/ort/ort.wasm.min.mjs'));
      ort.env.wasm.wasmPaths = absolute('../../vendor/ort/');
      sessions = {};
      for (const pos of POSITIONS) {
        sessions[pos] = await ort.InferenceSession.create(models[pos], { executionProviders: ['wasm'] });
      }
      return {
        infer: async ({ z, x, dim, count, position }) => {
          const zT = new ort.Tensor('float32', z, [count, 5, 162]);
          const xT = new ort.Tensor('float32', x, [count, dims[position]]);
          const out = await sessions[position].run({ z: zT, x: xT });
          return out.q.data;
        },
        dispose: () => { sessions = null; },
      };
    })(),
  };
}

/**
 * 创建浏览器会话。降级顺序:vendored worker → blob worker → 主线程;
 * URL 带 ?noworker=1 或 nomodel=1 时直接主线程/直接不可用(测试钩子)。
 * 返回 { ready: Promise<{infer, dispose}>, pickMove, dispose }。
 */
export function createSession({ models = { landlord: '../../model/landlord.onnx', landlord_up: '../../model/landlord_up.onnx', landlord_down: '../../model/landlord_down.onnx' }, useWorker = true } = {}) {
  const params = new URLSearchParams(location.search);
  const absModels = {};
  for (const pos of POSITIONS) absModels[pos] = absolute(models[pos]);

  let disposeFn = () => {};
  const ready = (async () => {
    if (params.has('nomodel')) throw new DouzeroUnavailable('nomodel=1(测试钩子)');
    if (useWorker && !params.has('noworker')) {
      for (const spawn of [spawnVendoredWorker, () => spawnBlobWorker(absolute('../../vendor/ort/ort.wasm.min.mjs'), absolute('./douzero-worker.js'))]) {
        try {
          let worker;
          const wired = wireWorker((worker = spawn()), absModels).then((s) => { disposeFn = () => worker.terminate(); return s; });
          const s = await withTimeout(wired, 15000, 'worker 初始化');
          return s;
        } catch (e) { /* 下一种形态 */ }
      }
    }
    const s = await withTimeout(mainThreadSession(absModels).ready, 20000, '主线程会话初始化');
    disposeFn = s.dispose;
    return s;
  })();

  const inferWithTimeout = async ({ z, x, dim, count, position }) => {
    const s = await ready;
    return withTimeout(s.infer({ z, x, dim, count, position }), STEP_TIMEOUT_MS, '推理');
  };

  return {
    ready,
    infer: inferWithTimeout,
    pickMove: (state, seat, candidates) =>
      pickMoveCore(inferWithTimeout, state, seat, candidates),
    dispose: () => disposeFn(),
  };
}
