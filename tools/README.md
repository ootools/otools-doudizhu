# tools/ — DouZero 模型转换与对拍 fixtures(一次性,不随包分发)

本目录是把 DouZero(https://github.com/kwai/DouZero,Apache-2.0)官方 ckpt 转成浏览器 onnx、并生成 JS 侧编码/枚举对拍 fixtures 的开发期工具。**插件运行时不依赖 Python。**

## 环境

```bash
python3 -m venv tools/.venv
tools/.venv/bin/pip install -r tools/requirements.txt   # torch/onnx/onnxruntime/numpy/douzero
```

## 权重来源

douzero_ADP 三个席位 ckpt(landlord / landlord_up / landlord_down),来源与 SHA 记录在 `vendor/model-source.json`:
1. 官方 README「Pretrained Models」节的外链(douzero.org / Google Drive)
2. 备用:Vincentzyx/DouZero_For_HLDDZ_FullAuto 仓库提供的重打包 ckpt(仅当编码协议与官方一致时使用)

## 转换(ckpt → onnx)

```bash
tools/.venv/bin/python tools/convert_douzero.py --ckpt-dir <douzero_ADP> --out web/model [--quantize int8]
```

导出签名(按官方 dmc/models.py):`z [B,5,162]` + `x [B,373|484]` → `q [B]`,三席位各自导出。
编码口径详见 `web/js/engine/douzero-encode.js` 头注释(官方 env.py 逐位对齐)。

## 对拍 fixtures

```bash
tools/.venv/bin/python tools/gen_fixtures.py --ckpt-dir <douzero_ADP> --seed 42 --cases 40 --out tests/fixtures/
```

- `encode-fixtures.json`:官方 `get_obs` 的 x_batch/z(非零下标压缩)与我们侧状态 → `tests/conformance.test.js` 逐位对拍
- `moves-fixtures.json`:官方 move_generator 合法动作(rank 计数签名)→ 与 JS `genMoves` 集合比对
- `q-fixtures.json`:官方 torch 前向 Q → Task 17 用 onnxruntime-node 真推理对拍(容差 ≤1e-3)

同种子两次产出必须 diff 为空(可复现)。
