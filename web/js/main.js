// otools-doudizhu 入口装配(Task 9:直接开一局;Task 10 接入首屏路由)
import { createStore, defaultStorage } from './engine/store.js';
import { getTheme } from '../data/themes.js';
import { createGameController } from './ui/main-game.js';

const store = createStore(defaultStorage());
const app = document.querySelector('#app');

const controller = createGameController({
  container: app,
  level: 'normal',
  theme: getTheme('green'),
  store,
  recorderVisible: true,
});
controller.start();
