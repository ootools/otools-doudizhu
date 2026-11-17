// AI vs AI 整局回放 harness。session 可选(hard 档注入 onnx 会话,Task 17 用)。
import { newGame, bid, play, settle, legalMoves } from '../../web/js/engine/game.js';
import { chooseBid, choosePlay } from '../../web/js/engine/ai.js';
import { mulberry32 } from './rng.js';

/**
 * 打完整局。返回 { state, settle, steps, degraded }。
 * degraded: level='hard' 但未提供 session 时降级为 normal 并标注。
 */
export async function playFullGame({ level = 'normal', seed = 1, session = null } = {}) {
  let s = newGame({ rng: mulberry32(seed) });
  let redeals = 0;
  while (s.phase === 'bid') {
    if (++redeals > 30) throw new Error('叫分不终止(全不叫重发过多)');
    const seat = s.bidTurn;
    const v = chooseBid(s, seat, { level, rng: mulberry32(seed * 7919 + redeals) });
    s = bid(s, seat, v, { rng: mulberry32(seed * 104729 + redeals) });
  }
  const steps = [];
  let guard = 0;
  while (s.phase === 'play') {
    if (++guard > 500) throw new Error('对局不终止(步数超限)');
    const seat = s.turn;
    let cards;
    if (session) {
      const picks = legalMoves(s, seat);
      cards = picks.length === 0
        ? []
        : (await session.pickMove(s, seat, picks)).cards;
    } else {
      cards = choosePlay(s, seat, { level, rng: mulberry32(seed * 31 + guard) });
    }
    steps.push({ seat, cards });
    s = play(s, seat, cards);
  }
  return { state: s, settle: settle(s), steps, degraded: level === 'hard' && !session };
}
