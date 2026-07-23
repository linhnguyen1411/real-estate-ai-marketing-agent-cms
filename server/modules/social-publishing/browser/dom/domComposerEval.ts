/** Browser-side composer helpers (plain strings — no tsx __name injection). */

export const DISMISS_STRAY_DIALOGS = `
function () {
  function clickIf(sel) {
    var el = document.querySelector(sel);
    if (el) {
      el.click();
      return true;
    }
    return false;
  }
  function norm(s) {
    return String(s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  }
  function isNotificationDialog(d) {
    var text = (d.textContent || '').toLowerCase();
    return /thông báo|notifications|chưa đọc|unread|quảng cáo của tôi/i.test(text);
  }
  function hasComposerDialog() {
    var dialogs = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"]'));
    for (var i = 0; i < dialogs.length; i++) {
      if (isNotificationDialog(dialogs[i])) continue;
      if (dialogs[i].querySelector('[contenteditable="true"]')) return true;
    }
    return false;
  }

  if (hasComposerDialog()) return;

  for (var ei = 0; ei < 5; ei++) {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }),
    );
  }
  clickIf('[aria-label="Thoát chế độ gõ trước"]');
  clickIf('[aria-label="Quay lại trang trước"]');

  var dialogs = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"]'));
  var notifOpen = false;
  for (var di = 0; di < dialogs.length; di++) {
    if (isNotificationDialog(dialogs[di])) {
      notifOpen = true;
      break;
    }
  }
  if (notifOpen) {
    var bells = document.querySelectorAll('[aria-label*="Thông báo"], [aria-label*="Notifications"]');
    for (var bi = 0; bi < bells.length; bi++) {
      var bell = bells[bi];
      if (!bell.closest('[role="dialog"]')) {
        bell.click();
        break;
      }
    }
    clickIf('[aria-label="Quay lại trang trước"]');
    for (var ej = 0; ej < 3; ej++) {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }),
      );
    }
  }

  dialogs = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"]'));
  for (var dj = 0; dj < dialogs.length; dj++) {
    var d = dialogs[dj];
    if (d.querySelector('[contenteditable="true"]')) continue;
    if (isNotificationDialog(d)) {
      var back = d.querySelector(
        '[aria-label*="Quay lại"], [aria-label*="Đóng"], [aria-label*="Close"]',
      );
      if (back) back.click();
      continue;
    }
    var closeBtn = d.querySelector(
      '[aria-label="Close"], [aria-label="Đóng"], [aria-label="Hủy"], [aria-label="Cancel"]',
    );
    if (closeBtn) closeBtn.click();
  }

  var main = document.querySelector('[role="main"]') || document.body;
  if (main && main !== document.body) {
    main.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  }
}
`;

export const FIND_DIALOG_COMPOSER = `
function () {
  function visible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  }
  function isNotificationDialog(d) {
    var text = (d.textContent || '').toLowerCase();
    return /thông báo|notifications|chưa đọc|unread|quảng cáo của tôi/i.test(text);
  }
  function pickEditable(root) {
    return (
      root.querySelector('[contenteditable="true"][role="textbox"]') ||
      root.querySelector('[contenteditable="true"]')
    );
  }
  var dialogs = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"]'));
  for (var i = dialogs.length - 1; i >= 0; i--) {
    var d = dialogs[i];
    if (isNotificationDialog(d)) continue;
    var ed = pickEditable(d);
    if (ed && visible(ed)) {
      ed.focus();
      return true;
    }
  }
  return false;
}
`;

export const OPEN_COMPOSER_BY_TRIGGERS = `
function (patterns) {
  function norm(s) {
    return String(s || '')
      .replace(/\\s+/g, ' ')
      .trim()
      .toLowerCase();
  }
  function clickEl(el) {
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    el.click();
  }
  function matchText(hay) {
    var h = norm(hay);
    if (!h) return false;
    for (var i = 0; i < patterns.length; i++) {
      var p = norm(patterns[i]);
      if (p && (h === p || h.indexOf(p) >= 0)) return true;
    }
    return false;
  }

  var dialogs = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"]'));
  function isNotif(d) {
    return /thông báo|notifications|chưa đọc|quảng cáo của tôi/i.test((d.textContent || '').toLowerCase());
  }
  for (var di = dialogs.length - 1; di >= 0; di--) {
    if (isNotif(dialogs[di])) continue;
    var ed =
      dialogs[di].querySelector('[contenteditable="true"][role="textbox"]') ||
      dialogs[di].querySelector('[contenteditable="true"]');
    if (ed) {
      ed.focus();
      return { ok: true, via: 'existing_dialog' };
    }
  }

  var nodes = document.querySelectorAll(
    '[role="button"], button, div[role="button"], span[role="button"]',
  );
  for (var ni = 0; ni < nodes.length; ni++) {
    var n = nodes[ni];
    var label = n.getAttribute('aria-label') || '';
    var text = n.textContent || '';
    if (!matchText(label) && !matchText(text)) continue;
    clickEl(n);
    return { ok: true, via: 'trigger', label: label || text.slice(0, 60) };
  }
  return { ok: false };
}
`;

export const FIND_COMPOSER_EDITABLE = `
function () {
  function visible(el) {
    var r = el.getBoundingClientRect();
    return r.width > 8 && r.height > 8;
  }
  function isNotificationDialog(d) {
    var text = (d.textContent || '').toLowerCase();
    return /thông báo|notifications|chưa đọc|unread|quảng cáo của tôi/i.test(text);
  }
  function pickEditable(root) {
    return (
      root.querySelector('[contenteditable="true"][role="textbox"]') ||
      root.querySelector('[contenteditable="true"]')
    );
  }
  function textOf(el) {
    return ((el && (el.innerText || el.textContent)) || '').trim();
  }

  // Prefer the focused composer (keyboard.type lands here).
  var ae = document.activeElement;
  if (
    ae &&
    ae.isContentEditable &&
    visible(ae) &&
    (!ae.closest('[role="dialog"]') || !isNotificationDialog(ae.closest('[role="dialog"]')))
  ) {
    return ae;
  }

  var dialogs = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"]'));
  var best = null;
  var bestLen = -1;
  for (var i = dialogs.length - 1; i >= 0; i--) {
    var d = dialogs[i];
    if (isNotificationDialog(d)) continue;
    var nodes = Array.prototype.slice.call(
      d.querySelectorAll('[contenteditable="true"][role="textbox"], [contenteditable="true"]'),
    );
    for (var ni = 0; ni < nodes.length; ni++) {
      var ed = nodes[ni];
      if (!visible(ed)) continue;
      var len = textOf(ed).length;
      // Prefer non-empty editors (post-type read-back); else first visible.
      if (len > bestLen) {
        best = ed;
        bestLen = len;
      }
    }
    if (best && bestLen > 0) return best;
    var fallback = pickEditable(d);
    if (fallback && visible(fallback)) return fallback;
  }

  if (best) return best;

  var pageEd = pickEditable(document.body);
  if (pageEd && visible(pageEd)) {
    var inDialog = pageEd.closest('[role="dialog"]');
    if (!inDialog || !isNotificationDialog(inDialog)) return pageEd;
  }
  return null;
}
`;

export const READ_DIALOG_COMPOSER_TEXT = `
function () {
  var find = (${FIND_COMPOSER_EDITABLE});
  var ed = find();
  if (!ed) return '';
  // Lexical / FB: innerText can lag; fall back to textContent.
  return (ed.innerText || ed.textContent || '').trim();
}
`;

export const CLEAR_DIALOG_COMPOSER = `
function () {
  var find = (${FIND_COMPOSER_EDITABLE});
  var el = find();
  if (!el) return false;
  el.focus();
  document.execCommand('selectAll');
  document.execCommand('delete');
  if ((el.innerText || '').trim().length > 0) {
    el.innerHTML = '';
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContent' }));
  }
  return true;
}
`;

export const INSERT_DIALOG_COMPOSER_LINES = `
function (lineList) {
  var find = (${FIND_COMPOSER_EDITABLE});
  var el = find();
  if (!el) return false;
  el.focus();
  for (var j = 0; j < lineList.length; j++) {
    var line = lineList[j] || '';
    if (line.length > 0) document.execCommand('insertText', false, line);
    if (j < lineList.length - 1) {
      if (!document.execCommand('insertLineBreak') && !document.execCommand('insertParagraph')) {
        document.execCommand('insertText', false, '\\n');
      }
    }
  }
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  return true;
}
`;
