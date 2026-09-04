/* player.js — Netflix-style fullscreen player for Sharky Movies.
 *
 * Playing is a mode, not a panel: choosing something blacks out the page and
 * hands the whole screen to the video, and Back returns you exactly where you
 * were. This also fixes the remote properly — a full-screen player is
 * unambiguously the thing being driven, so keys go to it and nothing else.
 *
 * It adopts the page's existing #sharkyFrame rather than making a second one,
 * so everything already written against that element keeps working.
 */
(function () {
  'use strict';

  var overlay = null, frame = null, spinner = null;
  var isOpen = false, opener = null;

  function build() {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.className = 'player-overlay';
    overlay.id = 'playerOverlay';

    spinner = document.createElement('div');
    spinner.className = 'po-loading';
    spinner.innerHTML = '<div class="po-spinner"></div><div class="po-loading-text">Loading stream</div>';

    var close = document.createElement('button');
    close.className = 'po-close';
    close.id = 'poClose';
    close.setAttribute('aria-label', 'Close player');
    close.innerHTML = '&#10005;';
    close.addEventListener('click', hide);

    overlay.appendChild(spinner);
    overlay.appendChild(close);
    document.body.appendChild(overlay);

    /* Adopt the page's iframe so existing code that sets sharkyFrame.src
       carries on working; only its container changes. */
    frame = document.getElementById('sharkyFrame');
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = 'sharkyFrame';
      frame.setAttribute('allowfullscreen', '');
      frame.setAttribute('allow', 'autoplay *; fullscreen *; picture-in-picture *; encrypted-media *');
    }
    frame.classList.add('po-frame');
    overlay.appendChild(frame);

    /* The inline player area is redundant now that playing is fullscreen. */
    var section = document.querySelector('.sharky-player-section');
    if (section) section.style.display = 'none';

    frame.addEventListener('load', function () {
      if (!isOpen) return;
      overlay.classList.add('loaded');
      /* On a remote the keys must end up inside the player, or nothing
         reaches the video at all. */
      if (window.SharkyTV && window.SharkyTV.active && window.SharkyTV.enterFrame) {
        window.SharkyTV.enterFrame(frame);
      } else {
        try { frame.focus(); } catch (e) {}
      }
    });
  }

  function show(src) {
    build();
    opener = document.activeElement && document.activeElement !== document.body
      ? document.activeElement
      : document.querySelector('.tv-focus');

    overlay.classList.remove('loaded');
    overlay.classList.add('open');
    document.body.classList.add('player-open');
    isOpen = true;

    if (src && frame.src !== src) frame.src = src;

    /* Real fullscreen where the browser allows it. On a television the page is
       already full-screen, so a refusal here costs nothing. */
    try {
      if (overlay.requestFullscreen) overlay.requestFullscreen().catch(function () {});
      else if (overlay.webkitRequestFullscreen) overlay.webkitRequestFullscreen();
    } catch (e) {}

    try { frame.focus(); } catch (e) {}
  }

  function hide() {
    if (!isOpen) return;
    isOpen = false;

    /* Blanking the source stops playback and, importantly, stops the server
       transcoding for a video nobody is watching any more. */
    try { frame.src = 'about:blank'; } catch (e) {}

    overlay.classList.remove('open', 'loaded');
    document.body.classList.remove('player-open');

    try {
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) {}

    if (window.SharkyTV && window.SharkyTV.exitFrame) window.SharkyTV.exitFrame();

    if (opener && document.contains(opener)) {
      if (window.SharkyTV && window.SharkyTV.active && window.SharkyTV.focus) window.SharkyTV.focus(opener);
      else { try { opener.focus(); } catch (e) {} }
    }
    opener = null;

    /* Announce the close after focus has been restored, so a page that wants
       the highlight somewhere specific (the episode you were watching, say)
       gets the last word instead of racing this. */
    try { document.dispatchEvent(new CustomEvent('sharky:player-closed')); } catch (e) {}
  }

  /* The player asks to be let out (remote Back, or its own close button). */
  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (d && d.type === 'sharky:back') hide();
  });

  /* A television's WebView will not reliably move keyboard focus into a
     cross-origin iframe, so on a Fire TV the remote sails straight past the
     player and it can't be controlled at all. Rather than fight the focus
     model, the page keeps receiving the keys and forwards each one to the
     player, which treats them as its own. When focus genuinely is inside the
     frame this handler never fires, so nothing is handled twice. */
  document.addEventListener('keydown', function (e) {
    if (!isOpen) return;
    var code = e.keyCode || e.which || 0;

    var sent = false;
    if (frame && frame.contentWindow) {
      try {
        frame.contentWindow.postMessage(
          { type: 'sharky:key', key: e.key, keyCode: code }, '*');
        sent = true;
      } catch (err) {}
    }

    /* If the player is unreachable, at least let people out of it. */
    if (!sent && (e.key === 'Escape' || e.key === 'Backspace' ||
                  code === 27 || code === 4 || code === 461)) {
      hide();
    }
    e.preventDefault();
  }, true);

  /* Claim the page as soon as we load, rather than waiting for the first
     play. The page still carries the old inline player area, and now that
     nothing auto-starts a stream its spinner would sit there saying "Loading
     Stream" for ever - looking exactly like a hung player. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }

  window.SharkyPlayer = {
    open: show,
    close: hide,
    get isOpen() { return isOpen; },
    get frame() { build(); return frame; }
  };
})();
