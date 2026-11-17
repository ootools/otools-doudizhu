// 三套牌桌皮肤:配色 / AI 昵称 / 事件文案变体(规则与数值完全一致,仅换肤换文案)
export const THEMES = [
  {
    id: 'green',
    name: '绿呢牌桌',
    palette: { felt: '#1f6b43', bg: '#15201a', panel: '#1d2a22', accent: '#d4a24e', cardFace: '#fffdf7', cardRed: '#c0392b', cardBlack: '#1c2733', text: '#e8e3d8', textDim: '#9aa89e' },
    aiNames: ['老张', '小美'],
    aiAvatars: ['🧔', '👩'],
    copy: {
      deal: ['发牌完毕,好戏开场!', '牌到手了,愿赌服输。'],
      bid: ['{name}叫了 {score} 分!', '{name}咬牙喊到 {score} 分!'],
      pass: ['{name}要不起,过。', '{name}摆摆手:「你们先请。」'],
      bomb: ['{name}甩出炸弹,桌上炸开了锅!', '轰——{name}的炸弹翻倍!'],
      rocket: ['{name}掏出王炸,全场安静了!', '王炸!{name}直接掀桌!'],
      spring: ['春天!地主一个人把牌打完了!', '完美的春天,农民连牌都没摸到!'],
      antiSpring: ['反春!地主只出了一手就被制裁!', '农民配合默契,反春翻倍!'],
      win: ['地主大获全胜!', '这一把,地主笑到最后。'],
      lose: ['农民联合起来,掀翻地主!', '地主被围剿,农民赢了!'],
    },
  },
  {
    id: 'wood',
    name: '胡桃木茶馆',
    palette: { felt: '#7a5230', bg: '#241a12', panel: '#31261b', accent: '#c8963e', cardFace: '#faf6ec', cardRed: '#b03a2e', cardBlack: '#2c1f16', text: '#efe6d8', textDim: '#a8988a' },
    aiNames: ['掌柜的', '账房先生'],
    aiAvatars: ['🍵', '🧮'],
    copy: {
      deal: ['茶还没凉,牌已经洗好了。', '各位客官,牌来了。'],
      bid: ['{name}放下茶盏:「{score} 分。」', '{name}眯眼一算:{score} 分!'],
      pass: ['{name}摇摇头,这轮不接。', '{name}呷了口茶:「过。」'],
      bomb: ['{name}把茶碗一墩——炸弹!', '店小二都吓了一跳,{name}出炸弹!'],
      rocket: ['{name}缓缓亮出双王,满堂寂静。', '王炸出手,茶馆沸腾!'],
      spring: ['一整局没让人碰牌,这是春天!', '掌柜都说好:春天翻倍!'],
      antiSpring: ['地主才出手一次就败走,反春!', '账房记下:反春,翻倍。'],
      win: ['地主收齐了最后一枚铜板。', '地主赢下这一局。'],
      lose: ['两位庄稼汉联手,赢了地主!', '地主折了本,农民分了红。'],
    },
  },
  {
    id: 'neon',
    name: '深夜霓虹',
    palette: { felt: '#262047', bg: '#12101f', panel: '#1c1830', accent: '#e05fa0', cardFace: '#f4f2ff', cardRed: '#ff5c7a', cardBlack: '#241f3d', text: '#e8e6f5', textDim: '#8e89ad' },
    aiNames: ['DJ小鹿', '夜猫子'],
    aiAvatars: ['🦌', '🕶️'],
    copy: {
      deal: ['牌来了,今晚手气如何?', '霓虹灯下,牌局开场。'],
      bid: ['{name}打了个响指:{score} 分!', '{name}压低帽檐:「{score} 分。」'],
      pass: ['{name}把牌扣下:「不了。」', '{name}耸耸肩,pass。'],
      bomb: ['{name}拍出炸弹,低音炮都响了!', 'Boom!{name}的炸弹炸翻全场!'],
      rocket: ['{name}亮出双王,灯光都聚焦了!', '王炸登场,今晚最炸的一刻!'],
      spring: ['Spring!地主全程 solo 通关!', '零封农民,春天达成!'],
      antiSpring: ['地主刚起手就被团灭,反春!', '农民 combo 完美,反春翻倍!'],
      win: ['地主笑到了最后。', '地主带走这一局。'],
      lose: ['农民绝地反击,拿下!', '两个农民一台戏,地主输了!'],
    },
  },
];

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

// 事件文案:从主题 copy 里按 key 取一条变体;{name}/{score} 占位替换
export function themeCopy(theme, key, vars = {}) {
  const list = theme.copy[key] || [''];
  const text = list[Math.floor(Math.random() * list.length)];
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
