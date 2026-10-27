import { hydrateRoot } from 'react-dom/client';
import '../shared/styles/tokens.css';
import '../shared/styles/base.css';
import '../shared/styles/feedback.css';
import './site.css';
import { watchSystemTheme } from '../shared/theme.js';
import Site from './Site.jsx';

watchSystemTheme();
const b = document.body;
hydrateRoot(document.getElementById('root'), <Site page={b.dataset.page} root={b.dataset.root || ''} />);
