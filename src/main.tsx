import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { WorkflowProvider } from '@/hooks/useWorkflow';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WorkflowProvider>
        <App />
      </WorkflowProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
