/* trailer.js - muted trailer behind the artwork (home billboard + details),
 * same rules as the website:
 *  - shown only once YouTube has been playing ~3.5s, so its title and big
 *    buttons are never seen; dropped back to the still on pause / buffer;
 *  - looped by us (YouTube's own loop flashes its overlay);
 *  - a trailer that won't play (embedding blocked, region) -> the next one;
 *  - stops the moment the real player opens: one video decoder on a Fire Stick.
 * ES5 only - old Fire TV WebViews run this.
 */
(function (w) {
  'use strict';
  var all = [];
  /* Inside the Fire Stick app: see html.tv-app in app.css. */
  try { if (w.SharkyHost) document.documentElement.className += ' tv-app'; } catch (e) {}
  /* Card trailers wait until the app has properly settled after starting. */
  var bootAt = Date.now(), introAt = 0;
  document.addEventListener('intro:done', function () { introAt = Date.now(); });
  function settled() { return introAt && Date.now() - introAt > 6000 && Date.now() - bootAt > 9000; }

  /* A YouTube frame must NEVER take over the screen. On a Fire Stick a frame
     that goes fullscreen hides the whole app behind a black video surface, so
     if one ever tries, pull it straight back out and stop all trailers. */
  var killed = false;
  function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  function onFs() {
    var el = fsEl();
    if (!el || el.tagName !== 'IFRAME' || (w.Player && w.Player.isOpen)) return;
    killed = true;
    try { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } catch (e) {}
    try { api.stopAll(); } catch (e) {}
  }
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('webkitfullscreenchange', onFs);

  function create(frame, host, showClass, revealMs) {
    var t = { frame: frame, host: host, cls: showClass || 'previewing', keys: [], timer: null, reveal: null, my: 0,
              revealMs: revealMs || 3500 };
    all.push(t);
    t.play = function (kind, id) {
      t.stop();
      var my = ++t.my;
      API.trailerKeys(kind, id).then(function (keys) {
        if (my !== t.my || !keys.length) return;
        t.keys = keys.slice();
        load(t);
      });
    };
    t.stop = function () {
      t.my++;
      clearTimeout(t.timer); clearTimeout(t.reveal); t.reveal = null;
      t.keys = [];
      if (t.frame.getAttribute('src')) t.frame.removeAttribute('src');
      t.frame.classList.add('off');
      hide(t);
    };
    return t;
  }

  function show(t) { if (t.host && t.host.className.indexOf(t.cls) < 0) t.host.className += ' ' + t.cls; }
  function hide(t) { if (t.host) t.host.className = t.host.className.replace(new RegExp('\\s*\\b' + t.cls + '\\b', 'g'), ''); }
  function cmd(t, func, args) {
    try { t.frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args || [] }), '*'); } catch (e) {}
  }

  function load(t) {
    if (!t.keys.length) { t.stop(); return; }
    if (killed || (w.Player && w.Player.isOpen) || document.hidden) { t.stop(); return; }
    var key = t.keys[0];
    t.frame.onload = function () {
      try { t.frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'tv' }), '*'); } catch (e) {}
    };
    t.frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(key) +
      '?autoplay=1&mute=1&controls=0&fs=0&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&disablekb=1' +
      '&cc_load_policy=0&enablejsapi=1&origin=' + encodeURIComponent(location.protocol + '//' + location.host);
    t.frame.classList.remove('off');
    clearTimeout(t.timer);
    t.timer = setTimeout(function () { next(t); }, 14000);     // never started: try another
  }

  function next(t) {
    clearTimeout(t.timer); clearTimeout(t.reveal); t.reveal = null;
    hide(t);
    t.keys.shift();
    if (t.keys.length) load(t); else t.stop();
  }

  w.addEventListener('message', function (e) {
    if (!/youtube(-nocookie)?\.com$/.test(String(e.origin || '').replace(/^https?:\/\//, ''))) return;
    var d;
    try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (x) { return; }
    if (!d) return;
    for (var i = 0; i < all.length; i++) {
      var t = all[i];
      if (!t.frame.contentWindow || e.source !== t.frame.contentWindow) continue;
      if (d.event === 'onError') { next(t); return; }
      var st = d.event === 'onStateChange' ? d.info : (d.event === 'infoDelivery' && d.info ? d.info.playerState : undefined);
      if (st === undefined) return;
      if (st === 1) {
        clearTimeout(t.timer);
        if (!t.reveal && t.host.className.indexOf(t.cls) < 0) {
          (function (tt) { tt.reveal = setTimeout(function () { tt.reveal = null; show(tt); }, tt.revealMs); })(t);
        }
      } else {
        clearTimeout(t.reveal); t.reveal = null;
        hide(t);
        if (st === 0) { cmd(t, 'seekTo', [0, true]); cmd(t, 'playVideo'); }
      }
      return;
    }
  });

  /* The real player opened (or the app went to the background): stop. */
  setInterval(function () {
    if ((w.Player && w.Player.isOpen) || document.hidden) {
      for (var i = 0; i < all.length; i++) if (all[i].frame.getAttribute('src')) all[i].stop();
    }
  }, 700);

  /* ── Card previews: rest on a card for a second and its picture becomes
     the trailer, like Netflix. One frame, moved from card to card, so only
     one trailer ever plays. */
  var cardT = null, cardTimer = null, cardEl = null;
  function stopCard() {
    clearTimeout(cardTimer); cardTimer = null;
    if (cardEl) cardEl.className = cardEl.className.replace(/\s*\bhas-trailer\b/g, '');
    if (cardT) cardT.stop();
    cardEl = null;
  }
  function cardFocus(el) {
    stopCard();
    if (!el || !el.classList || !el.classList.contains('card') || !el.__item) return;
    if (killed || !settled() || !(w.CFG && w.CFG.PREVIEWS)) return;
    var item = el.__item;
    if (!item.id || (item.kind !== 'movie' && item.kind !== 'tv')) return;
    cardEl = el;
    cardTimer = setTimeout(function () {
      if (cardEl !== el || (w.Player && w.Player.isOpen)) return;
      if (w.Nav && w.Nav.current && w.Nav.current !== el) return;
      var art = el.querySelector('.card-art');
      if (!art) return;
      if (!cardT) {
        var f = document.createElement('iframe');
        f.className = 'card-trailer off';
        f.setAttribute('title', 'Trailer');
        f.setAttribute('allow', 'autoplay; encrypted-media');
        f.setAttribute('frameborder', '0');
        f.setAttribute('tabindex', '-1');
        cardT = create(f, art, 'previewing', 2500);
      }
      var img = art.querySelector('img');
      art.insertBefore(cardT.frame, img ? img.nextSibling : art.firstChild);
      cardT.host = art;
      try { el.className += ' has-trailer'; } catch (e) {}
      cardT.play(item.kind, item.id);
    }, 1200);
  }

  var api = { create: create, cardFocus: function (el) { try { cardFocus(el); } catch (e) {} }, stopCard: stopCard,
                  stopAll: function () { stopCard(); for (var i = 0; i < all.length; i++) all[i].stop(); } };
  w.TVTrailer = api;
})(window);
