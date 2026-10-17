/* announcement.js - the pop-up announcement on the website, mobile site and
 * TV app. What it says, and when it shows, is set on the admin page
 * (api.sharkmovie.co.uk/admin/accounts -> Announcements); this file only asks
 * the server what is live right now. Each announcement shows once - closing
 * it remembers its id. Works with a mouse, a touch screen and a TV remote
 * (OK, Back). ES5 only: old Fire TV WebViews load this too.
 */
(function () {
  'use strict';

  var API = 'https://api.sharkmovie.co.uk/announcement';
  var KEY = 'sharky_announcement_closed';
  var INTRO_MAX_MS = 8000;
  var shown = false;

  function closedId() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var CSS =
    '#sharkyAnnouncement{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483600;display:-webkit-box;display:-webkit-flex;display:flex;' +
      '-webkit-box-align:center;-webkit-align-items:center;align-items:center;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;' +
      'padding:20px;box-sizing:border-box;background:rgba(0,0,0,.82);opacity:0;-webkit-transition:opacity .25s ease;transition:opacity .25s ease}' +
    '#sharkyAnnouncement.show{opacity:1}' +
    '#sharkyAnnouncement .sa-card{position:relative;width:100%;max-width:680px;max-height:90%;overflow:auto;box-sizing:border-box;' +
      'background:#111118;color:#f2f2f5;border:2px solid #e50914;border-radius:16px;padding:34px 34px 30px;' +
      'box-shadow:0 24px 80px rgba(0,0,0,.8);font-family:inherit;text-align:left}' +
    '#sharkyAnnouncement .sa-close{position:absolute;top:12px;right:12px;width:52px;height:52px;border-radius:50%;' +
      'border:2px solid rgba(255,255,255,.25);background:#1d1d27;color:#fff;font-size:2rem;line-height:44px;cursor:pointer;padding:0;text-align:center}' +
    '#sharkyAnnouncement .sa-close:hover,#sharkyAnnouncement .sa-close:focus{background:#e50914;border-color:#e50914;outline:none}' +
    '#sharkyAnnouncement .sa-tag{display:inline-block;background:#e50914;color:#fff;font-weight:800;font-size:.8rem;' +
      'letter-spacing:2px;text-transform:uppercase;padding:5px 12px;border-radius:999px;margin-bottom:14px}' +
    '#sharkyAnnouncement h2{margin:0 60px 16px 0;font-size:1.7rem;line-height:1.2;font-weight:900;color:#fff}' +
    '#sharkyAnnouncement p{margin:0 0 14px;font-size:1.1rem;line-height:1.6;color:#d6d6de}' +
    '#sharkyAnnouncement .sa-go{display:inline-block;margin-top:6px;background:#e50914;color:#fff;font-weight:800;' +
      'font-size:1.05rem;padding:12px 20px;border-radius:10px;text-decoration:none}' +
    '#sharkyAnnouncement .sa-go:focus{outline:3px solid #fff}' +
    '#sharkyAnnouncement .sa-hint{margin:18px 0 0;font-size:.85rem;color:#8a8a99}' +
    '@media (max-width:560px){#sharkyAnnouncement .sa-card{padding:26px 20px 22px}#sharkyAnnouncement h2{font-size:1.4rem}' +
      '#sharkyAnnouncement p{font-size:1rem}#sharkyAnnouncement .sa-close{width:46px;height:46px;line-height:38px}}' +
    '@media (min-width:1700px){#sharkyAnnouncement .sa-card{max-width:900px}#sharkyAnnouncement h2{font-size:2.4rem}' +
      '#sharkyAnnouncement p{font-size:1.5rem}}';

  function build(a) {
    if (shown || document.getElementById('sharkyAnnouncement')) return;
    shown = true;
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var paras = String(a.body || '').replace(/\r/g, '').split(/\n\s*\n/), body = '';
    for (var i = 0; i < paras.length; i++) {
      if (paras[i].replace(/\s/g, '')) body += '<p>' + esc(paras[i]).replace(/\n/g, '<br>') + '</p>';
    }
    var link = /^https?:\/\//i.test(a.link || '') ? a.link : '';
    var tv = !!document.getElementById('sa-tv-marker') || /\/tv\//.test(location.pathname);

    var wrap = document.createElement('div');
    wrap.id = 'sharkyAnnouncement';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML =
      '<div class="sa-card">' +
        '<button class="sa-close" type="button" aria-label="Close announcement">&times;</button>' +
        '<span class="sa-tag">Announcement</span>' +
        '<h2>' + esc(a.title) + '</h2>' + body +
        (link ? '<a class="sa-go" href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(a.link_text || 'Find out more') + '</a>' : '') +
        '<p class="sa-hint">' + (tv ? 'Press OK or Back to close.' : 'Click the &times; in the corner to close this.') + '</p>' +
      '</div>';
    document.body.appendChild(wrap);
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    var closeBtn = wrap.querySelector('.sa-close'), goBtn = wrap.querySelector('.sa-go');

    function close() {
      try { localStorage.setItem(KEY, a.id); } catch (e) {}
      window.removeEventListener('keydown', onKey, true);
      wrap.className = '';
      document.body.style.overflow = prevOverflow;
      setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 260);
    }
    /* A TV remote: OK closes (or opens the button if it is focused), Back
       closes, left/right/up/down move between the two. Nothing reaches the
       app underneath while this is up. */
    function onKey(e) {
      var k = e.key, c = e.keyCode;
      var back = k === 'Escape' || k === 'GoBack' || k === 'BrowserBack' || c === 27 || c === 4 || c === 10009 || c === 461 ||
                 (k === 'Backspace' || c === 8);
      var ok = k === 'Enter' || c === 13 || c === 23;
      var arrow = c >= 37 && c <= 40;
      if (!back && !ok && !arrow) return;
      e.preventDefault();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      e.stopPropagation();
      if (back) { close(); return; }
      if (ok) {
        if (goBtn && document.activeElement === goBtn) { window.open(link, '_blank'); return; }
        close(); return;
      }
      if (goBtn) (document.activeElement === goBtn ? closeBtn : goBtn).focus();
    }
    window.addEventListener('keydown', onKey, true);
    closeBtn.addEventListener('click', close);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });

    setTimeout(function () {
      wrap.className = 'show';
      try { closeBtn.focus(); } catch (e) {}
    }, 30);
  }

  /* Wait until nothing else is on top: the SHARKY intro on the website, and
     the sign-in / "Who's watching?" screen on the TV app. */
  function whenClear(fn) {
    var t0 = new Date().getTime();
    (function check() {
      var b = document.body;
      var intro = b && document.getElementById('intro') && b.className.indexOf('intro-done') < 0 &&
                  new Date().getTime() - t0 < INTRO_MAX_MS;
      var acct = window.SharkyAccount && window.SharkyAccount.isOpen;
      var player = document.querySelector('#player.open');
      if (!b || intro || acct || player) { setTimeout(check, 700); return; }
      fn();
    })();
  }

  function fetchIt() {
    try {
      var x = new XMLHttpRequest();
      x.open('GET', API, true);
      x.timeout = 12000;
      x.onload = function () {
        if (x.status !== 200) return;
        var a = null;
        try { a = JSON.parse(x.responseText); } catch (e) { return; }
        if (!a || !a.id || !a.title || closedId() === a.id) return;
        whenClear(function () { if (closedId() !== a.id) setTimeout(function () { build(a); }, 300); });
      };
      x.send();
    } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fetchIt);
  else fetchIt();
  /* Apps that stay open for hours (the TV) look again every 15 minutes, so a
     scheduled announcement still appears without a restart. */
  setInterval(function () { if (!shown) fetchIt(); }, 15 * 60 * 1000);
})();
