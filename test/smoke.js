/* 스모크 테스트: 실제 입력 경로와 전체 런 완주를 검증한다.
   실행: node test/smoke.js   (PW_CHROMIUM 으로 크로미움 경로 지정 가능) */
const { chromium } = require('playwright');
const path = require('path');

const launchOpts = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {};
const PAGE_URL = 'file://' + path.resolve(__dirname, '..', 'index.html');

const AUTOPLAY = (runs) => {
  const MAX = 1.25;
  const out = [];
  for (let r = 0; r < runs; r++) {
    window.__peg.startRun();
    let shots = 0, guard = 0;
    while (guard++ < 4000) {
      const st = window.__peg.state();
      if (st.phase === 'aim') {
        shots++;
        window.__peg.fireAndResolve((Math.random() - 0.5) * 2 * MAX);
      } else if (st.phase === 'reward') {
        window.__peg.takeCard(Math.floor(Math.random() * 3));
      } else {
        out.push({ end: st.phase, floor: st.floor, shots });
        break;
      }
    }
    if (guard >= 4000) out.push({ end: 'STUCK', floor: -1, shots });
  }
  return out;
};

(async () => {
  const browser = await chromium.launch(launchOpts);
  const page = await browser.newPage({ viewport: { width: 500, height: 940 } });

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(PAGE_URL);
  await page.waitForTimeout(400);

  /* 1) 사람이 하는 그대로 — 시작 버튼, 조준, 발사 */
  await page.click('[data-act="start"]');
  const box = await page.locator('#board').boundingBox();
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.4);
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(1200);

  const afterShot = await page.evaluate(() => window.__peg.state());
  const inputOk = afterShot.phase === 'shoot' || afterShot.phase === 'aim' || afterShot.phase === 'reward';
  console.log('포인터 입력으로 발사:', inputOk ? 'OK' : 'FAIL (' + afterShot.phase + ')');

  /* 2) 여러 런을 끝까지 — 무한 루프나 예외가 없는지 */
  const runs = Number(process.env.RUNS || 30);
  const res = await page.evaluate(([n, fn]) => eval('(' + fn + ')')(n), [runs, AUTOPLAY.toString()]);

  const stuck = res.filter((r) => r.end === 'STUCK').length;
  const wins = res.filter((r) => r.end === 'victory').length;
  console.log(`런 ${res.length}회 완주 · 클리어 ${wins} · 멈춤 ${stuck}`);
  console.log('오류:', errors.length ? errors.slice(0, 5) : '없음');

  await browser.close();
  const failed = errors.length > 0 || stuck > 0 || !inputOk;
  if (failed) process.exitCode = 1;
})();
