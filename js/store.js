// 保存まわりはこのファイルだけにまとめる。
// 今は iPhone の中の IndexedDB。将来ほかの保存先に替えるときは、このファイルの中身を差し替える。
//
// 1冊ぶんの記録：
//   { id, shiori, prev, createdAt, updatedAt }
//   shiori … FORMAT.md の形のしおり JSON（これが原本）
//   prev   … Claude からの JSON で置き換える前の控え（1つだけ。なければ null）

import { upgrade } from './format.js';

const DB_NAME = 'tabi-shiori';
const DB_VERSION = 1;
const STORE = 'books';

let dbp = null;

function db() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const d = req.result;
      d.onversionchange = () => { d.close(); dbp = null; };
      resolve(d);
    };
    req.onerror = () => { dbp = null; reject(req.error); };
    req.onblocked = () => { dbp = null; reject(new Error('保存先を開けませんでした（ほかのタブを閉じてみてください）')); };
  });
  return dbp;
}

function tx(mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const st = t.objectStore(STORE);
    let out;
    Promise.resolve(fn(st)).then(v => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('保存が取り消されました'));
  }));
}

const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

function fix(rec) {
  if (!rec) return rec;
  rec.shiori = upgrade(rec.shiori);
  if (rec.prev) rec.prev = upgrade(rec.prev);
  return rec;
}

export async function listBooks() {
  const all = await tx('readonly', st => reqP(st.getAll()));
  return (all || []).map(fix);
}

export async function getBook(id) {
  return fix(await tx('readonly', st => reqP(st.get(id))));
}

export async function putBook(rec) {
  const now = new Date().toISOString();
  rec.createdAt = rec.createdAt || now;
  rec.updatedAt = now;
  await tx('readwrite', st => reqP(st.put(rec)));
  return rec;
}

// 「しおりを消す」を選んで確かめたときだけ使う
export async function deleteBook(id) {
  await tx('readwrite', st => reqP(st.delete(id)));
}

// Safari に「このサイトのデータは消さないで」と頼む（効くかどうかは iPhone 次第）
export async function askPersist() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch { /* 使えなくても困らない */ }
  return false;
}
