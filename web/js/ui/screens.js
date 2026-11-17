// 首屏 / 结算 / 战绩 三屏(纯 DOM,store 注入)
import { getTheme, THEMES } from '../../data/themes.js';
import { setSfxEnabled, setBgmEnabled } from '../audio.js';

export function applyThemeVars(theme, root = document.documentElement) {
  const p = theme.palette;
  const map = {
    '--felt': p.felt, '--felt-deep': p.feltDeep || '#175233', '--bg': p.bg, '--panel': p.panel,
    '--accent': p.accent, '--card-face': p.cardFace, '--card-red': p.cardRed,
    '--card-black': p.cardBlack, '--text': p.text, '--text-dim': p.textDim,
  };
  for (const [k, v] of Object.entries(map)) root.style.setProperty(k, v);
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** 首屏:继续上局 / 新对局(难度+主题+记牌器) / 战绩 */
export function homeScreen(app, { store, onResume, onStart, onStats }) {
  const saved = store.loadGame();
  const prefs = store.getPrefs();
  const savedTheme = store.getTheme();
  const root = el('div', 'screen home-screen');
  const hero = el('div', 'hero');
  const fan = el('div', 'hero-cards');
  for (let i = 0; i < 3; i++) {
    const back = document.createElement('div');
    back.className = 'card back';
    fan.append(back);
  }
  hero.append(fan);
  hero.append(el('h1', 'home-title', '斗地主'));
  root.append(hero);
  root.append(el('p', 'home-sub', '经典三人本机对局 · easy/normal 规则 AI · hard 档 DouZero 神经网络强 AI · 完全离线'));

  if (saved && saved.phase && saved.phase !== 'settle') {
    const resume = el('button', 'primary home-resume', '继续上局');
    resume.addEventListener('click', () => onResume());
    root.append(resume);
  }

  // 难度
  const lvCard = el('div', 'option-card');
  const lvBox = el('div', 'option-group');
  lvBox.append(el('div', 'option-label', '难度'));
  const lvBtns = {};
  for (const [id, label] of [['easy', '简单'], ['normal', '普通'], ['hard', '困难(DouZero)']]) {
    const b = el('button', 'option-btn' + (prefs.level === id ? ' picked' : ''), label);
    b.addEventListener('click', () => {
      prefs.level = id;
      for (const k of Object.keys(lvBtns)) lvBtns[k].classList.toggle('picked', k === id);
    });
    lvBtns[id] = b;
    lvBox.append(b);
  }
  lvCard.append(lvBox);
  root.append(lvCard);

  // 主题
  const themeCard = el('div', 'option-card');
  const themeBox = el('div', 'option-group');
  themeBox.append(el('div', 'option-label', '牌桌皮肤'));
  const themeBtns = {};
  for (const t of THEMES) {
    const b = el('button', 'option-btn theme-btn' + ((savedTheme?.id || 'green') === t.id ? ' picked' : ''));
    const swatch = el('span', 'theme-swatch');
    swatch.style.background = `radial-gradient(circle, ${t.palette.felt}, ${t.palette.accent})`;
    b.append(swatch, el('span', '', t.name));
    b.addEventListener('click', () => {
      savedTheme && (savedTheme.id = t.id);
      applyThemeVars(t);
      store.setTheme({ id: t.id });
      for (const k of Object.keys(themeBtns)) themeBtns[k].classList.toggle('picked', k === t.id);
    });
    themeBtns[t.id] = b;
    themeBox.append(b);
  }
  themeCard.append(themeBox);
  root.append(themeCard);

  // 记牌器
  const recCard = el('div', 'option-card');
  const recBox = el('div', 'option-group');
  recBox.append(el('div', 'option-label', '记牌器'));
  const recBtn = el('button', 'option-btn' + (prefs.recorder ? ' picked' : ''), prefs.recorder ? '开' : '关');
  recBtn.addEventListener('click', () => {
    prefs.recorder = !prefs.recorder;
    recBtn.textContent = prefs.recorder ? '开' : '关';
    recBtn.classList.toggle('picked', prefs.recorder);
  });
  recBox.append(recBtn);
  recCard.append(recBox);
  root.append(recCard);

  // 声音(音效 + 背景音乐)
  const sndCard = el('div', 'option-card');
  const sndBox = el('div', 'option-group');
  sndBox.append(el('div', 'option-label', '声音'));
  const sfxBtn = el('button', 'option-btn' + (prefs.sound ? ' picked' : ''), `音效 ${prefs.sound ? '开' : '关'}`);
  sfxBtn.addEventListener('click', () => {
    prefs.sound = !prefs.sound;
    store.setPrefs({ sound: prefs.sound });
    setSfxEnabled(prefs.sound);
    sfxBtn.textContent = `音效 ${prefs.sound ? '开' : '关'}`;
    sfxBtn.classList.toggle('picked', prefs.sound);
  });
  const bgmBtn = el('button', 'option-btn' + (prefs.bgm ? ' picked' : ''), `音乐 ${prefs.bgm ? '开' : '关'}`);
  bgmBtn.addEventListener('click', () => {
    prefs.bgm = !prefs.bgm;
    store.setPrefs({ bgm: prefs.bgm });
    setBgmEnabled(prefs.bgm); // 首屏点击即手势,可安全启动
    bgmBtn.textContent = `音乐 ${prefs.bgm ? '开' : '关'}`;
    bgmBtn.classList.toggle('picked', prefs.bgm);
  });
  sndBox.append(sfxBtn, bgmBtn);
  sndCard.append(sndBox);
  root.append(sndCard);

  const start = el('button', 'primary home-start', '开始新对局');
  start.addEventListener('click', () => {
    store.setPrefs({ level: prefs.level, recorder: prefs.recorder });
    onStart({ level: prefs.level, themeId: (store.getTheme() || { id: 'green' }).id, recorder: prefs.recorder });
  });
  root.append(start);

  const statsBtn = el('button', 'home-stats-link', '战绩');
  statsBtn.addEventListener('click', () => onStats());
  root.append(statsBtn);

  app.innerHTML = '';
  app.append(root);
}

/** 结算页:胜负 / 倍数明细 / 各座位得分 / 再来一局 */
export function settleScreen(app, { settle, state, store, theme, onAgain, onHome }) {
  const me = 0;
  const iWon = settle.deltas[me] > 0;
  const role = state.landlord === me ? '地主' : '农民';
  const root = el('div', 'screen settle-screen');
  root.append(el('h1', iWon ? 'settle-title win' : 'settle-title lose', iWon ? '🎉 我赢了' : '😅 我输了'));
  root.append(el('p', 'settle-sub', `${role} · ${settle.winner === 'landlord' ? '地主胜' : '农民胜'}`));

  const detail = el('div', 'settle-detail');
  const rows = [
    ['底分', String(settle.baseScore)],
    ['炸弹/火箭倍数', `×${state.multiplier}`],
    [settle.spring ? '春天 ×2' : settle.antiSpring ? '反春 ×2' : '无春天/反春', ''],
    ['总倍数', `×${settle.multiplier}`],
  ];
  for (const [k, v] of rows) {
    const row = el('div', 'settle-row');
    row.append(el('span', '', k), el('span', '', v));
    detail.append(row);
  }
  root.append(detail);

  const scoreBox = el('div', 'settle-scores');
  const names = ['我', theme.aiNames[0], theme.aiNames[1]];
  const roles = [0, 1, 2].map((s) => (s === state.landlord ? '地主' : '农民'));
  [0, 1, 2].forEach((s) => {
    const row = el('div', 'settle-row');
    const d = settle.deltas[s];
    row.append(el('span', '', `${names[s]}(${roles[s]})`), el('span', d > 0 ? 'delta plus' : 'delta minus', `${d > 0 ? '+' : ''}${d}`));
    scoreBox.append(row);
  });
  root.append(scoreBox);

  const stats = store.getStats();
  root.append(el('p', 'settle-total', `我的总分 ${stats.score}(战绩 ${stats.wins}/${stats.games} 胜)`));

  const again = el('button', 'primary', '再来一局');
  again.addEventListener('click', () => onAgain());
  const home = el('button', '', '回首页');
  home.addEventListener('click', () => onHome());
  const btns = el('div', 'settle-actions');
  btns.append(again, home);
  root.append(btns);

  app.innerHTML = '';
  app.append(root);
}

/** 战绩页 */
export function statsScreen(app, { store, onBack }) {
  const st = store.getStats();
  const root = el('div', 'screen stats-screen');
  root.append(el('h1', 'home-title', '📊 战绩'));
  const rows = [
    ['总场次', st.games],
    ['总胜场', st.wins],
    ['地主胜', st.landlordWins],
    ['农民胜', st.farmerWins],
    ['总积分', st.score],
  ];
  for (const [k, v] of rows) {
    const row = el('div', 'settle-row');
    row.append(el('span', '', k), el('span', 'stats-num', String(v)));
    root.append(row);
  }
  const back = el('button', 'primary', '返回');
  back.addEventListener('click', () => onBack());
  root.append(back);
  app.innerHTML = '';
  app.append(root);
}
