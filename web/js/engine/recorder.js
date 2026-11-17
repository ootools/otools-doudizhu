// 记牌器纯逻辑:按「未见过牌」口径统计各点数剩余张数(不作弊:只用我手牌+历史+公示底牌)
import { RANK_NAMES, rankOf } from './cards.js';

/**
 * unseenCounts(knownCards, history) → { '3': n, ..., '2': n, '小王': n, '大王': n }
 * knownCards: 我的手牌(+农民视角的公示底牌,由调用方合并);
 * history: [{ seat, cards }] 已出的牌(全员可见)。
 * 返回 15 个键全量(含 0),按未见过牌计数。
 */
export function unseenCounts(knownCards, history = []) {
  const known = new Set(knownCards);
  for (const h of history) for (const c of h.cards) known.add(c);
  const counts = {};
  for (const name of RANK_NAMES) counts[name] = 0;
  for (let i = 0; i < 54; i++) {
    if (!known.has(i)) counts[RANK_NAMES[rankOf(i)]]++;
  }
  return counts;
}
