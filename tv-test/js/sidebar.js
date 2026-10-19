/* sidebar.js — the menu that slides out when you push Left at the edge.
 *
 * This is how a television menu is supposed to behave: it is not on screen
 * taking up room, it is one press away from wherever you already are. Push
 * Left from the leftmost thing on the page and it comes out; pick something,
 * push Right, or push Back, and it goes away again.
 *
 * It is the same list as the bar across the top, driving the same buttons, so
 * there is only one set of navigation to get wrong.
 */
(function (w) {
  'use strict';

  var el, open = false, handler = null, opener = null;

  var ITEMS = [
    { screen: 'search',   label: 'Search',   ico: '⌕' },
    { screen: 'home',     label: 'Home',     ico: '⌂' },
    { screen: 'movies',   label: 'Films',    ico: '▶' },
    { screen: 'tv',       label: 'Series',   ico: '▦' },
    { screen: 'mylist',   label: 'My List',  ico: '+' },
    { screen: 'settings', label: 'Settings', ico: '⚙' }
  ];

  function build() {
    if (el) return;
    el = document.createElement('nav');
    el.id = 'sidebar';
    el.className = 'sidebar off';

    var brand = document.createElement('div');
    brand.className = 'sb-brand';
    var img = document.createElement('img');
    img.className = 'sb-shark';
    img.src = 'img/logo-128.png';
    img.alt = '';
    brand.appendChild(img);
    var word = document.createElement('span');
    word.className = 'sb-word';
    word.textContent = 'SHARKY';
    brand.appendChild(word);
    el.appendChild(brand);

    ITEMS.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'f sb-item';
      b.setAttribute('data-key', 'sb-' + it.screen);
      b.setAttribute('data-screen', it.screen);

      var ico = document.createElement('span');
      ico.className = 'sb-ico';
      ico.textContent = it.ico;
      b.appendChild(ico);

      var label = document.createElement('span');
      label.className = 'sb-text';
      label.textContent = it.label;
      b.appendChild(label);

      b.addEventListener('click', function () {
        var to = b.getAttribute('data-screen');
        hide(true);
        Screens.go(to, null, true);
      });
      el.appendChild(b);
    });

    document.body.appendChild(el);

    /* The scrim lives outside the panel so it can cover the whole screen
       without the panel's own fade applying to it. */
    var scrim = document.createElement('div');
    scrim.className = 'sb-scrim';
    document.body.insertBefore(scrim, el);
  }

  function show() {
    build();
    if (open) return;
    open = true;
    opener = Nav.current;
    el.classList.remove('off');
    /* One frame later, so the transition actually runs. */
    requestAnimationFrame(function () { document.body.classList.add('sidebar-open'); });

    mark();

    handler = Nav.push(function (action) {
      if (action === 'back') { hide(); return true; }
      /* Right is the way out — the same gesture that opened it, reversed. */
      if (action === 'right') { hide(); return true; }
      if (action === 'left') return true;          // already as far left as it goes
      return false;                                 // up/down/ok behave normally
    });

    var here = el.querySelector('[data-key="sb-' + Screens.name + '"]');
    Nav.focus(here || el.querySelector('.sb-item'));
  }

  function hide(keepFocus) {
    if (!open) return;
    open = false;
    document.body.classList.remove('sidebar-open');
    Nav.pop(handler);
    handler = null;

    /* Wait for it to slide away before taking it out of the focus order,
       otherwise the highlight jumps while it is still on screen. */
    setTimeout(function () { if (!open) el.classList.add('off'); }, 260);

    if (!keepFocus && opener && document.contains(opener)) Nav.focus(opener);
    opener = null;
  }

  function mark() {
    [].forEach.call(el.querySelectorAll('.sb-item'), function (b) {
      b.classList.toggle('on', b.getAttribute('data-screen') === Screens.name);
    });
  }

  /* Pressing Left with nothing further left opens the menu — the whole point.
     Registered as the outermost handler so any screen's own Left wins first. */
  function edgeHandler(action) {
    if (open) return false;
    if (action === 'menu') { show(); return true; }
    if (action !== 'left') return false;
    if (Player.isOpen) return false;

    var cur = Nav.current;
    if (!cur) return false;
    /* The sidebar replaces nothing: it only appears when Left has nowhere
       else to go. */
    if (Nav.wouldMove('left')) return false;
    show();
    return true;
  }

  w.Sidebar = {
    show: show,
    hide: hide,
    get isOpen() { return open; },
    edgeHandler: edgeHandler,
    build: build
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})(window);
