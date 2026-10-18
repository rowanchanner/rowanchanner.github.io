/* phone.js — Sharky Movies for Android phones.
 *
 * Built for a thumb, not a remote: swipe rows, a details page that slides up,
 * bottom tabs. Play hands over to the API's own player full screen, and the
 * native shell (SharkyNative) turns the phone sideways and hides the system
 * bars while it is up — then puts everything back when you leave.
 */
(function () {
  'use strict';

  var N = window.SharkyNative || null;           // present inside the APK only
  var $ = function (id) { return document.getElementById(id); };
  var IMG_W = 'https://image.tmdb.org/t/p/';

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>',
    tick: '<svg viewBox="0 0 24 24"><path d="m9.5 16.2-4.2-4.2-1.4 1.4 5.6 5.6 12-12-1.4-1.4z"/></svg>',
    info: '<svg viewBox="0 0 24 24"><path d="M11 10h2v8h-2zm0-4h2v2h-2zM12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16z"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M18 16a3 3 0 0 0-2.2 1l-7-4a3 3 0 0 0 0-2l7-4A3 3 0 1 0 15 5l-7 4a3 3 0 1 0 0 6l7 4a3 3 0 1 0 3-3z"/></svg>'
  };

  var toastT = null;
  function toast(msg, ms) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('on'); }, ms || 2200);
  }

  /* ── Row definitions ────────────────────────────────────────────────── */
  var G = '/discover/movie?sort_by=popularity.desc&with_genres=';
  var GT = '/discover/tv?sort_by=popularity.desc&with_genres=';
  var ROWS = {
    all: [
      { t: 'Trending Now', ep: '/trending/all/week', kind: null },
      { t: 'Popular Films', ep: '/movie/popular', kind: 'movie' },
      { t: 'Popular Series', ep: '/tv/popular', kind: 'tv' },
      { t: 'Action', ep: G + '28', kind: 'movie' },
      { t: 'Comedy', ep: G + '35', kind: 'movie' },
      { t: 'Crime Series', ep: GT + '80', kind: 'tv' },
      { t: 'Horror', ep: G + '27', kind: 'movie' },
      { t: 'Sci-Fi', ep: G + '878', kind: 'movie' },
      { t: 'Animation', ep: G + '16', kind: 'movie' },
      { t: 'Top Rated Films', ep: '/movie/top_rated', kind: 'movie' },
      { t: 'Top Rated Series', ep: '/tv/top_rated', kind: 'tv' },
      { t: 'Thrillers', ep: G + '53', kind: 'movie' },
      { t: 'Family', ep: G + '10751', kind: 'movie' },
      { t: 'Documentaries', ep: G + '99', kind: 'movie' }
    ],
    movie: [
      { t: 'Trending Films', ep: '/trending/movie/week', kind: 'movie' },
      { t: 'Popular Films', ep: '/movie/popular', kind: 'movie' },
      { t: 'Action', ep: G + '28', kind: 'movie' },
      { t: 'Comedy', ep: G + '35', kind: 'movie' },
      { t: 'Horror', ep: G + '27', kind: 'movie' },
      { t: 'Thrillers', ep: G + '53', kind: 'movie' },
      { t: 'Sci-Fi', ep: G + '878', kind: 'movie' },
      { t: 'Crime', ep: G + '80', kind: 'movie' },
      { t: 'Romance', ep: G + '10749', kind: 'movie' },
      { t: 'Animation', ep: G + '16', kind: 'movie' },
      { t: 'Family', ep: G + '10751', kind: 'movie' },
      { t: 'Top Rated Films', ep: '/movie/top_rated', kind: 'movie' },
      { t: 'Documentaries', ep: G + '99', kind: 'movie' }
    ],
    tv: [
      { t: 'Trending Series', ep: '/trending/tv/week', kind: 'tv' },
      { t: 'Popular Series', ep: '/tv/popular', kind: 'tv' },
      { t: 'Crime', ep: GT + '80', kind: 'tv' },
      { t: 'Comedy', ep: GT + '35', kind: 'tv' },
      { t: 'Drama', ep: GT + '18', kind: 'tv' },
      { t: 'Sci-Fi & Fantasy', ep: GT + '10765', kind: 'tv' },
      { t: 'Animation', ep: GT + '16', kind: 'tv' },
      { t: 'Reality', ep: GT + '10764', kind: 'tv' },
      { t: 'Documentary Series', ep: GT + '99', kind: 'tv' },
      { t: 'Kids', ep: GT + '10762', kind: 'tv' },
      { t: 'Top Rated Series', ep: '/tv/top_rated', kind: 'tv' }
    ]
  };

  var mode = 'all';
  var homeToken = 0;

  /* ── Cards ──────────────────────────────────────────────────────────── */
  function posterCard(item, ready) {
    var c = el('button', 'card' + (item.poster ? '' : ' noart'));
    if (item.poster) {
      var img = el('img');
      img.loading = 'lazy';
      img.alt = '';
      img.src = item.poster;
      img.onerror = function () { c.classList.add('noart'); img.remove(); };
      c.appendChild(img);
    }
    if (!item.poster) c.appendChild(el('div', 'ctitle', esc(item.title)));
    if (ready) c.appendChild(el('span', 'ready', 'READY'));
    c.addEventListener('click', function () { openDetails(item); });
    return c;
  }

  function cwCard(r) {
    var item = { id: r.id, kind: r.kind, title: r.title, poster: r.poster, backdrop: r.backdrop };
    var c = el('div', 'card cw');
    var art = el('button', 'cw-art');
    var src = r.backdrop || r.poster;
    if (src) { var img = el('img'); img.loading = 'lazy'; img.src = src.replace('/w1280/', '/w500/'); art.appendChild(img); }
    art.appendChild(el('div', 'cw-play', '<span>' + ICON.play + '</span>'));
    art.addEventListener('click', function () {
      if (r.kind === 'tv') play(item, r.season || 1, r.episode || 1);
      else play(item);
    });
    c.appendChild(art);
    var bar = el('div', 'bar', '<i style="width:' + Math.max(3, r.pct || 0) + '%"></i>');
    c.appendChild(bar);
    var meta = el('div', 'cw-meta');
    var sub = r.kind === 'tv' && r.season ? 'S' + r.season + ':E' + r.episode + (r.epName ? ' ' + r.epName : '') :
              (r.d ? Math.max(1, Math.round((r.d - r.t) / 60)) + 'm left' : '');
    var info = el('div', null, '<b>' + esc(r.title) + '</b>' + esc(sub));
    info.addEventListener('click', function () { openDetails(item); });
    meta.appendChild(info);
    var x = el('button', 'cw-x', ICON.x);
    x.setAttribute('aria-label', 'Remove');
    x.addEventListener('click', function (e) {
      e.stopPropagation();
      Store.forget(r.id, r.kind);
      c.remove();
      toast('Removed from Continue Watching');
      var t = document.querySelector('#rows .row-cw .track');
      if (t && !t.children.length) t.parentNode.remove();
    });
    meta.appendChild(x);
    c.appendChild(meta);
    return c;
  }

  function top10Card(item, n) {
    var c = el('button', 'card top10');
    c.appendChild(el('span', 'num', String(n)));
    var p = el('div', 'p');
    if (item.poster) { var img = el('img'); img.loading = 'lazy'; img.src = item.poster; p.appendChild(img); }
    c.appendChild(p);
    c.addEventListener('click', function () { openDetails(item); });
    return c;
  }

  function skeletons(track, n) {
    for (var i = 0; i < (n || 4); i++) track.appendChild(el('div', 'skel'));
  }

  /* ── Library filter ─────────────────────────────────────────────────── */
  /* Only show what can actually play (Settings can turn this off). An error
     never empties a row: unknown means shown. */
  function playable(items) {
    if (!items.length) return Promise.resolve([]);
    return API.libraryAvailable(items).then(function (keep) {
      if (!keep) return items;
      return items.filter(function (i) { return keep[i.key]; });
    }).catch(function () { return items; });
  }

  function withPage(ep, page) {
    return ep + (ep.indexOf('?') >= 0 ? '&' : '?') + 'page=' + page;
  }

  function fetchPage(def, page) {
    return API.tmdb(withPage(def.ep, page)).then(function (d) {
      var out = [];
      ((d && d.results) || []).forEach(function (raw) {
        var it = API.normalise(raw, def.kind || undefined);
        if (it && it.poster) out.push(it);
      });
      return { items: out, last: !d || page >= (d.total_pages || 1) };
    }).catch(function () { return { items: [], last: true }; });
  }

  /* ── Rows: built when they come near the screen, endless sideways ───── */
  var rowObserver = null;

  function makeRow(def, token) {
    var row = el('section', 'row');
    row.appendChild(el('h2', 'row-title', esc(def.t)));
    var track = el('div', 'track');
    row.appendChild(track);
    skeletons(track, 4);
    row.__def = def;
    row.__state = { page: 0, last: false, loading: false, seen: {}, empties: 0, token: token };
    track.addEventListener('scroll', function () {
      if (track.scrollLeft + track.clientWidth > track.scrollWidth - track.clientWidth * 1.2) loadMore(row);
    }, { passive: true });
    return row;
  }

  function loadMore(row) {
    var st = row.__state, def = row.__def, track = row.querySelector('.track');
    if (st.loading || st.last || st.token !== homeToken) return;
    st.loading = true;
    var spin = el('div', 'more-spin', '<div class="spinner" style="width:24px;height:24px;border-width:2px"></div>');
    if (st.page > 0) track.appendChild(spin);
    var want = st.page === 0 ? 2 : 1, got = [], pages = [];
    for (var i = 1; i <= want; i++) pages.push(fetchPage(def, st.page + i));
    Promise.all(pages).then(function (res) {
      st.page += want;
      res.forEach(function (r) { got = got.concat(r.items); if (r.last) st.last = true; });
      got = got.filter(function (it) { if (st.seen[it.key]) return false; st.seen[it.key] = 1; return true; });
      return playable(got);
    }).then(function (keep) {
      if (st.token !== homeToken) return;
      spin.remove();
      track.querySelectorAll('.skel').forEach(function (s) { s.remove(); });
      keep.forEach(function (it) { track.appendChild(posterCard(it)); });
      st.empties = keep.length ? 0 : st.empties + 1;
      st.loading = false;
      if (st.page >= 40 || st.empties >= 4) st.last = true;
      /* A row that ends up empty is a gap on the page - drop it. */
      if (!track.children.length && st.last) { row.remove(); return; }
      /* Too few to fill the screen: keep going. */
      if (!st.last && track.scrollWidth <= track.clientWidth * 1.6) loadMore(row);
    }).catch(function () { st.loading = false; spin.remove(); });
  }

  function personalRows(host) {
    var cw = Store.continueList().filter(function (r) { return mode === 'all' || r.kind === mode; });
    if (cw.length) {
      var row = el('section', 'row row-cw');
      row.appendChild(el('h2', 'row-title', 'Continue Watching'));
      var track = el('div', 'track');
      cw.slice(0, 20).forEach(function (r) { track.appendChild(cwCard(r)); });
      row.appendChild(track);
      host.appendChild(row);
    }
    var list = Store.list().filter(function (r) { return mode === 'all' || r.kind === mode; });
    if (list.length) {
      var lr = el('section', 'row');
      lr.appendChild(el('h2', 'row-title', 'My List'));
      var lt = el('div', 'track');
      list.slice(0, 30).forEach(function (r) {
        lt.appendChild(posterCard({ id: r.id, kind: r.kind, title: r.title, poster: r.poster, backdrop: r.backdrop, year: r.year, key: r.kind + ':' + r.id }));
      });
      lr.appendChild(lt);
      host.appendChild(lr);
    }
  }

  function top10Row(host, kind, token) {
    var region = CFG.REGION;
    var name = (window.Region && Region.name) ? Region.name(region) : region;
    var row = el('section', 'row');
    row.appendChild(el('h2', 'row-title', 'Top 10 ' + (kind === 'tv' ? 'Series' : 'Films') + ' in ' + esc(name || region)));
    var track = el('div', 'track');
    skeletons(track, 3);
    row.appendChild(track);
    host.appendChild(row);
    API.topTen(kind, region).then(function (items) {
      if (token !== homeToken) return;
      track.innerHTML = '';
      if (!items.length) { row.remove(); return; }
      items.forEach(function (it, i) { track.appendChild(top10Card(it, i + 1)); });
    }).catch(function () { row.remove(); });
  }

  /* ── Most watched on Sharky ───────────────────────────────────────────────
     Always ten: what people here watched most (the server tops up from the
     last month and from the most-played titles), and if it still has fewer
     than ten - a brand-new server - this week's trending fills the rest. */
  function loadMostWatched() {
    return fetch(CFG.API + '/top-watched', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .catch(function () { return { items: [] }; })
      .then(function (d) {
        var top = ((d && d.items) || []).slice(0, 10);
        return Promise.all(top.map(function (t) {
          var kind = t.kind === 'tv' ? 'tv' : 'movie';
          return API.tmdb('/' + kind + '/' + encodeURIComponent(t.id))
            .then(function (raw) { return API.normalise(raw, kind); })
            .catch(function () { return null; });
        }));
      })
      .then(function (items) {
        items = items.filter(function (i) { return i && (i.poster || i.card); });
        if (items.length >= 10) return items.slice(0, 10);
        return API.tmdb('/trending/all/week').then(function (d) {
          var seen = {};
          items.forEach(function (i) { seen[i.key] = 1; });
          ((d && d.results) || []).forEach(function (r) {
            var it = API.normalise(r);
            if (!it || seen[it.key] || items.length >= 10 || !(it.poster || it.card)) return;
            seen[it.key] = 1;
            items.push(it);
          });
          return items;
        }).catch(function () { return items; });
      });
  }

  function mostWatchedRow(host, token) {
    var row = el('section', 'row');
    row.appendChild(el('h2', 'row-title', 'Most Watched on Sharky'));
    var track = el('div', 'track');
    skeletons(track, 3);
    row.appendChild(track);
    host.appendChild(row);
    loadMostWatched().then(function (items) {
      if (token !== homeToken) return;
      track.innerHTML = '';
      if (!items.length) { row.remove(); return; }
      items.slice(0, 10).forEach(function (it, i) { track.appendChild(top10Card(it, i + 1)); });
    }).catch(function () { row.remove(); });
  }

  function recentRow(host, token) {
    var row = el('section', 'row');
    row.appendChild(el('h2', 'row-title', 'Recently Added <small>new in the library</small>'));
    var track = el('div', 'track');
    skeletons(track, 4);
    row.appendChild(track);
    host.appendChild(row);
    API.recentlyAdded(30).then(function (items) {
      if (token !== homeToken) return;
      items = items.filter(function (i) { return i.poster && (mode === 'all' || i.kind === mode); });
      track.innerHTML = '';
      if (!items.length) { row.remove(); return; }
      items.forEach(function (it) { track.appendChild(posterCard(it, true)); });
    });
  }

  function renderHome() {
    var token = ++homeToken;
    var host = $('rows');
    host.innerHTML = '';
    if (rowObserver) rowObserver.disconnect();
    personalRows(host);
    if (mode === 'all') mostWatchedRow(host, token);
    if (mode !== 'tv') top10Row(host, 'movie', token);
    if (mode !== 'movie') top10Row(host, 'tv', token);
    recentRow(host, token);
    var defs = ROWS[mode];
    rowObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { rowObserver.unobserve(en.target); loadMore(en.target); }
      });
    }, { root: $('view-home'), rootMargin: '600px 0px' });
    defs.forEach(function (d) {
      var r = makeRow(d, token);
      host.appendChild(r);
      rowObserver.observe(r);
    });
    renderHero(token);
  }

  /* ── Hero: the big poster at the top ────────────────────────────────── */
  function renderHero(token) {
    var hero = $('hero');
    var ep = mode === 'tv' ? '/trending/tv/day' : mode === 'movie' ? '/trending/movie/day' : '/trending/all/day';
    API.tmdb(ep).then(function (d) {
      var items = ((d && d.results) || []).map(function (r) { return API.normalise(r, mode === 'all' ? undefined : mode); })
        .filter(function (i) { return i && i.poster && i.backdrop; }).slice(0, 12);
      return playable(items);
    }).then(function (items) {
      if (token !== homeToken) return;
      if (!items.length) { hero.className = 'hero empty'; hero.innerHTML = ''; return; }
      var item = items[Math.floor(Math.random() * Math.min(5, items.length))];
      hero.className = 'hero';
      hero.innerHTML = '';
      var img = el('img', 'hero-img');
      img.src = item.poster.replace('/w342/', '/w780/');
      hero.appendChild(img);
      var info = el('div', 'hero-info');
      var t = el('div', 'hero-title', esc(item.title));
      info.appendChild(t);
      var tags = el('div', 'hero-tags');
      info.appendChild(tags);
      var btns = el('div', 'hero-btns');
      var pb = el('button', 'btn btn-white', ICON.play + 'Play');
      pb.addEventListener('click', function () { playItem(item); });
      var lb = el('button', 'btn btn-grey', (Store.inList(item) ? ICON.tick : ICON.plus) + 'My List');
      lb.addEventListener('click', function () {
        var on = Store.toggleList(item);
        lb.innerHTML = (on ? ICON.tick : ICON.plus) + 'My List';
        toast(on ? 'Added to My List' : 'Removed from My List');
      });
      btns.appendChild(pb); btns.appendChild(lb);
      info.appendChild(btns);
      hero.appendChild(info);
      img.addEventListener('click', function () { openDetails(item); });
      API.logo(item.kind, item.id).then(function (src) {
        if (!src) return;
        var lg = el('img', 'hero-logo'); lg.src = src; lg.alt = item.title;
        lg.onload = function () { t.replaceWith(lg); };
      });
      API.extra(item.kind, item.id).then(function (ex) {
        tags.innerHTML = (ex.genres || []).concat(item.kind === 'tv' ? ['Series'] : ['Film'])
          .map(function (g) { return '<span>' + esc(g) + '</span>'; }).join('');
      });
    });
  }

  /* ── Chips: Series / Films ──────────────────────────────────────────── */
  function setMode(m) {
    mode = m;
    var chips = $('chips');
    chips.classList.toggle('filtered', m !== 'all');
    chips.querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('on', c.getAttribute('data-mode') === m && m !== 'all'); });
    $('view-home').scrollTop = 0;
    renderHome();
  }

  /* ── Tabs ───────────────────────────────────────────────────────────── */
  var tab = 'home';
  function setTab(t) {
    tab = t;
    document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === t); });
    document.querySelectorAll('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + t); });
    $('topbar').style.display = t === 'home' ? '' : 'none';
    if (t === 'search') { searchInit(); setTimeout(function () { if (!$('searchInput').value) $('searchInput').focus(); }, 60); }
    if (t === 'list') renderList();
    if (t === 'home') refreshPersonal();
  }

  function refreshPersonal() {
    var host = $('rows');
    /* (No early exit when the page is still empty: history that arrives
       before the other rows - a sync, or carried over from the old site -
       must still get its rows, and they stay on top.) */
    host.querySelectorAll('.row-cw').forEach(function (r) { r.remove(); });
    Array.prototype.slice.call(host.querySelectorAll('.row')).forEach(function (r) {
      var h = r.querySelector('.row-title');
      if (h && h.textContent === 'My List') r.remove();
    });
    var tmp = document.createDocumentFragment();
    var box = el('div');
    personalRows(box);
    while (box.firstChild) tmp.appendChild(box.firstChild);
    host.insertBefore(tmp, host.firstChild);
  }

  /* ── Search ─────────────────────────────────────────────────────────── */
  var searchReady = false, searchT = null, searchSeq = 0;
  function searchInit() {
    if (searchReady) return;
    searchReady = true;
    var input = $('searchInput');
    input.addEventListener('input', function () {
      input.parentNode.classList.toggle('has-text', !!input.value);
      clearTimeout(searchT);
      searchT = setTimeout(function () { runSearch(input.value); }, 350);
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { input.blur(); runSearch(input.value); } });
    $('searchClear').addEventListener('click', function () {
      input.value = ''; input.parentNode.classList.remove('has-text'); runSearch(''); input.focus();
    });
    runSearch('');
  }

  function runSearch(q) {
    var seq = ++searchSeq;
    var host = $('searchResults');
    var hint = $('searchHint');
    if (!q.trim()) {
      hint.textContent = 'Popular right now';
      host.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
      fetchPage({ ep: '/trending/all/week', kind: null }, 1).then(function (r) {
        return playable(r.items);
      }).then(function (items) {
        if (seq !== searchSeq) return;
        host.innerHTML = '';
        items.slice(0, 30).forEach(function (it) { host.appendChild(posterCard(it)); });
      });
      return;
    }
    hint.textContent = 'Results';
    host.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    API.search(q).then(function (items) {
      items = items.filter(function (i) { return i.poster; });
      if (!items.length) return { items: [], keep: null };
      return API.libraryAvailable(items, null, true).catch(function () { return null; })
        .then(function (keep) { return { items: items, keep: keep }; });
    }).then(function (res) {
      if (seq !== searchSeq) return;
      host.innerHTML = '';
      if (!res.items.length) { host.appendChild(el('div', 'empty', 'Nothing found for "' + esc(q) + '".<br>Try another title.')); return; }
      var items = res.items, keep = res.keep;
      /* Ready-to-play first; the rest still shown (they may play anyway). */
      if (keep) items = items.filter(function (i) { return keep[i.key]; }).concat(items.filter(function (i) { return !keep[i.key]; }));
      items.forEach(function (it) { host.appendChild(posterCard(it, !!(keep && keep[it.key]))); });
    });
  }

  /* ── My List tab ────────────────────────────────────────────────────── */
  function renderList() {
    var host = $('listBody');
    host.innerHTML = '';
    var cw = Store.continueList();
    if (cw.length) {
      host.appendChild(el('div', 'section-title', 'Continue Watching'));
      var tr = el('div', 'track');
      cw.forEach(function (r) { tr.appendChild(cwCard(r)); });
      host.appendChild(tr);
    }
    var list = Store.list();
    host.appendChild(el('div', 'section-title', 'Saved'));
    if (!list.length) {
      host.appendChild(el('div', 'empty', 'Nothing saved yet.<br>Tap <b>+ My List</b> on anything to keep it here.'));
      return;
    }
    var grid = el('div', 'poster-grid');
    list.forEach(function (r) {
      grid.appendChild(posterCard({ id: r.id, kind: r.kind, title: r.title, poster: r.poster, backdrop: r.backdrop, year: r.year, key: r.kind + ':' + r.id }));
    });
    host.appendChild(grid);
  }

  /* ── Details ────────────────────────────────────────────────────────── */
  var detail = null;      // { item, d, season }
  var detailStack = [];   // "More like this" → details → back walks this

  function openDetails(item, fromStack) {
    if (window.SharkyExtras) window.SharkyExtras.stop();
    if (detail && !fromStack) detailStack.push(detail.item);
    detail = { item: item, season: 1 };
    var sheet = $('details');
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
    $('detailsScroll').scrollTop = 0;
    var media = $('dMedia');
    media.style.backgroundImage = item.backdrop ? 'url("' + item.backdrop.replace('/w1280/', '/w780/') + '")' : 'none';
    media.querySelectorAll('.d-play-big').forEach(function (n) { n.remove(); });
    var big = el('button', 'd-play-big', '<span>' + ICON.play + '</span>');
    big.addEventListener('click', function () { playItem(item); });
    media.appendChild(big);
    var body = $('dBody');
    body.innerHTML = '<div class="d-title">' + esc(item.title) + '</div><div class="loading"><div class="spinner"></div></div>';

    API.details(item.kind, item.id).then(function (d) {
      if (!detail || detail.item !== item) return;
      detail.d = d;
      if (!item.backdrop && d.backdrop_path) {
        item.backdrop = 'https://image.tmdb.org/t/p/w1280' + d.backdrop_path;
        media.style.backgroundImage = 'url("' + IMG_W + 'w780' + d.backdrop_path + '")';
      }
      if (!item.poster && d.poster_path) item.poster = CFG.IMG_POSTER + d.poster_path;
      buildDetails(item, d);
    }).catch(function () {
      body.innerHTML = '<div class="d-title">' + esc(item.title) + '</div><div class="empty">Could not load the details. Check your connection.</div>';
    });
  }

  function closeDetails() {
    if (window.SharkyExtras) window.SharkyExtras.stop();
    var sheet = $('details');
    if (detailStack.length) { openDetails(detailStack.pop(), true); return; }
    sheet.classList.remove('open');
    sheet.setAttribute('aria-hidden', 'true');
    detail = null;
    if (tab === 'home') refreshPersonal();
    if (tab === 'list') renderList();
  }

  function buildDetails(item, d) {
    var body = $('dBody');
    body.innerHTML = '';
    var title = el('div', 'd-title', esc(item.title));
    body.appendChild(title);
    API.logo(item.kind, item.id).then(function (src) {
      if (!src) return;
      var lg = el('img', 'd-logo'); lg.src = src; lg.alt = item.title;
      lg.onload = function () { if (title.parentNode) title.replaceWith(lg); };
    });

    var meta = el('div', 'd-meta');
    var bits = [];
    if (d.vote_average) bits.push('<span class="match">' + Math.round(d.vote_average * 10) + '% rating</span>');
    var yr = (d.release_date || d.first_air_date || '').slice(0, 4);
    if (yr) bits.push('<span>' + yr + '</span>');
    meta.innerHTML = bits.join('');
    body.appendChild(meta);
    API.extra(item.kind, item.id).then(function (ex) {
      var more = '';
      if (ex.cert) more += '<span class="cert">' + esc(ex.cert) + '</span>';
      if (item.kind === 'tv' && ex.seasons) more += '<span>' + ex.seasons + ' Season' + (ex.seasons > 1 ? 's' : '') + '</span>';
      if (item.kind !== 'tv' && ex.runtime) more += '<span>' + Math.floor(ex.runtime / 60) + 'h ' + (ex.runtime % 60) + 'm</span>';
      meta.insertAdjacentHTML('beforeend', more);
    });

    /* Play / Resume */
    var btns = el('div', 'd-btns');
    var playBtn = el('button', 'btn btn-white');
    var resume = null, label = 'Play';
    if (item.kind === 'tv') {
      resume = Store.resumePoint(item.id);
      if (resume) label = 'Resume S' + resume.season + ':E' + resume.episode;
    } else {
      var p = Store.progress(item);
      if (p && p.pct > 2 && p.pct < 92) { resume = p; label = 'Resume'; }
    }
    playBtn.innerHTML = ICON.play + esc(label);
    playBtn.addEventListener('click', function () { playItem(item); });
    btns.appendChild(playBtn);
    body.appendChild(btns);
    if (resume && resume.pct) {
      var rb = el('div', 'd-resume', '<div class="bar"><i style="width:' + resume.pct + '%"></i></div>' +
        (resume.d ? '<small>' + Math.max(1, Math.round((resume.d - resume.t) / 60)) + 'm remaining</small>' : ''));
      body.appendChild(rb);
    }

    if (d.overview) body.appendChild(el('p', 'd-overview', esc(d.overview)));
    var cast = ((d.credits && d.credits.cast) || []).slice(0, 4).map(function (c) { return c.name; });
    var crew = ((d.credits && d.credits.crew) || []).filter(function (c) { return c.job === 'Director'; }).map(function (c) { return c.name; });
    var creators = (d.created_by || []).map(function (c) { return c.name; });
    var castHtml = '';
    if (cast.length) castHtml += '<b>Starring:</b> ' + esc(cast.join(', ')) + '<br>';
    if (crew.length) castHtml += '<b>Director:</b> ' + esc(crew.slice(0, 2).join(', '));
    else if (creators.length) castHtml += '<b>Creator:</b> ' + esc(creators.slice(0, 2).join(', '));
    if (castHtml) body.appendChild(el('div', 'd-cast', castHtml));

    /* My List / Share */
    var acts = el('div', 'd-actions');
    var la = el('button', 'd-act', (Store.inList(item) ? ICON.tick : ICON.plus) + '<span>My List</span>');
    la.addEventListener('click', function () {
      var on = Store.toggleList(item);
      la.innerHTML = (on ? ICON.tick : ICON.plus) + '<span>My List</span>';
      toast(on ? 'Added to My List' : 'Removed from My List');
    });
    acts.appendChild(la);
    var sh = el('button', 'd-act', ICON.share + '<span>Share</span>');
    sh.addEventListener('click', function () {
      var url = 'https://www.sharkmovie.co.uk/' + (item.kind === 'tv' ? 'tv.html?id=' : 'movie.html?id=') + item.id;
      if (N && N.share) N.share(item.title + ' on Sharky Movies', url);
      else if (navigator.share) navigator.share({ title: item.title, url: url }).catch(function () {});
      else toast(url, 4000);
    });
    acts.appendChild(sh);
    body.appendChild(acts);

    /* Tabs: Episodes (series) / More Like This */
    var tabs = el('div', 'd-tabs');
    var tabEp = item.kind === 'tv' ? el('button', 'd-tab on', 'Episodes') : null;
    var tabMore = el('button', 'd-tab' + (tabEp ? '' : ' on'), 'More Like This');
    if (tabEp) tabs.appendChild(tabEp);
    tabs.appendChild(tabMore);
    body.appendChild(tabs);
    var pane = el('div');
    body.appendChild(pane);

    function showEpisodes() {
      if (tabEp) tabEp.classList.add('on');
      tabMore.classList.remove('on');
      pane.innerHTML = '';
      var seasons = (d.seasons || []).filter(function (s) { return s.season_number > 0 && (s.episode_count || 0) > 0; });
      if (!seasons.length) seasons = [{ season_number: 1, name: 'Season 1' }];
      var start = resume && resume.season ? resume.season : seasons[0].season_number;
      if (!seasons.some(function (s) { return s.season_number === start; })) start = seasons[0].season_number;
      var sel = el('select', 'season-select');
      seasons.forEach(function (s) {
        var o = el('option', null, esc(s.name || ('Season ' + s.season_number)));
        o.value = s.season_number;
        if (s.season_number === start) o.selected = true;
        sel.appendChild(o);
      });
      pane.appendChild(sel);
      var list = el('div');
      pane.appendChild(list);
      sel.addEventListener('change', function () { loadEpisodes(item, Number(sel.value), list, resume); });
      loadEpisodes(item, start, list, resume);
    }
    function showMore() {
      tabMore.classList.add('on');
      if (tabEp) tabEp.classList.remove('on');
      pane.innerHTML = '';
      var recs = ((d.recommendations && d.recommendations.results) || []).map(function (r) { return API.normalise(r, item.kind); })
        .filter(function (i) { return i && i.poster; });
      if (!recs.length) { pane.appendChild(el('div', 'empty', 'Nothing similar to show.')); return; }
      pane.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
      playable(recs).then(function (keep) {
        pane.innerHTML = '';
        if (!keep.length) { pane.appendChild(el('div', 'empty', 'Nothing similar in the library yet.')); return; }
        var g = el('div', 'poster-grid more-grid');
        keep.slice(0, 18).forEach(function (it) { g.appendChild(posterCard(it)); });
        pane.appendChild(g);
      });
    }
    if (tabEp) tabEp.addEventListener('click', showEpisodes);
    tabMore.addEventListener('click', showMore);
    if (tabEp) showEpisodes(); else showMore();
    /* Mobile website: trailer in the banner, comments at the bottom
       (sharky-extras.js - not part of the Android app). */
    if (window.SharkyExtras && !N) window.SharkyExtras.mount(item.kind, item.id, $('dMedia'), body);
  }

  function loadEpisodes(item, season, host, resume) {
    detail.season = season;
    host.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    API.episodes(item.id, season).then(function (eps) {
      if (!detail || detail.item !== item || detail.season !== season) return;
      host.innerHTML = '';
      if (!eps.length) { host.appendChild(el('div', 'empty', 'No episodes listed for this season.')); return; }
      var current = null;
      eps.forEach(function (ep) {
        var b = el('button', 'ep');
        var isCur = resume && resume.season === season && resume.episode === ep.n;
        if (isCur) { b.classList.add('current'); current = b; }
        var top = el('div', 'ep-top');
        var art = el('div', 'ep-art');
        if (ep.still) { var im = el('img'); im.loading = 'lazy'; im.src = ep.still; im.onerror = function () { im.remove(); }; art.appendChild(im); }
        art.appendChild(el('div', 'cw-play', '<span>' + ICON.play + '</span>'));
        var pr = Store.progress({ id: item.id, kind: 'tv', season: season, episode: ep.n });
        if (pr && pr.pct > 1) art.appendChild(el('div', 'bar', '<i style="width:' + Math.min(100, pr.pct) + '%"></i>'));
        top.appendChild(art);
        top.appendChild(el('div', 'ep-name', ep.n + '. ' + esc(ep.name || ('Episode ' + ep.n)) +
          (ep.runtime ? '<small>' + ep.runtime + 'm</small>' : '')));
        b.appendChild(top);
        if (ep.overview) b.appendChild(el('div', 'ep-ov', esc(ep.overview)));
        b.addEventListener('click', function () { play(item, season, ep.n, ep.name); });
        host.appendChild(b);
      });
      if (current) setTimeout(function () {
        var sc = $('detailsScroll');
        sc.scrollTo({ top: current.offsetTop - 120, behavior: 'smooth' });
      }, 300);
    }).catch(function () {
      host.innerHTML = '';
      host.appendChild(el('div', 'empty', 'Could not load episodes.'));
    });
  }

  /* ── Playing ────────────────────────────────────────────────────────── */
  var ctx = null;          // what is playing: {item, season, episode, epName}
  var loadT = null;

  function playItem(item) {
    if (item.kind === 'tv') {
      var r = Store.resumePoint(item.id);
      play(item, r ? r.season : 1, r ? r.episode : 1, r ? r.epName : '');
    } else play(item);
  }

  function embedUrl(item, s, e) {
    var base = CFG.API + '/embed/';
    return item.kind === 'tv' ? base + 'tv/' + item.id + '/' + (s || 1) + '/' + (e || 1) + '?app=android'
                              : base + 'movie/' + item.id + '?app=android';
  }

  function play(item, season, episode, epName) {
    ctx = { item: item, season: Number(season) || 0, episode: Number(episode) || 0, epName: epName || '' };
    if (window.SharkyExtras) window.SharkyExtras.pause();
    var p = $('player');
    p.classList.add('open');
    p.setAttribute('aria-hidden', 'false');
    $('playerLoad').style.display = '';
    $('playerClose').style.display = '';
    $('playerStatus').textContent = 'Loading ' + item.title + (item.kind === 'tv' ? ' · S' + (season || 1) + ':E' + (episode || 1) : '');
    if (N && N.enterPlayer) N.enterPlayer();
    else { webFullscreen(p); sideways(); setTimeout(sideways, 500); }
    var f = $('playerFrame');
    frameGo(f, embedUrl(item, season, episode));
    clearTimeout(loadT);
    loadT = setTimeout(function () {
      if ($('playerLoad').style.display !== 'none') $('playerStatus').textContent = 'Still finding the best copy…';
    }, 12000);
  }

  /* In a phone browser there is no native shell to turn the phone sideways:
     go full screen and ask for landscape where the browser allows it
     (Android Chrome does; iPhone just fills the screen and you rotate). */
  function webFullscreen(p) {
    try {
      var req = p.requestFullscreen || p.webkitRequestFullscreen;
      var r = req && req.call(p);
      var lock = function () {
        try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); } catch (e) {}
      };
      if (r && r.then) r.then(lock).catch(function () {}); else lock();
    } catch (e) {}
  }
  /* iPhone (and any browser that won't turn the screen): if the phone is
     still upright, turn the player itself sideways, like the app does. As
     soon as the phone is actually turned, the normal layout takes over. */
  function sideways() {
    var p = $('player');
    if (!p) return;
    var on = !N && p.classList.contains('open') && window.innerHeight > window.innerWidth;
    p.classList.toggle('sideways', on);
    if (on) {
      p.style.setProperty('--pw', window.innerWidth + 'px');
      p.style.setProperty('--ph', window.innerHeight + 'px');
    }
  }
  window.addEventListener('resize', function () { setTimeout(sideways, 60); });
  window.addEventListener('orientationchange', function () { setTimeout(sideways, 300); });

  function webExitFullscreen() {
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
    try {
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) {}
  }

  /* Load the player without adding to the browser's Back history. Setting
     an iframe's src adds an entry, so on the mobile website Back after a
     film would quietly reload the player instead of closing the details. */
  function frameGo(f, url) {
    try { if (f.contentWindow) { f.contentWindow.location.replace(url); return; } } catch (e) {}
    f.src = url;
  }

  function closePlayer() {
    var p = $('player');
    if (!p.classList.contains('open')) return false;
    if (!N) webExitFullscreen();
    try { frameGo($('playerFrame'), 'about:blank'); } catch (e) {}
    p.classList.remove('open');
    p.classList.remove('sideways');
    p.setAttribute('aria-hidden', 'true');
    clearTimeout(loadT);
    if (N && N.exitPlayer) N.exitPlayer();
    ctx = null;
    /* Progress bars and Continue Watching have moved on. */
    if (detail) buildDetailsIfOpen();
    if (tab === 'home') refreshPersonal();
    if (tab === 'list') renderList();
    return true;
  }

  function buildDetailsIfOpen() {
    if (detail && detail.d && $('details').classList.contains('open')) {
      var y = $('detailsScroll').scrollTop;
      buildDetails(detail.item, detail.d);
      setTimeout(function () { $('detailsScroll').scrollTop = y; }, 50);
    }
  }

  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || !d.type || !ctx) return;
    if (d.type === 'sharky:progress') {
      $('playerLoad').style.display = 'none';
      clearTimeout(loadT);
      Store.touch({
        id: ctx.item.id, kind: ctx.item.kind, title: ctx.item.title,
        poster: ctx.item.poster, backdrop: ctx.item.backdrop || ctx.item.card,
        season: d.season || ctx.season, episode: d.episode || ctx.episode, epName: ctx.epName
      }, d.pct, d.t, d.d);
      return;
    }
    if (d.type === 'sharky:next-episode') {
      ctx.season = Number(d.season) || ctx.season;
      ctx.episode = Number(d.episode) || ctx.episode;
      ctx.epName = d.name || '';
      return;
    }
    if (d.type === 'sharky:back') { closePlayer(); }
  });
  /* The player hides its spinner once video is up even before the first
     progress post: drop ours after a short while regardless. */
  $('playerFrame').addEventListener('load', function () {
    if ($('playerFrame').src.indexOf('about:') === 0) return;
    setTimeout(function () { $('playerLoad').style.display = 'none'; }, 2500);
    /* The player has its own Back button (it tells us to close); ours is only
       for while it is still loading, so the two never sit on top of each other. */
    setTimeout(function () { $('playerClose').style.display = 'none'; }, 1500);
  });

  /* ── Settings ───────────────────────────────────────────────────────── */
  function openSettings() {
    var s = $('settings');
    s.classList.add('open');
    s.setAttribute('aria-hidden', 'false');
    var b = $('settingsBody');
    b.innerHTML = '';
    function row(title, sub, ctl) {
      var r = el('div', 'set-row');
      r.appendChild(el('div', null, '<b>' + title + '</b><small>' + sub + '</small>'));
      r.appendChild(ctl);
      b.appendChild(r);
      return r;
    }
    /* Account first: profile, account, signing in a TV. */
    if (window.SharkyAccount && !SharkyAccount.account) {
      var si = el('button', 'set-btn', 'Sign in');
      si.addEventListener('click', function () { closeSettings(); SharkyAccount.open('welcome'); });
      row('Account', 'Optional. Keeps your history and list on every device, with profiles.', si);
    }
    if (window.SharkyAccount && SharkyAccount.account) {
      var pf = SharkyAccount.profile;
      var swp = el('button', 'set-btn', 'Switch');
      swp.addEventListener('click', function () { closeSettings(); SharkyAccount.open('profiles'); });
      row('Profile', pf ? esc(pf.name) : 'None chosen', swp);
      var tvb = el('button', 'set-btn', 'Enter code');
      tvb.addEventListener('click', function () { closeSettings(); SharkyAccount.open('link'); });
      row('Sign in a TV', 'Type the code shown on your Fire Stick or TV.', tvb);
      var pwb = el('button', 'set-btn', 'Change');
      pwb.addEventListener('click', function () { closeSettings(); SharkyAccount.open('password'); });
      row('Password', 'Change your account password.', pwb);
      var so = el('button', 'set-btn', 'Sign out');
      so.addEventListener('click', function () { closeSettings(); SharkyAccount.signOut(); });
      row('Account', esc(SharkyAccount.account.email), so);
    }

    var sw = el('button', 'switch' + (CFG.LIBRARY_ONLY ? ' on' : ''));
    sw.addEventListener('click', function () {
      CFG.LIBRARY_ONLY = !CFG.LIBRARY_ONLY;
      sw.classList.toggle('on', CFG.LIBRARY_ONLY);
      renderHome();
    });
    row('Only show what’s ready', 'Hide titles that aren’t in the library yet. Search always shows everything.', sw);

    var sel = el('select', 'set-select');
    ['GB', 'IE', 'US', 'CA', 'AU', 'NZ', 'FR', 'DE', 'ES', 'IT', 'NL'].forEach(function (c) {
      var o = el('option', null, c); o.value = c; if (c === CFG.REGION) o.selected = true; sel.appendChild(o);
    });
    sel.addEventListener('change', function () { CFG.REGION = sel.value; renderHome(); });
    row('Top 10 country', 'Which country’s charts the Top 10 rows show.', sel);

    var clr = el('button', 'set-btn', 'Clear');
    clr.addEventListener('click', function () {
      if (!confirm('Clear Continue Watching, My List and all progress on this phone?')) return;
      Store.clearAll(); toast('Cleared'); renderHome();
    });
    row('Watch history', 'Continue Watching, My List and progress bars.', clr);

    var disc = el('button', 'set-btn', 'Open');
    disc.addEventListener('click', function () { openExternal('https://discord.gg/F7PP27VXnh'); });
    row('Discord', 'Help, requests and bug reports.', disc);

    if (N) {
      var site = el('button', 'set-btn', 'Open');
      site.addEventListener('click', function () { openExternal('https://www.sharkmovie.co.uk/'); });
      row('Website', 'sharkmovie.co.uk', site);
    } else {
      /* Running as the mobile website rather than inside the APK. */
      if (/Android/i.test(navigator.userAgent)) {
        var apk = el('button', 'set-btn', 'Download');
        apk.addEventListener('click', function () { location.href = '/sharky-movies-mobile.apk'; });
        row('Android app', 'Install Sharky as an app on this phone.', apk);
      }
      var full = el('button', 'set-btn', 'Switch');
      full.addEventListener('click', function () {
        try { localStorage.setItem('sharky_full_site', '1'); } catch (e) {}
        location.href = '/?full=1';
      });
      row('Full website', 'The desktop layout, on this phone.', full);
    }

    b.appendChild(el('div', 'empty', N ? 'Sharky Movies for Android ' + esc(window.SHARKY_APP_VERSION || '2.1.0') : 'Sharky Movies \u00b7 mobile site'));
  }
  function closeSettings() {
    var s = $('settings');
    if (!s.classList.contains('open')) return false;
    s.classList.remove('open');
    s.setAttribute('aria-hidden', 'true');
    return true;
  }
  function openExternal(url) {
    if (N && N.openExternal) N.openExternal(url);
    else window.open(url, '_blank');
  }

  /* ── Back button (the native shell asks us first) ───────────────────── */
  window.SharkyApp = {
    back: function () {
      if (window.SharkyAccount && SharkyAccount.isOpen) return SharkyAccount.back();
      if (closePlayer()) return true;
      if (closeSettings()) return true;
      if ($('details').classList.contains('open')) { closeDetails(); return true; }
      if (tab !== 'home') { setTab('home'); return true; }
      if (mode !== 'all') { setMode('all'); return true; }
      return false;                     // let Android leave the app
    },
    /* The phone was rotated / resumed while playing: nothing to do yet, but
       the shell calls it so behaviour can grow without a new APK. */
    resumed: function () { if (tab === 'home' && !ctx) refreshPersonal(); },
    /* A profile was picked or its history synced: redraw what shows it. */
    refresh: function () {
      try { refreshPersonal(); } catch (e) {}
      try { if (tab === 'list') renderList(); } catch (e) {}
    }
  };

  /* ── Wiring ─────────────────────────────────────────────────────────── */
  document.querySelectorAll('.tab').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.getAttribute('data-tab') === tab) {
        var v = $('view-' + tab); if (v) v.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setTab(b.getAttribute('data-tab'));
    });
  });
  document.querySelectorAll('.chip').forEach(function (c) {
    c.addEventListener('click', function () {
      var m = c.getAttribute('data-mode');
      setMode(m === mode ? 'all' : m);
    });
  });
  $('detailsClose').addEventListener('click', function () { detailStack = []; closeDetails(); });
  $('playerClose').addEventListener('click', closePlayer);
  $('openSettings').addEventListener('click', openSettings);
  $('settingsClose').addEventListener('click', closeSettings);
  /* Top bar goes solid once you scroll past the hero. */
  $('view-home').addEventListener('scroll', function () {
    $('topbar').classList.toggle('solid', $('view-home').scrollTop > 60);
  }, { passive: true });
  /* Android back in a plain browser (testing): treat history pops the same. */
  if (!N) {
    history.pushState({ s: 1 }, '');
    window.addEventListener('popstate', function () {
      if (window.SharkyApp.back()) history.pushState({ s: 1 }, '');
    });
  }

  renderHome();
})();
