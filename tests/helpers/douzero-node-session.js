// node 侧 DouZero 会话(onnxruntime-node):与浏览器 Session 同接口,
// 供 hard 档整局回放与 Q 值对拍(Task 17)。仅测试使用,不随包分发。
import ort from 'onnxruntime-node';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pickMoveCore } from '../../web/js/engine/douzero.js';

const MODEL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/model');
const dims = { landlord: 373, landlord_up: 484, landlord_down: 484 };
const POSITIONS = ['landlord', 'landlord_up', 'landlord_down'];

export async function createNodeSession() {
  const sessions = {};
  for (const pos of POSITIONS) {
    sessions[pos] = await ort.InferenceSession.create(path.join(MODEL_DIR, `${pos}.onnx`));
  }
  const infer = async ({ z, x, dim, count, position }) => {
    const zT = new ort.Tensor('float32', Float32Array.from(z), [count, 5, 162]);
    const xT = new ort.Tensor('float32', Float32Array.from(x), [count, dims[position]]);
    const out = await sessions[position].run({ z: zT, x: xT });
    return out.q.data;
  };
  return {
    infer,
    pickMove: (state, seat, candidates) => pickMoveCore(infer, state, seat, candidates),
  };
}
