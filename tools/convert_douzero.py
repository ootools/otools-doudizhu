#!/usr/bin/env python3
"""DouZero ckpt → onnx 导出。

导出签名(2026-11-18 按官方 douzero/dmc/models.py 修正):
  inputs:  z float32 [batch, 5, 162]   # 历史出牌固定 5×162(见 web/js/engine/douzero-encode.js 注释)
           x float32 [batch, 373|484]  # 席位定长特征,末 54 维为候选动作
  outputs: q float32 [batch]           # 每候选的 Q 值

用法:
  .venv/bin/python tools/convert_douzero.py --ckpt-dir <douzero_ADP 目录> --out web/model [--opset 17] [--quantize int8]
"""
import argparse
import glob
import os

import torch
from torch import nn

from douzero.dmc.models import model_dict

X_DIMS = {'landlord': 373, 'landlord_up': 484, 'landlord_down': 484}
POSITIONS = ['landlord', 'landlord_up', 'landlord_down']


class _Export(nn.Module):
    """把 dmc 模型包成 (z, x) → q 的纯前向,便于 onnx 导出。"""

    def __init__(self, net):
        super().__init__()
        self.net = net

    def forward(self, z, x):
        return self.net.forward(z, x, return_value=True)['values']


def load_model(position, path):
    net = model_dict[position]()
    state = net.state_dict()
    pretrained = torch.load(path, map_location='cpu')
    if isinstance(pretrained, dict) and 'model_state_dict' in pretrained:
        pretrained = pretrained['model_state_dict']
    pretrained = {k: v for k, v in pretrained.items() if k in state}
    state.update(pretrained)
    net.load_state_dict(state)
    net.eval()
    return _Export(net)


def find_ckpt(ckpt_dir, position):
    """兼容三种布局:{dir}/{pos} 文件、{dir}/{pos}.ckpt、{dir}/{pos}/ 目录内单文件。"""
    for cand in [os.path.join(ckpt_dir, position),
                 os.path.join(ckpt_dir, position + '.ckpt')]:
        if os.path.isfile(cand):
            return cand
    subdir = os.path.join(ckpt_dir, position)
    if os.path.isdir(subdir):
        files = [f for f in sorted(glob.glob(os.path.join(subdir, '**', '*'), recursive=True))
                 if os.path.isfile(f)]
        if len(files) == 1:
            return files[0]
        if files:
            raise SystemExit(f'{subdir} 下有多个文件,请指定确切 ckpt: {files}')
    raise SystemExit(f'找不到 {position} 的 ckpt(在 {ckpt_dir} 下)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ckpt-dir', required=True)
    ap.add_argument('--out', default='web/model')
    ap.add_argument('--opset', type=int, default=17)
    ap.add_argument('--quantize', choices=['none', 'int8'], default='none')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    for pos in POSITIONS:
        ckpt = find_ckpt(args.ckpt_dir, pos)
        net = load_model(pos, ckpt)
        z = torch.randn(4, 5, 162)
        x = torch.randn(4, X_DIMS[pos])
        out_path = os.path.join(args.out, f'{pos}.onnx')
        torch.onnx.export(
            net, (z, x), out_path,
            input_names=['z', 'x'], output_names=['q'],
            dynamic_axes={'z': {0: 'batch'}, 'x': {0: 'batch'}, 'q': {0: 'batch'}},
            opset_version=args.opset,
        )
        size = os.path.getsize(out_path)
        print(f'{pos}: {out_path} ({size / 1024 / 1024:.1f} MB)')
        if args.quantize == 'int8':
            from onnxruntime.quantization import quantize_dynamic, QuantType
            qpath = os.path.join(args.out, f'{pos}.int8.onnx')
            quantize_dynamic(out_path, qpath, weight_type=QuantType.QInt8)
            print(f'{pos}: {qpath} ({os.path.getsize(qpath) / 1024 / 1024:.1f} MB)')

    # 冒烟:onnxruntime 载入 + 前向
    try:
        import onnxruntime as ort
        for pos in POSITIONS:
            sess = ort.InferenceSession(os.path.join(args.out, f'{pos}.onnx'))
            q = sess.run(None, {
                'z': torch.randn(3, 5, 162).numpy(),
                'x': torch.randn(3, X_DIMS[pos]).numpy(),
            })[0]
            assert q.shape == (3,), q.shape
        print('onnxruntime 冒烟通过')
    except ImportError:
        print('(未装 onnxruntime,跳过冒烟)')


if __name__ == '__main__':
    main()
