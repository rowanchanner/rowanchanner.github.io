/* wrapped-entry.js - the "Your Sharky Wrapped is here" banner at the top of
 * Home on the website, the phone app and the TV / Fire Stick app.
 *
 * Shows while Wrapped is open - Rowan's On / Off / Scheduled switch in
 * /admin/wrapped (December if never set) - or any time with ?wrapped=1 on
 * the page URL for testing, for a signed-in profile that has watched 10+ minutes this year.
 * Website + phone: opens /wrapped.html. TV: opens it full screen over the
 * app (?tv=1) and closes again on Back.
 * Plain ES5 (old Fire TV WebViews).
 */
(function (w) {
  'use strict';
  var D = document;
  var PREVIEW = /[?&]wrapped=1/.test(location.search);
  var isTV = !!D.getElementById('homeRows');
  /* The phone app: open over the app too, so Android's Back button closes
     Wrapped instead of quitting the app. */
  var inApp = !!w.SharkyNative;

  function host() { return D.getElementById('rowsSection') || D.getElementById('homeRows') || D.getElementById('rows'); }
  function minutes() {
    try {
      var all = JSON.parse(localStorage.getItem('sharky_wrapped') || 'null');
      if (!all || all.y !== new Date().getFullYear() || !all.d) return 0;
      var s = 0;
      Object.keys(all.d).forEach(function (k) { s += all.d[k].s || 0; });
      return s / 60;
    } catch (e) { return 0; }
  }
  /* Watched things this year before Wrapped's own counter existed: the
     synced progress history counts too (wrapped.html rebuilds the year
     from it). */
  function pastWatching() {
    var y = new Date().getFullYear(), yes = false;
    function inYear(at) { return at && new Date(at).getFullYear() === y; }
    try {
      var prog = JSON.parse(localStorage.getItem('sharkytv_progress') || '{}') || {};
      Object.keys(prog).forEach(function (k) { var r = prog[k] || {}; if (inYear(r.at) && ((r.t || 0) >= 180 || (r.pct || 0) >= 10)) yes = true; });
      var we = JSON.parse(localStorage.getItem('sharky_movies_2_watched_eps') || '{}') || {};
      Object.keys(we).forEach(function (id) {
        Object.keys(we[id] || {}).forEach(function (e) { var r = we[id][e] || {}; if (inYear(r.at) && (r.pct || 0) >= 10) yes = true; });
      });
    } catch (e) {}
    return yes;
  }
  /* Open or not comes from the server (Rowan's switch in /admin/wrapped,
     via wrapped-theme.js). If that hasn't loaded, December as before. */
  function isOpen() {
    var s = w.SharkyWrappedState;
    if (s && typeof s.wrapped === 'boolean') return s.wrapped;
    return new Date().getMonth() === 11;
  }
  function wanted() {
    var A = w.SharkyAccount;
    return (PREVIEW || isOpen()) && A && A.profile && (minutes() >= 10 || pastWatching());
  }

  function closeFrame() {
    var f = D.getElementById('wrappedFrame');
    if (!f) return false;
    f.parentNode.removeChild(f);
    var b = D.getElementById('wrappedBanner');
    try { if (b && w.Nav && Nav.focus) Nav.focus(b); else if (b) b.focus(); } catch (e) {}
    return true;
  }
  function openFrame() {
    if (D.getElementById('wrappedFrame')) return;
    var app = w.SharkyApp;
    if (app && app.back && !app.back.__wrapped) {
      var orig = app.back;
      app.back = function () { return closeFrame() || orig.apply(this, arguments); };
      app.back.__wrapped = true;
    }
    var f = D.createElement('iframe');
    f.id = 'wrappedFrame';
    f.src = '/wrapped.html?' + (isTV ? 'tv=1' : 'app=1') + (PREVIEW ? '&preview=1' : '');
    f.setAttribute('allow', 'autoplay; encrypted-media');
    f.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;border:0;z-index:2147483600;background:#000';
    D.body.appendChild(f);
    setTimeout(function () { try { f.focus(); f.contentWindow.focus(); } catch (e) {} }, 300);
  }
  /* TV remote Back while Wrapped is open: close it, don't move the app. */
  w.addEventListener('nav:back', function (e) {
    if (closeFrame()) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  w.addEventListener('message', function (ev) {
    if (!ev.data || ev.data.type !== 'sharky:wrapped-close' || ev.origin !== location.origin) return;
    closeFrame();
  });

  function banner() {
    var b = D.createElement('button');
    b.type = 'button';
    b.id = 'wrappedBanner';
    b.className = isTV ? 'f' : '';
    b.setAttribute('data-key', 'wrapped-banner');
    var y = new Date().getFullYear();
    b.innerHTML =
      '<span style="font-size:' + (isTV ? '44px' : '34px') + ';line-height:1">&#129416;</span>' +
      '<span style="text-align:left;flex:1;min-width:0"><b style="display:block;font-size:' + (isTV ? '28px' : '18px') + ';font-weight:900;letter-spacing:-.3px">' +
      'Your ' + y + ' Sharky Wrapped is here</b>' +
      '<span style="display:block;opacity:.85;font-size:' + (isTV ? '18px' : '13px') + ';margin-top:2px">Your year in films and shows - tap to play</span></span>' +
      '<span style="font-weight:900;font-size:' + (isTV ? '30px' : '22px') + '">&#9654;</span>';
    b.style.cssText = 'display:flex;align-items:center;gap:14px;width:' + (isTV ? 'calc(100% - 96px)' : 'calc(100% - 28px)') +
      ';margin:' + (isTV ? '10px 48px 26px' : '6px 14px 18px') + ';padding:' + (isTV ? '22px 28px' : '14px 16px') +
      ';border:0;border-radius:16px;cursor:pointer;color:#fff;font-family:inherit;' +
      'background:linear-gradient(110deg,#ff3d6e 0%,#7a00ff 55%,#0050ff 100%);box-shadow:0 10px 30px rgba(122,0,255,.35)';
    b.addEventListener('click', play);
    return b;
  }
  function play() {
    if (isTV || inApp) openFrame();
    else location.href = '/wrapped.html' + (PREVIEW ? '?preview=1' : '');
  }

  /* ── The one-time "Your Wrapped is here" pop-up ──
     Once per profile per year, the first time Wrapped is open for them.
     After that the banner at the top of Home is how they get back to it.
     Waits for any announcement / account pop-up to close first. */
  function popKey() {
    var A = w.SharkyAccount, id = (A && A.profile && A.profile.id) || 'x';
    return 'sharky_wrapped_popped_' + new Date().getFullYear() + '_' + id;
  }
  function popSeen() { try { return !!localStorage.getItem(popKey()); } catch (e) { return true; } }
  function busyElsewhere() {
    if (D.getElementById('sharkyAnnouncement') || D.getElementById('wrappedFrame') || D.getElementById('wrappedPop')) return true;
    var sa = D.getElementById('sa-root');
    return !!(sa && sa.offsetWidth && sa.children.length);
  }
  function keyKind(e) {
    var k = e.key, c = e.keyCode;
    if (k === 'Escape' || k === 'GoBack' || k === 'BrowserBack' || c === 27 || c === 4 || c === 10009 || c === 461 || k === 'Backspace' || c === 8) return 'back';
    if (k === 'Enter' || c === 13 || c === 23) return 'ok';
    if (c >= 37 && c <= 40) return 'move';
    return '';
  }
  function popup() {
    if (popSeen() || busyElsewhere()) return;
    try { localStorage.setItem(popKey(), '1'); } catch (e) {}
    var y = new Date().getFullYear();
    var tv = isTV;
    var css =
      '#wrappedPop{position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483500;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(6,3,14,.82);opacity:0;transition:opacity .3s;padding:16px;box-sizing:border-box}' +
      '#wrappedPop.show{opacity:1}' +
      '#wrappedPop .wp-card{position:relative;width:100%;max-width:' + (tv ? '46vw' : '440px') + ';border-radius:' + (tv ? '1.6vw' : '24px') + ';overflow:hidden;color:#fff;text-align:center;' +
        'padding:' + (tv ? '4vw 3.4vw 3vw' : '38px 26px 26px') + ';box-sizing:border-box;font-family:inherit;' +
        'background:linear-gradient(140deg,#ff3d6e 0%,#c026d3 38%,#7a00ff 68%,#0050ff 100%);box-shadow:0 30px 90px rgba(161,0,255,.55)}' +
      '#wrappedPop .wp-card:before{content:"";position:absolute;left:-30%;top:-60%;width:90%;height:120%;background:radial-gradient(circle,rgba(255,255,255,.28),rgba(255,255,255,0) 60%);pointer-events:none}' +
      '#wrappedPop .wp-shark{font-size:' + (tv ? '5vw' : '64px') + ';line-height:1;display:block;margin-bottom:' + (tv ? '1vw' : '10px') + '}' +
      '#wrappedPop .wp-yr{display:inline-block;font-weight:900;letter-spacing:.18em;font-size:' + (tv ? '.95vw' : '12px') + ';background:rgba(0,0,0,.28);padding:' + (tv ? '.4vw 1vw' : '5px 12px') + ';border-radius:999px;color:#ffd166}' +
      '#wrappedPop h2{font-family:Unbounded,inherit;font-weight:900;letter-spacing:-.02em;line-height:1.05;margin:' + (tv ? '1.2vw 0 .8vw' : '14px 0 10px') + ';font-size:' + (tv ? '3vw' : '32px') + '}' +
      '#wrappedPop p{margin:0 0 ' + (tv ? '2vw' : '22px') + ';opacity:.92;font-size:' + (tv ? '1.25vw' : '16px') + ';line-height:1.4}' +
      '#wrappedPop button{display:block;width:100%;border:0;cursor:pointer;font-family:inherit;font-weight:900;border-radius:999px;outline:none;' +
        'font-size:' + (tv ? '1.4vw' : '17px') + ';padding:' + (tv ? '1.1vw' : '15px') + ';transition:transform .15s,box-shadow .15s}' +
      '#wrappedPop .wp-go{background:#fff;color:#2a0a4a;box-shadow:0 10px 30px rgba(0,0,0,.25)}' +
      '#wrappedPop .wp-later{background:transparent;color:#fff;opacity:.85;margin-top:' + (tv ? '.8vw' : '8px') + ';font-weight:700}' +
      '#wrappedPop button:focus,#wrappedPop button.focused{transform:scale(1.04);box-shadow:0 0 0 ' + (tv ? '.25vw' : '3px') + ' #ffd166}';
    var st = D.createElement('style'); st.appendChild(D.createTextNode(css));
    var wrap = D.createElement('div');
    wrap.id = 'wrappedPop';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = '<div class="wp-card"><span class="wp-shark">&#129416;</span><span class="wp-yr">SHARKY WRAPPED ' + y + '</span>' +
      '<h2>Your year on Sharky is ready</h2><p>Every film, every show, every late night. See how your ' + y + ' went.</p>' +
      '<button type="button" class="wp-go">&#9654;&nbsp; Watch my Wrapped</button><button type="button" class="wp-later">Maybe later</button>' +
      '<p style="margin:' + (tv ? '1vw 0 0' : '12px 0 0') + ';font-size:' + (tv ? '.95vw' : '12px') + ';opacity:.75">It\'s always at the top of Home too.</p></div>';
    wrap.appendChild(st);
    D.body.appendChild(wrap);
    var go = wrap.querySelector('.wp-go'), later = wrap.querySelector('.wp-later'), done = false;
    function close(thenPlay) {
      if (done) return;
      done = true;
      w.removeEventListener('keydown', onKey, true);
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      if (thenPlay) play();
      else { var b = D.getElementById('wrappedBanner'); try { if (b && w.Nav && Nav.focus) Nav.focus(b); } catch (e) {} }
    }
    function focusBtn(b) {
      go.className = 'wp-go'; later.className = 'wp-later';
      b.className += ' focused';
      try { b.focus(); } catch (e) {}
    }
    function onKey(e) {
      var k = keyKind(e);
      if (!k) return;
      e.preventDefault();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      e.stopPropagation();
      if (k === 'back') close(false);
      else if (k === 'ok') close(D.activeElement !== later && later.className.indexOf('focused') < 0);
      else focusBtn(go.className.indexOf('focused') >= 0 ? later : go);
    }
    go.addEventListener('click', function () { close(true); });
    later.addEventListener('click', function () { close(false); });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(false); });
    w.addEventListener('keydown', onKey, true);
    setTimeout(function () { wrap.className = 'show'; focusBtn(go); }, 30);
  }

  function check() {
    var h = host(), have = D.getElementById('wrappedBanner');
    if (!h) return;
    if (!wanted()) { if (have) have.parentNode.removeChild(have); return; }
    if (!have || have.parentNode !== h || h.firstChild !== have) {
      if (have) have.parentNode.removeChild(have);
      h.insertBefore(banner(), h.firstChild);
    }
    /* Pop-up once, a moment after Home has settled. ?wrapped=1 testing
       doesn't use up the real one. */
    if (!PREVIEW && !popSeen() && !popT) popT = setTimeout(function () { popT = 0; if (wanted() && host()) popup(); }, 2500);
  }
  var popT = 0;

  D.addEventListener('sharky:account', function () { setTimeout(check, 50); });
  D.addEventListener('sharky:account-data', function () { setTimeout(check, 50); });
  /* Admin flipped Wrapped on / off: banner appears / goes straight away. */
  D.addEventListener('sharky:wrapped-state', function () { setTimeout(check, 50); });
  /* Home redraws itself (profile switch, refresh) - keep the banner on top. */
  setInterval(check, 2500);
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', check); else check();
})(window);
