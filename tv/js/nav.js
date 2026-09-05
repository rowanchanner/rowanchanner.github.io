/* nav.js — driving the whole app from five buttons.
 *
 * A television remote gives you up, down, left, right and OK. Everything the
 * app can do has to be reachable from those, which means the highlight must
 * land where a person expects it to, every time.
 *
 * Two details are worth knowing, because both were bugs first:
 *
 *   Focus makes a card bigger. Measuring the highlighted element's real
 *   bounding box therefore overlaps its neighbours and right-arrow skips
 *   every other card. Rectangles are rebuilt here from the element's centre
 *   (which the zoom preserves) and its unscaled offsetWidth/Height.
 *
 *   Scoring by distance between centres sounds right and is not. A wide
 *   element whose centre is far away still sits directly beside you. What
 *   counts is the gap between the two spans on the cross axis, with the
 *   distance along the direction of travel as the tie-breaker.
 */
(function (w) {
  'use strict';

  var FOCUSABLE = '.f:not([hidden]):not(.hidden):not([disabled])';

  var current = null;
  var enabled = true;
  var rowMemory = {};        // row id -> last focused element id/index
  var handlers = [];         // extra key handlers, most recent first

  function visible(el) {
    if (!el || !el.offsetParent && el.tagName !== 'BODY') {
      /* offsetParent is null for display:none and for fixed elements; check
         the box before believing it. */
      var r0 = el ? el.getBoundingClientRect() : null;
      if (!r0 || (r0.width === 0 && r0.height === 0)) return false;
    }
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    var screen = el.closest('.screen');
    if (screen && screen.classList.contains('off')) return false;
    return true;
  }

  /* The element's box as it would be with no focus zoom applied. */
  function rectOf(el) {
    var r = el.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var wid = el.offsetWidth || r.width, hei = el.offsetHeight || r.height;
    return {
      left: cx - wid / 2, right: cx + wid / 2,
      top: cy - hei / 2, bottom: cy + hei / 2,
      cx: cx, cy: cy, width: wid, height: hei
    };
  }

  function candidates() {
    var all = [].slice.call(document.querySelectorAll(FOCUSABLE));
    return all.filter(visible);
  }

  function gap(a1, a2, b1, b2) {
    return Math.max(0, Math.max(a1 - b2, b1 - a2));
  }

  function pick(dir, from) {
    if (!from) return candidates()[0] || null;
    var a = rectOf(from);
    var best = null, bestScore = Infinity;

    candidates().forEach(function (el) {
      if (el === from) return;
      var b = rectOf(el);

      var along, across;
      if (dir === 'left' || dir === 'right') {
        along = dir === 'right' ? b.left - a.right : a.left - b.right;
        /* Must actually be to that side: a small overlap is allowed so that
           ragged rows still connect. */
        if (b.cx === a.cx) return;
        if (dir === 'right' && b.cx <= a.cx + 1) return;
        if (dir === 'left' && b.cx >= a.cx - 1) return;
        across = gap(a.top, a.bottom, b.top, b.bottom);
      } else {
        along = dir === 'down' ? b.top - a.bottom : a.top - b.bottom;
        if (dir === 'down' && b.cy <= a.cy + 1) return;
        if (dir === 'up' && b.cy >= a.cy - 1) return;
        across = gap(a.left, a.right, b.left, b.right);
      }
      if (along < -Math.max(a.width, a.height)) return;
      if (along < 0) along = 0;

      /* Sideways misalignment dominates: something in the same row wins over
         something merely closer. */
      var score = across * 8 + along;

      /* The nav sits across the top, so anything below it is nearer to a
         card than the card next door is. Only Up should reach it, and only
         from the topmost thing on the page. */
      if (el.classList.contains('nav-link') && dir !== 'up') score += 1e6;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    return best;
  }

  function scrollIntoView(el) {
    if (!el) return;
    var row = el.closest('.row-track');
    if (row) {
      var r = el.getBoundingClientRect();
      var rr = row.parentNode.getBoundingClientRect();
      var pad = 80;
      if (r.left < rr.left + pad) {
        row.parentNode.scrollLeft += (r.left - rr.left - pad);
      } else if (r.right > rr.right - pad) {
        row.parentNode.scrollLeft += (r.right - rr.right + pad);
      }
    }
    var page = el.closest('.scroller');
    if (page) {
      var er = el.getBoundingClientRect();
      var pr = page.getBoundingClientRect();
      var block = el.closest('.row-block') || el;
      var br = block.getBoundingClientRect();
      var topPad = 110, botPad = 90;
      if (br.top < pr.top + topPad) {
        page.scrollTop += (br.top - pr.top - topPad);
      } else if (er.bottom > pr.bottom - botPad) {
        page.scrollTop += (er.bottom - pr.bottom + botPad);
      }
    }
  }

  function setFocus(el, opts) {
    if (!el) return false;
    if (current && current !== el) current.classList.remove('focused');
    current = el;
    el.classList.add('focused');
    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
    if (!opts || !opts.noScroll) scrollIntoView(el);

    var row = el.closest('.row-track');
    if (row && row.id) rowMemory[row.id] = el.getAttribute('data-key') || '';

    if (el.getAttribute('data-onfocus')) {
      var fn = w[el.getAttribute('data-onfocus')];
      if (typeof fn === 'function') fn(el);
    }
    document.dispatchEvent(new CustomEvent('nav:focus', { detail: { el: el } }));
    return true;
  }

  function move(dir) {
    var next = pick(dir, current);
    if (!next && !current) next = candidates()[0];

    /* Entering a row again puts you back on the card you left, not the first. */
    if (next && (dir === 'up' || dir === 'down')) {
      var track = next.closest('.row-track');
      if (track && track.id && rowMemory[track.id]) {
        var remembered = track.querySelector('[data-key="' + cssEscape(rowMemory[track.id]) + '"]');
        if (remembered && visible(remembered)) next = remembered;
      }
    }
    if (next) { setFocus(next); return true; }
    return false;
  }

  function cssEscape(v) {
    return String(v).replace(/["\\]/g, '\\$&');
  }

  var KEYS = {
    37: 'left', 38: 'up', 39: 'right', 40: 'down',
    13: 'ok', 23: 'ok',
    27: 'back', 8: 'back', 4: 'back', 461: 'back',
    179: 'playpause', 85: 'playpause', 415: 'play', 19: 'pause',
    227: 'rew', 89: 'rew', 228: 'ff', 90: 'ff',
    82: 'menu'
  };
  var NAMES = {
    ArrowLeft: 'left', ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down',
    Left: 'left', Up: 'up', Right: 'right', Down: 'down',
    Enter: 'ok', ' ': 'ok', Spacebar: 'ok', Select: 'ok',
    Escape: 'back', Backspace: 'back', BrowserBack: 'back', GoBack: 'back',
    MediaPlayPause: 'playpause', MediaPlay: 'play', MediaPause: 'pause',
    MediaRewind: 'rew', MediaFastForward: 'ff', ContextMenu: 'menu'
  };

  function actionFor(e) {
    var byName = NAMES[e.key];
    if (byName) return byName;
    return KEYS[e.keyCode || e.which || 0] || null;
  }

  function onKey(e) {
    if (!enabled) return;
    var action = actionFor(e);
    if (!action) return;

    /* Typing in a real text field wins over navigation. */
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') &&
        (action === 'left' || action === 'right') && !t.readOnly) {
      return;
    }

    for (var i = 0; i < handlers.length; i++) {
      if (handlers[i](action, e) === true) {
        e.preventDefault();
        return;
      }
    }

    if (action === 'ok') {
      e.preventDefault();
      if (current) activate(current);
      return;
    }
    if (action === 'back') {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('nav:back'));
      return;
    }
    if (action === 'left' || action === 'right' || action === 'up' || action === 'down') {
      e.preventDefault();
      move(action);
    }
  }

  function activate(el) {
    el.classList.add('pressed');
    setTimeout(function () { el.classList.remove('pressed'); }, 140);
    var ev = new CustomEvent('nav:activate', { detail: { el: el }, bubbles: true });
    el.dispatchEvent(ev);
    if (typeof el.click === 'function') el.click();
  }

  document.addEventListener('keydown', onKey, true);

  /* A mouse or a touchscreen still works — handy when testing on a laptop. */
  document.addEventListener('mouseover', function (e) {
    var el = e.target && e.target.closest ? e.target.closest(FOCUSABLE) : null;
    if (el && el !== current && visible(el)) setFocus(el, { noScroll: true });
  });

  w.Nav = {
    focus: setFocus,
    move: move,
    get current() { return current; },
    clear: function () {
      if (current) current.classList.remove('focused');
      current = null;
    },
    /* Focus the first sensible thing on a screen that just appeared. */
    focusFirst: function (root) {
      var scope = root || document;
      var pref = scope.querySelector('.f.autofocus:not(.hidden)');
      if (pref && visible(pref)) return setFocus(pref);
      var all = [].slice.call(scope.querySelectorAll(FOCUSABLE)).filter(visible);
      return all.length ? setFocus(all[0]) : false;
    },
    /* Screens push a handler to claim keys while they are on top. */
    push: function (fn) { handlers.unshift(fn); return fn; },
    pop: function (fn) {
      var i = handlers.indexOf(fn);
      if (i >= 0) handlers.splice(i, 1);
    },
    set enabled(v) { enabled = !!v; },
    get enabled() { return enabled; },
    rectOf: rectOf,
    action: actionFor
  };
})(window);
