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

  /* The element's box as it WILL be: with the focus zoom undone, and with any
     scrolling that is still gliding already applied.
     
     Both corrections were bugs first. The zoom inflates the highlighted card
     so it overlaps its neighbours, which made right-arrow skip every other
     one. And measuring during a glide gave transient geometry in which a
     billboard button could line up with a card two rows down, so walking
     along a row occasionally leapt somewhere absurd. Rebuilding the box from
     the (zoom-invariant) centre and adding the outstanding scroll distance
     fixes both. */
  function rectOf(el) {
    var r = el.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var wid = el.offsetWidth || r.width, hei = el.offsetHeight || r.height;

    /* However far each scrolling ancestor still has to travel, the content
       inside it has already been promised that movement. */
    var node = el.parentNode;
    while (node && node.nodeType === 1) {
      var st = node.__scroll;
      if (st) {
        cx += node.scrollLeft - st.targetX;
        cy += node.scrollTop - st.target;
      }
      node = node.parentNode;
    }

    return {
      left: cx - wid / 2, right: cx + wid / 2,
      top: cy - hei / 2, bottom: cy + hei / 2,
      cx: cx, cy: cy, width: wid, height: hei
    };
  }

  /* When something is laid over the page — the menu, a dialog — the highlight
     must stay inside it. Without this, Down inside the open menu walked out
     into the row behind it, because a card underneath scored perfectly well
     on pure geometry. */
  function scope() {
    if (document.body.classList.contains('sidebar-open')) {
      var sb = document.getElementById('sidebar');
      if (sb) return sb;
    }
    var modals = document.querySelectorAll('.modal:not(.off)');
    if (modals.length) return modals[modals.length - 1];
    return document;
  }

  function candidates() {
    var all = [].slice.call(scope().querySelectorAll(FOCUSABLE));
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
        /* Left and right stay on the line you are on: the two must genuinely
           share horizontal band, not merely sit near each other. Without this,
           Left from the first card in a row slid diagonally up into the
           billboard — so the edge of the row was never reached and the menu
           never opened. */
        var overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlap < Math.min(a.height, b.height) * 0.5) return;
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

      /* The bar across the top is a last resort in every direction, including
         up. It is fixed to the viewport, so once the page has scrolled it is
         nearer to a card than the row above is — which is why Up from the
         middle of the page shot straight to Settings instead of moving one
         row. The penalty is additive rather than a ban, so when there really
         is nothing else above (the billboard) the menu still wins.

         Moving ALONG the bar has to work normally, though: penalising that
         too was why Films and Series could not be reached at all. */
      var elNav = el.classList.contains('nav-link');
      var fromNav = from.classList.contains('nav-link');
      if (elNav && !fromNav) score += 1e6;
      if (!elNav && fromNav && (dir === 'left' || dir === 'right')) score += 1e6;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    return best;
  }

  /* ── Scrolling ────────────────────────────────────────────────────────────
     Held-down arrows used to make the page lurch and then jump. The cause was
     asking the browser for a smooth scroll and then, before it had finished,
     reading the half-way scrollTop and adding another delta to it — so every
     press compounded a position that was still moving.

     Now each scroller carries its own target. Deltas are measured against
     that target rather than against wherever the animation currently is, and
     one rAF loop walks the real position towards it. Holding a direction
     glides; letting go stops exactly where the highlight is. */

  function scrollState(el) {
    if (!el.__scroll) {
      el.__scroll = { target: el.scrollTop, targetX: el.scrollLeft, raf: 0 };
    }
    var st = el.__scroll;
    /* If something else moved this element (a screen change, a re-render),
       adopt the real position rather than fighting it. */
    if (!st.raf) { st.target = el.scrollTop; st.targetX = el.scrollLeft; }
    return st;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  function glide(el) {
    var st = el.__scroll;
    if (st.raf) return;
    st.raf = requestAnimationFrame(function step() {
      var dy = st.target - el.scrollTop;
      var dx = st.targetX - el.scrollLeft;
      if (Math.abs(dy) < 1 && Math.abs(dx) < 1) {
        el.scrollTop = st.target;
        el.scrollLeft = st.targetX;
        st.raf = 0;
        return;
      }
      /* A fifth of the remaining distance per frame: quick to start, settles
         without overshoot, and never has to be cancelled. */
      el.scrollTop += dy * 0.22;
      el.scrollLeft += dx * 0.22;
      st.raf = requestAnimationFrame(step);
    });
  }

  function scrollIntoView(el) {
    if (!el) return;

    var track = el.closest('.row-track');
    if (track) {
      var vp = track.parentNode;
      var st = scrollState(vp);
      var pad = vp.clientWidth * 0.06;
      var r = rectOf(el);                    // already settled-position
      var vr = vp.getBoundingClientRect();
      var left = r.left - vr.left;
      var right = r.right - vr.left;
      var maxX = Math.max(0, vp.scrollWidth - vp.clientWidth);
      if (left < pad) st.targetX = clamp(st.targetX + (left - pad), 0, maxX);
      else if (right > vp.clientWidth - pad) {
        st.targetX = clamp(st.targetX + (right - vp.clientWidth + pad), 0, maxX);
      }
      glide(vp);
    }

    var page = el.closest('.scroller');
    if (page) {
      var ps = scrollState(page);
      /* On the billboard's own buttons, bring the whole billboard into view
         rather than just the button — otherwise the first thing you see on
         opening the app is a strip of buttons with the title cut off above
         them, and no amount of pressing Up ever reveals it. */
      var block = el.closest('.row-block') || el.closest('#billboard') || el;
      var br = rectOf(block);
      var er = rectOf(el);
      var pr = page.getBoundingClientRect();
      var topPad = page.clientHeight * 0.13;
      var botPad = page.clientHeight * 0.10;
      var top = br.top - pr.top;
      var bottom = er.bottom - pr.top;
      var maxY = Math.max(0, page.scrollHeight - page.clientHeight);
      if (top < topPad) ps.target = clamp(ps.target + (top - topPad), 0, maxY);
      else if (bottom > page.clientHeight - botPad) {
        ps.target = clamp(ps.target + (bottom - page.clientHeight + botPad), 0, maxY);
      }
      glide(page);
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

    /* Last refusal before the default behaviour: opening the menu when Left
       has nowhere left to go. */
    if (w.Sidebar && w.Sidebar.edgeHandler(action, e) === true) {
      e.preventDefault();
      return;
    }

    if (action === 'ok') {
      e.preventDefault();
      /* A card's OK is claimed by the options module, which distinguishes a
         press from a hold. Everything else acts immediately. */
      if (w.CardOptions && w.CardOptions.keyDown(action, e) === true) return;
      if (current) activate(current);
      return;
    }
    if (action === 'menu') {
      if (w.CardOptions && w.CardOptions.menu()) { e.preventDefault(); return; }
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

  /* The other half of press-and-hold. */
  document.addEventListener('keyup', function (e) {
    if (!enabled) return;
    if (actionFor(e) !== 'ok') return;
    if (w.CardOptions) w.CardOptions.keyUp();
  }, true);

  /* A mouse or a touchscreen still works — handy when testing on a laptop. */
  document.addEventListener('mouseover', function (e) {
    var el = e.target && e.target.closest ? e.target.closest(FOCUSABLE) : null;
    if (el && el !== current && visible(el)) setFocus(el, { noScroll: true });
  });

  w.Nav = {
    focus: setFocus,
    move: move,
    /* Would this direction land anywhere? The sidebar asks before claiming a
       Left press, so it only opens at the true edge of the screen. */
    wouldMove: function (dir) { return !!pick(dir, current); },
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
