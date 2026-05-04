import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerBuiltinWorkspaceContributions } from '@/components/layout/workspaceContributions';
import App from './App';
import './index.css';

registerBuiltinWorkspaceContributions();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
