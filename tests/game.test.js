import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, legalBids, bid, legalMoves, play, settle, serialize, restore } from '../web/js/engine/game.js';
import { genType } from '../web/js/engine/cards.js';
import { mulberry32 } from './helpers/rng.js';

const id = (rank, suit = 0) => rank * 4 + suit;

// 直接构造一个 play 阶段的合法状态(地主=1,轮到 1)
function playState(overrides = {}) {
  return {
    phase: 'play',
    hands: [
      [0, 1, 2, 3, 4, 5],        // 座位0:333 44
      [16, 17, 18, 19, 20, 21],  // 座位1(地主):777 888
      [32, 33, 34, 35, 36, 37],  // 座位2:JJJ QQ
    ],
    bottom: [48, 49, 50], dealer: 0, bidTurn: 0,
    bids: [1, 2, 0], landlord: 1, baseScore: 2, multiplier: 1,
    turn: 1, lastPlay: null, passCount: 0, playCounts: [0, 0, 0], history: [],
    ...overrides,
  };
}

test('newGame:发牌 17×3+底牌 3,总 54 张不重不漏,种子可复现', () => {
  const a = newGame({ rng: mulberry32(42) });
  const b = newGame({ rng: mulberry32(42) });
  assert.equal(a.phase, 'bid');
  assert.equal(a.hands[0].length, 17);
  assert.equal(a.hands[1].length, 17);
  assert.equal(a.hands[2].length, 17);
  assert.equal(a.bottom.length, 3);
  const all = [...a.hands[0], ...a.hands[1], ...a.hands[2], ...a.bottom];
  assert.equal(new Set(all).size, 54);
  assert.deepEqual(a.hands, b.hands);
  assert.deepEqual(a.bottom, b.bottom);
  assert.equal(a.dealer, b.dealer);
  assert.equal(a.bidTurn, a.dealer);
});

test('bid:叫 3 立即定地主,底牌翻开并入其手牌,turn 跳到地主', () => {
  const s = newGame({ rng: mulberry32(7) });
  const seat = s.bidTurn;
  const t = bid(s, seat, 3);
  assert.equal(t.phase, 'play');
  assert.equal(t.landlord, seat);
  assert.equal(t.baseScore, 3);
  assert.equal(t.bidTurn, null, '叫分结束后 bidTurn 必须清空(UI active 高亮按 turn 判断)');
  assert.equal(t.hands[seat].length, 20);
  assert.equal(t.bottom.length, 3); // 底牌保留公示
  assert.equal(t.turn, seat);
  assert.equal(t.lastPlay, null);
  // 底牌确实并入:手牌 ∪ 其余两手 = 全部
  const others = (seat + 1) % 3, other2 = (seat + 2) % 3;
  assert.equal(t.hands[seat].length + t.hands[others].length + t.hands[other2].length, 54);
});

test('bid:非当前叫分座位或低于当前最高叫 → 抛错', () => {
  const s = newGame({ rng: mulberry32(7) });
  const first = s.bidTurn;
  assert.throws(() => bid(s, (first + 1) % 3, 1));
  const t = bid(s, first, 2);
  assert.throws(() => bid(t, first, 1)); // 已叫过
  assert.throws(() => bid(t, (first + 1) % 3, 1)); // 低于当前最高 2
});

test('bid:依次叫分,全部叫完取最高者为地主', () => {
  const s = newGame({ rng: mulberry32(11) });
  const d = s.bidTurn;
  const t1 = bid(s, d, 1);
  const t2 = bid(t1, (d + 1) % 3, 2);
  const t3 = bid(t2, (d + 2) % 3, 0);
  assert.equal(t3.phase, 'play');
  assert.equal(t3.landlord, (d + 1) % 3);
  assert.equal(t3.baseScore, 2);
});

test('bid:全不叫自动重发,dealer 顺延', () => {
  const s = newGame({ rng: mulberry32(13) });
  const d = s.dealer;
  const t1 = bid(s, s.bidTurn, 0);
  const t2 = bid(t1, t1.bidTurn, 0, { rng: mulberry32(101) });
  const t3 = bid(t2, t2.bidTurn, 0, { rng: mulberry32(102) });
  assert.equal(t3.phase, 'bid');
  assert.equal(t3.dealer, (d + 1) % 3);
  assert.equal(t3.bidTurn, t3.dealer);
  assert.deepEqual(t3.bids, [null, null, null]);
  assert.equal(t3.hands[0].length, 17);
  assert.notDeepEqual(t3.hands, s.hands);
});

test('legalBids:只能不叫或高于当前最高', () => {
  const s = newGame({ rng: mulberry32(7) });
  assert.deepEqual(legalBids(s, s.bidTurn), [0, 1, 2, 3]);
  const t = bid(s, s.bidTurn, 2);
  assert.deepEqual(legalBids(t, t.bidTurn), [0, 3]);
  assert.deepEqual(legalBids(t, (t.bidTurn + 1) % 3), []); // 非当前座位
});

test('legalMoves:bid 阶段为空;play 阶段自由出牌给全集', () => {
  const s = newGame({ rng: mulberry32(7) });
  assert.deepEqual(legalMoves(s, s.bidTurn), []);
  const p = playState();
  const moves = legalMoves(p, 1);
  assert.ok(moves.length > 0);
  assert.ok(moves.some((m) => m.length === 3)); // 777
});

test('play:非当前座位/非法组合抛错', () => {
  const p = playState();
  assert.throws(() => play(p, 0, [16, 17, 18]));
  assert.throws(() => play(p, 1, [0, 1, 2])); // 333 不在其手牌
  assert.throws(() => play(p, 1, 'xx'));
});

test('play:出牌计 history/playCounts,连续两家过 → lastPlay 清空回到赢家', () => {
  let s = playState();
  s = play(s, 1, [16, 17, 18]); // 地主出 777
  assert.equal(s.turn, 2);
  assert.equal(s.lastPlay.seat, 1);
  assert.equal(s.lastPlay.combo.type, 'trio');
  assert.equal(s.playCounts[1], 1);
  assert.equal(s.history.length, 1);
  s = play(s, 2, []); // 过
  assert.equal(s.passCount, 1);
  assert.equal(s.turn, 0);
  s = play(s, 0, []); // 过
  assert.equal(s.passCount, 0);
  assert.equal(s.lastPlay, null);
  assert.equal(s.turn, 1); // 回到赢家自由出牌
});

test('play:过仅在有 lastPlay 时合法,自由出牌不能过', () => {
  let s = playState({ turn: 1, lastPlay: null });
  assert.throws(() => play(s, 1, []));
  s = play(s, 1, [16, 17, 18]);
  assert.doesNotThrow(() => play(s, 2, []));
});

test('play:炸弹/火箭倍数 ×2', () => {
  let s = playState({
    hands: [[0, 1, 2, 3, 4, 5], [48, 49, 50, 51, 20, 21], [32, 33, 34, 35, 36, 37]],
  });
  s = play(s, 1, [48, 49, 50, 51]); // 2222 炸弹
  assert.equal(s.multiplier, 2);
  const s2 = playState({ hands: [[0, 1, 2, 3, 4, 5], [52, 53, 20, 21, 22, 23], [32, 33, 34, 35, 36, 37]] });
  const t2 = play(s2, 1, [52, 53]); // 火箭
  assert.equal(t2.multiplier, 2);
});

test('play:打完手牌进入 settle', () => {
  let s = playState({ hands: [[0, 1, 2, 3, 4, 5], [32], [16, 17, 18, 19, 20, 21]] });
  s = play(s, 1, [32]); // 地主打完
  assert.equal(s.phase, 'settle');
  assert.equal(s.hands[1].length, 0);
});

test('settle:地主胜 ±2 倍结算,deltas 和为 0', () => {
  const s = playState({ phase: 'settle', hands: [[0, 1, 2, 3], [], [16, 17]], landlord: 1, baseScore: 3, multiplier: 2, playCounts: [2, 4, 1] });
  const r = settle(s);
  assert.equal(r.winner, 'landlord');
  assert.equal(r.spring, false);
  assert.equal(r.antiSpring, false);
  assert.equal(r.multiplier, 2);
  assert.deepEqual(r.deltas, [-6, 12, -6]); // total = 3×2=6
  assert.equal(r.deltas[0] + r.deltas[1] + r.deltas[2], 0);
});

test('settle:春天(地主胜且两农民一张未出)倍数再 ×2', () => {
  const s = playState({ phase: 'settle', hands: [[], [], [16, 17]], landlord: 0, baseScore: 1, multiplier: 1, playCounts: [5, 0, 0] });
  const r = settle(s);
  assert.equal(r.winner, 'landlord');
  assert.equal(r.spring, true);
  assert.equal(r.multiplier, 2);
  assert.deepEqual(r.deltas, [4, -2, -2]); // total = 1×2=2
});

test('settle:反春(农民胜且地主仅出过首手)倍数 ×2', () => {
  const s = playState({ phase: 'settle', hands: [[16, 17], [0], []], landlord: 0, baseScore: 2, multiplier: 1, playCounts: [1, 3, 4] });
  const r = settle(s);
  assert.equal(r.winner, 'farmers');
  assert.equal(r.antiSpring, true);
  assert.equal(r.spring, false);
  assert.equal(r.multiplier, 2);
  assert.deepEqual(r.deltas, [-8, 4, 4]); // total = 2×2=4,地主 −2×total
});

test('serialize/restore 往返相等,恢复后可继续 play', () => {
  let s = playState();
  s = play(s, 1, [16, 17, 18]);
  const json = serialize(s);
  const t = restore(json);
  assert.deepEqual(t, s);
  const u = play(t, 2, []); // 恢复后可继续
  assert.equal(u.passCount, 1);
  assert.throws(() => restore('{bad json'));
});

test('restore 拒绝缺字段的伪造状态', () => {
  assert.throws(() => restore('{}'));
  assert.throws(() => restore(JSON.stringify({ phase: 'bid' })));
});
