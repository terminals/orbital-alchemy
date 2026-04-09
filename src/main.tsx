import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SettingsProvider } from '@/hooks/useSettings';
import './index.css';

// CSS @property rules don't register when Vite injects CSS via dynamic <style>
// tags in dev mode. This JS call ensures the property is registered at runtime.
try { CSS.registerProperty({ name: '--dispatch-angle', syntax: '<angle>', initialValue: '0deg', inherits: false }); } catch (_) {}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
