/* 게임 데이터: 구슬(덱), 유물, 적, 조우 구성 */

const ORBS = {
  stone:  { name: '돌구슬',       icon: '⚪', color: '#9fb3c8', dmg: 3, r: 8,  bounce: .78, desc: '평범하지만 믿음직한 기본 구슬.' },
  light:  { name: '가벼운 구슬',  icon: '💠', color: '#7ee8fa', dmg: 2, r: 6,  bounce: .92, desc: '잘 튕겨서 페그를 많이 맞힌다.' },
  heavy:  { name: '무거운 구슬',  icon: '🟤', color: '#c08457', dmg: 8, r: 11, bounce: .52, desc: '덜 튕기지만 한 방이 무겁다.' },
  twin:   { name: '쌍둥이 구슬',  icon: '👯', color: '#f7a1c4', dmg: 2, r: 6,  bounce: .84, split: 2, desc: '발사할 때 두 갈래로 갈라진다.' },
  bomb:   { name: '폭탄 구슬',    icon: '💣', color: '#ff8a5c', dmg: 3, r: 9,  bounce: .70, explode: 62, desc: '맞힌 페그 주변을 폭발시킨다.' },
  pierce: { name: '관통 구슬',    icon: '🗡️', color: '#b48cf2', dmg: 5, r: 7,  bounce: .80, pierce: 3, desc: '처음 3번은 페그를 뚫고 지나간다.' },
  poison: { name: '독 구슬',      icon: '🧪', color: '#8ce99a', dmg: 2, r: 8,  bounce: .80, poison: 1, desc: '히트마다 적에게 중독을 1 쌓는다.' },
  leech:  { name: '흡혈 구슬',    icon: '🩸', color: '#ff6b81', dmg: 2, r: 8,  bounce: .80, heal: 1, desc: '히트마다 체력을 1 회복한다.' },
  chaos:  { name: '혼돈 구슬',    icon: '🌀', color: '#ffd43b', dmg: 4, r: 8,  bounce: .95, chaos: true, desc: '튕길 때마다 방향이 크게 흔들린다.' },
};

/* 보상으로 등장하는 구슬 (돌구슬은 기본 덱 전용) */
const ORB_POOL = ['light', 'heavy', 'twin', 'bomb', 'pierce', 'poison', 'leech', 'chaos'];

const RELICS = {
  sharp:       { name: '숫돌',        icon: '🔪', desc: '모든 히트의 데미지 +1' },
  critEye:     { name: '매의 눈',     icon: '👁️', desc: '크리티컬 페그가 2개 더 생긴다' },
  armor:       { name: '무쇠 갑옷',   icon: '🛡️', desc: '최대 체력 +20 (즉시 회복)' },
  lucky:       { name: '행운의 동전', icon: '🪙', desc: '바닥 슬롯 배율 +1' },
  chain:       { name: '연쇄 부적',   icon: '⛓️', desc: '한 발에 8히트 이상이면 데미지 1.5배' },
  vamp:        { name: '피의 성배',   icon: '🍷', desc: '전투에서 이기면 체력 8 회복' },
  powder:      { name: '화약고',      icon: '🧨', desc: '폭발 반경 +60%' },
  scope:       { name: '조준경',      icon: '🔭', desc: '조준선이 훨씬 길어진다' },
  firstStrike: { name: '선제의 룬',   icon: '⚡', desc: '각 전투의 첫 발은 데미지 2배' },
  reload:      { name: '여분 탄창',   icon: '📦', desc: '덱에 돌구슬 2개를 넣는다' },
  thorn:       { name: '가시 방패',   icon: '🌵', desc: '적에게 맞으면 그 적에게 6 데미지' },
  clock:       { name: '모래시계',    icon: '⏳', desc: '모든 적의 공격 주기 +1' },
};

const ENEMY_TYPES = {
  slime: { name: '슬라임',    face: '🟢', hp: 55,  atk: 7,  tick: 3, tier: 1 },
  bat:   { name: '박쥐',      face: '🦇', hp: 34,  atk: 5,  tick: 2, tier: 1 },
  mush:  { name: '독버섯',    face: '🍄', hp: 62,  atk: 9,  tick: 4, tier: 1 },
  wolf:  { name: '늑대',      face: '🐺', hp: 72,  atk: 11, tick: 3, tier: 2 },
  ghost: { name: '유령',      face: '👻', hp: 60,  atk: 12, tick: 2, tier: 2 },
  golem: { name: '돌골렘',    face: '🗿', hp: 110, atk: 16, tick: 4, tier: 2 },
  boss:  { name: '왕관 골렘', face: '👑', hp: 380, atk: 26, tick: 3, boss: true },
};

const PLAYER_MAX_HP = 75;
const START_DECK = ['stone', 'stone', 'stone', 'stone', 'light', 'heavy'];
const TOTAL_FLOORS = 10;

/* 층에 맞는 적 구성 */
function makeEncounter(floor) {
  if (floor >= TOTAL_FLOORS) return [spawnEnemy('boss', 1)];

  const pool = floor <= 3 ? ['slime', 'bat', 'mush']
             : floor <= 6 ? ['slime', 'mush', 'wolf', 'ghost']
             : ['wolf', 'ghost', 'golem'];
  const count = floor <= 2 ? 1 : floor <= 6 ? 2 : (Math.random() < .5 ? 2 : 3);
  const scale = 1 + (floor - 1) * 0.085;

  const list = [];
  for (let i = 0; i < count; i++) {
    list.push(spawnEnemy(pool[(Math.random() * pool.length) | 0], scale));
  }
  return list;
}

let _enemyId = 0;
function spawnEnemy(typeId, scale) {
  const t = ENEMY_TYPES[typeId];
  const hp = Math.round(t.hp * scale);
  return {
    uid: ++_enemyId,
    typeId,
    name: t.name,
    face: t.face,
    hp,
    maxHp: hp,
    atk: Math.round(t.atk * (1 + (scale - 1) * 0.6)),
    tick: t.tick,
    counter: t.tick,
    poison: 0,
    boss: !!t.boss,
    dead: false,
  };
}
