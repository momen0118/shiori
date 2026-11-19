// 画面の部品：下から出る小窓、メニュー、確認、お知らせ、コピー、共有、つまみでの並べ替え

import { h, icon, clear } from './util.js';

/* ---------- 下から出る小窓 ---------- */

let current = null;
const layer = () => document.getElementById('sheet-layer');

// openSheet({ title, sub, body: Node|Node[], actions: Node[], onClose, className })
export function openSheet({ title, sub, body, actions, onClose, className = '', head }) {
  closeSheet(true);
  const L = layer();
  const dim = h('div', { class: 'dim', onclick: () => closeSheet() });
  const sheet = h('div', { class: 'sheet ' + className, role: 'dialog', 'aria-modal': 'true', 'aria-label': title || '' },
    h('div', { class: 'grab', 'aria-hidden': 'true' }),
    head || (title ? h('div', { class: 'sheet-head' },
      h('div', { class: 'sheet-title' }, title),
      sub ? h('div', { class: 'sheet-sub' }, sub) : null) : null),
    h('div', { class: 'sheet-body' }, body),
    actions && actions.length ? h('div', { class: 'sheet-actions' }, actions) : null,
  );
  L.append(dim, sheet);
  L.hidden = false;
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => { dim.classList.add('in'); sheet.classList.add('in'); });
  enableSwipeDown(sheet);
  current = { sheet, dim, onClose };
  return { el: sheet, close: closeSheet };
}

export function closeSheet(immediate = false) {
  if (!current) return;
  const { sheet, dim, onClose } = current;
  current = null;
  if (document.activeElement && sheet.contains(document.activeElement)) document.activeElement.blur();
  const done = () => {
    sheet.remove(); dim.remove();
    if (!current) { layer().hidden = true; document.body.classList.remove('sheet-open'); }
  };
  if (immediate) done();
  else {
    sheet.classList.remove('in'); dim.classList.remove('in');
    setTimeout(done, 220);
  }
  if (onClose) onClose();
}

export const sheetIsOpen = () => !!current;

// 上の取っ手を下に引くと閉じる
function enableSwipeDown(sheet) {
  const grab = sheet.querySelector('.grab');
  const head = sheet.querySelector('.sheet-head');
  let y0 = null, dy = 0;
  const start = e => { y0 = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; };
  const move = e => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
  };
  const end = () => {
    if (y0 == null) return;
    sheet.style.transition = ''; sheet.style.transform = '';
    if (dy > 80) closeSheet();
    y0 = null;
  };
  for (const el of [grab, head]) if (el) {
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }
}

// iPhone のキーボードが出たときに小窓が隠れないように
export function watchKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  const upd = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', kb + 'px');
    document.documentElement.style.setProperty('--vvh', vv.height + 'px');
  };
  vv.addEventListener('resize', upd);
  vv.addEventListener('scroll', upd);
  upd();
}

/* ---------- メニュー ---------- */

// items: [{ label, icon, onSelect, danger, sub }]（null は飛ばす）
export function openMenu(title, items) {
  const list = h('div', { class: 'menu' },
    items.filter(Boolean).map(it => h('button', {
      class: 'menu-item' + (it.danger ? ' danger' : ''),
      type: 'button',
      onclick: () => { if (!it.keepOpen) closeSheet(true); it.onSelect(); },
    }, it.icon ? icon(it.icon) : h('span', { class: 'ico-sp' }),
    h('span', { class: 'menu-label' }, it.label, it.sub ? h('small', null, it.sub) : null))));
  openSheet({ title, body: list, className: 'menu-sheet' });
}

/* ---------- 確認 ---------- */

export function confirmSheet({ title, message, ok = 'はい', cancel = 'やめる', danger = false }) {
  return new Promise(resolve => {
    let answered = false;
    const answer = v => { if (answered) return; answered = true; closeSheet(); resolve(v); };
    openSheet({
      title,
      body: message ? h('p', { class: 'sheet-text' }, message) : null,
      actions: [
        h('button', { class: 'btn', type: 'button', onclick: () => answer(false) }, cancel),
        h('button', { class: 'btn ' + (danger ? 'danger' : 'pri'), type: 'button', onclick: () => answer(true) }, ok),
      ],
      onClose: () => { if (!answered) { answered = true; resolve(false); } },
    });
  });
}

/* ---------- お知らせ ---------- */

let toastTimer = null;
export function toast(msg, { action, onAction, ms = 2400 } = {}) {
  const el = document.getElementById('toast');
  clear(el);
  el.append(h('span', null, msg));
  if (action) el.append(h('button', { type: 'button', class: 'toast-btn', onclick: () => { el.classList.remove('in'); onAction(); } }, action));
  el.classList.add('in');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('in'), action ? Math.max(ms, 6000) : ms);
}

/* ---------- コピー ---------- */

// ボタンを押した処理の中で（await より前に）呼ぶこと。
// うまくいかなければ、手で選んでコピーできる小窓を出す。
export function copyText(text, { done = 'コピーしました', title = 'コピー' } = {}) {
  let p = null;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) p = navigator.clipboard.writeText(text);
  } catch { p = null; }
  if (!p) {
    if (legacyCopy(text)) { toast(done); return Promise.resolve(true); }
    manualCopy(text, title);
    return Promise.resolve(false);
  }
  return p.then(() => { toast(done); return true; }, () => {
    if (legacyCopy(text)) { toast(done); return true; }
    manualCopy(text, title); return false;
  });
}

function legacyCopy(text) {
  try {
    const ta = h('textarea', { readonly: true, style: { position: 'fixed', top: '0', left: '0', opacity: '0', fontSize: '16px' } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand && document.execCommand('copy');
    ta.remove();
    return !!ok;
  } catch { return false; }
}

export function manualCopy(text, title = 'コピー') {
  const ta = h('textarea', { class: 'field mono copy-area', readonly: true, rows: 8 });
  ta.value = text;
  openSheet({
    title,
    body: [
      h('p', { class: 'sheet-text' }, '自動でコピーできませんでした。下の枠を長押しして「すべてを選択」→「コピー」してください。'),
      ta,
    ],
    actions: [h('button', { class: 'btn', type: 'button', onclick: () => closeSheet() }, '閉じる')],
  });
  setTimeout(() => { ta.focus(); ta.select(); }, 250);
}

/* ---------- 共有 ---------- */

// iPhone の共有シートを開く。使えなければリンクをコピーする。
export function shareLink({ title, text, url }) {
  if (navigator.share) {
    try {
      return navigator.share({ title, text, url }).then(() => true, err => {
        if (err && err.name === 'AbortError') return false; // 自分で閉じた
        return copyText(url, { done: 'リンクをコピーしました', title: 'リンクをコピー' });
      });
    } catch { /* 下へ */ }
  }
  return copyText(url, { done: 'リンクをコピーしました', title: 'リンクをコピー' });
}

// ファイルとして保存（共有シートの「"ファイル"に保存」か、ダウンロード）
export function saveFile(name, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  try {
    const file = new File([blob], name, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      return navigator.share({ files: [file] }).then(() => true, err => {
        if (err && err.name === 'AbortError') return false;
        return download(blob, name);
      });
    }
  } catch { /* 下へ */ }
  return Promise.resolve(download(blob, name));
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}

// ファイルを選んで文字として読む
export function pickTextFile() {
  return new Promise(resolve => {
    const inp = h('input', { type: 'file', accept: '.json,.txt,application/json,text/plain', style: { display: 'none' } });
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return resolve(null);
      f.text().then(resolve, () => resolve(null));
    });
    document.body.appendChild(inp);
    inp.click();
  });
}

/* ---------- つまみでの並べ替え ---------- */

// container の中の itemSel を、handleSel（つまみ）を掴んだときだけ並べ替える。
// onMove(from, to) … from 番目を to 番目に動かす（0 はじまり）
export function makeSortable(container, { itemSel, handleSel = '.grip', onMove, scroller }) {
  container.addEventListener('pointerdown', e => {
    const handle = e.target.closest(handleSel);
    if (!handle || !container.contains(handle)) return;
    const item = handle.closest(itemSel);
    if (!item) return;
    e.preventDefault();
    e.stopPropagation();
    const items = [...container.querySelectorAll(itemSel)];
    const from = items.indexOf(item);
    const sc = scroller || container.closest('.page-scroll') || document.scrollingElement;
    const ghostTop = item.getBoundingClientRect().top;
    const y0 = e.clientY;
    let lastY = e.clientY;
    let to = from;
    let scrollBase = sc.scrollTop;
    item.classList.add('dragging');
    const line = h('div', { class: 'drop-line' });
    container.appendChild(line);
    handle.setPointerCapture && handle.setPointerCapture(e.pointerId);

    const place = () => {
      const dy = lastY - y0 + (sc.scrollTop - scrollBase);
      item.style.transform = `translateY(${dy}px)`;
      // 指の位置から入る場所を決める
      const rects = items.map(el => el.getBoundingClientRect());
      let idx = items.length;
      for (let i = 0; i < items.length; i++) {
        if (i === from) continue;
        const r = rects[i];
        if (lastY < r.top + r.height / 2) { idx = i; break; }
      }
      // idx は「この前に入れる」番号。from より後ろなら1つ詰める
      to = idx > from ? idx - 1 : idx;
      const cr = container.getBoundingClientRect();
      let y;
      if (idx >= items.length) y = rects[items.length - 1].bottom;
      else y = rects[idx].top;
      if (idx === items.length && from === items.length - 1) y = rects[items.length - 2] ? rects[items.length - 2].bottom : y;
      line.style.top = (y - cr.top - 1) + 'px';
      line.style.opacity = to === from ? '0' : '1';
    };

    let raf = null;
    const autoScroll = () => {
      const r = sc.getBoundingClientRect ? sc.getBoundingClientRect() : { top: 0, bottom: innerHeight };
      const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight);
      let v = 0;
      if (lastY < top + 60) v = -Math.ceil((top + 60 - lastY) / 6);
      else if (lastY > bottom - 60) v = Math.ceil((lastY - bottom + 60) / 6);
      if (v) { sc.scrollTop += v; place(); }
      raf = requestAnimationFrame(autoScroll);
    };
    raf = requestAnimationFrame(autoScroll);
    void ghostTop;

    const move = ev => { lastY = ev.clientY; place(); };
    const up = () => {
      cancelAnimationFrame(raf);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      item.classList.remove('dragging');
      item.style.transform = '';
      line.remove();
      if (to !== from) onMove(from, to);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
    place();
  });
}

export function grip() {
  return h('span', { class: 'grip', 'aria-label': '掴んで並べ替え', role: 'button' }, icon('grip', 'fill'));
}
