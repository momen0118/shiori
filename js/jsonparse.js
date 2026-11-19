// 貼り付けられた JSON を読むための小さな読み取り器。
// ふつうの JSON.parse は「どこがおかしいか」を教えてくれない（Safari は特に）ので、
// 自前で読みながら、おかしな所を日本語で説明する。
// 少しだけ甘くしてある：最後の項目の後ろの「,」、// や /* */ のコメント、文字列の中の改行は読める。

export class JsonError extends Error {
  constructor(message, pos, text) {
    super(message);
    this.pos = pos;
    const before = text.slice(0, pos);
    this.line = before.split('\n').length;
    this.col = pos - before.lastIndexOf('\n');
    const ls = before.lastIndexOf('\n') + 1;
    let le = text.indexOf('\n', pos);
    if (le < 0) le = text.length;
    this.lineText = text.slice(ls, le).trim().slice(0, 80);
  }
  // 画面に出す文
  describe() {
    return `${this.line}行目の${this.col}文字目あたり：${this.message}`;
  }
}

const SMART = '“”‘’„«»「」';

export function parseJson(text, start = 0, end = text.length) {
  let i = start;

  const fail = (msg, at = i) => { throw new JsonError(msg, Math.min(at, text.length), text); };
  const ch = () => (i < end ? text[i] : '');

  function skip() {
    for (;;) {
      const c = ch();
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '　' || c === '﻿' || c === ' ') { i++; continue; }
      if (c === '/' && text[i + 1] === '/') { while (i < end && text[i] !== '\n') i++; continue; }
      if (c === '/' && text[i + 1] === '*') {
        const j = text.indexOf('*/', i + 2);
        if (j < 0 || j >= end) fail('「/*」で始まるコメントが閉じていません');
        i = j + 2; continue;
      }
      return;
    }
  }

  function describeChar(c) {
    if (!c) return '';
    if (SMART.includes(c)) return `「${c}」は飾りの引用符です。半角の「"」に直してください`;
    if (c === "'") return '文字列が「\'」で囲まれています。半角の「"」で囲んでください';
    return null;
  }

  function value(where) {
    skip();
    const c = ch();
    if (c === '{') return object();
    if (c === '[') return array();
    if (c === '"') return string();
    if (c === '-' || (c >= '0' && c <= '9')) return number();
    if (text.startsWith('true', i)) { i += 4; return true; }
    if (text.startsWith('false', i)) { i += 5; return false; }
    if (text.startsWith('null', i)) { i += 4; return null; }
    if (!c) fail('途中で終わっています。最後のほうが切れているかもしれません');
    const d = describeChar(c);
    if (d) fail(d);
    fail(`${where}があるはずの所に「${c}」があります`);
  }

  function object() {
    const startPos = i;
    i++; // {
    const obj = {};
    skip();
    if (ch() === '}') { i++; return obj; }
    for (;;) {
      skip();
      const c = ch();
      if (c === '}') { i++; return obj; } // 最後の「,」のあと
      if (!c) fail(`「{」（${posText(startPos)}）が閉じないまま終わっています。最後のほうが切れているかもしれません`);
      if (c !== '"') {
        const d = describeChar(c);
        if (d) fail(d);
        if (/[A-Za-z_]/.test(c)) fail('項目名が「"」で囲まれていません');
        fail(`項目名（"title" のような形）があるはずの所に「${c}」があります`);
      }
      const key = string();
      skip();
      if (ch() !== ':') {
        if (!ch()) fail('途中で終わっています。最後のほうが切れているかもしれません');
        fail(`項目名 "${key}" のあとに「:」がありません`);
      }
      i++;
      obj[key] = value(`"${key}" の値`);
      skip();
      const n = ch();
      if (n === ',') { i++; continue; }
      if (n === '}') { i++; return obj; }
      if (!n) fail(`「{」（${posText(startPos)}）が閉じないまま終わっています。最後のほうが切れているかもしれません`);
      if (n === '"') fail(`"${key}" の値のあとに「,」がありません`);
      if (n === ']') fail('「}」で閉じるはずの所が「]」になっています');
      fail(`"${key}" の値のあとに、余計な「${n}」があります`);
    }
  }

  function array() {
    const startPos = i;
    i++; // [
    const arr = [];
    skip();
    if (ch() === ']') { i++; return arr; }
    for (;;) {
      skip();
      if (ch() === ']') { i++; return arr; } // 最後の「,」のあと
      if (!ch()) fail(`「[」（${posText(startPos)}）が閉じないまま終わっています。最後のほうが切れているかもしれません`);
      arr.push(value('値'));
      skip();
      const n = ch();
      if (n === ',') { i++; continue; }
      if (n === ']') { i++; return arr; }
      if (!n) fail(`「[」（${posText(startPos)}）が閉じないまま終わっています。最後のほうが切れているかもしれません`);
      if (n === '{' || n === '"' || n === '[') fail('並びの中で「,」が抜けています');
      if (n === '}') fail('「]」で閉じるはずの所が「}」になっています');
      fail(`並びの中に、余計な「${n}」があります`);
    }
  }

  function string() {
    const startPos = i;
    i++; // "
    let out = '';
    for (;;) {
      if (i >= end) fail(`「"」（${posText(startPos)}）で始まった文字が閉じていません`, startPos);
      const c = text[i];
      if (c === '"') { i++; return out; }
      if (c === '\\') {
        const e = text[i + 1];
        const map = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (e in map) { out += map[e]; i += 2; continue; }
        if (e === 'u') {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('「\\u」のあとの文字がおかしいです');
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6; continue;
        }
        fail(`「\\${e || ''}」という書き方は使えません`);
      }
      out += c; // 文字列の中の改行もそのまま受け取る
      i++;
    }
  }

  function number() {
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i, Math.min(end, i + 40)));
    if (!m) fail('数字の形がおかしいです');
    i += m[0].length;
    return Number(m[0]);
  }

  function posText(p) {
    const before = text.slice(0, p);
    return `${before.split('\n').length}行目`;
  }

  skip();
  const v = value('JSON');
  skip();
  if (i < end) fail(`JSON のあとに、まだ「${text[i]}」が続いています。JSON は1つだけにしてください`);
  return v;
}
