/**
 * 测试汇总入口。
 * Node 的 `node --test tests/` 在某些版本会把目录参数当作 CJS 入口加载,
 * 此文件使该调用形式也能聚合运行全部测试;常规的
 * `node --test tests/*.test.js` 不受影响(每个测试文件独立进程运行)。
 */
import './cards.test.js';
import './moves.test.js';
import './game.test.js';
import './ai.test.js';
import './e2e.test.js';
import './store.test.js';
import './recorder.test.js';
import './encode.test.js';
