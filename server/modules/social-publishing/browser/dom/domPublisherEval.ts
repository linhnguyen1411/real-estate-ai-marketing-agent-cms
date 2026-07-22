/** Browser-side evaluate bodies (plain strings — no tsx __name injection). */

import { FIND_COMPOSER_EDITABLE } from './domComposerEval';

export const DOM_PUBLISHER_PROBE = `
function (label) {
  var find = (${FIND_COMPOSER_EDITABLE});
  function visible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  }
  function isNotif(d) {
    return /thông báo|notifications|chưa đọc|quảng cáo của tôi/i.test((d.textContent || '').toLowerCase());
  }
  function norm(s) { return s.trim().toLowerCase(); }
  var labelNorm = norm(label);
  var labels = [];
  var textLen = 0;
  var target = null;

  var composerEl = find();
  if (composerEl) textLen = Math.max(textLen, (composerEl.innerText || '').trim().length);

  var containers = [];
  var dialogs = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"]'));
  for (var di = 0; di < dialogs.length; di++) {
    if (!isNotif(dialogs[di])) containers.push(dialogs[di]);
  }
  if (containers.length === 0) containers.push(document.body);

  for (var ci = 0; ci < containers.length; ci++) {
    var c = containers[ci];
    var buttons = c.querySelectorAll('[role="button"], button, div[role="button"]');
    for (var bi = 0; bi < buttons.length; bi++) {
      var el = buttons[bi];
      var a = el.getAttribute('aria-label');
      var t = (el.textContent || '').trim();
      if (a) labels.push(a.trim());
      if (t && t.length < 40) labels.push(t);
      if (!target) {
        var al = norm(a || '');
        var tx = norm(t.replace(/\\s+/g, ' '));
        if (al === labelNorm || al.indexOf(labelNorm) >= 0 || tx === labelNorm || tx.indexOf(labelNorm) >= 0) {
          target = el;
        }
      }
    }
  }
  var uniq = [];
  for (var ui = 0; ui < labels.length; ui++) {
    if (uniq.indexOf(labels[ui]) < 0) uniq.push(labels[ui]);
  }
  return {
    found: Boolean(target),
    disabled: target && target.getAttribute('aria-disabled') === 'true',
    textLen: textLen,
    dialogCount: dialogs.filter(function(d) { return !isNotif(d); }).length,
    labels: uniq.filter(function (l) {
      return /tiếp|đăng|post|next|publish|chia sẻ|quay lại|share/i.test(l);
    }),
  };
}
`;

export const DOM_PUBLISHER_CLICK_ARIA = `
function (label) {
  function isNotif(d) {
    return /thông báo|notifications|chưa đọc|quảng cáo của tôi/i.test((d.textContent || '').toLowerCase());
  }
  var dialogs = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"]'));
  var containers = dialogs.filter(function (d) { return !isNotif(d); });
  if (containers.length === 0) containers.push(document.body);
  var ranked = containers.map(function (d) {
    return {
      d: d,
      hasLabel: Boolean(d.querySelector('[aria-label="' + label + '"]')),
      hasEdit: Boolean(d.querySelector('[contenteditable="true"]')),
    };
  }).filter(function (x) { return x.hasLabel; }).sort(function (a, b) {
    return Number(b.hasEdit) - Number(a.hasEdit);
  });
  var container = ranked[0] && ranked[0].d;
  var el = container && container.querySelector('[aria-label="' + label + '"]');
  if (!el || el.getAttribute('aria-disabled') === 'true') return false;
  el.scrollIntoView({ block: 'center', inline: 'center' });
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  el.click();
  return true;
}
`;

export const DOM_PUBLISHER_CLICK_DIALOG_BUTTON = `
function (labelPatterns) {
  function norm(s) { return s.trim().toLowerCase(); }
  function match(hay) {
    for (var i = 0; i < labelPatterns.length; i++) {
      var n = norm(labelPatterns[i] || '');
      var h = norm(hay);
      if (h === n || h.indexOf(n) >= 0) return true;
    }
    return false;
  }
  var dialogs = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"]'));
  function isNotif(d) {
    return /thông báo|notifications|chưa đọc|quảng cáo của tôi/i.test((d.textContent || '').toLowerCase());
  }
  var ranked = dialogs.filter(function (d) { return !isNotif(d); }).map(function (d) {
    return { d: d, hasEdit: Boolean(d.querySelector('[contenteditable="true"]')) };
  }).sort(function (a, b) { return Number(b.hasEdit) - Number(a.hasEdit); });
  for (var ri = 0; ri < ranked.length; ri++) {
    var d = ranked[ri].d;
    var buttons = d.querySelectorAll('[role="button"], button, div[role="button"]');
    for (var bi = 0; bi < buttons.length; bi++) {
      var el = buttons[bi];
      if (el.getAttribute('aria-disabled') === 'true') continue;
      var a = el.getAttribute('aria-label') || '';
      var t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!match(a) && !match(t)) continue;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      el.click();
      return true;
    }
  }
  return false;
}
`;

export const DOM_PUBLISHER_DIALOG_CLOSED = `
function () {
  var dialogs = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"]'));
  function isNotif(d) {
    return /thông báo|notifications|chưa đọc|quảng cáo của tôi/i.test((d.textContent || '').toLowerCase());
  }
  for (var i = 0; i < dialogs.length; i++) {
    var d = dialogs[i];
    if (isNotif(d)) continue;
    if (d.querySelector('[contenteditable="true"]')) return false;
    if (d.querySelector('[aria-label="Đăng"], [aria-label="Tiếp"], [aria-label="Post"]')) return false;
  }
  return true;
}
`;
