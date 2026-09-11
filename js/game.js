/* 튕겨라, 구슬! — 페그 드롭 로그라이크 */
(() => {
'use strict';

const W = 480, H = 560;
const FLOOR_Y = 552;                 // 이 아래로 내려가면 구슬이 사라진다
const SLOT_TOP = 508;                // 바닥 배율 구역 시작
const LAUNCH = { x: W / 2, y: 26 };
const LAUNCH_SPEED = 9;
const MAX_ANGLE = 1.25;              // 정면 아래 기준 좌우 최대 조준각
const SLOT_BASE = [1, 2, 3, 2, 1];
const PEG_R = 8;
const BEST_KEY = 'peg-roguelike-best';

const $ = (id) => document.getElementById(id);
const canvas = $('board');
const ctx = canvas.getContext('2d');

let run = null;        // { hp, maxHp, floor, deck[], relics[] }
let battle = null;     // 전투 1회분 상태
let phase = 'title';   // title | aim | shoot | reward | gameover | victory
let aimAngle = 0;
let particles = [];
let floaters = [];
let shake = 0;
let pegSeq = 0;

/* ------------------------------------------------------------------ 유틸 */

const rand = (n) => (Math.random() * n) | 0;
const pick = (arr) => arr[rand(arr.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const hasRelic = (id) => !!run && run.relics.includes(id);

/* ------------------------------------------------------- 페그 보드 생성 */

const PEG_AREA = { x0: 36, x1: W - 36, y0: 100, y1: 468 };

function patternGrid() {
  const pts = [];
  const rows = 7, cols = 8;
  for (let r = 0; r < rows; r++) {
    const y = PEG_AREA.y0 + (PEG_AREA.y1 - PEG_AREA.y0) * r / (rows - 1);
    const off = (r % 2) * 0.5;
    for (let c = 0; c < cols; c++) {
      const x = PEG_AREA.x0 + (PEG_AREA.x1 - PEG_AREA.x0) * (c + off) / (cols - 1 + 0.5);
      pts.push({ x, y });
    }
  }
  return pts;
}

function patternDiamond() {
  const pts = [];
  const cx = W / 2, cy = (PEG_AREA.y0 + PEG_AREA.y1) / 2;
  const rows = 9;
  for (let r = 0; r < rows; r++) {
    const t = r / (rows - 1);
    const y = PEG_AREA.y0 + (PEG_AREA.y1 - PEG_AREA.y0) * t;
    const width = 1 - Math.abs(t - 0.5) * 2;
    const n = 2 + Math.round(width * 7);
    const span = 40 + width * 170;
    for (let c = 0; c < n; c++) {
      const x = n === 1 ? cx : cx - span + (span * 2) * c / (n - 1);
      pts.push({ x, y });
    }
  }
  return pts;
}

function patternRings() {
  const pts = [];
  const cx = W / 2, cy = (PEG_AREA.y0 + PEG_AREA.y1) / 2;
  const rings = [[58, 7], [112, 13], [166, 19]];
  for (const [radius, n] of rings) {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2) * i / n + radius * 0.01;
      pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius * 0.78 });
    }
  }
  pts.push({ x: cx, y: cy });
  return pts;
}

function patternWave() {
  const pts = [];
  const rows = 6, cols = 9;
  for (let r = 0; r < rows; r++) {
    const y0 = PEG_AREA.y0 + (PEG_AREA.y1 - PEG_AREA.y0) * r / (rows - 1);
    for (let c = 0; c < cols; c++) {
      const t = c / (cols - 1);
      const x = PEG_AREA.x0 + (PEG_AREA.x1 - PEG_AREA.x0) * t;
      const y = y0 + Math.sin(t * Math.PI * 2 + r * 0.7) * 22;
      pts.push({ x, y });
    }
  }
  return pts;
}

function generatePegs() {
  const raw = pick([patternGrid, patternDiamond, patternRings, patternWave])();
  const pegs = [];

  for (const p of raw) {
    const x = clamp(p.x + (Math.random() - 0.5) * 8, PEG_AREA.x0, PEG_AREA.x1);
    const y = clamp(p.y + (Math.random() - 0.5) * 8, PEG_AREA.y0, PEG_AREA.y1);
    if (pegs.some((q) => Math.hypot(q.x - x, q.y - y) < 26)) continue;
    pegs.push({ id: ++pegSeq, x, y, r: PEG_R, type: 'normal', hit: false, removed: false, flash: 0 });
  }

  assignSpecials(pegs);
  return pegs;
}

/* 조준선으로 첫 타에 맞힐 수 있는 페그들을 찾는다.
   특수 페그를 여기에 우선 배치해야 "노려서 맞히는" 실력이 의미를 갖는다. */
function reachablePegs(pegs) {
  const found = [];
  const seen = new Set();
  for (let i = 0; i <= 48; i++) {
    const a = -MAX_ANGLE + (2 * MAX_ANGLE) * i / 48;
    const r = Physics.preview(LAUNCH.x, LAUNCH.y + 14, a, LAUNCH_SPEED, ORBS.stone,
      pegs, { width: W, floorY: FLOOR_Y }, 40);
    if (r.peg && !seen.has(r.peg.id)) { seen.add(r.peg.id); found.push(r.peg); }
  }
  return found;
}

function assignSpecials(pegs) {
  const critCount = 2 + (hasRelic('critEye') ? 2 : 0);
  const reach = shuffle(reachablePegs(pegs));
  const reachIds = new Set(reach.map((p) => p.id));
  const hidden = shuffle(pegs.filter((p) => !reachIds.has(p.id)));

  const queue = [];
  // 폭탄 1개와 크리티컬 2개는 반드시 조준 가능한 자리에 둔다
  const aimable = reach.slice(0, 3);
  const deep = hidden.slice(0, Math.max(0, critCount - 2));
  queue.push(...aimable, ...deep);

  queue.forEach((p, i) => { p.type = i === 0 ? 'bomb' : 'crit'; });
}

const livePegs = () => battle.pegs.filter((p) => !p.removed).length;

/* ------------------------------------------------------------ 런 / 전투 */

function newRun() {
  run = {
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    floor: 1,
    deck: START_DECK.slice(),
    relics: [],
  };
  startBattle();
}

function startBattle() {
  battle = {
    enemies: makeEncounter(run.floor),
    targetUid: null,
    drawPile: [],
    orbId: null,
    balls: [],
    pegs: generatePegs(),
    shots: 0,
    acc: 0,
    shotDamage: 0,
    shotHits: 0,
  };
  battle.targetUid = battle.enemies[0].uid;
  refillDeck();
  drawOrb();
  phase = 'aim';
  renderEnemies();
  syncHud();
}

function refillDeck() {
  battle.drawPile = shuffle(run.deck);
}

function drawOrb() {
  if (!battle.drawPile.length) refillDeck();
  battle.orbId = battle.drawPile.pop();
  battle.acc = 0;
  syncHud();
}

const currentOrb = () => ORBS[battle.orbId];

function aliveEnemies() {
  return battle.enemies.filter((e) => !e.dead);
}

function targetEnemy() {
  const t = battle.enemies.find((e) => e.uid === battle.targetUid && !e.dead);
  return t || aliveEnemies()[0] || null;
}

/* ---------------------------------------------------------------- 발사 */

function fire() {
  if (phase !== 'aim') return;
  const orb = currentOrb();
  const n = orb.split || 1;
  battle.balls = [];
  for (let i = 0; i < n; i++) {
    const spread = n === 1 ? 0 : (i - (n - 1) / 2) * 0.16;
    battle.balls.push(Physics.makeBall(LAUNCH.x, LAUNCH.y + 14, aimAngle + spread, LAUNCH_SPEED, orb));
  }
  battle.shots++;
  battle.shotDamage = 0;
  battle.shotHits = 0;
  battle.acc = 0;
  phase = 'shoot';
  Sfx.launch();
}

function hitDamage(ball) {
  let d = currentOrb().dmg + (hasRelic('sharp') ? 1 : 0);
  if (ball.crit) d = Math.round(d * 2.5);
  return d;
}

function scoreHit(ball, peg) {
  peg.hit = true;
  peg.flash = 1;

  const d = hitDamage(ball);
  ball.damage += d;
  ball.hits++;
  battle.shotHits++;
  battle.acc += d;

  const orb = currentOrb();
  if (orb.poison) {
    const t = targetEnemy();
    if (t) t.poison += orb.poison;
  }
  if (orb.heal && run.hp < run.maxHp) {
    run.hp = Math.min(run.maxHp, run.hp + orb.heal);
    syncHud();
  }

  burst(peg.x, peg.y, ball.crit ? '#ff9f43' : orb.color, 6);
  Sfx.peg(battle.shotHits);
  shake = Math.min(shake + 1.1, 7);
}

function explodeAt(peg, ball) {
  const radius = (currentOrb().explode || 60) * (hasRelic('powder') ? 1.6 : 1);
  for (const p of battle.pegs) {
    if (p.removed || p === peg) continue;
    if (Math.hypot(p.x - peg.x, p.y - peg.y) > radius) continue;
    if (!p.hit) scoreHit(ball, p);
    p.removed = true;
  }
  burst(peg.x, peg.y, '#ff8a5c', 22);
  shake = 9;
  Sfx.boom();
}

function onPegEvent(ball, peg) {
  if (!peg.hit) scoreHit(ball, peg);

  if (peg.type === 'crit' && !ball.crit) {
    ball.crit = true;
    floaters.push({ x: peg.x, y: peg.y - 14, text: '크리티컬!', life: 1, color: '#ff9f43' });
    Sfx.crit();
  }
  if (peg.type === 'bomb') {
    peg.type = 'normal';
    explodeAt(peg, ball);
    peg.removed = true;
  }
  if (currentOrb().explode) explodeAt(peg, ball);
}

function slotIndex(x) {
  return clamp(Math.floor(x / (W / SLOT_BASE.length)), 0, SLOT_BASE.length - 1);
}

function slotValue(i) {
  return SLOT_BASE[i] + (hasRelic('lucky') ? 1 : 0);
}

function onBallExit(ball, stuck) {
  if (ball.damage <= 0) return;
  const mult = stuck ? 1 : slotValue(slotIndex(ball.x));
  const total = ball.damage * mult;
  battle.shotDamage += total;
  if (mult > 1 && !stuck) {
    floaters.push({ x: clamp(ball.x, 30, W - 30), y: SLOT_TOP - 6, text: '×' + mult, life: 1.2, color: '#ffd43b' });
  }
}

function endShot() {
  let dmg = battle.shotDamage;

  if (hasRelic('chain') && battle.shotHits >= 8) dmg = Math.round(dmg * 1.5);
  if (hasRelic('firstStrike') && battle.shots === 1) dmg *= 2;

  const t = targetEnemy();
  if (t && dmg > 0) damageEnemy(t, dmg);

  battle.pegs.forEach((p) => { if (p.hit) p.removed = true; });
  if (livePegs() < 16) battle.pegs = generatePegs();

  if (!aliveEnemies().length) { winBattle(); return; }

  enemyTurn();
  if (phase === 'gameover') return;
  if (!aliveEnemies().length) { winBattle(); return; }

  drawOrb();
  phase = 'aim';
}

function damageEnemy(e, dmg) {
  e.hp -= dmg;
  floaters.push({ x: W / 2, y: 70, text: '-' + dmg, life: 1.3, color: '#ff5470', big: true });
  Sfx.hitEnemy();
  shake = Math.max(shake, 6);
  if (e.hp <= 0) { e.hp = 0; e.dead = true; }
  renderEnemies();
}

function enemyTurn() {
  for (const e of aliveEnemies()) {
    if (e.poison > 0) {
      e.hp -= e.poison;
      if (e.hp <= 0) { e.hp = 0; e.dead = true; continue; }
    }
    e.counter--;
    if (e.counter > 0) continue;

    run.hp -= e.atk;
    e.counter = e.tick + (hasRelic('clock') ? 1 : 0);
    flashEnemy(e.uid);
    Sfx.hurt();
    shake = 10;

    if (hasRelic('thorn')) {
      e.hp -= 6;
      if (e.hp <= 0) { e.hp = 0; e.dead = true; }
    }
  }

  syncHud();
  renderEnemies();

  if (run.hp <= 0) { run.hp = 0; gameOver(); }
}

function winBattle() {
  if (hasRelic('vamp')) run.hp = Math.min(run.maxHp, run.hp + 8);
  syncHud();
  Sfx.win();

  const best = Number(localStorage.getItem(BEST_KEY) || 0);
  if (run.floor > best) localStorage.setItem(BEST_KEY, String(run.floor));

  if (run.floor >= TOTAL_FLOORS) { phase = 'victory'; showVictory(); return; }
  run.floor++;
  phase = 'reward';
  showReward();
}

function gameOver() {
  phase = 'gameover';
  Sfx.lose();
  showGameOver();
}

/* ---------------------------------------------------------------- 보상 */

function rollRewards() {
  const cards = [];
  const ownedRelics = run.relics;
  const relicPool = Object.keys(RELICS).filter((id) => !ownedRelics.includes(id));

  const bag = [];
  ORB_POOL.forEach((id) => bag.push({ kind: 'orb', id }));
  relicPool.forEach((id) => bag.push({ kind: 'relic', id }, { kind: 'relic', id }));
  bag.push({ kind: 'heal' });

  const seen = new Set();
  let guard = 0;
  while (cards.length < 3 && guard++ < 200) {
    const c = pick(bag);
    const key = c.kind + ':' + (c.id || '');
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push(c);
  }
  return cards;
}

function takeReward(card) {
  Sfx.pick();
  if (card.kind === 'orb') {
    run.deck.push(card.id);
  } else if (card.kind === 'relic') {
    run.relics.push(card.id);
    if (card.id === 'armor') { run.maxHp += 20; run.hp += 20; }
    if (card.id === 'reload') { run.deck.push('stone', 'stone'); }
  } else {
    run.hp = Math.min(run.maxHp, run.hp + 25);
  }
  hideOverlay();
  startBattle();
}

/* ------------------------------------------------------------- 화면 표시 */

function syncHud() {
  if (!run) return;
  $('floorNum').textContent = run.floor;
  $('hpFill').style.width = (run.hp / run.maxHp * 100) + '%';
  $('hpText').textContent = run.hp + ' / ' + run.maxHp;

  $('relicRow').innerHTML = run.relics
    .map((id) => `<div class="relic" title="${RELICS[id].name}: ${RELICS[id].desc}">${RELICS[id].icon}</div>`)
    .join('');

  if (battle && battle.orbId) {
    const o = currentOrb();
    $('orbDot').style.background = o.color;
    $('orbDot').style.color = o.color;
    $('orbName').textContent = o.name;
    $('orbDesc').textContent = o.desc;
    $('deckCount').textContent = battle.drawPile.length;
    $('accDmg').textContent = battle.acc;
  }
}

function renderEnemies() {
  if (!battle) { $('enemyRow').innerHTML = ''; return; }
  $('enemyRow').innerHTML = battle.enemies.map((e) => {
    const cls = ['enemy'];
    if (e.dead) cls.push('dead');
    if (e.uid === battle.targetUid) cls.push('targeted');
    return `<div class="${cls.join(' ')}" data-uid="${e.uid}">
      <div class="face">${e.face}</div>
      <div class="name">${e.name}</div>
      <div class="bar"><i style="width:${e.hp / e.maxHp * 100}%"></i></div>
      <div class="meta">
        <span>${e.hp}/${e.maxHp}</span>
        <span>${e.poison ? `<span class="psn">☠${e.poison}</span> ` : ''}<span class="tick">⚔${e.counter}</span></span>
      </div>
    </div>`;
  }).join('');
}

function flashEnemy(uid) {
  const el = $('enemyRow').querySelector(`[data-uid="${uid}"]`);
  if (!el) return;
  el.classList.remove('hurt');
  void el.offsetWidth;
  el.classList.add('hurt');
}

function showOverlay(html) {
  const ov = $('overlay');
  ov.innerHTML = html;
  ov.classList.remove('hidden');
}

function hideOverlay() { $('overlay').classList.add('hidden'); }

function showTitle() {
  const best = localStorage.getItem(BEST_KEY);
  showOverlay(`
    <h1>튕겨라, 구슬!</h1>
    <p>구슬을 쏴서 페그를 맞히면 데미지가 쌓이고,<br>바닥 배율 구역을 지나며 적에게 꽂힌다.<br>이기면 새 구슬이나 유물을 얻어 덱을 키운다.</p>
    ${best ? `<p class="hint">최고 기록 · ${best}층</p>` : ''}
    <button class="btn" data-act="start">런 시작</button>
    <p class="hint">마우스(또는 손가락)로 조준 · 놓으면 발사</p>
  `);
}

function showReward() {
  const cards = rollRewards();
  const html = cards.map((c, i) => {
    if (c.kind === 'orb') {
      const o = ORBS[c.id];
      return `<div class="card" data-act="reward" data-i="${i}">
        <div class="tag">구슬</div><div class="icon">${o.icon}</div>
        <div class="ttl">${o.name}</div><div class="sub">히트당 ${o.dmg}<br>${o.desc}</div></div>`;
    }
    if (c.kind === 'relic') {
      const r = RELICS[c.id];
      return `<div class="card" data-act="reward" data-i="${i}">
        <div class="tag">유물</div><div class="icon">${r.icon}</div>
        <div class="ttl">${r.name}</div><div class="sub">${r.desc}</div></div>`;
    }
    return `<div class="card" data-act="reward" data-i="${i}">
      <div class="tag">휴식</div><div class="icon">💖</div>
      <div class="ttl">체력 회복</div><div class="sub">체력을 25 회복한다</div></div>`;
  }).join('');

  showOverlay(`<h2>${run.floor - 1}층 돌파!</h2><p>하나를 골라 덱을 키우자</p><div class="cards">${html}</div>`);
  $('overlay')._cards = cards;
}

function showGameOver() {
  showOverlay(`
    <h1>패배…</h1>
    <p>${run.floor}층에서 쓰러졌다.<br>유물 ${run.relics.length}개 · 덱 ${run.deck.length}장</p>
    <button class="btn" data-act="start">다시 도전</button>
  `);
}

function showVictory() {
  showOverlay(`
    <h1>🏆 클리어!</h1>
    <p>왕관 골렘을 쓰러뜨렸다.<br>남은 체력 ${run.hp} · 유물 ${run.relics.length}개</p>
    <button class="btn" data-act="start">새 런</button>
  `);
}

/* ------------------------------------------------------------ 이펙트 */

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 1 + Math.random() * 3;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color });
  }
}

function stepEffects() {
  particles = particles.filter((p) => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.97; p.life -= 0.035;
    return p.life > 0;
  });
  floaters = floaters.filter((f) => { f.y -= 0.7; f.life -= 0.02; return f.life > 0; });
  shake *= 0.86;
  if (shake < 0.2) shake = 0;
}

/* ------------------------------------------------------------ 렌더링 */

function draw() {
  ctx.save();
  ctx.clearRect(0, 0, W, H);

  if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#131a35');
  bg.addColorStop(1, '#080b18');
  ctx.fillStyle = bg;
  ctx.fillRect(-12, -12, W + 24, H + 24);

  drawSlots();
  if (battle) {
    drawPegs();
    drawLauncher();
    if (phase === 'aim') drawAim();
    drawBalls();
  }
  drawParticles();
  drawFloaters();

  ctx.restore();
}

function drawSlots() {
  const n = SLOT_BASE.length;
  const w = W / n;
  for (let i = 0; i < n; i++) {
    const v = run ? slotValue(i) : SLOT_BASE[i];
    const alpha = 0.08 + v * 0.05;
    ctx.fillStyle = `rgba(255, 212, 59, ${alpha})`;
    ctx.fillRect(i * w, SLOT_TOP, w, H - SLOT_TOP);
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.strokeRect(i * w + .5, SLOT_TOP + .5, w - 1, H - SLOT_TOP - 1);
    ctx.fillStyle = 'rgba(255, 212, 59, .85)';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('×' + v, i * w + w / 2, SLOT_TOP + 30);
  }
}

function drawPegs() {
  for (const p of battle.pegs) {
    if (p.removed) continue;
    if (p.flash > 0) p.flash -= 0.08;

    let color = '#5f74b8', glow = 'rgba(95,116,184,.35)';
    if (p.type === 'crit') { color = '#ff9f43'; glow = 'rgba(255,159,67,.45)'; }
    if (p.type === 'bomb') { color = '#ff5470'; glow = 'rgba(255,84,112,.45)'; }
    if (p.hit) { color = '#33406f'; glow = 'rgba(0,0,0,0)'; }

    const r = p.r + Math.max(0, p.flash) * 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    if (!p.hit) {
      ctx.beginPath();
      ctx.arc(p.x - r * 0.3, p.y - r * 0.3, r * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fill();
    }
  }
}

function drawLauncher() {
  ctx.beginPath();
  ctx.arc(LAUNCH.x, LAUNCH.y, 13, 0, Math.PI * 2);
  ctx.fillStyle = '#2c3765';
  ctx.fill();
  ctx.strokeStyle = '#5f74b8';
  ctx.lineWidth = 2;
  ctx.stroke();

  const o = battle.orbId ? currentOrb() : null;
  if (o) {
    ctx.beginPath();
    ctx.arc(LAUNCH.x, LAUNCH.y, o.r, 0, Math.PI * 2);
    ctx.fillStyle = o.color;
    ctx.fill();
  }
}

function drawAim() {
  const o = currentOrb();
  const steps = hasRelic('scope') ? 90 : 34;
  const { pts, peg } = Physics.preview(LAUNCH.x, LAUNCH.y + 14, aimAngle, LAUNCH_SPEED, o,
    battle.pegs, { width: W, floorY: FLOOR_Y }, steps);

  ctx.fillStyle = 'rgba(255,255,255,.5)';
  pts.forEach((pt, i) => {
    if (i % 2) return;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });

  /* 첫 충돌 페그를 표시해 준다 — 크리/폭탄을 노리는 것이 이 게임의 실력이다 */
  if (peg) {
    ctx.beginPath();
    ctx.arc(peg.x, peg.y, peg.r + 7, 0, Math.PI * 2);
    ctx.strokeStyle = peg.type === 'crit' ? '#ff9f43'
                    : peg.type === 'bomb' ? '#ff5470'
                    : 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawBalls() {
  const o = currentOrb();
  for (const b of battle.balls) {
    if (b.done) continue;

    b.trail.forEach((t, i) => {
      ctx.beginPath();
      ctx.arc(t.x, t.y, b.r * (i / b.trail.length) * 0.8, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${0.05 + 0.05 * i})`;
      ctx.fill();
    });

    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 5, 0, Math.PI * 2);
    ctx.fillStyle = b.crit ? 'rgba(255,159,67,.3)' : 'rgba(255,255,255,.12)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fillStyle = b.crit ? '#ff9f43' : o.color;
    ctx.fill();
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
}

function drawFloaters() {
  ctx.textAlign = 'center';
  for (const f of floaters) {
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
    ctx.fillStyle = f.color;
    ctx.font = `bold ${f.big ? 26 : 14}px system-ui, sans-serif`;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

/* --------------------------------------------------------------- 루프 */

/* 비행 중인 구슬을 한 프레임 전진시킨다. 화면 루프와 시뮬레이션이 같은 경로를 쓴다. */
function stepShot() {
  const events = [];
  Physics.step(battle.balls, battle.pegs, { width: W, floorY: FLOOR_Y }, events);

  for (const ev of events) {
    if (ev.type === 'peg') onPegEvent(ev.ball, ev.peg);
    else if (ev.type === 'exit') onBallExit(ev.ball, ev.stuck);
  }

  if (battle.balls.every((b) => b.done)) endShot();
}

function tick() {
  if (phase === 'shoot' && battle) {
    stepShot();
    $('accDmg').textContent = battle.acc;
  }

  stepEffects();
  draw();
  requestAnimationFrame(tick);
}

/* --------------------------------------------------------------- 입력 */

function pointerAngle(ev) {
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (W / rect.width);
  const y = (ev.clientY - rect.top) * (H / rect.height);
  const dx = x - LAUNCH.x;
  const dy = Math.max(y - LAUNCH.y, 12);
  return clamp(Math.atan2(dx, dy), -MAX_ANGLE, MAX_ANGLE);
}

canvas.addEventListener('pointermove', (ev) => {
  if (phase === 'aim') aimAngle = pointerAngle(ev);
});

canvas.addEventListener('pointerdown', (ev) => {
  Sfx.unlock();
  if (phase === 'aim') aimAngle = pointerAngle(ev);
});

canvas.addEventListener('pointerup', (ev) => {
  if (phase !== 'aim') return;
  aimAngle = pointerAngle(ev);
  fire();
});

document.addEventListener('keydown', (ev) => {
  if (phase !== 'aim') return;
  if (ev.key === 'ArrowLeft') aimAngle = clamp(aimAngle - 0.04, -MAX_ANGLE, MAX_ANGLE);
  if (ev.key === 'ArrowRight') aimAngle = clamp(aimAngle + 0.04, -MAX_ANGLE, MAX_ANGLE);
  if (ev.key === ' ') { ev.preventDefault(); Sfx.unlock(); fire(); }
});

$('enemyRow').addEventListener('click', (ev) => {
  const card = ev.target.closest('.enemy');
  if (!card || !battle) return;
  battle.targetUid = Number(card.dataset.uid);
  renderEnemies();
});

$('overlay').addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  Sfx.unlock();
  if (el.dataset.act === 'start') { hideOverlay(); newRun(); }
  if (el.dataset.act === 'reward') { takeReward($('overlay')._cards[Number(el.dataset.i)]); }
});

/* --------------------------------------------------------------- 시작 */

showTitle();
tick();

/* 자동화 테스트/밸런스 시뮬레이션용 훅 */
window.__peg = {
  state: () => ({
    phase,
    floor: run ? run.floor : 0,
    hp: run ? run.hp : 0,
    deck: run ? run.deck.length : 0,
    relics: run ? run.relics.slice() : [],
    alive: battle ? aliveEnemies().length : 0,
  }),
  aimAndFire: (angle) => { aimAngle = clamp(angle, -MAX_ANGLE, MAX_ANGLE); fire(); },
  /* 애니메이션을 기다리지 않고 한 발을 끝까지 굴린다 (밸런스 시뮬레이션용) */
  fireAndResolve: (angle) => {
    aimAngle = clamp(angle, -MAX_ANGLE, MAX_ANGLE);
    fire();
    let guard = 0;
    while (phase === 'shoot' && guard++ < 6000) stepShot();
    particles.length = 0;
    floaters.length = 0;
    return guard;
  },
  startRun: () => { hideOverlay(); newRun(); },
  takeCard: (i) => takeReward(($('overlay')._cards || [])[i] || $('overlay')._cards[0]),
  rewardCount: () => ($('overlay')._cards || []).length,
  previewHit: (angle) => {
    if (!battle || !battle.orbId) return null;
    const r = Physics.preview(LAUNCH.x, LAUNCH.y + 14, clamp(angle, -MAX_ANGLE, MAX_ANGLE),
      LAUNCH_SPEED, currentOrb(), battle.pegs, { width: W, floorY: FLOOR_Y }, 40);
    return r.peg ? { type: r.peg.type, y: r.peg.y } : null;
  },
};

})();
