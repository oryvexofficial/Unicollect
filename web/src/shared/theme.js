
export const THEME_KEY = 'unicollect_theme';
export const isDark = () => document.documentElement.classList.contains('dark');

function paintMeta() {
  const c = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', c || '#0d0916'));
}

function apply(dark) {
  document.documentElement.classList.toggle('dark', dark);
  paintMeta();
  window.dispatchEvent(new CustomEvent('themechange', { detail: { dark } }));
}

/** Dark only (chatgpt.com style). Kept for old imports: always stays dark. */
export function toggleTheme() { apply(true); return true; }

/** the site is dark only: pin the class + browser chrome colour */
export function watchSystemTheme() { apply(true); }

/** inline <head> snippet: always dark */
export const THEME_BOOT = `(function(){var h=document.documentElement;h.classList.add('dark');h.classList.add('js');try{localStorage.removeItem('unicollect_theme')}catch(e){}})();`;
