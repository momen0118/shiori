// 入力欄の部品

import { h, icon } from './util.js';
import { labelHue } from './format.js';

// 色付きのラベル
export function labelEl(label) {
  return h('span', { class: 'lbl', style: { '--lh': labelHue(label) } }, label);
}

export function field(label, control, hint) {
  return h('label', { class: 'fld' },
    h('span', { class: 'fld-l' }, label),
    control,
    hint ? h('span', { class: 'fld-h' }, hint) : null);
}

export function textInput({ value = '', placeholder = '', maxlength, type = 'text', inputmode, enterkeyhint = 'done', autocomplete = 'off' } = {}) {
  return h('input', { class: 'field', type, value, placeholder, maxlength, inputmode, enterkeyhint, autocomplete, autocapitalize: 'off', spellcheck: 'false' });
}

export function textArea({ value = '', placeholder = '', rows = 3 } = {}) {
  const ta = h('textarea', { class: 'field', placeholder, rows });
  ta.value = value;
  autosize(ta);
  return ta;
}

export function autosize(ta) {
  const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 420) + 'px'; };
  ta.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return ta;
}

// 時刻（または日付）の入力。右に「消す」ボタン
export function clearable(type, value = '') {
  const inp = h('input', { class: 'field', type, value });
  const btn = h('button', { type: 'button', class: 'clear-btn', 'aria-label': '消す', onclick: () => { inp.value = ''; inp.dispatchEvent(new Event('input')); upd(); } }, icon('x'));
  const upd = () => { btn.style.visibility = inp.value ? 'visible' : 'hidden'; };
  inp.addEventListener('input', upd);
  inp.addEventListener('change', upd);
  upd();
  const wrap = h('span', { class: 'clearable' }, inp, btn);
  wrap.input = inp;
  return wrap;
}

// 選べるチップ。自由入力つきも。
// chips({ options, value, free:true, maxlength, onChange })
// colored:true ならラベルの色で選ばれた状態を出す
export function chips({ options, value = '', free = false, maxlength = 6, placeholder = '自由に', onChange, allowNone = true, colored = false }) {
  let cur = value || '';
  const wrap = h('div', { class: 'chips' });
  const freeInp = free ? h('input', { class: 'field chip-free', type: 'text', enterkeyhint: 'done', maxlength, placeholder, value: options.includes(cur) ? '' : cur, autocomplete: 'off', autocorrect: 'off' }) : null;
  const btns = options.map(o => h('button', {
    type: 'button', class: 'chip' + (colored ? ' lchip' : ''), 'aria-pressed': String(o === cur),
    style: colored ? { '--lh': labelHue(o) } : null,
    onclick: () => {
      cur = (cur === o && allowNone) ? '' : o;
      if (freeInp) freeInp.value = '';
      sync(); onChange && onChange(cur);
    },
  }, o));
  const sync = () => btns.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i] === cur)));
  wrap.append(...btns);
  if (freeInp) {
    freeInp.addEventListener('input', () => {
      cur = [...freeInp.value.trim()].slice(0, maxlength).join('');
      sync(); onChange && onChange(cur);
    });
    wrap.append(freeInp);
  }
  wrap.getValue = () => cur;
  return wrap;
}

export function btn(label, onclick, cls = '', ico) {
  return h('button', { type: 'button', class: 'btn ' + cls, onclick }, ico ? icon(ico) : null, label);
}

export function errorBox(lines) {
  return h('div', { class: 'msg err' }, lines.map(l => h('div', null, l)));
}
