/* compat.js — the few gaps an older television WebView still has.
 *
 * The rest of the app is written in plain ES5 on purpose. These two are the
 * only modern things it leans on that a Fire OS WebView from a few years ago
 * might not have, and both are cheap to fill in. If the browser is older than
 * even that, the app says so rather than showing a blank screen.
 */
(function (w) {
  'use strict';

  var E = w.Element && w.Element.prototype;
  if (E) {
    if (!E.matches) {
      E.matches = E.msMatchesSelector || E.webkitMatchesSelector ||
        function (sel) {
          var all = (this.document || this.ownerDocument).querySelectorAll(sel);
          for (var i = 0; i < all.length; i++) if (all[i] === this) return true;
          return false;
        };
    }
    if (!E.closest) {
      E.closest = function (sel) {
        var node = this;
        while (node && node.nodeType === 1) {
          if (node.matches(sel)) return node;
          node = node.parentElement || node.parentNode;
        }
        return null;
      };
    }
  }

  /* CustomEvent as a constructor, which old WebViews expose only as
     document.createEvent. */
  if (typeof w.CustomEvent !== 'function') {
    var CE = function (event, params) {
      params = params || { bubbles: false, cancelable: false, detail: null };
      var e = document.createEvent('CustomEvent');
      e.initCustomEvent(event, !!params.bubbles, !!params.cancelable, params.detail);
      return e;
    };
    CE.prototype = w.Event.prototype;
    w.CustomEvent = CE;
  }

  /* Nothing sensible to do without these, so say so plainly rather than
     leaving a black screen and no explanation. */
  if (!w.Promise || !w.fetch) {
    w.addEventListener('load', function () {
      document.body.innerHTML =
        '<div style="padding:8vh 6vw;font:2vw/1.6 sans-serif;color:#fff;background:#05070c">' +
        '<b>This device\'s browser is too old for Sharky.</b><br><br>' +
        'It is missing ' + (!w.Promise ? 'Promise' : 'fetch') + '. ' +
        'Updating Android System WebView (or the Silk browser) normally fixes it.' +
        '</div>';
    });
  }
})(window);
