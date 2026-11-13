/* BENZAKEN STUDIO — Phase 3 structure + behaviour, Phase 4 hero orbit */
import { initOrbit } from './orbit.js';
import { initMotion } from './motion.js';

const WA_NUMBER = '972532415558';
const WA_DEFAULT_TEXT = 'היי אברהם, הגעתי מהאתר ואשמח לשמוע על אתר לפרויקט שלי';
const waUrl = (text = WA_DEFAULT_TEXT) => `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---- always start at the top on load/reload (history.scrollRestoration is 'manual', set in <head>):
   the hero pin and the scroll animations are built for a page that starts at the top.
   An explicit #hash (e.g. a shared link to #contact) still works. ---- */
if (!location.hash) window.scrollTo(0, 0);

/* ---- WhatsApp links ---- */
$$('[data-wa]').forEach(a => { a.href = waUrl(); });

/* ---- heavy images below the hero load only when about one screen away
   (native lazy-loading starts far too early on slow connections) ---- */
const nearIO = new IntersectionObserver(entries => entries.forEach(e => {
  if (!e.isIntersecting) return;
  e.target.src = e.target.dataset.nearSrc;
  nearIO.unobserve(e.target);
}), { rootMargin: '100% 0px' });
$$('img[data-near-src]').forEach(img => nearIO.observe(img));

/* ---- hero orbit (Phase 4) + preloader and scroll animations (Phase 5) ----
   The animation libraries are fetched and run only after the first frame is on screen: the CSS preloader
   already covers the page, so nothing waits on them, and the first paint isn't held back by ~140 KB of script. */
const VENDOR = ['js/vendor/gsap.min.js', 'js/vendor/ScrollTrigger.min.js', 'js/vendor/SplitText.min.js', 'js/vendor/lenis.min.js'];
const loadScript = src => new Promise(res => {
  const s = document.createElement('script');
  s.src = src; s.async = false;          // keep execution order: gsap first, then its plugins
  s.onload = s.onerror = res;            // on failure motion.js/orbit.js fall back to the static layout
  document.head.appendChild(s);
});
const afterFirstPaint = () => new Promise(res => requestAnimationFrame(() => setTimeout(res, 0)));
// the orbit posters are requested at the same moment (the cards stay hidden until the preloader lifts anyway)
const loadPosters = () => $$('.ocard img[data-src]').forEach(img => {
  img.srcset = img.dataset.srcset; img.src = img.dataset.src;
});
afterFirstPaint()
  .then(() => { loadPosters(); return Promise.all(VENDOR.map(loadScript)); })
  .then(() => {
    const orbit = initOrbit();
    initMotion({ orbit }); // the preloader exit starts the orbit intro (line draws in, cards arrive)
  });

/* ---- header: solid after scroll, hide on scroll down / show on scroll up ---- */
const header = $('#header');
let lastY = window.scrollY;
let ticking = false;
const onScroll = () => {
  const y = window.scrollY;
  header.classList.toggle('is-solid', y > 40);
  if (!menuOpen) {
    if (y > lastY && y > 240) header.classList.add('is-hidden');
    else if (y < lastY) header.classList.remove('is-hidden');
  }
  lastY = y;
  ticking = false;
};
window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });

/* ---- mobile menu ---- */
const burger = $('#burger');
const nav = $('#nav');
let menuOpen = false;
const setMenu = open => {
  menuOpen = open;
  burger.setAttribute('aria-expanded', String(open));
  nav.classList.toggle('is-open', open);
  header.classList.toggle('is-menu', open);
  document.documentElement.style.overflow = open ? 'hidden' : '';
};
burger.addEventListener('click', () => setMenu(!menuOpen));
nav.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
window.addEventListener('keydown', e => { if (e.key === 'Escape' && menuOpen) { setMenu(false); burger.focus(); } });
window.matchMedia('(min-width: 901px)').addEventListener('change', e => { if (e.matches) setMenu(false); });

/* ---- floating WhatsApp: after hero, hidden in contact ---- */
const fab = $('#wafab');
const hero = $('#top');
const contact = $('#contact');
let pastHero = false, inContact = false;
const updateFab = () => {
  const on = pastHero && !inContact;
  fab.classList.toggle('is-on', on);
  fab.tabIndex = on ? 0 : -1;
};
new IntersectionObserver(([e]) => { pastHero = !e.isIntersecting && e.boundingClientRect.top < 0; updateFab(); }, { threshold: 0 }).observe(hero);
// hidden over the contact section and the footer
const endZones = new Map();
const endIO = new IntersectionObserver(entries => {
  entries.forEach(e => endZones.set(e.target, e.isIntersecting));
  inContact = [...endZones.values()].some(Boolean);
  updateFab();
}, { threshold: 0 });
endIO.observe(contact);
endIO.observe($('.footer'));

/* ---- contact form -> WhatsApp (no backend) ---- */
const form = $('#leadForm');
const err = (id, msg) => { $('#' + id).textContent = msg; };
form.addEventListener('submit', e => {
  e.preventDefault();
  const name = form.elements.name.value.trim();
  const phoneRaw = form.elements.phone.value.trim();
  const phone = phoneRaw.replace(/[^\d+]/g, '');
  const type = (form.elements.type.value || '').trim();
  let ok = true;
  const nameBad = name.length < 2;
  const phoneDigits = phone.replace(/^\+972/, '0').replace(/^972/, '0');
  const phoneBad = !/^0(5\d|[2-4689]|7\d)\d{7}$/.test(phoneDigits);
  form.elements.name.setAttribute('aria-invalid', String(nameBad));
  form.elements.phone.setAttribute('aria-invalid', String(phoneBad));
  err('e-name', nameBad ? 'נא להזין שם (לפחות 2 תווים).' : '');
  err('e-phone', phoneBad ? 'נא להזין מספר טלפון ישראלי תקין, למשל 0501234567.' : '');
  err('e-type', type ? '' : 'נא לבחור סוג פרויקט.');
  if (nameBad || phoneBad || !type) {
    ok = false;
    (nameBad ? form.elements.name : phoneBad ? form.elements.phone : form.querySelector('input[name="type"]')).focus();
  }
  if (!ok) return;
  const msg = `${WA_DEFAULT_TEXT}\n\nשם: ${name}\nטלפון: ${phoneRaw}\nסוג הפרויקט: ${type}`;
  window.open(waUrl(msg), '_blank', 'noopener');
});
form.addEventListener('input', e => {
  if (e.target.name === 'name' || e.target.name === 'phone') { e.target.setAttribute('aria-invalid', 'false'); err('e-' + e.target.name, ''); }
  if (e.target.name === 'type') err('e-type', '');
});
