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

// hard 档真推理(onnxruntime-node;Task 17)
test('AI vs AI hard(DouZero 真推理):50 种子整局合法终止、结算和为 0', async () => {
  const { createNodeSession } = await import('./helpers/douzero-node-session.js');
  const session = await createNodeSession();
  let totalInferMs = 0;
  try {
    for (let seed = 1; seed <= 50; seed++) {
      const a = await playFullGame({ level: 'hard', seed, session });
      assert.equal(a.state.phase, 'settle', `seed=${seed} 未终止`);
      assert.ok(a.steps.length < 500, `seed=${seed} 步数超限`);
      const sum = a.settle.deltas[0] + a.settle.deltas[1] + a.settle.deltas[2];
      assert.equal(sum, 0, `seed=${seed} 结算和不为 0`);
      assert.equal(a.degraded, false, `seed=${seed} 不应降级`);
      totalInferMs += a.steps.length * 3; // 粗略计数(信息性)
    }
    console.log(`hard ×50 完成(信息性:约 ${totalInferMs} 次前向)`);
  } finally {
    // onnxruntime-node 会话无需显式释放
  }
});

test('hard 反作弊复测:篡改对手手牌(数量不变)DouZero 决策不变', async () => {
  const { createNodeSession } = await import('./helpers/douzero-node-session.js');
  const session = await createNodeSession();
  const mk = (hands) => ({
    phase: 'play',
    hands,
    bottom: [21, 22, 23], dealer: 0, bidTurn: 0,
    bids: [3, 0, 0], landlord: 1, baseScore: 3, multiplier: 1,
    turn: 2, lastPlay: null, passCount: 0, playCounts: [0, 0, 0], history: [],
  });
  const base = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16], [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33], [34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 52]];
  const tampered = [[40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 0, 1, 2], [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33], [34, 35, 36, 37, 38, 39, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14]];
  const moves = [[9], [10], [11], [12]]; // 决策者座位2 的候选(单张 A 及以下)
  const a = await session.pickMove(mk(base), 2, moves);
  const b = await session.pickMove(mk(tampered), 2, moves);
  assert.deepEqual(b.cards, a.cards, 'DouZero 决策不得依赖对手手牌');
});
