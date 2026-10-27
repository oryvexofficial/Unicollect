// Bits of HTML shared by every generated page.
export const THEME_BOOT_SRC = `(function(){var h=document.documentElement;h.classList.add('dark');h.classList.add('js');try{localStorage.removeItem('unicollect_theme')}catch(e){}})();`;

const PETAL = 'M0-25c5 0 7 5 5 11l-2 7c-1 3-5 3-6 0l-2-7c-2-6 0-11 5-11z';
export const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="18" fill="#7c3aed"/>
<g fill="#fff" transform="translate(32 32)">${[0, 60, 120, 180, 240, 300].map(a => `<path d="${PETAL}" transform="rotate(${a})"/>`).join('')}<circle r="5"/></g>
</svg>
`;
