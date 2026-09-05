/* player.js — playing is a mode, not a panel.
 *
 * The video itself is the API's own player, loaded in an iframe. That is
 * deliberate: it already knows how to resolve a source, remux it, pick audio
 * tracks, load subtitles and roll into the next episode, and all of that keeps
 * working here without being reimplemented.
 *
 * What this file adds is the two things an iframe cannot do for itself on a
 * television:
 *
 *   The remote. A TV WebView will not reliably move key focus into a
 *   cross-origin iframe, so the app keeps receiving the keys and forwards
 *   every one of them in. When focus genuinely is inside the frame this
 *   handler never fires, so nothing is ever handled twice.
 *
 *   Memory. The player is on another origin and cannot write to our storage,
 *   so it posts its position out instead and we file it against the title.
 */
(function (w) {
  'use strict';

  var overlay, frame, spinner, statusEl;
  var open = false;
  var ctx = null;            // what is playing: {item, season, episode, epName}
  var opener = null;
  var loadTimer = null;

  function build() {
    if (overlay) return;
    overlay = document.getElementById('playerOverlay');
    frame = document.getElementById('playerFrame');
    spinner = document.getElementById('playerLoading');
    statusEl = document.getElementById('playerStatus');
  }

  function show(item, season, episode, epName) {
    build();
    ctx = {
      item: item,
      season: Number(season) || 0,
      episode: Number(episode) || 0,
      epName: epName || ''
    };
    opener = Nav.current;

    overlay.classList.remove('off');
    overlay.classList.remove('loaded');
    document.body.classList.add('playing');
    open = true;
    setStatus('Loading stream');

    var url = API.embedUrl(item, ctx.season, ctx.episode);
    frame.src = url;

    /* A cold server can take the best part of a minute. Say so rather than
       spinning silently, which reads as a hang. */
    clearTimeout(loadTimer);
    loadTimer = setTimeout(function () {
      if (open) setStatus('Still working — the server may be waking up');
    }, 12000);

    try { frame.focus(); } catch (e) {}
    Nav.push(keyHandler);
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function hide() {
    if (!open) return;
    open = false;
    clearTimeout(loadTimer);
    Nav.pop(keyHandler);

    /* Blanking the source stops playback and, more to the point, stops the
       server transcoding for a video nobody is watching. */
    try { frame.src = 'about:blank'; } catch (e) {}

    overlay.classList.add('off');
    overlay.classList.remove('loaded');
    document.body.classList.remove('playing');

    var was = ctx;
    ctx = null;

    if (opener && document.contains(opener)) Nav.focus(opener);
    else Nav.focusFirst();
    opener = null;

    document.dispatchEvent(new CustomEvent('player:closed', { detail: was }));
  }

  /* Everything goes through to the player while it is up, except Back when
     the frame is unreachable — people must always be able to get out. */
  function keyHandler(action, e) {
    if (!open) return false;
    var sent = false;
    if (frame && frame.contentWindow) {
      try {
        frame.contentWindow.postMessage({
          type: 'sharky:key',
          key: e.key || '',
          keyCode: e.keyCode || e.which || 0
        }, '*');
        sent = true;
      } catch (err) {}
    }
    if (!sent && action === 'back') hide();
    return true;
  }

  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || !d.type) return;

    if (d.type === 'sharky:back') { hide(); return; }

    if (d.type === 'sharky:progress' && ctx) {
      if (!overlay.classList.contains('loaded')) {
        overlay.classList.add('loaded');
        clearTimeout(loadTimer);
      }
      Store.touch({
        id: ctx.item.id,
        kind: ctx.item.kind,
        title: ctx.item.title,
        poster: ctx.item.poster,
        backdrop: ctx.item.backdrop || ctx.item.card,
        season: d.season || ctx.season,
        episode: d.episode || ctx.episode,
        epName: ctx.epName
      }, d.pct, d.t, d.d);
      return;
    }

    /* The player rolled into the next episode by itself; follow it so the
       home screen and the episode list agree with what is on screen. */
    if (d.type === 'sharky:next-episode' && ctx) {
      ctx.season = Number(d.season) || ctx.season;
      ctx.episode = Number(d.episode) || ctx.episode;
      ctx.epName = '';
      document.dispatchEvent(new CustomEvent('player:episode', { detail: ctx }));
      return;
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    build();
    if (frame) {
      frame.addEventListener('load', function () {
        if (!open) return;
        overlay.classList.add('loaded');
        clearTimeout(loadTimer);
        try { frame.focus(); } catch (e) {}
      });
    }
  });

  w.Player = {
    play: show,
    close: hide,
    get isOpen() { return open; },
    get context() { return ctx; }
  };
})(window);
