/* wrapped-theme.js - the Wrapped season look for the website, the phone app
 * and the TV / Fire Stick app, plus the live "is Wrapped open?" switch.
 *
 * Asks the server (GET <API>/wrapped/state) whether Wrapped and the Wrapped
 * theme are on. Rowan controls both from /admin/wrapped: On, Off, or
 * Scheduled (start / end dates). With nothing set they follow December.
 *   - Checks on load, every 45 s, and whenever the tab / app comes back,
 *     so flipping the switch in admin shows up on every device within a
 *     minute without anyone refreshing.
 *   - Remembers the last answer (localStorage sharky_wrapped_state) so the
 *     theme is there from the first frame instead of flashing in.
 *   - Theme on  -> <html class="sk-wrapped"> + the CSS below.
 *   - Publishes window.SharkyWrappedState = {wrapped, theme, year, opens}
 *     and fires 'sharky:wrapped-state' on document (wrapped-entry.js uses it
 *     to show / hide the Wrapped banner).
 * Test without touching the server: ?wraptheme=1 / ?wraptheme=0 on the URL.
 * Plain ES5 (old Fire TV WebViews). Same file in /tv/js/wrapped-theme.js.
 */
(function (w) {
  'use strict';
  var D = document, H = D.documentElement;
  var KEY = 'sharky_wrapped_state';
  var path = location.pathname;
  var PLAT = /\/tv(\/|$)/.test(path) ? 'tv' : (/\/m(\/|$)/.test(path) ? 'phone' : 'web');
  var FORCE = (location.search.match(/[?&]wraptheme=([01])/) || [])[1];

  function api() {
    try { if (w.CFG && w.CFG.API) return String(w.CFG.API).replace(/\/+$/, ''); } catch (e) {}
    return 'https://api.sharkmovie.co.uk';
  }

  /* ── The look ─────────────────────────────────────────────────────────
     Pink -> violet -> blue (the Wrapped colours) with a gold spark.
     Everything sits under html.sk-wrapped so switching off is instant. */
  var G = 'linear-gradient(100deg,#ff3d6e 0%,#ff2fb3 28%,#a100ff 58%,#3d5cff 100%)';
  var common =
    'html.sk-wrapped{--red:#ff2f7a;--red-hi:#ff4f93;--red-lo:#c4006a;--red2:#c4006a;--skw-g:' + G + ';--skw-gold:#ffd166}' +
    'html.sk-wrapped ::selection{background:#a100ff;color:#fff}' +
    '@keyframes skwShift{0%{background-position:0% 50%}100%{background-position:200% 50%}}' +
    '@keyframes skwFloat1{0%{transform:translate(0,0) scale(1)}50%{transform:translate(8vw,6vh) scale(1.15)}100%{transform:translate(0,0) scale(1)}}' +
    '@keyframes skwFloat2{0%{transform:translate(0,0) scale(1.1)}50%{transform:translate(-10vw,-4vh) scale(.95)}100%{transform:translate(0,0) scale(1.1)}}' +
    '@keyframes skwTwinkle{0%,100%{opacity:.15}50%{opacity:.9}}' +
    '#skwBg{display:none}' +
    'html.sk-wrapped #skwBg{display:block;position:fixed;left:0;top:0;right:0;bottom:0;z-index:-1;pointer-events:none;overflow:hidden}' +
    '#skwBg i{position:absolute;border-radius:50%;display:block}' +
    '#skwBg .b1{width:60vw;height:60vw;left:-18vw;top:-22vw;background:radial-gradient(circle,rgba(255,47,122,.30) 0%,rgba(255,47,122,0) 65%)}' +
    '#skwBg .b2{width:70vw;height:70vw;right:-25vw;top:10vh;background:radial-gradient(circle,rgba(161,0,255,.26) 0%,rgba(161,0,255,0) 65%)}' +
    '#skwBg .b3{width:55vw;height:55vw;left:15vw;bottom:-30vw;background:radial-gradient(circle,rgba(61,92,255,.22) 0%,rgba(61,92,255,0) 65%)}' +
    '#skwBar{display:none}' +
    'html.sk-wrapped #skwBar{display:block;position:fixed;left:0;top:0;right:0;height:3px;z-index:2147483000;pointer-events:none;' +
      'background:linear-gradient(90deg,#ff3d6e,#a100ff,#3d5cff,#ffd166,#ff3d6e);background-size:200% 100%}' +
    '.skw-pill{display:none}' +
    'html.sk-wrapped .skw-pill{display:inline-block;vertical-align:middle;font-family:Unbounded,Manrope,system-ui,sans-serif;font-weight:800;' +
      'color:#fff;background:' + G + ';background-size:200% 100%;border-radius:999px;white-space:nowrap;' +
      'box-shadow:0 0 0 1px rgba(255,255,255,.18) inset,0 6px 22px rgba(161,0,255,.45);letter-spacing:.06em}' +
    'html.sk-wrapped .skw-pill b{color:#ffd166;font-weight:800}';

  var anim =
    'html.sk-wrapped #skwBar,html.sk-wrapped .skw-pill{animation:skwShift 6s linear infinite}' +
    'html.sk-wrapped #skwBg .b1{animation:skwFloat1 22s ease-in-out infinite}' +
    'html.sk-wrapped #skwBg .b2{animation:skwFloat2 26s ease-in-out infinite}' +
    'html.sk-wrapped #skwBg .b3{animation:skwFloat1 30s ease-in-out infinite reverse}' +
    '#skwBg s{position:absolute;width:3px;height:3px;border-radius:50%;background:#fff;box-shadow:0 0 6px 1px rgba(255,209,102,.8);animation:skwTwinkle 3.4s ease-in-out infinite}' +
    '@media (prefers-reduced-motion:reduce){html.sk-wrapped *{animation:none!important}}';

  /* Gradient text: the -webkit- pair works on every browser we care about,
     including old Fire TV WebViews. */
  function gtext(sel) {
    return sel + '{background:' + G + ';background-size:200% 100%;-webkit-background-clip:text;background-clip:text;' +
      '-webkit-text-fill-color:transparent;color:transparent}';
  }

  var web =
    'html.sk-wrapped{background:#0b0713}html.sk-wrapped body{background:transparent}' +
    gtext('html.sk-wrapped .logo') +
    'html.sk-wrapped .logo{font-family:Unbounded,system-ui,sans-serif;letter-spacing:-1px;filter:drop-shadow(0 2px 14px rgba(161,0,255,.55));animation:skwShift 6s linear infinite}' +
    'html.sk-wrapped .skw-pill.skw-web{font-size:.62rem;padding:4px 9px;margin-left:10px}' +
    'html.sk-wrapped .navbar.scrolled{background:rgba(16,8,30,.88);border-bottom:1px solid rgba(161,0,255,.35)}' +
    'html.sk-wrapped .nav-link.active::after{background:' + G + ';height:3px}' +
    'html.sk-wrapped .hero h1{font-family:Unbounded,system-ui,sans-serif;letter-spacing:-.02em;text-shadow:0 6px 40px rgba(161,0,255,.45)}' +
    'html.sk-wrapped .hero::after{content:"";position:absolute;left:0;right:0;bottom:0;height:35%;z-index:-1;pointer-events:none;' +
      'background:linear-gradient(to top,#0b0713 0%,rgba(11,7,19,0) 100%)}' +
    'html.sk-wrapped .section-header h2{font-family:Unbounded,system-ui,sans-serif;font-weight:700;letter-spacing:-.01em;display:flex;align-items:center;gap:10px}' +
    'html.sk-wrapped .section-header h2::before{content:"";width:5px;height:1.05em;border-radius:3px;background:linear-gradient(180deg,#ff3d6e,#a100ff,#3d5cff);box-shadow:0 0 12px rgba(255,47,122,.7)}' +
    'html.sk-wrapped .movie-card{transition:transform .25s,box-shadow .25s}' +
    'html.sk-wrapped .movie-card:hover{box-shadow:0 0 0 2px #ff2fb3,0 14px 40px rgba(161,0,255,.55)}' +
    'html.sk-wrapped .btn-play{box-shadow:0 8px 30px rgba(255,47,122,.35)}' +
    'html.sk-wrapped #wrappedBanner{background:' + G + '!important;background-size:200% 100%!important;animation:skwShift 6s linear infinite;' +
      'box-shadow:0 0 0 1px rgba(255,255,255,.2) inset,0 14px 40px rgba(161,0,255,.5)!important}';

  var phone =
    'html.sk-wrapped{background:#0b0713}html.sk-wrapped body{background:transparent}' +
    'html.sk-wrapped #topbar.solid{background:rgba(16,8,30,.92)}' +
    'html.sk-wrapped .tb-logo{filter:drop-shadow(0 0 10px rgba(255,47,179,.7))}' +
    'html.sk-wrapped .skw-pill.skw-phone{font-size:10px;padding:4px 9px;margin-left:8px}' +
    'html.sk-wrapped .hero{box-shadow:0 0 0 1px rgba(255,255,255,.08),0 16px 50px rgba(161,0,255,.35)}' +
    'html.sk-wrapped .hero-title{font-family:Unbounded,system-ui,sans-serif;letter-spacing:-.02em}' +
    'html.sk-wrapped .btn-red{background:' + G + ';background-size:200% 100%;animation:skwShift 6s linear infinite}' +
    'html.sk-wrapped .row-title{font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:15px}' +
    'html.sk-wrapped .row-title::before{content:"";align-self:center;width:4px;height:14px;border-radius:2px;background:linear-gradient(180deg,#ff3d6e,#a100ff,#3d5cff)}' +
    'html.sk-wrapped .chip.on{background:' + G + ';color:#fff;border-color:transparent}' +
    'html.sk-wrapped #tabs{background:rgba(14,8,26,.97);border-top:1px solid rgba(161,0,255,.35)}' +
    'html.sk-wrapped .tab.active{color:#ff4f93}' +
    'html.sk-wrapped .tab.active svg{filter:drop-shadow(0 0 6px rgba(255,47,179,.8))}' +
    'html.sk-wrapped #wrappedBanner{background:' + G + '!important;background-size:200% 100%!important;animation:skwShift 6s linear infinite}';

  /* TV: no blur, no moving blobs - Fire Sticks are slow. Static glow only. */
  var tv =
    'html.sk-wrapped body,html.sk-wrapped #app{background:#0b0713}' +
    'html.sk-wrapped #app{background:radial-gradient(ellipse 60% 55% at 0% 0%,rgba(255,47,122,.22) 0%,rgba(255,47,122,0) 70%),' +
      'radial-gradient(ellipse 60% 60% at 100% 30%,rgba(161,0,255,.20) 0%,rgba(161,0,255,0) 70%),' +
      'radial-gradient(ellipse 60% 50% at 40% 100%,rgba(61,92,255,.18) 0%,rgba(61,92,255,0) 70%),#0b0713}' +
    'html.sk-wrapped body.scrolled #topnav{background:#120a20}' +
    gtext('html.sk-wrapped .nav-word') +
    'html.sk-wrapped .nav-word{font-family:Unbounded,system-ui,sans-serif;letter-spacing:-.02em}' +
    'html.sk-wrapped .nav-shark{filter:drop-shadow(0 0 .6vw rgba(255,47,179,.8))}' +
    'html.sk-wrapped .skw-pill.skw-tv{font-size:.85vw;padding:.45vw 1vw;margin-left:1vw;box-shadow:0 0 1.2vw rgba(161,0,255,.6)}' +
    'html.sk-wrapped .nav-link.focused{background:rgba(161,0,255,.28);border-bottom-color:#ff2fb3}' +
    'html.sk-wrapped .btn.focused{background:' + G + ';border-color:#fff;box-shadow:0 0 2vw rgba(255,47,179,.6)}' +
    'html.sk-wrapped .card.focused .card-art{border-color:#ff2fb3;box-shadow:0 0 0 .2vw #a100ff,0 0 2.4vw rgba(255,47,179,.75)}' +
    'html.sk-wrapped .row-title{font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:1.35vw;color:#fff}' +
    'html.sk-wrapped .row-title::before{content:"";display:inline-block;vertical-align:middle;width:.32vw;height:1.3vw;margin:-.2vw .8vw 0 0;border-radius:.2vw;background:linear-gradient(180deg,#ff3d6e,#a100ff,#3d5cff)}' +
    'html.sk-wrapped #skwBar{height:.35vh}';

  var css = common + (PLAT === 'tv' ? tv : anim + (PLAT === 'phone' ? phone : web));

  function addCss() {
    if (D.getElementById('skwCss')) return;
    var s = D.createElement('style');
    s.id = 'skwCss';
    s.appendChild(D.createTextNode(css));
    (D.head || H).appendChild(s);
  }
  var fontAdded = false;
  function addFont() {
    if (fontAdded) return;
    fontAdded = true;
    try {
      var l = D.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Unbounded:wght@600;700;800;900&display=swap';
      (D.head || H).appendChild(l);
    } catch (e) {}
  }

  /* Extra elements: the glow background, the top bar, the WRAPPED pill. */
  function decorate() {
    var b = D.body;
    if (!b) return;
    var year = (state && state.year) || new Date().getFullYear();
    var yy = "'" + String(year).slice(-2);
    if (!D.getElementById('skwBar')) {
      var bar = D.createElement('div'); bar.id = 'skwBar'; b.appendChild(bar);
    }
    if (PLAT !== 'tv' && !D.getElementById('skwBg')) {
      var bg = D.createElement('div'); bg.id = 'skwBg';
      var h = '<i class="b1"></i><i class="b2"></i><i class="b3"></i>';
      for (var i = 0; i < 14; i++) {
        h += '<s style="left:' + Math.round(Math.random() * 98) + '%;top:' + Math.round(Math.random() * 96) + '%;animation-delay:-' +
          (Math.random() * 3.4).toFixed(2) + 's"></s>';
      }
      bg.innerHTML = h;
      b.insertBefore(bg, b.firstChild);
    }
    if (!D.getElementById('skwPill')) {
      var at = PLAT === 'tv' ? D.querySelector('.nav-brand') : (PLAT === 'phone' ? D.querySelector('.tb-logo') : D.querySelector('.navbar .logo'));
      if (at) {
        var p = D.createElement('span');
        p.id = 'skwPill';
        p.className = 'skw-pill skw-' + PLAT;
        p.innerHTML = 'WRAPPED <b>' + yy + '</b>';
        if (PLAT === 'tv') at.appendChild(p);
        else at.parentNode.insertBefore(p, at.nextSibling);
      }
    } else {
      var pb = D.querySelector('#skwPill b'); if (pb) pb.innerHTML = yy;
    }
  }

  var state = null;
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

  function apply(s, fire) {
    var prev = state;
    state = s;
    if (FORCE === '1') s.theme = true;
    if (FORCE === '0') s.theme = false;
    w.SharkyWrappedState = s;
    var rest = (' ' + H.className + ' ').replace(' sk-wrapped ', ' ').replace(/^\s+|\s+$/g, '');
    if (s.theme) { addFont(); addCss(); H.className = rest ? rest + ' sk-wrapped' : 'sk-wrapped'; decorate(); }
    else H.className = rest;
    if (fire || !prev || prev.wrapped !== s.wrapped || prev.theme !== s.theme) {
      try {
        var ev;
        if (typeof CustomEvent === 'function') ev = new CustomEvent('sharky:wrapped-state', { detail: s });
        else { ev = D.createEvent('CustomEvent'); ev.initCustomEvent('sharky:wrapped-state', false, false, s); }
        D.dispatchEvent(ev);
      } catch (e) {}
    }
  }

  var busy = false;
  function poll() {
    if (busy) return;
    busy = true;
    var x = new XMLHttpRequest();
    x.open('GET', api() + '/wrapped/state?_=' + Date.now(), true);
    x.timeout = 8000;
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      busy = false;
      if (x.status !== 200) return;
      try {
        var s = JSON.parse(x.responseText);
        if (!s || typeof s.wrapped !== 'boolean') return;
        save(s);
        apply(s);
      } catch (e) {}
    };
    try { x.send(); } catch (e) { busy = false; }
  }

  /* First paint: the last known answer, or December if we've never asked. */
  var first = load();
  if (!first) { var m = new Date().getMonth() === 11; first = { wrapped: m, theme: m, year: new Date().getFullYear(), opens: null, guess: true }; }
  addCss();
  apply(first, true);
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', function () { if (state && state.theme) decorate(); });
  /* Pages that redraw their header later (the TV app builds after load). */
  setTimeout(function () { if (state && state.theme) decorate(); }, 1500);

  poll();
  setInterval(poll, 45000);
  D.addEventListener('visibilitychange', function () { if (!D.hidden) poll(); });
  w.addEventListener('focus', poll);
  w.SharkyWrappedRefresh = poll;
})(window);
