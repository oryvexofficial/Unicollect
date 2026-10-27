// Prerender: build.mjs imports this (bundled for node) and writes every page.
import { renderToString } from 'react-dom/server';
import Site, { META } from './Site.jsx';

export const PAGES = [
  { key: 'home', root: '', files: ['index.html'] },
  { key: 'api', root: '../', files: ['api/index.html', 'api-docs/index.html'] },
  { key: 'how', root: '../', files: ['how-it-works/index.html'] },
  { key: 'about', root: '../', files: ['about/index.html'] },
  { key: 'privacy', root: '../', files: ['privacy/index.html'] },
  { key: 'notfound', root: '', files: ['404.html'] }
];

export function render(key, root) {
  const m = META[key];
  return { html: renderToString(<Site page={key} root={root} />), title: m.title, desc: m.desc };
}
