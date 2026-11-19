// Claude とのやりとり（読み込み・書き出し）と、バックアップ

import { h, todayStr, uid } from './util.js';
import { openSheet, closeSheet, copyText, saveFile, pickTextFile, toast } from './ui.js';
import { btn, errorBox, textArea } from './forms.js';
import { readText, normalize, normalizeWishlistOnly, summarize, toJson, makeBackup, readBackup } from './format.js';
import * as store from './store.js';

/* ---------- Claude 用に書き出す ---------- */

// メニューのボタンの中から呼ぶ（コピーはボタンを押した処理の中で）
export function exportForClaude(book) {
  copyText(toJson(book), { done: 'しおりの JSON をコピーしました。Claude に貼って相談できます', title: 'Claude 用に書き出す' });
}

/* ---------- Claude から読み込む ---------- */

// mode: 'new'（新しいしおりとして）または 'book'（今のしおりに：置き換え・いけたらいくだけ足す）
// onApply(kind, data) … kind: 'new' | 'replace' | 'wish'
export function openImport({ mode, onApply }) {
  let kind = mode === 'new' ? 'new' : 'replace';
  const ta = textArea({ placeholder: 'Claude が出した JSON をここに貼る（```json の記号ごとでも読めます）', rows: 7 });
  ta.classList.add('mono');
  const result = h('div', { class: 'import-result' });
  let parsed = null;
  const put = (...n) => putInto(result, ...n);

  const seg = mode === 'new' ? null : h('div', { class: 'seg', role: 'group' },
    [['replace', '今のしおりと置き換え'], ['wish', 'いけたらいくだけ足す']].map(([k, l]) => h('button', {
      type: 'button', 'aria-pressed': String(k === kind),
      onclick: e => {
        kind = k;
        seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
        check();
      },
    }, l)));

  const okBtn = btn(mode === 'new' ? '新しいしおりにする' : '置き換える', () => apply(), 'pri');
  okBtn.disabled = true;

  function check() {
    parsed = null;
    okBtn.disabled = true;
    okBtn.textContent = kind === 'new' ? '新しいしおりにする' : kind === 'replace' ? '置き換える' : '足す';
    result.replaceChildren();
    if (!ta.value.trim()) return;
    const r = readText(ta.value);
    if (!r.ok) {
      put(errorBox(['読めませんでした。', r.message, r.line ? `→ ${r.line}` : null].filter(Boolean)));
      return;
    }
    if (kind === 'wish') {
      const w = normalizeWishlistOnly(r.value);
      if (w.errors.length) { put(errorBox(w.errors)); return; }
      parsed = w.wishlist;
      put(h('div', { class: 'msg ok' },
        h('b', null, `いけたらいく${w.wishlist.length}件`),
        h('div', { class: 'note' }, w.wishlist.slice(0, 8).map(x => x.name).join('、') + (w.wishlist.length > 8 ? ' …' : ''))),
      warn(w.warnings));
    } else {
      const n = normalize(r.value);
      if (n.errors.length) { put(errorBox(['足りないところがあります。', ...n.errors])); return; }
      parsed = n.book;
      put(h('div', { class: 'msg ok' },
        h('b', null, n.book.title),
        h('div', null, summarize(n.book))),
      warn(n.warnings));
      if (kind === 'replace') put(h('p', { class: 'note' }, '置き換える前の状態を1つ控えておきます。メニューの「置き換える前に戻す」で戻せます。'));
    }
    okBtn.disabled = false;
  }

  function apply() {
    if (!parsed) return;
    closeSheet();
    onApply(kind, parsed);
  }

  let t = null;
  ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(check, 250); });

  openSheet({
    title: 'Claude から読み込む',
    sub: mode === 'new' ? '新しいしおりとして' : null,
    body: [
      seg,
      ta,
      h('div', { class: 'inline-act' },
        btn('ファイルから読む', async () => {
          const s = await pickTextFile();
          if (s != null) { ta.value = s; ta.dispatchEvent(new Event('input')); check(); }
        }, 'quiet small', 'file')),
      result,
    ],
    actions: [btn('やめる', () => closeSheet()), okBtn],
  });
}

// null を飛ばして結果の欄に足す
function putInto(el, ...nodes) { for (const n of nodes) if (n) el.append(n); }

function warn(list) {
  if (!list || !list.length) return null;
  return h('div', { class: 'msg warn' }, h('div', null, '直して読み込むもの：'), list.slice(0, 8).map(w => h('div', null, '・' + w)),
    list.length > 8 ? h('div', null, `ほか${list.length - 8}件`) : null);
}

/* ---------- バックアップ ---------- */

export async function openBackup() {
  const recs = await store.listBooks();
  if (!recs.length) { toast('まだしおりがありません'); return; }
  const json = makeBackup(recs);
  const name = `shiori-backup-${todayStr()}.json`;
  openSheet({
    title: '全部まとめてバックアップ',
    sub: `${recs.length}冊`,
    body: [
      h('p', { class: 'sheet-text' }, '全部のしおりを1つの JSON にまとめます。「ファイルに保存」で iPhone の「ファイル」アプリに置いておくと安心です。同じものから「バックアップから戻す」で戻せます。'),
    ],
    actions: [
      btn('コピー', () => copyText(json, { done: 'バックアップをコピーしました', title: 'バックアップ' }), '', 'copy'),
      btn('ファイルに保存', () => {
        saveFile(name, json).then(ok => { if (ok) { closeSheet(); toast('保存しました'); } });
      }, 'pri', 'file'),
    ],
  });
}

// onDone() … 戻したあと本棚を描き直す
export function openRestore(onDone) {
  const ta = textArea({ placeholder: 'バックアップの JSON をここに貼る', rows: 6 });
  ta.classList.add('mono');
  const result = h('div', { class: 'import-result' });
  let plan = null;
  const put = (...n) => putInto(result, ...n);
  const okBtn = btn('戻す', () => apply(), 'pri');
  okBtn.disabled = true;

  async function check() {
    plan = null; okBtn.disabled = true; result.replaceChildren();
    if (!ta.value.trim()) return;
    const r = readText(ta.value);
    if (!r.ok) { put(errorBox(['読めませんでした。', r.message, r.line ? `→ ${r.line}` : null].filter(Boolean))); return; }
    const bk = readBackup(r.value);
    if (bk.errors.length && !bk.books.length) { put(errorBox(bk.errors)); return; }
    const have = new Map((await store.listBooks()).map(x => [x.id, x]));
    let add = 0, over = 0, same = 0;
    const steps = bk.books.map(b => {
      const cur = b.id && have.get(b.id);
      if (!cur) { add++; return { type: 'add', b }; }
      if (toJson(cur.shiori, false) === toJson(b.shiori, false)) { same++; return { type: 'same', b }; }
      over++; return { type: 'over', b, cur };
    });
    plan = steps;
    put(h('div', { class: 'msg ok' },
      h('b', null, `${bk.books.length}冊`),
      h('div', null, [add && `新しく入る ${add}冊`, over && `今のしおりを上書き ${over}冊`, same && `同じなので何もしない ${same}冊`].filter(Boolean).join('・'))),
    over ? h('p', { class: 'note' }, '上書きするしおりは、上書き前の状態を控えておきます。そのしおりのメニューの「置き換える前に戻す」で戻せます。') : null,
    bk.errors.length ? errorBox(['読めなかったしおり：', ...bk.errors]) : null,
    warn(bk.warnings));
    okBtn.disabled = !(add || over);
  }

  async function apply() {
    if (!plan) return;
    closeSheet();
    let n = 0;
    for (const s of plan) {
      if (s.type === 'add') {
        await store.putBook({ id: s.b.id || uid(), shiori: s.b.shiori, prev: null });
        n++;
      } else if (s.type === 'over') {
        // 今のしおりを控えに入れてから上書き（データを消さない）
        await store.putBook({ ...s.cur, prev: s.cur.shiori, shiori: s.b.shiori });
        n++;
      }
    }
    toast(`${n}冊を戻しました`);
    onDone && onDone();
  }

  let t = null;
  ta.addEventListener('input', () => { clearTimeout(t); t = setTimeout(check, 250); });
  openSheet({
    title: 'バックアップから戻す',
    body: [
      ta,
      h('div', { class: 'inline-act' },
        btn('ファイルから読む', async () => {
          const s = await pickTextFile();
          if (s != null) { ta.value = s; check(); }
        }, 'quiet small', 'file')),
      result,
    ],
    actions: [btn('やめる', () => closeSheet()), okBtn],
  });
}

