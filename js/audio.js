/* WebAudio 기반 초경량 효과음. 외부 파일 없음. */
const Sfx = (() => {
  let ctx = null;
  let muted = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, gain) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, c.currentTime);
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(gain == null ? 0.18 : gain, c.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    osc.connect(g).connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + dur + 0.02);
  }

  return {
    /* 히트가 이어질수록 음이 올라간다 — 연속 히트의 쾌감 */
    peg(streak) {
      const step = Math.min(streak, 22);
      tone(320 * Math.pow(2, step / 12), 0.09, 'triangle', 0.12);
    },
    crit() { tone(880, 0.16, 'square', 0.11); },
    boom() { tone(90, 0.28, 'sawtooth', 0.18); },
    launch() { tone(210, 0.1, 'sine', 0.12); },
    hitEnemy() { tone(150, 0.2, 'sawtooth', 0.14); },
    hurt() { tone(110, 0.34, 'square', 0.13); },
    win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.13), i * 90)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'sine', 0.14), i * 130)); },
    pick() { tone(660, 0.12, 'triangle', 0.12); },
    toggle() { muted = !muted; return muted; },
    unlock() { ensure(); },
  };
})();
