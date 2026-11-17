// 斗地主牌表示与牌型引擎(纯函数,零 DOM,node --test 可测)
// 卡牌编码用 DouZero 约定:card id 0..53,rank = floor(id/4),
// rank 0..12 对应 3,4,...,K,A,2;52 = 小王,53 = 大王;花色 = id % 4。

export const RANK_NAMES = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '小王', '大王'];
export const NUM_CARDS = 54;

export function newDeck() {
  return Array.from({ length: NUM_CARDS }, (_, i) => i);
}

export function rankOf(id) {
  // 小王 52 → 13,大王 53 → 14(王不是每 rank 4 张,需特判)
  return id >= 52 ? 13 + (id - 52) : Math.floor(id / 4);
}

// Fisher-Yates;rng 注入(测试用种子),默认 Math.random
export function shuffle(deck, rng = Math.random) {
  const a = deck;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function countsOf(cards) {
  const counts = new Array(15).fill(0);
  for (const id of cards) counts[rankOf(id)]++;
  return counts;
}

function hasRun(ranks) {
  // ranks: 升序 distinct;返回最长连续段 [start, end](含)
  let best = null;
  let s = 0;
  for (let i = 1; i <= ranks.length; i++) {
    if (i === ranks.length || ranks[i] !== ranks[i - 1] + 1) {
      if (best === null || i - s > best[1] - best[0] + 1) best = [s, i - 1];
      s = i;
    }
  }
  return best;
}

/**
 * 识别牌型。返回 { type, rank, len, cards } 或 null。
 * type: single/pair/trio/trio_single/trio_pair/straight/pair_straight/
 *       plane/plane_single/plane_pair/four_two_single/four_two_pair/bomb/rocket
 * rank: 主链最小 rank(炸弹 12,火箭 13);len 仅顺子/连对/飞机系列有(主链长度)。
 * 解析优先级:rocket > bomb > straight > pair_straight > plane 系列 > four_two 系列 > trio 系列。
 * 主链(顺/连对/飞机)不含 2 与王;飞机取最长连续三张链;翅膀不含炸弹、不成火箭。
 */
export function genType(cards) {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  const seen = new Set();
  for (const id of cards) {
    if (!Number.isInteger(id) || id < 0 || id >= NUM_CARDS || seen.has(id)) return null;
    seen.add(id);
  }
  const n = cards.length;
  const counts = countsOf(cards);
  const sorted = [...cards].sort((a, b) => a - b);

  if (n === 2 && counts[13] === 1 && counts[14] === 1) {
    return { type: 'rocket', rank: 13, len: null, cards: sorted };
  }
  const quadRank = counts.findIndex((c) => c === 4);
  if (n === 4 && quadRank >= 0) {
    return { type: 'bomb', rank: quadRank, len: null, cards: sorted };
  }

  // 顺子:全单张连续,≤ A(rank 11)
  const distinctRanks = [];
  for (let r = 0; r < 15; r++) if (counts[r] > 0) distinctRanks.push(r);
  if (n >= 5 && distinctRanks.length === n && distinctRanks[n - 1] <= 11 &&
      distinctRanks[n - 1] - distinctRanks[0] === n - 1) {
    return { type: 'straight', rank: distinctRanks[0], len: n, cards: sorted };
  }
  // 连对:全成对连续,≥3 连,≤ A
  if (n >= 6 && n % 2 === 0 && distinctRanks.length === n / 2 &&
      distinctRanks.every((r) => counts[r] === 2) && distinctRanks[n / 2 - 1] <= 11 &&
      distinctRanks[n / 2 - 1] - distinctRanks[0] === n / 2 - 1) {
    return { type: 'pair_straight', rank: distinctRanks[0], len: n / 2, cards: sorted };
  }

  // 飞机系列:主链 = 最长连续「三张及以上」rank 段(≥2,≤ A),翅膀不含炸弹/火箭
  const trioRanks = [];
  for (let r = 0; r <= 11; r++) if (counts[r] >= 3) trioRanks.push(r);
  if (trioRanks.length >= 2) {
    const [s, e] = hasRun(trioRanks);
    if (e - s + 1 >= 2) {
      const chain = trioRanks.slice(s, e + 1);
      const k = chain.length;
      const restCounts = [...counts];
      for (const r of chain) restCounts[r] -= 3;
      const restLen = n - 3 * k;
      const restRanks = [];
      for (let r = 0; r < 15; r++) if (restCounts[r] > 0) restRanks.push(r);
      if (restLen === 0) {
        return { type: 'plane', rank: chain[0], len: k, cards: sorted };
      }
      // 飞机带单翅膀可为双王(官方 type_11 实测产出 [3,3,3,4,4,4,20,30])
      if (restLen === k && restCounts.every((c) => c <= 2)) {
        return { type: 'plane_single', rank: chain[0], len: k, cards: sorted };
      }
      if (restLen === 2 * k &&
          restRanks.length === k && restRanks.every((r) => restCounts[r] === 2 && r !== 13 && r !== 14)) {
        return { type: 'plane_pair', rank: chain[0], len: k, cards: sorted };
      }
    }
  }

  // 四带二系列(翅膀可为双王:官方 type_13 实测产出 [0,0,0,0,20,30])
  if (n === 6 && quadRank >= 0) {
    return { type: 'four_two_single', rank: quadRank, len: null, cards: sorted };
  }
  if (n === 8 && quadRank >= 0) {
    const rest = counts.slice();
    rest[quadRank] = 0;
    const restRanks = [];
    for (let r = 0; r < 15; r++) if (rest[r] > 0) restRanks.push(r);
    if (restRanks.length === 2 && restRanks.every((r) => rest[r] === 2 && r !== 13 && r !== 14)) {
      return { type: 'four_two_pair', rank: quadRank, len: null, cards: sorted };
    }
  }

  // trio 系列
  if (n === 3) {
    const r = counts.findIndex((c) => c === 3);
    if (r >= 0 && r <= 12) return { type: 'trio', rank: r, len: null, cards: sorted };
  }
  if (n === 4) {
    const r = counts.findIndex((c) => c === 3);
    if (r >= 0) return { type: 'trio_single', rank: r, len: null, cards: sorted };
  }
  if (n === 5) {
    const r = counts.findIndex((c) => c === 3);
    if (r >= 0) {
      const p = counts.findIndex((c) => c === 2);
      if (p >= 0) return { type: 'trio_pair', rank: r, len: null, cards: sorted };
    }
  }
  if (n === 2) {
    const r = counts.findIndex((c) => c === 2);
    if (r >= 0 && r <= 12) return { type: 'pair', rank: r, len: null, cards: sorted };
  }
  if (n === 1) {
    return { type: 'single', rank: rankOf(sorted[0]), len: null, cards: sorted };
  }
  return null;
}

/** move 能否压过 last(last 为 null 表示自由出牌,恒可)。 */
export function canBeat(move, last) {
  if (!last) return true;
  if (move.type === 'rocket') return true;
  if (last.type === 'rocket') return false;
  if (move.type === 'bomb') {
    return last.type !== 'bomb' || move.rank > last.rank;
  }
  if (last.type === 'bomb') return false;
  if (move.type !== last.type) return false;
  if ((move.len ?? 0) !== (last.len ?? 0)) return false;
  return move.rank > last.rank;
}

// ---------------------------------------------------------------------------
// 合法出牌枚举
// ---------------------------------------------------------------------------

// 每个 rank 手里实际的牌 id(升序)
function byRankOf(hand) {
  const byRank = Array.from({ length: 15 }, () => []);
  for (const c of [...hand].sort((a, b) => a - b)) byRank[rankOf(c)].push(c);
  return byRank;
}

// 从 byRank 挖走 used 的 {rank: n} 张(每 rank 最小 n 张)后,剩余可作翅膀的牌
function poolMinus(byRank, used) {
  const pool = Array.from({ length: 15 }, () => []);
  for (let r = 0; r < 15; r++) {
    const start = used[r] || 0;
    for (let i = start; i < byRank[r].length; i++) pool[r].push(byRank[r][i]);
  }
  return pool;
}

// 翅膀「单张」组合:多重集枚举(rank 规范化,每单位取该 rank 依次未用的最小 id)
// 双王同选合法(官方 type_11/type_13 实测产出),不再剔除
function wingCombos(pool, k) {
  const out = [];
  const acc = [];
  (function rec(minR) {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let r = minR; r < 15; r++) {
      const usedOfR = acc.reduce((n, c) => n + (rankOf(c) === r ? 1 : 0), 0);
      if (usedOfR >= pool[r].length) continue;
      acc.push(pool[r][usedOfR]);
      rec(r);
      acc.pop();
    }
  })(0);
  return out;
}

// 翅膀「对子」组合:k 个 distinct rank(王不成对),每 rank 取最小两张
function wingPairs(pool, k) {
  const out = [];
  (function rec(minR, acc) {
    if (acc.length === k * 2) { out.push([...acc]); return; }
    for (let r = minR; r <= 12; r++) {
      if (pool[r].length < 2) continue;
      acc.push(pool[r][0], pool[r][1]);
      rec(r + 1, acc);
      acc.length -= 2;
    }
  })(0, []);
  return out;
}

// 顺子/连对滑窗(rank 规范化,每 rank 取最小 size 张),rank ≤ A(11)
function straightOf(byRank, len, size, fromRank, push) {
  for (let r = fromRank; r + len - 1 <= 11; r++) {
    let ok = true;
    for (let i = 0; i < len; i++) if (byRank[r + i].length < size) { ok = false; break; }
    if (!ok) continue;
    const cards = [];
    for (let i = 0; i < len; i++) cards.push(...byRank[r + i].slice(0, size));
    push(cards);
  }
}

function genFree(counts, byRank, push) {
  for (const c of byRank.flat()) push([c]); // 单张:每张牌都是独立动作
  for (let r = 0; r <= 12; r++) {
    if (counts[r] >= 2) push(byRank[r].slice(0, 2)); // pair:rank 规范化(最小花色)
    if (counts[r] >= 3) push(byRank[r].slice(0, 3)); // trio:同上
  }
  // 三带一 / 三带二
  for (let r = 0; r <= 12; r++) {
    if (counts[r] < 3) continue;
    const trio = byRank[r].slice(0, 3);
    const pool = poolMinus(byRank, { [r]: 3 });
    for (const w of wingCombos(pool, 1)) push([...trio, ...w]);
    for (const w of wingPairs(pool, 1)) push([...trio, ...w]);
  }
  // 顺子 / 连对
  for (let len = 5; len <= 12; len++) straightOf(byRank, len, 1, 0, push);
  for (let len = 3; len <= 10; len++) straightOf(byRank, len, 2, 0, push);
  // 飞机系列
  for (let k = 2; k <= 6; k++) {
    for (let r = 0; r + k - 1 <= 11; r++) {
      let ok = true;
      const chain = [];
      const used = {};
      for (let i = 0; i < k; i++) {
        if (byRank[r + i].length < 3) { ok = false; break; }
        chain.push(...byRank[r + i].slice(0, 3));
        used[r + i] = 3;
      }
      if (!ok) continue;
      push(chain);
      const pool = poolMinus(byRank, used);
      for (const w of wingCombos(pool, k)) push([...chain, ...w]);
      for (const w of wingPairs(pool, k)) push([...chain, ...w]);
    }
  }
  // 四带二
  for (let r = 0; r <= 12; r++) {
    if (counts[r] !== 4) continue;
    const quad = byRank[r].slice(0, 4);
    const pool = poolMinus(byRank, { [r]: 4 });
    for (const w of wingCombos(pool, 2)) push([...quad, ...w]);
    for (const w of wingPairs(pool, 2)) push([...quad, ...w]);
  }
  // 炸弹/火箭收尾(约定:非炸弹在前)
  for (let r = 0; r <= 12; r++) if (counts[r] === 4) push(byRank[r].slice());
  if (counts[13] === 1 && counts[14] === 1) push([52, 53]);
}

function genFollow(counts, byRank, last, push) {
  if (last.type === 'rocket') return;
  const t = last.type;
  const minR = last.rank + 1;
  if (t === 'bomb') {
    for (let r = minR; r <= 12; r++) if (counts[r] === 4) push(byRank[r].slice());
    if (counts[13] === 1 && counts[14] === 1) push([52, 53]);
    return;
  }
  if (t === 'single') {
    for (let r = minR; r < 15; r++) for (const c of byRank[r]) push([c]);
  } else if (t === 'pair') {
    for (let r = minR; r <= 12; r++) if (counts[r] >= 2) push(byRank[r].slice(0, 2));
  } else if (t === 'trio') {
    for (let r = minR; r <= 12; r++) if (counts[r] >= 3) push(byRank[r].slice(0, 3));
  } else if (t === 'trio_single' || t === 'trio_pair') {
    for (let r = minR; r <= 12; r++) {
      if (counts[r] < 3) continue;
      const trio = byRank[r].slice(0, 3);
      const pool = poolMinus(byRank, { [r]: 3 });
      if (t === 'trio_single') for (const w of wingCombos(pool, 1)) push([...trio, ...w]);
      else for (const w of wingPairs(pool, 1)) push([...trio, ...w]);
    }
  } else if (t === 'straight') {
    straightOf(byRank, last.len, 1, minR, push);
  } else if (t === 'pair_straight') {
    straightOf(byRank, last.len, 2, minR, push);
  } else if (t === 'plane' || t === 'plane_single' || t === 'plane_pair') {
    const k = last.len;
    for (let r = minR; r + k - 1 <= 11; r++) {
      let ok = true;
      const chain = [];
      const used = {};
      for (let i = 0; i < k; i++) {
        if (byRank[r + i].length < 3) { ok = false; break; }
        chain.push(...byRank[r + i].slice(0, 3));
        used[r + i] = 3;
      }
      if (!ok) continue;
      if (t === 'plane') { push(chain); continue; }
      const pool = poolMinus(byRank, used);
      if (t === 'plane_single') for (const w of wingCombos(pool, k)) push([...chain, ...w]);
      else for (const w of wingPairs(pool, k)) push([...chain, ...w]);
    }
  } else if (t === 'four_two_single' || t === 'four_two_pair') {
    for (let r = minR; r <= 12; r++) {
      if (counts[r] !== 4) continue;
      const quad = byRank[r].slice();
      const pool = poolMinus(byRank, { [r]: 4 });
      if (t === 'four_two_single') for (const w of wingCombos(pool, 2)) push([...quad, ...w]);
      else for (const w of wingPairs(pool, 2)) push([...quad, ...w]);
    }
  }
  // 任何非火箭 last 都可被炸弹/火箭压
  for (let r = 0; r <= 12; r++) if (counts[r] === 4) push(byRank[r].slice());
  if (counts[13] === 1 && counts[14] === 1) push([52, 53]);
}

/**
 * 合法出牌枚举。hand: card ids;last: Combo|null。
 * last=null 返回自由出牌全集(非炸弹在前,炸弹/火箭收尾);
 * last 给定返回同型同长可压 + 炸弹 + 火箭;last 为火箭返回 []。
 * 每个候选都经 genType 校验,保证是合法组合。
 */
export function genMoves(hand, last = null) {
  const out = [];
  const push = (cards) => {
    const sorted = [...cards].sort((a, b) => a - b);
    if (genType(sorted)) out.push(sorted);
  };
  const counts = countsOf(hand);
  const byRank = byRankOf(hand);
  if (last) genFollow(counts, byRank, last, push);
  else genFree(counts, byRank, push);
  return out;
}
