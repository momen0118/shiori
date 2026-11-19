// 栞の JSON 形式（docs/FORMAT.md）まわり：
// 読み込み・形の点検・整え・古い形の読み替え・中身の数え上げ・書き出し

import { parseJson, JsonError } from './jsonparse.js';
import { isDate, normTime, addDays, diffDays, isUrl } from './util.js';

export const FORMAT = 'tabi-shiori';
export const VERSION = 1;
export const BACKUP_FORMAT = 'tabi-shiori-backup';

export const PATTERNS = [
  ['check', 'チェック'], ['gingham', 'ギンガム'], ['stripe', 'ストライプ'], ['border', 'ボーダー'],
  ['dot', '水玉'], ['grid', '方眼'], ['wave', '波線'], ['diagonal', '斜線'],
];
export const COLORS = [
  ['kaki', '柿'], ['yamabuki', '山吹'], ['wakakusa', '若草'], ['seiji', '青磁'],
  ['ai', '藍'], ['fuji', '藤'], ['sakura', '桜'], ['nezumi', '鼠'],
];
export const LABELS = ['観光', 'あそぶ', '食事', 'カフェ', '買い物', '休憩', '泊まる', '温泉'];
export const MODES = ['車', '徒歩', '電車', 'バス', '飛行機', '船'];
export const LABEL_MAX = 6;
export const STAY = '泊まる';

// ラベルの色。決まった候補は色を決めておき、自由に書いたラベルは文字から色を選ぶ（同じ文字ならいつも同じ色）
const LABEL_HUE = {
  観光: '--c-ai', あそぶ: '--c-wakakusa', 食事: '--c-kaki', カフェ: '--c-yamabuki',
  買い物: '--c-sakura', 休憩: '--c-seiji', 泊まる: '--c-fuji', 温泉: '--c-yu',
};
const FREE_HUES = ['--c-kaki', '--c-yamabuki', '--c-wakakusa', '--c-seiji', '--c-ai', '--c-fuji', '--c-sakura', '--c-yu'];
export function labelHue(label) {
  if (!label) return null;
  if (LABEL_HUE[label]) return `var(${LABEL_HUE[label]})`;
  let n = 0;
  for (const ch of label) n = (n * 31 + ch.codePointAt(0)) >>> 0;
  return `var(${FREE_HUES[n % FREE_HUES.length]})`;
}

const PATTERN_KEYS = PATTERNS.map(p => p[0]);
const COLOR_KEYS = COLORS.map(c => c[0]);

/* ---------- 貼られた文字から JSON を取り出す ---------- */

// 最初の「{」から最後の「}」までを読む（```json の記号ごと貼られても読める）
// 戻り値：{ ok:true, value } または { ok:false, message }
export function readText(text) {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, message: '何も貼られていません' };
  const a = text.indexOf('{');
  const b = text.lastIndexOf('}');
  if (a < 0) return { ok: false, message: '「{」が見つかりません。Claude が出した JSON をまるごと貼ってください' };
  if (b < a) {
    try { parseJson(text, a, text.length); } catch (e) { if (e instanceof JsonError) return { ok: false, message: e.describe(), line: e.lineText }; }
    return { ok: false, message: '最後の「}」が見つかりません。途中で切れているかもしれません' };
  }
  try {
    return { ok: true, value: parseJson(text, a, b + 1) };
  } catch (e) {
    if (e instanceof JsonError) return { ok: false, message: e.describe(), line: e.lineText };
    return { ok: false, message: '読めませんでした（' + e.message + '）' };
  }
}

/* ---------- 古い形の読み替え ---------- */

// 保存されているデータや読み込んだ JSON を、今の version の形にそろえる。
// 形式を変えるときは VERSION を上げて、ここに「古い形 → 新しい形」を足していく。
export function upgrade(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  let v = Number(raw.version) || 1;
  const out = { ...raw };
  // 例：if (v === 1) { …1 → 2 の読み替え… ; v = 2; }
  out.version = Math.max(v, VERSION);
  return out;
}

/* ---------- 形の点検と整え ---------- */

const str = v => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const text = v => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/^\s*\n|\s+$/g, '') : typeof v === 'number' ? String(v) : '');

// 生の JSON（オブジェクト）を、栞の形に整える。
// 知らない項目は捨てる。空の値は省く。
// 戻り値：{ book, errors:[...], warnings:[...] }
//   errors   … 読み込みを止めるべきもの（必須の名前がない など）
//   warnings … 直して読み込んだもの（時刻の形がおかしいので外した など）
export function normalize(raw, { requireTitle = true } = {}) {
  const errors = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { book: null, errors: ['栞の形になっていません（いちばん外側が { } ではありません）'], warnings };
  }
  if (raw.format === BACKUP_FORMAT) {
    return { book: null, errors: ['これはバックアップのデータです。本棚のメニューの「バックアップから戻す」から読み込んでください'], warnings };
  }
  if (raw.format != null && raw.format !== FORMAT) {
    warnings.push(`"format" が "${FORMAT}" ではありませんが、読めるところを読みました`);
  }
  if (Number(raw.version) > VERSION) {
    warnings.push('このアプリより新しい形式のデータです。読めない部分があるかもしれません');
  }

  const b = upgrade(raw);
  const book = { format: FORMAT, version: VERSION };

  const title = str(b.title);
  if (title) book.title = title;
  else if (requireTitle) errors.push('栞のタイトル（"title"）がありません');

  let start = isDate(b.startDate) ? b.startDate : '';
  let end = isDate(b.endDate) ? b.endDate : '';
  if (b.startDate && !start) warnings.push(`初日の日付「${b.startDate}」が読めないので外しました（YYYY-MM-DD の形にしてください）`);
  if (b.endDate && !end) warnings.push(`最終日の日付「${b.endDate}」が読めないので外しました（YYYY-MM-DD の形にしてください）`);
  if (!start && end) { start = end; }
  if (start && end && end < start) { [start, end] = [end, start]; warnings.push('初日と最終日が逆だったので入れ替えました'); }
  if (start) book.startDate = start;
  if (end) book.endDate = end;
  if (b.done === true) book.done = true;

  if (b.cover && typeof b.cover === 'object') {
    const c = {};
    if (PATTERN_KEYS.includes(b.cover.pattern)) c.pattern = b.cover.pattern;
    else if (b.cover.pattern) warnings.push(`表紙の柄「${b.cover.pattern}」は知らない柄なので外しました`);
    if (COLOR_KEYS.includes(b.cover.color)) c.color = b.cover.color;
    else if (b.cover.color) warnings.push(`表紙の色「${b.cover.color}」は知らない色なので外しました`);
    const dest = str(b.cover.destination); if (dest) c.destination = dest;
    const note = text(b.cover.note); if (note) c.note = note;
    if (Object.keys(c).length) book.cover = c;
  }

  if (Array.isArray(b.packing)) {
    const p = [];
    for (const it of b.packing) {
      const s = str(typeof it === 'object' && it ? it.name : it);
      if (s) p.push(s);
    }
    if (p.length) book.packing = p;
  } else if (b.packing != null) warnings.push('持ち物（"packing"）が並び [ ] になっていないので読みませんでした');

  if (Array.isArray(b.days)) {
    const days = [];
    b.days.forEach((d, di) => {
      const day = {};
      if (d && isDate(d.date)) day.date = d.date;
      const items = [];
      const src = Array.isArray(d) ? d : d && Array.isArray(d.items) ? d.items : [];
      let stopNo = 0;
      src.forEach(it => {
        if (!it || typeof it !== 'object') return;
        const type = it.type || (it.name ? 'stop' : it.mode ? 'move' : '');
        if (type === 'stop') {
          stopNo++;
          const s = normStop(it, `${di + 1}日目の${stopNo}つ目の立ち寄り`, errors, warnings);
          if (s) items.push(s);
        } else if (type === 'move') {
          const m = { type: 'move' };
          const mode = str(it.mode); if (mode) m.mode = mode.slice(0, 8);
          const memo = text(it.memo); if (memo) m.memo = memo;
          items.push(m);
        } else {
          warnings.push(`${di + 1}日目に、立ち寄りでも移動でもないものがあったので外しました`);
        }
      });
      day.items = items;
      days.push(day);
    });
    // 日付があれば初日から順番に振り直す
    if (book.startDate) days.forEach((d, i) => { d.date = addDays(book.startDate, i); });
    if (days.length) book.days = days;
  } else if (b.days != null) warnings.push('行程（"days"）が並び [ ] になっていないので読みませんでした');

  if (Array.isArray(b.wishlist)) {
    const w = normWishlist(b.wishlist, errors, warnings);
    if (w.length) book.wishlist = w;
  }

  const memo = text(b.memo);
  if (memo) book.memo = memo;

  return { book, errors, warnings };
}

function normStop(it, where, errors, warnings) {
  const s = { type: 'stop' };
  const name = str(it.name);
  if (!name) { errors.push(`${where}に名前（"name"）がありません`); return null; }
  const label = str(it.label);
  if (label) s.label = [...label].slice(0, LABEL_MAX).join('');
  s.name = name;
  for (const k of ['start', 'end']) {
    if (it[k] == null || it[k] === '') continue;
    const t = normTime(String(it[k]));
    if (t) s[k] = t;
    else warnings.push(`「${name}」の${k === 'start' ? '開始' : '終了'}時刻「${it[k]}」が読めないので外しました`);
  }
  const memo = text(it.memo); if (memo) s.memo = memo;
  if (it.siteUrl) {
    if (isUrl(it.siteUrl)) s.siteUrl = it.siteUrl.trim();
    else warnings.push(`「${name}」のサイトのリンクが URL の形ではないので外しました`);
  }
  if (it.mapUrl) {
    if (isUrl(it.mapUrl)) s.mapUrl = it.mapUrl.trim();
    else warnings.push(`「${name}」の地図のリンクが URL の形ではないので外しました`);
  }
  if (it.reservation && typeof it.reservation === 'object') {
    const r = normReservation(it.reservation, name, warnings);
    if (r) s.reservation = r;
  }
  return s;
}

function normReservation(src, name, warnings) {
  const r = {};
  const number = str(src.number); if (number) r.number = number;
  const holder = str(src.holder); if (holder) r.holder = holder;
  for (const k of ['checkIn', 'checkOut', 'meetTime']) {
    if (src[k] == null || src[k] === '') continue;
    const t = normTime(String(src[k]));
    if (t) r[k] = t;
    else warnings.push(`「${name}」の予約の時刻「${src[k]}」が読めないので外しました`);
  }
  const memo = text(src.memo); if (memo) r.memo = memo;
  return Object.keys(r).length ? r : null;
}

function normWishlist(list, errors, warnings) {
  const out = [];
  list.forEach((w, i) => {
    if (typeof w === 'string') w = { name: w };
    if (!w || typeof w !== 'object') return;
    const name = str(w.name);
    if (!name) { errors.push(`いけたらいくの${i + 1}つ目に名前（"name"）がありません`); return; }
    const o = { name };
    if (w.siteUrl) { if (isUrl(w.siteUrl)) o.siteUrl = w.siteUrl.trim(); else warnings.push(`「${name}」のサイトのリンクが URL の形ではないので外しました`); }
    if (w.mapUrl) { if (isUrl(w.mapUrl)) o.mapUrl = w.mapUrl.trim(); else warnings.push(`「${name}」の地図のリンクが URL の形ではないので外しました`); }
    out.push(o);
  });
  return out;
}

// 「いけたらいくだけ足す」用
export function normalizeWishlistOnly(raw) {
  const errors = [], warnings = [];
  if (!raw || typeof raw !== 'object') return { wishlist: [], errors: ['形がおかしいです'], warnings };
  if (!Array.isArray(raw.wishlist)) return { wishlist: [], errors: ['いけたらいく（"wishlist"）が入っていません'], warnings };
  const wishlist = normWishlist(raw.wishlist, errors, warnings);
  if (!wishlist.length && !errors.length) errors.push('いけたらいくが空です');
  return { wishlist, errors, warnings };
}

// 画面で直したあと、保存する前に形を整える（空の値を省く・キーの順番をそろえる）
export function tidy(book) {
  const { book: b } = normalize(book, { requireTitle: false });
  return b;
}

/* ---------- 日と数え上げ ---------- */

// 行程の日数：開始日〜終了日から決まる。日付がなければ days の数
export function dayCount(book) {
  const n = book.days ? book.days.length : 0;
  if (book.startDate) {
    const range = book.endDate ? diffDays(book.startDate, book.endDate) + 1 : 1;
    return Math.max(range, n, 1);
  }
  return Math.max(n, 1);
}

export function dayDate(book, i) {
  if (book.startDate) return addDays(book.startDate, i);
  const d = book.days && book.days[i];
  return d && d.date ? d.date : '';
}

// 中身の確認用：「2日間・立ち寄り6件・予約1件・いけたらいく1件」
export function summarize(book) {
  let stops = 0, rsv = 0;
  for (const d of book.days || []) for (const it of d.items) {
    if (it.type === 'stop') { stops++; if (it.reservation) rsv++; }
  }
  const parts = [];
  if (book.startDate || (book.days && book.days.length)) parts.push(`${dayCount(book)}日間`);
  parts.push(`立ち寄り${stops}件`);
  if (rsv) parts.push(`予約${rsv}件`);
  if (book.wishlist && book.wishlist.length) parts.push(`いけたらいく${book.wishlist.length}件`);
  if (book.packing && book.packing.length) parts.push(`持ち物${book.packing.length}個`);
  return parts.join('・');
}

// 柄と色が決まっていなければ決める
export function ensureCover(book) {
  book.cover = book.cover || {};
  if (!book.cover.pattern) book.cover.pattern = PATTERN_KEYS[Math.floor(Math.random() * PATTERN_KEYS.length)];
  if (!book.cover.color) book.cover.color = COLOR_KEYS[Math.floor(Math.random() * COLOR_KEYS.length)];
  return book;
}

/* ---------- 書き出し ---------- */

export function toJson(book, pretty = true) {
  return JSON.stringify(tidy(book), null, pretty ? 2 : 0);
}

/* ---------- バックアップ（全部の栞をまとめて1つ） ---------- */

export function makeBackup(records) {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    books: records.map(r => ({ id: r.id, updatedAt: r.updatedAt, shiori: tidy(r.shiori) })),
  }, null, 2);
}

// 戻り値：{ books:[{id, updatedAt, shiori}], errors:[], warnings:[] }
export function readBackup(raw) {
  const errors = [], warnings = [];
  if (!raw || raw.format !== BACKUP_FORMAT || !Array.isArray(raw.books)) {
    if (raw && (raw.format === FORMAT || raw.title)) {
      errors.push('これは栞1冊分の JSON です。「Claude から読み込む」から読み込んでください');
    } else errors.push('バックアップの形になっていません（"format": "tabi-shiori-backup" がありません）');
    return { books: [], errors, warnings };
  }
  const books = [];
  raw.books.forEach((b, i) => {
    const src = b && b.shiori ? b.shiori : b;
    const n = normalize(src);
    if (n.errors.length) { errors.push(`${i + 1}冊目：${n.errors[0]}`); return; }
    n.warnings.forEach(w => warnings.push(`「${n.book.title}」：${w}`));
    books.push({ id: b && typeof b.id === 'string' ? b.id : null, updatedAt: b && b.updatedAt, shiori: n.book });
  });
  return { books, errors, warnings };
}
