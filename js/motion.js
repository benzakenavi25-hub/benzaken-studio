/* BENZAKEN STUDIO — Phase 5: scroll animations for everything else
   GSAP 3.13 + ScrollTrigger + SplitText, Lenis smooth scroll wired to ScrollTrigger.
   gsap.matchMedia contexts: desktop / mobile / reduced motion. Animates only transform, opacity, clip-path, filter. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function initMotion({ orbit } = {}) {
  const preloader = $('#preloader');
  const ok = !!(window.gsap && window.ScrollTrigger && window.SplitText);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // fallback: no GSAP (CDN blocked) -> plain fade of the preloader, everything static
  if (!ok) {
    const done = () => { preloader && preloader.classList.add('is-done'); orbit && orbit.intro(); };
    if (document.readyState === 'complete') setTimeout(done, 300); else window.addEventListener('load', () => setTimeout(done, 300));
    setTimeout(done, 2500);
    return;
  }

  gsap.registerPlugin(ScrollTrigger, SplitText);

  /* ---------------- Lenis ---------------- */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    window.__lenis = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    // in-page anchors go through Lenis
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href^="#"]');
      if (!a || e.defaultPrevented || a.closest('.orbit')) return;
      const id = a.getAttribute('href');
      const el = id.length > 1 ? document.querySelector(id) : null;
      if (!el) return;
      e.preventDefault();
      lenis.scrollTo(id === '#top' ? 0 : el, { offset: id === '#top' ? 0 : -8, duration: 1.4 });
    });
  }

  /* ---------------- preloader (max 2s) + hero intro ---------------- */
  const heroWords = [];
  let heroSplit = null;
  const heroTitle = $('#hero-title');
  if (!reduce) {
    heroSplit = new SplitText(heroTitle, { type: 'words', mask: 'words', wordsClass: 'word', maskClass: 'word-mask' });
    heroWords.push(...heroSplit.words);
    gsap.set(heroWords, { yPercent: 115 });
    gsap.set(['.hero__label', '.hero__sub', '.hero__ctas', '#heroHint'], { autoAlpha: 0, y: 18 });
  }

  const heroIntro = () => {
    if (reduce) return;
    gsap.timeline()
      .to('.hero__label', { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power3.out' }, 0)
      .to(heroWords, { yPercent: 0, duration: 1.05, ease: 'power4.out', stagger: 0.09 }, 0.05)
      .to('.hero__sub', { autoAlpha: 1, y: 0, duration: 0.9, ease: 'power3.out' }, 0.5)
      .to('.hero__ctas', { autoAlpha: 1, y: 0, duration: 0.9, ease: 'power3.out' }, 0.62)
      .to('#heroHint', { autoAlpha: 1, y: 0, duration: 0.8, ease: 'power2.out' }, 0.9);
  };

  // the full preloader plays on the first visit only; return visits go straight to the hero intro
  const markSeen = () => { try { localStorage.setItem('bz-seen', '1'); } catch (_) {} };
  const runPreloader = () => {
    if (!preloader || document.documentElement.classList.contains('pl-skip')) {
      if (preloader) preloader.classList.add('is-done');
      orbit && orbit.intro(); heroIntro();
      return;
    }
    if (reduce) {
      gsap.to(preloader, { autoAlpha: 0, duration: 0.3, delay: 0.2, onComplete: () => preloader.classList.add('is-done') });
      return;
    }
    // The monogram draw, swoosh and wordmark are CSS animations that start at first paint (sections.css),
    // so the preloader shows instantly even before GSAP arrives. GSAP runs the curtain exit at 1.45s after
    // the preloader started (or right away if the scripts arrived later than that). Total: 2.0s.
    lenis && lenis.stop();
    const started = window.__plStart || 0;
    const wait = Math.max(0, 1.45 - (performance.now() - started) / 1000);
    gsap.set(preloader, { clipPath: 'inset(0% 0% 0% 0%)' });
    gsap.timeline({
      delay: wait,
      onComplete: () => { preloader.classList.add('is-done'); gsap.set(preloader, { clearProps: 'clipPath' }); markSeen(); },
    })
      .add(() => { orbit && orbit.intro(); heroIntro(); lenis && lenis.start(); }, 0)
      .to(preloader, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.55, ease: 'power3.inOut' }, 0);
  };
  // The web-font stylesheet loads without blocking render. Build every scroll animation once the fonts are in
  // (line splits and trigger positions depend on them), while the preloader still covers the page — then start
  // the preloader. Never wait more than 800ms; if the fonts land later, refresh the triggers once.
  const fontsIn = (() => {
    const link = document.getElementById('fontcss');
    const cssLoaded = !link || link.rel === 'stylesheet' && link.sheet
      ? Promise.resolve()
      : new Promise(res => link.addEventListener('load', res, { once: true }));
    return cssLoaded.then(() => new Promise(requestAnimationFrame)).then(() => (document.fonts ? document.fonts.ready : null));
  })();
  let fontsDone = false;
  fontsIn.then(() => { fontsDone = true; });
  Promise.race([fontsIn, new Promise(r => setTimeout(r, 800))]).then(() => {
    if (!reduce) setupScroll();
    runPreloader();
    if (!fontsDone && !reduce) fontsIn.then(() => ScrollTrigger.refresh());
  });

  if (reduce) return; // reduced motion: no pins, no scrub, everything visible
}

/* ---------------- everything else (built once, under the preloader) ---------------- */
function setupScroll() {
  const mm = gsap.matchMedia();
  mm.add({ desk: '(min-width: 761px)', mob: '(max-width: 760px)', wide: '(min-width: 901px)' }, ctx => {
    const { mob, wide } = ctx.conditions;

    /* ink fill: every section heading + the statement, word by word 15% -> 100% */
    $$('.ink-text').forEach(el => {
      // headings keep SplitText's aria-label; a <p> may not carry one, so its words are simply read in order
      const split = new SplitText(el, { type: 'words', wordsClass: 'ink-word', aria: el.tagName === 'P' ? 'none' : 'auto' });
      const big = el.classList.contains('statement__text');
      gsap.fromTo(split.words, { opacity: 0.15 }, {
        opacity: 1, ease: 'none', stagger: 0.1,
        scrollTrigger: { trigger: el, start: big ? 'top 80%' : 'top 88%', end: big ? 'bottom 45%' : 'bottom 55%', scrub: true },
      });
    });

    /* static text: scrubbed fade + blur (no blur on mobile) */
    const staticText = [
      '.work__head .label', '.work__head .lead',
      '.case__info > .label:first-child', '.case__name', '.case__desc', '.case__built-title', '.case__info > .btn',
      '.services .label', '.process .label', '.step__title', '.step p', '.step__num', '.process__note',
      '.invest .label', '.price__name', '.price__amount', '.price__desc', '.invest__note',
      '.about .label', '.faq .label', '.qa', '.contact__links li', '.form', '.footer__inner > *',
    ].join(',');
    const from = mob ? { opacity: 0, y: 16 } : { opacity: 0, y: 16, filter: 'blur(6px)' };
    const to = mob ? { opacity: 1, y: 0 } : { opacity: 1, y: 0, filter: 'blur(0px)' };
    // created in one pass; each is scrubbed between 95% and 65% of the viewport
    $$(staticText).forEach(el => {
      gsap.fromTo(el, from, { ...to, ease: 'none', scrollTrigger: { trigger: el, start: 'top 95%', end: 'top 65%', scrub: true } });
    });

    /* selected work: one pinned case study per project */
    $$('.case').forEach(cs => {
      const video = $('.laptop__video', cs);
      const phone = $('.phone', cs);
      const items = $$('.case__list li', cs);
      const num = $('.case__bgnum', cs);
      // desktop pin scrubs a dense-keyframe file; phones/tablets get a light 960w loop. Both load only near the viewport.
      const src = wide ? video.dataset.src : video.dataset.srcM;
      const load = () => { if (!video.getAttribute('src')) { video.src = src; video.preload = 'auto'; video.load(); } };

      if (wide) {
        // desktop: pinned, the site scrolls inside the laptop with the page
        video.loop = false; video.pause();
        ScrollTrigger.create({ trigger: cs, start: 'top bottom+=100%', once: true, onEnter: load });
        let target = 0;
        const seek = () => {
          if (video.readyState < 1 || !video.duration) return;
          const t = target * (video.duration - 0.05);
          if (Math.abs(video.currentTime - t) > 0.015) video.currentTime = t;
        };
        video.addEventListener('loadedmetadata', seek);
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: cs, start: 'center center', end: '+=160%', pin: true, scrub: 0.4, anticipatePin: 1,
            onUpdate: self => { target = self.progress; seek(); },
          },
        });
        tl.fromTo(phone, { yPercent: 14 }, { yPercent: -14, duration: 1 }, 0)
          .fromTo(num, { yPercent: 8 }, { yPercent: -8, duration: 1 }, 0)
          .fromTo(items, { opacity: 0, x: 28 }, { opacity: 1, x: 0, duration: 0.12, stagger: 0.1, ease: 'power2.out' }, 0.05);
        return;
      }

      // mobile / tablet: no pin, the video autoplays muted in a loop when near the viewport
      video.loop = true;
      ScrollTrigger.create({
        trigger: cs, start: 'top bottom+=40%', end: 'bottom top-=40%',
        onToggle: self => {
          if (self.isActive) { load(); const p = video.play(); p && p.catch(() => {}); } else video.pause();
        },
      });
      gsap.fromTo(items, { opacity: 0, x: 20 }, { opacity: 1, x: 0, ease: 'none', stagger: 0.15, scrollTrigger: { trigger: $('.case__list', cs), start: 'top 92%', end: 'bottom 70%', scrub: true } });
      gsap.fromTo(phone, { yPercent: 10 }, { yPercent: -10, ease: 'none', scrollTrigger: { trigger: cs, start: 'top bottom', end: 'bottom top', scrub: true } });
    });

    /* what you get: clip-path stagger, icons draw on enter */
    const cards = $$('.card');
    gsap.set(cards, { clipPath: 'inset(100% 0% 0% 0%)' });
    gsap.set($$('.card__icon path'), { strokeDasharray: 1, strokeDashoffset: 1 });
    ScrollTrigger.batch(cards, {
      start: 'top 88%', once: true,
      onEnter: batch => {
        gsap.to(batch, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.1, ease: 'power3.out', stagger: 0.12 });
        gsap.to(batch.map(c => $('.card__icon path', c)), { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut', stagger: 0.12, delay: 0.35 });
      },
    });

    /* process: ink -> cream, the line draws, dots light when it reaches them */
    const process = $('#process');
    gsap.fromTo($('.bgfade', process), { opacity: 1 }, { opacity: 0, ease: 'none', scrollTrigger: { trigger: process, start: 'top bottom', end: 'top 35%', scrub: true } });
    const steps = $('.steps');
    const stepEls = $$('.step', steps);
    steps.classList.add('is-anim');
    steps.style.setProperty('--fill', 0);
    let stops = [];
    const measure = () => {
      const r = steps.getBoundingClientRect();
      const vertical = window.innerWidth <= 1000;
      stops = stepEls.map(s => {
        const d = $('.step__dot', s).getBoundingClientRect();
        return vertical ? (d.top + d.height / 2 - r.top) / r.height : (r.right - (d.left + d.width / 2)) / r.width;   // RTL: line starts at the right
      });
    };
    ScrollTrigger.create({
      trigger: steps, start: 'top 75%', end: 'bottom 55%', scrub: true,
      onRefresh: measure,
      onUpdate: self => {
        steps.style.setProperty('--fill', self.progress.toFixed(4));
        stepEls.forEach((s, i) => s.classList.toggle('is-lit', self.progress >= stops[i] - 0.005));
      },
    });

    /* investment: numbers count up once */
    $$('.price__num').forEach(el => {
      const end = +el.dataset.count;
      const fmt = v => Math.round(v).toLocaleString('en-US');
      const o = { v: 0 };
      el.textContent = fmt(0);
      ScrollTrigger.create({
        trigger: el, start: 'top 85%', once: true,
        onEnter: () => gsap.to(o, { v: end, duration: 1.8, ease: 'power3.out', onUpdate: () => { el.textContent = fmt(o.v); } }),
      });
    });

    /* about: line-by-line mask reveal + slow parallax on the outlined B */
    $$('.about__text p').forEach(p => {
      SplitText.create(p, {
        type: 'lines', mask: 'lines', linesClass: 'line', maskClass: 'line-mask', autoSplit: true, aria: 'none',
        onSplit: self => gsap.fromTo(self.lines, { yPercent: 105 }, {
          yPercent: 0, duration: 1.1, ease: 'power4.out', stagger: 0.1,
          scrollTrigger: { trigger: p, start: 'top 85%', once: true },
        }),
      });
    });
    gsap.fromTo('.about__bg', { yPercent: -40 }, { yPercent: -60, ease: 'none', scrollTrigger: { trigger: '.about', start: 'top bottom', end: 'bottom top', scrub: true } });

    // triggers were created by type, not page order: refresh them top -> bottom so the pins push later triggers correctly
    ScrollTrigger.sort();

    return () => { steps.classList.remove('is-anim'); steps.style.removeProperty('--fill'); };
  });

  // fonts can change line breaks/heights after load
  // (ScrollTrigger already refreshes itself on load and resize)
}
