/* announcement.js — a big, one-off notice every visitor has to close.
 *
 * Self-contained: builds its own markup and styles. It stays up until the
 * visitor clicks the cross, and once closed it never comes back for that
 * announcement. To post a NEW announcement later, change ANNOUNCE_ID (and the
 * text) — everyone will see it once more.
 */
(function () {
  'use strict';

  var ANNOUNCE_ID  = '2026-10-02-new-server';
  var KEY          = 'sharky_announcement_closed';
  var DISCORD_URL  = 'https://discord.gg/F7PP27VXnh';
  var NEW_API      = 'https://api.sharkmovie.co.uk';
  var INTRO_MAX_MS = 8000;

  try { if (localStorage.getItem(KEY) === ANNOUNCE_ID) return; } catch (e) {}

  var CSS =
    '#sharkyAnnouncement{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;' +
      'justify-content:center;padding:20px;background:rgba(0,0,0,.78);backdrop-filter:blur(6px);' +
      '-webkit-backdrop-filter:blur(6px);opacity:0;transition:opacity .25s ease}' +
    '#sharkyAnnouncement.show{opacity:1}' +
    '#sharkyAnnouncement .sa-card{position:relative;width:100%;max-width:680px;max-height:calc(100vh - 40px);' +
      'overflow:auto;background:#111118;color:#f2f2f5;border:2px solid #e50914;border-radius:16px;' +
      'padding:34px 34px 30px;box-shadow:0 24px 80px rgba(0,0,0,.8);font-family:inherit;' +
      'transform:translateY(12px) scale(.98);transition:transform .25s ease}' +
    '#sharkyAnnouncement.show .sa-card{transform:none}' +
    '#sharkyAnnouncement .sa-close{position:absolute;top:12px;right:12px;width:52px;height:52px;' +
      'border-radius:50%;border:2px solid rgba(255,255,255,.25);background:#1d1d27;color:#fff;' +
      'font-size:2rem;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;' +
      'transition:background .15s,border-color .15s}' +
    '#sharkyAnnouncement .sa-close:hover,#sharkyAnnouncement .sa-close:focus-visible{background:#e50914;' +
      'border-color:#e50914;outline:none}' +
    '#sharkyAnnouncement .sa-tag{display:inline-block;background:#e50914;color:#fff;font-weight:800;' +
      'font-size:.8rem;letter-spacing:2px;text-transform:uppercase;padding:5px 12px;border-radius:999px;margin-bottom:14px}' +
    '#sharkyAnnouncement h2{margin:0 60px 16px 0;font-size:clamp(1.5rem,3.4vw,2.1rem);line-height:1.2;font-weight:900}' +
    '#sharkyAnnouncement p{margin:0 0 14px;font-size:clamp(1.02rem,2.1vw,1.2rem);line-height:1.6;color:#d6d6de}' +
    '#sharkyAnnouncement .sa-api{display:block;margin:6px 0 18px;padding:12px 16px;background:#1b1b26;' +
      'border:1px solid #2e2e3e;border-radius:10px;font-family:ui-monospace,Consolas,monospace;' +
      'font-size:clamp(1rem,2.2vw,1.15rem);color:#7dd3fc;word-break:break-all;text-decoration:none}' +
    '#sharkyAnnouncement .sa-discord{display:inline-flex;align-items:center;gap:10px;margin-top:6px;' +
      'background:#5865f2;color:#fff;font-weight:800;font-size:1.05rem;padding:12px 20px;border-radius:10px;' +
      'text-decoration:none}' +
    '#sharkyAnnouncement .sa-discord:hover{background:#4752c4}' +
    '#sharkyAnnouncement .sa-hint{margin:18px 0 0;font-size:.85rem;color:#8a8a99}' +
    '@media (max-width:560px){#sharkyAnnouncement .sa-card{padding:26px 20px 22px}' +
      '#sharkyAnnouncement .sa-close{width:46px;height:46px}}';

  function build() {
    if (document.getElementById('sharkyAnnouncement')) return;

    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.id = 'sharkyAnnouncement';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'saTitle');
    wrap.innerHTML =
      '<div class="sa-card">' +
        '<button class="sa-close" type="button" aria-label="Close announcement">&times;</button>' +
        '<span class="sa-tag">Announcement</span>' +
        '<h2 id="saTitle">Sorry the player hasn’t worked today</h2>' +
        '<p>We got hit with a <b>£200 hosting charge</b>, so we had to shut everything down, ' +
          're-evaluate, and move Sharky to a brand new server.</p>' +
        '<p>Our new API can be found at:</p>' +
        '<a class="sa-api" href="' + NEW_API + '/status.json" target="_blank" rel="noopener">' + NEW_API + '</a>' +
        '<p>The player should now be working again. If you find any bugs, please let us know in the Discord!</p>' +
        '<a class="sa-discord" href="' + DISCORD_URL + '" target="_blank" rel="noopener">' +
          '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.5c1.6.4 2.9 1 4.1 1.8a13.7 13.7 0 0 0-1.9-.6 16.5 16.5 0 0 0-3.2-.3h-.4a16.5 16.5 0 0 0-3.2.3c-.6.1-1.3.3-1.9.6a15 15 0 0 1 4.1-1.8L12.6 3a19.8 19.8 0 0 0-4.9 1.4C4.9 8.3 4.2 12 4.5 15.7a19.9 19.9 0 0 0 6 3l1.2-1.7a12.9 12.9 0 0 1-2-1l.4-.3a14.2 14.2 0 0 0 12 0l.4.3c-.6.4-1.3.7-2 1l1.2 1.7a19.9 19.9 0 0 0 6-3c.4-4.3-.7-8-3.4-11.3ZM9.7 13.5c-1.2 0-2.1-1.1-2.1-2.4 0-1.3.9-2.4 2.1-2.4s2.2 1.1 2.2 2.4c0 1.3-1 2.4-2.2 2.4Zm4.6 0c-1.2 0-2.1-1.1-2.1-2.4 0-1.3.9-2.4 2.1-2.4s2.2 1.1 2.2 2.4c0 1.3-1 2.4-2.2 2.4Z"/></svg>' +
          '<span>Join the Discord</span>' +
        '</a>' +
        '<p class="sa-hint">Click the × in the corner to close this.</p>' +
      '</div>';

    document.body.appendChild(wrap);
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';      // no scrolling the page behind it

    var closeBtn = wrap.querySelector('.sa-close');
    closeBtn.addEventListener('click', function () {
      try { localStorage.setItem(KEY, ANNOUNCE_ID); } catch (e) {}
      wrap.classList.remove('show');
      document.body.style.overflow = prevOverflow;
      setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 260);
    });

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        wrap.classList.add('show');
        try { closeBtn.focus({ preventScroll: true }); } catch (e) {}   // a TV remote's OK closes it
      });
    });
  }

  /* Same as the support popup: wait for the SHARKY intro splash to finish,
     or the notice sits underneath it where nobody can click it. */
  function whenIntroDone(fn) {
    var body = document.body;
    if (!body) { setTimeout(function () { whenIntroDone(fn); }, 50); return; }
    if (body.classList.contains('intro-done') || !document.getElementById('intro')) { fn(); return; }
    var fired = false, obs = null;
    function go() {
      if (fired) return; fired = true;
      if (obs) { try { obs.disconnect(); } catch (e) {} }
      clearTimeout(bail); fn();
    }
    if (window.MutationObserver) {
      obs = new MutationObserver(function () { if (document.body.classList.contains('intro-done')) go(); });
      obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    var bail = setTimeout(go, INTRO_MAX_MS);
  }

  function start() { whenIntroDone(function () { setTimeout(build, 300); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
