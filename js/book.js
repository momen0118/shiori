// しおりを開いた画面：ページ・右端のインデックスタブ・ページめくり・しおりのメニュー

import { h, icon, reducedMotion, clear } from './util.js';
import { openMenu, confirmSheet, toast, shareLink, sheetIsOpen } from './ui.js';
import { tidy, dayCount, ensureCover } from './format.js';
import { todayIndex, isTraveling } from './itin.js';
import { renderCover, renderPacking, renderDay, renderSpots, renderMemo } from './pages.js';
import { editCover, editPattern } from './editors.js';
import { exportForClaude, openImport } from './io.js';
import { makeShareUrl } from './share.js';
import * as store from './store.js';

// opts: { rec, readOnly, onBack, onDeleted }
export function openBook(root, opts) {
  const { readOnly } = opts;
  const rec = opts.rec;
  const ui = {};             // ページをまたいで覚えておく小さな状態（絞り込みなど）
  let leaveHooks = [];
  let idx = 0;
  let curEl = null;
  let busy = false;          // めくりの最中
  let saving = Promise.resolve();

  const ctx = {
    get book() { return rec.shiori; },
    readOnly,
    ui,
    change,
    refresh: () => render({ keepScroll: true }),
    goTo: (key, o) => go(indexOf(key), o),
    onLeave: fn => leaveHooks.push(fn),
  };

  /* ---------- ページの並び ---------- */

  function pages() {
    const n = dayCount(rec.shiori);
    const list = [{ key: 'cover', tab: '表紙' }, { key: 'packing', tab: '持ち物' }];
    for (let i = 0; i < n; i++) list.push({ key: `day-${i}`, tab: `${i + 1}日目` });
    list.push({ key: 'spots', tab: '立ち寄り' }, { key: 'memo', tab: 'メモ' });
    return list;
  }
  const indexOf = key => Math.max(0, pages().findIndex(p => p.key === key));

  function build(key) {
    if (key === 'cover') return renderCover(ctx);
    if (key === 'packing') return renderPacking(ctx);
    if (key === 'spots') return renderSpots(ctx);
    if (key === 'memo') return renderMemo(ctx);
    return renderDay(ctx, +key.slice(4));
  }

  function makePage(i) {
    const p = pages()[i];
    const cover = p.key === 'cover';
    const c = rec.shiori.cover || {};
    return h('div', {
      class: 'page page-scroll' + (cover ? ` cover pat p-${c.pattern || 'gingham'}` : ''),
      dataset: { key: p.key },
    }, build(p.key));
  }

  /* ---------- 画面の骨組み ---------- */

  clear(root);
  const stage = h('div', { class: 'stage' });
  const tabs = h('nav', { class: 'tabs', 'aria-label': 'ページ' });
  const top = readOnly
    ? h('div', { class: 'band' }, icon('eye'), '送られたしおり（見るだけ）')
    : h('div', { class: 'topbar' },
      h('button', { type: 'button', class: 'tb-btn', onclick: () => back() }, icon('chev-l'), '本棚'),
      h('button', { type: 'button', class: 'tb-btn icon-only', 'aria-label': 'しおりのメニュー', onclick: () => menu() }, icon('more', 'fill')));
  const bookEl = h('div', { class: 'book' + (readOnly ? ' read-only' : '') }, top, stage, tabs);
  root.append(bookEl);

  function paintHue() {
    const c = (rec.shiori.cover || {}).color || 'seiji';
    // 小窓（しおりの外に出る）にも同じ色が効くよう、いちばん外側に付ける
    document.documentElement.style.setProperty('--hue', `var(--c-${c})`);
  }

  function renderTabs() {
    const ps = pages();
    tabs.replaceChildren(...ps.map((p, i) => h('button', {
      type: 'button', class: 'tab' + (i === idx ? ' on' : ''), 'aria-current': i === idx ? 'page' : null,
      onclick: () => go(i),
    }, tabLabel(p.tab))));
    const on = tabs.children[idx];
    if (on && on.scrollIntoView && tabs.scrollHeight > tabs.clientHeight) on.scrollIntoView({ block: 'nearest' });
  }

  // 「12日目」の数字を横向きにまとめる
  function tabLabel(t) {
    const m = /^(\d+)(.*)$/.exec(t);
    return m ? h('span', null, h('span', { class: 'tcy' }, m[1]), m[2]) : h('span', null, t);
  }

  function leave() { const hs = leaveHooks; leaveHooks = []; hs.forEach(f => { try { f(); } catch { /* */ } }); }

  function render({ keepScroll = false } = {}) {
    const n = pages().length;
    if (idx >= n) idx = n - 1;
    const st = keepScroll && curEl ? curEl.scrollTop : 0;
    leave();
    const el = makePage(idx);
    if (curEl) curEl.replaceWith(el); else stage.append(el);
    curEl = el;
    if (keepScroll) el.scrollTop = st;
    paintHue();
    renderTabs();
  }

  /* ---------- 直したら保存 ---------- */

  // fn でしおりを直して保存。msg はお知らせ（関数でもよい）。
  // o.render=false なら描き直さない（入力中の欄を保つため）。o.goTo でページ移動。
  function change(fn, msg, o = {}) {
    if (readOnly) return Promise.resolve();
    fn(rec.shiori);
    rec.shiori = tidy(rec.shiori);
    if (o.render !== false) {
      if (o.goTo) { idx = indexOf(o.goTo); render(); } else render({ keepScroll: true });
    }
    const m = typeof msg === 'function' ? msg() : msg;
    if (m) toast(m);
    saving = saving.then(() => store.putBook(rec)).catch(err => {
      console.error(err);
      toast('保存できませんでした。もう一度ためしてください');
    });
    return saving;
  }

  /* ---------- ページめくり ---------- */

  function go(i, o = {}) {
    if (busy) return;
    const n = pages().length;
    i = Math.max(0, Math.min(n - 1, i));
    if (i === idx) { if (o.focus != null) focusItem(o.focus); return; }
    const dir = i > idx ? 1 : -1;
    leave();
    const from = curEl;
    idx = i;
    const to = makePage(i);
    curEl = to;
    renderTabs();
    paintHue();
    flip(from, to, dir, 0).then(() => { if (o.focus != null) focusItem(o.focus); });
  }

  function focusItem(itemIdx) {
    const el = curEl.querySelector(`.card[data-item="${itemIdx}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  // from を to にめくる。dir=1 は先へ（今のページが左へめくれる）、-1 は前へ（前のページが戻ってくる）
  // p は指で途中までめくっていた割合（0〜1）
  function flip(from, to, dir, p) {
    busy = true;
    const finish = () => { from.remove(); to.classList.remove('under', 'over'); to.style.transform = ''; busy = false; };
    if (reducedMotion()) {
      stage.append(to);
      to.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
      return new Promise(r => setTimeout(() => { finish(); r(); }, 160));
    }
    const ms = Math.max(160, 440 * (1 - p));
    if (dir > 0) {
      to.classList.add('under'); from.classList.add('over');
      stage.insertBefore(to, from);
      const a = from.animate([{ transform: rot(-MAX * p) }, { transform: rot(-MAX) }], { duration: ms, easing: 'cubic-bezier(.35,.1,.55,1)', fill: 'forwards' });
      shade(1 - p, 0, ms);
      return a.finished.catch(() => {}).then(() => { from.classList.remove('over'); finish(); });
    }
    to.classList.add('over'); from.classList.add('under');
    stage.append(to);
    const a = to.animate([{ transform: rot(-MAX * (1 - p)) }, { transform: rot(0) }], { duration: ms, easing: 'cubic-bezier(.25,.6,.35,1)', fill: 'forwards' });
    shade(p, 1, ms);
    return a.finished.catch(() => {}).then(() => { from.classList.remove('under'); a.cancel(); finish(); });
  }

  const MAX = 110;
  const rot = deg => `perspective(1800px) rotateY(${deg}deg)`;
  // めくっている紙の下のページに落ちる影
  function shade(a, b, ms) {
    const s = h('div', { class: 'flip-shade' });
    stage.append(s);
    const an = s.animate([{ opacity: a * 0.4 }, { opacity: b * 0.4 }], { duration: ms, fill: 'forwards' });
    an.finished.catch(() => {}).then(() => s.remove());
  }

  /* ---------- 左右のスワイプ ---------- */

  let t0 = null;
  stage.addEventListener('touchstart', e => {
    if (busy || e.touches.length !== 1 || sheetIsOpen()) { t0 = null; return; }
    const tg = e.target;
    if (tg.closest('.grip, [data-noswipe]')) { t0 = null; return; }
    // 入力欄は、入力中（カーソルがある）ときだけスワイプでめくらない
    const fieldEl = tg.closest('input, textarea, select');
    if (fieldEl && fieldEl === document.activeElement) { t0 = null; return; }
    const t = e.touches[0];
    if (t.clientX < 18) { t0 = null; return; } // Safari の「戻る」スワイプとぶつけない
    t0 = { x: t.clientX, y: t.clientY, time: Date.now(), axis: null, dx: 0, peer: null, dir: 0 };
  }, { passive: true });

  stage.addEventListener('touchmove', e => {
    if (!t0) return;
    const t = e.touches[0];
    const dx = t.clientX - t0.x, dy = t.clientY - t0.y;
    if (!t0.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      t0.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      if (t0.axis === 'y') { t0 = null; return; }
    }
    e.preventDefault();
    t0.dx = dx;
    dragTo(dx);
  }, { passive: false });

  const endTouch = () => {
    if (!t0 || t0.axis !== 'x') { t0 = null; return; }
    const s = t0; t0 = null;
    const W = stage.clientWidth;
    const p = Math.min(1, Math.abs(s.dx) / (W * 0.75));
    const v = Math.abs(s.dx) / Math.max(1, Date.now() - s.time);
    const dir = s.dx < 0 ? 1 : -1;
    const target = idx + dir;
    const n = pages().length;
    const passed = (p > 0.22 || v > 0.5) && target >= 0 && target < n;
    if (passed && s.peer) {
      // めくりきる（指を離した所から続きを動かす）
      leave();
      const from = curEl;
      idx = target;
      curEl = s.peer;
      renderTabs(); paintHue();
      flipFromDrag(from, curEl, dir, p);
    } else if (passed && reducedMotion()) {
      curEl.style.transform = '';
      go(target);
    } else {
      snapBack(s);
    }
  };
  stage.addEventListener('touchend', endTouch);
  stage.addEventListener('touchcancel', endTouch);

  function dragTo(dx) {
    const W = stage.clientWidth;
    const p = Math.min(1, Math.abs(dx) / (W * 0.75));
    const dir = dx < 0 ? 1 : -1;
    const target = idx + dir;
    const n = pages().length;
    if (target < 0 || target >= n) {
      // 端では少しだけ動いて止まる
      curEl.style.transform = `translateX(${dx * 0.12}px)`;
      dropPeer();
      return;
    }
    if (reducedMotion()) return;
    if (!t0.peer || t0.dir !== dir) {
      dropPeer();
      curEl.style.transform = '';
      t0.peer = makePage(target);
      t0.dir = dir;
      if (dir > 0) { t0.peer.classList.add('under'); curEl.classList.add('over'); stage.insertBefore(t0.peer, curEl); }
      else { t0.peer.classList.add('over'); curEl.classList.add('under'); stage.append(t0.peer); }
    }
    if (dir > 0) curEl.style.transform = rot(-MAX * p);
    else t0.peer.style.transform = rot(-MAX * (1 - p));
  }

  function dropPeer() {
    if (t0 && t0.peer) { t0.peer.remove(); t0.peer = null; t0.dir = 0; }
    curEl.classList.remove('over', 'under');
  }

  function snapBack(s) {
    const el = curEl;
    if (!s.peer) {
      el.style.transition = 'transform .2s ease-out';
      el.style.transform = '';
      setTimeout(() => { el.style.transition = ''; }, 220);
      return;
    }
    busy = true;
    const W = stage.clientWidth;
    const p = Math.min(1, Math.abs(s.dx) / (W * 0.75));
    const peer = s.peer;
    const done = () => { peer.remove(); el.classList.remove('over', 'under'); el.style.transform = ''; busy = false; };
    if (s.dir > 0) {
      el.animate([{ transform: rot(-MAX * p) }, { transform: rot(0) }], { duration: 200, easing: 'ease-out' }).finished.catch(() => {}).then(done);
    } else {
      peer.animate([{ transform: rot(-MAX * (1 - p)) }, { transform: rot(-MAX) }], { duration: 200, easing: 'ease-out', fill: 'forwards' }).finished.catch(() => {}).then(done);
    }
  }

  function flipFromDrag(from, to, dir, p) {
    busy = true;
    const ms = Math.max(140, 380 * (1 - p));
    const finish = () => { from.remove(); to.classList.remove('under', 'over'); to.style.transform = ''; busy = false; };
    shade(dir > 0 ? 1 - p : p, dir > 0 ? 0 : 1, ms);
    if (dir > 0) {
      from.animate([{ transform: rot(-MAX * p) }, { transform: rot(-MAX) }], { duration: ms, easing: 'ease-out', fill: 'forwards' })
        .finished.catch(() => {}).then(finish);
    } else {
      const a = to.animate([{ transform: rot(-MAX * (1 - p)) }, { transform: rot(0) }], { duration: ms, easing: 'ease-out', fill: 'forwards' });
      a.finished.catch(() => {}).then(() => { a.cancel(); finish(); });
    }
  }

  /* ---------- メニュー ---------- */

  function back() {
    leave();
    opts.onBack && opts.onBack();
  }

  function menu() {
    const b = rec.shiori;
    let url = '';
    try { url = makeShareUrl(b); } catch { url = ''; }
    openMenu(b.title, [
      { label: '表紙を直す', sub: 'タイトル・日付・行き先・ひとこと', icon: 'pen', onSelect: () => editCover(ctx) },
      { label: '柄と色を変える', icon: 'palette', onSelect: () => editPattern(ctx) },
      { label: 'Claude 用に書き出す', sub: 'しおりの JSON をコピー', icon: 'copy', onSelect: () => exportForClaude(rec.shiori) },
      { label: 'Claude から読み込む', sub: '置き換え・いけたらいくだけ足す', icon: 'import', onSelect: () => importInto() },
      rec.prev ? { label: '置き換える前に戻す', icon: 'undo', onSelect: () => undoReplace() } : null,
      url ? {
        label: '送る', sub: `LINE などで送るリンク（${url.length.toLocaleString()}文字）`, icon: 'share',
        onSelect: () => shareLink({ title: b.title, text: `${b.title}のしおり`, url }),
      } : null,
      b.done
        ? { label: '本棚に戻す', icon: 'shelf', onSelect: () => change(x => { delete x.done; }, '本棚に戻しました') }
        : { label: '思い出の棚にしまう', icon: 'shelf', onSelect: () => change(x => { x.done = true; }, '思い出の棚にしまいました') },
      { label: 'しおりを消す', icon: 'trash', danger: true, onSelect: () => remove() },
    ]);
  }

  function importInto() {
    openImport({
      mode: 'book',
      onApply: (kind, data) => {
        if (kind === 'wish') {
          const have = new Set((rec.shiori.wishlist || []).map(w => w.name));
          const add = data.filter(w => !have.has(w.name));
          const dup = data.length - add.length;
          change(b => { b.wishlist = [...(b.wishlist || []), ...add]; },
            `いけたらいくを${add.length}件足しました` + (dup ? `（同じ名前の${dup}件は飛ばしました）` : ''));
          return;
        }
        // 置き換え：今の状態を控えてから
        const cur = rec.shiori;
        const next = data;
        // 柄と色が入っていなければ、今の表紙のままにする
        next.cover = { ...(next.cover || {}) };
        if (!next.cover.pattern && cur.cover) next.cover.pattern = cur.cover.pattern;
        if (!next.cover.color && cur.cover) next.cover.color = cur.cover.color;
        ensureCover(next);
        if (cur.done) next.done = true; else delete next.done;
        rec.prev = cur;
        rec.shiori = next;
        const key = pages()[idx] ? pages()[idx].key : 'cover';
        change(() => {}, '置き換えました。メニューの「置き換える前に戻す」で戻せます', { goTo: pages().some(p => p.key === key) ? key : 'cover' });
      },
    });
  }

  function undoReplace() {
    if (!rec.prev) return;
    const cur = rec.shiori;
    rec.shiori = rec.prev;
    rec.prev = cur; // 入れ替えておけば、もう一度押すと戻る
    change(() => {}, '置き換える前に戻しました（もう一度選ぶと、置き換えたあとに戻ります）');
  }

  async function remove() {
    const ok = await confirmSheet({
      title: `「${rec.shiori.title}」を消しますか`,
      message: 'このしおりを iPhone から消します。元に戻せません。心配なら、先に本棚のメニューからバックアップしておいてください。',
      ok: '消す', danger: true,
    });
    if (!ok) return;
    await saving;
    await store.deleteBook(rec.id);
    toast('しおりを消しました');
    opts.onDeleted && opts.onDeleted();
  }

  /* ---------- 開いたとき ---------- */

  const ti = todayIndex(rec.shiori);
  idx = opts.startKey ? indexOf(opts.startKey) : ti >= 0 ? indexOf(`day-${ti}`) : 0;
  render();

  // 旅行中は「いまここ」を1分ごとに見直す
  const timer = setInterval(() => {
    if (!document.body.contains(bookEl)) { clearInterval(timer); return; }
    if (busy || t0 || sheetIsOpen() || document.hidden) return;
    if (!isTraveling(rec.shiori)) return;
    const k = pages()[idx].key;
    if (k.startsWith('day-')) render({ keepScroll: true });
  }, 60000);

  return { close: () => { clearInterval(timer); leave(); } };
}
