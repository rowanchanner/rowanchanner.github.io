/* announcement.js - the pop-up announcement AND survey on the website, mobile
 * site and TV app. What they say, and when they show, is set on the admin
 * page (api.sharkmovie.co.uk/admin/accounts -> Announcements / Surveys); this
 * file only asks the server what is live right now. Each one shows once -
 * closing or answering it remembers its id. Works with a mouse, a touch
 * screen and a TV remote (arrows, OK, Back). ES5 only: old Fire TV WebViews
 * load this too.
 */
(function () {
  'use strict';

  var BASE = 'https://api.sharkmovie.co.uk';
  var KEY = 'sharky_announcement_closed';
  var SKEY = 'sharky_surveys_done';
  var INTRO_MAX_MS = 8000;
  var shown = false, surveyShown = false, busy = false;

  function closedId() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function surveyDone(id) {
    try { return (',' + (localStorage.getItem(SKEY) || '') + ',').indexOf(',' + id + ',') >= 0; } catch (e) { return false; }
  }
  function markSurvey(id) {
    try {
      var v = (localStorage.getItem(SKEY) || '').split(',').filter(function (x) { return x; });
      if (v.indexOf(id) < 0) v.push(id);
      localStorage.setItem(SKEY, v.slice(-40).join(','));
    } catch (e) {}
  }
  function who() {
    try {
      var w = localStorage.getItem('sharky_survey_uid');
      if (!w) {
        w = 'u' + new Date().getTime().toString(36) + Math.random().toString(36).slice(2, 10);
        localStorage.setItem('sharky_survey_uid', w);
      }
      return w;
    } catch (e) { return 'anon' + Math.random().toString(36).slice(2, 10); }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function isTV() { return !!document.getElementById('sa-tv-marker') || /\/tv\//.test(location.pathname); }

  var CSS =
    '#sharkyAnnouncement{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483600;display:-webkit-box;display:-webkit-flex;display:flex;' +
      '-webkit-box-align:center;-webkit-align-items:center;align-items:center;-webkit-box-pack:center;-webkit-justify-content:center;justify-content:center;' +
      'padding:20px;box-sizing:border-box;background:rgba(0,0,0,.82);opacity:0;-webkit-transition:opacity .25s ease;transition:opacity .25s ease}' +
    '#sharkyAnnouncement.show{opacity:1}' +
    '#sharkyAnnouncement .sa-card{position:relative;width:100%;max-width:680px;max-height:90%;overflow:auto;box-sizing:border-box;' +
      'background:#111118;color:#f2f2f5;border:2px solid #e50914;border-radius:16px;padding:34px 34px 30px;' +
      'box-shadow:0 24px 80px rgba(0,0,0,.8);font-family:inherit;text-align:left}' +
    '#sharkyAnnouncement .sa-close{position:absolute;top:12px;right:12px;width:52px;height:52px;border-radius:50%;' +
      'border:2px solid rgba(255,255,255,.25);background:#1d1d27;color:#fff;font-size:2rem;line-height:44px;cursor:pointer;padding:0;text-align:center}' +
    '#sharkyAnnouncement .sa-close:hover,#sharkyAnnouncement .sa-close:focus{background:#e50914;border-color:#e50914;outline:none}' +
    '#sharkyAnnouncement .sa-tag{display:inline-block;background:#e50914;color:#fff;font-weight:800;font-size:.8rem;' +
      'letter-spacing:2px;text-transform:uppercase;padding:5px 12px;border-radius:999px;margin-bottom:14px}' +
    '#sharkyAnnouncement .sa-tag.sv{background:#7c3aed}' +
    '#sharkyAnnouncement h2{margin:0 60px 16px 0;font-size:1.7rem;line-height:1.2;font-weight:900;color:#fff}' +
    '#sharkyAnnouncement p{margin:0 0 14px;font-size:1.1rem;line-height:1.6;color:#d6d6de}' +
    '#sharkyAnnouncement .sa-go{display:inline-block;margin-top:6px;background:#e50914;color:#fff;font-weight:800;border:0;cursor:pointer;' +
      'font-size:1.05rem;padding:12px 20px;border-radius:10px;text-decoration:none;font-family:inherit}' +
    '#sharkyAnnouncement .sa-go:focus{outline:3px solid #fff}' +
    '#sharkyAnnouncement .sa-go[disabled]{opacity:.45;cursor:default}' +
    '#sharkyAnnouncement .sa-opt{display:block;width:100%;box-sizing:border-box;text-align:left;margin:0 0 10px;padding:14px 18px 14px 50px;' +
      'position:relative;border-radius:10px;border:2px solid #2a2a38;background:#1b1b25;color:#fff;font-size:1.1rem;cursor:pointer;font-family:inherit}' +
    '#sharkyAnnouncement .sa-opt:before{content:"";position:absolute;left:16px;top:50%;margin-top:-10px;width:16px;height:16px;' +
      'border:2px solid #777;border-radius:50%}' +
    '#sharkyAnnouncement .sa-opt.multi:before{border-radius:4px}' +
    '#sharkyAnnouncement .sa-opt.on{border-color:#e50914;background:#2a1216}' +
    '#sharkyAnnouncement .sa-opt.on:before{background:#e50914;border-color:#e50914}' +
    '#sharkyAnnouncement .sa-opt:focus{outline:3px solid #fff;outline-offset:1px}' +
    '#sharkyAnnouncement .sa-hint{margin:18px 0 0;font-size:.85rem;color:#8a8a99}' +
    '@media (max-width:560px){#sharkyAnnouncement .sa-card{padding:26px 20px 22px}#sharkyAnnouncement h2{font-size:1.4rem}' +
      '#sharkyAnnouncement p{font-size:1rem}#sharkyAnnouncement .sa-close{width:46px;height:46px;line-height:38px}}' +
    '@media (min-width:1700px){#sharkyAnnouncement .sa-card{max-width:900px}#sharkyAnnouncement h2{font-size:2.4rem}' +
      '#sharkyAnnouncement p,#sharkyAnnouncement .sa-opt{font-size:1.5rem}}';

  var styled = false;
  function style() {
    if (styled) return;
    styled = true;
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* One pop-up frame, used by both. `keys(e, kind)` handles the remote. */
  function popup(html, onClose) {
    style();
    var wrap = document.createElement('div');
    wrap.id = 'sharkyAnnouncement';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.innerHTML = '<div class="sa-card">' + html + '</div>';
    document.body.appendChild(wrap);
    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    var done = false;
    var api = {
      wrap: wrap,
      close: function () {
        if (done) return;
        done = true;
        window.removeEventListener('keydown', api.onKey, true);
        wrap.className = '';
        document.body.style.overflow = prevOverflow;
        setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 260);
        if (onClose) onClose();
      },
      onKey: null
    };
    wrap.querySelector('.sa-close').addEventListener('click', function () { api.close(); });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) api.close(); });
    setTimeout(function () {
      wrap.className = 'show';
      try { wrap.querySelector('.sa-close').focus(); } catch (e) {}
    }, 30);
    return api;
  }

  function keyKind(e) {
    var k = e.key, c = e.keyCode;
    if (k === 'Escape' || k === 'GoBack' || k === 'BrowserBack' || c === 27 || c === 4 || c === 10009 || c === 461 ||
        k === 'Backspace' || c === 8) return 'back';
    if (k === 'Enter' || c === 13 || c === 23) return 'ok';
    if (c === 37 || c === 38) return 'prev';
    if (c === 39 || c === 40) return 'next';
    return '';
  }
  function swallow(e) {
    e.preventDefault();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    e.stopPropagation();
  }

  /* ── Announcement ── */
  function build(a, after) {
    if (shown || document.getElementById('sharkyAnnouncement')) { if (after) after(); return; }
    shown = true;
    var paras = String(a.body || '').replace(/\r/g, '').split(/\n\s*\n/), body = '';
    for (var i = 0; i < paras.length; i++) {
      if (paras[i].replace(/\s/g, '')) body += '<p>' + esc(paras[i]).replace(/\n/g, '<br>') + '</p>';
    }
    var link = /^https?:\/\//i.test(a.link || '') ? a.link : '';
    var p = popup(
      '<button class="sa-close" type="button" aria-label="Close announcement">&times;</button>' +
      '<span class="sa-tag">Announcement</span>' +
      '<h2>' + esc(a.title) + '</h2>' + body +
      (link ? '<a class="sa-go" href="' + esc(link) + '" target="_blank" rel="noopener">' + esc(a.link_text || 'Find out more') + '</a>' : '') +
      '<p class="sa-hint">' + (isTV() ? 'Press OK or Back to close.' : 'Click the &times; in the corner to close this.') + '</p>',
      function () {
        try { localStorage.setItem(KEY, a.id); } catch (e) {}
        if (after) setTimeout(after, 700);
      });
    var closeBtn = p.wrap.querySelector('.sa-close'), goBtn = p.wrap.querySelector('.sa-go');
    p.onKey = function (e) {
      var k = keyKind(e);
      if (!k) return;
      swallow(e);
      if (k === 'back') { p.close(); return; }
      if (k === 'ok') {
        if (goBtn && document.activeElement === goBtn) { window.open(link, '_blank'); return; }
        p.close(); return;
      }
      if (goBtn) (document.activeElement === goBtn ? closeBtn : goBtn).focus();
    };
    window.addEventListener('keydown', p.onKey, true);
  }

  /* ── Survey ── */
  function buildSurvey(s) {
    if (surveyShown || surveyDone(s.id) || document.getElementById('sharkyAnnouncement')) return;
    surveyShown = true;
    var multi = !!s.multi, opts = '';
    for (var i = 0; i < s.options.length; i++) {
      opts += '<button type="button" class="sa-opt' + (multi ? ' multi' : '') + '" data-i="' + i + '">' + esc(s.options[i]) + '</button>';
    }
    var p = popup(
      '<button class="sa-close" type="button" aria-label="Close survey">&times;</button>' +
      '<span class="sa-tag sv">Quick survey</span>' +
      '<h2>' + esc(s.question) + '</h2>' +
      (multi ? '<p style="font-size:.95rem;color:#9a9aab;margin-top:-6px">Pick as many as you like.</p>' : '') +
      '<div class="sa-opts">' + opts + '</div>' +
      '<button type="button" class="sa-go sa-send" disabled>Send answer</button>' +
      '<p class="sa-hint">' + (isTV() ? 'Arrows to move, OK to pick. Back to skip.' : 'Anonymous - takes two seconds.') + '</p>',
      function () { markSurvey(s.id); });
    var wrap = p.wrap, picked = [];
    var optEls = [].slice.call(wrap.querySelectorAll('.sa-opt'));
    var send = wrap.querySelector('.sa-send');
    var order = [wrap.querySelector('.sa-close')].concat(optEls, [send]);

    function toggle(el) {
      var i = +el.getAttribute('data-i');
      var at = picked.indexOf(i);
      if (multi) {
        if (at >= 0) picked.splice(at, 1); else picked.push(i);
      } else {
        picked = at >= 0 ? [] : [i];
      }
      for (var j = 0; j < optEls.length; j++) {
        optEls[j].className = 'sa-opt' + (multi ? ' multi' : '') + (picked.indexOf(j) >= 0 ? ' on' : '');
      }
      send.disabled = !picked.length;
    }
    function submit() {
      if (!picked.length || send.getAttribute('data-sent')) return;
      send.setAttribute('data-sent', '1');
      send.disabled = true;
      send.textContent = 'Sending...';
      try {
        var x = new XMLHttpRequest();
        x.open('POST', BASE + '/survey', true);
        x.setRequestHeader('Content-Type', 'text/plain');
        x.timeout = 12000;
        x.send(JSON.stringify({ id: s.id, choices: picked, who: who() }));
      } catch (e) {}
      markSurvey(s.id);
      var card = wrap.querySelector('.sa-card');
      card.innerHTML = '<button class="sa-close" type="button" aria-label="Close">&times;</button>' +
        '<span class="sa-tag sv">Quick survey</span><h2>Thanks! &#x1F988;</h2><p>Your answer helps make Sharky better.</p>';
      card.querySelector('.sa-close').addEventListener('click', function () { p.close(); });
      order = [card.querySelector('.sa-close')];
      try { order[0].focus(); } catch (e) {}
      setTimeout(function () { p.close(); }, 2200);
    }
    for (var k = 0; k < optEls.length; k++) {
      optEls[k].addEventListener('click', function () { toggle(this); });
    }
    send.addEventListener('click', submit);

    p.onKey = function (e) {
      var k = keyKind(e);
      if (!k) return;
      swallow(e);
      if (k === 'back') { p.close(); return; }
      var at = order.indexOf(document.activeElement);
      if (k === 'ok') {
        var el = document.activeElement;
        if (el && el.className.indexOf('sa-opt') >= 0) {
          toggle(el);
          if (!multi && picked.length) send.focus();     // one answer: straight to Send
        } else if (el === send) submit();
        else p.close();
        return;
      }
      var n = order.length, step = k === 'next' ? 1 : -1, i = at;
      for (var tries = 0; tries < n; tries++) {
        i = (i + step + n) % n;
        if (!order[i].disabled) { order[i].focus(); break; }
      }
    };
    window.addEventListener('keydown', p.onKey, true);
  }

  /* Wait until nothing else is on top: the SHARKY intro on the website, and
     the sign-in / "Who's watching?" screen on the TV app. */
  function whenClear(fn) {
    var t0 = new Date().getTime();
    (function check() {
      var b = document.body;
      var intro = b && document.getElementById('intro') && b.className.indexOf('intro-done') < 0 &&
                  new Date().getTime() - t0 < INTRO_MAX_MS;
      var acct = window.SharkyAccount && window.SharkyAccount.isOpen;
      var player = document.querySelector('#player.open');
      if (!b || intro || acct || player || document.getElementById('sharkyAnnouncement')) { setTimeout(check, 700); return; }
      fn();
    })();
  }

  function get(path, cb) {
    try {
      var x = new XMLHttpRequest();
      x.open('GET', BASE + path, true);
      x.timeout = 12000;
      x.onload = function () {
        if (x.status !== 200) return cb(null);
        var d = null;
        try { d = JSON.parse(x.responseText); } catch (e) {}
        cb(d);
      };
      x.onerror = x.ontimeout = function () { cb(null); };
      x.send();
    } catch (e) { cb(null); }
  }

  function survey() {
    if (surveyShown) return;
    get('/survey', function (s) {
      if (!s || !s.id || !s.question || !s.options || s.options.length < 2 || surveyDone(s.id)) return;
      whenClear(function () { if (!surveyDone(s.id)) setTimeout(function () { buildSurvey(s); }, 600); });
    });
  }

  function fetchIt() {
    if (busy) return;
    busy = true;
    get('/announcement', function (a) {
      busy = false;
      if (shown || !a || !a.id || !a.title || closedId() === a.id) { survey(); return; }
      whenClear(function () {
        if (closedId() !== a.id) setTimeout(function () { build(a, survey); }, 300);
        else survey();
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fetchIt);
  else fetchIt();
  /* Apps that stay open for hours (the TV) look again every 15 minutes, so a
     scheduled announcement or survey still appears without a restart. */
  setInterval(function () { if (!shown) fetchIt(); else survey(); }, 15 * 60 * 1000);
})();
