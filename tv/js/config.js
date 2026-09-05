/* config.js — everything you might want to change lives here.
 *
 * The API base can be overridden at runtime from Settings, so a rebuild is
 * not needed just because the server moved. The value below is only the
 * default for a fresh install.
 */
(function (w) {
  'use strict';

  var DEFAULTS = {
    api:  'https://sharky-movies-api.onrender.com',
    tmdb: '47745852f22c21e3362f4907231538e1'
  };

  var stored = {};
  try { stored = JSON.parse(localStorage.getItem('sharkytv_settings') || '{}') || {}; }
  catch (e) { stored = {}; }

  w.CFG = {
    /* Sharky API — the player, the library check, the streams. */
    get API() { return (stored.api || DEFAULTS.api).replace(/\/+$/, ''); },
    set API(v) { stored.api = String(v || '').replace(/\/+$/, ''); save(); },

    /* TMDB — artwork and metadata only. */
    get TMDB_KEY() { return stored.tmdb || DEFAULTS.tmdb; },

    TMDB_BASE: 'https://api.themoviedb.org/3',
    IMG_POSTER: 'https://image.tmdb.org/t/p/w342',
    IMG_CARD: 'https://image.tmdb.org/t/p/w500',
    IMG_BACKDROP: 'https://image.tmdb.org/t/p/w1280',

    /* Only show titles the library can actually play. Off = show everything
       TMDB is promoting, most of which has to be scraped on demand. */
    get LIBRARY_ONLY() { return stored.libraryOnly !== false; },
    set LIBRARY_ONLY(v) { stored.libraryOnly = !!v; save(); },

    /* How many cards a row aims to show. Rows are topped up from a shared
       pool of owned titles so none of them ends up half empty. */
    ROW_TARGET: 12,

    /* Hard ceiling per row. Rows longer than this are all cost and no use:
       nobody arrows past twenty cards, and the stick has to hold every one. */
    ROW_MAX: 20,

    /* Below this a row cannot even fill the width of the screen, so it reads
       as a gap. Better to drop the row than to show a stub of one. */
    ROW_MIN: 6,

    /* TMDB pages fetched per row. More pages = a deeper pool to filter from,
       at the cost of a slower first paint. */
    ROW_PAGES: 3,

    /* Items per /library/filter request. The server caps this at 80. */
    LIB_CHUNK: 40,

    /* Parallel library requests. The API runs on one CPU that is also doing
       the transcoding, so this stays deliberately small. */
    LIB_PARALLEL: 3,

    /* Which country's charts the Top 10 rows show. Worked out from the
       device unless Settings overrides it. */
    get REGION() {
      if (stored.region) return stored.region;
      try { return w.Region ? w.Region.detect() : 'GB'; } catch (e) { return 'GB'; }
    },
    set REGION(v) { stored.region = String(v || '').toUpperCase() || null; save(); },
    get REGION_IS_SET() { return !!stored.region; },
    clearRegion: function () { delete stored.region; save(); },

    VERSION: '1.1.0',

    reset: function () { stored = {}; save(); }
  };

  function save() {
    try { localStorage.setItem('sharkytv_settings', JSON.stringify(stored)); }
    catch (e) {}
  }

  w.CFG.DEFAULT_API = DEFAULTS.api;
})(window);
