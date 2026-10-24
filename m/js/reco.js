/* reco.js - the "made for you" recommender for the phone app and the TV /
 * Fire Stick app. Same brain as the website's foryou.js, without any page
 * code: each app gives it the profile's history and draws the rows itself.
 * Plain ES5 (old Fire TV WebViews), needs Promise + fetch.
 *
 *   SharkyReco.signedIn = function () { ... }      // set by the app
 *   SharkyReco.record('imp' | 'clk' | 'no' | 'q', key)
 *   SharkyReco.build({
 *     tmdb:    function (path) -> Promise(json|null),
 *     watched: [{ id, kind, at, depth }],   newest first; depth 0.5..2
 *     list:    [{ id, kind }],
 *     name:    'Rowan',
 *     searchIntent: optional, q -> { genre: [aliases, movieGenreId, tvGenreId, label] }
 *   }) -> Promise([{ id, title, sub, items: [raw TMDB objects with media_type] }])
 *
 * Signals ("not for me", what was opened / shown / searched) live in
 * localStorage "sharky_fy_signals" - the same key the website uses, synced
 * per profile by sharky-account.js, so a profile learns on every device.
 */
(function (w) {
  'use strict';

  var SIG_KEY = 'sharky_fy_signals';
  var GENRES = {
    28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary',
    18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
    9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 53: 'Thriller', 10752: 'War', 37: 'Western',
    10759: 'Action', 10762: 'Kids', 10765: 'Sci-Fi', 10768: 'War', 10764: 'Reality', 10766: 'Soap',
    10767: 'Talk', 10763: 'News'
  };
  var SAME = { 10759: 28, 10765: 878, 10762: 10751, 10768: 10752 };
  var TV_OF = { 28: 10759, 12: 10759, 878: 10765, 14: 10765, 10751: 10762, 10752: 10768 };
  var SKIP_GENRES = { 10767: 1, 10763: 1, 10764: 1, 10766: 1 };
  var PLACE_KW = /,|\b(city|county|town|village|island|state|england|scotland|wales|ireland|london|paris|new york|los angeles|california|texas|new mexico|florida|chicago|tokyo|japan|usa|united states|america|france|germany|italy|spain|mexico|canada|australia|india|china|korea|russia|africa|europe|asia)\b/i;
  var META_KW = /stinger|woman director|based on (novel|book|comic|manga|true|video game|play)|sequel|remake|3d|independent film|duringcredits|aftercredits|anime|live action|miniseries|tv movie|short film|^lgbt|^\d{4}s?$/i;

  function g(id) { return SAME[id] || id; }
  function nowH() { return Math.floor(new Date().getTime() / 3600000); }
  function kindOf(r, fallback) { return r.media_type || fallback || (r.first_air_date || r.name ? 'tv' : 'movie'); }
  function keyOf(r) { return r && r.id != null ? (r.media_type === 'tv' ? 'tv' : 'movie') + ':' + r.id : ''; }
  function nameOf(r) { return (r && (r.title || r.name || r.sharky_title)) || ''; }
  function titleKey(r) {
    return String(nameOf(r)).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').replace(/^\s+|\s+$/g, '');
  }
  function cap(s) { return String(s).replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
  function today() {
    var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }
  function notOut(r) {
    var d = r.release_date || r.first_air_date || '';
    return !!d && d > today();
  }
  function bayes(c) {
    var v = Number(c.vote_count || 0), r = Number(c.vote_average || 0), m = 500;
    return (v / (v + m)) * r + (m / (v + m)) * 6.4;
  }

  /* ── Signals ───────────────────────────────────────────────────────── */
  var R = {
    /* Only learn for a signed-in profile (that's what keeps it per profile). */
    signedIn: function () {
      var a = w.SharkyAccount;
      return !!(a && a.profile && a.account && a.account.verified !== false);
    }
  };

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
  R.signals = sigLoad;
  R.record = function (kind, key) {
    if (!key || !R.signedIn()) return;
    var s = sigLoad();
    if (kind === 'imp') { var v = s.imp[key] || [0, 0]; s.imp[key] = [v[0] + 1, nowH()]; }
    else if (kind === 'clk') s.clk[key] = nowH();
    else if (kind === 'no') s.no[key] = nowH();
    else if (kind === 'q') s.q.push([String(key).slice(0, 40), nowH()]);
    trim(s.imp, 150, function (x) { return x[1]; });
    trim(s.clk, 80, function (x) { return x; });
    trim(s.no, 80, function (x) { return x; });
    s.q = s.q.slice(-12);
    try { localStorage.setItem(SIG_KEY, JSON.stringify(s)); } catch (e) {}
  };

  /* ── The picks ─────────────────────────────────────────────────────── */
  R.build = function (o) {
    var sig = sigLoad();
    var tmdb = function (p) { return Promise.resolve(o.tmdb(p)).catch(function () { return null; }); };
    var watched = o.watched || [], list = o.list || [];
    var exclude = {}, seen = {}, seeds = [];
    watched.concat(list).forEach(function (i) { exclude[(i.kind === 'tv' ? 'tv' : 'movie') + ':' + i.id] = 1; });
    Object.keys(sig.no).forEach(function (k) { exclude[k] = 1; });

    watched.slice(0, 10).forEach(function (it, n) {
      var k = (it.kind === 'tv' ? 'tv' : 'movie') + ':' + it.id;
      if (seen[k] || sig.no[k]) return;
      seen[k] = 1;
      var age = (new Date().getTime() - (it.at || new Date().getTime())) / 86400000;
      var recency = Math.max(0.3, Math.exp(-age / 45));
      seeds.push({ id: it.id, kind: it.kind, w: (1 / (1 + n * 0.3)) * recency * (it.depth || 1), watched: true });
    });
    list.slice(0, 4).forEach(function (it) {
      var k = (it.kind === 'tv' ? 'tv' : 'movie') + ':' + it.id;
      if (seen[k] || sig.no[k]) return;
      seen[k] = 1;
      seeds.push({ id: it.id, kind: it.kind, w: 0.55 });
    });
    Object.keys(sig.clk).filter(function (k) { return !seen[k] && !sig.no[k] && nowH() - sig.clk[k] < 14 * 24; })
      .sort(function (a, b) { return sig.clk[b] - sig.clk[a]; }).slice(0, 4).forEach(function (k) {
        var p = k.split(':');
        seen[k] = 1;
        seeds.push({ id: p[1], kind: p[0], w: 0.3 });
      });
    Object.keys(sig.no).sort(function (a, b) { return sig.no[b] - sig.no[a]; }).slice(0, 4).forEach(function (k) {
      var p = k.split(':');
      seeds.push({ id: p[1], kind: p[0], w: -0.8, neg: true });
    });
    if (!seeds.length) return Promise.resolve([]);

    return Promise.all(seeds.map(function (s) {
      var t = s.kind === 'tv' ? 'tv' : 'movie';
      return tmdb('/' + t + '/' + encodeURIComponent(s.id) + '?append_to_response=recommendations,keywords,credits').then(function (d) {
        if (!d) return null;
        s.name = d.title || d.name || '';
        s.genres = (d.genres || []).map(function (x) { return x.id; });
        var kws = (d.keywords && (d.keywords.keywords || d.keywords.results)) || [];
        var people = [];
        ((d.credits && d.credits.crew) || []).filter(function (c) { return c.job === 'Director'; }).slice(0, 2)
          .forEach(function (c) { people.push({ id: c.id, name: c.name, w: 1.3 }); });
        (d.created_by || []).slice(0, 2).forEach(function (c) { people.push({ id: c.id, name: c.name, w: 1.1 }); });
        ((d.credits && d.credits.cast) || []).slice(0, 3).forEach(function (c) { people.push({ id: c.id, name: c.name, w: 1 }); });
        return {
          recs: ((d.recommendations && d.recommendations.results) || []).map(function (r) { r.media_type = kindOf(r, t); return r; }),
          kws: kws.filter(function (k) { return k && k.name && !META_KW.test(k.name) && !PLACE_KW.test(k.name); }),
          people: people,
          coll: d.belongs_to_collection || null
        };
      });
    })).then(function (info) {
      var taste = {}, kwT = {}, kwName = {}, kwSeeds = {}, ppl = {}, pplName = {}, pplSeeds = {};
      seeds.forEach(function (s, si) {
        (s.genres || []).forEach(function (id) {
          if (SKIP_GENRES[id]) return;
          id = g(id);
          taste[id] = (taste[id] || 0) + s.w;
        });
        var inf = info[si];
        if (!inf || s.neg) return;
        inf.kws.forEach(function (k) {
          kwT[k.id] = (kwT[k.id] || 0) + s.w; kwName[k.id] = k.name;
          (kwSeeds[k.id] = kwSeeds[k.id] || {})[si] = 1;
        });
        inf.people.forEach(function (p) {
          ppl[p.id] = (ppl[p.id] || 0) + s.w * p.w; pplName[p.id] = p.name;
          (pplSeeds[p.id] = pplSeeds[p.id] || {})[si] = 1;
        });
      });
      if (typeof o.searchIntent === 'function') {
        sig.q.forEach(function (q) {
          if (nowH() - q[1] > 30 * 24) return;
          var it = null;
          try { it = o.searchIntent(q[0]); } catch (e) {}
          if (it && it.genre && it.genre[1]) taste[g(it.genre[1])] = (taste[g(it.genre[1])] || 0) + 0.3;
        });
      }
      var tot = 0;
      Object.keys(taste).forEach(function (k) { if (taste[k] < 0) taste[k] = 0; tot += taste[k]; });
      if (tot) Object.keys(taste).forEach(function (k) { taste[k] /= tot; });
      var order = Object.keys(taste).sort(function (a, b) { return taste[b] - taste[a]; });

      var hr = new Date().getHours(), day = new Date().getDay();
      var night = hr >= 22 || hr < 4, famTime = (day === 0 || day === 6) && hr >= 8 && hr < 18;

      function ok(c) {
        var k = keyOf(c);
        return k && !exclude[k] && (c.poster_path || c.backdrop_path) && !c.adult && !notOut(c) &&
               !(c.genre_ids || []).some(function (id) { return SKIP_GENRES[id]; });
      }

      var pool = {};
      seeds.forEach(function (s, si) {
        var inf = info[si];
        if (!inf) return;
        inf.recs.forEach(function (c, pos) {
          var k = keyOf(c);
          if (!k) return;
          var e = pool[k] || (pool[k] = { item: c, rec: 0, neg: 0, hits: 0, from: [] });
          var part = Math.abs(s.w) * (1 - pos / 40);
          if (s.neg) { e.neg += part; return; }
          e.rec += part; e.hits += 1; e.from.push(si);
        });
      });
      var ranked = Object.keys(pool).map(function (k) { return pool[k]; })
        .filter(function (e) { return e.hits > 0 && ok(e.item); });
      ranked.forEach(function (e) {
        var c = e.item, k = keyOf(c), gs = 0;
        (c.genre_ids || []).forEach(function (id) { gs += taste[g(id)] || 0; });
        var sc = e.rec * (1 + 0.35 * (e.hits - 1)) + 1.2 * gs + 0.05 * (Math.log(1 + (c.popularity || 0)) / Math.LN10);
        sc -= 0.9 * e.neg;
        sc *= Math.pow(bayes(c) / 7, 3);
        if (Number(c.vote_count || 0) < 50) sc *= 0.6;
        var imp = sig.imp[k];
        if (imp && !sig.clk[k] && imp[0] > 2) sc *= Math.pow(0.8, imp[0] - 2);
        var d = c.release_date || c.first_air_date || '';
        if (d && (new Date().getTime() - new Date(d).getTime()) < 730 * 86400000) sc *= 1.08;
        var gids = (c.genre_ids || []).map(g);
        if (night && gids.some(function (x) { return x === 27 || x === 53 || x === 9648 || x === 80; })) sc *= 1.06;
        if (famTime && (taste[10751] || taste[16]) && gids.some(function (x) { return x === 10751 || x === 16; })) sc *= 1.05;
        e.score = sc;
      });
      ranked.sort(function (a, b) { return b.score - a.score; });

      var tvShare = watched.slice(0, 10).filter(function (i) { return i.kind === 'tv'; }).length / Math.max(1, Math.min(10, watched.length));
      var perSeed = {}, top = [], used = {}, gCount = {}, tCount = { movie: 0, tv: 0 }, left = ranked.slice();
      while (top.length < 20 && left.length) {
        var bi = 0, bs = -1e9;
        for (var i = 0; i < Math.min(left.length, 40); i++) {
          var e = left[i], g0 = g((e.item.genre_ids || [])[0]);
          var adj = e.score * Math.pow(0.88, gCount[g0] || 0);
          var isTv = e.item.media_type === 'tv';
          var over = (isTv ? tCount.tv : tCount.movie) + 1 - (top.length + 1) * (isTv ? tvShare : 1 - tvShare);
          if (over > 1) adj *= Math.pow(0.8, over - 1);
          if ((perSeed[e.from[0]] || 0) >= 4 && e.hits < 2) adj *= 0.4;
          if (adj > bs) { bs = adj; bi = i; }
        }
        var pick = left.splice(bi, 1)[0], tk = titleKey(pick.item);
        if (used[tk]) continue;
        used[tk] = 1;
        perSeed[pick.from[0]] = (perSeed[pick.from[0]] || 0) + 1;
        var pg = g((pick.item.genre_ids || [])[0]);
        gCount[pg] = (gCount[pg] || 0) + 1;
        tCount[pick.item.media_type === 'tv' ? 'tv' : 'movie']++;
        top.push(pick.item);
      }
      var early = {};
      top.slice(0, 8).forEach(function (c) { early[keyOf(c)] = 1; });

      var useTv = watched.slice(0, 8).filter(function (i) { return i.kind === 'tv'; }).length > 4;
      var colls = {};
      seeds.forEach(function (s, si) {
        var inf = info[si];
        if (inf && inf.coll && s.watched && !colls[inf.coll.id]) colls[inf.coll.id] = s.id;
      });
      var kwTop = Object.keys(kwT).filter(function (k) { return Object.keys(kwSeeds[k]).length >= 2; })
        .sort(function (a, b) { return kwT[b] - kwT[a]; })[0];
      var pTop = Object.keys(ppl).filter(function (p) { return Object.keys(pplSeeds[p]).length >= 2; })
        .sort(function (a, b) { return ppl[b] - ppl[a]; })[0];
      var fav = order[0];
      if ((fav === '18' || fav === '35') && order[1] && taste[order[1]] >= taste[fav] * 0.6) fav = order[1];
      var gid = fav ? (useTv ? (TV_OF[fav] || fav) : fav) : null;
      var kindAll = function (arr, t) { return (arr || []).map(function (r) { r.media_type = kindOf(r, t); return r; }); };

      return Promise.all([
        tmdb('/trending/all/week').then(function (d) { return kindAll(d && d.results); }),
        Promise.all(Object.keys(colls).slice(0, 3).map(function (cid) {
          return tmdb('/collection/' + cid).then(function (d) {
            var parts = kindAll((d && d.parts) || [], 'movie').filter(function (p) { return p.release_date; })
              .sort(function (a, b) { return a.release_date < b.release_date ? -1 : 1; });
            var last = -1;
            parts.forEach(function (p, n) { if (exclude[keyOf(p)] || String(p.id) === String(colls[cid])) last = n; });
            return parts.slice(last + 1).filter(ok)[0] || null;
          });
        })),
        kwTop ? tmdb('/discover/' + (useTv ? 'tv' : 'movie') + '?with_keywords=' + kwTop + '&sort_by=popularity.desc&vote_count.gte=' + (useTv ? 80 : 200))
          .then(function (d) { return kindAll(d && d.results, useTv ? 'tv' : 'movie'); }) : Promise.resolve([]),
        pTop ? tmdb('/person/' + pTop + '/combined_credits').then(function (d) {
          var s2 = {};
          return ((d && d.cast) || []).filter(function (c) { return (c.order == null || c.order < 6) && !/himself|herself|self/i.test(c.character || ''); })
            .concat(((d && d.crew) || []).filter(function (c) { return /^(Director|Creator|Writer|Screenplay)$/.test(c.job || ''); }))
            .filter(function (c) { return Number(c.vote_count || 0) >= 300 && !(c.genre_ids || []).some(function (x) { return x === 99 || SKIP_GENRES[x]; }); })
            .sort(function (a, b) { return bayes(b) - bayes(a); })
            .filter(function (c) { var k = keyOf(c); if (s2[k]) return false; s2[k] = 1; return true; });
        }) : Promise.resolve([]),
        fav && GENRES[fav] ? tmdb(useTv
          ? '/discover/tv?with_genres=' + gid + '&sort_by=popularity.desc&vote_count.gte=150&vote_average.gte=7'
          : '/discover/movie?with_genres=' + gid + '&sort_by=popularity.desc&vote_count.gte=400&vote_average.gte=6.8')
          .then(function (d) { return kindAll(d && d.results, useTv ? 'tv' : 'movie'); }) : Promise.resolve([])
      ]).then(function (res) {
        var explore = res[0] || [], nexts = (res[1] || []).filter(Boolean);
        var rows = [];
        if (nexts.length) {
          rows.push({ id: 'fy-next', title: 'Up Next in Your Series', sub: 'the next film in series you started', items: nexts });
          nexts.forEach(function (c) { early[keyOf(c)] = 1; });
        }
        top = top.filter(function (c) { return !nexts.some(function (n) { return keyOf(n) === keyOf(c); }); });
        var roots = seeds.filter(function (s) { return s.watched && s.name; })
          .map(function (s) { return titleKey({ title: s.name }); }).filter(function (t) { return t.length >= 4; });
        top = top.filter(function (c) {
          var t = titleKey(c);
          return !roots.some(function (r) { return t !== r && t.indexOf(r) === 0; });
        });
        var top3 = order.slice(0, 3).map(String);
        var ex = explore.filter(function (c) {
          var gids = (c.genre_ids || []).map(function (x) { return String(g(x)); });
          return (c.media_type === 'movie' || c.media_type === 'tv') && ok(c) && !early[keyOf(c)] && !used[titleKey(c)] &&
                 Number(c.vote_average || 0) >= 7 && Number(c.vote_count || 0) >= 200 &&
                 gids.some(function (x) { return top3.indexOf(x) >= 0; }) && (gids.indexOf('16') < 0 || top3.indexOf('16') >= 0);
        }).slice(0, 3);
        [4, 9, 14].forEach(function (slot, n) { if (ex[n] && top.length >= slot) top.splice(slot, 0, ex[n]); });
        if (top.length >= 6) rows.push({ id: 'fy-top', title: 'Top Picks for ' + (o.name || 'You'), sub: 'based on what you watch', items: top.slice(0, 22) });

        var because = [];
        seeds.forEach(function (s, si) {
          if (because.length >= 2 || !s.watched || !info[si]) return;
          var items = [], s3 = {};
          info[si].recs.forEach(function (c, pos) {
            var k = keyOf(c);
            if (!ok(c) || early[k] || s3[k]) return;
            s3[k] = 1;
            items.push({ c: c, s: (1 - pos / 40) * Math.pow(bayes(c) / 7, 3) });
          });
          items = items.sort(function (a, b) { return b.s - a.s; }).map(function (x) { return x.c; });
          if (items.length >= 6) because.push({ id: 'fy-bw' + because.length, title: 'Because You Watched ' + s.name, items: items.slice(0, 20) });
        });
        if (because[0]) rows.push(because[0]);
        var kw = (res[2] || []).filter(function (c) { return ok(c) && !early[keyOf(c)]; });
        if (kwTop && kw.length >= 6) rows.push({ id: 'fy-kw', title: 'More ' + cap(kwName[kwTop]), sub: 'a theme you keep watching', items: kw });
        if (because[1]) rows.push(because[1]);
        var pi = (res[3] || []).filter(function (c) { return ok(c) && !early[keyOf(c)]; });
        if (pTop && pi.length >= 5) rows.push({ id: 'fy-person', title: 'More from ' + pplName[pTop], sub: 'they\'re in a lot of what you watch', items: pi });
        var gi = (res[4] || []).filter(function (c) { return ok(c) && !early[keyOf(c)]; });
        if (fav && GENRES[fav] && gi.length >= 6) rows.push({ id: 'fy-genre', title: GENRES[fav] + ' Picks for You', sub: 'because you watch a lot of ' + GENRES[fav].toLowerCase(), items: gi });
        return rows;
      });
    });
  };

  /* App history (sharkytv_continue / sharkytv_progress / sharkytv_mylist) ->
     the shape build() wants. Progress keeps finished titles too, which the
     Continue Watching row drops, so it's the better record of what was
     watched. Shows: depth from how many episodes got past 20%. */
  R.appHistory = function () {
    function read(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
    var titles = {};
    function add(kind, id, at, isEp, pct) {
      var k = kind + ':' + id;
      var t = titles[k] || (titles[k] = { id: id, kind: kind, at: 0, eps: 0 });
      if ((at || 0) > t.at) t.at = at || 0;
      if (isEp && (pct == null || pct >= 20)) t.eps++;
    }
    /* Only what was REALLY watched: 3+ minutes in, or 10 percent. Opening
       something for two seconds to test it must not count. */
    var real = function (x) { return x && ((x.t || 0) >= 180 || (x.pct || 0) >= 10); };
    var prog = read('sharkytv_progress', {}) || {};
    Object.keys(prog).forEach(function (k) {
      var p = k.split(':');
      if (!real(prog[k])) return;
      if (p[0] === 'tv') add('tv', p[1], prog[k].at, true, prog[k].pct);
      else if (p[0] === 'movie') add('movie', p[1], prog[k].at, false);
    });
    (read('sharkytv_continue', []) || []).forEach(function (r) {
      if (real(r)) add(r.kind === 'tv' ? 'tv' : 'movie', r.id, r.at, false);
    });
    var now = new Date().getTime();
    var watched = Object.keys(titles).map(function (k) {
      var t = titles[k];
      var days = (now - (t.at || now)) / 86400000;
      t.depth = t.kind !== 'tv' ? 1 : (t.eps <= 1 && days > 14 ? 0.5 : 1 + Math.min(1, t.eps / 6));
      return t;
    }).sort(function (a, b) { return b.at - a.at; });
    var list = (read('sharkytv_mylist', []) || []).map(function (r) { return { id: r.id, kind: r.kind === 'tv' ? 'tv' : 'movie' }; });
    return { watched: watched, list: list };
  };

  /* ── Smarter search (same rules as the website) ────────────────────────
     One flat list, best first: "did you mean" fixes for typos, then title
     matches, then the person (if it's an actor/director's name), then the
     genre ("horror", "funny films", "kids shows"), then a topic ("zombie").
     Returns raw TMDB objects with media_type set. */
  var SEARCH_GENRES = [
    [['action'], 28, 10759], [['adventure'], 12, 10759],
    [['animation', 'animated', 'anime', 'cartoon', 'cartoons'], 16, 16],
    [['comedy', 'comedies', 'funny', 'comedic'], 35, 35], [['crime', 'gangster', 'gangsters'], 80, 80],
    [['documentary', 'documentaries', 'doc', 'docs'], 99, 99], [['drama', 'dramas'], 18, 18],
    [['family', 'kids', 'kid', 'children', 'childrens'], 10751, 10762], [['fantasy'], 14, 10765],
    [['history', 'historical'], 36, null], [['horror', 'horrors', 'scary'], 27, null],
    [['music', 'musical', 'musicals'], 10402, null], [['mystery', 'mysteries'], 9648, 9648],
    [['romance', 'romantic', 'romcom', 'rom com'], 10749, null],
    [['sci fi', 'scifi', 'sci-fi', 'science fiction', 'sf'], 878, 10765],
    [['thriller', 'thrillers', 'suspense'], 53, null], [['war'], 10752, 10768],
    [['western', 'westerns', 'cowboy'], 37, 37], [['reality', 'reality tv'], null, 10764]
  ];
  function intent(q) {
    var low = String(q).toLowerCase().replace(/[^a-z0-9\- ]+/g, ' ').replace(/\s+/g, ' ').replace(/^ | $/g, '');
    var only = null;
    if (/\b(movies?|films?)\b/.test(low)) only = 'movie';
    else if (/\b(shows?|tv|series|programmes?|programs?)\b/.test(low)) only = 'tv';
    var core = low.replace(/\b(movies?|films?|shows?|tv|series|programmes?|programs?|the best|best|top|good)\b/g, ' ')
      .replace(/\s+/g, ' ').replace(/^ | $/g, '');
    var flat = core.replace(/-/g, ' '), genre = null;
    for (var i = 0; i < SEARCH_GENRES.length && !genre; i++) {
      for (var j = 0; j < SEARCH_GENRES[i][0].length; j++) {
        var a = SEARCH_GENRES[i][0][j];
        if (a === core || a === flat) { genre = SEARCH_GENRES[i]; break; }
      }
    }
    return { core: core || low, only: only, genre: genre };
  }
  R.searchIntent = intent;

  function compact(v) {
    return String(v || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
  }
  function edit(a, b) {
    var n = a.length, m = b.length, i, j;
    if (!n) return m; if (!m) return n;
    var p2 = null, p1 = [];
    for (j = 0; j <= m; j++) p1.push(j);
    for (i = 1; i <= n; i++) {
      var cur = [i];
      for (j = 1; j <= m; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        var v = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + cost);
        if (p2 && i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) v = Math.min(v, p2[j - 2] + 1);
        cur.push(v);
      }
      p2 = p1; p1 = cur;
    }
    return p1[m];
  }
  function sim1(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    var whole = 1 - edit(a, b) / Math.max(a.length, b.length), start = 0;
    if (a.length >= 4 && b.length > a.length) {
      var head = b.slice(0, a.length + 1);
      start = (1 - Math.min(edit(a, head), edit(a, head.slice(0, a.length))) / a.length) * 0.92;
    }
    return Math.max(whole, start);
  }
  var STOP = { the: 1, a: 1, an: 1, of: 1, and: 1 };
  function sound(x) { return x.replace(/^kn/, 'n').replace(/gh/g, '').replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/(.)\1+/g, '$1').replace(/e$/, ''); }
  function words(v) { return String(v || '').toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter(function (x) { return x && !STOP[x]; }); }
  function wordSim(q, t) {
    var qa = words(q), ta = words(t);
    if (qa.length < 2 || !ta.length || ta.length > qa.length + 3) return 0;
    var tot = 0, got = 0, from = 0;
    qa.forEach(function (x) {
      var best = 0, at = from;
      for (var j = from; j < ta.length; j++) {
        var y = ta[j], xs = sound(x), ys = sound(y);
        var sc = Math.max(1 - edit(x, y) / Math.max(x.length, y.length),
                          xs && ys ? (1 - edit(xs, ys) / Math.max(xs.length, ys.length)) * 0.97 : 0);
        if (sc > best) { best = sc; at = j; }
      }
      if (best >= 0.5) from = at + 1;
      tot += x.length; got += x.length * best;
    });
    return (got / tot) * 0.95;
  }
  var art = function (c) { return c.replace(/^(the|a|an)(?=[a-z0-9]{3})/, ''); };
  function similarity(q, t) {
    var a = compact(q), b = compact(t);
    return Math.max(sim1(a, b), sim1(art(a), art(b)), wordSim(q, t));
  }
  R.similarity = similarity;

  var IDX_KEY = 'sharky:search-index:app1', idxP = null;
  function index(tmdb) {
    if (idxP) return idxP;
    idxP = (function () {
      try {
        var c = JSON.parse(localStorage.getItem(IDX_KEY) || 'null');
        if (c && new Date().getTime() - c.t < 86400000 && c.items && c.items.length > 200) return Promise.resolve(c.items);
      } catch (e) {}
      var eps = [];
      var addPages = function (ep, n, kind) { for (var i = 1; i <= n; i++) eps.push([ep + (ep.indexOf('?') >= 0 ? '&' : '?') + 'page=' + i, kind]); };
      addPages('/movie/popular', 15, 'movie'); addPages('/movie/top_rated', 10, 'movie');
      addPages('/tv/popular', 8, 'tv'); addPages('/tv/top_rated', 8, 'tv'); addPages('/trending/all/week', 3, null);
      return Promise.all(eps.map(function (e) {
        return Promise.resolve(tmdb(e[0])).then(function (d) {
          return ((d && d.results) || []).map(function (r) { r.media_type = kindOf(r, e[1]); return r; });
        }).catch(function () { return []; });
      })).then(function (lists) {
        var seen = {}, items = [];
        lists.forEach(function (l) {
          l.forEach(function (r) {
            var k = keyOf(r);
            if (!k || seen[k] || !(r.poster_path || r.backdrop_path)) return;
            seen[k] = 1;
            items.push({ id: r.id, media_type: r.media_type, title: r.title || r.name, poster_path: r.poster_path,
                         backdrop_path: r.backdrop_path, vote_average: r.vote_average, popularity: r.popularity || 0,
                         release_date: r.release_date || r.first_air_date || '', overview: (r.overview || '').slice(0, 200) });
          });
        });
        try { localStorage.setItem(IDX_KEY, JSON.stringify({ t: new Date().getTime(), items: items })); } catch (e) {}
        return items;
      });
    })().catch(function () { idxP = null; return []; });
    return idxP;
  }
  R.warmSearch = function (tmdb) { index(tmdb); };

  R.search = function (q, tmdbFn) {
    var tmdb = function (p) { return Promise.resolve(tmdbFn(p)).catch(function () { return null; }); };
    var it = intent(q), core = it.core, only = it.only, genre = it.genre, enc = encodeURIComponent, t = today();
    var wantM = only !== 'tv', wantT = only !== 'movie';
    var idx = Promise.race ? Promise.race([index(tmdbFn), new Promise(function (r) { setTimeout(function () { r([]); }, 3000); })]) : index(tmdbFn);
    return Promise.all([
      tmdb('/search/multi?query=' + enc(q) + '&include_adult=false'),
      core !== String(q).toLowerCase() ? tmdb('/search/multi?query=' + enc(core) + '&include_adult=false') : null,
      genre && genre[1] && wantM ? tmdb('/discover/movie?with_genres=' + genre[1] + '&sort_by=popularity.desc&vote_count.gte=300&primary_release_date.lte=' + t) : null,
      genre && genre[2] && wantT ? tmdb('/discover/tv?with_genres=' + genre[2] + '&sort_by=popularity.desc&vote_count.gte=100&first_air_date.lte=' + t) : null,
      !genre && core.length >= 3 ? tmdb('/search/keyword?query=' + enc(core)) : null,
      idx
    ]).then(function (R0) {
      var seen = {}, out = [];
      var take = function (arr, kind) {
        (arr || []).forEach(function (r) {
          r.media_type = kindOf(r, kind);
          if ((r.media_type !== 'movie' && r.media_type !== 'tv') || !(r.poster_path || r.backdrop_path)) return;
          if (only && r.media_type !== only) return;
          var k = keyOf(r);
          if (seen[k]) return;
          seen[k] = 1;
          out.push(r);
        });
      };
      var multi = ((R0[0] && R0[0].results) || []).concat((R0[1] && R0[1].results) || []);
      var titles = multi.filter(function (r) { return r.media_type !== 'person'; });
      var best = 0;
      titles.slice(0, 10).forEach(function (r) { best = Math.max(best, similarity(core, r.title || r.name)); });
      var jobs = [];
      /* Typos: close matches from the local list of well-known titles. */
      var fuzzy = [];
      if (!genre && best < 0.9) {
        var fs = {};
        fuzzy = (R0[5] || []).filter(function (r) { var k = keyOf(r); if (fs[k]) return false; fs[k] = 1; return true; })
          .map(function (r) { return { r: r, s: similarity(core, r.title) }; })
          .filter(function (x) { return x.s >= 0.7 && x.s > best; })
          .sort(function (a, b) { return (b.s - a.s) || ((b.r.popularity || 0) - (a.r.popularity || 0)); })
          .slice(0, 8).map(function (x) { return x.r; });
        if (fuzzy.length) jobs.push(tmdb('/search/multi?query=' + enc(fuzzy[0].title) + '&include_adult=false').then(function (d) { return d && d.results; }));
      }
      var person = genre ? null : multi.filter(function (r) {
        if (r.media_type !== 'person' || (r.popularity || 0) <= 1) return false;
        var pk = titleKey({ title: r.name }), ck = titleKey({ title: core });
        return pk === ck || (ck.indexOf(' ') > 0 && pk.indexOf(ck) >= 0);
      })[0];
      jobs.push(person ? tmdb('/person/' + person.id + '/combined_credits').then(function (d) {
        return ((d && d.cast) || []).concat(((d && d.crew) || []).filter(function (c) { return c.job === 'Director' || c.job === 'Creator'; }))
          .filter(function (c) { return !(c.genre_ids || []).some(function (g2) { return g2 === 10767 || g2 === 10763 || g2 === 10764 || g2 === 99; }) &&
                                         !/\b(self|himself|herself|host|guest)\b/i.test(c.character || ''); })
          .sort(function (a, b) { return (b.vote_count || 0) - (a.vote_count || 0); }).slice(0, 30);
      }) : null);
      var kwHit = !genre ? ((R0[4] && R0[4].results) || []).filter(function (k) { return (k.name || '').toLowerCase() === core; })[0] : null;
      jobs.push(kwHit ? Promise.all([
        wantM ? tmdb('/discover/movie?with_keywords=' + kwHit.id + '&sort_by=popularity.desc&vote_count.gte=20&primary_release_date.lte=' + t) : null,
        wantT ? tmdb('/discover/tv?with_keywords=' + kwHit.id + '&sort_by=popularity.desc&first_air_date.lte=' + t) : null
      ]) : null);
      return Promise.all(jobs.length ? jobs : [null]).then(function (more) {
        var fix = fuzzy.length ? more.shift() : null;
        var pc = more.shift(), kws = more.shift();
        var ck = titleKey({ title: core });
        var sortedTitles = titles.map(function (r, n) { return { r: r, n: n, ex: titleKey(r) === ck ? 1 : 0 }; })
          .sort(function (a, b) { return (b.ex - a.ex) || (a.n - b.n); }).map(function (x) { return x.r; });
        if (person) take(pc);
        take(fuzzy); take((fix || []).filter(function (r) { return r.media_type !== 'person'; }).slice(0, 12));
        take(sortedTitles);
        if (genre) {
          var gm = ((R0[2] && R0[2].results) || []).map(function (r) { r.media_type = 'movie'; return r; });
          var gt = ((R0[3] && R0[3].results) || []).map(function (r) { r.media_type = 'tv'; return r; });
          var gl = gm.concat(gt).sort(function (a, b) { return (b.popularity || 0) - (a.popularity || 0); });
          take(gl);
        }
        if (kws) {
          take(((kws[0] && kws[0].results) || []).map(function (r) { r.media_type = 'movie'; return r; })
            .concat(((kws[1] && kws[1].results) || []).map(function (r) { r.media_type = 'tv'; return r; }))
            .sort(function (a, b) { return (b.popularity || 0) - (a.popularity || 0); }));
        }
        return { items: out, didYouMean: fuzzy.length ? (fuzzy[0].title || '') : '' };
      });
    });
  };

  /* ── Coming soon ───────────────────────────────────────────────────── */
  R.comingText = function (date) {
    var d = new Date(String(date).slice(0, 10) + 'T00:00:00');
    if (isNaN(d.getTime())) return 'Coming soon';
    var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return 'Coming ' + d.getDate() + ' ' + M[d.getMonth()] + ' ' + d.getFullYear();
  };
  R.isNotOut = function (date) { return !!date && String(date).slice(0, 10) > today(); };
  /* Popular films + shows coming out after today (24 max, poster needed). */
  R.comingSoon = function (tmdbFn) {
    var d = new Date(); d.setDate(d.getDate() + 1);
    var z = function (n) { return (n < 10 ? '0' : '') + n; };
    var from = d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
    var get = function (p, kind) {
      return Promise.resolve(tmdbFn(p)).then(function (j) {
        return ((j && j.results) || []).map(function (r) { r.media_type = kind; return r; });
      }).catch(function () { return []; });
    };
    return Promise.all([
      get('/discover/movie?primary_release_date.gte=' + from + '&sort_by=popularity.desc&include_adult=false', 'movie'),
      get('/discover/tv?first_air_date.gte=' + from + '&sort_by=popularity.desc&include_adult=false', 'tv')
    ]).then(function (two) {
      return two[0].concat(two[1]).filter(function (r) { return notOut(r) && r.poster_path && (r.backdrop_path || r.overview); })
        .sort(function (a, b) { return (b.popularity || 0) - (a.popularity || 0); }).slice(0, 24);
    });
  };
  /* A small message at the bottom of the screen (the TV app has none). */
  R.toast = function (msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:6%;-webkit-transform:translateX(-50%);transform:translateX(-50%);' +
      'z-index:2147483646;background:#fff;color:#111;font-weight:700;font-size:22px;padding:14px 26px;border-radius:999px;' +
      'box-shadow:0 8px 30px rgba(0,0,0,.5);font-family:inherit';
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
  };

  R.keyOf = keyOf;
  R.notOut = notOut;
  w.SharkyReco = R;
})(window);
