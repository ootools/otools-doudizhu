// otools-doudizhu 入口路由:首屏 ↔ 对局 ↔ 结算 ↔ 战绩
import { createStore, defaultStorage } from './engine/store.js';
import { restore } from './engine/game.js';
import { getTheme } from '../data/themes.js';
import { createGameController } from './ui/main-game.js';
import { homeScreen, settleScreen, statsScreen, applyThemeVars } from './ui/screens.js';

const store = createStore(defaultStorage());
const app = document.querySelector('#app');
let currentController = null;

function destroyController() {
  if (currentController) {
    currentController.destroy();
    currentController = null;
  }
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
  currentController = createGameController({
    container: app,
    level,
    theme,
    store,
    recorderVisible: recorder,
    initialState,
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
