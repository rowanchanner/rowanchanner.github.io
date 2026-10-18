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

  function create(frame, host, showClass) {
    var t = { frame: frame, host: host, cls: showClass || 'previewing', keys: [], timer: null, reveal: null, my: 0 };
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
      t.frame.className = 'off';
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
    if (w.Player && w.Player.isOpen) { t.stop(); return; }
    var key = t.keys[0];
    t.frame.onload = function () {
      try { t.frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'tv' }), '*'); } catch (e) {}
    };
    t.frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(key) +
      '?autoplay=1&mute=1&controls=0&fs=0&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&disablekb=1' +
      '&cc_load_policy=0&enablejsapi=1&origin=' + encodeURIComponent(location.protocol + '//' + location.host);
    t.frame.className = '';
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
          (function (tt) { tt.reveal = setTimeout(function () { tt.reveal = null; show(tt); }, 3500); })(t);
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

  w.TVTrailer = { create: create, stopAll: function () { for (var i = 0; i < all.length; i++) all[i].stop(); } };
})(window);
