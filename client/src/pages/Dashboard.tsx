import { useEffect, useState } from 'react';
import { api } from '../api';

interface Post { id: string; status: string; scheduled_at: string | null; published_at: string | null; title: string | null; variants: { platform?: string; account?: { platform: string } }[]; }

const card: React.CSSProperties = { background: '#1e2333', borderRadius: 12, padding: 24 };
const statCard: React.CSSProperties = { ...card, textAlign: 'center' as const };

export default function Dashboard() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const from = new Date(); from.setDate(from.getDate() - 7);
    const to = new Date(); to.setDate(to.getDate() + 30);
    api.get<{ posts: Post[] }>(`/posts/calendar?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then(r => setPosts(r.data.posts))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const scheduled = posts.filter(p => p.status === 'scheduled');
  const published = posts.filter(p => p.status === 'published');
  const failed = posts.filter(p => p.status === 'failed');

  return (
    <div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>Dashboard</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
        <div style={statCard}>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#f97316' }}>{scheduled.length}</div>
          <div style={{ color: '#94a3b8', marginTop: 4 }}>Scheduled</div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#22c55e' }}>{published.length}</div>
          <div style={{ color: '#94a3b8', marginTop: 4 }}>Published (30 days)</div>
        </div>
        <div style={statCard}>
          <div style={{ fontSize: 36, fontWeight: 800, color: failed.length > 0 ? '#ef4444' : '#64748b' }}>{failed.length}</div>
          <div style={{ color: '#94a3b8', marginTop: 4 }}>Failed</div>
        </div>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Upcoming Posts</h2>
        {loading && <p style={{ color: '#64748b' }}>Loading…</p>}
        {!loading && scheduled.length === 0 && (
          <p style={{ color: '#64748b', fontSize: 14 }}>No posts scheduled. <a href="/compose" style={{ color: '#f97316' }}>Create one →</a></p>
        )}
        {scheduled.slice(0, 5).map(p => (
          <div key={p.id} style={{ padding: '12px 0', borderBottom: '1px solid #2d3748', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{p.title ?? 'Untitled'}</div>
              <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                {p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : 'Unscheduled'}
              </div>
            </div>
            <span style={{ background: '#1e3a5f', color: '#60a5fa', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
              {p.status.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
