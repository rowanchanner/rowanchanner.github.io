/* account-tv.js - accounts on the television.
 * Signing in is required here. After the intro: sign in (on the TV, or scan
 * the QR with a phone), then "Who's watching?" on every launch. Each
 * profile's Continue Watching / My List is its own.
 */
(function (w) {
  'use strict';
  function start() {
    SharkyAccount.init({
      api: CFG.API,
      mode: 'tv',
      required: true,
      askProfileOnStart: true,
      linkUrl: 'https://www.sharkmovie.co.uk/link.html'
    });
  }
  if (!w.Intro || w.Intro.finished) start();
  else document.addEventListener('intro:done', start);

  /* ── Profile button in the top bar ────────────────────────────────────
     Your icon + name at the right of the menu. Right from "Settings" with
     the remote, OK, and you're on "Who's watching?". */
  function profileButton() {
    var nav = document.getElementById('topnav');
    if (!nav) return null;
    var b = document.getElementById('navProfile');
    if (b) return b;
    var st = document.createElement('style');
    st.textContent =
      '#navProfile{margin-left:auto;display:flex;align-items:center;background:none;border:3px solid transparent;' +
      'border-radius:999px;padding:.35vw 1vw .35vw .35vw;color:#fff;font:inherit;font-size:1.25vw;font-weight:700;cursor:pointer}' +
      '#navProfile .sa-av{margin-right:.7vw;width:2.6vw;height:2.6vw;min-width:34px;min-height:34px;font-size:1.5vw;border-radius:.6vw}' +
      '#navProfile.focused,#navProfile:focus{border-color:#fff;background:rgba(255,255,255,.12)}' +
      '#navProfile small{display:block;font-size:.8vw;font-weight:700;color:#ddd;text-align:left}';
    document.head.appendChild(st);
    b = document.createElement('button');
    b.type = 'button';
    b.id = 'navProfile';
    b.className = 'f';
    b.setAttribute('data-key', 'nav-profile');
    b.addEventListener('click', function () { SharkyAccount.open('profiles'); });
    nav.appendChild(b);
    return b;
  }
  function paintProfile() {
    var b = profileButton();
    if (!b) return;
    var p = SharkyAccount.profile;
    if (!p) { b.style.display = 'none'; return; }
    b.style.display = '';
    b.innerHTML = SharkyAccount.avatarHtml(p.avatar) +
      '<span>' + String(p.name).replace(/[<>&]/g, '') + '<small>Switch profile</small></span>';
  }
  document.addEventListener('sharky:account', paintProfile);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintProfile); else paintProfile();

  /* A profile's history arrived (or the profile changed): redraw the rows. */
  document.addEventListener('sharky:account-data', function () {
    try { if (w.Screens && Screens.refreshPersonal) Screens.refreshPersonal(); } catch (e) {}
  });
  /* Hand the remote back to the app when the account screen goes away. */
  document.addEventListener('sharky:account-closed', function () {
    try { if (w.Nav && Nav.focusFirst) Nav.focusFirst(); } catch (e) {}
    try { if (w.Screens && Screens.name === 'settings') Screens.go('settings', null, true); } catch (e) {}
  });
})(window);
