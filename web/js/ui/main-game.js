// 对局控制器:引擎 ↔ UI 装配。座位约定:0=我(底部),1=右侧(下家),2=左侧(上家)。
import { newGame, bid, play, legalBids, legalMoves, settle, serialize, restore } from '../engine/game.js';
import { chooseBid, choosePlay } from '../engine/ai.js';
import { genType } from '../engine/cards.js';
import { themeCopy } from '../../data/themes.js';
import { renderTable } from './table.js';
import { sfx } from '../audio.js';

const delay = (rng) => 600 + Math.floor(rng() * 600);

export function createGameController({
  container, level = 'normal', theme, store,
  session = null, recorderVisible = true, onSettle = () => {}, rng = Math.random,
  initialState = null, onToggleBgm = () => {}, bgmOn = false,
}) {
  let state = null;
  let timer = null;
  let destroyed = false;
  const ui = {
    selected: new Set(), eventText: '', errorText: '',
    lastPlays: {}, recorderVisible,
    onBid: (v) => humanBid(v), onPass: () => humanPass(), onPlay: () => humanPlay(),
    onHint: () => humanHint(), onToggleCard: (id) => toggleCard(id),
    onToggleBgm: () => { ui.bgmOn = !ui.bgmOn; onToggleBgm(ui.bgmOn); render(); },
    bgmOn,
  };
  const seatName = (seat) => (seat === 0 ? '我' : theme.aiNames[seat - 1] || `AI${seat}`);
  // hard 档但会话不可用 → 降 normal(设计稿降级链)
  const aiLevel = () => (level === 'easy' ? 'easy' : 'normal');

  function schedule(fn, ms) {
    clearTimeout(timer);
    timer = setTimeout(() => { if (!destroyed) fn(); }, ms);
  }

  // 从 history 尾部重建「当前圈各座位最近出牌」:连续两过 → 清空
  function lastPlaysFromHistory(history) {
    const map = {};
    let passes = 0;
    for (const h of history) {
      if (h.cards.length === 0) {
        passes++;
        if (passes >= 2) { for (const k of Object.keys(map)) delete map[k]; passes = 0; }
      } else {
        map[h.seat] = h.cards;
        passes = 0;
      }
    }
    return map;
  }

  function bubbleFor(seat, cards) {
    if (cards.length === 0) return themeCopy(theme, 'pass', { name: seatName(seat) });
    const combo = genType(cards);
    if (combo.type === 'rocket') return themeCopy(theme, 'rocket', { name: seatName(seat) });
    if (combo.type === 'bomb') return themeCopy(theme, 'bomb', { name: seatName(seat) });
    return '';
  }

  function render() {
    renderTable(container, {
      state, theme,
      ui: {
        ...ui,
        legalBids: state.phase === 'bid' ? legalBids(state, 0) : [],
        lastPlays: lastPlaysFromHistory(state.history),
      },
    });
  }

  function afterChange() {
    if (destroyed) return;
    if (state.phase === 'settle') {
      store.clearGame();
      render();
      const r = settle(state);
      sfx(r.deltas[0] > 0 ? 'win' : 'lose');
      onSettle(r, state);
      return;
    }
    store.saveGame(state);
    render();
    aiStep();
  }

  function aiStep() {
    if (state.phase === 'bid') {
      const seat = state.bidTurn;
      if (seat === 0) return; // 等人
      schedule(() => {
        const v = chooseBid(state, seat, { level: aiLevel(), rng });
        state = bid(state, seat, v, { rng });
        ui.eventText = v === 0
          ? themeCopy(theme, 'pass', { name: seatName(seat) })
          : themeCopy(theme, 'bid', { name: seatName(seat), score: v });
        sfx(v === 0 ? 'pass' : 'bid');
        afterChange();
      }, delay(rng));
    } else if (state.phase === 'play') {
      const seat = state.turn;
      if (seat === 0) return;
      schedule(async () => {
        const moves = legalMoves(state, seat);
        let cards;
        if (moves.length === 0) {
          cards = [];
        } else if (session && level === 'hard') {
          try {
            cards = (await session.pickMove(state, seat, moves)).cards;
          } catch (e) {
            cards = choosePlay(state, seat, { level: aiLevel(), rng }); // 降级兜底
          }
        } else {
          cards = choosePlay(state, seat, { level: aiLevel(), rng });
        }
        applyMove(seat, cards);
      }, delay(rng));
    }
  }

  function applyMove(seat, cards) {
    state = play(state, seat, cards);
    ui.eventText = bubbleFor(seat, cards);
    ui.selected.clear();
    ui.errorText = '';
    // 音效:过 / 炸弹 / 火箭 / 普通出牌
    if (cards.length === 0) sfx('pass');
    else {
      const c = genType(cards);
      if (c.type === 'rocket') sfx('rocket');
      else if (c.type === 'bomb') sfx('bomb');
      else sfx('play');
    }
    afterChange();
  }

  function humanBid(v) {
    if (state.phase !== 'bid' || state.bidTurn !== 0) return;
    state = bid(state, 0, v, { rng });
    ui.eventText = v === 0
      ? themeCopy(theme, 'pass', { name: '我' })
      : themeCopy(theme, 'bid', { name: '我', score: v });
    sfx(v === 0 ? 'pass' : 'bid');
    afterChange();
  }

  function toggleCard(id) {
    if (ui.selected.has(id)) ui.selected.delete(id);
    else ui.selected.add(id);
    ui.errorText = '';
    render();
  }

  function humanPass() {
    if (state.phase !== 'play' || state.turn !== 0 || !state.lastPlay) return;
    applyMove(0, []);
  }

  function humanPlay() {
    if (state.phase !== 'play' || state.turn !== 0) return;
    const selected = [...ui.selected].sort((a, b) => a - b);
    if (selected.length === 0) {
      ui.errorText = '请先点选要出的牌';
      sfx('error');
      render();
      return;
    }
    const legal = legalMoves(state, 0);
    if (!legal.some((m) => m.join(',') === selected.join(','))) {
      ui.errorText = '不是合法牌型或压不过上家';
      sfx('error');
      render();
      return;
    }
    applyMove(0, selected);
  }

  // 提示:当前对局最高引擎推荐(easy/normal 用规则 AI;hard 局由 session 接管,Task 15)
  async function humanHint() {
    if (state.phase !== 'play' || state.turn !== 0) return;
    let suggestion = null;
    if (session && level === 'hard') {
      const moves = legalMoves(state, 0);
      if (moves.length > 0) {
        try { suggestion = (await session.pickMove(state, 0, moves)).cards; } catch (e) { /* 降级 */ }
      }
    }
    if (!suggestion) {
      suggestion = choosePlay(state, 0, { level: aiLevel(), rng });
    }
    if (!suggestion || suggestion.length === 0) {
      ui.errorText = state.lastPlay ? '要不起,请点「不出」' : '';
      ui.selected.clear();
    } else {
      ui.selected = new Set(suggestion);
      ui.errorText = '';
    }
    render();
  }

  function start() {
    state = initialState || newGame({ rng });
    ui.selected.clear();
    ui.errorText = '';
    ui.eventText = themeCopy(theme, 'deal');
    if (!initialState) sfx('deal');
    if (state.phase === 'settle') {
      render();
      onSettle(settle(state), state);
      return;
    }
    render();
    aiStep();
  }

  function destroy() {
    destroyed = true;
    clearTimeout(timer);
  }

  return { start, destroy, getState: () => state };
}
