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
    """DouZero env id(3..14 = 3..A,17 = '2',20 小王,30 大王)→ 我们规范 id(rank*4+第k张)。"""
    if e == 20:
        return 52
    if e == 30:
        return 53
    r = (e - 3) if e <= 14 else 12  # env id 17 = '2' → rank 12
    if counts is None:
        return r * 4
    k = counts.get(r, 0)
    counts[r] = k + 1
    return r * 4 + min(k, 3)


def our_rank_of(e):
    if e == 20:
        return 13
    if e == 30:
        return 14
    return (e - 3) if e <= 14 else 12


def env_move_to_our(move, hand_our=None):
    """env 动作 → 我们规范 id。hand_our 提供时,按玩家当前手牌分配实际 id
    (否则按 move 内出现序的规范 id——suit 计数语义下二者编码等价)。"""
    if hand_our is None:
        counts = {}
        return sorted(env_card_to_our(e, counts) for e in move)
    hand = sorted(hand_our)
    used = []
    counts = {}
    for e in move:
        if e == 20:
            used.append(52)
            continue
        if e == 30:
            used.append(53)
            continue
        r = (e - 3) if e <= 14 else 12
        k = counts.get(r, 0)
        counts[r] = k + 1
        candidates = [c for c in hand if c // 4 == r and c < 52 and c not in used]
        if len(candidates) == 0:
            raise SystemExit(f'动作牌不在手:r={r} 需第{k+1}张 hand={hand} move={move}')
        used.append(candidates[0])
    return sorted(used)


def remove_move_from_hand(hand_our, move_env):
    """按 rank 计数从影子手牌移除(动作转换的 suit 序号会漂移,不能按 id 精确匹配)。"""
    ranks = {}
    jokers = []
    for e in move_env:
        if e == 20:
            jokers.append(52)
        elif e == 30:
            jokers.append(53)
        else:
            r = (e - 3) if e <= 14 else 12
            ranks[r] = ranks.get(r, 0) + 1
    hand = list(hand_our)
    for r, n in ranks.items():
        ids = sorted(c for c in hand if c // 4 == r and c < 52)[:n]
        if len(ids) < n:
            raise SystemExit(f'影子手牌与动作不一致: rank{r} 需{n}张仅剩{len(ids)} hand={hand} move={move_env}')
        for c in ids:
            hand.remove(c)
    for j in jokers:
        if j in hand:
            hand.remove(j)
    return sorted(hand)


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
    bottom_ours = env_move_to_our(infoset.three_landlord_cards or [])

    # 我们侧影子状态:手牌 / 历史(带座位)
    # 全局一次性分配 id:同一 rank 的实体牌按 POSITIONS 顺序占用 r*4+k,互不重叠
    # (每手独立分配会让不同玩家的实体牌撞 id,54 张账目无法恒平)
    hands_our = {}
    k_of_rank = [0] * 13
    for pos in POSITIONS:
        out = []
        for e in sorted(infoset.all_handcards[pos]):
            if e == 20:
                out.append(52)
            elif e == 30:
                out.append(53)
            else:
                r = (e - 3) if e <= 14 else 12
                out.append(r * 4 + k_of_rank[r])
                k_of_rank[r] += 1
        hands_our[pos] = sorted(out)
    history_our = []  # [{seat, cards}]
    guard = 0

    def push_history(cards, acting_pos):
        history_our.append({'seat': seat_of[acting_pos], 'cards': cards})

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
                'seatOf': dict(seat_of),
                'handsOur': {p: list(v) for p, v in hands_our.items()},  # 快照!活引用会让全 case 变终局态
                'historyOurs': [dict(h) for h in history_our],
                'bottomOurs': list(bottom_ours),
                'actionsOur': actions_our,
                'zNonzero': nonzero_indices(z_flat),
                'xNonzero': [nonzero_indices(x_rows[i]) for i in range(cap)],
                'q': q[:cap],
                # 原始 env 侧数据(调试用)
                'envHands': {pos: sorted(infoset.all_handcards[pos]) for pos in POSITIONS},
                'envSeq': [list(s) for s in infoset.card_play_action_seq],
                'envOther': sorted(infoset.other_hand_cards),
                'envPlayed': {pos: sorted(infoset.played_cards[pos]) for pos in POSITIONS},
            }
            out_encode.append(case)
            out_moves.append({
                'seat': seat_of[acting],
                'handOur': list(hands_our[acting]),
                'lastOur': env_move_to_our(infoset.last_move),
                'expectedMoves': actions_our,
                'envLegal': [list(a) for a in legal],
                'envHand': sorted(infoset.player_hand_cards),
                'envSeq': [list(s) for s in infoset.card_play_action_seq],
            })
            out_q.append({
                'position': acting,
                'zNonzero': nonzero_indices(z_flat),
                'xNonzero': [nonzero_indices(x_rows[i]) for i in range(len(legal))],
                'q': q,
                'dim': 373 if acting == 'landlord' else 484,
            })
        # 随机走一步:先从移除前的手牌分配实际 id,再移除
        action = legal[rng.randrange(len(legal))]
        played_cards = env_move_to_our(action, hands_our[acting]) if len(action) > 0 else []
        if len(action) > 0:
            try:
                hands_our[acting] = remove_move_from_hand(hands_our[acting], action)
            except SystemExit as e:
                raise SystemExit(
                    f'{e} | acting={acting} official_hand={sorted(infoset.all_handcards[acting])} '
                    f'shadow={hands_our[acting]} history={history_our}'
                )
        push_history(played_cards, acting)
        _, _, done, _ = env.step(action)
        # 每步校验:影子 vs 官方手牌 rank 计数必须一致
        from collections import Counter as _C
        new_infoset = env._env.game_infoset
        def our_rank_of_id(c):
            return 13 if c == 52 else 14 if c == 53 else c // 4
        for pos in POSITIONS:
            off = _C(our_rank_of(e) for e in new_infoset.all_handcards[pos])
            shd = _C(our_rank_of_id(c) for c in hands_our[pos])
            if off != shd:
                raise SystemExit(
                    f'rank 漂移 pos={pos} official={dict(off)} shadow={dict(shd)} '
                    f'last_move={action} by={acting} history_len={len(history_our)}'
                )
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
    random.seed(args.seed)  # GameEnv 洗牌用全局 random,必须一并种子化才能复现
    np.random.seed(args.seed)  # Env.reset 用 np.random.shuffle
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
