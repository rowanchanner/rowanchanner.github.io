/* sharky-account.js - accounts, profiles and synced history for every Sharky
 * app: the website, the Fire TV app and the Android phone app.
 *
 *   SharkyAccount.init({
 *     api:      'https://api.sharkmovie.co.uk',
 *     mode:     'web' | 'tv' | 'phone',
 *     required: true/false,          // TV + APK: must sign in to use the app
 *     askProfileOnStart: true/false, // TV + APK: "Who's watching?" every launch
 *     linkUrl:  'https://www.sharkmovie.co.uk/link.html'
 *   });
 *
 * Each profile's history is ONE small bundle on the server (capped at 64 KB,
 * usually a few KB). The apps keep working exactly as before on top of
 * localStorage; this file swaps that storage over when you pick a profile
 * and pushes changes up a few seconds after they happen.
 *
 * Plain ES5 on purpose: Fire TV WebViews can be old.
 */
(function (w) {
  'use strict';

  var WEB_KEYS = ['sharky_movies_2_my_list', 'sharky_movies_2_continue_watching',
                  'sharky_movies_2_tv_progress', 'sharky_movies_2_watched_eps',
                  'sharky_fy_signals',    // foryou.js: what each profile skipped / opened / searched
                  'sharky_wrapped'];      // wrapped.html: this year's watch time, per device
  var APP_KEYS = ['sharkytv_continue', 'sharkytv_mylist', 'sharkytv_progress'];
  var KEYS = WEB_KEYS.concat(APP_KEYS);
  var S_ACCT = 'sharky_acct';
  var S_MOD = 'sharky_acct_mod';
  var MAX_BYTES = 60 * 1024;

  /* "What do you mainly watch Sharky on?" - asked at sign-up, and once of
     anyone who signed up before the question existed. */
  var DEVICES = [['tv_browser', 'TV browser'], ['tv_app', 'TV app'], ['firestick', 'Fire Stick app'],
                 ['phone', 'Phone'], ['computer', 'Computer'], ['other', 'Other']];
  var devAsked = false;
  var AVATARS = [
    ['🦈', '#0e7490'], ['🍿', '#b91c1c'], ['👽', '#15803d'],
    ['🐱', '#a16207'], ['🐶', '#7c2d12'], ['🦊', '#c2410c'],
    ['🐼', '#334155'], ['🤖', '#4338ca'], ['👻', '#6b21a8'],
    ['🦁', '#b45309'], ['🐸', '#166534'], ['🐙', '#be185d']
  ];

  var opt = {}, acct = null, root = null, screen = '', stack = [];
  var applying = false, pushTimer = null, pollTimer = null, syncing = false, vTimer = null;
  var kbTarget = null, kbShift = false, focusEl = null, pending = null;
  var mustPick = false;          // TV/APK start-up: a profile has to be chosen
  var mergeOnce = false;         // first pick after browsing signed out: merge, never overwrite
  var afterPick = null;          // gate(): the action to finish once signed in + profile picked

  /* ── Small helpers ───────────────────────────────────────────────────── */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function jget(k, d) { try { var v = JSON.parse(lsGet(k)); return v == null ? d : v; } catch (e) { return d; } }
  function jset(k, v) { lsSet(k, JSON.stringify(v)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel) { return root ? root.querySelector(sel) : null; }
  function isTV() { return opt.mode === 'tv'; }

  function call(action, body) {
    body = body || {};
    if (acct && acct.token && body.token == null) body.token = acct.token;
    return fetch(opt.api + '/account/' + action, {
      method: 'POST', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body), cache: 'no-store'
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'Server error' }; })
        .then(function (d) {
          if (r.status === 401 && body.token && action !== 'login') signedOutRemotely();
          if (!d.ok) throw new Error(d.error || 'Something went wrong');
          return d;
        });
    }, function () { throw new Error('Can’t reach Sharky - check your internet'); });
  }

  function save() { if (acct) jset(S_ACCT, acct); else lsDel(S_ACCT); }

  function avatarHtml(i, big) {
    var a = AVATARS[i] || AVATARS[0];
    return '<span class="sa-av' + (big ? ' sa-av-big' : '') + '" style="background:' + a[1] + '">' + a[0] + '</span>';
  }

  function currentProfile() {
    if (!acct || !acct.profiles) return null;
    for (var i = 0; i < acct.profiles.length; i++) if (acct.profiles[i].id === acct.pid) return acct.profiles[i];
    return null;
  }

  /* ── Sync ────────────────────────────────────────────────────────────── */
  var origSet = Storage.prototype.setItem, origDel = Storage.prototype.removeItem;
  function touched(k) {
    if (applying || KEYS.indexOf(k) < 0) return;
    var mod = jget(S_MOD, {});
    mod[k] = Date.now();
    origSet.call(localStorage, S_MOD, JSON.stringify(mod));
    schedulePush();
  }
  try {
    Storage.prototype.setItem = function (k, v) { origSet.call(this, k, v); if (this === w.localStorage) touched(k); };
    Storage.prototype.removeItem = function (k) { origDel.call(this, k); if (this === w.localStorage) touched(k); };
  } catch (e) {}

  function schedulePush() {
    if (!acct || !acct.pid) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(sync, 4000);
  }

  function apply(k, v) {
    applying = true;
    try { if (v == null) origDel.call(localStorage, k); else origSet.call(localStorage, k, v); }
    finally { applying = false; }
  }

  function clearLocal() {
    KEYS.forEach(function (k) { apply(k, null); });
    apply(S_MOD, null);
  }

  /* Pull, keep whichever copy of each key is newer, convert between the
     website's format and the apps', then push the merged bundle back. */
  function sync() {
    if (!acct || !acct.pid || syncing || acct.verified === false) return Promise.resolve();
    syncing = true;
    var pid = acct.pid;
    return call('data_get', { profile: pid }).then(function (d) {
      if (!acct || acct.pid !== pid) return;
      var server = d.data || {}, mod = jget(S_MOD, {}), changed = false, out = {};
      if (mergeOnce) {
        /* Guest history meets an account that already has history: combine
           the two. Last-write-wins here would wipe the account's history. */
        mergeOnce = false;
        var now = Date.now();
        KEYS.forEach(function (k) {
          var sv = server[k], lv = lsGet(k);
          if (!sv || lv == null || lv === sv.v) return;
          try {
            var merged = mergeVal(JSON.parse(sv.v), JSON.parse(lv));
            apply(k, JSON.stringify(merged)); mod[k] = now; changed = true;
          } catch (e) {}
        });
      }
      KEYS.forEach(function (k) {
        var s = server[k], lm = mod[k] || 0, lv = lsGet(k);
        /* Wrapped counters only ever grow, one sub-total per device: merge
           (bigger wins per device) instead of last-write-wins, or two
           devices watching at once would wipe each other's minutes. */
        if (k === 'sharky_wrapped' && s && lv != null && lv !== s.v) {
          try {
            var m = wrapMerge(JSON.parse(s.v), JSON.parse(lv)), mv = JSON.stringify(m);
            if (mv !== lv) { apply(k, mv); changed = true; }
            mod[k] = Math.max(s.at || 0, Date.now());
            return;
          } catch (e) {}
        }
        if (s && (s.at || 0) > lm) {
          if (lv !== s.v) { apply(k, s.v); changed = true; }
          mod[k] = s.at;
        }
      });
      apply(S_MOD, JSON.stringify(mod));
      if (convert(mod)) changed = true;
      mod = jget(S_MOD, {});
      KEYS.forEach(function (k) {
        var v = lsGet(k);
        if (v != null) out[k] = { v: v, at: mod[k] || 1 };
      });
      trim(out);
      var needPush = KEYS.some(function (k) {
        var s = server[k], o = out[k];
        return (o && (!s || s.v !== o.v)) || (!o && s);
      });
      if (changed) fire();
      if (needPush) return call('data_put', { profile: pid, data: out });
    }).catch(function (e) { console.warn('[sharky] sync:', e.message); })
      .then(function () { syncing = false; });
  }

  /* Combine two copies of the same kind of history. Lists: one entry per
     title (or per episode for the apps' continue list), newest wins, newest
     first. Maps: per key, newest wins, merging nested maps. */
  function stamp(x) { return (x && (x.at || x.lastWatched || x.updatedAt)) || 0; }
  function idOf(x) {
    if (!x || typeof x !== 'object') return JSON.stringify(x);
    return x.key || ((x.kind || x.media_type || 'movie') + ':' + x.id);
  }
  function wrapMerge(a, b) {
    if (!a || typeof a !== 'object') return b;
    if (!b || typeof b !== 'object') return a;
    if (a.y !== b.y) return (a.y || 0) > (b.y || 0) ? a : b;
    var out = { y: a.y, d: {} }, da = a.d || {}, db = b.d || {};
    Object.keys(da).concat(Object.keys(db)).forEach(function (dev) {
      var x = da[dev], z = db[dev];
      out.d[dev] = !x ? z : !z ? x : ((z.s || 0) > (x.s || 0) ? z : x);
    });
    return out;
  }

  function mergeVal(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
      var byId = {}, order = [];
      b.concat(a).forEach(function (x) {
        var id = idOf(x);
        if (!(id in byId)) { order.push(id); byId[id] = x; }
        else if (stamp(x) > stamp(byId[id])) byId[id] = x;
      });
      var out = order.map(function (id) { return byId[id]; });
      if (out.some(stamp)) out.sort(function (x, y) { return stamp(y) - stamp(x); });
      return out;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      if (stamp(a) || stamp(b)) return stamp(b) > stamp(a) ? b : a;
      var o = {};
      Object.keys(a).forEach(function (k) { o[k] = a[k]; });
      Object.keys(b).forEach(function (k) { o[k] = (k in o) ? mergeVal(o[k], b[k]) : b[k]; });
      return o;
    }
    return b != null ? b : a;
  }

  function trim(out) {
    var size = JSON.stringify(out).length;
    if (size <= MAX_BYTES) return;
    ['sharkytv_progress', 'sharky_movies_2_watched_eps'].forEach(function (k) {
      if (!out[k] || JSON.stringify(out).length <= MAX_BYTES) return;
      try {
        var obj = JSON.parse(out[k].v), keys = Object.keys(obj);
        keys.sort(function (a, b) { return ((obj[b] || {}).at || 0) - ((obj[a] || {}).at || 0); });
        var keep = {};
        keys.slice(0, Math.floor(keys.length / 3)).forEach(function (x) { keep[x] = obj[x]; });
        out[k].v = JSON.stringify(keep);
      } catch (e) { delete out[k]; }
    });
  }

  function imgPath(url) { return url ? String(url).replace(/^.*\/t\/p\/[^/]+/, '') : null; }
  var IMG = 'https://image.tmdb.org/t/p/';

  /* The website and the apps keep Continue Watching and My List in different
     shapes. Bring across anything the other side changed more recently. */
  function convert(mod) {
    var did = false, now = Date.now();
    function setK(k, v) {
      var s = JSON.stringify(v);
      if (lsGet(k) === s) return;
      apply(k, s); mod[k] = now; did = true;
    }

    // Continue watching: apps -> website
    var app = jget('sharkytv_continue', []), web = jget('sharky_movies_2_continue_watching', []);
    var webAt = mod['sharky_movies_2_continue_watching'] || 0;
    var appAt = mod['sharkytv_continue'] || 0;
    if (appAt > webAt && Array.isArray(app)) {
      var webOut = Array.isArray(web) ? web.slice() : [], tvp = jget('sharky_movies_2_tv_progress', {}), tvpDirty = false;
      // Removed (or finished) on the apps since the website last changed: drop it here too.
      var inApp = {};
      app.forEach(function (r) { inApp[(r.kind || 'movie') + ':' + r.id] = 1; });
      webOut = webOut.filter(function (x) { return inApp[(x.media_type || 'movie') + ':' + x.id]; });
      app.slice().reverse().forEach(function (r) {
        if ((r.at || 0) <= webAt) return;
        var kind = r.kind || 'movie';
        webOut = webOut.filter(function (x) { return !(String(x.id) === String(r.id) && x.media_type === kind); });
        webOut.unshift({ id: Number(r.id), media_type: kind, sharky_title: r.title || '', sharky_date: '',
          poster_path: imgPath(r.poster), backdrop_path: imgPath(r.backdrop), vote_average: 0,
          overview: '', genre_ids: [], lastWatched: r.at || now });
        if (kind === 'tv' && r.season) {
          var prev = tvp[r.id];
          if (!prev || (prev.updatedAt || 0) < (r.at || 0)) {
            tvp[r.id] = { season: r.season, episode: r.episode || 1, updatedAt: r.at || now };
            tvpDirty = true;
          }
        }
      });
      webOut.sort(function (a, b) { return (b.lastWatched || 0) - (a.lastWatched || 0); });
      setK('sharky_movies_2_continue_watching', webOut.slice(0, 20));
      if (tvpDirty) setK('sharky_movies_2_tv_progress', tvp);
    } else if (webAt > appAt && Array.isArray(web)) {
      // website -> apps
      var appOut = Array.isArray(app) ? app.slice() : [], tvp2 = jget('sharky_movies_2_tv_progress', {});
      // Removed on the website since the apps last changed: drop it there too.
      var inWeb = {};
      web.forEach(function (x) { inWeb[(x.media_type || 'movie') + ':' + x.id] = 1; });
      appOut = appOut.filter(function (r) { return inWeb[(r.kind || 'movie') + ':' + r.id]; });
      web.slice().reverse().forEach(function (x) {
        if ((x.lastWatched || 0) <= appAt) return;
        var kind = x.media_type || 'movie', p = tvp2[x.id] || {};
        var s = kind === 'tv' ? (Number(p.season) || 1) : 0, e = kind === 'tv' ? (Number(p.episode) || 1) : 0;
        var key = kind === 'tv' ? 'tv:' + x.id + ':' + s + ':' + e : 'movie:' + x.id;
        appOut = appOut.filter(function (r) { return !(String(r.id) === String(x.id) && (r.kind || 'movie') === kind); });
        appOut.unshift({ key: key, id: x.id, kind: kind, title: x.sharky_title || '',
          poster: x.poster_path ? IMG + 'w342' + x.poster_path : '',
          backdrop: x.backdrop_path ? IMG + 'w1280' + x.backdrop_path : '',
          season: s, episode: e, epName: '', pct: 1, t: 0, d: 0, at: x.lastWatched || now });
      });
      appOut.sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      setK('sharkytv_continue', appOut.slice(0, 30));
    }

    // My list: apps -> website, website -> apps
    var appL = jget('sharkytv_mylist', []), webL = jget('sharky_movies_2_my_list', []);
    var webLAt = mod['sharky_movies_2_my_list'] || 0, appLAt = mod['sharkytv_mylist'] || 0;
    if (appLAt > webLAt && Array.isArray(appL)) {
      var wl = Array.isArray(webL) ? webL.slice() : [];
      var appIds = {};
      appL.forEach(function (r) { appIds[(r.kind || 'movie') + ':' + r.id] = 1; });
      wl = wl.filter(function (x) { return appIds[(x.media_type || 'movie') + ':' + x.id]; });
      appL.forEach(function (r) {
        var kind = r.kind || 'movie';
        if (wl.some(function (x) { return String(x.id) === String(r.id) && x.media_type === kind; })) return;
        wl.unshift({ id: Number(r.id), media_type: kind, sharky_title: r.title || '',
          sharky_date: r.year ? String(r.year) + '-01-01' : '', poster_path: imgPath(r.poster),
          backdrop_path: imgPath(r.backdrop), vote_average: 0, overview: '', genre_ids: [] });
      });
      setK('sharky_movies_2_my_list', wl);
    } else if (webLAt > appLAt && Array.isArray(webL)) {
      var al = Array.isArray(appL) ? appL.slice() : [];
      var webIds = {};
      webL.forEach(function (x) { webIds[(x.media_type || 'movie') + ':' + x.id] = 1; });
      al = al.filter(function (r) { return webIds[(r.kind || 'movie') + ':' + r.id]; });
      webL.slice().reverse().forEach(function (x) {
        var kind = x.media_type || 'movie';
        if (al.some(function (r) { return String(r.id) === String(x.id) && (r.kind || 'movie') === kind; })) return;
        al.unshift({ id: x.id, kind: kind, title: x.sharky_title || '',
          poster: x.poster_path ? IMG + 'w342' + x.poster_path : '',
          backdrop: x.backdrop_path ? IMG + 'w1280' + x.backdrop_path : '',
          year: (x.sharky_date || '').slice(0, 4), at: webLAt });
      });
      setK('sharkytv_mylist', al);
    }
    if (did) apply(S_MOD, JSON.stringify(mod));
    return did;
  }

  function fire() {
    try { document.dispatchEvent(new CustomEvent('sharky:account-data', { detail: { profile: currentProfile() } })); } catch (e) {}
  }
  function fireChange() {
    try { document.dispatchEvent(new CustomEvent('sharky:account', { detail: { account: acct, profile: currentProfile() } })); } catch (e) {}
  }

  function signedOutRemotely() {
    if (!acct) return;
    acct = null; save(); clearLocal(); fire(); fireChange();
    if (opt.required) open('welcome');
  }

  /* ── Choosing a profile ──────────────────────────────────────────────── */
  function choose(pid) {
    mustPick = false;
    var prev = acct.pid;
    if (!prev) mergeOnce = KEYS.some(function (k) { var v = lsGet(k); return v && v !== '[]' && v !== '{}'; });
    if (prev && prev !== pid) clearLocal();       // never mix two profiles' history
    acct.pid = pid; save();
    var ap = afterPick; afterPick = null;
    close();
    fire(); fireChange();
    setTimeout(maybeAskDevices, 600);
    return sync().then(function () {
      fire();
      if (ap) { try { ap(); } catch (e) {} }      // finish what they were doing (e.g. add to My List)
    });
  }

  /* ── Account needed for this (website) ───────────────────────────────────
     SharkyAccount.gate('add this to My List', function () { ...do it... })
     Signed in with a profile: runs the action now and returns true.
     Otherwise shows "Create a free account to ..." and returns false; the
     action runs by itself once they've signed up / in and picked a profile. */
  function gate(reason, then) {
    if (acct && acct.pid && acct.verified !== false) { if (then) then(); return true; }
    afterPick = then || null;
    if (acct && acct.verified === false) { open('verify'); afterPick = then || null; return false; }
    if (acct) { open('profiles'); afterPick = then || null; return false; }
    open('gate', { reason: reason });
    afterPick = then || null;
    return false;
  }

  function signedIn(d) {
    var had = !!(acct && acct.pid);
    acct = { token: d.token, email: d.email, profiles: d.profiles || [], pid: null, max: d.max_profiles || 5,
             verified: d.verified !== false, devices: d.devices === undefined ? undefined : d.devices };
    save();
    fireChange();
    stopPairPoll();
    screen = ''; stack = [];                  // nothing to go "back" to once signed in
    if (!acct.verified) { if (!root) open('verify'); else show('verify'); return; }
    afterVerified();
  }

  function afterVerified() {
    screen = ''; stack = [];
    if (pending) { var p = pending; pending = null; p(); return; }
    show('profiles');
  }

  /* ── Email verification ──────────────────────────────────────────────── */
  /* While the "check your email" screen is up, keep asking the server, so
     tapping the link on a phone moves the TV (or this page) on by itself. */
  function startVerifyPoll() {
    stopVerifyPoll();
    vTimer = setInterval(function () {
      if (screen !== 'verify' || !root || !acct) { stopVerifyPoll(); return; }
      call('me', {}).then(function (d) { if (d.verified !== false) verifiedNow(d); }).catch(function () {});
    }, 4000);
  }
  function stopVerifyPoll() { clearInterval(vTimer); vTimer = null; }
  function verifiedNow(d) {
    stopVerifyPoll();
    if (!acct) return;
    acct.verified = true;
    if (d && d.profiles) acct.profiles = d.profiles;
    save(); fireChange();
    if (root && screen === 'verify') afterVerified();
  }

  /* ── UI ──────────────────────────────────────────────────────────────── */
  function css() {
    if (document.getElementById('sa-css')) return;
    var st = document.createElement('style');
    st.id = 'sa-css';
    st.textContent =
      '#sa-root{position:fixed;top:0;right:0;bottom:0;left:0;z-index:2147483600;background:radial-gradient(circle at 50% 0%,#1c1424,#07070b 70%);' +
      'color:#fff;font-family:Outfit,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;overflow:auto;' +
      '-webkit-tap-highlight-color:transparent}' +
      '#sa-root.sa-modal{background:rgba(4,4,8,.86);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}' +
      '#sa-root *{box-sizing:border-box}' +
      '.sa-devs{margin:4px 0 12px;text-align:left}.sa-devq{font-size:.95rem;color:#ccc;margin:6px 0 8px}' +
      '.sa-dev{display:inline-block;margin:0 6px 8px 0;padding:10px 14px;border-radius:999px;border:2px solid #333;background:#16161f;' +
      'color:#ddd;font:inherit;font-size:.95rem;cursor:pointer}' +
      '.sa-dev.sa-sel{border-color:#e50914;background:#2a0d10;color:#fff}.sa-dev.sa-sel:before{content:"\\2713  "}' +
      '.sa-box{width:min(460px,calc(100vw - 32px));padding:28px 24px;margin:auto;position:relative}' +
      '.sa-wide{width:min(980px,calc(100vw - 32px))}' +
      '.sa-logo{font-weight:900;font-size:1.6rem;color:#e50914;letter-spacing:-.5px;text-align:center;margin-bottom:6px}' +
      '.sa-h{font-size:1.7rem;font-weight:800;text-align:center;margin:6px 0 18px}' +
      '.sa-p{color:#a6a6b8;text-align:center;font-size:.95rem;line-height:1.45;margin:0 0 16px}' +
      '.sa-in{width:100%;display:block;margin:0 0 12px;padding:14px 16px;border-radius:10px;border:2px solid #2c2c3c;' +
      'background:#14141e;color:#fff;font-size:1rem;font-family:inherit;outline:none}' +
      '.sa-in:focus,.sa-in.sa-on{border-color:#e50914}' +
      '.sa-btn{width:100%;display:block;margin:0 0 10px;padding:14px;border-radius:10px;border:2px solid transparent;' +
      'background:#2a2a38;color:#fff;font-size:1rem;font-weight:800;font-family:inherit;cursor:pointer}' +
      '.sa-btn.sa-pri{background:#e50914}' +
      '.sa-link{background:none;border:2px solid transparent;color:#a6a6b8;font-family:inherit;font-size:.92rem;cursor:pointer;' +
      'padding:8px;display:block;margin:4px auto;border-radius:8px}' +
      '.sa-err{color:#ff6b6b;text-align:center;font-size:.92rem;min-height:1.2em;margin:4px 0 10px}' +
      '.sa-ok{color:#4ade80}' +
      '.sa-x{position:absolute;top:6px;right:6px;background:none;border:2px solid transparent;color:#aaa;font-size:1.6rem;cursor:pointer;border-radius:8px;padding:2px 10px}' +
      '.sa-av{display:-webkit-flex;display:flex;align-items:center;justify-content:center;width:100%;height:112px;border-radius:12px;font-size:2.4rem;line-height:1}' +
      '.sa-av-big{font-size:3.4rem}' +
      '.sa-profs{display:flex;flex-wrap:wrap;justify-content:center;margin:10px 0 24px}' +
      '.sa-prof{width:130px;margin:0 11px 18px;background:none;border:3px solid transparent;border-radius:16px;padding:6px;color:#ddd;cursor:pointer;font-family:inherit;text-align:center}' +
      '.sa-prof .sa-name{display:block;margin-top:8px;font-size:1rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.sa-prof:hover,.sa-prof:focus{color:#fff}' +
      '.sa-add .sa-av{background:#1d1d29;border:2px dashed #444;font-size:3rem;color:#888}' +
      '.sa-editing .sa-prof .sa-av{opacity:.55}' +
      '.sa-editing .sa-prof .sa-av::after{content:"\\270E";position:absolute;font-size:1.6rem}' +
      '.sa-prof .sa-av{position:relative}' +
      '.sa-avs{display:flex;flex-wrap:wrap;margin:6px -5px 16px}' +
      '.sa-avpick{width:16.66%;margin:0;background:none;border:3px solid transparent;border-radius:14px;padding:3px;cursor:pointer}' +
      '.sa-avpick.sa-sel{border-color:#fff}' +
      '.sa-avpick .sa-av{font-size:1.7rem;height:52px}' +
      '.sa-two{display:flex;align-items:center;flex-wrap:wrap;justify-content:center}.sa-two>*{margin:0 17px 16px}' +
      '.sa-qr{background:#fff;border-radius:14px;padding:14px;width:250px;height:250px;display:flex;align-items:center;justify-content:center}' +
      '.sa-qr img,.sa-qr svg{width:100%;height:100%;image-rendering:pixelated}' +
      '.sa-code{font-size:2rem;font-weight:900;letter-spacing:6px;text-align:center;margin:10px 0 2px;color:#fff}' +
      '.sa-col{flex:1 1 320px;max-width:420px}' +
      '.sa-kb{margin:6px 0 12px}' +
      '.sa-kr{display:flex;margin:0 -3px 6px;justify-content:center}' +
      '.sa-k{flex:1 1 0;min-width:0;margin:0 3px;padding:11px 0;border-radius:8px;border:2px solid transparent;background:#23232f;color:#fff;font-size:1.05rem;font-weight:700;font-family:inherit}' +
      '.sa-k.sa-kw{flex:2 1 0;font-size:.85rem}' +
      '.sa-k.sa-kon{background:#e50914}' +
      '#sa-root .sa-f.sa-focus{border-color:#fff!important;box-shadow:0 0 0 3px rgba(229,9,20,.75);transform:scale(1.03)}' +
      '.sa-prof.sa-focus{transform:scale(1.08)!important}' +
      '.sa-menu{position:fixed;z-index:2147483500;background:#14141e;border:1px solid #2c2c3c;border-radius:12px;padding:6px;' +
      'min-width:220px;box-shadow:0 16px 40px rgba(0,0,0,.7);font-family:Outfit,system-ui,sans-serif}' +
      '.sa-menu button{display:flex;align-items:center;width:100%;background:none;border:0;color:#eee;padding:10px 12px;' +
      'border-radius:8px;cursor:pointer;font-family:inherit;font-size:.95rem;text-align:left}' +
      '.sa-menu button:hover{background:#23232f}' +
      '.sa-menu .sa-av{width:30px;height:30px;margin-right:10px;font-size:1.1rem;border-radius:7px}' +
      '.sa-menu .sa-email{color:#888;font-size:.8rem;padding:6px 12px 8px;border-bottom:1px solid #26263a;margin-bottom:4px}' +
      (isTV() ? '.sa-box{width:min(620px,calc(100vw - 64px))}.sa-wide{width:min(1100px,calc(100vw - 64px))}.sa-h{font-size:2.2rem}' +
                '.sa-in,.sa-btn{font-size:1.25rem;padding:16px 18px}.sa-prof{width:170px}.sa-prof .sa-av{height:152px}.sa-prof .sa-name{font-size:1.25rem}' : '');
    document.head.appendChild(st);
  }

  function open(name, data) {
    css();
    if (!root) {
      root = document.createElement('div');
      root.id = 'sa-root';
      document.body.appendChild(root);
      root.addEventListener('click', onClick);
      root.addEventListener('submit', function (e) {
        e.preventDefault();
        var b = e.target.querySelector('[type=submit][data-a]');
        if (b && !b.disabled) act(b.getAttribute('data-a'));
      });
    }
    root.className = (!opt.required && opt.mode === 'web' && name !== 'link') ? 'sa-modal' : '';
    stack = [];
    show(name, data);
  }

  function close() {
    afterPick = null;
    stopPairPoll(); stopVerifyPoll();
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null; screen = ''; stack = []; kbTarget = null; focusEl = null;
    try { document.dispatchEvent(new CustomEvent('sharky:account-closed')); } catch (e) {}
  }

  function onLinkPage() { return opt.mode === 'web' && /\/link(\.html)?$/.test(location.pathname); }

  function canClose() {
    if (screen === 'link' || screen === 'linked') return !onLinkPage();
    if (screen === 'verify') return !opt.required && !onLinkPage();
    if (screen === 'devices') return !opt.required;
    if (mustPick) return false;
    if (!opt.required) return true;
    return !!(acct && acct.pid);
  }

  function devPicker() {
    var h = '<div class="sa-devs"><div class="sa-devq">What do you mainly watch Sharky on? <span style="color:#888">(tick all that apply)</span></div>';
    for (var i = 0; i < DEVICES.length; i++) {
      h += '<button type="button" class="sa-dev sa-f" data-a="dev:' + DEVICES[i][0] + '">' + DEVICES[i][1] + '</button>';
    }
    return h + '</div>';
  }
  function devPicked() {
    var out = [];
    [].forEach.call(root ? root.querySelectorAll('.sa-dev.sa-sel') : [], function (b) { out.push(b.getAttribute('data-a').slice(4)); });
    return out;
  }
  /* Signed in, profile chosen, nothing else on screen, never answered: ask once. */
  function maybeAskDevices() {
    if (devAsked || root || !acct || !acct.pid || acct.verified === false || acct.devices !== null) return;
    devAsked = true;
    open('devices');
  }

  function show(name, data) {
    if (screen && screen !== name) stack.push(screen);
    screen = name;
    kbTarget = null;
    var h = '', x = canClose() ? '<button class="sa-x sa-f" data-a="close" aria-label="Close">&times;</button>' : '';
    var tv = isTV();
    var field = function (id, type, ph, val) {
      return '<input class="sa-in sa-f" id="sa-' + id + '" type="' + type + '" placeholder="' + ph + '" autocomplete="' +
        (type === 'password' ? ((id === 'pw' && name === 'signin') || id === 'cur' ? 'current-password' : 'new-password') : (id === 'email' ? 'email' : 'off')) +
        '"' + (val ? ' value="' + esc(val) + '"' : '') + (type === 'password' ? ' data-pw="1"' : '') +
        (tv ? ' readonly inputmode="none" data-kb="1"' : '') + '>';
    };
    var lastEmail = (acct && acct.email) || lsGet('sharky_acct_last') || '';

    if (name === 'welcome') {
      if (tv) {
        h = '<div class="sa-box sa-wide"><div class="sa-logo">SHARKY</div><div class="sa-h">Sign in to start watching</div>' +
          '<div class="sa-two"><div style="text-align:center"><div class="sa-qr" id="sa-qr"><span style="color:#333">Loading…</span></div>' +
          '<div class="sa-code" id="sa-code">—</div>' +
          '<div class="sa-p" style="margin:0">Scan with your phone, or go to<br><b style="color:#fff">' +
          esc((opt.linkUrl || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\.html$/, '')) + '</b> and enter the code</div></div>' +
          '<div class="sa-col"><p class="sa-p">Easiest: scan the code and sign up on your phone. This screen moves on by itself as soon as you’re in.</p>' +
          '<button class="sa-btn sa-pri sa-f" data-a="go:signin">Sign in on the TV</button>' +
          '<button class="sa-btn sa-f" data-a="go:signup">Create an account on the TV</button>' +
          '<div class="sa-err" id="sa-err"></div></div></div></div>';
      } else {
        h = '<div class="sa-box">' + x + '<div class="sa-logo">SHARKY</div><div class="sa-h">' +
          (opt.required ? 'Sign in to start watching' : 'Your Sharky account') + '</div>' +
          '<p class="sa-p">' + (opt.required ? 'Free account - it keeps your history and list on every device.'
            : 'Optional and free. Keeps Continue Watching and My List in step across your phone, PC and TV, with up to 5 profiles.') + '</p>' +
          '<button class="sa-btn sa-pri sa-f" data-a="go:signin">Sign in</button>' +
          '<button class="sa-btn sa-f" data-a="go:signup">Create an account</button></div>';
      }
    } else if (name === 'gate') {
      h = '<div class="sa-box">' + x + '<div class="sa-logo">SHARKY</div>' +
        '<div class="sa-h">Create a free account to ' + esc((data && data.reason) || 'do that') + '</div>' +
        '<p class="sa-p"><b style="color:#fff">It\'s 100% free</b> - no card, no catch, takes 20 seconds.<br>' +
        'Your list, Continue Watching and downloads stay in step on your phone, PC and TV, with up to 5 profiles.</p>' +
        '<button class="sa-btn sa-pri sa-f" data-a="go:signup">Create a free account</button>' +
        '<button class="sa-btn sa-f" data-a="go:signin">I already have one - sign in</button></div>';
    } else if (name === 'signin') {
      h = '<div class="sa-box">' + x + '<div class="sa-logo">SHARKY</div><div class="sa-h">Sign in</div><form>' +
        field('email', 'email', 'Email', lastEmail) + field('pw', 'password', 'Password') +
        '<div class="sa-err" id="sa-err"></div>' + (tv ? '<div class="sa-kb" id="sa-kb"></div>' : '') +
        '<button class="sa-btn sa-pri sa-f" data-a="signin" type="submit">Sign in</button></form>' +
        '<button class="sa-link sa-f" data-a="go:forgot">Forgot password?</button>' +
        '<button class="sa-link sa-f" data-a="go:signup">New here? Create an account</button>' +
        (stack.length ? '<button class="sa-link sa-f" data-a="back">← Back</button>' : '') + '</div>';
    } else if (name === 'signup') {
      h = '<div class="sa-box">' + x + '<div class="sa-logo">SHARKY</div><div class="sa-h">Create a free account</div>' +
        '<p class="sa-p" style="margin-bottom:12px">It\'s free - always. No card needed.</p><form>' +
        field('email', 'email', 'Email') + field('pw', 'password', 'Password (6+ characters)') +
        field('pw2', 'password', 'Password again') +
        (tv ? '<div class="sa-kb" id="sa-kb"></div>' : '') + devPicker() +
        '<div class="sa-err" id="sa-err"></div>' +
        '<button class="sa-btn sa-pri sa-f" data-a="signup" type="submit">Create account</button></form>' +
        '<button class="sa-link sa-f" data-a="go:signin">Already have one? Sign in</button>' +
        (stack.length ? '<button class="sa-link sa-f" data-a="back">← Back</button>' : '') + '</div>';
    } else if (name === 'forgot') {
      h = '<div class="sa-box">' + x + '<div class="sa-logo">SHARKY</div><div class="sa-h">Reset password</div>' +
        '<p class="sa-p">We’ll email you a 6-digit code.</p><form>' + field('email', 'email', 'Email', lastEmail) +
        '<div class="sa-err" id="sa-err"></div>' + (tv ? '<div class="sa-kb" id="sa-kb"></div>' : '') +
        '<button class="sa-btn sa-pri sa-f" data-a="reset1" type="submit">Send code</button></form>' +
        '<button class="sa-link sa-f" data-a="back">← Back</button></div>';
    } else if (name === 'forgot2') {
      h = '<div class="sa-box">' + x + '<div class="sa-logo">SHARKY</div><div class="sa-h">Check your email</div>' +
        '<p class="sa-p">Enter the code sent to ' + esc(data && data.email) + ' and choose a new password.</p><form>' +
        '<input type="hidden" id="sa-remail" value="' + esc(data && data.email) + '">' +
        field('code', 'text', '6-digit code') + field('pw', 'password', 'New password (6+ characters)') +
        '<div class="sa-err" id="sa-err"></div>' + (tv ? '<div class="sa-kb" id="sa-kb"></div>' : '') +
        '<button class="sa-btn sa-pri sa-f" data-a="reset2" type="submit">Set new password</button></form>' +
        '<button class="sa-link sa-f" data-a="back">← Back</button></div>';
    } else if (name === 'profiles' || name === 'manage') {
      var edit = name === 'manage', ps = (acct && acct.profiles) || [];
      h = '<div class="sa-box sa-wide' + (edit ? ' sa-editing' : '') + '">' + x +
        '<div class="sa-h">' + (edit ? 'Manage profiles' : 'Who’s watching?') + '</div><div class="sa-profs">';
      ps.forEach(function (p) {
        h += '<button class="sa-prof sa-f" data-a="' + (edit ? 'edit:' : 'pick:') + p.id + '">' + avatarHtml(p.avatar, true) +
          '<span class="sa-name">' + esc(p.name) + '</span></button>';
      });
      if (ps.length < ((acct && acct.max) || 5)) {
        h += '<button class="sa-prof sa-add sa-f" data-a="new"><span class="sa-av sa-av-big">+</span><span class="sa-name">Add profile</span></button>';
      }
      h += '</div><div style="max-width:320px;margin:0 auto">' +
        (edit ? '<button class="sa-btn sa-pri sa-f" data-a="go:profiles">Done</button>'
              : '<button class="sa-btn sa-f" data-a="go:manage">Manage profiles</button>') +
        '<button class="sa-link sa-f" data-a="go:password">Change password</button>' +
        '<button class="sa-link sa-f" data-a="signout">Sign out' + (acct ? ' (' + esc(acct.email) + ')' : '') + '</button></div></div>';
    } else if (name === 'password') {
      h = '<div class="sa-box">' + x + '<div class="sa-logo">SHARKY</div><div class="sa-h">Change password</div><form>' +
        field('cur', 'password', 'Current password') + field('pw', 'password', 'New password (6+ characters)') +
        field('pw2', 'password', 'New password again') +
        '<div class="sa-err" id="sa-err"></div>' + (tv ? '<div class="sa-kb" id="sa-kb"></div>' : '') +
        '<button class="sa-btn sa-pri sa-f" data-a="chpw" type="submit">Change password</button></form>' +
        '<button class="sa-link sa-f" data-a="go:forgot">Forgotten it? Reset by email</button>' +
        '<button class="sa-link sa-f" data-a="back">\u2190 Back</button></div>';
    } else if (name === 'edit') {
      var p = data || { id: 0, name: '', avatar: Math.floor(Math.random() * AVATARS.length) };
      h = '<div class="sa-box">' + x + '<div class="sa-h">' + (p.id ? 'Edit profile' : 'Add a profile') + '</div>' +
        '<input type="hidden" id="sa-pid" value="' + p.id + '"><input type="hidden" id="sa-avv" value="' + p.avatar + '"><form>' +
        field('pname', 'text', 'Name', p.name) + (tv ? '<div class="sa-kb" id="sa-kb"></div>' : '') +
        '<div class="sa-p" style="margin:4px 0 6px;text-align:left">Pick an icon</div><div class="sa-avs">';
      AVATARS.forEach(function (a, i) {
        h += '<button type="button" class="sa-avpick sa-f' + (i === p.avatar ? ' sa-sel' : '') + '" data-a="av:' + i + '">' + avatarHtml(i) + '</button>';
      });
      h += '</div><div class="sa-err" id="sa-err"></div>' +
        '<button class="sa-btn sa-pri sa-f" data-a="psave" type="submit">Save</button></form>' +
        (p.id && acct && acct.profiles.length > 1 ? '<button class="sa-btn sa-f" data-a="pdel">Delete profile</button>' : '') +
        '<button class="sa-link sa-f" data-a="back">Cancel</button></div>';
    } else if (name === 'devices') {
      h = '<div class="sa-box">' + x + '<div class="sa-logo">SHARKY</div><div class="sa-h">One quick question</div>' +
        '<p class="sa-p">It helps us know what to work on next.</p>' + devPicker() +
        '<div class="sa-err" id="sa-err"></div>' +
        '<button class="sa-btn sa-pri sa-f" data-a="devsave">Save</button></div>';
    } else if (name === 'verify') {
      h = '<div class="sa-box">' + x + '<div class="sa-logo">SHARKY</div><div class="sa-h">Check your email</div>' +
        '<p class="sa-p">We sent a code to <b style="color:#fff">' + esc(acct && acct.email) + '</b>.<br>' +
        (tv ? 'Tap the link in the email on your phone - this screen moves on by itself - or type the code here.'
            : 'Tap the link in the email, or type the code here.') + '</p><form>' +
        field('vcode', 'text', '6-digit code') +
        '<div class="sa-err" id="sa-err"></div>' + (tv ? '<div class="sa-kb" id="sa-kb"></div>' : '') +
        '<button class="sa-btn sa-pri sa-f" data-a="vok" type="submit">Verify</button></form>' +
        '<button class="sa-btn sa-f" data-a="vsend">Resend email</button>' +
        '<p class="sa-p" style="font-size:.85rem;margin:10px 0 0">Not there? Check your spam or junk folder.</p>' +
        '<button class="sa-link sa-f" data-a="signout">Wrong email? Sign out</button></div>';
    } else if (name === 'link') {
      var code = (data && data.code) || '';
      if (!acct) {
        h = '<div class="sa-box"><div class="sa-logo">SHARKY</div><div class="sa-h">Sign in your TV</div>' +
          '<p class="sa-p">First sign in, or create a free account. Your TV will then sign in by itself.</p>' +
          '<button class="sa-btn sa-pri sa-f" data-a="linkgo:signin">Sign in</button>' +
          '<button class="sa-btn sa-f" data-a="linkgo:signup">Create an account</button></div>';
      } else {
        h = '<div class="sa-box"><div class="sa-logo">SHARKY</div><div class="sa-h">Sign in your TV</div>' +
          '<p class="sa-p">Signed in as <b style="color:#fff">' + esc(acct.email) + '</b></p>' +
          '<form><input class="sa-in sa-f" id="sa-lcode" placeholder="Code on the TV" value="' + esc(code) +
          '" autocapitalize="characters" style="text-align:center;font-size:1.5rem;letter-spacing:5px;font-weight:800">' +
          '<p class="sa-p" style="margin:-4px 0 8px;font-size:.85rem">Check it matches the code on your TV right now.</p>' +
          '<div class="sa-err" id="sa-err"></div>' +
          '<button class="sa-btn sa-pri sa-f" data-a="linkok" type="submit">Sign in the TV</button></form>' +
          '<button class="sa-link sa-f" data-a="linkswitch">Use a different account</button></div>';
      }
    } else if (name === 'linked') {
      h = '<div class="sa-box" style="text-align:center"><div class="sa-logo">SHARKY</div><div class="sa-h">✅ Your TV is signed in</div>' +
        '<p class="sa-p">Pick your profile on the TV and you’re away. You can close this page.</p>' +
        (onLinkPage() ? '<a class="sa-btn sa-f" href="/" style="text-decoration:none">Go to Sharky</a>'
                      : '<button class="sa-btn sa-f" data-a="close">Done</button>') + '</div>';
    }
    root.innerHTML = h;
    if (tv && $('#sa-kb')) buildKb();
    if (name === 'welcome' && tv) startPair();
    if (name === 'verify') {
      var vc = $('#sa-vcode');
      if (vc) { vc.setAttribute('maxlength', '6'); vc.style.textAlign = 'center'; vc.style.letterSpacing = '6px'; vc.style.fontWeight = '800';
                if (!tv) { vc.setAttribute('inputmode', 'numeric'); vc.setAttribute('autocomplete', 'one-time-code'); } }
      startVerifyPoll();
    } else stopVerifyPoll();
    var first = root.querySelector('.sa-prof.sa-f') || root.querySelector('input.sa-f:not([type=hidden])') || root.querySelector('.sa-pri') || root.querySelector('.sa-f');
    if (name === 'edit' && $('#sa-pname') && !tv) first = $('#sa-pname');
    if (first) focus(first, !tv && first.tagName === 'INPUT');
    if (tv && $('#sa-kb') && first && first.tagName === 'INPUT') kbTarget = first, mark();
  }

  function err(msg, ok) {
    var e = $('#sa-err');
    if (e) { e.textContent = msg || ''; e.className = 'sa-err' + (ok ? ' sa-ok' : ''); }
  }
  function busy(on) {
    [].forEach.call(root ? root.querySelectorAll('.sa-btn') : [], function (b) { b.disabled = !!on; b.style.opacity = on ? '.6' : ''; });
  }
  function val(id) { var el = $('#sa-' + id); return el ? el.value : ''; }

  function act(a) {
    var p = a.split(':'), cmd = p[0], arg = p.slice(1).join(':');
    if (cmd === 'close') { if (canClose()) close(); return; }
    if (cmd === 'back') { back(); return; }
    if (cmd === 'go') { show(arg); return; }
    if (cmd === 'linkgo') {
      var code = lsGet('sharky_link_code') || '';
      pending = function () { show('link', { code: code }); };
      show(arg); return;
    }
    if (cmd === 'linkswitch') {
      call('logout', {}).catch(function () {});
      acct = null; save(); clearLocal(); fireChange();
      show('link'); return;
    }
    if (cmd === 'signin') {
      err(''); busy(true);
      var em = val('email').trim();
      lsSet('sharky_acct_last', em);
      call('login', { email: em, password: val('pw') }).then(signedIn)
        .catch(function (e) { err(e.message); }).then(function () { busy(false); });
      return;
    }
    if (cmd === 'signup') {
      err('');
      if (val('pw') !== val('pw2')) { err('The two passwords don’t match'); return; }
      var devs = devPicked();
      if (!devs.length) { err('Tick at least one thing you watch Sharky on'); return; }
      busy(true);
      var em2 = val('email').trim();
      lsSet('sharky_acct_last', em2);
      call('signup', { email: em2, password: val('pw'), devices: devs }).then(signedIn)
        .catch(function (e) { err(e.message); }).then(function () { busy(false); });
      return;
    }
    if (cmd === 'dev') {
      var db = root.querySelector('[data-a="dev:' + arg + '"]');
      if (db) db.classList.toggle('sa-sel');
      return;
    }
    if (cmd === 'devsave') {
      var picks = devPicked();
      if (!picks.length) { err('Tick at least one'); return; }
      err(''); busy(true);
      call('set_devices', { devices: picks }).then(function (d) {
        if (acct) { acct.devices = d.devices || picks; save(); }
        close();
      }).catch(function (e) { err(e.message); }).then(function () { busy(false); });
      return;
    }
    if (cmd === 'vok') {
      err(''); busy(true);
      call('verify_confirm', { code: val('vcode') }).then(verifiedNow)
        .catch(function (e) { err(e.message); }).then(function () { busy(false); });
      return;
    }
    if (cmd === 'vsend') {
      err(''); busy(true);
      call('verify_send', {}).then(function (d) {
        if (d.verified) verifiedNow(d); else err(d.message || 'Sent', true);
      }).catch(function (e) { err(e.message); }).then(function () { busy(false); });
      return;
    }
    if (cmd === 'reset1') {
      err(''); busy(true);
      var em3 = val('email').trim();
      call('reset_request', { email: em3 }).then(function () { show('forgot2', { email: em3 }); })
        .catch(function (e) { err(e.message); }).then(function () { busy(false); });
      return;
    }
    if (cmd === 'reset2') {
      err(''); busy(true);
      call('reset_confirm', { email: val('remail'), code: val('code'), password: val('pw') }).then(signedIn)
        .catch(function (e) { err(e.message); }).then(function () { busy(false); });
      return;
    }
    if (cmd === 'chpw') {
      err('');
      if (val('pw') !== val('pw2')) { err('The two new passwords don\u2019t match'); return; }
      busy(true);
      call('change_password', { current: val('cur'), password: val('pw') }).then(function () {
        err('Password changed \u2713', true);
        setTimeout(function () { if (screen === 'password') back(); }, 1200);
      }).catch(function (e) { err(e.message); }).then(function () { busy(false); });
      return;
    }
    if (cmd === 'pick') { choose(Number(arg)); return; }
    if (cmd === 'new') { show('edit', null); return; }
    if (cmd === 'edit') {
      var pr = null;
      acct.profiles.forEach(function (x) { if (x.id === Number(arg)) pr = x; });
      show('edit', pr); return;
    }
    if (cmd === 'av') {
      $('#sa-avv').value = arg;
      [].forEach.call(root.querySelectorAll('.sa-avpick'), function (b) { b.classList.toggle('sa-sel', b.getAttribute('data-a') === a); });
      return;
    }
    if (cmd === 'psave') {
      err(''); busy(true);
      var id = Number(val('pid')), body = { name: val('pname'), avatar: Number(val('avv')) };
      if (id) body.id = id;
      call(id ? 'profile_edit' : 'profile_add', body).then(function (d) {
        acct.profiles = d.profiles; save(); fireChange();
        var from = stack[stack.length - 1] || 'profiles';
        screen = ''; stack = []; show(from === 'manage' ? 'manage' : 'profiles');
      }).catch(function (e) { err(e.message); }).then(function () { busy(false); });
      return;
    }
    if (cmd === 'pdel') {
      if (isTV() || !w.confirm || w.confirm('Delete this profile and its history?')) {
        var did = Number(val('pid'));
        call('profile_delete', { id: did }).then(function (d) {
          acct.profiles = d.profiles;
          if (acct.pid === did) { acct.pid = null; clearLocal(); fire(); }
          save(); fireChange(); screen = ''; stack = []; show('manage');
        }).catch(function (e) { err(e.message); });
      }
      return;
    }
    if (cmd === 'signout') { signOut(); return; }
    if (cmd === 'linkok') {
      err(''); busy(true);
      call('pair_approve', { code: val('lcode').trim() }).then(function () {
        lsDel('sharky_link_code'); screen = ''; show('linked');
      }).catch(function (e) {
        /* An old code (the TV made a new one): clear it so the right one
           can be typed straight in. */
        lsDel('sharky_link_code');
        var f = $('#sa-lcode');
        if (f && /isn.t on a TV|expired/i.test(e.message)) { f.value = ''; try { f.focus(); } catch (x) {} }
        err(e.message);
      }).then(function () { busy(false); });
      return;
    }
  }

  function back() {
    var prev = stack.pop();
    if (prev) { screen = ''; show(prev); return; }
    if (canClose()) close();
  }

  function onClick(e) {
    var t = e.target.closest ? e.target.closest('[data-a],[data-k],.sa-in') : null;
    if (!t || !root.contains(t)) return;
    if (t.getAttribute('data-k') != null) { e.preventDefault(); key(t.getAttribute('data-k')); return; }
    if (t.classList.contains('sa-in')) { if (isTV()) { kbTarget = t; mark(); } return; }
    if (t.tagName === 'BUTTON' || t.tagName === 'A') { if (t.tagName === 'A') return; e.preventDefault(); }
    act(t.getAttribute('data-a'));
  }

  /* ── Remote keyboard (TV) ────────────────────────────────────────────── */
  var KB_ROWS = ['1234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', '@._-!#'];
  function buildKb() {
    var kb = $('#sa-kb'), h = '';
    KB_ROWS.forEach(function (r) {
      h += '<div class="sa-kr">';
      r.split('').forEach(function (c) {
        var ch = kbShift ? c.toUpperCase() : c;
        h += '<button type="button" class="sa-k sa-f" data-k="' + esc(ch) + '">' + esc(ch) + '</button>';
      });
      h += '</div>';
    });
    h += '<div class="sa-kr"><button type="button" class="sa-k sa-kw sa-f' + (kbShift ? ' sa-kon' : '') + '" data-k="SHIFT">⇧ ABC</button>' +
      '<button type="button" class="sa-k sa-kw sa-f" data-k="@gmail.com">@gmail.com</button>' +
      '<button type="button" class="sa-k sa-kw sa-f" data-k=".co.uk">.co.uk</button>' +
      '<button type="button" class="sa-k sa-kw sa-f" data-k=".com">.com</button>' +
      '<button type="button" class="sa-k sa-kw sa-f" data-k="DEL">⌫</button>' +
      '<button type="button" class="sa-k sa-kw sa-f" data-k="SHOW">👁 Show</button></div>';
    kb.innerHTML = h;
  }
  function mark() {
    [].forEach.call(root.querySelectorAll('.sa-in'), function (i) { i.classList.toggle('sa-on', i === kbTarget); });
  }
  function key(k) {
    if (k === 'SHIFT') {
      kbShift = !kbShift;
      var fk = focusEl && focusEl.getAttribute('data-k');
      buildKb();
      if (fk) { var again = root.querySelector('[data-k="SHIFT"]'); if (again) focus(again); }
      return;
    }
    if (k === 'SHOW') {
      [].forEach.call(root.querySelectorAll('.sa-in'), function (i) {
        if (i.getAttribute('data-pw')) i.type = i.type === 'password' ? 'text' : 'password';
      });
      return;
    }
    if (!kbTarget) kbTarget = root.querySelector('.sa-in'), mark();
    if (!kbTarget) return;
    if (k === 'DEL') kbTarget.value = kbTarget.value.slice(0, -1);
    else kbTarget.value += k;
  }

  /* ── QR sign-in (TV) ─────────────────────────────────────────────────── */
  /* Keep the same code if the app is closed and reopened, so a phone that
     already scanned it still matches. Only ask for a new one once it has
     really expired. */
  function getPairCode() {
    var saved = jget('sharky_pair', null);
    if (saved && saved.code && Date.now() - (saved.at || 0) < 13 * 60 * 1000) {
      return call('pair_poll', { code: saved.code }).then(function (r) {
        if (r.state === 'waiting') return { code: saved.code, expires_in: r.expires_in || 600, at: saved.at };
        if (r.state === 'done') return { done: r };
        return fresh();
      }, fresh);
    }
    return fresh();
    function fresh() {
      return call('pair_start', {}).then(function (d) {
        jset('sharky_pair', { code: d.code, at: Date.now() });
        return d;
      });
    }
  }

  function startPair() {
    stopPairPoll();
    getPairCode().then(function (d) {
      if (d.done) { lsDel('sharky_pair'); signedIn(d.done); return; }
      if (screen !== 'welcome' || !root) return;
      var url = (opt.linkUrl || '') + '?c=' + d.code;
      var codeEl = $('#sa-code'), qrEl = $('#sa-qr');
      if (codeEl) codeEl.textContent = d.code;
      if (qrEl && w.qrcode) {
        try {
          var q = w.qrcode(0, 'M'); q.addData(url); q.make();
          qrEl.innerHTML = q.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
        } catch (e) { qrEl.textContent = url; }
      } else if (qrEl) qrEl.innerHTML = '<span style="color:#333;font-size:.9rem;word-break:break-all;padding:8px">' + esc(url) + '</span>';
      var started = Date.now();
      pollTimer = setInterval(function () {
        if (screen !== 'welcome' || !root) { stopPairPoll(); return; }
        if (Date.now() - started > (d.expires_in || 600) * 1000 - 5000) { lsDel('sharky_pair'); startPair(); return; }
        call('pair_poll', { code: d.code }).then(function (r) {
          if (r.state === 'done') { lsDel('sharky_pair'); signedIn(r); }
          else if (r.state === 'expired') { lsDel('sharky_pair'); startPair(); }
        }).catch(function () {});
      }, 2500);
    }).catch(function (e) { err(e.message + ' - retrying'); setTimeout(function () { if (screen === 'welcome') startPair(); }, 8000); });
  }
  function stopPairPoll() { clearInterval(pollTimer); pollTimer = null; }

  /* ── D-pad navigation (TV), also arrow keys elsewhere ────────────────── */
  function focusables() {
    return [].filter.call(root.querySelectorAll('.sa-f'), function (el) {
      return el.offsetParent !== null && !el.disabled && el.type !== 'hidden';
    });
  }
  function focus(el, real) {
    if (!el) return;
    if (focusEl) focusEl.classList.remove('sa-focus');
    focusEl = el;
    if (isTV() || !real) el.classList.add('sa-focus');
    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) {} }
    try { el.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  }
  function move(dir) {
    var list = focusables();
    if (!list.length) return;
    if (!focusEl || list.indexOf(focusEl) < 0) { focus(list[0]); return; }
    var a = focusEl.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    var best = null, bs = Infinity;
    list.forEach(function (el) {
      if (el === focusEl) return;
      var b = el.getBoundingClientRect(), bx = b.left + b.width / 2, by = b.top + b.height / 2;
      var dx = bx - ax, dy = by - ay, main, side;
      if (dir === 'left') { if (b.right > a.left + 2) return; main = -dx; side = Math.abs(dy); }
      else if (dir === 'right') { if (b.left < a.right - 2) return; main = dx; side = Math.abs(dy); }
      else if (dir === 'up') { if (b.bottom > a.top + 2) return; main = -dy; side = Math.abs(dx); }
      else { if (b.top < a.bottom - 2) return; main = dy; side = Math.abs(dx); }
      var sc = main + side * 2.2;
      if (sc < bs) { bs = sc; best = el; }
    });
    if (best) focus(best);
  }

  var KEYMAP = { 37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'ok', 23: 'ok', 27: 'back', 4: 'back', 461: 'back', 10009: 'back' };
  function onKey(e) {
    if (!root) return;
    var k = e.key, code = e.keyCode || e.which || 0;
    var action = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'ok',
                   Escape: 'back', GoBack: 'back', BrowserBack: 'back' }[k] || KEYMAP[code];
    var t = e.target, typing = t && t.tagName === 'INPUT' && !t.readOnly;
    if (typing && (action === 'left' || action === 'right')) { e.stopImmediatePropagation(); return; }
    if (typing && action === 'ok') {
      e.stopImmediatePropagation();
      return;                                  // let the form submit
    }
    // A physical keyboard on the TV: type into the active field
    if (isTV() && kbTarget && k && k.length === 1 && !e.ctrlKey && !e.metaKey) {
      kbTarget.value += k; e.preventDefault(); e.stopImmediatePropagation(); return;
    }
    if (isTV() && kbTarget && k === 'Backspace') {
      kbTarget.value = kbTarget.value.slice(0, -1); e.preventDefault(); e.stopImmediatePropagation(); return;
    }
    if (!isTV()) {
      if (action === 'back' && k !== 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); backKey(); }
      return;
    }
    if (!action) { e.stopImmediatePropagation(); return; }
    e.preventDefault(); e.stopImmediatePropagation();
    if (action === 'back') { backKey(); return; }
    if (action === 'ok') {
      if (!focusEl) return;
      if (focusEl.classList.contains('sa-in')) { kbTarget = focusEl; mark(); var k1 = root.querySelector('.sa-k'); if (k1) focus(k1); return; }
      focusEl.click(); return;
    }
    if (!isTV() && !(focusEl && root.contains(focusEl))) return;
    move(action);
  }
  w.addEventListener('keydown', onKey, true);

  /* Back (remote, Escape, or the phone's back button). Returns true if it
     was used here; false lets the app do its own thing (e.g. exit). */
  function backKey() {
    if (!root) return false;
    if (screen === 'welcome' && opt.required) return false;
    if (!stack.length && !canClose()) return true;
    back();
    return true;
  }

  /* ── Public ──────────────────────────────────────────────────────────── */
  function signOut() {
    call('logout', {}).catch(function () {});
    acct = null; save(); clearLocal(); fire(); fireChange();
    if (opt.required) open('welcome'); else close();
  }

  function refreshAccount() {
    if (!acct) return Promise.resolve();
    return call('me', {}).then(function (d) {
      acct.profiles = d.profiles; acct.email = d.email;
      var wasV = acct.verified !== false;
      acct.devices = d.devices === undefined ? acct.devices : d.devices;
      acct.verified = d.verified !== false;
      if (!acct.verified && !root) { save(); fireChange(); open('verify'); return; }
      if (acct.verified && !wasV) { save(); fireChange(); if (acct.pid) sync(); }
      setTimeout(maybeAskDevices, 800);
      var still = acct.profiles.some(function (p) { return p.id === acct.pid; });
      if (acct.pid && !still) { acct.pid = null; clearLocal(); fire(); }
      save(); fireChange();
    }).catch(function () {});
  }

  function init(o) {
    opt = o || {};
    acct = jget(S_ACCT, null);
    if (acct && !acct.token) acct = null;
    var start = function () {
      if (opt.mode === 'web' && /\/link(\.html)?$/.test(location.pathname)) {
        var c = (location.search.match(/[?&]c=([A-Za-z0-9]+)/) || [])[1] || '';
        if (c) lsSet('sharky_link_code', c.toUpperCase());
        open('link');
        if (acct) show('link', { code: c.toUpperCase() || lsGet('sharky_link_code') || '' });
        return;
      }
      if (!acct) { if (opt.required) open('welcome'); fireChange(); return; }
      if (acct.verified === false) { fireChange(); open('verify'); refreshAccount(); return; }
      refreshAccount();
      if (opt.askProfileOnStart || !acct.pid) {
        if (opt.askProfileOnStart) mustPick = true;
        open('profiles'); return;
      }
      fireChange();
      sync();
    };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
    setInterval(function () { if (acct && acct.pid && !document.hidden) sync(); }, 90000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && acct && acct.pid) sync(); });
    w.addEventListener('pagehide', function () { if (pushTimer) { clearTimeout(pushTimer); sync(); } });
  }

  /* Mobile website, signed out: it uses the app's layout and storage, so bring
     across the Continue Watching / My List the visitor already had on the
     full website. Only ever fills an EMPTY app history; signed-in visitors
     get theirs from the account instead. */
  function importWebHistory() {
    if (acct) return false;
    var c = lsGet('sharkytv_continue'), l = lsGet('sharkytv_mylist');
    if ((c && c !== '[]') || (l && l !== '[]')) return false;
    var fake = { 'sharky_movies_2_continue_watching': 1, 'sharky_movies_2_my_list': 1 };
    var did = convert(fake);
    if (did) fire();
    return did;
  }

  /* Website: the menu behind the avatar in the navbar. */
  function menu(anchor) {
    var old = document.querySelector('.sa-menu');
    if (old) { old.parentNode.removeChild(old); return; }
    if (!acct) { open('welcome'); return; }
    css();
    var m = document.createElement('div'), r = anchor.getBoundingClientRect(), h = '<div class="sa-email">' + esc(acct.email) +
      '<br><b style="color:#ddd">Switch profile</b></div>';
    acct.profiles.forEach(function (p) {
      h += '<button data-m="pick:' + p.id + '">' + avatarHtml(p.avatar) + esc(p.name) + (p.id === acct.pid ? ' ✓' : '') + '</button>';
    });
    if (acct.verified === false) h = '<button data-m="verify" style="color:#fbbf24">✉ Verify your email</button>' + h;
    h += '<button data-m="manage">✎ Manage profiles</button><button data-m="password">🔑 Change password</button>' +
         '<button data-m="signout">Sign out</button>';
    m.className = 'sa-menu'; m.innerHTML = h;
    m.style.top = (r.bottom + 8) + 'px';
    m.style.left = '8px';
    document.body.appendChild(m);
    /* Line up under the button but never off either edge (on a phone the
       button sits on the left, on a PC on the right). */
    var mw = m.offsetWidth, left = r.right - mw;
    if (left < 8) left = r.left;
    left = Math.max(8, Math.min(left, w.innerWidth - mw - 8));
    m.style.left = left + 'px';
    m.style.maxWidth = (w.innerWidth - 16) + 'px';
    m.addEventListener('click', function (e) {
      var b = e.target.closest('[data-m]'); if (!b) return;
      var a = b.getAttribute('data-m');
      m.parentNode.removeChild(m);
      if (a.indexOf('pick:') === 0) choose(Number(a.slice(5)));
      else if (a === 'manage') open('manage');
      else if (a === 'verify') open('verify');
      else if (a === 'password') open('password');
      else if (a === 'signout') signOut();
    });
    setTimeout(function () {
      document.addEventListener('click', function f(e) {
        if (!m.contains(e.target)) { if (m.parentNode) m.parentNode.removeChild(m); document.removeEventListener('click', f, true); }
      }, true);
    }, 0);
  }

  /* ── Sharky Wrapped: how much this profile really watched this year ──────
     Counted from the player's own progress messages (every ~5s while it
     plays): only time that actually moved forward is added, so seeking or
     leaving it paused adds nothing. Kept per device inside the profile's
     synced bundle ({ d: { <device>: {...} } }) so two devices never
     overwrite each other's numbers; wrapped.html adds them up. Small on
     purpose: top 150 titles, one number per day, 24 hour-of-day buckets. */
  var wrapLast = null;
  function wrapDevice() {
    var id = lsGet('sharky_wrap_dev');
    if (!id) { id = 'd' + new Date().getTime().toString(36) + Math.random().toString(36).slice(2, 6); lsSet('sharky_wrap_dev', id); }
    return id;
  }
  function wrapTrack(d) {
    if (!acct || !acct.pid || !d || !d.id) return;
    var key = (d.kind === 'tv' ? 'tv' : 'movie') + ':' + d.id;
    var now = new Date().getTime(), t = Number(d.t) || 0;
    var prev = wrapLast;
    wrapLast = { key: key, t: t, at: now };
    if (!prev || prev.key !== key || now - prev.at > 15000) return;
    var add = t - prev.t;
    if (!(add > 0 && add <= 15)) return;                 // a seek or a stall: not watching time
    var dt = new Date(), y = dt.getFullYear();
    var all = jget('sharky_wrapped', {});
    if (!all || typeof all !== 'object') all = {};
    if (all.y !== y) all = { y: y, d: {} };              // new year, new Wrapped
    all.d = all.d || {};
    var dev = wrapDevice();
    var me = all.d[dev] || (all.d[dev] = { s: 0, t: {}, day: {}, h: [] });
    me.s = (me.s || 0) + add;
    var tk = me.t[key] || (me.t[key] = [0, 0]);
    tk[0] += add; tk[1] = Math.max(tk[1], Number(d.pct) || 0);
    var md = ('0' + (dt.getMonth() + 1)).slice(-2) + ('0' + dt.getDate()).slice(-2);
    me.day[md] = (me.day[md] || 0) + add;
    if (!me.h || me.h.length !== 24) me.h = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
    me.h[dt.getHours()] += add;
    var ks = Object.keys(me.t);
    if (ks.length > 150) {
      ks.sort(function (a, b) { return me.t[a][0] - me.t[b][0]; });
      delete me.t[ks[0]];
    }
    var devs = Object.keys(all.d);
    if (devs.length > 4) {
      devs.sort(function (a, b) { return (all.d[a].s || 0) - (all.d[b].s || 0); });
      if (devs[0] !== dev) delete all.d[devs[0]];
    }
    jset('sharky_wrapped', all);
  }
  w.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || typeof d !== 'object' || d.type !== 'sharky:progress') return;
    if (!/^https:\/\/api\.sharkmovie\.co\.uk$/.test(ev.origin || '') &&
        !(opt.api && ev.origin === String(opt.api).replace(/\/+$/, ''))) return;
    try { wrapTrack(d); } catch (e) {}
  });

  w.SharkyAccount = {
    init: init,
    open: open,
    gate: gate,
    menu: menu,
    signOut: signOut,
    back: backKey,
    importWebHistory: importWebHistory,
    sync: sync,
    avatarHtml: avatarHtml,
    get account() { return acct; },
    get profile() { return currentProfile(); },
    get isOpen() { return !!root; }
  };
})(window);
