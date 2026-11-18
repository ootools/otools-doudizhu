// 卡通角色 SVG 生成器(纯函数,零 DOM):半身立绘 + 表情状态机。
// 表情 = 根 class `emo-<emotion>` 控制内部 e-*(眼)/b-*(眉)/m-*(嘴)分组的显隐(CSS 侧)。
// 所有变体同时绘制在 SVG 内;零位图、零依赖。

import { genType } from '../js/engine/cards.js';

export const CHARACTER_IDS = ['player', 'laozhang', 'xiaomei', 'zhanggui', 'zhangfang', 'xiaolu', 'yemaozi'];
export const EMOTIONS = ['idle', 'thinking', 'play', 'shocked', 'win', 'lose'];

// 每角色外观参数
const CHARACTERS = {
  player: { skin: '#f2c9a0', hair: '#2b1f16', hairStyle: 'short', outfit: '#33684a', outfitDark: '#27523a', accent: '#e8d9b0' },
  laozhang: { skin: '#eab98a', hair: '#5a4636', hairStyle: 'side', outfit: '#24422f', outfitDark: '#1a3122', accent: '#6b5644', beard: '#6b5644' },
  xiaomei: { skin: '#f7d3ab', hair: '#4a2f22', hairStyle: 'bob', outfit: '#c05a6a', outfitDark: '#a24857', accent: '#f0a08a' },
  zhanggui: { skin: '#eebd8f', hair: '#1c1410', hairStyle: 'cap', outfit: '#5a3a20', outfitDark: '#463018', accent: '#c8963e', beard: '#2c2018' },
  zhangfang: { skin: '#e8c49c', hair: '#888078', hairStyle: 'side', outfit: '#4a5a6a', outfitDark: '#3a4854', accent: '#d8d2c4', glasses: true },
  xiaolu: { skin: '#f7d3ab', hair: '#3a2a3a', hairStyle: 'antler', outfit: '#e05fa0', outfitDark: '#b84a84', accent: '#e0b25f' },
  yemaozi: { skin: '#4a4060', hair: '#241d38', hairStyle: 'hood', outfit: '#1a1530', outfitDark: '#120e20', accent: '#e0b25f', cat: true },
};

// —— 共享五官变体(坐标相对头部锚点,头心约 (60,44),半径 24)——
const EYES = {
  idle: '<circle cx="50" cy="44" r="2.6" fill="#241a10"/><circle cx="70" cy="44" r="2.6" fill="#241a10"/>',
  thinking: '<circle cx="52" cy="45" r="2.4" fill="#241a10"/><circle cx="68" cy="43" r="2.4" fill="#241a10"/>',
  play: '<path d="M46 44 Q50 40 54 44" stroke="#241a10" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M66 44 Q70 40 74 44" stroke="#241a10" stroke-width="2" fill="none" stroke-linecap="round"/>',
  shocked: '<circle cx="50" cy="43" r="4.5" fill="#fff" stroke="#241a10" stroke-width="1.4"/><circle cx="70" cy="43" r="4.5" fill="#fff" stroke="#241a10" stroke-width="1.4"/><circle cx="50" cy="43.5" r="1.8" fill="#241a10"/><circle cx="70" cy="43.5" r="1.8" fill="#241a10"/>',
  win: '<path d="M45 43 Q50 38 55 43" stroke="#241a10" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M65 43 Q70 38 75 43" stroke="#241a10" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  lose: '<path d="M46 45 L54 43.5" stroke="#241a10" stroke-width="2" stroke-linecap="round"/><path d="M74 45 L66 43.5" stroke="#241a10" stroke-width="2" stroke-linecap="round"/>',
};
const BROWS = {
  idle: '<path d="M45 36 Q50 33.5 55 35.5" stroke-width="2"/><path d="M65 35.5 Q70 33.5 75 36" stroke-width="2"/>',
  thinking: '<path d="M45 34 Q50 31.5 55 33.5" stroke-width="2"/><path d="M65 36.5 Q70 34.5 75 36" stroke-width="2"/>',
  play: '<path d="M45 34.5 Q50 32 55 34" stroke-width="2"/><path d="M65 34 Q70 32 75 34.5" stroke-width="2"/>',
  shocked: '<path d="M45 32.5 Q50 29.5 55 31.5" stroke-width="2.2"/><path d="M65 31.5 Q70 29.5 75 32.5" stroke-width="2.2"/>',
  win: '<path d="M45 33 Q50 30.5 55 32.5" stroke-width="2.2"/><path d="M65 32.5 Q70 30.5 75 33" stroke-width="2.2"/>',
  lose: '<path d="M45 34 Q50 36 55 34.5" stroke-width="2"/><path d="M65 34.5 Q70 36 75 34" stroke-width="2"/>',
};
const MOUTHS = {
  idle: '<path d="M53 55 Q60 59.5 67 55" stroke="#a0522d" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
  thinking: '<path d="M55 56.5 Q60 54.5 65 56.5" stroke="#a0522d" stroke-width="2" fill="none" stroke-linecap="round"/>',
  play: '<path d="M52 54.5 Q60 61 68 54.5" stroke="#a0522d" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
  shocked: '<ellipse cx="60" cy="57" rx="5" ry="6.5" fill="#7a2c20"/>',
  win: '<path d="M50 53 Q60 64 70 53 Z" fill="#7a2c20"/><path d="M54 57 Q60 60 66 57" stroke="#e8a0a0" stroke-width="1.6" fill="none"/>',
  lose: '<path d="M53 58 Q60 53.5 67 58" stroke="#a0522d" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M70 48 Q73.5 53 71 55 Q68.5 53 70 48" fill="#7ab0e8" opacity="0.85"/>',
};

// 发型/帽子/配饰:按 hairStyle 分派,画在头部之上
function hairLayer(c) {
  const h = c.hair;
  switch (c.hairStyle) {
    case 'short': return `<path d="M36 40 Q36 18 60 18 Q84 18 84 40 Q76 30 60 30 Q44 30 36 40 Z" fill="${h}"/>`;
    case 'side': return `<path d="M36 38 Q37 19 60 18 Q83 19 84 38 Q78 28 60 28 Q42 28 36 38 Z" fill="${h}"/>`;
    case 'bob': return `<path d="M34 52 Q30 16 60 15 Q90 16 86 52 Q84 38 78 33 Q80 42 76 46 L74 32 Q60 24 46 30 Q42 40 44 50 Q36 48 34 52 Z" fill="${h}"/>`;
    case 'cap': return `<path d="M38 24 Q38 12 60 12 Q82 12 82 24 L82 27 L38 27 Z" fill="${h}"/><circle cx="60" cy="14.5" r="2.2" fill="${c.accent}"/><path d="M36 24 L84 24" stroke="${c.accent}" stroke-width="2"/>`;
    case 'antler': return `<path d="M40 20 Q34 6 24 10 M44 16 Q42 6 34 4 M80 20 Q86 6 96 10 M76 16 Q78 6 86 4" stroke="${c.accent}" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M36 34 Q36 16 60 15 Q84 16 84 34 Q76 26 60 26 Q44 26 36 34 Z" fill="${h}"/><path d="M36 30 Q24 26 26 40 Q34 36 36 30 Z" fill="${h}"/><path d="M84 30 Q96 26 94 40 Q86 36 84 30 Z" fill="${h}"/>`;
    case 'hood': return `<path d="M30 46 Q28 12 60 12 Q92 12 90 46 Q88 24 60 24 Q32 24 30 46 Z" fill="${h}"/><path d="M36 20 L30 8 L42 14 Z" fill="${c.accent}"/><path d="M84 20 L90 8 L78 14 Z" fill="${c.accent}"/>`;
    default: return '';
  }
}

function faceDecor(c) {
  let s = '';
  if (c.beard) s += `<path d="M44 50 Q46 66 60 68 Q74 66 76 50 Q68 58 60 58 Q52 58 44 50 Z" fill="${c.beard}"/>`;
  if (c.glasses) s += '<circle cx="50" cy="44" r="5.6" fill="none" stroke="#3a3430" stroke-width="1.6"/><circle cx="70" cy="44" r="5.6" fill="none" stroke="#3a3430" stroke-width="1.6"/><path d="M55.6 44 L64.4 44" stroke="#3a3430" stroke-width="1.6"/>';
  if (c.cat) s += '<rect x="42" y="41" width="12" height="8.5" rx="4" fill="#141020"/><rect x="66" y="41" width="12" height="8.5" rx="4" fill="#141020"/><path d="M54 45 L58 45" stroke="#141020" stroke-width="2"/><path d="M45.5 44.8 Q48 43.2 50.5 44.8 M67.5 44.8 Q70 43.2 72.5 44.8" stroke="#58e0d0" stroke-width="1.4" fill="none" stroke-linecap="round"/>';
  return s;
}

function blushLayer(c, emotion) {
  if (emotion === 'shocked' || emotion === 'lose') return '';
  const col = c.skin === '#4a4060' ? '#7a6fa0' : '#e8926b';
  return `<circle cx="42" cy="52" r="3.4" fill="${col}" opacity="0.5"/><circle cx="78" cy="52" r="3.4" fill="${col}" opacity="0.5"/>`;
}

function groups(c, emotion) {
  let s = '';
  for (const emo of EMOTIONS) {
    const on = emo === emotion;
    s += `<g class="e-${emo}" style="display:${on ? 'block' : 'none'}">${EYES[emo]}</g>`;
  }
  for (const emo of EMOTIONS) {
    const on = emo === emotion;
    s += `<g class="b-${emo}" style="display:${on ? 'block' : 'none'}" stroke="#241a10" fill="none" stroke-linecap="round">${BROWS[emo]}</g>`;
  }
  for (const emo of EMOTIONS) {
    const on = emo === emotion;
    s += `<g class="m-${emo}" style="display:${on ? 'block' : 'none'}">${MOUTHS[emo]}</g>`;
  }
  s += blushLayer(c, emotion);
  s += faceDecor(c);
  return s;
}

/**
 * 表情状态机(纯函数):一手出牌/过牌后各座位的新表情。
 * - 炸弹/火箭:全场 shocked;
 * - 普通出牌:出牌者 play(由调用方安排回 idle),其余无条件 idle(防止 shocked 永久卡脸);
 * - 过牌:仅解除 shocked(过牌是炸弹后最常见的响应,也算「下一手」)。
 * @param {Record<number,string>} emotions 当前各座位表情
 * @param {number} seat 本手出牌座位
 * @param {number[]} cards 本手牌(空数组=过牌)
 */
export function emotionsAfterMove(emotions, seat, cards) {
  const next = { 0: emotions[0], 1: emotions[1], 2: emotions[2] };
  if (cards.length === 0) {
    for (const s of [0, 1, 2]) if (next[s] === 'shocked') next[s] = 'idle';
    return next;
  }
  const combo = genType(cards);
  if (combo.type === 'bomb' || combo.type === 'rocket') {
    for (const s of [0, 1, 2]) next[s] = 'shocked';
    return next;
  }
  next[seat] = 'play';
  for (const s of [0, 1, 2]) if (s !== seat) next[s] = 'idle';
  return next;
}

/**
 * 生成半身卡通角色 SVG 字符串。
 * @param {string} id CHARACTER_IDS 之一
 * @param {string} emotion EMOTIONS 之一
 * @returns {string} 根元素 class="char emo-<emotion>" data-char="<id>" 的内联 SVG
 */
export function characterSVG(id, emotion) {
  const c = CHARACTERS[id];
  if (!c) throw new Error(`未知角色 id: ${id}(合法:${CHARACTER_IDS.join(', ')})`);
  if (!EMOTIONS.includes(emotion)) throw new Error(`未知表情: ${emotion}(合法:${EMOTIONS.join(', ')})`);
  const emoClass = `emo-${emotion}`;
  return `<svg class="char ${emoClass}" data-char="${id}" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
    + `<circle cx="60" cy="64" r="42" fill="${c.outfitDark}" opacity="0.35"/>`
    + `<path d="M22 120 Q26 84 60 82 Q94 84 98 120 Z" fill="${c.outfit}"/>`
    + `<path d="M46 92 L60 102 L74 92" stroke="${c.outfitDark}" stroke-width="3" fill="none"/>`
    + `<rect x="52" y="74" width="16" height="14" rx="5" fill="${c.skin}"/>`
    + `<circle cx="60" cy="44" r="26" fill="${c.skin}"/>`
    + hairLayer(c)
    + groups(c, emotion)
    + `</svg>`;
}
