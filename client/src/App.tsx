import { useCallback, useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { api, initializeCsrfToken, clearCsrfToken } from './api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Compose from './pages/Compose';
import Calendar from './pages/Calendar';
import Inbox from './pages/Inbox';
import Analytics from './pages/Analytics';
import Accounts from './pages/Accounts';
import Team from './pages/Team';
import Settings from './pages/Settings';
import Library from './pages/Library';

interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

interface AuthState {
  loading: boolean;
  authEnabled: boolean;
  authenticated: boolean;
  user: AuthUser | null;
}

const NAV = [
  { to: '/',          label: 'Dashboard',  icon: '⊞' },
  { to: '/compose',   label: 'Compose',    icon: '✏' },
  { to: '/calendar',  label: 'Calendar',   icon: '📅' },
  { to: '/inbox',     label: 'Inbox',      icon: '📥' },
  { to: '/analytics', label: 'Analytics',  icon: '📊' },
  { to: '/library',   label: 'Library',    icon: '🖼' },
  { to: '/accounts',  label: 'Accounts',   icon: '🔗' },
  { to: '/team',      label: 'Team',       icon: '👥' },
  { to: '/settings',  label: 'Settings',   icon: '⚙' },
];

const styles = {
  shell:   { display: 'flex', minHeight: '100vh' } as React.CSSProperties,
  nav:     { width: 220, background: '#161b27', borderRight: '1px solid #2d3748', padding: '24px 0', flexShrink: 0, display: 'flex', flexDirection: 'column' as const },
  logo:    { padding: '0 20px 24px', fontSize: 20, fontWeight: 700, color: '#f97316', letterSpacing: '-0.5px' },
  link:    { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 20px', color: '#94a3b8', textDecoration: 'none', fontSize: 14, transition: 'color .15s' },
  main:    { flex: 1, padding: 32, overflow: 'auto' },
  userBar: { marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid #2d3748' },
  userEmail: { fontSize: 11, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, marginBottom: 8 },
  logoutBtn: { background: 'transparent', border: '1px solid #374151', color: '#64748b', padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, width: '100%' },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: '#94a3b8', background: '#0f1117', fontSize: 16 },
};

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ loading: true, authEnabled: true, authenticated: false, user: null });

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setAuth({
        loading: false,
        authEnabled: data.authEnabled !== false,
        authenticated: Boolean(data.authenticated),
        user: data.user || null,
      });
    } catch {
      setAuth({ loading: false, authEnabled: true, authenticated: false, user: null });
    }
  }, []);

  useEffect(() => {
    const boot = async () => {
      try { await initializeCsrfToken(); } catch { /* continue */ }
      await fetchMe();
    };
    boot();
  }, [fetchMe]);

  const handleLogout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    clearCsrfToken();
    setAuth({ loading: false, authEnabled: true, authenticated: false, user: null });
  }, []);

  if (auth.loading) {
    return <div style={styles.loading}>Loading MediaFox...</div>;
  }

  if (!auth.authenticated) {
    return <Login onAuthenticated={fetchMe} />;
  }

  return (
    <div style={styles.shell}>
      <nav style={styles.nav}>
        <div style={styles.logo}>🦊 MediaFox</div>
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} style={({ isActive }) => ({
            ...styles.link, color: isActive ? '#f97316' : '#94a3b8', background: isActive ? 'rgba(249,115,22,.08)' : 'transparent',
          })}>
            <span>{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
        <div style={styles.userBar}>
          {auth.user?.email ? <div style={styles.userEmail}>{auth.user.email}</div> : null}
          <button style={styles.logoutBtn} onClick={handleLogout}>Sign out</button>
        </div>
      </nav>
      <main style={styles.main}>
        <Routes>
          <Route path="/"          element={<Dashboard />} />
          <Route path="/compose"   element={<Compose />} />
          <Route path="/calendar"  element={<Calendar />} />
          <Route path="/inbox"     element={<Inbox />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/library"   element={<Library />} />
          <Route path="/accounts"  element={<Accounts />} />
          <Route path="/team"      element={<Team />} />
          <Route path="/settings"  element={<Settings />} />
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
