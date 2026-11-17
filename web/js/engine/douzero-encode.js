// DouZero InfoSet 编码层 —— 逐位对齐官方实现(kwai/DouZero main 分支):
//   douzero/env/env.py  的 _cards2array / _action_seq_list2array / _process_action_seq /
//                         _get_one_hot_array / _get_one_hot_bomb / _get_obs_landlord(_up/_down)
// 关键口径:
//   - 54 维 one-hot 与本引擎 card id 0..53 恒等(rank 列 = Card2Column,suit 行;52/53 = 双王)
//   - z:历史出牌取最后 15 条(前补空出牌),每条 54 维,按每 3 条一组拼成固定 [5, 162]
//   - x:按席位定长(landlord 373 / farmer 484),末段 54 维为当前候选动作
//   - other_hand_cards = 54 − 我手牌 − 全部已出牌(纯公开信息推导,与官方取自环境内部的值恒等,不作弊)
//   - _get_one_hot_array(num, max):vec[num-1]=1;num=0 时 Python 负索引回卷到末位 —— 原样复刻
//   - bomb_num 含炸弹与火箭(官方 bombs 集合含 [20,30])

export const NUM_CARDS = 54;
export const Z_SHAPE = [5, 162]; // 固定 5 行,每行 3 条历史出牌 × 54
export const X_DIMS = { landlord: 373, landlord_up: 484, landlord_down: 484 };
export const POSITIONS = ['landlord', 'landlord_down', 'landlord_up'];

// seat → DouZero 席位名(出牌顺序 landlord → landlord_down → landlord_up)
export function seatToPosition(state, seat) {
  if (seat === state.landlord) return 'landlord';
  if (seat === (state.landlord + 1) % 3) return 'landlord_down';
  return 'landlord_up';
}

/**
 * 牌列表 → 54 维计数 one-hot(与官方 _cards2array 一致:同 rank 多张按数量填列,
 * 不区分花色;pass/空列表 → 全零)。本引擎 id 与官方 54 维下标恒等。
 */
export function cardsTo54(cards) {
  const v = new Float32Array(NUM_CARDS);
  if (!cards || cards.length === 0) return v;
  const counts = new Array(15).fill(0);
  for (const c of cards) {
    counts[Math.floor(c / 4)]++; // rank 0..12;joker 单独处理
  }
  // 13 列 × 4 行,列主序:idx = rank*4 + row
  for (let r = 0; r <= 12; r++) {
    const n = counts[r];
    for (let row = 0; row < n && row < 4; row++) v[r * 4 + row] = 1;
  }
  // 双王:idx 52(小王)/ 53(大王)
  const jokers = cards.filter((c) => c >= 52);
  for (const j of jokers) v[j] = 1;
  return v;
}

/** 历史出牌序列 → 固定 [5*162]:取最后 15 条,前补空出牌,每 3 条拼一行。 */
export function seqToZ(history) {
  const moves = [];
  for (const h of history) moves.push(h.cards !== undefined ? h.cards : h);
  // 官方 _process_action_seq(sequence, 15):不足前补空,超出截尾
  let seq = moves.slice(-15);
  while (seq.length < 15) seq.unshift([]);
  const z = new Float32Array(Z_SHAPE[0] * Z_SHAPE[1]);
  for (let i = 0; i < 15; i++) {
    const onehot = cardsTo54(seq[i]);
    const row = Math.floor(i / 3);
    const block = (i % 3) * NUM_CARDS;
    for (let k = 0; k < NUM_CARDS; k++) {
      if (onehot[k]) z[row * Z_SHAPE[1] + block + k] = 1;
    }
  }
  return z;
}

// 官方 _get_one_hot_array(num_left_cards, max):vec[num-1]=1,num=0 → 末位(负索引回卷)
function numLeftOneHot(num, max) {
  const v = new Float32Array(max);
  const idx = num >= 1 ? num - 1 : max - 1;
  v[idx] = 1;
  return v;
}

function bombOneHot(bombNum) {
  const v = new Float32Array(15);
  v[Math.min(bombNum, 14)] = 1;
  return v;
}

function playedCardsBySeat(state) {
  const played = [[], [], []];
  for (const h of state.history) {
    for (const c of h.cards) played[h.seat].push(c);
  }
  return played;
}

function lastActionBySeat(state) {
  const last = [[], [], []];
  for (const h of state.history) last[h.seat] = h.cards; // 含 pass([]),与官方 last_move_dict 一致
  return last;
}

// 官方 get_last_move:末条非空取末条;末条为空(pass)取倒数第二条;空序列 → []
export function lastMoveOf(state) {
  const seq = state.history;
  if (seq.length === 0) return [];
  const last = seq[seq.length - 1].cards;
  if (last.length === 0 && seq.length >= 2) return seq[seq.length - 2].cards;
  return last;
}

// other_hand_cards:54 − 我手牌 − 全部已出牌(纯公开信息,等于官方由环境内部取的并集)
function otherHandCards(state, seat) {
  const known = new Set(state.hands[seat]);
  for (const h of state.history) for (const c of h.cards) known.add(c);
  const out = [];
  for (let i = 0; i < NUM_CARDS; i++) if (!known.has(i)) out.push(i);
  return out;
}

function countBombs(state) {
  let n = 0;
  for (const h of state.history) {
    if (h.cards.length === 4 && new Set(h.cards.map((c) => Math.floor(c / 4))).size === 1) n++;
    else if (h.cards.length === 2 && h.cards.includes(52) && h.cards.includes(53)) n++;
  }
  return n;
}

/**
 * 构建席位特征向量 x(末 54 维 = 候选动作)。
 * landlord(373):hand, other, lastAction, upPlayed, downPlayed, upLeft17, downLeft17, bomb15, action54
 * farmer(484):hand, other, landlordPlayed, teammatePlayed, lastAction,
 *              lastLandlordAction, lastTeammateAction, landlordLeft20, teammateLeft17, bomb15, action54
 */
export function buildX(state, seat, actionCards) {
  const pos = seatToPosition(state, seat);
  const hand = cardsTo54(state.hands[seat]);
  const other = cardsTo54(otherHandCards(state, seat));
  const lastAction = cardsTo54(lastMoveOf(state));
  const played = playedCardsBySeat(state);
  const lastBySeat = lastActionBySeat(state);
  const bomb = bombOneHot(countBombs(state));
  const action = cardsTo54(actionCards);

  const leftOf = (s) => state.hands[s].length;

  let segs;
  if (pos === 'landlord') {
    const up = (state.landlord + 2) % 3;   // landlord_up(上家)
    const down = (state.landlord + 1) % 3; // landlord_down(下家)
    segs = [
      hand, other, lastAction,
      cardsTo54(played[up]), cardsTo54(played[down]),
      numLeftOneHot(leftOf(up), 17), numLeftOneHot(leftOf(down), 17),
      bomb, action,
    ];
  } else {
    const teammate = pos === 'landlord_up' ? (state.landlord + 1) % 3 : (state.landlord + 2) % 3;
    segs = [
      hand, other,
      cardsTo54(played[state.landlord]), cardsTo54(played[teammate]),
      lastAction,
      cardsTo54(lastBySeat[state.landlord]), cardsTo54(lastBySeat[teammate]),
      numLeftOneHot(leftOf(state.landlord), 20), numLeftOneHot(leftOf(teammate), 17),
      bomb, action,
    ];
  }
  const total = segs.reduce((s, v) => s + v.length, 0);
  const expected = X_DIMS[pos];
  if (total !== expected) throw new Error(`x 维度错误: ${total} ≠ ${expected}(${pos})`);
  const x = new Float32Array(total);
  let off = 0;
  for (const s of segs) { x.set(s, off); off += s.length; }
  return x;
}

/**
 * 候选批量:z 为共享的 [5*162] 单份, x 为 [B × 席位维度]。
 * 返回 { z, x, count, dim } —— onnx 输入由 douzero.js 展开为 [B,5,162] / [B,dim]。
 */
export function buildBatch(state, seat, candidates) {
  const pos = seatToPosition(state, seat);
  const dim = X_DIMS[pos];
  const count = candidates.length;
  const z = seqToZ(state.history);
  const x = new Float32Array(count * dim);
  for (let i = 0; i < count; i++) {
    x.set(buildX(state, seat, candidates[i]), i * dim);
  }
  return { z, x, count, dim };
}
