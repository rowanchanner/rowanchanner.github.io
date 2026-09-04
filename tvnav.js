/* tvnav.js — D-pad / TV-remote navigation for Sharky Movies.
 *
 * Works with a Fire TV remote, an Android TV D-pad, or the arrow keys on an
 * ordinary keyboard. Pure spatial navigation: on each arrow press it looks at
 * where every focusable thing actually is on screen and picks the nearest one
 * in that direction, so it keeps working when rows are added, reordered or
 * re-rendered. No dependencies, no build step, no markup changes required.
 */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- config */

  /* The things a remote can land on. Cards are treated as one unit: you select
     the card, you don't tab through the little play/list/info buttons on it —
     that's how every real TV interface behaves. */
  var SELECTOR = [
    '.movie-card',
    '.episode-item',
    '.nav-link',
    '.see-all',
    '.row-arrow',
    '.btn',
    '.modal-close',
    '.clear-search',
    '.hero-pager button',
    '.logo',
    'iframe',
    'input[type="text"]',
    'input[type="search"]',
    'a[href]',
    'button'
  ].join(',');

  var FOCUS_CLASS = 'tv-focus';

  /* Key names, then raw keyCodes as a fallback — TV browsers are inconsistent
     about which they send, and some send only the numeric code. */
  var DIR_KEY  = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
                   Left: 'left', Right: 'right', Up: 'up', Down: 'down' };
  var DIR_CODE = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
  var OK_KEY   = ['Enter', 'NumpadEnter', 'Select'];
  var OK_CODE  = [13, 23];
  var BACK_KEY = ['Escape', 'Esc', 'Backspace', 'BrowserBack', 'GoBack', 'XF86Back'];
  var BACK_CODE = [4, 27, 461, 10009, 166];      /* Fire TV, Tizen, webOS */

  var current = null;

  /* --------------------------------------------------------- TV detection */

  var tvMode = /[?&]tv=1/.test(location.search);
  try { if (sessionStorage.getItem('sharky_tv') === '1') tvMode = true; } catch (e) {}
  try {
    if (!tvMode && window.matchMedia &&
        window.matchMedia('(hover: none) and (pointer: none)').matches) tvMode = true;
  } catch (e) {}

  function enterTvMode() {
    if (tvMode) return;
    tvMode = true;
    try { sessionStorage.setItem('sharky_tv', '1'); } catch (e) {}
    apply();
  }
  function apply() {
    if (tvMode && document.body) document.body.classList.add('tv-mode');
  }

  /* Expose it so page scripts can pass ?tv=1 down into the player iframe. */
  window.SharkyTV = {
    get active() { return tvMode; },
    /* Let a page hand the highlight somewhere - used when the player
       reports Back, so the remote lands on the episode list. */
    focus: function (el) { if (el) setFocus(el); },
    /* Called by the page when the player reports Back. */
    exitFrame: function () { exitFrame(); },
    /* Called after picking an episode: the viewer means "play this", so put
       the remote straight into the player rather than making them find it. */
    enterFrame: function (el) {
      var f = el || document.getElementById('sharkyFrame');
      if (f) { setFocus(f); enterFrame(f); }
    }
  };

  /* ------------------------------------------------------------ geometry */

  function isVisible(el) {
    if (!el || el.disabled) return false;
    if (el.closest('.hidden, [hidden]')) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    var s = window.getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') return false;
    return true;
  }

  /* When a modal is up, the remote must not wander behind it. */
  function root() {
    var m = document.getElementById('detailsModal');
    if (m && isVisible(m)) return m;
    return document;
  }

  function candidates() {
    var list = root().querySelectorAll(SELECTOR);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!isVisible(el)) continue;
      /* A card is one stop: don't let the remote crawl through the little
         play / my-list / info buttons sitting on top of it. */
      if (!el.classList.contains('movie-card') && el.closest('.movie-card')) continue;
      out.push(el);
    }
    return out;
  }

  function centre(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

  /* Distance between two 1-D spans; 0 when they overlap at all. */
  function gap(a1, a2, b1, b2) {
    return Math.max(0, Math.max(a1 - b2, b1 - a2));
  }

  /* The focus highlight scales the card up, and a scaled card's bounding box
     overlaps its neighbour - which makes the neighbour look like it isn't
     "to the right" any more, so the remote skips it. Removing the class to
     measure doesn't help, because the CSS transition means the transform is
     still mid-flight when we read it back.
     A scale about the default centre origin leaves the centre exactly where it
     was, so take the centre from the rendered box and the size from layout
     (offsetWidth/Height ignore transforms) and rebuild the untransformed box. */
  function rectOf(el) {
    var r = el.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var w = el.offsetWidth || r.width, h = el.offsetHeight || r.height;
    return {
      left: cx - w / 2, right: cx + w / 2,
      top: cy - h / 2,  bottom: cy + h / 2,
      width: w, height: h
    };
  }

  function nearest(from, dir) {
    var list = candidates();
    if (!from || list.indexOf(from) === -1) return firstStop(list);

    var fr = rectOf(from), fc = centre(fr);
    var best = null, bestScore = Infinity;

    /* Left/right stay inside the row you're on. Without this, pressing left on
       the first card of a row hops into a neighbouring row, which feels like
       the highlight has jumped at random. At the end of a row, nothing moves -
       which is what every TV interface does. */
    var horizontal = (dir === 'left' || dir === 'right');
    var ownRow = horizontal ? from.closest('.movie-row') : null;

    /* The navbar is fixed to the top of the window, so content scrolled above
       it is still "up" geometrically. Pressing up from the navbar should do
       nothing rather than diving into whatever is off-screen. */
    if (dir === 'up') {
      var fixed = from.closest('.navbar');
      if (fixed && window.getComputedStyle(fixed).position === 'fixed') return null;
    }

    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el === from) continue;
      if (ownRow && el.closest('.movie-row') !== ownRow) continue;
      var r = rectOf(el), c = centre(r);
      var along, across, ok;

      /* "across" is the gap between the two elements on the other axis, not
         the distance between their centres. Centres punish anything large:
         the player iframe spans the whole width, so its centre sits far from
         a button off to one side, and a distant but centre-aligned link would
         beat it. With a gap, an element whose span overlaps yours scores 0
         and wins, which is what the eye expects. */
      if (dir === 'left')       { ok = r.right  <= fr.left  + 2; along = fc.x - c.x; across = gap(fr.top, fr.bottom, r.top, r.bottom); }
      else if (dir === 'right') { ok = r.left   >= fr.right - 2; along = c.x - fc.x; across = gap(fr.top, fr.bottom, r.top, r.bottom); }
      else if (dir === 'up')    { ok = r.bottom <= fr.top   + 2; along = fc.y - c.y; across = gap(fr.left, fr.right, r.left, r.right); }
      else                      { ok = r.top    >= fr.bottom- 2; along = c.y - fc.y; across = gap(fr.left, fr.right, r.left, r.right); }

      if (!ok || along < 0) continue;

      /* Weight drift across the axis heavily, so moving down a page of rows
         keeps roughly the same column instead of darting sideways. */
      var score = along + across * 3;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    return best;
  }

  function firstStop(list) {
    list = list || candidates();
    if (!list.length) return null;
    var hero = document.getElementById('heroPlayBtn');
    if (hero && list.indexOf(hero) > -1) return hero;
    /* otherwise whatever sits nearest the top-left of the viewport */
    var best = null, bestScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      var r = list[i].getBoundingClientRect();
      if (r.bottom < 0) continue;
      var score = Math.max(0, r.top) + r.left * 0.25;
      if (score < bestScore) { bestScore = score; best = list[i]; }
    }
    return best || list[0];
  }

  /* -------------------------------------------------------------- focus */

  function setFocus(el) {
    if (!el) return;
    if (current) current.classList.remove(FOCUS_CLASS);
    current = el;
    el.classList.add(FOCUS_CLASS);
    if (!el.hasAttribute('tabindex') && !/^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) {
      el.setAttribute('tabindex', '-1');
    }
    /* Never call focus() on an iframe just to highlight it: focusing the
       element hands every subsequent keypress to the document inside, so the
       remote would be swallowed by the player the moment it passed over it and
       could never move on. Highlight now, enter only on OK. */
    if (el.tagName !== 'IFRAME') {
      try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
    }
    reveal(el);
  }

  function reveal(el) {
    /* Horizontal: centre the card inside its own scrolling row. */
    var row = el.closest('.movie-row, .search-grid');
    if (row && row.scrollWidth > row.clientWidth + 4) {
      var er = rectOf(el), rr = row.getBoundingClientRect();
      row.scrollLeft += (er.left + er.width / 2) - (rr.left + rr.width / 2);
    }
    /* Vertical: keep it clear of the fixed navbar and the bottom edge. */
    var r = rectOf(el);
    var top = 130, bottom = window.innerHeight - 80;
    if (r.top < top) scrollPage(r.top - top);
    else if (r.bottom > bottom) scrollPage(r.bottom - bottom);
  }

  function scrollPage(by) {
    try { window.scrollBy({ top: by, behavior: 'smooth' }); }
    catch (e) { window.scrollBy(0, by); }
  }

  function step(dir) {
    var list = candidates();
    if (!current || !document.contains(current) || list.indexOf(current) === -1) {
      setFocus(firstStop(list));
      return;
    }
    var next = nearest(current, dir);
    if (next) setFocus(next);
    else reveal(current);          /* nothing that way — nudge so it's clearly the edge */
  }

  /* Key events go to whichever document holds focus. The player lives in an
     iframe, so until focus is actually inside it the player never sees a
     single keypress - this page swallows them all. OK on the player hands
     focus over; the player posts sharky:back when it wants out again. */
  var inFrame = false;

  function enterFrame(el) {
    try { el.focus(); } catch (e) {}
    try { if (el.contentWindow) el.contentWindow.focus(); } catch (e) {}
    inFrame = true;
    document.body.classList.add('tv-in-player');
  }

  function exitFrame() {
    if (!inFrame) return;
    inFrame = false;
    document.body.classList.remove('tv-in-player');
    try { window.focus(); } catch (e) {}
  }

  /* If focus comes back to this page by any other route, stop pretending
     we're still inside the player. */
  window.addEventListener('focus', function () {
    if (inFrame && document.activeElement &&
        document.activeElement.tagName !== 'IFRAME') exitFrame();
  });

  function activate(el) {
    if (!el) return;
    if (el.tagName === 'IFRAME') { enterFrame(el); return; }
    if (el.tagName === 'INPUT') { try { el.focus(); } catch (e) {} return; }
    el.click();
  }

  function goBack() {
    var m = document.getElementById('detailsModal');
    if (m && isVisible(m)) {
      var close = document.getElementById('detailsCloseBtn');
      if (close) { close.click(); current = null; return true; }
    }
    if (window.history.length > 1) { window.history.back(); return true; }
    return false;
  }

  /* --------------------------------------------------------------- keys */

  function isIn(list, v) { return list.indexOf(v) > -1; }

  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;

    /* While the fullscreen player is up it owns every key - player.js hands
       them to the video. Navigating the page underneath would be invisible
       and would steal the remote from the thing actually on screen. */
    if (document.body && document.body.classList.contains('player-open')) return;

    var key = e.key, code = e.keyCode || e.which || 0;
    var dir = DIR_KEY[key] || DIR_CODE[code];
    var ok = isIn(OK_KEY, key) || isIn(OK_CODE, code);
    var back = isIn(BACK_KEY, key) || isIn(BACK_CODE, code);

    /* Anything a plain keyboard never sends means we're on a remote. */
    if (code === 4 || code === 461 || code === 10009 || code === 179) enterTvMode();

    var t = e.target;
    var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');

    if (typing) {
      /* Let them type. Up/Down leaves the box, Back leaves the box. */
      if (dir === 'up' || dir === 'down') {
        e.preventDefault();
        try { t.blur(); } catch (err) {}
        current = t;
        step(dir);
      } else if (back) {
        e.preventDefault();
        try { t.blur(); } catch (err) {}
      }
      return;
    }

    if (dir)  { e.preventDefault(); step(dir); return; }
    if (ok)   { if (current) { e.preventDefault(); activate(current); } return; }
    if (back) { if (goBack()) e.preventDefault(); return; }
  }, true);

  /* A mouse click elsewhere should drop the remote highlight. */
  document.addEventListener('mousedown', function () {
    if (current) { current.classList.remove(FOCUS_CLASS); current = null; }
  });

  /* ---------------------------------------------------------- start-up */

  /* When the details panel opens, put the highlight on Play straight away and
     remember where we came from, so closing it puts you back on the same card
     instead of dumping you at the top of the page. */
  var beforeModal = null;

  function watchModal() {
    var m = document.getElementById('detailsModal');
    if (!m || !window.MutationObserver) return;
    var was = isVisible(m);
    new MutationObserver(function () {
      var now = isVisible(m);
      if (now === was) return;
      was = now;
      if (now) {
        beforeModal = current;
        setTimeout(function () {
          var play = document.getElementById('detailsPlayBtn');
          setFocus(play && isVisible(play) ? play : firstStop());
        }, 60);
      } else {
        var back = beforeModal;
        beforeModal = null;
        setTimeout(function () {
          if (back && document.contains(back) && isVisible(back)) setFocus(back);
          else if (current) { current.classList.remove(FOCUS_CLASS); current = null; }
        }, 60);
      }
    }).observe(m, { attributes: true, attributeFilter: ['class', 'style'] });
  }

  function start() {
    apply();
    watchModal();
    /* On a telly there's no pointer, so put focus somewhere immediately.
       On a desktop we stay out of the way until an arrow key is pressed. */
    if (tvMode) {
      var tries = 0;
      var t = setInterval(function () {
        if (current) { clearInterval(t); return; }
        var f = firstStop();
        if (f) { setFocus(f); clearInterval(t); }
        if (++tries > 40) clearInterval(t);      /* ~8s of async rendering */
      }, 200);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
