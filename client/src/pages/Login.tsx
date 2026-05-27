import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void }) => void;
          renderButton: (el: HTMLElement, opts: Record<string, string>) => void;
        };
      };
    };
  }
}

interface Props {
  authEnabled: boolean;
  onAuthenticated: () => Promise<void>;
}

const styles = {
  page:    { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #161b27 0%, #0f2027 100%)', padding: 20 } as React.CSSProperties,
  card:    { background: '#1e2433', border: '1px solid #2d3748', padding: '40px', borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.4)', maxWidth: 420, width: '100%', textAlign: 'center' as const },
  title:   { margin: '0 0 4px', fontSize: 28, fontWeight: 700, color: '#f1f5f9' },
  tagline: { color: '#64748b', fontSize: 14, marginBottom: 32 },
  body:    { color: '#94a3b8', fontSize: 14, marginBottom: 0 },
  btnWrap: { display: 'flex', justifyContent: 'center', margin: '24px 0 16px', minHeight: 44 },
  devBtn:  { background: '#f97316', color: '#fff', border: 'none', padding: '12px 24px', fontSize: 16, borderRadius: 4, cursor: 'pointer', width: '100%', marginTop: 24 },
  warn:    { color: '#fbbf24', padding: '10px 12px', background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.2)', borderRadius: 4, marginTop: 20, fontSize: 13, textAlign: 'left' as const },
  status:  { color: '#f97316', padding: '10px 12px', background: 'rgba(249,115,22,.1)', border: '1px solid rgba(249,115,22,.3)', borderRadius: 4, marginTop: 16, fontSize: 14 },
  error:   { color: '#f87171', padding: '10px 12px', background: 'rgba(248,113,113,.1)', border: '1px solid rgba(248,113,113,.3)', borderRadius: 4, marginTop: 16, fontSize: 14 },
};

export default function Login({ authEnabled, onAuthenticated }: Props) {
  const googleClientId = (import.meta as unknown as { env: Record<string, string> }).env.VITE_GOOGLE_CLIENT_ID || '';
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const btnRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!googleClientId) return;
    const existing = document.querySelector('script[data-gsi]') as HTMLScriptElement | null;
    if (existing) {
      if (window.google?.accounts?.id) { setScriptLoaded(true); return; }
      existing.addEventListener('load', () => setScriptLoaded(true), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true; s.defer = true; s.dataset.gsi = 'true';
    s.onload = () => setScriptLoaded(true);
    s.onerror = () => setError('Failed to load Google sign-in.');
    document.head.appendChild(s);
  }, [googleClientId]);

  useEffect(() => {
    if (!scriptLoaded || !btnRef.current || !window.google || !googleClientId) return;

    const handleCredential = async (response: { credential: string }) => {
      setError(''); setStatus('Verifying...');
      try {
        await api.post('/auth/google', { credential: response.credential });
        setStatus('Access granted. Loading MediaFox...');
        await onAuthenticated();
      } catch (err: unknown) {
        const res = (err as { response?: { data?: { status?: string; error?: string } } })?.response;
        if (!res) { setError('Cannot reach MediaFox API.'); setStatus(''); return; }
        if (res.data?.status === 'pending') { setStatus('Access request submitted. An admin will approve your account.'); setError(''); return; }
        if (res.data?.status === 'denied') { setError('Access was denied by an admin.'); setStatus(''); return; }
        setError(res.data?.error || 'Google login failed.');
        setStatus('');
      }
    };

    btnRef.current.innerHTML = '';
    window.google.accounts.id.initialize({ client_id: googleClientId, callback: handleCredential });
    window.google.accounts.id.renderButton(btnRef.current, { type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', width: '280' });
  }, [scriptLoaded, googleClientId, onAuthenticated]);

  const handleDevLogin = async () => {
    setError(''); setStatus('Logging in...');
    try {
      await onAuthenticated();
    } catch {
      setError('Dev login failed.');
      setStatus('');
    }
  };

  const showGoogle = authEnabled && Boolean(googleClientId);
  const showDevBypass = !authEnabled;
  const showMisconfigured = authEnabled && !googleClientId;

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h1 style={styles.title}>🦊 MediaFox</h1>
        <p style={styles.tagline}>Social media management for game studios</p>

        {showGoogle ? (
          <>
            <p style={styles.body}>Sign in with Google to continue.</p>
            {scriptLoaded
              ? <div ref={btnRef} style={styles.btnWrap} />
              : <p style={{ color: '#64748b', fontSize: 14, marginTop: 16 }}>Loading sign-in...</p>}
          </>
        ) : null}

        {showDevBypass ? (
          <>
            <p style={styles.body}>Auth is disabled. Use dev bypass for local testing.</p>
            <button style={styles.devBtn} onClick={handleDevLogin}>Dev Login</button>
          </>
        ) : null}

        {showMisconfigured ? (
          <div style={styles.warn}>
            <strong>Google OAuth not configured.</strong><br />
            Set <code>GOOGLE_CLIENT_ID</code> as a Fly secret and <code>VITE_GOOGLE_CLIENT_ID</code> as a build arg in <code>fly.toml</code>, then redeploy.
          </div>
        ) : null}

        {status ? <div style={styles.status}>{status}</div> : null}
        {error ? <div style={styles.error}>{error}</div> : null}
      </div>
    </div>
  );
}
