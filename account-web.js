/* account-web.js - the website side of Sharky accounts.
 * Optional here: everything works signed out, exactly as before. Signing in
 * keeps Continue Watching / My List in step with the TV and phone apps, per
 * profile. Loaded before the page's own scripts so it sees every save.
 */
(function () {
  'use strict';
  SharkyAccount.init({
    api: 'https://api.sharkmovie.co.uk',
    mode: 'web',
    required: false,
    linkUrl: 'https://www.sharkmovie.co.uk/link.html'
  });

  /* Things that need a (free) account: My List, downloads, Group Watch.
     sharkyNeedAccount('add this to My List', retry) -> true when signed in
     with a profile; otherwise shows "Create a free account to ..." and
     returns false, and runs retry() once they're signed in. */
  window.sharkyNeedAccount = function (why, retry) {
    var A = window.SharkyAccount;
    if (!A || !A.gate) return true;
    if (A.profile && A.account && A.account.verified !== false) return true;
    A.gate(why, retry);
    return false;
  };

  function paintButton() {
    var b = document.getElementById('accountBtn');
    if (!b) return;
    var p = SharkyAccount.profile;
    if (p) {
      b.className = 'nav-account signed-in';
      b.innerHTML = SharkyAccount.avatarHtml(p.avatar) + '<span class="nav-account-name">' +
        String(p.name).replace(/[<>&]/g, '') + '</span>';
      b.title = 'Switch profile / account';
    } else {
      b.className = 'nav-account';
      b.textContent = SharkyAccount.account ? 'Choose profile' : 'Sign in · Free';
      b.title = 'Sign in or create a free account';
    }
  }

  /* Re-draw whatever this page shows from storage. Each call is guarded:
     only the home page has these functions. */
  function redraw() {
    try { if (typeof renderContinueWatching === 'function') renderContinueWatching(); } catch (e) {}
    try { if (typeof renderMyList === 'function') renderMyList(); } catch (e) {}
    try { if (typeof refreshBecauseWatched === 'function') refreshBecauseWatched(); } catch (e) {}
    try {
      if (typeof loadEpisodes === 'function' && typeof selectedSeason !== 'undefined') {
        loadEpisodes(selectedSeason, typeof selectedEpisode !== 'undefined' ? selectedEpisode : 1);
      }
    } catch (e) {}
  }

  document.addEventListener('sharky:account', paintButton);
  document.addEventListener('sharky:account-data', redraw);
  document.addEventListener('DOMContentLoaded', function () {
    paintButton();
    var b = document.getElementById('accountBtn');
    if (b) b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!SharkyAccount.account) SharkyAccount.open('welcome');
      else if (!SharkyAccount.profile) SharkyAccount.open('profiles');
      else SharkyAccount.menu(b);
    });
  });
})();
