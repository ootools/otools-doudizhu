import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickMoveCore, DouzeroUnavailable } from '../web/js/engine/douzero.js';
import { buildBatch } from '../web/js/engine/douzero-encode.js';
import { makeState } from './helpers/state.js';

test('pickMoveCore:按 mock q 选 argmax', async () => {
  const s = makeState({ landlord: 0, turn: 0 });
  const candidates = [[0], [4], [8]];
  const infer = async ({ count }) => {
    assert.equal(count, 3);
    return [0.5, 2.5, 1.0]; // 第二个候选最优
  };
  const r = await pickMoveCore(infer, s, 0, candidates);
  assert.deepEqual(r.cards, [4]);
  assert.equal(r.q, 2.5);
  assert.ok(r.elapsedMs >= 0);
});

test('pickMoveCore:空候选抛 DouzeroUnavailable', async () => {
  const s = makeState({ landlord: 0, turn: 0 });
  await assert.rejects(() => pickMoveCore(async () => [0], s, 0, []), DouzeroUnavailable);
});

test('pickMoveCore:infer 抛错原样穿透(由调用方降级)', async () => {
  const s = makeState({ landlord: 0, turn: 0 });
  const infer = async () => { throw new DouzeroUnavailable('boom'); };
  await assert.rejects(() => pickMoveCore(infer, s, 0, [[0]]), DouzeroUnavailable);
});

test('pickMoveCore 与 buildBatch 契约:z 展开行数 = 候选数', async () => {
  const s = makeState({ landlord: 0, turn: 0 });
  const candidates = [[0], [0, 1], [4, 5, 6]];
  let seen;
  const infer = async ({ z, count }) => {
    seen = { z, count };
    return new Array(count).fill(0);
  };
  await pickMoveCore(infer, s, 0, candidates);
  assert.equal(seen.count, 3);
  assert.equal(seen.z.length, 3 * 810);
  // 三行的 z 相同(共享序列复制)
  for (let i = 0; i < 810; i++) {
    assert.equal(seen.z[i], seen.z[810 + i]);
    assert.equal(seen.z[i], seen.z[2 * 810 + i]);
  }
});
