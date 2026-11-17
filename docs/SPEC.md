# otools-doudizhu 实现规格(斗地主)

OTools 独立插件:斗地主——经典三人本机 AI 对局(我 + 两个电脑),叫分定地主、炸弹/火箭与春天/反春倍数结算、记牌器、三套牌桌皮肤。
纯静态实现(原生 HTML/CSS/JS ES modules,零 npm 运行时依赖);hard 档带 DouZero onnx 离线推理。

## plugin.json

```json
{
  "uuid": "otools-doudizhu", "packid": "otools-doudizhu",
  "displayName": "Fight the Landlord", "displayNameCN": "斗地主",
  "developerName": "OTools", "summary": "经典三人斗地主:叫分定地主、炸弹春天倍数结算;easy/normal 规则 AI,hard 档 DouZero 神经网络强 AI,完全离线。",
  "version": "0.1.0", "entry": "dist/index.html",
  "devUrl": "http://127.0.0.1:6575", "quickDev": true, "hasAd": false,
  "inPluginPurchase": false, "openInBrowser": false,
  "logo": "logo.svg", "icon": "🃏", "screenshots": [],
  "key": ["斗地主", "扑克", "单机", "棋牌", "AI", "doudizhu", "fight the landlord"]
}
```

## 目录与公共约定

- `web/index.html`:入口,保留 OTools 宿主桥脚本(`window.otoolsPlugin`,精简版 available/theme/language)+ 本地主题引导(读 `window.__OTOOLS_THEME__`/缓存/系统配色写 html.dark 与强调色);入口 HTML 必须含 "otools" 字样。
- `web/js/engine/` 纯函数引擎,零 DOM,`node --test tests/` 全绿,随机源可注入:
  - `cards.js`:牌表示(卡 id 0..53,rank=floor(id/4),52 小王 53 大王;DouZero 约定)、`genType` 全牌型识别、`canBeat` 比较、`genMoves` 合法出牌枚举(rank 规范化,单张逐张;候选全过 genType 校验)
  - `game.js`:对局状态机 `newGame/bid/legalBids/legalMoves/play/settle/serialize/restore`;叫 3 即庄、全不叫重发(dealer 顺延)、炸弹/火箭 ×2、春天/反春 ×2、结算 deltas 和恒为 0
  - `ai.js`:规则评分 AI(`chooseBid` 强度启发式 / `choosePlay` 评分制,`scoreMove` 导出供 hard 兜底);**只读 InfoSet**(自己手牌+历史+公示底牌),绝不读对手手牌
  - `douzero-encode.js`:DouZero InfoSet 编码,逐位对齐官方 `douzero/env/env.py`:54 维 one-hot 与卡 id 恒等、z 固定 [5,162](15 条历史前补空,每 3 条一行)、x 席位定长(landlord 373 / farmer 484,末 54 维候选动作);`other_hand_cards = 54 − 我手牌 − 全部已出牌`(纯公开信息,与官方恒等)
  - `douzero.js` + `douzero-worker.js`:onnxruntime-web(vendored,`web/vendor/ort/`)wasm SIMD 推理,Web Worker 优先(blob→vendored→主线程降级),按席位选模型(landlord/landlord_up/landlord_down);加载失败或单步 >800ms 降级 normal 并记录
  - `store.js`:localStorage 封装(storage 注入,异常吞掉返回默认;键 `otools-doudizhu:{game,stats,prefs,theme}`)
  - `recorder.js`:记牌器纯逻辑(`unseenCounts`,按未见过牌口径)
- `web/js/ui/`:cardsview(纯 CSS/SVG 扑克牌)、table(牌桌)、main-game(对局控制器)、screens(首屏/结算/战绩)、main.js 路由
- `web/data/themes.js`:三主题(绿呢牌桌/胡桃木茶馆/深夜霓虹):palette + AI 昵称 + 事件文案变体
- `web/model/`:三席位 onnx(来源/许可见 `vendor/model-source.json` 与 THIRD_PARTY_NOTICES.md)
- `tests/`(仓库根):`node --test tests/`(`tests/index.js` 聚合,兼容目录参数被当 CJS 入口的 node 行为)
- `tools/`:Python 转换与 fixtures 生成(一次性,不入包,见 tools/README.md)
- `scripts/` 与 `.github/`:拷自 otools-games/xiangqi 模板,不改
- 不装任何运行时依赖;devDependencies 仅 onnxruntime-node(测试真推理)

## 规则引擎(经典三人斗地主)

- 发牌 17×3 + 底牌 3;叫分(不叫/1/2/3,后叫须高于前叫,叫 3 即庄,全不叫重发);底牌翻开并入地主手牌(20 张),地主先出;出牌顺序 座位+1(我→下家→上家)
- 牌型:单/对/三/三带一/三带二/顺子(≥5)/连对(≥3)/四带二单/四带二对/飞机(不带翼/带单/带对,主链 ≤A 不含 2,取最长链)/炸弹/火箭;主链翅膀不含炸弹、不成火箭
- 倍数:炸弹/火箭每张场 ×2;春天(地主胜且两农民零出牌)/反春(农民胜且地主仅出过首手)结算再 ×2;结算 = 底分×总倍数,地主 ±2、农民 ∓1,deltas 和为 0
- 状态可 JSON 序列化,支持存档恢复与 AI 决策输入

## AI(三档)

- easy:评分前 3 随机(注入 rng),忽略危险规避;normal:完整评分,可复现
- 评分项:手数减少 ×30 > 出完即赢 +1000 > 压上家 +20 > 自由出小牌(−rank)> 留炸弹 −200 > 拆炸弹 −15 > 农民不压队友 −60 > 危险规避(自由出牌时 unseen 高牌 ×2)
- 叫分启发式:大王 30 + 小王 25 + 火箭 80 + 每 2 ×10 + 每炸弹 50 + 每 A ×3;≥100→3 / ≥60→2 / ≥30→1;档位不高于当前最高则 pass
- hard:DouZero 三席位模型(官方 douzero_ADP,Apache-2.0)onnx 推理,全合法候选一次 batch 前向取 argmax;会话失败/超时自动降 normal(设计稿降级链 ADP→SL→规则 hard);「提示」按钮同引擎路径(hard 局走 DouZero)

## UI

- 首屏:继续上局(存档恢复)/ 新对局(难度三选、皮肤三选、记牌器开关,均记忆)/ 战绩
- 牌桌:顶栏 AI 昵称+剩牌数、底牌公示、倍数;中区双方最近出牌与事件气泡(主题文案);叫分面板;不出/提示/出牌(非法组合红字提示);记牌器条(15 点数剩余张数,0 灰显);手牌点选升起、出牌校验
- 结算页:胜负、倍数明细(底分×炸弹×春天)、各座位 delta、总分战绩;再来一局保留配置
- 响应式:牌桌 100vh 布局,SVG/CSS 牌面任意缩放,移动端可用

## 测试清单(node --test,种子随机)

1. cards:牌表/全牌型识别与比较/炸弹火箭越级/飞机最长链/非法组合 null/重复牌与越界拒收
2. moves:自由出牌覆盖(签名等价暴力对拍)/无重复/全部合法/炸弹排尾/跟牌(对/炸弹/飞机/火箭)/无解空数组/翅膀约束(双王不作翅)
3. game:发牌不重不漏/叫 3 即庄+底牌并入/叫分顺序/全不叫重发/legalBids/出牌校验/连续两过清空/炸弹倍数/打完进 settle/春天反春/结算和为 0/存档往返
4. ai:叫分强度与 legalBids 约束/唯一解/不拆火箭/农民让队友/easy 随机/normal 复现/无解 pass/**反作弊:篡改对手手牌决策不变**/出完牌高分局
5. e2e:AI vs AI easy/normal ×50 种子整局合法终止+deltas 和 0+可复现;hard 无 session 标注 degraded
6. encode:cardsTo54 计数语义/seqToZ 补位与截尾/席位映射/landlord 373 与 farmer 484 分段/反作弊对调不变/buildBatch
7. conformance(Task 14):fixtures 逐位对拍官方 get_obs 编码 + move_generator 枚举
8. douzero-session(Task 15):mock 会话 argmax/计时/降级
9. hard 真推理(Task 17):onnxruntime-node Q 对拍 ≤1e-3 + hard ×50 种子整局 + 反作弊复测

## 发布

推 `v<版本>` 轻量标签 → release-plugin.yml:build → pack(单合包 packageMode=0)→ verify → GitHub Release(`otools-doudizhu-<版本>.oplg`)→ 上架市场。发布前核查 .oplg ≤25MB。
