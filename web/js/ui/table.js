// 牌桌布局渲染(状态驱动,每次全量重绘;规模小无性能压力)
import { handEl, playedEl } from './cardsview.js';
import { characterSVG } from '../../data/characters.js';
import { unseenCounts } from '../engine/recorder.js';
import { RANK_NAMES } from '../engine/cards.js';

export const SEAT_NAMES = { 0: '我', 1: 'right', 2: 'left' };

export function renderTable(container, model) {
  const { state, theme, ui } = model;
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'table';

  // ---- 顶栏:左AI / 底牌+倍数 / 右AI ----
  const top = document.createElement('div');
  top.className = 'table-top';

  const left = seatPanel(state, theme, 2, ui); // 座位2 = 左侧(上家)
  const right = seatPanel(state, theme, 1, ui); // 座位1 = 右侧(下家)
  const mid = document.createElement('div');
  mid.className = 'table-mid';
  const bottomCards = document.createElement('div');
  bottomCards.className = 'bottom-cards';
  const bottomLabel = document.createElement('div');
  bottomLabel.className = 'bottom-label';
  bottomLabel.textContent = state.phase === 'bid' ? '底牌(未翻)' : '底牌';
  bottomCards.append(bottomLabel);
  const bcRow = document.createElement('div');
  bcRow.className = 'bottom-row';
  if (state.phase !== 'bid') {
    for (const c of state.bottom) bcRow.append(playedEl([c]).firstChild);
  } else {
    for (let i = 0; i < 3; i++) {
      const back = document.createElement('div');
      back.className = 'card back small';
      bcRow.append(back);
    }
  }
  mid.append(bcRow);
  const mult = document.createElement('div');
  mult.className = 'multiplier';
  mult.textContent = `底分 ${state.baseScore || '-'} · 倍数 ×${state.multiplier}`;
  mid.append(mult);
  const bgmBtn = document.createElement('button');
  bgmBtn.className = 'bgm-btn';
  bgmBtn.textContent = ui.bgmOn ? '🔊' : '🔇';
  bgmBtn.title = '背景音乐开关';
  bgmBtn.addEventListener('click', () => ui.onToggleBgm());
  mid.append(bgmBtn);

  top.append(left, mid, right);
  root.append(top);

  // ---- 中区:左出牌 / 事件气泡 / 右出牌 ----
  const center = document.createElement('div');
  center.className = 'table-center';
  const playL = document.createElement('div');
  playL.className = 'play play-left';
  playL.append(playedEl(ui.lastPlays[2]));
  const bubble = document.createElement('div');
  bubble.className = 'event-bubble';
  if (ui.eventText) {
    const span = document.createElement('span');
    span.textContent = ui.eventText;
    bubble.append(span);
  }
  const playR = document.createElement('div');
  playR.className = 'play play-right';
  playR.append(playedEl(ui.lastPlays[1]));
  center.append(playL, bubble, playR);
  root.append(center);

  // ---- 叫分面板 / 操作按钮 ----
  const actions = document.createElement('div');
  actions.className = 'table-actions';
  if (state.phase === 'bid' && state.bidTurn === 0) {
    const legal = ui.legalBids;
    for (const v of legal) {
      const b = document.createElement('button');
      b.className = v === 0 ? '' : 'primary';
      b.textContent = v === 0 ? '不叫' : `${v} 分`;
      b.addEventListener('click', () => ui.onBid(v));
      actions.append(b);
    }
    const wait = document.createElement('span');
    wait.className = 'waiting';
    wait.textContent = '请叫分';
    actions.append(wait);
  } else if (state.phase === 'bid') {
    const wait = document.createElement('span');
    wait.className = 'waiting';
    wait.textContent = `等待 ${seatName(state, theme, state.bidTurn)} 叫分…`;
    actions.append(wait);
  } else if (state.phase === 'play' && state.turn === 0) {
    const passBtn = document.createElement('button');
    passBtn.textContent = '不出';
    passBtn.disabled = !state.lastPlay;
    passBtn.addEventListener('click', () => ui.onPass());
    const hintBtn = document.createElement('button');
    hintBtn.textContent = '提示';
    hintBtn.addEventListener('click', () => ui.onHint());
    const playBtn = document.createElement('button');
    playBtn.className = 'primary';
    playBtn.textContent = '出牌';
    playBtn.addEventListener('click', () => ui.onPlay());
    actions.append(passBtn, hintBtn, playBtn);
    if (ui.errorText) {
      const err = document.createElement('span');
      err.className = 'error-text';
      err.textContent = ui.errorText;
      actions.append(err);
    }
  } else if (state.phase === 'play') {
    const wait = document.createElement('span');
    wait.className = 'waiting';
    wait.textContent = `等待 ${seatName(state, theme, state.turn)} 出牌…`;
    actions.append(wait);
  }
  root.append(actions);

  // ---- 我的最近出牌(当前圈) ----
  if (ui.lastPlays[0]) {
    const mine = document.createElement('div');
    mine.className = 'play-mine';
    mine.append(playedEl(ui.lastPlays[0]));
    root.append(mine);
  }

  // ---- 记牌器 ----
  if (ui.recorderVisible && state.hands[0]) {
    const known = [...state.hands[0], ...(state.phase === 'play' ? state.bottom : [])];
    const counts = unseenCounts(known, state.history);
    const strip = document.createElement('div');
    strip.className = 'recorder';
    for (const name of RANK_NAMES) {
      const cell = document.createElement('div');
      cell.className = 'recorder-cell' + (counts[name] === 0 ? ' zero' : '');
      cell.innerHTML = `<span class="recorder-rank">${name}</span><span class="recorder-count">${counts[name]}</span>`;
      strip.append(cell);
    }
    root.append(strip);
  }

  // ---- 我的手牌 + 我的角色 ----
  const mineRow = document.createElement('div');
  mineRow.className = 'my-seat';
  const myStage = document.createElement('div');
  myStage.className = 'char-stage small';
  myStage.innerHTML = characterSVG('player', ui.emotions[0] || 'idle');
  const mine = handEl(state.hands[0], {
    selectable: state.phase === 'play' && state.turn === 0,
    selectedSet: ui.selected,
    onSelect: ui.onToggleCard,
  });
  mine.classList.add('my-hand');
  mineRow.append(myStage, mine);
  root.append(mineRow);

  container.append(root);
}

function seatName(state, theme, seat) {
  if (seat === 0) return '我';
  return theme.aiNames[seat - 1] || `AI${seat}`;
}

function seatPanel(state, theme, seat, ui) {
  const panel = document.createElement('div');
  panel.className = `player player-${seat === 2 ? 'left' : 'right'}`;
  const isActive = state.turn === seat || state.bidTurn === seat;
  const isLandlord = state.landlord === seat;
  const charId = seat === 0 ? 'player' : theme.aiCharacters?.[seat - 1] || 'laozhang';

  const stage = document.createElement('div');
  stage.className = `char-stage${isActive ? ' active' : ''}`;
  stage.innerHTML = characterSVG(charId, ui.emotions[seat] || 'idle');
  if (isLandlord) {
    const crown = document.createElement('div');
    crown.className = 'player-crown';
    crown.textContent = '👑';
    stage.append(crown);
  }
  const meta = document.createElement('div');
  meta.className = 'player-meta';
  const name = document.createElement('div');
  name.className = 'player-name';
  name.textContent = `${isLandlord ? '地主·' : ''}${seatName(state, theme, seat)}`;
  const count = document.createElement('div');
  count.className = 'player-count';
  count.textContent = `剩 ${state.hands[seat].length} 张`;
  meta.append(name, count);
  const plate = document.createElement('div');
  plate.className = 'player-plate';
  plate.append(meta);
  panel.append(stage, plate);
  if (ui.lastPlays[seat]) {
    panel.append(playedEl(ui.lastPlays[seat]));
  }
  return panel;
}
