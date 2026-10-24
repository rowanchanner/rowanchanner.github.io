/* wrapped-entry.js - the "Your Sharky Wrapped is here" banner at the top of
 * Home on the website, the phone app and the TV / Fire Stick app.
 *
 * Shows in December only (or any time with ?wrapped=1 on the page URL, for
 * testing), for a signed-in profile that has watched 10+ minutes this year.
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
  function wanted() {
    var A = w.SharkyAccount;
    return (PREVIEW || new Date().getMonth() === 11) && A && A.profile && minutes() >= 10;
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
    b.addEventListener('click', function () {
      if (isTV || inApp) openFrame();
      else location.href = '/wrapped.html' + (PREVIEW ? '?preview=1' : '');
    });
    return b;
  }

  function check() {
    var h = host(), have = D.getElementById('wrappedBanner');
    if (!h) return;
    if (!wanted()) { if (have) have.parentNode.removeChild(have); return; }
    if (have && have.parentNode === h && h.firstChild === have) return;
    if (have) have.parentNode.removeChild(have);
    h.insertBefore(banner(), h.firstChild);
  }

  D.addEventListener('sharky:account', function () { setTimeout(check, 50); });
  D.addEventListener('sharky:account-data', function () { setTimeout(check, 50); });
  /* Home redraws itself (profile switch, refresh) - keep the banner on top. */
  setInterval(check, 2500);
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', check); else check();
})(window);
