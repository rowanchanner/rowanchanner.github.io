/* store.js — what the television remembers.
 *
 * Continue Watching, My List and per-episode progress, all local to the
 * device. Nothing here talks to the network: the player posts its position
 * out to us and we file it away, which is what lets the home screen show a
 * real progress bar instead of a flat "watched" tick.
 */
(function (w) {
  'use strict';

  var K_CONTINUE = 'sharkytv_continue';
  var K_LIST     = 'sharkytv_mylist';
  var K_PROGRESS = 'sharkytv_progress';

  var MAX_CONTINUE = 30;
  var MAX_PROGRESS = 400;

  function read(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }

  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  }

  /* A stable identity for one playable thing: a film, or one episode. */
  function key(item) {
    var kind = item.kind || item.media_type || 'movie';
    if (kind === 'tv') {
      return 'tv:' + item.id + ':' + (Number(item.season) || 1) + ':' + (Number(item.episode) || 1);
    }
    return 'movie:' + item.id;
  }

  var Store = {
    key: key,

    /* ── Continue watching ────────────────────────────────────────────── */

    continueList: function () {
      var rows = read(K_CONTINUE, []);
      if (!Array.isArray(rows)) return [];
      return rows.slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    },

    /* Called every few seconds while something plays. Finished titles drop
       off the row rather than sitting there at 100%. */
    touch: function (item, pct, t, d) {
      var rows = read(K_CONTINUE, []);
      if (!Array.isArray(rows)) rows = [];
      var k = key(item);
      rows = rows.filter(function (r) { return r.key !== k; });

      var done = pct >= 92;
      if (!done) {
        rows.unshift({
          key: k,
          id: item.id,
          kind: item.kind || item.media_type || 'movie',
          title: item.title || '',
          poster: item.poster || '',
          backdrop: item.backdrop || '',
          season: Number(item.season) || 0,
          episode: Number(item.episode) || 0,
          epName: item.epName || '',
          pct: Math.max(0, Math.min(100, Math.round(pct || 0))),
          t: Math.floor(t || 0),
          d: Math.floor(d || 0),
          at: Date.now()
        });
      }
      write(K_CONTINUE, rows.slice(0, MAX_CONTINUE));
      Store.setProgress(item, pct, t, d);
    },

    /* Finishing an episode should advance the row to the next one rather
       than leaving the one you just watched sitting at the front. */
    dropContinue: function (item) {
      var k = key(item);
      var rows = read(K_CONTINUE, []).filter(function (r) { return r.key !== k; });
      write(K_CONTINUE, rows);
    },

    clearContinue: function () { write(K_CONTINUE, []); },

    /* Where to resume a show: the most recent episode we have a position
       for, so "Play" on a series picks up where the viewer left off. */
    resumePoint: function (tvId) {
      var best = null;
      Store.continueList().forEach(function (r) {
        if (r.kind !== 'tv' || String(r.id) !== String(tvId)) return;
        if (!best || (r.at || 0) > (best.at || 0)) best = r;
      });
      return best;
    },

    /* ── Per-episode / per-film progress ──────────────────────────────── */

    setProgress: function (item, pct, t, d) {
      var all = read(K_PROGRESS, {});
      if (!all || typeof all !== 'object') all = {};
      var k = key(item);
      var prev = all[k] || {};
      all[k] = {
        pct: Math.max(prev.pct || 0, Math.max(0, Math.min(100, Math.round(pct || 0)))),
        t: Math.floor(t || 0),
        d: Math.floor(d || 0),
        at: Date.now()
      };
      var keys = Object.keys(all);
      if (keys.length > MAX_PROGRESS) {
        keys.sort(function (a, b) { return (all[a].at || 0) - (all[b].at || 0); });
        keys.slice(0, keys.length - MAX_PROGRESS).forEach(function (x) { delete all[x]; });
      }
      write(K_PROGRESS, all);
    },

    progress: function (item) {
      var all = read(K_PROGRESS, {});
      return (all && all[key(item)]) || null;
    },

    /* ── My list ──────────────────────────────────────────────────────── */

    list: function () {
      var rows = read(K_LIST, []);
      return Array.isArray(rows) ? rows : [];
    },

    inList: function (item) {
      var kind = item.kind || item.media_type || 'movie';
      return Store.list().some(function (r) {
        return String(r.id) === String(item.id) && (r.kind || 'movie') === kind;
      });
    },

    toggleList: function (item) {
      var kind = item.kind || item.media_type || 'movie';
      var rows = Store.list();
      var had = Store.inList(item);
      if (had) {
        rows = rows.filter(function (r) {
          return !(String(r.id) === String(item.id) && (r.kind || 'movie') === kind);
        });
      } else {
        rows.unshift({
          id: item.id, kind: kind,
          title: item.title || '',
          poster: item.poster || '',
          backdrop: item.backdrop || '',
          year: item.year || '',
          at: Date.now()
        });
      }
      write(K_LIST, rows.slice(0, 200));
      return !had;
    },

    clearAll: function () {
      [K_CONTINUE, K_LIST, K_PROGRESS].forEach(function (k) {
        try { localStorage.removeItem(k); } catch (e) {}
      });
    }
  };

  w.Store = Store;
})(window);
