/* keyboard.js — an on-screen keyboard, because a remote has no letters.
 *
 * Laid out as a grid so the D-pad reaches every key in the obvious way, with
 * the wide keys (space, delete, clear) on their own row underneath.
 */
(function (w) {
  'use strict';

  var ROWS = [
    'ABCDEFG'.split(''),
    'HIJKLMN'.split(''),
    'OPQRSTU'.split(''),
    'VWXYZ0 1'.replace(' ', '').split(''),
    '23456789'.split('')
  ];

  function build(container, onChange) {
    container.innerHTML = '';
    var grid = document.createElement('div');
    grid.className = 'kb-grid';

    ROWS.forEach(function (row) {
      row.forEach(function (ch) {
        grid.appendChild(keyEl(ch, ch, function () { onChange('add', ch); }));
      });
    });
    container.appendChild(grid);

    var wide = document.createElement('div');
    wide.className = 'kb-wide';
    wide.appendChild(keyEl('SPACE', ' ', function () { onChange('add', ' '); }, 'kb-space'));
    wide.appendChild(keyEl('DELETE', null, function () { onChange('del'); }, 'kb-del'));
    wide.appendChild(keyEl('CLEAR', null, function () { onChange('clear'); }, 'kb-clear'));
    container.appendChild(wide);
  }

  function keyEl(label, value, fn, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'f kb-key' + (cls ? ' ' + cls : '');
    b.textContent = label;
    if (value != null) b.setAttribute('data-key', 'kb-' + value);
    else b.setAttribute('data-key', 'kb-' + label);
    b.addEventListener('click', function (e) { e.preventDefault(); fn(); });
    return b;
  }

  w.Keyboard = { build: build };
})(window);
