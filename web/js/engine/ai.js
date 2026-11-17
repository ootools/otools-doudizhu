// 规则评分 AI(easy/normal)。只读 InfoSet:自己的手牌 + 历史 + 已公示底牌,绝不读对手手牌。
import { genType, canBeat, rankOf } from './cards.js';
import { legalBids, legalMoves } from './game.js';

function countsOf(cards) {
  const counts = new Array(15).fill(0);
  for (const c of cards) counts[rankOf(c)]++;
  return counts;
}

/**
 * 手数启发式:把手牌贪心拆成最小「手数」(火箭/炸弹/顺子/三张/对子/单张各算一手)。
 * 仅用于相对比较,不求最优。
 */
export function countHands(cards) {
  const counts = countsOf(cards);
  let hands = 0;
  if (counts[13] > 0 && counts[14] > 0) { hands++; counts[13]--; counts[14]--; }
  for (let r = 0; r <= 12; r++) if (counts[r] === 4) { hands++; counts[r] = 0; }
  // 顺子贪心:每次抽最长 ≥5 连张(rank ≤ A)
  for (;;) {
    let bestLen = 0, bestStart = -1, run = 0, start = -1;
    for (let r = 0; r <= 11; r++) {
      if (counts[r] > 0) {
        if (run === 0) start = r;
        run++;
        if (run > bestLen) { bestLen = run; bestStart = start; }
      } else {
        run = 0;
      }
    }
    if (bestLen < 5) break;
    for (let r = bestStart; r < bestStart + bestLen; r++) counts[r]--;
    hands++;
  }
  for (let r = 0; r <= 12; r++) if (counts[r] >= 3) { hands++; counts[r] -= 3; }
  for (let r = 0; r <= 12; r++) if (counts[r] >= 2) { hands++; counts[r] -= 2; }
  for (let r = 0; r < 15; r++) hands += counts[r];
  return hands;
}

// 叫分强度分:大王30 + 小王25 + 火箭80 + 每个2×10 + 每炸弹50 + 每A×3
function bidStrength(cards) {
  const counts = countsOf(cards);
  let st = 0;
  if (counts[14] > 0) st += 30;
  if (counts[13] > 0) st += 25;
  if (counts[13] > 0 && counts[14] > 0) st += 80;
  st += counts[12] * 10;
  st += counts[11] * 3;
  for (let r = 0; r <= 12; r++) if (counts[r] === 4) st += 50;
  return st;
}

// InfoSet 内的「未见过牌」:54 − 我手牌 − 历史出牌 − 已公示底牌
function unseenCards(state, seat) {
  const known = new Set(state.hands[seat]);
  for (const h of state.history) for (const c of h.cards) known.add(c);
  for (const c of state.bottom) known.add(c);
  const unseen = [];
  for (let i = 0; i < 54; i++) if (!known.has(i)) unseen.push(i);
  return unseen;
}

/**
 * 候选打分(导出供 hard 兜底复用)。评分项:
 * 手数减少 ×30 > 出完即赢 +1000 > 压上家 +20 > 自由出小牌(−rank)
 * > 炸弹/火箭留用 −200 > 拆炸弹 −40 > 农民压队友 −60 > 危险规避(normal,unseen 高牌 ×2)。
 */
export function scoreMove(state, seat, move, { level = 'normal' } = {}) {
  const combo = genType(move);
  if (!combo) return -Infinity;
  const hand = state.hands[seat];
  const moveSet = new Set(move);
  const remaining = hand.filter((c) => !moveSet.has(c));
  const before = countHands(hand);
  const after = countHands(remaining);
  let score = (before - after) * 30;

  if (after === 0) score += 1000;
  if (combo.type === 'bomb' || combo.type === 'rocket') score -= 200;

  if (state.lastPlay) {
    if (canBeat(combo, state.lastPlay.combo)) score += 20;
    const teammate = state.landlord !== null && seat !== state.landlord &&
      state.lastPlay.seat !== state.landlord && state.lastPlay.seat !== seat;
    if (teammate && after > 0) score -= 60; // 农民让队友,除非能出完
  } else {
    score -= combo.rank; // 自由出牌:小牌先行
  }

  // 拆炸弹惩罚
  const handCounts = countsOf(hand);
  const moveCounts = countsOf(move);
  for (let r = 0; r <= 12; r++) {
    if (moveCounts[r] > 0 && moveCounts[r] < 4 && handCounts[r] === 4) score -= 15;
  }

  // 危险规避(normal,仅自由出牌):首出越小,unseen 里能压的牌越多越危险;
  // 跟牌时压/过本就是二选一,压小牌是节奏正解,不计危险
  if (level !== 'easy' && !state.lastPlay && after > 0 &&
      combo.type !== 'bomb' && combo.type !== 'rocket') {
    let danger = 0;
    for (const c of unseenCards(state, seat)) if (rankOf(c) > combo.rank) danger++;
    score -= Math.min(danger, 20) * 2;
  }
  return score;
}

/**
 * 出牌决策。candidates 含 legalMoves 与(有 lastPlay 时的)过;
 * easy 取分前 3 随机(注入 rng),normal 取最高分(稳定排序,可复现)。无解返回 []。
 */
export function choosePlay(state, seat, { level = 'normal', rng = Math.random } = {}) {
  const moves = legalMoves(state, seat);
  if (moves.length === 0) return [];
  const cands = moves.map((m) => ({ move: m, score: scoreMove(state, seat, m, { level }) }));
  if (state.lastPlay) cands.push({ move: [], score: 0 });
  cands.sort((a, b) => b.score - a.score);
  if (level === 'easy') {
    const top = cands.slice(0, Math.min(3, cands.length));
    return top[Math.floor(rng() * top.length)].move;
  }
  return cands[0].move;
}

/** 叫分决策:强度分定档位;档位不高于当前最高叫则 pass(0)。 */
export function chooseBid(state, seat, { level = 'normal', rng = Math.random } = {}) {
  const legal = legalBids(state, seat);
  if (legal.length === 0) return 0;
  const cur = Math.max(0, ...state.bids.map((b) => b ?? 0));
  const st = bidStrength(state.hands[seat]);
  const desired = st >= 100 ? 3 : st >= 60 ? 2 : st >= 30 ? 1 : 0;
  if (desired > cur && legal.includes(desired)) return desired;
  return 0;
}
