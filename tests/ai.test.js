import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseBid, choosePlay, scoreMove, countHands } from '../web/js/engine/ai.js';
import { genType } from '../web/js/engine/cards.js';
import { mulberry32 } from './helpers/rng.js';

const id = (rank, suit = 0) => rank * 4 + suit;

// 构造 bid 阶段状态(dealer=0,轮到 seat)
function bidState({ bids = [null, null, null], bidTurn = 0, hands } = {}) {
  return {
    phase: 'bid',
    hands: hands || [[], [], []],
    bottom: [48, 49, 50], dealer: 0, bidTurn, bids,
    landlord: null, baseScore: 0, multiplier: 1,
    turn: bidTurn, lastPlay: null, passCount: 0, playCounts: [0, 0, 0], history: [],
  };
}

// 构造 play 阶段状态
function playState(overrides = {}) {
  return {
    phase: 'play',
    hands: [[0, 1, 2, 3, 4, 5], [16, 17, 18, 19, 20, 21], [32, 33, 34, 35, 36, 37]],
    bottom: [48, 49, 50], dealer: 0, bidTurn: 0,
    bids: [1, 2, 0], landlord: 1, baseScore: 2, multiplier: 1,
    turn: 1, lastPlay: null, passCount: 0, playCounts: [0, 0, 0], history: [],
    ...overrides,
  };
}

test('countHands:直线/炸弹算一手,散牌逐个算', () => {
  assert.equal(countHands([0, 4, 8, 12, 16]), 1); // 34567 顺子
  assert.equal(countHands([0, 1, 2, 3]), 1); // 炸弹
  assert.equal(countHands([52, 53]), 1); // 火箭
  assert.equal(countHands([0, 4, 8, 12]), 4); // 散单
  assert.equal(countHands([0, 1, 4, 5, 8]), 3); // 对3 + 单5 + 单6? → 对+单+单 = 3
});

test('chooseBid:强牌(火箭+双王+炸弹+2)叫 3,弱牌不叫', () => {
  const strong = [52, 53, 48, 49, 50, 51, 8, 9, 10, 11, 12, 13, 20, 21, 28, 29, 36];
  const s = bidState({ hands: [strong, [], []] });
  assert.equal(chooseBid(s, s.bidTurn, { level: 'normal', rng: mulberry32(1) }), 3);
  const weak = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14, 16, 17, 18, 20, 21]; // 3-8 无大牌
  const s2 = bidState({ hands: [weak, [], []] });
  assert.equal(chooseBid(s2, s2.bidTurn, { level: 'normal', rng: mulberry32(1) }), 0);
});

test('chooseBid:服从 legalBids,叫不过当前最高就 pass', () => {
  const mid = [48, 49, 8, 9, 10, 11, 12, 13, 20, 21, 28, 29, 36, 37, 0, 1, 2]; // 双2 → 强度 20+... ≥30 → tier1
  const s = bidState({ bids: [2, null, null], bidTurn: 1, hands: [[], mid, []] });
  assert.equal(chooseBid(s, 1, { level: 'normal', rng: mulberry32(1) }), 0); // tier1 < 当前2 → pass
  const strong = [52, 53, 48, 49, 50, 51, 8, 9, 10, 11, 12, 13, 20, 21, 28, 29, 36];
  const s2 = bidState({ bids: [2, null, null], bidTurn: 1, hands: [[], strong, []] });
  assert.equal(chooseBid(s2, 1, { level: 'normal', rng: mulberry32(1) }), 3);
});

test('choosePlay:唯一解必返回', () => {
  const s = playState({
    hands: [[0, 1, 2, 3, 4, 5], [20, 21, 22, 23, 28], [32, 33, 34, 35, 36, 37]],
    lastPlay: { seat: 0, cards: [12, 13], combo: genType([12, 13]) }, // 对6
    turn: 1,
  });
  const move = choosePlay(s, 1, { level: 'normal', rng: mulberry32(1) });
  assert.deepEqual(move, [20, 21]); // 88 压对6,不拆炸弹
});

test('choosePlay:不拆火箭压小单', () => {
  const s = playState({
    hands: [[0, 1, 2, 3, 4, 5], [52, 53, 16, 17, 18, 20], [32, 33, 34, 35, 36, 37]],
    lastPlay: { seat: 0, cards: [0], combo: genType([0]) }, // 单3
    turn: 1,
  });
  const move = choosePlay(s, 1, { level: 'normal', rng: mulberry32(1) });
  assert.notDeepEqual(move, [52, 53]);
  assert.notDeepEqual(move, []); // 有牌可压就压
});

test('choosePlay:农民不压队友(除非能出完)', () => {
  const s = playState({
    hands: [[0, 1, 2, 3, 4, 5], [16, 17, 18, 19, 20, 21], [24, 25, 32, 33]],
    landlord: 0, // 座位1、2 是农民(队友)
    lastPlay: { seat: 1, cards: [16, 17], combo: genType([16, 17]) }, // 队友出对7
    turn: 2,
  });
  const move = choosePlay(s, 2, { level: 'normal', rng: mulberry32(1) });
  assert.deepEqual(move, []); // 让队友走
  // 能出完则必须出
  const s2 = playState({
    hands: [[0, 1, 2, 3, 4, 5], [16, 17, 18, 19, 20, 21], [24, 25]],
    landlord: 0,
    lastPlay: { seat: 1, cards: [16, 17], combo: genType([16, 17]) },
    turn: 2,
  });
  assert.deepEqual(choosePlay(s2, 2, { level: 'normal', rng: mulberry32(1) }), [24, 25]);
});

test('choosePlay:normal 确定可复现', () => {
  const s = playState();
  const a = choosePlay(s, 1, { level: 'normal', rng: mulberry32(1) });
  const b = choosePlay(s, 1, { level: 'normal', rng: mulberry32(1) });
  assert.deepEqual(a, b);
});

test('choosePlay:easy 同局面多 rng 产出 ≥2 种走法(前 3 随机)', () => {
  const s = playState({ lastPlay: null, turn: 1 }); // 自由出牌
  const outcomes = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    outcomes.add(choosePlay(s, 1, { level: 'easy', rng: mulberry32(seed) }).join(','));
  }
  assert.ok(outcomes.size >= 2, `easy 应有随机性,实际只有 ${outcomes.size} 种`);
});

test('choosePlay:无解返回空数组(pass)', () => {
  const s = playState({
    hands: [[0, 1, 2, 3, 4, 5], [0, 1, 2], [16, 17, 18, 19, 20, 21]],
    lastPlay: { seat: 0, cards: [48, 49], combo: genType([48, 49]) }, // 对2
    turn: 1,
  });
  assert.deepEqual(choosePlay(s, 1, { level: 'normal', rng: mulberry32(1) }), []);
});

test('反作弊:篡改对手手牌(数量不变)决策不变', () => {
  const mk = (hands) => playState({
    hands,
    lastPlay: null, turn: 1,
  });
  const base = [[0, 1, 2, 3, 4, 5], [16, 17, 18, 19, 20, 21, 24, 25], [32, 33, 34, 35, 36, 37]];
  // 篡改:座位0、2 的牌换成数量相同的其他牌
  const tampered = [[40, 41, 42, 43, 44, 45], [16, 17, 18, 19, 20, 21, 24, 25], [4, 5, 6, 7, 8, 9]];
  for (const level of ['easy', 'normal']) {
    const a = choosePlay(mk(base), 1, { level, rng: mulberry32(9) });
    const b = choosePlay(mk(tampered), 1, { level, rng: mulberry32(9) });
    assert.deepEqual(a, b, `level=${level} 决策不得依赖对手手牌`);
  }
});

test('scoreMove:出完牌得分远高于普通压牌', () => {
  const s = playState({
    hands: [[0, 1, 2, 3, 4, 5], [16, 17, 18, 19, 20, 21], [32, 33, 34, 35, 36, 37]],
    lastPlay: { seat: 0, cards: [12, 13], combo: genType([12, 13]) }, turn: 1,
  });
  const finish = scoreMove(s, 1, [18, 19], { level: 'normal' }); // 打完 88? 不,手还有 → 普通
  const s2 = playState({
    hands: [[0, 1, 2, 3, 4, 5], [16, 17], [32, 33, 34, 35, 36, 37]],
    lastPlay: { seat: 0, cards: [12, 13], combo: genType([12, 13]) }, turn: 1,
  });
  const winNow = scoreMove(s2, 1, [16, 17], { level: 'normal' });
  assert.ok(winNow > finish + 500, `出完应高分局: ${winNow} vs ${finish}`);
});
