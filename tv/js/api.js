/* api.js — TMDB for the artwork, the Sharky API for everything real.
 *
 * Two rules shape this file:
 *   1. The API runs on a single CPU that is also transcoding video, so the
 *      library check is batched, capped and cached rather than fired off per
 *      card the way a browser app could get away with.
 *   2. Nothing here is allowed to leave the screen empty. Every call fails
 *      open: if TMDB is slow or the library check errors we show more than we
 *      should rather than less, because a wrong-but-full row beats a blank one.
 */
(function (w) {
  'use strict';

  var libCache = {};        // "movie:123" -> true/false, for this run
  var tmdbCache = {};       // endpoint -> normalised results
  var artCache = {};        // "tv:1396" -> logo url ('' when there isn't one)
  var extraCache = {};      // "tv:1396" -> {genres, episodes, cert, ...}

  function timeout(ms, promise) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () {
        if (!done) { done = true; reject(new Error('timeout')); }
      }, ms);
      promise.then(function (v) {
        if (done) return;
        done = true; clearTimeout(t); resolve(v);
      }, function (e) {
        if (done) return;
        done = true; clearTimeout(t); reject(e);
      });
    });
  }

  function year(v) {
    var d = v || '';
    return d ? String(d).slice(0, 4) : '';
  }

  /* One shape for everything the UI touches, whatever endpoint it came from. */
  function normalise(raw, forcedKind) {
    if (!raw) return null;
    var kind = forcedKind || raw.media_type || (raw.first_air_date || raw.name ? 'tv' : 'movie');
    if (kind !== 'tv' && kind !== 'movie') return null;
    var id = raw.id;
    if (id == null) return null;
    return {
      id: id,
      kind: kind,
      title: raw.title || raw.name || 'Untitled',
      year: year(raw.release_date || raw.first_air_date),
      overview: raw.overview || '',
      poster: raw.poster_path ? CFG.IMG_POSTER + raw.poster_path : '',
      card: raw.backdrop_path ? CFG.IMG_CARD + raw.backdrop_path : (raw.poster_path ? CFG.IMG_POSTER + raw.poster_path : ''),
      backdrop: raw.backdrop_path ? CFG.IMG_BACKDROP + raw.backdrop_path : '',
      rating: raw.vote_average ? Number(raw.vote_average).toFixed(1) : '',
      key: kind + ':' + id
    };
  }

  function tmdb(endpoint) {
    var sep = endpoint.indexOf('?') >= 0 ? '&' : '?';
    var url = CFG.TMDB_BASE + endpoint + sep + 'api_key=' + CFG.TMDB_KEY + '&language=en-US';
    return timeout(15000, fetch(url)).then(function (r) {
      if (!r.ok) throw new Error('TMDB ' + r.status);
      return r.json();
    });
  }

  var API = {
    normalise: normalise,

    tmdb: tmdb,

    /* A row's worth of titles, several TMDB pages deep and de-duplicated. */
    list: function (endpoint, kind, pages) {
      pages = pages || CFG.ROW_PAGES;
      var cacheKey = endpoint + '|' + kind + '|' + pages;
      if (tmdbCache[cacheKey]) return Promise.resolve(tmdbCache[cacheKey]);

      var jobs = [];
      for (var p = 1; p <= pages; p++) {
        jobs.push(tmdb(withPage(endpoint, p)).catch(function () { return null; }));
      }
      return Promise.all(jobs).then(function (pagesOut) {
        var seen = {}, out = [];
        pagesOut.forEach(function (d) {
          ((d && d.results) || []).forEach(function (raw) {
            var item = normalise(raw, kind);
            if (!item || seen[item.key]) return;
            if (!item.card && !item.poster) return;   // no art, no card
            seen[item.key] = 1;
            out.push(item);
          });
        });
        tmdbCache[cacheKey] = out;
        return out;
      });
    },

    search: function (q) {
      if (!q || !q.trim()) return Promise.resolve([]);
      return tmdb('/search/multi?query=' + encodeURIComponent(q.trim()) + '&include_adult=false')
        .then(function (d) {
          var out = [];
          ((d && d.results) || []).forEach(function (raw) {
            if (raw.media_type !== 'movie' && raw.media_type !== 'tv') return;
            var item = normalise(raw);
            if (item && (item.card || item.poster)) out.push(item);
          });
          return out;
        })
        .catch(function () { return []; });
    },

    /* ── The title's own logo ─────────────────────────────────────────────
       The single thing that makes a billboard look like a streaming service
       rather than a web page: the show's wordmark, as its designers drew it,
       instead of the title set in whatever font the page uses. TMDB carries
       these; most big titles have one. */
    logo: function (kind, id) {
      var k = kind + ':' + id;
      if (k in artCache) return Promise.resolve(artCache[k]);
      return tmdb('/' + (kind === 'tv' ? 'tv' : 'movie') + '/' + id +
                  '/images?include_image_language=en,null')
        .then(function (d) {
          var logos = (d && d.logos) || [];
          /* Prefer English, prefer PNG (an old WebView can be odd with SVG),
             then the widest one — the billboard is a big space. */
          var best = null, bestScore = -1;
          logos.forEach(function (l) {
            if (!l.file_path) return;
            var png = l.file_path.slice(-4).toLowerCase() === '.png';
            var score = (l.iso_639_1 === 'en' ? 4000 : 0) + (png ? 2000 : 0) +
                        Math.min(1500, l.width || 0) / 10;
            /* Very wide, short logos are usually a title card rather than a
               wordmark; they look wrong scaled into the billboard. */
            if ((l.aspect_ratio || 0) > 6) score -= 2500;
            if (score > bestScore) { bestScore = score; best = l; }
          });
          artCache[k] = best ? ('https://image.tmdb.org/t/p/w500' + best.file_path) : '';
          return artCache[k];
        })
        .catch(function () { artCache[k] = ''; return ''; });
    },

    /* Genres, episode count and the age rating for this country — the line
       under the logo on the billboard. */
    extra: function (kind, id) {
      var k = kind + ':' + id;
      if (extraCache[k]) return Promise.resolve(extraCache[k]);
      var path = kind === 'tv'
        ? '/tv/' + id + '?append_to_response=content_ratings'
        : '/movie/' + id + '?append_to_response=release_dates';
      return tmdb(path).then(function (d) {
        var out = {
          genres: (d.genres || []).slice(0, 2).map(function (g) { return g.name; }),
          episodes: d.number_of_episodes || 0,
          seasons: d.number_of_seasons || 0,
          runtime: d.runtime || 0,
          cert: certFor(kind, d, CFG.REGION)
        };
        extraCache[k] = out;
        return out;
      }).catch(function () {
        extraCache[k] = { genres: [], episodes: 0, seasons: 0, runtime: 0, cert: '' };
        return extraCache[k];
      });
    },

    /* ── Top 10 in a country ──────────────────────────────────────────────
       TMDB has no per-country chart, and its `region` parameter turns out not
       to change `popular` at all — GB, US and JP come back identical. What
       DOES vary by country is what is streamable there, so these rows are
       "most popular of what people in <country> can actually watch", which is
       both honest and genuinely different per country. */
    topTen: function (kind, region) {
      var path = '/discover/' + (kind === 'tv' ? 'tv' : 'movie') +
                 '?sort_by=popularity.desc&watch_region=' + encodeURIComponent(region) +
                 '&with_watch_monetization_types=flatrate';
      return API.list(path, kind, 1).then(function (items) {
        return items.slice(0, 10);
      });
    },

    details: function (kind, id) {
      var path = (kind === 'tv' ? '/tv/' : '/movie/') + id +
                 '?append_to_response=credits,recommendations,videos';
      return tmdb(path);
    },

    /* Episodes come from our own API, not TMDB: the player already exposes
       this and it keeps the episode list identical in both places. */
    episodes: function (tvId, season) {
      return timeout(20000, fetch(CFG.API + '/episodes/' + tvId + '/' + season))
        .then(function (r) {
          if (!r.ok) throw new Error('episodes ' + r.status);
          return r.json();
        })
        .then(function (d) { return (d && d.episodes) || []; });
    },

    /* ── Which of these can we actually play? ─────────────────────────────
       Answers are cached for the life of the app run, chunked, and run a few
       at a time. Returns a map of "kind:id" -> true. A null return means the
       check could not be done at all, and the caller shows everything. */
    libraryAvailable: function (items, onProgress) {
      if (!CFG.LIBRARY_ONLY) return Promise.resolve(null);

      var uniq = {}, pending = [];
      (items || []).forEach(function (it) {
        if (!it || it.id == null) return;
        if (uniq[it.key]) return;
        uniq[it.key] = it;
        if (!(it.key in libCache)) pending.push(it);
      });

      if (!pending.length) return Promise.resolve(snapshot(uniq));

      var chunks = [];
      for (var i = 0; i < pending.length; i += CFG.LIB_CHUNK) {
        chunks.push(pending.slice(i, i + CFG.LIB_CHUNK));
      }

      var answered = false, done = 0;
      var next = 0;

      function runOne() {
        if (next >= chunks.length) return Promise.resolve();
        var chunk = chunks[next++];
        var body = { items: chunk.map(function (x) {
          return { id: x.id, title: x.title, year: x.year || '', kind: x.kind };
        }) };
        /* Long timeout on purpose: a sleeping Render box takes most of a
           minute to answer its first request. */
        return timeout(90000, fetch(CFG.API + '/library/filter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })).then(function (r) {
          if (!r.ok) throw new Error('library ' + r.status);
          return r.json();
        }).then(function (d) {
          answered = true;
          var keep = {};
          (d.available_keys || []).forEach(function (k) { keep[String(k)] = 1; });
          if (!d.available_keys && d.available) {
            /* Older server: ids only, so map them back onto this chunk. */
            var ids = {};
            d.available.forEach(function (id) { ids[String(id)] = 1; });
            chunk.forEach(function (x) { if (ids[String(x.id)]) keep[x.key] = 1; });
          }
          chunk.forEach(function (x) { libCache[x.key] = !!keep[x.key]; });
        }).catch(function (e) {
          /* Leave this chunk unknown rather than marking it unplayable —
             an error must never delete titles from the screen. */
          console.warn('[sharky] library chunk failed', e && e.message);
        }).then(function () {
          done++;
          if (onProgress) { try { onProgress(done, chunks.length); } catch (e) {} }
          return runOne();
        });
      }

      var lanes = [];
      for (var l = 0; l < Math.min(CFG.LIB_PARALLEL, chunks.length); l++) lanes.push(runOne());

      return Promise.all(lanes).then(function () {
        if (!answered) return null;
        return snapshot(uniq);
      });
    },

    /* Is the server up? Used by the splash so a cold Render box reads as
       "waking up" rather than "broken". */
    ping: function () {
      return timeout(90000, fetch(CFG.API + '/status.json', { cache: 'no-store' }))
        .then(function (r) { return r.ok; })
        .catch(function () { return false; });
    },

    embedUrl: function (item, season, episode) {
      var base = CFG.API + '/embed/';
      if ((item.kind || 'movie') === 'tv') {
        return base + 'tv/' + item.id + '/' + (season || 1) + '/' + (episode || 1) + '?tv=1';
      }
      return base + 'movie/' + item.id + '?tv=1';
    }
  };

  /* The age rating as it is written in this country, falling back to the US
     one so a card is not left bare. */
  function certFor(kind, d, region) {
    try {
      if (kind === 'tv') {
        var rows = (d.content_ratings && d.content_ratings.results) || [];
        var here = pick(rows, region), us = pick(rows, 'US');
        return (here && here.rating) || (us && us.rating) || '';
      }
      var rel = (d.release_dates && d.release_dates.results) || [];
      var r = pick(rel, region) || pick(rel, 'US');
      if (!r) return '';
      for (var i = 0; i < (r.release_dates || []).length; i++) {
        if (r.release_dates[i].certification) return r.release_dates[i].certification;
      }
    } catch (e) {}
    return '';
  }

  function pick(rows, cc) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].iso_3166_1 === cc) return rows[i];
    }
    return null;
  }

  function snapshot(uniq) {
    var out = {};
    Object.keys(uniq).forEach(function (k) {
      if (libCache[k]) out[k] = true;
    });
    /* Anything we never got an answer for stays visible. */
    Object.keys(uniq).forEach(function (k) {
      if (!(k in libCache)) out[k] = true;
    });
    return out;
  }

  function withPage(endpoint, page) {
    var clean = endpoint.replace(/([?&])page=\d+&?/, '$1').replace(/[?&]$/, '');
    return clean + (clean.indexOf('?') >= 0 ? '&' : '?') + 'page=' + page;
  }

  w.API = API;
})(window);
