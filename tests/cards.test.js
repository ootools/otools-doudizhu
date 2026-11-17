import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RANK_NAMES, newDeck, shuffle, rankOf, genType, canBeat } from '../web/js/engine/cards.js';

const id = (rank, suit = 0) => rank * 4 + suit; // rank 0..12;52 小王 53 大王
const shape = (c) => c && { type: c.type, rank: c.rank, len: c.len ?? null };

test('牌表:newDeck 54 张、rankOf 映射 DouZero 约定', () => {
  const deck = newDeck();
  assert.equal(deck.length, 54);
  assert.deepEqual([...deck.keys()], deck);
  assert.equal(RANK_NAMES.length, 15);
  assert.equal(RANK_NAMES[rankOf(0)], '3');
  assert.equal(RANK_NAMES[rankOf(20)], '8');
  assert.equal(RANK_NAMES[rankOf(48)], '2');
  assert.equal(RANK_NAMES[rankOf(52)], '小王');
  assert.equal(RANK_NAMES[rankOf(53)], '大王');
});

test('shuffle:集合不变,同 rng 可复现', () => {
  const deck = newDeck();
  const mk = (seed) => () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const a = shuffle([...deck], mk(42));
  const b = shuffle([...deck], mk(42));
  assert.deepEqual([...a].sort((x, y) => x - y), deck);
  assert.deepEqual(a, b);
  const c = shuffle([...deck], mk(7));
  assert.notDeepEqual(a, c);
});

test('基本型:single/pair/trio/trio_single/trio_pair', () => {
  assert.deepEqual(shape(genType([id(0)])), { type: 'single', rank: 0, len: null });
  assert.deepEqual(shape(genType([id(5), id(5, 1)])), { type: 'pair', rank: 5, len: null });
  assert.deepEqual(shape(genType([id(5), id(5, 1), id(5, 2)])), { type: 'trio', rank: 5, len: null });
  assert.deepEqual(shape(genType([id(0), id(0, 1), id(0, 2), id(3)])), { type: 'trio_single', rank: 0, len: null });
  assert.deepEqual(shape(genType([id(4), id(4, 1), id(4, 2), id(7), id(7, 1)])), { type: 'trio_pair', rank: 4, len: null });
  // 3333 优先判炸弹,不是 trio_single
  assert.equal(genType([id(0), id(0, 1), id(0, 2), id(0, 3)]).type, 'bomb');
});

test('炸弹与火箭', () => {
  assert.deepEqual(shape(genType([id(9), id(9, 1), id(9, 2), id(9, 3)])), { type: 'bomb', rank: 9, len: null });
  assert.deepEqual(shape(genType([52, 53])), { type: 'rocket', rank: 13, len: null });
  assert.equal(genType([52, 53]).rocket, undefined); // 类型就是 rocket
});

test('顺子:≥5 连张,不能含 2 和王', () => {
  assert.deepEqual(shape(genType([id(0), id(1), id(2), id(3), id(4)])), { type: 'straight', rank: 0, len: 5 });
  assert.deepEqual(shape(genType([id(8), id(9), id(10), id(11)])) , null); // 4 张不算顺子
  assert.equal(genType([id(9), id(10), id(11), id(12), id(13)]), null); // JKQ?→ ranks 9..12 含 2 → null
  assert.equal(genType([id(10), id(11), id(12), 52, 53]), null); // 含王
  assert.deepEqual(shape(genType([id(7), id(8), id(9), id(10), id(11)])), { type: 'straight', rank: 7, len: 5 }); // 10JQKA
});

test('连对:≥3 连对,不能含 2 和王', () => {
  assert.deepEqual(shape(genType([id(3), id(3, 1), id(4), id(4, 1), id(5), id(5, 1)])), { type: 'pair_straight', rank: 3, len: 3 });
  assert.equal(genType([id(2), id(2, 1), id(3), id(3, 1)]), null); // 两连对不行
  assert.equal(genType([id(10), id(10, 1), id(11), id(11, 1), id(12), id(12, 1)]), null); // 含 2
});

test('飞机:不带翼/带单/带对,2 与王不进主链', () => {
  assert.deepEqual(shape(genType([id(0), id(0, 1), id(0, 2), id(1), id(1, 1), id(1, 2)])), { type: 'plane', rank: 0, len: 2 });
  assert.deepEqual(shape(genType([id(0), id(0, 1), id(0, 2), id(1), id(1, 1), id(1, 2), id(5), id(6)])), { type: 'plane_single', rank: 0, len: 2 });
  assert.deepEqual(shape(genType([id(0), id(0, 1), id(0, 2), id(1), id(1, 1), id(1, 2), id(5), id(5, 1), id(6), id(6, 1)])), { type: 'plane_pair', rank: 0, len: 2 });
  // 最长链:333444555666 → 飞机 len4,不拆成两组
  assert.deepEqual(shape(genType([id(0), id(0, 1), id(0, 2), id(1), id(1, 1), id(1, 2), id(2), id(2, 1), id(2, 2), id(3), id(3, 1), id(3, 2)])), { type: 'plane', rank: 0, len: 4 });
  // 2 不能进飞机主链:222333 只有 222 三张 + 333 → 非飞机(主链含 rank12)
  assert.equal(genType([id(10), id(10, 1), id(10, 2), id(11), id(11, 1), id(11, 2), id(12), id(12, 1), id(12, 2)]), null);
  // 主链 A 封顶:AAA222 → null(222 非法主链,AAA+k?2 张不够带对)
});

test('四带二:带两单/带两对,翅膀不含炸弹与火箭', () => {
  assert.deepEqual(shape(genType([id(0), id(0, 1), id(0, 2), id(0, 3), id(4), id(5)])), { type: 'four_two_single', rank: 0, len: null });
  assert.deepEqual(shape(genType([id(0), id(0, 1), id(0, 2), id(0, 3), id(4), id(4, 1)])), { type: 'four_two_single', rank: 0, len: null });
  assert.deepEqual(shape(genType([id(0), id(0, 1), id(0, 2), id(0, 3), id(4), id(4, 1), id(5), id(5, 1)])), { type: 'four_two_pair', rank: 0, len: null });
  // 翅膀 = 双王:官方 type_13 实测合法([0,0,0,0,20,30])
  assert.deepEqual(shape(genType([id(0), id(0, 1), id(0, 2), id(0, 3), 52, 53])), { type: 'four_two_single', rank: 0, len: null });
  // 翅膀 = 炸弹(4444 作两对):官方 generator 不产出(需两个不同 rank)→ 非法
  assert.equal(genType([id(0), id(0, 1), id(0, 2), id(0, 3), id(4), id(4, 1), id(4, 2), id(4, 3)]), null);
});

test('非法组合返回 null,重复牌与越界牌拒收', () => {
  assert.equal(genType([id(0), id(1), id(2), id(3)]), null); // 3456 四张
  assert.equal(genType([id(11), id(11, 1), id(12), id(12, 1)]), null); // 22KK 非连对
  assert.equal(genType([0, 0]), null); // 同一张牌出现两次
  assert.equal(genType([]), null);
  assert.equal(genType([54, 0]), null); // 越界
});

test('canBeat:同型同长比大小,炸弹/火箭越级', () => {
  const single3 = genType([id(0)]);
  const single5 = genType([id(2)]);
  const pair3 = genType([id(0), id(0, 1)]);
  const bomb3 = genType([id(0), id(0, 1), id(0, 2), id(0, 3)]);
  const bombK = genType([id(9), id(9, 1), id(9, 2), id(9, 3)]);
  const rocket = genType([52, 53]);
  assert.equal(canBeat(single5, single3), true);
  assert.equal(canBeat(single3, single5), false);
  assert.equal(canBeat(pair3, single3), false); // 跨型不可压
  assert.equal(canBeat(bomb3, single5), true);
  assert.equal(canBeat(bombK, bomb3), true);
  assert.equal(canBeat(bomb3, bombK), false);
  assert.equal(canBeat(rocket, bombK), true);
  assert.equal(canBeat(bombK, rocket), false);
  assert.equal(canBeat(single3, rocket), false);
  // 同型不同长(顺子 5 连压不了 6 连)
  const s5 = genType([id(0), id(1), id(2), id(3), id(4)]);
  const s6 = genType([id(0), id(1), id(2), id(3), id(4), id(5)]);
  assert.equal(canBeat(s6, s5), false);
});
