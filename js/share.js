// 夫に送るリンク：栞の JSON を圧縮して、リンクの # のあとに入れる。
// # のあとはサーバーに送られないので、データはどこにも残らない。
// LINE がリンクを途中で切らないよう、記号の少ない文字（A-Z a-z 0-9 - _）だけで書く。

import LZString from '../vendor/lz-string.js';
import { toJson } from './format.js';

export const SHARE_KEY = 's';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function bytesToB64url(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    const n = (a << 16) | ((b || 0) << 8) | (c || 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (b !== undefined) out += B64[(n >> 6) & 63];
    if (c !== undefined) out += B64[n & 63];
  }
  return out;
}

function b64urlToBytes(s) {
  const map = {};
  for (let i = 0; i < 64; i++) map[B64[i]] = i;
  const clean = s.replace(/[^A-Za-z0-9\-_]/g, '');
  const out = [];
  for (let i = 0; i < clean.length; i += 4) {
    const n = (map[clean[i]] << 18) | (map[clean[i + 1]] << 12) | ((map[clean[i + 2]] || 0) << 6) | (map[clean[i + 3]] || 0);
    out.push((n >> 16) & 255);
    if (i + 2 < clean.length) out.push((n >> 8) & 255);
    if (i + 3 < clean.length) out.push(n & 255);
  }
  return new Uint8Array(out);
}

export function makeShareUrl(book) {
  const json = toJson(book, false);
  const data = bytesToB64url(LZString.compressToUint8Array(json));
  const base = location.href.split('#')[0];
  return `${base}#${SHARE_KEY}=${data}`;
}

// location.hash から栞を取り出す。リンクでなければ null、壊れていれば { error }
export function readShareHash(hash) {
  const m = new RegExp('^#' + SHARE_KEY + '=(.*)$').exec(hash || '');
  if (!m) return null;
  try {
    const bytes = b64urlToBytes(decodeURIComponent(m[1]));
    const json = LZString.decompressFromUint8Array(bytes);
    if (!json) return { error: true };
    return { value: JSON.parse(json) };
  } catch {
    return { error: true };
  }
}
