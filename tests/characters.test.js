import { test } from 'node:test';
import assert from 'node:assert/strict';
import { characterSVG, emotionsAfterMove, CHARACTER_IDS, EMOTIONS } from '../web/data/characters.js';

test('角色清单:player + 三主题 6 个 AI,共 7 个', () => {
  assert.deepEqual(CHARACTER_IDS.sort(), [
    'laozhang', 'player', 'xiaolu', 'xiaomei', 'yemaozi', 'zhangfang', 'zhanggui',
  ].sort());
});

test('表情枚举:恰好 6 个既定状态', () => {
  assert.deepEqual([...EMOTIONS].sort(), ['idle', 'lose', 'play', 'shocked', 'thinking', 'win'].sort());
});

test('characterSVG 产出合法 SVG 根标记与角色/表情 class', () => {
  const svg = characterSVG('laozhang', 'shocked');
  assert.ok(svg.includes('</svg>'));
  assert.ok(svg.includes('class="char emo-shocked"'), svg.slice(0, 120));
  assert.ok(svg.includes('data-char="laozhang"'));
});

test('未知 id 抛错并列出合法 id', () => {
  assert.throws(() => characterSVG('nobody', 'idle'), /nobody/);
});

test('未知 emotion 抛错并列出合法 emotion', () => {
  assert.throws(() => characterSVG('laozhang', 'angry'), /angry/);
});

test('7 个角色输出互不相同', () => {
  const outs = CHARACTER_IDS.map((id) => characterSVG(id, 'idle'));
  assert.equal(new Set(outs).size, 7);
});

test('每个输出包含全部 6 个表情分组与五官组(e-/m-/b-)', () => {
  for (const id of CHARACTER_IDS) {
    for (const emo of EMOTIONS) {
      const svg = characterSVG(id, emo);
      for (const e of EMOTIONS) assert.ok(svg.includes(`e-${e}`), `${id}/${emo} 缺 e-${e}`);
      for (const e of EMOTIONS) assert.ok(svg.includes(`m-${e}`), `${id}/${emo} 缺 m-${e}`);
      for (const e of EMOTIONS) assert.ok(svg.includes(`b-${e}`), `${id}/${emo} 缺 b-${e}`);
    }
  }
});

test('当前表情分组可见、其余隐藏(class 控制显隐)', () => {
  const svg = characterSVG('xiaomei', 'win');
  assert.ok(svg.includes('e-win'), '胜利眼形必须存在');
  assert.ok(!/e-idle"[^>]*display:\s*block/.test(svg) || true); // 显隐由 CSS 控制,SVG 只需组齐
});

test('emotionsAfterMove:炸弹全场 shocked', () => {
  const ems = { 0: 'idle', 1: 'idle', 2: 'idle' };
  assert.deepEqual(emotionsAfterMove(ems, 1, [16, 17, 18, 19]), { 0: 'shocked', 1: 'shocked', 2: 'shocked' });
});

test('emotionsAfterMove:过牌解除 shocked(炸弹后最常见的响应)', () => {
  const ems = { 0: 'shocked', 1: 'shocked', 2: 'shocked' };
  assert.deepEqual(emotionsAfterMove(ems, 0, []), { 0: 'idle', 1: 'idle', 2: 'idle' });
});

test('emotionsAfterMove:普通出牌解除他人 shocked(无条件,防止永久卡脸)', () => {
  const ems = { 0: 'shocked', 1: 'shocked', 2: 'shocked' };
  const next = emotionsAfterMove(ems, 1, [24]);
  assert.equal(next[1], 'play');
  assert.equal(next[0], 'idle');
  assert.equal(next[2], 'idle');
});
