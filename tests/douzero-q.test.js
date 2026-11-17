// Task 17:Q 值真推理对拍(onnxruntime-node vs 官方 torch 参考值,容差 ≤1e-3)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNodeSession } from './helpers/douzero-node-session.js';

const dims = { landlord: 373, landlord_up: 484, landlord_down: 484 };

test('Q 对拍:onnx 真推理 vs 官方 torch 参考(容差 ≤1e-3)', async () => {
  const session = await createNodeSession();
  const fx = JSON.parse(readFileSync(new URL('./fixtures/q-fixtures.json', import.meta.url), 'utf8'));
  assert.ok(fx.length >= 20, 'q fixtures 太少');
  let worst = 0;
  let worstAt = '';
  for (const c of fx) {
    const dim = dims[c.position];
    const B = c.xNonzero.length;
    const x = new Float32Array(B * dim);
    c.xNonzero.forEach((nz, i) => { for (const k of nz) x[i * dim + k] = 1; });
    const z = new Float32Array(B * 810);
    c.xNonzero.forEach((_, i) => { for (const k of c.zNonzero) z[i * 810 + k] = 1; });
    const q = await session.infer({ z, x, dim, count: B, position: c.position });
    for (let i = 0; i < c.q.length; i++) {
      const d = Math.abs(q[i] - c.q[i]);
      if (d > worst) { worst = d; worstAt = `${c.position}#${i}`; }
    }
  }
  assert.ok(worst <= 1e-3, `Q 对拍超差 max|Δq|=${worst} @${worstAt}`);
});
