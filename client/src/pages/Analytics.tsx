import { useEffect, useState } from 'react';
import { api } from '../api';

interface Engagement { likes: number; comments: number; shares: number; impressions: number; reach: number; }
interface Overview { total_published: number; by_platform: Record<string, number>; posts: unknown[]; engagement: Engagement; }
interface Account { id: string; platform: string; display_name: string; }
interface PostVariant { id: string; post_id: string; account_id: string; platform: string; display_name: string; platform_post_id: string | null; published_at: string | null; likes?: number; comments?: number; shares?: number; impressions?: number; reach?: number; synced_at?: string; }

const card: React.CSSProperties = { background: '#1e2333', borderRadius: 12, padding: 24, marginBottom: 20 };
const COLORS: Record<string, string> = {
  bluesky: '#0085ff', linkedin: '#0a66c2', facebook: '#1877f2',
  instagram: '#e1306c', discord: '#5865f2', slack: '#4a154b',
};

const StatCard = ({ label, value, color = '#22c55e' }: { label: string; value: number | string; color?: string }) => (
  <div style={{ ...card, textAlign: 'center', flex: 1, minWidth: 120, marginBottom: 0 }}>
    <div style={{ fontSize: 32, fontWeight: 800, color }}>{value}</div>
    <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>{label}</div>
  </div>
);

export default function Analytics() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [days, setDays] = useState(30);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [acctVariants, setAcctVariants] = useState<PostVariant[]>([]);

  useEffect(() => {
    api.get<{ accounts: Account[] }>('/accounts').then(r => setAccounts(r.data.accounts)).catch(() => {});
  }, []);

  useEffect(() => {
    const to = new Date();
    const from = new Date(); from.setDate(from.getDate() - days);
    api.get<Overview>('/analytics/overview', { params: { from: from.toISOString(), to: to.toISOString() } })
      .then(r => setOverview(r.data)).catch(() => {});
  }, [days]);

  useEffect(() => {
    if (!selectedAccount) { setAcctVariants([]); return; }
    const to = new Date();
    const from = new Date(); from.setDate(from.getDate() - days);
    api.get<{ variants: PostVariant[] }>(`/analytics/accounts/${selectedAccount}`, { params: { from: from.toISOString(), to: to.toISOString() } })
      .then(r => setAcctVariants(r.data.variants)).catch(() => {});
  }, [selectedAccount, days]);

  const eng = overview?.engagement;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Analytics</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <select style={{ background: '#1e2333', border: '1px solid #2d3748', color: '#e2e8f0', borderRadius: 8, padding: '8px 14px', fontSize: 14 }}
            value={days} onChange={e => setDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <a href={`/api/analytics/export/csv?from=${new Date(Date.now() - days * 86400000).toISOString()}&to=${new Date().toISOString()}`}
            style={{ padding: '8px 16px', background: '#2d3748', color: '#e2e8f0', borderRadius: 8, fontSize: 14, textDecoration: 'none', fontWeight: 600 }}
            download>
            Export CSV
          </a>
        </div>
      </div>

      {/* Top stat row */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard label={`Posts published (${days}d)`} value={overview?.total_published ?? '—'} />
        <StatCard label="Total impressions" value={eng?.impressions.toLocaleString() ?? '—'} color="#818cf8" />
        <StatCard label="Total reach" value={eng?.reach.toLocaleString() ?? '—'} color="#60a5fa" />
        <StatCard label="Likes" value={eng?.likes.toLocaleString() ?? '—'} color="#f97316" />
        <StatCard label="Comments" value={eng?.comments.toLocaleString() ?? '—'} color="#a78bfa" />
      </div>

      {overview?.by_platform && Object.keys(overview.by_platform).length > 0 && (
        <div style={card}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Posts by Platform</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(overview.by_platform).sort(([,a],[,b]) => b - a).map(([platform, count]) => {
              const max = Math.max(...Object.values(overview.by_platform));
              return (
                <div key={platform}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: COLORS[platform] ?? '#94a3b8' }}>{platform}</span>
                    <span style={{ fontSize: 13, color: '#94a3b8' }}>{count} posts</span>
                  </div>
                  <div style={{ background: '#2d3748', borderRadius: 4, height: 8 }}>
                    <div style={{ background: COLORS[platform] ?? '#64748b', borderRadius: 4, height: 8, width: `${(count / max) * 100}%`, transition: 'width .3s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-account breakdown */}
      {accounts.length > 0 && (
        <div style={card}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Per-Account Breakdown</h2>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {accounts.filter(a => a.platform !== 'discord' && a.platform !== 'slack').map(a => (
              <button key={a.id} onClick={() => setSelectedAccount(selectedAccount === a.id ? null : a.id)}
                style={{ padding: '6px 14px', borderRadius: 20, border: `2px solid ${selectedAccount === a.id ? (COLORS[a.platform] ?? '#f97316') : '#2d3748'}`, background: selectedAccount === a.id ? `${(COLORS[a.platform] ?? '#f97316')}22` : 'transparent', color: selectedAccount === a.id ? (COLORS[a.platform] ?? '#f97316') : '#94a3b8', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                {a.display_name}
              </button>
            ))}
          </div>
          {selectedAccount && acctVariants.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: '#64748b', borderBottom: '1px solid #2d3748' }}>
                  <th style={{ textAlign: 'left', padding: '6px 0' }}>Published</th>
                  <th style={{ textAlign: 'right', padding: '6px 0' }}>Likes</th>
                  <th style={{ textAlign: 'right', padding: '6px 0' }}>Comments</th>
                  <th style={{ textAlign: 'right', padding: '6px 0' }}>Shares</th>
                  <th style={{ textAlign: 'right', padding: '6px 0' }}>Impressions</th>
                </tr>
              </thead>
              <tbody>
                {acctVariants.map(v => (
                  <tr key={v.id} style={{ borderBottom: '1px solid #2d374850' }}>
                    <td style={{ padding: '8px 0', color: '#e2e8f0' }}>{v.published_at ? new Date(v.published_at).toLocaleDateString() : '—'}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right', color: '#94a3b8' }}>{v.likes ?? '—'}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right', color: '#94a3b8' }}>{v.comments ?? '—'}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right', color: '#94a3b8' }}>{v.shares ?? '—'}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right', color: '#94a3b8' }}>{v.impressions ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {selectedAccount && acctVariants.length === 0 && <p style={{ color: '#64748b', fontSize: 14 }}>No published posts in this range for this account.</p>}
        </div>
      )}

      {overview?.total_published === 0 && (
        <div style={card}>
          <p style={{ color: '#64748b', fontSize: 14 }}>No published posts yet. <a href="/compose" style={{ color: '#f97316' }}>Create and publish your first post →</a></p>
        </div>
      )}
    </div>
  );
}
