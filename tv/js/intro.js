/* intro.js — the cold open.
 *
 * The wordmark from the website, with a sting under it. Netflix earns its
 * ident by playing it on every launch and so does this, but three things keep
 * it from being an annoyance:
 *
 *   Any key skips it, immediately.
 *   It never blocks loading — the rows are being fetched underneath the whole
 *   time it plays, so the theatre is free.
 *   In a browser tab it plays once per session rather than on every navigation,
 *   because a website is not a television.
 *
 * The sound is our own two-hit sting, not anybody else's ident.
 */
(function (w) {
  'use strict';

  var el, audio, done = false, finishTimer = null;
  var DURATION = 2700;     // matches the animation, sting included

  function inApp() {
    return !!(w.SharkyHost && w.SharkyHost.platform);
  }

  function shouldPlay() {
    /* On a television it is the app starting, every time. In a browser it
       would be in the way, so it plays once per visit. */
    if (inApp()) return true;
    try {
      if (sessionStorage.getItem('sharky_intro_seen') === '1') return false;
      sessionStorage.setItem('sharky_intro_seen', '1');
    } catch (e) {}
    return true;
  }

  function start() {
    el = document.getElementById('intro');
    if (!el) return;

    if (!shouldPlay()) { remove(true); return; }

    document.body.classList.add('intro-playing');
    el.classList.add('is-playing');

    playSting();

    finishTimer = setTimeout(finish, DURATION);

    /* Never trap anyone behind it. */
    document.addEventListener('keydown', finish, true);
    el.addEventListener('click', finish);
  }

  /* Autoplay: the Android shell turns off the gesture requirement, so this
     just works there. A browser may refuse, which is fine — the animation
     carries it on its own and a refusal must never hold up the app. */
  function playSting() {
    audio = document.getElementById('identAudio');
    if (!audio) return;
    try {
      audio.volume = 0.85;
      audio.currentTime = 0;
      var p = audio.play();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  function finish() {
    if (done) return;
    done = true;
    clearTimeout(finishTimer);
    document.removeEventListener('keydown', finish, true);

    /* Duck the sting out with the picture rather than cutting it dead. */
    if (audio && !audio.paused) {
      var steps = 12, i = 0;
      var fade = setInterval(function () {
        i++;
        try { audio.volume = Math.max(0, 0.85 * (1 - i / steps)); } catch (e) {}
        if (i >= steps) { clearInterval(fade); try { audio.pause(); } catch (e) {} }
      }, 40);
    }

    el.classList.add('is-out');
    document.body.classList.remove('intro-playing');
    setTimeout(function () { remove(false); }, 700);
  }

  function remove(immediate) {
    done = true;
    if (el && el.parentNode) el.parentNode.removeChild(el);
    document.body.classList.add('intro-done');
    var splash = document.getElementById('splash');
    if (splash) splash.classList.remove('off');
    document.dispatchEvent(new CustomEvent('intro:done', { detail: { skipped: !!immediate } }));
  }

  w.Intro = {
    start: start,
    skip: finish,
    get finished() { return done; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(window);
