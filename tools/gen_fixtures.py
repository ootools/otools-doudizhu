#!/usr/bin/env python3
"""随机对局采样,产出对拍 fixtures(官方 get_obs 为编码基准)。

三类 fixtures(写入 --out,默认 tests/fixtures/):
  encode-fixtures.json  官方 x_batch/z 与我们侧状态 → tests/conformance.test.js 逐位对拍
  moves-fixtures.json   官方 move_generator 合法动作 → 与 JS genMoves 集合比对(rank 计数签名)
  q-fixtures.json       官方 torch 前向 Q → Task 17 用 onnxruntime-node 真推理对拍

x/z 全为 0/1 特征,按「非零下标」存储以压缩体积;q 为浮点。

用法:
  .venv/bin/python tools/gen_fixtures.py --ckpt-dir <douzero_ADP> --seed 42 --cases 40 --out tests/fixtures/
"""
import argparse
import json
import os
import random

import numpy as np
import torch

from douzero.env.env import Env, get_obs
from douzero.dmc.models import model_dict

POSITIONS = ['landlord', 'landlord_down', 'landlord_up']  # 出牌顺序


def env_card_to_our(e, counts=None):
    """DouZero env id(3..17, 20, 30)→ 我们规范 id(rank*4+第k张;双王 52/53)。"""
    if e == 20:
        return 52
    if e == 30:
        return 53
    r = e - 3
    if counts is None:
        return r * 4
    k = counts.get(r, 0)
    counts[r] = k + 1
    return r * 4 + min(k, 3)


def env_move_to_our(move):
    counts = {}
    return sorted(env_card_to_our(e, counts) for e in move)


def hand_to_our(hand):
    """手牌(有重复 rank)按出现序分配 suit,与 JS genMoves 规范形式一致。"""
    counts = {}
    out = []
    for e in sorted(hand):
        out.append(env_card_to_our(e, counts))
    return sorted(out)


def nonzero_indices(vec):
    return [i for i, v in enumerate(vec) if v != 0]


def load_models(ckpt_dir):
    models = {}
    for pos in POSITIONS:
        net = model_dict[pos]()
        state = net.state_dict()
        path = os.path.join(ckpt_dir, pos)
        if not os.path.isfile(path):
            path = os.path.join(ckpt_dir, pos + '.ckpt')
        pretrained = torch.load(path, map_location='cpu')
        if isinstance(pretrained, dict) and 'model_state_dict' in pretrained:
            pretrained = pretrained['model_state_dict']
        pretrained = {k: v for k, v in pretrained.items() if k in state}
        state.update(pretrained)
        net.load_state_dict(state)
        net.eval()
        models[pos] = net
    return models


def sample_game(env, rng, models, out_encode, out_moves, out_q, budget):
    """自走一局,在每个多解决策点采样一条 case。"""
    obs, reward, done, _ = None, None, None, None
    first_obs = env.reset()
    infoset = env._env.game_infoset
    landlord_pos = infoset.player_position
    landlord_seat = rng.randrange(3)
    seat_of = {
        'landlord': landlord_seat,
        'landlord_down': (landlord_seat + 1) % 3,
        'landlord_up': (landlord_seat + 2) % 3,
    }
    bottom_ours = sorted(env_card_to_our(e) for e in infoset.three_landlord_cards or [])

    # 我们侧影子状态:手牌 / 历史(带座位)
    hands_our = {pos: hand_to_our(infoset.all_handcards[pos]) for pos in POSITIONS}
    history_our = []  # [{seat, cards}]
    guard = 0

    def push_history(move_env, acting_pos):
        history_our.append({'seat': seat_of[acting_pos], 'cards': env_move_to_our(move_env)})

    obs = first_obs
    acting = infoset.player_position
    while True:
        infoset = env._env.game_infoset
        acting = infoset.player_position
        legal = infoset.legal_actions
        if len(legal) > 1 and budget[0] > 0:
            budget[0] -= 1
            o = get_obs(infoset)
            z_flat = o['z'].astype(np.float32).flatten().tolist()
            x_rows = o['x_batch'].astype(np.float32)
            z_t = torch.from_numpy(o['z_batch']).float()
            x_t = torch.from_numpy(x_batch_all := o['x_batch']).float()
            with torch.no_grad():
                q = models[acting].forward(z_t, x_t, return_value=True)['values'].flatten().tolist()
            q = [round(v, 6) for v in q]
            actions_our = [env_move_to_our(a) for a in legal]
            # 官方 x_batch 行序 == legal_actions 行序;动作截 ≤30 行控制体积
            cap = min(len(legal), 30)
            case = {
                'position': acting,
                'seat': seat_of[acting],
                'landlordSeat': seat_of['landlord'],
                'seatOf': seat_of,
                'handsOur': hands_our,
                'historyOurs': history_our,
                'bottomOurs': bottom_ours,
                'actionsOur': actions_our,
                'zNonzero': nonzero_indices(z_flat),
                'xNonzero': [nonzero_indices(x_rows[i]) for i in range(cap)],
                'q': q[:cap],
            }
            out_encode.append(case)
            out_moves.append({
                'seat': seat_of[acting],
                'handOur': hands_our[acting],
                'lastOur': env_move_to_our(infoset.last_move),
                'expectedMoves': actions_our,
            })
            out_q.append({
                'position': acting,
                'zNonzero': nonzero_indices(z_flat),
                'xNonzero': [nonzero_indices(x_rows[i]) for i in range(len(legal))],
                'q': q,
                'dim': 373 if acting == 'landlord' else 484,
            })
        # 随机走一步
        action = legal[rng.randrange(len(legal))]
        hands_our[acting] = [c for c in hands_our[acting] if c not in env_move_to_our(action)] \
            if len(action) > 0 else hands_our[acting]
        push_history(action, acting)
        _, _, done, _ = env.step(action)
        if done or budget[0] <= 0:
            break


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ckpt-dir', required=True, help='douzero_ADP 目录(内含三个席位 ckpt)')
    ap.add_argument('--seed', type=int, default=42)
    ap.add_argument('--games', type=int, default=30)
    ap.add_argument('--cases', type=int, default=40, help='编码/Q case 总量上限')
    ap.add_argument('--out', default='tests/fixtures')
    args = ap.parse_args()

    rng = random.Random(args.seed)
    torch.manual_seed(args.seed)
    models = load_models(args.ckpt_dir)

    out_encode, out_moves, out_q = [], [], []
    budget = [args.cases]
    for g in range(args.games):
        if budget[0] <= 0:
            break
        env = Env(objective='adp')
        env._env.rng = rng  # 若 env 内部有随机源,注入可复现(不支持则忽略)
        sample_game(env, rng, models, out_encode, out_moves, out_q, budget)

    os.makedirs(args.out, exist_ok=True)
    files = {
        'encode-fixtures.json': out_encode,
        'moves-fixtures.json': out_moves,
        'q-fixtures.json': out_q,
    }
    for name, data in files.items():
        path = os.path.join(args.out, name)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        size = os.path.getsize(path) / 1024
        print(f'{name}: {len(data)} cases, {size:.0f} KB')


if __name__ == '__main__':
    main()
