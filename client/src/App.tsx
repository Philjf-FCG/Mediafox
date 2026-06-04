import { useCallback, useEffect, useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { api, initializeCsrfToken, clearCsrfToken } from './api';
import { useTheme } from './hooks/useTheme';
import { getTheme } from './theme';
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

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const colors = getTheme(theme);

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
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', color: colors.textMuted, background: colors.bg, fontSize: 16 }}>
        Loading MediaFox...
      </div>
    );
  }

  if (!auth.authenticated) {
    return <Login authEnabled={auth.authEnabled} onAuthenticated={fetchMe} colors={colors} theme={theme} />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: colors.bg, color: colors.text }}>
      <nav style={{ width: 220, background: colors.navBg, borderRight: `1px solid ${colors.navBorder}`, padding: '24px 0', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '0 20px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#f97316', letterSpacing: '-0.5px' }}>🦊 MediaFox</span>
          <button
            onClick={toggleTheme}
            style={{
              padding: '4px 10px',
              background: theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
              border: `1px solid ${colors.border}`,
              borderRadius: '6px',
              color: colors.text,
              fontSize: '15px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 10, padding: '9px 20px',
            color: isActive ? '#f97316' : colors.textMuted,
            background: isActive ? 'rgba(249,115,22,.08)' : 'transparent',
            textDecoration: 'none', fontSize: 14, transition: 'color .15s',
          })}>
            <span>{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
        <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: `1px solid ${colors.navBorder}` }}>
          {auth.user?.email ? (
            <div style={{ fontSize: 11, color: colors.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 8 }}>
              {auth.user.email}
            </div>
          ) : null}
          <button
            style={{ background: 'transparent', border: `1px solid ${colors.border}`, color: colors.textMuted, padding: '5px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, width: '100%' }}
            onClick={handleLogout}
          >
            Sign out
          </button>
        </div>
      </nav>
      <main style={{ flex: 1, padding: 32, overflow: 'auto', background: colors.bg, color: colors.text }}>
        <Routes>
          <Route path="/"          element={<Dashboard colors={colors} />} />
          <Route path="/compose"   element={<Compose colors={colors} />} />
          <Route path="/calendar"  element={<Calendar colors={colors} />} />
          <Route path="/inbox"     element={<Inbox colors={colors} />} />
          <Route path="/analytics" element={<Analytics colors={colors} />} />
          <Route path="/library"   element={<Library colors={colors} />} />
          <Route path="/accounts"  element={<Accounts colors={colors} />} />
          <Route path="/team"      element={<Team colors={colors} />} />
          <Route path="/settings"  element={<Settings colors={colors} />} />
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
