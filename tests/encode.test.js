import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cardsTo54, seqToZ, seatToPosition, buildX, buildBatch, X_DIMS, Z_SHAPE,
} from '../web/js/engine/douzero-encode.js';

const id = (rank, suit = 0) => rank * 4 + suit;

function makeState({ landlord = 0, hands = null, history = [], turn = 0 } = {}) {
  const base = {
    phase: 'play',
    hands: hands || [
      [0, 1, 2, 3, 4, 5, 48, 49, 50, 51, 52, 53, 8, 9, 12, 16, 20],
      [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40],
      [41, 42, 43, 44, 45, 46, 47, 4, 5, 6, 7, 10, 11, 13, 14, 15, 17],
    ],
    bottom: [21, 22, 23], dealer: 0, bidTurn: 0,
    bids: [3, 0, 0], landlord, baseScore: 3, multiplier: 1,
    turn, lastPlay: null, passCount: 0, playCounts: [0, 0, 0], history,
  };
  // 地主手牌含底牌(20 张):把 bottom 并入 landlord 手牌
  base.hands[landlord] = [...base.hands[landlord], ...base.bottom].sort((a, b) => a - b);
  return base;
}

test('cardsTo54:one-hot 即卡牌 id(0..53 恒等),按数量填列', () => {
  const a = cardsTo54([0]);
  assert.equal(a.length, 54);
  assert.equal(a[0], 1);
  let sum = 0;
  for (const v of a) sum += v;
  assert.equal(sum, 1);
  // 对子:两张同 rank 不同花色 → 该列两行置 1(即 idx0、idx1)
  const pair = cardsTo54([0, 1]);
  assert.equal(pair[0], 1);
  assert.equal(pair[1], 1);
  assert.equal(pair[2], 0);
  // 三条 [0,1,2] → idx0..2
  const trio = cardsTo54([0, 1, 2]);
  assert.equal(trio[0] + trio[1] + trio[2], 3);
  // 双王
  assert.equal(cardsTo54([52])[52], 1);
  assert.equal(cardsTo54([53])[53], 1);
  // 空出牌(pass)→ 全零
  const pass = cardsTo54([]);
  assert.equal(pass.reduce((s, v) => s + v, 0), 0);
  // 2 的四张(id 48..51)→ idx48..51
  const bomb2 = cardsTo54([48, 49, 50, 51]);
  assert.equal(bomb2[48] + bomb2[49] + bomb2[50] + bomb2[51], 4);
});

test('seqToZ:固定 5×162,历史 15 条截尾、不足前补空,Z 行 = 连续 3 条出牌拼接', () => {
  assert.deepEqual(Z_SHAPE, [5, 162]);
  const z = seqToZ([]); // 空历史:15 条空出牌 → 全零
  assert.equal(z.length, 5 * 162);
  assert.equal(z.reduce((s, v) => s + v, 0), 0);
  // 4 条历史:前补 11 条空到 15;历史条目位于尾部 idx 11..14 → 行3(idx9,10,11)、行4(idx12,13,14)
  const z2 = seqToZ([[0], [4], [], [8]]);
  // [0] 在 idx11 → 行3, 块2, 偏移 2*54+0
  assert.equal(z2[3 * 162 + 2 * 54 + 0], 1);
  // 行3 块0/块1 是补位空出牌 → 全零
  assert.equal(z2[3 * 162 + 0] + z2[3 * 162 + 53] + z2[3 * 162 + 54], 0);
  // [4] 在 idx12 → 行4, 块0;单张 [4] 按官方计数编码 → rank1 列首行 v[4]
  assert.equal(z2[4 * 162 + 4], 1);
  // pass [] 在 idx13 → 行4 块1 全零
  assert.equal(z2[4 * 162 + 54] + z2[4 * 162 + 55], 0);
  // [8] 在 idx14 → 行4 块2 偏移 2*54+8(id8 = rank2 首行)
  assert.equal(z2[4 * 162 + 2 * 54 + 8], 1);
  // 超过 15 条:截尾保留最后 15
  const legal = Array.from({ length: 20 }, (_, i) => [i]);
  const z4 = seqToZ(legal);
  // 截尾后第一条是原第 6 条 [5] → 单张按 rank 计数 → v[4](rank1 列首行)
  assert.equal(z4[0 * 162 + 4], 1);
});

test('seatToPosition:landlord/landlord_down(下家)/landlord_up(上家)', () => {
  const s = makeState({ landlord: 1 });
  assert.equal(seatToPosition(s, 1), 'landlord');
  assert.equal(seatToPosition(s, 2), 'landlord_down');
  assert.equal(seatToPosition(s, 0), 'landlord_up');
});

test('buildX:landlord 373 维,分段内容正确', () => {
  const s = makeState({ landlord: 0, history: [], turn: 0 });
  const x = buildX(s, 0, [0, 1, 2]); // 候选动作 333
  assert.equal(x.length, X_DIMS.landlord);
  assert.equal(X_DIMS.landlord, 373);
  // hand 段 [0..53]:地主 20 张
  let handSum = 0;
  for (let i = 0; i < 54; i++) handSum += x[i];
  assert.equal(handSum, 20);
  assert.equal(x[0], 1); // 333 在手
  // other 段 [54..107]:34 张
  let otherSum = 0;
  for (let i = 54; i < 108; i++) otherSum += x[i];
  assert.equal(otherSum, 34);
  // last_action 段 [108..161]:空历史 → 全零
  for (let i = 108; i < 162; i++) assert.equal(x[i], 0, `last_action idx${i}`);
  // up_played [162..215], down_played [216..269]:全零
  for (let i = 162; i < 270; i++) assert.equal(x[i], 0, `played idx${i}`);
  // up_left [270..286]:上家 17 张 → onehot17[idx16]=1
  let upSum = 0;
  for (let i = 270; i < 287; i++) upSum += x[i];
  assert.equal(upSum, 1);
  assert.equal(x[270 + 16], 1);
  // down_left [287..303]:下家 17 张
  assert.equal(x[287 + 16], 1);
  // bomb [304..318]:0 炸 → idx0=1
  assert.equal(x[304], 1);
  // action 段 [319..372]:候选 333 → idx0..2
  assert.equal(x[319 + 0], 1);
  assert.equal(x[319 + 1], 1);
  assert.equal(x[319 + 2], 1);
  assert.equal(x[372], 0);
});

test('buildX:farmer 484 维,地主下家视角分段正确', () => {
  const s = makeState({ landlord: 1, history: [], turn: 2 }); // seat2 = landlord_down
  const x = buildX(s, 2, [41]);
  assert.equal(x.length, X_DIMS.landlord_down);
  assert.equal(X_DIMS.landlord_down, 484);
  assert.equal(X_DIMS.landlord_up, 484);
  // hand 段:seat2 手牌 17 张
  let handSum = 0;
  for (let i = 0; i < 54; i++) handSum += x[i];
  assert.equal(handSum, 17);
  // other:37 张(地主 20 + 队友 17)
  let otherSum = 0;
  for (let i = 54; i < 108; i++) otherSum += x[i];
  assert.equal(otherSum, 37);
  // landlord_played [108..161] 全零;teammate_played [162..215] 全零
  for (let i = 108; i < 216; i++) assert.equal(x[i], 0);
  // last_action [216..269] 全零(空历史)
  for (let i = 216; i < 270; i++) assert.equal(x[i], 0);
  // last_landlord_action [270..323] 全零
  for (let i = 270; i < 324; i++) assert.equal(x[i], 0);
  // last_teammate_action [324..377] 全零
  for (let i = 324; i < 378; i++) assert.equal(x[i], 0);
  // landlord_left [378..397]:onehot20,地主 20 张 → idx19
  assert.equal(x[378 + 19], 1);
  // teammate_left [398..414]:onehot17,队友 17 张 → idx16
  assert.equal(x[398 + 16], 1);
  // bomb [415..429]:idx0
  assert.equal(x[415], 1);
  // action [430..483]:候选单张 id41(rank10)→ 官方计数编码在 rank10 列首行 idx40
  assert.equal(x[430 + 40], 1);
});

test('buildX:历史出牌进入 last/played 段,bomb 计数正确', () => {
  // 地主出炸弹 4444(id16..19),农民 pass,地主再出单张 3
  const history = [
    { seat: 0, cards: [16, 17, 18, 19] },
    { seat: 1, cards: [] },
    { seat: 2, cards: [] },
    { seat: 0, cards: [0] },
  ];
  const s = makeState({ landlord: 0, history, turn: 1 });
  const x = buildX(s, 1, [41]); // farmer(landlord_down? seat1 = (0+1)%3 = landlord_down) 视角
  assert.equal(seatToPosition(s, 1), 'landlord_down');
  // last_action 段 [216..269]:last_move = [0](末条非 pass)→ idx0
  assert.equal(x[216 + 0], 1);
  // last_landlord_action [270..323]:地主最后动作 = [0] → idx0
  assert.equal(x[270 + 0], 1);
  // landlord_played [108..161]:地主已出 4444+3 → idx16..19,0
  assert.equal(x[108 + 16], 1);
  assert.equal(x[108 + 0], 1);
  // bomb [415..429]:1 炸 → idx1
  assert.equal(x[415 + 1], 1);
  // z 序列非零
  const z = seqToZ(history.map((h) => h.cards));
  assert.ok(z.reduce((s2, v) => s2 + v, 0) > 0);
});

test('buildX 反作弊:对调两个对手的手牌(各自数量不变)x 不变', () => {
  const s = makeState({ landlord: 1, history: [], turn: 2 });
  const t = makeState({ landlord: 1, history: [], turn: 2 });
  // 决策者是座位2;把座位0 与地主(座位1)的前 5 张互换,两手长度不变
  const a0 = t.hands[0].slice(0, 5);
  const a1 = t.hands[1].slice(0, 5);
  t.hands[0] = [...t.hands[0].slice(5), ...a1].sort((x, y) => x - y);
  t.hands[1] = [...t.hands[1].slice(5), ...a0].sort((x, y) => x - y);
  const xa = buildX(s, 2, [41]);
  const xb = buildX(t, 2, [41]);
  assert.deepEqual([...xb], [...xa]);
});

test('buildBatch:z 共享形状,x 按候选逐行', () => {
  const s = makeState({ landlord: 0, history: [], turn: 0 });
  const b = buildBatch(s, 0, [[0], [0, 1], [4, 5, 6, 7]]);
  assert.equal(b.count, 3);
  assert.equal(b.x.length, 3 * 373);
  assert.equal(b.z.length, 5 * 162); // z 不随候选复制
  // 第二候选 [0,1] 的 action 段
  assert.equal(b.x[373 + 319 + 0], 1);
  assert.equal(b.x[373 + 319 + 1], 1);
  assert.equal(b.x[373 + 319 + 2], 0);
});
