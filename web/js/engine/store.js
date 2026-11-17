// localStorage 封装(存储可注入,异常一律吞掉返回默认值;零 DOM 依赖,node --test 可测)
const KEY = (s) => `otools-doudizhu:${s}`;

const DEFAULT_STATS = { games: 0, wins: 0, landlordWins: 0, farmerWins: 0, score: 0 };
const DEFAULT_PREFS = { level: 'normal', recorder: true, sound: true, bgm: true };

export function createStore(storage) {
  function read(key, fallback) {
    try {
      const raw = storage.getItem(key);
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function write(key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false; // 配额满 / 隐私模式:静默失败,游戏继续
    }
  }
  return {
    saveGame(state) { return write(KEY('game'), state); },
    loadGame() { return read(KEY('game'), null); },
    clearGame() {
      try { storage.removeItem(KEY('game')); } catch (e) { /* 忽略 */ }
    },
    getStats() { return { ...DEFAULT_STATS, ...read(KEY('stats'), {}) }; },
    // settle: game.js 的结算结果;seat: 玩家座位;landlord: 地主座位。读取-合并-写回持久化。
    recordResult(settle, seat, landlord) {
      const st = this.getStats();
      st.games += 1;
      const won = settle.deltas[seat] > 0;
      if (won) st.wins += 1;
      if (won && seat === landlord) st.landlordWins += 1;
      if (won && seat !== landlord) st.farmerWins += 1;
      st.score += settle.deltas[seat];
      write(KEY('stats'), st);
      return { ...st };
    },
    getPrefs() { return { ...DEFAULT_PREFS, ...read(KEY('prefs'), {}) }; },
    setPrefs(patch) {
      const merged = { ...this.getPrefs(), ...patch };
      write(KEY('prefs'), merged);
      return merged;
    },
    // 皮肤键独立于 index.html 主题引导的 ':theme'(防 {mode,accent} 与 {id} 撞键)
    getTheme() { return read(KEY('skin'), null); },
    setTheme(theme) { return write(KEY('skin'), theme); },
  };
}

// 浏览器默认实例;storage 不可用时退化为内存 Map
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

export function defaultStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch (e) { /* 隐私模式等 */ }
  return memoryStorage();
}
