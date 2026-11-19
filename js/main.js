// 起動と画面の切り替え
//   #/            本棚
//   #/memories    思い出の棚
//   #/book/<id>   栞
//   #s=<データ>   夫に送ったリンク（見るだけ）

import { h, icon } from './util.js';
import { watchKeyboard, closeSheet, toast, applyTheme } from './ui.js';
import { renderShelf, renderMemories } from './shelf.js';
import { openBook } from './book.js';
import { readShareHash } from './share.js';
import { normalize, ensureCover } from './format.js';
import * as store from './store.js';

const root = document.getElementById('app');
let current = null;
let pendingStart = null;

const nav = {
  shelf: () => setHash('#/'),
  memories: () => setHash('#/memories'),
  openBook: (id, startKey) => { pendingStart = startKey || null; setHash('#/book/' + encodeURIComponent(id)); },
};

function setHash(hsh) {
  if (location.hash === hsh) route();
  else location.hash = hsh;
}

async function route() {
  closeSheet(true);
  if (current && current.close) current.close();
  current = null;
  const hash = location.hash;
  document.documentElement.style.removeProperty('--hue');

  const shared = readShareHash(hash);
  if (shared) return showShared(shared);
  document.body.classList.remove('viewer');

  try {
    if (hash.startsWith('#/book/')) {
      const id = decodeURIComponent(hash.slice(7));
      const rec = await store.getBook(id);
      if (!rec) { toast('栞が見つかりませんでした'); return nav.shelf(); }
      const startKey = pendingStart; pendingStart = null;
      current = openBook(root, {
        rec, readOnly: false, startKey,
        onBack: () => (rec.shiori.done ? nav.memories() : nav.shelf()),
        onDeleted: () => nav.shelf(),
      });
      return;
    }
    if (hash === '#/memories') return await renderMemories(root, nav);
    await renderShelf(root, nav);
  } catch (err) {
    console.error(err);
    showError('データを読み出せませんでした', 'Safari のプライベートブラウズでは保存が使えません。ふつうのタブか、ホーム画面に追加したアプリで開いてください。');
  }
}

function showShared(shared) {
  document.body.classList.add('viewer');
  if (shared.error) {
    return showError('栞を開けませんでした', 'リンクが途中で切れているかもしれません。送った人に、もう一度送ってもらってください。');
  }
  const n = normalize(shared.value, { requireTitle: false });
  if (!n.book) return showError('栞を開けませんでした', 'リンクの中身が栞の形になっていません。');
  if (!n.book.title) n.book.title = '旅のしおり';
  ensureCover(n.book);
  document.title = n.book.title + '｜旅のしおり';
  // 見るだけ：どこにも保存しない
  current = openBook(root, { rec: { id: null, shiori: n.book }, readOnly: true });
}

function showError(title, msg) {
  root.replaceChildren(h('div', { class: 'screen center' },
    h('div', { class: 'pg' }, icon('alert', 'big'), h('h1', { class: 'p-h' }, title), h('p', { class: 'note' }, msg))));
}

window.addEventListener('hashchange', route);
applyTheme();
watchKeyboard();
route();

/* ---------- オフラインで開けるように（service worker） ---------- */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            toast('新しい版が届きました', { action: '更新する', onAction: () => location.reload() });
          }
        });
      });
    }).catch(err => console.warn('service worker', err));
  });
}
