import { useEffect, useState } from 'react';
import { api } from '../api';

interface Account { id: string; platform: string; display_name: string; type: string; status: string; token_expires_at: string | null; connected_at: string; }

const PLATFORM_COLORS: Record<string, string> = {
  bluesky: '#0085ff', linkedin: '#0a66c2', facebook: '#1877f2',
  instagram: '#e1306c', discord: '#5865f2', slack: '#4a154b',
};

const card: React.CSSProperties = { background: '#1e2333', borderRadius: 12, padding: 24, marginBottom: 20 };
const statusColor = (s: string) => s === 'active' ? '#22c55e' : s === 'expired' ? '#f97316' : '#ef4444';

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showBluesky, setShowBluesky] = useState(false);
  const [bskyHandle, setBskyHandle] = useState('');
  const [bskyPass, setBskyPass] = useState('');
  const [bskyType, setBskyType] = useState<'company'|'personal'>('company');
  const [showDiscord, setShowDiscord] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookName, setWebhookName] = useState('');
  const [msg, setMsg] = useState('');

  const getApiErrorMessage = (err: unknown, fallback: string): string =>
    (err as { response?: { data?: { error?: string; detail?: string } } })?.response?.data?.error
    ?? (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
    ?? fallback;

  const startOauthConnect = async (path: string, fallback: string) => {
    try {
      const r = await api.get<{ url: string }>(path);
      window.location.href = r.data.url;
    } catch (e: unknown) {
      setMsg(getApiErrorMessage(e, fallback));
    }
  };

  const load = () => api.get<{ accounts: Account[] }>('/accounts').then(r => setAccounts(r.data.accounts)).catch(() => {});
  useEffect(() => { void load(); }, []);

  const disconnect = (id: string) => {
    if (!confirm('Disconnect this account?')) return;
    api.delete(`/accounts/${id}`).then(load).catch(() => {});
  };

  const connectBluesky = async () => {
    try {
      await api.post('/accounts/connect/bluesky', { handle: bskyHandle, app_password: bskyPass, account_type: bskyType });
      setMsg('Bluesky connected ✓'); setShowBluesky(false); setBskyHandle(''); setBskyPass(''); load();
    } catch (e: unknown) { setMsg((e as {response?:{data?:{error?:string}}}).response?.data?.error ?? 'Connection failed'); }
  };

  const connectDiscordWebhook = async () => {
    try {
      await api.post('/accounts/connect/discord/webhook', { webhook_url: webhookUrl, display_name: webhookName });
      setMsg('Discord webhook connected ✓'); setShowDiscord(false); setWebhookUrl(''); setWebhookName(''); load();
    } catch (e: unknown) { setMsg((e as {response?:{data?:{error?:string}}}).response?.data?.error ?? 'Connection failed'); }
  };

  const company = accounts.filter(a => a.type === 'company');
  const personal = accounts.filter(a => a.type === 'personal');

  const AccountList = ({ list }: { list: Account[] }) => (
    <>
      {list.map(a => (
        <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #2d3748' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: PLATFORM_COLORS[a.platform] ?? '#64748b' }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{a.display_name}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{a.platform} · connected {new Date(a.connected_at).toLocaleDateString()}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(a.status) }}>{a.status.toUpperCase()}</span>
            <button style={{ background: '#2d3748', border: 'none', color: '#ef4444', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }} onClick={() => disconnect(a.id)}>Disconnect</button>
          </div>
        </div>
      ))}
      {list.length === 0 && <p style={{ color: '#64748b', fontSize: 14 }}>No accounts connected.</p>}
    </>
  );

  const input: React.CSSProperties = { background: '#0f1117', border: '1px solid #2d3748', color: '#e2e8f0', borderRadius: 8, padding: '10px 14px', width: '100%', fontSize: 14, marginBottom: 10 };

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Accounts</h1>
      </div>

      {msg && <p style={{ color: msg.includes('✓') ? '#22c55e' : '#ef4444', marginBottom: 16, fontSize: 14 }}>{msg}</p>}

      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Company Accounts</h2>
        <AccountList list={company} />
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Personal Accounts</h2>
        <AccountList list={personal} />
      </div>

      {/* Connect buttons */}
      <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, width: '100%', marginBottom: 4 }}>Connect</h2>
        <button style={{ padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#0085ff', color: '#fff', fontWeight: 600, fontSize: 13 }} onClick={() => setShowBluesky(v => !v)}>+ Bluesky</button>
        <button style={{ padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#5865f2', color: '#fff', fontWeight: 600, fontSize: 13 }} onClick={() => setShowDiscord(v => !v)}>+ Discord Webhook</button>
        <button style={{ padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#4a154b', color: '#fff', fontWeight: 600, fontSize: 13 }} onClick={() => { void startOauthConnect('/accounts/connect/slack', 'Slack integration not configured'); }}>+ Slack</button>
        <button style={{ padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#0a66c2', color: '#fff', fontWeight: 600, fontSize: 13 }} onClick={() => { void startOauthConnect('/accounts/connect/linkedin', 'LinkedIn integration not configured'); }}>+ LinkedIn</button>
        <button style={{ padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#1877f2', color: '#fff', fontWeight: 600, fontSize: 13 }} onClick={() => { void startOauthConnect('/accounts/connect/meta', 'Meta integration not configured'); }}>+ Facebook / Instagram</button>
      </div>

      {showBluesky && (
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Connect Bluesky</h3>
          <input style={input} placeholder="Handle (e.g. you.bsky.social)" value={bskyHandle} onChange={e => setBskyHandle(e.target.value)} />
          <input style={input} type="password" placeholder="App Password (create in Bluesky Settings)" value={bskyPass} onChange={e => setBskyPass(e.target.value)} />
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {(['company', 'personal'] as const).map(t => (
              <button key={t} style={{ padding: '6px 14px', borderRadius: 20, border: `2px solid ${bskyType === t ? '#0085ff' : '#2d3748'}`, background: bskyType === t ? '#0085ff1a' : 'transparent', color: bskyType === t ? '#0085ff' : '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: 600 }} onClick={() => setBskyType(t)}>{t}</button>
            ))}
          </div>
          <button style={{ background: '#0085ff', border: 'none', color: '#fff', padding: '9px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }} onClick={connectBluesky}>Connect</button>
        </div>
      )}

      {showDiscord && (
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Connect Discord Webhook</h3>
          <p style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>Create a webhook in Discord: Channel Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL</p>
          <input style={input} placeholder="Display name (e.g. #announcements)" value={webhookName} onChange={e => setWebhookName(e.target.value)} />
          <input style={input} placeholder="Webhook URL" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} />
          <button style={{ background: '#5865f2', border: 'none', color: '#fff', padding: '9px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }} onClick={connectDiscordWebhook}>Connect</button>
        </div>
      )}
    </div>
  );
}
