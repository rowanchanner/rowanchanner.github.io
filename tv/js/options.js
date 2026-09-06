/* options.js — the second thing a card can do.
 *
 * On a remote there is one button and one meaning: OK opens the title. Every
 * streaming box therefore hides a second menu behind either the Menu key or a
 * held OK, and that is where "take this off my list" lives — which is why
 * there was no way to clear a single Continue Watching card from the telly.
 *
 * Hold OK for half a second, or press the remote's Menu button, and the sheet
 * comes up for whatever is highlighted.
 */
(function (w) {
  'use strict';

  var HOLD_MS = 500;

  var box, list, titleEl;
  var open = false, handler = null, opener = null, target = null;

  function build() {
    if (box) return;
    box = document.getElementById('cardOptions');
    list = document.getElementById('cardOptionsList');
    titleEl = document.getElementById('cardOptionsTitle');
  }

  function itemOf(el) {
    if (!el || !el.classList.contains('card')) return null;
    return el.__item || null;
  }

  function show(el) {
    build();
    var item = itemOf(el);
    if (!item || open) return false;

    target = el;
    opener = el;
    open = true;
    titleEl.textContent = item.title || '';
    list.innerHTML = '';

    var resume = item.__resume || null;

    add('Play', function () {
      close();
      if (resume) {
        Player.play(asItem(resume), resume.season, resume.episode, resume.epName);
      } else if (item.kind === 'tv') {
        var r = Store.resumePoint(item.id);
        Player.play(item, r ? r.season : 1, r ? r.episode : 1, '');
      } else {
        Player.play(item, 0, 0, '');
      }
    });

    if (item.kind === 'tv') {
      add('Episodes', function () { close(); Screens.go('details', { item: item }); });
    }

    add('More Info', function () { close(); Screens.go('details', { item: item }); });

    var inList = Store.inList(item);
    add(inList ? 'Remove from My List' : 'Add to My List', function () {
      Store.toggleList(item);
      close();
      Screens.refreshPersonal();
    });

    /* The one that was genuinely missing: clearing a single card off the
       Continue Watching row without wiping the lot in Settings. */
    if (resume || Store.progress({ id: item.id, kind: item.kind })) {
      add('Remove from Continue Watching', function () {
        Store.forget(item.id, item.kind);
        close();
        Screens.refreshPersonal();
      }, 'danger');
    }

    box.classList.remove('off');
    handler = Nav.push(function (action) {
      if (action === 'back' || action === 'menu') { close(); return true; }
      return false;
    });
    Nav.focusFirst(box);
    return true;
  }

  function asItem(r) {
    return {
      id: r.id, kind: r.kind, title: r.title,
      poster: r.poster, backdrop: r.backdrop, card: r.backdrop || r.poster,
      key: r.kind + ':' + r.id
    };
  }

  function add(label, fn, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'f opt-item' + (cls ? ' opt-' + cls : '');
    b.textContent = label;
    b.setAttribute('data-key', 'opt-' + label.replace(/\s+/g, '-').toLowerCase());
    b.addEventListener('click', fn);
    list.appendChild(b);
  }

  function close() {
    if (!open) return;
    open = false;
    box.classList.add('off');
    Nav.pop(handler);
    handler = null;
    if (opener && document.contains(opener)) Nav.focus(opener);
    else Nav.focusFirst();
    opener = null;
    target = null;
  }

  /* ── Holding OK ───────────────────────────────────────────────────────────
     The hold is a timer started on the first keydown and cancelled on keyup,
     rather than a count of auto-repeats: not every remote repeats its keys,
     and one that does not would never be able to open this at all.

     Ordinary presses therefore act on keyup, a few milliseconds later than
     before and indistinguishable in use. Only cards behave this way —
     everything else still acts on keydown, so the on-screen keyboard is
     unaffected. */
  var holdTimer = null, holdEl = null, fired = false;

  function onDown(e) {
    if (open) return false;
    var el = Nav.current;
    if (!el || !el.classList.contains('card')) return false;

    /* A timer rather than counting auto-repeats: a remote that does not
       repeat its keys would otherwise never be able to open this at all. */
    if (holdEl === el) return true;              // already timing this one
    holdEl = el;
    fired = false;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(function () {
      holdTimer = null;
      if (!holdEl || holdEl !== el) return;
      if (Nav.current !== el) return;            // moved on in the meantime
      fired = true;
      show(el);
    }, HOLD_MS);
    return true;                                 // we own OK while it is on a card
  }

  function onUp() {
    var el = holdEl;
    clearTimeout(holdTimer);
    holdTimer = null;
    holdEl = null;
    if (fired) { fired = false; return; }        // the sheet is up; do nothing
    if (el && document.contains(el) && Nav.current === el) {
      el.click();                                // an ordinary press: open the title
    }
  }

  w.CardOptions = {
    show: show,
    close: close,
    get isOpen() { return open; },
    /* Consulted by nav.js before it activates anything. */
    keyDown: onDown,
    keyUp: onUp,
    menu: function () {
      var el = Nav.current;
      if (el && el.classList.contains('card')) return show(el);
      return false;
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})(window);
