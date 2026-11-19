// 行程（days[].items）を扱う道具。items は立ち寄り（stop）と移動（move）が行程順に並んだもの。

import { toMin, fromMin, nowMin, todayStr } from './util.js';
import { dayCount, dayDate } from './format.js';

export function ensureDay(book, i) {
  book.days = book.days || [];
  while (book.days.length <= i) book.days.push({ items: [] });
  const d = book.days[i];
  d.items = d.items || [];
  return d;
}

export function dayItems(book, i) {
  const d = book.days && book.days[i];
  return d && d.items ? d.items : [];
}

// 立ち寄りだけを [{stop, idx}] で
export function stopsOf(items) {
  const out = [];
  items.forEach((it, idx) => { if (it.type === 'stop') out.push({ stop: it, idx }); });
  return out;
}

const newMove = () => ({ type: 'move', mode: '車' });

// 立ち寄りを ord 番目（0 はじまり、立ち寄りだけで数える）の前に入れる。ord が末尾なら最後に。
export function insertStopAt(items, ord, stop) {
  const stops = stopsOf(items);
  if (!stops.length) {
    // 移動だけがある日なら、その後ろに
    items.push(stop);
    return;
  }
  if (ord >= stops.length) {
    const last = items[items.length - 1];
    if (last.type === 'stop') items.push(newMove());
    items.push(stop);
    return;
  }
  const at = stops[ord].idx;
  items.splice(at, 0, stop, newMove());
}

// 開始時刻があればその位置に、なければ最後に
export function insertStopByTime(items, stop) {
  const stops = stopsOf(items);
  let ord = stops.length;
  const t = toMin(stop.start);
  if (t != null) {
    const i = stops.findIndex(s => { const m = toMin(s.stop.start); return m != null && m > t; });
    if (i >= 0) ord = i;
  }
  insertStopAt(items, ord, stop);
  return ord;
}

// 立ち寄りを消す（となりの移動も1つ一緒に）
export function removeStopAt(items, idx) {
  const next = items[idx + 1], prev = items[idx - 1];
  if (next && next.type === 'move' && items[idx + 2] && items[idx + 2].type === 'stop') {
    items.splice(idx, 2);
  } else if (prev && prev.type === 'move') {
    items.splice(idx - 1, 2);
  } else {
    items.splice(idx, 1);
  }
}

// 立ち寄りの並べ替え。移動は「すき間」に付いたまま動かさない。
export function moveStop(items, from, to) {
  const stops = stopsOf(items);
  const slots = stops.map(s => s.idx);
  const list = stops.map(s => s.stop);
  const [x] = list.splice(from, 1);
  list.splice(to, 0, x);
  slots.forEach((slot, i) => { items[slot] = list[i]; });
}

// ord 番目から後ろの立ち寄りの時刻を min 分ずらす。はみ出した数を返す
export function shiftFrom(items, ord, min) {
  let clipped = 0;
  stopsOf(items).slice(ord).forEach(({ stop }) => {
    for (const k of ['start', 'end']) {
      const m = toMin(stop[k]);
      if (m == null) continue;
      const n = m + min;
      if (n < 0 || n > 23 * 60 + 59) clipped++;
      stop[k] = fromMin(n);
    }
  });
  return clipped;
}

// 移動の所要時間（前の立ち寄りの終了 → 次の立ち寄りの開始）。出せなければ null
// 前の立ち寄りに終了がなければ、開始を終了とみなす（例：出発 07:30 → 次が 10:30 なら 3時間）
export function moveDuration(items, idx) {
  const prev = items[idx - 1], next = items[idx + 1];
  if (!prev || !next || prev.type !== 'stop' || next.type !== 'stop') return null;
  const a = toMin(prev.end || prev.start), b = toMin(next.start);
  if (a == null || b == null || b <= a) return null;
  return b - a;
}

/* ---------- 旅行中 ---------- */

export function isTraveling(book, today = todayStr()) {
  if (!book.startDate) return false;
  const end = book.endDate || book.startDate;
  return today >= book.startDate && today <= end;
}

export function todayIndex(book, today = todayStr()) {
  if (!isTraveling(book, today)) return -1;
  for (let i = 0; i < dayCount(book); i++) if (dayDate(book, i) === today) return i;
  return -1;
}

// 今の時刻にあたる立ち寄りの items 番号（開始〜終了。終了がなければ次の予定の開始まで）
export function nowStopIdx(items, now = nowMin()) {
  const stops = stopsOf(items);
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i].stop;
    const a = toMin(s.start);
    if (a == null || now < a) continue;
    let b = toMin(s.end);
    if (b == null) {
      const nx = stops.slice(i + 1).find(x => toMin(x.stop.start) != null);
      b = nx ? toMin(nx.stop.start) : 24 * 60;
    }
    if (now < b) return stops[i].idx;
  }
  return -1;
}
