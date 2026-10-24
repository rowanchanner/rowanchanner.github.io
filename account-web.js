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

  /* Share a title. The link goes through api.sharkmovie.co.uk/s/... which
     carries the poster/title/rating preview for WhatsApp, Discord, iMessage
     and X, then sends people on to the title here. Phones get the native
     share sheet; computers get the link copied. */
  window.sharkyShare = function (kind, id, s, e, title) {
    var url = 'https://api.sharkmovie.co.uk/s/' + (kind === 'tv' ? 'tv' : 'movie') + '/' + encodeURIComponent(id) +
              (kind === 'tv' && s && e ? '/' + s + '/' + e : '');
    var text = title ? 'Watch ' + title + ' on Sharky' : 'Watch this on Sharky';
    function toast(msg) {
      var t = document.createElement('div');
      t.textContent = msg;
      t.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:99999;' +
        'background:#fff;color:#111;font:600 14px/1.2 system-ui,sans-serif;padding:12px 18px;border-radius:999px;' +
        'box-shadow:0 8px 30px rgba(0,0,0,.45)';
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2200);
    }
    function copy() {
      var done = function () { toast('Link copied - paste it anywhere'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, function () { prompt('Copy this link:', url); });
      } else { prompt('Copy this link:', url); }
    }
    var touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (navigator.share && touch) {
      navigator.share({ title: title || 'Sharky', text: text, url: url }).catch(function (err) {
        if (!err || err.name !== 'AbortError') copy();
      });
    } else {
      copy();
    }
  };

  /* How long each title was REALLY watched, from the player's progress
     messages (every ~5s). foryou.js only counts something as "watched" once
     it's played for 3+ minutes (or 10%) - opening a film for two seconds to
     test it mustn't give you "Because You Watched ...". Kept per profile in
     the synced signals store; only while signed in. */
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || d.type !== 'sharky:progress' || !d.id) return;
    if (!/^https:\/\/api\.sharkmovie\.co\.uk$/.test(ev.origin || '')) return;
    var A = window.SharkyAccount;
    if (!A || !A.profile) return;
    try {
      var s = JSON.parse(localStorage.getItem('sharky_fy_signals') || 'null') || { v: 1, imp: {}, clk: {}, no: {}, q: [] };
      s.w = s.w || {};
      var k = (d.kind === 'tv' ? 'tv' : 'movie') + ':' + d.id;
      var prev = s.w[k] || [0, 0];
      var t = Math.max(0, Math.floor(d.t || 0)), pct = Math.max(0, Math.floor(d.pct || 0));
      if (t <= prev[0] && pct <= prev[1]) return;          // nothing new - don't rewrite
      s.w[k] = [Math.max(prev[0], t), Math.max(prev[1], pct)];
      var ks = Object.keys(s.w);
      if (ks.length > 200) delete s.w[ks[0]];
      localStorage.setItem('sharky_fy_signals', JSON.stringify(s));
    } catch (e) {}
  });

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
