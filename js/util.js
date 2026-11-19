// 小さな道具あつめ：DOM づくり、日付・時刻、リンク化、コピー、共有

/* ---------- DOM ---------- */

// h('div', {class:'x', onclick:fn}, 'text', child, [children])
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv;
        }
      }
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

const SVGNS = 'http://www.w3.org/2000/svg';
// アイコン（index.html の <symbol id="i-xxx">）
export function icon(name, cls = '') {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'ico ' + cls);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVGNS, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.appendChild(use);
  return svg;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

/* ---------- 日付 ---------- */

const WD = ['日', '月', '火', '水', '木', '金', '土'];
export const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDate(s) {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3];
}

function toDate(s) { const m = DATE_RE.exec(s); return new Date(+m[1], +m[2] - 1, +m[3], 12); }
function fromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function todayStr() { return fromDate(new Date()); }
export function addDays(s, n) { const d = toDate(s); d.setDate(d.getDate() + n); return fromDate(d); }
export function diffDays(a, b) { return Math.round((toDate(b) - toDate(a)) / 86400000); }
export function weekday(s) { return WD[toDate(s).getDay()]; }

// 11/21（土）
export function fmtMD(s) { const d = toDate(s); return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）`; }

// 本棚用：11/21（土）〜 11/22（日）
export function fmtRangeShort(start, end) {
  if (!start) return '';
  if (!end || end === start) return fmtMD(start);
  return `${fmtMD(start)} 〜 ${fmtMD(end)}`;
}

// 表紙用：11月21日（土）〜 22日（日）。今年でなければ年も付ける
export function fmtRangeLong(start, end) {
  if (!start) return '';
  const a = toDate(start);
  const thisYear = new Date().getFullYear();
  const y = a.getFullYear() !== thisYear ? `${a.getFullYear()}年` : '';
  const first = `${y}${a.getMonth() + 1}月${a.getDate()}日（${WD[a.getDay()]}）`;
  if (!end || end === start) return first;
  const b = toDate(end);
  let second;
  if (b.getFullYear() !== a.getFullYear()) second = `${b.getFullYear()}年${b.getMonth() + 1}月${b.getDate()}日`;
  else if (b.getMonth() !== a.getMonth()) second = `${b.getMonth() + 1}月${b.getDate()}日`;
  else second = `${b.getDate()}日`;
  return `${first} 〜 ${second}（${WD[b.getDay()]}）`;
}

/* ---------- 時刻 ---------- */

export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// "9:00" や "９：００" も "09:00" に直す。読めなければ null
export function normTime(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim().replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[：]/g, ':');
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const hh = +m[1], mm = +m[2];
  if (hh > 23 || mm > 59) return null;
  return `${String(hh).padStart(2, '0')}:${m[2]}`;
}
export function toMin(t) { const m = TIME_RE.exec(t); return m ? +m[1] * 60 + +m[2] : null; }
export function fromMin(n) {
  const c = Math.max(0, Math.min(23 * 60 + 59, Math.round(n)));
  return `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}`;
}
export function nowMin() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }

// 75 → "1時間15分"
export function fmtDuration(min) {
  if (min == null || min <= 0) return '';
  const hh = Math.floor(min / 60), mm = min % 60;
  if (!hh) return `${mm}分`;
  return mm ? `${hh}時間${mm}分` : `${hh}時間`;
}

/* ---------- リンク化（URL と電話番号をタップできるように） ---------- */

const LINK_RE = /(https?:\/\/[^\s<>"'「」『』（）【】、。]+)|((?:\+81[-\s]?\d{1,4}|0\d{1,4})-\d{1,4}-\d{3,4}|0[5789]0\d{8}|0\d{9})/g;

export function linkify(text) {
  const frag = document.createDocumentFragment();
  if (!text) return frag;
  let last = 0;
  LINK_RE.lastIndex = 0;
  let m;
  while ((m = LINK_RE.exec(text))) {
    let s = m[0];
    const start = m.index;
    // 数字の途中から始まる電話番号は取らない
    if (m[2] && start > 0 && /[\d\-]/.test(text[start - 1])) continue;
    if (m[2] && /\d/.test(text[start + s.length] || '')) continue;
    if (m[1]) s = s.replace(/[).,!?:;、。]+$/, '');
    if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)));
    const a = m[1] ? extLink(s, s) : h('a', { href: 'tel:' + s.replace(/[^\d+]/g, ''), class: 'tel' }, s);
    a.addEventListener('click', e => e.stopPropagation());
    frag.appendChild(a);
    last = start + s.length;
    LINK_RE.lastIndex = last;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  return frag;
}

// 外のアプリ・ブラウザで開くリンク
export function extLink(href, ...children) {
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, ...children);
}

export function isUrl(s) { return typeof s === 'string' && /^https?:\/\/\S+$/.test(s.trim()); }

/* ---------- いろいろ ---------- */

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function debounce(fn, ms) {
  let t = null;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => { t = null; fn(...args); }, ms); };
  d.flush = (...args) => { if (t) { clearTimeout(t); t = null; fn(...args); } };
  return d;
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
