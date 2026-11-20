// しおりの中のページ：表紙・持ち物・n日目・行き先・メモ
// それぞれ ctx を受け取って、ページの中身（DOM）を返す。

import { h, icon, linkify, extLink, chromeLink, fmtMD, fmtRangeLong, fmtDuration, addDays, debounce } from './util.js';
import { copyText, makeSortable, grip } from './ui.js';
import { textInput, autosize, btn, labelEl } from './forms.js';
import { dayCount, dayDate } from './format.js';
import { ensureDay, dayItems, stopsOf, moveStop, moveDuration, nowStopIdx, todayIndex } from './itin.js';
import {
  editStop, editMove, shiftSheet, reservationSheet, editCover,
  editPacking, bulkAddPacking, editWish, wishToItinerary,
} from './editors.js';

const MODE_ICON = { 車: 'car', 徒歩: 'walk', 電車: 'train', バス: 'bus', 飛行機: 'plane', 船: 'ship' };
const stop = e => e.stopPropagation();

/* ---------- 表紙 ---------- */

export function renderCover(ctx) {
  const b = ctx.book;
  const c = b.cover || {};
  const sub = [c.destination, c.note].filter(Boolean).join(' ／ ');
  const plate = h(ctx.readOnly ? 'div' : 'button', {
    class: 'cover-plate', type: ctx.readOnly ? null : 'button',
    onclick: ctx.readOnly ? null : () => editCover(ctx),
    'aria-label': ctx.readOnly ? null : '表紙を編集',
  },
  h('b', null, b.title || '（タイトルなし）'),
  b.startDate ? h('div', { class: 'd' }, fmtRangeLong(b.startDate, b.endDate)) : null,
  sub ? h('div', { class: 's' }, sub) : null);
  return h('div', { class: 'cover-inner' },
    plate,
    h('div', { class: 'flip-hint' }, 'スワイプでめくる'));
}

/* ---------- 持ち物 ---------- */

export function renderPacking(ctx) {
  const b = ctx.book;
  const list = b.packing || [];
  const count = h('span', { class: 'p-sub' }, `${list.length}個`);
  const rows = h('div', { class: 'plist' });

  const row = (name, i) => h(ctx.readOnly ? 'div' : 'div', {
    class: 'irow' + (ctx.readOnly ? '' : ' tap'),
    onclick: ctx.readOnly ? null : e => { if (!e.target.closest('.grip')) editPacking(ctx, i); },
  }, ctx.readOnly ? null : grip(), h('span', { class: 'irow-t' }, name));

  list.forEach((n, i) => rows.append(row(n, i)));

  if (!ctx.readOnly) {
    makeSortable(rows, {
      itemSel: '.irow',
      onMove: (f, t) => ctx.change(bk => { const [x] = bk.packing.splice(f, 1); bk.packing.splice(t, 0, x); }),
    });
  }

  const copyBtn = btn('リマインダー用にコピー', () => {
    const items = ctx.book.packing || [];
    if (!items.length) return;
    copyText(items.join('\n'), { done: 'コピーしました。リマインダーのリストに貼ると1行1項目になります', title: 'リマインダー用にコピー' });
  }, 'pri', 'copy');
  if (!list.length) copyBtn.disabled = true;

  let addRow = null;
  if (!ctx.readOnly) {
    const inp = textInput({ placeholder: '持ち物を追加', enterkeyhint: 'enter' });
    inp.classList.add('add-input');
    const add = () => {
      const v = inp.value.trim();
      if (!v) return;
      inp.value = '';
      const i = (ctx.book.packing || []).length;
      ctx.change(bk => { bk.packing = [...(bk.packing || []), v]; }, null, { render: false }).then(() => {
        rows.append(row(v, i));
        count.textContent = `${i + 1}個`;
        copyBtn.disabled = false;
      });
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } });
    inp.addEventListener('blur', add);
    addRow = h('div', { class: 'addbox', onclick: e => { if (e.target !== inp) inp.focus(); } }, icon('plus'), inp);
  }

  return h('div', { class: 'pg' },
    h('div', { class: 'p-head' }, h('h2', { class: 'p-h' }, '持ち物'), count),
    h('div', { class: 'btn-row' },
      copyBtn,
      ctx.readOnly ? null : btn('まとめて追加', () => bulkAddPacking(ctx), '', 'plus')),
    rows,
    addRow,
    list.length || !ctx.readOnly ? null : h('p', { class: 'empty' }, '持ち物はまだありません'),
    h('p', { class: 'note foot' }, 'チェックは iPhone のリマインダーで。コピーしてリストに貼ると、1行ずつ別の項目になります。'));
}

/* ---------- n日目 ---------- */

export function renderDay(ctx, di) {
  const b = ctx.book;
  const items = dayItems(b, di);
  const date = dayDate(b, di);
  const isToday = todayIndex(b) === di;
  const nowIdx = isToday ? nowStopIdx(items) : -1;
  const n = dayCount(b);
  const ro = ctx.readOnly;

  const tl = h('div', { class: 'tl' });
  const stops = stopsOf(items);
  const ordOf = idx => stops.findIndex(s => s.idx === idx);
  let shiftPlaced = false;

  items.forEach((it, idx) => {
    if (it.type === 'stop') {
      // 立ち寄りが続くときは、間に空の移動の線
      const prev = items[idx - 1];
      if (prev && prev.type === 'stop') tl.append(h('div'), gapLine(ctx, di, idx, nowIdx === idx - 1 ? ordOf(idx) : -1));
      tl.append(timeCell(it), stopCard(ctx, di, idx, it, idx === nowIdx));
    } else {
      const prev = items[idx - 1];
      const next = items[idx + 1];
      let shiftOrd = -1;
      if (!shiftPlaced && prev && nowIdx === idx - 1 && next && next.type === 'stop') { shiftOrd = ordOf(idx + 1); shiftPlaced = true; }
      tl.append(h('div'), moveLine(ctx, di, idx, it, moveDuration(items, idx), shiftOrd));
    }
  });

  if (!ro && stops.length > 1) {
    makeSortable(tl, {
      itemSel: '.card',
      onMove: (f, t) => ctx.change(bk => moveStop(ensureDay(bk, di).items, f, t)),
    });
  }

  const foot = [];
  if (!ro) {
    foot.push(h('button', { type: 'button', class: 'addbox', onclick: () => editStop(ctx, di, null) }, icon('plus'), '予定を追加'));
    if (di === n - 1) {
      const acts = [btn(`${n + 1}日目を追加`, () => ctx.change(bk => {
        // 日付があれば最終日を1日延ばす（日数は日付から決まる）
        if (bk.startDate) bk.endDate = addDays(bk.startDate, n);
        else ensureDay(bk, n);
      }, `${n + 1}日目を追加しました`), 'quiet small', 'plus')];
      if (n > 1 && !items.length) {
        acts.push(btn('この日を消す', () => ctx.change(bk => {
          if (bk.startDate) bk.endDate = addDays(bk.startDate, n - 2);
          if (bk.days && bk.days.length >= n) bk.days.splice(n - 1, 1);
        }, `${n}日目を消しました`, { goTo: `day-${n - 2}` }), 'quiet small', 'trash'));
      }
      foot.push(h('div', { class: 'btn-row end' }, acts));
    }
  }

  return h('div', { class: 'pg' },
    h('div', { class: 'p-head' },
      h('h2', { class: 'p-h' }, `${di + 1}日目`),
      date ? h('span', { class: 'p-sub' }, fmtMD(date)) : null,
      isToday ? h('span', { class: 'today-tag' }, '今日') : null),
    items.length ? tl : h('p', { class: 'empty' }, ro ? '予定はまだありません' : '予定はまだありません。名前だけでも入れられます。'),
    foot);
}

function timeCell(s) {
  if (!s.start && !s.end) return h('div', { class: 'tl-t none' }, '–');
  return h('div', { class: 'tl-t' }, s.start || '–', s.end ? h('small', null, s.end) : null);
}

function stopCard(ctx, di, idx, s, now) {
  const btns = [];
  if (s.reservation) btns.push(h('button', { type: 'button', class: 'mbtn', onclick: e => { stop(e); reservationSheet(ctx, di, idx); } }, icon('ticket'), '予約'));
  if (s.siteUrl) {
    // 自分のしおりでは Chrome で開く。送ったしおりは相手に Chrome があるとは限らないので、ふつうのリンク
    const a = ctx.readOnly ? extLink(s.siteUrl, icon('globe'), 'サイト') : chromeLink(s.siteUrl, icon('globe'), 'サイト');
    a.className = 'mbtn'; a.addEventListener('click', stop); btns.push(a);
  }
  if (s.mapUrl) { const a = extLink(s.mapUrl, icon('pin'), '地図'); a.className = 'mbtn'; a.addEventListener('click', stop); btns.push(a); }
  const one = btns.length === 1;
  return h('div', {
    class: 'card' + (now ? ' now' : '') + (ctx.readOnly ? '' : ' tap'),
    dataset: { item: String(idx) },
    onclick: ctx.readOnly ? null : e => { if (!e.target.closest('.grip, a, button')) editStop(ctx, di, idx); },
  },
  now ? h('div', { class: 'now-tag' }, 'いまここ') : null,
  h('div', { class: 'c-top' },
    ctx.readOnly ? null : grip(),
    h('div', { class: 'c-nm' }, s.label ? labelEl(s.label) : null, s.name),
    one ? btns[0] : null),
  s.memo ? h('div', { class: 'c-memo pre' }, linkify(s.memo)) : null,
  btns.length > 1 ? h('div', { class: 'c-btns' }, btns) : null);
}

function moveLine(ctx, di, idx, m, dur, shiftOrd) {
  const mode = m.mode || '車';
  const text = [mode + (dur ? ' ' + fmtDuration(dur) : ''), m.memo].filter(Boolean).join('・');
  return h('div', {
    class: 'move' + (ctx.readOnly ? '' : ' tap'),
    onclick: ctx.readOnly ? null : e => { if (!e.target.closest('button')) editMove(ctx, di, idx); },
  },
  h('span', { class: 'mv-t' }, icon(MODE_ICON[mode] || 'arrow'), ' ', text),
  shiftOrd >= 0 && !ctx.readOnly ? shiftBtn(ctx, di, shiftOrd) : null);
}

function gapLine(ctx, di, idx, shiftOrd) {
  if (ctx.readOnly) return h('div', { class: 'move gap' });
  return h('div', { class: 'move gap' },
    h('button', { type: 'button', class: 'gap-add', onclick: () => editMove(ctx, di, null, idx) }, '＋ 移動'),
    shiftOrd >= 0 ? shiftBtn(ctx, di, shiftOrd) : null);
}

function shiftBtn(ctx, di, ord) {
  return h('div', null, h('button', { type: 'button', class: 'mbtn quiet', onclick: e => { stop(e); shiftSheet(ctx, di, ord); } }, icon('clock'), 'ここから後ろをずらす'));
}

/* ---------- 行き先 ---------- */

export function renderSpots(ctx) {
  const b = ctx.book;
  const ui = ctx.ui;
  const filter = ui.spotFilter || 'all';
  const rows = [];
  const n = dayCount(b);
  for (let di = 0; di < n; di++) {
    dayItems(b, di).forEach((it, idx) => {
      if (it.type !== 'stop') return;
      if (filter === 'rsv' && !it.reservation) return;
      rows.push(h('button', { type: 'button', class: 'srow', onclick: () => ctx.goTo(`day-${di}`, { focus: idx }) },
        h('span', { class: 'when' }, `${di + 1}日目`, it.start ? h('br') : null, it.start || null),
        h('span', { class: 's-nm' }, it.label ? labelEl(it.label) : null, it.name),
        it.reservation ? h('span', { class: 'rv' }, '予約') : null,
        it.siteUrl ? icon('globe') : null,
        it.mapUrl ? icon('pin') : null));
    });
  }

  const chip = (k, label, ico) => h('button', {
    type: 'button', class: 'fc', 'aria-pressed': String(filter === k),
    onclick: () => { ui.spotFilter = k; ctx.refresh(); },
  }, ico ? icon(ico) : null, label);

  return h('div', { class: 'pg' },
    h('div', { class: 'p-head' }, h('h2', { class: 'p-h' }, '行き先')),
    h('div', { class: 'fchips' }, chip('all', 'すべて'), chip('rsv', '予約あり', 'ticket')),
    rows.length ? h('div', { class: 'slist' }, rows)
      : h('p', { class: 'empty' }, filter === 'rsv' ? '予約の付いた立ち寄りはありません' : '行程に立ち寄りを入れると、ここに並びます'),
    renderWishlist(ctx));
}

function renderWishlist(ctx) {
  const ui = ctx.ui;
  const list = ctx.book.wishlist || [];
  const box = h('div', { class: 'wlist' });

  const row = (w, i) => {
    const open = ui.wishOpen === i;
    const marks = [w.siteUrl ? icon('globe') : null, w.mapUrl ? icon('pin') : null];
    const head = h('button', {
      type: 'button', class: 'srow wrow',
      onclick: () => { ui.wishOpen = open ? null : i; ctx.refresh(); },
      'aria-expanded': String(open),
    }, h('span', { class: 's-nm' }, w.name), marks);
    if (!open) return head;
    const links = [];
    if (w.siteUrl) { const a = extLink(w.siteUrl, icon('globe'), 'サイト'); a.className = 'mbtn'; links.push(a); }
    if (w.mapUrl) { const a = extLink(w.mapUrl, icon('pin'), '地図'); a.className = 'mbtn'; links.push(a); }
    return h('div', { class: 'wish-open' }, head,
      h('div', { class: 'c-btns' },
        ctx.readOnly ? null : h('button', { type: 'button', class: 'mbtn pri', onclick: () => wishToItinerary(ctx, i) }, icon('plus'), '行程に入れる'),
        links,
        // サイトも地図も空なら「URLを追加」、どちらかあれば「編集」
        ctx.readOnly ? null : (w.siteUrl || w.mapUrl
          ? h('button', { type: 'button', class: 'mbtn quiet', onclick: () => editWish(ctx, i) }, icon('pen'), '編集')
          : h('button', { type: 'button', class: 'mbtn quiet', onclick: () => editWish(ctx, i, 'site') }, icon('plus'), 'URLを追加'))));
  };
  list.forEach((w, i) => box.append(row(w, i)));

  const add = ctx.readOnly ? null
    : h('button', { type: 'button', class: 'addbox', onclick: () => editWish(ctx, null) }, icon('plus'), 'お店や場所を追加');

  if (ctx.readOnly && !list.length) return null;
  return h('section', { class: 'wish' },
    h('div', { class: 'm-sec' }, 'いけたらいく'),
    box,
    add);
}

/* ---------- メモ ---------- */

export function renderMemo(ctx) {
  const memo = ctx.book.memo || '';
  const head = h('div', { class: 'p-head' }, h('h2', { class: 'p-h' }, 'メモ'));

  if (ctx.readOnly) {
    return h('div', { class: 'pg' }, head,
      memo ? h('div', { class: 'memo-view pre' }, linkify(memo)) : h('p', { class: 'empty' }, 'メモはありません'));
  }

  // その場で書ける。書いたそばから保存する
  const ta = h('textarea', { class: 'field memo-edit', placeholder: 'しおり全体のメモ。自由に書けます', rows: 8 });
  ta.value = memo;
  autosize(ta);
  // 書いた中の URL と電話番号は、下にボタンで出してタップで開けるようにする
  const links = h('div', { class: 'memo-links' });
  const drawLinks = v => {
    const found = [...linkify(v).querySelectorAll('a')];
    links.replaceChildren(...found.map(a => {
      a.className = 'mbtn';
      a.prepend(icon(a.classList.contains('tel') || a.href.startsWith('tel:') ? 'phone' : 'globe'));
      return a;
    }));
  };
  drawLinks(memo);
  const save = debounce(v => {
    ctx.change(bk => { bk.memo = v; }, null, { render: false });
    drawLinks(v);
  }, 500);
  ta.addEventListener('input', () => save(ta.value));
  ta.addEventListener('blur', () => save.flush(ta.value));
  ctx.onLeave(() => save.flush(ta.value));
  return h('div', { class: 'pg' }, head, ta, links);
}
