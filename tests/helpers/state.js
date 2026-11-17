// 测试用最小合法对局状态构造(encode/e2e/session 测试共用)
export function makeState({ landlord = 0, turn = 0, history = [], hands = null } = {}) {
  const base = hands || [
    [0, 1, 2, 3, 4, 5, 48, 49, 50, 51, 52, 53, 8, 9, 12, 16, 20, 21, 22, 23],
    [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40],
    [41, 42, 43, 44, 45, 46, 47, 6, 7, 10, 11, 13, 14, 15, 18, 19, 26],
  ];
  return {
    phase: 'play',
    hands: base,
    bottom: [21, 22, 23],
    dealer: 0, bidTurn: 0,
    bids: [3, 0, 0], landlord, baseScore: 3, multiplier: 1,
    turn, lastPlay: null, passCount: 0, playCounts: [0, 0, 0], history,
  };
}
