// 斗地主对局状态机(纯函数,每步返回新 state;零 DOM;可序列化)
import { newDeck, shuffle, genType, genMoves } from './cards.js';

const REQUIRED_FIELDS = [
  'phase', 'hands', 'bottom', 'dealer', 'bidTurn', 'bids', 'landlord',
  'baseScore', 'multiplier', 'turn', 'lastPlay', 'passCount', 'playCounts', 'history',
];

function clone(state) {
  return structuredClone(state);
}

function requireField(state, key) {
  if (!(key in state)) throw new Error(`非法状态:缺少字段 ${key}`);
}

export function validateState(state) {
  if (!state || typeof state !== 'object') throw new Error('非法状态');
  for (const k of REQUIRED_FIELDS) requireField(state, k);
  if (state.phase !== 'bid' && state.phase !== 'play' && state.phase !== 'settle') {
    throw new Error('非法状态:phase');
  }
  return state;
}

/** 开新局。rng 注入;dealer 缺省由 rng 决定。 */
export function newGame({ rng = Math.random, dealer = null } = {}) {
  const deck = shuffle(newDeck(), rng);
  const hands = [0, 1, 2].map((i) =>
    deck.slice(i * 17, i * 17 + 17).sort((a, b) => a - b));
  const bottom = deck.slice(51).sort((a, b) => a - b);
  const d = dealer === null ? Math.floor(rng() * 3) : ((dealer % 3) + 3) % 3;
  return {
    phase: 'bid',
    hands, bottom,
    dealer: d, bidTurn: d,
    bids: [null, null, null], // 0=不叫,1..3=叫分
    landlord: null, baseScore: 0, multiplier: 1,
    turn: d, lastPlay: null, passCount: 0, playCounts: [0, 0, 0], history: [],
  };
}

/** 叫分阶段:seat 当前可叫的分数列表(0=不叫);非当前座位返回 []。 */
export function legalBids(state, seat) {
  if (state.phase !== 'bid' || seat !== state.bidTurn) return [];
  const cur = Math.max(0, ...state.bids.map((b) => b ?? 0));
  const out = [0];
  for (let v = cur + 1; v <= 3; v++) out.push(v);
  return out;
}

function finalizeBid(state, winner) {
  state.landlord = winner;
  state.baseScore = state.bids[winner];
  state.hands[winner] = [...state.hands[winner], ...state.bottom].sort((a, b) => a - b);
  state.phase = 'play';
  state.turn = winner;
  state.lastPlay = null;
  state.passCount = 0;
  return state;
}

/**
 * 叫分。value: 0=不叫,1..3。叫 3 立即定地主;三家叫完取最高者;
 * 全不叫自动重发(dealer 顺延,重发用 opts.rng,缺省 Math.random)。
 */
export function bid(state, seat, value, { rng = Math.random } = {}) {
  if (state.phase !== 'bid') throw new Error('不在叫分阶段');
  if (seat !== state.bidTurn) throw new Error('未轮到该座位叫分');
  if (!legalBids(state, seat).includes(value)) throw new Error(`非法叫分 ${value}`);
  const next = clone(state);
  next.bids[seat] = value;

  if (value === 3) return finalizeBid(next, seat); // 叫 3 即庄

  const after = (seat + 1) % 3;
  const allBid = next.bids.every((b) => b !== null);
  if (allBid) {
    const max = Math.max(...next.bids);
    if (max === 0) {
      // 全不叫:重发,dealer 顺延
      return newGame({ rng, dealer: (next.dealer + 1) % 3 });
    }
    const winner = next.bids.indexOf(max); // 叫分必须严格递增,最高者唯一
    return finalizeBid(next, winner);
  }
  next.bidTurn = after;
  return next;
}

/** play 阶段:seat 当前可出的组合(牌 id 数组列表);空数组=无解须过。 */
export function legalMoves(state, seat) {
  if (state.phase !== 'play' || seat !== state.turn) return [];
  const lastCombo = state.lastPlay ? state.lastPlay.combo : null;
  return genMoves(state.hands[seat], lastCombo);
}

/**
 * 出牌(cards=[] 表示过,仅当场上有 lastPlay 时合法)。
 * 炸弹/火箭倍数 ×2;连续两家过 → lastPlay 清空回赢家;手牌打空进入 settle。
 */
export function play(state, seat, cards) {
  if (state.phase !== 'play') throw new Error('不在出牌阶段');
  if (seat !== state.turn) throw new Error('未轮到该座位出牌');
  const isPass = Array.isArray(cards) && cards.length === 0;
  if (!Array.isArray(cards)) throw new Error('cards 必须是牌 id 数组');
  if (isPass) {
    if (!state.lastPlay) throw new Error('自由出牌不能过');
    const next = clone(state);
    next.passCount += 1;
    if (next.passCount >= 2) {
      // 连续两家过:上一手赢家重新自由出牌
      next.lastPlay = null;
      next.passCount = 0;
    }
    next.turn = (seat + 1) % 3;
    return next;
  }

  const legal = legalMoves(state, seat);
  const sorted = [...cards].sort((a, b) => a - b);
  if (!legal.some((m) => m.join(',') === sorted.join(','))) {
    throw new Error('非法出牌');
  }

  const next = clone(state);
  const hand = next.hands[seat];
  for (const c of sorted) {
    const idx = hand.indexOf(c);
    if (idx < 0) throw new Error('非法出牌');
    hand.splice(idx, 1);
  }
  next.hands[seat] = hand;
  next.playCounts[seat] += 1;
  next.history.push({ seat, cards: sorted });
  const combo = genType(sorted);
  if (combo.type === 'bomb' || combo.type === 'rocket') next.multiplier *= 2;
  next.lastPlay = { seat, cards: sorted, combo };
  next.passCount = 0;

  if (hand.length === 0) {
    next.phase = 'settle';
    return next;
  }
  next.turn = (seat + 1) % 3;
  return next;
}

/**
 * 结算(仅 settle 阶段)。春天:地主胜且两农民一张未出;反春:农民胜且地主仅出过首手。
 * 返回 { winner, spring, antiSpring, multiplier, baseScore, deltas[3] },deltas 和恒为 0。
 */
export function settle(state) {
  if (state.phase !== 'settle') throw new Error('不在结算阶段');
  const landlordWon = state.hands[state.landlord].length === 0;
  const farmers = [0, 1, 2].filter((s) => s !== state.landlord);
  const spring = landlordWon && farmers.every((s) => state.playCounts[s] === 0);
  const antiSpring = !landlordWon && state.playCounts[state.landlord] === 1;
  const multiplier = state.multiplier * (spring || antiSpring ? 2 : 1);
  const total = state.baseScore * multiplier;
  const deltas = [0, 0, 0];
  deltas[state.landlord] = landlordWon ? 2 * total : -2 * total;
  for (const s of farmers) deltas[s] = landlordWon ? -total : total;
  return {
    winner: landlordWon ? 'landlord' : 'farmers',
    spring, antiSpring, multiplier, baseScore: state.baseScore, deltas,
  };
}

export function serialize(state) {
  validateState(state);
  return JSON.stringify(state);
}

export function restore(json) {
  let state;
  try {
    state = JSON.parse(json);
  } catch (e) {
    throw new Error('存档损坏:非 JSON');
  }
  return validateState(state);
}
