// しおりの中身を直す小窓たち
// ctx … book.js が渡す { book, readOnly, change(fn, msg), goTo(key, opts) }

import { h, icon, linkify, extLink, fmtMD, isUrl, normTime, toMin, isDate, diffDays, fmtDuration } from './util.js';
import { openSheet, closeSheet, confirmSheet, copyText, toast } from './ui.js';
import { field, textInput, textArea, clearable, chips, btn, errorBox, labelEl } from './forms.js';
import { LABELS, MODES, STAY, PATTERNS, COLORS, dayCount, dayDate } from './format.js';
import { ensureDay, dayItems, stopsOf, insertStopByTime, removeStopAt, shiftFrom, todayIndex } from './itin.js';

const val = el => (el.input ? el.input.value : el.value).trim();

function dayName(book, i) {
  const d = dayDate(book, i);
  return `${i + 1}日目` + (d ? ` ${fmtMD(d)}` : '');
}

/* ---------- 立ち寄り ---------- */

export function editStop(ctx, di, idx = null, preset = {}) {
  const items = dayItems(ctx.book, di);
  const isNew = idx == null;
  const src = isNew ? { type: 'stop', ...preset } : items[idx];
  const r = { ...(src.reservation || {}) };
  let hasRsv = !!src.reservation;
  let label = src.label || '';

  const name = textInput({ value: src.name || '', placeholder: '施設名・場所名', enterkeyhint: 'done' });
  const labelChips = chips({ options: LABELS, value: label, free: true, colored: true, onChange: v => { label = v; drawRsv(); } });
  const start = clearable('time', src.start || '');
  const end = clearable('time', src.end || '');
  const memo = textArea({ value: src.memo || '', placeholder: 'メモ（URL や電話番号も書けます）', rows: 2 });
  const site = textInput({ value: src.siteUrl || '', placeholder: 'お店などのサイト', type: 'url', inputmode: 'url' });
  const map = textInput({ value: src.mapUrl || '', placeholder: 'Googleマップの共有リンク', type: 'url', inputmode: 'url' });
  const err = h('div');

  // 予約
  const rsvBox = h('div', { class: 'rsv-box' });
  const rIn = {};
  function readRsv() {
    for (const [k, el] of Object.entries(rIn)) r[k] = val(el);
  }
  function drawRsv() {
    readRsv();
    for (const k in rIn) delete rIn[k];
    rsvBox.replaceChildren();
    if (!hasRsv) {
      rsvBox.append(btn('予約情報の入力', () => { hasRsv = true; drawRsv(); }, 'quiet', 'ticket'));
      return;
    }
    rIn.number = textInput({ value: r.number || '', placeholder: 'AB12345', autocomplete: 'off' });
    rIn.holder = textInput({ value: r.holder || '', placeholder: '誰の名前で予約したか' });
    const rows = [
      h('div', { class: 'sec-l' }, icon('ticket'), '予約'),
      field('予約番号', rIn.number),
      field('名義', rIn.holder),
    ];
    if (label === STAY) {
      rIn.checkIn = clearable('time', r.checkIn || '');
      rIn.checkOut = clearable('time', r.checkOut || '');
      rows.push(h('div', { class: 'row2' }, field('チェックイン', rIn.checkIn), field('チェックアウト', rIn.checkOut)));
    } else {
      rIn.meetTime = clearable('time', r.meetTime || '');
      rows.push(field('受付・集合時刻', rIn.meetTime));
    }
    rIn.memo = textArea({ value: r.memo || '', placeholder: '電話でしか予約できない店の番号など', rows: 2 });
    rows.push(field('予約のメモ', rIn.memo));
    rows.push(btn('予約を外す', async () => {
      readRsv();
      const filled = Object.values(r).some(Boolean);
      if (filled && !(await confirmSheetInline('予約を外すと、予約番号や名義も消えます。'))) return;
      hasRsv = false;
      for (const k in r) delete r[k];
      drawRsv();
    }, 'quiet small'));
    rsvBox.append(...rows);
  }
  drawRsv();

  // 小窓の中の小さな確認（小窓を閉じずに聞く）
  function confirmSheetInline(msg) {
    return Promise.resolve(window.confirm(msg));
  }

  const save = () => {
    const n = name.value.trim();
    if (!n) { err.replaceChildren(errorBox(['名前を入れてください'])); name.focus(); return; }
    readRsv();
    const s = { type: 'stop', name: n };
    if (label) s.label = label;
    const st = val(start), en = val(end);
    if (st) s.start = st;
    if (en) s.end = en;
    const m = memo.value.trim(); if (m) s.memo = m;
    const su = site.value.trim();
    if (su) {
      if (!isUrl(su)) { err.replaceChildren(errorBox(['サイトのリンクは https:// で始まる形で入れてください'])); return; }
      s.siteUrl = su;
    }
    const mu = map.value.trim();
    if (mu) {
      if (!isUrl(mu)) { err.replaceChildren(errorBox(['地図のリンクは https:// で始まる形で入れてください'])); return; }
      s.mapUrl = mu;
    }
    if (hasRsv) {
      const rr = {};
      for (const k of ['number', 'holder', 'checkIn', 'checkOut', 'meetTime', 'memo']) if (r[k]) rr[k] = r[k];
      if (Object.keys(rr).length) s.reservation = rr;
    }
    closeSheet();
    ctx.change(b => {
      const its = ensureDay(b, di).items;
      if (isNew) insertStopByTime(its, s);
      else its[idx] = s;
    });
  };

  const actions = [];
  if (!isNew) {
    actions.push(btn('消す', async () => {
      closeSheet(true);
      const ok = await confirmSheet({ title: `「${src.name}」を消しますか`, message: '行程からこの立ち寄りを消します。', ok: '消す', danger: true });
      if (ok) ctx.change(b => removeStopAt(ensureDay(b, di).items, idx), '消しました');
    }, 'danger-quiet'));
  }
  actions.push(btn(isNew ? '入れる' : '保存', save, 'pri'));

  const body = [
    field('名前', name),
    field('ラベル', labelChips),
    h('div', { class: 'row2' }, field('開始', start), field('終了', end)),
    field('メモ', memo),
    field('サイト', site),
    field('地図', map),
    rsvBox,
    err,
  ];
  if (!isNew && (src.start || src.end)) {
    const ord = stopsOf(items).findIndex(s => s.idx === idx);
    body.splice(3, 0, h('div', { class: 'inline-act' },
      btn('ここから後ろをずらす', () => { closeSheet(true); shiftSheet(ctx, di, ord); }, 'quiet small', 'clock')));
  }

  openSheet({ title: isNew ? '予定を追加' : '予定を直す', sub: dayName(ctx.book, di), body, actions });
  if (isNew && !preset.name) setTimeout(() => name.focus(), 260);
}

/* ---------- 移動 ---------- */

// idx が null なら insertAt の位置に新しく入れる
export function editMove(ctx, di, idx, insertAt) {
  const items = dayItems(ctx.book, di);
  const src = idx == null ? { type: 'move', mode: '車' } : items[idx];
  const mode = chips({ options: MODES, value: src.mode || '車', free: true, maxlength: 8, allowNone: false });
  const memo = textInput({ value: src.memo || '', placeholder: '例：〇〇道経由' });
  const save = () => {
    const m = { type: 'move' };
    const mv = mode.getValue(); if (mv) m.mode = mv;
    const me = memo.value.trim(); if (me) m.memo = me;
    closeSheet();
    ctx.change(b => {
      const its = ensureDay(b, di).items;
      if (idx == null) its.splice(insertAt, 0, m);
      else its[idx] = m;
    });
  };
  const actions = [];
  if (idx != null) actions.push(btn('移動を消す', () => { closeSheet(); ctx.change(b => ensureDay(b, di).items.splice(idx, 1)); }, 'danger-quiet'));
  actions.push(btn(idx == null ? '入れる' : '保存', save, 'pri'));
  openSheet({
    title: idx == null ? '移動を入れる' : '移動を直す',
    body: [field('手段', mode), field('道のメモ', memo), h('p', { class: 'note' }, '所要時間は、前の予定の終了と次の予定の開始から自動で出ます。')],
    actions,
  });
}

/* ---------- ここから後ろをずらす ---------- */

export function shiftSheet(ctx, di, ord) {
  const items = dayItems(ctx.book, di);
  const stops = stopsOf(items).slice(ord);
  if (!stops.length) return;
  // iPhone の数字キーボードには「−」がないので、向き（後ろへ・前へ）と分を別々に選ぶ
  let dir = 1;
  let amount = 0;
  let min = 0;
  const preview = h('div', { class: 'shift-preview' });
  const num = textInput({ value: '', placeholder: '分', type: 'text', inputmode: 'numeric' });
  num.classList.add('num');
  num.setAttribute('pattern', '[0-9]*');
  const draw = () => {
    min = dir * amount;
    preview.replaceChildren(...stops.slice(0, 6).map(({ stop }) => {
      const t = [stop.start, stop.end].map(x => {
        const m = toMin(x);
        return m == null ? null : shiftT(m + min);
      });
      return h('div', { class: 'sp-row' },
        h('span', { class: 'sp-t' }, stop.start ? `${stop.start} → ${t[0]}` : '時刻なし'),
        h('span', { class: 'sp-n' }, stop.name));
    }), ...(stops.length > 6 ? [h('div', { class: 'note' }, `ほか${stops.length - 6}件`)] : []));
    btns.forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.m === amount && !num.value)));
    segBtns.forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.d === dir)));
  };
  const shiftT = m => {
    const c = Math.max(0, Math.min(1439, m));
    return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
  };
  const segBtns = [[1, '後ろへ（遅らせる）'], [-1, '前へ（早める）']].map(([d, l]) => h('button', {
    type: 'button', dataset: { d: String(d) },
    onclick: () => { dir = d; draw(); },
  }, l));
  const btns = [10, 15, 30, 60].map(m => h('button', {
    type: 'button', class: 'chip', dataset: { m: String(m) },
    onclick: () => { amount = m; num.value = ''; draw(); },
  }, fmtShift(m)));
  num.addEventListener('input', () => {
    const z = num.value.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\D/g, '');
    if (z !== num.value) num.value = z;
    const v = parseInt(z, 10);
    amount = isNaN(v) ? 0 : v;
    draw();
  });
  draw();
  openSheet({
    title: 'ここから後ろをずらす',
    sub: `「${stops[0].stop.name}」から後ろ ${stops.length}件（${dayName(ctx.book, di)}）`,
    body: [
      h('div', { class: 'seg', role: 'group' }, segBtns),
      h('div', { class: 'chips' }, btns),
      h('label', { class: 'fld inline' }, h('span', { class: 'fld-l' }, 'または'), num, h('span', null, '分')),
      preview,
    ],
    actions: [
      btn('やめる', () => closeSheet()),
      btn('ずらす', () => {
        if (!min) { toast('何分ずらすか選んでください'); return; }
        closeSheet();
        let clipped = 0;
        ctx.change(b => { clipped = shiftFrom(ensureDay(b, di).items, ord, min); },
          () => clipped ? '一部の時刻が日をまたぐので、0:00〜23:59 に収めました' : `${fmtShift(min)}${min > 0 ? '後ろ' : '前'}にずらしました`);
      }, 'pri'),
    ],
  });
}

const fmtShift = m => fmtDuration(Math.abs(m));

/* ---------- 予約の小窓 ---------- */

export function reservationSheet(ctx, di, idx) {
  const stop = dayItems(ctx.book, di)[idx];
  const r = stop.reservation || {};
  const d = dayDate(ctx.book, di);
  const kv = h('dl', { class: 'kv' });
  const row = (k, v) => kv.append(h('dt', null, k), h('dd', null, v));
  if (r.number) row('予約番号', [h('span', { class: 'mono rsv-no' }, r.number),
    h('button', { type: 'button', class: 'btn small', onclick: () => copyText(r.number, { done: '予約番号をコピーしました', title: '予約番号' }) }, icon('copy'), 'コピー')]);
  if (r.holder) row('名義', r.holder);
  if (stop.label === STAY) {
    if (r.checkIn) row('チェックイン', r.checkIn);
    if (r.checkOut) row('チェックアウト', r.checkOut);
  } else if (r.meetTime) row('受付・集合', r.meetTime);
  if (r.memo) row('メモ', h('span', { class: 'pre' }, linkify(r.memo)));
  if (!kv.childNodes.length) kv.append(h('dd', { class: 'note' }, '予約の中身はまだ空です'));

  const actions = [];
  if (!ctx.readOnly && r.number) {
    actions.push(extLink(`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(r.number)}`,
      icon('mail'), 'Gmail で予約メールを探す'));
    actions[0].className = 'btn pri wide';
  }
  if (!ctx.readOnly) actions.push(btn('直す', () => { closeSheet(true); editStop(ctx, di, idx); }, 'quiet'));

  openSheet({
    head: h('div', { class: 'sheet-head' },
      h('div', { class: 'sheet-title' }, stop.label ? labelEl(stop.label) : null, stop.name),
      h('div', { class: 'sheet-sub' }, [d ? fmtMD(d) : `${di + 1}日目`, stop.start].filter(Boolean).join(' '))),
    title: stop.name,
    body: kv,
    actions,
    className: 'rsv-sheet',
  });
}

/* ---------- 表紙 ---------- */

export function editCover(ctx) {
  const b = ctx.book;
  const c = b.cover || {};
  const title = textInput({ value: b.title || '', placeholder: '例：〇〇温泉 1泊2日' });
  const dest = textInput({ value: c.destination || '', placeholder: '行き先' });
  const note = textInput({ value: c.note || '', placeholder: 'ひとこと' });
  const sd = clearable('date', b.startDate || '');
  const ed = clearable('date', b.endDate || '');
  const err = h('div');
  const save = () => {
    const t = title.value.trim();
    if (!t) { err.replaceChildren(errorBox(['タイトルを入れてください'])); return; }
    let s = val(sd), e = val(ed);
    if (s && !isDate(s)) s = '';
    if (e && !isDate(e)) e = '';
    if (!s && e) s = e;
    if (s && e && e < s) [s, e] = [e, s];
    // 日付を短くしたとき、範囲の外に中身のある日が残るなら確かめる
    const n = s ? (e ? diffDays(s, e) + 1 : 1) : null;
    const extra = n != null && b.days ? b.days.slice(n).filter(d => d.items && d.items.length).length : 0;
    closeSheet();
    ctx.change(bk => {
      bk.title = t;
      bk.cover = bk.cover || {};
      const dv = dest.value.trim(), nv = note.value.trim();
      if (dv) bk.cover.destination = dv; else delete bk.cover.destination;
      if (nv) bk.cover.note = nv; else delete bk.cover.note;
      if (s) bk.startDate = s; else delete bk.startDate;
      if (e) bk.endDate = e; else delete bk.endDate;
      // 範囲の外の空の日は片づける（中身のある日は残す）
      if (n != null && bk.days) {
        while (bk.days.length > n && !(bk.days[bk.days.length - 1].items || []).length) bk.days.pop();
      }
    }, extra ? `日付の外に予定の入った日が${extra}日あるので、残してあります` : null);
  };
  openSheet({
    title: '表紙を直す',
    body: [
      field('タイトル', title),
      h('div', { class: 'row2' }, field('初日', sd), field('最終日', ed)),
      h('p', { class: 'note' }, '日数は初日〜最終日から決まります。空でもかまいません。'),
      field('行き先', dest),
      field('ひとこと', note),
      err,
    ],
    actions: [btn('やめる', () => closeSheet()), btn('保存', save, 'pri')],
  });
}

export function editPattern(ctx) {
  const cur = () => ctx.book.cover || {};
  const grid = h('div', { class: 'pat-grid' });
  const dots = h('div', { class: 'color-row' });
  const draw = () => {
    const c = cur();
    grid.replaceChildren(...PATTERNS.map(([k, l]) => h('button', {
      type: 'button', class: 'pat-opt', 'aria-pressed': String(c.pattern === k), 'aria-label': l,
      onclick: () => ctx.change(b => { b.cover = { ...(b.cover || {}), pattern: k }; }).then(draw),
    }, h('span', { class: `sw pat p-${k}`, style: { '--hue': `var(--c-${c.color || 'seiji'})` } }), h('span', { class: 'sw-l' }, l))));
    dots.replaceChildren(...COLORS.map(([k, l]) => h('button', {
      type: 'button', class: 'color-opt', 'aria-pressed': String(c.color === k), 'aria-label': l,
      onclick: () => ctx.change(b => { b.cover = { ...(b.cover || {}), color: k }; }).then(draw),
    }, h('i', { style: { background: `var(--c-${k})` } }), h('span', null, l))));
  };
  draw();
  openSheet({
    title: '柄と色',
    body: [h('div', { class: 'sec-l' }, '柄'), grid, h('div', { class: 'sec-l' }, '色'), dots,
      h('p', { class: 'note' }, '色はしおり全体のアクセント色（タブ・見出し・ボタン）にもなります。')],
    actions: [btn('できた', () => closeSheet(), 'pri')],
    className: 'pattern-sheet',
  });
}

/* ---------- 持ち物 ---------- */

export function editPacking(ctx, i) {
  const inp = textInput({ value: ctx.book.packing[i], enterkeyhint: 'done' });
  const save = () => {
    const v = inp.value.trim();
    closeSheet();
    if (!v) return;
    ctx.change(b => { b.packing[i] = v; });
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); save(); } });
  openSheet({
    title: '持ち物を直す',
    body: [field('名前', inp)],
    actions: [
      btn('消す', () => { closeSheet(); ctx.change(b => { b.packing.splice(i, 1); }, '消しました'); }, 'danger-quiet'),
      btn('保存', save, 'pri'),
    ],
  });
  setTimeout(() => inp.focus(), 260);
}

// 貼ったテキストの1行ずつを持ち物にする。行頭の「・」「-」「1.」「□」なども取る
export function splitLines(text) {
  return text.split(/\r?\n/)
    .map(l => l.replace(/^\s*(?:[-*・•●○◯□■☐☑✓✔︎]|\[[ xX]?\]|\d+[.)．、]|[-*]\s*\[[ xX]?\])\s*/, '').trim())
    .filter(Boolean);
}

export function bulkAddPacking(ctx) {
  const ta = textArea({ placeholder: '1行に1つずつ。Claude と洗い出したリストをそのまま貼れます', rows: 8 });
  const count = h('div', { class: 'note' });
  ta.addEventListener('input', () => { const n = splitLines(ta.value).length; count.textContent = n ? `${n}個入ります` : ''; });
  openSheet({
    title: 'まとめて追加',
    body: [ta, count],
    actions: [
      btn('やめる', () => closeSheet()),
      btn('入れる', () => {
        const list = splitLines(ta.value);
        closeSheet();
        if (!list.length) return;
        ctx.change(b => { b.packing = [...(b.packing || []), ...list]; }, `${list.length}個入れました`);
      }, 'pri'),
    ],
  });
  setTimeout(() => ta.focus(), 260);
}

/* ---------- いけたらいく ---------- */

export function editWish(ctx, i) {
  const w = ctx.book.wishlist[i];
  const name = textInput({ value: w.name });
  const site = textInput({ value: w.siteUrl || '', placeholder: 'お店などのサイト', type: 'url', inputmode: 'url' });
  const map = textInput({ value: w.mapUrl || '', placeholder: 'Googleマップの共有リンク', type: 'url', inputmode: 'url' });
  const err = h('div');
  openSheet({
    title: 'いけたらいくを直す',
    body: [field('名前', name), field('サイト', site), field('地図', map), err],
    actions: [
      btn('消す', () => { closeSheet(); ctx.change(b => { b.wishlist.splice(i, 1); }, '消しました'); }, 'danger-quiet'),
      btn('保存', () => {
        const n = name.value.trim();
        if (!n) { err.replaceChildren(errorBox(['名前を入れてください'])); return; }
        const s = site.value.trim(), m = map.value.trim();
        if ((s && !isUrl(s)) || (m && !isUrl(m))) { err.replaceChildren(errorBox(['リンクは https:// で始まる形で入れてください'])); return; }
        closeSheet();
        ctx.change(b => {
          const o = { name: n };
          if (s) o.siteUrl = s;
          if (m) o.mapUrl = m;
          b.wishlist[i] = o;
        });
      }, 'pri'),
    ],
  });
}

export function wishToItinerary(ctx, i) {
  const b = ctx.book;
  const w = b.wishlist[i];
  const n = dayCount(b);
  const ti = todayIndex(b);
  let day = ti >= 0 ? ti : 0;
  const dayBtns = Array.from({ length: n }, (_, k) => h('button', {
    type: 'button', class: 'chip', 'aria-pressed': String(k === day),
    onclick: () => { day = k; dayBtns.forEach((x, j) => x.setAttribute('aria-pressed', String(j === day))); },
  }, dayName(b, k)));
  const time = clearable('time', '');
  openSheet({
    title: '行程に入れる',
    sub: w.name,
    body: [
      field('何日目', h('div', { class: 'chips' }, dayBtns)),
      field('開始時刻', time, '空なら、その日の最後に入ります'),
    ],
    actions: [
      btn('やめる', () => closeSheet()),
      btn('行程に入れる', () => {
        const st = normTime(val(time) || '') || '';
        closeSheet();
        ctx.change(bk => {
          const s = { type: 'stop', name: w.name };
          if (st) s.start = st;
          if (w.siteUrl) s.siteUrl = w.siteUrl;
          if (w.mapUrl) s.mapUrl = w.mapUrl;
          insertStopByTime(ensureDay(bk, day).items, s);
          bk.wishlist.splice(i, 1);
        }, `${day + 1}日目に入れました`);
      }, 'pri'),
    ],
  });
}
