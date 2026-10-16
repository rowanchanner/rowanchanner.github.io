/* account-mweb.js - the mobile website (the phone app's layout, in a browser).
 * Signing in is optional here, like the full website. A small account button
 * sits in the top bar; signed out, your history is kept on this phone. */
(function () {
  'use strict';
  SharkyAccount.init({
    api: CFG.API,
    mode: 'web',
    required: false,
    linkUrl: 'https://www.sharkmovie.co.uk/link.html'
  });

  function paint() {
    var b = document.getElementById('acctBtn');
    if (!b) return;
    var p = SharkyAccount.profile;
    if (p) {
      b.innerHTML = SharkyAccount.avatarHtml(p.avatar);
      b.className = 'acct-btn signed-in';
      b.setAttribute('aria-label', 'Profile: ' + p.name);
    } else {
      b.textContent = SharkyAccount.account ? 'Profiles' : 'Sign in';
      b.className = 'acct-btn';
      b.setAttribute('aria-label', 'Sign in');
    }
  }
  function wire() {
    var row = document.querySelector('#topbar .tb-row');
    var set = document.getElementById('openSettings');
    if (!row || !set || document.getElementById('acctBtn')) return;
    var b = document.createElement('button');
    b.id = 'acctBtn';
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!SharkyAccount.account) SharkyAccount.open('welcome');
      else if (!SharkyAccount.profile) SharkyAccount.open('profiles');
      else SharkyAccount.menu(b);
    });
    row.insertBefore(b, set);
    paint();
  }
  document.addEventListener('sharky:account', paint);
  document.addEventListener('sharky:account-data', function () {
    try { if (window.SharkyApp && SharkyApp.refresh) SharkyApp.refresh(); } catch (e) {}
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
  /* First visit after the switch: keep what this phone already had on the
     full website (signed-out visitors only). After the listeners above, so
     the home screen redraws with it. */
  try { SharkyAccount.importWebHistory(); } catch (e) {}
})();
