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
