const { chromium } = require('playwright');
const path = require('path');

/* 이 환경에는 크로미움이 미리 깔려 있다. 다른 곳에서는 PW_CHROMIUM 으로 지정하거나 비워 두면 된다. */
const launchOpts = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const PAGE_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');

const SIM = (runs, style) => {
  const MAX = 1.25;

  /* 실제 플레이어처럼 조준선을 보고 각도를 고른다:
     크리티컬 > 폭탄 > 깊은 페그 순으로 첫 충돌을 노린다. */
  function chooseAngle() {
    if (style === 'random') return (Math.random() - 0.5) * 2 * MAX;
    let best = null, bestScore = -1;
    for (let i = 0; i <= 40; i++) {
      const a = -MAX + (2 * MAX) * i / 40;
      const hit = window.__peg.previewHit(a);
      if (!hit) continue;
      const score = hit.type === 'crit' ? 100 : hit.type === 'bomb' ? 70 : hit.y / 20;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return best === null ? 0 : best;
  }

  const out = [];
  for (let r = 0; r < runs; r++) {
    window.__peg.startRun();
    let shots = 0, guard = 0;
    while (guard++ < 4000) {
      const st = window.__peg.state();
      if (st.phase === 'aim') { shots++; window.__peg.fireAndResolve(chooseAngle()); }
      else if (st.phase === 'reward') window.__peg.takeCard(Math.floor(Math.random() * 3));
      else { out.push({ end: st.phase, floor: st.floor, shots }); break; }
    }
  }
  return out;
};

(async () => {
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(PAGE_URL);
  await page.waitForTimeout(300);

  const N = Number(process.env.N || 60);
  for (const style of ['random', 'aimed']) {
    const res = await page.evaluate(([n, s, fn]) => eval('(' + fn + ')')(n, s), [N, style, SIM.toString()]);
    const wins = res.filter((r) => r.end === 'victory').length;
    const avgFloor = res.reduce((a, b) => a + b.floor, 0) / res.length;
    const battles = res.reduce((a, b) => a + Math.min(b.floor, 10), 0);
    const spb = res.reduce((a, b) => a + b.shots, 0) / battles;
    console.log(`[${style.padEnd(6)}] 승률 ${(wins / res.length * 100).toFixed(0)}% · 평균 ${avgFloor.toFixed(1)}층 · 전투당 ${spb.toFixed(1)}발`);
  }
  console.log('오류:', errors.length ? errors.slice(0, 5) : '없음');
  await browser.close();
})();
