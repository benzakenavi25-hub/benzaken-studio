/* BENZAKEN STUDIO — Phase 4: "Orbit of browsers" (hero signature)
   CSS 3D transforms (preserve-3d) driven by GSAP. No WebGL.
   - cards orbit the headline on an ellipse (camera ~12° down), back cards behind the title, smaller/dimmer/blurred
   - idle orbit, drag with momentum (horizontal only on touch), hover lift, click -> case study, arrow keys
   - scroll (pinned +=120%): headline up/out -> orbit unrolls into a flat row (ellipse line straightens)
     -> AURA + NOA ARAD cards scale up, the rest fade out
   - all geometry is computed from live measurements, so the morph is exact on every viewport (recomputed on resize) */

const DEG = Math.PI / 180;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = d => ((((d + 180) % 360) + 360) % 360) - 180;
const smooth = t => t * t * (3 - 2 * t);

export function initOrbit() {
  const hero = document.getElementById('top');
  const orbitEl = document.getElementById('orbit');
  if (!hero || !orbitEl) return null;
  const root = document.documentElement;

  // no GSAP (CDN blocked) -> fall back to the static row
  if (!window.gsap || !window.ScrollTrigger) { root.classList.remove('o3d'); return null; }
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  const world = document.getElementById('orbitWorld');
  const title = document.getElementById('orbitTitle');
  const path = document.getElementById('orbitPath');
  const svg = document.getElementById('orbitLine');
  const lower = document.getElementById('heroLower');
  const hint = document.getElementById('heroHint');
  const allCards = [...orbitEl.querySelectorAll('.ocard')];

  let api = { intro() {} };
  let introRequested = false;

  const mm = gsap.matchMedia();
  mm.add({
    desk: '(min-width: 761px) and (prefers-reduced-motion: no-preference)',
    mob: '(max-width: 760px) and (prefers-reduced-motion: no-preference)',
  }, ctx => {
    const mobile = !!ctx.conditions.mob;
    root.classList.add('o3d');

    /* ---------- cards ---------- */
    const used = mobile ? allCards.filter(li => li.hasAttribute('data-m')) : allCards;
    allCards.forEach(li => { li.hidden = !used.includes(li); });
    const N = used.length;
    const STEP = 360 / N;
    const cards = used.map((el, i) => ({
      el, i,
      a: el.querySelector('.ocard__a'),
      shade: el.querySelector('.ocard__shade'),
      vid: el.querySelector('video'),
      feat: el.hasAttribute('data-feat'),
      lift: 0, alpha: 0, blur: -1, playing: false,
      x: 0, y: 0, z: 0, sc: 1, yaw: 0, op: 1, sh: 0, df: 1, theta: 0,
    }));
    const feats = cards.filter(c => c.feat);
    // the orbit angle at which the two featured cards sit symmetrically in front
    const aStar = -(feats.reduce((s, c) => s + c.i, 0) / feats.length) * STEP;

    /* ---------- state ---------- */
    const S = {
      a: aStar - STEP * 1.5,   // current orbit angle (deg)
      vel: 0,                 // deg/s
      p: 0,                   // unroll progress (scrubbed)
      f: 0,                   // focus progress (scrubbed)
      ht: 0,                  // headline out (scrubbed)
      lo: 0,                  // lower copy out (scrubbed)
      line: 0,                // orbit line draw-in (intro)
      cards: 0,               // cards stagger-in (intro)
      delta: 0, latched: false,
    };
    const IDLE = mobile ? 7 : 6;   // deg/s
    S.vel = IDLE;
    const T = 12;                  // camera tilt (deg)
    const MAX_VIDEOS = mobile ? 1 : 4;

    /* ---------- geometry (recomputed on resize) ---------- */
    const G = {};
    const layout = () => {
      const r = orbitEl.getBoundingClientRect();
      G.vw = r.width; G.vh = r.height;
      G.W = used[0].offsetWidth; G.H = used[0].offsetHeight;
      G.cx = G.vw / 2; G.cy = G.vh * (mobile ? 0.47 : 0.5);
      G.D = mobile ? 800 : 1150;                               // CSS perspective
      G.Rx = mobile ? G.vw * 0.36 : Math.min(G.vw * 0.4, 720);
      G.Rz = G.Rx * (mobile ? 0.75 : 0.5);
      G.rowScale = mobile ? 1 : 1.12;
      G.pitch = G.W * G.rowScale * (mobile ? 1.1 : 1.14);
      G.gap = Math.max(14, G.W * 0.09);
      const gut = Math.min(72, Math.max(20, G.vw * 0.05));
      G.stack = mobile;
      G.fScale = mobile
        ? Math.min((G.vw - 2 * gut) / G.W, (G.vh * 0.62 - G.gap) / 2 / G.H)   // stacked pair: full width, fits the screen
        : Math.min(1.9, ((G.vw - 2 * gut - G.gap) / 2) / G.W);
      G.tw = title.offsetWidth; G.th = title.offsetHeight;
      // the headline sits above the orbit plane, so only its lower part is crossed by the front cards
      G.ty0 = -(G.th / 2) - G.H * (mobile ? 0.6 : 0.05);
      G.degPerPx = 57.3 / G.Rx;
      orbitEl.style.perspective = G.D + 'px';
      orbitEl.style.perspectiveOrigin = `${G.cx}px ${G.cy}px`;
      world.style.left = G.cx + 'px'; world.style.top = G.cy + 'px';
      svg.setAttribute('viewBox', `0 0 ${G.vw} ${G.vh}`);
      render(0, true);
    };

    /* ---------- projection (same maths the browser uses, for the 2D gold line) ---------- */
    const project = (x, y, z, te) => {
      const c = Math.cos(te * DEG), s = Math.sin(te * DEG);
      const y1 = y * c + z * s, z1 = -y * s + z * c;   // rotateX(-te)
      const k = G.D / (G.D - z1);
      return [G.cx + x * k, G.cy + y1 * k];
    };

    /* ---------- per-frame render ---------- */
    let frame = 0;
    const render = (dt, force) => {
      const pe = S.p, fe = S.f;
      const te = T * (1 - pe);

      // when the unroll starts, latch the rotation that brings the two featured cards to the front
      if (pe > 0.0005) { if (!S.latched) { S.delta = wrap(aStar - S.a); S.latched = true; } }
      else { S.latched = false; S.delta = 0; }
      const aEff = S.a + S.delta * smooth(pe);

      world.style.transform = `rotateX(${-te}deg)`;

      // pass 1: base positions
      for (const c of cards) {
        const th = wrap(aEff + c.i * STEP);
        const r = th * DEG;
        const xo = G.Rx * Math.sin(r), zo = G.Rz * Math.cos(r);
        const xr = (th / 360) * N * G.pitch;                  // the ring "unrolled" onto a line
        c.theta = th;
        c.x = lerp(xo, xr, pe);
        c.z = lerp(zo, 0, pe);
        c.y = 0;
        c.df = lerp((Math.cos(r) + 1) / 2, 1, pe);            // 0 = far back, 1 = front
        c.sc = lerp(1, G.rowScale, pe);
        c.yaw = -Math.sin(r) * 24 * (1 - pe);
        // hide the seam where a card wraps from one end of the row to the other
        const seam = smooth(clamp((Math.abs(th) - 150) / 28)) * clamp(pe * 3);
        c.op = 1 - seam;
      }

      // pass 2: focus (featured pair scales up into the centre, the rest fade)
      if (fe > 0) {
        if (G.stack) {
          // phones: two cards can't grow side by side, so they stack (AURA on top) at full content width
          const hf = G.H * G.fScale;
          const ty = [-(hf / 2 + G.gap / 2), hf / 2 + G.gap / 2];
          feats.forEach((c, k) => { c.x = lerp(c.x, 0, fe); c.y = lerp(c.y, ty[k], fe); c.sc = lerp(c.sc, G.fScale, fe); });
        } else {
          const [f0, f1] = feats[0].x <= feats[1].x ? feats : [feats[1], feats[0]];
          const wf = G.W * G.fScale;
          const tx = [-(wf / 2 + G.gap / 2), wf / 2 + G.gap / 2];
          [f0, f1].forEach((c, k) => { c.x = lerp(c.x, tx[k], fe); c.sc = lerp(c.sc, G.fScale, fe); });
        }
        const push = (G.fScale - G.rowScale) * G.W * 0.6 * fe;
        for (const c of cards) if (!c.feat) { c.x += Math.sign(c.x || 1) * push; c.op *= 1 - fe; }
      }

      // write
      for (const c of cards) {
        const ca = smooth(clamp((S.cards - c.i * (0.5 / N)) / 0.5));   // intro stagger
        const lift = c.lift;
        const z = c.z + lift * 110;
        const sc = c.sc * lerp(0.86, 1, ca) * (1 + lift * 0.03);
        const y = c.y + (1 - ca) * 40 - lift * 8;
        const opacity = ca * c.op * lerp(0.5, 1, c.df);
        c.el.style.transform =
          `translate3d(${(c.x - G.W / 2).toFixed(2)}px,${(y - G.H / 2).toFixed(2)}px,${z.toFixed(2)}px) rotateX(${te}deg) rotateY(${c.yaw.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
        c.el.style.opacity = opacity.toFixed(3);
        c.el.style.visibility = opacity < 0.01 ? 'hidden' : '';
        // depth blur, 0.5px steps (desktop only: on phones the depth fade is enough, and blur repaints every frame)
        const b = mobile ? 0 : Math.round((1 - c.df) * 3 * 2) / 2;
        if (b !== c.blur) { c.blur = b; c.el.style.filter = b ? `blur(${b}px)` : ''; }
        let sh = lerp(0.62, 0.16, c.df) * (1 - lift);
        if (c.feat) sh *= 1 - fe;
        c.shade.style.opacity = sh.toFixed(3);
      }

      // headline (lives at z = 0 inside the 3D world, so back cards pass behind it and front cards in front)
      const ty = G.ty0 - S.ht * G.vh * 0.24;
      title.style.transform = `translate3d(${-G.tw / 2}px,${-G.th / 2 + ty}px,0) rotateX(${te}deg)`;
      title.style.opacity = (1 - clamp(S.ht * 1.15)).toFixed(3);   // intro reveal is the word mask (motion.js)

      // lower copy + hint (2D layer; its intro reveal is in motion.js)
      lower.style.transform = `translate3d(0,${(-S.lo * 60).toFixed(1)}px,0)`;
      lower.style.opacity = (1 - S.lo).toFixed(3);
      lower.style.visibility = S.lo > 0.98 ? 'hidden' : '';
      hint.style.opacity = (clamp(S.cards - 0.4) * (1 - clamp(S.lo * 2))).toFixed(3);

      // gold orbit line: the ellipse under the cards, straightening into a horizontal line under the row
      const scLine = lerp(G.rowScale, G.fScale, fe);
      const yo = G.H / 2 + 12;
      const yr = G.stack
        ? lerp((G.H * G.rowScale) / 2 + 26, G.H * G.fScale + G.gap / 2 + 26, fe)   // under the lower stacked card
        : (G.H * scLine) / 2 + 26;
      let d = '';
      for (let k = 0; k <= 120; k++) {
        const th = -180 + (k / 120) * 360, r = th * DEG;
        const x = lerp(G.Rx * Math.sin(r), (th / 360) * N * G.pitch, pe);
        const z = lerp(G.Rz * Math.cos(r), 0, pe);
        const yy = lerp(yo, yr, pe);
        const [sx, sy] = project(x, yy, z, te);
        d += (k ? 'L' : 'M') + sx.toFixed(1) + ' ' + sy.toFixed(1);
      }
      path.setAttribute('d', d);
      path.style.strokeDashoffset = (1 - S.line).toFixed(4);

      if (!force && ++frame % 6 === 0) schedule();
    };

    /* ---------- videos: max N playing, only the cards facing the camera ---------- */
    const schedule = () => {
      if (S.cards < 0.6 || !visible || document.hidden) { cards.forEach(stop); return; }
      const half = G.vw / 2 + G.W;
      const cand = cards
        .filter(c => c.op > 0.4 && Math.abs(c.x) < half && (S.p > 0.5 ? true : Math.cos(c.theta * DEG) > 0.2))
        .sort((a, b) => (S.p > 0.5 ? Math.abs(a.x) - Math.abs(b.x) : b.z - a.z));
      // mobile: only the front card ever plays (spec); desktop: up to 4, and both featured cards once focused
      const on = new Set(cand.slice(0, MAX_VIDEOS));
      if (!mobile && S.f > 0.5) feats.forEach(c => on.add(c));
      cards.forEach(c => (on.has(c) ? play(c) : stop(c)));
    };
    const play = c => {
      if (c.playing) return;
      c.playing = true;
      const v = c.vid;
      if (!v.getAttribute('src')) { v.src = v.dataset.src; v.preload = 'auto'; }
      const p = v.play();
      if (p && p.catch) p.catch(() => { c.playing = false; });
    };
    const stop = c => {
      if (!c.playing) return;
      c.playing = false;
      c.vid.pause();
      c.el.classList.remove('is-live');   // back to the poster
    };
    const onPlaying = e => { const c = cards.find(k => k.vid === e.target); if (c && c.playing) c.el.classList.add('is-live'); };
    cards.forEach(c => c.vid.addEventListener('playing', onPlaying));

    /* ---------- ticker ---------- */
    let visible = true;
    let kbTween = null;
    const tick = (time, deltaMs) => {
      if (!visible || !introTl) return;   // nothing to draw while the preloader still covers the hero
      const dt = Math.min(deltaMs, 64) / 1000;
      if (!drag.active && !(kbTween && kbTween.isActive())) {
        if (S.p <= 0.0005) {
          S.vel += (IDLE - S.vel) * (1 - Math.exp(-dt * 1.4));   // ease back to idle speed
          S.a += S.vel * dt;
        } else S.vel = IDLE;
      }
      render(dt);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (!visible) cards.forEach(stop);
    }, { threshold: 0 });
    io.observe(hero);

    /* ---------- drag (momentum; horizontal only on touch) ---------- */
    const drag = { active: false, id: null, x0: 0, y0: 0, lx: 0, lt: 0, v: 0, moved: false, block: false };
    const down = e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (S.p > 0.001) return;
      Object.assign(drag, { id: e.pointerId, x0: e.clientX, y0: e.clientY, lx: e.clientX, lt: performance.now(), v: 0, moved: false, pending: true });
    };
    const move = e => {
      if (!drag.pending || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.moved) {
        if (Math.abs(dx) < 6 || Math.abs(dx) < Math.abs(dy)) {
          if (Math.abs(dy) > 10) drag.pending = false;   // vertical intent -> let the page scroll
          return;
        }
        drag.moved = true; drag.active = true; drag.block = true;
        if (kbTween) kbTween.kill();
        try { orbitEl.setPointerCapture(e.pointerId); } catch (_) {}
        orbitEl.classList.add('is-drag');
      }
      const now = performance.now();
      const ddx = e.clientX - drag.lx;
      const dt = Math.max(1, now - drag.lt) / 1000;
      S.a += ddx * G.degPerPx;
      drag.v = lerp(drag.v, (ddx * G.degPerPx) / dt, 0.35);
      drag.lx = e.clientX; drag.lt = now;
    };
    const up = e => {
      if (e.pointerId !== drag.id) return;
      if (drag.active) S.vel = clamp(drag.v, -420, 420);
      drag.active = false; drag.pending = false;
      orbitEl.classList.remove('is-drag');
      setTimeout(() => { drag.block = false; }, 0);
    };
    orbitEl.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    /* ---------- hover lift ---------- */
    const enter = c => () => { if (!drag.active) gsap.to(c, { lift: 1, duration: 0.5, ease: 'power3.out', overwrite: true }); };
    const leave = c => () => gsap.to(c, { lift: 0, duration: 0.6, ease: 'power3.out', overwrite: true });
    const handlers = cards.map(c => {
      const h = { en: enter(c), le: leave(c), fo: () => focusCard(c), bl: leave(c) };
      c.a.addEventListener('pointerenter', h.en);
      c.a.addEventListener('pointerleave', h.le);
      c.a.addEventListener('focus', h.fo);
      c.a.addEventListener('blur', h.bl);
      return h;
    });

    /* ---------- click -> case study ---------- */
    const onClick = e => {
      const a = e.target.closest('.ocard__a');
      if (!a) return;
      e.preventDefault();
      if (drag.block) return;
      const target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      if (window.__lenis) window.__lenis.scrollTo(target, { duration: 1.6 });
      else target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    orbitEl.addEventListener('click', onClick);

    /* ---------- keyboard: arrows rotate the orbit ---------- */
    const rotateTo = a => {
      if (kbTween) kbTween.kill();
      S.vel = IDLE;
      kbTween = gsap.to(S, { a, duration: 0.8, ease: 'power3.out' });
    };
    const focusCard = c => {
      if (S.p > 0.001) return;
      gsap.to(c, { lift: 1, duration: 0.5, ease: 'power3.out', overwrite: true });
      rotateTo(S.a + wrap(-c.i * STEP - S.a));   // bring the focused card to the front
    };
    const onKey = e => {
      if (S.p > 0.001) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const base = kbTween && kbTween.isActive() ? kbTween.vars.a : S.a;
      rotateTo(base + (e.key === 'ArrowRight' ? STEP : -STEP));
    };
    orbitEl.addEventListener('keydown', onKey);

    /* ---------- scroll: pin + unroll ---------- */
    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: hero, start: 'top top', end: '+=120%', pin: true, scrub: 0.6, anticipatePin: 1, invalidateOnRefresh: true,
      },
    });
    tl.to(S, { lo: 1, duration: 0.22 }, 0)
      .to(S, { ht: 1, duration: 0.35, ease: 'power1.in' }, 0)
      .to(S, { p: 1, duration: 0.62, ease: 'power2.inOut' }, 0.06)
      .to(S, { f: 1, duration: 0.3, ease: 'power2.inOut' }, 0.7);

    /* ---------- intro (runs while the preloader exits) ---------- */
    let introTl = null;
    const intro = () => {
      if (introTl) return;
      introTl = gsap.timeline()
        .to(S, { line: 1, duration: 1.8, ease: 'power2.inOut' }, 0)
        .to(S, { cards: 1, duration: 1.6, ease: 'power2.out' }, 0.35);
    };
    api.intro = intro;
    if (introRequested) intro();

    /* ---------- resize ---------- */
    const ro = new ResizeObserver(() => layout());
    ro.observe(orbitEl); ro.observe(title); ro.observe(used[0]);
    layout();
    gsap.ticker.add(tick);

    return () => {   // matchMedia cleanup (breakpoint change)
      gsap.ticker.remove(tick);
      ro.disconnect(); io.disconnect();
      cards.forEach((c, k) => {
        stop(c);
        c.vid.removeEventListener('playing', onPlaying);
        const h = handlers[k];
        c.a.removeEventListener('pointerenter', h.en); c.a.removeEventListener('pointerleave', h.le);
        c.a.removeEventListener('focus', h.fo); c.a.removeEventListener('blur', h.bl);
        c.el.style.cssText = ''; c.shade.style.opacity = '';
      });
      orbitEl.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      orbitEl.removeEventListener('click', onClick);
      orbitEl.removeEventListener('keydown', onKey);
      [world, title, lower, hint].forEach(el => { el.style.cssText = ''; });
      orbitEl.style.perspective = ''; orbitEl.style.perspectiveOrigin = '';
      allCards.forEach(li => { li.hidden = false; });
      if (introTl) introTl.kill();
      api.intro = () => {};
      root.classList.remove('o3d');
    };
  });

  // reduced motion: the static row of 4 browser cards (CSS) — no orbit, no pin
  mm.add('(prefers-reduced-motion: reduce)', () => { root.classList.remove('o3d'); root.classList.add('rm'); return () => root.classList.remove('rm'); });

  return { intro() { introRequested = true; api.intro(); } };
}
