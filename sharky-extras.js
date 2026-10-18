/* sharky-extras.js - trailer + comments on the film / show pages.
 *
 * Trailer: the title's YouTube trailer (from TMDB) plays muted in a box above
 * the details, Netflix-style. Unmute / hide buttons; it pauses when Play is
 * pressed or it scrolls out of view. "Hide" is remembered.
 *
 * Comments: anyone can read; posting needs a Sharky account (it goes up under
 * the current profile's name and icon). Signed-out visitors who try get told
 * to create an account first.
 */
(function () {
  'use strict';
  var API = 'https://api.sharkmovie.co.uk';
  var TMDB_KEY = '47745852f22c21e3362f4907231538e1';
  var NO_TRAILERS = 'sharky_no_trailers';
  /* On movie.html / tv.html it runs by itself; the mobile site calls
     SharkyExtras.mount() for each details sheet it opens. */
  var onPage = /\/(movie|tv)(\.html)?$/.test(location.pathname);
  var kind = /\/tv(\.html)?$/.test(location.pathname) ? 'tv' : 'movie';
  var id = onPage ? (location.search.match(/[?&]id=(\d+)/) || [])[1] : null;
  var mediaEl = null;      // mobile: the details sheet's banner

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }

  var css = document.createElement('style');
  css.textContent =
    '.sx-trailer{position:relative;width:100%;max-width:1100px;aspect-ratio:16/9;margin:18px 0 26px;border-radius:14px;overflow:hidden;background:#000;box-shadow:0 18px 50px rgba(0,0,0,.6)}' +
    '.sx-trailer iframe{position:absolute;top:-1px;left:0;width:100%;height:calc(100% + 2px);border:0;pointer-events:none;opacity:0;transition:opacity .6s}' +
    '.sx-trailer.on iframe{opacity:1}' +
    '.sx-trailer .sx-shade{position:absolute;left:0;right:0;bottom:0;height:40%;background:linear-gradient(transparent,rgba(0,0,0,.65));pointer-events:none}' +
    '.sx-tbtns{position:absolute;right:14px;bottom:14px;display:flex;gap:8px;z-index:2}' +
    '.sx-tb{background:rgba(20,20,28,.75);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:8px 14px;font:inherit;font-size:.85rem;font-weight:700;cursor:pointer;backdrop-filter:blur(6px)}' +
    '.sx-tb:hover,.sx-tb:focus{background:#e50914;border-color:#e50914;outline:none}' +
    '.sx-tlabel{position:absolute;left:14px;bottom:16px;color:#fff;font-weight:800;font-size:.8rem;letter-spacing:2px;text-transform:uppercase;opacity:.85;z-index:2}' +
    '.sx-tshow{margin:10px 0 0;background:none;border:1px solid rgba(255,255,255,.25);color:#ddd;border-radius:999px;padding:7px 14px;font:inherit;font-size:.85rem;cursor:pointer}' +
    '.sx-comments{max-width:900px;margin:10px 0 48px}' +
    '.sx-comments h2{font-size:1.35rem;margin:0 0 14px}.sx-comments h2 span{color:#888;font-weight:600;font-size:1rem}' +
    '.sx-compose{display:flex;gap:12px;align-items:flex-start}' +
    '.sx-av{flex:0 0 40px;width:40px;height:40px;border-radius:8px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#222;color:#aaa;font-weight:800}' +
    '.sx-av .sa-av{width:40px!important;height:40px!important;font-size:1.3rem!important;border-radius:8px}' +
    '.sx-box{flex:1;min-width:0}' +
    '.sx-box textarea{width:100%;box-sizing:border-box;min-height:52px;resize:vertical;background:#15151d;color:#eee;border:1px solid #2c2c3a;border-radius:10px;padding:12px;font:inherit;font-size:.95rem}' +
    '.sx-box textarea:focus{outline:none;border-color:#e50914}' +
    '.sx-row{display:flex;align-items:center;gap:10px;margin-top:8px}.sx-row .sx-n{color:#777;font-size:.8rem;margin-right:auto}' +
    '.sx-post{background:#e50914;color:#fff;border:0;border-radius:8px;padding:9px 18px;font:inherit;font-weight:800;cursor:pointer}' +
    '.sx-post:disabled{opacity:.5;cursor:default}' +
    '.sx-msg{margin-top:10px;padding:12px 14px;border-radius:10px;background:#1d1520;border:1px solid #4a2030;color:#eee;font-size:.92rem}' +
    '.sx-msg button{margin:8px 8px 0 0;background:#e50914;color:#fff;border:0;border-radius:8px;padding:8px 14px;font:inherit;font-weight:700;cursor:pointer}' +
    '.sx-msg button.sx-alt{background:#2a2a36}' +
    '.sx-list{margin-top:22px}' +
    '.sx-c{display:flex;gap:12px;padding:14px 0;border-top:1px solid #23232e}' +
    '.sx-c .sx-who{font-weight:800;font-size:.92rem}.sx-c .sx-when{color:#777;font-size:.78rem;margin-left:8px;font-weight:500}' +
    '.sx-c .sx-text{margin-top:4px;color:#ddd;white-space:pre-wrap;word-wrap:break-word;line-height:1.45}' +
    '.sx-c .sx-del{background:none;border:0;color:#888;font:inherit;font-size:.78rem;cursor:pointer;margin-left:8px;padding:0}' +
    '.sx-c .sx-del:hover{color:#e50914}' +
    '.sx-empty{color:#777;padding:14px 0;border-top:1px solid #23232e}' +
    '.sx-trailer.sx-in{position:absolute;top:0;left:0;right:0;bottom:0;max-width:none;width:auto;aspect-ratio:auto;margin:0;border-radius:0;box-shadow:none;z-index:0;background:transparent!important}' +
    '.sx-in .sx-tbtns{z-index:3;right:10px;bottom:auto;top:10px}.sx-in .sx-tlabel,.sx-in .sx-shade{display:none}' +
    '.sx-in .sx-tb{padding:6px 10px;font-size:.75rem}' +
    '.sx-comments.sx-m{margin:22px 0 30px}.sx-m h2{font-size:1.1rem}' +
    '@media(max-width:640px){.sx-trailer{width:100vw;max-width:100vw;margin-left:calc(50% - 50vw);border-radius:0}.sx-tb{padding:7px 11px;font-size:.78rem}}';
  document.head.appendChild(css);

  /* ── Trailer ───────────────────────────────────────────────────────── */
  var tFrame = null, tBox = null, muted = true;
  function yt(cmd, args) {
    try { tFrame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: cmd, args: args || [] }), '*'); } catch (e) {}
  }
  /* Best few trailers, best first: if one won't play (the owner blocked
     embedding, or it's region-locked) the next is tried. */
  function pickTrailers(list) {
    var vids = (list || []).filter(function (v) { return v.site === 'YouTube' && v.key; });
    function score(v) {
      return (v.type === 'Trailer' ? 100 : v.type === 'Teaser' ? 40 : 0) + (v.official ? 20 : 0) +
             ((v.iso_639_1 || 'en') === 'en' ? 10 : 0) + (/official trailer/i.test(v.name || '') ? 5 : 0);
    }
    vids.sort(function (a, b) { return score(b) - score(a); });
    return vids.filter(function (v) { return score(v) >= 40; }).slice(0, 4);
  }
  var candidates = [], backdrop = '', startTimer = null;
  /* YouTube tells the page how the video is doing once we say we're listening. */
  window.addEventListener('message', function (e) {
    if (!tFrame || !/youtube(-nocookie)?\.com$/.test((e.origin || '').replace(/^https?:\/\//, ''))) return;
    var d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (x) { return; }
    if (!d) return;
    var state = d.event === 'onStateChange' ? d.info : (d.event === 'infoDelivery' && d.info ? d.info.playerState : undefined);
    if (state === 1 && tBox) { clearTimeout(startTimer); tBox.className += ' on'; }
    if (d.event === 'onError') nextTrailer();
  });
  function nextTrailer() {
    clearTimeout(startTimer);
    if (tBox) { tBox.parentNode.removeChild(tBox); tBox = null; tFrame = null; }
    candidates.shift();
    if (candidates.length) buildTrailer(candidates[0]);
  }
  function anchor() { return $('.watch-top'); }
  function buildTrailer(v) {
    var at = mediaEl ? null : anchor();
    if ((!at && !mediaEl) || tBox) return;
    tBox = document.createElement('div');
    tBox.className = mediaEl ? 'sx-trailer sx-in' : 'sx-trailer';
    var src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(v.key) +
      '?autoplay=1&mute=1&controls=0&loop=1&playlist=' + encodeURIComponent(v.key) +
      '&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&disablekb=1&enablejsapi=1&origin=' + encodeURIComponent(location.origin);
    if (backdrop && !mediaEl) tBox.style.background = '#000 url("' + backdrop + '") center/cover';
    tBox.innerHTML = '<iframe tabindex="-1" title="Trailer" allow="autoplay; encrypted-media; picture-in-picture" src="' + src + '"></iframe>' +
      '<div class="sx-shade"></div><div class="sx-tlabel">Trailer</div>' +
      '<div class="sx-tbtns"><button class="sx-tb" data-t="sound">&#128263; Unmute</button>' +
      '<button class="sx-tb" data-t="hide" title="Hide trailers">&#10005;</button></div>';
    if (mediaEl) mediaEl.insertBefore(tBox, mediaEl.firstChild); else at.parentNode.insertBefore(tBox, at);
    tFrame = tBox.querySelector('iframe');
    tFrame.addEventListener('load', function () {
      try { tFrame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'sx' }), '*'); } catch (e) {}
    });
    /* Only shown once it's really playing - never YouTube's "unavailable"
       screen. Nothing after 12s: try the next trailer. */
    clearTimeout(startTimer);
    startTimer = setTimeout(nextTrailer, 12000);
    tBox.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-t]') : null;
      if (!b) return;
      if (b.getAttribute('data-t') === 'sound') {
        muted = !muted;
        yt(muted ? 'mute' : 'unMute'); if (!muted) yt('setVolume', [70]);
        b.innerHTML = muted ? '&#128263; Unmute' : '&#128266; Mute';
      } else {
        ls(NO_TRAILERS, '1'); removeTrailer(true);
      }
    });
    /* Off screen = paused; back on screen = carries on (still muted unless asked). */
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (en) {
        if (!tFrame) return;
        yt(en[0].intersectionRatio < 0.3 ? 'pauseVideo' : 'playVideo');
      }, { threshold: [0, 0.3, 1] }).observe(tBox);
    }
  }
  function removeTrailer(showButton) {
    if (tBox) { tBox.parentNode.removeChild(tBox); tBox = null; tFrame = null; }
    if (showButton) trailerButton();
  }
  function trailerButton() {
    if (lastTrailer && !mediaEl && !$('.sx-tshow')) {
      var b = document.createElement('button');
      b.className = 'sx-tshow'; b.innerHTML = '&#9654; Watch trailer';
      b.addEventListener('click', function () { ls(NO_TRAILERS, null); b.parentNode.removeChild(b); buildTrailer(candidates[0] || lastTrailer); });
      var meta = $('.watch-actions');
      if (meta) meta.appendChild(b);
    }
  }
  var lastTrailer = null;
  var mountNo = 0;
  function loadTrailer() {
    var my = mountNo;
    fetch('https://api.themoviedb.org/3/' + kind + '/' + id + '?api_key=' + TMDB_KEY +
          '&append_to_response=videos&include_video_language=en,null')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (my !== mountNo) return;
        candidates = pickTrailers(d && d.videos && d.videos.results);
        if (d && d.backdrop_path) backdrop = 'https://image.tmdb.org/t/p/w1280' + d.backdrop_path;
        var v = candidates[0];
        if (!v) return;
        lastTrailer = v;
        var quiet = ls(NO_TRAILERS) === '1' ||
          (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) ||
          (navigator.connection && navigator.connection.saveData) ||
          (window.SharkyTV && window.SharkyTV.active);
        if (quiet) { trailerButton(); return; }
        buildTrailer(v);
      }).catch(function () {});
  }
  /* Pressing Play (or anything opening the full-screen player) stops it. */
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest('#playBtn, .episode-card, .ep-card, [data-act="play"], .episode-item') : null;
    if (t && tFrame) { yt('pauseVideo'); yt('mute'); }
  }, true);

  /* ── Comments ──────────────────────────────────────────────────────── */
  var listEl, countEl, boxEl, msgEl, postBtn, avEl, nEl, comments = [];
  function acct() { return window.SharkyAccount && window.SharkyAccount.account; }
  function prof() { return window.SharkyAccount && window.SharkyAccount.profile; }
  function api(action, body) {
    var a = acct();
    body = body || {};
    if (a && a.token) body.token = a.token;
    return fetch(API + '/account/' + action, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), cache: 'no-store'
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'Server error' }; }).then(function (d) {
        if (!d.ok) { var er = new Error(d.error || 'Something went wrong'); er.status = r.status; throw er; }
        return d;
      });
    }, function () { throw new Error('Can’t reach Sharky - check your internet'); });
  }
  function avatar(i) {
    try { if (window.SharkyAccount && SharkyAccount.avatarHtml) return SharkyAccount.avatarHtml(i); } catch (e) {}
    return '&#128100;';
  }
  function ago(t) {
    var s = Math.max(0, Date.now() / 1000 - t);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + 'd ago';
    return new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function render() {
    countEl.textContent = comments.length ? '(' + comments.length + ')' : '';
    if (!comments.length) { listEl.innerHTML = '<div class="sx-empty">No comments yet - be the first.</div>'; return; }
    listEl.innerHTML = comments.map(function (c) {
      return '<div class="sx-c"><div class="sx-av">' + avatar(c.avatar) + '</div><div class="sx-box">' +
        '<div><span class="sx-who">' + esc(c.name) + '</span><span class="sx-when">' + ago(c.at) + '</span>' +
        (c.mine ? '<button class="sx-del" data-del="' + c.id + '">Delete</button>' : '') + '</div>' +
        '<div class="sx-text">' + esc(c.text) + '</div></div></div>';
    }).join('');
  }
  function renderCompose() {
    var p = prof();
    avEl.innerHTML = p ? avatar(p.avatar) : '&#128100;';
    boxEl.placeholder = p ? 'Add a comment as ' + p.name + '…' : 'Add a comment…';
  }
  function say(html) { msgEl.innerHTML = html; msgEl.style.display = html ? '' : 'none'; }
  /* The rule: no account, no commenting - say so, and offer the way in. */
  function needAccount() {
    var a = acct();
    if (!a) {
      say('You need a Sharky account to comment. It’s free and keeps your history on every device.<br>' +
          '<button data-go="signup">Create account</button><button class="sx-alt" data-go="signin">Sign in</button>');
      return true;
    }
    if (a.verified === false) {
      say('Verify your email before commenting - check your inbox.<br><button data-go="verify">Enter my code</button>');
      return true;
    }
    if (!a.pid) {
      say('Pick who’s watching first.<br><button data-go="profiles">Choose profile</button>');
      return true;
    }
    return false;
  }
  function load() {
    api('comments_list', { kind: kind, id: id }).then(function (d) {
      comments = d.comments || []; render();
    }).catch(function () { listEl.innerHTML = '<div class="sx-empty">Comments couldn’t load right now.</div>'; });
  }
  function post() {
    if (needAccount()) return;
    var text = boxEl.value.trim();
    if (!text) { boxEl.focus(); return; }
    postBtn.disabled = true; say('');
    api('comment_add', { kind: kind, id: id, text: text, profile: acct().pid }).then(function (d) {
      comments.unshift(d.comment); render(); boxEl.value = ''; count();
    }).catch(function (e) {
      if (e.status === 401) { needAccount(); return; }
      say(esc(e.message) + (/verify/i.test(e.message) ? '<br><button data-go="verify">Enter my code</button>' : ''));
    }).then(function () { postBtn.disabled = false; });
  }
  function count() { var n = boxEl.value.length; nEl.textContent = n ? n + '/500' : ''; nEl.style.color = n > 500 ? '#e50914' : ''; }
  var accountHooked = false;
  function buildComments(target) {
    var sec = document.createElement('section');
    sec.className = target ? 'sx-comments sx-m' : 'sx-comments';
    sec.innerHTML = '<h2>Comments <span></span></h2>' +
      '<div class="sx-compose"><div class="sx-av"></div><div class="sx-box">' +
      '<textarea maxlength="600" placeholder="Add a comment…"></textarea>' +
      '<div class="sx-row"><span class="sx-n"></span><button class="sx-post">Post</button></div>' +
      '<div class="sx-msg" style="display:none"></div></div></div><div class="sx-list"></div>';
    var after = $('.tv-picker'), before = document.getElementById('relatedSection');
    if (target) target.appendChild(sec);
    else if (after) after.parentNode.insertBefore(sec, after.nextSibling);
    else if (before) before.parentNode.insertBefore(sec, before);
    else ($('main') || document.body).appendChild(sec);
    listEl = $('.sx-list', sec); countEl = $('h2 span', sec); boxEl = $('textarea', sec);
    msgEl = $('.sx-msg', sec); postBtn = $('.sx-post', sec); avEl = $('.sx-compose .sx-av', sec); nEl = $('.sx-n', sec);
    boxEl.addEventListener('focus', function () { if (!acct()) needAccount(); });
    boxEl.addEventListener('input', count);
    boxEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) post(); });
    postBtn.addEventListener('click', post);
    sec.addEventListener('click', function (e) {
      var g = e.target.closest ? e.target.closest('[data-go]') : null;
      if (g && window.SharkyAccount) { say(''); SharkyAccount.open(g.getAttribute('data-go')); return; }
      var d = e.target.closest ? e.target.closest('[data-del]') : null;
      if (d && confirm('Delete your comment?')) {
        var cid = Number(d.getAttribute('data-del'));
        api('comment_delete', { id: cid }).then(function () {
          comments = comments.filter(function (c) { return c.id !== cid; }); render();
        }).catch(function (er) { say(esc(er.message)); });
      }
    });
    /* Signing in / switching profile: refresh who you're posting as and
       which comments are yours. */
    if (!accountHooked) {
      accountHooked = true;
      document.addEventListener('sharky:account', function () {
        if (!listEl || !document.body.contains(listEl)) return;
        say(''); renderCompose(); load();
      });
    }
    renderCompose();
    load();
  }

  function stop() {
    mountNo++;
    clearTimeout(startTimer);
    if (tBox && tBox.parentNode) tBox.parentNode.removeChild(tBox);
    tBox = null; tFrame = null; candidates = []; muted = true;
  }
  window.SharkyExtras = {
    /* Mobile site: banner element for the trailer, body element for comments. */
    mount: function (k, tid, media, body) {
      stop();
      kind = k === 'tv' ? 'tv' : 'movie'; id = String(tid); mediaEl = media || null;
      if (mediaEl && ls(NO_TRAILERS) !== '1' && !(navigator.connection && navigator.connection.saveData)) loadTrailer();
      if (body) buildComments(body);
    },
    stop: stop,
    pause: function () { if (tFrame) { yt('pauseVideo'); yt('mute'); } }
  };
  function start() { if (!id) return; loadTrailer(); buildComments(); }
  if (onPage) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
})();
