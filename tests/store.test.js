import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../web/js/engine/store.js';

function mapStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  };
}

test('saveGame/loadGame 往返相等,clearGame 清除', () => {
  const st = mapStorage();
  const store = createStore(st);
  const state = { phase: 'play', hands: [[0], [1], [2]] };
  assert.equal(store.saveGame(state), true);
  assert.deepEqual(store.loadGame(), state);
  store.clearGame();
  assert.equal(store.loadGame(), null);
});

test('存储异常: getItem 抛错/坏 JSON → 返回默认值不抛错', () => {
  const bad = {
    getItem: () => { throw new Error('boom'); },
    setItem: () => { throw new Error('boom'); },
    removeItem: () => { throw new Error('boom'); },
  };
  const store = createStore(bad);
  assert.equal(store.loadGame(), null);
  assert.deepEqual(store.getStats(), { games: 0, wins: 0, landlordWins: 0, farmerWins: 0, score: 0 });
  assert.equal(store.saveGame({ a: 1 }), false); // 写失败不抛
  assert.deepEqual(store.getPrefs(), { level: 'normal', recorder: true, sound: true, bgm: true });
  assert.equal(store.getTheme(), null);
});

test('坏 JSON 同样兜底', () => {
  const st = mapStorage();
  st.setItem('otools-doudizhu:prefs', '{oops');
  const store = createStore(st);
  assert.deepEqual(store.getPrefs(), { level: 'normal', recorder: true, sound: true, bgm: true });
});

test('recordResult 累计战绩(含身份区分与分数)', () => {
  const st = mapStorage();
  const store = createStore(st);
  // 玩家座位0当地主,赢 +6
  store.recordResult({ deltas: [6, -3, -3] }, 0, 0);
  // 玩家座位1当农民,输 −3
  store.recordResult({ deltas: [6, -3, -3] }, 1, 0);
  // 玩家座位1当农民,赢 +4
  store.recordResult({ deltas: [-8, 4, 4] }, 1, 0);
  assert.deepEqual(store.getStats(), { games: 3, wins: 2, landlordWins: 1, farmerWins: 1, score: 6 - 3 + 4 });
});

test('getPrefs/setPrefs 合并更新,theme 往返', () => {
  const st = mapStorage();
  const store = createStore(st);
  store.setPrefs({ level: 'hard' });
  assert.deepEqual(store.getPrefs(), { level: 'hard', recorder: true, sound: true, bgm: true });
  store.setPrefs({ recorder: false });
  assert.deepEqual(store.getPrefs(), { level: 'hard', recorder: false, sound: true, bgm: true });
  store.setTheme({ id: 'neon' });
  assert.deepEqual(store.getTheme(), { id: 'neon' });
});
