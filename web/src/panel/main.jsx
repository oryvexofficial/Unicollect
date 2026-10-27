import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import '../shared/styles/tokens.css';
import '../shared/styles/base.css';
import '../shared/styles/chat.css';
import '../shared/styles/feedback.css';
import './panel.css';
import { ToastProvider } from '../shared/chat/Toast.jsx';
import { watchSystemTheme } from '../shared/theme.js';
import App from './App.jsx';

watchSystemTheme();
document.body.classList.add('chat-body');
createRoot(document.getElementById('root')).render(
  <MotionConfig reducedMotion="user">
    <ToastProvider><App /></ToastProvider>
  </MotionConfig>
);
