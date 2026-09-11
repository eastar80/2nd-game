/* 원-원 충돌만으로 이루어진 최소 물리 엔진.
   외부 라이브러리 없이 파일만 열어도 돌아가도록 직접 구현했다. */
const Physics = (() => {
  const GRAVITY = 0.34;
  const MAX_SPEED = 19;
  const SUBSTEPS = 5;
  const MIN_BOUNCE_SPEED = 1.5;  // 페그 사이에 끼어 멈추는 것 방지
  const STILL_LIMIT = 70;        // 이 프레임 수만큼 거의 멈춰 있으면 종료

  function makeBall(x, y, angle, speed, orb) {
    return {
      x, y,
      vx: Math.sin(angle) * speed,
      vy: Math.cos(angle) * speed,
      r: orb.r,
      bounce: orb.bounce,
      pierce: orb.pierce || 0,
      chaos: !!orb.chaos,
      contacts: new Set(),
      trail: [],
      hits: 0,
      damage: 0,
      crit: false,
      still: 0,
      done: false,
    };
  }

  /* 한 프레임 전진. 충돌/이탈은 events 배열로 보고한다. */
  function step(balls, pegs, bounds, events) {
    const { width, floorY } = bounds;

    for (let s = 0; s < SUBSTEPS; s++) {
      for (const b of balls) {
        if (b.done) continue;

        b.vy += GRAVITY / SUBSTEPS;

        const sp = Math.hypot(b.vx, b.vy);
        if (sp > MAX_SPEED) { b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }

        b.x += b.vx / SUBSTEPS;
        b.y += b.vy / SUBSTEPS;

        if (b.x - b.r < 0)      { b.x = b.r;          b.vx = Math.abs(b.vx) * b.bounce; }
        if (b.x + b.r > width)  { b.x = width - b.r;  b.vx = -Math.abs(b.vx) * b.bounce; }
        if (b.y - b.r < 0)      { b.y = b.r;          b.vy = Math.abs(b.vy) * b.bounce; }

        for (const p of pegs) {
          if (p.removed) continue;

          const dx = b.x - p.x, dy = b.y - p.y;
          const rr = b.r + p.r;
          const d2 = dx * dx + dy * dy;

          if (d2 > rr * rr) { b.contacts.delete(p.id); continue; }

          const d = Math.sqrt(d2) || 0.0001;
          const nx = dx / d, ny = dy / d;

          /* 같은 페그 안에 머무는 동안 중복 집계되지 않도록 한 번만 보고 */
          const fresh = !b.contacts.has(p.id);
          if (fresh) {
            b.contacts.add(p.id);
            events.push({ type: 'peg', peg: p, ball: b });
          }

          if (b.pierce > 0) { if (fresh) b.pierce--; continue; }

          b.x = p.x + nx * rr;
          b.y = p.y + ny * rr;

          const dot = b.vx * nx + b.vy * ny;
          b.vx = (b.vx - 2 * dot * nx) * b.bounce;
          b.vy = (b.vy - 2 * dot * ny) * b.bounce;

          if (b.chaos) {
            const a = (Math.random() - 0.5) * 0.6;
            const c = Math.cos(a), sn = Math.sin(a);
            const vx = b.vx, vy = b.vy;
            b.vx = vx * c - vy * sn;
            b.vy = vx * sn + vy * c;
          }

          const after = Math.hypot(b.vx, b.vy);
          if (after < MIN_BOUNCE_SPEED) { b.vx = nx * MIN_BOUNCE_SPEED; b.vy = ny * MIN_BOUNCE_SPEED; }
        }

        if (b.y - b.r > floorY) { b.done = true; events.push({ type: 'exit', ball: b }); }
      }
    }

    for (const b of balls) {
      if (b.done) continue;
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 10) b.trail.shift();

      b.still = Math.hypot(b.vx, b.vy) < 0.55 ? b.still + 1 : 0;
      if (b.still > STILL_LIMIT) { b.done = true; events.push({ type: 'exit', ball: b, stuck: true }); }
    }
  }

  /* 조준선: 실제와 같은 물리로 첫 충돌 직전까지만 미리 굴려 본다. */
  function preview(x, y, angle, speed, orb, pegs, bounds, steps) {
    const ghost = makeBall(x, y, angle, speed, orb);
    ghost.pierce = 0;
    const pts = [];
    let firstPeg = null;
    for (let i = 0; i < steps; i++) {
      const ev = [];
      step([ghost], pegs, bounds, ev);
      pts.push({ x: ghost.x, y: ghost.y });
      const hit = ev.find((e) => e.type === 'peg');
      if (hit) { firstPeg = hit.peg; break; }
      if (ghost.done) break;
    }
    return { pts, peg: firstPeg };
  }

  return { makeBall, step, preview, GRAVITY, MAX_SPEED };
})();
