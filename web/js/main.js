// otools-doudizhu 入口路由:首屏 ↔ 对局 ↔ 结算 ↔ 战绩
import { createStore, defaultStorage } from './engine/store.js';
import { restore } from './engine/game.js';
import { getTheme } from '../data/themes.js';
import { createGameController } from './ui/main-game.js';
import { homeScreen, settleScreen, statsScreen, applyThemeVars } from './ui/screens.js';
import { setSfxEnabled, setBgmEnabled, isBgmOn } from './audio.js';
import { createSession } from './engine/douzero.js';

const store = createStore(defaultStorage());
const app = document.querySelector('#app');
let currentController = null;
let currentSession = null;

function destroyController() {
  if (currentController) {
    currentController.destroy();
    currentController = null;
  }
  if (currentSession) {
    currentSession.dispose();
    currentSession = null;
  }
}

function applyAudioPrefs() {
  const prefs = store.getPrefs();
  setSfxEnabled(prefs.sound);
  setBgmEnabled(prefs.bgm);
}

function showHome() {
  destroyController();
  applyThemeVars(getTheme((store.getTheme() || { id: 'green' }).id));
  homeScreen(app, {
    store,
    onResume: () => {
      const saved = store.loadGame();
      const prefs = store.getPrefs();
      if (!saved) return showHome();
      startGame({
        level: prefs.level,
        themeId: (store.getTheme() || { id: 'green' }).id,
        recorder: prefs.recorder,
        savedStateJson: saved,
      });
    },
    onStart: (opts) => startGame(opts),
    onStats: () => showStats(),
  });
}

function startGame({ level = 'normal', themeId = 'green', recorder = true, savedStateJson = null } = {}) {
  destroyController();
  const prefs = store.getPrefs();
  applyAudioPrefs(); // 用户手势上下文内启动音频(自动播放策略)
  const theme = getTheme(themeId);
  store.setTheme({ id: themeId });
  applyThemeVars(theme);
  app.innerHTML = '';
  let initialState = null;
  if (savedStateJson) {
    try {
      const parsed = typeof savedStateJson === 'string' ? restore(savedStateJson) : savedStateJson;
      if (parsed && parsed.phase !== 'settle') initialState = parsed;
    } catch (e) { /* 存档损坏按新局处理 */ }
  }
  // hard 档:懒加载 DouZero 会话(Worker 优先三级降级;?nomodel=1 测试钩子强制不可用)
  if (level === 'hard' && !new URLSearchParams(location.search).has('nomodel')) {
    try {
      currentSession = createSession();
    } catch (e) { currentSession = null; }
  }
  currentController = createGameController({
    container: app,
    level,
    theme,
    store,
    recorderVisible: recorder,
    initialState,
    session: currentSession,
    bgmOn: isBgmOn(),
    onToggleBgm: (next) => {
      setBgmEnabled(next);
      store.setPrefs({ bgm: next });
    },
    onSettle: (settleResult, state) => showSettle(settleResult, state, { level, themeId, recorder }),
  });
  currentController.start();
}

function showSettle(settleResult, state, opts) {
  destroyController();
  const theme = getTheme(opts.themeId);
  settleScreen(app, {
    settle: settleResult,
    state,
    store,
    theme,
    onAgain: () => startGame(opts),
    onHome: () => showHome(),
  });
}

function showStats() {
  destroyController();
  statsScreen(app, { store, onBack: () => showHome() });
}

showHome();
