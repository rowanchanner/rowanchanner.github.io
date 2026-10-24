/* foryou.js - "made for you" rows on the home page.
 *
 * ACCOUNTS ONLY, and different for every profile. Everything it learns is
 * kept per profile: Continue Watching, My List and episodes watched are
 * already swapped + synced per profile by sharky-account.js, and so is this
 * file's own "signals" store (sharky_fy_signals, added to its WEB_KEYS).
 *
 * What it learns from (strongest first):
 *   - what you WATCHED, how recently, and how deep you went (bingeing 6
 *     episodes counts far more than trying one and giving up)
 *   - your My List
 *   - "Not for me" on a pick (the X on the card) - that title AND things
 *     like it get pushed down
 *   - what you open to look at (the info pop-up), even if you don't watch
 *   - what you search for ("horror", "anime" ...)
 *   - what you were shown and kept scrolling past (picks you ignore fade)
 *   - the time of day (late night leans thriller / horror a little)
 *
 * What it uses to pick (TMDB, ~15-20 requests, cached 30 min per profile):
 *   - "people who liked X also liked" for every seed
 *   - the seeds' keywords (e.g. "time travel", "heist") and people
 *     (directors / creators / lead actors)
 *   - film series you've started (Dune -> Dune: Part Two)
 *   - a little exploration: a few well-liked picks just outside your usual
 *     taste, so it doesn't trap you in one genre - if you click them, it
 *     learns that too.
 *
 * Rows: Up Next in Your Series / Top Picks for <name> / Because You Watched
 * x2 / More <keyword> / More from <person> / <genre> Picks for You.
 *
 * Needs from script.js: fetchTMDB, normalizeItem, getStorage, createCard,
 * mediaKey, titleKey, isUpcoming, STORAGE_CONTINUE, STORAGE_MY_LIST, and
 * (optional) searchIntent, openDetails, playItem, runSearch.
 */
(function () {
  'use strict';

  var CACHE_MS = 30 * 60 * 1000;
  var SIG_KEY = 'sharky_fy_signals';
  var EPS_KEY = 'sharky_movies_2_watched_eps';
  var GENRES = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary',
    18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
    9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 53: 'Thriller', 10752: 'War', 37: 'Western',
    10759: 'Action', 10762: 'Kids', 10765: 'Sci-Fi', 10768: 'War', 10764: 'Reality', 10766: 'Soap',
    10767: 'Talk', 10763: 'News'
  };
  /* TV and film use different ids for the same idea - fold them together. */
  var SAME = { 10759: 28, 10765: 878, 10762: 10751, 10768: 10752 };
  var TV_OF = { 28: 10759, 12: 10759, 878: 10765, 14: 10765, 10751: 10762, 10752: 10768 };
  var SKIP_GENRES = { 10767: 1, 10763: 1, 10764: 1, 10766: 1 };   // talk, news, reality, soap
  /* Keywords that describe the PRODUCTION, not the story - useless for taste. */
  /* Places say where it's set, not what it's like ("new mexico"). */
  var PLACE_KW = /,|\b(city|county|town|village|island|state|england|scotland|wales|ireland|london|paris|new york|los angeles|california|texas|new mexico|florida|chicago|tokyo|japan|usa|united states|america|france|germany|italy|spain|mexico|canada|australia|india|china|korea|russia|africa|europe|asia)\b/i;
  var META_KW = /stinger|woman director|based on (novel|book|comic|manga|true|video game|play)|sequel|remake|3d|independent film|duringcredits|aftercredits|anime|live action|miniseries|tv movie|short film|^lgbt|^\d{4}s?$/i;

  function A() { return window.SharkyAccount; }
  function signedIn() {
    var a = A();
    return !!(a && a.profile && a.account && a.account.verified !== false);
  }
  function g(id) { return SAME[id] || id; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nowH() { return Math.floor(Date.now() / 3600000); }      // hours - keeps the store small
  function title(i) { return (i && (i.sharky_title || i.title || i.name)) || ''; }
  function cap(s) { return String(s).replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }

  /* ── Signals (per profile, synced) ─────────────────────────────────── */
  function sigLoad() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(SIG_KEY) || 'null'); } catch (e) {}
    if (!s || s.v !== 1) s = { v: 1, imp: {}, clk: {}, no: {}, q: [] };
    s.imp = s.imp || {}; s.clk = s.clk || {}; s.no = s.no || {}; s.q = s.q || [];
    return s;
  }
  function trim(obj, max, at) {
    var ks = Object.keys(obj);
    if (ks.length <= max) return;
    ks.sort(function (a, b) { return at(obj[a]) - at(obj[b]); });
    for (var i = 0; i < ks.length - max; i++) delete obj[ks[i]];
  }
  function sigSave(s) {
    if (!signedIn()) return;                      // signed out: learn nothing
    trim(s.imp, 150, function (v) { return v[1]; });
    trim(s.clk, 80, function (v) { return v; });
    trim(s.no, 80, function (v) { return v; });
    s.q = s.q.slice(-12);
    try { localStorage.setItem(SIG_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function record(kind, key) {
    if (!signedIn() || !key) return;
    var s = sigLoad();
    if (kind === 'imp') { var v = s.imp[key] || [0, 0]; s.imp[key] = [v[0] + 1, nowH()]; }
    else if (kind === 'clk') { s.clk[key] = nowH(); }
    else if (kind === 'no') { s.no[key] = nowH(); }
    else if (kind === 'q') { s.q.push([String(key).slice(0, 40), nowH()]); }
    sigSave(s);
  }
  /* Opening a title's info, or playing it, is interest. */
  function hookGlobals() {
    try {
      if (typeof openDetails === 'function' && !openDetails.__fy) {
        var od = openDetails;
        openDetails = function (id, type) { record('clk', (type === 'tv' ? 'tv' : 'movie') + ':' + id); return od.apply(this, arguments); };
        openDetails.__fy = true;
      }
    } catch (e) {}
    try {
      if (typeof runSearch === 'function' && !runSearch.__fy) {
        var rs = runSearch, qt = null;
        runSearch = function () {
          var inp = document.getElementById('searchInput');
          var q = inp && inp.value.trim();
          clearTimeout(qt);
          if (q && q.length >= 3) qt = setTimeout(function () { record('q', q); }, 2500);   // only what they settled on
          return rs.apply(this, arguments);
        };
        runSearch.__fy = true;
      }
    } catch (e) {}
  }

  /* ── The rows on the page ─────────────────────────────────────────── */
  var host = null, seenThisVisit = {}, io = null;
  function ensureHost() {
    if (host && host.isConnected) return host;
    var anchor = document.getElementById('becauseBlock') || document.getElementById('myListBlock');
    if (!anchor) return null;
    host = document.createElement('div');
    host.id = 'forYouRows';
    anchor.parentNode.insertBefore(host, anchor);
    return host;
  }

  function wireArrows(vp) {
    var row = vp.querySelector('.movie-row');
    var l = vp.querySelector('.row-arrow.left'), r = vp.querySelector('.row-arrow.right');
    if (l) l.addEventListener('click', function () { row.scrollBy({ left: -row.clientWidth * 0.8, behavior: 'smooth' }); });
    if (r) r.addEventListener('click', function () { row.scrollBy({ left: row.clientWidth * 0.8, behavior: 'smooth' }); });
  }

  /* Count a pick as "shown" once it has been properly on screen. */
  function watchImpressions(card, key) {
    if (!('IntersectionObserver' in window)) return;
    if (!io) {
      io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          if (!en.isIntersecting) return;
          var k = en.target.getAttribute('data-fy-key');
          io.unobserve(en.target);
          if (!k || seenThisVisit[k]) return;
          seenThisVisit[k] = 1;
          setTimeout(function () { record('imp', k); }, 0);
        });
      }, { threshold: 0.7 });
    }
    card.setAttribute('data-fy-key', key);
    io.observe(card);
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:99999;background:#fff;color:#111;' +
      'font:600 14px/1.2 system-ui,sans-serif;padding:12px 18px;border-radius:999px;box-shadow:0 8px 30px rgba(0,0,0,.45)';
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2200);
  }

  function makeCard(item) {
    var card = createCard(item);
    var key = mediaKey(item);
    card.style.position = card.style.position || 'relative';
    var no = document.createElement('button');
    no.type = 'button';
    no.title = 'Not for me';
    no.setAttribute('aria-label', 'Not for me');
    no.innerHTML = '&times;';
    no.style.cssText = 'position:absolute;top:6px;right:6px;z-index:4;width:28px;height:28px;border-radius:50%;border:0;' +
      'background:rgba(0,0,0,.65);color:#fff;font-size:18px;line-height:28px;cursor:pointer;padding:0;opacity:.75';
    no.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      record('no', key);
      card.style.transition = 'opacity .25s, transform .25s';
      card.style.opacity = '0';
      card.style.transform = 'scale(.9)';
      setTimeout(function () { if (card.parentNode) card.parentNode.removeChild(card); }, 260);
      toast('Got it - fewer picks like that');
      invalidate();
    });
    card.appendChild(no);
    card.addEventListener('click', function () { record('clk', key); }, true);
    watchImpressions(card, key);
    return card;
  }

  function addRow(r) {
    var h = ensureHost();
    if (!h || !r.items.length) return;
    var block = document.createElement('div');
    block.className = 'movie-row-block';
    block.setAttribute('data-cat', 'for you');
    block.innerHTML =
      '<div class="section-header"><h2>' + esc(r.title) +
      (r.sub ? ' <span style="color:var(--muted,#999);font-weight:400;font-size:.72em">' + esc(r.sub) + '</span>' : '') +
      '</h2></div>' +
      '<div class="row-viewport"><button class="row-arrow left" aria-label="Scroll left">&#10094;</button>' +
      '<div class="movie-row"></div><button class="row-arrow right" aria-label="Scroll right">&#10095;</button></div>';
    var row = block.querySelector('.movie-row');
    r.items.forEach(function (i) { row.appendChild(makeCard(i)); });
    h.appendChild(block);
    wireArrows(block.querySelector('.row-viewport'));
  }

  function teaser() {
    var h = ensureHost();
    if (!h) return;
    var block = document.createElement('div');
    block.className = 'movie-row-block';
    block.setAttribute('data-cat', 'for you');
    block.innerHTML =
      '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:16px 24px;justify-content:space-between;' +
      'background:linear-gradient(90deg,rgba(229,9,20,.18),rgba(229,9,20,.04));border:1px solid rgba(229,9,20,.35);' +
      'border-radius:14px;padding:18px 22px">' +
      '<div style="min-width:240px;flex:1"><div style="font-weight:800;font-size:1.15rem;margin-bottom:4px">' +
      'Picks made just for you</div><div style="color:var(--muted,#aaa);line-height:1.45">' +
      'Make a free account and Sharky learns what you like - your home page fills up with films and shows ' +
      'picked for you, and every profile gets its own. <b style="color:#fff">It\'s free.</b></div></div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn-play" data-fy="signup">Create a free account</button>' +
      '<button type="button" class="btn btn-secondary" data-fy="signin">Sign in</button></div></div>';
    block.addEventListener('click', function (e) {
      var b = e.target.closest('[data-fy]');
      if (!b || !A()) return;
      A().open(b.getAttribute('data-fy'));
    });
    h.appendChild(block);
  }

  function clearRows() {
    var h = ensureHost();
    if (h) h.innerHTML = '';
  }

  /* ── What this profile has done ───────────────────────────────────── */
  function history() {
    var cont = (getStorage(STORAGE_CONTINUE) || []).slice()
      .sort(function (a, b) { return (b.lastWatched || 0) - (a.lastWatched || 0); });
    var list = getStorage(STORAGE_MY_LIST) || [];
    var eps = {};
    try { eps = JSON.parse(localStorage.getItem(EPS_KEY) || '{}') || {}; } catch (e) {}
    return { cont: cont, list: list, eps: eps, sig: sigLoad() };
  }

  /* How much a show was really watched: episodes past a few minutes. */
  function depth(h, item) {
    if (item.media_type !== 'tv') return 1;
    var show = h.eps[String(item.id)] || {};
    var n = 0;
    Object.keys(show).forEach(function (k) { if ((show[k].pct || 0) >= 20 || !('pct' in show[k])) n++; });
    var days = (Date.now() - (item.lastWatched || 0)) / 86400000;
    if (n <= 1 && days > 14) return 0.5;          // tried it, never came back
    return 1 + Math.min(1, n / 6);                // up to x2 for a proper binge
  }

  /* Really watched, not just opened to test: 3+ minutes (or 10 percent)
     according to the player (account-web.js keeps signals.w =
     {key: [seconds, pct]}), or for a show an episode past 10 percent.
     Things watched before this check existed (no data for them) still count. */
  var REAL_SINCE = 1792862213780;
  /* Like Netflix: how much of it did they actually watch?
       2 = finished: 85 percent+ of a film, or 80 percent+ of an episode
           (Rowan's call) - a real
           "Because You Watched" seed, and it counts for "Up Next".
       1 = gave it a proper go (3+ minutes or 10 percent) - a weak hint only.
       0 = opened it for a few seconds - ignored completely.
     Old history from before this check (no data) counts as a hint. */
  function watchLevel(h, it) {
    var k = mediaKey(it), w = (h.sig.w || {})[k], best = w ? w[1] : 0, secs = w ? w[0] : 0;
    var moved = 0;
    if (it.media_type === 'tv') {
      var show = h.eps[String(it.id)] || {};
      Object.keys(show).forEach(function (e) {
        best = Math.max(best, show[e].pct || 0);
        if ((show[e].pct || 0) >= 10) moved++;
      });
    }
    if (best >= (it.media_type === 'tv' ? 80 : 85)) return 2;
    /* Went on to another episode = the one before was finished, even if
       they skipped the last bit of its credits. */
    if (moved >= 2) return 2;
    if (secs >= 180 || best >= 10) return 1;
    return (it.lastWatched || 0) < REAL_SINCE && !w ? 1 : 0;
  }
  function reallyWatched(h, it) { return watchLevel(h, it) > 0; }

  function seedsOf(h) {
    var seeds = [], seen = {}, no = h.sig.no;
    h.cont.filter(function (it) { return reallyWatched(h, it); }).slice(0, 10).forEach(function (it, n) {
      var k = mediaKey(it);
      if (!k || seen[k] || no[k]) return;
      seen[k] = 1;
      var ageDays = (Date.now() - (it.lastWatched || Date.now())) / 86400000;
      var recency = Math.max(0.3, Math.exp(-ageDays / 45));
      var full = watchLevel(h, it) === 2;
      seeds.push({ item: it, w: (1 / (1 + n * 0.3)) * recency * depth(h, it) * (full ? 1 : 0.35), watched: full });
    });
    h.list.slice(0, 4).forEach(function (it) {
      var k = mediaKey(it);
      if (!k || seen[k] || no[k]) return;
      seen[k] = 1;
      seeds.push({ item: it, w: 0.55, watched: false });
    });
    /* Looked at recently but not watched: a weak hint. */
    var clicks = Object.keys(h.sig.clk).filter(function (k) { return !seen[k] && !no[k]; })
      .filter(function (k) { return nowH() - h.sig.clk[k] < 14 * 24; })
      .sort(function (a, b) { return h.sig.clk[b] - h.sig.clk[a]; }).slice(0, 4);
    clicks.forEach(function (k) {
      var p = k.split(':');
      seen[k] = 1;
      seeds.push({ item: { id: p[1], media_type: p[0] }, w: 0.3, watched: false, light: true });
    });
    /* "Not for me": negative seeds - things like them get pushed down. */
    Object.keys(h.sig.no).sort(function (a, b) { return h.sig.no[b] - h.sig.no[a]; }).slice(0, 4).forEach(function (k) {
      var p = k.split(':');
      seeds.push({ item: { id: p[1], media_type: p[0] }, w: -0.8, watched: false, neg: true });
    });
    return seeds;
  }

  /* One request per seed: details + recommendations + keywords + credits. */
  function fetchSeed(s) {
    var t = s.item.media_type === 'tv' ? 'tv' : 'movie';
    return fetchTMDB('/' + t + '/' + encodeURIComponent(s.item.id) + '?append_to_response=recommendations,keywords,credits')
      .then(function (d) {
        if (!d) return null;
        if (!s.item.genre_ids && d.genres) s.item.genre_ids = d.genres.map(function (x) { return x.id; });
        if (!title(s.item)) s.item.sharky_title = d.title || d.name || '';
        var kws = (d.keywords && (d.keywords.keywords || d.keywords.results)) || [];
        var crew = (d.credits && d.credits.crew) || [];
        var people = [];
        crew.filter(function (c) { return c.job === 'Director'; }).slice(0, 2)
          .forEach(function (c) { people.push({ id: c.id, name: c.name, w: 1.3 }); });
        (d.created_by || []).slice(0, 2).forEach(function (c) { people.push({ id: c.id, name: c.name, w: 1.1 }); });
        ((d.credits && d.credits.cast) || []).slice(0, 3)
          .forEach(function (c) { people.push({ id: c.id, name: c.name, w: 1 }); });
        return {
          recs: ((d.recommendations && d.recommendations.results) || []).map(function (r) { return normalizeItem(r, r.media_type || t); }),
          kws: kws.filter(function (k) { return k && k.name && !META_KW.test(k.name) && !PLACE_KW.test(k.name); }),
          people: people,
          coll: d.belongs_to_collection || null
        };
      }).catch(function () { return null; });
  }

  function signature(h, pid) {
    var s = h.sig;
    /* Only what was watched / listed. Clicks and "not for me" don't rebuild
       the rows under someone's nose - they count from the next visit
       (a "not for me" clears the cache so that's straight away). */
    return pid + '|' + h.cont.filter(function (i) { return reallyWatched(h, i); }).slice(0, 10)
      .map(function (i) { return mediaKey(i) + '/' + watchLevel(h, i); }).join(',') +
      '|' + h.list.slice(0, 4).map(mediaKey).join(',') +
      '|' + (s.v || 1);
  }

  /* ── Build the picks ──────────────────────────────────────────────── */
  function build(h, name) {
    var seeds = seedsOf(h);
    var exclude = {};
    h.cont.filter(function (i) { return reallyWatched(h, i); }).concat(h.list)
      .forEach(function (i) { exclude[mediaKey(i)] = 1; });
    Object.keys(h.sig.no).forEach(function (k) { exclude[k] = 1; });

    return Promise.all(seeds.map(fetchSeed)).then(function (info) {
      /* Taste: genres, keywords and people, weighted by the seeds. */
      var taste = {}, kwT = {}, kwName = {}, kwSeeds = {}, ppl = {}, pplName = {}, pplSeeds = {};
      seeds.forEach(function (s, si) {
        var w = s.w;
        (s.item.genre_ids || []).forEach(function (id) {
          if (SKIP_GENRES[id]) return;
          id = g(id);
          taste[id] = (taste[id] || 0) + w;
        });
        var inf = info[si];
        if (!inf || s.neg) return;
        inf.kws.forEach(function (k) {
          kwT[k.id] = (kwT[k.id] || 0) + w; kwName[k.id] = k.name;
          (kwSeeds[k.id] = kwSeeds[k.id] || {})[si] = 1;
        });
        inf.people.forEach(function (p) {
          ppl[p.id] = (ppl[p.id] || 0) + w * p.w; pplName[p.id] = p.name;
          (pplSeeds[p.id] = pplSeeds[p.id] || {})[si] = 1;
        });
      });
      /* What they search for counts a bit too (last 30 days). */
      if (typeof searchIntent === 'function') {
        h.sig.q.forEach(function (q) {
          if (nowH() - q[1] > 30 * 24) return;
          var it = searchIntent(q[0]);
          if (it && it.genre && it.genre[1]) taste[g(it.genre[1])] = (taste[g(it.genre[1])] || 0) + 0.3;
        });
      }
      var tot = 0;
      Object.keys(taste).forEach(function (k) { if (taste[k] < 0) taste[k] = 0; tot += taste[k]; });
      if (tot) Object.keys(taste).forEach(function (k) { taste[k] /= tot; });

      /* Time of day: late night leans darker, weekend daytime leans family. */
      var hr = new Date().getHours(), day = new Date().getDay();
      var night = hr >= 22 || hr < 4, famTime = (day === 0 || day === 6) && hr >= 8 && hr < 18;

      function bayes(c) {
        var v = Number(c.vote_count || 0), r = Number(c.vote_average || 0), m = 500;
        return (v / (v + m)) * r + (m / (v + m)) * 6.4;
      }
      function ok(c) {
        var k = mediaKey(c);
        return k && !exclude[k] && (c.poster_path || c.backdrop_path) && !c.adult &&
               !(typeof isUpcoming === 'function' && isUpcoming(c)) &&
               !(c.genre_ids || []).some(function (id) { return SKIP_GENRES[id]; });
      }

      var pool = {};
      seeds.forEach(function (s, si) {
        var inf = info[si];
        if (!inf) return;
        inf.recs.forEach(function (c, pos) {
          var k = mediaKey(c);
          if (!k) return;
          var e = pool[k] || (pool[k] = { item: c, rec: 0, neg: 0, hits: 0, from: [] });
          var part = Math.abs(s.w) * (1 - pos / 40);
          if (s.neg) { e.neg += part; return; }
          e.rec += part;
          e.hits += 1;
          e.from.push(si);
        });
      });

      var ranked = Object.keys(pool).map(function (k) { return pool[k]; }).filter(function (e) {
        return e.hits > 0 && ok(e.item);
      });
      ranked.forEach(function (e) {
        var c = e.item, k = mediaKey(c);
        var gs = 0;
        (c.genre_ids || []).forEach(function (id) { gs += taste[g(id)] || 0; });
        var votes = Number(c.vote_count || 0), rating = Number(c.vote_average || 0);
        var sc = e.rec * (1 + 0.35 * (e.hits - 1)) + 1.2 * gs + 0.05 * Math.log10(1 + (c.popularity || 0));
        sc -= 0.9 * e.neg;                                   // like something they said "not for me" to
        /* Quality, the way IMDb's top 250 does it: a rating only counts as
           much as the number of votes behind it (8.5 from 40 people isn't
           8.5). Cubed, so a great match that's also great wins clearly. */
        sc *= Math.pow(bayes(c) / 7, 3);
        if (votes < 50) sc *= 0.6;
        var imp = h.sig.imp[k];                              // shown before and ignored -> fade it
        if (imp && !h.sig.clk[k] && imp[0] > 2) sc *= Math.pow(0.8, imp[0] - 2);
        var d = c.sharky_date || c.release_date || c.first_air_date || '';
        if (d && (Date.now() - new Date(d).getTime()) < 730 * 86400000) sc *= 1.08;   // fresh
        var gids = (c.genre_ids || []).map(g);
        if (night && gids.some(function (x) { return x === 27 || x === 53 || x === 9648 || x === 80; })) sc *= 1.06;
        if (famTime && (taste[10751] || taste[16]) && gids.some(function (x) { return x === 10751 || x === 16; })) sc *= 1.05;
        e.score = sc;
      });
      ranked.sort(function (a, b) { return b.score - a.score; });

      /* Top Picks: best first, but keep it varied - not too much from one
         seed or one genre in a row. */
      var perSeed = {}, top = [], used = {}, gCount = {}, tCount = { movie: 0, tv: 0 };
      var realCont = h.cont.filter(function (i) { return reallyWatched(h, i); });
      var tvShare = realCont.slice(0, 10).filter(function (i) { return i.media_type === 'tv'; }).length /
                    Math.max(1, Math.min(10, realCont.length));
      var left = ranked.slice();
      while (top.length < 20 && left.length) {
        var bi = -1, bs = -1e9;
        for (var i = 0; i < Math.min(left.length, 40); i++) {
          var e = left[i], lead = e.from[0];
          var g0 = g((e.item.genre_ids || [])[0]);
          var adj = e.score * Math.pow(0.88, gCount[g0] || 0);
          /* Keep films vs shows roughly in the mix they actually watch. */
          var isTv = e.item.media_type === 'tv';
          var want = (top.length + 1) * (isTv ? tvShare : 1 - tvShare);
          var over = (isTv ? tCount.tv : tCount.movie) + 1 - want;
          if (over > 1) adj *= Math.pow(0.8, over - 1);
          if ((perSeed[lead] || 0) >= 4 && e.hits < 2) adj *= 0.4;
          if (adj > bs) { bs = adj; bi = i; }
        }
        var pick = left.splice(bi, 1)[0];
        var tk = titleKey(pick.item);
        if (used[tk]) continue;
        used[tk] = 1;
        perSeed[pick.from[0]] = (perSeed[pick.from[0]] || 0) + 1;
        var pg = g((pick.item.genre_ids || [])[0]);
        gCount[pg] = (gCount[pg] || 0) + 1;
        tCount[pick.item.media_type === 'tv' ? 'tv' : 'movie']++;
        top.push(pick.item);
      }

      var shownEarly = {};
      top.slice(0, 8).forEach(function (i) { shownEarly[mediaKey(i)] = 1; });

      /* Extra lookups, all at once. */
      var jobs = [];
      /* 1. Exploration: well-liked trending titles, not too far from taste. */
      jobs.push(fetchTMDB('/trending/all/week').then(function (d) {
        return ((d && d.results) || []).map(function (r) { return normalizeItem(r, r.media_type); })
          .filter(function (c) {
            return (c.media_type === 'movie' || c.media_type === 'tv') && ok(c) && !shownEarly[mediaKey(c)] &&
                   !used[titleKey(c)] && Number(c.vote_average || 0) >= 7 && Number(c.vote_count || 0) >= 200;
          });
      }).catch(function () { return []; }));
      /* 2. Series you've started: the next film you haven't seen. */
      var colls = {};
      seeds.forEach(function (s, si) {
        var inf = info[si];
        if (inf && inf.coll && s.watched && !colls[inf.coll.id]) colls[inf.coll.id] = { name: inf.coll.name, seen: s.item.id };
      });
      var collIds = Object.keys(colls).slice(0, 3);
      jobs.push(Promise.all(collIds.map(function (cid) {
        return fetchTMDB('/collection/' + cid).then(function (d) {
          var parts = ((d && d.parts) || []).filter(function (p) { return p.release_date; })
            .sort(function (a, b) { return a.release_date < b.release_date ? -1 : 1; })
            .map(function (p) { return normalizeItem(p, 'movie'); });
          var lastSeen = -1;
          parts.forEach(function (p, n) { if (exclude[mediaKey(p)] || String(p.id) === String(colls[cid].seen)) lastSeen = n; });
          var next = parts.slice(lastSeen + 1).filter(ok)[0];
          return next ? next : null;
        }).catch(function () { return null; });
      })));
      /* 3. A theme they keep coming back to (keyword in 2+ seeds). */
      var kwTop = Object.keys(kwT).filter(function (k) { return Object.keys(kwSeeds[k]).length >= 2; })
        .sort(function (a, b) { return kwT[b] - kwT[a]; })[0];
      var tvCount = h.cont.filter(function (i) { return reallyWatched(h, i); }).slice(0, 8).filter(function (i) { return i.media_type === 'tv'; }).length;
      var useTv = tvCount > 4;
      jobs.push(kwTop ? fetchTMDB('/discover/' + (useTv ? 'tv' : 'movie') + '?with_keywords=' + kwTop +
        '&sort_by=popularity.desc&vote_count.gte=' + (useTv ? 80 : 200)).then(function (d) {
          return ((d && d.results) || []).map(function (r) { return normalizeItem(r, useTv ? 'tv' : 'movie'); });
        }).catch(function () { return []; }) : Promise.resolve([]));
      /* 4. A person who shows up in 2+ of what they watch. */
      var pTop = Object.keys(ppl).filter(function (p) { return Object.keys(pplSeeds[p]).length >= 2; })
        .sort(function (a, b) { return ppl[b] - ppl[a]; })[0];
      jobs.push(pTop ? fetchTMDB('/person/' + pTop + '/combined_credits').then(function (d) {
        var seenK = {};
        return ((d && d.cast) || []).filter(function (c) { return (c.order == null || c.order < 6) && !/himself|herself|self/i.test(c.character || ''); })
          .concat(((d && d.crew) || []).filter(function (c) { return /^(Director|Creator|Writer|Screenplay)$/.test(c.job || ''); }))
          .filter(function (c) { return Number(c.vote_count || 0) >= 300 && !(c.genre_ids || []).some(function (x) { return x === 99 || SKIP_GENRES[x]; }); })
          .sort(function (a, b) { return bayes(b) - bayes(a); })
          .map(function (r) { return normalizeItem(r, r.media_type); })
          .filter(function (c) { var k = mediaKey(c); if (seenK[k]) return false; seenK[k] = 1; return true; });
      }).catch(function () { return []; }) : Promise.resolve([]));
      /* 5. Favourite genre (drama/comedy are too broad if something close). */
      var order = Object.keys(taste).sort(function (a, b) { return taste[b] - taste[a]; });
      var fav = order[0];
      if ((fav === '18' || fav === '35') && order[1] && taste[order[1]] >= taste[fav] * 0.6) fav = order[1];
      var gid = fav ? (useTv ? (TV_OF[fav] || fav) : fav) : null;
      jobs.push(fav && GENRES[fav] ? fetchTMDB(useTv
        ? '/discover/tv?with_genres=' + gid + '&sort_by=popularity.desc&vote_count.gte=150&vote_average.gte=7'
        : '/discover/movie?with_genres=' + gid + '&sort_by=popularity.desc&vote_count.gte=400&vote_average.gte=6.8')
        .then(function (d) { return ((d && d.results) || []).map(function (r) { return normalizeItem(r, useTv ? 'tv' : 'movie'); }); })
        .catch(function () { return []; }) : Promise.resolve([]));

      return Promise.all(jobs).then(function (res) {
        var explore = res[0], nexts = res[1].filter(Boolean), kwItems = res[2], pItems = res[3], gItems = res[4];
        var rows = [];

        if (nexts.length) rows.push({ title: 'Up Next in Your Series', sub: 'the next film in series you started', items: nexts });
        /* Don't repeat those further down. */
        nexts.forEach(function (c) { shownEarly[mediaKey(c)] = 1; });
        top = top.filter(function (c) { return nexts.every(function (n) { return mediaKey(n) !== mediaKey(c); }); });
        /* Sequels of something they watched ("Toy Story 4" after "Toy Story")
           belong in Up Next, in order - not in Top Picks out of order. */
        var watchedRoots = seeds.filter(function (x) { return x.watched; })
          .map(function (x) { return titleKey(x.item); }).filter(function (t) { return t && t.length >= 4; });
        top = top.filter(function (c) {
          var t = titleKey(c);
          return !watchedRoots.some(function (r) { return t !== r && t.indexOf(r) === 0; });
        });

        /* Slip a few exploration picks into Top Picks (slots 5, 10, 15). */
        var top3 = order.slice(0, 3).map(String);
        var ex = explore.filter(function (c) {
          var gids = (c.genre_ids || []).map(function (x) { return String(g(x)); });
          /* Near their taste, not random: shares one of their top 3 genres,
             and no cartoons/anime unless they actually watch animation. */
          return gids.some(function (x) { return top3.indexOf(x) >= 0; }) &&
                 (gids.indexOf('16') < 0 || top3.indexOf('16') >= 0);
        }).slice(0, 3);
        [4, 9, 14].forEach(function (slot, n) {
          if (ex[n] && top.length >= slot) top.splice(slot, 0, ex[n]);
        });
        if (top.length >= 6) rows.push({ title: 'Top Picks for ' + name, sub: 'based on what you watch', items: top.slice(0, 22) });

        /* Because You Watched: the two most recent real watches with enough
           of their own picks. Well-liked first. */
        var because = [];
        seeds.forEach(function (s, si) {
          if (because.length >= 2 || !s.watched || !info[si]) return;
          var items = [], seen = {};
          info[si].recs.forEach(function (c, pos) {
            var k = mediaKey(c);
            if (!ok(c) || shownEarly[k] || seen[k]) return;
            seen[k] = 1;
            items.push({ c: c, s: (1 - pos / 40) * Math.pow(bayes(c) / 7, 3) });
          });
          items = items.sort(function (a, b) { return b.s - a.s; }).map(function (x) { return x.c; });
          if (items.length >= 6) because.push({ title: 'Because You Watched ' + title(s.item), items: items.slice(0, 20) });
        });
        if (because[0]) rows.push(because[0]);

        var kw = kwItems.filter(function (c) { return ok(c) && !shownEarly[mediaKey(c)]; });
        if (kwTop && kw.length >= 6) rows.push({ title: 'More ' + cap(kwName[kwTop]), sub: 'a theme you keep watching', items: kw });

        if (because[1]) rows.push(because[1]);

        var pi = pItems.filter(function (c) { return ok(c) && !shownEarly[mediaKey(c)]; });
        if (pTop && pi.length >= 5) rows.push({ title: 'More from ' + pplName[pTop], sub: 'they\'re in a lot of what you watch', items: pi });

        var gi = gItems.filter(function (c) { return ok(c) && !shownEarly[mediaKey(c)]; });
        if (fav && GENRES[fav] && gi.length >= 6) rows.push({ title: GENRES[fav] + ' Picks for You', sub: 'because you watch a lot of ' + GENRES[fav].toLowerCase(), items: gi });

        return rows;
      });
    });
  }

  /* ── Render ───────────────────────────────────────────────────────── */
  var busy = false, again = false, lastSig = '';

  function hideOldBecause() {
    var b = document.getElementById('becauseBlock');
    if (b) b.classList.add('hidden');
  }

  function invalidate() {
    try {
      var a = A();
      if (a && a.profile) sessionStorage.removeItem('sharky:foryou:' + a.profile.id);
    } catch (e) {}
  }

  function render() {
    if (!document.getElementById('rowsSection')) return;      // not the home page
    if (busy) { again = true; return; }
    hookGlobals();
    hideOldBecause();
    if (!signedIn()) {
      lastSig = 'out';
      clearRows();
      teaser();
      return;
    }
    var prof = A().profile;
    var h = history();
    var sig = signature(h, prof.id);
    if (sig === lastSig) return;
    lastSig = sig;
    if (!h.cont.length && !h.list.length && !Object.keys(h.sig.clk).length) {
      clearRows();
      return;                     // brand-new profile: nothing to go on yet
    }
    var ck = 'sharky:foryou:' + prof.id;
    try {
      var c = JSON.parse(sessionStorage.getItem(ck) || 'null');
      if (c && c.sig === sig && Date.now() - c.t < CACHE_MS && c.rows) { draw(c.rows); return; }
    } catch (e) {}
    busy = true;
    build(h, prof.name || 'You').then(function (rows) {
      try { sessionStorage.setItem(ck, JSON.stringify({ sig: sig, t: Date.now(), rows: rows })); } catch (e) {}
      if (signedIn() && A().profile.id === prof.id) draw(rows);
    }).catch(function (e) {
      console.warn('[foryou]', e);
    }).then(function () {
      busy = false;
      if (again) { again = false; render(); }
    });
  }

  function draw(rows) {
    clearRows();
    rows.forEach(addRow);
  }

  var timer = null;
  function soon() { clearTimeout(timer); timer = setTimeout(render, 400); }

  window.SharkyForYou = { render: soon, signedIn: signedIn };
  hookGlobals();
  document.addEventListener('sharky:account', function () { lastSig = ''; soon(); });
  document.addEventListener('sharky:account-data', soon);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', soon);
  else soon();
})();
