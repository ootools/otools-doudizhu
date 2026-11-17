# otools-doudizhu

OTools 独立插件:斗地主——经典三人本机 AI 对局(你 + 两个电脑对手),叫分定地主、炸弹/火箭与春天/反春倍数结算,记牌器、三档难度与三套牌桌皮肤,完全离线。

- **easy / normal**:规则评分 AI
- **hard**:DouZero(Apache-2.0)三席位模型 onnx 化,onnxruntime-web wasm 离线推理

## 开发

```bash
node scripts/build-web.mjs   # web/ → dist/(纯静态,零 npm 依赖)
node scripts/serve-dist.mjs  # http://127.0.0.1:6575
node --test tests/           # 引擎与对拍测试
```

## 发布

推 `v<版本>` 轻量标签触发 `.github/workflows/release-plugin.yml`:打包 `.oplg` → GitHub Release → 上架 OTools 插件市场。

详见 `docs/SPEC.md` 与设计稿(xyito 仓 `docs/superpowers/specs/2026-11-17-otools-doudizhu-design.md`)。
