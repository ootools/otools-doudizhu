import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unseenCounts } from '../web/js/engine/recorder.js';
import { RANK_NAMES } from '../web/js/engine/cards.js';

test('全无已知牌:满配计数(每点数 4 张,双王各 1)', () => {
  const c = unseenCounts([], []);
  assert.equal(Object.keys(c).length, 15);
  assert.equal(RANK_NAMES.length, 15);
  for (const name of RANK_NAMES.slice(0, 13)) assert.equal(c[name], 4, `${name}`);
  assert.equal(c['小王'], 1);
  assert.equal(c['大王'], 1);
});

test('已知手牌扣除:333 出手后 3 归零', () => {
  const c = unseenCounts([0, 1, 2], []); // 我手里有 333
  assert.equal(c['3'], 1); // 还有一张 3 没见过
  assert.equal(c['4'], 4);
});

test('历史出牌扣除', () => {
  const c = unseenCounts([], [{ seat: 1, cards: [48, 49] }]); // 22 出了两张
  assert.equal(c['2'], 2);
  const c2 = unseenCounts([], [{ seat: 0, cards: [52] }]); // 小王出了
  assert.equal(c2['小王'], 0);
  assert.equal(c2['大王'], 1);
});

test('手牌+底牌+历史合并扣除', () => {
  // 我的 333 + 底牌 222(公示) + 历史出的 4
  const c = unseenCounts([0, 1, 2, 48, 49, 50], [{ seat: 1, cards: [4] }]);
  assert.equal(c['3'], 1);
  assert.equal(c['2'], 1); // 2222 − 公示3张 = 1
  assert.equal(c['4'], 3);
});
