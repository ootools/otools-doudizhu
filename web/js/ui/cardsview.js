// 扑克牌 DOM 组件(纯 CSS/SVG,无位图)。suit: 0♠ 1♥ 2♣ 3♦(DouZero 花色序)
const SUITS = ['♠', '♥', '♣', '♦'];

function isRed(suit) { return suit === 1 || suit === 3; }

function faceOf(cardId) {
  const rank = Math.floor(cardId / 4);
  const suit = cardId % 4;
  if (cardId === 52) return { text: '王', suit: 'joker', label: '小王' };
  if (cardId === 53) return { text: '王', suit: 'joker', label: '大王' };
  return { text: RANK_TEXT[rank], suit, label: RANK_TEXT[rank] };
}

const RANK_TEXT = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

export function cardEl(cardId, { selected = false, dim = false, small = false } = {}) {
  const f = faceOf(cardId);
  const el = document.createElement('div');
  el.className = [
    'card',
    f.suit === 'joker' ? (cardId === 53 ? 'red' : 'black') : (isRed(f.suit) ? 'red' : 'black'),
    selected ? 'selected' : '',
    dim ? 'dim' : '',
    small ? 'small' : '',
  ].filter(Boolean).join(' ');
  el.dataset.card = String(cardId);

  const corner = document.createElement('div');
  corner.className = 'card-corner';
  const rankText = document.createElement('span');
  rankText.textContent = f.suit === 'joker' ? '★' : f.text;
  const cornerSuit = document.createElement('span');
  cornerSuit.className = 'corner-suit';
  cornerSuit.textContent = f.suit === 'joker' ? (cardId === 53 ? 'JOKER' : 'JOKER') : SUITS[f.suit];
  corner.append(rankText, cornerSuit);
  const ghost = document.createElement('div');
  ghost.className = 'ghost';
  ghost.textContent = f.suit === 'joker' ? '☀' : SUITS[f.suit];
  el.append(corner, ghost);
  if (f.suit === 'joker') {
    const tag = document.createElement('div');
    tag.className = 'card-joker-tag';
    tag.textContent = cardId === 53 ? '大' : '小';
    el.append(tag);
  }
  return el;
}

// 手牌:横排叠放,点选升起
export function handEl(cards, { selectable = false, selectedSet = new Set(), onSelect = null } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'hand';
  cards.forEach((id, i) => {
    const el = cardEl(id, { selected: selectedSet.has(id) });
    if (selectable) {
      el.classList.add('selectable');
      el.addEventListener('click', () => onSelect && onSelect(id, i, el));
    }
    wrap.append(el);
  });
  return wrap;
}

// 出牌区展示(小尺寸横排)
export function playedEl(cards) {
  const wrap = document.createElement('div');
  wrap.className = 'played';
  if (!cards || cards.length === 0) {
    const p = document.createElement('span');
    p.className = 'pass-tag';
    p.textContent = '不出';
    wrap.append(p);
    return wrap;
  }
  for (const id of cards) wrap.append(cardEl(id, { small: true }));
  return wrap;
}
