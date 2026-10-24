/* account-phone.js - accounts in the Android phone app. Signing in is
 * required, and "Who's watching?" comes up every time the app starts.
 * Your profile icon sits in the top bar: tap it to switch profile. */
(function () {
  'use strict';
  SharkyAccount.init({
    api: CFG.API,
    mode: 'phone',
    required: true,
    askProfileOnStart: true,
    linkUrl: 'https://www.sharkmovie.co.uk/link.html'
  });
  document.addEventListener('sharky:account-data', function () {
    try { if (window.SharkyApp && SharkyApp.refresh) SharkyApp.refresh(); } catch (e) {}
  });

  function paint() {
    var b = document.getElementById('acctBtn');
    if (!b) return;
    var p = SharkyAccount.profile;
    b.style.display = p ? '' : 'none';
    if (p) {
      b.innerHTML = SharkyAccount.avatarHtml(p.avatar);
      b.setAttribute('aria-label', 'Switch profile (' + p.name + ')');
    }
  }
  function wire() {
    var row = document.querySelector('#topbar .tb-row');
    var set = document.getElementById('openSettings');
    if (!row || !set || document.getElementById('acctBtn')) return;
    var st = document.createElement('style');
    st.textContent = '#acctBtn{margin-right:8px;width:34px;height:34px;padding:0;border:0;background:none;cursor:pointer}' +
      '#acctBtn .sa-av{width:34px;height:34px;font-size:1.2rem;border-radius:8px}';
    document.head.appendChild(st);
    var b = document.createElement('button');
    b.id = 'acctBtn';
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (SharkyAccount.profile) SharkyAccount.menu(b);
      else SharkyAccount.open('profiles');
    });
    row.insertBefore(b, set);
    paint();
  }
  document.addEventListener('sharky:account', paint);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
