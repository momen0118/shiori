// 本棚（ホーム）と思い出の棚、新しいしおり

import { h, icon, clear, fmtRangeShort, todayStr, uid } from './util.js';
import { openSheet, closeSheet, openMenu, getTheme, setTheme } from './ui.js';
import { field, textInput, btn, errorBox } from './forms.js';
import { ensureCover, tidy, FORMAT, VERSION } from './format.js';
import { isTraveling, todayIndex } from './itin.js';
import { openImport, openBackup, openRestore } from './io.js';
import * as store from './store.js';

// nav: { openBook(id, startKey), memories(), shelf() }
export async function renderShelf(root, nav) {
  const recs = await store.listBooks();
  clear(root);
  const today = todayStr();
  const live = recs.filter(r => !r.shiori.done);
  const done = recs.filter(r => r.shiori.done);
  const traveling = live.filter(r => isTraveling(r.shiori, today))
    .sort((a, b) => a.shiori.startDate.localeCompare(b.shiori.startDate));
  const planned = live.filter(r => !isTraveling(r.shiori, today)).sort(byPlan(today));

  const head = h('div', { class: 'shelf-head' },
    h('h1', { class: 'p-h big' }, '本棚'),
    h('div', { class: 'shelf-acts' },
      btn('新しいしおり', () => newBook(recs, nav), '', 'plus'),
      h('button', { type: 'button', class: 'tb-btn icon-only', 'aria-label': '本棚のメニュー', onclick: () => shelfMenu(nav) }, icon('more', 'fill'))));

  const body = [head];

  if (traveling.length) {
    body.push(h('div', { class: 'm-sec' }, '旅行中'));
    for (const r of traveling) {
      const ti = todayIndex(r.shiori, today);
      body.push(h('div', { class: `cv big pat p-${pat(r)}`, style: hue(r) },
        h('button', { type: 'button', class: 'daisen', onclick: () => nav.openBook(r.id) },
          h('b', null, r.shiori.title), h('small', null, fmtRangeShort(r.shiori.startDate, r.shiori.endDate))),
        h('button', { type: 'button', class: 'btn pri wide', onclick: () => nav.openBook(r.id, ti >= 0 ? `day-${ti}` : null) }, '今日の行程へ', icon('chev'))));
    }
  }

  if (planned.length) {
    body.push(h('div', { class: 'm-sec' }, '計画中'));
    body.push(h('div', { class: 'grid2' }, planned.map(r => tile(r, nav))));
  }

  if (!recs.length) {
    body.push(h('div', { class: 'welcome' },
      h('p', null, 'まだしおりがありません。'),
      h('p', { class: 'note' }, '「新しいしおり」からタイトルだけで作れます。Claude と相談した JSON があれば、右上のメニューの「Claude から読み込む」から入れられます。')));
  } else if (!live.length) {
    body.push(h('p', { class: 'empty' }, '本棚は空です。しまったしおりは思い出の棚にあります。'));
  }

  body.push(h('button', { type: 'button', class: 'shelf-link', onclick: () => nav.memories() },
    h('span', null, '思い出の棚'), h('span', { class: 'muted' }, `${done.length}冊`, icon('chev'))));

  root.append(h('div', { class: 'screen shelf page-scroll' }, h('div', { class: 'pg' }, body)));
}

export async function renderMemories(root, nav) {
  const recs = (await store.listBooks()).filter(r => r.shiori.done)
    .sort((a, b) => (b.shiori.startDate || '').localeCompare(a.shiori.startDate || '') || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  clear(root);
  root.append(h('div', { class: 'screen shelf page-scroll' },
    h('div', { class: 'topbar static' },
      h('button', { type: 'button', class: 'tb-btn', onclick: () => nav.shelf() }, icon('chev-l'), '本棚')),
    h('div', { class: 'pg' },
      h('div', { class: 'shelf-head' }, h('h1', { class: 'p-h big' }, '思い出の棚'), h('span', { class: 'p-sub' }, `${recs.length}冊`)),
      recs.length ? h('div', { class: 'grid2' }, recs.map(r => tile(r, nav)))
        : h('p', { class: 'empty' }, 'しおりのメニューの「思い出の棚にしまう」で、ここに並びます。'))));
}

function tile(r, nav) {
  return h('button', { type: 'button', class: `cv tile pat p-${pat(r)}`, style: hue(r), onclick: () => nav.openBook(r.id) },
    h('span', { class: 'daisen' },
      h('b', null, r.shiori.title),
      h('small', null, r.shiori.startDate ? fmtRangeShort(r.shiori.startDate, r.shiori.endDate) : '日付未定')));
}

const pat = r => (r.shiori.cover && r.shiori.cover.pattern) || 'gingham';
const hue = r => ({ '--hue': `var(--c-${(r.shiori.cover && r.shiori.cover.color) || 'seiji'})` });

// 計画中の並び：これからの旅は近い順 → 過ぎた旅は新しい順 → 日付のないしおり
function byPlan(today) {
  const rank = r => (!r.shiori.startDate ? 2 : r.shiori.startDate >= today ? 0 : 1);
  return (a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return a.shiori.startDate.localeCompare(b.shiori.startDate);
    if (ra === 1) return b.shiori.startDate.localeCompare(a.shiori.startDate);
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  };
}

function shelfMenu(nav) {
  openMenu('本棚', [
    {
      label: 'Claude から読み込む', sub: '新しいしおりとして', icon: 'import',
      onSelect: () => openImport({
        mode: 'new',
        onApply: async (_, book) => {
          const rec = { id: uid(), shiori: tidy(ensureCover(book)), prev: null };
          await store.putBook(rec);
          store.askPersist();
          nav.openBook(rec.id);
        },
      }),
    },
    { label: '全部まとめてバックアップ', sub: 'ファイルに保存・コピー', icon: 'file', onSelect: () => openBackup() },
    { label: 'バックアップから戻す', icon: 'undo', onSelect: () => openRestore(() => nav.shelf()) },
    { label: '画面の色', sub: THEMES.find(t => t[0] === getTheme())[1], icon: 'moon', onSelect: () => themeSheet() },
  ]);
}

const THEMES = [['auto', '自動（iPhone の設定に合わせる）'], ['dark', 'ダーク'], ['light', 'ライト']];

function themeSheet() {
  const box = h('div', { class: 'chips col' });
  const draw = () => box.replaceChildren(...THEMES.map(([k, l]) => h('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(getTheme() === k),
    onclick: () => { setTheme(k); draw(); },
  }, l)));
  draw();
  openSheet({
    title: '画面の色',
    body: [box, h('p', { class: 'note' }, 'この iPhone での見え方だけが変わります。送ったしおりを見る人の画面は、その人の設定のままです。')],
    actions: [btn('できた', () => closeSheet(), 'pri')],
  });
}

/* ---------- 新しいしおり ---------- */

function newBook(recs, nav) {
  const title = textInput({ placeholder: '例：〇〇温泉 1泊2日', enterkeyhint: 'done' });
  const err = h('div');
  // 持ち物のコピー元：持ち物のあるしおり。初期値は直近の旅（開始日が新しい順、なければ更新が新しい順）
  const sources = recs.filter(r => r.shiori.packing && r.shiori.packing.length)
    .sort((a, b) => (b.shiori.startDate || '').localeCompare(a.shiori.startDate || '') || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  let src = sources[0] || null;
  let picked = new Set(src ? src.shiori.packing.map((_, i) => i) : []);
  const packBox = h('div', { class: 'pack-copy' });

  function drawPack() {
    if (!sources.length) { packBox.replaceChildren(); return; }
    const opts = [...sources.map(r => [r, `${r.shiori.title}（${r.shiori.packing.length}個）`]), [null, 'コピーしない']];
    const list = src ? h('div', { class: 'pick-list' }, src.shiori.packing.map((p, i) => h('button', {
      type: 'button', class: 'pick', 'aria-pressed': String(picked.has(i)),
      onclick: e => {
        if (picked.has(i)) picked.delete(i); else picked.add(i);
        e.currentTarget.setAttribute('aria-pressed', String(picked.has(i)));
        cnt.textContent = `${picked.size}個を取り込みます`;
      },
    }, icon('check'), h('span', null, p)))) : null;
    const cnt = h('div', { class: 'note' }, src ? `${picked.size}個を取り込みます（いらない物はタップで外す）` : '');
    packBox.replaceChildren(
      h('div', { class: 'sec-l' }, '持ち物を前のしおりからコピー'),
      h('div', { class: 'chips col' }, opts.map(([r, l]) => h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(r === src),
        onclick: () => { src = r; picked = new Set(r ? r.shiori.packing.map((_, i) => i) : []); drawPack(); },
      }, l))),
      ...[cnt, list].filter(Boolean));
  }
  drawPack();

  const create = async () => {
    const t = title.value.trim();
    if (!t) { err.replaceChildren(errorBox(['タイトルを入れてください'])); title.focus(); return; }
    const book = { format: FORMAT, version: VERSION, title: t };
    if (src) {
      const p = src.shiori.packing.filter((_, i) => picked.has(i));
      if (p.length) book.packing = p;
    }
    const rec = { id: uid(), shiori: tidy(ensureCover(book)), prev: null };
    closeSheet();
    await store.putBook(rec);
    store.askPersist();
    nav.openBook(rec.id);
  };
  title.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); title.blur(); } });

  openSheet({
    title: '新しいしおり',
    body: [
      field('タイトル', title, '日付や表紙はあとから変えられます'),
      packBox,
      err,
    ],
    actions: [btn('やめる', () => closeSheet()), btn('作る', create, 'pri')],
  });
  setTimeout(() => title.focus(), 260);
}
