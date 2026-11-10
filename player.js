(function () {
  const $ = id => document.getElementById(id);
  const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const seg = (u, a, b) => cl((u - a) / (b - a));
  const T = 8.9;

  /* clips in the forward video: [u start, u end, t start, t end] */
  /* [u start, u end, clip duration in s] — clips are concatenated in fwd.mp4 (and reversed in rev.mp4) */
  const RAW = [[0.2, 1.6, 5.57], [1.6, 2.75, 5.97], [2.75, 3.3, 5.97], [3.3, 3.89, 5.97], [3.89, 4.45, 5.97], [4.45, 5.6, 5.96], [5.6, 7.2, 5.867], [7.2, 8.6, 6.25]];
  let acc = 0; const CLIPS = RAW.map(([a, b, d]) => { const c = [a, b, acc, acc + d]; acc += d; return c; });
  const D = acc;
  const U0 = CLIPS[0][0], U1 = CLIPS[CLIPS.length - 1][1];
  function tOf(u) { if (u <= U0) return 0; for (const [a, b, ta, tb] of CLIPS) if (u <= b) return ta + (u - a) / (b - a) * (tb - ta); return D; }
  const cu_ = u => cl(u, U0, U1);

  const STOPS = [0, 2.75, 3.3, 3.89, 4.45, 5.6, 7.2, 8.6];
  const fwd = $('vf'), rev = $('vr');
  let active = fwd, cu = 0, idx = 0, tw = null, lockUntil = 0, play = null, mob = false;
  document.documentElement.style.overflow = 'hidden';
  $('track').style.height = '100vh';

  /* seconds of screen time per clip when scrolling (clip 1 = drawer, clip 2 = diploma) */
  const TGT = [1.2, 2.05, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5];
  function clipAt(t, fw) { for (let i = 0; i < CLIPS.length; i++) { const [, , ta, tb] = CLIPS[i]; if (fw ? t < tb - 1e-3 : t <= tb + 1e-3 && t > ta + 1e-3) return i; } return CLIPS.length - 1; }
  const rateAt = (t, fw) => { const i = clipAt(t, fw); return cl((CLIPS[i][3] - CLIPS[i][2]) / TGT[i], .25, 16); };
  function durBetween(t0, t1) { const lo = Math.min(t0, t1), hi = Math.max(t0, t1); let s = 0; CLIPS.forEach(([, , ta, tb], i) => { const o = Math.min(hi, tb) - Math.max(lo, ta); if (o > 0) s += o / ((tb - ta) / TGT[i]); }); return s; }
  function show(v) { if (active === v) return; v.style.opacity = 1; active.style.opacity = 0; active = v; }
  function seek(v, t) { return new Promise(res => { if (Math.abs(v.currentTime - t) < 0.01) return res(); const on = () => { v.removeEventListener('seeked', on); res(); }; v.addEventListener('seeked', on); v.currentTime = t; }); }

  async function startVideo(t0, t1, dur, delay) {
    const id = Symbol(); play = { id };
    if (delay > 0) await new Promise(r => setTimeout(r, delay));
    if (play.id !== id) return;
    const forward = t1 > t0, v = forward ? fwd : rev, from = forward ? t0 : D - t0, to = forward ? t1 : D - t1;
    await seek(v, from); if (play.id !== id) return;
    show(v);
    v.playbackRate = rateAt(t0, forward);
    play = { id, v, to, fw: forward };
    try { await v.play(); } catch (e) { await seek(v, to); }
  }
  function syncOther() { /* keep the hidden video on the same frame for the next direction change */
    const t = active === fwd ? fwd.currentTime : D - rev.currentTime; const o = active === fwd ? rev : fwd; o.currentTime = active === fwd ? D - t : t;
  }

  function go(i, fast) {
    i = Math.max(0, Math.min(STOPS.length - 1, i)); if (i === idx && !tw) return;
    idx = i; const u0 = cu, u1 = STOPS[i], du = Math.abs(u1 - u0);
    const vs = Math.abs(tOf(u1) - tOf(u0)); /* seconds of video to play */
    const dur = fast ? Math.min(1.6, .5 + du * .14) : (vs > .02 ? durBetween(tOf(u0), tOf(u1)) : Math.min(3.6, Math.max(1.0, du)));
    tw = { u0, u1, t0: performance.now(), dur: dur * 1000 };
    const t0 = tOf(u0), t1 = tOf(u1);
    if (Math.abs(t1 - t0) > .02) {
      const a = cu_(u0), b = cu_(u1), frac = Math.abs(b - a) / du, delay = (Math.abs(u0 - a) / du) * dur * 1000;
      startVideo(t0, t1, dur * frac, delay);
    } else play = null;
  }
  const now = () => performance.now();
  /* anchors / brand: go straight to the step, no intermediate animation (short dip to dark) */
  async function jump(i) {
    i = Math.max(0, Math.min(STOPS.length - 1, i)); if (i === idx && !tw && !play) return;
    const id = Symbol(); play = { id }; tw = null; fwd.pause(); rev.pause();
    const st = $('stage'); st.classList.add('jmp');
    await new Promise(r => setTimeout(r, 230)); if (play.id !== id) return;
    idx = i; cu = STOPS[i]; await seek(fwd, tOf(cu)); if (play.id !== id) return;
    show(fwd); syncOther(); play = null; lockUntil = now() + 300;
    requestAnimationFrame(() => st.classList.remove('jmp'));
  }
  function step(dir) { if (now() < lockUntil) return; if (tw && Math.sign(tw.u1 - tw.u0) === dir) return; go(idx + dir); lockUntil = now() + 350; }
  addEventListener('wheel', e => { e.preventDefault(); if (Math.abs(e.deltaY) < 4) return; step(e.deltaY > 0 ? 1 : -1); }, { passive: false });
  let ty = null; addEventListener('touchstart', e => { ty = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchmove', e => { if (!e.target.closest('a,button')) e.preventDefault(); }, { passive: false });
  addEventListener('touchend', e => { if (ty == null) return; const dy = ty - e.changedTouches[0].clientY; ty = null; if (Math.abs(dy) > 30) step(dy > 0 ? 1 : -1); }, { passive: true });
  addEventListener('keydown', e => { if (['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); step(1); } if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); step(-1); } if (e.key === 'Home') jump(0); if (e.key === 'End') jump(STOPS.length - 1); });
  const nearest = u => { let b = 0; STOPS.forEach((s, i) => { if (Math.abs(s - u) < Math.abs(STOPS[b] - u)) b = i; }); return b; };
  document.querySelectorAll('[data-u]').forEach(b => b.addEventListener('click', () => { jump(nearest(parseFloat(b.dataset.u))); $('nav').classList.remove('open'); }));
  const HASH = { formation: 2.75, experiences: 3.3, aujourdhui: 7.2, contact: 8.6 };
  async function fromHash() { const h = location.hash.slice(1); let u = null; if (HASH[h] != null) u = HASH[h]; else { const m = h.match(/^u(\d+)$/); if (m) u = +m[1] / 100; } if (u != null) { cu = u; idx = nearest(u); tw = null; play = null; await seek(fwd, tOf(u)); show(fwd); syncOther(); } }
  addEventListener('hashchange', fromHash); setTimeout(fromHash, 50);

  /* ---- text printed on the parchment (formation stop) ---- */
  const PQ = [[952, 358], [1405, 375], [1333, 961], [860, 903]]; /* parchment corners in the 1920x1080 clip 2 end frame */ /* TL TR BR BL in the 1280x720 video */
  const parch = $('parch'), scr = $('scr'), cvs = $('cvs');
  const CQ = [[982, 191], [1464, 174], [1462, 908], [980, 877]]; /* CV sheet, clip 6 end frame */
  const SQ = [[729, 303], [1327, 303], [1327, 659], [729, 659]]; /* laptop screen, clip 5 end frame */
  function homography(w, h, q) {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
    const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1, g = (dx3 * dy2 - dx2 * dy3) / den, hh = (dx1 * dy3 - dx3 * dy1) / den;
    const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3;
    return `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${hh / h},0,0,1,0,${x0},${y0},0,1)`;
  }
  function mfx(u) { const ez = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; return .7 - .15 * ez(seg(u, 6.3, 7.2)) + .11 * ez(seg(u, 7.4, 8.4)); }
  function videoRect() { const W = innerWidth, H = innerHeight, VW = 1920, VH = 1080, s = Math.max(W / VW, H / VH), dw = VW * s, dh = VH * s; const fx = mob ? mfx(cu) : .15; return { s, ox: (W - dw) * fx, oy: (H - dh) * .5 }; }
  function placeParch() { if (!PQ) return; const r = videoRect(); const q = PQ.map(([x, y]) => [r.ox + x * r.s, r.oy + y * r.s]); parch.style.transform = homography(300, 360, q); document.documentElement.style.setProperty('--scrl', (r.ox + SQ[0][0] * r.s - 18) + 'px'); cvs.style.transform = homography(480, 720, CQ.map(([x, y]) => [r.ox + x * r.s, r.oy + y * r.s])); scr.style.transform = homography(520, 318, SQ.map(([x, y]) => [r.ox + x * r.s, r.oy + y * r.s])); }
  function layout() { mob = innerWidth <= 860; const p = mob ? '70% 50%' : '15% 50%'; fwd.style.objectPosition = rev.style.objectPosition = p; placeParch(); }
  addEventListener('resize', layout); layout();

  const blks = [...document.querySelectorAll('#panel .blk')], chips = [...document.querySelectorAll('.chip')], navB = [...document.querySelectorAll('nav button')];
  function frame() {
    if (tw) { const k = cl((now() - tw.t0) / tw.dur); const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; cu = tw.u0 + (tw.u1 - tw.u0) * e; if (k >= 1) { tw = null; lockUntil = Math.max(lockUntil, now() + 250); } }
    if (play && play.v && (play.v.ended || play.v.currentTime >= play.to - 0.03)) { play.v.pause(); if (!play.v.ended) play.v.currentTime = play.to; play = null; syncOther(); }
    if (play && play.v && !play.v.paused) { const g = play.fw ? play.v.currentTime : D - play.v.currentTime, r = rateAt(g, play.fw); if (Math.abs(play.v.playbackRate - r) > .01) play.v.playbackRate = r; }
    const u = cu;
    $('hint').style.display = idx > 0 ? 'none' : '';
    $('prog').style.transform = `scaleX(${cl(u / T)})`;
    navB.forEach(b => { const r = b.dataset.r.split(',').map(Number); b.classList.toggle('on', u >= r[0] && u < r[1]); });
    blks.forEach(b => { const a = +b.dataset.in, o = +(mob && b.dataset.mout ? b.dataset.mout : b.dataset.out); const v = (a < 0 ? 1 : seg(u, a - .14, a)) * (1 - seg(u, o - .12, o)); let sx = 0;
      if (b.dataset.shift && !mob) { const [s0, s1] = b.dataset.shift.split(',').map(Number); const k = seg(u, s0, s1); sx = (k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2) * (b.offsetWidth + 20); }
      if (b.dataset.off && !mob) sx = b.offsetWidth + 20;
      b.style.opacity = v; b.style.transform = `translate(${sx}px, calc(${mob ? '0px' : '-50%'} + ${(1 - v) * 26}px))`; b.classList.toggle('live', v > .5); });
    chips.forEach(ch => ch.classList.toggle('in', u >= +ch.dataset.at));
    if (mob) { const op = `${mfx(u) * 100}% 50%`; if (fwd.style.objectPosition !== op) { fwd.style.objectPosition = rev.style.objectPosition = op; placeParch(); } }
    cvs.style.opacity = (!tw && !play && Math.abs(u - 8.6) < .01) ? 1 : 0;
    scr.classList.toggle('on', !tw && !play && Math.abs(u - 7.2) < .01);
    parch.style.opacity = (PQ && !tw && !play && Math.abs(u - 2.75) < .01) ? 1 : 0;
    requestAnimationFrame(frame);
  }
  window.__3dok = true;
  requestAnimationFrame(frame);
})();
