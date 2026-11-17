// 对拍测试(Task 14):JS 编码/枚举 vs DouZero 官方 Python 实现
// fixtures 由 tools/gen_fixtures.py 生成(官方 get_obs 为基准,x/z 以非零下标压缩存储)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBatch, X_DIMS, Z_SHAPE, seatToPosition } from '../web/js/engine/douzero-encode.js';
import { genMoves, genType } from '../web/js/engine/cards.js';

const load = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

const encodeFx = load('encode-fixtures.json');
const movesFx = load('moves-fixtures.json');

// rank 计数签名:双王 rank=13/14;忽略花色(官方动作是 rank 多重集)
const sig = (cards) =>
  cards.map((id) => (id >= 52 ? 13 + (id - 52) : Math.floor(id / 4))).sort((a, b) => a - b).join(',');

function mkState(c) {
  const hands = [[], [], []];
  for (const [pos, seat] of Object.entries(c.seatOf)) {
    hands[seat] = c.handsOur[pos];
  }
  return {
    phase: 'play',
    hands,
    bottom: c.bottomOurs,
    dealer: 0, bidTurn: 0,
    bids: [null, null, null],
    landlord: c.landlordSeat,
    baseScore: 1, multiplier: 1,
    turn: c.seat, lastPlay: null, passCount: 0, playCounts: [0, 0, 0],
    history: c.historyOurs.map((h) => ({ seat: h.seat, cards: h.cards })),
  };
}

test(`编码对拍:官方 get_obs x/z 逐位一致(${encodeFx.length} cases)`, () => {
  assert.ok(encodeFx.length >= 20, 'fixtures 太少');
  for (const c of encodeFx) {
    const state = mkState(c);
    assert.equal(seatToPosition(state, c.seat), c.position, `席位映射错误 case@${c.seat}`);
    const { z, x, dim, count } = buildBatch(state, c.seat, c.actionsOur);
    assert.equal(dim, X_DIMS[c.position]);
    assert.equal(count, c.actionsOur.length);
    // z:非零下标集合一致(固定 5×162)
    const ourZ = [];
    for (let i = 0; i < Z_SHAPE[0] * Z_SHAPE[1]; i++) if (z[i] !== 0) ourZ.push(i);
    assert.deepEqual(ourZ, c.zNonzero, `z 不一致 position=${c.position} seat=${c.seat}`);
    // x:前 min(rows, cap) 行非零下标一致
    const rows = Math.min(count, c.xNonzero.length);
    for (let r = 0; r < rows; r++) {
      const ourRow = [];
      for (let i = 0; i < dim; i++) if (x[r * dim + i] !== 0) ourRow.push(i);
      assert.deepEqual(ourRow, c.xNonzero[r], `x 行${r} 不一致 position=${c.position} action=${JSON.stringify(c.actionsOur[r])}`);
    }
  }
});

test(`枚举对拍:genMoves 与官方 move_generator 集合一致(${movesFx.length} cases)`, () => {
  assert.ok(movesFx.length >= 20, 'fixtures 太少');
  for (const c of movesFx) {
    const lastPlay = c.lastOur && c.lastOur.length > 0 ? genType(c.lastOur) : null;
    const ours = genMoves(c.handOur, lastPlay);
    // 官方 legal_actions 含 pass([])——由 UI/控制器单独处理,不进 genMoves 比较
    const ourSigs = new Set(ours.map(sig));
    const expectedSigs = new Set(c.expectedMoves.filter((m) => m.length > 0).map(sig));
    for (const s of expectedSigs) {
      assert.ok(ourSigs.has(s), `漏枚举 ${s}(hand=${JSON.stringify(c.handOur)} last=${JSON.stringify(c.lastOur)})`);
    }
    for (const s of ourSigs) {
      assert.ok(expectedSigs.has(s), `多枚举 ${s}(hand=${JSON.stringify(c.handOur)} last=${JSON.stringify(c.lastOur)})`);
    }
  }
});
