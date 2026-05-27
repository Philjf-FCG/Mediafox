import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

class BootErrorBoundary extends React.Component<React.PropsWithChildren, { hasError: boolean; message: string }> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown): { hasError: boolean; message: string } {
    const message = error instanceof Error ? error.message : 'Unknown startup error';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown): void {
    // Keep a console trace for debugging production blank-screen reports.
    console.error('MediaFox boot error:', error);
  }

  render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0f1117', color: '#e2e8f0', padding: 24 }}>
        <div style={{ maxWidth: 720, background: '#1e2333', border: '1px solid #334155', borderRadius: 12, padding: 20 }}>
          <h1 style={{ fontSize: 20, marginBottom: 10 }}>MediaFox failed to start</h1>
          <p style={{ color: '#cbd5e1', marginBottom: 10 }}>A client runtime error occurred. Open the browser console for details, then refresh.</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#fca5a5' }}>{this.state.message}</pre>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BootErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </BootErrorBoundary>
  </React.StrictMode>,
);
