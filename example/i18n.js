// i18n.js — Hybrid chrome.i18n + manual override via chrome.storage.local
// chrome.i18n uses browser-locale automatically; storage override lets user toggle DE/EN in popup.

let _overrideMsgs = null;
let _currentLocale = null;

async function loadLocale() {
  try {
    const { uiLocale } = await chrome.storage.local.get('uiLocale');
    if (uiLocale && uiLocale !== 'auto') {
      const resp = await fetch(chrome.runtime.getURL(`_locales/${uiLocale}/messages.json`));
      _overrideMsgs = await resp.json();
      _currentLocale = uiLocale;
    } else {
      _overrideMsgs = null;
      _currentLocale = chrome.i18n.getUILanguage().slice(0, 2);
    }
  } catch (e) {
    console.warn('[i18n] loadLocale failed:', e);
    _overrideMsgs = null;
  }
}

async function setLocale(locale) {
  await chrome.storage.local.set({ uiLocale: locale });
  await loadLocale();
  applyI18n();
}

function currentLocale() { return _currentLocale; }

// Get translated message by key. vars = array for $1, $2, $3 placeholders.
function getMsg(key, vars = []) {
  if (_overrideMsgs && _overrideMsgs[key]) {
    const entry = _overrideMsgs[key];
    let s = entry.message;
    if (entry.placeholders) {
      for (const [pname, pval] of Object.entries(entry.placeholders)) {
        const idx = parseInt(String(pval.content).replace('$', ''), 10) - 1;
        const v = vars[idx] != null ? String(vars[idx]) : '';
        s = s.replace(new RegExp('\\$' + pname.toUpperCase() + '\\$', 'g'), v);
      }
    }
    return s;
  }
  // fallback to chrome.i18n (browser-locale based)
  const m = chrome.i18n.getMessage(key, vars);
  return m || key;
}

// Walk DOM and apply translations to elements with data-i18n* attrs.
// data-i18n        = textContent
// data-i18n-html   = innerHTML
// data-i18n-title  = title attribute
// data-i18n-placeholder = placeholder attribute
function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (!key) return;
    el.textContent = getMsg(key);
  });
  root.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.dataset.i18nHtml;
    if (!key) return;
    el.innerHTML = getMsg(key);
  });
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    if (!key) return;
    el.title = getMsg(key);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (!key) return;
    el.placeholder = getMsg(key);
  });
}

// Expose globally for popup.js
window.i18n = { loadLocale, setLocale, getMsg, applyI18n, currentLocale };
