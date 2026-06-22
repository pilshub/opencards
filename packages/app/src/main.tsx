import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './styles.css';

const root = globalThis.document.getElementById('root');

if (!root) {
  throw new Error('Missing #root mount element');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
