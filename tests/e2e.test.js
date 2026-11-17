import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playFullGame } from './helpers/play-full-game.js';

for (const level of ['easy', 'normal']) {
  test(`AI vs AI ${level}:50 种子整局合法终止、结算和为 0、可复现`, async () => {
    for (let seed = 1; seed <= 50; seed++) {
      const a = await playFullGame({ level, seed });
      assert.equal(a.state.phase, 'settle', `seed=${seed} 未终止`);
      assert.ok(a.steps.length < 500, `seed=${seed} 步数超限 ${a.steps.length}`);
      const sum = a.settle.deltas[0] + a.settle.deltas[1] + a.settle.deltas[2];
      assert.equal(sum, 0, `seed=${seed} 结算和不为 0`);
      assert.ok(a.settle.baseScore >= 1, `seed=${seed} 底分异常`);
      // 可复现
      const b = await playFullGame({ level, seed });
      assert.deepEqual(b.settle, a.settle, `seed=${seed} 不可复现`);
      assert.deepEqual(b.steps, a.steps, `seed=${seed} 步骤不可复现`);
    }
  });
}

test('AI vs AI:hard 无 session 时标注 degraded 并按 normal 进行', async () => {
  const r = await playFullGame({ level: 'hard', seed: 1 });
  assert.equal(r.degraded, true);
  assert.equal(r.state.phase, 'settle');
});
