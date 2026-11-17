# THIRD_PARTY_NOTICES

本插件包含以下第三方资产,在此致谢并声明许可:

## 1. DouZero 预训练模型(三个席位 onnx)

- 来源:kwai/DouZero(https://github.com/kwai/DouZero)官方 douzero_ADP 权重
  (本机经双 GitHub 镜像 girgle/DouZero_For_New_HLDDZ 与 pineoncellar/DouZero_API 交叉校验获取,逐字节一致)
- 许可:Apache License 2.0(https://www.apache.org/licenses/LICENSE-2.0)
- 本仓修改:PyTorch ckpt → ONNX 导出(`tools/convert_douzero.py`,opset 17,IO 签名见 `vendor/model-source.json`);未修改权重数值
- 文件:`web/model/landlord.onnx`、`web/model/landlord_up.onnx`、`web/model/landlord_down.onnx`
- 论文:DouZero: Mastering DouDizhu with Self-Play Deep Reinforcement Learning (ICML 2021)

## 2. onnxruntime-web(vendored 静态文件)

- 来源:https://github.com/microsoft/onnxruntime(npm 包 onnxruntime-web@1.22.0,dist 文件快照)
- 许可:MIT License
- 本仓修改:无(仅按 `ort.env.wasm.wasmPaths` 指向本地路径使用)
- 文件:`web/vendor/ort/`(清单与来源版本见 `vendor/ort-source.json`)

## 3. 对拍基准代码(douzero Python 包,仅开发期 tools/ 使用,不随包分发)

- 来源:https://github.com/kwai/DouZero(main 分支)
- 许可:Apache License 2.0
- 用途:fixtures 生成(编码/枚举/Q 值基准)与转换管线;运行时零依赖
