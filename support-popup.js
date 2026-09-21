/* support-popup.js — the small "join the Discord" card that greets a visitor.
 *
 * Self-contained: it builds its own markup, so nothing else on the page has to
 * know it exists. Styles live in style.css under "Support popup".
 *
 * Deliberate choices:
 *   · It waits a moment after load so it never fights the first paint.
 *   · Once dismissed it stays gone for SNOOZE_DAYS, because a nag on every
 *     single load is how people learn to close things without reading them.
 *     Set SNOOZE_DAYS to 0 to show it on every load instead.
 *   · It skips TV mode. A Fire TV remote has no obvious way past a popup and
 *     the living-room crowd is not who joins a Discord.
 */
(function () {
  'use strict';

  var DISCORD_URL = 'https://discord.gg/F7PP27VXnh';
  var SNOOZE_DAYS = 7;      /* 0 = show every load */
  var DELAY_MS    = 900;    /* breathing room once the page is ready */
  var INTRO_MAX_MS = 8000;  /* give up waiting on the intro after this */
  var KEY         = 'sharky_support_popup_until';

  /* Not on a TV. */
  try {
    if (window.SharkyTV && window.SharkyTV.active) return;
  } catch (e) {}

  /* Still snoozed? localStorage can throw (private mode, blocked storage),
     in which case we just show it — better a popup than a broken page. */
  try {
    var until = parseInt(localStorage.getItem(KEY) || '0', 10);
    if (until && Date.now() < until) return;
  } catch (e) {}

  function snooze() {
    if (!SNOOZE_DAYS) return;
    try {
      localStorage.setItem(KEY, String(Date.now() + SNOOZE_DAYS * 86400000));
    } catch (e) {}
  }

  function build() {
    if (document.getElementById('supportPopup')) return;

    var box = document.createElement('div');
    box.id = 'supportPopup';
    box.className = 'support-popup';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Support Sharky Movies');
    box.innerHTML =
      '<button class="support-close" aria-label="Close">&times;</button>' +
      '<div class="support-title">Like Sharky Movies?</div>' +
      '<p class="support-text">We pride ourselves with <b>zero ads</b>.<br>Join to support.</p>' +
      '<a class="support-btn" href="' + DISCORD_URL + '" target="_blank" rel="noopener">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">' +
          '<path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.5c1.6.4 2.9 1 4.1 1.8a13.7 13.7 0 0 0-1.9-.6 16.5 16.5 0 0 0-3.2-.3h-.4a16.5 16.5 0 0 0-3.2.3c-.6.1-1.3.3-1.9.6a15 15 0 0 1 4.1-1.8L12.6 3a19.8 19.8 0 0 0-4.9 1.4C4.9 8.3 4.2 12 4.5 15.7a19.9 19.9 0 0 0 6 3l1.2-1.7a12.9 12.9 0 0 1-2-1l.4-.3a14.2 14.2 0 0 0 12 0l.4.3c-.6.4-1.3.7-2 1l1.2 1.7a19.9 19.9 0 0 0 6-3c.4-4.3-.7-8-3.4-11.3ZM9.7 13.5c-1.2 0-2.1-1.1-2.1-2.4 0-1.3.9-2.4 2.1-2.4s2.2 1.1 2.2 2.4c0 1.3-1 2.4-2.2 2.4Zm4.6 0c-1.2 0-2.1-1.1-2.1-2.4 0-1.3.9-2.4 2.1-2.4s2.2 1.1 2.2 2.4c0 1.3-1 2.4-2.2 2.4Z"/>' +
        '</svg>' +
        '<span>Join the Discord</span>' +
      '</a>';

    document.body.appendChild(box);

    function close() {
      snooze();
      box.classList.remove('show');
      /* Leave after the fade rather than yanking it out mid-animation. */
      setTimeout(function () {
        if (box.parentNode) box.parentNode.removeChild(box);
      }, 260);
    }

    box.querySelector('.support-close').addEventListener('click', close);
    /* Joining counts as answering, so don't ask again. */
    box.querySelector('.support-btn').addEventListener('click', snooze);
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key !== 'Escape') return;
      if (!box.parentNode) { document.removeEventListener('keydown', onEsc); return; }
      close();
      document.removeEventListener('keydown', onEsc);
    });

    /* Next frame, so the entry transition actually runs. */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { box.classList.add('show'); });
    });
  }

  /* The SHARKY intro splash covers the whole screen for the first few seconds
     and sits above everything. Appearing underneath it means the card is
     already sitting there, unclickable, when the splash lifts - so wait for
     the intro to finish (body gets .intro-done) before showing anything. */
  function whenIntroDone(fn) {
    var body = document.body;
    if (!body) { setTimeout(function () { whenIntroDone(fn); }, 50); return; }
    if (body.classList.contains('intro-done') ||
        !document.getElementById('intro')) { fn(); return; }

    var fired = false;
    function go() {
      if (fired) return;
      fired = true;
      if (obs) { try { obs.disconnect(); } catch (e) {} }
      clearTimeout(bail);
      fn();
    }
    var obs = null;
    if (window.MutationObserver) {
      obs = new MutationObserver(function () {
        if (document.body.classList.contains('intro-done')) go();
      });
      obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    /* Belt and braces: show it anyway if the intro never reports back. */
    var bail = setTimeout(go, INTRO_MAX_MS);
  }

  function start() {
    whenIntroDone(function () { setTimeout(build, DELAY_MS); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
