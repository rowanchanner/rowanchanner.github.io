/* ui.js — the pieces every screen is built from.
 *
 * Cards are wide (backdrop-shaped) rather than tall posters: at three metres
 * a 16:9 tile with the title underneath is far easier to read across a row
 * than a column of portrait posters, and it matches what the artwork from
 * TMDB is actually shaped like.
 */
(function (w) {
  'use strict';

  var FALLBACK = 'img/placeholder.svg';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function card(item, opts) {
    opts = opts || {};
    var b = el('button', 'f card');
    b.type = 'button';
    /* Scoped so the same film appearing in two rows gives two distinct keys:
       focus memory and the Back stack both find elements by this. */
    var base = item.key || (item.kind + ':' + item.id);
    b.setAttribute('data-key', (opts.scope ? opts.scope + '|' : '') + base);
    b.setAttribute('data-id', item.id);
    b.setAttribute('data-kind', item.kind);

    var art = el('div', 'card-art');
    var img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = item.card || item.poster || FALLBACK;
    img.addEventListener('error', function () { img.src = FALLBACK; });
    art.appendChild(img);

    if (item.kind === 'tv') art.appendChild(el('span', 'card-badge', 'SERIES'));

    /* Continue-watching cards carry how far in you got. */
    if (opts.progress != null && opts.progress > 0) {
      var bar = el('div', 'card-progress');
      var fill = el('div', 'card-progress-fill');
      fill.style.width = Math.max(2, Math.min(100, opts.progress)) + '%';
      bar.appendChild(fill);
      art.appendChild(bar);
    }

    /* Top 10 rows put the position beside the artwork, as a big outlined
       numeral. It is the one bit of chrome that says "chart" without a word
       of explanation. */
    if (opts.rank) {
      b.classList.add('card-ranked');
      var rank = el('div', 'card-rank');
      rank.appendChild(el('span', 'card-rank-n', String(opts.rank)));
      b.appendChild(rank);
    }

    b.appendChild(art);

    var label = el('div', 'card-label');
    label.appendChild(el('span', 'card-title', item.title));
    var sub = opts.subtitle != null ? opts.subtitle : item.year;
    if (sub) label.appendChild(el('span', 'card-sub', sub));
    b.appendChild(label);

    b.__item = item;
    b.__opts = opts;
    return b;
  }

  /* One horizontal row: a heading and a track of cards that scrolls sideways
     as the highlight moves along it. */
  function row(id, title, items, opts) {
    opts = opts || {};
    var block = el('section', 'row-block');
    block.id = 'block-' + id;
    if (opts.ranked) block.classList.add('row-ranked');
    block.appendChild(el('h2', 'row-title', title));

    var vp = el('div', 'row-viewport');
    var track = el('div', 'row-track');
    track.id = 'track-' + id;

    items.forEach(function (item, i) {
      var co = typeof opts.cardOpts === 'function' ? opts.cardOpts(item) : (opts.cardOpts || {});
      co = shallow(co);
      co.scope = id;
      if (opts.ranked) co.rank = i + 1;
      track.appendChild(card(item, co));
    });

    vp.appendChild(track);
    block.appendChild(vp);
    return block;
  }

  /* A page of cards rather than a row — used by Movies, TV and My List. */
  function grid(items, opts) {
    opts = opts || {};
    var g = el('div', 'grid');
    items.forEach(function (item) {
      var co = typeof opts.cardOpts === 'function' ? opts.cardOpts(item) : (opts.cardOpts || {});
      co = shallow(co);
      co.scope = opts.scope || 'grid';
      g.appendChild(card(item, co));
    });
    return g;
  }

  function shallow(o) {
    var out = {};
    Object.keys(o || {}).forEach(function (k) { out[k] = o[k]; });
    return out;
  }

  function spinner(text) {
    var d = el('div', 'loading');
    d.appendChild(el('div', 'spinner'));
    d.appendChild(el('div', 'loading-text', text || 'Loading'));
    return d;
  }

  function empty(text) {
    return el('div', 'empty', text);
  }

  function runtimeText(mins) {
    mins = Number(mins) || 0;
    if (!mins) return '';
    var h = Math.floor(mins / 60), m = mins % 60;
    return h ? (h + 'h ' + m + 'm') : (m + 'm');
  }

  function timeText(secs) {
    secs = Math.max(0, Math.floor(secs || 0));
    var h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
    return h ? (h + 'h ' + m + 'm') : (m + 'm');
  }

  w.UI = {
    el: el, card: card, row: row, grid: grid,
    spinner: spinner, empty: empty,
    runtimeText: runtimeText, timeText: timeText,
    FALLBACK: FALLBACK
  };
})(window);
