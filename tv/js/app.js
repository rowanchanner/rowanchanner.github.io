/* app.js — boot, the sidebar, and what Back means from anywhere.
 *
 * The splash stays up until the server has answered once, because a Render
 * box that has gone to sleep takes the best part of a minute to wake and an
 * app that shows empty rows in the meantime looks broken rather than slow.
 */
(function (w) {
  'use strict';

  /* ── Typing without a keyboard ─────────────────────────────────────────
     Used by Settings for the server address. Reuses the search keyboard so
     there is only one thing to learn. */
  var TextEntry = (function () {
    var host, valueEl, current = '', onDone = null, handler = null, opener = null;

    function ask(title, initial, done) {
      host = document.getElementById('textEntry');
      valueEl = document.getElementById('textEntryValue');
      document.getElementById('textEntryTitle').textContent = title;
      current = initial || '';
      onDone = done;
      opener = Nav.current;
      valueEl.textContent = current;

      var kb = document.getElementById('textEntryKb');
      if (!kb.childNodes.length) {
        Keyboard.build(kb, function (op, ch) {
          if (op === 'add') current += ch.toLowerCase();
          else if (op === 'del') current = current.slice(0, -1);
          else if (op === 'clear') current = '';
          valueEl.textContent = current;
        });
        var extras = document.createElement('div');
        extras.className = 'kb-wide';
        [['.', '.'], ['-', '-'], ['/', '/'], [':', ':']].forEach(function (p) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'f kb-key';
          b.textContent = p[0];
          b.setAttribute('data-key', 'te-' + p[1]);
          b.addEventListener('click', function () { current += p[1]; valueEl.textContent = current; });
          extras.appendChild(b);
        });
        var ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'f btn btn-primary';
        ok.textContent = 'Save';
        ok.setAttribute('data-key', 'te-save');
        ok.addEventListener('click', function () { close(true); });
        extras.appendChild(ok);
        kb.appendChild(extras);
      }

      host.classList.remove('off');
      handler = Nav.push(function (action) {
        if (action === 'back') { close(false); return true; }
        return false;
      });
      Nav.focusFirst(host);
    }

    function close(save) {
      host.classList.add('off');
      Nav.pop(handler);
      var v = current;
      var fn = onDone;
      onDone = null;
      if (opener && document.contains(opener)) Nav.focus(opener);
      opener = null;
      if (save && fn) fn(v);
    }

    return { ask: ask };
  })();
  w.TextEntry = TextEntry;

  /* ── Sidebar ───────────────────────────────────────────────────────────── */

  function wireSidebar() {
    [].forEach.call(document.querySelectorAll('.side-item'), function (b) {
      b.addEventListener('click', function () {
        Screens.go(b.getAttribute('data-screen'), null, true);
      });
    });
  }

  /* ── Cards ──────────────────────────────────────────────────────────────
     One listener for every card there will ever be, rather than one per card:
     a home screen holds a couple of hundred of them. */
  function wireCards() {
    document.addEventListener('click', function (e) {
      var card = e.target && e.target.closest ? e.target.closest('.card') : null;
      if (!card || !card.__item) return;
      var item = card.__item;

      /* A Continue Watching card goes straight back into the episode you
         were on — that is the entire point of the row. */
      var resume = card.__opts && card.__opts.resume;
      if (item.__resume) {
        var r = item.__resume;
        Player.play({
          id: r.id, kind: r.kind, title: r.title,
          poster: r.poster, backdrop: r.backdrop, card: r.backdrop || r.poster,
          key: r.kind + ':' + r.id
        }, r.season, r.episode, r.epName);
        return;
      }
      Screens.go('details', { item: item });
    });

    /* The backdrop follows the highlight around the home screen. */
    document.addEventListener('nav:focus', function (e) {
      var el = e.detail.el;
      if (!el.classList.contains('card') || !el.__item) return;
      if (Screens.name === 'home') Screens.setHero(el.__item);
    });
  }

  /* ── Back ───────────────────────────────────────────────────────────────
     From a screen: go back one. From the home screen: ask before quitting,
     because on a Fire TV Back at the top level drops you out of the app. */
  function wireBack() {
    document.addEventListener('nav:back', function () {
      if (Player.isOpen) { Player.close(); return; }
      if (!document.getElementById('textEntry').classList.contains('off')) return;
      if (Screens.back()) return;
      if (Screens.name !== 'home') { Screens.go('home', null, true); return; }
      confirmExit();
    });
  }

  function confirmExit() {
    var box = document.getElementById('exitBox');
    if (!box.classList.contains('off')) return;
    box.classList.remove('off');
    var opener = Nav.current;
    var handler = Nav.push(function (action) {
      if (action === 'back') { dismiss(); return true; }
      return false;
    });
    function dismiss() {
      box.classList.add('off');
      Nav.pop(handler);
      if (opener && document.contains(opener)) Nav.focus(opener);
    }
    document.getElementById('exitNo').onclick = dismiss;
    document.getElementById('exitYes').onclick = function () {
      dismiss();
      /* The Android wrapper listens for this and finishes the activity. In a
         plain browser there is nothing sensible to do, so we stay put. */
      if (w.SharkyHost && w.SharkyHost.exit) { w.SharkyHost.exit(); return; }
      try { window.close(); } catch (e) {}
    };
    Nav.focusFirst(box);
  }

  /* ── The player changing episode under us ──────────────────────────────── */

  function wirePlayer() {
    document.addEventListener('player:closed', function () {
      Screens.refreshPersonal();
      /* Coming out of an episode, refresh the list so the ticks are right. */
      if (Screens.name === 'details' && Screens.detail && Screens.detail.item.kind === 'tv') {
        var host = document.getElementById('epHost');
        if (host) {
          var focusKey = Nav.current ? Nav.current.getAttribute('data-key') : '';
          Screens.go('details', { item: Screens.detail.item }, true);
          if (focusKey) setTimeout(function () {
            var el = document.querySelector('[data-key="' + focusKey.replace(/["\\]/g, '\\$&') + '"]');
            if (el) Nav.focus(el);
          }, 400);
        }
      }
    });
  }

  /* ── Boot ───────────────────────────────────────────────────────────────── */

  function boot() {
    wireSidebar();
    wireCards();
    wireBack();
    wirePlayer();

    var splash = document.getElementById('splash');
    var status = document.getElementById('splashStatus');
    status.textContent = 'Waking the server';

    /* Don't hold the app hostage to the ping: start loading the rows in
       parallel and drop the splash when the first of them is ready. */
    var pinged = API.ping().then(function (ok) {
      status.textContent = ok ? 'Loading your library' : 'Server did not answer — loading anyway';
      return ok;
    });

    Promise.all([pinged, new Promise(function (r) { setTimeout(r, 400); })])
      .then(function () {
        Screens.go('home', null, true);
        return waitForRows(45000);
      })
      .then(function () {
        splash.classList.add('off');
        Nav.focusFirst(document.getElementById('screen-home'));
      });
  }

  function waitForRows(limit) {
    var started = Date.now();
    return new Promise(function (resolve) {
      (function check() {
        if (document.querySelector('#homeRows .card')) return resolve(true);
        if (Date.now() - started > limit) return resolve(false);
        setTimeout(check, 250);
      })();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
