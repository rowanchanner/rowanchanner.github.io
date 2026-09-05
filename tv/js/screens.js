/* screens.js — Home, Search, Browse, Details, Settings.
 *
 * One screen is visible at a time and Back walks a stack, which is the only
 * navigation model that makes sense when the only way out of anywhere is the
 * remote's Back button.
 */
(function (w) {
  'use strict';

  var stack = [];
  var currentName = '';
  var heroTimer = null;

  /* Rows the home screen is built from. Each is filtered down to what the
     library can actually play, then topped up from a shared pool of owned
     titles so no row is left half empty. */
  var HOME_ROWS = [
    { id: 'trendMovies', title: 'Trending Films',   ep: '/trending/movie/week', kind: 'movie' },
    { id: 'popMovies',   title: 'Popular Films',    ep: '/movie/popular',       kind: 'movie' },
    { id: 'trendTv',     title: 'Trending Series',  ep: '/trending/tv/week',    kind: 'tv' },
    { id: 'popTv',       title: 'Popular Series',   ep: '/tv/popular',          kind: 'tv' },
    { id: 'topMovies',   title: 'Top Rated Films',  ep: '/movie/top_rated',     kind: 'movie' },
    { id: 'action',      title: 'Action',           ep: '/discover/movie?with_genres=28&sort_by=popularity.desc', kind: 'movie' },
    { id: 'comedy',      title: 'Comedy',           ep: '/discover/movie?with_genres=35&sort_by=popularity.desc', kind: 'movie' },
    { id: 'horror',      title: 'Horror',           ep: '/discover/movie?with_genres=27&sort_by=popularity.desc', kind: 'movie' },
    { id: 'scifi',       title: 'Sci-Fi',           ep: '/discover/movie?with_genres=878&sort_by=popularity.desc', kind: 'movie' },
    { id: 'topTv',       title: 'Top Rated Series', ep: '/tv/top_rated',        kind: 'tv' },
    { id: 'animation',   title: 'Animation',        ep: '/discover/movie?with_genres=16&sort_by=popularity.desc', kind: 'movie' },
    { id: 'docs',        title: 'Documentaries',    ep: '/discover/movie?with_genres=99&sort_by=popularity.desc', kind: 'movie' }
  ];

  var homeLoaded = false;
  var pools = { movie: [], tv: [] };

  /* ── Billboard ─────────────────────────────────────────────────────────
     The big panel across the top of Home. It follows the highlight, which is
     what a television does instead of a hover, and its Play button always
     belongs to whatever is highlighted. It is a still, not a trailer: a Fire
     Stick has one video decoder and it belongs to playback. */
  var billboardItem = null;

  function setHero(item) {
    if (!item) return;
    billboardItem = item;
    clearTimeout(heroTimer);
    heroTimer = setTimeout(function () {
      if (billboardItem !== item) return;
      var art = document.getElementById('billboardArt');
      var url = item.backdrop || item.card || '';
      if (url && art.getAttribute('data-src') !== url) {
        art.setAttribute('data-src', url);
        var pre = new Image();
        pre.onload = function () {
          if (art.getAttribute('data-src') !== url) return;
          art.style.backgroundImage = 'url("' + url + '")';
          art.classList.add('shown');
        };
        pre.src = url;
      }
      document.getElementById('bbKind').textContent =
        item.kind === 'tv' ? 'SERIES' : 'FILM';
      document.getElementById('bbTitle').textContent = item.title || '';

      var bits = [];
      if (item.year) bits.push(item.year);
      if (item.rating && item.rating !== '0.0') bits.push('\u2605 ' + item.rating);
      var p = item.kind === 'tv' ? Store.resumePoint(item.id)
                                 : Store.progress({ id: item.id, kind: 'movie' });
      if (p && p.season) bits.push('You are on S' + p.season + ' E' + p.episode);
      else if (p && p.pct > 2 && p.pct < 92) bits.push(p.pct + '% watched');
      document.getElementById('bbMeta').textContent = bits.join('   \u00b7   ');

      document.getElementById('bbDesc').textContent = (item.overview || '').slice(0, 280);
      document.getElementById('bbList').textContent = Store.inList(item) ? '\u2713' : '+';
    }, 180);
  }

  /* The billboard's buttons act on whatever is highlighted right now. */
  function wireBillboard() {
    var play = document.getElementById('bbPlay');
    var info = document.getElementById('bbInfo');
    var list = document.getElementById('bbList');
    if (!play || play.__wired) return;
    play.__wired = true;

    play.addEventListener('click', function () {
      if (!billboardItem) return;
      if (billboardItem.kind === 'tv') {
        var r = Store.resumePoint(billboardItem.id);
        Player.play(billboardItem, r ? r.season : 1, r ? r.episode : 1, '');
      } else {
        Player.play(billboardItem, 0, 0, '');
      }
    });
    info.addEventListener('click', function () {
      if (billboardItem) go('details', { item: billboardItem });
    });
    list.addEventListener('click', function () {
      if (!billboardItem) return;
      list.textContent = Store.toggleList(billboardItem) ? '\u2713' : '+';
    });
  }

  /* ── Home ─────────────────────────────────────────────────────────────── */

  function renderHome(force) {
    wireBillboard();
    var host = document.getElementById('homeRows');
    if (homeLoaded && !force) { refreshPersonalRows(); return Promise.resolve(); }

    host.innerHTML = '';
    host.appendChild(UI.spinner('Loading your library'));

    var jobs = HOME_ROWS.map(function (r) {
      return API.list(r.ep, r.kind).catch(function () { return []; });
    });

    return Promise.all(jobs).then(function (lists) {
      var all = [];
      lists.forEach(function (l) { all = all.concat(l); });

      var status = document.getElementById('splashStatus');
      return API.libraryAvailable(all, function (done, total) {
        if (status) status.textContent = 'Checking your library (' + done + '/' + total + ')';
      }).then(function (keep) {
        return { lists: lists, keep: keep };
      });
    }).then(function (res) {
      var lists = res.lists, keep = res.keep;

      pools.movie = [];
      pools.tv = [];
      lists.forEach(function (list, i) {
        var kind = HOME_ROWS[i].kind;
        list.forEach(function (item) {
          if (!keep || keep[item.key]) pools[kind].push(item);
        });
      });
      pools.movie = dedupe(pools.movie);
      pools.tv = dedupe(pools.tv);

      host.innerHTML = '';
      renderPersonalRows(host);

      var usedRecently = {};
      HOME_ROWS.forEach(function (def, i) {
        var owned = lists[i].filter(function (item) { return !keep || keep[item.key]; });
        var items = fill(owned, pools[def.kind], CFG.ROW_TARGET, usedRecently);
        if (items.length < CFG.ROW_MIN) return;
        items.forEach(function (it) { usedRecently[it.key] = (usedRecently[it.key] || 0) + 1; });
        host.appendChild(UI.row(def.id, def.title, items));
      });

      if (!host.querySelector('.card')) {
        host.appendChild(UI.empty(
          'Nothing came back from the library. Check the server address in Settings.'));
      }
      homeLoaded = true;
    }).catch(function (e) {
      host.innerHTML = '';
      host.appendChild(UI.empty('Could not load: ' + (e && e.message ? e.message : 'unknown error')));
    });
  }

  /* Rows that come from this device rather than from TMDB. Rebuilt on every
     visit so finishing an episode is reflected the moment you come back. */
  function renderPersonalRows(host) {
    host = host || document.getElementById('homeRows');
    var existing = host.querySelector('#block-continue');
    if (existing) existing.parentNode.removeChild(existing);
    var listBlock = host.querySelector('#block-mylist');
    if (listBlock) listBlock.parentNode.removeChild(listBlock);

    var cont = Store.continueList();
    if (cont.length) {
      var items = cont.map(function (r) {
        return {
          id: r.id, kind: r.kind, title: r.title,
          card: r.backdrop || r.poster, poster: r.poster, backdrop: r.backdrop,
          year: '', overview: '', key: r.kind + ':' + r.id,
          __resume: r
        };
      });
      var block = UI.row('continue', 'Continue Watching', items, {
        cardOpts: function (item) {
          var r = item.__resume;
          return {
            progress: r.pct,
            subtitle: r.kind === 'tv' && r.season
              ? 'S' + r.season + ' E' + r.episode + (r.d ? '  ·  ' + UI.timeText(r.d - r.t) + ' left' : '')
              : (r.d ? UI.timeText(r.d - r.t) + ' left' : '')
          };
        }
      });
      host.insertBefore(block, host.firstChild);
    }

    var mine = Store.list();
    if (mine.length) {
      var listItems = mine.map(function (r) {
        return {
          id: r.id, kind: r.kind, title: r.title, year: r.year || '',
          card: r.backdrop || r.poster, poster: r.poster, backdrop: r.backdrop,
          overview: '', key: r.kind + ':' + r.id
        };
      });
      var lb = UI.row('mylist', 'My List', listItems);
      var after = host.querySelector('#block-continue');
      if (after && after.nextSibling) host.insertBefore(lb, after.nextSibling);
      else if (after) host.appendChild(lb);
      else host.insertBefore(lb, host.firstChild);
    }
  }

  function refreshPersonalRows() {
    renderPersonalRows();
  }

  function dedupe(list) {
    var seen = {}, out = [];
    list.forEach(function (i) {
      if (seen[i.key]) return;
      seen[i.key] = 1;
      out.push(i);
    });
    return out;
  }

  /* Top a row up to `target` from the shared pool, preferring titles that
     have not just been shown two rows above. A short row is a gap, and gaps
     are what the whole library filter was accused of creating. */
  function fill(owned, pool, target, usedRecently) {
    var out = [], seen = {};
    owned.forEach(function (i) {
      if (seen[i.key]) return;
      seen[i.key] = 1; out.push(i);
    });
    /* A Fire Stick is drawing every one of these; a row long enough to fill
       the screen twice over costs memory and buys nothing. */
    if (out.length >= target) return out.slice(0, CFG.ROW_MAX);

    var fresh = pool.filter(function (i) { return !seen[i.key] && !usedRecently[i.key]; });
    for (var a = 0; a < fresh.length && out.length < target; a++) {
      seen[fresh[a].key] = 1;
      out.push(fresh[a]);
    }
    if (out.length < target) {
      var rest = pool.filter(function (i) { return !seen[i.key]; });
      for (var b = 0; b < rest.length && out.length < target; b++) {
        seen[rest[b].key] = 1;
        out.push(rest[b]);
      }
    }
    return out.slice(0, CFG.ROW_MAX);
  }

  /* ── Browse (Films / Series / My List) ────────────────────────────────── */

  function renderBrowse(mode) {
    var host = document.getElementById('browseBody');
    var titleEl = document.getElementById('browseTitle');
    host.innerHTML = '';

    if (mode === 'mylist') {
      titleEl.textContent = 'My List';
      var mine = Store.list();
      if (!mine.length) {
        host.appendChild(UI.empty('Nothing saved yet. Press OK on anything and choose Add to My List.'));
        return Promise.resolve();
      }
      host.appendChild(UI.grid(mine.map(function (r) {
        return {
          id: r.id, kind: r.kind, title: r.title, year: r.year || '',
          card: r.backdrop || r.poster, poster: r.poster, backdrop: r.backdrop,
          overview: '', key: r.kind + ':' + r.id
        };
      })));
      return Promise.resolve();
    }

    titleEl.textContent = mode === 'tv' ? 'Series' : 'Films';
    host.appendChild(UI.spinner('Loading'));

    var eps = mode === 'tv'
      ? ['/trending/tv/week', '/tv/popular', '/tv/top_rated']
      : ['/trending/movie/week', '/movie/popular', '/movie/top_rated'];

    return Promise.all(eps.map(function (e) {
      return API.list(e, mode === 'tv' ? 'tv' : 'movie', 4).catch(function () { return []; });
    })).then(function (lists) {
      var all = dedupe([].concat.apply([], lists));
      return API.libraryAvailable(all).then(function (keep) {
        var items = all.filter(function (i) { return !keep || keep[i.key]; });
        host.innerHTML = '';
        if (!items.length) {
          host.appendChild(UI.empty('Nothing in the library for this yet.'));
          return;
        }
        host.appendChild(UI.grid(items));
      });
    });
  }

  /* ── Search ───────────────────────────────────────────────────────────── */

  var searchTerm = '';
  var searchTimer = null;

  function initSearch() {
    var kb = document.getElementById('kbHost');
    if (kb.childNodes.length) return;
    Keyboard.build(kb, function (op, ch) {
      if (op === 'add') searchTerm += ch;
      else if (op === 'del') searchTerm = searchTerm.slice(0, -1);
      else if (op === 'clear') searchTerm = '';
      document.getElementById('searchTerm').textContent = searchTerm || 'Type a title';
      document.getElementById('searchTerm').classList.toggle('placeholder', !searchTerm);
      queueSearch();
    });
  }

  function queueSearch() {
    clearTimeout(searchTimer);
    var host = document.getElementById('searchResults');
    if (!searchTerm.trim()) { host.innerHTML = ''; return; }
    searchTimer = setTimeout(function () {
      var term = searchTerm;
      API.search(term).then(function (items) {
        if (term !== searchTerm) return;
        host.innerHTML = '';
        if (!items.length) {
          host.appendChild(UI.empty('Nothing found for "' + term + '"'));
          return;
        }
        /* Search deliberately is NOT filtered to the library: this is how you
           reach something that has not been cached yet. */
        host.appendChild(UI.grid(items.slice(0, 40)));
      });
    }, 420);
  }

  /* ── Details ──────────────────────────────────────────────────────────── */

  var detail = null;   // {item, tmdb, season, episodes}

  function renderDetails(item) {
    var host = document.getElementById('detailsBody');
    document.getElementById('detailsBackdrop').style.backgroundImage =
      item.backdrop ? 'url("' + item.backdrop + '")' : 'none';
    host.innerHTML = '';
    host.appendChild(UI.spinner('Loading'));

    detail = { item: item, season: 1, episodes: [] };

    return API.details(item.kind, item.id).then(function (d) {
      detail.tmdb = d;
      host.innerHTML = '';
      host.appendChild(buildDetailsHead(item, d));
      if (item.kind === 'tv') {
        var seasons = (d.seasons || []).filter(function (s) {
          return s.season_number > 0 && (s.episode_count || 0) > 0;
        });
        if (!seasons.length) seasons = [{ season_number: 1, episode_count: 0 }];
        detail.seasons = seasons;

        var resume = Store.resumePoint(item.id);
        detail.season = resume && resume.season ? resume.season : seasons[0].season_number;
        if (!seasons.some(function (s) { return s.season_number === detail.season; })) {
          detail.season = seasons[0].season_number;
        }

        host.appendChild(buildSeasonPicker(seasons));
        var epHost = UI.el('div', 'ep-host');
        epHost.id = 'epHost';
        host.appendChild(epHost);
        loadEpisodes(detail.season);
      }
    }).catch(function (e) {
      host.innerHTML = '';
      host.appendChild(UI.empty('Could not load details: ' + (e && e.message)));
    });
  }

  function buildDetailsHead(item, d) {
    var head = UI.el('div', 'det-head');

    var meta = UI.el('div', 'det-meta');
    meta.appendChild(UI.el('h1', 'det-title', item.title));

    var bits = [];
    var yr = (d.release_date || d.first_air_date || '').slice(0, 4);
    if (yr) bits.push(yr);
    if (d.runtime) bits.push(UI.runtimeText(d.runtime));
    if (d.number_of_seasons) bits.push(d.number_of_seasons + ' season' + (d.number_of_seasons > 1 ? 's' : ''));
    if (d.vote_average) bits.push('★ ' + Number(d.vote_average).toFixed(1));
    (d.genres || []).slice(0, 3).forEach(function (g) { bits.push(g.name); });
    meta.appendChild(UI.el('div', 'det-sub', bits.join('   ·   ')));
    meta.appendChild(UI.el('p', 'det-overview', d.overview || item.overview || ''));

    var cast = (d.credits && d.credits.cast || []).slice(0, 4)
      .map(function (c) { return c.name; }).join(', ');
    if (cast) meta.appendChild(UI.el('div', 'det-cast', 'Starring  ' + cast));

    var actions = UI.el('div', 'det-actions');

    var resume = item.kind === 'tv' ? Store.resumePoint(item.id) : null;
    var prog = item.kind === 'movie' ? Store.progress({ id: item.id, kind: 'movie' }) : null;

    var playLabel = 'Play';
    if (item.kind === 'tv' && resume) {
      playLabel = 'Resume S' + resume.season + ' E' + resume.episode;
    } else if (prog && prog.pct > 2 && prog.pct < 92) {
      playLabel = 'Resume  ·  ' + UI.timeText(prog.t) + ' in';
    }

    var play = UI.el('button', 'f btn btn-primary autofocus', playLabel);
    play.type = 'button';
    play.setAttribute('data-key', 'det-play');
    play.addEventListener('click', function () {
      if (item.kind === 'tv') {
        var r = Store.resumePoint(item.id);
        Player.play(item, r ? r.season : detail.season, r ? r.episode : 1, '');
      } else {
        Player.play(item, 0, 0, '');
      }
    });
    actions.appendChild(play);

    var inList = Store.inList(item);
    var listBtn = UI.el('button', 'f btn', inList ? 'In My List  ✓' : 'Add to My List');
    listBtn.type = 'button';
    listBtn.setAttribute('data-key', 'det-list');
    listBtn.addEventListener('click', function () {
      var now = Store.toggleList(item);
      listBtn.textContent = now ? 'In My List  ✓' : 'Add to My List';
    });
    actions.appendChild(listBtn);

    meta.appendChild(actions);
    head.appendChild(meta);

    if (item.poster) {
      var art = UI.el('div', 'det-poster');
      var img = document.createElement('img');
      img.src = item.poster;
      img.alt = '';
      img.addEventListener('error', function () { art.style.display = 'none'; });
      art.appendChild(img);
      head.appendChild(art);
    }
    return head;
  }

  function buildSeasonPicker(seasons) {
    var wrap = UI.el('div', 'season-bar');
    wrap.appendChild(UI.el('span', 'season-label', 'Season'));
    var track = UI.el('div', 'season-track');
    seasons.forEach(function (s) {
      var b = UI.el('button', 'f season-btn' + (s.season_number === detail.season ? ' on' : ''),
                    String(s.season_number));
      b.type = 'button';
      b.setAttribute('data-key', 'season-' + s.season_number);
      b.addEventListener('click', function () {
        if (detail.season === s.season_number) return;
        detail.season = s.season_number;
        [].forEach.call(track.querySelectorAll('.season-btn'), function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        loadEpisodes(s.season_number);
      });
      track.appendChild(b);
    });
    wrap.appendChild(track);
    return wrap;
  }

  function loadEpisodes(season) {
    var host = document.getElementById('epHost');
    if (!host) return;
    host.innerHTML = '';
    host.appendChild(UI.spinner('Loading episodes'));

    API.episodes(detail.item.id, season).then(function (eps) {
      if (!detail || detail.season !== season) return;
      host.innerHTML = '';
      if (!eps.length) {
        host.appendChild(UI.empty('No episode list for this season.'));
        return;
      }
      detail.episodes = eps;
      eps.forEach(function (ep) {
        host.appendChild(episodeRow(ep, season));
      });
    }).catch(function () {
      if (!detail || detail.season !== season) return;
      host.innerHTML = '';
      host.appendChild(UI.empty('Could not load episodes for season ' + season + '.'));
    });
  }

  function episodeRow(ep, season) {
    var item = detail.item;
    var b = UI.el('button', 'f ep');
    b.type = 'button';
    b.setAttribute('data-key', 'ep-' + season + '-' + ep.n);

    var art = UI.el('div', 'ep-art');
    if (ep.still) {
      var img = document.createElement('img');
      img.src = ep.still;
      img.alt = '';
      img.addEventListener('error', function () { img.style.display = 'none'; });
      art.appendChild(img);
    }
    var p = Store.progress({ id: item.id, kind: 'tv', season: season, episode: ep.n });
    if (p && p.pct > 1) {
      var bar = UI.el('div', 'card-progress');
      var fill = UI.el('div', 'card-progress-fill');
      fill.style.width = Math.min(100, p.pct) + '%';
      bar.appendChild(fill);
      art.appendChild(bar);
    }
    b.appendChild(art);

    var text = UI.el('div', 'ep-text');
    text.appendChild(UI.el('div', 'ep-name', ep.n + '.  ' + (ep.name || 'Episode ' + ep.n)));
    var sub = [];
    if (ep.runtime) sub.push(UI.runtimeText(ep.runtime));
    if (p && p.pct >= 92) sub.push('Watched');
    else if (p && p.pct > 1) sub.push(p.pct + '% in');
    if (sub.length) text.appendChild(UI.el('div', 'ep-sub', sub.join('   ·   ')));
    text.appendChild(UI.el('div', 'ep-overview', ep.overview || ''));
    b.appendChild(text);

    b.addEventListener('click', function () {
      Player.play(item, season, ep.n, ep.name || '');
    });
    return b;
  }

  /* ── Settings ─────────────────────────────────────────────────────────── */

  function renderSettings() {
    var host = document.getElementById('settingsBody');
    host.innerHTML = '';

    host.appendChild(settingRow(
      'Server address',
      CFG.API,
      'Change',
      function () {
        TextEntry.ask('Server address', CFG.API, function (v) {
          if (!v) return;
          if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
          CFG.API = v;
          renderSettings();
          homeLoaded = false;
        });
      },
      'set-api'
    ));

    host.appendChild(settingRow(
      'Only show what is cached',
      CFG.LIBRARY_ONLY ? 'On — the home screen lists what plays instantly' :
                         'Off — the home screen lists everything TMDB promotes',
      CFG.LIBRARY_ONLY ? 'Turn off' : 'Turn on',
      function () {
        CFG.LIBRARY_ONLY = !CFG.LIBRARY_ONLY;
        homeLoaded = false;
        renderSettings();
      },
      'set-lib'
    ));

    host.appendChild(settingRow(
      'Continue watching',
      Store.continueList().length + ' item(s)',
      'Clear',
      function () { Store.clearContinue(); renderSettings(); refreshPersonalRows(); },
      'set-cont'
    ));

    host.appendChild(settingRow(
      'My list',
      Store.list().length + ' item(s)',
      'Clear everything',
      function () { Store.clearAll(); renderSettings(); refreshPersonalRows(); },
      'set-all'
    ));

    /* Inside the Android shell the app is loaded from the website, so an
       update is a push rather than another sideload. Say which copy is on
       screen, and offer to go and fetch the newer one. */
    if (w.SharkyHost && w.SharkyHost.source) {
      var live = false, remote = '';
      try { live = w.SharkyHost.source() === 'live'; } catch (e) {}
      try { remote = w.SharkyHost.remoteUrl(); } catch (e) {}
      host.appendChild(settingRow(
        'App version',
        live ? 'Running the live copy from ' + remote
             : 'Running the copy built into the app — the website could not be reached',
        'Update now',
        function () {
          if (w.SharkyHost.reload) w.SharkyHost.reload();
          else location.reload();
        },
        'set-update'
      ));
    }

    host.appendChild(settingRow(
      'Reload',
      'Fetch the rows again from scratch',
      'Reload now',
      function () { homeLoaded = false; go('home', null, true); },
      'set-reload'
    ));

    var about = UI.el('div', 'about');
    about.appendChild(UI.el('div', 'about-line',
      'Sharky TV  ' + CFG.VERSION + '   ·   build ' + (w.SHARKY_BUILD || 'bundled')));
    about.appendChild(UI.el('div', 'about-line', 'Server  ' + CFG.API));
    about.appendChild(UI.el('div', 'about-line', navigator.userAgent));
    host.appendChild(about);
  }

  function settingRow(title, value, action, fn, key) {
    var r = UI.el('div', 'setting');
    var t = UI.el('div', 'setting-text');
    t.appendChild(UI.el('div', 'setting-title', title));
    t.appendChild(UI.el('div', 'setting-value', value));
    r.appendChild(t);
    var b = UI.el('button', 'f btn', action);
    b.type = 'button';
    b.setAttribute('data-key', key);
    b.addEventListener('click', fn);
    r.appendChild(b);
    return r;
  }

  /* ── Routing ──────────────────────────────────────────────────────────── */

  var SCREENS = {
    home:     { el: 'screen-home',     enter: function () { return renderHome(); } },
    search:   { el: 'screen-search',   enter: function () { initSearch(); return Promise.resolve(); } },
    movies:   { el: 'screen-browse',   enter: function () { return renderBrowse('movie'); } },
    tv:       { el: 'screen-browse',   enter: function () { return renderBrowse('tv'); } },
    mylist:   { el: 'screen-browse',   enter: function () { return renderBrowse('mylist'); } },
    details:  { el: 'screen-details',  enter: function (p) { return renderDetails(p.item); } },
    settings: { el: 'screen-settings', enter: function () { renderSettings(); return Promise.resolve(); } }
  };

  function go(name, params, replace) {
    var def = SCREENS[name];
    if (!def) return;

    if (!replace && currentName && currentName !== name) {
      stack.push({ name: currentName, focus: Nav.current ? Nav.current.getAttribute('data-key') : '' });
    }
    currentName = name;

    [].forEach.call(document.querySelectorAll('.screen'), function (s) {
      s.classList.add('off');
    });
    var target = document.getElementById(def.el);
    target.classList.remove('off');
    target.scrollTop = 0;

    [].forEach.call(document.querySelectorAll('.nav-link'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-screen') === name);
    });
    document.body.setAttribute('data-screen', name);

    if (name === 'home') refreshPersonalRows();

    var res = def.enter(params || {});
    (res && res.then ? res : Promise.resolve()).then(function () {
      Nav.focusFirst(target);
      if (name === 'home') {
        /* Give the billboard something to be about before anyone moves. */
        var first = target.querySelector('.card');
        if (first && first.__item) setHero(first.__item);
      }
    });
  }

  function back() {
    if (!stack.length) return false;
    var prev = stack.pop();
    go(prev.name, null, true);
    if (prev.focus) {
      setTimeout(function () {
        var el = document.querySelector('[data-key="' + prev.focus.replace(/["\\]/g, '\\$&') + '"]');
        if (el) Nav.focus(el);
      }, 60);
    }
    return true;
  }

  w.Screens = {
    go: go,
    back: back,
    get name() { return currentName; },
    setHero: setHero,
    refreshPersonal: refreshPersonalRows,
    reloadHome: function () { homeLoaded = false; },
    get detail() { return detail; }
  };
})(window);
