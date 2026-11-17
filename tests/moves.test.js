import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genMoves, genType } from '../web/js/engine/cards.js';

// id(rank, suit) = rank*4+suit;rank 0..12 → 3..2;52 小王 53 大王
const id = (rank, suit = 0) => rank * 4 + suit;
const norm = (moves) => moves.map((m) => [...m].sort((a, b) => a - b).join(',')).sort();

test('自由出牌:覆盖抽查、无重复、全部合法', () => {
  const hand = [0, 1, 2, 4, 5, 6, 8, 9, 12, 16]; // 333 444 55 6 7
  const moves = genMoves(hand, null);
  const keys = moves.map((m) => m.join(','));
  assert.equal(new Set(keys).size, keys.length, '无重复组合');
  for (const m of moves) assert.ok(genType(m), `非法组合被枚举: ${m}`);
  const set = new Set(keys);
  assert.ok(set.has('0'), '单张3');
  assert.ok(set.has('8,9'), '对5');
  assert.ok(set.has('0,1,2'), '三张3');
  assert.ok(set.has('0,1,2,8'), '三带一 333+5');
  assert.ok(set.has('0,1,2,8,9'), '三带二 333+55');
  assert.ok(set.has('0,4,8,12,16'), '顺子 34567');
  assert.ok(set.has('0,1,4,5,8,9'), '连对 334455');
  assert.ok(set.has('0,1,2,4,5,6'), '飞机 333444');
  assert.ok(set.has('0,1,2,4,5,6,8,12'), '飞机带单 333444+5+6');
  // 枚举完备性(签名等价):每个合法自由子集的 (type,rank,len) 签名都必须被覆盖。
  // 实现为 rank 规范化枚举(同签名取最小花色组合),与 DouZero move_generator 同风格;
  // 最终以 Task 14 DouZero fixtures 对拍为权威基准。
  const all = allSubsets(hand).filter((s) => genType(s));
  const sig = (m) => { const c = genType(m); return `${c.type}|${c.rank}|${c.len ?? ''}`; };
  const emitted = new Set(moves.map(sig));
  for (const s of all) assert.ok(emitted.has(sig(s)), `漏签名: ${sig(s)} (${s.join(',')})`);
});

// ≤10 张的暴力对拍:全部子集过 genType
function allSubsets(cards) {
  const out = [];
  const rec = (i, acc) => {
    if (i === cards.length) { if (acc.length) out.push([...acc]); return; }
    rec(i + 1, acc);
    acc.push(cards[i]); rec(i + 1, acc); acc.pop();
  };
  rec(0, []);
  return out;
}

test('自由出牌:炸弹/火箭排尾', () => {
  const hand = [0, 4, 5, 6, 7, 8, 12, 16, 52, 53]; // 3 + 4444 + 567 + 王炸
  const moves = genMoves(hand, null);
  const bombIdx = moves.findIndex((m) => genType(m).type === 'bomb');
  const rocketIdx = moves.findIndex((m) => genType(m).type === 'rocket');
  const singleIdx = moves.findIndex((m) => m.length === 1);
  assert.ok(bombIdx >= 0 && rocketIdx >= 0 && singleIdx >= 0);
  assert.ok(singleIdx < bombIdx && bombIdx < rocketIdx, '非炸弹在前,炸弹/火箭收尾');
});

test('跟牌:pair(88) → 更大的对 + 炸弹/火箭', () => {
  const hand = [0, 1, 24, 25, 32, 33, 52, 53]; // 33 99 JJ 王炸
  const last = genType([id(5), id(5, 1)]); // 88
  assert.deepEqual(norm(genMoves(hand, last)), norm([[24, 25], [32, 33], [52, 53]]));
});

test('跟牌:bomb(2222) → 仅火箭', () => {
  const hand = [0, 1, 52, 53];
  const last = genType([id(12), id(12, 1), id(12, 2), id(12, 3)]);
  assert.deepEqual(norm(genMoves(hand, last)), norm([[52, 53]]));
});

test('跟牌:bomb(3333) → 更大炸弹;rocket 之后无解', () => {
  const hand = [0, 1, 2, 3, 4, 5, 6, 7];
  const last = genType([0, 1, 2, 3]); // 3333
  assert.deepEqual(norm(genMoves(hand, last)), norm([[4, 5, 6, 7]]));
  const rocketLast = genType([52, 53]);
  assert.deepEqual(genMoves([0, 1, 4, 5, 6, 7], rocketLast), []);
});

test('跟牌:plane(333444) → 更大飞机(带同规格翅膀)', () => {
  const hand = [16, 17, 18, 20, 21, 22, 24, 25, 8, 9]; // 777 888 99 +5
  const last = genType([0, 1, 2, 4, 5, 6]); // 333444
  const moves = genMoves(hand, last);
  assert.ok(norm(moves).includes('16,17,18,20,21,22'), '777888 无翼');
  // 无翼飞机只能被无翼飞机压;777888+9+9 是 plane_single,压不了 333444
  for (const m of moves) assert.ok(genType(m), `非法: ${m}`);
});

test('无解返回空数组', () => {
  const hand = [0, 1, 2];
  const last = genType([id(12), id(12, 1)]); // 22
  assert.deepEqual(genMoves(hand, last), []);
});

test('翅膀约束:单王可作翅膀;三带二/飞机带对不可双王;四带二单可双王(官方 type_13)', () => {
  const hand = [4, 5, 6, 52, 53]; // 444 + 王
  const keys = norm(genMoves(hand, null));
  assert.ok(keys.includes('4,5,6,52'), '三带一 444+小王');
  assert.ok(!keys.includes('4,5,6,52,53'), '三带二不得用火箭作翅膀(且 5 张无对子)');
  // 四带二单:双王作两单合法(官方 gen_type_13_4_2 实测产出)
  const hand2 = [0, 1, 2, 3, 52, 53, 8, 9];
  const keys2 = norm(genMoves(hand2, null));
  assert.ok(keys2.includes('0,1,2,3,52,53'), '四带二单双王合法');
  assert.ok(keys2.includes('0,1,2,3,8,9'), '四带二单 55');
  // 飞机带单:双王翅膀合法(官方 gen_type_11 实测产出 [3,3,3,4,4,4,20,30])
  const hand3 = [0, 1, 2, 4, 5, 6, 52, 53];
  const keys3 = norm(genMoves(hand3, null));
  assert.ok(keys3.includes('0,1,2,4,5,6,52,53'), '飞机带单双王合法');
});
